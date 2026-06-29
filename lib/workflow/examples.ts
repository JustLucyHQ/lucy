/**
 * Example workflows — 15 ready-to-run demos seeded into the LOCAL workflow
 * library (localhost dev only; see LocalWorkflowStorage.seedExamplesIfEmpty).
 *
 * Most use only **open public APIs** (no key) via the HTTP node, so they run for
 * free. A few use an **AI Agent** (llm) node — those need the user's provider key
 * (default Anthropic / claude-sonnet-4-6; switch per node in the editor).
 */

import type { Workflow, WorkflowNode, WorkflowEdge, NodeType, NodeConfig } from './types';

type Spec = { type: NodeType; label: string; config: Record<string, unknown> };

/** Build a simple left-to-right linear workflow (start → … → output). */
function wf(slug: string, name: string, description: string, specs: Spec[]): Workflow {
  const nodes: WorkflowNode[] = specs.map((s, i) => ({
    id: `${slug}-n${i}`,
    type: s.type,
    position: { x: 60 + i * 260, y: 140 },
    data: {
      nodeType: s.type,
      label: s.label,
      config: { label: s.label, ...s.config } as unknown as NodeConfig,
    },
  }));
  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < specs.length - 1; i++) {
    edges.push({ id: `${slug}-e${i}`, source: `${slug}-n${i}`, target: `${slug}-n${i + 1}` });
  }
  return { id: `wf_ex_${slug}`, name, description, nodes, edges, isPublished: false, createdAt: 0, updatedAt: 0 };
}

// ── node spec helpers ────────────────────────────────────────────────────────
const startNoInput: Spec = { type: 'start', label: 'Start', config: { inputVariables: [] } };
const startQuery = (desc: string, def = ''): Spec => ({
  type: 'start',
  label: 'Start',
  config: { inputVariables: [{ name: 'user_query', description: desc, defaultValue: def }] },
});
const http = (label: string, url: string): Spec => ({
  type: 'http',
  label,
  config: { url, method: 'GET', headers: [{ key: 'Accept', value: 'application/json' }], body: '', timeout: 10000 },
});
const ai = (label: string, systemPrompt: string, inputVariable = ''): Spec => ({
  type: 'llm',
  label,
  config: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    systemPrompt,
    temperature: 0.7,
    maxTokens: 600,
    inputVariable, // '' → uses the previous node's output (e.g. the HTTP result)
  },
});
const out: Spec = { type: 'output', label: 'Output', config: { displayName: 'Result', format: 'markdown' } };

/** The 15 example workflows (11 open-API-only, 4 use an AI Agent). */
export function buildExampleWorkflows(): Workflow[] {
  return [
    // ── Open public APIs only (free) ─────────────────────────────────────────
    wf('random-joke', 'Random Joke', 'Fetch a random joke from a public API.',
      [startNoInput, http('Get Joke', 'https://official-joke-api.appspot.com/random_joke'), out]),
    wf('cat-fact', 'Cat Fact', 'Get a random cat fact.',
      [startNoInput, http('Get Cat Fact', 'https://catfact.ninja/fact'), out]),
    wf('my-ip', 'My Public IP', "Look up this server's public IP address.",
      [startNoInput, http('Get IP', 'https://api.ipify.org?format=json'), out]),
    wf('btc-price', 'Bitcoin Price (USD)', 'Current BTC spot price from Coinbase.',
      [startNoInput, http('Get BTC Price', 'https://api.coinbase.com/v2/prices/BTC-USD/spot'), out]),
    wf('weather-zagreb', 'Weather — Zagreb', 'Current weather for Zagreb via Open-Meteo (no key).',
      [startNoInput, http('Get Weather', 'https://api.open-meteo.com/v1/forecast?latitude=45.81&longitude=15.98&current_weather=true'), out]),
    wf('random-user', 'Random User', 'Generate a random user profile.',
      [startNoInput, http('Get Random User', 'https://randomuser.me/api/'), out]),
    wf('quote', 'Inspirational Quote', 'A random quote from ZenQuotes.',
      [startNoInput, http('Get Quote', 'https://zenquotes.io/api/random'), out]),
    wf('dog-image', 'Random Dog Image', 'A random dog image URL from dog.ceo.',
      [startNoInput, http('Get Dog', 'https://dog.ceo/api/breeds/image/random'), out]),
    wf('useless-fact', 'Random Fact', 'A random useless fact.',
      [startNoInput, http('Get Fact', 'https://uselessfacts.jsph.pl/api/v2/facts/random'), out]),
    wf('country-info', 'Country Info — Croatia', 'Capital, population, region for Croatia.',
      [startNoInput, http('Get Country', 'https://restcountries.com/v3.1/name/croatia?fields=name,capital,population,region'), out]),
    wf('github-repo', 'GitHub Repo Stats — Chunkr', 'Public stats for the lumina-ai-inc/chunkr repo.',
      [startNoInput, http('Get Repo', 'https://api.github.com/repos/lumina-ai-inc/chunkr'), out]),

    // ── Open API + AI Agent ──────────────────────────────────────────────────
    wf('joke-funnier', 'Joke → Punch It Up (AI)', 'Fetch a joke, then have Lucy rewrite it funnier.',
      [startNoInput,
       http('Get Joke', 'https://official-joke-api.appspot.com/random_joke'),
       ai('Rewrite Funnier', 'You are a witty comedian. Rewrite the joke in the input to be funnier and snappier. Return only the joke.'),
       out]),
    wf('advice-expand', 'Advice → Daily Tip (AI)', 'Fetch a piece of advice, then expand it into a short actionable tip.',
      [startNoInput,
       http('Get Advice', 'https://api.adviceslip.com/advice'),
       ai('Expand Tip', 'Turn the advice in the input into one short, encouraging, actionable tip (2–3 sentences).'),
       out]),

    // ── Pure AI Agent ────────────────────────────────────────────────────────
    wf('standup-summary', 'Standup Summarizer (AI)', 'Turn rough notes into a clean daily standup.',
      [startQuery('Your rough notes for the day', 'finished the login page, starting on billing, blocked on API keys'),
       ai('Summarize', 'Summarize the notes into a daily standup with three sections: **Yesterday**, **Today**, **Blockers**. Be concise.', 'user_query'),
       out]),
    wf('email-draft', 'Email Draft Writer (AI)', 'Write a professional email from a short request.',
      [startQuery('What the email should say', 'ask a client for the overdue invoice, politely'),
       ai('Write Email', 'Write a short, professional, friendly email for the request in the input. Include a subject line.', 'user_query'),
       out]),
  ];
}
