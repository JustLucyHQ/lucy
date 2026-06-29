import { buildMemoryBlock } from '@/lib/memory/injector';
import type { MemoryRecord } from '@/lib/memory/types';

const mk = (over: Partial<MemoryRecord>): MemoryRecord => ({
  id: 'x', userId: 'u', type: 'semantic', content: 'c', importance: 5,
  visibility: 'private', source: 'extracted', accessCount: 0,
  createdAt: 1, updatedAt: 1, ...over,
});

describe('buildMemoryBlock', () => {
  it('returns empty string when nothing to inject', () => {
    expect(buildMemoryBlock(null, [])).toBe('');
  });
  it('includes a profile line when present', () => {
    const block = buildMemoryBlock({ data: { name: 'Johnny', role: 'founder' }, updatedAt: 1 }, []);
    expect(block).toContain('Who you are');
    expect(block).toContain('Johnny');
  });
  it('groups memories by type with headings', () => {
    const block = buildMemoryBlock(null, [
      mk({ type: 'semantic', content: 'Acme runs on Postgres' }),
      mk({ type: 'pragmatic', content: 'wants code first' }),
      mk({ type: 'episodic', content: 'shipped auth June 5' }),
    ]);
    expect(block).toContain('Acme runs on Postgres');
    expect(block).toContain('wants code first');
    expect(block).toContain('shipped auth June 5');
    expect(block).toContain('What Lucy knows');
  });
});
