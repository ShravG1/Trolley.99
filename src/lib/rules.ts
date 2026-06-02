import type { Trip } from '@/types/models';

// Pure mirrors of the server-authoritative rules (§6.2). The UI calls these for
// experience; the DB enforces the same logic for truth (RLS WITH CHECK §7.2,
// atomic transitions §7.1). Keeping them here makes them unit-testable and keeps
// the two copies honest.

/**
 * May this user add an item to the trip right now? Mirrors the items_insert
 * WITH CHECK (§7.2): allowed if the trip is active, OR it's shopping and the
 * user is the shopper, OR the last-minute window is still open. `nowMs` is the
 * *server* clock in real use — never the device clock (§6.5).
 */
export function canAddItem(trip: Trip, userId: string, nowMs: number): boolean {
  if (trip.status === 'active') return true;
  if (trip.status !== 'shopping') return false;
  if (trip.shopper_id === userId) return true;
  if (!trip.lastminute_until) return false;
  return nowMs <= new Date(trip.lastminute_until).getTime();
}

/** Is the last-minute window currently open for non-shoppers? */
export function windowOpen(trip: Trip, nowMs: number): boolean {
  if (trip.status !== 'shopping' || !trip.lastminute_until) return false;
  return nowMs <= new Date(trip.lastminute_until).getTime();
}
