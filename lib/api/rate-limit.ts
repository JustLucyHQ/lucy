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
  // nginx sets X-Real-IP unconditionally from $remote_addr (a single value it
  // always overwrites, never appends to) — trust it first. X-Forwarded-For is
  // appended-to via $proxy_add_x_forwarded_for rather than replaced, so a client
  // can prepend a fake IP; nginx's own view ends up LAST in the list, not first.
  return (
    req.headers.get('x-real-ip')?.trim() ??
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ??
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
