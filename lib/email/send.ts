import { getTransport } from './smtp';
import { renderEmail, TemplateKey, CodeVars } from './templates';

/** Returns true if sent. Never throws — callers (e.g. reset request) must not leak failures. */
export async function sendTemplateEmail(to: string, key: TemplateKey, vars: CodeVars): Promise<boolean> {
  const t = getTransport();
  if (!t) { console.warn('[email] SMTP not configured; skipping send'); return false; }
  try {
    const { subject, html, text } = renderEmail(key, vars);
    await t.tx.sendMail({ from: `"${t.cfg.fromName}" <${t.cfg.fromEmail}>`, to, subject, html, text });
    return true;
  } catch (e) {
    console.error('[email] send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Send a raw (non-template) email. Throws if SMTP is not configured or the send fails. */
export async function sendRawEmail(to: string, subject: string, body: string): Promise<void> {
  const t = getTransport();
  if (!t) throw new Error('SMTP is not configured');
  await t.tx.sendMail({ from: `"${t.cfg.fromName}" <${t.cfg.fromEmail}>`, to, subject, text: body });
}
