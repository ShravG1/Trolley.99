-- =============================================================================
-- RLS policy tests [Critical] (§14).
--
-- Proves User A cannot read or write User B's group across every table, and that
-- join_group only works with a valid, unexpired code. This is the single most
-- important suite — a passing RLS test is what lets you sleep (§14).
--
-- Run with pgTAP against a shadow/test database:
--   supabase test db
-- (or: psql -f supabase/tests/rls_test.sql)
-- =============================================================================
begin;
create extension if not exists pgtap;
select plan(17);

-- --- Fixtures -------------------------------------------------------------
-- Two users, two groups. We impersonate each by setting the JWT claims that
-- Supabase's auth.uid() reads.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test'),
  ('22222222-2222-2222-2222-222222222222', 'b@test')
on conflict do nothing;

create or replace function act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;$$;

-- Build group A (owned by user A) and group B (owned by user B) via the RPC so
-- members + an active trip are created the way the app does it.
select set_config('role', 'authenticated', true);
select act_as('11111111-1111-1111-1111-111111111111');
select create_group('Group A', 'Anna') as gid_a \gset
select act_as('22222222-2222-2222-2222-222222222222');
select create_group('Group B', 'Ben') as gid_b \gset

-- A's active trip + an item on it.
select act_as('11111111-1111-1111-1111-111111111111');
insert into items (id, trip_id, name, added_by, added_by_name)
  select gen_random_uuid(), id, 'A milk', '11111111-1111-1111-1111-111111111111', 'Anna'
  from trips where group_id = :'gid_a';

-- --- Cross-group READ isolation ------------------------------------------
select act_as('22222222-2222-2222-2222-222222222222');

select is(
  (select count(*) from groups where id = :'gid_a')::int, 0,
  'B cannot read A''s group row');

select is(
  (select count(*) from trips where group_id = :'gid_a')::int, 0,
  'B cannot read A''s trips');

select is(
  (select count(*) from items i join trips t on t.id = i.trip_id where t.group_id = :'gid_a')::int, 0,
  'B cannot read A''s items');

select is(
  (select count(*) from group_members where group_id = :'gid_a')::int, 0,
  'B cannot read A''s membership rows');

select is(
  (select count(*) from invites where group_id = :'gid_a')::int, 0,
  'B cannot read A''s invites');

-- --- Cross-group WRITE isolation -----------------------------------------
-- Grab A's real trip id (impersonating A so RLS lets us read it), then attack as B.
select act_as('11111111-1111-1111-1111-111111111111');
select id as trip_a from trips where group_id = :'gid_a' limit 1 \gset
select act_as('22222222-2222-2222-2222-222222222222');

-- Even with A's trip id leaked, the items WITH CHECK blocks the insert (42501).
-- (NULL errmsg => match on the SQLSTATE only, not the exact message text.)
select throws_ok(
  format($$ insert into items (id, trip_id, name, added_by, added_by_name)
            values (gen_random_uuid(), %L, 'sneaky', '22222222-2222-2222-2222-222222222222', 'Ben') $$, :'trip_a'),
  '42501', NULL,
  'B cannot write an item into A''s trip even with the trip id');

select is(
  (select count(*) from items where name = 'sneaky')::int, 0,
  'no sneaky row landed');

-- Direct trip writes are revoked entirely (migration 0008): every meaningful
-- transition goes through a SECURITY DEFINER RPC, so no client may UPDATE a trip
-- row directly. The grant layer rejects it (42501) before RLS is even consulted.
select throws_ok(
  format($$ update trips set status = 'shopping' where id = %L $$, :'trip_a'),
  '42501', NULL,
  'a client cannot UPDATE a trip row directly (transitions are RPC-only)');

-- B cannot self-insert into A's membership (no client insert grant; RPC only).
select throws_ok(
  format($$ insert into group_members (group_id, user_id, display_name)
            values (%L, '22222222-2222-2222-2222-222222222222', 'Intruder') $$, :'gid_a'),
  '42501', NULL,
  'B cannot insert themselves into A''s group (join is RPC-only)');

