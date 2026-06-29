import { z } from 'zod';

export type MemoryType = 'semantic' | 'pragmatic' | 'episodic';
export type MemoryVisibility = 'private' | 'project' | 'global';
export type MemorySource = 'extracted' | 'user_remember' | 'user_global' | 'admin';
export type ContradictionPolicy = 'supersede' | 'keep_history';

export interface MemoryScope {
  userId: string | null;
  projectId?: string | null;
}

export interface MemoryRecord {
  id: string;
  userId: string | null;
  projectId?: string | null;
  type: MemoryType;
  category?: string;
  content: string;
  summary?: string;
  importance: number;
  visibility: MemoryVisibility;
  source: MemorySource;
  sourceConversationId?: string | null;
  accessCount: number;
  lastAccessed?: number | null;
  validAt?: number | null;
  invalidAt?: number | null;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number | null;
}

export interface MemoryWrite {
  type: MemoryType;
  category?: string;
  content: string;
  summary?: string;
  importance?: number;
  visibility?: MemoryVisibility;
  source?: MemorySource;
  sourceConversationId?: string | null;
  validAt?: number | null;
}

/** A write tagged with the LLM's reconciliation intent. */
export interface ReconcileWrite extends MemoryWrite {
  op: 'ADD' | 'UPDATE' | 'MERGE';
  /** Existing memory id to update/merge into (when op is UPDATE/MERGE). */
  targetId?: string;
}

export interface EntityRecord {
  id: string;
  name: string;
  normalizedName: string;
  type?: string;
  occurrenceCount: number;
  importance: number;
  visibility: MemoryVisibility;
  firstSeen: number;
  lastSeen: number;
}

export interface EntityWrite {
  name: string;
  type?: string;
}

export interface Profile {
  data: Record<string, unknown>;
  updatedAt: number;
}

export interface SearchOptions {
  limit?: number;
  types?: MemoryType[];
  tokenBudget?: number;
}

export interface UsageStats {
  memories: number;
  entities: number;
  bytes: number;
}

// ── Extraction (LLM output) schemas ────────────────────────────────────────────

export const MEMORY_TYPES = ['semantic', 'pragmatic', 'episodic'] as const;

export const ExtractedMemorySchema = z.object({
  op: z.enum(['ADD', 'UPDATE', 'MERGE', 'SKIP']),
  id: z.string().optional(),
  type: z.enum(MEMORY_TYPES),
  category: z.string().optional(),
  content: z.string().min(1),
  summary: z.string().optional(),
  importance: z.number().int().min(1).max(10).default(5),
});

export const ExtractedEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
});

export const ExtractionResultSchema = z.object({
  memories: z.array(ExtractedMemorySchema).default([]),
  entities: z.array(ExtractedEntitySchema).default([]),
  profilePatch: z.record(z.unknown()).default({}),
});

export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
