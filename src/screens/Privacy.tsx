import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { BottomSheet } from '@/components/BottomSheet';
import { isSupabaseConfigured, leaveGroup, deleteGroup, clearHistory, deleteAccount } from '@/lib/supabase';

// The contact address for data questions / erasure requests. Surfaced in the
// policy below; change here if it ever moves.
const CONTACT_EMAIL = 'calibrate.ai.uk@gmail.com';
// Kept in sync with the policy text — bump when the substance changes (§11.2).
const POLICY_UPDATED = '29 June 2026';

// Full privacy policy (§11.2) + the account/group lifecycle controls that are
// usually forgotten (§11.4) — wired to real RPCs. Reachable both from Settings
// and, for people deciding whether to sign up, from the public Welcome screen.
export function Privacy() {
  const groupId = useStore((s) => s.trip.group_id);
  const pushToast = useStore((s) => s.pushToast);
  const [confirm, setConfirm] = useState<null | 'clear' | 'leave' | 'deleteList' | 'delete'>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: 'clear' | 'leave' | 'deleteList' | 'delete') {
    if (!isSupabaseConfigured()) {
      pushToast('Connect a backend to manage your account.');
      setConfirm(null);
      return;
    }
    setBusy(true);
    try {
      if (action === 'clear') {
        await clearHistory(groupId);
        pushToast('History cleared.');
        setConfirm(null);
      } else if (action === 'leave') {
        await leaveGroup(groupId);
        window.location.assign('/'); // back to create/join
      } else if (action === 'deleteList') {
        const deleted = await deleteGroup(groupId);
        if (deleted) window.location.assign('/'); // list gone → re-resolve to another / create-join
        else {
          // RLS removed nothing → you're a member but not the creator.
          pushToast('Only the person who created this list can delete it — you can leave it instead.');
          setConfirm(null);
        }
      } else {
        await deleteAccount();
        window.location.assign('/'); // signed out → fresh start
      }
    } catch {
      pushToast('That didn’t work — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/settings" aria-label="Back" className="grid h-11 w-11 place-items-center rounded-pill hover:bg-surface-2">
          ←
        </Link>
        <h1 className="font-display text-display-l text-ink">Privacy & your data</h1>
      </header>

      <p className="-mt-1 mb-5 text-caption text-ink-faint">Last updated {POLICY_UPDATED}</p>

      <div className="space-y-5 text-body text-ink-soft">
        <p>
          Trolley is a free, shared shopping list for households. This explains what we hold, why,
          where it lives, and how to get rid of it. We collect as little as possible and never sell it
          or use it for advertising.
        </p>

        <Section title="What we store">
          <ul className="ml-4 list-disc space-y-1.5">
            <li>A <strong>display name</strong> you choose for each group.</li>
            <li>The <strong>list items</strong> you share, and a record of <strong>who added or bought what</strong> — shared with everyone in that group.</li>
            <li>An <strong>email</strong>, only if you add one to back up your list across devices. It’s used solely to sign you back in.</li>
            <li>A <strong>push subscription</strong>, only if you turn notifications on, so we can tell your group when the list changes.</li>
          </ul>
          <p className="mt-2">
            You don’t need an account to start — opening the app signs you in anonymously, with no
            email or password.
          </p>
        </Section>

        <Section title="Children">
          <p>
            A household list may name or be used by children. The only personal data involved is a
            display name someone chooses, which can be cleared or deleted at any time. We don’t
            knowingly collect anything more about a child, and there are no public profiles.
          </p>
        </Section>

        <Section title="Reporting is opt-in">
          <p>
            Reporting is <strong>off by default</strong>. If you turn it on it counts who bought what —
            handy, but it profiles everyone in the household, so it stays opt-in and you can clear it
            whenever.
          </p>
        </Section>

        <Section title="Where your data lives">
          <p>
            Data is stored in the <strong>EU/UK</strong> with our database provider,{' '}
            <strong>Supabase</strong> (database, sign-in and real-time sync). The app itself is served
            by <strong>Vercel</strong>. If you enable notifications, the message is delivered through
            your browser’s push service (e.g. Google, Apple or Mozilla). We don’t use analytics or
            advertising trackers.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your data until you remove it. Deleting your account, leaving a group, clearing
            history or deleting a list (below) erases the relevant data. When you delete your account,
            your past actions remain only as a snapshot name (“Mum binned this”) so the group’s history
            still reads sensibly, while your login is removed.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can access, correct, export or delete your data, and object to how it’s used. Most of
            this is one tap away below. As we’re UK/EU-based, you also have the right to complain to the{' '}
            <a className="font-semibold text-brand underline" href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">ICO</a>.
            For anything not covered by the controls below, email{' '}
            <a className="font-semibold text-brand underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <p>You’re always in control — leave a group, delete your account, or wipe your history whenever you like.</p>
      </div>

      <div className="mt-6 space-y-2">
        <LifecycleButton label="Clear trip history" tone="neutral" onClick={() => setConfirm('clear')} />
        <LifecycleButton
          label="Leave this group"
          hint="If you’re the last one out, this deletes the group for everyone."
          tone="neutral"
          onClick={() => setConfirm('leave')}
        />
        <LifecycleButton label="Delete this list" tone="danger" onClick={() => setConfirm('deleteList')} />
        <LifecycleButton label="Delete my account" tone="danger" onClick={() => setConfirm('delete')} />
      </div>
      <p className="mt-3 text-caption text-ink-faint">
        Deleting your account detaches you from the audit trail — your past actions stay as a snapshot name
        (“Mum binned this”) so the history still makes sense, but your login is removed.
      </p>

      {confirm && (
        <ConfirmSheet
          action={confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="font-display text-display-s text-ink">{title}</h2>
      {children}
    </section>
  );
}

function ConfirmSheet({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: 'clear' | 'leave' | 'deleteList' | 'delete';
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = {
    clear: { title: 'Clear trip history?', body: 'Deletes all completed trips for this group. The current list stays.', cta: 'Clear history' },
    leave: { title: 'Leave this group?', body: 'You’ll lose access to the shared list. If you’re the last one out, the group is deleted.', cta: 'Leave group' },
    deleteList: {
      title: 'Delete this list for everyone?',
      body: 'Permanently deletes this list — every item and all its history — for everyone in the group. This can’t be undone. (Only the list’s creator can do this.)',
      cta: 'Delete list',
    },
    delete: {
      title: 'Delete your account?',
      body: 'Removes your login for good. Your past actions stay as a snapshot name (“Mum binned this”) so the group’s history still makes sense, but your login is gone.',
      cta: 'Delete account',
    },
  }[action];

  return (
    <BottomSheet open onClose={onCancel} title={copy.title}>
      <p className="text-body text-ink-soft">{copy.body}</p>
      <div className="mt-5 flex gap-2">
        {/* Autofocus the safe option so a stray Enter can't confirm a destructive action. */}
        <button
          data-autofocus
          onClick={onCancel}
          className="min-h-12 flex-1 rounded-pill border border-line font-semibold text-ink"
        >
          Keep it
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`min-h-12 flex-1 rounded-pill font-semibold text-white disabled:opacity-50 ${
            action === 'delete' || action === 'deleteList' ? 'bg-bin' : 'bg-urgent'
          }`}
        >
          {busy ? '…' : copy.cta}
        </button>
      </div>
    </BottomSheet>
  );
}

function LifecycleButton({
  label,
  hint,
  tone,
  onClick,
}: {
  label: string;
  hint?: string;
  tone: 'neutral' | 'danger';
  onClick: () => void;
}) {
  const danger = tone === 'danger';
  return (
    <button
      onClick={onClick}
      style={danger ? { backgroundColor: 'color-mix(in srgb, var(--bin) 8%, var(--surface))' } : undefined}
      className={`flex min-h-13 w-full items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-left font-semibold shadow-e1 ${
        danger ? 'border-bin text-bin' : 'border-line bg-surface text-ink'
      }`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-item">{label}</span>
        {hint && (
          <span className={`text-meta font-normal ${danger ? 'text-bin' : 'text-ink-soft'}`}>{hint}</span>
        )}
      </span>
      <span aria-hidden="true" className={`shrink-0 ${danger ? 'text-bin' : 'text-ink-faint'}`}>
        ›
      </span>
    </button>
  );
}
