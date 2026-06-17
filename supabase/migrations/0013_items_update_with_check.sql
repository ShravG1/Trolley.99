-- =============================================================================
-- items_update WITH CHECK — close the audit-stamp + action-window gap (#13).
--
-- 0008 column-scoped the items UPDATE grant so a crafted PostgREST call can't
-- overwrite added_by / added_by_name — but the protection was asymmetric:
--   1. acted_by / acted_by_name ARE client-writable (they're action stamps), and
--      the items_update policy had ONLY `using (is_member(...))` and NO
--      `with check`. Nothing forced acted_by = auth.uid(), so a member could
--      PATCH an item stamped `acted_by_name = 'Mum'` — forging the other half of
--      the audit trail 0008 set out to protect.
--   2. Item actions (bought / substituted / not_found) went through the plain
--      membership check, so a non-shopper, or a member while the trip was still
--      'active', could mark items bought server-side — the UI prevents it, the DB
--      did not, contradicting "the DB is the bouncer" (§6.2/§7) for this one rule.
--
-- This adds the missing WITH CHECK. It mirrors the items_insert window logic and
-- is written to permit EVERY legitimate client write while blocking the forgeries:
--
--   (a) Audit-stamp integrity. The resulting row must be either UNSTAMPED
--       (acted_by AND acted_by_name both null — a pending item being edited during
--       planning, or a bin being undone via restore, which sets both to null) OR
--       stamped by the caller themselves (acted_by = auth.uid()). So you can no
--       longer set acted_by_name = 'Mum' without owning the matching uid, and you
--       can't mutate a row another member has stamped. NOTE: WITH CHECK validates
--       the *resulting row*, not just the patched columns — this clause is true for
--       every legit final state (plain name/qty/note/unit/urgency edits leave a
--       pending item's stamps null; markBought/substitute/markNotFound/deleteItem
--       stamp acted_by = self; restoreItem clears both).
--
--   (b) Action window. The three shopping ACTIONS (bought / substituted /
--       not_found) are only allowed while the trip is 'shopping' AND the caller is
--       its shopper — mirroring start_shopping's single-shopper claim and the UI's
--       own gate (lib/rules.ts). List-management transitions stay open to any
--       member in either state: 'deleted' (you can bin an item while planning) and
--       'pending' (restore / undo), plus all the non-status edits.
--
-- Defence-in-depth, intra-group only: cross-household isolation was never affected
-- (the pgTAP suite already proves it). Safe to re-run: drop-then-create.
-- =============================================================================

drop policy if exists items_update on items;
create policy items_update on items
  for update
  using (is_member(trip_group(trip_id)))
  with check (
    is_member(trip_group(trip_id))
    -- (a) audit-stamp integrity: unstamped, or stamped by you
    and (
      (acted_by is null and acted_by_name is null)
      or acted_by = auth.uid()
    )
    -- (b) shopping actions only by the shopper, only while shopping
    and (
      status not in ('bought', 'substituted', 'not_found')
      or exists (
        select 1 from trips t
        where t.id = trip_id
          and t.status = 'shopping'
          and t.shopper_id = auth.uid()
      )
    )
  );
