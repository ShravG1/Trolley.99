import '@fontsource-variable/jetbrains-mono'; // mono numerals — only on this code-split route (§10)
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { SegmentedControl } from '@/components/SegmentedControl';
import { isSupabaseConfigured, getReportingTally } from '@/lib/supabase';

// Reporting (§2.9) — settings-gated, lazy-loaded (code-split, §10) so JetBrains
// Mono and this route stay out of the initial bundle. Framed as fun, not
// surveillance; group-scoped and deletable (§11.3).
//
// Live mode reads completed-trip aggregates server-side per range; demo mode
// fills the bars from the seed so the screen is explorable without a backend.
type Range = 'week' | 'month' | 'all';

const RANGE_LABEL: Record<Range, string> = { week: 'This week', month: 'This month', all: 'All-time' };

export default function Reporting() {
  const items = useStore((s) => s.items);
  const members = useStore((s) => s.members);
  const groupId = useStore((s) => s.trip.group_id);
  const [range, setRange] = useState<Range>('month');
  const isLive = isSupabaseConfigured();
  const [live, setLive] = useState<Record<string, number> | null>(null);

  // Live: pull completed-trip aggregates for the selected range.
  useEffect(() => {
    if (!isLive) return;
    let alive = true;
    getReportingTally(groupId, range)
      .then((t) => alive && setLive(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isLive, groupId, range]);

  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) counts.set(m.display_name, 0);
    if (isLive) {
      for (const [name, n] of Object.entries(live ?? {})) counts.set(name, (counts.get(name) ?? 0) + n);
    } else {
      // Demo: tally the seed's bought items + a little flavour so the bars aren't empty.
      for (const i of items) {
        if ((i.status === 'bought' || i.status === 'substituted') && i.acted_by_name) {
          counts.set(i.acted_by_name, (counts.get(i.acted_by_name) ?? 0) + 1);
        }
      }
      counts.set('Mum', (counts.get('Mum') ?? 0) + 24);
      counts.set('Shrav', (counts.get('Shrav') ?? 0) + 12);
      counts.set('Dad', (counts.get('Dad') ?? 0) + 7);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items, members, isLive, live]);

  const hasData = tally.some(([, n]) => n > 0);

  const max = Math.max(1, ...tally.map(([, n]) => n));
  const mvp = tally[0];

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5 font-mono">
      <header className="mb-4 flex items-center gap-3 font-body">
        <Link to="/settings" aria-label="Back" className="grid h-11 w-11 place-items-center rounded-pill hover:bg-surface-2">
          ←
        </Link>
        <h1 className="font-display text-display-l text-ink">Reporting</h1>
      </header>

      <div className="mb-5 font-body">
        <SegmentedControl
          ariaLabel="Time range"
          value={range}
          onChange={setRange}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'all', label: 'All time' },
          ]}
        />
      </div>

      {!hasData ? (
        <p className="mt-10 text-center font-body text-body text-ink-soft">
          Nothing to show yet — finish a shop and the leaderboard fills in.
        </p>
      ) : (
        <>
          {mvp && (
            <p className="mb-6 font-body text-body text-ink-soft">
              {range === 'all' ? 'All-time MVP' : `${RANGE_LABEL[range]}’s MVP`}:{' '}
              <span className="font-semibold text-ink">{mvp[0]}</span>. {mvp[1]} items. Show-off.
            </p>
          )}
          <ul className="space-y-4">
            {tally.map(([name, n]) => (
              <li key={name}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-body text-item text-ink">{name}</span>
                  <span className="text-stat font-semibold tabular-nums text-ink">{n}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-2" aria-hidden="true">
                  <div className="h-full rounded-pill bg-brand" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
