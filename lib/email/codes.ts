// lib/email/codes.ts
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto';

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

export function hashCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const dk = scryptSync(code, salt, 32).toString('hex');
  return `${salt}:${dk}`;
}
export function checkCode(code: string, stored: string): boolean {
  const [salt, dk] = stored.split(':');
  if (!salt || !dk) return false;
  const a = Buffer.from(dk, 'hex');
  const b = scryptSync(code, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Purpose = 'reset' | '2fa' | 'signup';
export type Verdict = { ok: true } | { ok: false; reason: 'no_code' | 'expired' | 'too_many' | 'mismatch' };
export interface CodeRow { code_hash: string; attempts: number; expires_at: string; consumed_at: string | null; }

/** Pure verdict — DB-free, fully unit-tested. */
export function evaluateCode(row: CodeRow | null, code: string, nowMs: number): Verdict {
  if (!row || row.consumed_at) return { ok: false, reason: 'no_code' };
  if (Date.parse(row.expires_at) < nowMs) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many' };
  if (!checkCode(code, row.code_hash)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** DB ops use the service-role client (SupabaseClient with the lucy schema). */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createCode(
  client: SupabaseClient<any, any, any>, userId: string, email: string, purpose: Purpose
): Promise<string> {
  const code = generateCode();
  const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();
  await client.from('email_verification_codes').insert({
    user_id: userId, email, code_hash: hashCode(code), purpose, expires_at: expires,
  });
  return code;
}

export async function confirmCode(
  client: SupabaseClient<any, any, any>, userId: string, code: string, purpose: Purpose
): Promise<Verdict> {
  const { data } = await client
    .from('email_verification_codes')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', userId).eq('purpose', purpose).is('consumed_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const verdict = evaluateCode((data as CodeRow) ?? null, code, Date.now());
  if (!data) return verdict;
  if (verdict.ok) {
    await client.from('email_verification_codes').update({ consumed_at: new Date().toISOString() }).eq('id', (data as any).id);
  } else if (verdict.reason === 'mismatch') {
    await client.from('email_verification_codes').update({ attempts: (data as any).attempts + 1 }).eq('id', (data as any).id);
  }
  return verdict;
}
