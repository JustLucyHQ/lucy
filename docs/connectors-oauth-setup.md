# Connectors — OAuth Setup Guide

How to set up Lucy's connectors so users can **one-click Connect** instead of pasting API keys.
This is the operator guide: what's automatic, what needs a one-time app registration, the exact
steps per provider, and how to place the credentials on the server.

---

## 1. How connector auth works

A connector is an **MCP server**. Each one authenticates in one of five ways (`meta.authMethod`
in `lib/mcp/catalog.ts`):

| authMethod | What the user sees | Operator setup |
|---|---|---|
| `oauth_remote_mcp` | **Connect** button | **None** — Lucy self-registers via DCR |
| `oauth_app` | **Connect** button | **Register one OAuth app** (this guide) |
| `api_key` | Key box + "How to get your key" help | none (user pastes) |
| `connection_string` | Connection-string box + help | none (user pastes) |
| `none` | Enable toggle | none |

The runtime: once a user connects, the encrypted token is stored in `lucy.oauth_connections`,
and the chat loader (`lib/mcp/resolve.ts → connectForUser`) uses it — sending
`Authorization: Bearer <token>` to the provider's hosted remote MCP, or injecting it into the
connector's stdio server.

---

## 2. Zero-setup providers (DCR) — nothing to do

These host their own remote MCP server with an OAuth authorization server that supports
**Dynamic Client Registration** (RFC 7591). The first time anyone clicks **Connect**, Lucy
discovers the auth server (`/.well-known/oauth-authorization-server`), self-registers a public
PKCE client (cached in `lucy.oauth_clients`), and runs OAuth 2.1 + PKCE. **No app registration,
no env vars.**

> Notion · Linear · Atlassian · Cloudflare · Sentry · Supabase · GitLab · Stripe · PayPal ·
> Square · Intercom · Canva · Figma · Zapier

These work end-to-end (Connect **and** tools in chat) out of the box.

---

## 3. OAuth-app providers — one-time registration

GitHub, Google, Microsoft 365 and Slack don't host a DCR remote MCP, so you register **one**
OAuth app per provider and put its client id/secret in the server env. Lucy reads them at
runtime; until they're set, the connector shows "one-click Connect coming soon".

The callback URL is always: **`https://<your-site>/api/oauth/<slug>/callback`**
(local dev: `http://localhost:3001/...` and `http://localhost:3000/...` — Lucy derives the base
from the request origin, so both ports work without config). **Slack is HTTPS-only** (no
localhost).

### 3a. GitHub  (`slug: github`)
1. https://github.com/settings/developers → **OAuth Apps → New OAuth App**
2. Homepage `https://<your-site>` · **Authorization callback URL** `https://<your-site>/api/oauth/github/callback`
3. Register → copy **Client ID** → **Generate a client secret** → copy it.
4. Env: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`
- Scopes requested: `repo read:org read:user user:email gist workflow`. No PKCE (confidential client).
- Tools: uses GitHub's hosted remote MCP (`api.githubcopilot.com/mcp`) with the token — **works end-to-end.**

### 3b. Google — Drive, Gmail, Calendar  (`slug: google-drive | gmail | google-calendar`)
One Google Cloud OAuth client covers all three.
1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Library** → enable **Google Drive API**, **Gmail API**, **Google Calendar API**.
3. **OAuth consent screen** → External → app name/email → add yourself under **Test users**
   (works before Google verification; users click *Advanced → Continue* past the "unverified" screen).
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Add **all** redirect URIs (3 connectors × environments):
   ```
   https://<your-site>/api/oauth/google-drive/callback
   https://<your-site>/api/oauth/gmail/callback
   https://<your-site>/api/oauth/google-calendar/callback
   http://localhost:3001/api/oauth/google-drive/callback     (+ gmail, google-calendar)
   http://localhost:3000/api/oauth/google-drive/callback     (+ gmail, google-calendar)
   ```
5. Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- Lucy sends `access_type=offline` + `prompt=consent` (→ refresh token) + PKCE S256.

### 3c. Microsoft 365 — Office  (`slug: microsoft-365`)
1. Azure portal → **App registrations → New registration**
   (direct: `https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`).
   *Not* "App Services" and *not* "Enterprise applications."
2. Name `Lucy`. Account types: **multitenant** (lets `/common/` work) — *or* single-tenant, in
   which case set `MS_OAUTH_TENANT` to your Directory (tenant) ID.
3. **Authentication → Web → Redirect URIs:**
   `https://<your-site>/api/oauth/microsoft-365/callback` (+ the two localhost ports).
