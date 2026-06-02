import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { EmptyState } from '@/components/EmptyState';

// Deleted archive (§2.5) — scoped to the current trip; who binned it + when;
// one-tap re-add.
export function Archive() {
  const items = useStore((s) => s.items);
  const restore = useStore((s) => s.restoreItem);
  const deleted = items.filter((i) => i.status === 'deleted');

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-16 pt-5">
      <header className="mb-2 flex items-center gap-3">
        <Link to="/settings" aria-label="Back" className="grid h-11 w-11 place-items-center rounded-pill hover:bg-surface-2">
          ←
        </Link>
        <h1 className="font-display text-display-l text-ink">Binned</h1>
      </header>
      <p className="mb-4 px-1 text-body text-ink-soft">Binned this trip. Re-add anything you still need.</p>

      {deleted.length === 0 ? (
        <EmptyState line="Nothing binned." sub="Anything you delete shows up here for the rest of the trip." />
      ) : (
        <ul className="overflow-hidden rounded-md bg-surface shadow-e1">
          {deleted.map((i) => (
            <li key={i.id} className="flex items-center justify-between border-b border-line px-4 py-3 last:border-0">
              <span className="flex flex-col">
                <span className="text-item text-ink line-through">{i.name}</span>
                <span className="text-meta text-ink-soft">
                  {i.acted_by_name ? `${i.acted_by_name} binned this` : 'Binned'}
                  {i.acted_at ? ` · ${new Date(i.acted_at).toLocaleDateString('en-GB', { weekday: 'short' })}` : ''}
                </span>
              </span>
              <button
                onClick={() => restore(i.id)}
                className="min-h-11 rounded-pill bg-brand-tint px-4 text-meta font-semibold text-brand-strong"
              >
                Re-add
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
