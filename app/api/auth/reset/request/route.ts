import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp } from '@/lib/api/rate-limit';
import { createCode, CODE_TTL_MINUTES } from '@/lib/email/codes';
import { sendTemplateEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { limited } = checkRateLimit('reset', ip, 5);
  if (limited) return Response.json({ ok: true }); // silent under rate limit

  const { email } = await req.json().catch(() => ({ email: '' }));
  if (typeof email !== 'string' || !email.includes('@')) return Response.json({ ok: true });

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && svcKey) {
    // Service-role client with lucy schema so createCode resolves to lucy.email_verification_codes
    const svc = createClient(url, svcKey, { db: { schema: 'lucy' } });

    // look up the user id by email via admin API (service-role)
    // TODO: paginate if user count can exceed 1000
    const { data } = await (svc as any).auth.admin.listUsers({ perPage: 1000 });
    const user = data?.users?.find(
      (u: any) => (u.email ?? '').toLowerCase() === email.toLowerCase()
    );
    if (user) {
      const code = await createCode(svc, user.id, email, 'reset');
      await sendTemplateEmail(email, 'passwordReset', {
        firstName: email.split('@')[0],
        code,
        expiresMinutes: CODE_TTL_MINUTES,
      });
    }
  }

  return Response.json({ ok: true }); // identical response whether or not the email exists
}
