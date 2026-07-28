# Trolley

A shared, real-time shopping-list PWA for households — one list, everyone shops, whoever shops buys for everyone. Live: https://trolley-nine.vercel.app

## Stack
- React 18 + Vite + TypeScript, Tailwind CSS
- Supabase (`@supabase/supabase-js`) for shared real-time data
- PWA; deployed on Vercel

## Run / test
```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build
npm run preview  # serve the built app
npm run test     # vitest — the front-end / store / sync suites only
supabase test db # pgTAP RLS suite (the security suite — see Backend below)
```

## Backend (Supabase)
The front end is only half the app — there's a substantial Supabase backend in
`supabase/`, and **its RLS is the entire security model** (the anon key ships in
the client and is public, so RLS is the only thing stopping one household reading
another's list). Touching the DB is security-critical; read before you change.

- **Schema, RPCs & RLS** live in `supabase/migrations/` (numbered `0001…`). `0001_init.sql`
  defines the tables, the SECURITY DEFINER RPCs (`create_group`, `join_group`,
  `start_shopping`, `complete_trip`, …) that enforce the state machine atomically,
  and the RLS policies. **The DB is the bouncer — the UI is a courtesy.** Business
  rules that matter (single shopper, last-minute window, rollover) are enforced
  server-side. **Migrations are append-only: never edit an applied one** — redefine
  a function in a *new* migration with `CREATE OR REPLACE` (e.g. `0007` redefines
  `join_group`, `0012` redefines `complete_trip`).
- **The write surface is deliberately narrow (`0017`).** RLS says which rows; the
  table GRANT says whether the operation exists at all. Clients hold only the
  privileges the app actually uses — no INSERT on `trips` or `invites`, no
  INSERT/UPDATE on `groups`, column-scoped UPDATE on `items`. Everything else is a
  `SECURITY DEFINER` RPC. **If you find yourself wanting to add a grant, add an RPC
  instead**, and give it a pgTAP assertion plus a positive control.
- **Item→aisle memory (`0016`)** — `item_categories` is a per-group, RLS-scoped
  name→aisle map. Members teach it by re-aisling (`set_item_category`, sticky
  `source='user'`); `refresh_item_categories()` runs weekly under pg_cron and infers
  the rest as `source='auto'`, never overwriting a user row. The client resolves
  through it before the keyword guess in `lib/categorise.ts` and mirrors it to
  localStorage per group.
- **RLS test suite** — `supabase/tests/rls_test.sql` (pgTAP), run with `supabase test db`.
  It proves cross-group isolation (User A can't read/write User B's data) and is the
  **single most important suite** — `npm run test` (Vitest) never touches it. Any RLS
  or policy change must keep this green; add an assertion for what you changed.
- **Edge functions** in `supabase/functions/` — `send-push` (web-push fan-out),
  `recurring` (cron-driven recurring items), `feedback-digest` (cron-driven). They
  run on Deno and are **deployed separately from Vercel** (`supabase functions deploy`).
- **`supabase/scheduled.sql`** wires pg_cron/pg_net to hit the two cron functions.
  It is **applied directly to the hosted project, NOT a migration** (it needs the live
  project URL + extensions and would break `supabase db reset`).

## Secrets — what's actually secret, and why
- The **Supabase anon key is public by design** — it ships in the browser bundle. It
  is *not* a secret; RLS is what protects data, not the key.
- The only real secrets are server-side and live **only in edge-function env**: the
  **`service_role` key** (bypasses RLS — `send-push` confirms membership with the anon
  key *before* ever touching it; `recurring`/`feedback-digest` run as service_role
  because there's no user context), the **VAPID private key** (`send-push`), the shared
  **`CRON_SECRET`** (gates the two `verify_jwt=false` cron functions so the public anon
  JWT can't trigger them), and `feedback-digest`'s GitHub PAT. None of these are ever
  committed or exposed to the client.

## Gotchas
- **Git author:** the owner's own commits use `meshavie@gmail.com`; Claude/automated
  commits use `noreply@anthropic.com`. Both deploy fine on `main` (Vercel deploys on push,
  verified) — use one of these known-good authors rather than an unrelated one.
- Supabase **anon** key + URL live in env vars (never committed) — set them in Vercel +
  `.env.local`. The `service_role`/VAPID/`CRON_SECRET` secrets live only in the edge
  functions' env (Supabase dashboard), never in the Vercel app or the client.

## Conventions
Follows CONTRACT.md in the dev-os repo and global preferences (UK English, minimal deps).