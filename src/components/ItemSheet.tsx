import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { QtyStepper } from './QtyStepper';
import { ShopChips } from './ShopChips';
import { AISLES, AISLE_ORDER, aisleColor, type AisleKey } from '@/lib/aisles';
import { useStore } from '@/store/useStore';
import { canMarkBought } from '@/lib/rules';
import type { Item } from '@/types/models';

interface Props {
  item: Item | null;
  onClose: () => void;
}

/** How to describe what someone did to a row that's no longer pending. */
function resolvedVerb(status: Item['status']): string {
  switch (status) {
    case 'bought':
      return 'bought';
    case 'substituted':
      return 'swapped';
    case 'not_found':
      return 'couldn’t find';
    case 'deleted':
      return 'binned';
    default:
      return 'sorted';
  }
}

// ItemSheet (§2.3) — tap-body edit (name, qty, aisle, urgent) plus the swipe-left
// actions (Substitute / Not found / Delete). One sheet, both jobs.
//
// `item` is the LIVE row from the store (Home resolves it by id every render),
// not a snapshot from when the sheet opened — so the aisle chips, the qty and the
// Urgent switch all reflect what you just tapped, and what anyone else changed
// while you had it open.
export function ItemSheet({ item, onClose }: Props) {
  const { setQuantity, setCategory, renameItem, setNote, setUnit, toggleUrgent, substitute, markNotFound, deleteItem, restoreItem, moveItem, learnCategory } = useStore();
  const shops = useStore((s) => s.shops);
  const allTrips = useStore((s) => s.allTrips);
  const trip = useStore((s) => s.trip);
  const userId = useStore((s) => s.userId);
  // Substitute / Not found are shopping actions the DB only lets the active
  // shopper make (RLS 0013). Outside Shopping mode they'd optimistically apply and
  // then get rolled back ("the list moved on"), so don't offer them while planning.
  // Judge against the item's OWN trip, not the tab in view: with per-shop tabs
  // (#19) they can differ, and asking the wrong trip would offer actions the DB
  // then refuses (or hide ones it would allow).
  const itemTrip = allTrips.find((t) => t.id === item?.trip_id) ?? trip;
  const canAct = canMarkBought(itemTrip, userId);
  // A row someone ELSE has actioned (bought / substituted / not-found / binned)
  // is frozen server-side: items_update's WITH CHECK (0013a) only lets a row keep
  // an acted_by stamp that is your own, so any patch we sent would come back
  // 42501 and get rolled back with a baffling "the list moved on". Say so instead
  // of offering edits that can't land. Un-ticking clears the stamp and is allowed
  // for anyone, so that's the way out — offered right here.
  const lockedByOther = item != null && item.acted_by != null && item.acted_by !== userId;

  const [subbing, setSubbing] = useState(false);
  const [subName, setSubName] = useState('');
  const [subNote, setSubNote] = useState('');
  // The three text fields are uncontrolled-by-the-store while you're in them:
  // local state owns them and commits on blur/Enter. Refs let the sync effects
  // below tell "you're typing here" from "this field is idle".
  const [name, setName] = useState('');
  const [unit, setUnitVal] = useState('');
  const [note, setNoteVal] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  // Switching to a different item resets everything, including a half-finished
  // substitute.
  const itemId = item?.id;
  useEffect(() => {
    setSubbing(false);
    setSubName('');
    setSubNote('');
    setName(item?.name ?? '');
    setUnitVal(item?.unit ?? '');
    setNoteVal(item?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Adopt a change to the underlying row — someone else's edit over Realtime, or
  // a server correction after a rejected write — but never into a field you have
  // the cursor in, or a live echo would eat what you're halfway through typing.
  const liveName = item?.name;
  const liveUnit = item?.unit;
  const liveNote = item?.note;
  useEffect(() => {
    if (liveName !== undefined && document.activeElement !== nameRef.current) setName(liveName);
  }, [liveName]);
  useEffect(() => {
    if (item && document.activeElement !== unitRef.current) setUnitVal(liveUnit ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveUnit]);
  useEffect(() => {
    if (item && document.activeElement !== noteRef.current) setNoteVal(liveNote ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveNote]);

  if (!item) return null;

  // Which shop this item is currently in (#19), and whether it can be moved
  // (only still-live items — a bought/substituted row belongs to a finished shop).
  const currentShopId = itemTrip.shop_id ?? null;
  const movable = item.status === 'pending' || item.status === 'not_found';

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
          {lockedByOther && (
            <div className="flex flex-col gap-3 rounded-md bg-surface-2 px-4 py-3">
              <p className="text-meta text-ink-soft">
                {item.acted_by_name ?? 'Someone'} {resolvedVerb(item.status)} this, so it’s theirs to change.
                Put it back on the list if you need to edit it.
              </p>
              <button
                onClick={() => restoreItem(item.id)}
                className="min-h-11 rounded-pill border border-line font-semibold text-ink active:bg-surface"
              >
                Put it back on the list
              </button>
            </div>
          )}

          <div>
            <label htmlFor="item-name" className="mb-2 block text-item text-ink">Name</label>
            <input
              id="item-name"
              ref={nameRef}
              value={name}
              disabled={lockedByOther}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const n = name.trim();
                if (n && n !== item.name) renameItem(item.id, n);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              maxLength={80}
              className="w-full rounded-xs border border-line bg-surface-2 px-4 py-3 text-item text-ink focus:border-brand disabled:opacity-50"
            />
          </div>

          {/* Shop (#19) — moving a live item between shops is a top-level action, so
              it sits right under the name where it's visible without scrolling. */}
          {shops.length > 0 && movable && (
            <div>
              <span className="mb-2 block text-item text-ink">Shop</span>
              <ShopChips
                value={currentShopId}
                onSelect={(id) => {
                  if (id !== currentShopId) moveItem(item.id, id);
                  onClose();
                }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-item text-ink">Quantity</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <input
                ref={unitRef}
                value={unit}
                disabled={lockedByOther}
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
                className="w-24 rounded-xs border border-line bg-surface-2 px-3 py-2 text-meta text-ink focus:border-brand disabled:opacity-50"
              />
              <QtyStepper
                value={item.quantity}
                onChange={(q) => setQuantity(item.id, q)}
                size="sm"
                disabled={lockedByOther}
              />
            </div>
          </div>

          <div>
            <label htmlFor="item-note" className="mb-2 block text-item text-ink">Note</label>
            <input
              id="item-note"
              ref={noteRef}
              value={note}
              disabled={lockedByOther}
              onChange={(e) => setNoteVal(e.target.value)}
              onBlur={() => {
                if ((note.trim() || null) !== (item.note ?? null)) setNote(item.id, note);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              placeholder="e.g. get the own-brand one"
              maxLength={280}
              className="w-full rounded-xs border border-line bg-surface-2 px-4 py-3 text-body text-ink focus:border-brand disabled:opacity-50"
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
                    aria-pressed={active}
                    disabled={lockedByOther}
                    onClick={() => {
                      if (active) return; // already there — nothing to change or learn
                      setCategory(item.id, key as AisleKey);
                      // Re-aisling is the household telling us where this thing
                      // lives. Remember it (with a "saved" nudge) so the next
                      // "Oatly" goes to Dairy on its own (0016).
                      learnCategory(name.trim() || item.name, key as AisleKey);
                    }}
                    className={`flex min-h-11 items-center gap-1.5 rounded-pill border px-3 text-meta disabled:opacity-50 ${
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
              aria-label="Mark urgent"
              disabled={lockedByOther}
              onClick={() => toggleUrgent(item.id)}
              className={`flex h-7 w-12 shrink-0 items-center rounded-pill px-0.5 transition-colors disabled:opacity-50 ${
                item.priority === 'urgent' ? 'bg-urgent' : 'bg-line'
              }`}
            >
              <span
                className={`h-6 w-6 rounded-pill bg-white shadow-e1 transition-transform ${
                  item.priority === 'urgent' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            {/* Substitute / Not found only while actually shopping (§7/0013) — in
                List mode they'd be rejected server-side. Delete stays: binning is a
                list-management action any member may take while planning. */}
            {canAct && (
              <>
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
              </>
            )}
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
