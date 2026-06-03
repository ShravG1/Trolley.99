import { describe, it, expect } from 'vitest';
import { canAddItem, windowOpen, isShopStale, lastActivity } from './rules';
import type { Trip } from '@/types/models';

const t = (over: Partial<Trip>): Trip => ({
  id: 'trip',
  group_id: 'g',
  status: 'active',
  shopper_id: null,
  shopper_name: null,
  lastminute_until: null,
  started_at: null,
  completed_at: null,
  ...over,
});

const NOW = Date.UTC(2026, 5, 2, 12, 0, 0);
const future = new Date(NOW + 5 * 60_000).toISOString();
const past = new Date(NOW - 60_000).toISOString();

describe('window-close enforcement (§7.2)', () => {
  it('anyone can add while the trip is active', () => {
    expect(canAddItem(t({ status: 'active' }), 'other', NOW)).toBe(true);
  });

  it('the shopper can always add mid-shop, even after the window closes', () => {
    const trip = t({ status: 'shopping', shopper_id: 'shopper', lastminute_until: past });
    expect(canAddItem(trip, 'shopper', NOW)).toBe(true);
  });

  it('non-shoppers can add only while the window is open', () => {
    const open = t({ status: 'shopping', shopper_id: 'shopper', lastminute_until: future });
    const closed = t({ status: 'shopping', shopper_id: 'shopper', lastminute_until: past });
    expect(canAddItem(open, 'other', NOW)).toBe(true);
    expect(canAddItem(closed, 'other', NOW)).toBe(false);
  });

  it('windowOpen reflects the same boundary', () => {
    expect(windowOpen(t({ status: 'shopping', lastminute_until: future }), NOW)).toBe(true);
    expect(windowOpen(t({ status: 'shopping', lastminute_until: past }), NOW)).toBe(false);
    expect(windowOpen(t({ status: 'active' }), NOW)).toBe(false);
  });
});

describe('stale-shopper detection (§2.6)', () => {
  const startedRecently = new Date(NOW - 10 * 60_000).toISOString(); // 10 min ago
  const startedAgesAgo = new Date(NOW - 120 * 60_000).toISOString(); // 2 h ago

  it('a freshly started shop is not stale', () => {
    const trip = t({ status: 'shopping', started_at: startedRecently });
    expect(isShopStale(trip, lastActivity(trip, []), NOW)).toBe(false);
  });

  it('a shop with no activity for >90 min is stale', () => {
    const trip = t({ status: 'shopping', started_at: startedAgesAgo });
    expect(isShopStale(trip, lastActivity(trip, []), NOW)).toBe(true);
  });

  it('recent ticking keeps it fresh even if started long ago', () => {
    const trip = t({ status: 'shopping', started_at: startedAgesAgo });
    const items = [{ acted_at: new Date(NOW - 5 * 60_000).toISOString() }];
    expect(isShopStale(trip, lastActivity(trip, items), NOW)).toBe(false);
  });

  it('a non-shopping trip is never stale', () => {
    expect(isShopStale(t({ status: 'active' }), 0, NOW)).toBe(false);
  });
});
