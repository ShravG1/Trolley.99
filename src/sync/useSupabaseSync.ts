import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  listMyGroups,
  signInAnonymously,
  setAnonymousFlag,
} from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import type { RemoteWriter } from '@/store/remote';
import type { GroupMember, Item, Trip } from '@/types/models';

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

  const itemsChannel = useRef<RealtimeChannel | null>(null);
  const tripsChannel = useRef<RealtimeChannel | null>(null);
  const currentTripId = useRef<string | null>(null);
  const groupId = useRef<string | null>(null);

  // Auth: track the session; long-lived + auto-refresh keeps people signed in
  // through a shop (§5.3).
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
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

    async function fetchMembers(gid: string): Promise<GroupMember[]> {
      const { data } = await sb
        .from('group_members')
        .select('group_id, user_id, display_name, joined_at, role')
        .eq('group_id', gid);
      return (data ?? []) as GroupMember[];
    }

    // Fetch the current (active or shopping) trip + its items + members and push
    // the snapshot into the store. Re-subscribes the items channel if the active
    // trip changed (handles the post-completion handoff).
    async function reload() {
      const gid = groupId.current;
      if (!gid || cancelled) return;
      const members = await fetchMembers(gid);
      const { data: trips } = await sb
        .from('trips')
        .select('*')
        .eq('group_id', gid)
        .in('status', ['active', 'shopping'])
        .order('started_at', { ascending: false })
        .limit(1);
      const tripRow = trips?.[0];
      if (!tripRow) return;
      const trip = rowToTrip(tripRow as Row, members);

      const { data: itemRows } = await sb.from('items').select('*').eq('trip_id', trip.id);
      const items = (itemRows ?? []).map((r) => rowToItem(r as Row));

      if (cancelled) return;
      useStore.getState().loadSnapshot({ userId: session!.user.id, members, trip, items });

      if (currentTripId.current !== trip.id) {
        currentTripId.current = trip.id;
        subscribeItems(trip.id);
      }
    }

    function subscribeItems(tripId: string) {
      itemsChannel.current?.unsubscribe();
      // Realtime respects RLS; the filter keeps us to this trip only (§5.1, §6.4).
      itemsChannel.current = sb
        .channel(`items:${tripId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'items', filter: `trip_id=eq.${tripId}` },
          (payload) => {
            if (payload.eventType === 'DELETE') return;
            useStore.getState().applyServerItem(rowToItem(payload.new as Row));
          }
        )
        .subscribe();
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

    (async () => {
      const groups = await listMyGroups();
      if (cancelled) return;
      if (groups.length === 0) {
        setStatus('needs-group');
        return;
      }
      groupId.current = groups[0].group_id;
      installWriter(reload);
      subscribeTrips(groupId.current);
      await reload();
      if (!cancelled) setStatus('ready');
    })();

    // Re-fetch on reconnect to catch events missed during a drop (§6.4).
    const onOnline = () => void reload();
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      itemsChannel.current?.unsubscribe();
      tripsChannel.current?.unsubscribe();
      itemsChannel.current = null;
      tripsChannel.current = null;
      currentTripId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick]);

  return { status, session, refresh: () => setTick((t) => t + 1) };
}

// The write side the store calls (§6.3). Each op pushes to Postgres / an RPC and
// leans on Realtime + reload() to reconcile; on error it resyncs (effective
// rollback) and toasts the reason (§6.6).
function installWriter(reload: () => Promise<void>) {
  const sb = supabase!;
  const store = useStore.getState();

  let pendingCount = 0;
  let countTimer: ReturnType<typeof setTimeout> | null = null;

  function groupIdOf(): string {
    return store.trip.group_id;
  }

  async function fanOutPush(item: Item) {
    try {
      if (item.priority === 'urgent') {
        await sb.functions.invoke('send-push', {
          body: { groupId: groupIdOf(), kind: 'urgent', item: item.name },
        });
      } else {
        // Debounce normal adds into a single count push (§2.10).
        pendingCount += 1;
        if (countTimer) clearTimeout(countTimer);
        countTimer = setTimeout(() => {
          const count = pendingCount;
          pendingCount = 0;
          void sb.functions.invoke('send-push', {
            body: { groupId: groupIdOf(), kind: 'count', count },
          });
        }, 4000);
      }
    } catch {
      /* push is best-effort; never block the list (§2.10) */
    }
  }

  const writer: RemoteWriter = {
    insertItem(item) {
      void (async () => {
        const { error } = await sb.from('items').insert({
          id: item.id,
          trip_id: item.trip_id,
          name: item.name,
          quantity: item.quantity,
          category: item.category,
          priority: item.priority,
          status: item.status,
          added_by: item.added_by,
          added_by_name: item.added_by_name,
          attempt_count: item.attempt_count,
        });
        if (error) {
          // Window closed / not a member / etc. — resync truth + explain (§6.6).
          useStore.getState().pushToast('List’s locked. They’re shopping.');
          await reload();
          return;
        }
        await fanOutPush(item);
      })();
    },

    patchItem(id, patch) {
      void (async () => {
        const { error } = await sb.from('items').update(patch).eq('id', id);
        if (error) {
          useStore.getState().pushToast('Can’t do that.');
          await reload();
        }
      })();
    },

    startShopping(tripId, minutes) {
      void (async () => {
        const { data, error } = await sb.rpc('start_shopping', {
          p_trip_id: tripId,
          p_minutes: minutes ?? 0,
        });
        // 0 rows back (null) => someone beat you (§7.1).
        if (error || !data) {
          useStore.getState().pushToast('Someone’s already shopping.');
          await reload();
        }
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
  };

  useStore.getState().setRemote(writer);
}
