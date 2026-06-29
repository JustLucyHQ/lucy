'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_COOKIE_NAME } from './cookie';
type LucyClient = import('@supabase/supabase-js').SupabaseClient<any, any, any>;

let _client: LucyClient | null = null;

export function isSupabaseEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseClient(): LucyClient | null {
  if (!isSupabaseEnabled()) return null;

  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { db: { schema: 'lucy' }, cookieOptions: { name: SUPABASE_COOKIE_NAME } }
    );
  }

  return _client;
}
