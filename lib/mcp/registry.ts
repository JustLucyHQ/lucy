// lib/mcp/registry.ts
import type { SupabaseClient } from '@supabase/supabase-js';
export async function listCatalog(svc: SupabaseClient<any, any, any>, opts: { category?: string; q?: string } = {}) {
  let query = svc.from('mcp_servers').select('*').order('built_in', { ascending: false }).order('name');
  if (opts.category && opts.category !== 'all') query = query.eq('category', opts.category);
  const { data } = await query;
  let rows = data ?? [];
  if (opts.q) { const q = opts.q.toLowerCase(); rows = rows.filter((r: any) => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)); }
  return rows;
}
export async function getServer(svc: SupabaseClient<any, any, any>, slug: string) {
  const { data } = await svc.from('mcp_servers').select('*').eq('slug', slug).maybeSingle();
  return data;
}
