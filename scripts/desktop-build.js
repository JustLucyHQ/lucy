#!/usr/bin/env node
/*
 * Build the standalone / desktop Next bundle with ZERO cloud config baked in.
 *
 * `next build` inlines `process.env.NEXT_PUBLIC_*` at build time. Two things made
 * the old `cross-env NEXT_PUBLIC_SUPABASE_URL= next build` leak a live backend
 * into the "standalone" desktop app:
 *   1. `cross-env VAR=` leaves the var *undefined* on some shells (not ""), and
 *   2. Next's @next/env then fills it from `.env.local` / `.env.production`.
 * Result: the installed desktop app connected to a real Supabase instead of
 * running local-first.
 *
 * This script guarantees standalone two ways (belt + suspenders):
 *   - hides every auto-loaded .env file for the duration of the build, and
 *   - sets each cloud/analytics var to an explicit empty string (empty-but-
 *     defined wins, because @next/env only fills vars that are `undefined`).
 * The .env files are restored afterwards no matter what.
 */
const { spawnSync } = require('node:child_process');
const { existsSync, renameSync } = require('node:fs');

const ENV_FILES = ['.env.local', '.env.production', '.env.development.local', '.env'];
const CLEAR = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_INTERNAL_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_GA_ID',
];

const hidden = [];
for (const f of ENV_FILES) {
  if (existsSync(f)) {
    renameSync(f, `${f}.desktopbak`);
    hidden.push(f);
  }
}
if (hidden.length) console.log(`[desktop-build] hid env files for standalone build: ${hidden.join(', ')}`);

const env = { ...process.env };
for (const k of CLEAR) env[k] = '';

let status = 1;
try {
  const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true, env });
  status = r.status == null ? 1 : r.status;
} finally {
  for (const f of hidden) {
    try { renameSync(`${f}.desktopbak`, f); } catch { /* leave the .desktopbak if restore fails */ }
  }
}
process.exit(status);
