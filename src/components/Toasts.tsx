import { useStore } from '@/store/useStore';

// Toast stack (§3) — bottom, dismissible, with optional Undo (delete, rollover).
// Live changes announced to screen readers via aria-live (§1.8).
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 p-4"
      // Sit above the bottom action bar when one is present (Home sets
      // --bottom-bar-h); otherwise fall back to the safe-area inset (§3).
      style={{ bottom: 'var(--bottom-bar-h, max(16px, env(safe-area-inset-bottom)))' }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-md bg-ink px-4 py-3 text-on-brand shadow-e2"
          style={{ animation: 'item-land 240ms var(--ease-out)' }}
        >
          <span className="min-w-0 text-body text-[var(--bg)]">{t.message}</span>
          {t.undo && (
            <button
              className="shrink-0 rounded-pill px-3 py-1 text-meta font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
