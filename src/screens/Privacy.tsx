import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { BottomSheet } from '@/components/BottomSheet';
import { isSupabaseConfigured, leaveGroup, deleteGroup, clearHistory, deleteAccount } from '@/lib/supabase';

// Short, honest privacy note (§11.2) + the account/group lifecycle controls
// that are usually forgotten (§11.4) — now wired to real RPCs.
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

      <div className="space-y-4 text-body text-ink-soft">
        <p>
          We store a display name, the lists you share with your group, and a record of who added or
          bought what. That history is shared with everyone in your group. If you’ve added an email to
          back up your list, we use it only to sign you back in.
        </p>
        <p>
          Reporting is off by default. If you turn it on, it counts who bought what — handy, but it
          profiles everyone in the household, so it stays opt-in and you can clear it whenever.
        </p>
        <p>UK GDPR: you can leave a group, delete your account, or wipe your history at any time below.</p>
      </div>

      <div className="mt-6 space-y-2">
        <LifecycleButton label="Clear trip history" tone="neutral" onClick={() => setConfirm('clear')} />
        <LifecycleButton label="Leave this group" tone="neutral" onClick={() => setConfirm('leave')} />
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
    clear: { title: 'Clear trip history?', body: 'Deletes all completed trips for this group. The current list stays.' },
    leave: { title: 'Leave this group?', body: 'You’ll lose access to the shared list. If you’re the last one out, the group is deleted.' },
    deleteList: {
      title: 'Delete this list for everyone?',
      body: 'Permanently deletes this list — every item and all its history — for everyone in the group. This can’t be undone. (Only the list’s creator can do this.)',
    },
    delete: { title: 'Delete your account?', body: 'Removes your login for good. Your past actions stay as a name only.' },
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
          {busy ? '…' : 'Yes, do it'}
        </button>
      </div>
    </BottomSheet>
  );
}

function LifecycleButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: 'neutral' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-13 w-full rounded-md border px-4 text-left text-item font-semibold ${
        tone === 'danger' ? 'border-bin/40 text-bin' : 'border-line text-ink'
      }`}
    >
      {label}
    </button>
  );
}
