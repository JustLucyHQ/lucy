import type { MemorySource, MemoryType } from './types';

export const HALF_LIFE_DAYS: Record<MemoryType, number> = {
  semantic: 60, // facts fade slowly
  episodic: 30, // events fade medium
  pragmatic: 10, // intent/state fades fast
};

export function sourceWeight(source: MemorySource): number {
  switch (source) {
    case 'admin':
      return 1.6;
    case 'user_global':
      return 1.4;
    case 'user_remember':
      return 1.2;
    default:
      return 1.0; // extracted
  }
}

/** base(1..10) × sourceWeight + salience bonus, clamped to 1..10. */
export function computeImportance(
  base: number,
  source: MemorySource,
  entitySalience = 0
): number {
  const raw = base * sourceWeight(source) + Math.min(entitySalience, 20) * 0.1;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

export interface RankedId {
  id: string;
  score: number;
}

/** Reciprocal Rank Fusion. k=60 per current best practice. Returns {id, score} best-first. */
export function reciprocalRankFusionScored(rankLists: string[][], k = 60): RankedId[] {
  const score = new Map<string, number>();
  for (const list of rankLists) {
    list.forEach((id, idx) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, s]) => ({ id, score: s }));
}

/** Reciprocal Rank Fusion. k=60 per current best practice. Returns ids best-first. */
export function reciprocalRankFusion(rankLists: string[][], k = 60): string[] {
  return reciprocalRankFusionScored(rankLists, k).map((r) => r.id);
}

/** Exponential decay of importance by half-life for the memory type. */
export function decayedImportance(
  importance: number,
  ageDays: number,
  type: MemoryType
): number {
  const halfLife = HALF_LIFE_DAYS[type];
  return importance * Math.pow(0.5, ageDays / halfLife);
}

export interface RankInput {
  base: number; // similarity or RRF score (0..1+)
  importance: number; // 1..10
  ageDays: number;
  accessCount: number;
}

/** Final ranking score: relevance × importance × recency, nudged by reinforcement. */
export function rankScore({ base, importance, ageDays, accessCount }: RankInput): number {
  const recency = Math.pow(0.5, ageDays / 30); // 30-day recency half-life
  const reinforcement = 1 + Math.min(accessCount, 10) * 0.03;
  return base * (importance / 10) * recency * reinforcement;
}
