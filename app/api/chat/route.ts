import { NextRequest } from 'next/server';
import { getProvider } from '@/lib/providers';
import { createSSEEncoder } from '@/lib/utils/stream';
import type { ChatMessage, ProviderName } from '@/lib/providers/types';
import { buildProjectContext } from '@/lib/integrations/context';
import { getProject } from '@/lib/integrations/registry';
import { registerContractorsRoom } from '@/lib/integrations/contractors-room';
import { getSupabaseClient } from '@/lib/supabase/client';
import { OLLAMA_DEFAULT_URL, LM_STUDIO_DEFAULT_URL } from '@/lib/providers/local';
import { validateApiKey } from '@/lib/auth/api-keys';
import { decryptProviderKey } from '@/lib/auth/provider-keys';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { loadToolsForUser } from '@/lib/mcp/loader';
import { toOpenAITools, toAnthropicTools, parseQualified } from '@/lib/mcp/tool-format';
import { connectAny } from '@/lib/mcp/resolve';
import { getInstallations } from '@/lib/mcp/installer';

// Ensure built-in integrations are available on the server
registerContractorsRoom();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── MCP tool-use: provider base URLs + capability flags ───────────────────
/** OpenAI-SDK-compatible base URL for each provider. Undefined = not tool-capable. */
const OPENAI_COMPAT_BASE: Partial<Record<ProviderName, string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

const WRITE_TOOL_RE = /^(create|update|delete|send|write|post|put|patch|remove|merge)/i;

/**
 * Execute a single MCP tool call server-side.
 * Resolves the user's installation, decodes the config, connects, calls, closes.
 * Returns the result (any JSON-serialisable value) or throws.
 */
async function executeMcpTool(
  svc: any,
  userId: string,
  slug: string,
  toolName: string,
  args: Record<string, unknown>,
  installs?: any[],
): Promise<unknown> {
  const conn = await connectAny(svc, userId, slug, installs);
  if (!conn) throw new Error(`Connector "${slug}" is not connected or enabled`);
  try {
    return await conn.callTool(toolName, args);
  } finally {
    await conn.close().catch(() => {});
  }
}

// ── In-memory rate limiter (resets on server restart) ──────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30;           // max requests per IP per window

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const ipRateMap = new Map<string, RateLimitEntry>();

/**
 * Returns { limited: true, retryAfterSeconds } when the IP is over the limit.
 */
function checkRateLimit(ip: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = ipRateMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRateMap.set(ip, { count: 1, windowStart: now });
    return { limited: false, retryAfterSeconds: 0 };
  }

  entry.count += 1;

  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil(
      (RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000
    );
    return { limited: true, retryAfterSeconds };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}
