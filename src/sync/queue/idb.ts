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

// Safari force-closes idle IDB connections (bfcache, backgrounding, memory
// pressure); the next `db.transaction()` then throws synchronously
// `InvalidStateError: ...connection is closing`. We treat that as a signal to
// drop the dead handle so the store reopens on the next call.
function isClosing(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'InvalidStateError';
}

// `onClosing` is invoked when the live handle is no longer usable, so the caller
// can clear its cached open and reopen on the next access.
function idbStore(db: IDBDatabase, onClosing: () => void): OpStore {
  function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let req: IDBRequest<T>;
      try {
        req = op(db.transaction(STORE, mode).objectStore(STORE));
      } catch (err) {
        // A synchronous throw here (e.g. the connection is closing) must reject
        // cleanly rather than escape this executor as an unhandled rejection.
        if (isClosing(err)) onClosing();
        reject(err);
        return;
      }
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
  // Dropping the cached open lets the next call reopen the DB instead of reusing
  // a handle Safari has closed; if that reopen also fails we fall back to memory.
  const reset = () => {
    ready = null;
  };
  const store = () =>
    (ready ??= openDb()
      .then((db) => idbStore(db, reset))
      .catch(() => createMemoryStore()));
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
