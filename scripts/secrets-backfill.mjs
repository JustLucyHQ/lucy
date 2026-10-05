#!/usr/bin/env node
// Lucy — secrets at rest: backfill / verify (docs/kb/guides/security.md "Secrets at rest").
//
//   node scripts/secrets-backfill.mjs --env-file .env.local            # DRY RUN (default): counts only, writes nothing
//   node scripts/secrets-backfill.mjs --env-file .env.local --apply    # encrypts every plaintext secret in place
//   node scripts/secrets-backfill.mjs --env-file .env.local --verify   # exit 1 if a plaintext or unreadable secret is left
//
// Lucy encrypts with lib/mcp/secret.ts (AES-256-GCM, key derived from SUPABASE_SERVICE_ROLE_KEY, per-value salt). This
// script uses the same file, so what it writes is exactly what the app writes. It talks to the database the way the app
// does (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_INTERNAL_URL + SUPABASE_SERVICE_ROLE_KEY, schema lucy). Output is COUNTS ONLY.
// Idempotent: an encrypted value is left alone. Every write is decrypted again and compared first.
//
//   encrypt (were plaintext):  workflow_triggers.secret, memory_settings.embedder_api_key, telegram_settings.webhook_secret
//   re-encrypt (legacy XOR):   provider_configs.api_key_encrypted rows without the enc:v1: prefix
//   verify only:               every *_enc / *_encrypted column opens (custom_connectors, oauth_clients,
//                              oauth_connections, telegram_links, telegram_settings)
// Requires Node 22.18+ (type stripping: it loads lib/mcp/secret.ts).

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { encryptSecret, decryptSecret } from '../lib/mcp/secret.ts';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i === -1 ? null : args[i + 1] ?? null;
};
const APPLY = flag('--apply');
const VERIFY = flag('--verify');
if (APPLY && VERIFY) {
  console.error('--apply and --verify are separate runs');
  process.exit(2);
}
const MODE = VERIFY ? 'verify' : APPLY ? 'apply' : 'dry-run';

const envFile = opt('--env-file');
if (envFile) {
  if (!existsSync(envFile)) {
    console.error(`env file not found: ${envFile}`);
    process.exit(2);
  }
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --env-file)');
  process.exit(2);
}
const db = createClient(url, serviceKey, { db: { schema: 'lucy' }, auth: { persistSession: false, autoRefreshToken: false } });
let host = '(unparsable url)';
try {
  host = new URL(url).host;
} catch {
  /* keep */
}
console.log(`lucy secrets-backfill  mode=${MODE}  api=${host}`);

// the same test lib/mcp/secret.ts decryptSecretMaybe uses to tell ciphertext from a legacy plaintext
const ENC_FORMAT = /^(?:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+|[0-9a-f]+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+)$/i;
const PROVIDER_PREFIX = 'enc:v1:';
const LEGACY_XOR_SALT = 'lucy_api_key_v1';
const xorDecode = (hex) => (hex.match(/.{1,2}/g) ?? []).map((b, i) => String.fromCharCode(parseInt(b, 16) ^ LEGACY_XOR_SALT.charCodeAt(i % LEGACY_XOR_SALT.length))).join('');

const stats = new Map();
const stat = (k) => stats.get(k) ?? stats.set(k, { plain: 0, sealed: 0, unreadable: 0, empty: 0 }).get(k);
let wrote = 0;

function classify(v) {
  if (v === null || v === undefined || v === '' || typeof v !== 'string') return 'empty';
  if (!ENC_FORMAT.test(v)) return 'plain';
  return decryptSecret(v) === null ? 'unreadable' : 'sealed';
}
function seal(plain) {
  const enc = encryptSecret(plain);
  if (decryptSecret(enc) !== plain) throw new Error('round-trip check failed — nothing written for this value');
  return enc;
}

/** Plaintext columns that the app now encrypts. */
async function encryptColumn(table, idCol, col) {
  const { data, error } = await db.from(table).select(`${idCol}, ${col}`);
  if (error) throw new Error(`${table}: ${error.message}`);
  for (const r of data ?? []) {
    const kind = classify(r[col]);
    stat(`${table}.${col}`)[kind]++;
    if (MODE === 'apply' && kind === 'plain') {
      const { error: e } = await db.from(table).update({ [col]: seal(r[col]) }).eq(idCol, r[idCol]);
      if (e) throw new Error(`${table}: ${e.message}`);
      wrote++;
    }
  }
}

