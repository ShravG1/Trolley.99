-- =============================================================================
-- Trolley — schema, constraints, RPCs and Row Level Security.
--
-- RLS is the ENTIRE security model (§5.1). The anon key ships in the client and
-- is public; RLS is the only thing stopping one household reading another's
-- list. Business rules that matter (single shopper, window close, rollover) are
-- enforced HERE, server-side — the UI is a courtesy, the DB is the bouncer
-- (§6.2, §7).
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type trip_status as enum ('active', 'shopping', 'completed');
create type item_status as enum ('pending', 'bought', 'substituted', 'not_found', 'deleted');
create type priority    as enum ('normal', 'urgent');

-- ---------------------------------------------------------------------------
-- Tables (§4)
-- ---------------------------------------------------------------------------
create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 60),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table group_members (
  group_id     uuid not null references groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  joined_at    timestamptz not null default now(),
  role         text not null default 'member',
  primary key (group_id, user_id)
);

create table invites (
  group_id   uuid not null references groups (id) on delete cascade,
  code       text not null unique,           -- short fallback (>=8 unambiguous chars)
  token      text not null unique,           -- longer high-entropy link token
  expires_at timestamptz,                     -- nullable = no expiry
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table trips (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references groups (id) on delete cascade,
  status           trip_status not null default 'active',
  shopper_id       uuid references auth.users (id),
  lastminute_until timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz
);

-- Belt-and-braces single-shopper / single-active guarantees (§7.1).
create unique index one_active_per_group   on trips (group_id) where status = 'active';
create unique index one_shopping_per_group on trips (group_id) where status = 'shopping';

create table items (
  id                uuid primary key,        -- client-generated for optimistic dedupe (§6.3)
  trip_id           uuid not null references trips (id) on delete cascade,
  name              text not null check (char_length(trim(name)) between 1 and 80),
  quantity          int  not null default 1 check (quantity >= 1),
  category          text not null default 'other',
  priority          priority not null default 'normal',
  status            item_status not null default 'pending',
  added_by          uuid not null references auth.users (id),
  added_by_name     text not null,           -- snapshot for the audit trail (§11.2)
  acted_by          uuid references auth.users (id),
  acted_by_name     text,
  substitution_note text,
  attempt_count     int not null default 1 check (attempt_count >= 1),
  created_at        timestamptz not null default now(),
  acted_at          timestamptz
);
create index items_trip_idx on items (trip_id);

create table recurring_items (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references groups (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 80),
  default_qty     int not null default 1 check (default_qty >= 1),
  category        text not null default 'other',
  recurrence_rule text not null,
  active          boolean not null default true,
  last_added_at   timestamptz
);

create table hot_list (
  group_id  uuid not null references groups (id) on delete cascade,
  item_name text not null,
  frequency int not null default 1,
  primary key (group_id, item_name)
);

create table push_subscriptions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null,
  keys       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

-- ---------------------------------------------------------------------------
-- Membership helper — SECURITY DEFINER to avoid the group_members recursion
-- gotcha (§5.1).
-- ---------------------------------------------------------------------------
create or replace function is_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function trip_group(tid uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select group_id from trips where id = tid;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on EVERY table (§5.1).
-- ---------------------------------------------------------------------------
alter table groups             enable row level security;
alter table group_members      enable row level security;
alter table invites            enable row level security;
alter table trips              enable row level security;
alter table items              enable row level security;
alter table recurring_items    enable row level security;
alter table hot_list           enable row level security;
alter table push_subscriptions enable row level security;

-- groups -------------------------------------------------------------------
create policy groups_read on groups
  for select using (is_member(id));
create policy groups_create on groups
  for insert with check (created_by = auth.uid());
create policy groups_update on groups
  for update using (created_by = auth.uid());
create policy groups_delete on groups
  for delete using (created_by = auth.uid());

-- group_members ------------------------------------------------------------
-- Read own rows OR rows in groups you belong to. Inserts go via join_group RPC
-- only (no client insert grant). Deletes = self-leave or creator-remove.
create policy gm_read on group_members
  for select using (user_id = auth.uid() or is_member(group_id));
create policy gm_self_leave on group_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from groups g where g.id = group_id and g.created_by = auth.uid())
  );

-- invites ------------------------------------------------------------------
-- Members read their group's invites; only the creator of a member group can
-- mint/revoke. Joining does NOT read invites directly — join_group does.
create policy invites_read on invites
  for select using (is_member(group_id));
create policy invites_write on invites
  for insert with check (is_member(group_id) and created_by = auth.uid());
create policy invites_delete on invites
  for delete using (is_member(group_id));

-- trips --------------------------------------------------------------------
create policy trips_read on trips
  for select using (is_member(group_id));
create policy trips_insert on trips
  for insert with check (is_member(group_id));
-- Updates limited to members; the meaningful transitions go through RPCs that
-- enforce the state machine atomically (§7.1).
create policy trips_update on trips
  for update using (is_member(group_id));

-- items --------------------------------------------------------------------
create policy items_read on items
  for select using (is_member(trip_group(trip_id)));

