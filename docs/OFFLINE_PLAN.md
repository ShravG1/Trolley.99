# Offline Write Queue — Implementation Plan (Trolley)

> Design of record for the offline write queue. Companion to
> `docs/PROMPTS/offline-queue-session.md`. Line refs are accurate as of commit
> `a2c9997`; re-confirm before relying on a specific line.

## 1. Problem framing & the seam to exploit

Today every store mutation is two steps: (a) optimistic local `set(...)`, then
(b) `get().remote?.<method>()` — a fire-and-forget call into the `RemoteWriter`
installed by `installWriter` in `src/sync/useSupabaseSync.ts`. On failure the
writer toasts and calls `reload()`, which clobbers the optimistic edit. Offline =
guaranteed failure = silent loss mid-shop.

The clean insertion point is the **`RemoteWriter` interface itself**
(`src/store/remote.ts`). The store never touches Supabase directly; it only knows
this interface. So we wrap the real writer in a **queueing decorator** that
implements the same interface. The store's optimistic layer (`useStore.ts`) stays
**completely untouched**. This is the single most important design decision: do
not modify `useStore.ts` actions at all.

```
store actions ──> RemoteWriter (interface)
                      │
              ┌───────┴────────┐
              │ QueueingWriter  │  <-- NEW: persists op, returns immediately
              └───────┬────────┘
                      │ (on drain / online)
              ┌───────┴────────┐
              │ SupabaseWriter  │  <-- the current installWriter() body, refactored out
              └────────────────┘
```

---

## 2. Queue data model + durable storage

### Storage: IndexedDB, not localStorage
- localStorage is synchronous (jank on the shopping list during a drain), ~5MB,
  string-only, and shared with the Supabase auth token already living there
  (`src/lib/supabase.ts`). Mixing a write-heavy queue into the same store is risky.
- IndexedDB is async, transactional, and survives reload/PWA restart. A shop can
  queue dozens of ops; IDB handles this cleanly.
- **Do not** pull in a heavy wrapper. Use a tiny hand-rolled IDB helper (one
  object store, key = op id) — roughly the surface of `get/put/delete/getAll`.
  This matches the repo's "no over-engineering" posture (everything else here is
  hand-rolled: throttle, serverTime, activeGroup).

### Op record shape
New file `src/sync/queue/types.ts`:

```ts
QueuedOp = {
  opId: string            // uuid, queue's own id (NOT the item id)
  groupId: string         // captured at enqueue time — see §5 group-switch safety
  tripId: string          // captured at enqueue time
  kind: 'insert' | 'patch' | 'startShopping' | 'cancelShopping'
        | 'completeTrip' | 'takeOverShopping' | 'notify'
  itemId?: string         // client UUID for insert/patch (the coalescing key)
  payload: unknown        // Item (insert) | Partial<Item> (patch) | rpc args | notify args
  createdAt: number
  attempts: number
  lastError?: string
}
```

Key points:
- `groupId`/`tripId` are **snapshotted at enqueue**, not read live. The current
  writer reads `useStore.getState().trip.group_id` live; a queue must NOT do that
  or a group switch replays into the wrong group (§5).
- `itemId` is the client UUID already on `Item.id` (`crypto.randomUUID()`). It is
  the coalescing key.

### Coalescing rules (per `itemId`, applied at enqueue time)
The killer scenario: add → edit → delete while offline must not replay 3 fighting
calls. Rules:

1. **patch onto pending insert** → merge the patch into the queued insert's
   `payload` Item. Still one `insert` op. (Covers add-then-edit-qty/note/unit/
   category/rename/markBought-while-offline.)
2. **patch onto existing patch (same item)** → shallow-merge payloads into one
   `patch` op (last-write-wins per field). Keeps per-item op count at 1.
3. **delete (status:'deleted' patch) onto a pending insert** → **drop both**. The
   item never reached the server; nothing to do. (add-then-delete-offline =
   net zero server calls.)
4. **delete onto existing patches** → collapse to a single `patch {status:'deleted',
   acted_*}` op (the row exists server-side; we only need the final state).
5. **insert when a same-itemId op already exists** → cannot happen (ids are fresh
   uuids); treat as replace defensively.

Note: `restoreItem` is just a patch back to `status:'pending'`, so it coalesces
naturally under rule 2/4 — undo-after-delete-offline collapses to a single patch.

Trip-lifecycle ops (`startShopping` etc.) and `notify` are **not** coalesced by
itemId. `notify` is best-effort push; recommend **not queuing notify at all**
(drop it offline; pushes are already best-effort).

---

## 3. Where the queue sits relative to RemoteWriter

Refactor `installWriter()` into two pieces:

