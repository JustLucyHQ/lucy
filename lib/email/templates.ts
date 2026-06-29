export interface CodeVars { firstName: string; code: string; expiresMinutes: number; }
export interface RenderedEmail { subject: string; html: string; text: string; }
export type TemplateKey = 'passwordReset' | 'twoFactorCode';

const wrap = (heading: string, body: string) => `
<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <div style="font-size:20px;font-weight:700;color:#7c3aed;margin-bottom:16px">Lucy</div>
  <h1 style="font-size:18px;margin:0 0 12px">${heading}</h1>
  ${body}
  <p style="font-size:12px;color:#888;margin-top:24px">If you didn't request this, you can ignore this email.</p>
</div>`;

const codeBlock = (code: string) =>
  `<div style="font-size:30px;letter-spacing:8px;font-weight:700;background:#f5f3ff;color:#5b21b6;
   padding:14px;border-radius:10px;text-align:center;margin:8px 0">${code}</div>`;

export function renderEmail(key: TemplateKey, vars: CodeVars): RenderedEmail {
  const { firstName, code, expiresMinutes } = vars;
  if (key === 'passwordReset') {
    return {
      subject: 'Reset your Lucy password',
      html: wrap('Reset your password',
        `<p>Hi ${firstName}, use this code to reset your password. It expires in ${expiresMinutes} minutes.</p>${codeBlock(code)}`),
      text: `Hi ${firstName}, your Lucy password reset code is ${code} (expires in ${expiresMinutes} minutes).`,
    };
  }
  return {
    subject: 'Your Lucy verification code',
    html: wrap('Your verification code',
      `<p>Hi ${firstName}, here is your sign-in code. It expires in ${expiresMinutes} minutes.</p>${codeBlock(code)}`),
    text: `Hi ${firstName}, your Lucy sign-in code is ${code} (expires in ${expiresMinutes} minutes).`,
  };
}
