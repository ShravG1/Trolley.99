# Performance & budgets (§10)

## Fonts — the biggest weight risk

Three families (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono). For dev we
load Bricolage + Hanken from Google Fonts via a CSS `@import` in
`src/styles/global.css`. **Before launch this must change:**

- **Self-host** all three (no Google round-trip per load).
- **Subset** to the glyphs actually used.
- `font-display: swap`.
- **Lazy-load JetBrains Mono on the Reporting route only** — it's used solely for
  the headline figures and the `3 / 12` counters. The Reporting screen is already
  code-split (`React.lazy` in `App.tsx`), so its CSS/font should load with it.

Recommended path: `@fontsource/*` packages (self-hosted, subsettable) or a manual
`woff2` subset committed to `public/fonts/` with `@font-face` + `font-display: swap`.
The Workbox config already cache-firsts `woff2`.

## Bundles

- **Code-split by route** — Reporting and (next) Settings out of the initial bundle.
- **Budget:** initial route (shell + list) ≤ ~120 KB gzip, fonts excluded.
  Current build is ~123 KB gzip; the bulk is `@supabase/supabase-js`. Levers to get
  under budget:
  - Import the Supabase client lazily (only the auth + realtime entrypoints the list
    needs), or defer it until after first paint of the cached list.
  - Tree-shake unused Supabase sub-clients (storage, functions) if not used on the
    list route.
- **List virtualisation:** not added — a weekly shop won't exceed ~100 rows. Noted as
  a lever if lists ever grow.
- **Realtime efficiency:** one scoped subscription; spectator updates animate locally
  rather than re-fetching (§6.4).

## Targets

- Lighthouse: PWA installable, performance ≥ 90 on mid-range mobile.
- Run typecheck → unit → RLS tests in CI before any deploy.
