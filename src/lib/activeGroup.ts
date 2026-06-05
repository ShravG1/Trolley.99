import type { MyGroup } from '@/types/models';

// Active-group selection for multi-group support (§12). Which of your groups is
// currently in view is a per-device preference, so it lives in localStorage —
// not the server. The sync layer reads it on bootstrap and re-scopes its
// channels whenever it changes.

const KEY = 'trolley.activeGroup';

export function loadActiveGroup(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  } catch {
    return null;
  }
}

export function saveActiveGroup(id: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, id);
  } catch {
    /* private mode / storage disabled — preference just won't persist */
  }
}

/**
 * Pick the active group id from the user's groups given a (possibly stale)
 * preference. Falls back to the first group when the preference is missing or
 * points at a group they've since left, so a stale localStorage value can never
 * strand someone on a group they're no longer in. Null only when they have none.
 */
export function resolveActiveGroup(groups: MyGroup[], preferredId: string | null): string | null {
  if (groups.length === 0) return null;
  return groups.find((g) => g.group_id === preferredId)?.group_id ?? groups[0].group_id;
}
