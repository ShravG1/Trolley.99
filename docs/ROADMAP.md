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

## To wire (next, contained changes)

1. **Generated types (§6.1):** `supabase gen types` → `src/types/database.ts`, swap
   imports off `models.ts`.
2. **Push UX hooks (§2.10):** call `enablePush()` contextually after the first
   urgent mark; on iOS show the "Add to Home Screen" hint when `canPrompt()` is
   false. Add a custom SW `push`/`notificationclick` handler (switch
   `vite-plugin-pwa` to `injectManifest`).
3. **Self-host + subset fonts (§10)** — see `docs/PERFORMANCE.md`.
4. **Wire error tracking (Sentry) in `ErrorBoundary` + push send/fail metrics (§9).**
5. **Recurring scheduler cron** — schedule the `recurring` Edge Function (e.g.
   `supabase functions deploy recurring` + a cron trigger).

## Explicitly out of scope for V1 (§0)

Cost / bill-splitting, receipt upload, per-item "who paid", any pricing. The
`substitution_note` + full item history are kept as V2 hooks — no pricing built.
