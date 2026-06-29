/** Rich terminal UI helpers for the Lucy CLI — banner, boxes, spinner. No deps. */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { c } from './config';

const tty = process.stdout.isTTY;
const wrap = (open: string, close: string) => (s: string) => (tty ? `\x1b[${open}m${s}\x1b[${close}m` : s);

// Extra palette on top of config's `c`.
export const cyan = wrap('38;5;80', '39');
export const gray = wrap('38;5;245', '39');

export let VERSION = '0.1.0';
try {
  const dir = dirname(fileURLToPath(import.meta.url));
  VERSION = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8')).version || VERSION;
} catch {
  /* keep default */
}

const ANSI = /\x1b\[[0-9;]*m/g;
/** Visible length of a string, ignoring ANSI escape codes. */
const vlen = (s: string): number => s.replace(ANSI, '').length;

const LOGO = [
  ' ██╗     ██╗   ██╗ ██████╗██╗   ██╗',
  ' ██║     ██║   ██║██╔════╝╚██╗ ██╔╝',
  ' ██║     ██║   ██║██║      ╚████╔╝ ',
  ' ██║     ██║   ██║██║       ╚██╔╝  ',
  ' ███████╗╚██████╔╝╚██████╗   ██║   ',
  ' ╚══════╝ ╚═════╝  ╚═════╝   ╚═╝   ',
];

export function logo(): string {
  return LOGO.map((l) => c.purple(l)).join('\n');
}

/** A rounded box around content lines; border dimmed, content as-passed. */
export function box(lines: string[]): string {
  const w = Math.max(...lines.map(vlen));
  const bar = '─'.repeat(w + 2);
  const out = [c.dim(`╭${bar}╮`)];
  for (const l of lines) out.push(c.dim('│ ') + l + ' '.repeat(w - vlen(l)) + c.dim(' │'));
  out.push(c.dim(`╰${bar}╯`));
  return out.join('\n');
}

/** Full welcome splash: logo + tagline + version + optional server. */
export function welcome(server?: string): string {
  const parts = [
    '',
    logo(),
    '  ' + c.bold('your AI, in your terminal') + c.dim(`  ·  v${VERSION}`),
  ];
  if (server) parts.push('  ' + gray('connected  ') + cyan(server));
  parts.push('');
  return parts.join('\n');
}

/** A braille spinner with a label; no-op when not a TTY. Returns { stop() }. */
export function spinner(label = 'thinking'): { stop: () => void } {
  if (!tty) return { stop() {} };
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let active = true;
  process.stdout.write('\x1b[?25l'); // hide cursor
  const timer = setInterval(() => {
    process.stdout.write(`\r${c.purple(frames[i++ % frames.length])} ${c.dim(label + '…')}`);
  }, 80);
  // Don't keep the event loop alive on the spinner alone.
  if (typeof timer.unref === 'function') timer.unref();

  const cleanup = () => {
    if (!active) return;
    active = false;
    clearInterval(timer);
    process.stdout.write('\r\x1b[K\x1b[?25h'); // clear line + restore cursor
  };
  // Clear the interval even if the process exits mid-spin (e.g. an error path
  // that calls process.exit) — otherwise libuv asserts on the dangling async
  // handle on Windows (UV_HANDLE_CLOSING in async.c).
  process.once('exit', cleanup);

  return {
    stop() {
      cleanup();
      process.removeListener('exit', cleanup);
    },
  };
}
