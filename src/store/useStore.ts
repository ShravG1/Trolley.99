import { create } from 'zustand';
import type { Item, ItemStatus, Trip, GroupMember, MyGroup, Shop } from '@/types/models';
import { AISLES, type AisleKey } from '@/lib/aisles';
import { normaliseName, resolveAisle } from '@/lib/categorise';
import {
  loadCategoryMemory,
  saveCategoryMemory,
  type CategoryMemory,
} from '@/lib/categoryMemory';
import { seedItems, seedMembers, seedTrip, CURRENT_USER } from './seed';
import type { RemoteWriter } from './remote';
import { shouldNudge } from '@/lib/push';
import { loadActiveGroup, saveActiveGroup } from '@/lib/activeGroup';
import { saveActiveShop, DEFAULT_SHOP_LABEL } from '@/lib/activeShop';

// Pick which of the group's current trips a shop tab maps to (#19). Each shop has
// at most one current (active|shopping) trip; NULL shop = the Unsorted trip.
// Falls back to Unsorted, then to any trip, so the view always has a valid trip.
function pickTrip(trips: Trip[], shopId: string | null): Trip | undefined {
  return (
    trips.find((t) => (t.shop_id ?? null) === shopId) ??
    trips.find((t) => (t.shop_id ?? null) === null) ??
    trips[0]
  );
}

// -----------------------------------------------------------------------------
// Client state + optimistic layer (§6.3).
//
// This drives the whole UI locally so flows are demoable without a live backend.
// Every mutation here has a 1:1 counterpart in the Supabase RPC/RLS layer
// (supabase/migrations) — the server is the truth, this is provisional until a
// Realtime echo confirms it. The `// SERVER:` notes mark where the real call
// goes and which server-side rule enforces it for real (a disabled button is a
// courtesy; the DB is the bouncer — §6.2).
// -----------------------------------------------------------------------------

export type Mode = 'list' | 'shopping' | 'spectator';

export interface Toast {
  id: string;
  message: string;
  /** Optional undo action. */
  undo?: () => void;
}

interface StoreState {
  userId: string;
  members: GroupMember[];
  /** The trip for the shop tab currently in view (#19). Every item mutation +
   *  the trip lifecycle act on this trip, so the existing single-trip flows are
   *  unchanged — they just target the selected shop. */
  trip: Trip;
  /** All current (active|shopping) trips for the active group — one per shop tab
   *  (incl. the Unsorted shop-less trip). Drives the tab strip + per-tab state. */
  allTrips: Trip[];
  /** The group's shops (tabs), in display order. Empty = no shops yet (the app
   *  then looks exactly as before: one Unsorted list, no tab strip). */
  shops: Shop[];
  /** Which shop tab is in view; null = the Unsorted tab. */
  activeShopId: string | null;
  /** items across ALL current trips in the group; the view filters by trip.id. */
  items: Item[];
  toasts: Toast[];
  multiAddCount: number;
  /** Show the contextual "turn on notifications?" nudge (§2.10). */
  pushNudge: boolean;
  setPushNudge: (v: boolean) => void;

