-- Track which feedback rows have been pushed to GitHub (the daily digest job)
-- so each is opened as an issue exactly once.
alter table feedback add column if not exists pushed_at timestamptz;
