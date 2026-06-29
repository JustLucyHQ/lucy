export type MemoryCommand =
  | { kind: 'remember'; text: string }
  | { kind: 'global'; text: string };

export function parseMemoryCommand(input: string): MemoryCommand | null {
  const m = input.match(/^\/(remember|global)\s+([\s\S]+)$/);
  if (!m) return null;
  const text = m[2].trim();
  if (!text) return null;
  return { kind: m[1] as 'remember' | 'global', text };
}
