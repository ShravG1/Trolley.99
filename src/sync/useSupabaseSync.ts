import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  listMyGroups,
  signInAnonymously,
  setAnonymousFlag,
  fetchServerTime,
  probeConnectivity,
  ensureSession,
  fetchShops,
  fetchItemCategories,
  saveItemCategory,
} from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import type { RemoteWriter } from '@/store/remote';
import type { GroupMember, Item, Shop, Trip } from '@/types/models';
import type { Database } from '@/types/database';
import { throttle } from '@/lib/throttle';
import { resolveActiveGroup } from '@/lib/activeGroup';
import { loadActiveShop, resolveActiveShop } from '@/lib/activeShop';
import { setServerOffset, computeOffset } from '@/lib/serverTime';
import { createItemWriter, type InnerItemWriter } from './itemWriter';
import { createOpStore } from './queue/idb';
import { createReplayEngine, type ReplayEngine } from './queue/replay';
import { saveSnapshot, loadCachedSnapshot } from './queue/snapshot';

// -----------------------------------------------------------------------------
// Supabase sync layer (§6.3–6.4).
//
// Owns auth, the initial bootstrap, the group-scoped Realtime subscriptions, and
// the RemoteWriter the store calls after each optimistic update. Realtime is the
// reconciler: server rows are deduped into the store by their client id. On a
// trips change (start/cancel/complete) we reload — cheap at household scale and
// correct across the new-active-trip handoff after completion.
// -----------------------------------------------------------------------------

export type SyncStatus = 'demo' | 'loading' | 'signed-out' | 'needs-group' | 'ready';

interface Sync {
  status: SyncStatus;
  session: Session | null;
  /** Re-check membership after creating/joining a group. */
  refresh: () => void;
}

type Row = Record<string, unknown>;

function rowToItem(r: Row): Item {
  return {
    id: r.id as string,
    trip_id: r.trip_id as string,
    name: r.name as string,
    quantity: r.quantity as number,
    category: r.category as Item['category'],
    priority: r.priority as Item['priority'],
    status: r.status as Item['status'],
    added_by: r.added_by as string,
    added_by_name: r.added_by_name as string,
    acted_by: (r.acted_by as string) ?? null,
    acted_by_name: (r.acted_by_name as string) ?? null,
    substitution_note: (r.substitution_note as string) ?? null,
    note: (r.note as string) ?? null,
    unit: (r.unit as string) ?? null,
    attempt_count: (r.attempt_count as number) ?? 1,
    created_at: r.created_at as string,
    acted_at: (r.acted_at as string) ?? null,
  };
}

function rowToTrip(r: Row, members: GroupMember[]): Trip {
  const shopperId = (r.shopper_id as string) ?? null;
  return {
    id: r.id as string,
    group_id: r.group_id as string,
    status: r.status as Trip['status'],
    shop_id: (r.shop_id as string) ?? null, // missing pre-migration → Unsorted (#19)
    shopper_id: shopperId,
    shopper_name: shopperId ? (members.find((m) => m.user_id === shopperId)?.display_name ?? null) : null,
    lastminute_until: (r.lastminute_until as string) ?? null,
    started_at: (r.started_at as string) ?? null,
    completed_at: (r.completed_at as string) ?? null,
  };
}

