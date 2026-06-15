import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

// Below this the visual-viewport shrink is treated as address-bar/overscroll noise
// rather than a keyboard, so the sheet doesn't drift off the bottom on a swipe.
const KEYBOARD_MIN = 120;

// Bottom sheet (§3) — tap to close: tap the grab-handle or the dimmed backdrop
// (or press Escape). No swipe-drag; the sheet is nailed to the bottom of the layout
// viewport so a stray swipe/scroll can't make it rise or detach.
//
// The page behind is scroll-locked while the sheet is open.
//
// Focus: the autofocus target is focused synchronously (layout effect, not a
// timeout) so iOS counts it as part of the opening tap and raises the keyboard.
//
// Keyboard-safe: when the on-screen keyboard is open we lift the sheet by the
// keyboard's height (VisualViewport API), thresholded so address-bar / overscroll
// changes never move it.
export function BottomSheet({ open, onClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Keep the latest onClose without making it an effect dep — call sites pass an
  // inline arrow, which would otherwise re-attach listeners every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [vv, setVv] = useState(() => {
    const h = typeof window !== 'undefined' ? window.innerHeight : 0;
    return { h, top: 0, ih: h };
  });

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

    // Track the visual viewport so we can lift the sheet above the keyboard.
    const v = window.visualViewport;
    const update = () => v && setVv({ h: v.height, top: v.offsetTop, ih: window.innerHeight });
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
  // restore the scroll position on close) so interacting with the sheet can't
  // scroll the screen underneath it.
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

  // Lift only for a genuine keyboard; the threshold ignores address-bar / overscroll
  // wobble, which would otherwise make the sheet drift off the bottom edge.
  const keyboardInset = Math.max(0, vv.ih - vv.h - vv.top);
  const lift = keyboardInset > KEYBOARD_MIN ? keyboardInset : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ paddingBottom: lift }}
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
        className="anim-sheet-rise relative flex max-h-full w-full max-w-md flex-col rounded-t-lg bg-surface shadow-e3"
      >
        <div className="shrink-0 pt-3">
          {/* Grab-handle doubles as a close button — easy to reach on a tall sheet. */}
          <button type="button" aria-label="Close" onClick={onClose} className="flex w-full justify-center py-1">
            <span className="h-1.5 w-10 rounded-pill bg-line" />
          </button>
          {title && <h2 className="px-5 pt-2 font-display text-display-s text-ink">{title}</h2>}
        </div>
        {/* Scrolls internally so nothing (e.g. the Add button) is ever clipped.
            overscroll-contain stops the bounce from chaining out to the page. */}
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
          {children}
        </div>
      </div>
    </div>
  );
}
