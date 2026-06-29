import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { confirmCode } from '@/lib/email/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { email, code, password } = await req.json().catch(() => ({}));
  if (
    typeof email !== 'string' ||
    typeof code !== 'string' ||
    typeof password !== 'string' ||
    password.length < 8
  ) {
    return Response.json({ ok: false, reason: 'mismatch' });
  }

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svcKey) return Response.json({ ok: false, reason: 'no_code' });

  // Service-role client with lucy schema so confirmCode resolves to lucy.email_verification_codes
  const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });

  // TODO: paginate if user count can exceed 1000
  const { data } = await (svc as any).auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users?.find(
    (u: any) => (u.email ?? '').toLowerCase() === email.toLowerCase()
  );
  if (!user) return Response.json({ ok: false, reason: 'no_code' });

  const verdict = await confirmCode(svc, user.id, code, 'reset');
  if (!verdict.ok) return Response.json(verdict);

  const { error } = await (svc as any).auth.admin.updateUserById(user.id, { password });
  if (error) return Response.json({ ok: false, reason: 'mismatch' });

  return Response.json({ ok: true });
}
