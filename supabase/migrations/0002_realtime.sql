-- Realtime publication (§6.4). WITHOUT this, Postgres emits no change events and
-- the whole live multi-device sync silently does nothing — adds/ticks on one
-- device never reach another. RLS still governs what each subscriber receives.
-- (This is separate from RLS and easy to miss: new tables are NOT auto-published.)
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table trips;
