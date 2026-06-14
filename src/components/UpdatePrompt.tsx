import { useRegisterSW } from 'virtual:pwa-register/react';

// SW update lifecycle (§8.3). Installed apps don't reload on their own, so we
// actively check for a new version when the app opens / regains focus (and
// hourly), then show an "Update now" prompt rather than silently swapping or
// making anyone reinstall. Confirm → skipWaiting (handled in sw.ts) → reload.
const CHECK_EVERY = 60 * 60 * 1000; // hourly

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      // On foreground (opening the installed app) + on a timer.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
      setInterval(check, CHECK_EVERY);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-md p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-ink px-4 py-3 shadow-e3">
        <span className="min-w-0 text-body text-[var(--bg)]">A new version of Trolley is ready.</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setNeedRefresh(false)}
            className="min-h-11 rounded-pill px-3 text-meta font-semibold text-ink-faint"
          >
            Later
          </button>
          <button
            onClick={() => updateServiceWorker(true)}
            className="min-h-11 rounded-pill bg-brand px-5 text-meta font-semibold text-on-brand"
          >
            Update now
          </button>
        </div>
      </div>
    </div>
  );
}
