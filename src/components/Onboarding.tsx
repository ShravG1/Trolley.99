import { useEffect, useState } from 'react';

// First-run guide (§2.1). Shows once per device on first use; re-openable any
// time via Settings → "How Trolley works" (which dispatches `trolley:guide`).
// Dry, warm voice (§1.7).
const SEEN_KEY = 'trolley.guideSeen';

const STEPS: Array<{ icon: string; title: string; body: string }> = [
  { icon: '📝', title: 'One shared list', body: 'Everyone in the group adds to the same list from their own phone. Tap the green pill to add anything.' },
  { icon: '🛒', title: 'Off to the shop?', body: 'Tap “I’m going shopping”. The list reorders into aisle order and the others watch it tick off live.' },
  { icon: '✅', title: 'Tick as you go', body: 'Swipe a row right (or tap the circle) to mark it bought. Can’t find it? Swipe left → “Not found” and it rolls over to next time.' },
  { icon: '🔔', title: 'Flag the urgent stuff', body: 'Mark something urgent and everyone gets a ping (once notifications are on). You’re never pinged about your own.' },
  { icon: '👋', title: 'Bring the household in', body: 'Settings → Add people → share the link or code. They tap it, pop their name in, and they’re on your list.' },
];

export function Onboarding() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (!seen) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener('trolley:guide', reopen);
    return () => window.removeEventListener('trolley:guide', reopen);
  }, []);

  if (!open) return null;

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="How Trolley works">
      <div className="flex-1 overflow-y-auto px-6 pt-[max(28px,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-md">
          <div className="pt-6">
            <span className="font-display text-[32px] font-bold leading-tight text-ink">Trolley 🛒</span>
            <p className="mt-1 text-display-s text-ink-soft">One list. Everyone shops. Sorted.</p>
          </div>
          <ul className="mt-7 space-y-5">
            {STEPS.map((s) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-surface text-[22px] shadow-e1">
                  {s.icon}
                </span>
                <div>
                  <p className="text-item font-semibold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-body text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-7 text-center text-caption text-ink-faint">
            You can read this again any time in Settings → “How Trolley works”.
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
        <button
          onClick={close}
          className="min-h-13 w-full rounded-pill bg-brand px-6 text-item font-semibold text-on-brand shadow-e2"
        >
          Got it — let’s go
        </button>
      </div>
    </div>
  );
}
