-- =============================================================================
-- Lifecycle + stale-shopper recovery (§2.6, §11.4).
-- Adds: stale-lock take-over, leave-group (with ownership transfer + last-member
-- cleanup), clear-history, delete-account. Plus FK changes so deleting an account
-- detaches it WITHOUT destroying the audit trail (the *_name snapshots survive).
-- =============================================================================

-- --- FK detach-on-delete so account deletion keeps the history readable (§11.2) ---
alter table items alter column added_by drop not null;
alter table items drop constraint items_added_by_fkey;
alter table items add constraint items_added_by_fkey
  foreign key (added_by) references auth.users (id) on delete set null;
alter table items drop constraint items_acted_by_fkey;
alter table items add constraint items_acted_by_fkey
  foreign key (acted_by) references auth.users (id) on delete set null;

alter table groups drop constraint groups_created_by_fkey;
alter table groups add constraint groups_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table trips drop constraint trips_shopper_id_fkey;
alter table trips add constraint trips_shopper_id_fkey
  foreign key (shopper_id) references auth.users (id) on delete set null;

-- --- Stale-shopper take-over (§2.6 lock-release) ---------------------------
-- A member can claim a 'shopping' trip whose shopper has gone quiet — no tick
-- activity (and no start) for > 90 min. Atomic, so two people can't both grab it.
create or replace function take_over_shopping(p_trip_id uuid)
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
     set shopper_id = auth.uid(),
         started_at = now(),
         lastminute_until = now()           -- window closed; they're mid-shop
   where id = p_trip_id
     and status = 'shopping'
     and coalesce(
           (select max(acted_at) from items where trip_id = p_trip_id),
           started_at
         ) < now() - interval '90 minutes'
   returning id into tid;
  return tid;  -- null => not stale yet / not shopping
end;
$$;

-- --- Leave a group (§11.4) -------------------------------------------------
-- Removes your membership. Hands ownership to the oldest remaining member if you
-- were the creator; deletes the group entirely if you were the last one out.
create or replace function leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from group_members where group_id = p_group_id and user_id = auth.uid();
  if not exists (select 1 from group_members where group_id = p_group_id) then
    delete from groups where id = p_group_id;          -- last member out
    return;
  end if;
  update groups
     set created_by = (select user_id from group_members
                        where group_id = p_group_id order by joined_at limit 1)
   where id = p_group_id and created_by = auth.uid();   -- transfer ownership
end;
$$;

-- --- Clear completed-trip history (§11.2 retention control) -----------------
create or replace function clear_history(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_member(p_group_id) then
    raise exception 'not_a_member';
  end if;
  delete from trips where group_id = p_group_id and status = 'completed';
end;
$$;

-- --- Delete your account (§11.2 right to erasure) ---------------------------
-- Removes the auth user. FK on-delete-set-null detaches their rows while the
-- *_name snapshots keep the history honest ("Mum binned this" still reads true).
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  -- leave every group first (handles ownership transfer / last-member cleanup)
  perform leave_group(g.group_id) from group_members g where g.user_id = uid;
  delete from push_subscriptions where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
