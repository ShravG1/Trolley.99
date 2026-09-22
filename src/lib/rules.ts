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

/**
 * May this user mark an item BOUGHT right now (the tick-off, in ItemRow)?
 * Mirrors the items_update WITH CHECK (§7.2, migrations 0013 + 0018): allowed
 * if EITHER the trip is 'shopping' and the caller is its shopper (mid-shop
 * stays single-shopper — no racing ticks), OR the trip is 'active' and the
 * caller is a member (ticking something off before anyone's gone to the
 * shop — you already had it, someone brought it back separately, etc). A
 * 'completed' trip's items are historical either way. Getting this wrong in
 * either direction would either offer a tick the DB rejects (rolled back a
 * beat later, reading as the tick looping) or hide one the DB would allow.
 * Undo/restore (→ pending) is a list-management transition that stays open to
 * any member regardless, so it's deliberately NOT covered here.
 *
 * NOT the same gate as `canActOnItem` below — see there for why.
 */
export function canMarkBought(trip: Trip, userId: string): boolean {
  if (trip.status === 'active') return true;
  return trip.status === 'shopping' && trip.shopper_id === userId;
}

/**
 * May this user SUBSTITUTE or mark NOT FOUND (ItemSheet's two extra shopping
 * actions)? Deliberately narrower than `canMarkBought`: 0018 only opened up
 * 'bought' outside shop mode (ticking off something you already have), not
 * these two — "not found" or "substituted" presupposes someone's actually at
 * the shop looking for it, which planning-mode ticking doesn't. Mirrors the
 * items_update WITH CHECK's unchanged shopping-only branch (§7.2, 0013): the
 * trip must be 'shopping' and the caller its shopper.
 */
export function canActOnItem(trip: Trip, userId: string): boolean {
  return trip.status === 'shopping' && trip.shopper_id === userId;
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
