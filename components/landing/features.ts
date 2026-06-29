/** Shared content for both landing page versions (modern + corporate). */

import {
  Repeat, Workflow, HardDrive, Brain, Plug, Drama, Mic, Code2, ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const TAGLINE = 'Your AI, every provider, one platform.';

export const SUBLINE =
  'OpenAI, Claude, Gemini, or local models on your own machine — switch mid-chat. Lucy remembers what matters and plugs into your tools, with your keys encrypted and yours.';

export const GITHUB_URL = 'https://github.com/idubravac/LucyAI';

export const PROVIDERS = [
  'OpenAI', 'Claude', 'Gemini', 'Ollama', 'Mistral', 'Groq', 'DeepSeek',
];

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: Repeat,
    title: 'Switch models mid-conversation',
    body: 'Start in GPT, continue in Claude, finish in Gemini. Compare answers without losing the thread.',
  },
  {
    icon: Brain,
    title: 'Memory that persists',
    body: 'Lucy remembers facts, preferences, and decisions across conversations — and you control every byte.',
  },
  {
    icon: Plug,
    title: 'MCP connector marketplace',
    body: 'One-click connectors for GitHub, Slack, Notion, Postgres and more. Lucy calls real tools during chat.',
  },
  {
    icon: Workflow,
    title: 'Visual workflow builder',
    body: 'Drag-and-drop AI pipelines — branch, transform, call APIs — no code required.',
  },
  {
    icon: HardDrive,
    title: 'Local LLMs, full privacy',
    body: 'Run Ollama or LM Studio models on your own hardware. Nothing leaves your network.',
  },
  {
    icon: Drama,
    title: 'AI personas',
    body: 'Built-in and custom personas switch Lucy between coder, writer, analyst — one chip in the input bar.',
  },
  {
    icon: Mic,
    title: 'Voice in, voice out',
    body: 'Talk to Lucy and have replies read aloud — browser-native or Whisper and TTS via your own keys.',
  },
  {
    icon: Code2,
    title: 'Embed with one line',
    body: 'A single script tag puts Lucy inside any app you own — widget or full page.',
  },
  {
    icon: ShieldCheck,
    title: 'Open source, self-hosted',
    body: 'MIT-spirited and Docker-ready. Your keys, your data, your deployment. Free forever.',
  },
];

export const FOOTER_BADGES: [string, string][] = [
  ['All providers', 'One interface'],
  ['Run local', 'Your control'],
  ['Built for teams', 'Built for scale'],
  ['Open today', 'Unlimited tomorrow'],
];

export const BANNER = 'Your company. Your data. Nobody else’s business.';

export const BANNER_SUB =
  'Built for teams that want to test, compare, and ship AI — self-hosted, on infrastructure you control.';

/** The differentiator: a closed environment with a brain. */
export const MANIFESTO_HEADING = 'A closed environment, with a brain.';
export const MANIFESTO_SUB =
  'Most AI platforms are someone else’s cloud. Lucy is a sealed room inside your company — the models come to you.';

export interface Pillar {
  kicker: string;
  title: string;
  body: string;
}

export const PILLARS: Pillar[] = [
  {
    kicker: 'The brain',
    title: 'Memory that compounds',
    body: 'Lucy extracts decisions, preferences, and project context from every conversation — and recalls them when they matter. Stored in your database, governed by you, deletable on command. Your team stops repeating itself.',
  },
  {
    kicker: 'The walls',
    title: 'Sealed by design',
    body: 'Self-hosted, your API keys, per-user row-level security. Switch to a local model and sensitive data never leaves the building. No telemetry, no training on your chats, no third party in the room.',
  },
  {
    kicker: 'The doors',
    title: 'Opens where you decide',
    body: 'One script tag embeds Lucy in any app you own. Shared auth across your stack, a screening API for your backends, MCP connectors in both directions. The environment is closed — you hold the keys to every door.',
  },
];

/** Providers section. Monogram tiles use official-ish brand colors. */
export interface ProviderCard {
  name: string;
  models: string;
  kind: 'cloud' | 'local';
  /** Tile background */
  color: string;
  /** Tile glyph color (defaults to white) */
  fg?: string;
}

export const PROVIDER_CARDS: ProviderCard[] = [
  { name: 'OpenAI', models: 'GPT-4o · 4o-mini · o1', kind: 'cloud', color: '#10A37F' },
  { name: 'Anthropic', models: 'Claude Opus · Sonnet · Haiku', kind: 'cloud', color: '#D97757' },
  { name: 'Google', models: 'Gemini Pro · Flash', kind: 'cloud', color: '#4285F4' },
  { name: 'Ollama', models: 'Llama · Qwen · Mistral — your hardware', kind: 'local', color: '#F4F4F5', fg: '#111111' },
  { name: 'LM Studio', models: 'Any GGUF model, point and load', kind: 'local', color: '#6366F1' },
  { name: 'Groq', models: 'Ultra-fast LPU inference', kind: 'cloud', color: '#F55036' },
  { name: 'Mistral', models: 'Large · Codestral', kind: 'cloud', color: '#FF7000' },
  { name: 'DeepSeek', models: 'V3 · R1 reasoning', kind: 'cloud', color: '#4D6BFE' },
  { name: 'xAI', models: 'Grok', kind: 'cloud', color: '#18181B' },
  { name: 'OpenRouter', models: '200+ models via one key', kind: 'cloud', color: '#64748B' },
];

/** Marketplace section — connector tiles with brand colors. */
export interface ConnectorTile {
  name: string;
  color: string;
  fg?: string;
}

export const CONNECTOR_TILES: ConnectorTile[] = [
  { name: 'GitHub', color: '#24292F' },
  { name: 'Slack', color: '#4A154B' },
  { name: 'Notion', color: '#F4F4F5', fg: '#111111' },
  { name: 'Postgres', color: '#336791' },
  { name: 'Linear', color: '#5E6AD2' },
  { name: 'Stripe', color: '#635BFF' },
  { name: 'Brave Search', color: '#FB542B' },
  { name: 'Filesystem', color: '#52525B' },
  { name: 'Fetch', color: '#0EA5E9' },
  { name: 'Your own app', color: '#8B5CF6' },
];

export const MARKETPLACE_HEADING = 'Give Lucy hands';
export const MARKETPLACE_SUB =
  'Browse the connector marketplace, click install, and Lucy can read your repos, query your database, or post to Slack mid-conversation. Secrets are encrypted at rest, and every write action can require your approval first.';

/** Integration section. */
export const EMBED_SNIPPET =
  '<script src="https://lucy.your-company.com/api/embed?project=your-app" async></script>';

export const INTEGRATE_HEADING = 'Drops into any project';
export const INTEGRATE_POINTS: [string, string][] = [
  ['One-line embed', 'A floating Lucy widget inside any web app you own — no SDK, no build step.'],
  ['Shared auth', 'One Supabase auth across Lucy and your apps. Your users are already signed in.'],
  ['Business context', 'Register your tables and actions; Lucy answers with live data from your product.'],
  ['API + MCP server', 'Call Lucy from your backend with scoped API keys, or plug her into Claude Code and Cursor via MCP.'],
];
