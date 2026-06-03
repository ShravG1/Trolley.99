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
- **Commit as meshavie@gmail.com** or Vercel rejects the deploy (standing git-author gotcha).
- Supabase keys live in env vars (never committed) — set them in Vercel + `.env.local`.

## Conventions
Follows CONTRACT.md in the dev-os repo and global preferences (UK English, minimal deps).