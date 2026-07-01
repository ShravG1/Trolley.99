import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithMagicLink, isSupabaseConfigured } from '@/lib/supabase';
import { isInstalledPWA, isIOS } from '@/lib/push';
import { ShareGlyph } from '@/components/InstallPrompt';

// First run (§2.1) — single email field → magic link. No passwords.
// Email enumeration: the confirmation looks identical whether or not the email
// exists (§5.3). When Supabase isn't configured we fall through to the demo.
export function Welcome() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Trolley isn't on the App Store — most people don't know they can add it to
  // their phone. Surface the how-to up front, but only to browser visitors who
  // haven't installed yet (it vanishes once running as a home-screen PWA).
  const [showInstall, setShowInstall] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setShowInstall(!isInstalledPWA());
    setIos(isIOS());
  }, []);

  async function send() {
    if (!email.trim()) return;
    setBusy(true);
    if (isSupabaseConfigured()) {
      await signInWithMagicLink(email.trim());
      setSent(true);
    } else {
      // Demo mode: no backend — straight onto the shared list.
      nav('/');
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-10">
      <div className="pt-16">
        <h1 className="font-display text-[40px] font-bold leading-[1.05] text-ink">Trolley</h1>
        <p className="mt-3 text-display-s text-ink-soft">One list. Everyone shops. Sorted.</p>
        {showInstall && <AddToHomeScreenHint ios={ios} />}
      </div>

      {sent ? (
        <div className="rounded-lg bg-surface p-6 shadow-e2">
          <p className="font-display text-display-s text-ink">Check your email</p>
          <p className="mt-2 text-body text-ink-soft">
            Tap the link to sign in. Sent to {email}.
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-4 text-meta font-semibold text-brand"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="you@email.com"
            className="w-full rounded-md border border-line bg-surface px-4 py-4 text-item text-ink placeholder:text-ink-faint focus:border-brand"
          />
          <button
            onClick={send}
            disabled={busy || !email.trim()}
            className="min-h-13 w-full rounded-pill bg-brand px-6 text-item font-semibold text-on-brand shadow-e2 disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send magic link'}
          </button>
          {!isSupabaseConfigured() && (
            <p className="text-center text-caption text-ink-faint">
              Demo mode — no backend connected. Any email drops you straight in.
            </p>
          )}
        </div>
      )}

      <p className="text-center text-caption text-ink-faint">
        We store your email, list, and who did what — shared with your group. Delete it any time in
        settings. See our{' '}
        <Link to="/privacy" className="font-semibold text-brand underline">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}

// Add-to-Home-Screen how-to, shown at the very top of first load. Trolley isn't
// on the App Store, so people install it themselves from the browser — spell it
// out. iOS/Safari has no install event, so we give the manual Share steps;
// Android/Chromium gets the generic wording (its own prompt handles the tap).
function AddToHomeScreenHint({ ios }: { ios: boolean }) {
  return (
    <div className="mt-5 rounded-lg bg-brand-tint p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface text-[18px] shadow-e1"
        >
          📲
        </span>
        <div className="min-w-0">
          <p className="text-item font-semibold text-ink">Add Trolley to your Home Screen</p>
          {ios ? (
            <p className="mt-1 text-meta text-ink-soft">
              It's not on the App Store — you add it yourself. In Safari, tap the Share button{' '}
              <ShareGlyph /> then <b>“Add to Home Screen”</b>. It opens full-screen like a real app,
              and lets you switch on notifications for urgent items.
            </p>
          ) : (
            <p className="mt-1 text-meta text-ink-soft">
              It's not on the App Store — add it from your browser menu (<b>“Add to Home Screen”</b> or{' '}
              <b>“Install”</b>). It opens full-screen like a real app, and lets you switch on
              notifications for urgent items.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
