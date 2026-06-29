/**
 * Workflow storage — dual-adapter pattern matching lib/storage.
 *
 * - LocalWorkflowStorage: persists to localStorage under 'lucy-workflows'
 * - SupabaseWorkflowStorage: persists to workflows table
 *
 * The active adapter is chosen by WorkflowStorageProvider based on
 * whether Supabase env vars are configured (mirrors the chat storage pattern).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Workflow } from './types';
import { isSupabaseEnabled, getSupabaseClient } from '@/lib/supabase/client';

// ─── Interface ─────────────────────────────────────────────────────────────

export interface WorkflowStorageAdapter {
  listWorkflows(): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow | null>;
  saveWorkflow(workflow: Workflow): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error(`[WorkflowStorage] Failed to write key "${key}"`);
  }
}

const STORAGE_KEY = 'lucy-workflows';

// ─── LocalWorkflowStorage ─────────────────────────────────────────────────

export class LocalWorkflowStorage implements WorkflowStorageAdapter {
  async listWorkflows(): Promise<Workflow[]> {
    const workflows = readJSON<Workflow[]>(STORAGE_KEY, []);
    return workflows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const all = await this.listWorkflows();
    return all.find((w) => w.id === id) ?? null;
  }

  async saveWorkflow(workflow: Workflow): Promise<Workflow> {
    const all = readJSON<Workflow[]>(STORAGE_KEY, []);
    const now = Date.now();

    if (!workflow.id || workflow.id === '') {
      const newWorkflow: Workflow = { ...workflow, id: generateId(), createdAt: now, updatedAt: now };
      writeJSON(STORAGE_KEY, [newWorkflow, ...all]);
      return newWorkflow;
    }

    const existingIndex = all.findIndex((w) => w.id === workflow.id);
    const updated = { ...workflow, updatedAt: now };

    if (existingIndex >= 0) {
      all[existingIndex] = updated;
    } else {
      all.unshift(updated);
    }

    writeJSON(STORAGE_KEY, all);
    return updated;
  }

  async deleteWorkflow(id: string): Promise<void> {
    const all = readJSON<Workflow[]>(STORAGE_KEY, []);
    writeJSON(STORAGE_KEY, all.filter((w) => w.id !== id));
  }
}

// ─── SupabaseWorkflowStorage ───────────────────────────────────────────────

type SupabaseRow = Record<string, unknown>;

export class SupabaseWorkflowStorage implements WorkflowStorageAdapter {
  constructor(private client: SupabaseClient) {}

  async listWorkflows(): Promise<Workflow[]> {
    const result = await (this.client as SupabaseClient)
      .from('workflows')
      .select('*')
      .order('updated_at', { ascending: false });

    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as SupabaseRow[]).map((r) => this.rowToWorkflow(r));
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const result = await (this.client as SupabaseClient)
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();

    if (result.error) return null;
    return this.rowToWorkflow(result.data as SupabaseRow);
  }

  async saveWorkflow(workflow: Workflow): Promise<Workflow> {
    const authResult = await (this.client as SupabaseClient).auth.getUser();
    const user = authResult.data?.user;

    const row = {
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes,
      edges: workflow.edges,
      is_published: workflow.isPublished,
      user_id: user?.id,
      updated_at: new Date().toISOString(),
    };

    if (workflow.id && !workflow.id.startsWith('wf_')) {
      // Real UUID — upsert
      const result = await (this.client as SupabaseClient)
        .from('workflows')
        .upsert({ id: workflow.id, ...row })
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      return this.rowToWorkflow(result.data as SupabaseRow);
    } else {
      // New workflow — insert
      const result = await (this.client as SupabaseClient)
        .from('workflows')
        .insert(row)
        .select()
        .single();
      if (result.error) throw new Error(result.error.message);
      return this.rowToWorkflow(result.data as SupabaseRow);
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    const result = await (this.client as SupabaseClient)
      .from('workflows')
      .delete()
      .eq('id', id);
    if (result.error) throw new Error(result.error.message);
  }

  private rowToWorkflow(row: SupabaseRow): Workflow {
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      nodes: (row.nodes as Workflow['nodes']) ?? [],
      edges: (row.edges as Workflow['edges']) ?? [],
      isPublished: Boolean(row.is_published ?? false),
      createdAt: new Date(String(row.created_at ?? '')).getTime(),
      updatedAt: new Date(String(row.updated_at ?? '')).getTime(),
    };
  }
}

// ─── Adapter selection ─────────────────────────────────────────────────────

/**
 * Pick the workflow storage adapter for the current mode:
 * Supabase (durable, cross-device, per-user via RLS) when connected + a browser
 * client is available, else localStorage. Mirrors the chat StorageProvider.
 */
export function getWorkflowStorage(): WorkflowStorageAdapter {
  if (isSupabaseEnabled()) {
    const client = getSupabaseClient();
    if (client) return new SupabaseWorkflowStorage(client);
  }
  return new LocalWorkflowStorage();
}
