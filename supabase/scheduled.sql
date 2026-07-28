-- Recurring-items + feedback-digest + category-sweep scheduler (§2.8, §9).
-- Applied directly to the hosted project — NOT a migration, because it depends on
-- pg_cron/pg_net + the project URL and would break `supabase db reset` in CI.
--
-- Both functions now run with verify_jwt=false and are gated by a shared
-- CRON_SECRET instead (the public anon JWT must not be able to trigger them).
-- The secret lives in Supabase Vault under the name 'cron_secret' (created once,
-- never committed); each job reads it at fire-time and sends it as x-cron-secret.
-- The function compares it against its CRON_SECRET env var (§5.4).
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
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);

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
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Weekly item-category review (0016). Every Monday it looks at what each
-- household has added recently and gives each item name the aisle they actually
-- file it under, so the next add lands in the right place without anyone
-- re-aisling it again. Pure SQL in-database — no edge function, no HTTP, so
-- there's no secret to gate: refresh_item_categories() is REVOKEd from every
-- client role and only reachable as the cron job owner.
select cron.unschedule('trolley-category-sweep')
  where exists (select 1 from cron.job where jobname = 'trolley-category-sweep');

select cron.schedule(
  'trolley-category-sweep',
  '20 4 * * 1', -- 04:20 UTC Mondays, well clear of the daily jobs
  $$ select public.refresh_item_categories(); $$
);
