# Trolley — Pre-release QA & Bug-bash

**Date:** 2026-06-16 · **Branch:** `claude/upbeat-planck-tfufdp` · **Mode tested:** demo (in-memory store, no Supabase env)

## How this was verified

- **Build health:** `npm run typecheck`, `npm test`, `npm run build` — all green (see below).
- **The swipe bug + sheet behaviour:** driven in a **real browser** (Playwright Chromium, `hasTouch`, 390×667 and 320×640 mobile contexts) using **CDP touch events** so native scrolling/`touch-action` is genuinely exercised — not synthetic JS events. Before/after measurements captured (scroll position, dismiss state, panel position).
- **Core logic** (add/dedupe, rollover, shopper-claim guard, time-authority boundaries, categoriser/grouping, rename propagation, offline queue, realtime reconcile, multi-group teardown, lifecycle screens): verified **empirically via the vitest suite**, extended with **+32 new edge-case tests** (64 → 96).
- **Static audits:** UK-English copy, debug cruft, RLS completeness, a11y, safe-area/tap-targets/overflow, state inventory.

> Playwright was installed **transiently** (`npm install --no-save` + a cached browser) for verification only. It is **not** added to `package.json` and no app dependency was added.

### Build health
| Check | Result |
|---|---|
| `tsc -b --noEmit` | ✅ clean |
| `vitest run` | ✅ **96 passed** (12 files) |
| `vite build` (+ PWA SW) | ✅ built, 30 precache entries |

---

## Blocker

### B1 — Bottom sheet can't be swiped down to dismiss; the page scrolls underneath it ✅ FIXED
**Where:** `src/components/BottomSheet.tsx` (used by AddSheet, ItemSheet, and the finish-confirm sheet).

**Reproduced (before fix):** Playwright touch-drag downward starting on the sheet, page pre-scrolled to `scrollTop=150`:
| Sheet | dragged down → dismissed? | page scroll Δ |
|---|---|---|
| Add | `false` | **−150** (page slid to top) |
| Item | `false` | **−150** |

The sheet panel did not move (`panelBefore == panelAfter`) and the document behind the overlay scrolled — exactly the reported symptom.

**Root cause (confirmed):** three independent gaps, all in `BottomSheet`:
1. A drag *grabber* was rendered but **no drag gesture was wired** — the affordance was a lie.
2. **Background scroll was never locked.** The overlay is `position: fixed`, so a downward drag fell through to the root scroller (`<html>`) and panned the page.
3. **No `overscroll-behavior: contain`** on the sheet's scroll area, so even internal scroll could chain to the document.

**Fix:** rewrote `BottomSheet`:
- **Drag-to-dismiss** via pointer events: the grabber/header owns the gesture (`touch-action: none`, so it can never be claimed as a page pan); the scrollable body keeps `touch-action: pan-y` and is draggable-to-dismiss only when scrolled to the top. Follows the finger, dismisses past **110px** or a **downward flick (>0.5px/ms)**, otherwise snaps back.
- **Background scroll lock** (`html`+`body` overflow hidden) while open, restored on close.
- **`overscroll-behavior: contain`** on the scroller and backdrop.
- Reduced-motion: snap-back uses a transition that the existing global `prefers-reduced-motion` kill-switch zeroes — no separate path needed.
- Bonus a11y: added a **Tab focus-trap** (Escape-to-close and focus restore already existed).

**Re-verified (after fix):** both sheets `dismissed: true`, page `scrollDelta: 0`. No regressions — checked in-browser:
`longSheet_innerScrolled ✓ · longSheet_stillOpen ✓ · page_unmoved ✓ · subThreshold_snapBack ✓ · tapThrough_add ✓ · backdrop_tap_closes ✓` (all pass).

> Severity note: dismissal *workarounds* existed (backdrop tap / Escape / action buttons), but the dead swipe gesture plus the whole page lurching underneath is a broken core interaction on the primary mobile surface — and the explicit #1 report. Treated as a Blocker.

---

## Major

### M1 — ItemSheet "Urgent" switch missing an accessible name ✅ FIXED
**Where:** `src/components/ItemSheet.tsx`. The `role="switch"` toggle had `aria-checked` but no label, so a screen reader announced an unnamed switch. The sibling AddSheet toggle already had `aria-label="Mark urgent"`. **Fix:** added `aria-label="Mark urgent"` to match.

### M2 — PresenceLine could overflow horizontally with long/many viewer names ✅ FIXED
**Where:** `src/components/PresenceLine.tsx`. The "…are looking too" line had no overflow guard; a long unbroken name could push horizontal scroll on a 320px screen. Not reproducible in demo (presence needs a live backend), so fixed defensively with `truncate`. **Fix:** added `truncate`.

