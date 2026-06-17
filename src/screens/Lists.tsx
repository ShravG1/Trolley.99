import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { getGroupSummaries, type GroupSummary } from '@/lib/supabase';
import { markEnteredList } from '@/lib/landing';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GearIcon, PlusIcon } from '@/components/icons';
import type { MyGroup } from '@/types/models';

// "Your lists" overview (§12) — every group you're in, at a glance. The landing
// page for multi-group users, and reachable from any list's header. Tap a card
// to make it active; the sync layer re-scopes its channels to it.
export function Lists() {
  const navigate = useNavigate();
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const setActiveGroup = useStore((s) => s.setActiveGroup);
  const pushToast = useStore((s) => s.pushToast);
  const [summaries, setSummaries] = useState<Record<string, GroupSummary>>({});

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
              <li key={g.group_id}>
                <button
                  onClick={() => open(g)}
                  aria-current={current ? 'true' : undefined}
                  className="flex w-full items-center justify-between gap-3 rounded-md bg-surface p-4 text-left shadow-e1 hover:bg-surface-2"
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
    </div>
  );
}
