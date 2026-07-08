import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { DEFAULT_SHOP_LABEL } from '@/lib/activeShop';
import { groupForList, groupForShopping, counts } from '@/lib/grouping';
import { isShopStale, lastActivity, canMarkBought } from '@/lib/rules';
import { withViewTransition } from '@/lib/viewTransition';
import { viewerNames } from '@/lib/presence';
import { markEnteredList } from '@/lib/landing';
import { serverNow } from '@/lib/serverTime';
import { useOnline } from '@/lib/useOnline';
import type { Item } from '@/types/models';

import { ItemRow } from '@/components/ItemRow';
import { AisleHeader } from '@/components/AisleHeader';
import { ShopTabs } from '@/components/ShopTabs';
import { AddSheet } from '@/components/AddSheet';
import { ItemSheet } from '@/components/ItemSheet';
import { ItemMenuSheet } from '@/components/ItemMenuSheet';
import { CartLoader } from '@/components/CartLoader';
import { StartShoppingSheet } from '@/components/StartShoppingSheet';
import { PrimaryPill } from '@/components/PrimaryPill';
import { ProgressBar } from '@/components/ProgressBar';
import { CountdownBar } from '@/components/CountdownBar';
import { ModeBanner } from '@/components/ModeBanner';
import { BottomSheet } from '@/components/BottomSheet';
import { PresenceLine } from '@/components/PresenceLine';
import { EmptyState } from '@/components/EmptyState';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PlusIcon, GearIcon, BinIcon, ChevronDownIcon } from '@/components/icons';

