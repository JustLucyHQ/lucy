/**
 * Knowledge-base registry: navigation structure for /docs.
 * Content lives as markdown in docs/kb/<file> (also readable on GitHub).
 */

export interface DocPage {
  slug: string;
  title: string;
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
      { slug: 'introduction', title: 'Introduction', file: 'getting-started/introduction.md' },
      { slug: 'quick-start', title: 'Quick start', file: 'getting-started/quick-start.md' },
      { slug: 'desktop', title: 'Desktop app', file: 'getting-started/desktop.md' },
    ],
  },
  {
    title: 'Using Lucy',
    pages: [
      { slug: 'chat', title: 'Chat & models', file: 'guides/chat.md' },
      { slug: 'memory', title: 'Memory', file: 'guides/memory.md' },
      { slug: 'personas', title: 'Personas', file: 'guides/personas.md' },
      { slug: 'connectors', title: 'Connectors', file: 'guides/connectors.md' },
      { slug: 'workflows', title: 'Workflows', file: 'guides/workflows.md' },
      { slug: 'voice', title: 'Voice', file: 'guides/voice.md' },
      { slug: 'security', title: 'Security & 2FA', file: 'guides/security.md' },
      { slug: 'themes-account', title: 'Themes & account', file: 'guides/themes-account.md' },
    ],
  },
  {
    title: 'Developers',
    pages: [
      { slug: 'architecture', title: 'Architecture', file: 'developers/architecture.md' },
      { slug: 'self-hosting', title: 'Self-hosting', file: 'developers/self-hosting.md' },
      { slug: 'embedding', title: 'Embedding Lucy', file: 'developers/embedding.md' },
      { slug: 'api', title: 'HTTP API', file: 'developers/api.md' },
      { slug: 'cli', title: 'CLI', file: 'developers/cli.md' },
      { slug: 'mcp-server', title: 'MCP server', file: 'developers/mcp-server.md' },
      { slug: 'contributing', title: 'Contributing', file: 'developers/contributing.md' },
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