### (Withdrawn) AddSheet row overflow on 320px — NOT AN ISSUE
A static audit flagged the aisle-tag + unit + qty row as a possible 320px overflow. **Empirically false:** measured horizontal overflow = **0px** on the list and on the expanded Add sheet at 320px (the `flex-wrap` wraps cleanly). Screenshot confirms. No change made.

---

## Minor (flagged, not fixed)

- **m1 — `switching` flag can stick → Home shows "Loading…" forever, IF a group has no active trip.** `clearGroupScope()` sets `switching:true`; `reload()` returns early when there's no active/shopping trip, so `loadSnapshot` (which clears the flag) never runs. **Cannot occur in a healthy DB** — `complete_trip` always creates a fresh active trip atomically — so this is a defensive-robustness gap only. Root spans `src/store/useStore.ts` + `src/sync/useSupabaseSync.ts`; left for a deliberate fix rather than a rushed cross-cutting change.
- **m2 — `console.error` in `ErrorBoundary` (`src/components/ErrorBoundary.tsx:15`).** Intentional error logging; harmless. The roadmap already plans routing this to Sentry — fold it in there.
- **m3 — `CountdownBar` last-minute message** is long and may wrap on very narrow screens (no horizontal overflow, just vertical wrap). Cosmetic.

## Polish (flagged, not fixed)

- **p1 — History loading copy "Loading…"** is flatter than the app's warm voice (cf. "Living dangerously"). Consider a warmer line.
- **p2 — Welcome privacy notice** ("We store your email…") reads more formal/legal than the surrounding voice.
- **p3 — Error-state tone** ("That went sideways") isn't consistent with other error strings ("didn't work", "Couldn't save"). Pick one voice.
- **p4 — InstallPrompt icon container 40px** (`h-10 w-10`) is under the 44px guide but it's decorative — fine.

---

## What was checked and found healthy (no action)

- **RLS completeness:** all **10** tables across every migration have RLS enabled with policies (`groups, group_members, invites, trips, items, recurring_items, hot_list, push_subscriptions, feedback, join_attempts`). `join_attempts` is intentionally policy-less (service-role only, client-deny). No table is unprotected.
- **Server-authoritative rules:** single-active/single-shopping guaranteed by partial unique indexes; the single-shopper claim, window-close, and complete+rollover are atomic RPCs. The client store mirrors each with a tested guard (`startShopping` no-ops unless `active`).
- **Add dedupe / rollover:** re-adding a *pending* name bumps qty (and upgrades urgent); re-adding an already-resolved name creates a fresh row. Finish rolls `pending`+`not_found` into a new active trip; `not_found` bumps `attempt_count` by exactly 1; `bought`/`substituted` don't roll. (New tests pin all of this.)
- **Time-authority:** window-open / `isShopStale` judged against a passed-in `now` (server time), not `Date.now()`; boundary semantics tested exactly.
- **Offline write queue:** coalesces per item id (latest wins), replays FIFO, dedupes by client id (insert-as-upsert; duplicate-PK treated as success). Locked-in-flight op doesn't get merged into.
- **Realtime + multi-group:** server echo dedupes by id (no double-render); a `trips` change triggers reload (post-completion handoff); reconnect re-fetches; presence throttled (4s) and cancelled on teardown; switching `activeGroupId` unsubscribes all three channels and clears the slice — no leak/double-subscribe; `getGroupSummaries` is 2 queries (no N+1).
- **Lifecycle screens** (Settings/Privacy/History/Archive) degrade safely in demo mode (`remote` null short-circuits; destructive actions guarded) — no crashes.
- **Safe-area / tap-targets / states:** fixed bottom bar and all prompts honour `safe-area-inset-bottom`; tap targets ≥44px; empty/loading/error states present.
- **No horizontal overflow** at 320px (measured).

## Verification limits (need a live backend)

These were **code-reviewed and unit-tested at the logic layer** but not executed end-to-end here (demo mode has no Supabase/VAPID): runtime RLS enforcement, the atomic single-shopper race at the DB, cross-device realtime echo/presence, and Web Push fan-out. The atomic SQL and RPC logic look correct; recommend a one-off run of the pgTAP RLS suite (`supabase/tests/rls_test.sql`) against a real project before/at launch.

---

## Summary

**Fixed now:** the #1 swipe bug (B1) — drag-to-dismiss + background scroll-lock + overscroll containment, verified in a real mobile browser with no regressions — plus two Major a11y/responsive issues (M1, M2). Typecheck, 96 tests, and the production build are green. Demo mode untouched; no dependencies added.

**Left:** 3 Minor + 4 Polish items, all flagged above. The only one with any data/UX risk (m1, stuck-loading) cannot occur against a healthy backend and needs a considered store/sync change, not a rushed one.

**Verdict:** ✅ **Safe to send to mates.** The headline mobile bug is gone and the core flows hold up under test. Before a *wide* launch, run the RLS pgTAP suite against the live project and do one real-device pass of shopping-mode + push (the parts demo mode can't exercise).
