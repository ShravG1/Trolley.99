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

const STALE_MS = 90 * 60_000; // §2.6 — no activity for 90 min = abandoned shop

/**
 * Has the active shop gone stale? Used to offer the group a "Take over" and to
 * nudge the shopper "Still shopping?". `lastActivityMs` is the latest of the
 * trip start and any item action. Server's take_over RPC enforces the same
 * 90-min rule for real (§7.1) — this just drives the UI.
 */
export function isShopStale(trip: Trip, lastActivityMs: number, nowMs: number): boolean {
  if (trip.status !== 'shopping' || !trip.started_at) return false;
  return nowMs - lastActivityMs > STALE_MS;
}

/** Latest activity timestamp (ms) across the trip start and item actions. */
export function lastActivity(trip: Trip, items: { acted_at: string | null }[]): number {
  let latest = trip.started_at ? new Date(trip.started_at).getTime() : 0;
  for (const i of items) {
    if (i.acted_at) latest = Math.max(latest, new Date(i.acted_at).getTime());
  }
  return latest;
}
