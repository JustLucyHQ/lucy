import type { MemoryStore } from './store';
import type {
  MemoryRecord, MemoryWrite, ReconcileWrite, EntityWrite, Profile,
  MemoryScope, SearchOptions, MemoryVisibility, UsageStats, ContradictionPolicy,
} from './types';
import { mergeProfile, normalizeEntityName } from './profile';
import { rankScore } from './scoring';

/** Minimal async KV backing (IndexedDB or in-memory map for tests). */
export interface MemoryKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** Entity row with the owning user id (kept internal — not part of the public EntityRecord). */
interface StoredEntity {
  id: string;
  userId: string | null;
  name: string;
  normalizedName: string;
  type?: string;
  occurrenceCount: number;
  importance: number;
  visibility: MemoryVisibility;
  firstSeen: number;
  lastSeen: number;
}

interface LocalData {
  memories: MemoryRecord[];
  entities: StoredEntity[];
  profiles: Record<string, Profile>;
}

const KEY = 'lucy-memory-v1';

function uid(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function profileKey(scope: MemoryScope): string {
  return `${scope.userId ?? 'anon'}::${scope.projectId ?? 'global'}`;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export class LocalMemoryStore implements MemoryStore {
  constructor(private kv: MemoryKV) {}

  private async read(): Promise<LocalData> {
    const raw = await this.kv.get(KEY);
    if (!raw) return { memories: [], entities: [], profiles: {} };
    try {
      return JSON.parse(raw) as LocalData;
    } catch {
      return { memories: [], entities: [], profiles: {} };
    }
  }

  private async write(data: LocalData): Promise<void> {
    await this.kv.set(KEY, JSON.stringify(data));
  }

  private inScope(m: MemoryRecord, scope: MemoryScope): boolean {
    if (m.invalidAt) return false;
    if (m.visibility === 'global') return true;
    return m.userId === scope.userId;
  }

  async getProfile(scope: MemoryScope): Promise<Profile | null> {
    const data = await this.read();
    return data.profiles[profileKey(scope)] ?? null;
  }

  async upsertProfile(scope: MemoryScope, patch: Record<string, unknown>): Promise<void> {
    const data = await this.read();
    const k = profileKey(scope);
    const current = data.profiles[k]?.data ?? {};
    data.profiles[k] = { data: mergeProfile(current, patch), updatedAt: Date.now() };
    await this.write(data);
  }

  private newRecord(scope: MemoryScope, w: MemoryWrite, now: number): MemoryRecord {
    return {
      id: uid(),
      userId: scope.userId,
      projectId: scope.projectId ?? null,
      type: w.type,
      category: w.category,
      content: w.content,
      summary: w.summary,
      importance: w.importance ?? 5,
      visibility: w.visibility ?? 'private',
      source: w.source ?? 'extracted',
      sourceConversationId: w.sourceConversationId ?? null,
      accessCount: 0,
      validAt: w.validAt ?? null,
      invalidAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async store(scope: MemoryScope, memories: MemoryWrite[]): Promise<MemoryRecord[]> {
    const data = await this.read();
    const now = Date.now();
    const created = memories.map((w) => this.newRecord(scope, w, now));
    data.memories.push(...created);
    await this.write(data);
    return created;
  }

  async reconcile(
    scope: MemoryScope,
    items: ReconcileWrite[],
    policy: ContradictionPolicy
  ): Promise<void> {
    if (items.length === 0) return;
    const data = await this.read();
    const now = Date.now();
    for (const it of items) {
      const target =
        it.op !== 'ADD' && it.targetId
          ? data.memories.find(
              (m) => m.id === it.targetId && m.userId === scope.userId && !m.invalidAt
            )
          : undefined;

      if (!target) {
        // ADD, or UPDATE/MERGE whose target vanished → insert fresh.
        data.memories.push(this.newRecord(scope, it, now));
        continue;
      }

      if (policy === 'keep_history') {
        // Preserve the old version (marked invalid) and add the new one (audit trail).
        target.invalidAt = now;
        data.memories.push(this.newRecord(scope, it, now));
      } else {
        // supersede: overwrite the existing row in place (lean — current truth only).
        target.content = it.content;
        if (it.summary) target.summary = it.summary;
        target.importance = Math.max(target.importance, it.importance ?? target.importance);
        target.updatedAt = now;
      }
    }
    await this.write(data);
  }

  async search(scope: MemoryScope, query: string, opts: SearchOptions = {}): Promise<MemoryRecord[]> {
    const data = await this.read();
    const qTokens = new Set(tokenize(query));
    const candidates = data.memories.filter(
      (m) => this.inScope(m, scope) && (!opts.types || opts.types.includes(m.type))
    );
    const now = Date.now();
    const scored = candidates.map((m) => {
      const mTokens = tokenize(`${m.content} ${m.summary ?? ''} ${m.category ?? ''}`);
      const overlap = mTokens.filter((t) => qTokens.has(t)).length;
      const base = mTokens.length ? overlap / Math.sqrt(mTokens.length) : 0;
      const ageDays = (now - m.createdAt) / 86_400_000;
      return { m, score: rankScore({ base, importance: m.importance, ageDays, accessCount: m.accessCount }) };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 12)
      .map((s) => s.m);
  }

  async touch(ids: string[]): Promise<void> {
    const data = await this.read();
    const set = new Set(ids);
    const now = Date.now();
    for (const m of data.memories) {
      if (set.has(m.id)) {
        m.accessCount += 1;
        m.lastAccessed = now;
      }
    }
    await this.write(data);
  }

  async promote(id: string, visibility: MemoryVisibility): Promise<void> {
    const data = await this.read();
    const m = data.memories.find((x) => x.id === id);
    if (m) {
      m.visibility = visibility;
      m.updatedAt = Date.now();
      await this.write(data);
    }
  }

  async touchEntities(scope: MemoryScope, entities: EntityWrite[]): Promise<void> {
    const data = await this.read();
    const now = Date.now();
    for (const e of entities) {
      const norm = normalizeEntityName(e.name);
      const existing = data.entities.find(
        (x) => x.userId === scope.userId && x.normalizedName === norm
      );
      if (existing) {
        existing.occurrenceCount += 1;
        existing.lastSeen = now;
        existing.importance = Math.min(10, existing.importance + 1);
      } else {
        data.entities.push({
          id: uid(),
          userId: scope.userId,
          name: e.name,
          normalizedName: norm,
          type: e.type,
          occurrenceCount: 1,
          importance: 5,
          visibility: 'private',
          firstSeen: now,
          lastSeen: now,
        });
      }
    }
    await this.write(data);
  }

  async entitySalience(
    scope: MemoryScope,
    normalizedNames: string[]
  ): Promise<Record<string, number>> {
    if (normalizedNames.length === 0) return {};
    const data = await this.read();
    const want = new Set(normalizedNames);
    const out: Record<string, number> = {};
    for (const e of data.entities) {
      if (e.userId === scope.userId && want.has(e.normalizedName)) {
        out[e.normalizedName] = e.occurrenceCount;
      }
    }
    return out;
  }

  async archive(id: string): Promise<void> {
    const data = await this.read();
    data.memories = data.memories.filter((m) => m.id !== id);
    await this.write(data);
  }

  async purgeExpiredArchives(graceDays: number): Promise<number> {
    void graceDays; // local mode hard-deletes immediately in archive(); param kept for interface parity
    return 0;
  }

  // Local-mode hard decay: drop low-importance, old, never-reinforced memories.
  // Accessed memories (accessCount > 0) are kept (reinforcement).
  async decay(scope: MemoryScope): Promise<void> {
    const data = await this.read();
    const now = Date.now();
    const before = data.memories.length;
    data.memories = data.memories.filter((m) => {
      if (!this.inScope(m, scope)) return true;
      const ageDays = (now - (m.lastAccessed ?? m.createdAt)) / 86_400_000;
      return !(m.importance <= 2 && ageDays > 90 && m.accessCount === 0);
    });
    if (data.memories.length !== before) await this.write(data);
  }

  async usage(scope: MemoryScope): Promise<UsageStats> {
    const data = await this.read();
    const mine = data.memories.filter((m) => this.inScope(m, scope));
    const ents = data.entities.filter((e) => e.userId === scope.userId);
    const bytes = JSON.stringify({ mine, ents }).length;
    return { memories: mine.length, entities: ents.length, bytes };
  }

  async listAll(scope: MemoryScope): Promise<MemoryRecord[]> {
    const data = await this.read();
    return data.memories
      .filter((m) => this.inScope(m, scope))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}
