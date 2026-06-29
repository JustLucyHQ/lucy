/** Minimal Markdown → ANSI renderer for the CLI (dep-free, TTY-aware). */
import { c } from './config';
import { cyan } from './ui';

const tty = process.stdout.isTTY;
const italic = (s: string) => (tty ? `\x1b[3m${s}\x1b[23m` : s);
const underline = (s: string) => (tty ? `\x1b[4m${s}\x1b[24m` : s);

/** Inline spans: links, bold, inline code, italic. */
function inline(s: string): string {
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `${underline(t)} ${c.dim(u)}`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, t) => c.bold(t));
  s = s.replace(/`([^`]+)`/g, (_m, t) => cyan(t));
  s = s.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, (_m, t) => italic(t));
  s = s.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, (_m, t) => italic(t));
  return s;
}

/**
 * Render a Markdown string to ANSI. When not a TTY, returns the source
 * unchanged so piped output stays plain and faithful.
 */
export function renderMarkdown(src: string): string {
  if (!tty) return src;

  const lines = src.split('\n');
  const out: string[] = [];
  let inCode = false;

  for (const raw of lines) {
    const fence = raw.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      if (!inCode) {
        inCode = true;
        const lang = fence[1] || 'code';
        out.push(c.dim(`╭─ ${lang} ` + '─'.repeat(Math.max(0, 40 - lang.length))));
      } else {
        inCode = false;
        out.push(c.dim('╰' + '─'.repeat(44)));
      }
      continue;
    }
    if (inCode) {
      out.push(c.dim('│ ') + cyan(raw));
      continue;
    }

    const h = raw.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const txt = inline(h[2]);
      out.push(h[1].length === 1 ? c.bold(c.purple(txt)) : h[1].length === 2 ? c.bold(txt) : c.bold(c.dim(txt)));
      continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(raw)) {
      out.push(c.dim('─'.repeat(44)));
      continue;
    }
    const bq = raw.match(/^\s*>\s?(.*)$/);
    if (bq) {
      out.push(c.dim('▏ ' + inline(bq[1])));
      continue;
    }
    const bul = raw.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bul) {
      out.push(`${bul[1]}${c.purple('•')} ${inline(bul[2])}`);
      continue;
    }
    const num = raw.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (num) {
      out.push(`${num[1]}${c.purple(num[2] + '.')} ${inline(num[3])}`);
      continue;
    }

    out.push(inline(raw));
  }
  return out.join('\n');
}
