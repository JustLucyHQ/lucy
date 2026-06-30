// lib/mcp/icons.ts
// Real app logos for connector cards, sourced as favicons by brand domain.
// Connectors with no public domain (filesystem, fetch, memory, …) fall back to
// the catalog emoji in <ConnectorIcon>.
const DOMAIN: Record<string, string> = {
  github: 'github.com',
  'google-drive': 'drive.google.com',
  gmail: 'gmail.com',
  'google-calendar': 'calendar.google.com',
  'microsoft-365': 'microsoft.com',
  slack: 'slack.com',
  notion: 'notion.so',
  linear: 'linear.app',
  atlassian: 'atlassian.com',
  cloudflare: 'cloudflare.com',
  sentry: 'sentry.io',
  supabase: 'supabase.com',
  gitlab: 'gitlab.com',
  stripe: 'stripe.com',
  paypal: 'paypal.com',
  square: 'squareup.com',
  hubspot: 'hubspot.com',
  intercom: 'intercom.com',
  asana: 'asana.com',
  box: 'box.com',
  canva: 'canva.com',
  figma: 'figma.com',
  zapier: 'zapier.com',
  plaid: 'plaid.com',
  apollo: 'apollo.io',
  wordpress: 'wordpress.org',
  airtable: 'airtable.com',
  'brave-search': 'brave.com',
  exa: 'exa.ai',
  firecrawl: 'firecrawl.dev',
  tavily: 'tavily.com',
  'google-maps': 'maps.google.com',
  discord: 'discord.com',
  apify: 'apify.com',
  n8n: 'n8n.io',
  mssql: 'microsoft.com',
  postgres: 'postgresql.org',
  redis: 'redis.io',
  mongodb: 'mongodb.com',
  'contractors-room': 'contractorsroom.com',
  'twenty-crm': 'twenty.com',
  clickup: 'clickup.com',
  shopify: 'shopify.com',
  dropbox: 'dropbox.com',
  reddit: 'reddit.com',
  facebook: 'facebook.com',
};

/** Favicon URL for a connector's real app logo, or null to fall back to the emoji. */
export function connectorIconUrl(slug: string, size = 64): string | null {
  const d = DOMAIN[slug];
  return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=${size}` : null;
}
