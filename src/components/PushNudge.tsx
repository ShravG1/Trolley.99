import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { enablePush, isIOS, isInstalledPWA, pushSupported } from '@/lib/push';

// Notifications prompt (§2.10). Two triggers:
//  1) contextually, right after a first urgent item (store.pushNudge), and
//  2) proactively once the app is INSTALLED but notifications are still off —
//     re-asked each launch (session-dismissable) until they're turned on.
// On iOS-not-installed it nudges to Add-to-Home-Screen instead (web push needs
// an installed PWA). Never shows once permission is granted.
const SESSION_KEY = 'trolley.pushNudgeDismissed';

export function PushNudge() {
  const storeNudge = useStore((s) => s.pushNudge);
  const setPushNudge = useStore((s) => s.setPushNudge);
  const pushToast = useStore((s) => s.pushToast);
  const [proactive, setProactive] = useState(false);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    const dismissed = (() => {
      try {
        return sessionStorage.getItem(SESSION_KEY) === '1';
      } catch {
        return false;
      }
    })();
    if (dismissed) return;
    // Proactively nudge only once INSTALLED but notifications still off. The
    // not-yet-installed case is handled by InstallPrompt, so we don't double up.
    if (isInstalledPWA() && pushSupported()) setProactive(true);
  }, []);

  const show = storeNudge || proactive;
  if (show && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    // Safety: never show once granted.
    if (storeNudge) setPushNudge(false);
    return null;
  }
  if (!show) return null;

  const needsInstall = isIOS() && !isInstalledPWA();

  function dismiss() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
    setProactive(false);
    setPushNudge(false);
  }

  async function turnOn() {
    const ok = await enablePush();
    setProactive(false);
    setPushNudge(false);
    pushToast(ok ? 'Notifications on. We’ll ping you when it matters.' : 'Couldn’t turn notifications on.');
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[65] mx-auto max-w-md p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="rounded-lg bg-surface p-4 shadow-e3">
        {needsInstall ? (
          <>
            <p className="text-item font-semibold text-ink">Want a ping when it matters?</p>
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
            <p className="text-item font-semibold text-ink">Turn on notifications?</p>
            <p className="mt-1 text-meta text-ink-soft">
              For urgent adds, and when someone bins or can’t find your items — never your own.
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
