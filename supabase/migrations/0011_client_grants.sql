-- =============================================================================
-- Base table privileges for the `authenticated` role.
--
-- RLS decides WHICH ROWS a signed-in user may touch, but it can only do so once
-- the role also holds the table-level privilege for the operation. On hosted
-- Supabase those base GRANTs are handed out implicitly (the platform grants the
-- API roles access to the public schema), which is why earlier migrations could
-- assume them — e.g. 0008 REVOKEs UPDATE on items/trips, which only makes sense
-- if it had been granted. The local / CI stack (`supabase db reset`) does NOT
-- replicate that implicit grant, so a from-scratch database has the schema and
-- policies but no base privileges: even a legitimate insert then fails with
-- "permission denied for table …", and the RLS test suite (§14) can't run.
--
-- Make the grants explicit so the database is self-contained and CI matches
-- production. Each grant mirrors the table's RLS policy surface; writes that are
-- intentionally locked down stay locked down:
--   * items          — UPDATE is column-scoped in 0008/0009 (audit fields stay
--                       protected); we do NOT grant table-wide UPDATE here, and
--                       there is no DELETE policy, so no DELETE.
--   * trips          — direct UPDATE is RPC-only (revoked in 0008); SELECT/INSERT
--                       only.
--   * group_members  — INSERT/UPDATE run through SECURITY DEFINER RPCs (join /
--                       rename); clients only SELECT and self-DELETE (leave).
--   * join_attempts  — deliberately left ungranted (RLS on, no policies; only the
--                       definer-owned guard touches it).
--
-- On production these are effectively no-ops (the privileges already exist) and
-- nothing is revoked, so applying this migration is safe.
-- =============================================================================

grant select, insert, update, delete on groups             to authenticated;
grant select, delete                 on group_members      to authenticated;
grant select, insert, delete         on invites            to authenticated;
grant select, insert                 on trips              to authenticated;
grant select, insert                 on items              to authenticated;
grant select, insert, update, delete on recurring_items    to authenticated;
grant select                         on hot_list           to authenticated;
grant select, insert, update, delete on push_subscriptions to authenticated;
grant insert                         on feedback           to authenticated;
