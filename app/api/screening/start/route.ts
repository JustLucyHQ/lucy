import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { startScreening } from '@/lib/screening';
import { validateApiKey } from '@/lib/auth/api-keys';
import type { StartScreeningRequest } from '@/lib/screening/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { db: { schema: 'lucy' } });
}

export async function POST(req: NextRequest) {
  const userId = await validateApiKey(req.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — provide a valid Lucy API key' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body: StartScreeningRequest = await req.json();

    if (!body.contractor_company_id || !body.client_company_id || !body.contractor_profile) {
      return NextResponse.json(
        { error: 'Missing required fields: contractor_company_id, client_company_id, contractor_profile' },
        { status: 400 }
      );
    }

    if (!body.screening_type) {
      body.screening_type = 'project_screening';
    }

    const screening = await startScreening(supabase, body, userId);

    return NextResponse.json({
      screening_id: screening.id,
      status: screening.status,
      screening_type: screening.screening_type,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start screening';
    const isDuplicate = message.includes('duplicate') || message.includes('unique');
    return NextResponse.json(
      { error: isDuplicate ? 'A screening already exists for this contractor/project combination' : message },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
