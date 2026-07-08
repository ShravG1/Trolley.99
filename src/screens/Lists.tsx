import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import {
  getGroupSummaries,
  listMyGroups,
  leaveGroup,
  deleteGroup,
  isSupabaseConfigured,
  type GroupSummary,
} from '@/lib/supabase';
import { markEnteredList } from '@/lib/landing';
import { BottomSheet } from '@/components/BottomSheet';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GearIcon, PlusIcon, KebabIcon } from '@/components/icons';
import type { MyGroup } from '@/types/models';

// "Your lists" overview (§12) — every group you're in, at a glance. The landing
// page for multi-group users, and reachable from any list's header. Tap a card
// to make it active; the sync layer re-scopes its channels to it. The ⋮ on each
// card manages that specific list — leave it, or (as its creator) delete it for
// everyone — the same server-enforced, no-data-loss deletion the shop tabs get
// in ManageShopsSheet, applied to whole lists (§11.4).
export function Lists() {
  const navigate = useNavigate();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const setActiveGroup = useStore((s) => s.setActiveGroup);
  const setGroups = useStore((s) => s.setGroups);
  const pushToast = useStore((s) => s.pushToast);
  const [summaries, setSummaries] = useState<Record<string, GroupSummary>>({});
  const [manage, setManage] = useState<MyGroup | null>(null);

  // Light "is anyone shopping / how many to get" per group. Best-effort: cards
  // render immediately from names and fill in when this lands (§12).
  useEffect(() => {
    let alive = true;
    const ids = groups.map((g) => g.group_id);
    if (ids.length) {
      getGroupSummaries(ids)
        .then((s) => alive && setSummaries(s))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [groups]);

  function open(g: MyGroup) {
    markEnteredList();
    if (g.group_id !== activeGroupId) {
      setActiveGroup(g.group_id);
      pushToast(`Switched to ${g.name}`);
    }
    navigate('/');
  }

  // After a leave/delete: if it was the list you're currently in (or the last one
  // you're in), reload so the app re-resolves a new active group / the create-join
  // screen. Otherwise refresh the overview in place and stay put.
  async function afterMutation(message: string, wasCurrent: boolean) {
    setManage(null);
    if (wasCurrent) {
      window.location.assign('/');
      return;
    }
    try {
      const remaining = await listMyGroups();
      if (remaining.length === 0) {
        window.location.assign('/');
        return;
      }
      setGroups(remaining);
    } catch {
      /* offline / fetch failed — the card refreshes on next load */
    }
    pushToast(message);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-display-l text-ink">Your lists</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid h-11 w-11 place-items-center rounded-pill text-ink-soft hover:bg-surface-2"
          >
            <GearIcon />
          </Link>
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="mt-10 text-center text-body text-ink-soft">No lists yet.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => {
            const s = summaries[g.group_id];
            const current = g.group_id === activeGroupId;
            return (
              <li key={g.group_id} className="flex items-stretch gap-2">
                <button
                  onClick={() => open(g)}
                  aria-current={current ? 'true' : undefined}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md bg-surface p-4 text-left shadow-e1 hover:bg-surface-2"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-item font-semibold text-ink">{g.name}</span>
                      {current && (
                        <span className="shrink-0 rounded-pill bg-brand-tint px-2 py-0.5 text-caption font-semibold text-brand-strong">
                          Current
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 truncate text-meta text-ink-faint">as {g.display_name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-meta text-ink-soft">
                    {s?.shopping ? (
                      <span className="flex items-center gap-1.5 font-semibold text-brand-strong">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                        </span>
                        Shopping
                      </span>
                    ) : s ? (
                      <span className="tnum">
                        {s.pending} {s.pending === 1 ? 'item' : 'items'}
                      </span>
                    ) : null}
                  </span>
                </button>
                {/* Per-list management (leave / delete) — a sibling of the open
                    button, not nested, so the two taps never collide. */}
                <button
                  onClick={() => setManage(g)}
                  aria-label={`Manage ${g.name}`}
                  className="grid w-11 shrink-0 place-items-center rounded-md bg-surface text-ink-soft shadow-e1 hover:bg-surface-2 hover:text-ink"
                >
                  <KebabIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        to="/groups/new"
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 text-item font-semibold text-ink shadow-e1 hover:bg-surface-2"
      >
        <PlusIcon className="text-brand" size={20} /> Create or join another list
      </Link>

      {manage && (
        <ManageListSheet
          group={manage}
          isCurrent={manage.group_id === activeGroupId}
          onClose={() => setManage(null)}
          onDone={afterMutation}
        />
      )}
    </div>
  );
}

// Manage one list from the overview: leave it, or (if you created it) delete it
// for everyone. Both are server-enforced — leave_group hands ownership on / bins
// the group when the last member leaves; delete is gated to the creator by RLS
// (groups_delete), and the client tells a real delete from an RLS no-op so a
// non-creator gets pointed at "leave" instead (§11.4).
function ManageListSheet({
  group,
  isCurrent,
  onClose,
  onDone,
}: {
  group: MyGroup;
  isCurrent: boolean;
  onClose: () => void;
  onDone: (message: string, wasCurrent: boolean) => void | Promise<void>;
}) {
  const pushToast = useStore((s) => s.pushToast);
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete'>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: 'leave' | 'delete') {
    if (!isSupabaseConfigured()) {
      pushToast('Connect a backend to manage your lists.');
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (action === 'leave') {
        await leaveGroup(group.group_id);
        await onDone(`Left ${group.name}.`, isCurrent);
      } else {
        const deleted = await deleteGroup(group.group_id);
        if (deleted) {
          await onDone(`Deleted ${group.name}.`, isCurrent);
        } else {
          // RLS removed nothing → you're a member but not the creator.
          pushToast('Only the person who created this list can delete it — you can leave it instead.');
          setConfirm(null);
          setBusy(false);
        }
      }
    } catch {
      pushToast('That didn’t work — try again.');
      setBusy(false);
    }
  }

  const prompt =
    confirm === 'leave'
      ? {
          title: `Leave ${group.name}?`,
          body: 'You’ll lose access to this shared list. If you’re the last one out, it’s deleted for good.',
          cta: 'Leave list',
          danger: false,
        }
      : confirm === 'delete'
        ? {
            title: `Delete ${group.name} for everyone?`,
            body: 'Permanently deletes this list — every item and all its history — for everyone in it. This can’t be undone. (Only the list’s creator can do this.)',
            cta: 'Delete list',
            danger: true,
          }
        : null;

  return (
    <BottomSheet open onClose={onClose} title={prompt ? prompt.title : group.name}>
      {prompt ? (
        <>
          <p className="text-body text-ink-soft">{prompt.body}</p>
          <div className="mt-5 flex gap-2">
            <button
              data-autofocus
              onClick={() => setConfirm(null)}
              className="min-h-12 flex-1 rounded-pill border border-line font-semibold text-ink"
            >
              Keep it
            </button>
            <button
              onClick={() => run(confirm!)}
              disabled={busy}
              className={`min-h-12 flex-1 rounded-pill font-semibold text-white disabled:opacity-50 ${
                prompt.danger ? 'bg-bin' : 'bg-urgent'
              }`}
            >
              {busy ? '…' : prompt.cta}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-meta text-ink-soft">
            You’re on this list as <span className="font-semibold text-ink">{group.display_name}</span>.
          </p>
          <button
            onClick={() => setConfirm('leave')}
            className="flex min-h-13 w-full items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 text-left font-semibold text-ink shadow-e1 active:bg-surface-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-item">Leave this list</span>
              <span className="text-meta font-normal text-ink-soft">Removes you. If you’re the last one out, it’s deleted.</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-ink-faint">›</span>
          </button>
          <button
            onClick={() => setConfirm('delete')}
            style={{ backgroundColor: 'color-mix(in srgb, var(--bin) 8%, var(--surface))' }}
            className="flex min-h-13 w-full items-center justify-between gap-3 rounded-md border border-bin px-4 text-left font-semibold text-bin shadow-e1"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-item">Delete this list for everyone</span>
              <span className="text-meta font-normal text-bin">Permanent, for all members. Creator only.</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-bin">›</span>
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
