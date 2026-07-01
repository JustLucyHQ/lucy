/**
 * Pre-built workflow templates.
 *
 * Each template is a complete Workflow definition that can be instantiated
 * (saved as a new workflow) from the Workflows page.
 */

import type { Workflow, WorkflowNode, WorkflowEdge, NodeConfig, NodeType } from './types';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>;
  /** Only shown to admins (e.g. customer-specific templates like Contractors Room). */
  adminOnly?: boolean;
}

// ─── Builders for the richer multi-node templates below ─────────────────────
// These keep the verbose React-Flow node/edge shape DRY. Patterns are chosen to
// match the engine's DFS execution: linear chains that combine earlier outputs
// via a transform `{{nodeId}}`, and condition branches with a separate output
// per branch (fan-out→single-merge is avoided — the engine runs a merge node
// after only its first parent).

interface NodeSpec {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, unknown>;
  x: number;
  y: number;
}

function mkNode(n: NodeSpec): WorkflowNode {
  return {
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    data: { nodeType: n.type, label: n.label, config: { label: n.label, ...n.config } as unknown as NodeConfig },
  };
}

function mkEdge(source: string, target: string, sourceHandle?: 'true' | 'false'): WorkflowEdge {
  return {
    id: `e_${source}_${target}${sourceHandle ? '_' + sourceHandle : ''}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#6b7280', strokeWidth: 2 },
  };
}

const httpGet = (url: string) => ({
  url,
  method: 'GET',
  headers: [{ key: 'Accept', value: 'application/json' }],
  body: '',
  timeout: 15000,
});
const ai = (systemPrompt: string, inputVariable = '', maxTokens = 800) => ({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  systemPrompt,
  temperature: 0.6,
  maxTokens,
  inputVariable,
});
const tmpl = (template: string) => ({ operation: 'template', template });
const outCfg = (displayName: string) => ({ displayName, format: 'markdown' });

function tpl(
  meta: { id: string; name: string; description: string; icon: string },
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowTemplate {
  return {
    ...meta,
    workflow: { name: meta.name, description: meta.description, isPublished: false, nodes, edges },
  };
}

/** Richer multi-node templates (linear multi-stage + branching). */
const COMPLEX_TEMPLATES: WorkflowTemplate[] = [
  // 1 ── Research Brief: two sources → combine → AI brief (linear) ───────────
  tpl(
    {
      id: 'research-brief',
      name: 'Research Brief',
      description: 'Pull Wikipedia + DuckDuckGo on a topic, combine, and have Lucy write a structured research brief.',
      icon: '🔎',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Topic', x: 60, y: 180, config: { inputVariables: [{ name: 'topic', description: 'Subject to research (Wikipedia-style title works best, e.g. Large_language_model)', defaultValue: 'Large_language_model' }] } }),
      mkNode({ id: 'wiki', type: 'http', label: 'Wikipedia Summary', x: 320, y: 180, config: httpGet('https://en.wikipedia.org/api/rest_v1/page/summary/{{topic}}') }),
      mkNode({ id: 'web', type: 'http', label: 'DuckDuckGo', x: 580, y: 180, config: httpGet('https://api.duckduckgo.com/?q={{topic}}&format=json&no_html=1&skip_disambig=1') }),
      mkNode({ id: 'ctx', type: 'transform', label: 'Build Context', x: 840, y: 180, config: tmpl('Topic: {{topic}}\n\n=== Wikipedia ===\n{{wiki}}\n\n=== Web (DuckDuckGo) ===\n{{web}}') }),
      mkNode({ id: 'brief', type: 'llm', label: 'Write Brief', x: 1100, y: 180, config: ai('You are a research analyst. Using ONLY the sources provided, write a structured brief with: **Overview**, **Key points** (bullets), and **Open questions**. Note which source supports each key point. Keep it tight.', '', 1200) }),
      mkNode({ id: 'out', type: 'output', label: 'Research Brief', x: 1360, y: 180, config: outCfg('Research Brief') }),
    ],
    [mkEdge('start', 'wiki'), mkEdge('wiki', 'web'), mkEdge('web', 'ctx'), mkEdge('ctx', 'brief'), mkEdge('brief', 'out')],
  ),

  // 2 ── Crypto Market Brief: BTC + ETH → combine → AI note (linear) ─────────
  tpl(
    {
      id: 'crypto-brief',
      name: 'Crypto Market Brief',
      description: 'Fetch live BTC and ETH spot prices (Coinbase, no key) and have Lucy write a short market note.',
      icon: '₿',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Start', x: 60, y: 180, config: { inputVariables: [] } }),
      mkNode({ id: 'btc', type: 'http', label: 'BTC Price', x: 320, y: 180, config: httpGet('https://api.coinbase.com/v2/prices/BTC-USD/spot') }),
      mkNode({ id: 'eth', type: 'http', label: 'ETH Price', x: 580, y: 180, config: httpGet('https://api.coinbase.com/v2/prices/ETH-USD/spot') }),
      mkNode({ id: 'mkt', type: 'transform', label: 'Combine Prices', x: 840, y: 180, config: tmpl('BTC/USD: {{btc}}\nETH/USD: {{eth}}') }),
      mkNode({ id: 'note', type: 'llm', label: 'Market Note', x: 1100, y: 180, config: ai('You are a crypto market analyst. From the BTC and ETH spot prices in the input, write a 3-line note: the current prices, the BTC/ETH ratio, and one cautious observation. Not financial advice.', '', 500) }),
      mkNode({ id: 'out', type: 'output', label: 'Market Brief', x: 1360, y: 180, config: outCfg('Crypto Market Brief') }),
    ],
    [mkEdge('start', 'btc'), mkEdge('btc', 'eth'), mkEdge('eth', 'mkt'), mkEdge('mkt', 'note'), mkEdge('note', 'out')],
  ),

  // 3 ── GitHub Repo Health: repo + issues → combine → AI report (linear) ────
  tpl(
    {
      id: 'github-health',
      name: 'GitHub Repo Health',
      description: 'Pull a public repo + its open issues and have Lucy produce a health report with a score and recommendations.',
      icon: '🩺',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Repo', x: 60, y: 180, config: { inputVariables: [{ name: 'repo', description: 'owner/name', defaultValue: 'vercel/next.js' }] } }),
      mkNode({ id: 'repoinfo', type: 'http', label: 'Repo Info', x: 320, y: 180, config: httpGet('https://api.github.com/repos/{{repo}}') }),
      mkNode({ id: 'issues', type: 'http', label: 'Open Issues', x: 580, y: 180, config: httpGet('https://api.github.com/repos/{{repo}}/issues?state=open&per_page=10') }),
      mkNode({ id: 'ctx', type: 'transform', label: 'Build Context', x: 840, y: 180, config: tmpl('Repository: {{repo}}\n\n=== Repo JSON ===\n{{repoinfo}}\n\n=== Open Issues JSON ===\n{{issues}}') }),
      mkNode({ id: 'report', type: 'llm', label: 'Health Report', x: 1100, y: 180, config: ai('You are an open-source maintainer analyst. From the repo JSON and open issues, produce: **Snapshot** (stars, forks, language, last push), **Issue themes** (cluster the open issues), **Health score /10**, and **3 recommendations**.', '', 1200) }),
      mkNode({ id: 'out', type: 'output', label: 'Health Report', x: 1360, y: 180, config: outCfg('Repo Health Report') }),
    ],
    [mkEdge('start', 'repoinfo'), mkEdge('repoinfo', 'issues'), mkEdge('issues', 'ctx'), mkEdge('ctx', 'report'), mkEdge('report', 'out')],
  ),

  // 4 ── Smart Joke Studio: fetch → rate → CONDITION → two branches ──────────
  tpl(
    {
      id: 'joke-studio',
      name: 'Smart Joke Studio',
      description: 'Fetch a joke, have Lucy judge if it lands, then either punch it up or rewrite it — a branching example.',
      icon: '😂',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Start', x: 60, y: 200, config: { inputVariables: [] } }),
      mkNode({ id: 'joke', type: 'http', label: 'Get Joke', x: 320, y: 200, config: httpGet('https://official-joke-api.appspot.com/random_joke') }),
      mkNode({ id: 'rate', type: 'llm', label: 'Rate Funniness', x: 580, y: 200, config: ai('You are a tough comedy critic. Is the joke in the input actually funny? Answer with a single word: YES or NO.', '', 10) }),
      mkNode({ id: 'cond', type: 'condition', label: 'Funny?', x: 840, y: 200, config: { field: 'output', operator: 'contains', value: 'YES' } }),
      // true branch
      mkNode({ id: 'keepT', type: 'transform', label: 'Keep Joke', x: 1100, y: 80, config: tmpl('{{joke}}') }),
      mkNode({ id: 'ampT', type: 'llm', label: 'Punch It Up', x: 1360, y: 80, config: ai('This joke already lands. Punch it up so it is even snappier and tighter. Return only the joke.', '', 300) }),
      mkNode({ id: 'outT', type: 'output', label: 'Funnier Joke', x: 1620, y: 80, config: outCfg('Funnier Joke') }),
      // false branch
      mkNode({ id: 'keepF', type: 'transform', label: 'Keep Joke', x: 1100, y: 320, config: tmpl('{{joke}}') }),
      mkNode({ id: 'rewF', type: 'llm', label: 'Rewrite', x: 1360, y: 320, config: ai('This joke is weak. Rewrite it into a genuinely funny joke on a similar theme. Return only the joke.', '', 300) }),
      mkNode({ id: 'outF', type: 'output', label: 'Rewritten Joke', x: 1620, y: 320, config: outCfg('Rewritten Joke') }),
    ],
    [
      mkEdge('start', 'joke'), mkEdge('joke', 'rate'), mkEdge('rate', 'cond'),
      mkEdge('cond', 'keepT', 'true'), mkEdge('keepT', 'ampT'), mkEdge('ampT', 'outT'),
      mkEdge('cond', 'keepF', 'false'), mkEdge('keepF', 'rewF'), mkEdge('rewF', 'outF'),
    ],
  ),

  // 5 ── Weather Day Planner: fetch → CODE parse → CONDITION → two branches ──
  tpl(
    {
      id: 'weather-planner',
      name: 'Weather Day Planner',
      description: 'Get Zagreb weather, parse the temperature with a Code node, then branch to outdoor or indoor suggestions.',
      icon: '🌤️',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Start', x: 60, y: 200, config: { inputVariables: [] } }),
      mkNode({ id: 'wx', type: 'http', label: 'Zagreb Weather', x: 320, y: 200, config: httpGet('https://api.open-meteo.com/v1/forecast?latitude=45.81&longitude=15.98&current_weather=true') }),
      mkNode({ id: 'temp', type: 'code', label: 'Parse Temp °C', x: 580, y: 200, config: { code: 'const d = JSON.parse(input); return String(d.current_weather && d.current_weather.temperature != null ? d.current_weather.temperature : "");' } }),
      mkNode({ id: 'cond', type: 'condition', label: 'Warm? (>18°C)', x: 840, y: 200, config: { field: 'output', operator: 'greater_than', value: '18' } }),
      // warm branch
      mkNode({ id: 'wT', type: 'transform', label: 'Weather Context', x: 1100, y: 80, config: tmpl('{{wx}}') }),
      mkNode({ id: 'sugT', type: 'llm', label: 'Outdoor Plan', x: 1360, y: 80, config: ai('It is warm in Zagreb today. From the weather JSON in the input, suggest 3 outdoor activities with a one-line reason each.', '', 500) }),
      mkNode({ id: 'outT', type: 'output', label: 'Outdoor Plan', x: 1620, y: 80, config: outCfg('Day Plan — Outdoor') }),
      // cool branch
      mkNode({ id: 'wF', type: 'transform', label: 'Weather Context', x: 1100, y: 320, config: tmpl('{{wx}}') }),
      mkNode({ id: 'sugF', type: 'llm', label: 'Indoor Plan', x: 1360, y: 320, config: ai('It is cool or cold in Zagreb today. From the weather JSON in the input, suggest 3 cozy indoor activities with a one-line reason each.', '', 500) }),
      mkNode({ id: 'outF', type: 'output', label: 'Indoor Plan', x: 1620, y: 320, config: outCfg('Day Plan — Indoor') }),
    ],
    [
      mkEdge('start', 'wx'), mkEdge('wx', 'temp'), mkEdge('temp', 'cond'),
      mkEdge('cond', 'wT', 'true'), mkEdge('wT', 'sugT'), mkEdge('sugT', 'outT'),
      mkEdge('cond', 'wF', 'false'), mkEdge('wF', 'sugF'), mkEdge('sugF', 'outF'),
    ],
  ),

  // 6 ── Content Repurposer: one article → 3 AI formats → bundle (linear) ────
  tpl(
    {
      id: 'content-repurposer',
      name: 'Content Repurposer',
      description: 'Turn one article into a tweet thread, a LinkedIn post, and a TL;DR, then bundle them into one pack.',
      icon: '♻️',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Article', x: 60, y: 180, config: { inputVariables: [{ name: 'article', description: 'Paste the article or notes to repurpose', defaultValue: 'Lucy is an AI workspace that unifies chat, workflows, and connectors so a whole company can run on one assistant.' }] } }),
      mkNode({ id: 'tw', type: 'llm', label: 'Tweet Thread', x: 320, y: 180, config: ai('Turn the article in the input into a punchy 3-tweet thread. Number them 1/ 2/ 3/.', 'article', 500) }),
      mkNode({ id: 'li', type: 'llm', label: 'LinkedIn Post', x: 580, y: 180, config: ai('Turn the article in the input into a professional LinkedIn post (~120 words) with a strong hook and a closing question.', 'article', 600) }),
      mkNode({ id: 'tldr', type: 'llm', label: 'TL;DR', x: 840, y: 180, config: ai('Write a single-sentence TL;DR of the article in the input.', 'article', 120) }),
      mkNode({ id: 'bundle', type: 'transform', label: 'Bundle', x: 1100, y: 180, config: tmpl('# Repurposed Content\n\n## Tweet thread\n{{tw}}\n\n## LinkedIn post\n{{li}}\n\n## TL;DR\n{{tldr}}') }),
      mkNode({ id: 'out', type: 'output', label: 'Content Pack', x: 1360, y: 180, config: outCfg('Repurposed Content') }),
    ],
    [mkEdge('start', 'tw'), mkEdge('tw', 'li'), mkEdge('li', 'tldr'), mkEdge('tldr', 'bundle'), mkEdge('bundle', 'out')],
  ),

  // 7 ── Support Ticket Triage: classify → CONDITION → priority/standard ─────
  tpl(
    {
      id: 'support-triage',
      name: 'Support Ticket Triage',
      description: 'Classify a support ticket as high/low urgency and draft the matching response — a branching example.',
      icon: '🎫',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Ticket', x: 60, y: 200, config: { inputVariables: [{ name: 'ticket', description: 'Paste the support ticket', defaultValue: 'Hi, I was charged twice this month and need a refund ASAP — this is urgent!' }] } }),
      mkNode({ id: 'clf', type: 'llm', label: 'Classify Urgency', x: 320, y: 200, config: ai('Classify the support ticket in the input. Answer with a single word: HIGH or LOW.', 'ticket', 10) }),
      mkNode({ id: 'cond', type: 'condition', label: 'High urgency?', x: 580, y: 200, config: { field: 'output', operator: 'contains', value: 'HIGH' } }),
      // high branch
      mkNode({ id: 'tH', type: 'transform', label: 'Ticket', x: 840, y: 80, config: tmpl('{{ticket}}') }),
      mkNode({ id: 'rH', type: 'llm', label: 'Priority Reply', x: 1100, y: 80, config: ai('This is a HIGH-urgency ticket. Draft an empathetic, fast response that acknowledges the issue, states the immediate next step, and notes it has been escalated.', '', 500) }),
      mkNode({ id: 'oH', type: 'output', label: 'Priority Response', x: 1360, y: 80, config: outCfg('Priority Response') }),
      // low branch
      mkNode({ id: 'tL', type: 'transform', label: 'Ticket', x: 840, y: 320, config: tmpl('{{ticket}}') }),
      mkNode({ id: 'rL', type: 'llm', label: 'Standard Reply', x: 1100, y: 320, config: ai('This is a standard ticket. Draft a friendly, helpful response that resolves the request.', '', 500) }),
      mkNode({ id: 'oL', type: 'output', label: 'Standard Response', x: 1360, y: 320, config: outCfg('Standard Response') }),
    ],
    [
      mkEdge('start', 'clf'), mkEdge('clf', 'cond'),
      mkEdge('cond', 'tH', 'true'), mkEdge('tH', 'rH'), mkEdge('rH', 'oH'),
      mkEdge('cond', 'tL', 'false'), mkEdge('tL', 'rL'), mkEdge('rL', 'oL'),
    ],
  ),

  // 8 ── Recipe Idea Generator: search a free recipe API → AI write-up ───────
  tpl(
    {
      id: 'recipe-idea',
      name: 'Recipe Idea Generator',
      description: 'Search TheMealDB for a recipe matching an ingredient or dish, and have Lucy write it up clearly.',
      icon: '🍳',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Ingredient / Dish', x: 60, y: 180, config: { inputVariables: [{ name: 'query', description: 'Ingredient or dish to search (e.g. chicken, pasta, dessert)', defaultValue: 'chicken' }] } }),
      mkNode({ id: 'search', type: 'http', label: 'Search Recipes', x: 320, y: 180, config: httpGet('https://www.themealdb.com/api/json/v1/1/search.php?s={{query}}') }),
      mkNode({ id: 'recipe', type: 'llm', label: 'Write Recipe', x: 580, y: 180, config: ai('You are a helpful cooking assistant. From the raw recipe API data in the input, pick the best matching recipe and present it clearly with: **Name**, **Ingredients** (bulleted with quantities), **Instructions** (numbered steps), and a **Tip**. If multiple recipes were returned, pick the most relevant one to the query.', '', 900) }),
      mkNode({ id: 'out', type: 'output', label: 'Recipe', x: 840, y: 180, config: outCfg('Recipe') }),
    ],
    [mkEdge('start', 'search'), mkEdge('search', 'recipe'), mkEdge('recipe', 'out')],
  ),

  // 9 ── Meeting Notes → Action Items: pure input → AI extraction (no API) ───
  tpl(
    {
      id: 'meeting-action-items',
      name: 'Meeting Notes → Action Items',
      description: 'Paste raw meeting notes and have Lucy pull out decisions, action items, and open questions.',
      icon: '📝',
    },
    [
      mkNode({ id: 'start', type: 'start', label: 'Meeting Notes', x: 60, y: 180, config: { inputVariables: [{ name: 'notes', description: 'Paste your meeting notes or transcript', defaultValue: 'We discussed the Q3 roadmap. Sarah will finalize the budget by Friday. Mike is blocked on the API integration and needs design review. Next sync is Thursday.' }] } }),
      mkNode({ id: 'extract', type: 'llm', label: 'Extract Action Items', x: 320, y: 180, config: ai('You are an executive assistant. From the meeting notes in the input, extract: **Decisions made** (bullets), **Action items** (bullets, each with an owner if mentioned and a deadline if mentioned), and **Open questions / blockers**. Be concise and only include what is actually stated — do not invent names or dates.', 'notes', 700) }),
      mkNode({ id: 'out', type: 'output', label: 'Action Items', x: 580, y: 180, config: outCfg('Action Items') }),
    ],
    [mkEdge('start', 'extract'), mkEdge('extract', 'out')],
  ),
];

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'ctr-admin-report',
    name: 'CTR Admin Report',
    description: 'Generate admin reports for Contractors Room — invoices, disputes, contractor stats, and platform metrics',
    icon: '🏗️',
    adminOnly: true,
    workflow: {
      name: 'CTR Admin Report',
      description: 'Analyse Contractors Room data and generate admin reports',
      isPublished: false,
      nodes: [
        {
          id: 'node_start',
          type: 'start',
          position: { x: 50, y: 200 },
          data: {
            nodeType: 'start',
            label: 'Admin Query',
            config: {
              label: 'Admin Query',
              inputVariables: [
                {
                  name: 'query',
                  description: 'What admin report do you need? (e.g. "pending invoices", "contractor activity", "dispute summary")',
                  defaultValue: 'weekly platform summary',
                },
              ],
            },
          },
        },
        {
          id: 'node_fetch',
          type: 'http',
          position: { x: 350, y: 100 },
          data: {
            nodeType: 'http',
            label: 'Fetch CTR Stats',
            config: {
              label: 'Fetch CTR Stats',
              url: 'http://localhost:8000/rest/v1/rpc/get_admin_stats',
              method: 'GET',
              headers: [
                { key: 'apikey', value: '{{SUPABASE_ANON_KEY}}' },
                { key: 'Authorization', value: 'Bearer {{SUPABASE_ANON_KEY}}' },
                { key: 'Accept', value: 'application/json' },
              ],
              body: '',
              timeout: 10000,
            },
          },
        },
        {
          id: 'node_invoices',
          type: 'http',
          position: { x: 350, y: 300 },
          data: {
            nodeType: 'http',
            label: 'Fetch Invoices',
            config: {
              label: 'Fetch Invoices',
              url: 'http://localhost:8000/rest/v1/documents?select=document_id,document_number,total,document_status_id,created_at&document_type_id=in.(3,14,15)&order=created_at.desc&limit=20',
              method: 'GET',
              headers: [
                { key: 'apikey', value: '{{SUPABASE_ANON_KEY}}' },
                { key: 'Authorization', value: 'Bearer {{SUPABASE_ANON_KEY}}' },
                { key: 'Accept-Profile', value: 'contractors_room' },
                { key: 'Accept', value: 'application/json' },
              ],
              body: '',
              timeout: 10000,
            },
          },
        },
        {
          id: 'node_combine',
          type: 'transform',
          position: { x: 650, y: 200 },
          data: {
            nodeType: 'transform',
            label: 'Combine Data',
            config: {
              label: 'Combine Data',
              operation: 'template',
              template: 'Admin Query: {{query}}\n\nPlatform Stats:\n{{node_fetch}}\n\nRecent Invoices:\n{{node_invoices}}',
            },
          },
        },
        {
          id: 'node_llm',
          type: 'llm',
          position: { x: 950, y: 200 },
          data: {
            nodeType: 'llm',
            label: 'Analyse & Report',
            config: {
              label: 'Analyse & Report',
              provider: 'openai',
              model: 'gpt-4o',
              systemPrompt: `You are the admin assistant for Contractors Room, a contractor marketplace platform.

You have access to live platform data. Analyse it and produce a clear, actionable admin report.

Key concepts:
- Document types: Timesheet (14), Invoice (3), Payment (4), Payout (15)
- Document statuses: Draft (52), Unpaid/Pending (53), Paid (54), Declined (55), Held (56), Released (57)
- Task statuses: Planned (1), Proposal (2), Active (3), Completed (4), Paused (5), Cancelled (6)
- Platform fee: 10% deducted from contractor payouts
- Currency: GBP (£)

Format your response with clear sections, counts, and any items needing attention (overdue, disputed, pending approval).`,
              temperature: 0.3,
              maxTokens: 2048,
              inputVariable: 'node_combine',
            },
          },
        },
        {
          id: 'node_output',
          type: 'output',
          position: { x: 1250, y: 200 },
          data: {
            nodeType: 'output',
            label: 'Admin Report',
            config: {
              label: 'Admin Report',
              displayName: 'CTR Admin Report',
              format: 'markdown',
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge_start_fetch',
          source: 'node_start',
          target: 'node_fetch',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
        {
          id: 'edge_start_invoices',
          source: 'node_start',
          target: 'node_invoices',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
        {
          id: 'edge_fetch_combine',
          source: 'node_fetch',
          target: 'node_combine',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
        {
          id: 'edge_invoices_combine',
          source: 'node_invoices',
          target: 'node_combine',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
        {
          id: 'edge_combine_llm',
          source: 'node_combine',
          target: 'node_llm',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
        {
          id: 'edge_llm_output',
          source: 'node_llm',
          target: 'node_output',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
      ],
    },
  },
  {
    id: 'ctr-contractor-screener',
    name: 'CTR Contractor Screener',
    description: 'Review a contractor profile and generate a suitability assessment for a project',
    icon: '👤',
    adminOnly: true,
    workflow: {
      name: 'CTR Contractor Screener',
      description: 'Assess contractor suitability for a specific project',
      isPublished: false,
      nodes: [
        {
          id: 'node_start',
          type: 'start',
          position: { x: 50, y: 200 },
          data: {
            nodeType: 'start',
            label: 'Screening Input',
            config: {
              label: 'Screening Input',
              inputVariables: [
                { name: 'contractor_id', description: 'Contractor company ID', defaultValue: '' },
                { name: 'project_description', description: 'Project requirements', defaultValue: '' },
              ],
            },
          },
        },
        {
          id: 'node_fetch_contractor',
          type: 'http',
          position: { x: 350, y: 200 },
          data: {
            nodeType: 'http',
            label: 'Fetch Contractor',
            config: {
              label: 'Fetch Contractor',
              url: 'http://localhost:8000/rest/v1/companies?select=name,description,is_verified,member_cvs(title,experience),member_qualifications(qualifications(name))&company_id=eq.{{contractor_id}}',
              method: 'GET',
              headers: [
                { key: 'apikey', value: '{{SUPABASE_ANON_KEY}}' },
                { key: 'Authorization', value: 'Bearer {{SUPABASE_ANON_KEY}}' },
                { key: 'Accept-Profile', value: 'contractors_room' },
                { key: 'Accept', value: 'application/json' },
              ],
              body: '',
              timeout: 10000,
            },
          },
        },
        {
          id: 'node_llm',
          type: 'llm',
          position: { x: 650, y: 200 },
          data: {
            nodeType: 'llm',
            label: 'Assess Fit',
            config: {
              label: 'Assess Fit',
              provider: 'openai',
              model: 'gpt-4o',
              systemPrompt: `You are a contractor screening assistant. Given a contractor profile and project requirements, provide:

1. **Match Score** (1-10)
2. **Strengths** — what makes this contractor a good fit
3. **Gaps** — missing skills or experience
4. **Recommendation** — hire, shortlist, or pass

Be concise and actionable.`,
              temperature: 0.4,
              maxTokens: 1024,
            },
          },
        },
        {
          id: 'node_output',
          type: 'output',
          position: { x: 950, y: 200 },
          data: {
            nodeType: 'output',
            label: 'Assessment',
            config: {
              label: 'Assessment',
              displayName: 'Contractor Assessment',
              format: 'markdown',
            },
          },
        },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'node_start',
          target: 'node_fetch_contractor',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
        {
          id: 'edge_2',
          source: 'node_fetch_contractor',
          target: 'node_llm',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
        {
          id: 'edge_3',
          source: 'node_llm',
          target: 'node_output',
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6b7280', strokeWidth: 2 },
        },
      ],
    },
  },
  ...COMPLEX_TEMPLATES,
];
