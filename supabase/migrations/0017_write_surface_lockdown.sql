-- =============================================================================
-- 0017 — shrink the client's write surface to exactly what the app uses.
--
-- RLS is the whole security model (§5.1), and it has held: no cross-household
-- read or write is possible. What this migration closes is the layer underneath —
-- table privileges that were granted broadly in 0011 for operations the client
-- never actually performs. Every one of them is reachable by any signed-in member
-- with a crafted PostgREST call, and each lets them do something inside their own
-- household that the RPC they're supposed to use deliberately prevents. Same
-- posture as 0008 (which revoked items/trips UPDATE) and 0013 (which added the
-- items WITH CHECK): the DB is the bouncer, so it should only open the doors the
-- app walks through.
--
-- Nothing here changes what the app can do. Every path that still needs these
-- operations goes through a SECURITY DEFINER RPC, which runs as the table owner
-- and is unaffected by role grants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. items.category / recurring_items.category must be a real aisle.
--
-- `category` is plain `text` with no constraint, and 0008 grants UPDATE on it
-- (rightly — re-aisling is a core action). So a member could PATCH an item to
-- category='💥' and the client, which does AISLES[item.category].label in the row
-- renderer and the aisle header, would throw on an undefined lookup — a white
-- screen for EVERYONE in the household, from one crafted request. recurring_items
-- is the same story one step removed: it takes a client INSERT with a free-text
-- category that the `recurring` function copies onto a real item.
--
-- Normalise any stragglers to 'other' first so the constraint validates cleanly.
-- ---------------------------------------------------------------------------
update items set category = 'other'
 where category not in ('produce', 'bakery', 'meat', 'dairy', 'cupboard', 'snacks',
                        'drinks', 'frozen', 'household', 'health', 'baby', 'other');
update recurring_items set category = 'other'
 where category not in ('produce', 'bakery', 'meat', 'dairy', 'cupboard', 'snacks',
                        'drinks', 'frozen', 'household', 'health', 'baby', 'other');

alter table items drop constraint if exists items_category_valid;
alter table items add constraint items_category_valid check (
  category in ('produce', 'bakery', 'meat', 'dairy', 'cupboard', 'snacks',
               'drinks', 'frozen', 'household', 'health', 'baby', 'other')
);

alter table recurring_items drop constraint if exists recurring_items_category_valid;
alter table recurring_items add constraint recurring_items_category_valid check (
  category in ('produce', 'bakery', 'meat', 'dairy', 'cupboard', 'snacks',
               'drinks', 'frozen', 'household', 'health', 'baby', 'other')
);