export function useSupabaseSync(): Sync {
  const [status, setStatus] = useState<SyncStatus>(isSupabaseConfigured() ? 'loading' : 'demo');
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tick, setTick] = useState(0);
  // Which group is in view (§12). Persisted in the store; changing it re-runs the
  // bootstrap effect below, re-scoping every channel to the new group.
  const activeGroupId = useStore((s) => s.activeGroupId);

  // One items channel per current trip (#19) — a group now has several current
  // trips (one per shop tab), and each shop runs its own lifecycle. Keyed by
  // trip id so a reload only (un)subscribes the trips that actually changed.
  const itemsChannels = useRef<Map<string, RealtimeChannel>>(new Map());
  const tripsChannel = useRef<RealtimeChannel | null>(null);
  const presenceChannel = useRef<RealtimeChannel | null>(null);
  const groupId = useRef<string | null>(null);
  // True when this boot fell back to the cached snapshot (offline) — the first
  // reconnect then does a full re-bootstrap to re-establish realtime (§5/§10).
  const offlineFallback = useRef(false);

  // Auth: track the session; long-lived + auto-refresh keeps people signed in
  // through a shop (§5.3).
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    // Learn the server-clock offset once so the UI's window/staleness checks agree
    // with the server (§6.5). Best-effort; falls back to the device clock.
    void fetchServerTime().then((t) => {
      if (t) setServerOffset(computeOffset(t, Date.now()));
    });
    sb.auth.getSession().then(async ({ data }) => {
      // Validate the stored session's user still exists server-side (anonymous
      // users can be pruned). If it's gone, drop it so the anon-sign-in effect
      // mints a fresh one — otherwise reads look empty and writes FK-error.
      if (data.session) {
        // Only re-auth on a definitive 403 (user gone) — not on a network blip,
        // which would wrongly drop a valid session and its group.
        const { error } = await sb.auth.getUser();
        if (error && (error as { status?: number }).status === 403) {
          await sb.auth.signOut();
          setSession(null);
          setAuthChecked(true);
          return;
        }
      }
      // Keep Realtime authorised so RLS-filtered postgres_changes actually deliver
      // (otherwise the anon role can't SELECT and live sync goes silent).
      if (data.session) sb.realtime.setAuth(data.session.access_token);
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) sb.realtime.setAuth(s.access_token);
      setSession(s);
      setAuthChecked(true);
      setAnonymousFlag(s?.user?.is_anonymous ?? true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // No session once auth has been checked → silently sign in anonymously (the
  // default, frictionless path). If anonymous sign-ins are off, fall back to the
  // email recovery screen.
  useEffect(() => {
    if (!isSupabaseConfigured() || !authChecked || session) return;
    let cancelled = false;
    (async () => {
      const ok = await signInAnonymously();
      if (cancelled) return;
      if (!ok) setStatus('signed-out'); // recovery screen (magic link)
    })();
    return () => {
      cancelled = true;
    };
  }, [authChecked, session]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    if (!session) {
      useStore.getState().setRemote(null);
      return; // status driven by the anon-sign-in effect above
    }

    let cancelled = false;
    const sb = supabase;

    // Presence is chatty (heartbeats + every join/leave); throttle the store
    // update so a 30-minute shop doesn't re-render the list to death (§6.4).
    const pushViewers = throttle(
      (ids: string[]) => useStore.getState().setViewers(ids),
      4000
    );

    async function fetchMembers(gid: string): Promise<GroupMember[]> {
      const { data } = await sb
        .from('group_members')
        .select('group_id, user_id, display_name, joined_at, role')
        .eq('group_id', gid);
      return (data ?? []) as GroupMember[];
    }

    // Fetch the group's shops + ALL current (active|shopping) trips — one per shop
    // tab incl. the Unsorted shop-less trip — plus the items across them, and push
    // the snapshot into the store (#19). Re-subscribes the items channels to the
    // current trip set (handles new shops + the post-completion handoff).
    async function reload() {
      const gid = groupId.current;
      if (!gid || cancelled) return;
      const members = await fetchMembers(gid);
      const shops = await fetchShops(gid); // [] if the shops backend isn't present yet
      const { data: tripRows } = await sb
        .from('trips')
        .select('*')
        .eq('group_id', gid)
        .in('status', ['active', 'shopping']);
      const trips = (tripRows ?? []).map((r) => rowToTrip(r as Row, members));
      if (trips.length === 0) return; // every group always has ≥1 active trip
      const tripIds = trips.map((t) => t.id);

      const { data: itemRows } = await sb.from('items').select('*').in('trip_id', tripIds);
      const items = (itemRows ?? []).map((r) => rowToItem(r as Row));

      // Resolve the tab to show: keep the user's current choice if it still has a
      // trip, else their saved per-group preference, else Unsorted (#19).
      const shopIdsWithTrip = new Set(
        trips.map((t) => t.shop_id).filter((id): id is string => id != null)
      );
      const pref = useStore.getState().activeShopId ?? loadActiveShop(gid);
      const activeShopId = resolveActiveShop(pref, shopIdsWithTrip);

      if (cancelled) return;
      useStore.getState().loadSnapshot({ userId: session!.user.id, members, shops, trips, items, activeShopId });

      // Persist the server snapshot so an offline boot can show this list (§5/§10).
      // Best-effort + cached items are the raw server rows (offline edits are
      // re-applied from the queue on restore, so they're not double-counted).
      if (CACHE_ENABLED) {
        const { groups, userId, trip } = useStore.getState();
        void saveSnapshot({
          userId, groups, trip, trips, shops, activeShopId, members, items, savedAt: Date.now(),
        });
      }

      // Refresh the household's learned aisles (0016) alongside the list. Not
      // awaited: the cached memory is already in the store, so nothing waits on
      // it, and a null result (pre-migration / offline) leaves the cache alone.
      void fetchItemCategories(gid).then((memory) => {
        if (memory && !cancelled && groupId.current === gid) {
          useStore.getState().setCategoryMemory(memory, gid);
        }
      });

      subscribeItemsForTrips(tripIds);
    }

    // Keep an items channel open for exactly the current set of trip ids: drop the
    // ones that went away (a shop deleted / a trip completed) and open the new ones.
    function subscribeItemsForTrips(tripIds: string[]) {
      const desired = new Set(tripIds);
      for (const [tid, ch] of itemsChannels.current) {
        if (!desired.has(tid)) {
          ch.unsubscribe();
          itemsChannels.current.delete(tid);
        }
      }
      for (const tid of desired) {
        if (itemsChannels.current.has(tid)) continue;
        // Realtime respects RLS; the filter keeps us to this trip only (§5.1, §6.4).
        const ch = sb
          .channel(`items:${tid}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'items', filter: `trip_id=eq.${tid}` },
            (payload) => {
              if (payload.eventType === 'DELETE') return;
              useStore.getState().applyServerItem(rowToItem(payload.new as Row));
            }
          )
          .subscribe();
        itemsChannels.current.set(tid, ch);
      }
    }

    function subscribeTrips(gid: string) {
      tripsChannel.current?.unsubscribe();
      tripsChannel.current = sb
        .channel(`trips:${gid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'trips', filter: `group_id=eq.${gid}` },
          () => void reload() // start/cancel/complete → re-derive current trip
        )
        .subscribe();
    }

    // Live "who's viewing" (§6.4). A presence channel per group: each client
    // tracks itself; on every sync we push the present user ids (throttled) into
    // the store, where the List/spectator views resolve them to names. Ephemeral
    // and in-memory server-side — no schema, no publication, no RLS rows.
    function subscribePresence(gid: string, uid: string) {
      presenceChannel.current?.unsubscribe();
      const channel = sb.channel(`presence:${gid}`, {
        // Key by user id so a member's multiple tabs/devices collapse to one
        // entry — we want "who", not "how many sockets".
        config: { presence: { key: uid } },
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          // presenceState() keys are the tracked user ids (our chosen key).
          pushViewers(Object.keys(channel.presenceState()));
        })
        .subscribe((statusText) => {
          // (Re)announce ourselves on every (re)join — covers reconnects after
          // the socket drops in the background (§6.4).
          if (statusText === 'SUBSCRIBED') {
            void channel.track({ user_id: uid, online_at: new Date().toISOString() });
          }
        });
      presenceChannel.current = channel;
    }

    // Restore the cached snapshot for offline boot: show the last server state
    // with the still-pending offline changes folded back in (§5/§10). Returns
    // false (→ stay on the splash, the old behaviour) if there's no usable cache.
    async function restoreFromCache(): Promise<boolean> {
      const cache = await loadCachedSnapshot();
      if (!cache || cancelled) return false;
      useStore.getState().setGroups(cache.groups); // keep the switcher populated
      // Only show a cached list if it's the group we're trying to view.
      if (activeGroupId && cache.trip.group_id !== activeGroupId) return false;
      groupId.current = cache.trip.group_id;
      useStore.getState().hydrateCategoryMemory(cache.trip.group_id); // offline boot (0016)
      const items = await reconcileWithQueue(cache.items);
      if (cancelled) return false;
      // Caches written before per-shop tabs (#19) only have a single `trip`.
      const trips = cache.trips ?? [cache.trip];
      const shops: Shop[] = cache.shops ?? [];
      const activeShopId = cache.activeShopId ?? null;
      useStore.getState().loadSnapshot({
        userId: cache.userId, members: cache.members, shops, trips, items, activeShopId,
      });
      return true;
    }

    (async () => {
      offlineFallback.current = false;
      try {
        const groups = await listMyGroups();
        if (cancelled) return;
        useStore.getState().setGroups(groups); // feed the switcher (§12)
        if (groups.length === 0) {
          setStatus('needs-group');
          return;
        }
        // Scope everything to the active group. Resolve the stored preference
        // against the live list; if it differs (first run, or a stale id from a
        // group we've left), reflect it and bail — the resulting activeGroupId
        // change re-runs this effect, which then subscribes to the right group.
        const resolved = resolveActiveGroup(groups, activeGroupId)!;
        if (resolved !== activeGroupId) {
          useStore.getState().setActiveGroup(resolved);
          return;
        }
        groupId.current = resolved;
        // Put this group's cached aisle memory up front (0016) so the first
        // paint already files things correctly; reload() then refreshes it.
        useStore.getState().hydrateCategoryMemory(resolved);
        installWriter(reload);
        subscribeTrips(resolved);
        subscribePresence(resolved, session!.user.id);
        await reload();
        if (!cancelled) setStatus('ready');
      } catch {
        // Offline / backend unreachable at boot. Fall back to the cached list so
        // the shop is usable and writes can queue, instead of hanging forever.
        if (cancelled || !CACHE_ENABLED) return;
        installWriter(reload); // ensure the queue engine exists (offline writes + drain on reconnect)
        if (await restoreFromCache()) {
          offlineFallback.current = true;
          if (!cancelled) setStatus('ready');
        }
      }
    })();

    // Re-fetch on reconnect, and whenever the app comes back to the foreground —
    // mobile drops the Realtime socket in the background, so this keeps the list
    // fresh even if a live event was missed (§6.4). After an offline-cache boot
    // the first reconnect needs a full re-bootstrap (realtime was never wired), so
    // bump the effect rather than just reloading.
    const reconnect = () => {
      // After an offline-cache boot, realtime was never wired — re-bootstrap fully
      // rather than just reloading. Otherwise (the normal case) a light reload.
      if (offlineFallback.current) {
        offlineFallback.current = false;
        setTick((t) => t + 1);
      } else {
        void reload();
      }
    };
    const onOnline = () => reconnect();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // Don't re-bootstrap while still offline (it would just flash the splash and
      // re-restore the cache); a plain reload is a harmless no-op when offline.
      if (offlineFallback.current && !navigator.onLine) void reload();
      else reconnect();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      for (const ch of itemsChannels.current.values()) ch.unsubscribe();
      itemsChannels.current.clear();
      tripsChannel.current?.unsubscribe();
      presenceChannel.current?.unsubscribe();
      tripsChannel.current = null;
      presenceChannel.current = null;
      // Stop any queued trailing update, then drop the group slice so a switch
      // can't show/act on the previous group while the new snapshot loads (§12).
      pushViewers.cancel();
      useStore.getState().clearGroupScope();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeGroupId, tick]);

  return { status, session, refresh: () => setTick((t) => t + 1) };
}

// One awaitable item writer per app (the offline queue, once wired, replays
// through the same instance — see docs/OFFLINE_PLAN.md). Lazily created; reused
// across re-installs (group switches) since the writes target by id, not by the
// group the writer was installed for.
let _itemWriter: InnerItemWriter | null = null;
function getItemWriter(sb: SupabaseClient<Database>): InnerItemWriter {
  if (!_itemWriter) _itemWriter = createItemWriter(sb);
  return _itemWriter;
}

// Offline write queue feature flag (docs/OFFLINE_PLAN.md §8). On by default now
// the dark deploy is verified; set VITE_OFFLINE_QUEUE='0' to kill-switch back to
// the online-only direct path (which then dead-code-eliminates the queue).
const QUEUE_ENABLED = import.meta.env.VITE_OFFLINE_QUEUE !== '0';

// Offline read-cache feature flag (docs/OFFLINE_PLAN.md §5/§10). On by default
// now the dark deploy is verified; set VITE_OFFLINE_CACHE='0' to kill-switch back
// to online-only reads (the snapshot persist + offline-boot restore go inert).
const CACHE_ENABLED = import.meta.env.VITE_OFFLINE_CACHE !== '0';

// The global replay engine — one durable queue across all groups (§5). Created
// once and reused; its online/visibility listeners live for the app's lifetime.
let _engine: ReplayEngine | null = null;
// Latest reload, refreshed each install so the engine can reconcile after a fatal
// drop without capturing a stale (wrong-group) closure.
let _latestReload: (() => Promise<void>) | null = null;
function getEngine(inner: InnerItemWriter): ReplayEngine {
  if (_engine) return _engine;
  _engine = createReplayEngine({
    db: createOpStore(),
    inner,
    // Real connectivity probe (§4) — completes against Supabase = online; throws =
    // offline. (Must NOT use fetchServerTime: its Date header is null cross-origin,
    // so it always read "offline" and the queue never drained.)
    probe: probeConnectivity,
    ensureSession,
    hooks: {
      onPending: (ids) => useStore.getState().setPendingWriteIds(ids),
      onDropped: (n) => {
        // The list moved on (window closed / trip completed / RLS): tell the user
        // and resync so the un-saveable optimistic change is rolled back (§6).
        useStore.getState().pushToast(`Couldn’t save ${n} change${n === 1 ? '' : 's'} — the list moved on.`);
        void _latestReload?.();
      },
    },
  });
  _engine.start();
  return _engine;
}

// Fold the still-pending offline ops into a cached server snapshot so an offline
// boot shows changes made since the last sync. No engine (queue off) → cache as-is.
function reconcileWithQueue(cacheItems: Item[]): Promise<Item[]> {
  return _engine ? _engine.snapshotItems(cacheItems) : Promise.resolve(cacheItems);
}

type ItemWrites = Pick<RemoteWriter, 'insertItem' | 'patchItem'>;

// Online-only path (queue off): self-heal the session, write, and on failure
// toast + reload to roll the optimistic change back — the pre-queue behaviour.
function directItemWrites(inner: InnerItemWriter, reload: () => Promise<void>): ItemWrites {
  return {
    insertItem(item) {
      void (async () => {
        // Self-heal a silently-dropped anon session before the write (§5.3).
        try {
          await ensureSession();
        } catch {
          /* offline / sign-in failed — the insert below will surface it */
        }
        const res = await inner.insertItem(item);
        if (!res.ok) {
          // Window closed / not a member / etc. — resync truth + explain (§6.6).
          useStore.getState().pushToast('Couldn’t add that — check you’re still on this list.');
          await reload();
        }
      })();
    },
    patchItem(id, patch) {
      void (async () => {
        try {
          await ensureSession();
        } catch {
          /* offline / sign-in failed — the update below will surface it */
        }
        const res = await inner.patchItem(id, patch);
        if (!res.ok) {
          useStore.getState().pushToast('Can’t do that.');
          await reload();
        }
      })();
    },
  };
}

// Queue path (queue on): enqueue durably and return immediately — no rollback,
// the optimistic item stays put and replays when back online. groupId/tripId are
// snapshotted from the live store at enqueue time so a later group switch can't
// retarget the op (§5).
function queuedItemWrites(engine: ReplayEngine): ItemWrites {
  const tripIdFor = (itemId: string) =>
    useStore.getState().items.find((i) => i.id === itemId)?.trip_id ?? useStore.getState().trip.id;
  return {
    insertItem(item) {
      void engine.enqueueInsert(item, useStore.getState().trip.group_id, item.trip_id);
    },
    patchItem(id, patch) {
      void engine.enqueuePatch(id, patch, useStore.getState().trip.group_id, tripIdFor(id));
    },
  };
}

// The write side the store calls (§6.3). Item writes go through the queue (when
// enabled) or the direct online path; trip-lifecycle/notify stay fire-and-forget
// RPCs that lean on reload() to reconcile and toast the reason on failure (§6.6).
function installWriter(reload: () => Promise<void>) {
  const sb = supabase!;
  const inner = getItemWriter(sb);
  _latestReload = reload; // keep the engine's fatal-drop reconcile pointed at the live group
  const itemWrites = QUEUE_ENABLED ? queuedItemWrites(getEngine(inner)) : directItemWrites(inner, reload);

  // Read the live store each call — a captured snapshot would target the wrong
  // group after a switch (the writer outlives the group it was installed for).
  function groupIdOf(): string {
    return useStore.getState().trip.group_id;
  }

  const writer: RemoteWriter = {
    ...itemWrites,

    startShopping(tripId, minutes, silent = false) {
      void (async () => {
        const { data, error } = await sb.rpc('start_shopping', {
          p_trip_id: tripId,
          p_minutes: minutes ?? 0,
        });
        // 0 rows back (null) => someone beat you (§7.1).
        if (error || !data) {
          useStore.getState().pushToast('Someone’s already shopping.');
          await reload();
          return;
        }
        // Silent shop (§2.6): claimed the trip, but hold the push — nobody's phone
        // buzzes. Realtime still updates anyone with the app open.
        if (silent) return;
        // Tell the group someone's gone shopping (§2.6, §2.10).
        const me = useStore.getState();
        const name = me.members.find((m) => m.user_id === me.userId)?.display_name ?? 'Someone';
        sb.functions
          .invoke('send-push', {
            body: { groupId: groupIdOf(), kind: 'shopping', actorName: name, minutes: minutes ?? 0 },
          })
          .catch(() => {});
      })();
    },

    cancelShopping(tripId) {
      void (async () => {
        const { error } = await sb.rpc('cancel_shopping', { p_trip_id: tripId });
        if (error) await reload();
      })();
    },

    completeTrip(tripId) {
      void (async () => {
        const { error } = await sb.rpc('complete_trip', { p_trip_id: tripId });
        if (error) useStore.getState().pushToast('Couldn’t finish the trip.');
        await reload(); // pulls the fresh active trip + rolled-over items
      })();
    },

    takeOverShopping(tripId) {
      void (async () => {
        const { data, error } = await sb.rpc('take_over_shopping', { p_trip_id: tripId });
        if (error || !data) {
          useStore.getState().pushToast('Couldn’t take over — they may still be at it.');
        }
        await reload();
      })();
    },

    learnCategory(name, category) {
      // Best-effort (0016): the store has already applied it locally and told the
      // user. A failure here just means the household re-teaches it next time —
      // never worth a toast on top of the "Saved" one they just saw.
      void saveItemCategory(groupIdOf(), name, category).catch(() => {});
    },

    notify(kind, ownerId, itemName, actorName) {
      void sb.functions
        .invoke('send-push', {
          body: { groupId: groupIdOf(), kind, item: itemName, actorName, targetUserId: ownerId },
        })
        .catch(() => {
          /* best-effort; never block the UI */
        });
    },

    // Shop tabs (#19). These touch trips/shops, not the optimistic item queue, so
    // each fires its RPC then reload()s to reconcile (the DB is the truth).
    createShop(name) {
      void (async () => {
        const { data, error } = await sb.rpc('create_shop', { p_group_id: groupIdOf(), p_name: name });
        if (error || !data) {
          useStore.getState().pushToast('Couldn’t add that shop.');
          return;
        }
        await reload(); // pulls the new shop + its active trip
        useStore.getState().setActiveShop(data as string); // jump to the new tab
      })();
    },

    renameShop(shopId, name) {
      void (async () => {
        const { error } = await sb.rpc('rename_shop', { p_shop_id: shopId, p_name: name });
        if (error) await reload(); // revert the optimistic rename
      })();
    },

    deleteShop(shopId) {
      void (async () => {
        const { error } = await sb.rpc('delete_shop', { p_shop_id: shopId });
        if (error) useStore.getState().pushToast('Couldn’t delete that shop.');
        await reload(); // pulls reparented items + drops the shop
      })();
    },

    moveItem(itemId, shopId) {
      void (async () => {
        const { error } = await sb.rpc('move_item_to_shop', { p_item_id: itemId, p_shop_id: shopId });
        if (error) useStore.getState().pushToast('Couldn’t move that.');
        await reload(); // reconcile the reparented trip_id
      })();
    },
  };

  useStore.getState().setRemote(writer);
}
