import type { GroupMember } from '@/types/models';

// Live presence (§6.4). The Realtime presence channel reports the *user ids*
// currently viewing the group's list; this resolves them to display names for
// the "…looking too" line. Pure so it's unit-testable in isolation.
//
// `excludeIds` drops people who are shown elsewhere: always yourself, and — in
// spectator view — the active shopper (the ModeBanner already calls them out, so
// listing them again as "looking too" would be confusing). Unknown ids (present
// but not in our members list, e.g. mid-join) are filtered out.
export function viewerNames(
  viewerIds: string[],
  members: GroupMember[],
  excludeIds: string[]
): string[] {
  const exclude = new Set(excludeIds);
  return viewerIds
    .filter((id) => !exclude.has(id))
    .map((id) => members.find((m) => m.user_id === id)?.display_name)
    .filter((name): name is string => Boolean(name));
}
