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
