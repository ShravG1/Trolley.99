import { useEffect, useState } from 'react';
import { isInstalledPWA, isIOS } from '@/lib/push';

// "Add to Home Screen" prompt (§8.4). Shows only to browser visitors who haven't
// installed yet; vanishes once running as an installed PWA. Android/Chromium gets
// the native install via beforeinstallprompt; iOS (no such event) gets the manual
// Share → Add to Home Screen steps. Dismissal is remembered for a week so it
// doesn't nag.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SNOOZE_KEY = 'trolley.installDismissed';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozed(): boolean {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return Date.now() - t < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isInstalledPWA() || snoozed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep the native mini-infobar from showing; we'll trigger it
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt — show the manual steps after a beat.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIOS()) t = setTimeout(() => setShow(true), 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  }

  const ios = isIOS() && !deferred;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[68] mx-auto max-w-md p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="rounded-lg bg-surface p-4 shadow-e3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand-tint text-brand-strong">
            🛒
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-item font-semibold text-ink">Add Trolley to your home screen</p>
            {ios ? (
              <p className="mt-1 text-meta text-ink-soft">
                Tap the Share button <ShareGlyph /> in Safari, then choose <b>“Add to Home Screen”</b>. Opens
                full-screen like an app.
              </p>
            ) : (
              <p className="mt-1 text-meta text-ink-soft">
                Get it as a proper app — opens full-screen and you can turn on notifications.
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={dismiss} className="min-h-11 rounded-pill px-4 text-meta font-semibold text-ink-soft">
                Not now
              </button>
              {!ios && deferred && (
                <button
                  onClick={install}
                  className="min-h-11 rounded-pill bg-brand px-5 text-meta font-semibold text-on-brand"
                >
                  Add
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small iOS share glyph (square with an up-arrow) shown inline in the steps.
export function ShareGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline align-text-bottom text-ink"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}
