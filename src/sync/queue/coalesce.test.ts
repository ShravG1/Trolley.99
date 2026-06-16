import { describe, it, expect } from 'vitest';
import { planCoalesce, type CoalescePlan } from './coalesce';
import type { QueuedOp } from './types';
import type { Item } from '@/types/models';

const baseItem = (over: Partial<Item> = {}): Item => ({
  id: 'item-1',
  trip_id: 'trip-1',
  name: 'Milk',
  quantity: 1,
  category: 'dairy',
  priority: 'normal',
  status: 'pending',
  added_by: 'u1',
  added_by_name: 'Me',
  acted_by: null,
  acted_by_name: null,
  substitution_note: null,
  note: null,
  unit: null,
  attempt_count: 1,
  created_at: '2026-01-01T00:00:00Z',
  acted_at: null,
  ...over,
});

const insertOp = (over: Partial<QueuedOp> = {}): QueuedOp => ({
  opId: 'op-ins',
  groupId: 'g1',
  tripId: 'trip-1',
  kind: 'insert',
  itemId: 'item-1',
  payload: baseItem(),
  createdAt: 1,
  attempts: 0,
  ...over,
});

let seq = 0;
const patchOp = (payload: Partial<Item>, over: Partial<QueuedOp> = {}): QueuedOp => ({
  opId: `op-patch-${seq++}`,
  groupId: 'g1',
  tripId: 'trip-1',
  kind: 'patch',
  itemId: 'item-1',
  payload,
  createdAt: 2,
  attempts: 0,
  ...over,
});

// Apply a plan to a list the way the engine persists it, so we can assert the
// resulting queue after a sequence of coalesces.
function apply(existing: QueuedOp[], plan: CoalescePlan): QueuedOp[] {
  const byId = new Map(existing.map((o) => [o.opId, o]));
  for (const id of plan.delete) byId.delete(id);
  for (const p of plan.put) byId.set(p.opId, p);
  return [...byId.values()];
}

describe('planCoalesce (§2 coalescing)', () => {
  it('add → edit collapses to one insert carrying the edit', () => {
    let ops = [insertOp()];
    ops = apply(ops, planCoalesce(ops, patchOp({ quantity: 3, note: 'own brand' }), null));
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('insert');
    expect((ops[0].payload as Item).quantity).toBe(3);
    expect((ops[0].payload as Item).note).toBe('own brand');
  });

  it('add → edit → delete collapses to one insert of a deleted row (no silent loss)', () => {
    let ops = [insertOp()];
    ops = apply(ops, planCoalesce(ops, patchOp({ quantity: 3 }), null));
    ops = apply(ops, planCoalesce(ops, patchOp({ status: 'deleted', acted_by: 'u1' }), null));
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('insert');
    expect((ops[0].payload as Item).status).toBe('deleted');
  });

  it('add → delete → restore collapses to one insert back to pending', () => {
    let ops = [insertOp()];
    ops = apply(ops, planCoalesce(ops, patchOp({ status: 'deleted' }), null));
    ops = apply(ops, planCoalesce(ops, patchOp({ status: 'pending', acted_by: null }), null));
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('insert');
    expect((ops[0].payload as Item).status).toBe('pending');
  });

  it('patch + patch merges last-write-wins into one patch op', () => {
    let ops = [patchOp({ quantity: 2 }, { opId: 'p1', createdAt: 1 })];
    ops = apply(
      ops,
      planCoalesce(ops, patchOp({ quantity: 5, priority: 'urgent' }, { opId: 'p2', createdAt: 2 }), null)
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('patch');
    expect((ops[0].payload as Partial<Item>).quantity).toBe(5);
    expect((ops[0].payload as Partial<Item>).priority).toBe('urgent');
    // FIFO position is preserved (keeps the earliest createdAt).
    expect(ops[0].createdAt).toBe(1);
  });

  it('delete after a server-side insert (no queued insert) becomes a single delete patch', () => {
    const plan = planCoalesce([], patchOp({ status: 'deleted' }), null);
    expect(plan.delete).toHaveLength(0);
    expect(plan.put).toHaveLength(1);
    expect(plan.put[0].kind).toBe('patch');
    expect((plan.put[0].payload as Partial<Item>).status).toBe('deleted');
  });

  it('never merges into the locked (in-flight) op — a concurrent edit becomes a fresh op', () => {
    const locked = insertOp({ opId: 'locked' });
    const plan = planCoalesce([locked], patchOp({ quantity: 9 }, { opId: 'new' }), 'locked');
    expect(plan.delete).toHaveLength(0); // locked op untouched
    expect(plan.put).toHaveLength(1);
    expect(plan.put[0].opId).toBe('new'); // the edit is a brand-new op
  });

  it('with a locked in-flight op AND a queued non-locked op, a patch merges into the non-locked op', () => {
    // locked = in-flight insert; queued = a patch already waiting behind it.
    // Incoming patch should fold into the queued non-locked op (keeps the queue
    // at 2 ops: [locked-insert, merged-patch]) rather than spawning a third op.
    const locked = insertOp({ opId: 'locked', createdAt: 1 });
    const queued = patchOp({ quantity: 3 }, { opId: 'queued', createdAt: 2 });
    const existing = [locked, queued];
    const plan = planCoalesce(existing, patchOp({ quantity: 7, priority: 'urgent' }, { opId: 'incoming', createdAt: 3 }), 'locked');
    // The locked op must not be in plan.delete, and the queued op is merged (not deleted).
    expect(plan.delete).not.toContain('locked');
    expect(plan.delete).not.toContain('queued');
    // The merged result carries both patch fields last-write-wins.
    expect(plan.put).toHaveLength(1);
    expect(plan.put[0].opId).toBe('queued'); // same op id — merged in place
    expect((plan.put[0].payload as Partial<Item>).quantity).toBe(7);
    expect((plan.put[0].payload as Partial<Item>).priority).toBe('urgent');
  });
});