-- The window/shopper rule lives in WITH CHECK (§7.2): you may insert if the
-- trip is active, OR it's shopping AND (you're the shopper OR the window's open).
create policy items_insert on items
  for insert with check (
    is_member(trip_group(trip_id))
    and added_by = auth.uid()
    and exists (
      select 1 from trips t
      where t.id = trip_id
        and (
          t.status = 'active'
          or (
            t.status = 'shopping'
            and (t.shopper_id = auth.uid() or now() <= t.lastminute_until)
          )
        )
    )
  );

create policy items_update on items
  for update using (is_member(trip_group(trip_id)));

-- recurring_items ----------------------------------------------------------
create policy recurring_all on recurring_items
  for all using (is_member(group_id)) with check (is_member(group_id));

-- hot_list -----------------------------------------------------------------
-- Readable by members; written server-side (service_role bypasses RLS).
create policy hot_read on hot_list
  for select using (is_member(group_id));

-- push_subscriptions -------------------------------------------------------
-- Own rows only; the send path reads them via service_role in an Edge Function.
create policy push_own on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs (§5.2, §7.1, §7.4)
-- ---------------------------------------------------------------------------

-- Create a group and add the creator as the first member + an empty active trip.
create or replace function create_group(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  insert into groups (name, created_by) values (trim(p_name), auth.uid())
    returning id into gid;
  insert into group_members (group_id, user_id, display_name)
    values (gid, auth.uid(), trim(p_display_name));
  insert into trips (group_id, status) values (gid, 'active');
  return gid;
end;
$$;

-- Join via short code — never a raw insert grant (§5.2). Auto-join (the link is
-- the credential, so it must be rotatable/expirable).
create or replace function join_group(p_code text, p_display_name text default 'Member')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  select group_id into gid
    from invites
   where code = p_code
     and (expires_at is null or expires_at > now());
  if gid is null then
    raise exception 'invalid_or_expired';
  end if;
  insert into group_members (group_id, user_id, display_name)
    values (gid, auth.uid(), trim(p_display_name))
    on conflict do nothing;
  return gid;
end;
$$;

-- Mint a revocable, expiring invite for a group (§5.2). Members only. The short
-- code uses an unambiguous alphabet (no 0/O/1/l); the link carries a longer token.
create or replace function create_invite(p_group_id uuid)
returns table(code text, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_token text;
  v_expires timestamptz := now() + interval '7 days';
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if not is_member(p_group_id) then
    raise exception 'not_a_member';
  end if;
  select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
    into v_code
    from generate_series(1, 8);
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into invites (group_id, code, token, expires_at, created_by)
    values (p_group_id, v_code, v_token, v_expires, auth.uid());
  return query select v_code, v_token, v_expires;
end;
$$;

-- Atomic single-shopper claim (§7.1) — first-writer-wins.
create or replace function start_shopping(p_trip_id uuid, p_minutes int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare tid uuid;
begin
  if not is_member(trip_group(p_trip_id)) then
    raise exception 'not_a_member';
  end if;
  update trips
     set status = 'shopping',
         shopper_id = auth.uid(),
         started_at = now(),
         lastminute_until = case when p_minutes > 0
                                 then now() + make_interval(mins => p_minutes)
                                 else now() end
   where id = p_trip_id and status = 'active'
   returning id into tid;
  -- 0 rows => someone beat you; tid stays null and the UI shows "X's shopping".
  return tid;
end;
$$;

-- Shopper releases the lock (§2.6 lock-release exit).
create or replace function cancel_shopping(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update trips
     set status = 'active', shopper_id = null, lastminute_until = null, started_at = null
   where id = p_trip_id and status = 'shopping' and shopper_id = auth.uid();
end;
$$;

-- Complete the trip, roll over not-found items into a fresh active trip, and
-- rebuild the hot list — all inside one transaction guarded by the atomic
-- status transition so it can't double-complete (§7.4).
create or replace function complete_trip(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid; new_trip uuid; done boolean;
begin
  update trips
     set status = 'completed', completed_at = now()
   where id = p_trip_id and status = 'shopping' and shopper_id = auth.uid()
   returning group_id into gid;
  if gid is null then
    raise exception 'not_shopping_or_not_shopper';
  end if;

  insert into trips (group_id, status) values (gid, 'active') returning id into new_trip;

  -- Roll over not-found items with a bumped attempt counter (§7.4). Dedupe is on
  -- the *add* path; rollover items are unique by definition (status not_found).
  insert into items (id, trip_id, name, quantity, category, priority, status,
                     added_by, added_by_name, attempt_count, created_at)
  select gen_random_uuid(), new_trip, name, quantity, category, priority, 'pending',
         added_by, added_by_name, attempt_count + 1, now()
    from items
   where trip_id = p_trip_id and status = 'not_found';

  -- Rebuild hot list from what was actually obtained (§4 type-ahead source).
  insert into hot_list (group_id, item_name, frequency)
  select gid, lower(trim(name)), count(*)
    from items
   where trip_id = p_trip_id and status in ('bought', 'substituted')
   group by lower(trim(name))
  on conflict (group_id, item_name)
    do update set frequency = hot_list.frequency + excluded.frequency;

  return new_trip;
end;
$$;
