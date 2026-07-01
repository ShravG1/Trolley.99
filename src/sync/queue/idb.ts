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
// can clear its cached open and reopen on the next access. `reopen` yields a fresh
// connection, letting a single op transparently recover from a closed handle
// instead of surfacing the error to the caller.
function idbStore(initialDb: IDBDatabase, onClosing: () => void, reopen: () => Promise<IDBDatabase>): OpStore {
  let db = initialDb;

  // One attempt against the current handle. A synchronous throw (connection
  // closing) or an async request error both reject here rather than escaping the
  // executor as an unhandled rejection.
  function attempt<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let req: IDBRequest<T>;
      try {
        req = op(db.transaction(STORE, mode).objectStore(STORE));
      } catch (err) {
        reject(err);
        return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Safari force-closes idle connections, so the first op after a backgrounding
  // fails with InvalidStateError. Rather than reject into the fire-and-forget
  // write path — which then surfaces as an unhandled rejection (issue #20) — we
  // drop the dead handle, reopen once, and retry the same op on the fresh
  // connection. A second failure (or any non-closing error) propagates normally.
  function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return attempt(mode, op).catch((err) => {
      if (!isClosing(err)) throw err;
      onClosing();
      return reopen().then((fresh) => {
        db = fresh;
        return attempt(mode, op);
      });
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
      .then((db) => idbStore(db, reset, openDb))
      .catch(() => createMemoryStore()));
  // Any op that still rejects after the reopen-and-retry (e.g. IDB is genuinely
  // unusable) must not escape as an unhandled rejection: drop the cached store
  // and re-run the op against a fresh one, which falls back to memory on failure.
  async function withRetry<T>(pick: (s: OpStore) => Promise<T>): Promise<T> {
    try {
      return await pick(await store());
    } catch {
      reset();
      return pick(await store());
    }
  }
  return {
    getAll: () => withRetry((s) => s.getAll()),
    put: (op) => withRetry((s) => s.put(op)),
    delete: (opId) => withRetry((s) => s.delete(opId)),
  };
}