  /** Installed by the Supabase sync layer; null in demo mode (§6.3). */
  remote: RemoteWriter | null;
  setRemote: (remote: RemoteWriter | null) => void;
  /** Live viewers (user ids) on the active group's presence channel (§6.4). */
  viewers: string[];
  setViewers: (ids: string[]) => void;
  /** True when the active trip was started as a silent run (no group push). You
   *  slipped off without a ping, so if anyone's watching the list we flag it hard
   *  ("👀 …'s watching your shop"). Local only; clears on finish/cancel/switch. */
  silentRun: boolean;
  /** Item ids with a write still queued offline (the offline write queue,
   *  docs/OFFLINE_PLAN.md §7). Drives the "N changes will sync" indicator and
   *  keeps loadSnapshot from blinking out an as-yet-unsynced optimistic item. */
  pendingWriteIds: string[];
  setPendingWriteIds: (ids: string[]) => void;
  /** Change the signed-in user's own display name locally (after the RPC). */
  setMyName: (name: string) => void;
  /** All groups the user belongs to + which one is in view (§12 multi-group). */
  groups: MyGroup[];
  activeGroupId: string | null;
  setGroups: (groups: MyGroup[]) => void;
  setActiveGroup: (id: string) => void;
  /** True while a group switch's snapshot is loading — drives a loading state (§12). */
  switching: boolean;
  /** Drop the active group's slice on switch so the previous group's items/trip/
   *  shopper-mode can't linger (or be acted on) before the new snapshot lands. */
  clearGroupScope: () => void;
  /** Replace the whole local view from a server fetch (bootstrap / reload). The
   *  selected `trip` is resolved from `activeShopId` against the loaded trips. */
  loadSnapshot: (snap: {
    userId: string;
    members: GroupMember[];
    shops: Shop[];
    trips: Trip[];
    items: Item[];
    activeShopId: string | null;
  }) => void;
  /** Reconcile a single item arriving over Realtime, deduped by id (§6.3). */
  applyServerItem: (item: Item) => void;

  // learned item→aisle memory (0016)
  /** Where this household puts things, keyed by normalised item name. Server
   *  truth (`item_categories`), mirrored to localStorage so it survives a cold
   *  or offline boot. Empty = fall back to the keyword guess. */
  categoryMemory: CategoryMemory;
  /** Replace the memory wholesale from a server fetch (or the local cache). */
  setCategoryMemory: (memory: CategoryMemory, groupId?: string) => void;
  /** Load a group's cached memory synchronously, so the first paint after a
   *  switch already aisles things correctly rather than flashing the guess. */
  hydrateCategoryMemory: (groupId: string) => void;
  /** Remember a member's re-aisle so the next add lands there by itself, and
   *  say so. A no-op (silent) if it's already what we had — only a real change
   *  is worth a write and a toast. */
  learnCategory: (name: string, category: AisleKey) => void;

  // shop tabs (#19)
  /** Switch the visible shop tab — instant (data for all tabs is already loaded);
   *  null = Unsorted. Persisted per-group. */
  setActiveShop: (shopId: string | null) => void;
  createShop: (name: string) => void;
  renameShop: (shopId: string, name: string) => void;
  deleteShop: (shopId: string) => void;
  /** Move a still-live item to another shop's list (null = Unsorted). */
  moveItem: (itemId: string, shopId: string | null) => void;

  // derived
  mode: () => Mode;
  shopperName: () => string | null;

  // item mutations
  addItem: (input: {
    name: string;
    quantity: number;
    category?: AisleKey;
    urgent: boolean;
    note?: string;
    unit?: string;
    /** Shop tab to add to (#19); defaults to the tab in view. null = Unsorted. */
    shopId?: string | null;
  }) => void;
  setQuantity: (id: string, quantity: number) => void;
  setCategory: (id: string, category: AisleKey) => void;
  renameItem: (id: string, name: string) => void;
  setNote: (id: string, note: string) => void;
  setUnit: (id: string, unit: string) => void;
  toggleUrgent: (id: string) => void;
  markBought: (id: string) => void;
  substitute: (id: string, newName: string, note: string) => void;
  markNotFound: (id: string) => void;
  deleteItem: (id: string) => void;
  restoreItem: (id: string) => void;

  // trip lifecycle
  startShopping: (windowMinutes: number | null, silent?: boolean) => boolean;
  cancelShopping: () => void;
  finishTrip: () => void;
  takeOverShopping: () => void;

  // toasts
  pushToast: (message: string, undo?: () => void) => void;
  dismissToast: (id: string) => void;

