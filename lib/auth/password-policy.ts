// lib/auth/password-policy.ts — the one password rule, used wherever a password is SET (sign-up, reset,
// change password); never at sign-in, so an older password keeps working. Same rule as Bizinly
// (@bizinly/account pure/password-policy, Ivan 2026-09-28): at least 12 characters, a digit, an upper-
// and a lower-case letter and a special character. Pure — safe in the browser and on the server.

export type PasswordRuleFailure = 'length' | 'digit' | 'upper' | 'lower' | 'special';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

// Unicode-aware, so Č/č, Ć/ć, Đ/đ, Š/š, Ž/ž count as upper/lower-case letters. (Built with RegExp() because
// the TS target here predates regex literal `u` flags; every runtime Lucy runs on supports them.)
const DIGIT_RE = new RegExp('\\p{Nd}', 'u');
const UPPER_RE = new RegExp('\\p{Lu}', 'u');
const LOWER_RE = new RegExp('\\p{Ll}', 'u');
const SPECIAL_RE = new RegExp('[^\\p{L}\\p{Nd}]', 'u');

export const PASSWORD_RULES: { key: PasswordRuleFailure; label: string }[] = [
  { key: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters` },
  { key: 'digit', label: 'A number' },
  { key: 'upper', label: 'An upper-case letter' },
  { key: 'lower', label: 'A lower-case letter' },
  { key: 'special', label: 'A special character' },
];

export const PASSWORD_HINT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with a number, an upper- and a lower-case letter and a special character.`;

/** Every unmet rule (not just the first), so a form can tick them off as the person types. */
export function checkPassword(pw: unknown): { ok: boolean; failed: PasswordRuleFailure[] } {
  const v = typeof pw === 'string' ? pw : '';
  const failed: PasswordRuleFailure[] = [];
  if (typeof pw !== 'string' || v.length < PASSWORD_MIN_LENGTH || v.length > PASSWORD_MAX_LENGTH) failed.push('length');
  if (!DIGIT_RE.test(v)) failed.push('digit');
  if (!UPPER_RE.test(v)) failed.push('upper');
  if (!LOWER_RE.test(v)) failed.push('lower');
  if (!SPECIAL_RE.test(v)) failed.push('special');
  return { ok: failed.length === 0, failed };
}
