import type { Item } from '@/types/models';

// -----------------------------------------------------------------------------
// Offline write queue — data model (docs/OFFLINE_PLAN.md §2).
//
// Only item insert/patch are queued in the MVP (trip-lifecycle stays online-only),
// so every op carries an itemId — the client UUID on Item.id — which is the
// coalescing key. groupId/tripId are snapshotted at enqueue time, never read
// live, so a group switch can't replay an op into the wrong group (§5).
// -----------------------------------------------------------------------------

export type OpKind = 'insert' | 'patch';

export interface QueuedOp {
  opId: string; // the queue's own id (uuid) — NOT the item id
  groupId: string; // snapshotted at enqueue
  tripId: string; // snapshotted at enqueue
  kind: OpKind;
  itemId: string; // Item.id — the coalescing key
  payload: Item | Partial<Item>; // full Item for insert, Partial<Item> for patch
  createdAt: number;
  attempts: number;
  lastError?: string;
}

// Minimal async op store (IndexedDB in the browser; an in-memory Map in tests or
// where IDB is unavailable). Keyed by opId.
export interface OpStore {
  getAll(): Promise<QueuedOp[]>;
  put(op: QueuedOp): Promise<void>;
  delete(opId: string): Promise<void>;
}

// A real connectivity check — navigator.onLine lies on captive/poor networks, so
// the engine gates each drain on a request that actually round-trips (§4).
export type ConnectivityProbe = () => Promise<boolean>;
