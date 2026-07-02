import { useEffect, useState } from 'react';
import { serverNow } from '@/lib/serverTime';

interface Props {
  /** ISO timestamp the window closes at (server-authoritative — §6.5). */
  until: string;
  onClose?: () => void;
}

function format(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Last-minute window bar (§2.6) — `countdown-drain`: drains L→R; last 60s shifts
// toward --urgent. NOTE: the *true* lock is enforced server-side against now()
// (§6.5, §7.2); this is the visible countdown only.
export function CountdownBar({ until, onClose }: Props) {
  const end = new Date(until).getTime();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Judge the countdown against server time, not the device clock (§6.5) — a
  // skewed phone would otherwise show the wrong time left and fire onClose at
  // the wrong moment relative to the server-enforced window (mirrors the
  // windowOpen check in Home.tsx).
  const remaining = end - serverNow();
  const totalWindow = 15 * 60_000; // visual baseline; pct clamps anyway
  const pct = Math.max(0, Math.min(100, (remaining / totalWindow) * 100));
  const closing = remaining <= 60_000;

  useEffect(() => {
    if (remaining <= 0) onClose?.();
  }, [remaining, onClose]);

  if (remaining <= 0) return null;

  // Opaque banner with its own background + divider so it never merges into the
  // screen header sitting just below it.
  return (
    <div className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="h-1.5 w-full bg-surface-2">
        <div
          className="h-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: closing ? 'var(--urgent)' : 'var(--brand)' }}
        />
      </div>
      <div
        className={`px-4 py-2 text-center text-meta font-semibold ${closing ? 'text-urgent' : 'text-ink-soft'}`}
      >
        {closing ? '1 min left to add things.' : `Last-minute window open — ${format(remaining)} left.`}
      </div>
      {/* Announce only the meaningful threshold, not the per-second tick (which
          would fire ~900 announcements over a 15-min window). */}
      <span className="sr-only" aria-live="polite">
        {closing ? 'One minute left to add to the list.' : ''}
      </span>
    </div>
  );
}
