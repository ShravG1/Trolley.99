import { create } from 'zustand';
import type { Item, ItemStatus, Trip, GroupMember } from '@/types/models';
import type { AisleKey } from '@/lib/aisles';
import { guessAisle, normaliseName } from '@/lib/categorise';
import { seedItems, seedMembers, seedTrip, CURRENT_USER } from './seed';
import type { RemoteWriter } from './remote';

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
  trip: Trip;
  items: Item[];
  toasts: Toast[];
  multiAddCount: number;

  /** Installed by the Supabase sync layer; null in demo mode (§6.3). */
  remote: RemoteWriter | null;
  setRemote: (remote: RemoteWriter | null) => void;
  /** Replace the whole local view from a server fetch (bootstrap / reload). */
  loadSnapshot: (snap: { userId: string; members: GroupMember[]; trip: Trip; items: Item[] }) => void;
  /** Reconcile a single item arriving over Realtime, deduped by id (§6.3). */
  applyServerItem: (item: Item) => void;

  // derived
  mode: () => Mode;
  shopperName: () => string | null;

  // item mutations
  addItem: (input: {
    name: string;
    quantity: number;
    category?: AisleKey;
    urgent: boolean;
  }) => void;
  setQuantity: (id: string, quantity: number) => void;
  setCategory: (id: string, category: AisleKey) => void;
  toggleUrgent: (id: string) => void;
  markBought: (id: string) => void;
  substitute: (id: string, newName: string, note: string) => void;
  markNotFound: (id: string) => void;
  deleteItem: (id: string) => void;
  restoreItem: (id: string) => void;

  // trip lifecycle
  startShopping: (windowMinutes: number | null) => boolean;
  cancelShopping: () => void;
  finishTrip: () => void;

  // toasts
  pushToast: (message: string, undo?: () => void) => void;
  dismissToast: (id: string) => void;

  resetMultiAdd: () => void;
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

export const useStore = create<StoreState>((set, get) => ({
  userId: CURRENT_USER.user_id,
  members: seedMembers,
  trip: seedTrip,
  items: seedItems,
  toasts: [],
  multiAddCount: 0,
  remote: null,

  setRemote(remote) {
    set({ remote });
  },

  loadSnapshot({ userId, members, trip, items }) {
    set({ userId, members, trip, items });
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

  mode() {
    const { trip, userId } = get();
    if (trip.status !== 'shopping') return 'list';
    return trip.shopper_id === userId ? 'shopping' : 'spectator';
  },

  shopperName() {
    return get().trip.shopper_name;
  },

  addItem({ name, quantity, category, urgent }) {
    const trimmed = name.trim();
    if (!trimmed) return; // server also rejects empty (§5.5)

    const { items, trip, userId, members } = get();
    const me = members.find((m) => m.user_id === userId);
    const norm = normaliseName(trimmed);

    // Dedupe within the active trip (§7.4): bump quantity instead of double-adding.
    const existing = items.find(
      (i) => i.status !== 'deleted' && normaliseName(i.name) === norm
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
      trip_id: trip.id,
      name: trimmed,
      quantity: Math.max(1, quantity),
      category: category ?? guessAisle(trimmed),
      priority: urgent ? 'urgent' : 'normal',
      status: 'pending',
      added_by: userId,
      added_by_name: me?.display_name ?? 'You',
      acted_by: null,
      acted_by_name: null,
      substitution_note: null,
      attempt_count: 1,
      created_at: now(),
      acted_at: null,
    };
    set((s) => ({ items: [...s.items, item], multiAddCount: s.multiAddCount + 1 }));
    // Remote insert; the writer fans out push (urgent → named; normal → debounced
    // count; never self — §2.10) after the row lands.
    get().remote?.insertItem(item);
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
    const guessed = guessAisle(newName);
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
    const { userId, members } = get();
    const me = members.find((m) => m.user_id === userId);
    const patch: Partial<Item> = {
      status: 'not_found',
      acted_by: userId,
      acted_by_name: me?.display_name ?? 'You',
      acted_at: now(),
    };
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    get().remote?.patchItem(id, patch);
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
    get().pushToast(`Binned ${item.name}. Undo?`, () => get().restoreItem(id));
  },

  restoreItem(id) {
    const patch: Partial<Item> = { status: 'pending', acted_by: null, acted_by_name: null, acted_at: null };
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    get().remote?.patchItem(id, patch);
  },

  startShopping(windowMinutes) {
    const { trip, userId, members } = get();
    // SERVER: atomic `update trips set status='shopping' ... where status='active'`
    // — first-writer-wins; 0 rows back => someone beat you (§7.1).
    if (trip.status !== 'active') return false;
    const me = members.find((m) => m.user_id === userId);
    const until =
      windowMinutes && windowMinutes > 0
        ? new Date(Date.now() + windowMinutes * 60_000).toISOString()
        : now(); // "off" locks immediately (§2.6)
    set({
      trip: {
        ...trip,
        status: 'shopping',
        shopper_id: userId,
        shopper_name: me?.display_name ?? 'You',
        lastminute_until: until,
        started_at: now(),
      },
    });
    // Remote claim is authoritative; if it loses the race the writer resyncs the
    // trip back to active and toasts "someone's already shopping" (§7.1).
    get().remote?.startShopping(trip.id, windowMinutes);
    return true;
  },

  cancelShopping() {
    // Lock-release exit (§2.6): return the list to everyone.
    const { trip } = get();
    set({
      trip: { ...trip, status: 'active', shopper_id: null, shopper_name: null, lastminute_until: null, started_at: null },
    });
    get().remote?.cancelShopping(trip.id);
  },

  finishTrip() {
    const { trip, items, remote } = get();
    const bought = items.filter((i) => i.status === 'bought' || i.status === 'substituted').length;
    const notFound = items.filter((i) => i.status === 'not_found');
    const rolled = notFound.length;

    // In Supabase mode the server owns the completion transaction (§7.4): it
    // creates the fresh active trip and rolls items with real ids, then the sync
    // layer reloads. We don't build a local trip here or its id would diverge.
    if (remote) {
      remote.completeTrip(trip.id);
      get().pushToast(`Trip done. ${bought} bought, ${rolled} rolled over.`);
      return;
    }

    // SERVER: inside the completion transaction guarded by `where status='shopping'`
    // (§7.4) — complete this trip, create a fresh active trip, roll over not-found
    // items with bumped attempt_count, then rebuild the hot list.
    const newTrip: Trip = {
      id: uid(),
      group_id: trip.group_id,
      status: 'active',
      shopper_id: null,
      shopper_name: null,
      lastminute_until: null,
      started_at: null,
      completed_at: null,
    };
    const rolledItems: Item[] = notFound.map((i) => ({
      ...i,
      id: uid(),
      trip_id: newTrip.id,
      status: 'pending' as ItemStatus,
      attempt_count: i.attempt_count + 1,
      acted_by: null,
      acted_by_name: null,
      acted_at: null,
      created_at: now(),
    }));

    set({ trip: newTrip, items: rolledItems });
    get().pushToast(`Trip done. ${bought} bought, ${rolled} rolled over.`);
  },

  pushToast(message, undo) {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { id, message, undo }] }));
    setTimeout(() => get().dismissToast(id), 6000);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  resetMultiAdd() {
    set({ multiAddCount: 0 });
  },
}));
