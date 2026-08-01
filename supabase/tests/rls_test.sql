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
select plan(63);

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

-- A names a shop in group A (per-shop tabs, #19). create_shop also opens the
-- shop's first active trip — so group A now has TWO active trips (Unsorted + the
-- shop's), which is why the rollover/probe lookups below pin `shop_id is null`.
select create_shop(:'gid_a', 'Tesco') as shop_a \gset
-- A's item id, for the cross-group move-isolation check below (captured while it
-- still lives on the original Unsorted trip, before the #11 rollover renames it).
select i.id as item_a from items i join trips t on t.id = i.trip_id
  where t.group_id = :'gid_a' and i.name = 'A milk' limit 1 \gset

-- Additional fixtures for the five tables with no previous isolation assertions
-- (push_subscriptions, recurring_items, hot_list, feedback, join_attempts — #38).
-- recurring_items: A creates one in group A (member-gated for all).
insert into recurring_items (group_id, name, default_qty, category, recurrence_rule)
  values (:'gid_a', 'Bread', 2, 'food', 'weekly');

-- push_subscriptions: A registers a push endpoint (own-row-only).
insert into push_subscriptions (user_id, endpoint, keys)
  values ('11111111-1111-1111-1111-111111111111',
          'https://push.example/a-endpoint',
          '{"auth":"aauthkey","p256dh":"ap256dh"}');

-- hot_list: seed one row as the superuser — only service_role / SECURITY DEFINER
-- (complete_trip) may write this table; reset role mimics that context so we have
-- data to test read isolation before complete_trip has been called in this test.
reset role;
insert into hot_list (group_id, item_name, frequency) values (:'gid_a', 'breadcrumbs', 4);
select set_config('role', 'authenticated', true);

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

select is(
  (select count(*) from shops where group_id = :'gid_a')::int, 0,
  'B cannot read A''s shops (#19)');

-- Tables with no previous isolation assertions (#38).
select is(
  (select count(*) from recurring_items where group_id = :'gid_a')::int, 0,
  'B cannot read A''s recurring_items');

select is(
  (select count(*) from hot_list where group_id = :'gid_a')::int, 0,
  'B cannot read A''s hot_list');

select is(
  (select count(*) from push_subscriptions
    where user_id = '11111111-1111-1111-1111-111111111111')::int, 0,
  'B cannot read A''s push_subscriptions (own-row-only)');

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

-- B cannot create a shop in A's group — create_shop checks is_member (#19).
select throws_ok(
  format($$ select create_shop(%L, 'Hack') $$, :'gid_a'),
  NULL,
  'B cannot create a shop in A''s group (#19)');

-- B cannot move A's item, even with A's item id + shop id leaked (#19).
select throws_ok(
  format($$ select move_item_to_shop(%L, %L) $$, :'item_a', :'shop_a'),
  NULL,
  'B cannot move an item in A''s group (#19)');

-- Write-rejection assertions for the five previously-uncovered tables (#38).
select throws_ok(
  format($$ insert into recurring_items (group_id, name, default_qty, category, recurrence_rule)
            values (%L, 'Hack', 1, 'other', 'weekly') $$, :'gid_a'),
  '42501', NULL,
  'B cannot insert a recurring_item into A''s group');

select throws_ok(
  $$ insert into push_subscriptions (user_id, endpoint, keys)
     values ('11111111-1111-1111-1111-111111111111',
             'https://push.example/forge',
             '{"auth":"x","p256dh":"x"}') $$,
  '42501', NULL,
  'B cannot insert a push_subscription forging A''s user_id');

select throws_ok(
  format($$ insert into hot_list (group_id, item_name, frequency)
            values (%L, 'Hack', 1) $$, :'gid_a'),
  '42501', NULL,
  'B cannot INSERT into hot_list (only SELECT grant to authenticated)');

-- --- join_group: valid vs expired vs bogus codes -------------------------
-- Two invites for group A with known codes: one live, one already expired.
-- Seeded as the owner because 0017 revoked the client INSERT grant on invites
-- (create_invite is the only minter now, and it picks its own random code — no
-- good for a fixture that has to know the code). The revoke itself is asserted
-- further down.
select set_config('role', 'postgres', true);
insert into invites (group_id, code, token, expires_at, created_by) values
  (:'gid_a', 'LIVE1234', 'live-token', now() + interval '7 days', '11111111-1111-1111-1111-111111111111'),
  (:'gid_a', 'DEAD1234', 'dead-token', now() - interval '1 day',  '11111111-1111-1111-1111-111111111111');
select act_as('11111111-1111-1111-1111-111111111111');

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

-- --- invites_delete: any member may revoke, not just the creator (#37) ----
-- B is now a member of A but did NOT create these invites (A did). The revoke
-- policy is member-gated by design, so B can kill A's invite — this locks in
-- the intent the 0001 comment used to contradict (any-member-revoke, not
-- creator-only).
select lives_ok(
  $$ delete from invites where code = 'DEAD1234' $$,
  'a non-creator member can revoke an invite in their group (#37)');

select is(
  (select count(*) from invites where code = 'DEAD1234')::int, 0,
  'the revoked invite is actually gone (#37)');

-- --- complete_trip rollover preserves note + unit (#11) ------------------
-- A un-ticked item with a note + unit must carry both fields into the fresh
-- active trip — they were silently dropped before 0012. Done as A (the shopper)
-- so start_shopping / complete_trip run as a member of A's group.
select act_as('11111111-1111-1111-1111-111111111111');
select id as roll_trip from trips
  where group_id = :'gid_a' and status = 'active' and shop_id is null limit 1 \gset
insert into items (id, trip_id, name, quantity, category, priority, status,
                   added_by, added_by_name, note, unit)
  values (gen_random_uuid(), :'roll_trip', 'Olive oil', 1, 'other', 'normal', 'pending',
          '11111111-1111-1111-1111-111111111111', 'Anna',
          'get the own-brand one', '2 L');
select start_shopping(:'roll_trip', 0);
select complete_trip(:'roll_trip');

select is(
  (select count(*) from items i join trips t on t.id = i.trip_id
    where t.group_id = :'gid_a' and t.status = 'active'
      and i.name = 'Olive oil' and i.status = 'pending')::int, 1,
  'un-ticked item rolls over into the new active trip');

select is(
  (select note from items i join trips t on t.id = i.trip_id
    where t.group_id = :'gid_a' and t.status = 'active' and i.name = 'Olive oil'),
  'get the own-brand one',
  'rollover preserves the item note (#11)');

select is(
  (select unit from items i join trips t on t.id = i.trip_id
    where t.group_id = :'gid_a' and t.status = 'active' and i.name = 'Olive oil'),
  '2 L',
  'rollover preserves the item unit (#11)');

-- --- items_update WITH CHECK: audit stamp + action window (#13) ----------
-- A and B are now BOTH members of group A (B joined above). Set up a pending
-- item on A's trip, have A claim the shop, then probe the new policy from both
-- sides. These are intra-group: same household, trusted-but-not-omnipotent.
select act_as('11111111-1111-1111-1111-111111111111');
select id as sh_trip from trips
  where group_id = :'gid_a' and status = 'active' and shop_id is null limit 1 \gset
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

-- --- per-shop tabs: create / move / per-shop completion (#19) -------------
-- Self-contained: works only against shop A's own trips, so it doesn't depend
-- on the Unsorted trip's state left by the sections above.
select act_as('11111111-1111-1111-1111-111111111111');

-- create_shop opened exactly one active trip dedicated to the shop.
select is(
  (select count(*) from trips where shop_id = :'shop_a' and status = 'active')::int, 1,
  'create_shop opens an active trip for the shop (#19)');

-- Two items on the shop's active trip.
select id as shop_trip from trips
  where shop_id = :'shop_a' and status = 'active' limit 1 \gset
insert into items (id, trip_id, name, quantity, category, priority, status,
                   added_by, added_by_name)
values
  (gen_random_uuid(), :'shop_trip', 'Shampoo', 1, 'health', 'normal', 'pending',
   '11111111-1111-1111-1111-111111111111', 'Anna'),
  (gen_random_uuid(), :'shop_trip', 'Razors', 1, 'health', 'normal', 'pending',
   '11111111-1111-1111-1111-111111111111', 'Anna');
select id as move_item from items where trip_id = :'shop_trip' and name = 'Razors' limit 1 \gset

-- Move Razors out to Unsorted; the RPC opens an Unsorted active trip if needed.
select move_item_to_shop(:'move_item', null);
select is(
  (select shop_id from trips where id = (select trip_id from items where id = :'move_item')),
  NULL,
  'move_item_to_shop to Unsorted reparents the item onto a shop-less trip (#19)');

-- Per-shop completion: shop & finish the shop's trip; Shampoo rolls over to the
-- shop's NEXT active trip, leaving the shop's lifecycle on the same shop.
select start_shopping(:'shop_trip', 0);
select complete_trip(:'shop_trip');
select is(
  (select count(*) from trips where shop_id = :'shop_a' and status = 'active')::int, 1,
  'complete_trip opens the next active trip on the SAME shop (#19)');
select is(
  (select count(*) from items i join trips t on t.id = i.trip_id
    where t.shop_id = :'shop_a' and t.status = 'active'
      and i.name = 'Shampoo' and i.status = 'pending')::int, 1,
  'a shop trip rolls its un-bought items into the shop''s next trip (#19)');

-- Move-window parity (#19 review, 0015): the redefined RPC still moves an item
-- onto a shop's ACTIVE trip normally — the common path. (Its new rejection, for a
-- mid-shop shop whose last-minute window has shut, can't be faithfully asserted
-- here: now() is frozen in this single test transaction and clients can't UPDATE
-- trips to backdate a window, so that path is enforced in code and covered by
-- review.) Razors currently sits on Unsorted (moved above); move it into Tesco.
select move_item_to_shop(:'move_item', :'shop_a');
select is(
  (select t.shop_id from items i join trips t on t.id = i.trip_id where i.id = :'move_item'),
  :'shop_a'::uuid,
  'move_item_to_shop still reparents onto a shop''s active trip (#19 review, 0015)');

-- --- learned item categories (0016) --------------------------------------
-- The category memory is per-group and RPC-write-only. Prove: the RPC normalises
-- and marks the save as the household's own; a non-member can't write to another
-- group's memory or read it; the table itself is closed to direct writes; and the
-- weekly sweep learns from history without ever clobbering a user's choice.
select act_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  format($$ select set_item_category(%L, '  Oat   Milk ', 'dairy') $$, :'gid_a'),
  'a member can save an item category for their own group (0016)');

select is(
  (select item_name from item_categories where group_id = :'gid_a' and category = 'dairy'),
  'oat milk',
  'set_item_category normalises the name the way the client does (0016)');

select is(
  (select source from item_categories where group_id = :'gid_a' and item_name = 'oat milk'),
  'user',
  'an explicit save is recorded as source=user (0016)');

-- A is not a member of group B: writing B's memory must be refused outright.
select throws_ok(
  format($$ select set_item_category(%L, 'milk', 'dairy') $$, :'gid_b'),
  NULL,
  'a non-member cannot write another household''s category memory (0016)');

-- The aisle key is validated against a fixed allow-list, so `category` can never
-- become arbitrary client-supplied text.
select throws_ok(
  format($$ select set_item_category(%L, 'milk', 'not-an-aisle') $$, :'gid_a'),
  NULL,
  'set_item_category rejects an unknown aisle key (0016)');

-- No INSERT policy and no table grant: the RPC is the only door.
select throws_ok(
  format($$ insert into item_categories (group_id, item_name, category)
            values (%L, 'sneaky', 'dairy') $$, :'gid_a'),
  '42501', NULL,
  'a client cannot write item_categories directly (RPC-only, 0016)');

-- B writes their OWN group's memory; A must not be able to read it.
select act_as('22222222-2222-2222-2222-222222222222');
select set_item_category(:'gid_b', 'B secret item', 'snacks');
select act_as('11111111-1111-1111-1111-111111111111');
select is(
  (select count(*) from item_categories where group_id = :'gid_b')::int, 0,
  'A cannot read B''s category memory (0016)');

-- The weekly sweep: two 'health' items already exist on shop A's trips, so the
-- sweep should learn that default. It must NOT touch 'oat milk', which A set by
-- hand — even though the items below file it under snacks.
insert into items (id, trip_id, name, quantity, category, priority, status,
                   added_by, added_by_name)
values
  (gen_random_uuid(), :'sh_trip', 'Oat Milk', 1, 'snacks', 'normal', 'pending',
   '11111111-1111-1111-1111-111111111111', 'Anna'),
  (gen_random_uuid(), :'sh_trip', 'oat milk', 1, 'snacks', 'normal', 'pending',
   '11111111-1111-1111-1111-111111111111', 'Anna');

-- The sweep is REVOKEd from every client role — only the cron job owner runs it.
select throws_ok(
  $$ select refresh_item_categories() $$,
  '42501', NULL,
  'a client cannot trigger the whole-database category sweep (0016)');

select set_config('role', 'postgres', true);
select lives_ok($$ select refresh_item_categories() $$, 'the sweep runs (0016)');

select is(
  (select category from item_categories where group_id = :'gid_a' and item_name = 'shampoo'),
  'health',
  'the weekly sweep learns a default aisle from what the household actually files (0016)');

select is(
  (select category from item_categories where group_id = :'gid_a' and item_name = 'oat milk'),
  'dairy',
  'the sweep never overwrites a category the household set by hand (0016)');

-- --- write-surface lockdown (0017) ---------------------------------------
-- Each of these is something a member could do inside their OWN household with a
-- crafted PostgREST call, bypassing the RPC that exists to prevent it. Positive
-- controls first: the real app paths must be untouched.
select act_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  format($$ insert into items (id, trip_id, name, category, added_by, added_by_name)
            values (gen_random_uuid(), %L, 'Lockdown control', 'dairy',
                    '11111111-1111-1111-1111-111111111111', 'Anna') $$, :'sh_trip'),
  'members can still add items (0017 — no over-reject)');
select id as lockdown_item from items where trip_id = :'sh_trip' and name = 'Lockdown control' \gset
select lives_ok(
  format($$ update items set category = 'snacks' where id = %L $$, :'lockdown_item'),
  'members can still re-aisle an item (0017 — no over-reject)');
select lives_ok(
  format($$ select create_invite(%L) $$, :'gid_a'),
  'create_invite still mints an invite (0017 — no over-reject)');

-- A junk category would crash every client in the household on AISLES[…].label.
select throws_ok(
  format($$ update items set category = '<img src=x>' where id = %L $$, :'lockdown_item'),
  '23514', NULL,
  'items.category is restricted to real aisle keys (0017)');
select throws_ok(
  format($$ insert into recurring_items (group_id, name, category, recurrence_rule)
            values (%L, 'Junk', 'not-an-aisle', 'weekly') $$, :'gid_a'),
  '23514', NULL,
  'recurring_items.category is restricted to real aisle keys (0017)');

-- Forging a trip row: a fabricated completed trip in History/Reporting, or a
-- shopping trip naming someone else as the shopper.
select throws_ok(
  format($$ insert into trips (group_id, status, shopper_id, completed_at)
            values (%L, 'completed', '22222222-2222-2222-2222-222222222222', now()) $$, :'gid_a'),
  '42501', NULL,
  'a member cannot insert a trip directly — trips come from RPCs only (0017)');

-- Forging an invite: a guessable, never-expiring key to the household.
select throws_ok(
  format($$ insert into invites (group_id, code, token, expires_at, created_by)
            values (%L, 'AAAAAAAA', 'aaa', null, '11111111-1111-1111-1111-111111111111') $$, :'gid_a'),
  '42501', NULL,
  'a member cannot mint their own invite row — create_invite only (0017)');

-- Group rows are read + creator-delete only from a client.
select throws_ok(
  format($$ update groups set created_by = '22222222-2222-2222-2222-222222222222'
            where id = %L $$, :'gid_a'),
  '42501', NULL,
  'the creator cannot hand away group ownership with a raw UPDATE (0017)');
select throws_ok(
  $$ insert into groups (name, created_by)
     values ('Sneaky', '11111111-1111-1111-1111-111111111111') $$,
  '42501', NULL,
  'a client cannot insert a group directly — create_group only (0017)');

-- A non-https push endpoint is an SSRF target for the service_role sender.
select throws_ok(
  $$ insert into push_subscriptions (user_id, endpoint, keys)
     values ('11111111-1111-1111-1111-111111111111',
             'http://169.254.169.254/latest/meta-data/', '{}'::jsonb) $$,
  '23514', NULL,
  'push endpoints must be https — no SSRF target for send-push (0017)');
select lives_ok(
  $$ insert into push_subscriptions (user_id, endpoint, keys)
     values ('11111111-1111-1111-1111-111111111111',
             'https://fcm.googleapis.com/fcm/send/abc', '{}'::jsonb) $$,
  'a real https push endpoint still stores (0017 — no over-reject)');

-- Invite codes come from a CSPRNG now, in the unambiguous alphabet, with a
-- 256-bit link token and a 7-day expiry.
select is(
  (select bool_and(code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'
                   and token ~ '^[0-9a-f]{64}$'
                   and expires_at > now() + interval '6 days')
     from invites where group_id = :'gid_a' and code not in ('LIVE1234', 'DEAD1234')),
  true,
  'minted invites are 8 unambiguous chars + a 256-bit token, expiring in 7 days (0017)');

-- --- feedback and join_attempts: no client read / no full grant (#38) --------
-- feedback has INSERT-only grant (no SELECT); join_attempts has NO grant at all.
-- Both block at the privilege layer before RLS is even consulted.
select act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$ select count(*) from feedback $$,
  '42501', NULL,
  'clients cannot SELECT from feedback (no SELECT grant)');

select throws_ok(
  $$ insert into feedback (user_id, group_id, kind, message)
     values ('11111111-1111-1111-1111-111111111111', null, 'feedback', 'forge') $$,
  '42501', NULL,
  'B cannot INSERT feedback attributed to A (RLS WITH CHECK rejects)');

select throws_ok(
  $$ select count(*) from join_attempts $$,
  '42501', NULL,
  'clients cannot SELECT from join_attempts (no grant at all)');

select throws_ok(
  $$ insert into join_attempts (user_id)
     values ('22222222-2222-2222-2222-222222222222') $$,
  '42501', NULL,
  'clients cannot INSERT into join_attempts (no grant at all)');

select * from finish();
rollback;
