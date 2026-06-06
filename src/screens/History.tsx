import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { getTripHistory, isSupabaseConfigured, type TripHistoryEntry } from '@/lib/supabase';
import { EmptyState } from '@/components/EmptyState';
import { ChevronDownIcon } from '@/components/icons';

// Trip history (§2.5) — a read-only record of completed shops, lazy-loaded
// (code-split, §10). Completed trips otherwise vanish from the UI; this closes
// the loop ("did we get milk last Saturday?") and gives the Reporting data a home.

function whenLabel(iso: string | null): string {
  if (!iso) return 'Completed';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function History() {
  const groupId = useStore((s) => s.trip.group_id);
  const members = useStore((s) => s.members);
  const [trips, setTrips] = useState<TripHistoryEntry[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setTrips([]);
      return;
    }
    let alive = true;
    getTripHistory(groupId)
      .then((t) => alive && setTrips(t))
      .catch(() => alive && setTrips([]));
    return () => {
      alive = false;
    };
  }, [groupId]);

  const shopperName = (id: string | null): string | null =>
    id ? (members.find((m) => m.user_id === id)?.display_name ?? null) : null;

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-2 flex items-center gap-3">
        <Link to="/settings" aria-label="Back" className="grid h-11 w-11 place-items-center rounded-pill hover:bg-surface-2">
          ←
        </Link>
        <h1 className="font-display text-display-l text-ink">Past shops</h1>
      </header>
      <p className="mb-4 px-1 text-body text-ink-soft">Your finished trips, most recent first.</p>

      {trips === null ? (
        <p className="mt-10 text-center text-body text-ink-soft">Loading…</p>
      ) : trips.length === 0 ? (
        <EmptyState line="No past shops yet." sub="Finish a trip and it’ll show up here." />
      ) : (
        <ul className="space-y-3">
          {trips.map((t) => {
            const got = t.items.filter((i) => i.status === 'bought' || i.status === 'substituted').length;
            const missed = t.items.filter((i) => i.status === 'not_found').length;
            const who = shopperName(t.shopper_id);
            const open = openId === t.id;
            return (
              <li key={t.id} className="overflow-hidden rounded-md bg-surface shadow-e1">
                <button
                  onClick={() => setOpenId(open ? null : t.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-item font-medium text-ink">{whenLabel(t.completed_at)}</span>
                    <span className="block text-meta text-ink-soft">
                      {got} got{missed > 0 ? ` · ${missed} not found` : ''}
                      {who ? ` · ${who} shopped` : ''}
                    </span>
                  </span>
                  <ChevronDownIcon
                    size={18}
                    className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open && (
                  <ul className="border-t border-line">
                    {t.items.length === 0 ? (
                      <li className="px-4 py-3 text-meta text-ink-soft">Nothing recorded for this trip.</li>
                    ) : (
                      t.items.map((i, n) => (
                        <li
                          key={`${i.name}-${n}`}
                          className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-0"
                        >
                          <span className={`truncate text-meta ${i.status === 'not_found' ? 'text-ink-faint line-through' : 'text-ink'}`}>
                            {i.name}
                            {i.quantity > 1 && <span className="text-ink-faint"> ×{i.quantity}</span>}
                          </span>
                          <span className="shrink-0 text-caption text-ink-faint">
                            {i.status === 'substituted' ? 'substituted' : i.status === 'not_found' ? 'not found' : i.acted_by_name ?? ''}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
