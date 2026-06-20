import { BottomSheet } from './BottomSheet';
import { ShopChips } from './ShopChips';
import { useStore } from '@/store/useStore';
import type { Item } from '@/types/models';

interface Props {
  item: Item | null;
  onClose: () => void;
  onEditDetails: (item: Item) => void;
}

// ItemMenuSheet (#19) — the row kebab's quick menu. Its headline job is moving an
// item between shops without wading through the full edit sheet: tap a shop chip
// and it's moved. "Edit details…" hands off to the full ItemSheet for everything
// else (rename, note, aisle, substitute, delete). Only shown when there are shops
// to move between and the item is still live — otherwise the kebab opens the full
// sheet directly (see Home).
export function ItemMenuSheet({ item, onClose, onEditDetails }: Props) {
  const allTrips = useStore((s) => s.allTrips);
  const moveItem = useStore((s) => s.moveItem);

  if (!item) return null;

  const currentShopId = allTrips.find((t) => t.id === item.trip_id)?.shop_id ?? null;

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item.name}>
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-2 block text-item text-ink">Move to a shop</span>
          <ShopChips
            value={currentShopId}
            onSelect={(id) => {
              if (id !== currentShopId) moveItem(item.id, id);
              onClose();
            }}
          />
        </div>
        <button
          onClick={() => onEditDetails(item)}
          className="min-h-12 rounded-pill border border-line font-semibold text-ink active:bg-surface-2"
        >
          Edit details…
        </button>
      </div>
    </BottomSheet>
  );
}
