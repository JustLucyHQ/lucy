import type { MetadataRoute } from 'next';
import { ALL_PAGES } from '@/lib/docs/registry';

// Same convention as app/layout.tsx — override per-environment with NEXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justlucy.ai';

/**
 * Public, indexable pages only. Everything behind auth in connected mode
 * (chat, workflows, settings, account, connectors, widgets, personas, admin —
 * see proxy.ts protectedPrefixes), plus /auth/*, /onboarding, and /embed
 * (an iframe host, not a content page), is intentionally excluded here and
 * disallowed in robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/download`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/docs`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/payments`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const docPages: MetadataRoute.Sitemap = ALL_PAGES.map((p) => ({
    url: `${SITE_URL}/docs/${p.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [...staticPages, ...docPages];
}
