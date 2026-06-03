import type { Item } from '@/types/models';

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
  startShopping(tripId: string, minutes: number | null): void;
  cancelShopping(tripId: string): void;
  completeTrip(tripId: string): void;
  takeOverShopping(tripId: string): void;
}
