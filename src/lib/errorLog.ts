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

// A minimal, DOM-free shape of the bits of ErrorEvent we read, so the message
// builder below can be unit-tested without a browser.
export interface ErrorEventLike {
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  error?: { message?: string; stack?: string } | null;
}

// Browsers deliver a script error from a cross-origin (or CORS-tainted) script
// as the opaque "Script error." with an empty filename and 0:0 position and NO
// `error` object — the spec masks the detail (issue #30). When that happens the
// bare message is useless, so we tag it as cross-origin-masked and attach the
// route + full URL so the next occurrence is at least locatable. When `error`
// IS present (same-origin script with a real stack) we surface that instead.
export function describeErrorEvent(
  e: ErrorEventLike,
  ctx: { pathname: string; href: string }
): { message: string; stack?: string } {
  if (e.error) {
    return {
      message: e.error.message || e.message || 'window.error',
      stack: e.error.stack || `${e.filename ?? ''}:${e.lineno ?? 0}:${e.colno ?? 0}`,
    };
  }
  const masked = !e.message || e.message === 'Script error.' || !e.filename;
  if (masked) {
    // No detail available from the event itself — record everything we can see
    // so this stops being an un-actionable "Script error." (#30).
    return {
      message: `Script error (cross-origin, detail masked) @ ${ctx.pathname}`,
      stack: `location: ${ctx.href}\nsource: ${e.filename || '<masked>'}:${e.lineno ?? 0}:${e.colno ?? 0}`,
    };
  }
  return {
    message: e.message || 'window.error',
    stack: `${e.filename}:${e.lineno ?? 0}:${e.colno ?? 0}`,
  };
}

export function initErrorLogging(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    // Resource-load failures (a chunk/img/font 404) arrive as an `error` event on
    // the element, not on window — they have a `target` but no `message`. Capture
    // them distinctly so they don't masquerade as script crashes.
    const target = e.target as (HTMLElement & { src?: string; href?: string }) | null;
    if (target && target !== (window as unknown as EventTarget) && (target.src || target.href)) {
      void captureError(
        `Resource failed to load: ${target.tagName?.toLowerCase() ?? 'asset'}`,
        `url: ${target.src || target.href}\n@ ${location.pathname}`
      );
      return;
    }
    const { message, stack } = describeErrorEvent(e, {
      pathname: location.pathname,
      href: location.href,
    });
    void captureError(message, stack);
  }, true); // capture phase so resource-load errors (which don't bubble) are seen
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    void captureError(`Unhandled rejection: ${r?.message ?? String(r)}`, r?.stack);
  });
}
