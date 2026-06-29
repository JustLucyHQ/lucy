import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listScreenings } from '@/lib/screening';
import { validateApiKey } from '@/lib/auth/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { db: { schema: 'lucy' } });
}

export async function GET(req: NextRequest) {
  const userId = await validateApiKey(req.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — provide a valid Lucy API key' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url = new URL(req.url);
  const filters = {
    project_id: url.searchParams.get('project_id')
      ? Number(url.searchParams.get('project_id'))
      : undefined,
    contractor_company_id: url.searchParams.get('contractor_company_id')
      ? Number(url.searchParams.get('contractor_company_id'))
      : undefined,
    client_company_id: url.searchParams.get('client_company_id')
      ? Number(url.searchParams.get('client_company_id'))
      : undefined,
    status: url.searchParams.get('status') || undefined,
  };

  // Scoped to the API key's owner — other tenants' screenings are never returned
  const screenings = await listScreenings(supabase, filters, userId);
  return NextResponse.json(screenings);
}
