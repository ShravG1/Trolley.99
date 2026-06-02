import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { useStore } from '@/store/useStore';
import { withViewTransition } from '@/lib/viewTransition';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CHOICES: Array<{ label: string; minutes: number | null }> = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '20 min', minutes: 20 },
  { label: 'Off', minutes: null },
];

// Window picker (§2.6) — the shopper chooses the last-minute window before the
// mode-shift fires. "Off" locks immediately.
export function StartShoppingSheet({ open, onClose }: Props) {
  const startShopping = useStore((s) => s.startShopping);
  const pushToast = useStore((s) => s.pushToast);
  const members = useStore((s) => s.members);
  const userId = useStore((s) => s.userId);
  const [selected, setSelected] = useState(10);

  const others = members.filter((m) => m.user_id !== userId).length;

  function go(minutes: number | null) {
    onClose();
    withViewTransition(() => {
      const ok = startShopping(minutes);
      if (!ok) {
        pushToast('Someone’s already shopping.');
        return;
      }
    });
    // Solo group: notifying "everyone else" is a no-op — don't crash (§12).
    if (others > 0) {
      const mins = minutes ?? 0;
      pushToast(`You’re shopping. ${mins} min to add anything last-minute.`);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Going shopping?">
      <p className="mb-4 text-body text-ink-soft">
        Give the others a last-minute window to chuck things on the list before it locks.
      </p>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.label}
            onClick={() => setSelected(c.minutes ?? -1)}
            className={`min-h-11 rounded-pill border px-4 text-meta font-semibold ${
              (c.minutes ?? -1) === selected ? 'border-transparent bg-brand text-on-brand' : 'border-line text-ink'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => go(selected === -1 ? null : selected)}
        className="mt-5 min-h-13 w-full rounded-pill bg-brand px-6 text-item font-semibold text-on-brand shadow-e2"
      >
        Start shopping
      </button>
    </BottomSheet>
  );
}
