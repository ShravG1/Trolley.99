import type { GroupMember, Item, MyGroup, Shop, Trip } from '@/types/models';
import type { QueuedOp } from './types';

// -----------------------------------------------------------------------------
// Offline read-cache (docs/OFFLINE_PLAN.md §5/§10). The app is online-first for
// reads, so a cold boot with no signal otherwise hangs on the splash. This
// persists the last good server snapshot to its own IndexedDB database (isolated
// from the write queue) so an offline boot can show "the last list we had" and
// let writes queue. Best-effort throughout: any IDB failure degrades to no cache,
// never throws into the sync path.
// -----------------------------------------------------------------------------

export interface CachedSnapshot {
  userId: string;
  groups: MyGroup[];
  trip: Trip; // the selected tab's trip at save time (kept for the group-match check)
  // Per-shop tabs (#19). Absent in caches written before this shipped — restore
  // then falls back to a single Unsorted list ([trip], no shops).
  trips?: Trip[]; // all current trips, one per shop tab
  shops?: Shop[];
  activeShopId?: string | null;
  members: GroupMember[];
  items: Item[]; // server rows as fetched — offline changes are re-applied from the queue
  savedAt: number;
}

const DB_NAME = 'trolley-cache';
const STORE = 'snapshot';
const KEY = 'current';

let dbPromise: Promise<IDBDatabase | null> | null = null;
function getDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return (dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
}

export async function saveSnapshot(snap: CachedSnapshot): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snap, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadCachedSnapshot(): Promise<CachedSnapshot | null> {
  const db = await getDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as CachedSnapshot) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Reconcile the cached server snapshot with the still-pending offline ops (pure):
// apply queued patches onto cached rows and add queued inserts, in createdAt
// order, so the restored offline view reflects changes made since the last sync.
// A patch with no matching row (its base is neither cached nor freshly inserted)
// is skipped — it can't be reconstructed, and it replays as an UPDATE on reconnect.
export function applyQueueToCache(cacheItems: Item[], ops: QueuedOp[]): Item[] {
  const byId = new Map<string, Item>(cacheItems.map((i) => [i.id, i]));
  for (const op of [...ops].sort((a, b) => a.createdAt - b.createdAt)) {
    if (op.kind === 'insert') {
      const prev = byId.get(op.itemId);
      byId.set(op.itemId, { ...(prev ?? ({} as Item)), ...(op.payload as Item) });
    } else {
      const base = byId.get(op.itemId);
      if (base) byId.set(op.itemId, { ...base, ...(op.payload as Partial<Item>) });
    }
  }
  return [...byId.values()];
}
