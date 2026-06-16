import { describe, it, expect } from 'vitest';
import { groupForList, groupForShopping, counts } from './grouping';
import type { Item } from '@/types/models';

function item(p: Partial<Item>): Item {
  return {
    id: crypto.randomUUID(),
    trip_id: 't',
    name: 'x',
    quantity: 1,
    category: 'other',
    priority: 'normal',
    status: 'pending',
    added_by: 'u',
    added_by_name: 'U',
    acted_by: null,
    acted_by_name: null,
    substitution_note: null,
    note: null,
    unit: null,
    attempt_count: 1,
    created_at: '2026-01-01T00:00:00Z',
    acted_at: null,
    ...p,
  };
}

describe('groupForList', () => {
  it('pins urgent pending items above all aisles', () => {
    const items = [
      item({ name: 'Milk', category: 'dairy' }),
      item({ name: 'Calpol', category: 'health', priority: 'urgent' }),
    ];
    const { urgent, groups } = groupForList(items);
    expect(urgent.map((i) => i.name)).toEqual(['Calpol']);
    expect(groups.flatMap((g) => g.items.map((i) => i.name))).toEqual(['Milk']);
  });

  it('excludes deleted items', () => {
    const items = [item({ name: 'Gone', status: 'deleted' }), item({ name: 'Here' })];
    const { groups } = groupForList(items);
    expect(groups.flatMap((g) => g.items.map((i) => i.name))).toEqual(['Here']);
  });
});

describe('groupForShopping', () => {
  it('keeps completed rows visible but sinks them to the bottom of the aisle', () => {
    const items = [
      item({ name: 'Bought', category: 'dairy', status: 'bought' }),
      item({ name: 'Pending', category: 'dairy', status: 'pending' }),
    ];
    const groups = groupForShopping(items);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Pending', 'Bought']);
    expect(groups[0].done).toBe(1);
    expect(groups[0].total).toBe(2);
  });

  it('orders aisles by shop-walk order', () => {
    const items = [item({ category: 'frozen' }), item({ category: 'produce' })];
    const groups = groupForShopping(items);
    expect(groups[0].aisle).toBe('produce'); // produce walked before frozen
  });
});

describe('counts', () => {
  it('counts done vs total ignoring deleted', () => {
    const items = [
      item({ status: 'bought' }),
      item({ status: 'substituted' }),
      item({ status: 'pending' }),
      item({ status: 'deleted' }),
    ];
    expect(counts(items)).toEqual({ total: 3, done: 2 });
  });
});

describe('groupForList — urgent-first then aisle-walk order', () => {
  it('urgent pending items appear in the urgent bucket, not in any aisle group', () => {
    const items = [
      item({ name: 'Calpol', category: 'health', priority: 'urgent', status: 'pending' }),
      item({ name: 'Milk', category: 'dairy', priority: 'normal', status: 'pending' }),
      item({ name: 'Bread', category: 'bakery', priority: 'normal', status: 'pending' }),
    ];
    const { urgent, groups } = groupForList(items);
    expect(urgent.map((i) => i.name)).toEqual(['Calpol']);
    // Calpol must NOT appear in any aisle group
    const allGroupItems = groups.flatMap((g) => g.items);
    expect(allGroupItems.find((i) => i.name === 'Calpol')).toBeUndefined();
  });

  it('an urgent item that is bought is NOT in the urgent bucket (only pending urgent goes there)', () => {
    const items = [
      item({ name: 'Calpol', category: 'health', priority: 'urgent', status: 'bought' }),
      item({ name: 'Milk', category: 'dairy', priority: 'normal', status: 'pending' }),
    ];
    const { urgent, groups } = groupForList(items);
    expect(urgent).toHaveLength(0);
    // The bought urgent item lands in its aisle group instead
    const healthGroup = groups.find((g) => g.aisle === 'health');
    expect(healthGroup?.items.find((i) => i.name === 'Calpol')).toBeDefined();
  });

  it('aisle groups follow walk order (produce before dairy before bakery)', () => {
    const items = [
      item({ name: 'Milk', category: 'dairy' }),
      item({ name: 'Bananas', category: 'produce' }),
      item({ name: 'Bread', category: 'bakery' }),
    ];
    const { groups } = groupForList(items);
    const aisles = groups.map((g) => g.aisle);
    expect(aisles.indexOf('produce')).toBeLessThan(aisles.indexOf('bakery'));
    expect(aisles.indexOf('bakery')).toBeLessThan(aisles.indexOf('dairy'));
  });

  it('items with unknown category ("other") appear last in the aisle walk', () => {
    const items = [
      item({ name: 'Milk', category: 'dairy' }),
      item({ name: 'Widget', category: 'other' }),
    ];
    const { groups } = groupForList(items);
    const aisles = groups.map((g) => g.aisle);
    expect(aisles[aisles.length - 1]).toBe('other');
  });
});

describe('groupForShopping — aisle-walk order with completed rows sinking', () => {
  it('not_found items rank below pending but above bought in the same aisle', () => {
    const items = [
      item({ name: 'Bought Milk', category: 'dairy', status: 'bought' }),
      item({ name: 'Not Found Milk', category: 'dairy', status: 'not_found' }),
      item({ name: 'Pending Milk', category: 'dairy', status: 'pending' }),
    ];
    const groups = groupForShopping(items);
    const names = groups[0].items.map((i) => i.name);
    expect(names.indexOf('Pending Milk')).toBeLessThan(names.indexOf('Not Found Milk'));
    expect(names.indexOf('Not Found Milk')).toBeLessThan(names.indexOf('Bought Milk'));
  });

  it('deleted items are excluded from shopping view', () => {
    const items = [
      item({ name: 'Deleted', category: 'dairy', status: 'deleted' }),
      item({ name: 'Present', category: 'dairy', status: 'pending' }),
    ];
    const groups = groupForShopping(items);
    const names = groups.flatMap((g) => g.items.map((i) => i.name));
    expect(names).not.toContain('Deleted');
    expect(names).toContain('Present');
  });

  it('substituted items count towards done total', () => {
    const items = [
      item({ name: 'Sub', category: 'bakery', status: 'substituted' }),
      item({ name: 'Pending', category: 'bakery', status: 'pending' }),
    ];
    const groups = groupForShopping(items);
    expect(groups[0].done).toBe(1);
    expect(groups[0].total).toBe(2);
  });
});
