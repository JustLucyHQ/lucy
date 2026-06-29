import { extractMemories } from '@/lib/memory/extractor';
import type { ChatMessage } from '@/lib/providers/types';

const convo: ChatMessage[] = [
  { role: 'user', content: 'I prefer TypeScript. Our client Acme uses Postgres.' },
  { role: 'assistant', content: 'Noted!' },
];

describe('extractMemories', () => {
  it('parses a valid LLM JSON response and applies privacy guard', async () => {
    const llm = jest.fn().mockResolvedValue(JSON.stringify({
      memories: [
        { op: 'ADD', type: 'semantic', content: 'User prefers TypeScript', importance: 7 },
        { op: 'ADD', type: 'semantic', content: 'API key is sk-abcdef0123456789abcdef0123456789', importance: 9 },
      ],
      entities: [{ name: 'Acme', type: 'client' }],
      profilePatch: { preferred_language: 'TypeScript' },
    }));
    const result = await extractMemories(convo, [], llm);
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toContain('TypeScript');
    expect(result.entities[0].name).toBe('Acme');
    expect(result.profilePatch.preferred_language).toBe('TypeScript');
  });

  it('returns an empty result when the LLM returns garbage', async () => {
    const llm = jest.fn().mockResolvedValue('not json at all');
    const result = await extractMemories(convo, [], llm);
    expect(result.memories).toEqual([]);
    expect(result.entities).toEqual([]);
  });

  it('tolerates JSON wrapped in markdown fences', async () => {
    const llm = jest.fn().mockResolvedValue('```json\n{"memories":[],"entities":[],"profilePatch":{}}\n```');
    const result = await extractMemories(convo, [], llm);
    expect(result.memories).toEqual([]);
  });
});
