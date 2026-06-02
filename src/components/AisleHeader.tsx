import { AISLES, aisleColor, type AisleKey } from '@/lib/aisles';
import { ProgressBar } from './ProgressBar';

interface Props {
  aisle: AisleKey;
  count: number;
  /** Quiet (List) vs loud full-colour band (Shopping) (§1.3, §2.6). */
  variant: 'quiet' | 'loud';
  done?: number;
  total?: number;
}

// AisleHeader (§3) — quiet coloured label in List mode; loud full-colour band
// with per-aisle progress in Shopping mode. Colour always paired with the label
// (§1.8).
export function AisleHeader({ aisle, count, variant, done = 0, total = 0 }: Props) {
  const meta = AISLES[aisle];
  const color = aisleColor(aisle);

  if (variant === 'quiet') {
    return (
      <div className="flex items-baseline gap-2 px-4 pb-1 pt-5">
        <span className="text-aisle font-semibold tracking-[0.02em]" style={{ color }}>
          {meta.label}
        </span>
        <span className="tnum text-meta text-ink-faint">{count}</span>
      </div>
    );
  }

  return (
    <div
      className="sticky top-2 z-10 mx-3 mt-4 rounded-md px-4 py-3 text-white shadow-e1"
      style={{ backgroundColor: color, viewTransitionName: `aisle-${aisle}` }}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-display-l leading-none">{meta.label}</h2>
        <span className="tnum font-mono text-meta opacity-90">
          {done} of {total} done
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar done={done} total={total} color="rgba(255,255,255,0.9)" />
      </div>
    </div>
  );
}
