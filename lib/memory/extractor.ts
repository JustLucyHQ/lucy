import type { ChatMessage } from '@/lib/providers/types';
import { ExtractionResultSchema, type ExtractionResult, type MemoryRecord } from './types';
import { containsSecret } from './privacy';

/** Injected LLM caller: takes a prompt, returns the raw model text. */
export type LlmCaller = (prompt: string) => Promise<string>;

const SYSTEM_INSTRUCTIONS = `You extract durable memory from a conversation for a business AI assistant.
Return ONLY JSON matching this shape:
{
  "memories": [{ "op": "ADD|UPDATE|MERGE|SKIP", "id": "<existing id if UPDATE/MERGE>",
                 "type": "semantic|pragmatic|episodic", "category": "string?",
                 "content": "one atomic fact/preference/event", "summary": "short form?",
                 "importance": 1-10 }],
  "entities": [{ "name": "string", "type": "client|product|person|term|project?" }],
  "profilePatch": { "field": "value" }
}
Rules:
- semantic = stable facts/preferences; pragmatic = working style/intent; episodic = what happened, when.
- Compare against EXISTING MEMORIES provided; use UPDATE/MERGE/SKIP to avoid duplicates, ADD only for new.
- NEVER include passwords, API keys, tokens, or other secrets/PII.
- profilePatch holds only stable identity/preferences (name, role, company, communication style).
- Be conservative: omit trivial chatter. Prefer 0 memories over noise.`;

function buildPrompt(conversation: ChatMessage[], existing: MemoryRecord[]): string {
  const convoText = conversation
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
  const existingText = existing.length
    ? existing.map((m) => `- [${m.id}] (${m.type}) ${m.content}`).join('\n')
    : '(none)';
  return `${SYSTEM_INSTRUCTIONS}\n\nEXISTING MEMORIES:\n${existingText}\n\nCONVERSATION:\n${convoText}\n\nJSON:`;
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const brace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (brace >= 0 && lastBrace > brace) return text.slice(brace, lastBrace + 1);
  return text.trim();
}

const EMPTY: ExtractionResult = { memories: [], entities: [], profilePatch: {} };

export async function extractMemories(
  conversation: ChatMessage[],
  existing: MemoryRecord[],
  llm: LlmCaller
): Promise<ExtractionResult> {
  let raw: string;
  try {
    raw = await llm(buildPrompt(conversation, existing));
  } catch {
    return EMPTY;
  }
  let parsed: ExtractionResult;
  try {
    parsed = ExtractionResultSchema.parse(JSON.parse(stripFences(raw)));
  } catch {
    return EMPTY;
  }
  // Privacy guard — drop any memory or profile value that looks like a secret.
  const memories = parsed.memories.filter(
    (m) => m.op !== 'SKIP' && !containsSecret(m.content)
  );
  const profilePatch = Object.fromEntries(
    Object.entries(parsed.profilePatch).filter(([, v]) => !containsSecret(String(v)))
  );
  return { memories, entities: parsed.entities, profilePatch };
}
