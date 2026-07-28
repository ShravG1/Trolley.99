interface Props {
  value: number;
  onChange: (next: number) => void;
  /** Compact inline variant for the AddSheet vs the row stepper. */
  size?: 'sm' | 'md';
  /** Show the count but refuse changes — for a row the DB won't let you edit
   *  (someone else's bought/binned item, RLS 0013a). */
  disabled?: boolean;
}

// Pill quantity stepper (§3). Defaults to 1; min 1 (mirrors the DB `>= 1`
// constraint, §7.5).
export function QtyStepper({ value, onChange, size = 'md', disabled = false }: Props) {
  const btn =
    'flex items-center justify-center rounded-pill text-ink text-lg disabled:opacity-30 transition-colors hover:bg-surface-2';
  // Always ≥44px so the +/- are comfortable thumb targets (§1.8); sm just trims width.
  const dim = size === 'sm' ? 'h-11 w-11' : 'h-11 w-12';

  return (
    <div className="inline-flex items-center gap-1 rounded-pill bg-surface-2 p-1" role="group" aria-label="Quantity">
      <button
        className={`${btn} ${dim}`}
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={disabled || value <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="tnum min-w-7 text-center text-item font-semibold text-ink" aria-live="polite">
        {value}
      </span>
      <button
        className={`${btn} ${dim}`}
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
