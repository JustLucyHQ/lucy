// lib/oauth/providers.ts
// Resolves a connector's OAuth configuration:
//   - 'app': an operator-registered OAuth app (client id/secret in env), with the
//     authorize/token URLs from the catalog (GitHub, Google, Microsoft, Slack…).
//   - 'dcr': a hosted remote MCP whose authorization server supports Dynamic
//     Client Registration — Lucy self-registers, no operator setup (Notion,
//     Linear, Atlassian, Cloudflare, Sentry, Stripe…).
import { CATALOG } from '@/lib/mcp/catalog';

const GOOGLE_ENV = { id: 'GOOGLE_OAUTH_CLIENT_ID', secret: 'GOOGLE_OAUTH_CLIENT_SECRET' };

/** Connector slug → env vars holding a manually-registered OAuth app's credentials. */
const CRED_ENV: Record<string, { id: string; secret: string }> = {
  github: { id: 'GITHUB_OAUTH_CLIENT_ID', secret: 'GITHUB_OAUTH_CLIENT_SECRET' },
  'google-drive': GOOGLE_ENV,
  gmail: GOOGLE_ENV,
  'google-calendar': GOOGLE_ENV,
  'microsoft-365': { id: 'MS_OAUTH_CLIENT_ID', secret: 'MS_OAUTH_CLIENT_SECRET' },
  slack: { id: 'SLACK_OAUTH_CLIENT_ID', secret: 'SLACK_OAUTH_CLIENT_SECRET' },
  asana: { id: 'ASANA_OAUTH_CLIENT_ID', secret: 'ASANA_OAUTH_CLIENT_SECRET' },
};

/** Provider-specific authorize quirks for the 'app' flow. */
const APP_QUIRKS: Record<
  string,
  { usePkce?: boolean; extraAuthParams?: Record<string, string>; scopes?: string[]; scopeSeparator?: string }
> = {
  // Google: offline access + forced consent so we always get a refresh token; PKCE supported.
  'google-drive': { usePkce: true, extraAuthParams: { access_type: 'offline', prompt: 'consent' } },
  gmail: { usePkce: true, extraAuthParams: { access_type: 'offline', prompt: 'consent' } },
  'google-calendar': { usePkce: true, extraAuthParams: { access_type: 'offline', prompt: 'consent' } },
  // Microsoft 365: PKCE; user-consentable Graph scopes only (Sites/Chat/OnlineMeetings
  // typically need tenant-admin consent, so they're omitted to avoid blocking sign-in).
  'microsoft-365': {
    usePkce: true,
    scopes: [
      'offline_access',
      'openid',
      'profile',
      'User.Read',
      'Mail.ReadWrite',
      'Mail.Send',
      'Calendars.ReadWrite',
      'Files.ReadWrite.All',
      'Tasks.ReadWrite',
    ],
  },
  // Slack OAuth v2 uses comma-separated bot scopes (not space); confidential client (no PKCE).
  slack: { scopeSeparator: ',' },
};

export type ProviderConfig =
  | {
      kind: 'app';
      slug: string;
      authorizeUrl: string;
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      scopes: string[];
      remoteMcpUrl?: string;
      usePkce?: boolean;
      extraAuthParams?: Record<string, string>;
      scopeSeparator?: string;
    }
  | { kind: 'dcr'; slug: string; remoteMcpUrl: string; scopes: string[] };

export function getProvider(slug: string): ProviderConfig | null {
  const oauth = CATALOG.find((s) => s.slug === slug)?.meta?.oauth;
  if (!oauth) return null;

  const env = CRED_ENV[slug];
  if (env && process.env[env.id] && process.env[env.secret]) {
    if (!oauth.authorizeUrl || !oauth.tokenUrl) return null;
    const quirks = APP_QUIRKS[slug] ?? {};
    let authorizeUrl = oauth.authorizeUrl;
    let tokenUrl = oauth.tokenUrl;
    // Microsoft: default tenant is the catalog's /common/ (multitenant); override
    // with MS_OAUTH_TENANT for a single-tenant app registration.
    if (slug === 'microsoft-365' && process.env.MS_OAUTH_TENANT) {
      const t = process.env.MS_OAUTH_TENANT;
      authorizeUrl = `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`;
      tokenUrl = `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`;
    }
    return {
      kind: 'app',
      slug,
      authorizeUrl,
      tokenUrl,
      clientId: process.env[env.id]!,
      clientSecret: process.env[env.secret]!,
      scopes: quirks.scopes ?? oauth.scopes ?? [],
      remoteMcpUrl: oauth.remoteMcpUrl,
      usePkce: quirks.usePkce,
      extraAuthParams: quirks.extraAuthParams,
      scopeSeparator: quirks.scopeSeparator,
    };
  }

  if (oauth.dcr && oauth.remoteMcpUrl) {
    return { kind: 'dcr', slug, remoteMcpUrl: oauth.remoteMcpUrl, scopes: oauth.scopes ?? [] };
  }

  return null; // e.g. an oauth_app provider whose env credentials aren't set yet
}

/** The exact callback URL registered with the provider (must match precisely). */
export function redirectUri(slug: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/api/oauth/${slug}/callback`;
}

/** Slugs that can be connected right now (DCR providers + env-configured apps). */
export function configuredProviders(): string[] {
  return CATALOG.filter((s) => s.meta?.oauth && getProvider(s.slug) !== null).map((s) => s.slug);
}
