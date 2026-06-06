-- Defence-in-depth on writes (§5.1). RLS already gates every row by membership;
-- this adds column- and path-scoping so a member can't, within their own group,
-- rewrite audit fields or another user's storage path.

-- items: column-level UPDATE. The client only ever patches the mutable fields
-- below (status + action stamps, and the user-editable name/qty/category/
-- urgency). Revoking table-wide UPDATE and granting just these columns means a
-- crafted PostgREST call can no longer overwrite added_by / added_by_name /
-- trip_id / created_at / id — the audit trail (§11.2). SECURITY DEFINER RPCs run
-- as the table owner and bypass these grants, and ON DELETE SET NULL cascades on
-- added_by/acted_by are unaffected (they don't run as `authenticated`).
revoke update on items from authenticated, anon;
grant update (
  name, quantity, category, priority, status,
  acted_by, acted_by_name, acted_at, substitution_note
) on items to authenticated;

-- trips: the client never updates a trip row directly — every transition goes
-- through a SECURITY DEFINER RPC (start/cancel/complete/take_over). So revoke
-- direct UPDATE entirely; the RPCs still work (they bypass role grants).
revoke update on trips from authenticated, anon;

-- feedback: require a real author. Anonymous sessions are fine (they still have
-- an auth.uid()), but a row with no user_id is no longer acceptable (§9).
drop policy if exists feedback_insert on feedback;
create policy feedback_insert on feedback
  for insert
  with check (user_id = auth.uid());

-- feedback storage: path-scope uploads to the uploader's own uid prefix, so one
-- user can't write into another's folder (the client already uploads to
-- `${uid}/<uuid>.<ext>`). Reads stay owner-only via service_role.
drop policy if exists "feedback_upload" on storage.objects;
create policy "feedback_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
