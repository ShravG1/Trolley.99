import type { Item } from '@/types/models';
import { AISLE_ORDER, type AisleKey } from './aisles';

export interface AisleGroup {
  aisle: AisleKey;
  items: Item[];
  done: number;
  total: number;
}

const visible = (i: Item) => i.status !== 'deleted';

/**
 * List mode (§2.2): urgent pinned to the very top, then grouped by aisle in
 * walk order, priority-within-aisle. Returns urgent items separately so the UI
 * can pin them above all aisles.
 */
export function groupForList(items: Item[]): { urgent: Item[]; groups: AisleGroup[] } {
  const live = items.filter(visible);
  const urgent = live.filter((i) => i.priority === 'urgent' && i.status === 'pending');
  const rest = live.filter((i) => !(i.priority === 'urgent' && i.status === 'pending'));
  return { urgent, groups: buildGroups(rest) };
}

/**
 * Shopping mode (§2.6): pure aisle-walk order; completed rows stay visible but
 * sink to the bottom of their aisle.
 */
export function groupForShopping(items: Item[]): AisleGroup[] {
  return buildGroups(items.filter(visible));
}

function buildGroups(items: Item[]): AisleGroup[] {
  const byAisle = new Map<AisleKey, Item[]>();
  for (const item of items) {
    const arr = byAisle.get(item.category) ?? [];
    arr.push(item);
    byAisle.set(item.category, arr);
  }

  const groups: AisleGroup[] = [];
  for (const aisle of AISLE_ORDER) {
    const arr = byAisle.get(aisle);
    if (!arr || arr.length === 0) continue;
    // pending/urgent first, completed sink to the bottom of the aisle
    arr.sort((a, b) => rank(a) - rank(b));
    const done = arr.filter((i) => i.status === 'bought' || i.status === 'substituted').length;
    groups.push({ aisle, items: arr, done, total: arr.length });
  }
  return groups;
}

function rank(i: Item): number {
  if (i.status === 'bought' || i.status === 'substituted') return 3;
  if (i.status === 'not_found') return 2;
  if (i.priority === 'urgent') return 0;
  return 1;
}

export function counts(items: Item[]) {
  const live = items.filter(visible);
  const total = live.length;
  const done = live.filter((i) => i.status === 'bought' || i.status === 'substituted').length;
  return { total, done };
}
