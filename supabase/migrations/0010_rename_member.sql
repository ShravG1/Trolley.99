-- Self-serve display-name change (§2.1). group_members has no UPDATE policy (it's
-- written only via join_group), so renaming goes through a SECURITY DEFINER RPC
-- that can only touch the caller's OWN membership row — never anyone else's.
-- Historical audit snapshots (items.added_by_name / acted_by_name) intentionally
-- keep the name as it was at the time.
create or replace function rename_member(p_group_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_member(p_group_id) then
    raise exception 'not_a_member';
  end if;
  if char_length(trim(p_display_name)) < 1 then
    raise exception 'name_required';
  end if;
  update group_members
     set display_name = trim(p_display_name)
   where group_id = p_group_id
     and user_id = auth.uid();
end;
$$;
