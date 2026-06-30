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
  const { v } = await searchParams;
  if (v === 'corporate') return <LandingCorporate />;
  return <LandingModern />;
}
