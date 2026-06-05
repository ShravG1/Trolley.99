// Edge Function: recurring (§2.8, §7.4, §12)
//
// Scheduled (cron) — adds group-level routine items to each group's ACTIVE trip
// on schedule. Idempotent per (item, date) via last_added_at so a re-run never
// double-adds. If a group is mid-shop, the item lands on the NEXT active trip,
// not the locked one — we only ever insert into the row where status='active'
// (§12).
//
// Runs with service_role (bypasses RLS) because there's no user context; it
// must therefore be careful to scope every write by group_id.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// How many days between firings for each rule.
function dueToday(rule: string, lastAdded: string | null): boolean {
  const today = new Date();
  const dow = today.getUTCDay(); // 0=Sun … (real impl uses UK time + DST, §6.5)
  const last = lastAdded ? new Date(lastAdded) : null;
  const sameDay = last && last.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
  if (sameDay) return false; // idempotent per day
  switch (rule) {
    case 'daily':
      return true;
    case 'weekly':
      return dow === 1; // Mondays
    case 'twice_weekly':
      return dow === 1 || dow === 4;
    case 'thrice_weekly':
      return dow === 1 || dow === 3 || dow === 5;
    default:
      return false;
  }
}

Deno.serve(async () => {
  const { data: recurring } = await admin
    .from('recurring_items')
    .select('*')
    .eq('active', true);

  let added = 0;
  for (const r of recurring ?? []) {
    if (!dueToday(r.recurrence_rule, r.last_added_at)) continue;

    // The current ACTIVE trip for the group (mid-shop trips are skipped — item
    // lands on the next one, §12).
    const { data: trip } = await admin
      .from('trips')
      .select('id')
      .eq('group_id', r.group_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!trip) continue;

    // Dedupe: skip if a live row with the same normalised name already exists
    // on this trip (§7.4). Escape LIKE metachars so a name like "100% milk" or
    // "wd_40" matches literally rather than as a wildcard pattern.
    const namePattern = r.name.trim().replace(/[\\%_]/g, '\\$&');
    const { data: existing } = await admin
      .from('items')
      .select('id')
      .eq('trip_id', trip.id)
      .neq('status', 'deleted')
      .ilike('name', namePattern);
    if (existing && existing.length > 0) {
      await admin.from('recurring_items').update({ last_added_at: new Date().toISOString() }).eq('id', r.id);
      continue;
    }

    // Attribute scheduled items to the group's creator (items.added_by is a real
    // FK to auth.users — a group id would violate it). The name snapshot stays
    // "Schedule" so the row reads "Added on schedule" (§1.7, §11.2).
    const { data: grp } = await admin
      .from('groups')
      .select('created_by')
      .eq('id', r.group_id)
      .maybeSingle();
    if (!grp) continue;

    await admin.from('items').insert({
      id: crypto.randomUUID(),
      trip_id: trip.id,
      name: r.name,
      quantity: r.default_qty,
      category: r.category,
      priority: 'normal',
      status: 'pending',
      added_by: grp.created_by,
      added_by_name: 'Schedule', // surfaces the "Added on schedule" note (§1.7)
      attempt_count: 1,
      created_at: new Date().toISOString(),
    });
    await admin.from('recurring_items').update({ last_added_at: new Date().toISOString() }).eq('id', r.id);
    added++;
  }

  return new Response(JSON.stringify({ ok: true, added }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
