interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  disabledHint?: string;
  variant?: 'brand' | 'neutral';
}

// PrimaryPill (§3) — the brand CTA. Disabled carries a hint (e.g. "Mum's
// already shopping"). The visual disable is a courtesy; the server is the
// bouncer (§6.2).
export function PrimaryPill({ children, onClick, disabled, disabledHint, variant = 'brand' }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={`min-h-13 w-full rounded-pill px-6 text-item font-semibold shadow-e2 transition-all
        active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-100
        ${
          disabled
            ? 'bg-surface-2 text-ink-soft shadow-none'
            : variant === 'brand'
              ? 'bg-brand text-on-brand hover:bg-brand-strong'
              : 'bg-surface text-ink shadow-e1 hover:bg-surface-2'
        }`}
    >
      {disabled && disabledHint ? disabledHint : children}
    </button>
  );
}
