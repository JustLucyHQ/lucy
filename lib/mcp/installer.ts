// lib/mcp/installer.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfigField } from './types';
import { encryptSecret, decryptSecret } from './secret';
export const SECRET_MARK = '__set__';

export function validateConfig(schema: ConfigField[], config: Record<string, unknown>): { ok: boolean; error?: string } {
  for (const f of schema) {
    if (f.required && (config[f.key] === undefined || config[f.key] === '' || config[f.key] === null))
      return { ok: false, error: `Missing required field: ${f.label}` };
  }
  return { ok: true };
}

/** For GET responses: secret values become a marker (never the value); text stays. */
export function maskConfig(schema: ConfigField[], config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const f = schema.find((s) => s.key === k);
    out[k] = f?.type === 'secret' ? SECRET_MARK : v;
  }
  // ensure unset secrets are simply absent (don't fabricate marks)
  return out;
}

/** Encrypt secret-typed values for storage. */
export function encodeConfig(schema: ConfigField[], config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const f = schema.find((s) => s.key === k);
    out[k] = f?.type === 'secret' && typeof v === 'string' && v !== SECRET_MARK ? encryptSecret(v) : v;
  }
  return out;
}

/** Decrypt for runtime use (server-only). */
export function decodeConfig(schema: ConfigField[], config: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    const f = schema.find((s) => s.key === k);
    if (f?.type === 'secret' && typeof v === 'string') { const d = decryptSecret(v); if (d !== null) out[k] = d; }
    else if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export async function getInstallations(svc: SupabaseClient<any, any, any>, userId: string) {
  const { data } = await svc.from('mcp_installations').select('*').eq('user_id', userId);
  return data ?? [];
}

/** Build the config to store: preserved existing values (already encoded) + freshly-encoded new values.
 *  Incoming secret fields equal to SECRET_MARK are dropped (the existing encoded value is kept).
 *  Incoming secret fields that are empty/nullish are also dropped (blank re-save must not wipe existing secret). */
export function mergeConfigForStorage(
  schema: ConfigField[],
  existingConfig: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const isSecret = (k: string) => schema.find((s) => s.key === k)?.type === 'secret';
  const newValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === SECRET_MARK) continue;                                              // keep existing encoded secret
    if (isSecret(k) && (v === '' || v === null || v === undefined)) continue;    // blank secret => keep existing, never store empty
    newValues[k] = v;
  }
  const encodedNew = encodeConfig(schema, newValues); // encrypt only the new (plaintext) values, ONCE
  return { ...existingConfig, ...encodedNew };          // preserved ciphertext untouched + new encoded
}

export async function install(svc: SupabaseClient<any, any, any>, userId: string, slug: string, config: Record<string, unknown>, schema: ConfigField[]) {
  const { data: existing } = await svc.from('mcp_installations').select('config').eq('user_id', userId).eq('server_slug', slug).maybeSingle();
  const finalConfig = mergeConfigForStorage(schema, (existing?.config as Record<string, unknown>) ?? {}, config ?? {});
  await svc.from('mcp_installations').upsert({ user_id: userId, server_slug: slug, config: finalConfig }, { onConflict: 'user_id,server_slug' });
}

export async function uninstall(svc: SupabaseClient<any, any, any>, userId: string, slug: string) {
  await svc.from('mcp_installations').delete().eq('user_id', userId).eq('server_slug', slug);
}

export async function patchInstall(svc: SupabaseClient<any, any, any>, userId: string, slug: string, patch: { enabled?: boolean; require_approval?: boolean }) {
  await svc.from('mcp_installations').update(patch).eq('user_id', userId).eq('server_slug', slug);
}
