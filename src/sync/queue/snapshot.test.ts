import { describe, it, expect } from 'vitest';
import { applyQueueToCache } from './snapshot';
import { createReplayEngine } from './replay';
import { createMemoryStore } from './idb';
import type { QueuedOp } from './types';
import type { InnerItemWriter } from '../itemWriter';
import type { Item } from '@/types/models';

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  trip_id: 't1',
  name: id,
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
  created_at: '',
  acted_at: null,
  ...over,
});

const op = (over: Partial<QueuedOp>): QueuedOp => ({
  opId: Math.random().toString(36).slice(2),
  groupId: 'g',
  tripId: 't1',
  kind: 'insert',
  itemId: 'i1',
  payload: item('i1'),
  createdAt: 1,
  attempts: 0,
  ...over,
});

describe('applyQueueToCache (§5/§10 offline reconciliation)', () => {
  it('adds a queued insert that is not in the cache', () => {
    const out = applyQueueToCache([item('a')], [op({ itemId: 'b', payload: item('b'), createdAt: 2 })]);
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('applies a queued patch onto a cached row', () => {
    const out = applyQueueToCache(
      [item('a', { quantity: 1 })],
      [op({ kind: 'patch', itemId: 'a', payload: { quantity: 4 }, createdAt: 2 })]
    );
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(4);
  });

  it('a queued delete-patch marks a cached row deleted (so the UI hides it)', () => {
    const out = applyQueueToCache(
      [item('a')],
      [op({ kind: 'patch', itemId: 'a', payload: { status: 'deleted' }, createdAt: 2 })]
    );
    expect(out[0].status).toBe('deleted');
  });

  it('skips a patch whose base is neither cached nor freshly inserted', () => {
    const out = applyQueueToCache([item('a')], [op({ kind: 'patch', itemId: 'ghost', payload: { quantity: 9 }, createdAt: 2 })]);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });

  it('applies ops in createdAt order (insert then patch on the same item)', () => {
    const out = applyQueueToCache(
      [],
      [
        op({ kind: 'patch', itemId: 'x', payload: { quantity: 9 }, createdAt: 2 }),
        op({ kind: 'insert', itemId: 'x', payload: item('x', { quantity: 1 }), createdAt: 1 }),
      ]
    );
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(9); // patch (t=2) applied after the insert (t=1)
  });
});

describe('engine.snapshotItems', () => {
  const noopInner: InnerItemWriter = {
    async insertItem() {
      return { ok: true };
    },
    async patchItem() {
      return { ok: true };
    },
  };

  it('reconciles cached rows with what is currently queued', async () => {
    const db = createMemoryStore();
    await db.put(op({ opId: 'a', kind: 'insert', itemId: 'new', payload: item('new'), createdAt: 1 }));
    await db.put(op({ opId: 'b', kind: 'patch', itemId: 'cached', payload: { quantity: 7 }, createdAt: 2 }));
    const engine = createReplayEngine({
      db,
      inner: noopInner,
      probe: async () => false,
      ensureSession: async () => {},
      hooks: { onPending: () => {}, onDropped: () => {} },
      schedule: () => 0,
      cancel: () => {},
    });
    const out = await engine.snapshotItems([item('cached', { quantity: 1 })]);
    const byId = Object.fromEntries(out.map((i) => [i.id, i]));
    expect(byId['cached'].quantity).toBe(7);
    expect(byId['new']).toBeTruthy();
  });
});
