import { ExtractionResultSchema, type MemoryRecord } from '@/lib/memory/types';

describe('memory types', () => {
  it('parses a valid extraction result', () => {
    const parsed = ExtractionResultSchema.parse({
      memories: [
        { op: 'ADD', type: 'semantic', content: 'User prefers TypeScript', importance: 7 },
      ],
      entities: [{ name: 'Acme Corp', type: 'client' }],
      profilePatch: { role: 'founder' },
    });
    expect(parsed.memories[0].op).toBe('ADD');
    expect(parsed.entities[0].name).toBe('Acme Corp');
  });

  it('rejects an invalid memory type', () => {
    expect(() =>
      ExtractionResultSchema.parse({
        memories: [{ op: 'ADD', type: 'nonsense', content: 'x', importance: 5 }],
        entities: [],
        profilePatch: {},
      })
    ).toThrow();
  });

  it('defaults entities and profilePatch when omitted', () => {
    const parsed = ExtractionResultSchema.parse({ memories: [] });
    expect(parsed.entities).toEqual([]);
    expect(parsed.profilePatch).toEqual({});
  });

  it('MemoryRecord type is structurally usable', () => {
    const rec: MemoryRecord = {
      id: '1', userId: 'u', type: 'semantic', content: 'c', importance: 5,
      visibility: 'private', source: 'extracted', accessCount: 0,
      createdAt: 1, updatedAt: 1,
    };
    expect(rec.type).toBe('semantic');
  });
});
