import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveMemoryAuth } from '@/lib/memory/auth';
import { isAdminUser } from '@/lib/auth/admin';
import { listCatalog } from '@/lib/mcp/registry';
import { seedCatalog, CATALOG } from '@/lib/mcp/catalog';
import { listCustom, customToServer } from '@/lib/mcp/custom';

// Slugs marked adminOnly in the in-code catalog (source of truth) — filtered
// out of the DB-backed response below for non-admins, e.g. Contractors Room.
const ADMIN_ONLY_SLUGS = new Set(CATALOG.filter((s) => s.adminOnly).map((s) => s.slug));

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function svc() { return createClient((process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: 'lucy' } }); }

export async function GET(req: NextRequest) {
  const { userId } = await resolveMemoryAuth(req);
  if (!userId) return Response.json({ servers: [] }, { status: 200 });
  const s = svc();
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const q = url.searchParams.get('q');
  let servers = await listCatalog(s, { category: category ?? undefined, q: q ?? undefined });
  // Self-heal: seed (idempotent upsert) whenever the DB catalog is missing entries
  // — covers first run AND any time the bundled CATALOG grows. Treat category=all
  // as "no filter" so seeding still triggers when the list page passes the default.
  const noFilter = (!category || category === 'all') && !q;
  if (noFilter && servers.length < CATALOG.length) { await seedCatalog(s); servers = await listCatalog(s, { category: category ?? undefined }); }
  // Append the user's custom connectors so they appear as cards alongside the catalog.
  const customs = (await listCustom(userId)).map(customToServer);
  if (ADMIN_ONLY_SLUGS.size > 0 && !(await isAdminUser(userId))) {
    servers = servers.filter((s: any) => !ADMIN_ONLY_SLUGS.has(s.slug));
  }
  return Response.json({ servers: [...servers, ...customs] });
}