  resetMultiAdd: () => void;
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

// Auto-dismiss timers, tracked so a manual dismiss/undo clears them (no leak).
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useStore = create<StoreState>((set, get) => ({
  userId: CURRENT_USER.user_id,
  members: seedMembers,
  trip: seedTrip,
  allTrips: [seedTrip],
  shops: [],
  activeShopId: null,
  items: seedItems,
  toasts: [],
  multiAddCount: 0,
  pushNudge: false,
  remote: null,
  viewers: [],
  silentRun: false,
  pendingWriteIds: [],
  groups: [],
  activeGroupId: loadActiveGroup(),
  switching: false,
  // Seed from whatever's cached for the group we're most likely to open, so the
  // very first render already knows the household's aisles. Replaced by the
  // server fetch (or a group switch) as soon as one lands.
  categoryMemory: loadCategoryMemory(loadActiveGroup() ?? seedTrip.group_id),

  setPushNudge(v) {
    set({ pushNudge: v });
  },

  setRemote(remote) {
    set({ remote });
  },

  setViewers(ids) {
    set({ viewers: ids });
  },

  setPendingWriteIds(ids) {
    set({ pendingWriteIds: ids });
  },

  setGroups(groups) {
    set({ groups });
  },

  setActiveGroup(id) {
    saveActiveGroup(id);
    set({ activeGroupId: id });
  },

  clearGroupScope() {
    set((s) => ({
      items: [],
      members: [],
      viewers: [],
      silentRun: false,
      shops: [],
      activeShopId: null,
      switching: true,
      // Aisle memory is per-group (0016) — drop it with the rest of the slice so
      // the group we're switching to can't inherit the previous household's.
      categoryMemory: {},
      // Neutral placeholder so mode() => 'list' (no stale shopper actions) for the
      // group we're switching to, until its real snapshot replaces this.
      trip: {
        id: '',
        group_id: s.activeGroupId ?? s.trip.group_id,
        status: 'active',
        shop_id: null,
        shopper_id: null,
        shopper_name: null,
        lastminute_until: null,
        started_at: null,
        completed_at: null,
      },
      allTrips: [],
    }));
  },

  loadSnapshot({ userId, members, shops, trips, items, activeShopId }) {
    set((s) => {
      // Keep optimistic items still queued for any of the loaded trips but not yet
      // on the server, so a reload on reconnect doesn't blink them out before the
      // queue replays them — the realtime echo reconciles them in
      // (docs/OFFLINE_PLAN.md §5). With the queue off, pendingWriteIds is empty, so
      // this is a no-op and the snapshot replaces wholesale as before.
      const serverIds = new Set(items.map((i) => i.id));
      const tripIds = new Set(trips.map((t) => t.id));
      const pending = new Set(s.pendingWriteIds);
      const keep = s.items.filter(
        (i) => pending.has(i.id) && !serverIds.has(i.id) && tripIds.has(i.trip_id)
      );
      const selected = pickTrip(trips, activeShopId);
      return {
        userId,
        members,
        shops,
        allTrips: trips,
        // Reflect the resolved tab (a stale/deleted shop falls back to Unsorted).
        activeShopId: selected ? (selected.shop_id ?? null) : activeShopId,
        trip: selected ?? s.trip,
        items: keep.length ? [...items, ...keep] : items,
        switching: false,
      };
    });
  },

  setActiveShop(shopId) {
    const { activeGroupId, allTrips, trip } = get();
    if (activeGroupId) saveActiveShop(activeGroupId, shopId);
    set({ activeShopId: shopId, trip: pickTrip(allTrips, shopId) ?? trip });
  },

  createShop(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const remote = get().remote;
    if (remote) {
      remote.createShop(trimmed); // RPC creates the shop + its trip, then reloads + selects it
      return;
    }
    // Demo (no backend): make a local shop + active trip and switch to it.
    const { activeGroupId, trip, shops, allTrips, userId } = get();
    const gid = activeGroupId ?? trip.group_id;
    const shopId = uid();
    const newShop: Shop = {
      id: shopId,
      group_id: gid,
      name: trimmed,
      sort_order: shops.length,
      created_by: userId,
      created_at: now(),
    };
    const newTrip: Trip = {
      id: uid(),
      group_id: gid,
      status: 'active',
      shop_id: shopId,
      shopper_id: null,
      shopper_name: null,
      lastminute_until: null,
      started_at: null,
      completed_at: null,
    };
    set({ shops: [...shops, newShop], allTrips: [...allTrips, newTrip] });
    get().setActiveShop(shopId);
  },

  renameShop(shopId, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((s) => ({ shops: s.shops.map((sh) => (sh.id === shopId ? { ...sh, name: trimmed } : sh)) }));
    get().remote?.renameShop(shopId, trimmed);
  },

  deleteShop(shopId) {
    const { activeShopId, shops, allTrips, items, trip } = get();
    // Carry the shop's live items back to the Unsorted trip so nothing's lost
    // (mirrors the server RPC); drop the shop + its trips.
    const gid = get().activeGroupId ?? trip.group_id;
    let unsorted = allTrips.find((t) => (t.shop_id ?? null) === null && t.status === 'active');
    let nextTrips = allTrips;
    if (!unsorted) {
      unsorted = {
        id: uid(),
        group_id: gid,
        status: 'active',
        shop_id: null,
        shopper_id: null,
        shopper_name: null,
        lastminute_until: null,
        started_at: null,
        completed_at: null,
      };
      nextTrips = [...allTrips, unsorted];
    }
    const unsortedId = unsorted.id;
    const shopTripIds = new Set(nextTrips.filter((t) => t.shop_id === shopId).map((t) => t.id));
    const nextItems = items.map((i) =>
      shopTripIds.has(i.trip_id) && (i.status === 'pending' || i.status === 'not_found')
        ? { ...i, trip_id: unsortedId }
        : i
    );
    set({
      shops: shops.filter((sh) => sh.id !== shopId),
      allTrips: nextTrips.filter((t) => t.shop_id !== shopId),
      items: nextItems,
    });
    if (activeShopId === shopId) get().setActiveShop(null);
    get().remote?.deleteShop(shopId);
  },

  moveItem(itemId, shopId) {
    const { items, allTrips, shops } = get();
    const dest = pickTrip(allTrips, shopId);
    if (dest) {
      set({ items: items.map((i) => (i.id === itemId ? { ...i, trip_id: dest.id } : i)) });
    }
    get().remote?.moveItem(itemId, shopId);
    // Confirm the move — the item leaves the current tab instantly, so name the
    // tab it landed on (null = the default "General" list).
    const name = shopId === null ? DEFAULT_SHOP_LABEL : shops.find((s) => s.id === shopId)?.name;
    if (name) get().pushToast(`Moved to ${name}`);
  },

  applyServerItem(item) {
    set((s) => {
      const idx = s.items.findIndex((i) => i.id === item.id);
      if (idx === -1) return { items: [...s.items, item] };
      const next = s.items.slice();
      next[idx] = item; // server row wins (it's the truth)
      return { items: next };
    });
  },

  setCategoryMemory(memory, groupId) {
    const gid = groupId ?? get().activeGroupId ?? get().trip.group_id;
    if (gid) saveCategoryMemory(gid, memory);
    set({ categoryMemory: memory });
  },

  hydrateCategoryMemory(groupId) {
    set({ categoryMemory: loadCategoryMemory(groupId) });
  },

  learnCategory(name, category) {
    const norm = normaliseName(name);
    if (!norm) return;
    const { categoryMemory } = get();
    if (categoryMemory[norm] === category) return; // already what we knew — no write, no toast
    get().setCategoryMemory({ ...categoryMemory, [norm]: category });
    // SERVER: set_item_category RPC — membership-checked, name normalised and
    // aisle key validated there too (0016). Fire-and-forget: the local memory is
    // useful on its own, and a failed save just means we learn it again next time.
    get().remote?.learnCategory(name, category);
    get().pushToast(`Saved — ${name.trim()} goes in ${AISLES[category].label} next time.`);
  },

  mode() {
    const { trip, userId } = get();
    if (trip.status !== 'shopping') return 'list';
    return trip.shopper_id === userId ? 'shopping' : 'spectator';
  },

  shopperName() {
    return get().trip.shopper_name;
  },

  addItem({ name, quantity, category, urgent, note, unit, shopId }) {
    const trimmed = name.trim();
    if (!trimmed) return; // server also rejects empty (§5.5)

    const { items, trip, allTrips, userId, members, categoryMemory } = get();
    // Target the selected shop's trip by default; an explicit shopId adds to a
    // different tab (#19). Resolve to a real current trip; never invent an id.
    const targetTrip = shopId === undefined ? trip : pickTrip(allTrips, shopId) ?? trip;
    const me = members.find((m) => m.user_id === userId);
    const norm = normaliseName(trimmed);

    // Dedupe within the TARGET shop's trip (§7.4): bump quantity instead of
    // double-adding. Only a still-pending row counts — re-adding something already
    // bought/not-found/substituted this trip adds a fresh pending item, not a bump.
    const existing = items.find(
      (i) => i.trip_id === targetTrip.id && i.status === 'pending' && normaliseName(i.name) === norm
    );
    if (existing) {
      const nextQty = existing.quantity + quantity;
      const nextPriority = urgent ? 'urgent' : existing.priority;
      set({
        items: items.map((i) =>
          i.id === existing.id ? { ...i, quantity: nextQty, priority: nextPriority } : i
        ),
      });
      get().remote?.patchItem(existing.id, { quantity: nextQty, priority: nextPriority });
      return;
    }

    // SERVER: insert into items (client-generated id for dedupe; WITH CHECK
    // enforces window/shopper rule — §6.3, §7.2).
    const item: Item = {
      id: uid(),
      trip_id: targetTrip.id,
      name: trimmed,
      quantity: Math.max(1, quantity),
      // Learned memory first, keyword guess second (§2.4, 0016) — so the tenth
      // "Oatly" goes straight to Dairy without anyone re-aisling it again.
      category: category ?? resolveAisle(trimmed, categoryMemory),
      priority: urgent ? 'urgent' : 'normal',
      status: 'pending',
      added_by: userId,
      added_by_name: me?.display_name ?? 'You',
      acted_by: null,
      acted_by_name: null,
      substitution_note: null,
      note: note?.trim() || null,
      unit: unit?.trim() || null,
      attempt_count: 1,
      created_at: now(),
      acted_at: null,
    };
    set((s) => ({ items: [...s.items, item], multiAddCount: s.multiAddCount + 1 }));
    // Remote insert; the writer fans out push (urgent → named; normal → debounced
    // count; never self — §2.10) after the row lands.
    get().remote?.insertItem(item);
    // Contextual moment to offer notifications: just after a first urgent item,
    // and only when there's actually a backend + others to notify (§2.10).
    if (urgent && get().remote && get().members.length > 1 && shouldNudge()) {
      set({ pushNudge: true });
    }
  },

  setQuantity(id, quantity) {
    const q = Math.max(1, quantity);
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, quantity: q } : i)) }));
    get().remote?.patchItem(id, { quantity: q });
  },

  setCategory(id, category) {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, category } : i)) }));
    get().remote?.patchItem(id, { category });
  },

  renameItem(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return; // server also rejects empty (§5.5)
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, name: trimmed } : i)) }));
    get().remote?.patchItem(id, { name: trimmed });
  },

  setNote(id, note) {
    const next = note.trim() || null;
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, note: next } : i)) }));
    get().remote?.patchItem(id, { note: next });
  },

  setUnit(id, unit) {
    const next = unit.trim() || null;
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, unit: next } : i)) }));
    get().remote?.patchItem(id, { unit: next });
  },

  setMyName(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { userId } = get();
    set((s) => ({
      members: s.members.map((m) => (m.user_id === userId ? { ...m, display_name: trimmed } : m)),
    }));
  },

  toggleUrgent(id) {
    const current = get().items.find((i) => i.id === id);
    if (!current) return;
    const priority = current.priority === 'urgent' ? 'normal' : 'urgent';
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, priority } : i)) }));
    get().remote?.patchItem(id, { priority });
  },

  markBought(id) {
    const { userId, members } = get();
    const me = members.find((m) => m.user_id === userId);
    // SERVER: last-write-wins on status, stamping acted_by/acted_at (§7.3).
    const patch: Partial<Item> = {
      status: 'bought',
      acted_by: userId,
      acted_by_name: me?.display_name ?? 'You',
      acted_at: now(),
    };
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    get().remote?.patchItem(id, patch);
  },

  substitute(id, newName, note) {
    const { userId, members, items } = get();
    const me = members.find((m) => m.user_id === userId);
    const target = items.find((i) => i.id === id);
    if (!target) return;
    // The replacement is a different thing ("Oat milk" for "Milk") — re-aisle it,
    // preferring what the household has learned about the new name.
    const guessed = resolveAisle(newName, get().categoryMemory);
    const patch: Partial<Item> = {
      name: newName.trim() || target.name,
      status: 'substituted',
      substitution_note: note.trim() || `instead of ${target.name}`,
      category: guessed === 'other' ? target.category : guessed,
      acted_by: userId,
      acted_by_name: me?.display_name ?? 'You',
      acted_at: now(),
    };
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    get().remote?.patchItem(id, patch);
  },

  markNotFound(id) {
    const { userId, members, items } = get();
    const me = members.find((m) => m.user_id === userId);
    const item = items.find((i) => i.id === id);
    const patch: Partial<Item> = {
      status: 'not_found',
      acted_by: userId,
      acted_by_name: me?.display_name ?? 'You',
      acted_at: now(),
    };
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    get().remote?.patchItem(id, patch);
    // Ping the person who added it (not yourself) that it couldn't be found.
    if (item && item.added_by !== userId) {
      get().remote?.notify('not_found', item.added_by, item.name, me?.display_name ?? 'Someone');
    }
  },

  deleteItem(id) {
    const { items, userId, members } = get();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const me = members.find((m) => m.user_id === userId);
    const patch: Partial<Item> = {
      status: 'deleted',
      acted_by: userId,
      acted_by_name: me?.display_name ?? 'You',
      acted_at: now(),
    };
    set({ items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    get().remote?.patchItem(id, patch);
    // Ping the person who added it (not yourself) that you binned it.
    if (item.added_by !== userId) {
      get().remote?.notify('binned', item.added_by, item.name, me?.display_name ?? 'Someone');
    }
    get().pushToast(`Binned ${item.name}. Undo?`, () => get().restoreItem(id));
  },

  restoreItem(id) {
    const patch: Partial<Item> = { status: 'pending', acted_by: null, acted_by_name: null, acted_at: null };
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    get().remote?.patchItem(id, patch);
  },

  startShopping(windowMinutes, silent = false) {
    const { trip, userId, members } = get();
    // SERVER: atomic `update trips set status='shopping' ... where status='active'`
    // — first-writer-wins; 0 rows back => someone beat you (§7.1).
    if (trip.status !== 'active') return false;
    const me = members.find((m) => m.user_id === userId);
    const until =
      windowMinutes && windowMinutes > 0
        ? new Date(Date.now() + windowMinutes * 60_000).toISOString()
        : now(); // "off" locks immediately (§2.6)
    const updated: Trip = {
      ...trip,
      status: 'shopping',
      shopper_id: userId,
      shopper_name: me?.display_name ?? 'You',
      lastminute_until: until,
      started_at: now(),
    };
    // Keep allTrips in step so the tab's "being shopped" dot updates instantly.
    // Remember a silent run so the UI can flag watchers ("👀 …'s watching your shop").
    set((s) => ({ trip: updated, silentRun: silent, allTrips: s.allTrips.map((t) => (t.id === updated.id ? updated : t)) }));
    // Remote claim is authoritative; if it loses the race the writer resyncs the
    // trip back to active and toasts "someone's already shopping" (§7.1).
    // Silent shop (§2.6): claim the trip but skip the group-wide push, so nobody
    // gets pinged. The live ModeBanner still shows to anyone already watching.
    get().remote?.startShopping(trip.id, windowMinutes, silent);
    return true;
  },

  takeOverShopping() {
    // Reclaim an abandoned shop (§2.6). Server enforces the 90-min staleness
    // rule atomically; here we optimistically become the shopper.
    const { trip, userId, members } = get();
    if (trip.status !== 'shopping') return;
    const me = members.find((m) => m.user_id === userId);
    // Mirror the RPC, which closes the last-minute window on take-over
    // (lastminute_until = now()) — otherwise the new shopper briefly sees the
    // previous shopper's open window until reload() corrects it.
    const updated: Trip = { ...trip, shopper_id: userId, shopper_name: me?.display_name ?? 'You', lastminute_until: now(), started_at: now() };
    // Taking over an existing shop isn't a silent run — clear any stale flag.
    set((s) => ({ trip: updated, silentRun: false, allTrips: s.allTrips.map((t) => (t.id === updated.id ? updated : t)) }));
    get().remote?.takeOverShopping(trip.id);
  },

  cancelShopping() {
    // Lock-release exit (§2.6): return the list to everyone.
    const { trip } = get();
    const updated: Trip = { ...trip, status: 'active', shopper_id: null, shopper_name: null, lastminute_until: null, started_at: null };
    set((s) => ({ trip: updated, silentRun: false, allTrips: s.allTrips.map((t) => (t.id === updated.id ? updated : t)) }));
    get().remote?.cancelShopping(trip.id);
  },

  finishTrip() {
    const { trip, items, remote, allTrips } = get();
    // Scope completion to the shop tab in view (#19) — other shops' lists are
    // independent and untouched.
    const mine = items.filter((i) => i.trip_id === trip.id);
    const others = items.filter((i) => i.trip_id !== trip.id);
    const bought = mine.filter((i) => i.status === 'bought' || i.status === 'substituted').length;
    // Roll over everything not bought (un-ticked + not-found) so nothing is lost.
    const carry = mine.filter((i) => i.status === 'pending' || i.status === 'not_found');
    const rolled = carry.length;

    // In Supabase mode the server owns the completion transaction (§7.4): it
    // creates the fresh active trip (same shop) and rolls items with real ids, then
    // the sync layer reloads. We don't build a local trip here or its id would diverge.
    if (remote) {
      set({ silentRun: false }); // trip's over — drop the silent-run flag
      remote.completeTrip(trip.id);
      get().pushToast(`Trip done. ${bought} bought, ${rolled} rolled over.`);
      return;
    }

    // Demo: mirror the server — fresh active trip on the SAME shop + rolled items.
    const newTrip: Trip = {
      id: uid(),
      group_id: trip.group_id,
      status: 'active',
      shop_id: trip.shop_id ?? null,
      shopper_id: null,
      shopper_name: null,
      lastminute_until: null,
      started_at: null,
      completed_at: null,
    };
    const rolledItems: Item[] = carry.map((i) => ({
      ...i,
      id: uid(),
      trip_id: newTrip.id,
      status: 'pending' as ItemStatus,
      attempt_count: i.attempt_count + (i.status === 'not_found' ? 1 : 0),
      acted_by: null,
      acted_by_name: null,
      acted_at: null,
      created_at: now(),
    }));

    set({
      trip: newTrip,
      silentRun: false,
      allTrips: allTrips.map((t) => (t.id === trip.id ? newTrip : t)),
      items: [...others, ...rolledItems],
    });
    get().pushToast(`Trip done. ${bought} bought, ${rolled} rolled over.`);
  },

  pushToast(message, undo) {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, message, undo }] }));
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), 6000));
  },

  dismissToast(id) {
    const timer = toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  resetMultiAdd() {
    set({ multiAddCount: 0 });
  },
}));

// Dev-only: expose the store to QA/screenshot harnesses for state setup.
// `import.meta.env.DEV` is false in production builds, so this is stripped out.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}
