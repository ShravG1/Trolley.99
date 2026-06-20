import { useEffect, useRef, useState } from 'react';
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

  // Show a fade at whichever edge has more tabs scrolled off-screen, so it's
  // obvious the strip scrolls when there are more shops than fit (#19).
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () =>
      setEdges({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [shops.length]);

  // Keep the selected tab in view — creating a shop auto-switches to it, and it
  // may be scrolled off the end of a full strip (#19).
  useEffect(() => {
    scrollerRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeShopId, shops.length]);

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
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex items-center gap-2 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Shops"
      >
        {tabs.map((tab) => {
          const active = (activeShopId ?? null) === tab.id;
          const count = toGet(tab.id);
          const shopping = isShopping(tab.id);
          // Fold the status/count into the button's own accessible name so a
          // screen reader reads "Tesco, being shopped now, 3 to get" — not an
          // orphaned label on the decorative dot.
          const label = `${tab.label}${shopping ? ', being shopped now' : ''}${count > 0 ? `, ${count} to get` : ''}`;
          return (
            <button
              key={tab.id ?? 'unsorted'}
              role="tab"
              aria-selected={active}
              aria-label={label}
              title={tab.label}
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
                  aria-hidden="true"
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
      {edges.left && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-bg to-transparent" />
      )}
      {edges.right && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg to-transparent" />
      )}
    </div>
  );
}
