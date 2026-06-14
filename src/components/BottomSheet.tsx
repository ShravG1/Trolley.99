import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

// How far the sheet must be dragged down before releasing dismisses it.
const DISMISS_THRESHOLD = 120;

// Bottom sheet (§3) — the grabber now actually drags: swipe the sheet down to
// dismiss (release past the threshold), otherwise it springs back. Escape closes,
// backdrop tap dismisses (§1.8).
//
// Position-locked: while the sheet is open the page behind is scroll-locked, so a
// drag/scroll on the sheet can't pull the whole screen up or rubber-band the body
// — the sheet stays put and only the sheet moves.
//
// Focus: the autofocus target is focused synchronously (layout effect, not a
// timeout) so iOS counts it as part of the opening tap and raises the keyboard.
//
// Keyboard-safe: sized/positioned to the VISUAL viewport (VisualViewport API) so it
// sits above the mobile keyboard; content scrolls internally if taller than the area.
export function BottomSheet({ open, onClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Keep the latest onClose without making it an effect dep — call sites pass an
  // inline arrow, which would otherwise re-attach listeners every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Drag state lives in a ref so per-frame moves mutate the DOM directly without
  // triggering a React re-render on every touchmove.
  const drag = useRef({ startY: 0, dy: 0, active: false });
  const [vv, setVv] = useState<{ h: number; top: number }>(() => ({
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
    top: 0,
  }));

  // Focus must run synchronously within the opening tap (layout effect, not a
  // deferred timeout) or iOS won't raise the keyboard for the autofocus field.
  useLayoutEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => previouslyFocused.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);

    // Track the visual viewport so the sheet follows the keyboard.
    const v = window.visualViewport;
    const update = () => v && setVv({ h: v.height, top: v.offsetTop });
    update();
    v?.addEventListener('resize', update);
    v?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('keydown', onKey);
      v?.removeEventListener('resize', update);
      v?.removeEventListener('scroll', update);
    };
  }, [open]);

  // Lock the page behind the sheet (iOS-safe: pin the body via position:fixed and
  // restore the scroll position on close). Without this, dragging the sheet scrolls
  // the document and the whole screen appears to move under it.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    drag.current = { startY: e.touches[0].clientY, dy: 0, active: false };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - drag.current.startY;
    const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
    // Only hijack the gesture as a dismiss-drag when pulling down from the top of
    // the content; otherwise let the inner list scroll normally.
    if (dy > 0 && atTop) {
      drag.current.active = true;
      drag.current.dy = dy;
      const panel = panelRef.current;
      if (panel) {
        panel.style.transition = 'none';
        panel.style.transform = `translateY(${dy}px)`;
      }
    }
  };

  const onTouchEnd = () => {
    if (!drag.current.active) return;
    const panel = panelRef.current;
    const dismiss = drag.current.dy > DISMISS_THRESHOLD;
    if (panel) {
      panel.style.transition = 'transform 220ms var(--ease-out)';
      panel.style.transform = dismiss ? 'translateY(100%)' : 'translateY(0)';
    }
    drag.current.active = false;
    if (dismiss) window.setTimeout(() => onCloseRef.current(), 200);
  };

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
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="anim-sheet-rise relative flex max-h-full w-full max-w-md flex-col rounded-t-lg bg-surface shadow-e3"
        style={{ touchAction: 'pan-y' }}
      >
        <div className="shrink-0 pt-3">
          <div className="flex justify-center">
            <span className="h-1.5 w-10 rounded-pill bg-line" />
          </div>
          {title && <h2 className="px-5 pt-3 font-display text-display-s text-ink">{title}</h2>}
        </div>
        {/* Scrolls internally so nothing (e.g. the Add button) is ever clipped.
            overscroll-contain stops the bounce from chaining out to the page. */}
        <div
          ref={scrollRef}
          className="overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
