# Trolley

A shared, real-time shopping list PWA for households. **One list. Everyone shops. Sorted.**

One list per group, anyone shops, whoever shops buys for everyone. The app shifts
gear between **List mode** (calm, paper-warm, jotting on the sofa) and **Shopping
mode** (bright, aisle-ordered, rhythmic) — with one choreographed transition: the
signature *mode-shift*.

> Status: **V1 foundation.** The full front end (design system, components, List ↔
> Shopping mode-shift, archive, settings, reporting) runs against a local in-memory
> store so every flow is demoable today. The backend (schema, RLS, RPCs, Edge
> Functions) is written and ready to deploy; wiring the store to Supabase Realtime
> is the next step (see `docs/ROADMAP.md`).

## Stack

React + Vite + TypeScript · Tailwind · installable PWA (`vite-plugin-pwa` /
Workbox) · Supabase (Postgres, Realtime, Auth, Edge Functions) · Web Push (VAPID).
**UK English throughout the UI.**

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — runs in demo mode (no backend)
npm run typecheck
npm test             # unit suite (dedupe, rollover, shopper-claim race, window rules)
npm run build        # production build + PWA service worker
```

Demo mode kicks in automatically when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
are absent — any email on the welcome screen drops you straight onto a seeded
shared list so you can try add → urgent → shopping mode → finish/rollover.

## Connecting Supabase

1. Create a project, copy `.env.example` → `.env`, fill the **public** keys.
2. Apply the schema: `supabase db reset` (runs `supabase/migrations/0001_init.sql`).
3. Deploy functions: `supabase functions deploy send-push recurring`, then set the
   **secrets** (`service_role`, VAPID *private* key) with `supabase secrets set`.
4. Generate types: `supabase gen types typescript --local > src/types/database.ts`
   and import them (§6.1) so a schema change breaks the build, not runtime.

## What's where

| Path | What |
|------|------|
| `src/styles/` | Design tokens (light/dark, aisle colours), motion keyframes (§1) |
| `src/components/` | The component inventory — ItemRow, AisleHeader, AddSheet, … (§3) |
| `src/screens/` | List/Shopping home, Welcome, Settings, Archive, Privacy, Reporting |
| `src/lib/` | Aisles, categoriser, grouping, **server-mirrored rules**, theme, push |
| `src/store/` | Optimistic client store (mirrors the data model 1:1) |
| `supabase/migrations/` | **Schema + RLS + RPCs — the security spine** (§5, §7) |
| `supabase/functions/` | Edge Functions: `send-push`, `recurring` |
| `supabase/tests/` | **RLS policy tests [Critical]** (§14) |
| `docs/` | Architecture, security model, performance, roadmap |

## The non-negotiables (read these)

1. **RLS is the entire security model** — `supabase/migrations/0001_init.sql`. The
   anon key is public; RLS is the only thing keeping households apart.
2. **Invite links are credentials** — joining is the `join_group` RPC, never a raw
   table insert; codes have entropy, expiry and revocation.
3. **Single-shopper lock + last-minute window are enforced server-side** — atomic
   trip transition + `items` insert `WITH CHECK`. The disabled button is a courtesy.
4. **Optimistic UI dedupes on client-generated IDs** so Realtime echoes don't
   double-render.

See `docs/SECURITY.md` for the full model and `docs/ROADMAP.md` for what's built vs
still to wire.
