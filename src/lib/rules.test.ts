import { describe, it, expect } from 'vitest';
import { canAddItem, windowOpen } from './rules';
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
