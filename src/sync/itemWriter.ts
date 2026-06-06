import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { Item } from '@/types/models';
import { useStore } from '@/store/useStore';

// -----------------------------------------------------------------------------
// The item-write side of the RemoteWriter, extracted so it can be (a) driven
// directly online (the current behaviour) and (b) replayed by the offline queue
// once that lands — both consume the same awaitable, Result-reporting methods.
// insert/patch are the ONLY writes the queue ever replays (trip lifecycle stays
// fire-and-forget — see docs/OFFLINE_PLAN.md §3).
// -----------------------------------------------------------------------------

// What an awaitable write reports back so the caller can tell a transient
// failure (retry) from a permanent one (drop). `fatal` = a 4xx/RLS/constraint
// rejection that won't fix itself; non-fatal = network/5xx → worth retrying.
export type WriteResult = { ok: true } | { ok: false; fatal: boolean; error: string };

export interface InnerItemWriter {
  insertItem(item: Item): Promise<WriteResult>;
  patchItem(id: string, patch: Partial<Item>): Promise<WriteResult>;
}

// Map a Supabase/PostgREST failure to retry-or-drop. A Postgres-level `code` is a
// deterministic rejection (won't change on replay) → fatal; a missing code is
// almost always a transport/network failure → retry. Bias unknowns to retry
// (bounded by the replay engine's attempt cap) so we never silently drop a write
// that might have succeeded.
export function classifyWriteError(error: unknown): WriteResult {
  const e = (error ?? {}) as { code?: string; status?: number; message?: string };
  const msg = e.message ?? String(error);
  const code = e.code;
  if (code) {
    if (code === '23505') return { ok: true }; // duplicate PK = the row already landed (idempotent)
    if (code === '42501') return { ok: false, fatal: true, error: `rls: ${msg}` }; // RLS WITH CHECK rejection
    if (/^(22|23|P0)/.test(code)) return { ok: false, fatal: true, error: `${code}: ${msg}` }; // data/integrity/raise
  }
  const status = e.status;
  if (typeof status === 'number') {
    if (status === 408 || status === 429 || status >= 500) return { ok: false, fatal: false, error: `${status}: ${msg}` };
    if (status >= 400) return { ok: false, fatal: true, error: `${status}: ${msg}` };
  }
  return { ok: false, fatal: false, error: msg }; // no code/status → network → retry
}

export function createItemWriter(sb: SupabaseClient<Database>): InnerItemWriter {
  // Debounced normal-add count push (§2.10). One writer instance per app, so a
  // single trailing push batches a burst of adds. Read the live group each time —
  // a captured snapshot would notify the wrong group after a switch.
  let pendingCount = 0;
  let countTimer: ReturnType<typeof setTimeout> | null = null;
  const groupIdOf = () => useStore.getState().trip.group_id;

  async function fanOutPush(item: Item) {
    try {
      if (item.priority === 'urgent') {
        await sb.functions.invoke('send-push', {
          body: { groupId: groupIdOf(), kind: 'urgent', item: item.name },
        });
      } else {
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

  return {
    async insertItem(item) {
      try {
        // Upsert on the PK with ignoreDuplicates so replaying an insert whose ack
        // was lost (the row already committed) is a no-op rather than a 23505 —
        // the foundation of idempotent replay. WITH CHECK still runs on the
        // insert path. acted_*/substitution_note are sent (null for a fresh add,
        // so online behaviour is unchanged) so an offline add-then-act that
        // coalesces into a single insert carries its final state.
        const { error } = await sb.from('items').upsert(
          {
            id: item.id,
            trip_id: item.trip_id,
            name: item.name,
            quantity: item.quantity,
            category: item.category,
            priority: item.priority,
            status: item.status,
            added_by: item.added_by,
            added_by_name: item.added_by_name,
            acted_by: item.acted_by,
            acted_by_name: item.acted_by_name,
            acted_at: item.acted_at,
            substitution_note: item.substitution_note,
            attempt_count: item.attempt_count,
            note: item.note,
            unit: item.unit,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
        if (error) return classifyWriteError(error);
        void fanOutPush(item);
        return { ok: true };
      } catch (e) {
        return { ok: false, fatal: false, error: String(e) };
      }
    },

    async patchItem(id, patch) {
      try {
        const { error } = await sb.from('items').update(patch).eq('id', id);
        if (error) return classifyWriteError(error);
        // A 0-row update (the row was rolled/deleted server-side) returns no
        // error → treat as success so a stale queued patch dies harmlessly.
        return { ok: true };
      } catch (e) {
        return { ok: false, fatal: false, error: String(e) };
      }
    },
  };
}
