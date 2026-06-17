-- complete_trip rollover dropped note + unit (#11). The function was written in
-- 0001, before 0009 added the `note` ("get the own-brand one") and `unit` ("2 L")
-- columns, and its explicit insert column list was never updated — so every
-- rolled-over un-ticked / not-found item silently lost both fields (§7.4). These
-- are user-facing instructions, not audit fields, so they must carry over with
-- the rest of the row. CREATE OR REPLACE leaves the rest of the function (the
-- atomic status transition, attempt-count bump, hot-list rebuild) untouched —
-- only `note, unit` are threaded through the insert/select.
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

  -- Roll over everything NOT bought (pending + not-found) so un-ticked items are
  -- never silently lost (§7.4). not-found bumps the attempt counter; plain
  -- un-ticked items carry over as-is — including their note + unit (#11).
  insert into items (id, trip_id, name, quantity, category, priority, status,
                     added_by, added_by_name, attempt_count, note, unit, created_at)
  select gen_random_uuid(), new_trip, name, quantity, category, priority, 'pending',
         added_by, added_by_name,
         attempt_count + (case when status = 'not_found' then 1 else 0 end),
         note, unit, now()
    from items
   where trip_id = p_trip_id and status in ('pending', 'not_found');

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
