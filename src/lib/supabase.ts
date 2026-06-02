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

/** Join a group via the RPC — never raw table access (§5.2). */
export async function joinGroup(code: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('join_group', { p_code: code });
  if (error) throw error;
  return data as string;
}