- **`createSupabaseWriter(reload)`** → returns the existing `RemoteWriter` object
  essentially as-is (the real network calls). One change: its methods must become
  **awaitable and report success/failure** so the queue knows whether to dequeue
  or retry. Today they're `void`-returning and swallow errors into toasts/reload.
  Introduce an internal `Result = {ok:true} | {ok:false, fatal:boolean,
  error:string}` returned by an internal async variant; the queue consumes that.
  `fatal` = RLS rejection / 4xx that won't fix itself (drop); non-fatal =
  network/5xx (retry).
- **`createQueueingWriter(inner, db)`** → implements `RemoteWriter`. Each method:
  snapshot `{groupId, tripId}` from live store at call time, build a `QueuedOp`,
  run coalescing, persist to IDB, then poke the replay engine. Returns `void`
  immediately (preserves the fire-and-forget contract the store relies on).

`installWriter` then does:
`setRemote(createQueueingWriter(createSupabaseWriter(reload), db))`.

The store is unaware. `remote.ts` interface is unchanged.

**MVP narrowing:** the queue only intercepts `insertItem` and `patchItem` (the
item writes the user listed as the motivation). `startShopping`/`cancelShopping`/
`completeTrip`/`takeOverShopping`/`notify` pass straight through to the inner
writer (their current behaviour — toast + reload on failure). Trip-lifecycle
while offline is rare and semantically fraught (races, RLS), so don't queue it in
v1. This keeps the risky surface tiny.

---

## 4. Replay engine

New file `src/sync/queue/replay.ts`. Responsibilities:

### Ordering
- **Per-item FIFO** is the only guarantee needed (coalescing already reduces to
  ≤1 op per item in practice; but inserts-then-later-patch across drains can
  produce 2). Process ops sorted by `createdAt`. Critically: an item's `insert`
  must run before any `patch` for that same item — sorting by `createdAt` gives
  this for free since the insert was enqueued first.
- Single-flight: a `draining` boolean prevents concurrent drains (online event +
  visibility event + manual trigger can all fire).

### Online detection (navigator.onLine lies)
- Trigger drain on: `window.addEventListener('online')`, `visibilitychange` →
  visible, app boot, and after each successful op (chain the queue).
- Because `navigator.onLine` reports true on captive/poor networks, do **not**
  trust it as a gate. Instead gate on a **real connectivity probe**: reuse
  `fetchServerTime()` (`src/lib/supabase.ts`) — a cheap authenticated HEAD to
  `/rest/v1/`. If it resolves, we're really online; if it throws, abort the drain
  and back off. This reuses existing code and the real Supabase origin (so it also
  catches Supabase-down, not just internet-down).

### Backoff
- Exponential with cap: e.g. 2s, 4s, 8s … max 60s, per drain attempt, with
  jitter. Reset on any successful op. Keep it simple — a single `setTimeout`
  reschedule, no library.

### Idempotency — the duplicate-insert hazard (verified)
- `items.id` is the **primary key**, client-generated (`0001_init.sql`), and the
  writer does a plain `.insert()` — **no `on conflict`**. So replaying an insert
  that actually committed server-side (e.g. the response was lost but the row
  landed) throws a **duplicate-key (23505)** error.
- **Fix:** change the insert path to an **upsert on the primary key**:
  `sb.from('items').upsert({...}, { onConflict: 'id', ignoreDuplicates: true })`.
  With `ignoreDuplicates`, a re-inserted row is a no-op, not an error — making
  insert replay idempotent. One-line change in the (refactored) supabase writer,
  **no migration** (PK conflict target already exists). Verify the RLS
  `items_insert WITH CHECK` still applies to upsert — it does (upsert insert path
  runs the INSERT policy).
- Patches are naturally idempotent (last-write-wins `UPDATE ... where id=`);
  replaying the same patch twice is harmless.

---

## 5. Reconciliation with realtime echoes / reload()

The tension: a queued patch may be **stale** relative to server state that arrived
via realtime (`applyServerItem`, server row wins) or `reload()` (full snapshot).

Concrete cases:
- **Queued op's row also arrives via realtime while still queued:** today
  `applyServerItem` overwrites the local item with the server row. If our op is
  still pending, that's fine — the op still carries the user's intended change and
  will replay LWW on drain. The risk is a *stale* queued patch overwriting *newer*
  server state on drain.
- **Recommendation (MVP, opinionated): accept last-write-wins.** The whole app is
  already LWW ("last-write-wins on status"; `applyServerItem` "server row wins").
  A queued patch replaying after someone else's newer change will clobber it — but
  this is the *exact same* semantics as two online users editing concurrently
  today. Offline doesn't make it worse in kind, only in time-window. Do **not**
  build vector clocks or field-level merge in v1. Document it.
