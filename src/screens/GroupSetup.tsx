import { useState } from 'react';
import { createGroup, joinGroup, signInWithMagicLink } from '@/lib/supabase';

// After sign-in with no group (§2.1): create a group (name it → empty active
// trip) or join with a code. On success we re-check membership and drop onto the
// shared list.
function pendingInvite(): string {
  try {
    return sessionStorage.getItem('trolley.invite') ?? '';
  } catch {
    return '';
  }
}

export function GroupSetup({ onDone }: { onDone: () => void }) {
  const invited = pendingInvite();
  const [tab, setTab] = useState<'create' | 'join'>(invited ? 'join' : 'create');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState(invited);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recover, setRecover] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSent, setRecoverSent] = useState(false);

  async function go() {
    setError('');
    if (!displayName.trim()) return setError('Pop your name in so the others know who’s who.');
    setBusy(true);
    try {
      if (tab === 'create') {
        if (!name.trim()) throw new Error('Give the group a name.');
        await createGroup(name.trim(), displayName.trim());
      } else {
        if (!code.trim()) throw new Error('Paste the code from your invite.');
        await joinGroup(code.trim(), displayName.trim());
      }
      try {
        sessionStorage.removeItem('trolley.invite');
      } catch {
        /* ignore */
      }
      window.history.replaceState({}, '', '/');
      onDone();
    } catch (e) {
      // Surface the real reason — generic messages make field bugs impossible to
      // diagnose. humanise() still friendlies-up the codes we know.
      const raw =
        (e as { message?: string; code?: string; hint?: string })?.message ??
        String(e);
      const code = (e as { code?: string })?.code;
      setError(humanise(raw) + (code ? ` (${code})` : ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <h1 className="pt-8 font-display text-display-l text-ink">Get set up</h1>
      <p className="mt-1 text-body text-ink-soft">Start a new list, or join one you’ve been invited to.</p>

      <div className="mt-6 inline-flex self-start rounded-pill bg-surface-2 p-1">
        {(['create', 'join'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-pill px-5 text-meta font-semibold ${
              tab === t ? 'bg-surface text-ink shadow-e1' : 'text-ink-soft'
            }`}
          >
            {t === 'create' ? 'Create' : 'Join'}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name (e.g. Mum)"
          maxLength={40}
          className="w-full rounded-md border border-line bg-surface px-4 py-3 text-item text-ink placeholder:text-ink-faint focus:border-brand"
        />
        {tab === 'create' ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name (e.g. Home)"
            maxLength={60}
            className="w-full rounded-md border border-line bg-surface px-4 py-3 text-item text-ink placeholder:text-ink-faint focus:border-brand"
          />
        ) : (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            autoCapitalize="characters"
            className="w-full rounded-md border border-line bg-surface px-4 py-3 font-mono text-item tracking-wider text-ink placeholder:text-ink-faint focus:border-brand"
          />
        )}
        {error && <p className="text-meta text-urgent">{error}</p>}
        <button
          onClick={go}
          disabled={busy}
          className="min-h-13 w-full rounded-pill bg-brand px-6 text-item font-semibold text-on-brand shadow-e2 disabled:opacity-40"
        >
          {tab === 'create' ? 'Create group' : 'Join group'}
        </button>
      </div>

      {/* Recovery: returning users who saved their list with an email (§ auth) */}
      <div className="mt-auto pt-8">
        {recoverSent ? (
          <p className="text-center text-meta text-ink-soft">
            Check your email — tap the link to get your list back.
          </p>
        ) : recover ? (
          <div className="space-y-2">
            <input
              type="email"
              inputMode="email"
              value={recoverEmail}
              onChange={(e) => setRecoverEmail(e.target.value)}
              placeholder="The email you saved your list with"
              className="w-full rounded-md border border-line bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-faint focus:border-brand"
            />
            <button
              onClick={async () => {
                if (!recoverEmail.trim()) return;
                await signInWithMagicLink(recoverEmail.trim());
                setRecoverSent(true);
              }}
              className="min-h-11 w-full rounded-pill border border-line text-meta font-semibold text-ink"
            >
              Send recovery link
            </button>
          </div>
        ) : (
          <button onClick={() => setRecover(true)} className="w-full text-center text-meta text-ink-faint underline-offset-2 hover:underline">
            Had a list on another device? Recover it
          </button>
        )}
      </div>
    </div>
  );
}

function humanise(msg: string): string {
  if (msg.includes('invalid_or_expired')) return 'That code’s expired or wrong. Ask for a fresh link.';
  return msg;
}
