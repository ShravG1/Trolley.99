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

const SWIPE_THRESHOLD = 72;

// ItemRow (§2.3) — all states, both densities, swipe actions, aisle tab.
// State is icon + text + position + colour, never colour alone (§1.8).
// Memoised: with the row callbacks now stable (selected, not destructured) only
// the rows whose item actually changed re-render on a realtime/optimistic update.
export const ItemRow = memo(function ItemRow({ item, density, readOnly, onBought, onEdit, onMenu, onDelete }: Props) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axisLocked = useRef<'x' | 'y' | null>(null);
  const swiping = useRef(false);
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
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!swiping.current || startX.current === null || startY.current === null) return;
    const dxNow = e.clientX - startX.current;
    const dyNow = e.clientY - startY.current;
    // Axis lock: decide once whether this gesture is a horizontal swipe or a
    // vertical scroll, so swiping never fights the list scrolling (§2.3 mobile).
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
    // A full swipe LEFT deletes outright (with an Undo toast); a swipe RIGHT
    // marks bought. Substitute / Not found live in the row's ⋯ menu (§2.3).
    const width = rowRef.current?.offsetWidth ?? 320;
    const deleteThreshold = Math.max(120, width * 0.45);
    if (dx > SWIPE_THRESHOLD && !done) {
      onBought(item.id);
    } else if (-dx > deleteThreshold) {
      onDelete(item.id);
    }
    setDx(0);
    startX.current = null;
    startY.current = null;
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

  const willDelete = -dx > Math.max(120, (rowRef.current?.offsetWidth ?? 320) * 0.45);

  return (
    <div className="relative overflow-hidden" style={{ viewTransitionName: `item-${item.id}` }}>
      {/* Swipe reveals (icon-led, never colour-only): right = Bought, full left = Delete */}
      <div
        className="absolute inset-0 flex items-center justify-between px-5"
        style={{ backgroundColor: willDelete ? 'var(--bin)' : undefined }}
      >
        <span className="flex items-center gap-2 font-semibold" style={{ color: 'var(--brand)' }}>
          <BoughtIcon /> Bought
        </span>
        <span
          className="flex items-center gap-2 font-semibold"
          style={{ color: willDelete ? 'var(--on-brand)' : 'var(--bin)' }}
        >
          {willDelete ? 'Release to delete' : 'Swipe to delete'} <BinIcon />
        </span>
      </div>

      <div
        ref={rowRef}
        className={`relative flex items-center gap-3 border-b border-line px-4 ${collapsed}
          motion-safe:transition-[min-height,transform,opacity] motion-safe:duration-considered motion-safe:ease-out
          ${done ? 'opacity-50' : notFound ? 'opacity-70' : ''}`}
        style={{
          backgroundColor: rowBg,
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dx ? 'none' : undefined,
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

        {/* Checkbox / state icon — tap = bought */}
        <button
          onClick={() => !readOnly && !done && onBought(item.id)}
          disabled={readOnly || done}
          aria-label={done ? `${item.name}, ${item.status}` : `Mark ${item.name} as bought`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-pill"
          style={{ color: iconColor }}
        >
          <Icon className={done ? 'anim-tick-pop' : undefined} />
        </button>

        {/* Body — tap = edit */}
        <button
          className="flex min-w-0 flex-1 flex-col items-start py-2 text-left"
          onClick={() => !readOnly && onEdit(item)}
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
            onClick={() => (done ? onDelete(item.id) : onMenu(item))}
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
