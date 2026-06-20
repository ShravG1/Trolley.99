-- =============================================================================
-- Per-shop tabs (#19). A household's one list splits into named shops (Tesco,
-- the pharmacy, …); each shop runs its OWN independent trip lifecycle
-- (active → shopping → completed), so different members can shop different shops
-- at the same time. Items belong to a shop via their trip — no new column on
-- items. Items with no shop live in the group's shop-less trip, which the UI
-- shows as the "Unsorted" tab, so every existing list migrates with ZERO data
-- movement (the original active trip already has shop_id = NULL).
--
-- RLS is unchanged in spirit: a shop is group_id-scoped and gated by
-- is_member(group_id), exactly like trips/items, so cross-household isolation
-- rides on the same boundary the pgTAP suite already proves. Shop mutations go
-- through SECURITY DEFINER RPCs (create/rename/delete/move) — clients only
-- SELECT, mirroring how trips never take a direct client write (§6.2, §7).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- shops — a named tab within a group's list.
-- ---------------------------------------------------------------------------
create table shops (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  sort_order int  not null default 0,
  -- Keep the tab even if the member who made it deletes their account (audit
  -- trail parity with groups.created_by, §11.2).
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index shops_group_idx on shops (group_id);

alter table shops enable row level security;

-- Members read their group's shops; every write goes through a SECURITY DEFINER
-- RPC, so SELECT is the entire client surface (no insert/update/delete grant).
create policy shops_read on shops
  for select using (is_member(group_id));

grant select on shops to authenticated;

-- ---------------------------------------------------------------------------
-- trips gain a shop. NULL = the "Unsorted" tab. The group's original shop-less
-- trip stays NULL, so all existing rows are already correct.
-- ---------------------------------------------------------------------------
alter table trips add column shop_id uuid references shops (id) on delete cascade;
create index trips_shop_idx on trips (shop_id);

-- One active / one shopping trip PER SHOP now (was per group, §7.1). A plain
-- unique index treats NULLs as distinct, which would allow two Unsorted active
-- trips — so key on coalesce(shop_id, sentinel) to keep Unsorted single too.
drop index if exists one_active_per_group;
drop index if exists one_shopping_per_group;
create unique index one_active_per_shop
  on trips (group_id, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';
create unique index one_shopping_per_shop
  on trips (group_id, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'shopping';

-- Live shop changes (create/rename/delete) so tabs stay in sync across devices
-- (§6.4). Create also inserts a trip, so create already propagates via the trips
-- channel; this covers rename, which touches only the shops row.
alter publication supabase_realtime add table shops;

-- ---------------------------------------------------------------------------
-- RPCs — every shop mutation is server-enforced (the DB is the bouncer, §6.2).
-- ---------------------------------------------------------------------------

-- Create a shop and open its first active trip in one transaction. Members only.
create or replace function create_shop(p_group_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare sid uuid;
begin
  if not is_member(p_group_id) then
    raise exception 'not_a_member';
  end if;
  if char_length(trim(p_name)) < 1 then
    raise exception 'name_required';
  end if;
  insert into shops (group_id, name, created_by, sort_order)
    values (
      p_group_id, trim(p_name), auth.uid(),
      coalesce((select max(sort_order) + 1 from shops where group_id = p_group_id), 0)
    )
    returning id into sid;
  insert into trips (group_id, status, shop_id) values (p_group_id, 'active', sid);
  return sid;
end;
$$;

-- Rename your group's shop. Members only.
create or replace function rename_shop(p_shop_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  select group_id into gid from shops where id = p_shop_id;
  if gid is null or not is_member(gid) then
    raise exception 'not_a_member';
  end if;
  if char_length(trim(p_name)) < 1 then
    raise exception 'name_required';
  end if;
  update shops set name = trim(p_name) where id = p_shop_id;
end;
$$;

-- Delete a shop. Its still-live items (pending/not-found) on the current trip are
-- carried back to the group's Unsorted active trip so nothing on the list is
-- lost; the shop's own trips then cascade away (this discards that shop's
-- COMPLETED-trip history — an accepted cost of deleting a tab). Members only.
create or replace function delete_shop(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid; unsorted uuid;
begin
  select group_id into gid from shops where id = p_shop_id;
  if gid is null or not is_member(gid) then
    raise exception 'not_a_member';
  end if;

  -- Find (or open) the group's Unsorted active trip.
  select id into unsorted from trips
   where group_id = gid and shop_id is null and status = 'active'
   limit 1;
  if unsorted is null then
    insert into trips (group_id, status) values (gid, 'active') returning id into unsorted;
  end if;

  -- Carry the shop's live items over from whichever of its trips is current.
  update items set trip_id = unsorted
   where status in ('pending', 'not_found')
     and trip_id in (
       select id from trips
        where shop_id = p_shop_id and status in ('active', 'shopping')
     );

  delete from shops where id = p_shop_id;  -- cascade removes the shop's trips
end;
$$;

-- Move one still-live item to another shop's current trip (or to Unsorted when
-- p_shop_id is null). Reparents trip_id, which clients CANNOT do directly (it's
-- not in the items UPDATE grant, 0008), so this RPC is the only path. Members
-- only; only pending/not-found items move (a resolved row belongs to a finished
-- context).
create or replace function move_item_to_shop(p_item_id uuid, p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid; cur_status item_status; dest uuid;
begin
  select t.group_id, i.status into gid, cur_status
    from items i join trips t on t.id = i.trip_id
   where i.id = p_item_id;
  if gid is null or not is_member(gid) then
    raise exception 'not_a_member';
  end if;
  if cur_status not in ('pending', 'not_found') then
    raise exception 'item_not_movable';
  end if;

  if p_shop_id is not null then
    if not exists (select 1 from shops where id = p_shop_id and group_id = gid) then
      raise exception 'shop_not_in_group';
    end if;
    -- Prefer the shop's active trip; fall back to a shopping one (last-minute add).
    select id into dest from trips
     where group_id = gid and shop_id = p_shop_id and status in ('active', 'shopping')
     order by case status when 'active' then 0 else 1 end
     limit 1;
  else
    select id into dest from trips
     where group_id = gid and shop_id is null and status = 'active'
     limit 1;
    if dest is null then
      insert into trips (group_id, status) values (gid, 'active') returning id into dest;
    end if;
  end if;

  if dest is null then
    raise exception 'no_destination_trip';
  end if;

  update items set trip_id = dest where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_trip — redefine (was 0012) to carry shop_id into the rolled-over
-- trip, so a shop's lifecycle stays on that shop instead of collapsing back to
-- Unsorted. Everything else (atomic shopper-only transition, pending/not-found
-- rollover with note + unit, hot-list rebuild) is byte-for-byte the 0012 logic.
-- ---------------------------------------------------------------------------
create or replace function complete_trip(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid; sid uuid; new_trip uuid;
begin
  update trips
     set status = 'completed', completed_at = now()
   where id = p_trip_id and status = 'shopping' and shopper_id = auth.uid()
   returning group_id, shop_id into gid, sid;
  if gid is null then
    raise exception 'not_shopping_or_not_shopper';
  end if;

  insert into trips (group_id, status, shop_id)
    values (gid, 'active', sid)
    returning id into new_trip;

  insert into items (id, trip_id, name, quantity, category, priority, status,
                     added_by, added_by_name, attempt_count, note, unit, created_at)
  select gen_random_uuid(), new_trip, name, quantity, category, priority, 'pending',
         added_by, added_by_name,
         attempt_count + (case when status = 'not_found' then 1 else 0 end),
         note, unit, now()
    from items
   where trip_id = p_trip_id and status in ('pending', 'not_found');

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
