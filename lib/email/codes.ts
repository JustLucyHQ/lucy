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

/** How many of the newest open codes are accepted — e-mails can arrive out of order or a page can ask twice,
 * so the code someone reads is not always the newest one they were sent. */
export const ACCEPT_RECENT_CODES = 3;

/**
 * Pure: check `code` against the newest few open codes (newest first). OK when any usable one matches;
 * otherwise the verdict of the newest code (so "expired" / "too many" still read right).
 */
export function evaluateRecent(rows: CodeRow[], code: string, nowMs: number): { verdict: Verdict; matchIndex: number } {
  const open = rows.filter((r) => !r.consumed_at).slice(0, ACCEPT_RECENT_CODES);
  for (let i = 0; i < open.length; i++) {
    if (evaluateCode(open[i], code, nowMs).ok) return { verdict: { ok: true }, matchIndex: rows.indexOf(open[i]) };
  }
  return { verdict: evaluateCode(open[0] ?? null, code, nowMs), matchIndex: -1 };
}

export async function confirmCode(
  client: SupabaseClient<any, any, any>, userId: string, code: string, purpose: Purpose
): Promise<Verdict> {
  const { data } = await client
    .from('email_verification_codes')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', userId).eq('purpose', purpose).is('consumed_at', null)
    .order('created_at', { ascending: false }).limit(ACCEPT_RECENT_CODES);
  const rows = ((data ?? []) as (CodeRow & { id: string })[]);
  const { verdict } = evaluateRecent(rows, code, Date.now());
  if (!rows.length) return verdict;
  if (verdict.ok) {
    // Used: close this code AND every other open one for the purpose, so none of them works twice.
    await client.from('email_verification_codes').update({ consumed_at: new Date().toISOString() })
      .eq('user_id', userId).eq('purpose', purpose).is('consumed_at', null);
  } else if (verdict.reason === 'mismatch') {
    // A wrong guess counts against EVERY open code, so accepting the last few never adds guesses.
    for (const r of rows.slice(0, ACCEPT_RECENT_CODES)) {
      await client.from('email_verification_codes').update({ attempts: r.attempts + 1 }).eq('id', r.id);
    }
  }
  return verdict;
}

/** The newest still-open code for (user, purpose) — lets "send me a code" avoid sending a second one. */
export async function newestOpenCode(
  client: SupabaseClient<any, any, any>, userId: string, purpose: Purpose,
): Promise<{ created_at: string; expires_at: string } | null> {
  const { data } = await client
    .from('email_verification_codes')
    .select('created_at, expires_at')
    .eq('user_id', userId).eq('purpose', purpose).is('consumed_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as { created_at: string; expires_at: string } | null) ?? null;
}
