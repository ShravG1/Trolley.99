import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOpStore } from './idb';
import type { QueuedOp } from './types';

// -----------------------------------------------------------------------------
// Regression test for issue #20: an "Unhandled rejection: Failed to execute
// 'transaction' on 'IDBDatabase': The database connection is closing." from the
// fire-and-forget write-queue path. Safari force-closes idle connections; the
// next db.transaction() then throws InvalidStateError synchronously. The store
// must drop the dead handle, reopen, and retry — never letting that rejection
// escape. We stub a tiny fake IndexedDB (no dep, matching the repo posture).
// -----------------------------------------------------------------------------

function closingError(): DOMException {
  return new DOMException('The database connection is closing.', 'InvalidStateError');
}

interface FakeReq {
  result?: unknown;
  error?: unknown;
  onsuccess?: () => void;
  onerror?: () => void;
  onupgradeneeded?: () => void;
}

// A fake IDB whose live handle can be told to "close": the next transaction()
// on that handle throws, exactly as Safari does. A fresh open() yields a new,
// working handle. Data is shared across handles so a reopen sees prior writes.
function installFakeIndexedDB() {
  const rows = new Map<string, QueuedOp>();

  function makeDb() {
    let closing = false;
    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      close() {},
      // test hook
      _forceClose() {
        closing = true;
      },
      transaction() {
        if (closing) throw closingError();
        return {
          objectStore() {
            return {
              getAll() {
                const req: FakeReq = { result: [...rows.values()] };
                queueMicrotask(() => req.onsuccess?.());
                return req;
              },
              put(op: QueuedOp) {
                rows.set(op.opId, op);
                const req: FakeReq = { result: undefined };
                queueMicrotask(() => req.onsuccess?.());
                return req;
              },
              delete(id: string) {
                rows.delete(id);
                const req: FakeReq = { result: undefined };
                queueMicrotask(() => req.onsuccess?.());
                return req;
              },
            };
          },
        };
      },
    };
    return db;
  }

  let current: ReturnType<typeof makeDb>;
  const fake = {
    open() {
      const req: FakeReq = {};
      current = makeDb();
      req.result = current;
      queueMicrotask(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };

  vi.stubGlobal('indexedDB', fake as unknown as IDBFactory);
  return {
    rows,
    forceCloseLiveHandle: () => (current as unknown as { _forceClose: () => void })._forceClose(),
  };
}

const op = (id: string): QueuedOp => ({
  opId: id,
  groupId: 'g',
  tripId: 't',
  kind: 'insert',
  itemId: 'i',
  payload: { id: 'i' } as QueuedOp['payload'],
  createdAt: 1,
  attempts: 0,
});

describe('createOpStore — reopen after Safari closes the connection (issue #20)', () => {
  let handle: ReturnType<typeof installFakeIndexedDB>;

  beforeEach(() => {
    handle = installFakeIndexedDB();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recovers a write when the live handle closes mid-session', async () => {
    const store = createOpStore();
    await store.put(op('a')); // opens the DB and writes

    // Safari backgrounds the tab and closes the idle connection.
    handle.forceCloseLiveHandle();

    // This put would throw InvalidStateError synchronously on the dead handle.
    // It must reopen + retry, not reject.
    await expect(store.put(op('b'))).resolves.toBeUndefined();

    const all = await store.getAll();
    expect(all.map((o) => o.opId).sort()).toEqual(['a', 'b']);
  });

  it('does not emit an unhandled rejection when the connection is closing', async () => {
    const store = createOpStore();
    await store.getAll();

    const unhandled: unknown[] = [];
    const onUnhandled = (e: PromiseRejectionEvent) => unhandled.push(e.reason);
    // jsdom surfaces unhandled rejections on window; guard for node envs.
    if (typeof window !== 'undefined') window.addEventListener('unhandledrejection', onUnhandled);

    handle.forceCloseLiveHandle();
    // Fire-and-forget, exactly as useSupabaseSync does with enqueueInsert.
    void store.put(op('c'));

    await new Promise((r) => setTimeout(r, 20));
    if (typeof window !== 'undefined') window.removeEventListener('unhandledrejection', onUnhandled);

    expect(unhandled).toEqual([]);
    const all = await store.getAll();
    expect(all.some((o) => o.opId === 'c')).toBe(true);
  });
});
