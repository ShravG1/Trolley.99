import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MyGroup } from '@/types/models';

// Supabase client (§5.3, §6.1).
//
// ONLY the anon key + VAPID *public* key live here — they ship in the client and
// are public by design. The security model is RLS, not key secrecy (§5.1). The
// service_role key and VAPID *private* key live ONLY in Edge Function env (§5.4)
// and must never appear in this bundle.
//
// Sessions are long-lived with auto-refresh so nobody is bounced to login
// mid-shop (§5.3). Token storage defaults to localStorage; that is acceptable
// ONLY because XSS is locked down (React escaping, no dangerouslySetInnerHTML,
// CSP — §5.5, §5.7).

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Best-effort server clock from the REST endpoint's `Date` header (§6.5). Used
 * only to correct the UI's window/staleness checks for a skewed device clock —
 * never a security boundary (RLS judges the real now()). Null on any failure. */
export async function fetchServerTime(): Promise<number | null> {
  if (!url || !anonKey) return null;
  try {
    const res = await fetch(`${url}/rest/v1/`, { method: 'HEAD', headers: { apikey: anonKey } });
    const date = res.headers.get('date');
    const ms = date ? new Date(date).getTime() : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

export async function signInWithMagicLink(email: string): Promise<void> {
  if (!supabase) return;
  // The response is intentionally uniform regardless of whether the email
  // exists — no enumeration (§5.3).
  await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
}

/**
 * Silent anonymous sign-in (the default path). Mints a real auth identity with
 * no email/password so RLS still applies, but there's zero login friction.
 * Returns false if anonymous sign-ins are disabled on the project (caller then
 * falls back to the email recovery screen).
 */
export async function signInAnonymously(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}

/** True once the current session belongs to a permanent (email-attached) user. */
export function isAnonymousUser(): boolean {
  // Set from the session elsewhere; this is a convenience for components.
  return _isAnon;
}
let _isAnon = true;
export function setAnonymousFlag(v: boolean) {
  _isAnon = v;
}

/**
 * Attach an email to the current (anonymous) account so it survives a device
 * change — "save your list". Supabase sends a confirmation link; once clicked,
 * the account becomes permanent and can be recovered by magic link on any
 * device. Low-friction, opt-in (§11 minimisation).
 */
export async function attachEmail(email: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${window.location.origin}/` }
  );
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * Make sure we have a session before a write. Belt-and-braces for browsers that
 * drop the anonymous session (e.g. Safari opened from an in-app launcher with
 * restricted storage) — without it, an RPC fires unauthenticated and fails.
 */
export async function ensureSession(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    // Validate the user still exists, but ONLY drop the session on a definitive
    // 403 (user genuinely gone) — never on a transient network error, or we'd
    // wrongly sign a valid user out and lose their group.
    const { error } = await supabase.auth.getUser();
    if (!error || (error as { status?: number }).status !== 403) return;
    await supabase.auth.signOut();
  }
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`sign-in failed: ${error.message}`);
}

/** Create a group + first membership + empty active trip in one RPC (§5.2). */
export async function createGroup(name: string, displayName: string): Promise<string | null> {
  if (!supabase) return null;
  await ensureSession();
  const { data, error } = await supabase.rpc('create_group', {
    p_name: name,
    p_display_name: displayName,
  });
  if (error) throw error;
  return data as string;
}

/** Join a group via the RPC — never raw table access (§5.2). */
export async function joinGroup(code: string, displayName: string): Promise<string | null> {
  if (!supabase) return null;
  await ensureSession();
  const { data, error } = await supabase.rpc('join_group', {
    p_code: code,
    p_display_name: displayName,
  });
  if (error) throw error;
  return data as string;
}

/** Mint a fresh invite (code + link token) for a group (§5.2). */
export async function createInvite(
  groupId: string
): Promise<{ code: string; token: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('create_invite', { p_group_id: groupId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { code: row.code as string, token: row.token as string } : null;
}

/** The groups the signed-in user belongs to, with each group's name for the
 * multi-group switcher (§12). Oldest-first for a stable switcher order. */
export async function listMyGroups(): Promise<MyGroup[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, display_name, joined_at, groups(name)')
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => {
    // The embedded to-one relation comes back as an object (or, depending on
    // PostgREST's inference, a single-element array) — handle both.
    const g = (r as { groups?: { name?: string } | { name?: string }[] }).groups;
    const name = (Array.isArray(g) ? g[0]?.name : g?.name) ?? 'Group';
    return {
      group_id: r.group_id as string,
      display_name: r.display_name as string,
      name,
    };
  });
}

/** At-a-glance status for each group on the "Your lists" overview (§12): is
 * someone shopping, and how many items are still to get. Two queries total
 * regardless of group count (no N+1); all RLS-scoped to groups you're in. */
export interface GroupSummary {
  status: 'active' | 'shopping' | null;
  shopping: boolean;
  pending: number;
}
export async function getGroupSummaries(
  groupIds: string[]
): Promise<Record<string, GroupSummary>> {
  const empty: Record<string, GroupSummary> = {};
  if (!supabase || groupIds.length === 0) return empty;

  // Current (active|shopping) trip per group — one row each in normal operation.
  const { data: trips } = await supabase
    .from('trips')
    .select('id, group_id, status')
    .in('group_id', groupIds)
    .in('status', ['active', 'shopping']);

  const current: Record<string, { tripId: string; status: 'active' | 'shopping' }> = {};
  const tripIds: string[] = [];
  for (const t of trips ?? []) {
    current[t.group_id as string] = { tripId: t.id as string, status: t.status as 'active' | 'shopping' };
    tripIds.push(t.id as string);
  }

  // Pending counts for all those trips in a single query, tallied client-side.
  const counts: Record<string, number> = {};
  if (tripIds.length) {
    const { data: items } = await supabase
      .from('items')
      .select('trip_id')
      .in('trip_id', tripIds)
      .eq('status', 'pending');
    for (const i of items ?? []) {
      const tid = i.trip_id as string;
      counts[tid] = (counts[tid] ?? 0) + 1;
    }
  }

  const out: Record<string, GroupSummary> = {};
  for (const gid of groupIds) {
    const cur = current[gid];
    out[gid] = cur
      ? { status: cur.status, shopping: cur.status === 'shopping', pending: counts[cur.tripId] ?? 0 }
      : { status: null, shopping: false, pending: 0 };
  }
  return out;
}

/** Reporting (§2.9): how many items each member bought/substituted across the
 * group's COMPLETED trips, within a rolling range. RLS-scoped to the group; the
 * current in-progress trip is excluded (it counts once it's finished). */
export async function getReportingTally(
  groupId: string,
  range: 'week' | 'month' | 'all'
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!supabase) return out;
  let q = supabase
    .from('items')
    .select('acted_by_name, status, trips!inner(group_id, status, completed_at)')
    .eq('trips.group_id', groupId)
    .eq('trips.status', 'completed')
    .in('status', ['bought', 'substituted']);
  if (range !== 'all') {
    const cutoff = new Date(Date.now() - (range === 'week' ? 7 : 30) * 86_400_000).toISOString();
    q = q.gte('trips.completed_at', cutoff);
  }
  const { data, error } = await q;
  if (error) return out;
  for (const row of data ?? []) {
    const name = (row as { acted_by_name?: string | null }).acted_by_name;
    if (name) out[name] = (out[name] ?? 0) + 1;
  }
  return out;
}

/** Frequency-ranked item names learned from completed trips (§2.4 type-ahead). */
export async function getHotList(groupId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('hot_list')
    .select('item_name')
    .eq('group_id', groupId)
    .order('frequency', { ascending: false })
    .limit(12);
  return (data ?? []).map((r) => r.item_name as string);
}

// --- Lifecycle + recovery RPCs (§2.6, §11.4) -------------------------------
export async function takeOverShopping(tripId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('take_over_shopping', { p_trip_id: tripId });
  if (error) throw error;
  return data as string | null;
}
export async function leaveGroup(groupId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (error) throw error;
}
export async function clearHistory(groupId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('clear_history', { p_group_id: groupId });
  if (error) throw error;
}
export async function deleteAccount(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

// --- Recurring items CRUD (§2.8) -------------------------------------------
export interface RecurringRow {
  id: string;
  name: string;
  default_qty: number;
  category: string;
  recurrence_rule: string;
  active: boolean;
}
export async function listRecurring(groupId: string): Promise<RecurringRow[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('recurring_items')
    .select('id, name, default_qty, category, recurrence_rule, active')
    .eq('group_id', groupId)
    .order('name');
  return (data ?? []) as RecurringRow[];
}
export async function addRecurring(
  groupId: string,
  name: string,
  rule: string,
  category: string
): Promise<void> {
  if (!supabase) return;
  await supabase.from('recurring_items').insert({
    group_id: groupId,
    name: name.trim(),
    recurrence_rule: rule,
    category,
    default_qty: 1,
    active: true,
  });
}
export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  if (!supabase) return;
  await supabase.from('recurring_items').update({ active }).eq('id', id);
}
export async function deleteRecurring(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('recurring_items').delete().eq('id', id);
}

/** Submit in-app feedback / a bug report (§9), with an optional screenshot.
 * Owner reads it server-side; the screenshot lands in the private 'feedback'
 * bucket and the digest signs a URL for the GitHub issue. */
export async function sendFeedback(
  kind: 'feedback' | 'bug',
  message: string,
  groupId?: string,
  screenshot?: File | null
): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id ?? null;

  let screenshot_path: string | null = null;
  if (screenshot && uid) {
    const ext = (screenshot.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${uid}/${crypto.randomUUID()}.${ext || 'png'}`;
    const { error: upErr } = await supabase.storage
      .from('feedback')
      .upload(path, screenshot, { contentType: screenshot.type || 'image/png' });
    if (!upErr) screenshot_path = path; // upload failure shouldn't block the text report
  }

  const { error } = await supabase.from('feedback').insert({
    user_id: uid,
    group_id: groupId ?? null,
    kind,
    message: message.trim(),
    user_agent: navigator.userAgent.slice(0, 300),
    screenshot_path,
  });
  if (error) throw error;
}