-- ---------------------------------------------------------------------------
-- 2. trips: no direct client INSERT.
--
-- 0008 revoked UPDATE because every transition is an RPC. INSERT was left open,
-- and the policy only checks membership — so a member could insert a trip row
-- with any column they liked: a second 'shopping' trip for a shop naming SOMEONE
-- ELSE as the shopper (forging the "who's shopping" the whole household sees), or
-- a fabricated 'completed' trip that shows up in History and Reporting as if it
-- happened. That's the same audit-forgery 0013 closed for items, on trips.
--
-- Trips are only ever created by create_group, create_shop, complete_trip and
-- move_item_to_shop — all SECURITY DEFINER, all unaffected by this.
-- ---------------------------------------------------------------------------
drop policy if exists trips_insert on trips;
revoke insert on trips from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. invites: no direct client INSERT.
--
-- create_invite mints an 8-char code from a 32-symbol alphabet, a 256-bit link
-- token, and a 7-day expiry. With a raw INSERT grant a member could write their
-- own row instead — `code = 'AAAAAAAA'`, `token = 'a'`, `expires_at = null` — a
-- guessable, never-expiring key to the household that completely sidesteps those
-- protections. Minting goes through the RPC only; reading and revoking stay as
-- they were (any member may kill a leaked invite, #37).
-- ---------------------------------------------------------------------------
drop policy if exists invites_write on invites;
revoke insert on invites from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. groups: SELECT + DELETE only.
--
-- The client reads groups and (creator-only) deletes one. It never inserts —
-- create_group does that — and never updates: there is no rename-list feature.
-- Meanwhile `groups_update` had a USING clause and NO WITH CHECK, so the creator
-- could PATCH `created_by` to another user and hand away ownership (or lock
-- themselves out of their own delete), and the table-wide grant left `id`
-- writable too. Close both. A future rename-list belongs in an RPC alongside
-- rename_shop / rename_member.
-- ---------------------------------------------------------------------------
drop policy if exists groups_create on groups;
drop policy if exists groups_update on groups;
revoke insert, update on groups from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. push_subscriptions.endpoint must be an https URL.
--
-- The row is self-owned, so a user can put any string in `endpoint` — and
-- send-push (running with service_role) then POSTs to it. That turns their own
-- subscription row into a blind SSRF primitive pointed at whatever the edge
-- runtime can reach. Real push endpoints are always https, so requiring that
-- costs nothing and removes the http:// and file:// shapes entirely; the length
-- bound stops a multi-megabyte "endpoint" being stored and replayed. send-push
-- re-checks the scheme before sending (defence in depth — this is the boundary).
-- ---------------------------------------------------------------------------
delete from push_subscriptions where endpoint not like 'https://%';
alter table push_subscriptions drop constraint if exists push_endpoint_https;
alter table push_subscriptions add constraint push_endpoint_https check (
  endpoint like 'https://%' and char_length(endpoint) between 12 and 2000
);

-- ---------------------------------------------------------------------------
-- 6. Invite codes from a CSPRNG, not the session PRNG.
--
-- 0001 built the 8-char code with `random()`, which is a seeded pseudo-random
-- generator, not a cryptographic one: its output is a deterministic function of a
-- per-backend seed, so codes minted on the same connection are correlated and, in
-- principle, predictable from observed ones. For a credential that grants entry
-- to a household that's the wrong generator. Use pgcrypto's gen_random_bytes for
-- both the code and the token. The alphabet is 32 symbols and 256 % 32 = 0, so
-- taking each byte modulo 32 is unbiased. Retry on the (astronomically unlikely)
-- unique-code collision instead of surfacing a constraint error.
--
-- Everything else — members-only, self-authored, 7-day expiry, return shape — is
-- unchanged from 0001.
-- ---------------------------------------------------------------------------
create or replace function create_invite(p_group_id uuid)
returns table(code text, token text, expires_at timestamptz)
language plpgsql
security definer
-- `extensions` is on the path because that is where hosted Supabase installs
-- pgcrypto, and gen_random_bytes lives in it. (0001's `create extension if not
-- exists pgcrypto` is a no-op there — the platform has already installed it into
-- `extensions` — so a bare `search_path = public` resolves gen_random_uuid, which
-- is a pg_catalog builtin, but NOT gen_random_bytes.) A plain Postgres that put
-- pgcrypto in `public` still works: public is searched first, and a schema on the
-- path that doesn't exist is skipped rather than erroring.
set search_path = public, extensions
as $$
declare
  v_code text;
  v_token text;
  v_bytes bytea;
  v_expires timestamptz := now() + interval '7 days';
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I/l
begin
  if not is_member(p_group_id) then
    raise exception 'not_a_member';
  end if;

  for _attempt in 1..5 loop
    v_bytes := gen_random_bytes(8);
    select string_agg(substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1), '')
      into v_code
      from generate_series(0, 7) as i;
    v_token := encode(gen_random_bytes(32), 'hex');
    begin
      insert into invites (group_id, code, token, expires_at, created_by)
        values (p_group_id, v_code, v_token, v_expires, auth.uid());
      return query select v_code, v_token, v_expires;
      return;
    exception when unique_violation then
      -- 32^8 codes: a collision means try again, not fail.
      null;
    end;
  end loop;
  raise exception 'could_not_mint_invite';
end;
$$;

revoke all on function create_invite(uuid) from public, anon;
grant execute on function create_invite(uuid) to authenticated;
