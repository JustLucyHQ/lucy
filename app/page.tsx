import type { Metadata } from 'next';
import { LandingModern } from '@/components/landing/LandingModern';
import { LandingCorporate } from '@/components/landing/LandingCorporate';

export const metadata: Metadata = {
  title: 'Lucy AI — Your AI, every provider, one memory',
  description:
    'Open-source, self-hosted AI: OpenAI, Claude, Gemini, and local models in one interface that remembers your work, connects to your tools, and keeps your keys on your machine.',
};

/**
 * Public home page (connected/web only — in standalone mode proxy.ts redirects the
 * root to /onboarding before this renders). Two visual versions while we decide:
 *   /              → modern (Luminous tone, default)
 *   /?v=corporate  → light corporate
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  // Defense in depth: the landing is a connected/web-only surface. In standalone
  // (no Supabase) proxy.ts already redirects the root to /onboarding before this
  // renders — but never render the marketing page here either, so it can't show
  // even if the middleware is ever bypassed.
  const supabaseEnabled = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseEnabled) return null;

  const { v } = await searchParams;
  if (v === 'corporate') return <LandingCorporate />;
  return <LandingModern />;
}
