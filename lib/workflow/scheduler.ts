// lib/workflow/scheduler.ts
/**
 * Cron pass for the workflow worker. Enqueues a queued run for every due cron
 * trigger (from its definition snapshot) and advances next_run_at. Reuses the
 * Phase 1 "enqueue = insert a workflow_runs row" path.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { nextRunAfter } from './cron';

interface CronTriggerRow {
  id: string;
  user_id: string;
  workflow_id: string | null;
  name: string;
  settings: { expr?: string; timezone?: string; run_once?: boolean; run_at?: string } | null;
  definition: unknown;
  inputs: Record<string, string> | null;
  next_run_at: string | null;
}

export async function enqueueDueCronTriggers(client: SupabaseClient, now: Date = new Date()): Promise<number> {
  const iso = now.toISOString();
  const { data, error } = await client
    .from('workflow_triggers')
    .select('id, user_id, workflow_id, name, settings, definition, inputs, next_run_at')
    .eq('type', 'cron')
    .eq('enabled', true)
    .or(`next_run_at.is.null,next_run_at.lte.${iso}`);
  if (error || !data) return 0;

  let count = 0;
  for (const t of data as CronTriggerRow[]) {
    const once = !!t.settings?.run_once;
    const expr = t.settings?.expr;
    if (!once && !expr) continue;

    // Idempotency key per due slot: a double-fire for the same scheduled time
    // (e.g. after a restart) is deduped by the unique index, not double-run.
    const dueSlot = t.next_run_at ?? iso;
    const { error: insErr } = await client.from('workflow_runs').insert({
      user_id: t.user_id,
      workflow_id: t.workflow_id,
      name: t.name,
      definition: t.definition,
      inputs: t.inputs ?? {},
      status: 'queued',
      enqueued_at: iso,
      trigger: once ? 'once' : 'cron',
      max_attempts: 3,
      idempotency_key: `cron:${t.id}:${dueSlot}`,
    });
    const isDup = !!insErr && (insErr as { code?: string }).code === '23505';
    if (insErr && !isDup) continue; // real error: leave it due, retry next tick

    if (once) {
      // One-shot: fire once, then disable (don't reschedule).
      await client
        .from('workflow_triggers')
        .update({ next_run_at: null, enabled: false, last_enqueued_at: iso })
        .eq('id', t.id);
    } else {
      const next = nextRunAfter(expr as string, now, t.settings?.timezone);
      await client
        .from('workflow_triggers')
        .update({ next_run_at: next ? next.toISOString() : null, last_enqueued_at: iso })
        .eq('id', t.id);
    }
    if (!isDup) count++;
  }
  return count;
}
