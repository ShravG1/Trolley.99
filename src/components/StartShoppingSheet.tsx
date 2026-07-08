import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { useStore } from '@/store/useStore';
import { DEFAULT_SHOP_LABEL } from '@/lib/activeShop';
import { withViewTransition } from '@/lib/viewTransition';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CHOICES: Array<{ label: string; minutes: number }> = [
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '20 min', minutes: 20 },
];

// Window picker (§2.6) — the shopper chooses the last-minute window before the
// mode-shift fires. To lock immediately without a ping, go on a silent run.
export function StartShoppingSheet({ open, onClose }: Props) {
  const startShopping = useStore((s) => s.startShopping);
  const pushToast = useStore((s) => s.pushToast);
  const members = useStore((s) => s.members);
  const userId = useStore((s) => s.userId);
  const shops = useStore((s) => s.shops);
  const activeShopId = useStore((s) => s.activeShopId);
  const [selected, setSelected] = useState(10);

  const others = members.filter((m) => m.user_id !== userId).length;
  // Name the shop you're about to shop, so with several shops it's never a
  // surprise which one is starting (#19). Null shop = the default "General" list.
  const shopName = shops.length > 0 ? (shops.find((s) => s.id === activeShopId)?.name ?? DEFAULT_SHOP_LABEL) : null;

  function go(minutes: number, silent = false) {
    onClose();
    withViewTransition(() => {
      // A silent run locks the list right away — no window, since nobody's being
      // pinged to add anything last-minute.
      const ok = startShopping(silent ? null : minutes, silent);
      if (!ok) {
        pushToast('Someone’s already shopping.');
        return;
      }
    });
    if (silent) {
      pushToast('Silent run — no one’s been pinged.');
      return;
    }
    // Solo group: notifying "everyone else" is a no-op — don't crash (§12).
    if (others > 0) {
      pushToast(`You’re shopping. ${minutes} min to add anything last-minute.`);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Going shopping?">
      {shopName && (
        <p className="mb-1 text-item font-semibold text-ink">
          You’re shopping {shopName}.
        </p>
      )}
      <p className="mb-4 text-body text-ink-soft">
        Give the others a last-minute window to chuck things on the list before it locks.
      </p>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.label}
            onClick={() => setSelected(c.minutes)}
            className={`min-h-11 rounded-pill border px-4 text-meta font-semibold ${
              c.minutes === selected ? 'border-transparent bg-brand text-on-brand' : 'border-line text-ink'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => go(selected)}
        className="mt-5 min-h-13 w-full rounded-pill bg-brand px-6 text-item font-semibold text-on-brand shadow-e2"
      >
        Start shopping
      </button>
      {/* Silent run — slip off without pinging anyone. Locks the list right away
          and skips the group push; only worth offering when there's someone to
          not-ping in the first place. The hushed twilight-lilac fill sets it apart
          from the loud green primary — quiet by look as well as by function. */}
      {others > 0 && (
        <button
          onClick={() => go(0, true)}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-pill bg-sub-tint px-6 text-meta font-semibold text-sub"
        >
          <span aria-hidden="true" className="leading-none">🌙</span>
          Silent run — don’t ping anyone
        </button>
      )}
    </BottomSheet>
  );
}
