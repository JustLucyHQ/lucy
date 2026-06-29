// lib/mcp/custom.ts
// Per-user "custom connectors" — a remote MCP server the user adds by URL when
// it isn't in the catalog. Stored in lucy.custom_connectors; an optional bearer
// token is encrypted at rest. Connecting reuses the http transport in client.ts.
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { encryptSecret, decryptSecret } from './secret';
import { connect, type McpConn } from './client';
import type { CatalogServer } from './types';

function svc() {
  return createClient(
    (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'lucy' }, auth: { persistSession: false } },
  );
}

export interface CustomConnector {
  id: string;
  slug: string;
  name: string;
  url: string;
  token_enc: string | null;
}

const COLS = 'id, slug, name, url, token_enc';

function makeSlug(name: string): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'mcp';
  return `custom-${base}-${randomBytes(3).toString('hex')}`;
}

export async function createCustom(
  userId: string,
  name: string,
  url: string,
  token?: string | null,
): Promise<CustomConnector> {
  const { data, error } = await svc()
    .from('custom_connectors')
    .insert({ user_id: userId, slug: makeSlug(name), name, url, token_enc: token ? encryptSecret(token) : null })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as CustomConnector;
}

export async function listCustom(userId: string): Promise<CustomConnector[]> {
  const { data } = await svc().from('custom_connectors').select(COLS).eq('user_id', userId);
  return (data ?? []) as CustomConnector[];
}

export async function getCustom(userId: string, slug: string): Promise<CustomConnector | null> {
  const { data } = await svc()
    .from('custom_connectors')
    .select(COLS)
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();
  return (data as CustomConnector) ?? null;
}

export async function deleteCustom(userId: string, slug: string): Promise<void> {
  await svc().from('custom_connectors').delete().eq('user_id', userId).eq('slug', slug);
}

/** Present a custom connector as a CatalogServer (for the registry list + runtime). */
export function customToServer(c: CustomConnector): CatalogServer {
  return {
    slug: c.slug,
    name: c.name,
    description: `Custom remote MCP · ${c.url.replace(/^https?:\/\//, '')}`,
    category: 'productivity',
    icon: '🧩',
    transport: 'http',
    config_schema: [],
    tools: [],
    verified: false,
    built_in: false,
    meta: { authMethod: 'api_key' },
  };
}

/** Connect to a custom remote MCP (bearer token if one was saved, else open). */
export async function connectCustom(c: CustomConnector): Promise<McpConn> {
  const token = c.token_enc ? decryptSecret(c.token_enc) : null;
  return connect(customToServer(c), {}, { url: c.url, bearerToken: token ?? undefined });
}
