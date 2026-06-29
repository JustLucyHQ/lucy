// lib/mcp/tool-format.ts
export const NAMESPACE_SEP = '__';

export interface LoadedTool {
  slug: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export const qualified = (t: LoadedTool): string => `${t.slug}${NAMESPACE_SEP}${t.name}`;

/** Split "slug__tool" → { slug, tool }. Slugs MUST NOT contain the separator (catalog slugs are dash-cased). */
export function parseQualified(q: string): { slug: string; name: string } {
  const i = q.indexOf(NAMESPACE_SEP);
  if (i === -1) return { slug: '', name: q };          // no separator → treat whole as name (lookup will 404 safely)
  return { slug: q.slice(0, i), name: q.slice(i + NAMESPACE_SEP.length) };
}

export function toOpenAITools(tools: LoadedTool[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: qualified(t),
      description: t.description ?? '',
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

export function toAnthropicTools(tools: LoadedTool[]) {
  return tools.map((t) => ({
    name: qualified(t),
    description: t.description ?? '',
    input_schema: t.inputSchema ?? { type: 'object', properties: {} },
  }));
}
