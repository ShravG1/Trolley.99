-- =============================================================================
-- Let any member tick an item off before a shop has started — not just the
-- active shopper mid-shop.
--
-- 0013's items_update WITH CHECK only allowed the three shopping ACTIONS
-- (bought / substituted / not_found) while the trip was 'shopping' AND the
-- caller was its shopper — correct while shop mode was the only place items
-- got marked bought, but it also blocked the mundane case of ticking
-- something off the list at home before anyone's gone to the shop (you
-- already have it in the cupboard, someone brought it back separately, etc).
-- The client mirror is `canMarkBought` (src/lib/rules.ts) and the affordance
-- itself (swipe/tap in ItemRow.tsx) was already generic across List and
-- Shopping density — it was purely the RLS gate (and its client mirror)
-- keeping it Shopping-mode-only.
--
-- New rule: the action is allowed when EITHER
--   (a) the trip is 'shopping' and the caller is its shopper (unchanged —
--       keeps shop-mode single-shopper exclusivity: two people can't race
--       ticks mid-shop), OR
--   (b) the trip is 'active' (nobody's started shopping yet), the caller is a
--       group member, AND the resulting status is specifically 'bought' (new
--       — anyone can tick something off while planning).
--
-- Deliberately narrower than "any of the three shopping actions": 'substituted'
-- and 'not_found' stay shopping-mode-only even after this migration, because
-- both presuppose someone's actually at the shop looking for the item —
-- "not found" or "substituted" before a shop has even started doesn't mean
-- anything. Only 'bought' (you already have it, it turned up another way) makes
-- sense to allow while planning. The client mirrors this split as two
-- functions in src/lib/rules.ts: `canMarkBought` (widened) and the untouched
-- `canActOnItem` (kept shopping-only, now used for Substitute/Not-found only).
--
-- A 'completed' trip's items are historical and stay unreachable either way
-- (neither disjunct matches), matching today's behaviour. Audit-stamp
-- integrity (clause a in 0013 — unstamped, or stamped by yourself) is
-- untouched. Safe to re-run: drop-then-create, same as 0013.
-- =============================================================================

drop policy if exists items_update on items;
create policy items_update on items
  for update
  using (is_member(trip_group(trip_id)))
  with check (
    is_member(trip_group(trip_id))
    -- audit-stamp integrity: unstamped, or stamped by you (0013a, unchanged)
    and (
      (acted_by is null and acted_by_name is null)
      or acted_by = auth.uid()
    )
    -- shopping actions: the shopper mid-shop for any of the three; a plain
    -- 'bought' tick is additionally allowed for any member before a shop starts.
    -- `items.status` is qualified inside the subquery on purpose: unqualified
    -- `status` there resolves against `trips t` (which has its own `status`
    -- column of a different enum) rather than the outer items row being
    -- checked — an easy, silent mis-scope otherwise.
    and (
      status not in ('bought', 'substituted', 'not_found')
      or exists (
        select 1 from trips t
        where t.id = trip_id
          and (
            (t.status = 'shopping' and t.shopper_id = auth.uid())
            or (t.status = 'active' and items.status = 'bought')
          )
      )
    )
  );
