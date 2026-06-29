// lib/workflow/__tests__/scheduler.test.ts
import { enqueueDueCronTriggers } from '../scheduler';

interface Recorded { inserts: Record<string, unknown>[]; updates: Record<string, unknown>[] }

// Minimal fake of the supabase client surface enqueueDueCronTriggers uses.
function fakeClient(triggers: unknown[], rec: Recorded) {
  return {
    from(table: string) {
      if (table === 'workflow_triggers') {
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain,
          or: async () => ({ data: triggers, error: null }),
          update: (patch: Record<string, unknown>) => ({ eq: async () => { rec.updates.push(patch); return { error: null }; } }),
        };
        return chain;
      }
      // workflow_runs
      return { insert: async (row: Record<string, unknown>) => { rec.inserts.push(row); return { error: null }; } };
    },
  } as never;
}

const due = {
  id: 't1', user_id: 'u1', workflow_id: null, name: 'Nightly',
  settings: { expr: '0 9 * * *', timezone: 'UTC' },
  definition: { name: 'Nightly', nodes: [], edges: [] }, inputs: { a: '1' },
};

describe('enqueueDueCronTriggers', () => {
  it('enqueues a queued run from a due trigger and advances next_run_at', async () => {
    const rec: Recorded = { inserts: [], updates: [] };
    const now = new Date('2026-01-01T08:00:00.000Z');
    const n = await enqueueDueCronTriggers(fakeClient([due], rec), now);
    expect(n).toBe(1);
    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0]).toMatchObject({ user_id: 'u1', status: 'queued', trigger: 'cron', inputs: { a: '1' } });
    expect(rec.updates).toHaveLength(1);
    expect(rec.updates[0].next_run_at).toBe('2026-01-01T09:00:00.000Z');
    expect(rec.updates[0].last_enqueued_at).toBe(now.toISOString());
  });

  it('does nothing when no triggers are due', async () => {
    const rec: Recorded = { inserts: [], updates: [] };
    const n = await enqueueDueCronTriggers(fakeClient([], rec), new Date('2026-01-01T08:00:00.000Z'));
    expect(n).toBe(0);
    expect(rec.inserts).toHaveLength(0);
  });
});
