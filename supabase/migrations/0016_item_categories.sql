-- =============================================================================
-- 0016 — the app remembers which aisle a thing belongs in.
--
-- Until now the only categorisation was `lib/categorise.ts`: a keyword guess that
-- runs fresh on every add and forgets everything. Put "Oatly" on the list ten
-- times, re-aisle it to Dairy ten times. This migration gives each household a
-- learned default aisle per item name, from two sources:
--
--   * EXPLICIT — a member re-aisles an item, `set_item_category` records it as
--     source='user'. That is the household's decision and nothing overwrites it.
--   * LEARNED  — `refresh_item_categories()` runs weekly (pg_cron, see
--     supabase/scheduled.sql), reviews every item the group has added recently
--     and gives each name the aisle it is *actually* filed under most often,
--     as source='auto'. Auto rows never clobber a user row.
--
-- Deliberately per-GROUP, not global: households disagree about where things live
-- (is "hummus" dairy or cupboard?), and a global table would leak one household's
-- vocabulary into another's suggestions. group_id + RLS keeps it isolated like
-- everything else.
--
-- Write path is RPC-only. There is no INSERT/UPDATE/DELETE policy and no table
-- grant, so the ONLY way a client writes here is `set_item_category`, which
-- membership-checks, normalises the name and validates the aisle key against a
-- fixed allow-list. A crafted PostgREST call can't poison another household's
-- categories, or stuff arbitrary text into `category`.
-- =============================================================================

-- Normalise an item name the same way the client does (lib/categorise.ts
-- `normaliseName`): trim, lower-case, collapse internal whitespace. IMMUTABLE so
-- it can be used in indexes and in the sweep's GROUP BY. Returns NULL for a name
-- that is empty once trimmed, which callers treat as "not learnable".
create or replace function norm_item_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(btrim(p_name)), '\s+', ' ', 'g'), '');
$$;

create table if not exists item_categories (
  group_id   uuid not null references groups (id) on delete cascade,
  -- Already normalised by norm_item_name() — every write path goes through it.
  item_name  text not null check (char_length(item_name) between 1 and 80),
  category   text not null check (
    category in ('produce', 'bakery', 'meat', 'dairy', 'cupboard', 'snacks',
                 'drinks', 'frozen', 'household', 'health', 'baby', 'other')
  ),
  -- 'user' = a member said so (sticky); 'auto' = the weekly sweep inferred it.
  source     text not null default 'auto' check (source in ('auto', 'user')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (group_id, item_name)
);

alter table item_categories enable row level security;

-- Members read their own group's memory. No write policies on purpose: writes go
-- through set_item_category (SECURITY DEFINER) only.
drop policy if exists item_categories_read on item_categories;
create policy item_categories_read on item_categories
  for select using (is_member(group_id));

grant select on item_categories to authenticated;
revoke insert, update, delete on item_categories from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Explicit save: "this is where we keep it".
-- ---------------------------------------------------------------------------
create or replace function set_item_category(
  p_group_id uuid,
  p_name     text,
  p_category text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  if not is_member(p_group_id) then
    raise exception 'not_a_member';
  end if;

  v_name := norm_item_name(p_name);
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;

  -- Mirrors the table CHECK; validated here too so the failure is a clean named
  -- error rather than a constraint violation, and so the allow-list is enforced
  -- at the only door clients can reach.
  if p_category not in ('produce', 'bakery', 'meat', 'dairy', 'cupboard', 'snacks',
                        'drinks', 'frozen', 'household', 'health', 'baby', 'other') then
    raise exception 'invalid_category';
  end if;

  insert into item_categories (group_id, item_name, category, source, updated_by, updated_at)
  values (p_group_id, v_name, p_category, 'user', auth.uid(), now())
  on conflict (group_id, item_name) do update
    set category   = excluded.category,
        source     = 'user',
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

-- EXECUTE is granted to PUBLIC by default; scope it to signed-in callers. (The
-- is_member check already fails closed for anon — auth.uid() is null — but an
-- unauthenticated role has no business reaching a definer function at all.)
revoke all on function set_item_category(uuid, text, text) from public, anon;
grant execute on function set_item_category(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Weekly review: give every recently-added item name a default aisle.
--
-- For each (group, normalised name) look at the aisles the household has
-- actually filed it under and take the most-used one, breaking ties by most
-- recent. 'other' is ignored as a signal — it means "nobody categorised this",
-- not "this belongs in Other" — so a name only ever learns a real aisle.
--
-- Never overwrites source='user', and skips no-op writes so `updated_at` only
-- moves when the default genuinely changed. Returns the number of rows it wrote.
-- ---------------------------------------------------------------------------
create or replace function refresh_item_categories(p_days int default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_rows integer;
begin
  with seen as (
    select t.group_id            as gid,
           norm_item_name(i.name) as nm,
           i.category             as cat,
           i.created_at
      from items i
      join trips t on t.id = i.trip_id
     where i.created_at > now() - make_interval(days => greatest(p_days, 1))
       and i.status <> 'deleted'
       and i.category <> 'other'
       and norm_item_name(i.name) is not null
  ),
  tally as (
    select gid, nm, cat, count(*) as uses, max(created_at) as last_used
      from seen
     group by gid, nm, cat
  ),
  best as (
    select distinct on (gid, nm) gid, nm, cat
      from tally
     order by gid, nm, uses desc, last_used desc, cat
  )
  insert into item_categories (group_id, item_name, category, source, updated_at)
  select gid, nm, cat, 'auto', now() from best
  on conflict (group_id, item_name) do update
     set category = excluded.category, updated_at = now()
   where item_categories.source = 'auto'
     and item_categories.category is distinct from excluded.category;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Cron-only (pg_cron fires it as the job owner, which bypasses these grants).
-- No client has any reason to trigger a whole-database sweep.
revoke all on function refresh_item_categories(int) from public, anon, authenticated;
