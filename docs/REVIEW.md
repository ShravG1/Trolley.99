# Trolley — full-app triage & roadmap

A whole-app review by four specialist passes (correctness, security/data-isolation,
UI/UX & accessibility, architecture/performance/completeness), synthesised and
triaged. Status keys: ✅ done this pass · 🔶 Tier B (safe, not yet done) ·
🔴 Tier A (needs a decision — schema/RLS/security/backend-deploy/architectural) ·
💡 candidate feature.

## Verdict

- **Security / isolation: sound.** RLS is on every table, every policy gates on
  `is_member()`, SECURITY DEFINER helpers pin `search_path`, and a pgTAP suite proves
  household-to-household isolation. No cross-group read/write hole found. Residual
  items are credential-strength and defence-in-depth (below), not RLS bypasses.
- **Correctness: solid core, a few real edges.** The atomic shopper/complete RPCs,
  optimistic-then-reconcile, and rollover are well-built. The sharp edge was
  stale-state on group switch (now fixed).
- **UI/UX: strong foundation.** Exemplary design-token discipline, ≥44px tap targets,
  safe-area handling, state-never-by-colour-alone, reduced-motion respected. Gaps were
  mostly a11y wiring (live regions, focus traps) — most now fixed.
- **"Is it too much?"** No — multi-group, the custom throttle, and demo-mode all earn
  their keep. The one hollow surface is **Reporting** (wired but shows nothing real for
  live users); that's the biggest cleanup target.

## ✅ Fixed this pass (Tier B/C, merged)

**Correctness**
- Group switch no longer shows/acts on the previous group's list, trip or shopper-mode
  while the new snapshot loads (`clearGroupScope` + a brief loading state).
- Add-dedupe only matches a still-**pending** row, so re-adding something already
  bought/not-found this trip adds a fresh item instead of bumping the resolved one.
- `takeOverShopping` optimistic state now closes the last-minute window (mirrors the RPC).
- `pushToast` auto-dismiss timers are tracked and cleared (no leak; undo cancels them).
- Writer reads the live store for the active group id (no stale group after a switch).
- `recurring` dedupe escapes LIKE metachars (e.g. "100% milk") — **redeploy needed**
  (`supabase functions deploy recurring`).

**Accessibility / UX**
- Live regions: `PresenceLine`, `ModeBanner` (also `role=status` + `motion-safe:` ping),
  and a milestone-only announcement for `CountdownBar` (was announcing every second).
- Focus traps: finish-confirm (Home) and delete-account/leave/clear (Privacy) now go
  through the focus-managed `BottomSheet`, autofocusing the safe option.
- `ItemRow` overflow uses a real `KebabIcon` + a descriptive, action-specific aria-label.
- Decorative icons hidden from SR: Onboarding step emoji, InstallPrompt share glyph,
  Reporting bars.
- Touch targets: AddSheet suggestion + aisle chips and ItemSheet aisle chips raised to
  ≥44px; active aisle chip shows a white dot (was colour-on-its-own-colour, invisible).
- `BottomSheet` enters with a correct upward `sheet-rise` animation and has an
  accessible-name fallback.
- `OfflineBanner` contrast fixed for dark mode; Welcome shows "Sending…"; Archive back
  uses history (`navigate(-1)`); RecurringManager inputs labelled.

## ✅ Follow-up pass (also done + merged)

A second autonomous sweep cleared most of the Tier-B backlog plus the offered
features and the one client-side Tier-A item:

- **Reporting on real data** — live mode now reads completed-trip aggregates per
  range (`getReportingTally`), with the range selector actually filtering and a
  range-aware MVP line. (Demo mode keeps its seed tally.) The hollow screen is now real.
- **Inline item-name editing** — `ItemSheet` has a Name field (`renameItem` store action).
- **Live viewers shown to the shopper too** — `PresenceLine` renders in shopping mode.
- **Server-time correctness** (was Tier A, but client-only): `src/lib/serverTime.ts`
  learns a clock offset from the REST `Date` header on bootstrap; the window /
  "can add" / staleness checks now judge against it, falling back to the device
  clock. Unit-tested.
- Single-group hides the switch chevron; `GroupSetup` tabs got `role=tablist/tab`
  + `aria-selected`; `BottomSheet` no longer re-attaches viewport listeners on
  every parent render. (A shopping-mode "all done" state was considered but dropped
  — `groupForShopping` keeps bought rows visible, so a blank scroll can't occur.)

Still **deferred** (lower value / churn): `ensureSession()` on the write path,
caching members/hot-list across events, and offsetting toasts above the bottom bar.

## ✅ Offline write queue (shipped this pass)

Item writes (insert/patch) now survive poor signal. Each is persisted to an
IndexedDB op queue *under* the RemoteWriter boundary (the store's optimistic
layer is untouched bar a `pendingWriteIds` field) and replayed when real
connectivity returns, reconciling against the optimistic store and the server's
realtime echoes. Per-item coalescing collapses an offline add→edit→delete→restore
into one op; replay is single-flight, idempotent (insert upserts on the PK;
patch is LWW), gated on a real connectivity probe (`fetchServerTime`) with bounded
backoff, and drops only genuinely un-saveable ops (RLS-fatal / attempts exhausted)
with a consolidated toast — never silently. The OfflineBanner now shows "N changes
will sync" / "Syncing N…". Behind `VITE_OFFLINE_QUEUE` (on by default; set '0' to
kill-switch). Design + as-built deviations: docs/OFFLINE_PLAN.md. Deferred to a
later pass: queuing trip-lifecycle ops, Background Sync, and persisting the
optimistic read-cache so offline-added items also show after a restart *while
still offline*.

