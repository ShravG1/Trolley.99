import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    // `ANALYZE=true npm run build` emits bundle-stats.html at the repo root
    // (treemap of what's actually in each chunk) — off by default so it
    // doesn't slow down or clutter every ordinary build. Deliberately NOT
    // written into dist/: the SW's injectManifest globs dist/**/*.html for
    // precaching, and this report isn't part of the app.
    process.env.ANALYZE
      ? visualizer({
          filename: 'bundle-stats.html',
          gzipSize: true,
          brotliSize: true,
          template: 'treemap',
        })
      : undefined,
    VitePWA({
      // Custom SW (src/sw.ts) so we can handle Web Push (§2.10) + control updates.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt', // §8.3 — prompt "New version — refresh" rather than silent swap
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'Trolley',
        short_name: 'Trolley',
        description: 'One list. Everyone shops. Sorted.',
        // Warm palette — matches --bg / --brand (§8.5)
        theme_color: '#2F8F5B',
        background_color: '#F6F1E7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Vendor code changes far less often than app code. Splitting it into
        // its own chunk means a normal deploy (app code only) invalidates a
        // much smaller slice of what the service worker has to re-fetch and
        // re-precache on update — most returning visits stay on a warm cache.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
});
