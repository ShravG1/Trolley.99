interface Props {
  value: number;
  onChange: (next: number) => void;
  /** Compact inline variant for the AddSheet vs the row stepper. */
  size?: 'sm' | 'md';
}

// Pill quantity stepper (§3). Defaults to 1; min 1 (mirrors the DB `>= 1`
// constraint, §7.5).
export function QtyStepper({ value, onChange, size = 'md' }: Props) {
  const btn =
    'flex items-center justify-center rounded-pill text-ink disabled:opacity-30 transition-colors hover:bg-surface-2';
  const dim = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';

  return (
    <div className="inline-flex items-center gap-1 rounded-pill bg-surface-2 p-1" role="group" aria-label="Quantity">
      <button
        className={`${btn} ${dim}`}
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="tnum min-w-7 text-center text-item font-semibold text-ink" aria-live="polite">
        {value}
      </span>
      <button className={`${btn} ${dim}`} onClick={() => onChange(value + 1)} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}
