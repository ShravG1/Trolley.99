import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

// Drag-to-dismiss tuning (§1.8).
const DISMISS_PX = 110; // drag the sheet down past this → dismiss
const FLICK_V = 0.5; // …or a downward flick faster than this (px/ms) with some travel

// Bottom sheet (§3) — --r-lg, drag-affordance grabber, focus managed/trapped,
// Escape to close, backdrop tap to dismiss (§1.8).
//
// Drag-to-dismiss: a downward drag on the grabber/header (or on the body when it's
// scrolled to the top) follows the finger and dismisses past a threshold/flick;
// otherwise it snaps back. The grabber/header owns the gesture via touch-action:none
// so it never fights the page; the scrollable body keeps touch-action:pan-y with
// overscroll-behavior:contain so a long sheet scrolls internally without the gesture
// leaking to the document behind the (position:fixed) overlay. Background scroll is
// locked while open — previously a drag fell through and panned the whole page.
// Reduced-motion is honoured via the global transition kill-switch in global.css.
//
// Keyboard-safe: the sheet is sized/positioned to the VISUAL viewport (via the
// VisualViewport API) so when the mobile keyboard opens it sits fully above it.
export function BottomSheet({ open, onClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Keep the latest onClose without making it an effect dep — call sites pass an
  // inline arrow, which would otherwise re-attach the viewport listeners each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [vv, setVv] = useState<{ h: number; top: number }>(() => ({
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
    top: 0,
  }));

  // Drag state: dragY drives the live transform; settling animates the snap-back.
  const [dragY, setDragY] = useState(0);
  const [settling, setSettling] = useState(false);
  const drag = useRef({ active: false, allowed: false, startY: 0, lastY: 0, lastT: 0, vel: 0, id: -1 });

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    setSettling(false);
    previouslyFocused.current = document.activeElement as HTMLElement;
    const t = setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }, 50);

    // Escape closes; Tab is trapped within the sheet (§1.8 focus management).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);

    // Lock background scroll so a drag can't pan the page behind the overlay.
    const docEl = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = docEl.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    docEl.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

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
      docEl.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const sc = scrollerRef.current;
    const fromScroller = sc ? sc.contains(e.target as Node) : false;
    const atTop = (sc?.scrollTop ?? 0) <= 0;
    // Drag-to-dismiss is allowed from the chrome (grabber/header) always, or from
    // the body only when it's scrolled to the very top — otherwise it's a scroll.
    drag.current = {
      active: true,
      allowed: !fromScroller || atTop,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      vel: 0,
      id: e.pointerId,
    };
    setSettling(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || !d.allowed) return;
    const dy = e.clientY - d.startY;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vel = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    if (dy <= 0) {
      if (dragY !== 0) setDragY(0);
      return;
    }
    // Own the gesture once it's clearly a downward drag.
    if (d.id >= 0 && panelRef.current) {
      try {
        panelRef.current.setPointerCapture(d.id);
      } catch {
        /* capture is best-effort */
      }
    }
    setDragY(dy);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const dy = Math.max(0, e.clientY - d.startY);
    if (dy <= 2) return; // a tap, not a drag — let the click through
    if (d.allowed && (dy > DISMISS_PX || (d.vel > FLICK_V && dy > 24))) {
      onCloseRef.current();
      return;
    }
    // Snap back (duration is zeroed under prefers-reduced-motion by global.css).
    setSettling(true);
    setDragY(0);
  };

  const dragging = dragY > 0 || settling;

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
        style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="anim-sheet-rise relative flex max-h-full w-full max-w-md flex-col rounded-t-lg bg-surface shadow-e3"
        style={{
          transform: dragging ? `translateY(${dragY}px)` : undefined,
          transition: settling ? 'transform 220ms var(--ease-out)' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTransitionEnd={() => {
          if (settling) setSettling(false);
        }}
      >
        {/* Grabber + title own the dismiss gesture (touch-action:none → never pans). */}
        <div className="shrink-0 pt-3" style={{ touchAction: 'none' }}>
          <div className="flex justify-center py-1">
            <span className="h-1.5 w-10 rounded-pill bg-line" aria-hidden="true" />
          </div>
          {title && <h2 className="px-5 pt-2 font-display text-display-s text-ink">{title}</h2>}
        </div>
        {/* Scrolls internally so nothing (e.g. the Add button) is ever clipped;
            overscroll-contain keeps the scroll from chaining to the page. */}
        <div
          ref={scrollerRef}
          className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
