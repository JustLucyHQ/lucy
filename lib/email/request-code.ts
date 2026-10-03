// lib/email/request-code.ts — "send me a code" for sign-up confirmation and e-mail 2FA.
// The pages used to send a fresh code every time they opened (twice in dev) while confirm accepted only the
// newest one, so the code in the inbox was "invalid". Now: opening a page sends a code only when no valid one
// is out; "Resend" sends a new one after a cooldown; two calls at the same moment send one code.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCode, newestOpenCode, CODE_TTL_MINUTES, type Purpose } from './codes';
import { sendTemplateEmail } from './send';
import { checkRateLimit } from '@/lib/api/rate-limit';
import type { TemplateKey } from './templates';

/** "Resend" is refused for this long after the last code went out. */
export const RESEND_COOLDOWN_MS = 30_000;
const SAME_MOMENT_MS = 5_000;
const RATE_LIMIT_MAX = 5;
const lastSent: Map<string, number> =
  ((globalThis as { __lucyCodeSent?: Map<string, number> }).__lucyCodeSent ??= new Map());

export type CodeRequestResult = { ok: true; sent: boolean; email: string; retryInSec?: number };

export async function requestEmailCode(
  svc: SupabaseClient<any, any, any>,
  userId: string,
  email: string,
  purpose: Exclude<Purpose, 'reset'>,
  template: TemplateKey,
  resend: boolean,
): Promise<CodeRequestResult> {
  const now = Date.now();
  const open = await newestOpenCode(svc, userId, purpose);
  if (open && Date.parse(open.expires_at) > now) {
    const age = now - Date.parse(open.created_at);
    if (!resend) return { ok: true, sent: false, email };
    if (age < RESEND_COOLDOWN_MS) return { ok: true, sent: false, email, retryInSec: Math.ceil((RESEND_COOLDOWN_MS - age) / 1000) };
  }
  const k = `${purpose}:${userId}`;
  const prev = lastSent.get(k);
  if (prev && now - prev < SAME_MOMENT_MS) return { ok: true, sent: false, email };
  lastSent.set(k, now);

  // anti e-mail-bombing, keyed by user (these routes are session-gated)
  const { limited } = checkRateLimit(`${purpose}-request`, userId, RATE_LIMIT_MAX);
  if (limited) return { ok: true, sent: false, email };

  const code = await createCode(svc, userId, email, purpose);
  await sendTemplateEmail(email, template, { firstName: email.split('@')[0], code, expiresMinutes: CODE_TTL_MINUTES });
  return { ok: true, sent: true, email };
}
