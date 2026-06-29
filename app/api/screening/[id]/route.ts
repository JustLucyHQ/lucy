import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getScreening, submitAnswers } from '@/lib/screening';
import { validateApiKey } from '@/lib/auth/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { db: { schema: 'lucy' } });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await validateApiKey(req.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — provide a valid Lucy API key' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { id } = await params;
  // Scoped to the API key's owner — screenings created by other users 404
  const screening = await getScreening(supabase, id, userId);

  if (!screening) {
    return NextResponse.json({ error: 'Screening not found' }, { status: 404 });
  }

  return NextResponse.json(screening);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await validateApiKey(req.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — provide a valid Lucy API key' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { id } = await params;

  try {
    const body = await req.json();

    if (!body.answers || !Array.isArray(body.answers)) {
      return NextResponse.json(
        { error: 'Missing required field: answers (array of {question_id, answer})' },
        { status: 400 }
      );
    }

    const screening = await submitAnswers(supabase, id, body.answers, userId);

    return NextResponse.json({
      screening_id: screening.id,
      status: screening.status,
      grade: screening.grade,
      grade_label: screening.grade_label,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit answers' },
      { status: 400 }
    );
  }
}
