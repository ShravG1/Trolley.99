import { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { QtyStepper } from './QtyStepper';
import { AISLES, AISLE_ORDER, aisleColor, type AisleKey } from '@/lib/aisles';
import { guessAisle } from '@/lib/categorise';
import { useStore } from '@/store/useStore';
import { getHotList, isSupabaseConfigured } from '@/lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Starter suggestions, shown until the group's learned hot list (server-side,
// §4) has enough completed-trip history to take over.
const HOT_LIST = ['Milk', 'Bread', 'Eggs', 'Butter', 'Bananas', 'Chicken', 'Pasta', 'Tea bags', 'Loo roll', 'Cheese'];

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// AddSheet (§2.4) — type-ahead chips, editable aisle tag (re-aisle is
// MANDATORY), qty stepper, urgent toggle, multi-add tally.
export function AddSheet({ open, onClose }: Props) {
  const addItem = useStore((s) => s.addItem);
  const multiAddCount = useStore((s) => s.multiAddCount);
  const resetMultiAdd = useStore((s) => s.resetMultiAdd);
  const groupId = useStore((s) => s.trip.group_id);

  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [urgent, setUrgent] = useState(false);
  const [aisle, setAisle] = useState<AisleKey>('other');
  const [aisleOpen, setAisleOpen] = useState(false);
  // Learned hot list (frequency-ranked from completed trips); falls back to the
  // starter list below until the group has shopping history (§2.4).
  const [hot, setHot] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !isSupabaseConfigured()) return;
    getHotList(groupId)
      .then(setHot)
      .catch(() => setHot([]));
  }, [open, groupId]);

  // Auto-categorise as you type; user can override via the editable tag.
  useEffect(() => {
    if (name.trim()) setAisle(guessAisle(name));
  }, [name]);

  useEffect(() => {
    if (open) resetMultiAdd();
  }, [open, resetMultiAdd]);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    const source = hot.length > 0 ? hot.map(titleCase) : HOT_LIST;
    return source.filter((s) => !q || s.toLowerCase().includes(q)).slice(0, 6);
  }, [name, hot]);

  function commit() {
    if (!name.trim()) return;
    addItem({ name, quantity: qty, category: aisle, urgent });
    // Keep the sheet open for rapid multi-add (§2.4).
    setName('');
    setQty(1);
    setUrgent(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add to the list">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            placeholder="Add something…"
            maxLength={80}
            className="w-full rounded-xs border border-line bg-surface-2 py-3 pl-4 pr-11 text-item text-ink placeholder:text-ink-faint focus:border-brand"
          />
          {name && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setName('')}
              className="absolute right-1 top-1/2 grid h-11 w-10 -translate-y-1/2 place-items-center rounded-pill text-ink-faint hover:bg-surface hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>

        {/* Type-ahead chips, most-frequent first */}
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setName(s)}
              className="rounded-pill bg-surface-2 px-3 py-1.5 text-meta text-ink hover:bg-brand-tint"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          {/* Editable aisle tag (§2.4) — taps to reveal an inline chip grid. */}
          <button
            onClick={() => setAisleOpen((o) => !o)}
            className="flex items-center gap-2 rounded-pill border border-line px-3 py-2 text-meta font-semibold"
            style={{ color: aisleColor(aisle) }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: aisleColor(aisle) }} />
            {AISLES[aisle].label}
            <span className="text-ink-faint">{aisleOpen ? '▴' : '▾'}</span>
          </button>

          <QtyStepper value={qty} onChange={setQty} size="sm" />
        </div>

        {aisleOpen && (
          <div className="flex flex-wrap gap-2">
            {AISLE_ORDER.map((key) => {
              const active = key === aisle;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setAisle(key);
                    setAisleOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-meta ${
                    active ? 'border-transparent text-white' : 'border-line text-ink'
                  }`}
                  style={active ? { backgroundColor: aisleColor(key) } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: aisleColor(key) }} />
                  {AISLES[key].label}
                </button>
              );
            })}
          </div>
        )}

        {/* Urgent toggle */}
        <label className="flex items-center justify-between rounded-md bg-surface-2 px-4 py-3">
          <span className="flex flex-col">
            <span className="text-item font-medium text-ink">Urgent</span>
            {urgent && <span className="text-meta text-ink-soft">Everyone gets pinged about this one.</span>}
          </span>
          <button
            role="switch"
            aria-checked={urgent}
            aria-label="Mark urgent"
            onClick={() => setUrgent((u) => !u)}
            className={`relative h-7 w-12 rounded-pill transition-colors ${urgent ? 'bg-urgent' : 'bg-line'}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-pill bg-white shadow-e1 transition-transform ${
                urgent ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>

        <div className="flex items-center justify-between">
          <span className="text-meta text-ink-soft" aria-live="polite">
            {multiAddCount > 0 ? `${multiAddCount} added` : 'Add as many as you like.'}
          </span>
          <button
            onClick={commit}
            disabled={!name.trim()}
            className="min-h-11 rounded-pill bg-brand px-6 font-semibold text-on-brand disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
