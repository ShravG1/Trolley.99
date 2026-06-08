# Offline trip lifecycle — plan & decision

Whether (and how) to let **start shopping / cancel / finish / take over** work
offline. These are the trip-state transitions; today they're online-only. Item
adds/ticks already queue (`docs/OFFLINE_PLAN.md`); this is the deferred, riskier
half flagged there (§3/§8).

## TL;DR recommendation

**Ship the messaging baseline (done), then — if we go further — queue only
`cancel` and a soft `start`; keep `finish` and `take over` online-only.** Full
offline trip lifecycle is not worth the conflict-handling complexity for how
rarely you start/finish a shop with zero signal. Decision points are at the end.

---

## 1. Current behaviour (shipped this pass)

Trip transitions are **blocked with an on-screen reason** when offline (with a real
backend; demo mode runs them locally). In `src/screens/Home.tsx`, gated on
`!online && remote != null`:

- List mode: **"I'm going shopping"** is disabled → *"Offline — connect to start a
  shop."* Adding items stays enabled.
- Shopping mode: the Cancel/Finish row becomes *"Offline — keep ticking items;
  finish or cancel the trip when you're back."* Ticking still works.
- Spectator (shopper went quiet): **take over** disabled → *"Offline — connect to
  take over."*

This replaced the old behaviour where, offline, tapping "I'm going shopping"
optimistically flipped you into shopping mode and the RPC failed with a misleading
*"Someone's already shopping"* toast, leaving fake state until reconnect. So even
if we never queue these, the offline experience is now honest.

## 2. Why each transition is fraught to queue

All four are **`SECURITY DEFINER` RPCs** with server-side state machines
(`supabase/migrations/0001_init.sql`); there's no client UPDATE on `trips`.

- **`start_shopping`** — atomic first-writer-wins (`where status = 'active'`).
  Offline you'd optimistically become the shopper; on replay someone else may have
  already started → the RPC returns null and your optimistic "shopping" is wrong.
  Recoverable (reconcile + toast) but it's a real conflict, not a no-op.
- **`cancel_shopping`** — releases the lock (`where ... and shopper_id = auth.uid()`).
  Lowest risk: if you cancel offline and reconnect, either you're still the shopper
  (it works) or the world moved on (0 rows, harmless). Safe-ish to queue.
- **`complete_trip`** — the hard one. It completes the trip **and rolls pending/
  not-found items into a brand-new trip with new ids**, and rebuilds the hot list,
  in one transaction. Queuing it collides head-on with queued *item* ops: a queued
  add against the old trip races the completion; after replay the carried-over copy
  is a different row id. Ordering item-ops vs the complete-op offline is a tar pit.
- **`take_over_shopping`** — gated on a 90-min staleness rule judged by **server**
  `now()`. Offline you'd judge staleness on stale cached data and could "take over"
  a shop that's actually active. Conflict-prone.

## 3. Options

| Option | Scope | Risk | Verdict |
|---|---|---|---|
| **A. Messaging only** (shipped) | Block all four offline, explain on screen | None | The safe baseline; may be all we need |
| **B. Queue `cancel` (+ soft `start`)** | Queue the two low-risk transitions | Low–med | Reasonable if there's demand |
| **C. Full offline lifecycle** | Queue all four incl. complete/take-over | High | Not recommended — complexity ≫ value |

Frequency reality check: you start/finish a shop **once per trip**, usually at the
shop entrance/exit where signal is often OK; you add/tick **dozens of times**
mid-aisle where signal dies. The queue already nails the high-frequency case.

## 4. Design — if we do Option B

Extend the existing queue rather than build a parallel path.

### Op model (`src/sync/queue/types.ts`)
Add trip op kinds with no `itemId`:
```
kind: 'insert' | 'patch' | 'startShopping' | 'cancelShopping'
payload: { tripId, minutes? }
```
Coalescing (`coalesce.ts`): trip ops are keyed by `tripId`, not `itemId`. Rules:
`start` then `cancel` offline → **drop both** (net no-op, safe here — unlike item
delete, a trip that never started server-side has nothing to reconcile). `cancel`
then `start` → keep the later. Never coalesce a trip op into an item op.

### Ordering
Trip ops and item ops drain in one `createdAt` stream, but a queued `start` must
land before item-adds that assume "shopping" (RLS window). createdAt already gives
this since you start before adding. The replay loop is unchanged.

### Conflict handling on replay (`replay.ts` + the supabase writer)
The item writer returns a `WriteResult`; extend the inner writer with
`startShopping`/`cancelShopping` returning the same:
- `start_shopping` → null data = someone beat you = **fatal** (drop), reconcile via
  `reload`, toast *"Someone else started this shop while you were offline."*
- `cancel_shopping` → 0 rows = already not yours = success (no-op).
Both already idempotent server-side. Non-fatal (network) → retry as usual.

### Optimistic + reconcile
The store already flips to/from shopping optimistically (`useStore.startShopping`/
`cancelShopping`). With the queue, drop the immediate `remote.*` failure→toast path
for these (mirror how item writes moved behind the queue), and let the engine's
fatal handler reconcile. The offline-fallback reload already corrects trip state on
reconnect.

### UX
When `start` is queued (offline), don't claim "you're shopping" outright — show
*"Will start your shop when you're back"* so a possible conflict isn't a surprise.
On a fatal start-conflict, the toast above + a snap back to list mode.

### Explicitly still NOT queued in Option B
`complete_trip` and `take_over_shopping` stay online-only (blocked + messaged as
now). The item-rollover ordering (`complete`) and server-time staleness
(`take over`) aren't worth it.

### Tests
`coalesce.test.ts`: start→cancel drops both; cancel→start keeps start. `replay.test.ts`:
start-conflict is fatal + reconciles; cancel 0-rows is success; trip op ordered
before dependent item adds.

## 5. Risks & mitigations (Option B)

| Risk | Mitigation |
|---|---|
| Queued `start` conflicts with another shopper | Fatal-classify the null RPC result; reconcile + clear toast; optimistic copy reverts |
| `start` then offline item-adds, but start later rejected | Adds then hit a non-shopping/closed-window trip → fatal-drop with the existing "list moved on" toast (acceptable; rare) |
| Scope creep into `complete`/`take over` | Hard line: Option B excludes them; revisit only with evidence of need |
| Regressing the item queue | Trip ops are additive kinds; item path untouched; gate behind the existing flag |

## 6. Decisions needed from you

1. **Do we go past the messaging baseline at all?** (A is a legitimate final state.)
2. If yes, **Option B as scoped** (queue `cancel` + soft `start`, leave
   `complete`/`take over` online-only)? Or only `cancel`?
3. For a queued `start`, is *"Will start your shop when you're back"* (deferred
   claim) the right UX, vs. optimistically entering shopping mode and risking a
   reconcile?

Recommendation: **A for now**; adopt **B (cancel + soft start)** only if you hit the
need in real use. I won't implement B without your sign-off — it's the one offline
area that can produce surprising cross-user conflicts.
