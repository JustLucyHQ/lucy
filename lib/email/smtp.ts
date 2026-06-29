import nodemailer, { Transporter } from 'nodemailer';

let cached: { key: string; tx: Transporter } | null = null;

export interface SmtpConfig {
  host: string; port: number; secure: boolean; requireTLS: boolean;
  user: string; pass: string; fromName: string; fromEmail: string;
}

export function loadSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  // 'ssl' => secure:true (465); 'tls'/'none' => secure:false + STARTTLS (587). NEVER secure:true on 587.
  const mode = (process.env.SMTP_SECURE ?? 'tls').toLowerCase();
  const secure = mode === 'ssl';
  return {
    host, port, secure, requireTLS: !secure,
    user, pass,
    fromName: process.env.SMTP_FROM_NAME ?? 'Lucy',
    fromEmail: process.env.SMTP_FROM_EMAIL ?? user,
  };
}

/** Cached transport, or null when SMTP isn't configured (callers degrade gracefully). */
export function getTransport(): { tx: Transporter; cfg: SmtpConfig } | null {
  const cfg = loadSmtpConfig();
  if (!cfg) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      tx: nodemailer.createTransport({
        host: cfg.host, port: cfg.port, secure: cfg.secure, requireTLS: cfg.requireTLS,
        auth: { user: cfg.user, pass: cfg.pass },
      }),
    };
  }
  return { tx: cached.tx, cfg };
}
