import { mergeProfile, normalizeEntityName } from '@/lib/memory/profile';

describe('profile + entity helpers', () => {
  it('merges new fields without dropping existing ones', () => {
    const merged = mergeProfile({ name: 'Johnny', role: 'dev' }, { role: 'founder', company: 'Acme' });
    expect(merged).toEqual({ name: 'Johnny', role: 'founder', company: 'Acme' });
  });
  it('ignores null/empty patch values', () => {
    const merged = mergeProfile({ name: 'Johnny' }, { name: '', role: null as unknown as string });
    expect(merged).toEqual({ name: 'Johnny' });
  });
  it('normalizes entity names for dedup', () => {
    expect(normalizeEntityName('  Acme   Corp ')).toBe('acme corp');
    expect(normalizeEntityName('ACME corp')).toBe('acme corp');
  });
});
