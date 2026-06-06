import type { Item } from '@/types/models';
import type { QueuedOp } from './types';

export interface CoalescePlan {
  put: QueuedOp[]; // ops to (re)persist — a freshly created op or a merged one
  delete: string[]; // opIds to remove
}

// Fold an incoming op into the ops already queued for the SAME item (§2). The
// invariant is "at most one unlocked op per item", so add→edit→delete stays a
// single op instead of three fighting server calls on replay.
//
// `lockedOpId` is the op the replay engine is currently sending. We must never
// merge into it: its in-flight payload is what gets deleted on success, so a
// concurrent edit folded into it would be lost. Instead the edit becomes a fresh
// op that drains next (per-item FIFO by createdAt still holds).
//
// Deviation from the plan's rule 3 (drop-both for delete-onto-insert): we merge
// the delete into the queued insert instead. It replays as an insert of a
// status='deleted' row (inert — nothing rolls it over or counts it), which keeps
// add→delete→restore correct (restore merges the status back to 'pending') and
// never silently loses a write. The only cost is a harmless tombstone row for an
// add→delete with no later restore.
export function planCoalesce(
  existing: QueuedOp[],
  incoming: QueuedOp,
  lockedOpId: string | null
): CoalescePlan {
  const target = existing.find((o) => o.opId !== lockedOpId);
  if (!target) return { put: [incoming], delete: [] };

  // A fresh insert can't collide (ids are new uuids); replace defensively.
  if (incoming.kind === 'insert') return { put: [incoming], delete: [target.opId] };

  // incoming is a patch → merge its fields into the target, last-write-wins,
  // keeping the target's kind/opId/createdAt. Patch-onto-insert yields a still-
  // complete Item (it replays as an insert carrying the edit); patch-onto-patch
  // yields one collapsed patch.
  const merged: QueuedOp = {
    ...target,
    payload: { ...(target.payload as Partial<Item>), ...(incoming.payload as Partial<Item>) },
  };
  return { put: [merged], delete: [] };
}
