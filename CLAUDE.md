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
npm run test     # vitest
```

## Gotchas
- **Git author:** the owner's own commits use `meshavie@gmail.com`; Claude/automated
  commits use `noreply@anthropic.com`. Both deploy fine on `main` (Vercel deploys on push,
  verified) — use one of these known-good authors rather than an unrelated one.
- Supabase keys live in env vars (never committed) — set them in Vercel + `.env.local`.

## Conventions
Follows CONTRACT.md in the dev-os repo and global preferences (UK English, minimal deps).