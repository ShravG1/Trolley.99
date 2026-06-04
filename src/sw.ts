/// <reference lib="webworker" />
// Custom service worker (injectManifest strategy). Excluded from `tsc -b`
// (tsconfig.app.json) — vite-plugin-pwa bundles it at build time — so its
// webworker globals don't clash with the app's DOM lib.
//
// Responsibilities: precache the app shell (offline), apply updates on demand
// (the "New version — refresh" prompt), and handle Web Push (§2.10):
// show the notification and focus/open the app when tapped.
import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

// Take control of open pages as soon as this SW activates, so the "Update now"
// confirm can cleanly reload into the new version without a reinstall (§8.3).
clientsClaim();

// Apply a waiting update when the client confirms the refresh prompt (§8.3).
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string })?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Incoming push → show the notification (urgent named / normal count, §2.10).
self.addEventListener('push', (event: PushEvent) => {
  let payload: { title?: string; body?: string; tag?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Trolley', {
      body: payload.body ?? 'New activity on the list.',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      // Distinct events get distinct tags so they don't overwrite each other on
      // the lock screen; renotify re-alerts even if a tag repeats (§2.10).
      tag: payload.tag ?? `trolley-${Date.now()}`,
      renotify: true,
    } as NotificationOptions)
  );
});

// Tap a notification → focus the open app or open it (§2.10).
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = clients.find((c) => 'focus' in c);
      if (open) return (open as WindowClient).focus();
      return self.clients.openWindow('/');
    })()
  );
});
