import type { Item } from '@/types/models';
import type { AisleKey } from '@/lib/aisles';

// The write-side contract the store calls after applying an optimistic local
// update (§6.3). In demo mode `remote` is null and the store stays purely local.
// In Supabase mode the sync layer installs a writer that pushes to Postgres /
// RPCs and lets Realtime reconcile the truth back (dedupe on the client id).
//
// All methods are fire-and-forget: each owns its error handling (toast + a
// resync that effectively rolls back bad optimistic state), so the store
// mutations stay synchronous and simple.
export interface RemoteWriter {
  insertItem(item: Item): void;
  patchItem(id: string, patch: Partial<Item>): void;
  startShopping(tripId: string, minutes: number | null, silent?: boolean): void;
  cancelShopping(tripId: string): void;
  completeTrip(tripId: string): void;
  takeOverShopping(tripId: string): void;
  /** Notify an item's owner that it was binned / not found (§2.10). */
  notify(kind: 'binned' | 'not_found', ownerId: string, itemName: string, actorName: string): void;

  /** Remember where this household keeps an item (0016), so the next add is
   *  already in the right aisle. Best-effort like the rest — the local memory
   *  works on its own and the save retries implicitly next time. */
  learnCategory(name: string, category: AisleKey): void;

  // Shop tabs (#19). Create resolves the active group itself; all four reconcile
  // via a reload (shops/trips aren't in the optimistic item queue).
  createShop(name: string): void;
  renameShop(shopId: string, name: string): void;
  deleteShop(shopId: string): void;
  moveItem(itemId: string, shopId: string | null): void;
}
