import { useEffect, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { QtyStepper } from './QtyStepper';
import { AISLES, AISLE_ORDER, aisleColor, type AisleKey } from '@/lib/aisles';
import { useStore } from '@/store/useStore';
import type { Item } from '@/types/models';

interface Props {
  item: Item | null;
  onClose: () => void;
}

// ItemSheet (§2.3) — tap-body edit (name, qty, aisle, urgent) plus the swipe-left
// actions (Substitute / Not found / Delete). One sheet, both jobs.
export function ItemSheet({ item, onClose }: Props) {
  const { setQuantity, setCategory, renameItem, setNote, setUnit, toggleUrgent, substitute, markNotFound, deleteItem } = useStore();

  const [subbing, setSubbing] = useState(false);
  const [subName, setSubName] = useState('');
  const [subNote, setSubNote] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnitVal] = useState('');
  const [note, setNoteVal] = useState('');

  useEffect(() => {
    setSubbing(false);
    setSubName('');
    setSubNote('');
    setName(item?.name ?? '');
    setUnitVal(item?.unit ?? '');
    setNoteVal(item?.note ?? '');
  }, [item?.id, item?.name, item?.unit, item?.note]);

  if (!item) return null;

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item.name}>
      {subbing ? (
        <div className="flex flex-col gap-3">
          <label className="text-meta font-semibold text-ink-soft">What did you get instead?</label>
          <input
            data-autofocus
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            placeholder="e.g. Oat milk"
            maxLength={80}
            className="w-full rounded-xs border border-line bg-surface-2 px-4 py-3 text-item text-ink"
          />
          <input
            value={subNote}
            onChange={(e) => setSubNote(e.target.value)}
            placeholder={`Note (default: "instead of ${item.name}")`}
            maxLength={120}
            className="w-full rounded-xs border border-line bg-surface-2 px-4 py-3 text-body text-ink"
          />
          <button
            onClick={() => {
              substitute(item.id, subName, subNote);
              onClose();
            }}
            disabled={!subName.trim()}
            className="min-h-12 rounded-pill bg-sub px-6 font-semibold text-white disabled:opacity-40"
          >
            Save substitute
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="item-name" className="mb-2 block text-item text-ink">Name</label>
            <input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const n = name.trim();
                if (n && n !== item.name) renameItem(item.id, n);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              maxLength={80}
              className="w-full rounded-xs border border-line bg-surface-2 px-4 py-3 text-item text-ink focus:border-brand"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-item text-ink">Quantity</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <input
                value={unit}
                onChange={(e) => setUnitVal(e.target.value)}
                onBlur={() => {
                  if ((unit.trim() || null) !== (item.unit ?? null)) setUnit(item.id, unit);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                placeholder="unit"
                aria-label="Unit (e.g. litres, pack)"
                maxLength={24}
                className="w-24 rounded-xs border border-line bg-surface-2 px-3 py-2 text-meta text-ink focus:border-brand"
              />
              <QtyStepper value={item.quantity} onChange={(q) => setQuantity(item.id, q)} size="sm" />
            </div>
          </div>

          <div>
            <label htmlFor="item-note" className="mb-2 block text-item text-ink">Note</label>
            <input
              id="item-note"
              value={note}
              onChange={(e) => setNoteVal(e.target.value)}
              onBlur={() => {
                if ((note.trim() || null) !== (item.note ?? null)) setNote(item.id, note);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              placeholder="e.g. get the own-brand one"
              maxLength={280}
              className="w-full rounded-xs border border-line bg-surface-2 px-4 py-3 text-body text-ink focus:border-brand"
            />
          </div>

          <div>
            <span className="mb-2 block text-item text-ink">Aisle</span>
            <div className="flex flex-wrap gap-2">
              {AISLE_ORDER.map((key) => {
                const active = key === item.category;
                return (
                  <button
                    key={key}
                    onClick={() => setCategory(item.id, key as AisleKey)}
                    className={`flex min-h-11 items-center gap-1.5 rounded-pill border px-3 text-meta ${
                      active ? 'border-transparent text-white' : 'border-line text-ink'
                    }`}
                    style={active ? { backgroundColor: aisleColor(key) } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? '#fff' : aisleColor(key) }} />
                    {AISLES[key].label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-4 py-3">
            <span className="text-item text-ink">Urgent</span>
            <button
              role="switch"
              aria-checked={item.priority === 'urgent'}
              onClick={() => toggleUrgent(item.id)}
              className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors ${
                item.priority === 'urgent' ? 'bg-urgent' : 'bg-line'
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-pill bg-white shadow-e1 transition-transform ${
                  item.priority === 'urgent' ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => setSubbing(true)}
              className="min-h-11 flex-1 basis-20 rounded-md border border-line py-3 text-meta font-semibold text-sub"
            >
              Substitute
            </button>
            <button
              onClick={() => {
                markNotFound(item.id);
                onClose();
              }}
              className="min-h-11 flex-1 basis-20 rounded-md border border-line py-3 text-meta font-semibold text-ink-soft"
            >
              Not found
            </button>
            <button
              onClick={() => {
                deleteItem(item.id);
                onClose();
              }}
              className="min-h-11 flex-1 basis-20 rounded-md border border-line py-3 text-meta font-semibold text-bin"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
