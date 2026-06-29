/** CLI config: ~/.lucy/config.json, overridable via LUCY_URL / LUCY_API_KEY. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CliConfig {
  url: string;
  apiKey: string;
}

const CONFIG_DIR = join(homedir(), '.lucy');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export function loadConfig(): CliConfig {
  let fileCfg: Partial<CliConfig> = {};
  try {
    fileCfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<CliConfig>;
  } catch {
    /* no config file yet */
  }
  return {
    url: (process.env.LUCY_URL || fileCfg.url || 'http://localhost:3001').replace(/\/+$/, ''),
    apiKey: process.env.LUCY_API_KEY || fileCfg.apiKey || '',
  };
}

export function saveConfig(cfg: CliConfig): string {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return CONFIG_PATH;
}

// ─── Minimal ANSI styling (no deps) ─────────────────────────────────────────

const tty = process.stdout.isTTY;
const wrap = (open: string, close: string) => (s: string) => (tty ? `\x1b[${open}m${s}\x1b[${close}m` : s);

export const c = {
  bold: wrap('1', '22'),
  dim: wrap('2', '22'),
  purple: wrap('38;5;141', '39'),
  green: wrap('32', '39'),
  red: wrap('31', '39'),
  yellow: wrap('33', '39'),
};

export function fail(message: string): never {
  console.error(c.red(`✗ ${message}`));
  process.exit(1);
}
