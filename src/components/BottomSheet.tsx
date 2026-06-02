import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

// Bottom sheet (§3) — --r-lg, drag-affordance grabber, focus managed, Escape to
// close, backdrop tap to dismiss. Focus is trapped lightly via initial focus +
// returning focus on close (§1.8).
export function BottomSheet({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/40 motion-safe:animate-[urgent-flash_0.001ms]"
        onClick={onClose}
      />
      <div
        ref={ref}
        className="relative w-full max-w-md rounded-t-lg bg-surface shadow-e3 pb-[max(16px,env(safe-area-inset-bottom))]
                   motion-safe:transition-transform motion-safe:duration-considered"
        style={{ animation: 'item-land 240ms var(--ease-out)' }}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-10 rounded-pill bg-line" />
        </div>
        {title && (
          <h2 className="px-5 pt-3 font-display text-display-s text-ink">{title}</h2>
        )}
        <div className="px-5 pb-5 pt-3">{children}</div>
      </div>
    </div>
  );
}