4. **Certificates & secrets → New client secret** → copy the **Value** (not the Secret ID).
5. **API permissions → Microsoft Graph → Delegated:** `User.Read Mail.ReadWrite Mail.Send
   Calendars.ReadWrite Files.ReadWrite.All Tasks.ReadWrite` (these are user-consentable;
   `Sites.ReadWrite.All`/`Chat.ReadWrite`/`OnlineMeetings.ReadWrite` usually need admin consent
   so they're omitted by default — see `APP_QUIRKS` in `lib/oauth/providers.ts`).
6. Env: `MS_OAUTH_CLIENT_ID`, `MS_OAUTH_CLIENT_SECRET`, and `MS_OAUTH_TENANT` (optional;
   defaults to `common`). PKCE S256.
- Tip: a tenant ID can be resolved from a domain via
  `https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration`.

### 3d. Slack  (`slug: slack`)
1. https://api.slack.com/apps → **Create New App → From scratch** → name `Lucy`, pick a workspace.
2. **OAuth & Permissions → Redirect URLs:** `https://<your-site>/api/oauth/slack/callback`
   (**HTTPS only** — Slack rejects `http://localhost`; use an https tunnel for local testing).
3. **OAuth & Permissions → Scopes → Bot Token Scopes:** `channels:read channels:history
   chat:write users:read groups:read im:read files:read`
4. **Basic Information → App Credentials:** copy **Client ID** + **Client Secret**.
   (The *Signing Secret* and *Verification Token* are for Slack's Events API — **not used**.)
5. Env: `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET`
- Slack OAuth v2 quirk (already handled): bot scopes are **comma-separated**. No PKCE.

---

## 4. Placing credentials on the server

Lucy runs as a Next.js **standalone** build under pm2; runtime env is injected from the shell at
start, so a plain restart does **not** reload `.env.local`. To apply env changes safely
(preserving the existing env), source the full file and use `--update-env`:

```bash
cd /home/justlucy/htdocs/justlucy.ai
cp .env.local .env.local.bak                      # backup
# append the new vars (idempotent), e.g.:
printf '\nSLACK_OAUTH_CLIENT_ID=...\nSLACK_OAUTH_CLIENT_SECRET=...\n' >> .env.local
chmod 600 .env.local
set -a; . ./.env.local; set +a                    # load the WHOLE file into the shell
export PORT=3001 HOSTNAME=127.0.0.1 NODE_ENV=production
pm2 restart justlucy --update-env                 # capture shell env into the process
```

> ⚠️ Always `source` the full `.env.local` before `--update-env`, or `--update-env` will drop
> the vars that aren't in the current shell. Verify afterwards with
> `pm2 env <id> | grep -c '^SUPABASE_SERVICE_ROLE_KEY:'` (expect 1).

**Full env-var list for OAuth connectors:**
```
GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET     # Drive + Gmail + Calendar
MS_OAUTH_CLIENT_ID / MS_OAUTH_CLIENT_SECRET [/ MS_OAUTH_TENANT]
SLACK_OAUTH_CLIENT_ID / SLACK_OAUTH_CLIENT_SECRET
```

---

## 5. Verifying

```bash
# which providers can be connected (DCR providers + any configured app providers)
curl -s -H "Authorization: Bearer <LUCY_API_KEY>" https://<your-site>/api/oauth/connections
# → {"connections":[...connected...],"configured":[...connectable...]}

# does a provider build a correct authorize redirect?
curl -s -D - -o /dev/null -H "Authorization: Bearer <LUCY_API_KEY>" \
  "https://<your-site>/api/oauth/github/start" | grep -i '^location:'
```

End-user test: **/connectors → pick a provider → Connect → authorize → "Connected ✓"**.

---

## 6. What works end-to-end vs. auth-only

| Provider(s) | Connect (auth) | Tools in chat |
|---|---|---|
| GitHub | ✅ | ✅ (hosted remote MCP) |
| 14 DCR providers | ✅ | ✅ (hosted remote MCP) |
| Google (Drive/Gmail/Calendar) | ✅ | ⏳ needs a Google MCP server |
| Microsoft 365 | ✅ | ⏳ needs the ms-365 MCP server |
| Slack | ✅ | ⏳ needs a Slack MCP server |

The "tools half" for Google/Microsoft/Slack is pending: they don't host remote MCP servers, so
each needs a self-run MCP server fed the stored token. That work is tracked separately.

---

## 7. Data model & code map

- **Tables (lucy schema):** `oauth_connections` (per-user encrypted tokens),
  `oauth_clients` (cached DCR registrations), `mcp_servers` (catalog), `mcp_installations`
  (pasted key/connection installs).
- **Code:** `lib/oauth/providers.ts` (app vs dcr resolution + per-provider quirks),
  `lib/oauth/discovery.ts` (AS metadata), `lib/oauth/dcr.ts` (RFC 7591),
  `lib/oauth/pkce.ts`, `lib/oauth/connections.ts` (token store),
  `app/api/oauth/[provider]/{start,callback}/route.ts`, `app/api/oauth/connections/route.ts`,
  `lib/mcp/resolve.ts` (runtime token use), `components/connectors/ConnectorDetail.tsx` (UI).
- Tokens are AES-256-GCM encrypted (`lib/mcp/secret.ts`, keyed off `SUPABASE_SERVICE_ROLE_KEY`).

To add another `oauth_app` provider: add it to `CRED_ENV` (+ `APP_QUIRKS` if it needs PKCE /
extra params / a scope separator) in `lib/oauth/providers.ts`, set the env vars, and register
the app with the callback `https://<your-site>/api/oauth/<slug>/callback`.
