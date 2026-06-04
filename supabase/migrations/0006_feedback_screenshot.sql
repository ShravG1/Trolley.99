-- Optional screenshot attached to a feedback/bug report. Stored in the private
-- 'feedback' Storage bucket; this column holds the object path. The daily digest
-- turns it into a signed URL in the GitHub issue.
alter table feedback add column if not exists screenshot_path text;

-- Authenticated users may upload to the 'feedback' bucket; reads stay owner-only
-- (the digest signs URLs with service_role). No SELECT/UPDATE/DELETE policy.
do $$ begin
  create policy "feedback_upload" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'feedback');
exception when duplicate_object then null; end $$;
