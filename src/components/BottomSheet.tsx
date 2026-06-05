import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

// Bottom sheet (§3) — --r-lg, drag-affordance grabber, focus managed, Escape to
// close, backdrop tap to dismiss (§1.8).
//
// Keyboard-safe: the sheet is sized/positioned to the VISUAL viewport (via the
// VisualViewport API) so when the mobile keyboard opens it sits fully above it —
// the primary action never ends up hidden behind the keyboard. Content scrolls
// internally if it's taller than the visible area.
export function BottomSheet({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [vv, setVv] = useState<{ h: number; top: number }>(() => ({
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
    top: 0,
  }));

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

    // Track the visual viewport so the sheet follows the keyboard.
    const v = window.visualViewport;
    const update = () => v && setVv({ h: v.height, top: v.offsetTop });
    update();
    v?.addEventListener('resize', update);
    v?.addEventListener('scroll', update);

    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      v?.removeEventListener('resize', update);
      v?.removeEventListener('scroll', update);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 flex items-end justify-center"
      style={{ top: vv.top, height: vv.h || undefined }}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Menu'}
    >
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={ref}
        className="anim-sheet-rise relative flex max-h-full w-full max-w-md flex-col rounded-t-lg bg-surface shadow-e3"
      >
        <div className="shrink-0 pt-3">
          <div className="flex justify-center">
            <span className="h-1.5 w-10 rounded-pill bg-line" />
          </div>
          {title && <h2 className="px-5 pt-3 font-display text-display-s text-ink">{title}</h2>}
        </div>
        {/* Scrolls internally so nothing (e.g. the Add button) is ever clipped. */}
        <div className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </div>
    </div>
  );
}
