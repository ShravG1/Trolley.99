interface Props {
  line: string;
  sub?: string;
}

// EmptyState (§3) — Bricolage line + room for a light illustration. Dry, warm
// voice (§1.7).
export function EmptyState({ line, sub }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      <div
        className="mb-5 h-16 w-16 rounded-lg bg-brand-tint"
        aria-hidden="true"
        style={{ maskImage: 'radial-gradient(circle, #000 60%, transparent 70%)' }}
      />
      <p className="font-display text-display-s text-ink">{line}</p>
      {sub && <p className="mt-2 max-w-xs text-body text-ink-soft">{sub}</p>}
    </div>
  );
}
