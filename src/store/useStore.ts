import { create } from 'zustand';
import type { Item, ItemStatus, Trip, GroupMember } from '@/types/models';
import type { AisleKey } from '@/lib/aisles';
import { guessAisle, normaliseName } from '@/lib/categorise';
import { seedItems, seedMembers, seedTrip, CURRENT_USER } from './seed';

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
      set({
        items: items.map((i) =>
          i.id === existing.id
            ? { ...i, quantity: i.quantity + quantity, priority: urgent ? 'urgent' : i.priority }
            : i
        ),
      });
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
    // SERVER: push fan-out (urgent → named; normal → debounced count; never self — §2.10).
  },

  setQuantity(id, quantity) {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i)),
    }));
  },

  setCategory(id, category) {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, category } : i)) }));
  },

  toggleUrgent(id) {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, priority: i.priority === 'urgent' ? 'normal' : 'urgent' } : i
      ),
    }));
  },

  markBought(id) {
    const { userId, members } = get();
    const me = members.find((m) => m.user_id === userId);
    // SERVER: last-write-wins on status, stamping acted_by/acted_at (§7.3).
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, status: 'bought' as ItemStatus, acted_by: userId, acted_by_name: me?.display_name ?? 'You', acted_at: now() }
          : i
      ),
    }));
  },

  substitute(id, newName, note) {
    const { userId, members } = get();
    const me = members.find((m) => m.user_id === userId);
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              name: newName.trim() || i.name,
              status: 'substituted' as ItemStatus,
              substitution_note: note.trim() || `instead of ${i.name}`,
              category: guessAisle(newName) === 'other' ? i.category : guessAisle(newName),
              acted_by: userId,
              acted_by_name: me?.display_name ?? 'You',
              acted_at: now(),
            }
          : i
      ),
    }));
  },

  markNotFound(id) {
    const { userId, members } = get();
    const me = members.find((m) => m.user_id === userId);
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, status: 'not_found' as ItemStatus, acted_by: userId, acted_by_name: me?.display_name ?? 'You', acted_at: now() }
          : i
      ),
    }));
  },

  deleteItem(id) {
    const { items, userId, members } = get();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const me = members.find((m) => m.user_id === userId);
    set({
      items: items.map((i) =>
        i.id === id
          ? { ...i, status: 'deleted' as ItemStatus, acted_by: userId, acted_by_name: me?.display_name ?? 'You', acted_at: now() }
          : i
      ),
    });
    get().pushToast(`Binned ${item.name}. Undo?`, () => get().restoreItem(id));
  },

  restoreItem(id) {
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, status: 'pending' as ItemStatus, acted_by: null, acted_by_name: null, acted_at: null } : i
      ),
    }));
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
    return true;
  },

  cancelShopping() {
    // Lock-release exit (§2.6): return the list to everyone.
    const { trip } = get();
    set({
      trip: { ...trip, status: 'active', shopper_id: null, shopper_name: null, lastminute_until: null, started_at: null },
    });
  },

  finishTrip() {
    const { trip, items } = get();
    const bought = items.filter((i) => i.status === 'bought' || i.status === 'substituted').length;
    const notFound = items.filter((i) => i.status === 'not_found');
    const rolled = notFound.length;

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
