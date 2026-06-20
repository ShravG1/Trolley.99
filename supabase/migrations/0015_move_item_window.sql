-- =============================================================================
-- 0015 — move_item_to_shop honours the last-minute window (#19 review).
--
-- move_item_to_shop (0014) reparents a pending/not-found item onto a shop's
-- current trip, preferring an active trip but falling back to a *shopping* one —
-- with NO window/shopper check. items_insert (0001) gates an add into a shopping
-- trip on (caller is the shopper OR now() <= lastminute_until); moving bypassed
-- that, so a member could drop an item into a shop whose last-minute window had
-- already closed and whose shopper had moved on. Redefine the RPC to mirror the
-- items_insert rule. Everything else — membership check, pending/not-found only,
-- and the Unsorted branch that opens a shop-less active trip — is unchanged from
-- 0014.
-- =============================================================================
create or replace function move_item_to_shop(p_item_id uuid, p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid; cur_status item_status; dest uuid; mid_shop boolean;
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
    -- Prefer the shop's active trip; fall back to a shopping one ONLY while its
    -- last-minute window is open, or the caller is its shopper (mirrors
    -- items_insert, §7.2) — never sneak an item into a locked shop.
    select id into dest from trips
     where group_id = gid and shop_id = p_shop_id
       and (
         status = 'active'
         or (status = 'shopping' and (shopper_id = auth.uid() or now() <= lastminute_until))
       )
     order by case status when 'active' then 0 else 1 end
     limit 1;
    -- A shop that's mid-shop with the window shut has a shopping trip but no
    -- eligible destination — surface that distinctly so the client can explain it.
    if dest is null then
      select exists (
        select 1 from trips
         where group_id = gid and shop_id = p_shop_id and status = 'shopping'
      ) into mid_shop;
      if mid_shop then
        raise exception 'shop_window_closed';
      end if;
    end if;
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
