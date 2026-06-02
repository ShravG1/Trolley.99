import { useEffect, useState } from 'react';

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

  const remaining = end - Date.now();
  const totalWindow = 15 * 60_000; // visual baseline; pct clamps anyway
  const pct = Math.max(0, Math.min(100, (remaining / totalWindow) * 100));
  const closing = remaining <= 60_000;

  useEffect(() => {
    if (remaining <= 0) onClose?.();
  }, [remaining, onClose]);

  if (remaining <= 0) return null;

  return (
    <div className="sticky top-0 z-20">
      <div className="h-1.5 w-full bg-surface-2">
        <div
          className="h-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: closing ? 'var(--urgent)' : 'var(--brand)' }}
        />
      </div>
      <div
        className={`px-4 py-1.5 text-center text-meta font-semibold ${closing ? 'text-urgent' : 'text-ink-soft'}`}
        aria-live="polite"
      >
        {closing ? '1 min left to add things.' : `Last-minute window open — ${format(remaining)} left.`}
      </div>
    </div>
  );
}
