/** `lucy chat` — interactive REPL and one-shot mode. */
import { createInterface } from 'node:readline/promises';
import { api, apiSafe, streamChat, type ChatMessage } from './http';
import { c } from './config';
import { logo, box, spinner } from './ui';
import { renderMarkdown } from './md';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

async function fetchModels(includeLocal = false): Promise<ModelInfo[]> {
  const data = await api<{ models: ModelInfo[] }>(`/api/models${includeLocal ? '?includeLocal=true' : ''}`);
  return data.models;
}

// Default provider preference when no model is specified — pick a model whose
// provider the user actually has a key for, rather than a fixed default.
const PROVIDER_PRIORITY = ['anthropic', 'openai', 'google', 'deepseek', 'groq', 'mistral', 'xai', 'openrouter', 'local'];

/** Which providers the signed-in user has a configured key for (best-effort). */
async function fetchConfiguredProviders(): Promise<Set<string>> {
  const data = await apiSafe<{ configs: { provider: string }[] }>('/api/provider-keys');
  return new Set((data?.configs ?? []).map((cfg) => cfg.provider));
}

function pickDefault(models: ModelInfo[], configured: Set<string>): ModelInfo {
  for (const provider of PROVIDER_PRIORITY) {
    if (configured.has(provider)) {
      const m = models.find((x) => x.provider === provider);
      if (m) return m;
    }
  }
  return models.find((x) => x.id === 'gpt-4o') ?? models[0];
}

function resolveModel(models: ModelInfo[], wanted: string | undefined, configured: Set<string>): ModelInfo {
  if (wanted) {
    const m = models.find((x) => x.id === wanted);
    if (m) return m;
    console.error(c.yellow(`Unknown model "${wanted}" — using default. Run \`lucy models\` to list.`));
  }
  return pickDefault(models, configured);
}

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

export async function chatCommand(args: string[]): Promise<void> {
  // Flags: -m/--model <id>
  let wantedModel: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-m' || args[i] === '--model') && args[i + 1]) {
      wantedModel = args[++i];
    } else {
      rest.push(args[i]);
    }
  }

  const models = await fetchModels(true);
  const configured = await fetchConfiguredProviders();
  let model = resolveModel(models, wantedModel, configured);
  const messages: ChatMessage[] = [];

  const piped = !process.stdin.isTTY ? await readStdin() : '';
  const oneShot = rest.join(' ').trim();

  // One-shot: `lucy chat "question"` or `cat file | lucy chat "explain"`
  if (oneShot || piped) {
    const prompt = [oneShot, piped].filter(Boolean).join('\n\n');
    messages.push({ role: 'user', content: prompt });
    await streamChat(messages, model.id, model.provider, (t) => process.stdout.write(t));
    process.stdout.write('\n');
    return;
  }

  // Interactive REPL
  console.log(logo());
  console.log();
  console.log(
    box([
      `${c.bold('model')}   ${model.name} ${c.dim(`(${model.id})`)}`,
      `${c.bold('cmds')}    ${c.dim('/model <id>   /new   /exit')}`,
    ])
  );
  console.log();
  const COMMANDS = ['/model ', '/new', '/exit', '/help'];
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer(line: string): [string[], string] {
      if (!line.startsWith('/')) return [[], line];
      const hits = COMMANDS.filter((cmd) => cmd.startsWith(line));
      return [hits.length ? hits : COMMANDS, line];
    },
  });

  for (;;) {
    const line = (await rl.question(c.bold(c.purple('you › ')))).trim();
    if (!line) continue;

    if (line === '/exit' || line === '/quit') break;
    if (line === '/new') {
      messages.length = 0;
      console.log(c.dim('— new conversation —'));
      continue;
    }
    if (line.startsWith('/model')) {
      const id = line.split(/\s+/)[1];
      if (!id) {
        console.log(c.dim(`current: ${model.id} — usage: /model <id>`));
        continue;
      }
      model = resolveModel(models, id, configured);
      console.log(c.dim(`model → ${model.name} (${model.provider})`));
      continue;
    }

    messages.push({ role: 'user', content: line });
    // Buffer the reply behind a spinner so it can be Markdown-rendered as a
    // whole (bold, lists, syntax-framed code blocks) once complete.
    const spin = spinner('lucy is thinking');
    const t0 = Date.now();
    const reply = await streamChat(messages, model.id, model.provider, () => {});
    spin.stop();
    const ms = Date.now() - t0;

    console.log(c.dim('─'.repeat(48)));
    console.log(c.bold(c.purple('lucy ›')));
    console.log(renderMarkdown(reply.trim()));
    console.log(c.dim(`  · ${model.id} · ${reply.length} chars · ${ms} ms`));
    messages.push({ role: 'assistant', content: reply });
  }

  rl.close();
}

export async function modelsCommand(args: string[]): Promise<void> {
  const includeLocal = args.includes('--local');
  const models = await fetchModels(includeLocal);
  const byProvider = new Map<string, ModelInfo[]>();
  for (const m of models) {
    byProvider.set(m.provider, [...(byProvider.get(m.provider) ?? []), m]);
  }
  for (const [provider, list] of Array.from(byProvider.entries())) {
    const w = Math.max(...list.map((m) => m.id.length)) + 2;
    console.log(
      box([c.bold(c.purple(provider)), ...list.map((m) => `${m.id.padEnd(w)}${c.dim(m.name)}`)])
    );
  }
}
