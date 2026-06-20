import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { useStore } from '@/store/useStore';
import { PlusIcon, BinIcon } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ManageShopsSheet (#19) — add a shop, rename one, or delete one. Deleting a shop
// moves its un-bought items back to Unsorted (handled server-side), so nothing on
// the list is lost.
export function ManageShopsSheet({ open, onClose }: Props) {
  const shops = useStore((s) => s.shops);
  const createShop = useStore((s) => s.createShop);
  const renameShop = useStore((s) => s.renameShop);
  const deleteShop = useStore((s) => s.deleteShop);

  const [name, setName] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function add() {
    const n = name.trim();
    if (!n) return;
    createShop(n);
    setName('');
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Shops">
      <div className="flex flex-col gap-4">
        <p className="text-meta text-ink-soft">
          Split the list into shops — each shop is its own tab you can shop separately.
        </p>

        {/* Add a shop */}
        <div className="flex gap-2">
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="e.g. Tesco, the chemist…"
            maxLength={40}
            className="min-w-0 flex-1 rounded-xs border border-line bg-surface-2 px-4 py-3 text-item text-ink placeholder:text-ink-faint focus:border-brand"
          />
          <button
            onClick={add}
            disabled={!name.trim()}
            aria-label="Add shop"
            className="flex shrink-0 items-center gap-1.5 rounded-pill bg-brand px-4 font-semibold text-on-brand disabled:opacity-40"
          >
            <PlusIcon size={18} /> Add
          </button>
        </div>

        {/* Existing shops */}
        {shops.length > 0 && (
          <ul className="flex flex-col gap-2">
            {shops.map((shop) => (
              <li key={shop.id} className="rounded-md bg-surface-2 p-2">
                <div className="flex items-center gap-2">
                  <input
                    defaultValue={shop.name}
                    onBlur={(e) => {
                      const n = e.target.value.trim();
                      if (n && n !== shop.name) renameShop(shop.id, n);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    maxLength={40}
                    aria-label={`Rename ${shop.name}`}
                    className="min-w-0 flex-1 rounded-xs border border-transparent bg-transparent px-2 py-2 text-item text-ink focus:border-line focus:bg-surface"
                  />
                  <button
                    onClick={() => setConfirmId(confirmId === shop.id ? null : shop.id)}
                    aria-label={`Delete ${shop.name}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-pill text-bin hover:bg-surface"
                  >
                    <BinIcon size={18} />
                  </button>
                </div>
                {confirmId === shop.id && (
                  <div className="mt-1 flex items-center gap-2 px-2 pb-1">
                    <span className="min-w-0 flex-1 text-meta text-ink-soft">
                      Delete this shop? Its un-bought items move to Unsorted.
                    </span>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="min-h-9 shrink-0 rounded-pill border border-line px-3 text-meta font-semibold text-ink"
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => {
                        deleteShop(shop.id);
                        setConfirmId(null);
                      }}
                      className="min-h-9 shrink-0 rounded-pill bg-bin px-3 text-meta font-semibold text-white"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
