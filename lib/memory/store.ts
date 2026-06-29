import type {
  MemoryRecord, MemoryWrite, ReconcileWrite, EntityWrite, Profile, MemoryScope,
  SearchOptions, MemoryVisibility, UsageStats, ContradictionPolicy,
} from './types';

export interface MemoryStore {
  getProfile(scope: MemoryScope): Promise<Profile | null>;
  upsertProfile(scope: MemoryScope, patch: Record<string, unknown>): Promise<void>;
  store(scope: MemoryScope, memories: MemoryWrite[]): Promise<MemoryRecord[]>;
  /** Apply ADD/UPDATE/MERGE writes, honoring the contradiction policy. */
  reconcile(scope: MemoryScope, items: ReconcileWrite[], policy: ContradictionPolicy): Promise<void>;
  search(scope: MemoryScope, query: string, opts?: SearchOptions): Promise<MemoryRecord[]>;
  touch(ids: string[]): Promise<void>;
  promote(id: string, visibility: MemoryVisibility): Promise<void>;
  touchEntities(scope: MemoryScope, entities: EntityWrite[]): Promise<void>;
  /** occurrence_count per normalized entity name (drives salience-weighted importance). */
  entitySalience(scope: MemoryScope, normalizedNames: string[]): Promise<Record<string, number>>;
  archive(id: string): Promise<void>;
  purgeExpiredArchives(graceDays: number): Promise<number>;
  decay(scope: MemoryScope): Promise<void>;
  usage(scope: MemoryScope): Promise<UsageStats>;
  listAll(scope: MemoryScope): Promise<MemoryRecord[]>;
}
