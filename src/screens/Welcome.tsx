import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithMagicLink, isSupabaseConfigured } from '@/lib/supabase';

// First run (§2.1) — single email field → magic link. No passwords.
// Email enumeration: the confirmation looks identical whether or not the email
// exists (§5.3). When Supabase isn't configured we fall through to the demo.
export function Welcome() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

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
            Send magic link
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
        settings.
      </p>
    </div>
  );
}
