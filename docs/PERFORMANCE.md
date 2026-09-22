# Performance & budgets (§10)

## Fonts — done

Three families (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono), all
self-hosted via `@fontsource-variable/*` packages (no Google round-trip,
works offline) — the pre-launch items below are all shipped:

- **Self-hosted**, not a Google Fonts `@import`.
- **Lazy-loaded**: only Bricolage + Hanken (the two used everywhere) load at
  boot (`src/main.tsx`); JetBrains Mono loads only on the Reporting route,
  which is itself code-split (`React.lazy` in `App.tsx`) — its font arrives
  with it, not before.
- The Workbox config cache-firsts `woff2` so a returning visit never
  re-fetches them at all.

Not done: glyph subsetting (`@fontsource-variable` ships the full variable
axis) and `font-display: swap` isn't explicitly set — worth revisiting if a
Lighthouse run flags font-load as a bottleneck, but hasn't been necessary so
far given the caching above.

## Bundles

- **Code-split by route**: Lists, Settings, Archive, Privacy, GroupSetup,
  Reporting, History, plus the below-the-fold chrome (Onboarding, PushNudge,
  InstallPrompt, UpdatePrompt) are all `React.lazy`. Only Home and Welcome —
  what a first or return visit actually lands on — stay in the eager bundle.
- **Vendor chunking**: `react`/`react-dom`/`react-router-dom` and
  `@supabase/supabase-js` are split into their own chunks
  (`vite.config.ts`'s `manualChunks`) so a deploy that only changes app code
  doesn't invalidate them — the service worker re-fetches far less on update.
- **Current numbers** (`ANALYZE=true npm run build`, see `bundle-stats.html`):
  eager app chunk ~100 KB gzip ~29 KB, `vendor-react` ~161 KB gzip ~53 KB,
  `vendor-supabase` ~201 KB gzip ~52 KB — cold-load total is still every
  vendor byte (splitting doesn't shrink that), but SW precache dropped from
  ~1000 KB to ~789 KB by removing Framer Motion (see below) and code-splitting
  the rest. Re-run the analyzer before trusting these numbers stale — they'll
  drift as deps change.
- **Framer Motion was removed** (it backed only the CartLoader spinner, which
  is on the critical cold-load path via `<Splash/>` — ironic for a "loading"
  animation to be the thing slowing load down). Rewritten as plain CSS
  keyframes; `prefers-reduced-motion` handled via a CSS media query instead
  of the JS hook. Zero remaining `framer-motion` usage in `src/`.
- Import the Supabase client lazily, or tree-shake unused Supabase
  sub-clients (storage, functions), remain untried levers if
  `vendor-supabase` needs to shrink further.
- **List virtualisation:** not added — a weekly shop won't exceed ~100 rows. Noted as
  a lever if lists ever grow.
- **Realtime efficiency:** one scoped subscription; spectator updates animate locally
  rather than re-fetching (§6.4).

## Targets

- Lighthouse: PWA installable, performance ≥ 90 on mid-range mobile.
- Run typecheck → unit → RLS tests in CI before any deploy.
