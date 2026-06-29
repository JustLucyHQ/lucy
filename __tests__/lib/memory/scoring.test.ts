import {
  sourceWeight, computeImportance, reciprocalRankFusion, reciprocalRankFusionScored,
  decayedImportance, rankScore, HALF_LIFE_DAYS,
} from '@/lib/memory/scoring';

describe('scoring', () => {
  it('orders source weights admin > user_global > user_remember > extracted', () => {
    expect(sourceWeight('admin')).toBeGreaterThan(sourceWeight('user_global'));
    expect(sourceWeight('user_global')).toBeGreaterThan(sourceWeight('user_remember'));
    expect(sourceWeight('user_remember')).toBeGreaterThan(sourceWeight('extracted'));
  });

  it('clamps computed importance to 1..10', () => {
    expect(computeImportance(10, 'admin', 50)).toBe(10);
    expect(computeImportance(1, 'extracted', 0)).toBeGreaterThanOrEqual(1);
  });

  it('RRF fuses two rank lists, rewarding items ranked high in both', () => {
    // 'b' is rank 1 in BOTH lists -> unambiguous winner; 'd' only appears in list 2.
    const fused = reciprocalRankFusion([['b', 'a', 'c'], ['b', 'a', 'd']]);
    expect(fused[0]).toBe('b');
    expect(fused).toContain('d');
  });

  it('scored RRF returns descending scores, ids match the unscored variant', () => {
    const lists = [['b', 'a', 'c'], ['b', 'a', 'd']];
    const scored = reciprocalRankFusionScored(lists);
    expect(scored[0].id).toBe('b');
    expect(scored[0].score).toBeGreaterThan(scored[1].score);
    expect(scored.map((s) => s.id)).toEqual(reciprocalRankFusion(lists));
  });

  it('decays importance toward zero over time', () => {
    const fresh = decayedImportance(8, 0, 'semantic');
    const old = decayedImportance(8, HALF_LIFE_DAYS.semantic, 'semantic');
    expect(old).toBeCloseTo(fresh / 2, 1);
  });

  it('pragmatic decays faster than semantic', () => {
    const days = 10;
    const sem = decayedImportance(8, days, 'semantic');
    const prag = decayedImportance(8, days, 'pragmatic');
    expect(prag).toBeLessThan(sem);
  });

  it('rankScore boosts recent + important + frequently accessed', () => {
    const hi = rankScore({ base: 1, importance: 9, ageDays: 0, accessCount: 5 });
    const lo = rankScore({ base: 1, importance: 2, ageDays: 60, accessCount: 0 });
    expect(hi).toBeGreaterThan(lo);
  });
});
