import { useStore } from '@/store/useStore';
import { DEFAULT_SHOP_LABEL } from '@/lib/activeShop';

interface Props {
  /** Currently-selected shop id; null = the default "General" bucket. */
  value: string | null;
  /** Called with the chosen shop id (null = General). */
  onSelect: (shopId: string | null) => void;
}

// ShopChips (#19) — the shared shop picker. Renders the default "General" bucket
// plus one chip per shop, with the current selection highlighted. Used by
// AddSheet (pick where a new item goes), ItemSheet and the row quick-move menu
// (move a live item between shops). One component so the chips — and the
// "General" label — never drift across the three places you choose a shop.
export function ShopChips({ value, onSelect }: Props) {
  const shops = useStore((s) => s.shops);
  const options: { id: string | null; name: string }[] = [
    { id: null, name: DEFAULT_SHOP_LABEL },
    ...shops.map((s) => ({ id: s.id, name: s.name })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((s) => {
        const active = (value ?? null) === s.id;
        return (
          <button
            key={s.id ?? 'default'}
            onClick={() => onSelect(s.id)}
            aria-pressed={active}
            className={`min-h-11 rounded-pill border px-3 text-meta font-semibold ${
              active ? 'border-transparent bg-brand text-on-brand' : 'border-line text-ink'
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
