import { processRecordEvents } from '../record-events';

interface Rec { inserts: Record<string, unknown>[]; deletedIds: string[] }

function fakeClient(events: unknown[], triggers: unknown[], rec: Rec) {
  const make = (resolveData: unknown) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      delete: () => ({ in: async (_col: string, ids: string[]) => { rec.deletedIds.push(...ids); return { error: null }; } }),
      update: () => ({ in: async () => ({ error: null }) }), // last_enqueued_at bump — no-op here
      insert: async (row: Record<string, unknown>) => { rec.inserts.push(row); return { error: null }; },
      then: (res: (v: { data: unknown; error: null }) => void) => res({ data: resolveData, error: null }),
    };
    return chain;
  };
  return {
    from(table: string) {
      if (table === 'workflow_events') return make(events);
      if (table === 'workflow_triggers') return make(triggers);
      return make(null); // workflow_runs.insert
    },
  } as never;
}

const trigDef = { name: 'W', nodes: [], edges: [] };
const matchTrigger = {
  id: 't1', user_id: 'u1', workflow_id: null, name: 'OnConv',
  settings: { table: 'conversations', events: ['INSERT'] },
  definition: trigDef, inputs: {},
};

describe('processRecordEvents', () => {
  it('enqueues a run for a matching event owned by the trigger user, deletes the batch', async () => {
    const rec: Rec = { inserts: [], deletedIds: [] };
    const events = [{ id: 'e1', table_name: 'conversations', op: 'INSERT', record: { user_id: 'u1', title: 'hi' } }];
    const n = await processRecordEvents(fakeClient(events, [matchTrigger], rec));
    expect(n).toBe(1);
    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0]).toMatchObject({ user_id: 'u1', status: 'queued', trigger: 'record_event' });
    expect(rec.inserts[0].inputs).toMatchObject({ event_table: 'conversations', event_op: 'INSERT' });
    expect(rec.deletedIds).toEqual(['e1']);
  });

  it('does NOT fire for a record owned by a different user (tenant isolation)', async () => {
    const rec: Rec = { inserts: [], deletedIds: [] };
    const events = [{ id: 'e3', table_name: 'conversations', op: 'INSERT', record: { user_id: 'someone-else', title: 'hi' } }];
    const n = await processRecordEvents(fakeClient(events, [matchTrigger], rec));
    expect(n).toBe(0);
    expect(rec.inserts).toHaveLength(0);
    expect(rec.deletedIds).toEqual(['e3']);
  });

  it('deletes a non-matching event without enqueuing', async () => {
    const rec: Rec = { inserts: [], deletedIds: [] };
    const events = [{ id: 'e2', table_name: 'memories', op: 'DELETE', record: {} }];
    const n = await processRecordEvents(fakeClient(events, [matchTrigger], rec));
    expect(n).toBe(0);
    expect(rec.inserts).toHaveLength(0);
    expect(rec.deletedIds).toEqual(['e2']);
  });

  it('returns 0 when there are no events', async () => {
    const rec: Rec = { inserts: [], deletedIds: [] };
    const n = await processRecordEvents(fakeClient([], [matchTrigger], rec));
    expect(n).toBe(0);
    expect(rec.inserts).toHaveLength(0);
  });

  const changeTrigger = {
    ...matchTrigger,
    settings: { table: 'conversations', events: ['UPDATE'], when: { field: 'title', changed: true } },
  };

  it('fires when the watched field changed, and passes record_old into inputs', async () => {
    const rec: Rec = { inserts: [], deletedIds: [] };
    const events = [{ id: 'e4', table_name: 'conversations', op: 'UPDATE', record: { user_id: 'u1', title: 'new' }, old_record: { user_id: 'u1', title: 'old' } }];
    const n = await processRecordEvents(fakeClient(events, [changeTrigger], rec));
    expect(n).toBe(1);
    expect(rec.inserts[0].inputs).toMatchObject({ record_old: JSON.stringify({ user_id: 'u1', title: 'old' }) });
  });

  it('does NOT fire when the watched field is unchanged (but still consumes the event)', async () => {
    const rec: Rec = { inserts: [], deletedIds: [] };
    const events = [{ id: 'e5', table_name: 'conversations', op: 'UPDATE', record: { user_id: 'u1', title: 'same' }, old_record: { user_id: 'u1', title: 'same' } }];
    const n = await processRecordEvents(fakeClient(events, [changeTrigger], rec));
    expect(n).toBe(0);
    expect(rec.inserts).toHaveLength(0);
    expect(rec.deletedIds).toEqual(['e5']);
  });

  it('respects when.to — fires only when the new value equals the target', async () => {
    const rec: Rec = { inserts: [], deletedIds: [] };
    const trig = { ...matchTrigger, settings: { table: 'conversations', events: ['UPDATE'], when: { field: 'status', changed: true, to: 'done' } } };
    const events = [
      { id: 'e6', table_name: 'conversations', op: 'UPDATE', record: { user_id: 'u1', status: 'done' }, old_record: { user_id: 'u1', status: 'open' } },
      { id: 'e7', table_name: 'conversations', op: 'UPDATE', record: { user_id: 'u1', status: 'wip' }, old_record: { user_id: 'u1', status: 'open' } },
    ];
    const n = await processRecordEvents(fakeClient(events, [trig], rec));
    expect(n).toBe(1);
  });
});