-- --- join_group: valid vs expired vs bogus codes -------------------------
-- A mints two invites for group A: one live, one already expired.
select act_as('11111111-1111-1111-1111-111111111111');
insert into invites (group_id, code, token, expires_at, created_by) values
  (:'gid_a', 'LIVE1234', 'live-token', now() + interval '7 days', '11111111-1111-1111-1111-111111111111'),
  (:'gid_a', 'DEAD1234', 'dead-token', now() - interval '1 day',  '11111111-1111-1111-1111-111111111111');

-- B joins with a bogus code → error.
select act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$ select join_group('NOPE0000', 'Ben') $$, null, 'bogus code is rejected');

-- B joins with the expired code → error.
select throws_ok($$ select join_group('DEAD1234', 'Ben') $$, null, 'expired code is rejected');

-- B joins with the live code → success, and can now read the group.
select lives_ok($$ select join_group('LIVE1234', 'Ben') $$, 'valid live code lets B join');

select is(
  (select count(*) from groups where id = :'gid_a')::int, 1,
  'after joining, B can read A''s group');

-- --- items_update WITH CHECK: audit stamp + action window (#13) ----------
-- A and B are now BOTH members of group A (B joined above). Set up a pending
-- item on A's trip, have A claim the shop, then probe the new policy from both
-- sides. These are intra-group: same household, trusted-but-not-omnipotent.
select act_as('11111111-1111-1111-1111-111111111111');
select id as sh_trip from trips where group_id = :'gid_a' and status = 'active' limit 1 \gset
-- A fresh pending item to probe against (independent of the cross-isolation fixtures).
insert into items (id, trip_id, name, quantity, category, priority, status,
                   added_by, added_by_name)
  values (gen_random_uuid(), :'sh_trip', 'Probe item', 1, 'other', 'normal', 'pending',
          '11111111-1111-1111-1111-111111111111', 'Anna');
select id as probe from items where trip_id = :'sh_trip' and name = 'Probe item' limit 1 \gset
select start_shopping(:'sh_trip', 0);  -- A is now the shopper

-- (b) A non-shopper member (B) cannot mark an item bought server-side.
select act_as('22222222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ update items set status = 'bought',
            acted_by = '22222222-2222-2222-2222-222222222222', acted_by_name = 'Ben'
            where id = %L $$, :'probe'),
  '42501', NULL,
  'a non-shopper member cannot mark an item bought (#13b)');

-- (a) A member cannot forge the acted stamp as someone else.
select throws_ok(
  format($$ update items set acted_by_name = 'Mum' where id = %L $$, :'probe'),
  '42501', NULL,
  'a member cannot forge acted_by_name without owning acted_by (#13a)');

-- Positive control: the shopper (A) CAN legitimately mark it bought — the policy
-- must not over-reject the real action path.
select act_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ update items set status = 'bought',
            acted_by = '11111111-1111-1111-1111-111111111111', acted_by_name = 'Anna',
            acted_at = now() where id = %L $$, :'probe'),
  'the shopper can mark an item bought (#13 — no over-reject)');

-- Positive control: a plain planning edit (qty) on an unstamped pending item still
-- works for any member — the audit-stamp clause must not block non-action edits.
insert into items (id, trip_id, name, quantity, category, priority, status,
                   added_by, added_by_name)
  values (gen_random_uuid(), :'sh_trip', 'Edit me', 1, 'other', 'normal', 'pending',
          '11111111-1111-1111-1111-111111111111', 'Anna');
select id as editable from items where trip_id = :'sh_trip' and name = 'Edit me' limit 1 \gset
select lives_ok(
  format($$ update items set quantity = 3 where id = %L $$, :'editable'),
  'a plain qty edit on a pending item still works (#13 — no over-reject)');

select * from finish();
rollback;
