import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore';
import { seedItems, seedMembers, seedTrip, CURRENT_USER } from './seed';

// Reset the singleton store to a known state before each test.
beforeEach(() => {
  useStore.setState({
    userId: CURRENT_USER.user_id,
    members: seedMembers,
    trip: { ...seedTrip },
    items: seedItems.map((i) => ({ ...i })),
    toasts: [],
    multiAddCount: 0,
  });
});

describe('addItem dedupe (§7.4)', () => {
  it('bumps quantity instead of double-adding a normalised match', () => {
    const before = useStore.getState().items.length;
    useStore.getState().addItem({ name: '  milk ', quantity: 1, urgent: false });
    const after = useStore.getState().items;
    expect(after.length).toBe(before); // no new row
    const milk = after.find((i) => i.name.toLowerCase() === 'milk')!;
    expect(milk.quantity).toBe(3); // seed had 2, +1
  });

  it('adds a genuinely new item', () => {
    const before = useStore.getState().items.length;
    useStore.getState().addItem({ name: 'Olives', quantity: 1, urgent: false });
    expect(useStore.getState().items.length).toBe(before + 1);
  });
});

describe('shopper-claim race (§7.1)', () => {
  it('first claim wins; a second claim while shopping is rejected', () => {
    const first = useStore.getState().startShopping(10);
    expect(first).toBe(true);
    expect(useStore.getState().trip.status).toBe('shopping');
    const second = useStore.getState().startShopping(10);
    expect(second).toBe(false); // trip no longer active
  });

  it('"off" locks immediately (window in the past/now)', () => {
    useStore.getState().startShopping(null);
    const until = useStore.getState().trip.lastminute_until!;
    expect(new Date(until).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('finishTrip rollover (§7.4)', () => {
  it('rolls not-found items into a fresh active trip with a bumped attempt count', () => {
    const id = useStore.getState().items[0].id;
    useStore.getState().markNotFound(id);
    const oldTripId = useStore.getState().trip.id;

    useStore.getState().finishTrip();

    const { trip, items } = useStore.getState();
    expect(trip.status).toBe('active');
    expect(trip.id).not.toBe(oldTripId);
    expect(items.length).toBe(1); // only the rolled-over not-found item
    expect(items[0].status).toBe('pending');
    expect(items[0].attempt_count).toBe(2);
    expect(items[0].trip_id).toBe(trip.id);
  });

  it('bought items do not roll over', () => {
    useStore.getState().items.forEach((i) => useStore.getState().markBought(i.id));
    useStore.getState().finishTrip();
    expect(useStore.getState().items.length).toBe(0);
  });
});

describe('delete → archive → restore (§2.5)', () => {
  it('delete moves to archive with actor snapshot; restore brings it back', () => {
    const id = useStore.getState().items[0].id;
    useStore.getState().deleteItem(id);
    const deleted = useStore.getState().items.find((i) => i.id === id)!;
    expect(deleted.status).toBe('deleted');
    expect(deleted.acted_by_name).toBe('Shrav');

    useStore.getState().restoreItem(id);
    expect(useStore.getState().items.find((i) => i.id === id)!.status).toBe('pending');
  });
});
