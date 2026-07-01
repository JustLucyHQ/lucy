import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justlucy.ai';

/**
 * Keep crawlers off app screens (auth-gated in connected mode anyway — see
 * proxy.ts protectedPrefixes) and non-content routes; only the marketing site,
 * download page, docs, and legal pages are meant to be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/chat',
        '/workflows',
        '/settings',
        '/account',
        '/connectors',
        '/widgets',
        '/personas',
        '/admin',
        '/auth',
        '/onboarding',
        '/embed',
        '/api',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
