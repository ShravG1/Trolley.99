import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { DEFAULT_SHOP_LABEL } from '@/lib/activeShop';
import { ManageShopsSheet } from './ManageShopsSheet';
import { PlusIcon } from './icons';

// ShopTabs (#19) — one tab per shop (plus the default "General" tab). Tapping a tab is instant:
// every shop's items are already loaded, so switching just re-points the view at
// that shop's trip. Each tab shows how many items are still to get and whether
// someone is shopping it right now. With no shops yet, it's a single quiet
// "add a shop" entry point, so the list looks exactly as before until you opt in.
export function ShopTabs() {
  const shops = useStore((s) => s.shops);
  const allTrips = useStore((s) => s.allTrips);
  const items = useStore((s) => s.items);
  const activeShopId = useStore((s) => s.activeShopId);
  const setActiveShop = useStore((s) => s.setActiveShop);
  const [manageOpen, setManageOpen] = useState(false);

  if (shops.length === 0) {
    return (
      <div className="px-4 pt-2">
        <button
          onClick={() => setManageOpen(true)}
          className="flex min-h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-meta font-semibold text-ink-soft active:bg-surface-2"
        >
          <PlusIcon size={16} className="text-brand" /> Add a shop
        </button>
        <ManageShopsSheet open={manageOpen} onClose={() => setManageOpen(false)} />
      </div>
    );
  }

  const tripFor = (shopId: string | null) => allTrips.find((t) => (t.shop_id ?? null) === shopId);
  const toGet = (shopId: string | null) => {
    const trip = tripFor(shopId);
    if (!trip) return 0;
    return items.filter(
      (i) => i.trip_id === trip.id && (i.status === 'pending' || i.status === 'not_found')
    ).length;
  };
  const isShopping = (shopId: string | null) => tripFor(shopId)?.status === 'shopping';

  const tabs: { id: string | null; label: string }[] = [
    { id: null, label: DEFAULT_SHOP_LABEL },
    ...shops.map((s) => ({ id: s.id, label: s.name })),
  ];

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Shops"
    >
      {tabs.map((tab) => {
        const active = (activeShopId ?? null) === tab.id;
        const count = toGet(tab.id);
        const shopping = isShopping(tab.id);
        return (
          <button
            key={tab.id ?? 'unsorted'}
            role="tab"
            aria-selected={active}
            onClick={() => setActiveShop(tab.id)}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-meta font-semibold transition-colors ${
              active
                ? 'border-transparent bg-brand text-on-brand shadow-e1'
                : 'border-line bg-surface text-ink-soft active:bg-surface-2'
            }`}
          >
            {shopping && (
              <span
                className={`h-2 w-2 rounded-full ${active ? 'bg-on-brand' : 'bg-brand'}`}
                aria-label="being shopped now"
              />
            )}
            <span className="max-w-[11rem] truncate">{tab.label}</span>
            {count > 0 && (
              <span className={active ? 'text-on-brand/80' : 'text-ink-faint'}>{count}</span>
            )}
          </button>
        );
      })}
      <button
        onClick={() => setManageOpen(true)}
        aria-label="Add or manage shops"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-pill border border-line text-ink-soft active:bg-surface-2"
      >
        <PlusIcon size={18} />
      </button>
      <ManageShopsSheet open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  );
}
