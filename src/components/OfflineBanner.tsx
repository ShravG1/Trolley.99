import { useStore } from '@/store/useStore';
import { useOnline } from '@/lib/useOnline';

// Offline / sync status (§6.6, §8.2 + the offline write queue, docs/OFFLINE_PLAN.md
// §7). Online-first, but reassuring: offline changes are SAVED and replay on
// reconnect, so the banner says so rather than implying loss. The count lives in
// the live-region text so it's announced, not conveyed by colour alone. Action
// limits that only bite offline (start/finish a shop) are surfaced at those
// controls in Home, not crammed in here.
export function OfflineBanner() {
  const online = useOnline();
  const pending = useStore((s) => s.pendingWriteIds.length);

  // Offline: white on the dark ink bar reads in both themes (--bg went dark-on-dark
  // in dark mode, ~1.2:1).
  if (!online) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 bg-ink px-4 py-1.5 text-center text-meta font-semibold text-white"
      >
        {pending > 0
          ? `Offline — ${pending} change${pending === 1 ? '' : 's'} saved, will sync when you’re back.`
          : 'Offline — changes are saved here and sync when you’re back.'}
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
