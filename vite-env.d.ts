/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Side-effect CSS imports from @fontsource (no bundled types).
declare module '@fontsource-variable/*';

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  // Offline write queue feature flag (docs/OFFLINE_PLAN.md §8).
  readonly VITE_OFFLINE_QUEUE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
