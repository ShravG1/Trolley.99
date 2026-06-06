import { describe, it, expect } from 'vitest';
import { createReplayEngine, type ReplayDeps, type ReplayEngine } from './replay';
import { createMemoryStore } from './idb';
import type { OpStore, QueuedOp } from './types';
import type { InnerItemWriter, WriteResult } from '../itemWriter';
import type { Item } from '@/types/models';

const item = (id: string): Item => ({
  id,
  trip_id: 't1',
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
  created_at: '',
  acted_at: null,
});

const op = (over: Partial<QueuedOp>): QueuedOp => ({
  opId: 'op',
  groupId: 'g',
  tripId: 't1',
  kind: 'insert',
  itemId: 'i1',
  payload: item('i1'),
  createdAt: 1,
  attempts: 0,
  ...over,
});

function fakeInner(
  script: (kind: 'insert' | 'patch', id: string) => WriteResult,
  calls: string[]
): InnerItemWriter {
  return {
    async insertItem(it) {
      calls.push('insert:' + it.id);
      return script('insert', it.id);
    },
    async patchItem(id) {
      calls.push('patch:' + id);
      return script('patch', id);
    },
  };
}

function makeEngine(
  db: OpStore,
  inner: InnerItemWriter,
  over: Partial<ReplayDeps> = {}
): ReplayEngine {
  return createReplayEngine({
    db,
    inner,
    probe: async () => true,
    ensureSession: async () => {},
    hooks: { onPending: () => {}, onDropped: () => {} },
    schedule: () => 0, // never auto-fire backoff in tests
    cancel: () => {},
    ...over,
  });
}

describe('replay engine (§4)', () => {
  it('per-item FIFO: the insert runs before a later patch for the same item', async () => {
    const db = createMemoryStore();
    await db.put(op({ opId: 'a', kind: 'insert', itemId: 'i1', createdAt: 1 }));
    await db.put(op({ opId: 'b', kind: 'patch', itemId: 'i1', payload: { quantity: 2 }, createdAt: 2 }));
    const calls: string[] = [];
    await makeEngine(db, fakeInner(() => ({ ok: true }), calls)).drain();
    expect(calls).toEqual(['insert:i1', 'patch:i1']);
    expect(await db.getAll()).toHaveLength(0);
  });

  it('processes ops oldest-first across items', async () => {
    const db = createMemoryStore();
    await db.put(op({ opId: 'a', itemId: 'i2', payload: item('i2'), createdAt: 5 }));
    await db.put(op({ opId: 'b', itemId: 'i1', payload: item('i1'), createdAt: 1 }));
    const calls: string[] = [];
    await makeEngine(db, fakeInner(() => ({ ok: true }), calls)).drain();
    expect(calls).toEqual(['insert:i1', 'insert:i2']);
  });

  it('drops a fatal op (and counts it) but continues with the rest', async () => {
    const db = createMemoryStore();
    await db.put(op({ opId: 'a', kind: 'patch', itemId: 'i1', payload: { name: '' }, createdAt: 1 }));
    await db.put(op({ opId: 'b', kind: 'patch', itemId: 'i2', payload: { quantity: 2 }, createdAt: 2 }));
    const calls: string[] = [];
    let dropped = 0;
    await makeEngine(db, fakeInner((_k, id) => (id === 'i1' ? { ok: false, fatal: true, error: 'rls' } : { ok: true }), calls), {
      hooks: { onPending: () => {}, onDropped: (n) => (dropped += n) },
    }).drain();
    expect(calls).toEqual(['patch:i1', 'patch:i2']);
    expect(dropped).toBe(1);
    expect(await db.getAll()).toHaveLength(0);
  });

  it('a non-fatal failure bumps attempts and keeps the op queued', async () => {
    const db = createMemoryStore();
    await db.put(op({ opId: 'a', attempts: 0 }));
    await makeEngine(db, fakeInner(() => ({ ok: false, fatal: false, error: 'network' }), [])).drain();
    const all = await db.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].attempts).toBe(1);
    expect(all[0].lastError).toBe('network');
  });

  it('gives up after the attempt cap and drops the op', async () => {
    const db = createMemoryStore();
    await db.put(op({ opId: 'a', attempts: 4 })); // 4 → 5 hits the cap
    let dropped = 0;
    await makeEngine(db, fakeInner(() => ({ ok: false, fatal: false, error: 'network' }), []), {
      hooks: { onPending: () => {}, onDropped: (n) => (dropped += n) },
    }).drain();
    expect(await db.getAll()).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('aborts the drain when the connectivity probe reports offline', async () => {
    const db = createMemoryStore();
    await db.put(op({ opId: 'a' }));
    const calls: string[] = [];
    await makeEngine(db, fakeInner(() => ({ ok: true }), calls), { probe: async () => false }).drain();
    expect(calls).toHaveLength(0); // never attempted a write
    expect(await db.getAll()).toHaveLength(1); // op preserved for later
  });

  it('enqueue coalesces add → edit into one insert', async () => {
    const db = createMemoryStore();
    // stay "offline" so the internal drain is a no-op and we can inspect the queue
    const engine = makeEngine(db, fakeInner(() => ({ ok: true }), []), { probe: async () => false });
    await engine.enqueueInsert(item('i1'), 'g', 't1');
    await engine.enqueuePatch('i1', { quantity: 7 }, 'g', 't1');
    const all = await db.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('insert');
    expect((all[0].payload as Item).quantity).toBe(7);
  });

  it('reports the distinct pending item ids after enqueue', async () => {
    const db = createMemoryStore();
    const pending: string[][] = [];
    const engine = makeEngine(db, fakeInner(() => ({ ok: true }), []), {
      probe: async () => false,
      hooks: { onPending: (ids) => pending.push(ids), onDropped: () => {} },
    });
    await engine.enqueueInsert(item('i1'), 'g', 't1');
    await engine.enqueueInsert(item('i2'), 'g', 't1');
    expect(pending.at(-1)!.sort()).toEqual(['i1', 'i2']);
  });
});
