import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/** Create a group + first membership + empty active trip in one RPC (§5.2). */
export async function createGroup(name: string, displayName: string): Promise<string | null> {
  if (!supabase) return null;
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

/** The groups the signed-in user belongs to (V1 UI assumes one, §12). */
export async function listMyGroups(): Promise<Array<{ group_id: string; display_name: string }>> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('group_members').select('group_id, display_name');
  if (error) throw error;
  return data ?? [];
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
