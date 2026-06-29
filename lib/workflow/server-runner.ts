// lib/workflow/server-runner.ts
/**
 * Server-side execution of a queued workflow run. Decrypts the run owner's
 * provider keys, injects server-safe engine deps, persists per-node logs as they
 * arrive, then writes the final status.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkflowEngine, WorkflowCanceledError } from './engine';
import type { Workflow, ExecutionLogEntry } from './types';
import { decryptProviderKey } from '@/lib/auth/provider-keys';
import { SupabaseMemoryStore } from '@/lib/memory/supabase-store';
import type { MemoryRecord } from '@/lib/memory/types';
import { nextBackoffMs } from './backoff';

export interface WorkflowRunRow {
  id: string;
  user_id: string;
  definition: Workflow;
  inputs: Record<string, string> | null;
  /** Current attempt number (incremented by claim_workflow_run). */
  attempt?: number;
  /** Max attempts before the run is marked failed. */
  max_attempts?: number;
}

const LOG_FLUSH_MS = 1000;

export async function executeRun(run: WorkflowRunRow, client: SupabaseClient): Promise<void> {
  // 0) Guard: a run whose definition snapshot is missing or has no node list can
  // never execute. Fail it immediately so it leaves the queue, instead of letting
  // `new WorkflowEngine(run.definition)` throw on `definition.nodes` and crash the
  // worker tick on every poll.
  const def = run.definition as Workflow | null | undefined;
  if (!def || !Array.isArray(def.nodes)) {
    await client.from('workflow_runs').update({
      status: 'failed',
      error: 'Invalid workflow definition (no nodes)',
      completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    return;
  }

  // 1) Decrypt the owner's provider keys.
  const apiKeys: Record<string, string> = {};
  try {
    const { data: cfgs } = await client
      .from('provider_configs')
      .select('provider, api_key_encrypted')
      .eq('user_id', run.user_id)
      .eq('is_active', true);
    for (const c of (cfgs ?? []) as { provider: string; api_key_encrypted: string }[]) {
      const key = decryptProviderKey(c.api_key_encrypted);
      if (key) apiKeys[c.provider] = key;
    }
  } catch {
    /* no keys → LLM nodes will fail with a clear message */
  }

  // 2) Server-safe engine deps.
  const deps = {
    searchKnowledgeBase: async (query: string, topK: number): Promise<string> => {
      const store = new SupabaseMemoryStore(client, { apiKey: '' });
      const records = await store.search({ userId: run.user_id, projectId: null }, query, { limit: topK });
      if (!records.length) return `No relevant memories found for: ${query}`;
      return records
        .map((r: MemoryRecord, i: number) => `${i + 1}. ${r.content}`)
        .join('\n');
    },
    supabaseClient: client,
    sendEmail: async (to: string, subject: string, body: string): Promise<void> => {
      const { sendRawEmail } = await import('@/lib/email/send');
      await sendRawEmail(to, subject, body);
    },
  };

  // 3) Run with throttled log persistence.
  const logs: ExecutionLogEntry[] = [];
  let lastFlush = 0;
  const flush = async (final = false) => {
    const now = Date.now();
    if (!final && now - lastFlush < LOG_FLUSH_MS) return;
    lastFlush = now;
    await client.from('workflow_runs').update({ logs }).eq('id', run.id);
  };

  // Throttled cancel check (reads workflow_runs.cancel_requested at most every 2s).
  let lastCancelCheck = 0;
  let cachedCancel = false;
  const shouldCancel = async (): Promise<boolean> => {
    const now = Date.now();
    if (now - lastCancelCheck < 2000) return cachedCancel;
    lastCancelCheck = now;
    const { data } = await client.from('workflow_runs').select('cancel_requested').eq('id', run.id).single();
    cachedCancel = Boolean((data as { cancel_requested?: boolean } | null)?.cancel_requested);
    return cachedCancel;
  };

  const engine = new WorkflowEngine(
    run.definition,
    { onLog: (e) => { logs.push(e); void flush(); }, shouldCancel },
    deps
  );

  // On failure, retry with exponential backoff until max_attempts is reached.
  const attempt = run.attempt ?? 1;
  const maxAttempts = run.max_attempts ?? 1;
  const failOrRetry = async (errMsg: string, logsToWrite: ExecutionLogEntry[]) => {
    if (attempt < maxAttempts) {
      await client.from('workflow_runs').update({
        status: 'queued',
        next_attempt_at: new Date(Date.now() + nextBackoffMs(attempt)).toISOString(),
        error: errMsg,
        logs: logsToWrite,
      }).eq('id', run.id);
    } else {
      await client.from('workflow_runs').update({
        status: 'failed',
        error: errMsg,
        logs: logsToWrite,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id);
    }
  };

  try {
    const result = await engine.execute(run.inputs ?? {}, apiKeys);
    if (result.status === 'completed') {
      await client.from('workflow_runs').update({
        status: 'succeeded',
        outputs: { finalOutput: result.finalOutput ?? null },
        error: null,
        logs: result.logs,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id);
    } else {
      await failOrRetry(result.error ?? 'Workflow failed', result.logs);
    }
  } catch (err) {
    if (err instanceof WorkflowCanceledError) {
      await client.from('workflow_runs').update({
        status: 'canceled',
        error: null,
        logs,
        completed_at: new Date().toISOString(),
      }).eq('id', run.id);
    } else {
      await failOrRetry(err instanceof Error ? err.message : String(err), logs);
    }
  }
}
