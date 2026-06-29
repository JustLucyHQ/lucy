// lib/workflow/backoff.ts
/** Exponential backoff (10s, 20s, 40s, … capped at 5 min) for run retries. */
const BASE_MS = 10_000;
const CAP_MS = 300_000;

export function nextBackoffMs(attempt: number): number {
  const n = Math.max(1, attempt);
  return Math.min(BASE_MS * 2 ** (n - 1), CAP_MS);
}
