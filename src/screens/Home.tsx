import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { groupForList, groupForShopping, counts } from '@/lib/grouping';
import { isShopStale, lastActivity } from '@/lib/rules';
import { withViewTransition } from '@/lib/viewTransition';
import type { Item } from '@/types/models';

import { ItemRow } from '@/components/ItemRow';
import { AisleHeader } from '@/components/AisleHeader';
import { AddSheet } from '@/components/AddSheet';
import { ItemSheet } from '@/components/ItemSheet';
import { StartShoppingSheet } from '@/components/StartShoppingSheet';
import { PrimaryPill } from '@/components/PrimaryPill';
import { ProgressBar } from '@/components/ProgressBar';
import { CountdownBar } from '@/components/CountdownBar';
import { ModeBanner } from '@/components/ModeBanner';
import { PresenceLine } from '@/components/PresenceLine';
import { EmptyState } from '@/components/EmptyState';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PlusIcon, KebabIcon } from '@/components/icons';

export function Home() {
  const items = useStore((s) => s.items);
  const trip = useStore((s) => s.trip);
  const mode = useStore((s) => s.mode());
  const shopperName = useStore((s) => s.shopperName());
  const userId = useStore((s) => s.userId);
  const members = useStore((s) => s.members);
  const { markBought, deleteItem, cancelShopping, finishTrip, takeOverShopping } = useStore();

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  // Re-evaluate staleness on a timer so "Take over" / "Still shopping?" appear
  // without needing a manual refresh (§2.6).
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { total, done } = counts(items);
  const others = members.filter((m) => m.user_id !== userId);
  const stale = isShopStale(trip, lastActivity(trip, items), Date.now());

  const windowOpen = trip.lastminute_until ? new Date(trip.lastminute_until).getTime() > Date.now() : false;
  // Spectators (and the shopper's helpers) can only add while the window is open (§7.2).
  const canAdd = mode === 'list' || (mode === 'spectator' && windowOpen);

  const rowProps = {
    onBought: markBought,
    onEdit: setEditItem,
    onMenu: setEditItem,
    onDelete: deleteItem,
  };

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-40">
      {/* Spectator banner */}
      {mode === 'spectator' && shopperName && <ModeBanner shopperName={shopperName} />}

      {/* Shopper countdown */}
      {mode === 'shopping' && windowOpen && trip.lastminute_until && (
        <CountdownBar until={trip.lastminute_until} />
      )}

      {/* Header */}
      <header className="flex items-start justify-between px-4 pb-1 pt-5">
        <div>
          <h1 className="font-display text-display-l text-ink">
            {mode === 'list' ? 'The List' : `${shopperName === membersName(userId, members) ? 'Your' : `${shopperName}’s`} shop`}
          </h1>
          <p className="text-meta text-ink-soft">
            {mode === 'list' ? `${total} ${total === 1 ? 'thing' : 'things'}` : `${done} of ${total} done`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid h-11 w-11 place-items-center rounded-pill text-ink-soft hover:bg-surface-2"
          >
            <KebabIcon />
          </Link>
        </div>
      </header>

      {mode === 'list' && <PresenceLine names={others.map((m) => m.display_name)} />}

      {/* Overall progress in shop modes */}
      {mode !== 'list' && (
        <div className="px-4 pt-2">
          <ProgressBar done={done} total={total} slim />
        </div>
      )}

      {/* Body */}
      {total === 0 ? (
        <EmptyState line="Nothing on the list. Living dangerously." />
      ) : mode === 'list' ? (
        <ListBody {...rowProps} />
      ) : (
        <ShoppingBody readOnly={mode === 'spectator'} {...rowProps} />
      )}

      {/* Bottom controls */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md space-y-3 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-6">
        {mode === 'list' && (
          <>
            <PrimaryPill
              onClick={() => setStartOpen(true)}
              disabled={false}
            >
              I’m going shopping
            </PrimaryPill>
            <AddBar onClick={() => setAddOpen(true)} />
          </>
        )}

        {mode === 'shopping' && (
          <>
            {stale && (
              <div className="rounded-md bg-urgent-tint px-4 py-2 text-center text-meta font-semibold text-urgent">
                Still shopping? Tick something or finish the trip so the others aren’t left waiting.
              </div>
            )}
            <div className="flex gap-2">
              <PrimaryPill variant="neutral" onClick={() => withViewTransition(cancelShopping)}>
                Cancel
              </PrimaryPill>
              <PrimaryPill
                onClick={() =>
                  withViewTransition(() => {
                    finishTrip();
                  })
                }
              >
                Finish the trip
              </PrimaryPill>
            </div>
          </>
        )}

        {mode === 'spectator' && (
          stale ? (
            <PrimaryPill onClick={() => withViewTransition(takeOverShopping)}>
              {shopperName} went quiet — take over the shop
            </PrimaryPill>
          ) : canAdd ? (
            <AddBar onClick={() => setAddOpen(true)} hint="Last-minute add" />
          ) : (
            <div className="rounded-pill bg-surface-2 px-6 py-3 text-center text-meta font-semibold text-ink-soft">
              List’s locked. They’re shopping.
            </div>
          )
        )}
      </div>

      {/* Sheets */}
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <ItemSheet item={editItem} onClose={() => setEditItem(null)} />
      <StartShoppingSheet open={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  );
}

function membersName(userId: string, members: { user_id: string; display_name: string }[]) {
  return members.find((m) => m.user_id === userId)?.display_name;
}

interface BodyProps {
  readOnly?: boolean;
  onBought: (id: string) => void;
  onEdit: (item: Item) => void;
  onMenu: (item: Item) => void;
  onDelete: (id: string) => void;
}

function ListBody(props: BodyProps) {
  const items = useStore((s) => s.items);
  const { urgent, groups } = groupForList(items);

  return (
    <div className="px-0">
      {urgent.length > 0 && (
        <section className="anim-urgent-flash">
          <div className="px-4 pb-1 pt-4 text-aisle font-semibold text-urgent">Urgent</div>
          {urgent.map((item) => (
            <ItemRow key={item.id} item={item} density="list" {...props} />
          ))}
        </section>
      )}
      {groups.map((g) => (
        <section key={g.aisle}>
          <AisleHeader aisle={g.aisle} count={g.total} variant="quiet" />
          {g.items.map((item) => (
            <ItemRow key={item.id} item={item} density="list" {...props} />
          ))}
        </section>
      ))}
    </div>
  );
}

function ShoppingBody({ readOnly, ...props }: BodyProps) {
  const items = useStore((s) => s.items);
  const groups = groupForShopping(items);

  return (
    <div className="pb-4">
      {groups.map((g) => (
        <section key={g.aisle}>
          <AisleHeader aisle={g.aisle} count={g.total} variant="loud" done={g.done} total={g.total} />
          {g.items.map((item) => (
            <ItemRow key={item.id} item={item} density="shopping" readOnly={readOnly} {...props} />
          ))}
        </section>
      ))}
    </div>
  );
}

function AddBar({ onClick, hint }: { onClick: () => void; hint?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-13 w-full items-center gap-3 rounded-pill border border-line bg-surface px-5 text-left text-ink-soft shadow-e1"
    >
      <PlusIcon className="text-brand" />
      <span className="text-item">{hint ?? 'Add something…'}</span>
    </button>
  );
}