/** provider_configs: `enc:v1:` + ciphertext, or a legacy XOR-obfuscated hex string (no real protection) to re-encrypt. */
async function providerConfigs() {
  const { data, error } = await db.from('provider_configs').select('id, api_key_encrypted');
  if (error) throw new Error(`provider_configs: ${error.message}`);
  for (const r of data ?? []) {
    const v = r.api_key_encrypted;
    const s = stat('provider_configs.api_key_encrypted');
    if (!v) {
      s.empty++;
      continue;
    }
    if (v.startsWith(PROVIDER_PREFIX)) {
      decryptSecret(v.slice(PROVIDER_PREFIX.length)) === null ? s.unreadable++ : s.sealed++;
      continue;
    }
    s.plain++;
    if (MODE === 'apply') {
      const plain = xorDecode(v);
      const { error: e } = await db.from('provider_configs').update({ api_key_encrypted: PROVIDER_PREFIX + seal(plain) }).eq('id', r.id);
      if (e) throw new Error(`provider_configs: ${e.message}`);
      wrote++;
    }
  }
}

/** Columns that are encrypted already: only checked (a plaintext here would be a bug, reported, never changed). */
const ENCRYPTED_COLUMNS = [
  ['custom_connectors', 'token_enc'],
  ['oauth_clients', 'client_secret_enc'],
  ['oauth_connections', 'access_token_enc'],
  ['oauth_connections', 'refresh_token_enc'],
  ['telegram_links', 'api_key_encrypted'],
  ['telegram_settings', 'bot_token_encrypted'],
  ['telegram_settings', 'shared_api_key_encrypted'],
];
async function checkEncrypted(table, col) {
  const { data, error } = await db.from(table).select(col);
  if (error) {
    stat(`${table}.${col} (not readable: ${error.code ?? 'error'})`).empty++;
    return;
  }
  for (const r of data ?? []) stat(`${table}.${col}`)[classify(r[col])]++;
}

let failed = false;
try {
  await encryptColumn('workflow_triggers', 'id', 'secret');
  await encryptColumn('memory_settings', 'id', 'embedder_api_key');
  await encryptColumn('telegram_settings', 'id', 'webhook_secret');
  await providerConfigs();
  for (const [t, c] of ENCRYPTED_COLUMNS) await checkEncrypted(t, c);
} catch (e) {
  console.error(`FAILED: ${e instanceof Error ? e.message : e}`);
  failed = true;
}
// process.exitCode, not process.exit: supabase-js keeps sockets open (a hard exit trips a libuv assertion on Windows)
if (failed) process.exitCode = 1;
else report();

function report() {
  const head = MODE === 'apply' ? 'encrypted now' : MODE === 'dry-run' ? 'to encrypt' : 'PLAINTEXT';
  console.log('\n' + 'column'.padEnd(52) + head.padStart(14) + 'already enc.'.padStart(13) + 'unreadable'.padStart(11) + 'empty'.padStart(7));
  let plain = 0;
  let sealed = 0;
  let bad = 0;
  for (const [k, s] of [...stats.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    plain += s.plain;
    sealed += s.sealed;
    bad += s.unreadable;
    console.log(k.padEnd(52) + String(s.plain).padStart(14) + String(s.sealed).padStart(13) + String(s.unreadable).padStart(11) + String(s.empty).padStart(7));
  }
  console.log(`\ntotal: ${plain} ${head.toLowerCase()}, ${sealed} already encrypted, ${bad} unreadable${MODE === 'apply' ? `, ${wrote} written` : ''}`);
  if (MODE === 'dry-run') console.log(plain ? `dry run only — ${plain} value(s) would be encrypted. Re-run with --apply.` : 'dry run only — nothing to encrypt.');
  if (MODE === 'verify') {
    const ok = plain === 0 && bad === 0;
    console.log(ok ? 'VERIFY OK — every secret is encrypted and opens.' : 'VERIFY FAILED — plaintext or unreadable secrets remain.');
    process.exitCode = ok ? 0 : 1;
  }
  if (MODE === 'apply') process.exitCode = bad ? 1 : 0;
}
