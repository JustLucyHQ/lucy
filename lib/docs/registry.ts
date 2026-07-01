/**
 * Knowledge-base registry: navigation structure for /docs.
 * Content lives as markdown in docs/kb/<file> (also readable on GitHub).
 */

export interface DocPage {
  slug: string;
  title: string;
  /** One-sentence, SEO-facing summary — used as the page's <meta description>. */
  description: string;
  /** Path relative to docs/kb/ */
  file: string;
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    title: 'Getting started',
    pages: [
      { slug: 'introduction', title: 'Introduction', description: 'What Lucy is, how it works, and why it keeps every byte of your data under your own keys.', file: 'getting-started/introduction.md' },
      { slug: 'quick-start', title: 'Quick start', description: 'Get Lucy running in minutes — pick standalone (local, zero setup) or connected (Supabase) mode.', file: 'getting-started/quick-start.md' },
      { slug: 'desktop', title: 'Desktop app', description: 'Download and run the Lucy desktop app — a local-first, standalone AI client for Windows, macOS, and Linux.', file: 'getting-started/desktop.md' },
    ],
  },
  {
    title: 'Using Lucy',
    pages: [
      { slug: 'chat', title: 'Chat & models', description: 'Switch between OpenAI, Claude, Gemini, and local models mid-conversation, with streaming responses and full history.', file: 'guides/chat.md' },
      { slug: 'memory', title: 'Memory', description: "How Lucy remembers your facts, preferences, and past conversations across sessions using hybrid semantic search.", file: 'guides/memory.md' },
      { slug: 'personas', title: 'Personas', description: 'Create and switch between custom AI personas, each with its own system prompt and behavior.', file: 'guides/personas.md' },
      { slug: 'connectors', title: 'Connectors', description: 'Browse and install MCP connectors so Lucy can use your tools — GitHub, Slack, Google, Notion, and more.', file: 'guides/connectors.md' },
      { slug: 'workflows', title: 'Workflows', description: 'Build multi-step AI automations on a visual drag-and-drop canvas, with schedules, webhooks, and retries.', file: 'guides/workflows.md' },
      { slug: 'voice', title: 'Voice', description: "Talk to Lucy and have her talk back, using browser, cloud, or local voice providers.", file: 'guides/voice.md' },
      { slug: 'security', title: 'Security & 2FA', description: 'Two-factor authentication, device sessions, and account security settings for your Lucy account.', file: 'guides/security.md' },
      { slug: 'themes-account', title: 'Themes & account', description: "Customize Lucy's appearance and manage your account profile and preferences.", file: 'guides/themes-account.md' },
    ],
  },
  {
    title: 'Developers',
    pages: [
      { slug: 'architecture', title: 'Architecture', description: "How Lucy is built — app structure, storage layer, provider abstraction, and the standalone/connected split.", file: 'developers/architecture.md' },
      { slug: 'self-hosting', title: 'Self-hosting', description: 'Deploy Lucy on your own infrastructure with Docker and Supabase, with full control over your data.', file: 'developers/self-hosting.md' },
      { slug: 'embedding', title: 'Embedding Lucy', description: 'Embed a Lucy-powered chat widget on your website with a single script tag.', file: 'developers/embedding.md' },
      { slug: 'api', title: 'HTTP API', description: "Lucy's HTTP API reference for chat, memory, and workflow automation from outside the app.", file: 'developers/api.md' },
      { slug: 'cli', title: 'CLI', description: 'Use the Lucy command-line client to chat and script Lucy from your terminal.', file: 'developers/cli.md' },
      { slug: 'mcp-server', title: 'MCP server', description: "Run Lucy's own MCP server so other AI tools and agents can use your memory and workflows.", file: 'developers/mcp-server.md' },
      { slug: 'contributing', title: 'Contributing', description: 'How to set up Lucy locally, the quality gates every PR must pass, and where things live in the codebase.', file: 'developers/contributing.md' },
    ],
  },
];

export const ALL_PAGES: DocPage[] = DOC_SECTIONS.flatMap((s) => s.pages);

export function getPage(slug: string | undefined): DocPage | null {
  if (!slug) return ALL_PAGES[0];
  return ALL_PAGES.find((p) => p.slug === slug) ?? null;
}

/** Previous/next pages for footer navigation. */
export function getAdjacent(slug: string): { prev: DocPage | null; next: DocPage | null } {
  const i = ALL_PAGES.findIndex((p) => p.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: ALL_PAGES[i - 1] ?? null, next: ALL_PAGES[i + 1] ?? null };
}
