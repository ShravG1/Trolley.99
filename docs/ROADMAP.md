# Build status & roadmap

Maps to the brief's build order (§13). "Built" = working in the running app or
written and ready to deploy. "To wire" = the contained next step.

## Built

- **Design system (§1):** light/dark tokens, derived aisle colours, typography
  scale, spacing/shape/elevation, paper-grain, the full motion keyframe set, and
  the View Transitions mode-shift. Reduced-motion honoured.
- **Data model + RLS + RPCs (§4, §5.1, §7):** `supabase/migrations/0001_init.sql` —
  every table, constraints, enums, `is_member` helper, partial unique indexes,
  `create_group` / `join_group` / `start_shopping` / `cancel_shopping` /
  `complete_trip`. RLS on every table.
- **Core list (§2.2–2.5):** add (type-ahead chips + auto-aisle + mandatory re-aisle),
  delete → per-trip archive with actor snapshot → re-add, quantity stepper, aisle
  grouping, every item state, urgent pinning.
- **Shopping mode (§2.6–2.7):** entry window picker, atomic single-shopper claim,
  the mode-shift, aisle-walk view with colour bands + per-aisle progress, live tick
  (`tick-pop`/`settle-down`), spectator read-only view, finish + rollover, cancel
  (lock-release).
- **Edge Functions (§2.10, §2.8):** `send-push` (JWT verify → membership check →
  service_role send, never-self, dead-sub cleanup, rate cap) and `recurring`
  (scheduled, idempotent-per-day, lands on the next active trip mid-shop).
- **PWA (§8):** manifest, Workbox SW, update prompt, offline banner, generated icons.
- **Reporting (§2.9):** settings-gated, off by default, code-split.
- **Privacy/lifecycle (§11):** privacy note + lifecycle controls surfaced.
- **Tests (§14):** unit suite (dedupe, rollover, shopper-claim race, window rules,
  grouping, categoriser) + the critical RLS pgTAP suite. CI wired.

## Wired (activates when Supabase env keys are present)

- **Auth + group gating (§2.1):** magic-link sign-in, `create_group` / `join_group`
  flows (`GroupSetup`), invite minting (`create_invite`) + `/join/<code>` links that
  survive the sign-in redirect. App shell gates loading → signed-out → needs-group →
  ready.
- **Realtime data layer (§6.3–6.4):** `src/sync/useSupabaseSync.ts` bootstraps the
  active trip + items + members, subscribes group-scoped `items`/`trips` channels,
  and installs a `RemoteWriter` the store calls after each optimistic update. Server
  rows dedupe into the store by client id; trips changes trigger a reload (handles
  the post-completion new-trip handoff); reconnect re-fetches. Completion defers to
  the `complete_trip` RPC so trip ids never diverge. Push fan-out (urgent named /
  normal debounced count) fires via `send-push`. Demo mode is untouched (`remote`
  stays null).

## Wired in the review pass

- **Realtime publication fix (§6.4):** `items`/`trips` added to `supabase_realtime`
  — without it live sync emitted nothing. (`0002_realtime.sql`.)
- **Push notifications (§2.10):** custom service worker (`src/sw.ts`,
  `injectManifest`) with `push`/`notificationclick` handlers; contextual nudge
  after a first urgent item; iOS "Add to Home Screen" hint when not installed;
  `send-push` fan-out already wired in the writer.
- **Stale-shopper take-over (§2.6):** `take_over_shopping` RPC (90-min rule) +
  spectator "take over" button + shopper "still shopping?" nudge.
- **Account/group lifecycle (§11.4):** `leave_group` (ownership transfer +
  last-member cleanup), `clear_history`, `delete_account` (FKs detach-on-delete so
  the audit trail survives) — wired to the Privacy screen.
- **Learned hot-list type-ahead (§2.4)** and **persisted recurring items (§2.8)**.
- **Swipe gesture** axis-lock + `touch-action: pan-y` so it doesn't fight scroll.
- **Live presence (§6.4):** the static PresenceLine (which listed every member,
  online or not) is now driven by a per-group Realtime presence channel — real
  "who's viewing", throttled (leading+trailing, 4s via `src/lib/throttle.ts`),
  shown in the List **and** spectator views. No backend change: presence is
  ephemeral/in-memory server-side (no schema, publication or RLS rows).
- **Multi-group support (§12):** the sync layer is scoped to an `activeGroupId`
  (a per-device localStorage preference, `src/lib/activeGroup.ts`) instead of
  `groups[0]`; switching tears down and rebuilds every group-scoped channel and
  clears the old group's slice (`clearGroupScope`, with a brief loading state) so
  nothing stale lingers. The surface is a **"Your lists" overview** (`/lists`,
  `src/screens/Lists.tsx`) — a card per group with at-a-glance status
  (`getGroupSummaries`); multi-group users land there first (`src/lib/landing.ts`).
  Create/join-another reuses `GroupSetup` in `add` mode (`/groups/new`). No backend
  change — many-groups-per-user and member-readable `groups.name` already worked.

## To wire (next, contained changes)

1. **Generated types (§6.1):** `supabase gen types` → `src/types/database.ts`.
2. **Schedule the `recurring` Edge Function** — add a cron trigger (the function
   is deployed + idempotent; nothing fires it yet).
3. **Reporting on real data (§2.9)** — read completed-trip aggregates instead of
   the demo tally.
4. **Self-host + subset fonts (§10)** — see `docs/PERFORMANCE.md`.
5. **Error tracking (Sentry) in `ErrorBoundary` + push send/fail metrics (§9).**
6. **Custom SMTP** for magic-link recovery deliverability (§5.6).

## Explicitly out of scope for V1 (§0)

Cost / bill-splitting, receipt upload, per-item "who paid", any pricing. The
`substitution_note` + full item history are kept as V2 hooks — no pricing built.
