import { isAisleKey, type AisleKey } from './aisles';

// Learned item→aisle memory for a household (migration 0016).
//
// The server owns the truth (`item_categories`, per group, RLS-scoped). This is
// the client-side mirror: a plain normalised-name → aisle map, cached in
// localStorage so an offline boot — and the very first paint after a cold start,
// before the fetch lands — still puts things in the right aisle.
//
// Keyed per group, like the active-shop preference (§12): households disagree
// about where things live, and one group's vocabulary must never leak into
// another's suggestions.

export type CategoryMemory = Record<string, AisleKey>;

const PREFIX = 'trolley.itemCats.';
// Cap what we mirror locally. A household's real vocabulary is a few hundred
// things; the bound keeps a runaway list out of a ~5 MB localStorage budget.
const MAX_ENTRIES = 500;

/**
 * Read a group's cached memory. Every entry is re-validated on the way in:
 * localStorage is user-writable, so a hand-edited or corrupted blob must
 * degrade to "no memory", never to an unknown aisle key that would index
 * AISLES[…] as undefined and crash a render.
 */
export function loadCategoryMemory(groupId: string): CategoryMemory {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(PREFIX + groupId);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CategoryMemory = {};
    let n = 0;
    for (const [name, cat] of Object.entries(parsed as Record<string, unknown>)) {
      if (n >= MAX_ENTRIES) break;
      if (!name || name.length > 80) continue;
      // JSON.parse happily produces an own "__proto__" key; assigning it below
      // would hit Object.prototype's setter. Drop the prototype-plumbing names
      // outright rather than relying on that setter ignoring strings.
      if (name === '__proto__' || name === 'constructor' || name === 'prototype') continue;
      if (!isAisleKey(cat)) continue;
      out[name] = cat;
      n++;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCategoryMemory(groupId: string, memory: CategoryMemory): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const entries = Object.entries(memory).slice(0, MAX_ENTRIES);
    if (entries.length === 0) {
      localStorage.removeItem(PREFIX + groupId);
      return;
    }
    localStorage.setItem(PREFIX + groupId, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* private mode / quota — the memory just isn't cached; the server still has it */
  }
}
