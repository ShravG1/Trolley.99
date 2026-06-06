-- Invite hardening (§5.2). Two goals:
--   1. Let the invite LINK carry the high-entropy 256-bit `token` instead of the
--      human-typeable 8-char `code`, so a shared link is no longer brute-forceable
--      down to ~40 bits. The short code stays for manual entry in the Join tab.
--   2. A basic per-user attempt guard on both join paths, so the 8-char code
--      can't be brute-forced via repeated join_group calls.

-- Per-user join attempts, used only by the SECURITY DEFINER guard below. RLS on
-- with NO policies => unreachable to clients; only the definer functions (owned
-- by the table owner, which bypasses RLS) touch it.
create table if not exists join_attempts (
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);
create index if not exists join_attempts_user_time on join_attempts (user_id, attempted_at);
alter table join_attempts enable row level security;

-- Throttle: at most 10 join attempts per user per 10 minutes. Legitimate use is
-- one or two; a brute-forcer of the 32^8 code space is reduced to a crawl. Also
-- opportunistically GCs old rows so the table stays tiny.
create or replace function _guard_join_attempt()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  delete from join_attempts where attempted_at < now() - interval '1 hour';
  select count(*) into v_count
    from join_attempts
   where user_id = v_uid
     and attempted_at > now() - interval '10 minutes';
  if v_count >= 10 then
    raise exception 'too_many_attempts';
  end if;
  insert into join_attempts (user_id) values (v_uid);
end;
$$;

-- Join via the short code (manual entry), now behind the attempt guard.
create or replace function join_group(p_code text, p_display_name text default 'Member')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  perform _guard_join_attempt();
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

-- Join via the high-entropy link token. Same guard; the token is what the
-- shareable /join/<token> link now carries.
create or replace function join_group_by_token(p_token text, p_display_name text default 'Member')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare gid uuid;
begin
  perform _guard_join_attempt();
  select group_id into gid
    from invites
   where token = p_token
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
