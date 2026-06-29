import type { MemoryKV } from './local-store';

const DB_NAME = 'lucy-memory';
const STORE = 'kv';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB-backed MemoryKV for standalone mode. Falls back to localStorage on failure. */
export function createIndexedDBKV(): MemoryKV {
  return {
    async get(key) {
      try {
        const db = await openDB();
        return await new Promise<string | null>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => resolve((req.result as string) ?? null);
          req.onerror = () => reject(req.error);
        });
      } catch {
        return localStorage.getItem(key);
      }
    },
    async set(key, value) {
      try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        localStorage.setItem(key, value);
      }
    },
  };
}
