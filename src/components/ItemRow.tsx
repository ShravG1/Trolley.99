import { memo, useRef, useState } from 'react';
import type { Item } from '@/types/models';
import { AISLES, aisleColor, aisleTint } from '@/lib/aisles';
import {
  PendingIcon,
  UrgentIcon,
  BoughtIcon,
  SubIcon,
  NotFoundIcon,
  BinIcon,
  KebabIcon,
} from './icons';

interface Props {
  item: Item;
  density: 'list' | 'shopping';
  readOnly?: boolean;
  onBought: (id: string) => void;
  onEdit: (item: Item) => void;
  onMenu: (item: Item) => void;
  onDelete: (id: string) => void;
}

const SWIPE_RIGHT = 72; // swipe right past this → mark bought
const REVEAL_W = 92; // width of the revealed Delete button
const REVEAL_TRIGGER = 44; // swipe left past this → open (step 1) / confirm delete once open (step 2)

// ItemRow (§2.3) — all states, both densities, swipe actions, aisle tab.
// State is icon + text + position + colour, never colour alone (§1.8).
// Delete is a two-step swipe (§2.3): a left swipe REVEALS a Delete button that
// stays in view; tapping it — or swiping left again — confirms. A stray full
// swipe can no longer bin an item outright. Tap the row to dismiss the reveal.
// Memoised: with stable row callbacks, only rows whose item changed re-render.
export const ItemRow = memo(function ItemRow({ item, density, readOnly, onBought, onEdit, onMenu, onDelete }: Props) {
  const [dx, setDx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axisLocked = useRef<'x' | 'y' | null>(null);
  const swiping = useRef(false);
  // After a horizontal swipe the browser still fires a click; swallow it so the
  // reveal we just opened isn't immediately dismissed (or an edit opened).
  const suppressClick = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const done = item.status === 'bought' || item.status === 'substituted';
  const notFound = item.status === 'not_found';
  const urgent = item.priority === 'urgent' && item.status === 'pending';

  const minH = density === 'shopping' ? 'min-h-16' : 'min-h-14';
  const collapsed = done ? (density === 'shopping' ? 'min-h-12' : 'min-h-11') : minH;

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    swiping.current = true;
    axisLocked.current = null;
    suppressClick.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!swiping.current || startX.current === null || startY.current === null) return;
    const dxNow = e.clientX - startX.current;
    const dyNow = e.clientY - startY.current;
    // Axis lock: decide once whether this is a horizontal swipe or a vertical
    // scroll, so swiping never fights the list scrolling (§2.3 mobile).
    if (axisLocked.current === null && Math.abs(dxNow) + Math.abs(dyNow) > 8) {
      axisLocked.current = Math.abs(dxNow) > Math.abs(dyNow) ? 'x' : 'y';
    }
    if (axisLocked.current === 'y') {
      swiping.current = false; // hand the gesture back to the scroller
      setDx(0);
      return;
    }
    if (axisLocked.current === 'x') setDx(dxNow);
  };
  const onPointerUp = () => {
    if (!swiping.current) {
      setDx(0);
      return;
    }
    swiping.current = false;
    const wasX = axisLocked.current === 'x';
    const delta = dx;
    setDx(0);
    startX.current = null;
    startY.current = null;
    axisLocked.current = null;
    if (!wasX) return;
    if (Math.abs(delta) > 8) suppressClick.current = true; // it was a swipe, not a tap

    if (!revealed) {
      // Closed: right → bought; left far enough → reveal the Delete button (step 1).
      if (delta > SWIPE_RIGHT && !done) onBought(item.id);
      else if (-delta >= REVEAL_TRIGGER) setRevealed(true);
    } else {
      // Open: left again → delete (step 2); right → dismiss; small → stay open.
      if (-delta >= REVEAL_TRIGGER) onDelete(item.id);
      else if (delta > SWIPE_RIGHT) setRevealed(false);
    }
  };

  // A tap (not a swipe) on the row: dismiss the reveal if open, else the normal
  // action. Returns true if it handled a dismiss/suppressed click, so callers stop.
  const tapHandled = (): boolean => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return true;
    }
    if (revealed) {
      setRevealed(false);
      return true;
    }
    return false;
  };

  // State → icon + colour
  let Icon = PendingIcon;
  let iconColor = 'var(--ink-soft)';
  if (urgent) {
    Icon = UrgentIcon;
    iconColor = 'var(--urgent)';
  } else if (done && item.status === 'substituted') {
    Icon = SubIcon;
    iconColor = 'var(--sub)';
  } else if (done) {
    Icon = BoughtIcon;
    iconColor = 'var(--brand)';
  } else if (notFound) {
    Icon = NotFoundIcon;
    iconColor = 'var(--ink-faint)';
  }

  const rowBg = urgent
    ? 'var(--urgent-tint)'
    : item.status === 'substituted'
      ? 'var(--sub-tint)'
      : aisleTint(item.category);

  const base = revealed ? -REVEAL_W : 0;
  const liveX = Math.max(-(REVEAL_W + 80), Math.min(96, base + dx));

  return (
    <div className="relative overflow-hidden" style={{ viewTransitionName: `item-${item.id}` }}>
      {/* Reveals behind the row: right = Bought (swipe →); left = a real Delete
          button (swipe ←) that stays put until tapped or swiped again. */}
      <div className="absolute inset-0 flex items-stretch justify-between">
        <span className="flex items-center gap-2 px-5 font-semibold" style={{ color: 'var(--brand)' }} aria-hidden="true">
          <BoughtIcon /> Bought
        </span>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          tabIndex={revealed ? 0 : -1}
          aria-hidden={!revealed}
          aria-label={`Delete ${item.name}`}
          className="flex shrink-0 items-center justify-center gap-2 font-semibold text-on-brand"
          style={{ width: REVEAL_W, backgroundColor: 'var(--bin)' }}
        >
          <BinIcon /> Delete
        </button>
      </div>

      <div
        ref={rowRef}
        className={`relative flex items-center gap-3 border-b border-line px-4 ${collapsed}
          motion-safe:transition-[min-height,transform,opacity] motion-safe:duration-considered motion-safe:ease-out
          ${done ? 'opacity-50' : notFound ? 'opacity-70' : ''}`}
        style={{
          backgroundColor: rowBg,
          transform: `translateX(${liveX}px)`,
          transition: dx !== 0 ? 'none' : undefined,
          touchAction: 'pan-y', // allow vertical scroll; we own horizontal swipe
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* 4px aisle-colour tab (§2.3) */}
        <span
          className="absolute left-0 top-0 h-full w-1"
          style={{ backgroundColor: urgent ? 'var(--urgent)' : aisleColor(item.category) }}
          aria-hidden="true"
        />

        {/* Checkbox / state icon — tap = bought (or dismiss an open reveal) */}
        <button
          onClick={() => {
            if (tapHandled()) return;
            if (!readOnly && !done) onBought(item.id);
          }}
          disabled={readOnly || done}
          aria-label={done ? `${item.name}, ${item.status}` : `Mark ${item.name} as bought`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-pill"
          style={{ color: iconColor }}
        >
          <Icon className={done ? 'anim-tick-pop' : undefined} />
        </button>

        {/* Body — tap = edit (or dismiss an open reveal) */}
        <button
          className="flex min-w-0 flex-1 flex-col items-start py-2 text-left"
          onClick={() => {
            if (tapHandled()) return;
            if (!readOnly) onEdit(item);
          }}
        >
          <span
            className={`truncate font-medium text-ink ${density === 'shopping' ? 'text-[18px]' : 'text-item'} ${
              done ? 'text-ink-faint line-through' : ''
            }`}
          >
            {item.name}
            {notFound && <span className="ml-1 text-meta text-ink-faint">(attempt {item.attempt_count})</span>}
          </span>
          <span className="truncate text-meta text-ink-soft">{subLabel(item)}</span>
        </button>

        {/* Qty chip — shown when >1 or a unit makes it meaningful ("1 pack") */}
        {(item.quantity > 1 || item.unit) && (
          <span className="tnum shrink-0 rounded-pill bg-surface-2 px-2.5 py-1 text-meta font-semibold text-ink">
            {item.unit ? `${item.quantity} ${item.unit}` : `×${item.quantity}`}
          </span>
        )}

        {/* Overflow — deletes outright on a done row, else opens the actions sheet */}
        {!readOnly && (
          <button
            onClick={() => {
              if (tapHandled()) return;
              done ? onDelete(item.id) : onMenu(item);
            }}
            aria-label={done ? `Delete ${item.name}` : `More options for ${item.name}`}
            className="grid h-11 w-11 shrink-0 place-items-center text-ink-faint hover:text-ink"
          >
            <KebabIcon />
          </button>
        )}
      </div>
    </div>
  );
});

function subLabel(item: Item): string {
  if (item.status === 'pending' && item.priority === 'urgent') return 'Urgent';
  switch (item.status) {
    case 'bought':
      return `Bought${item.acted_by_name ? ` by ${item.acted_by_name}` : ''}`;
    case 'substituted':
      return `Substituted · ${item.substitution_note ?? ''}`;
    case 'not_found':
      return 'Not found — rolled over';
    default:
      // A note is a shopper instruction ("get the own-brand one") — more useful
      // at the shelf than the aisle/added-by, so it takes the subtitle line.
      if (item.note) return item.note;
      return `${AISLES[item.category].label}${item.added_by_name ? ` · added by ${item.added_by_name}` : ''}`;
  }
}
