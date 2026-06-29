// lib/mcp/native.ts
// Native, token-backed tool providers for OAuth connectors that have NO hosted
// remote MCP (Google Drive/Gmail/Calendar, Microsoft 365, Slack). Each provider
// exposes a small set of tools whose handlers call the vendor's REST API with the
// user's stored OAuth access token (refreshed on demand). This gives the chat
// tool-loop a working `McpConn` without running an external MCP server.
import type { McpConn } from './client';
import { getFreshAccessToken } from '@/lib/oauth/connections';

type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };
type Handler = (name: string, args: Record<string, unknown>, token: string) => Promise<unknown>;
interface NativeProvider {
  tools: ToolDef[];
  handle: Handler;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const clip = (s: string, n = 8000) => (s.length > n ? s.slice(0, n) + '…[truncated]' : s);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, d: number, max: number) => {
  const n = typeof v === 'number' ? v : parseInt(str(v), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : d;
};

async function jfetch(url: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error_description || json?.error || text.slice(0, 300);
    throw new Error(`${res.status} ${msg}`);
  }
  return json;
}

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64url = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object', properties: props, required,
});
const S = (description: string) => ({ type: 'string', description });
const N = (description: string) => ({ type: 'number', description });

// ── Google Drive ─────────────────────────────────────────────────────────────
const DRIVE = 'https://www.googleapis.com/drive/v3';
const googleDrive: NativeProvider = {
  tools: [
    { name: 'search_files', description: 'Full-text search files in Google Drive.',
      inputSchema: obj({ query: S('Text to search for'), limit: N('Max results (default 10)') }, ['query']) },
    { name: 'list_files', description: 'List files, optionally within a folder id.',
      inputSchema: obj({ folderId: S('Optional Drive folder id'), limit: N('Max results (default 20)') }) },
    { name: 'get_file_content', description: 'Read a file/Google Doc as plain text by id.',
      inputSchema: obj({ fileId: S('The Drive file id') }, ['fileId']) },
  ],
  handle: async (name, a, token) => {
    if (name === 'search_files') {
      const q = str(a.query).replace(/'/g, "\\'");
      const url = `${DRIVE}/files?q=${encodeURIComponent(`fullText contains '${q}'`)}` +
        `&pageSize=${num(a.limit, 10, 50)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`;
      const j = await jfetch(url, token);
      return { files: j?.files ?? [] };
    }
    if (name === 'list_files') {
      const parts: string[] = [];
      if (a.folderId) parts.push(`'${str(a.folderId).replace(/'/g, "\\'")}' in parents`);
      const q = parts.length ? `&q=${encodeURIComponent(parts.join(' and '))}` : '';
      const url = `${DRIVE}/files?pageSize=${num(a.limit, 20, 100)}` +
        `&fields=files(id,name,mimeType,modifiedTime,webViewLink)${q}`;
      const j = await jfetch(url, token);
      return { files: j?.files ?? [] };
    }
    if (name === 'get_file_content') {
      const id = encodeURIComponent(str(a.fileId));
      const meta = await jfetch(`${DRIVE}/files/${id}?fields=name,mimeType`, token);
      const mime = str(meta?.mimeType);
      const url = mime.startsWith('application/vnd.google-apps')
        ? `${DRIVE}/files/${id}/export?mimeType=text/plain`
        : `${DRIVE}/files/${id}?alt=media`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const body = await res.text();
      return { name: meta?.name, mimeType: mime, content: clip(body) };
    }
    throw new Error(`unknown tool ${name}`);
  },
};

// ── Gmail ────────────────────────────────────────────────────────────────────
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
function gmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return unb64url(payload.body.data);
  if (Array.isArray(payload.parts)) {
    for (const p of payload.parts) { const t = gmailBody(p); if (t) return t; }
  }
  if (payload.body?.data) return unb64url(payload.body.data);
  return '';
}
const gmail: NativeProvider = {
  tools: [
    { name: 'search_emails', description: 'Search Gmail with a query (Gmail search syntax).',
      inputSchema: obj({ query: S("e.g. 'from:boss is:unread'"), limit: N('Max results (default 10)') }, ['query']) },
    { name: 'get_email', description: 'Read a full email by message id.',
      inputSchema: obj({ id: S('The Gmail message id') }, ['id']) },
    { name: 'create_draft', description: 'Create a draft email (does not send).',
      inputSchema: obj({ to: S('Recipient email'), subject: S('Subject'), body: S('Plain-text body') }, ['to', 'subject', 'body']) },
  ],
  handle: async (name, a, token) => {
    if (name === 'search_emails') {
      const url = `${GMAIL}/messages?q=${encodeURIComponent(str(a.query))}&maxResults=${num(a.limit, 10, 25)}`;
      const list = await jfetch(url, token);
      const ids: string[] = (list?.messages ?? []).map((m: any) => m.id);
      const out = [];
      for (const id of ids) {
        const m = await jfetch(
          `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          token,
        );
        const h = (m?.payload?.headers ?? []) as { name: string; value: string }[];
        const get = (k: string) => h.find((x) => x.name.toLowerCase() === k)?.value ?? '';
        out.push({ id, from: get('from'), subject: get('subject'), date: get('date'), snippet: m?.snippet });
      }
      return { messages: out };
    }
    if (name === 'get_email') {
      const m = await jfetch(`${GMAIL}/messages/${encodeURIComponent(str(a.id))}?format=full`, token);
      const h = (m?.payload?.headers ?? []) as { name: string; value: string }[];
      const get = (k: string) => h.find((x) => x.name.toLowerCase() === k)?.value ?? '';
      return {
        from: get('from'), to: get('to'), subject: get('subject'), date: get('date'),
        body: clip(gmailBody(m?.payload) || str(m?.snippet)),
      };
    }
    if (name === 'create_draft') {
      const raw = b64url(
        `To: ${str(a.to)}\r\nSubject: ${str(a.subject)}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${str(a.body)}`,
      );
      const j = await jfetch(`${GMAIL}/drafts`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { raw } }),
      });
      return { ok: true, draftId: j?.id };
    }
    throw new Error(`unknown tool ${name}`);
  },
};

// ── Google Calendar ──────────────────────────────────────────────────────────
const CAL = 'https://www.googleapis.com/calendar/v3';
const googleCalendar: NativeProvider = {
  tools: [
    { name: 'list_events', description: 'List upcoming primary-calendar events.',
      inputSchema: obj({ timeMin: S('ISO start (default now)'), timeMax: S('ISO end (optional)'), limit: N('Max events (default 10)') }) },
    { name: 'create_event', description: 'Create a calendar event.',
      inputSchema: obj({ summary: S('Title'), start: S('ISO start datetime'), end: S('ISO end datetime'), description: S('Optional notes'), location: S('Optional location') }, ['summary', 'start', 'end']) },
    { name: 'get_availability', description: 'Return busy time ranges between two times.',
      inputSchema: obj({ timeMin: S('ISO start'), timeMax: S('ISO end') }, ['timeMin', 'timeMax']) },
  ],
  handle: async (name, a, token) => {
    if (name === 'list_events') {
      const params = new URLSearchParams({
        singleEvents: 'true', orderBy: 'startTime',
        timeMin: str(a.timeMin) || new Date().toISOString(),
        maxResults: String(num(a.limit, 10, 50)),
      });
      if (a.timeMax) params.set('timeMax', str(a.timeMax));
      const j = await jfetch(`${CAL}/calendars/primary/events?${params}`, token);
      return {
        events: (j?.items ?? []).map((e: any) => ({
          id: e.id, summary: e.summary, start: e.start, end: e.end, location: e.location, htmlLink: e.htmlLink,
        })),
      };
    }
    if (name === 'create_event') {
      const j = await jfetch(`${CAL}/calendars/primary/events`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: str(a.summary), description: a.description ? str(a.description) : undefined,
          location: a.location ? str(a.location) : undefined,
          start: { dateTime: str(a.start) }, end: { dateTime: str(a.end) },
        }),
      });
      return { ok: true, id: j?.id, htmlLink: j?.htmlLink };
    }
    if (name === 'get_availability') {
      const j = await jfetch(`${CAL}/freeBusy`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin: str(a.timeMin), timeMax: str(a.timeMax), items: [{ id: 'primary' }] }),
      });
      return { busy: j?.calendars?.primary?.busy ?? [] };
    }
    throw new Error(`unknown tool ${name}`);
  },
};

// ── Microsoft 365 (Graph) ────────────────────────────────────────────────────
const GRAPH = 'https://graph.microsoft.com/v1.0';
const microsoft365: NativeProvider = {
  tools: [
    { name: 'list_emails', description: 'List recent Outlook emails.',
      inputSchema: obj({ limit: N('Max emails (default 10)') }) },
    { name: 'list_calendar_events', description: 'List upcoming Outlook calendar events.',
      inputSchema: obj({ limit: N('Max events (default 10)') }) },
    { name: 'list_files', description: 'List files in the root of OneDrive.',
      inputSchema: obj({ limit: N('Max files (default 20)') }) },
    { name: 'send_email', description: 'Send an email from Outlook.',
      inputSchema: obj({ to: S('Recipient email (comma-separated allowed)'), subject: S('Subject'), body: S('Plain-text body') }, ['to', 'subject', 'body']) },
  ],
  handle: async (name, a, token) => {
    if (name === 'list_emails') {
      const j = await jfetch(
        `${GRAPH}/me/messages?$top=${num(a.limit, 10, 50)}&$select=subject,from,receivedDateTime,bodyPreview&$orderby=receivedDateTime desc`,
        token,
      );
      return {
        emails: (j?.value ?? []).map((m: any) => ({
          id: m.id, subject: m.subject, from: m.from?.emailAddress?.address,
          received: m.receivedDateTime, preview: m.bodyPreview,
        })),
      };
    }
    if (name === 'list_calendar_events') {
      const j = await jfetch(
        `${GRAPH}/me/events?$top=${num(a.limit, 10, 50)}&$select=subject,start,end,location,organizer&$orderby=start/dateTime`,
        token,
      );
      return {
        events: (j?.value ?? []).map((e: any) => ({
          id: e.id, subject: e.subject, start: e.start, end: e.end, location: e.location?.displayName,
        })),
      };
    }
    if (name === 'list_files') {
      const j = await jfetch(
        `${GRAPH}/me/drive/root/children?$top=${num(a.limit, 20, 100)}&$select=name,size,webUrl,folder,lastModifiedDateTime`,
        token,
      );
      return {
        files: (j?.value ?? []).map((f: any) => ({
          name: f.name, size: f.size, isFolder: !!f.folder, webUrl: f.webUrl, modified: f.lastModifiedDateTime,
        })),
      };
    }
    if (name === 'send_email') {
      const recipients = str(a.to).split(',').map((x) => x.trim()).filter(Boolean)
        .map((address) => ({ emailAddress: { address } }));
      await jfetch(`${GRAPH}/me/sendMail`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { subject: str(a.subject), body: { contentType: 'Text', content: str(a.body) }, toRecipients: recipients },
          saveToSentItems: true,
        }),
      });
      return { ok: true };
    }
    throw new Error(`unknown tool ${name}`);
  },
};

// ── Slack ────────────────────────────────────────────────────────────────────
const SLACK = 'https://slack.com/api';
async function slackCall(method: string, token: string, init?: RequestInit): Promise<any> {
  const j = await jfetch(`${SLACK}/${method}`, token, init);
  if (j && j.ok === false) throw new Error(`slack: ${j.error}`);
  return j;
}
const slack: NativeProvider = {
  tools: [
    { name: 'list_channels', description: 'List Slack channels the bot can see.',
      inputSchema: obj({ limit: N('Max channels (default 50)') }) },
    { name: 'post_message', description: 'Post a message to a Slack channel.',
      inputSchema: obj({ channel: S('Channel id or #name'), text: S('Message text') }, ['channel', 'text']) },
    { name: 'channel_history', description: 'Read recent messages from a channel.',
      inputSchema: obj({ channel: S('Channel id'), limit: N('Max messages (default 20)') }, ['channel']) },
    { name: 'list_users', description: 'List Slack workspace users.',
      inputSchema: obj({ limit: N('Max users (default 50)') }) },
  ],
  handle: async (name, a, token) => {
    if (name === 'list_channels') {
      const j = await slackCall(
        `conversations.list?types=public_channel,private_channel&limit=${num(a.limit, 50, 200)}`, token,
      );
      return { channels: (j?.channels ?? []).map((c: any) => ({ id: c.id, name: c.name, is_private: c.is_private, num_members: c.num_members })) };
    }
    if (name === 'post_message') {
      const j = await slackCall('chat.postMessage', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: str(a.channel), text: str(a.text) }),
      });
      return { ok: true, ts: j?.ts, channel: j?.channel };
    }
    if (name === 'channel_history') {
      const j = await slackCall(
        `conversations.history?channel=${encodeURIComponent(str(a.channel))}&limit=${num(a.limit, 20, 100)}`, token,
      );
      return { messages: (j?.messages ?? []).map((m: any) => ({ user: m.user, text: m.text, ts: m.ts })) };
    }
    if (name === 'list_users') {
      const j = await slackCall(`users.list?limit=${num(a.limit, 50, 200)}`, token);
      return { users: (j?.members ?? []).map((u: any) => ({ id: u.id, name: u.name, real_name: u.real_name, is_bot: u.is_bot })) };
    }
    throw new Error(`unknown tool ${name}`);
  },
};

// ── registry ─────────────────────────────────────────────────────────────────
const PROVIDERS: Record<string, NativeProvider> = {
  'google-drive': googleDrive,
  gmail,
  'google-calendar': googleCalendar,
  'microsoft-365': microsoft365,
  slack,
};

export function hasNative(slug: string): boolean {
  return slug in PROVIDERS;
}

/** An McpConn whose tools call the vendor REST API with a freshly-refreshed token. */
export function nativeConn(userId: string, slug: string): McpConn | null {
  const provider = PROVIDERS[slug];
  if (!provider) return null;
  return {
    async listTools() {
      return provider.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    },
    async callTool(name, args) {
      const token = await getFreshAccessToken(userId, slug);
      if (!token) throw new Error(`${slug} is not connected`);
      return provider.handle(name, args ?? {}, token);
    },
    async close() { /* nothing to close */ },
  };
}
