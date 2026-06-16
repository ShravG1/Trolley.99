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
    const all = useStore.getState().items;
    const notFoundId = all[0].id;
    // buy everything except one not-found item, so only that one carries over
    all.forEach((i) => (i.id === notFoundId ? null : useStore.getState().markBought(i.id)));
    useStore.getState().markNotFound(notFoundId);
    const oldTripId = useStore.getState().trip.id;

    useStore.getState().finishTrip();

    const { trip, items } = useStore.getState();
    expect(trip.status).toBe('active');
    expect(trip.id).not.toBe(oldTripId);
    expect(items.length).toBe(1); // only the not-found item rolled over
    expect(items[0].status).toBe('pending');
    expect(items[0].attempt_count).toBe(2); // not-found bumps the counter
    expect(items[0].trip_id).toBe(trip.id);
  });

  it('un-ticked (pending) items roll over too — nothing is silently lost', () => {
    const total = useStore.getState().items.length; // all seed items are pending
    useStore.getState().finishTrip();
    const items = useStore.getState().items;
    expect(items.length).toBe(total); // every un-ticked item carried over
    expect(items.every((i) => i.status === 'pending')).toBe(true);
    expect(items.every((i) => i.attempt_count === 1)).toBe(true); // pending doesn't bump
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

describe('addItem dedupe — resolved-row boundary (§7.4)', () => {
  it('re-adding a bought item creates a fresh pending row, not a quantity bump', () => {
    const milkId = useStore.getState().items.find((i) => i.name === 'Milk')!.id;
    useStore.getState().markBought(milkId);

    const beforeLen = useStore.getState().items.length;
    useStore.getState().addItem({ name: 'milk', quantity: 1, urgent: false });
    const afterItems = useStore.getState().items;

    // A new pending row must have been created — total count goes up
    expect(afterItems.length).toBe(beforeLen + 1);
    // The bought row stays bought with its original quantity
    const bought = afterItems.find((i) => i.id === milkId)!;
    expect(bought.status).toBe('bought');
    expect(bought.quantity).toBe(2);
    // The fresh row is pending
    const fresh = afterItems.find((i) => i.id !== milkId && i.name.toLowerCase() === 'milk')!;
    expect(fresh.status).toBe('pending');
  });

  it('re-adding a not_found item creates a fresh pending row', () => {
    const milkId = useStore.getState().items.find((i) => i.name === 'Milk')!.id;
    useStore.getState().markNotFound(milkId);

    const beforeLen = useStore.getState().items.length;
    useStore.getState().addItem({ name: 'milk', quantity: 1, urgent: false });
    const afterItems = useStore.getState().items;

    expect(afterItems.length).toBe(beforeLen + 1);
    const notFound = afterItems.find((i) => i.id === milkId)!;
    expect(notFound.status).toBe('not_found');
    const fresh = afterItems.find((i) => i.id !== milkId && i.name.toLowerCase() === 'milk')!;
    expect(fresh.status).toBe('pending');
  });

  it('re-adding a substituted item creates a fresh pending row', () => {
    const milkId = useStore.getState().items.find((i) => i.name === 'Milk')!.id;
    useStore.getState().substitute(milkId, 'Oat milk', 'out of dairy');

    const beforeLen = useStore.getState().items.length;
    useStore.getState().addItem({ name: 'milk', quantity: 1, urgent: false });
    const afterItems = useStore.getState().items;

    expect(afterItems.length).toBe(beforeLen + 1);
    const subbed = afterItems.find((i) => i.id === milkId)!;
    expect(subbed.status).toBe('substituted');
  });

  it('bumps quantity and upgrades to urgent when re-adding a still-pending item as urgent', () => {
    const eggsId = useStore.getState().items.find((i) => i.name === 'Eggs')!.id;
    const before = useStore.getState().items.find((i) => i.id === eggsId)!;
    expect(before.priority).toBe('normal');

    useStore.getState().addItem({ name: 'eggs', quantity: 2, urgent: true });
    const after = useStore.getState().items.find((i) => i.id === eggsId)!;

    expect(after.quantity).toBe(before.quantity + 2);
    expect(after.priority).toBe('urgent');
    // No new row
    const eggRows = useStore.getState().items.filter((i) => i.name.toLowerCase() === 'eggs');
    expect(eggRows.length).toBe(1);
  });
});

describe('finishTrip rollover — substituted exclusion and pending attempt_count (§7.4)', () => {
  it('substituted items do NOT roll over', () => {
    const milkId = useStore.getState().items.find((i) => i.name === 'Milk')!.id;
    useStore.getState().substitute(milkId, 'Oat milk', 'out of dairy');
    // mark the rest bought
    useStore.getState().items
      .filter((i) => i.id !== milkId)
      .forEach((i) => useStore.getState().markBought(i.id));

    useStore.getState().finishTrip();
    expect(useStore.getState().items.length).toBe(0);
  });

  it('pending rollover does NOT increment attempt_count', () => {
    // Start with attempt_count > 1 to prove it stays unchanged
    useStore.setState((s) => ({
      items: s.items.map((i) => i.name === 'Bread' ? { ...i, attempt_count: 3 } : i),
    }));
    const breadId = useStore.getState().items.find((i) => i.name === 'Bread')!.id;
    // buy all others
    useStore.getState().items
      .filter((i) => i.id !== breadId)
      .forEach((i) => useStore.getState().markBought(i.id));

    useStore.getState().finishTrip();
    const bread = useStore.getState().items.find((i) => i.name === 'Bread')!;
    expect(bread.attempt_count).toBe(3); // unchanged
    expect(bread.status).toBe('pending');
  });

  it('new trip after rollover is active with no shopper', () => {
    useStore.getState().startShopping(10);
    expect(useStore.getState().trip.status).toBe('shopping');

    useStore.getState().finishTrip();
    const { trip } = useStore.getState();
    expect(trip.status).toBe('active');
    expect(trip.shopper_id).toBeNull();
    expect(trip.shopper_name).toBeNull();
  });
});

describe('startShopping guard — non-active trip statuses (§7.1)', () => {
  it('returns false when trip is already in shopping state', () => {
    useStore.getState().startShopping(10); // puts it into 'shopping'
    expect(useStore.getState().trip.status).toBe('shopping');
    const result = useStore.getState().startShopping(10);
    expect(result).toBe(false);
  });

  it('returns false when trip status is completed', () => {
    // Force the trip into a completed state
    useStore.setState((s) => ({
      trip: { ...s.trip, status: 'completed' },
    }));
    const result = useStore.getState().startShopping(10);
    expect(result).toBe(false);
  });

  it('does not mutate the trip when rejected', () => {
    useStore.setState((s) => ({
      trip: { ...s.trip, status: 'completed' },
    }));
    const tripBefore = useStore.getState().trip;
    useStore.getState().startShopping(10);
    expect(useStore.getState().trip).toEqual(tripBefore);
  });
});

describe('setMyName — rename propagation (§5.4)', () => {
  it('updates the member record so subsequent addItem snapshots use the new name', () => {
    useStore.getState().setMyName('Shravya');
    const me = useStore.getState().members.find(
      (m) => m.user_id === CURRENT_USER.user_id
    )!;
    expect(me.display_name).toBe('Shravya');

    // Next item added should carry the new name
    useStore.getState().addItem({ name: 'Oat milk', quantity: 1, urgent: false });
    const newItem = useStore.getState().items.find((i) => i.name === 'Oat milk')!;
    expect(newItem.added_by_name).toBe('Shravya');
  });

  it('existing item rows keep their original added_by_name snapshot after rename', () => {
    const eggsBefore = useStore.getState().items.find((i) => i.name === 'Eggs')!;
    const originalName = eggsBefore.added_by_name; // 'Shrav'

    useStore.getState().setMyName('Shravya');

    const eggsAfter = useStore.getState().items.find((i) => i.id === eggsBefore.id)!;
    expect(eggsAfter.added_by_name).toBe(originalName); // snapshot unchanged
  });

  it('markBought acted_by_name uses the new name after rename', () => {
    useStore.getState().setMyName('Shravya');
    const eggsId = useStore.getState().items.find((i) => i.name === 'Eggs')!.id;
    useStore.getState().markBought(eggsId);
    const eggs = useStore.getState().items.find((i) => i.id === eggsId)!;
    expect(eggs.acted_by_name).toBe('Shravya');
  });

  it('ignores empty / whitespace-only names', () => {
    useStore.getState().setMyName('');
    const me = useStore.getState().members.find(
      (m) => m.user_id === CURRENT_USER.user_id
    )!;
    expect(me.display_name).toBe('Shrav'); // unchanged
  });
});
