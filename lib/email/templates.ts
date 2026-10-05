import { esc } from '@/lib/security/escape-html';

export interface CodeVars { firstName: string; code: string; expiresMinutes: number; }
export interface RenderedEmail { subject: string; html: string; text: string; }
export type TemplateKey = 'passwordReset' | 'twoFactorCode' | 'signupConfirm';

const wrap = (heading: string, body: string) => `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <div style="font-size:20px;font-weight:700;color:#7c3aed;margin-bottom:16px">Lucy</div>
  <h1 style="font-size:18px;margin:0 0 12px">${heading}</h1>
  ${body}
  <p style="font-size:12px;color:#888;margin-top:24px">If you didn't request this, you can ignore this email.</p>
</div>`;

// Everything interpolated into the HTML part is escaped (firstName comes from the user's profile / sign-up form).
const codeBlock = (code: string) =>
  `<div style="font-size:30px;letter-spacing:8px;font-weight:700;background:#f5f3ff;color:#5b21b6;
   padding:14px;border-radius:10px;text-align:center;margin:8px 0">${esc(code)}</div>`;

export function renderEmail(key: TemplateKey, vars: CodeVars): RenderedEmail {
  const { code, expiresMinutes } = vars;
  const firstName = vars.firstName; // plain text parts use it as is; HTML parts use `name` (escaped)
  const name = esc(firstName);
  const mins = esc(expiresMinutes);
  if (key === 'passwordReset') {
    return {
      subject: 'Reset your Lucy password',
      html: wrap('Reset your password',
        `<p>Hi ${name}, use this code to reset your password. It expires in ${mins} minutes.</p>${codeBlock(code)}`),
      text: `Hi ${firstName}, your Lucy password reset code is ${code} (expires in ${expiresMinutes} minutes).`,
    };
  }
  if (key === 'signupConfirm') {
    return {
      subject: 'Confirm your Lucy account',
      html: wrap('Confirm your email',
        `<p>Hi ${name}, welcome to Lucy! Use this code to confirm your email and activate your account. It expires in ${mins} minutes.</p>${codeBlock(code)}`),
      text: `Hi ${firstName}, welcome to Lucy! Your confirmation code is ${code} (expires in ${expiresMinutes} minutes).`,
    };
  }
  return {
    subject: 'Your Lucy verification code',
    html: wrap('Your verification code',
      `<p>Hi ${name}, here is your sign-in code. It expires in ${mins} minutes.</p>${codeBlock(code)}`),
    text: `Hi ${firstName}, your Lucy sign-in code is ${code} (expires in ${expiresMinutes} minutes).`,
  };
}
