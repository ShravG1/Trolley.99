# Offline features — test pass

A practical checklist for validating the offline write queue, the offline
read-cache, and the offline-awareness UX. Pairs with `docs/OFFLINE_PLAN.md`
(design) and `docs/REVIEW.md` (status).

What "offline" covers here: **item adds and ticks/edits queue and replay**;
**the app opens and shows your list with no signal**; and **trip start/finish is
clearly blocked offline** (queuing it is a separate, deferred plan —
`docs/OFFLINE_TRIP_LIFECYCLE_PLAN.md`).

## Pre-requisites

- **Simulating offline (desktop):** Chrome/Edge DevTools → Network tab → throttling
  dropdown → **Offline**. This drops fetch + realtime while keeping the tab open.
  To test a *cold boot* offline, set Offline then reload the tab.
- **Simulating offline (phone, the real test):** airplane mode. This is the
  scenario that matters — flaky supermarket signal.
- **Two users:** use two browser profiles (or a phone + a desktop) signed into the
  same group, so you can watch realtime echo and concurrent edits.
- **Inspecting the queue:** DevTools → Application → IndexedDB → `trolley` →
  `writeQueue` (pending ops) and `trolley-cache` → `snapshot` (the read-cache).
- **Flags:** both features are on by default. Kill switches: build with
  `VITE_OFFLINE_QUEUE=0` (queue) or `VITE_OFFLINE_CACHE=0` (cache).

---

## Part A — Automated (already green)

`npx tsc -b && npx vitest run && npm run build` → **64 tests pass**. The offline
units specifically:

- `src/sync/queue/coalesce.test.ts` — add→edit, add→edit→delete, add→delete→restore,
  patch+patch LWW, delete-after-server-insert, and the in-flight guard.
- `src/sync/queue/replay.test.ts` — per-item FIFO (insert before patch), oldest-first
  across items, fatal drop + continue, non-fatal attempt bump, attempt-cap drop,
  offline-probe abort, enqueue coalescing, pending-count reporting.
- `src/sync/queue/snapshot.test.ts` — cache↔queue reconciliation (apply queued
  patches onto cached rows, add queued inserts, skip orphan patches, createdAt order).

These cover the logic; Part B covers what only a real browser/device can.

---

## Part B — Manual scenarios

Each: **Steps** → **Expect**. ✅/❌ as you go.

### Write queue

1. **Offline add syncs on reconnect**
   - Steps: go offline → add "Bananas" → confirm it appears on the list → check the
     banner → go back online.
   - Expect: banner shows *"Offline — 1 change saved, will sync when you're back."*
     On reconnect it changes to *"Syncing 1…"* then clears. "Bananas" is on the
     server (visible on the second device). No error toast.

2. **Offline tick/edit syncs**
   - Steps: offline → tick an item bought, change another's quantity → reconnect.
   - Expect: both replay; second device shows the bought item + new quantity.

3. **Coalescing: add → edit → delete (offline)**
   - Steps: offline → add "Crisps" → change its qty to 3 → bin it → reconnect.
   - Expect: on the second device, nothing fights — at most a single inert (deleted)
     row lands; no flicker of qty changes. (DevTools: one `writeQueue` op for it
     before reconnect.)

4. **Coalescing: add → delete → restore (offline)** *(the one drop-both would lose)*
   - Steps: offline → add "Eggs" → bin it → undo (restore) → reconnect.
   - Expect: "Eggs" ends up **present** on the server/second device. Not lost.

5. **Idempotent replay (lost-ack)**
   - Steps: offline → add an item. With DevTools, switch to **Online** right as you
     add several quickly; or toggle offline/online repeatedly during a drain.
   - Expect: no duplicate rows on the second device; no duplicate-key errors in the
     console.

6. **Fatal drop — "the list moved on"**
   - Steps: device A offline → add an item. On device B, finish the trip (so A's
     queued add targets a completed trip). Reconnect A.
   - Expect: A shows a toast *"Couldn't save 1 change — the list moved on,"* the
     orphaned optimistic item reconciles away on reload, and the queue empties.
     No infinite ret/ no console error loop.

### Read-cache (offline boot)

7. **Cold boot offline shows the list**
   - Steps: load the app online once (so a snapshot caches) → go offline → reload
     the tab (or kill + reopen the PWA).
   - Expect: the list appears (not the endless "Trolley…" splash), with the offline
     banner. Previously this hung forever.

8. **Offline-added items survive a restart-while-offline** *(the headline Phase-2 fix)*
   - Steps: offline → add "Milk" → fully close + reopen the app, still offline.
   - Expect: "Milk" is still on the list. Reconnect → it syncs.

9. **Reconnect after an offline boot resumes realtime**
   - Steps: do #7, then go back online. On device B, add an item.
   - Expect: device A re-bootstraps (brief loading), shows fresh data, and **live**
     updates from B resume (not just on the next manual refresh).

### Offline-awareness UX (new)

10. **Banner is immediate + reassuring**
    - Expect: the instant you go offline the banner appears; copy says changes are
      **saved** and will sync (not that they're lost).

11. **Trip start/finish is blocked with a reason**
    - Steps (list mode, offline): look at the bottom controls.
    - Expect: **"I'm going shopping"** is disabled and reads *"Offline — connect to
      start a shop."* **"Add something…"** is still enabled (adding works offline).
    - Steps (shopping mode, offline): expect the Cancel/Finish row is replaced by
      *"Offline — keep ticking items; finish or cancel the trip when you're back."*
      You can still tick items.
    - Steps (spectator + shopper went quiet, offline): "take over" is disabled with
      *"Offline — connect to take over."*
    - Reconnect: all controls return to normal.

12. **Demo mode is unaffected** *(no backend)*
    - Steps: open with no Supabase env (demo) and toggle device offline.
    - Expect: start/finish still work (they're local in demo) — the block only
      applies with a real backend.

### Regression (online still works)

13. Online add / tick / edit / substitute / delete + undo all behave as before
    (optimistic + realtime echo). Start shopping, finish a trip, take over — all
    normal. Group switch loads the right list. No banner when online with an empty
    queue.

---

## Part C — Pass criteria

- All of Part A green.
- Scenarios 1–9 behave as described (no lost or duplicated writes; offline boot
  usable; reconnect resyncs + resumes realtime).
- Scenario 6 surfaces the consolidated toast and reconciles (no silent divergence).
- UX 10–12 correct.
- Part C/13 shows no online regression.

If any write is **lost or duplicated** (1–6), stop and flip `VITE_OFFLINE_QUEUE=0`.
If offline boot misbehaves (7–9), flip `VITE_OFFLINE_CACHE=0`. Both are independent
and reversible.

## Known limitations (expected, not bugs)

- Editing an *existing* item offline then a full restart *while still offline*: the
  edit isn't shown until reconnect (only added items are reconstructable from the
  queue). The change is never lost — it replays on reconnect.
- The pending-count banner is global across groups, not filtered to the active one.
- Trip lifecycle is online-only by design (blocked with a message) — see the plan.
