# Architecture

## Front end ↔ back end contract (§6)

- **One source of truth for types (§6.1):** generate from the schema
  (`supabase gen types`) into `src/types/database.ts` and import it. The
  hand-written `src/types/models.ts` mirrors the shape until that lands and
  documents the intended generated form.
- **Server-authoritative rules (§6.2):** one active trip per group, one shopper at
  a time, window-close, who-can-do-what, rollover/recurrence/hot-list — all enforced
  server-side via RLS `WITH CHECK`, DB constraints and RPCs. The pure mirrors live
  in `src/lib/rules.ts` so the UI and the DB stay honest, and they're unit-tested.
- **Optimistic + reconciliation (§6.3):** items get a **client-generated UUID** on
  add and that id is sent to the server. When Realtime echoes the insert back, the
  client dedupes against the optimistic row. Rejected writes roll back + toast the
  reason. Realtime is the reconciler.
- **Realtime (§6.4):** subscribe ONLY to the active group's `items` and `trips`. On
  reconnect, re-fetch the current list to catch missed events. **Live presence** runs
  on a separate per-group channel (`presence:<gid>`): each client tracks itself keyed
  by user id (so multiple tabs/devices collapse to one), and the throttled `sync`
  (`src/lib/throttle.ts`, leading+trailing, 4s) feeds the present user ids into the
  store, where the List + spectator views resolve them to the "…looking too" line
  (`src/lib/presence.ts`). Throttling keeps a 30-minute shop from melting the battery.
  Presence is ephemeral/in-memory server-side — no schema, publication or RLS rows.
- **Time authority (§6.5):** the window, recurrence and "is this locked" are judged
  against **server time** (`now()`), never the device clock. Reporting buckets in UK
  time with DST handled.

## State

`src/store/useStore.ts` is the optimistic client layer. Each mutation has a 1:1
counterpart in the SQL/RPC layer, marked with `// SERVER:` notes pointing at the rule
that enforces it for real. Swapping the in-memory seed for Supabase Realtime is a
contained change: replace the seed load + each mutation body with the corresponding
`supabase.from(...).insert/update` / `supabase.rpc(...)` call, and subscribe a
channel that feeds reconciled rows back into the same `set(...)`.

## Multi-group (§12)

A user can belong to many groups (the data model always allowed it). The store
holds `groups` (all memberships, with each group's name) and `activeGroupId`; the
active group is a **per-device** preference in localStorage (`src/lib/activeGroup.ts`),
not server state. The sync layer reads `activeGroupId` and includes it in its effect
deps, so switching groups tears down and rebuilds every group-scoped channel
(`items` / `trips` / `presence`) against the new group and reloads the snapshot —
the same teardown path used on reconnect. `resolveActiveGroup` falls back to the
first group when the stored id is missing or stale (a group you've since left), so a
stale preference can never strand you. On switch, `clearGroupScope()` drops the old
group's items/trip/members/viewers and sets a neutral placeholder trip + a `switching`
flag, so the previous group's list (or its shopper-mode actions) can't linger or be
acted on while the new snapshot loads — the list shows a brief loading state instead.

The multi-group surface is the **"Your lists" overview** (`src/screens/Lists.tsx`, route
`/lists`): a card per group with an at-a-glance status (`getGroupSummaries` — pending
count + "shopping now", two RLS-scoped queries, no N+1). Tapping a card flips
`activeGroupId`. Multi-group users land on `/lists` first (`src/lib/landing.ts` —
in-memory "entered a list" flag, so a fresh open greets them with all their lists but
in-session navigation stays on the chosen list); single-group users go straight to it.
Create/join-another reuses `GroupSetup` in `add` mode (`/groups/new`).

## The mode-shift (§1.6, the signature)

`src/lib/viewTransition.ts` wraps the List ↔ Shopping state change in the View
Transitions API. List re-flows from priority order (`groupForList`) into aisle-walk
order (`groupForShopping`); aisle colour bands bloom in. Each row and aisle band
carries a `view-transition-name` so the browser tweens them between layouts. Under
`prefers-reduced-motion` (or unsupported browsers) it degrades to an instant change.

## Concurrency (§7)

- **Single-shopper claim** is the atomic `start_shopping` RPC
  (`update … where status='active'`), backed by partial unique indexes
  (`one_active_per_group`, `one_shopping_per_group`). First writer wins; 0 rows back
  → "X's already shopping".
- **Window close** is the `items` insert `WITH CHECK`.
- **Simultaneous edits** are last-write-wins on `status`, stamping
  `acted_by`/`acted_at` — it's milk, not a bank ledger.
- **Rollover + hot-list rebuild** happen inside `complete_trip`, guarded by the same
  atomic status transition so it can't double-complete. Recurring fires from a
  scheduled function, idempotent per day via `last_added_at`.

## PWA (§8)

- `vite-plugin-pwa` (Workbox). App shell precached; fonts cache-first; list data is
  network-first and never written into a shared cache.
- Update lifecycle prompts "New version — refresh" (`UpdatePrompt`) rather than
  swapping mid-action.
- **Offline policy is explicit (§8.2): online-first.** Reads can come from cache;
  **writes require a connection** and are disabled with the offline banner. No
  offline write-queue in V1 — that's V2.
