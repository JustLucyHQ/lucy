// lib/workflow/record-events.ts
/**
 * Record-event pass for the workflow worker. Consumes lucy.workflow_events (rows
 * emitted by DB triggers on watched tables), enqueues a queued run for every
 * matching record_event trigger, then deletes the processed batch (queue
 * semantics — unmatched events are dropped too so the table stays small).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface EventRow { id: string; table_name: string; op: string; record: unknown }

interface RecordEventTrigger {
  id: string;
  user_id: string;
  workflow_id: string | null;
  name: string;
  settings: { table?: string; events?: string[] } | null;
  definition: unknown;
  inputs: Record<string, string> | null;
}

export async function processRecordEvents(client: SupabaseClient, limit = 100): Promise<number> {
  const { data: events, error } = await client
    .from('workflow_events')
    .select('id, table_name, op, record')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error || !events || events.length === 0) return 0;

  const { data: triggers } = await client
    .from('workflow_triggers')
    .select('id, user_id, workflow_id, name, settings, definition, inputs')
    .eq('type', 'record_event')
    .eq('enabled', true);
  const recTriggers = (triggers ?? []) as RecordEventTrigger[];

  let enqueued = 0;
  // Events whose enqueue hit a *transient* (non-dedupe) error are kept so the
  // next tick retries them; idempotency keys make re-processing safe.
  const keepEventIds = new Set<string>();
  for (const ev of events as EventRow[]) {
    const recordUserId = (ev.record as { user_id?: string } | null)?.user_id;
    for (const t of recTriggers) {
      if (t.settings?.table !== ev.table_name) continue;
      if (!Array.isArray(t.settings?.events) || !t.settings.events.includes(ev.op)) continue;
      // Tenant isolation: only fire for the trigger owner's own records.
      if (recordUserId !== t.user_id) continue;
      const { error: insErr } = await client.from('workflow_runs').insert({
        user_id: t.user_id,
        workflow_id: t.workflow_id,
        name: t.name,
        definition: t.definition,
        inputs: {
          ...(t.inputs ?? {}),
          event_table: ev.table_name,
          event_op: ev.op,
          record: JSON.stringify(ev.record ?? null),
        },
        status: 'queued',
        enqueued_at: new Date().toISOString(),
        trigger: 'record_event',
        max_attempts: 3,
        // Dedupe: a re-processed event (delete failed) won't double-enqueue, but
        // distinct triggers on the same event each get their own run.
        idempotency_key: `evt:${ev.id}:${t.id}`,
      });
      if (!insErr) enqueued++;
      else if ((insErr as { code?: string }).code !== '23505') keepEventIds.add(ev.id);
    }
  }

  // Delete processed events (matched, unmatched, or deduped) — but keep any that
  // hit a transient enqueue error so the next tick retries them.
  const toDelete = (events as EventRow[]).map((e) => e.id).filter((id) => !keepEventIds.has(id));
  if (toDelete.length) await client.from('workflow_events').delete().in('id', toDelete);
  return enqueued;
}
