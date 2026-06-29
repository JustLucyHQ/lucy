// lib/workflow/worker.ts
/**
 * In-process workflow worker. Started once per server process (connected mode)
 * by instrumentation.ts. Drains the workflow_runs queue via the claim RPC.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { executeRun, type WorkflowRunRow } from './server-runner';
import { enqueueDueCronTriggers } from './scheduler';
import { processRecordEvents } from './record-events';

const POLL_MS = 3000;

export function startWorkflowWorker(): void {
  const g = globalThis as unknown as { __lucyWorkflowWorker?: boolean };
  if (g.__lucyWorkflowWorker) return;
  g.__lucyWorkflowWorker = true;

  const url = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  // Schema-scoped client; cast to the bare SupabaseClient type to match the
  // convention used elsewhere (e.g. lib/memory/auth.ts) and executeRun's param.
  const client = createClient(url, key, { db: { schema: 'lucy' } }) as unknown as SupabaseClient;

  // Boot reaper: any run left 'running' belongs to a dead process (single-instance
  // assumption — SKIP LOCKED already protects the claim path if that changes).
  void client
    .from('workflow_runs')
    .update({ status: 'failed', error: 'interrupted (server restart)', completed_at: new Date().toISOString() })
    .eq('status', 'running')
    .then(() => {});

  const tick = async (): Promise<void> => {
    try {
      // 1) Enqueue any due cron triggers + record events (so they run this tick).
      await enqueueDueCronTriggers(client);
      await processRecordEvents(client);
      // 2) Drain all currently-queued runs, one at a time.
      for (;;) {
        const { data, error } = await client.rpc('claim_workflow_run');
        if (error) { console.error('[workflow-worker] claim error:', error.message); break; }
        const run = (Array.isArray(data) ? data[0] : data) as WorkflowRunRow | null;
        // A scalar-composite RPC result can come back as an all-NULL row (no id) rather
        // than SQL NULL — treat that as an empty queue, not a real run.
        if (!run || !run.id) break;
        await executeRun(run, client);
      }
    } catch (e) {
      console.error('[workflow-worker] tick error:', e);
    }
    setTimeout(() => void tick(), POLL_MS);
  };

  void tick();
  console.log('[workflow-worker] started');
}
