import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';

// Offline / sync status (§6.6, §8.2 + the offline write queue, docs/OFFLINE_PLAN.md
// §7). Online-first: when the queue holds writes we say how many will sync, and
// while they drain on reconnect we say so — the count lives in the live-region
// text so it's announced, not conveyed by colour alone.
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const pending = useStore((s) => s.pendingWriteIds.length);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Offline: white on the dark ink bar reads in both themes (--bg went dark-on-dark
  // in dark mode, ~1.2:1).
  if (offline) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 bg-ink px-4 py-1.5 text-center text-meta font-semibold text-white"
      >
        {pending > 0
          ? `Offline — ${pending} change${pending === 1 ? '' : 's'} will sync when you’re back.`
          : 'Offline. Showing the last list we had.'}
      </div>
    );
  }

  // Back online with a backlog: reassure that the queue is draining.
  if (pending > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-40 bg-brand px-4 py-1.5 text-center text-meta font-semibold text-on-brand"
      >
        Syncing {pending} change{pending === 1 ? '' : 's'}…
      </div>
    );
  }

  return null;
}
