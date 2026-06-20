// Active-shop (tab) selection for per-shop lists (#19). Which shop's tab is in
// view is a per-device, per-group preference — like the active group (§12), it
// lives in localStorage, not the server. NULL means the "Unsorted" tab.
//
// Keyed per group so switching groups remembers each one's last-open tab.

const PREFIX = 'trolley.activeShop.';

export function loadActiveShop(groupId: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(PREFIX + groupId) : null;
  } catch {
    return null;
  }
}

export function saveActiveShop(groupId: string, shopId: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (shopId === null) localStorage.removeItem(PREFIX + groupId);
    else localStorage.setItem(PREFIX + groupId, shopId);
  } catch {
    /* private mode / storage disabled — preference just won't persist */
  }
}

/**
 * Resolve which shop tab to show for a group, given a (possibly stale)
 * preference and the trips currently loaded. Falls back to Unsorted (null) when
 * the preferred shop no longer has a current trip — so a deleted shop can never
 * strand the view on an empty tab. `shopIdsWithTrip` is the set of shop ids
 * (excluding null) that have a current active/shopping trip.
 */
export function resolveActiveShop(
  preferredId: string | null,
  shopIdsWithTrip: Set<string>
): string | null {
  if (preferredId && shopIdsWithTrip.has(preferredId)) return preferredId;
  return null; // Unsorted is always present (the group's shop-less trip)
}