- **One guard worth adding:** drop a queued **patch** whose target item no longer
  exists in the server snapshot after a `reload()` (e.g. item was deleted+rolled
  by trip completion). The drain should tolerate an `UPDATE ... where id=` that
  affects 0 rows (Supabase returns no error for 0-row updates) — so this is mostly
  free; just don't treat 0-rows as failure.
- **`completeTrip` rolls items to new ids server-side** (new uuids). A queued patch
  against an *old* tripId's item becomes a no-op (0 rows) — correct, the
  carried-over copy is a different row. This is why we **don't** queue completeTrip
  and why tripId is snapshotted: a stale patch simply dies harmlessly.

---

## 6. Conflict / edge cases

- **Trip completed / window closed while op queued:** on replay the RLS
  `items_insert WITH CHECK` rejects (trip no longer active/shopping or window
  expired). That's a **fatal** error (4xx). → drop the op, surface one
  consolidated toast: "N change(s) couldn't be saved — the list moved on." Don't
  infinitely retry RLS rejections.
- **Group switch with non-empty queue:** queue ops carry their own `groupId`
  (snapshotted, §2). Since each op also carries `tripId` and the write targets by
  id, draining all ops regardless of current group is safe (an insert/patch
  targets a specific trip/item, not "current group"). The danger was only in the
  *old* live-`groupIdOf()` read; we removed that for queued ops. Keep the queue
  **global (one IDB store, all groups)** but tag each op with groupId so the
  pending-count UI can be filtered to the active group. Simpler than per-group DBs.
- **Session dropped:** the replay engine calls `await ensureSession()`
  (`src/lib/supabase.ts`) at the **start of each drain** (not per-op), as the
  writer does today per call. If `ensureSession` throws (truly offline) → abort
  drain, back off. If it 403-resigns-in anonymously, the *new* anon user won't
  pass `added_by = auth.uid()` RLS on a queued insert built for the old user →
  fatal drop. Acceptable + rare; document it.
- **Permanent failure (max attempts):** cap at e.g. 5 non-fatal attempts → move to
  a "dead" state (delete from queue) and toast. Fatal (RLS/4xx) → drop
  immediately, no retries.

---

## 7. UX

- **OfflineBanner** (`src/components/OfflineBanner.tsx`): extend copy when the
  queue is non-empty: "Offline — N change(s) will sync when you're back." Read
  pending count from a small store field. Keep `role="status"` for SR
  announcement; ensure the count is in the live region text so it's announced.
- **Pending indicator:** add a `pendingWrites: number` to the Zustand store (a
  plain field + setter, no logic), updated by the queue after each enqueue/dequeue.
  A subtle badge/spinner near the list header. When online and draining, show
  "Syncing N…"; when offline, "N will sync".
- **Toast copy change:** today an offline add fails with "Couldn't add that…" and
  rolls back. With the queue, that path is no longer hit while offline (op is
  queued, no rollback). Reserve that toast for **fatal RLS rejection on replay**
  only, reworded: "Couldn't save N change(s) — the list moved on." For the happy
  offline case, **no error toast** — the optimistic item stays, banner shows count.
- **Accessibility:** announce sync state via the existing `role="status"` region;
  the syncing badge should have an `aria-label`. Don't rely on color alone.

---

## 8. Scope / sequencing

### Phase 0 — refactor (no behaviour change, safe to ship)
- Split `installWriter` into `createSupabaseWriter` (returns Result-reporting
  methods) + keep wiring. No queue yet. Add the `upsert/ignoreDuplicates`
  idempotency fix for inserts now (independent improvement). Gate:
  tsc/vitest/build. This de-risks the big change.

### Phase 1 — MVP behind a flag
- IDB helper, op types, coalescing, `createQueueingWriter` wrapping **insert +
  patch only**, replay engine with connectivity probe + backoff, `pendingWrites`
  store field, OfflineBanner copy.
- **Flag:** `VITE_OFFLINE_QUEUE` env (read in `installWriter`); off → current
  behaviour. Lets us merge to main without exposing it, then flip.
- Unit tests (below).

### Phase 2 — full
- Optional: queue trip-lifecycle ops, Background Sync API registration in the SW
  (it exists, `injectManifest`, so it's viable — register a `sync` event that
  postMessages clients to drain; **but** the SDK/auth live in the window, not the
  SW, so Background Sync here is only a *wake-up trigger*, not a place to do the
  writes. Low value vs. the in-page online listener; defer/skip).

### Deliberately NOT doing (guardrails)
- No CRDT / vector clocks / field-level merge — LWW only.
- No writing from inside the service worker (auth & Supabase client are
  window-scoped).
- No queuing of `notify` (best-effort push; drop offline).
- No per-group IndexedDB databases.
- No offline trip lifecycle in MVP.

### Testability
- `coalesce.test.ts`: add→edit→delete collapses to nothing; add→edit collapses to
  one insert; patch+patch merges LWW; delete-after-server-insert collapses to one
  delete-patch.
