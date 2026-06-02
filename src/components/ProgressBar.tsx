interface Props {
  done: number;
  total: number;
  /** Aisle colour for per-aisle bars; brand for the overall bar. */
  color?: string;
  /** Slim overall bar vs the chunkier per-aisle bar. */
  slim?: boolean;
  label?: string;
}

// ProgressBar (§3) — overall + per-aisle (`aisle-fill` tween, §1.6).
export function ProgressBar({ done, total, color = 'var(--brand)', slim = false, label }: Props) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-meta text-ink-soft">
          <span>{label}</span>
          <span className="tnum font-mono">
            {done} / {total}
          </span>
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-pill bg-surface-2 ${slim ? 'h-1' : 'h-2'}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className="h-full rounded-pill motion-safe:transition-[width] motion-safe:duration-[260ms] motion-safe:ease-spring"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
