import { useStore } from '@/store/useStore';
import { enablePush, markNudgeAsked, isIOS, isInstalledPWA } from '@/lib/push';

// Contextual notifications prompt (§2.10) — a non-blocking bottom banner shown
// right after a first urgent item, never on load. On iOS (not installed) we ask
// them to add to the Home Screen first, because web push needs an installed PWA.
export function PushNudge() {
  const show = useStore((s) => s.pushNudge);
  const setPushNudge = useStore((s) => s.setPushNudge);
  const pushToast = useStore((s) => s.pushToast);

  if (!show) return null;

  const needsInstall = isIOS() && !isInstalledPWA();

  function dismiss() {
    markNudgeAsked();
    setPushNudge(false);
  }

  async function turnOn() {
    markNudgeAsked();
    setPushNudge(false);
    const ok = await enablePush();
    pushToast(ok ? 'Notifications on. We’ll ping you for urgent bits.' : 'Couldn’t turn notifications on.');
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[65] mx-auto max-w-md p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="rounded-lg bg-surface p-4 shadow-e3">
        {needsInstall ? (
          <>
            <p className="text-item font-semibold text-ink">Want a ping for urgent items?</p>
            <p className="mt-1 text-meta text-ink-soft">
              On iPhone, tap Share → “Add to Home Screen”, then open Trolley from there to switch on
              notifications.
            </p>
            <div className="mt-3 flex justify-end">
              <button onClick={dismiss} className="min-h-11 rounded-pill px-4 text-meta font-semibold text-ink-soft">
                Got it
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-item font-semibold text-ink">Get pinged for urgent items?</p>
            <p className="mt-1 text-meta text-ink-soft">
              We’ll only notify you about urgent adds and new items — never your own.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={dismiss} className="min-h-11 rounded-pill px-4 text-meta font-semibold text-ink-soft">
                Not now
              </button>
              <button onClick={turnOn} className="min-h-11 rounded-pill bg-brand px-5 text-meta font-semibold text-on-brand">
                Turn on
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
