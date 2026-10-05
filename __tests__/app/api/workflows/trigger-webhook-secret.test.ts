/**
 * @jest-environment node
 */
// Secrets at rest: a webhook trigger's secret (workflow_triggers.secret) is stored encrypted (lib/mcp/secret.ts) and opened
// only on the server — to check the caller's token / HMAC signature, and to show it to the trigger's owner.

import { createHmac } from 'crypto';

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-trigger-secrets';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';

let triggerRow: Record<string, unknown> | null = null;
let triggersList: Record<string, unknown>[] = [];
let inserted: Record<string, unknown> | null = null;

jest.mock('@/lib/api/rate-limit', () => ({ checkRateLimit: () => ({ limited: false }), getClientIp: () => '127.0.0.1' }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: (table: string) => {
      if (table === 'workflow_triggers') {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          single: async () => ({ data: triggerRow, error: null }),
          update: () => ({ eq: () => ({ then: (f: () => void) => f() }) }),
        };
        return q;
      }
      return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'run-1' }, error: null }) }) }) };
    },
  })),
}));
jest.mock('@/lib/memory/auth', () => ({
  resolveMemoryAuth: jest.fn(async () => ({
    userId: 'user-1',
    client: {
      from: () => {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          order: () => q,
          then: (resolve: (v: unknown) => unknown) => resolve({ data: triggersList, error: null }),
          insert: (row: Record<string, unknown>) => {
            inserted = row;
            return { select: () => ({ single: async () => ({ data: { id: 't-new', ...row }, error: null }) }) };
          },
        };
        return q;
      },
    },
  })),
}));

import { encryptSecret } from '@/lib/mcp/secret';
import { POST as webhook } from '@/app/api/workflows/triggers/[id]/webhook/route';
import { GET as listTriggers, POST as createTrigger } from '@/app/api/workflows/triggers/route';

const SECRET = 'webhookSecret_abcdefghijklmnop';
const base = { id: 't1', user_id: 'user-1', workflow_id: 'wf-1', name: 'n', definition: {}, inputs: {}, enabled: true, type: 'webhook' };

function req(url: string, body = '{}', headers: Record<string, string> = {}): any {
  return {
    url,
    nextUrl: new URL(url),
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body),
    cookies: { get: () => undefined },
  };
}
const call = (r: any) => webhook(r, { params: Promise.resolve({ id: 't1' }) } as any);

describe('workflow webhook trigger secret at rest', () => {
  it('an encrypted secret still authorises the token and the HMAC signature', async () => {
    triggerRow = { ...base, secret: encryptSecret(SECRET) };
    expect((await call(req(`https://x.test/api/workflows/triggers/t1/webhook?token=${SECRET}`))).status).toBe(200);
    const body = '{"a":1}';
    const sig = createHmac('sha256', SECRET).update(body).digest('hex');
    expect((await call(req('https://x.test/api/workflows/triggers/t1/webhook', body, { 'x-signature': `sha256=${sig}` }))).status).toBe(200);
  });

  it('the ciphertext itself is not a valid token, nor is a wrong one', async () => {
    const enc = encryptSecret(SECRET);
    triggerRow = { ...base, secret: enc };
    expect((await call(req(`https://x.test/api/workflows/triggers/t1/webhook?token=${encodeURIComponent(enc)}`))).status).toBe(401);
    expect((await call(req('https://x.test/api/workflows/triggers/t1/webhook?token=wrong'))).status).toBe(401);
  });

  it('a legacy plaintext secret still works (rollout before the backfill)', async () => {
    triggerRow = { ...base, secret: SECRET };
    expect((await call(req(`https://x.test/api/workflows/triggers/t1/webhook?token=${SECRET}`))).status).toBe(200);
  });

  it('a new webhook trigger stores the secret encrypted and hands the owner the plaintext once', async () => {
    const definition = { name: 'wf', nodes: [{ id: 's', data: { nodeType: 'start' } }], edges: [] };
    const r = await createTrigger(req('https://x.test/api/workflows/triggers', JSON.stringify({ workflowId: '11111111-1111-4111-8111-111111111111', name: 'hook', type: 'webhook', settings: {}, definition, inputs: {} })));
    expect(r.status).toBe(200);
    const out = await r.json();
    expect(String(inserted!.secret)).not.toBe(out.trigger.secret);
    expect(String(inserted!.secret)).not.toContain(out.trigger.secret);
    expect(out.trigger.secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('the owner\'s list shows the opened secret (encrypted and legacy rows)', async () => {
    triggersList = [{ id: 'a', secret: encryptSecret(SECRET) }, { id: 'b', secret: 'legacyPlain' }, { id: 'c', secret: null }];
    const out = await (await listTriggers(req('https://x.test/api/workflows/triggers'))).json();
    expect(out.triggers.map((t: { secret: string | null }) => t.secret)).toEqual([SECRET, 'legacyPlain', null]);
  });
});
