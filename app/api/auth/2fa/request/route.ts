import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { createCode, CODE_TTL_MINUTES } from '@/lib/email/codes';
import { sendTemplateEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId, email } = await resolveMemoryAuth(req);
  if (!userId || !email) return Response.json({ ok: false }, { status: 401 });

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return Response.json({ ok: false }, { status: 500 });

  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });
  const code = await createCode(svc, userId, email, '2fa');
  await sendTemplateEmail(email, 'twoFactorCode', {
    firstName: email.split('@')[0],
    code,
    expiresMinutes: CODE_TTL_MINUTES,
  });
  return Response.json({ ok: true });
}
