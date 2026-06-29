import type { MemoryRecord, Profile } from './types';

const TYPE_LABEL: Record<string, string> = {
  semantic: 'Facts',
  pragmatic: 'Working style',
  episodic: 'Recently',
};

function profileLine(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

/** Build the system-prompt memory block: profile (always) + grouped collection. */
export function buildMemoryBlock(profile: Profile | null, memories: MemoryRecord[]): string {
  const sections: string[] = [];

  if (profile && Object.keys(profile.data).length > 0) {
    const line = profileLine(profile.data);
    if (line) sections.push(`## Who you are\n${line}`);
  }

  if (memories.length > 0) {
    const groups: Record<string, string[]> = { semantic: [], pragmatic: [], episodic: [] };
    for (const m of memories) groups[m.type]?.push(m.summary || m.content);
    const lines: string[] = [];
    for (const type of ['semantic', 'pragmatic', 'episodic'] as const) {
      if (groups[type].length > 0) {
        lines.push(`${TYPE_LABEL[type]}: ${groups[type].join(' · ')}`);
      }
    }
    if (lines.length > 0) sections.push(`## What Lucy knows\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
