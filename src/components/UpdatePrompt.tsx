import { useRegisterSW } from 'virtual:pwa-register/react';

// SW update lifecycle (§8.3) — prompt "New version — refresh" rather than
// silently swapping mid-action; skipWaiting on confirm.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex max-w-md items-center justify-between gap-3 bg-ink px-4 py-3 text-[var(--bg)]">
      <span className="text-body">New version ready.</span>
      <div className="flex gap-2">
        <button onClick={() => setNeedRefresh(false)} className="text-meta text-ink-faint">
          Later
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="rounded-pill bg-brand px-4 py-1.5 text-meta font-semibold text-on-brand"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
