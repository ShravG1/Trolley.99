-- In-app feedback / bug reports (§9 observability). Users submit from Settings;
-- the owner reads them (dashboard / Management API). Reads are intentionally
-- owner-only — no SELECT policy — so members can't see each other's reports.
create table feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  group_id   uuid references groups (id) on delete set null,
  kind       text not null default 'feedback',
  message    text not null check (char_length(trim(message)) between 1 and 2000),
  user_agent text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Any signed-in user (including anonymous) may submit, attributed to themselves.
create policy feedback_insert on feedback
  for insert
  with check (auth.uid() is not null and (user_id is null or user_id = auth.uid()));
