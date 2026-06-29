import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Server-side email-2FA gate.
 *
 * The old gate lived in client sessionStorage only, so navigating directly to
 * /chat after a password login skipped 2FA entirely. Now /api/auth/2fa/verify
 * sets an HMAC-signed httpOnly cookie on success, and proxy.ts refuses
 * protected pages for users with email-2FA enabled until that cookie is
 * present and valid.
 *
 * Cookie format: `<userId>.<expEpochSeconds>.<base64url hmac-sha256>`
 * Secret: derived from SUPABASE_SERVICE_ROLE_KEY (server-only). Without it the
 * cookie cannot be signed or verified, and enforcement degrades to off — the
 * same trust boundary as every other service-role feature.
 */

export const TWOFA_COOKIE_NAME = 'lucy_2fa';
export const TWOFA_COOKIE_TTL_SECONDS = 12 * 60 * 60;

export function getTwofaSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signTwofaCookie(userId: string, secret: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + TWOFA_COOKIE_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifyTwofaCookie(
  value: string | undefined,
  userId: string,
  secret: string,
  nowMs = Date.now()
): boolean {
  if (!value || !userId) return false;

  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;

  if (uid !== userId) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;

  const expected = hmac(`${uid}.${expStr}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