- `replay.test.ts`: per-item FIFO ordering (insert before patch); backoff
  increments attempts; fatal vs non-fatal handling; 0-row update treated as
  success.
- Simulate offline by injecting a fake `inner` writer (returns
  `{ok:false,fatal:false}`) and a fake IDB (in-memory Map) — no real network.
  Mirrors the existing `store.test.ts` pattern of driving the singleton store
  directly. Connectivity probe is injectable so tests don't hit `fetchServerTime`.

---

## 9. Risk assessment & rollout

| Risk | Mitigation |
|---|---|
| Duplicate-insert on replay (PK conflict) | upsert + `ignoreDuplicates` (Phase 0), verified against PK |
| Stale patch clobbers newer server state | Accept LWW (matches existing semantics); document |
| Replay into wrong group after switch | Snapshot groupId/tripId per op; target by id, never live `groupIdOf()` |
| Infinite retry of RLS-rejected ops | Classify fatal (4xx) → drop; cap non-fatal attempts |
| IDB unavailable (private mode/Safari) | Feature-detect; fall back to current no-queue behaviour (toast+rollback). Never throw into the store path |
| Refactor regresses online writes | Phase 0 is behaviour-preserving; full vitest pass |

**Gating per repo convention:** every phase passes `npx tsc -b`, `npx vitest run`,
`npm run build` before merge to `main`; verify prod by asset-hash. Ship Phase 0
and Phase 1 (flag off) to main first; flip `VITE_OFFLINE_QUEUE` on in a follow-up
once verified.

---

## Critical files

- `src/sync/useSupabaseSync.ts` — split `installWriter` into supabase writer +
  queueing writer; idempotent upsert; drain triggers.
- `src/store/remote.ts` — the `RemoteWriter` contract the queue must implement
  unchanged.
- `src/store/useStore.ts` — optimistic layer + `applyServerItem`/`loadSnapshot`
  reconcile — read-only reference, must stay untouched; add `pendingWrites` field.
- `src/components/OfflineBanner.tsx` — queued-count UX + accessibility.
- `supabase/migrations/0001_init.sql` — items PK + `items_insert` RLS WITH CHECK
  (governs idempotency and fatal-replay behaviour).

New files to add: `src/sync/queue/types.ts`, `src/sync/queue/idb.ts`,
`src/sync/queue/coalesce.ts`, `src/sync/queue/replay.ts`, plus
`coalesce.test.ts` / `replay.test.ts`.

---

## 10. Implementation notes (as built)

Deviations from the plan above, each made to avoid silently losing a write:

- **Coalescing unifies delete-onto-insert as a merge, not rule 3's "drop both".**
  Drop-both loses `add → delete → restore` while offline (the restore becomes a
  0-row no-op against a row the server never got, so the item shows locally but
  never syncs). Instead the delete merges into the queued insert, which replays
  as an insert of a `status='deleted'` row — inert (nothing rolls it over or
  counts it), and a later restore merges the status back to `'pending'`. Cost: a
  harmless tombstone row for an `add → delete` with no restore. (`coalesce.ts`.)
- **In-flight guard.** `planCoalesce` is told the op the engine is currently
  sending (`inFlight`) and never merges into it — a concurrent edit during a
  multi-second send becomes a fresh op that drains next, so the edit can't be
  dropped when the in-flight op is deleted on success. (`replay.ts` + `coalesce.ts`.)
- **Queue-aware `loadSnapshot`.** A reload on reconnect would briefly blink out an
  optimistic item that's queued-but-not-yet-replayed; `loadSnapshot` now keeps
  local items whose id is in `pendingWriteIds` and absent from the snapshot (for
  the current trip). No-op when the queue is off (`pendingWriteIds` stays empty).
- **IDB → memory fallback** rather than "fall back to no-queue": if IndexedDB is
  unavailable the queue uses an in-memory store, so same-session offline→replay
  still works (just not across restarts). Never throws into the write path.
- **Single store field `pendingWriteIds: string[]`** (distinct item ids) instead
  of a bare `pendingWrites` count — it powers both the indicator (`.length`) and
  the `loadSnapshot` guard. The pending count is global (all groups), not
  per-group-filtered (deferred; the plan flags filtering as optional).

Still deferred (Phase 2): persisting the optimistic read-cache so offline-added
items reappear after a PWA restart *while still offline* (today the durable queue
guarantees the write isn't lost — it replays + echoes back on reconnect — but the
item isn't shown until then). Trip-lifecycle queueing and Background Sync remain
out of scope.

**Flag:** `VITE_OFFLINE_QUEUE`. Phase 1 ships dark (on only when `=== '1'`); when
off the queue branch is dead-code-eliminated, so the build is behaviourally the
pre-queue app. The flip flips the default in `useSupabaseSync.ts`.