## 🔴 Tier A — your call (not auto-merged)

These touch **schema/RLS, auth config, edge-function deploys, or cross-cutting design** —
flagged per the "up to Tier B" guidance.

| Area | Issue | Suggested fix |
|---|---|---|
| Security | Invite link uses the 8-char **code**, not the minted high-entropy **token**; `join_group` has no DB rate-limit. The de-facto group credential is 8 chars. | Add `join_group_by_token(p_token)` + use the token in `/join/...`; or an attempts/lockout table. |
| Security | `feedback-digest` (and `recurring`) reachable with the public anon JWT. | Set `verify_jwt=false` + a shared cron-secret header. (config + deploy) |
| Security | Email attach/change is **unconfirmed** (`enable_confirmations=false`) — backup email never proven. | Turn on email confirmation + secure email change. |
| Security | `items`/`trips` UPDATE policies have no column scoping → a member can overwrite `added_by`/audit fields within their own group. | Move item mutations behind an RPC, or a trigger/WITH CHECK pinning `added_by*`. |
| Security | `feedback` insert allows `user_id IS NULL`; storage `feedback` bucket insert isn't path-scoped to the uid. | Tighten both policies. |
| Correctness | Window / "can add" gating uses the **device clock**, not server time (§6.5). RLS is still the real gate, so it's a UX-rejection annoyance, not a hole. | Derive a server-time offset on bootstrap; feed corrected `now` into `rules.ts` callers. |
| Correctness | `complete_trip` could fail if a stray second `active` trip exists (unique index). | `on conflict` / assert-single-active in the RPC. |
| Correctness | A spectator action landing in the complete→reload gap can mutate a completed trip's row. | Reject item writes when the trip isn't the group's current one (RLS/RPC). |
| Architecture | Hand-written `src/types/models.ts` can drift from the schema (`Trip.shopper_name` is already client-only). | `supabase gen types typescript` → `src/types/database.ts`; replace the mirror. |

## 🔶 Tier B — remaining safe fixes (next pass)

- **Reporting is hollow for real users** — reads only the current trip's in-memory items;
  the range selector does nothing. Wire it to completed-trip / `hot_list` aggregates (also
  a 💡 feature). *(Bigger; promoted to the feature list.)*
- `ensureSession()` isn't called on the write path — a silently-dropped anon session makes
  the first write fail+rollback instead of self-healing.
- Perf: `reload()` re-fetches members on every trip event (cache members; reload trip+items
  only); `getHotList` refetches on every AddSheet open (fetch once per group).
- Perf: `useStore((s)=>s.mode())` / `s.shopperName()` run on every store mutation → Home
  re-renders on each tick; derive from the already-subscribed `trip`/`userId` instead.
- Verify + add an explicit empty state for shopping mode with no pending items.
- `GroupSetup` create/join tabs need `role="tablist"/"tab"`/`aria-selected` (or reuse
  `SegmentedControl`).
- Toasts can overlap the bottom action strip in shopping mode — offset them when it's shown.
- `BottomSheet` re-attaches viewport listeners when `onClose` identity changes — wrap
  call-site handlers in `useCallback`.
- Hide the switcher chevron when you only have one group.
- Show live viewers to the **shopper** too (you asked about this earlier).

## 💡 Candidate features (drawn up for prioritisation)

| Feature | Value | Effort | Why |
|---|---|---|---|
| **Reporting on real data** | High | M | The screen exists but is empty for real users — read completed-trip/`hot_list` aggregates. |
| **Generated DB types** | High | S | Kills silent schema drift; foundational. |
| **Inline item-name edit** | High | S | `ItemSheet` edits qty/aisle/urgency but not the name — a typo means delete + re-add. |
| **Offline write queue** ✅ | High | L | **Shipped** — durable IndexedDB queue + per-item coalesce + idempotent replay, behind `VITE_OFFLINE_QUEUE`. |
| **Rename your display name** | Med | S | No self-serve way to change "Mum" → "Sarah" in a group. |
| **Per-item notes** | Med | S | A general note ("get the own-brand one"); `substitution_note` already exists to build on. |
| **Per-household aisle order** | Med | M | The aisle-walk order is a fixed generic; let a group reorder it once to match their shop. |
| **Quantity units** | Med | S | "2 litres" vs "2 bottles" — a free-text unit beside quantity. |
| **Trip history / past lists** | Med | M | After completion, old trips vanish from the UI; a read-only history is useful + feeds Reporting. |
| **Schedule the `recurring` cron** | Med | S | The function is deployed + idempotent but nothing fires it. |
| **Group management in the switcher** | Med | S | Leave/rename a group, see members, mint invites — from the new `/lists` surface. |
| **"Trip finished" push** | Low | S | The fan-out covers urgent/shopping/binned/not-found but not completion. |
| **Show watchers to the shopper** | Low | S | Mirror presence into shopping mode. |
| **Error tracking (Sentry)** | Med | S | `ErrorBoundary` writes to the feedback table; real stack traces/alerting would help. |
| **Custom SMTP for magic links** | Med | S | Default sender has deliverability/rate limits. |
| **List templates** | Low | L | "Usual weekly shop"; overlaps recurring but on-demand. |

## Strengths worth preserving

RLS-first security that actually holds · atomic server-authoritative RPCs · clean
optimistic/reconcile with client UUIDs · presence throttle (leading+trailing, cancel on
teardown) · design-token discipline + thorough touch targets/safe-areas · state conveyed
by icon+text+colour, never colour alone · reduced-motion honoured · a real cross-tenant
pgTAP suite · demo mode that makes the app explorable with no backend.
