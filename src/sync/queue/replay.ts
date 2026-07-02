import type { ConnectivityProbe, OpStore, QueuedOp } from './types';
import type { InnerItemWriter, WriteResult } from '../itemWriter';
import type { Item } from '@/types/models';
import { planCoalesce } from './coalesce';
import { applyQueueToCache } from './snapshot';

// -----------------------------------------------------------------------------
// Replay engine (docs/OFFLINE_PLAN.md §4). Persists ops via the queueing writer's
// enqueue, then drains them in per-item FIFO order when real connectivity
// returns. Single-flight, idempotent (inserts upsert; patches are LWW updates),
// with bounded exponential backoff and an in-flight guard so a concurrent edit
// can't be lost mid-send.
// -----------------------------------------------------------------------------

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60_000;

export interface ReplayHooks {
  // Distinct itemIds still queued — drives the "N changes will sync" indicator
  // and the store's queue-aware reconciliation.
  onPending: (itemIds: string[]) => void;
  // Number of ops dropped this pass as un-saveable (RLS rejection / attempts
  // exhausted), so the UI can surface a single consolidated toast (§6).
  onDropped: (n: number) => void;
}

export interface ReplayDeps {
  db: OpStore;
  inner: InnerItemWriter;
  probe: ConnectivityProbe;
  ensureSession: () => Promise<void>;
  hooks: ReplayHooks;
  now?: () => number;
  // Injectable timer so tests don't wait out the backoff.
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface ReplayEngine {
  enqueueInsert(item: Item, groupId: string, tripId: string): Promise<void>;
  enqueuePatch(itemId: string, patch: Partial<Item>, groupId: string, tripId: string): Promise<void>;
  drain(): Promise<void>;
  refreshPending(): Promise<void>;
  /** Reconcile a cached server snapshot with the still-queued offline changes —
   *  used to rebuild the optimistic view on an offline boot (§5/§10). */
  snapshotItems(cacheItems: Item[]): Promise<Item[]>;
  start(): void;
  /** The op currently being sent (null between sends) — exposed for tests. */
  inFlightOpId(): string | null;
}

export function createReplayEngine(deps: ReplayDeps): ReplayEngine {
  const { db, inner, probe, ensureSession, hooks } = deps;
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = deps.cancel ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let draining = false;
  let redrain = false; // a poke arrived mid-drain → run one more pass after this
  let started = false;
  let inFlight: string | null = null;
  let backoffMs = BASE_BACKOFF_MS;
  let backoffHandle: unknown = null;
  // Serialises enqueue()'s read-modify-write. Two enqueues for the same item
  // (e.g. mashing the qty stepper) are both fire-and-forget from the caller, so
  // without this their db.getAll() reads can interleave before either writes —
  // each sees the queue as it was before the other's op landed, so they coalesce
  // against a stale view and both get persisted instead of merging into one.
  // Chaining onto the previous enqueue's promise keeps each one atomic relative
  // to the others while still coalescing correctly.
  let enqueueChain: Promise<void> = Promise.resolve();

  async function refreshPending() {
    const all = await db.getAll();
    hooks.onPending([...new Set(all.map((o) => o.itemId))]);
  }

  async function snapshotItems(cacheItems: Item[]) {
    return applyQueueToCache(cacheItems, await db.getAll());
  }

  async function enqueue(op: QueuedOp) {
    const run = async () => {
      const existing = (await db.getAll()).filter((o) => o.itemId === op.itemId);
      const plan = planCoalesce(existing, op, inFlight);
      for (const id of plan.delete) await db.delete(id);
      for (const p of plan.put) await db.put(p);
      await refreshPending();
      void drain(); // single-flight; probes connectivity first
    };
    // Chain onto the tail regardless of whether the previous link failed, so one
    // rejected enqueue can't wedge every enqueue after it.
    const next = enqueueChain.then(run, run);
    enqueueChain = next.catch(() => {});
    return next;
  }

  function scheduleBackoff() {
    if (backoffHandle != null) cancel(backoffHandle);
    const delay = backoffMs + Math.random() * 0.3 * backoffMs; // jitter
    backoffHandle = schedule(() => {
      backoffHandle = null;
      void drain();
    }, delay);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  async function drain() {
    if (draining) {
      redrain = true; // a write landed mid-pass — don't let it wait for the next trigger
      return;
    }
    draining = true;
    redrain = false;
    let dropped = 0;
    try {
      // navigator.onLine lies; only drain if a request actually round-trips, and
      // make sure we hold a session (start of pass, not per op).
      if (!(await probe())) return scheduleBackoff();
      try {
        await ensureSession();
      } catch {
        return scheduleBackoff();
      }

      // Oldest-first; re-read each pass so a concurrent coalesce is picked up.
      for (;;) {
        const all = (await db.getAll()).sort((a, b) => a.createdAt - b.createdAt);
        const op = all[0];
        if (!op) break;

        inFlight = op.opId;
        let res: WriteResult;
        try {
          res =
            op.kind === 'insert'
              ? await inner.insertItem(op.payload as Item)
              : await inner.patchItem(op.itemId, op.payload as Partial<Item>);
        } catch (e) {
          res = { ok: false, fatal: false, error: String(e) };
        }
        inFlight = null;

        if (res.ok) {
          await db.delete(op.opId);
          backoffMs = BASE_BACKOFF_MS; // a real success → reset backoff
          continue;
        }
        if (res.fatal) {
          await db.delete(op.opId); // RLS/4xx won't fix itself — drop + count
          dropped += 1;
          continue;
        }
        // Non-fatal (network/5xx): bump attempts, give up after the cap. A
        // failing op blocks later ones only while transient — the same network
        // outage would fail them too, so stop the pass and retry the lot later.
        const attempts = op.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await db.delete(op.opId);
          dropped += 1;
          continue;
        }
        await db.put({ ...op, attempts, lastError: res.error });
        scheduleBackoff();
        return;
      }
    } finally {
      draining = false;
      await refreshPending();
      if (dropped > 0) hooks.onDropped(dropped);
      if (redrain) {
        redrain = false;
        void drain(); // pick up anything enqueued during this pass
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        backoffMs = BASE_BACKOFF_MS;
        void drain();
      });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          backoffMs = BASE_BACKOFF_MS;
          void drain();
        }
      });
    }
    void drain(); // replay anything persisted from a previous session on boot
  }

  function makeOp(kind: QueuedOp['kind'], itemId: string, payload: Item | Partial<Item>, groupId: string, tripId: string): QueuedOp {
    return { opId: crypto.randomUUID(), groupId, tripId, kind, itemId, payload, createdAt: now(), attempts: 0 };
  }

  return {
    enqueueInsert: (item, groupId, tripId) => enqueue(makeOp('insert', item.id, item, groupId, tripId)),
    enqueuePatch: (itemId, patch, groupId, tripId) => enqueue(makeOp('patch', itemId, patch, groupId, tripId)),
    drain,
    refreshPending,
    snapshotItems,
    start,
    inFlightOpId: () => inFlight,
  };
}
