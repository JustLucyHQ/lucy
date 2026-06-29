/** Field-level merge: patch wins, but null/empty values are ignored (never erase). */
export function mergeProfile(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

export function normalizeEntityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
