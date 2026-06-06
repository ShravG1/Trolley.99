# Session prompt — Offline write queue

Paste this as the kick-off prompt for a fresh Claude Code session to build the
offline write queue. It's self-contained; it assumes nothing carried over from a
previous session except the repo.

---

Continue work on **Trolley** — a live, shared real-time shopping-list PWA for
households (one list, everyone shops, whoever's out buys for everyone).
Repo: ShravG1/Trolley.99 (you're in it). Live: https://trolley-nine.vercel.app

## Your task: the offline write queue (the biggest real-use win left)

Supermarkets have poor signal. Today, item writes fire optimistically against the
Zustand store, then call a Supabase writer; **if the network is down the write
just fails with a toast and the optimistic state is rolled back** — the user
loses the action they took mid-shop. Make writes **persist locally and replay
when back online**, reconciling correctly against the optimistic store and the
server's realtime echoes.

**Read `docs/OFFLINE_PLAN.md` FIRST** — it's a detailed, file-referenced
implementation plan (queue data model, where it sits relative to `RemoteWriter`,
the replay engine, reconciliation, edge cases, UX, phased MVP-first scope, and a
gating/rollout plan). Treat it as the design of record; deviate only with reason.

If `docs/OFFLINE_PLAN.md` is missing, the brief is: a durable per-op queue
(IndexedDB), a layer at/under the `RemoteWriter` boundary so the store's
optimistic layer stays untouched, per-item FIFO replay with coalescing
(add→edit→delete offline must not replay three fighting server calls), real
connectivity detection (not just `navigator.onLine`), idempotent replay (item ids
are client-generated UUIDs), graceful handling when a queued op is later rejected
by RLS (trip completed / window closed / wrong group after a switch), and a
visible "N changes will sync" indicator building on the existing `OfflineBanner`.

## Current state (as of this writing)
- Work branch `claude/awesome-tesla-f01E0`; it == `main` == commit `a2c9997`.
- Live in prod: asset `index-CIqBhxTx.js`. Gate is green
  (`npx tsc -b` → `npx vitest run` = 44 tests → `npm run build`).
- The ephemeral container evicts `node_modules` between sessions — run
  `npm install` first.
- `docs/REVIEW.md` is the whole-app triage/roadmap (what's done vs pending).

## Key files for this task
- `src/store/useStore.ts` — optimistic layer + actions (addItem, markBought,
  substitute, markNotFound, deleteItem, restoreItem, setQuantity, setCategory,
  renameItem, setNote, setUnit), `applyServerItem` reconcile, `loadSnapshot`.
- `src/store/remote.ts` — the `RemoteWriter` interface the store calls
  (fire-and-forget: insertItem, patchItem, startShopping, cancelShopping,
  completeTrip, takeOverShopping, notify).
- `src/sync/useSupabaseSync.ts` — the writer impl, `reload()`, `rowToItem`,
  realtime subscriptions, online/visibilitychange handlers, `ensureSession` use.
- `src/lib/supabase.ts` — `ensureSession()` + the RPCs.
- `src/components/OfflineBanner.tsx` — current offline UI (navigator.onLine).
- PWA/service-worker: `vite-plugin-pwa` (injectManifest); check the SW source for
  Background Sync viability (optional enhancement, not required for the MVP).

## Architecture notes you must respect
- **Server is the truth; the client is optimistic-then-reconcile.** Every write
  has an RLS/RPC counterpart in `supabase/migrations/`. A disabled button is a
  courtesy; the DB is the bouncer. The realtime echo (deduped on the client id)
  is what confirms a write.
- **items UPDATE is column-scoped** (migration 0008): only the mutable columns
  are grantable to `authenticated` — never overwrite added_by/audit fields.
- **trips have NO direct client UPDATE** — all transitions go via SECURITY
  DEFINER RPCs. Queuing trip-lifecycle ops is out of scope for the MVP; focus the
  queue on item writes (insert/patch) — those are the in-store actions.
- Item ids are **client-generated UUIDs**, so a replayed insert is naturally
  idempotent if the insert policy/`on conflict` cooperate — verify before relying
  on it.

## Environment quirks (important)
- Postgres 5432 is BLOCKED → if you need SQL, apply it to the LIVE project via the
  Management API: `POST https://api.supabase.com/v1/projects/lztexunynwdrjjhcbgbi/database/query`
  with `Authorization: Bearer <token>` and a **browser User-Agent** (Cloudflare
  blocks the default UA). Body `{"query":"<sql>"}`. Record any schema change as a
  new file in `supabase/migrations/`. (This task is likely **client-only** and may
  need no token at all.)
- Vercel CLI deploys are BLOCKED → ship to prod ONLY by **merging to `main`** (git
  integration builds). Verify by polling the asset hash until it changes:
  `curl -s https://trolley-nine.vercel.app/ | grep -o 'index-[A-Za-z0-9_-]*\.js'`
  (use a backgrounded loop, never a foreground `sleep`).
- Edge Functions: `npx supabase@latest functions deploy <name> --project-ref
  lztexunynwdrjjhcbgbi` (set `SUPABASE_ACCESS_TOKEN` first). Not expected here.

## Ground rules
- **Gate every change**: `npx tsc -b` → `npx vitest run` → `npm run build`. Add
  unit tests for the coalescing rules and replay ordering (simulate offline).
- Commit as author `noreply@anthropic.com`
  (`git config user.email noreply@anthropic.com && git config user.name Claude`);
  commits are unsigned (can't sign from the sandbox) — expected.
- Develop on `claude/awesome-tesla-f01E0`. `main` auto-deploys to PRODUCTION on
  push. **Ship the MVP behind a flag if there's any risk**; verify each deploy by
  asset-hash. You're authorised to merge to main autonomously for safe,
  well-gated, reversible changes; **ask before** anything destructive or risky
  (schema drops, data deletion, auth changes, or a queue design that could
  silently lose or duplicate a user's writes).
- Keep it **minimal-deps** (the project ethos): prefer a small hand-rolled
  IndexedDB wrapper over a dependency unless one clearly earns its keep.
- Don't over-build: ship the **MVP first** (durable queue + coalesce + replay +
  indicator for item insert/patch), gate, merge, verify, THEN iterate. Resist
  scope creep (Background Sync, full trip-lifecycle queueing) until the core is
  proven in prod.

Start by: `npm install`, confirm branch clean + gate green, read
`docs/OFFLINE_PLAN.md` and `docs/REVIEW.md`, then implement the MVP phase,
gating + merging it before moving on.