export function Home() {
  const items = useStore((s) => s.items);
  const trip = useStore((s) => s.trip);
  const shops = useStore((s) => s.shops);
  const activeShopId = useStore((s) => s.activeShopId);
  const mode = useStore((s) => s.mode());
  const shopperName = useStore((s) => s.shopperName());
  const userId = useStore((s) => s.userId);
  const members = useStore((s) => s.members);
  const viewers = useStore((s) => s.viewers);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const switching = useStore((s) => s.switching);
  // Select actions individually (stable refs) rather than destructuring the whole
  // store — otherwise Home re-renders on every unrelated mutation (toasts,
  // viewers, multi-add count, …), not just the slices it reads.
  const markBought = useStore((s) => s.markBought);
  const restoreItem = useStore((s) => s.restoreItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const cancelShopping = useStore((s) => s.cancelShopping);
  const finishTrip = useStore((s) => s.finishTrip);
  const takeOverShopping = useStore((s) => s.takeOverShopping);
  const remote = useStore((s) => s.remote);
  const online = useOnline();
  // Item adds/ticks queue offline and replay (the offline queue). Trip lifecycle
  // (start/cancel/finish/take-over) still needs the network — but only with a real
  // backend; demo mode runs these locally, so don't block it. Surface the limit at
  // the control rather than letting the action fail with a misleading toast.
  const lifecycleBlocked = !online && remote != null;

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [menuItem, setMenuItem] = useState<Item | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
  // Re-evaluate staleness on a timer so "Take over" / "Still shopping?" appear
  // without needing a manual refresh (§2.6).
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // Once a list is on screen, remember we've entered one so "/" doesn't bounce
  // back to the lists overview mid-session (§12).
  useEffect(() => {
    markEnteredList();
  }, []);

  // Publish the bottom action bar's height as a CSS var so toasts can sit just
  // above it instead of overlapping the Finish/Add controls (§3). Reset on
  // unmount so other screens (no bar) get their toasts back at the bottom.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      root.style.setProperty('--bottom-bar-h', `${el.offsetHeight}px`);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--bottom-bar-h');
    };
  }, []);

  // Brief loading state while a group switch's snapshot lands (§12) — avoids
  // flashing the previous group's list or a misleading "empty" state.
  if (switching) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <CartLoader caption="Loading…" />
      </div>
    );
  }

  // Scope the view to the shop tab in focus (#19): every count/section below is
  // about the selected shop's trip. Other shops' items stay in the store (for the
  // tab badges) but never render here.
  const viewItems = items.filter((i) => i.trip_id === trip.id);
  const { total, done } = counts(viewItems);
  // Active group, for the header switcher (§12). Absent in demo mode (no backend).
  const activeGroup = groups.find((g) => g.group_id === activeGroupId);
  // Which shop tab is in view (#19) — only meaningful once the household has
  // shops; null shop = the default "General" list. Used to name the shop in the
  // shopping header + empty state so it's clear which shop you're in/shopping.
  const shopName = shops.length > 0 ? (shops.find((s) => s.id === activeShopId)?.name ?? DEFAULT_SHOP_LABEL) : null;
  // Who's live on the list right now — minus yourself, and (in spectator view)
  // the shopper, who's already named by the banner (§6.4).
  const watching = viewerNames(viewers, members, [userId, trip.shopper_id ?? userId]);
  // Judge the window/staleness against server time, not the device clock (§6.5).
  const stale = isShopStale(trip, lastActivity(trip, viewItems), serverNow());
  const unbought = viewItems.filter((i) => i.status === 'pending' || i.status === 'not_found').length;
  const binnedCount = viewItems.filter((i) => i.status === 'deleted').length;

  const windowOpen = trip.lastminute_until ? new Date(trip.lastminute_until).getTime() > serverNow() : false;
  // Spectators (and the shopper's helpers) can only add while the window is open (§7.2).
  const canAdd = mode === 'list' || (mode === 'spectator' && windowOpen);

  // The kebab opens the quick menu (move-between-shops + edit) when there are
  // shops to move between and the item's still live; otherwise it goes straight
  // to the full edit sheet, so a household with no shops sees no change (#19).
  const openMenu = (item: Item) => {
    const movable = item.status === 'pending' || item.status === 'not_found';
    if (movable && shops.length > 0) setMenuItem(item);
    else setEditItem(item);
  };

  // Marking bought is a shopping action the DB only allows the active shopper
  // (RLS 0013). Offering it in List mode ticks optimistically, then the queued
  // write is dropped as un-saveable and the reload rolls it back — the "swipe to
  // buy just loops" bug. Gate the affordance to Shopping mode and nudge otherwise.
  const canBuy = canMarkBought(trip, userId);
  const onBuyBlocked = () => {
    const { toasts, pushToast } = useStore.getState();
    const msg = 'Start shopping first to tick things off.';
    // De-dupe: repeated swipes shouldn't stack identical nudges.
    if (!toasts.some((t) => t.message === msg)) pushToast(msg);
  };

  const rowProps = {
    canBuy,
    onBought: markBought,
    onUndo: restoreItem,
    onEdit: setEditItem,
    onMenu: openMenu,
    onDelete: deleteItem,
    onBuyBlocked,
  };

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-40">
      {/* Spectator banner */}
      {mode === 'spectator' && shopperName && <ModeBanner shopperName={shopperName} />}

      {/* Last-minute window countdown — the shopper sees how long the window stays
          open; spectators see how long they can still chuck things on. */}
      {(mode === 'shopping' || mode === 'spectator') && windowOpen && trip.lastminute_until && (
        <CountdownBar until={trip.lastminute_until} />
      )}

      {/* Header */}
      <header className="flex items-start justify-between px-4 pb-1 pt-5">
        <div className="min-w-0">
          {groups.length > 0 && activeGroup && (
            <Link
              to="/lists"
              aria-label={`Current list: ${activeGroup.name}. Tap to switch list`}
              className="-ml-1 mb-1 flex min-h-11 max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface-2 px-3 text-meta font-semibold text-ink shadow-e1 active:bg-surface"
            >
              <span className="truncate">{activeGroup.name}</span>
              <ChevronDownIcon size={18} className="shrink-0 text-ink-soft" />
            </Link>
          )}
          <h1 className="font-display text-display-l text-ink">
            {mode === 'list' ? 'The List' : `${shopperName === membersName(userId, members) ? 'Your' : `${shopperName}’s`} shop`}
            {mode !== 'list' && shopName && <span className="text-ink-soft"> · {shopName}</span>}
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-meta text-ink-soft">
              {mode === 'list' ? `${total} ${total === 1 ? 'thing' : 'things'}` : `${done} of ${total} done`}
            </p>
            {binnedCount > 0 && (
              <Link
                to="/archive"
                className="-my-1 flex min-h-11 items-center gap-1 rounded-pill border border-line px-2.5 text-meta text-ink-soft active:bg-surface-2"
                aria-label={`${binnedCount} binned this trip`}
              >
                <BinIcon size={14} /> {binnedCount}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid h-11 w-11 place-items-center rounded-pill text-ink-soft hover:bg-surface-2"
          >
            <GearIcon />
          </Link>
        </div>
      </header>

      {/* Shop tabs (#19) — switch between shops; each runs its own trip. */}
      <ShopTabs />

      {/* Live "who's looking" in every mode — incl. the shopper, who sees who's watching. */}
      <PresenceLine names={watching} />

      {/* Overall progress in shop modes */}
      {mode !== 'list' && (
        <div className="px-4 pt-2">
          <ProgressBar done={done} total={total} slim />
        </div>
      )}

      {/* Body */}
      {total === 0 ? (
        shopName ? (
          <EmptyState
            line={`Nothing in ${shopName} yet.`}
            sub={mode === 'list' ? 'Add something below, or switch shops up top.' : undefined}
          />
        ) : (
          <EmptyState line="Nothing on the list. Living dangerously." />
        )
      ) : mode === 'list' ? (
        <ListBody items={viewItems} {...rowProps} />
      ) : (
        <ShoppingBody items={viewItems} readOnly={mode === 'spectator'} {...rowProps} />
      )}

      {/* Bottom controls */}
      <div ref={barRef} className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md space-y-3 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-6">
        {mode === 'list' && (
          <>
            {/* Starting a shop with nothing on the list is a no-op — only offer it
                once there's something to buy. */}
            {total > 0 && (
              <PrimaryPill
                onClick={() => setStartOpen(true)}
                disabled={lifecycleBlocked}
                disabledHint="Offline — connect to start a shop"
              >
                I’m going shopping
              </PrimaryPill>
            )}
            <AddBar onClick={() => setAddOpen(true)} />
          </>
        )}

        {mode === 'shopping' && (
          <>
            {stale && !lifecycleBlocked && (
              <div className="rounded-md bg-urgent-tint px-4 py-2 text-center text-meta font-semibold text-urgent">
                Still shopping? Tick something or finish the trip so the others aren’t left waiting.
              </div>
            )}
            {lifecycleBlocked ? (
              // Ticking items still works offline (it queues); finishing/cancelling
              // the trip is a server transition, so explain rather than fail.
              <div className="rounded-md bg-surface-2 px-4 py-2 text-center text-meta font-semibold text-ink-soft">
                Offline — keep ticking items; finish or cancel the trip when you’re back.
              </div>
            ) : (
              <div className="flex gap-2">
                <PrimaryPill variant="neutral" onClick={() => withViewTransition(cancelShopping)}>
                  Cancel
                </PrimaryPill>
                <PrimaryPill
                  onClick={() => {
                    // Be smart: only ask if there's something un-ticked to lose.
                    if (unbought > 0) setFinishConfirm(true);
                    else withViewTransition(finishTrip);
                  }}
                >
                  Finish the trip
                </PrimaryPill>
              </div>
            )}
          </>
        )}

        {mode === 'spectator' && (
          stale ? (
            <PrimaryPill
              onClick={() => withViewTransition(takeOverShopping)}
              disabled={lifecycleBlocked}
              disabledHint="Offline — connect to take over"
            >
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
      <ItemMenuSheet
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onEditDetails={(it) => {
          setMenuItem(null);
          setEditItem(it);
        }}
      />
      <StartShoppingSheet open={startOpen} onClose={() => setStartOpen(false)} />

      {/* Smart finish confirmation — only when there's something un-ticked to lose.
          Via BottomSheet for focus-trap + Escape/restore; autofocus the safe option. */}
      <BottomSheet
        open={finishConfirm}
        onClose={() => setFinishConfirm(false)}
        title={`Finish with ${unbought} un-ticked?`}
      >
        <p className="text-body text-ink-soft">
          {done > 0 ? `${done} ticked off. ` : ''}
          The {unbought === 1 ? 'one you haven’t' : `${unbought} you haven’t`} ticked will roll over to the next list, so nothing’s lost.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            data-autofocus
            onClick={() => setFinishConfirm(false)}
            className="min-h-12 flex-1 rounded-pill border border-line font-semibold text-ink"
          >
            Keep shopping
          </button>
          <button
            onClick={() => {
              setFinishConfirm(false);
              withViewTransition(finishTrip);
            }}
            className="min-h-12 flex-1 rounded-pill bg-brand font-semibold text-on-brand"
          >
            Finish anyway
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function membersName(userId: string, members: { user_id: string; display_name: string }[]) {
  return members.find((m) => m.user_id === userId)?.display_name;
}

interface BodyProps {
  items: Item[];
  readOnly?: boolean;
  canBuy: boolean;
  onBought: (id: string) => void;
  onUndo: (id: string) => void;
  onEdit: (item: Item) => void;
  onMenu: (item: Item) => void;
  onDelete: (id: string) => void;
  onBuyBlocked?: () => void;
}

function ListBody({ items, ...props }: BodyProps) {
  const { urgent, groups } = groupForList(items);

  return (
    <div className="px-0">
      {urgent.length > 0 && (
        <section className="anim-urgent-flash">
          <div className="px-4 pb-1 pt-4 text-aisle font-semibold text-urgent">
            Urgent <span className="text-ink-faint">{urgent.length}</span>
          </div>
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

function ShoppingBody({ items, readOnly, ...props }: BodyProps) {
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
