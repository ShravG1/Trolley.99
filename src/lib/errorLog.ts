import { supabase, isSupabaseConfigured } from './supabase';

// Lightweight in-house error capture (§9) — instead of a third-party like Sentry,
// uncaught errors are written to the feedback table with kind='error', so they
// ride the same daily digest into GitHub issues (and your Hub). Best-effort and
// heavily throttled so it can never spam or throw.

let sent = 0;
const MAX_PER_SESSION = 5;

function alreadySeen(key: string): boolean {
  try {
    const seen: string[] = JSON.parse(sessionStorage.getItem('trolley.errSeen') || '[]');
    if (seen.includes(key)) return true;
    seen.push(key);
    sessionStorage.setItem('trolley.errSeen', JSON.stringify(seen.slice(-50)));
    return false;
  } catch {
    return false;
  }
}

export async function captureError(message: string, stack?: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || sent >= MAX_PER_SESSION) return;
  const key = (message || 'error').slice(0, 120);
  if (alreadySeen(key)) return;
  sent++;
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return; // RLS needs a signed-in user
    const body = [message, stack ? `\n${stack.slice(0, 1500)}` : '', `\n@ ${location.pathname}`]
      .join('')
      .slice(0, 2000);
    await supabase.from('feedback').insert({
      user_id: data.user.id,
      kind: 'error',
      message: body,
      user_agent: navigator.userAgent.slice(0, 300),
    });
  } catch {
    /* the logger must never throw */
  }
}

export function initErrorLogging(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    void captureError(
      e.message || 'window.error',
      e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`
    );
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    void captureError(`Unhandled rejection: ${r?.message ?? String(r)}`, r?.stack);
  });
}