// ────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = createSSEEncoder();

  // Rate limit check before doing any work
  const clientIp = getClientIp(req);
  const { limited, retryAfterSeconds } = checkRateLimit(clientIp);

  if (limited) {
    return new Response(
      JSON.stringify({
        error: `Rate limit exceeded. Please wait ${retryAfterSeconds} second${retryAfterSeconds !== 1 ? 's' : ''} before trying again.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSeconds),
        },
      }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await req.json();
        const {
          messages,
          model,
          provider: providerName,
          projectId,
          systemPrompt,
        }: {
          messages: ChatMessage[];
          model: string;
          provider: ProviderName;
          projectId?: string;
          /** Optional system prompt from the active persona */
          systemPrompt?: string;
        } = body;

        if (!messages || !model || !providerName) {
          controller.enqueue(
            encoder.encodeError('Missing required fields: messages, model, provider')
          );
          controller.enqueue(encoder.encodeDone());
          controller.close();
          return;
        }

        // ── Server-derived identity ────────────────────────────────────────
        // Resolved once from the session cookie or Lucy API key and reused for
        // project context, the env-key gate, and MCP tools. The request body's
        // userId is never trusted (a caller could name any user).
        const supabaseEnabled = Boolean(
          (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
        let authUserId: string | null = null;
        if (supabaseEnabled) {
          try {
            const { resolveMemoryAuth } = await import('@/lib/memory/auth');
            authUserId = (await resolveMemoryAuth(req)).userId ?? null;
          } catch {
            authUserId = null;
          }
        }

        // ── Persona system prompt injection ───────────────────────────────
        let messagesWithContext: ChatMessage[] = messages;

        if (systemPrompt) {
          const existingSystem = messages.find((m) => m.role === 'system');
          const combinedSystem = existingSystem
            ? `${systemPrompt}\n\n${existingSystem.content}`
            : systemPrompt;
          messagesWithContext = [
            { role: 'system', content: combinedSystem },
            ...messages.filter((m) => m.role !== 'system'),
          ];
        }
        // ─────────────────────────────────────────────────────────────────

        // ── Project context injection ──────────────────────────────────────

        if (projectId && getProject(projectId)) {
          try {
            const supabase = getSupabaseClient();
            const contextText = await buildProjectContext(supabase, {
              projectId,
              userId: authUserId ?? 'anonymous',
              maxTokens: 1500,
            });

            if (contextText) {
              // Build on top of whatever messagesWithContext already has
              // (which may already contain a persona system prompt)
              const existingSystem = messagesWithContext.find((m) => m.role === 'system');
              const systemContent = existingSystem
                ? `${existingSystem.content}\n\n${contextText}`
                : contextText;

              messagesWithContext = [
                { role: 'system', content: systemContent },
                ...messagesWithContext.filter((m) => m.role !== 'system'),
              ];
            }
          } catch {
            // Non-fatal — continue without context
          }
        }
        // ─────────────────────────────────────────────────────────────────

        // ── Memory retrieval injection ─────────────────────────────────────
        // userId is derived from the session inside resolveMemoryAuth — the
        // request body's userId is NOT trusted for memory access.
        const memoryEnabled = req.headers.get('x-memory-enabled') === '1';
        if (memoryEnabled) {
          try {
            const { resolveMemoryAuth } = await import('@/lib/memory/auth');
            const { userId: memUserId, client: memClient } = await resolveMemoryAuth(req);
            const lastUser = [...messages].reverse().find((m) => m.role === 'user');
            if (memUserId && memClient && lastUser) {
              const { SupabaseMemoryStore } = await import('@/lib/memory/supabase-store');
              const { buildRetrievalBlock } = await import('@/lib/memory/server');
              const embedderKey =
                req.headers.get('x-openai-key') || process.env.OPENAI_API_KEY || '';
              const { data: cfg } = await memClient
                .from('memory_settings')
                .select('embedder_provider, embedder_model, embedder_base_url, embedder_api_key')
                .eq('id', 1)
                .maybeSingle();
              const store = new SupabaseMemoryStore(memClient, {
                // admin-set embedder key wins; else fall back to the OpenAI key.
                apiKey: (cfg?.embedder_api_key as string) || embedderKey,
                model: (cfg?.embedder_model as string) || undefined,
                baseURL: (cfg?.embedder_base_url as string) || undefined,
                provider: (cfg?.embedder_provider as string) || undefined,
              });
              const { block, count } = await buildRetrievalBlock(
                store,
                { userId: memUserId, projectId: projectId ?? null },
                lastUser.content
              );
              if (block) {
                const existingSystem = messagesWithContext.find((m) => m.role === 'system');
                const systemContent = existingSystem
                  ? `${existingSystem.content}\n\n${block}`
                  : block;
                messagesWithContext = [
                  { role: 'system', content: systemContent },
                  ...messagesWithContext.filter((m) => m.role !== 'system'),
                ];
              }
              if (count > 0) {
                // Tell the client how many memories were used (transparency badge).
                controller.enqueue(encoder.encode({ metadata: { memoryCount: count } }));
              }
            }
          } catch (err) {
            console.error('[chat/memory]', err instanceof Error ? err.message : String(err));
          }
        }
        // ───────────────────────────────────────────────────────────────────

        // Read API key from request headers
        const headerMap: Partial<Record<ProviderName, string>> = {
          openai: 'x-openai-key',
          anthropic: 'x-anthropic-key',
          google: 'x-google-key',
          deepseek: 'x-deepseek-key',
          groq: 'x-groq-key',
          mistral: 'x-mistral-key',
          xai: 'x-xai-key',
          openrouter: 'x-openrouter-key',
        };

        // ── Local provider — no API key required ──────────────────────────
        if (providerName === 'local') {
          const ollamaUrl =
            req.headers.get('x-ollama-url') ||
            process.env.OLLAMA_URL ||
            OLLAMA_DEFAULT_URL;
          const lmStudioUrl =
            req.headers.get('x-lmstudio-url') ||
            process.env.LM_STUDIO_URL ||
            LM_STUDIO_DEFAULT_URL;

          const provider = getProvider('local');
          await provider.chat(
            messagesWithContext,
            model,
            (chunk: string) => {
              controller.enqueue(encoder.encode({ content: chunk }));
            },
            {
              apiKey: '',
              ollamaUrl,
              lmStudioUrl,
            } as Parameters<typeof provider.chat>[3]
          );

          controller.enqueue(encoder.encodeDone());
          controller.close();
          return;
        }
        // ─────────────────────────────────────────────────────────────────

        const headerName = headerMap[providerName];
        const headerKey = headerName ? req.headers.get(headerName) : null;
        const envKey =
          (providerName === 'openai' ? process.env.OPENAI_API_KEY : null) ||
          (providerName === 'anthropic' ? process.env.ANTHROPIC_API_KEY : null) ||
          (providerName === 'google' ? process.env.GOOGLE_API_KEY : null) ||
          (providerName === 'deepseek' ? process.env.DEEPSEEK_API_KEY : null) ||
          (providerName === 'groq' ? process.env.GROQ_API_KEY : null) ||
          (providerName === 'mistral' ? process.env.MISTRAL_API_KEY : null) ||
          (providerName === 'xai' ? process.env.XAI_API_KEY : null) ||
          (providerName === 'openrouter' ? process.env.OPENROUTER_API_KEY : null) ||
          null;

        // In connected mode the server's env keys are reserved for
        // authenticated callers — otherwise any anonymous visitor could spend
        // the server's API quota. Standalone mode (no auth system) and
        // header-supplied keys (embed widget) are unaffected.
        const envKeyAllowed = !supabaseEnabled || Boolean(authUserId);
        let apiKey = headerKey || (envKeyAllowed ? envKey : null) || '';

        // ── Resolve key from DB when called via Lucy API key auth ────────
        if (!apiKey || apiKey.length < 20) {
          const authHeader = req.headers.get('authorization');
          const apiKeyUserId = authHeader ? await validateApiKey(authHeader) : null;
          if (apiKeyUserId) {
            const svcUrl = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
            const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (svcUrl && svcKey) {
              const svcClient = createClient(svcUrl, svcKey, { db: { schema: 'lucy' } });
              const { data: configs } = await svcClient
                .from('provider_configs')
                .select('provider, api_key_encrypted')
                .eq('user_id', apiKeyUserId)
                .eq('provider', providerName)
                .eq('is_active', true)
                .limit(1);

              if (configs && configs.length > 0 && configs[0].api_key_encrypted) {
                apiKey = decryptProviderKey(configs[0].api_key_encrypted as string);
              }
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────

        if (!apiKey) {
          controller.enqueue(
            encoder.encodeError(
              `No API key provided for ${providerName}. Please configure your API keys in Settings.`
            )
          );
          controller.enqueue(encoder.encodeDone());
          controller.close();
          return;
        }

        const provider = getProvider(providerName);

        // ── MCP tool-use loop (OpenAI-compat or Anthropic only) ─────────────
        const toolCapableOpenAI = providerName in OPENAI_COMPAT_BASE;
        const toolCapableAnthropic = providerName === 'anthropic';

        // Session-validated user id for MCP — resolved once at the top of the
        // request (authUserId); the request body is never trusted.
        const mcpUserId: string | null = authUserId;

        if ((toolCapableOpenAI || toolCapableAnthropic) && mcpUserId) {
          // Build a service-role Supabase client scoped to the lucy schema
          const svcUrl = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
          const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (svcUrl && svcKey) {
            const mcpSvc = createClient(svcUrl, svcKey, { db: { schema: 'lucy' } });
            let loadedTools: Awaited<ReturnType<typeof loadToolsForUser>> = [];
            try {
              loadedTools = await loadToolsForUser(mcpSvc, mcpUserId);
            } catch {
              // Non-fatal — fall through to the no-tools path
            }

            // Fetch installations once and reuse throughout the tool loop
            const mcpInstalls = await getInstallations(mcpSvc, mcpUserId!);

            if (loadedTools.length > 0) {
              // ── Agentic loop ─────────────────────────────────────────────
              const MAX_ROUNDS = 5;

              if (toolCapableOpenAI) {
                // ── OpenAI-compatible agentic loop ───────────────────────
                const baseURL = OPENAI_COMPAT_BASE[providerName]!;
                const extraHeaders: Record<string, string> =
                  providerName === 'openrouter'
                    ? { 'HTTP-Referer': 'https://justlucy.ai', 'X-Title': 'Lucy AI' }
                    : {};
                const oaiClient = new OpenAI({
                  apiKey,
                  baseURL,
                  ...(Object.keys(extraHeaders).length > 0 ? { defaultHeaders: extraHeaders } : {}),
                });

                const oaiTools = toOpenAITools(loadedTools);
                // Build the message array in OpenAI format
                type OAIMessage = OpenAI.Chat.ChatCompletionMessageParam;
                const loopMessages: OAIMessage[] = messagesWithContext.map((m) => ({
                  role: m.role as 'user' | 'assistant' | 'system',
                  content: m.content,
                }));

                let round = 0;
                let finalTextEmitted = false;
                while (round < MAX_ROUNDS) {
                  round++;
                  const stream = await oaiClient.chat.completions.create({
                    model,
                    messages: loopMessages,
                    tools: oaiTools as OpenAI.Chat.ChatCompletionTool[],
                    tool_choice: 'auto',
                    stream: true,
                  });

                  // Accumulate the assistant turn from stream deltas
                  let assistantText = '';
                  const toolCallAccum: Record<
                    number,
                    { id: string; fn_name: string; fn_args: string }
                  > = {};

                  for await (const chunk of stream) {
                    const delta = chunk.choices[0]?.delta;
                    if (!delta) continue;
                    if (delta.content) assistantText += delta.content;
                    if (delta.tool_calls) {
                      for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0;
                        if (!toolCallAccum[idx]) {
                          toolCallAccum[idx] = { id: '', fn_name: '', fn_args: '' };
                        }
                        if (tc.id) toolCallAccum[idx].id += tc.id;
                        if (tc.function?.name) toolCallAccum[idx].fn_name += tc.function.name;
                        if (tc.function?.arguments) toolCallAccum[idx].fn_args += tc.function.arguments;
                      }
                    }
                  }

                  const toolCalls = Object.values(toolCallAccum);

                  if (toolCalls.length === 0) {
                    // No tool calls — stream the final text and stop
                    if (assistantText) {
                      controller.enqueue(encoder.encode({ content: assistantText }));
                    }
                    finalTextEmitted = true;
                    break;
                  }

                  // Append the assistant turn with tool_calls
                  const assistantMsg: OAIMessage = {
                    role: 'assistant',
                    content: assistantText || null,
                    tool_calls: toolCalls.map((tc) => ({
                      id: tc.id,
                      type: 'function' as const,
                      function: { name: tc.fn_name, arguments: tc.fn_args },
                    })),
                  };
                  loopMessages.push(assistantMsg);

                  // Execute each tool call and append tool results
                  for (const tc of toolCalls) {
                    const { slug, name: toolName } = parseQualified(tc.fn_name);
                    let args: Record<string, unknown> = {};
                    try { args = JSON.parse(tc.fn_args || '{}'); } catch { /* empty args */ }

                    // Emit tool_call SSE event — args are intentionally omitted to
                    // prevent sensitive model-generated payloads from reaching the browser.
                    controller.enqueue(
                      encoder.encode({ metadata: { tool_call: { slug, tool: toolName } } }),
                    );

                    let resultContent: string;
                    let ok = true;
                    try {
                      // Approval gating for write tools (use pre-fetched installations list)
                      const inst = mcpInstalls.find((i: any) => i.server_slug === slug && i.enabled);
                      if (inst?.require_approval && WRITE_TOOL_RE.test(toolName)) {
                        resultContent = JSON.stringify({
                          error: 'approval required: this write action needs your approval before it can be executed',
                        });
                        ok = false;
                      } else {
                        const result = await executeMcpTool(mcpSvc, mcpUserId!, slug, toolName, args, mcpInstalls);
                        resultContent = JSON.stringify(result);
                      }
                    } catch (execErr) {
                      resultContent = JSON.stringify({
                        error: execErr instanceof Error ? execErr.message : 'tool execution failed',
                      });
                      ok = false;
                    }

                    // Emit tool_result SSE event
                    controller.enqueue(
                      encoder.encode({ metadata: { tool_result: { slug, tool: toolName, ok } } }),
                    );

                    loopMessages.push({
                      role: 'tool',
                      tool_call_id: tc.id,
                      content: resultContent,
                    } as OAIMessage);
                  }
                }

                if (!finalTextEmitted) {
                  // Exceeded max rounds — do a final no-tools call to get a closing response
                  const finalStream = await oaiClient.chat.completions.create({
                    model,
                    messages: loopMessages,
                    stream: true,
                  });
                  for await (const chunk of finalStream) {
                    const delta = chunk.choices[0]?.delta?.content;
                    if (delta) controller.enqueue(encoder.encode({ content: delta }));
                  }
                }
              } else {
                // ── Anthropic agentic loop ───────────────────────────────
                const anthClient = new Anthropic({ apiKey });
                const anthropicTools = toAnthropicTools(loadedTools) as Anthropic.Tool[];

                // Separate system from conversation
                const sysMsg = messagesWithContext.find((m) => m.role === 'system');
                type AnthMsg = Anthropic.MessageParam;
                const loopMessages: AnthMsg[] = messagesWithContext
                  .filter((m) => m.role !== 'system')
                  .map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                  }));

                let round = 0;
                let finalTextEmitted = false;
                while (round < MAX_ROUNDS) {
                  round++;
                  const stream = anthClient.messages.stream({
                    model,
                    max_tokens: 8096,
                    system: sysMsg?.content,
                    messages: loopMessages,
                    tools: anthropicTools,
                  });

                  let assistantText = '';
                  const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

                  for await (const event of stream) {
                    if (
                      event.type === 'content_block_delta' &&
                      event.delta.type === 'text_delta'
                    ) {
                      assistantText += event.delta.text;
                    }
                  }

                  // Get the final message to inspect content blocks
                  const finalMsg = await stream.finalMessage();
                  for (const block of finalMsg.content) {
                    if (block.type === 'tool_use') {
                      toolUseBlocks.push(block as Anthropic.ToolUseBlock);
                    }
                  }

                  if (toolUseBlocks.length === 0) {
                    // No tool calls — stream the text and stop
                    if (assistantText) {
                      controller.enqueue(encoder.encode({ content: assistantText }));
                    }
                    finalTextEmitted = true;
                    break;
                  }

                  // Append assistant turn
                  loopMessages.push({
                    role: 'assistant',
                    content: finalMsg.content,
                  });

                  // Execute tool calls and build the tool_result user turn
                  const toolResults: Anthropic.ToolResultBlockParam[] = [];
                  for (const tb of toolUseBlocks) {
                    const { slug, name: toolName } = parseQualified(tb.name);
                    const args = (tb.input ?? {}) as Record<string, unknown>;

                    // Emit tool_call SSE event — args are intentionally omitted to
                    // prevent sensitive model-generated payloads from reaching the browser.
                    controller.enqueue(
                      encoder.encode({ metadata: { tool_call: { slug, tool: toolName } } }),
                    );

                    let resultContent: string;
                    let ok = true;
                    try {
                      // Approval gating for write tools (use pre-fetched installations list)
                      const inst = mcpInstalls.find((i: any) => i.server_slug === slug && i.enabled);
                      if (inst?.require_approval && WRITE_TOOL_RE.test(toolName)) {
                        resultContent = JSON.stringify({
                          error: 'approval required: this write action needs your approval before it can be executed',
                        });
                        ok = false;
                      } else {
                        const result = await executeMcpTool(mcpSvc, mcpUserId!, slug, toolName, args, mcpInstalls);
                        resultContent = JSON.stringify(result);
                      }
                    } catch (execErr) {
                      resultContent = JSON.stringify({
                        error: execErr instanceof Error ? execErr.message : 'tool execution failed',
                      });
                      ok = false;
                    }

                    // Emit tool_result SSE event
                    controller.enqueue(
                      encoder.encode({ metadata: { tool_result: { slug, tool: toolName, ok } } }),
                    );

                    toolResults.push({
                      type: 'tool_result',
                      tool_use_id: tb.id,
                      content: resultContent,
                    });
                  }

                  loopMessages.push({ role: 'user', content: toolResults });
                }

                if (!finalTextEmitted) {
                  // Exceeded max rounds — do a final no-tools call
                  const finalMsg = await anthClient.messages.create({
                    model,
                    max_tokens: 8096,
                    system: sysMsg?.content,
                    messages: loopMessages,
                  });
                  for (const block of finalMsg.content) {
                    if (block.type === 'text') {
                      controller.enqueue(encoder.encode({ content: block.text }));
                    }
                  }
                }
              }

              controller.enqueue(encoder.encodeDone());
              controller.close();
              return; // ← exit early; skip the standard provider.chat() below
            }
          }
        }
        // ── End MCP tool-use loop ────────────────────────────────────────────

        await provider.chat(
          messagesWithContext,
          model,
          (chunk: string) => {
            controller.enqueue(encoder.encode({ content: chunk }));
          },
          { apiKey }
        );

        controller.enqueue(encoder.encodeDone());
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'An unexpected error occurred';

        // Provide user-friendly messages for common errors
        let userMessage = message;

        if (message.includes('401') || message.includes('Unauthorized')) {
          userMessage = 'Invalid API key. Please check your settings.';
        } else if (
          message.includes('429') ||
          message.toLowerCase().includes('rate limit') ||
          message.toLowerCase().includes('too many requests')
        ) {
          // Extract retry-after hint from provider error message if present
          const retryMatch = message.match(/(\d+)\s*second/i);
          const waitHint = retryMatch ? ` Please wait ${retryMatch[1]} seconds.` : '';
          userMessage = `Rate limit exceeded from the AI provider.${waitHint} Please wait a moment and try again.`;
        } else if (message.includes('quota')) {
          userMessage = 'API quota exceeded. Please check your billing settings.';
        }

        try {
          controller.enqueue(encoder.encodeError(userMessage));
          controller.enqueue(encoder.encodeDone());
          controller.close();
        } catch {
          // Controller may already be closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
