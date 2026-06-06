import type { OpStore, QueuedOp } from './types';

// -----------------------------------------------------------------------------
// Tiny hand-rolled IndexedDB op store (one object store, key = opId) plus an
// in-memory fallback. No dependency — matches the repo's minimal-deps posture
// (docs/OFFLINE_PLAN.md §2). Never throws into the write path: if IDB is
// unavailable (private mode / Safari quirks) we degrade to the memory store,
// which keeps same-session offline→replay working, just not across restarts.
// -----------------------------------------------------------------------------

const DB_NAME = 'trolley';
const STORE = 'writeQueue';
const VERSION = 1;

export function createMemoryStore(): OpStore {
  const map = new Map<string, QueuedOp>();
  return {
    async getAll() {
      return [...map.values()];
    },
    async put(op) {
      map.set(op.opId, op);
    },
    async delete(opId) {
      map.delete(opId);
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'opId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbStore(db: IDBDatabase): OpStore {
  function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return {
    getAll: () => run('readonly', (s) => s.getAll() as IDBRequest<QueuedOp[]>),
    put: (op) => run('readwrite', (s) => s.put(op)).then(() => undefined),
    delete: (opId) => run('readwrite', (s) => s.delete(opId)).then(() => undefined),
  };
}

// Returns a usable OpStore synchronously; IDB is opened lazily on first use and
// falls back to memory if open fails, so callers never deal with the async open.
export function createOpStore(): OpStore {
  if (typeof indexedDB === 'undefined') return createMemoryStore();
  let ready: Promise<OpStore> | null = null;
  const store = () => (ready ??= openDb().then(idbStore).catch(() => createMemoryStore()));
  return {
    async getAll() {
      return (await store()).getAll();
    },
    async put(op) {
      return (await store()).put(op);
    },
    async delete(opId) {
      return (await store()).delete(opId);
    },
  };
}
