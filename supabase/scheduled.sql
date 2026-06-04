-- Recurring-items scheduler (§2.8). Applied directly to the hosted project — NOT
-- a migration, because it depends on pg_cron/pg_net + the project URL and would
-- break `supabase db reset` in CI.
--
-- Runs the (idempotent) `recurring` Edge Function once a day. The Authorization
-- header carries the PUBLIC anon key (a valid project JWT, already shipped in the
-- client) so verify_jwt passes — no secret is stored in the database. The
-- function uses its own service_role env internally.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('trolley-recurring')
  where exists (select 1 from cron.job where jobname = 'trolley-recurring');

select cron.schedule(
  'trolley-recurring',
  '0 6 * * *', -- 06:00 UTC daily; the function decides what's due per group
  $$
    select net.http_post(
      url := 'https://lztexunynwdrjjhcbgbi.supabase.co/functions/v1/recurring',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6dGV4dW55bndkcmpqaGNiZ2JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0Mjc3ODYsImV4cCI6MjA5NjAwMzc4Nn0.X6go87s4I8cjWFonEFpQ3IaTJGwUGB-nZl0RDoK1XUY'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Feedback → GitHub digest (§9). Once a day, files un-pushed feedback as labelled
-- GitHub issues (the function uses its GITHUB_PAT/GITHUB_REPO secrets). Same
-- public-anon-key bearer pattern.
select cron.unschedule('trolley-feedback-digest')
  where exists (select 1 from cron.job where jobname = 'trolley-feedback-digest');

select cron.schedule(
  'trolley-feedback-digest',
  '0 8 * * *', -- 08:00 UTC daily
  $$
    select net.http_post(
      url := 'https://lztexunynwdrjjhcbgbi.supabase.co/functions/v1/feedback-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6dGV4dW55bndkcmpqaGNiZ2JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0Mjc3ODYsImV4cCI6MjA5NjAwMzc4Nn0.X6go87s4I8cjWFonEFpQ3IaTJGwUGB-nZl0RDoK1XUY'
      ),
      body := '{}'::jsonb
    );
  $$
);
