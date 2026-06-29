import type { NextRequest } from 'next/server';

/**
 * Simple in-memory, per-IP sliding-window rate limiter (resets on server restart).
 * Namespaced so different endpoints keep independent buckets.
 */

const WINDOW_MS = 60_000;

interface Entry {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Map<string, Entry>>();

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function checkRateLimit(
  namespace: string,
  ip: string,
  max: number
): { limited: boolean; retryAfterSeconds: number } {
  let bucket = buckets.get(namespace);
  if (!bucket) {
    bucket = new Map();
    buckets.set(namespace, bucket);
  }
  const now = Date.now();
  const entry = bucket.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    bucket.set(ip, { count: 1, windowStart: now });
    return { limited: false, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > max) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000),
    };
  }
  return { limited: false, retryAfterSeconds: 0 };
}
