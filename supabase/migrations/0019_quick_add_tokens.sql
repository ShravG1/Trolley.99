-- =============================================================================
-- Quick-add tokens — "add via Siri" (a household member's own iOS Shortcut).
--
-- A Siri Shortcut has no Supabase session: there's no browser, no cookie, no
-- JWT to attach. It can only carry a static secret the member set up once. So
-- this is a DIFFERENT trust model from everything else in the app (§5.1's "RLS
-- is the entire security model" assumes a caller with a real Supabase JWT) —
-- deliberately kept small and narrow rather than bolted onto the existing
-- RLS-gated write surface:
--
--   * A member mints a token via `create_quick_add_token` (SECURITY DEFINER,
--     membership-checked, same CSPRNG pattern as create_invite in 0017) — the
--     PLAINTEXT is returned once and never stored; only its sha256 hash is.
--   * The token is pasted into that member's own iOS Shortcut as a bearer
--     header for the `quick-add` Edge Function (supabase/functions/quick-add).
--   * The Edge Function calls `quick_add_item(token, name, qty)`, which is the
--     ONLY thing a bearer token can do: verify the hash, resolve which group
--     and member it belongs to, and insert ONE pending item onto that group's
--     open (shop-less, 'active') list. It cannot read anything, cannot list
--     members, cannot touch any other table or trip state.
--   * A leaked token is exactly as powerful as a compromised member's ability
--     to add items to the list — nothing more — and is revocable any time
--     from Settings (self-delete only, mirroring push_subscriptions' pattern).
--
-- quick_add_item runs as SECURITY DEFINER and is executed by the Edge
-- Function's service_role client, so table-level grants to authenticated/anon
-- are deliberately NOT given for it — only the RPC, and only to service_role.
-- =============================================================================

create table quick_add_tokens (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  token_hash    text not null unique,
  label         text not null default 'Siri Shortcut' check (char_length(trim(label)) between 1 and 40),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index quick_add_tokens_group_idx on quick_add_tokens (group_id);

alter table quick_add_tokens enable row level security;

-- Self-scoped only: even within a household, one member's Shortcut token isn't
-- another member's business to see or revoke (unlike invites, which any member
-- may kill — a quick-add token belongs to a specific person's phone).
create policy quick_add_tokens_own on quick_add_tokens
  for select using (user_id = auth.uid());

create policy quick_add_tokens_self_delete on quick_add_tokens
  for delete using (user_id = auth.uid());

grant select, delete on quick_add_tokens to authenticated;
-- No client INSERT/UPDATE — minting goes through create_quick_add_token so the
-- token itself is always a real CSPRNG value the client never chooses, and
-- last_used_at is only ever written by quick_add_item.
revoke insert, update on quick_add_tokens from authenticated, anon;

-- ---------------------------------------------------------------------------
-- create_quick_add_token — mint a token for MY membership in a group I'm in.
-- ---------------------------------------------------------------------------
create or replace function create_quick_add_token(p_group_id uuid, p_label text default 'Siri Shortcut')
returns text
language plpgsql
security definer
-- extensions is where hosted Supabase installs pgcrypto (see 0017's create_invite
-- for the full explanation of why this path is needed rather than a bare public).
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if not is_member(p_group_id) then
    raise exception 'not_a_member';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into quick_add_tokens (group_id, user_id, token_hash, label)
    values (
      p_group_id, auth.uid(), encode(digest(v_token, 'sha256'), 'hex'),
      coalesce(nullif(trim(p_label), ''), 'Siri Shortcut')
    );
  return v_token;
end;
$$;

revoke all on function create_quick_add_token(uuid, text) from public, anon;
grant execute on function create_quick_add_token(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- quick_add_item — the one thing a bearer token can do. Called by the
-- quick-add Edge Function's service_role client, never directly by a client
-- holding only the anon key (no grant to anon/authenticated below).
--
-- Targets the group's shop-less ("Unsorted") trip, and only while it's
-- 'active' — mirrors canAddItem's plain 'active' branch (§7.2). Deliberately
-- does NOT attempt the shopper/last-minute-window logic a live voice add has
-- no context for (which shop tab? who's the shopper right now?): if the
-- Unsorted list is currently being shopped, the add is refused with a clear
-- reason rather than guessed into the wrong place.
-- ---------------------------------------------------------------------------
create or replace function quick_add_item(p_token text, p_name text, p_quantity int default 1)
returns table(item_id uuid, item_name text, group_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(digest(p_token, 'sha256'), 'hex');
  v_group_id uuid;
  v_user_id uuid;
  v_user_name text;
  v_trip_id uuid;
  v_item_id uuid;
  v_group_name text;
  v_name text := trim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;

  select qt.group_id, qt.user_id into v_group_id, v_user_id
    from quick_add_tokens qt where qt.token_hash = v_hash;
  if v_group_id is null then
    raise exception 'invalid_token';
  end if;

  update quick_add_tokens set last_used_at = now() where token_hash = v_hash;

  select gm.display_name into v_user_name
    from group_members gm where gm.group_id = v_group_id and gm.user_id = v_user_id;
  select g.name into v_group_name from groups g where g.id = v_group_id;

  select t.id into v_trip_id from trips t
    where t.group_id = v_group_id and t.shop_id is null and t.status = 'active'
    limit 1;
  if v_trip_id is null then
    raise exception 'shop_in_progress';
  end if;

  v_item_id := gen_random_uuid();
  insert into items (id, trip_id, name, quantity, added_by, added_by_name)
    values (v_item_id, v_trip_id, v_name, greatest(1, least(999, coalesce(p_quantity, 1))),
            v_user_id, coalesce(v_user_name, 'Siri'));

  return query select v_item_id, v_name, coalesce(v_group_name, 'Trolley');
end;
$$;

revoke all on function quick_add_item(text, text, int) from public, anon, authenticated;
grant execute on function quick_add_item(text, text, int) to service_role;
