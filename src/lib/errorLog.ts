import { supabase, isSupabaseConfigured } from './supabase';

// Lightweight in-house error capture (§9) — instead of a third-party like Sentry,
// uncaught errors are written to the feedback table with kind='error', so they
// ride the same daily digest into GitHub issues (and your Hub). Best-effort and
// heavily throttled so it can never spam or throw.

let sent = 0;
const MAX_PER_SESSION = 5;

/**
 * Strip credentials out of a URL before it is written anywhere.
 *
 * Captured errors go into the `feedback` table, and the daily digest opens a
 * GitHub issue for each one — so anything in here leaves the app permanently.
 * Two URL shapes in this app carry a live credential:
 *
 *   * the magic-link return, `…/#access_token=ey…&refresh_token=…` — Supabase
 *     hands the session back in the fragment, so an error thrown on that first
 *     paint would have filed a working session token into an issue.
 *   * an invite link, `/join/<256-bit token>` — the token IS the key to the
 *     household (§5.2), and it's valid for seven days.
 *
 * Drop the query and fragment wholesale (nothing in this app needs them for
 * debugging) and mask the invite token, keeping the route shape so the report
 * still tells you where it happened. Exported for unit tests.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  return url
    .replace(/[?#].*$/, (m) => (m[0] === '#' ? '#<redacted>' : '?<redacted>'))
    .replace(/\/join\/[^/]+/i, '/join/<redacted>');
}

/**
 * The same redaction applied to every URL embedded in a longer string (a stack,
 * a rejection message), leaving the surrounding prose alone — so "is x a
 * function?" keeps its question mark while a token-bearing URL next to it
 * doesn't keep its token. A bare `/join/<token>` path with no scheme is caught
 * too, since that's exactly what `location.pathname` gives us.
 */
export function redactUrls(text: string): string {
  return text
    .replace(/\bhttps?:\/\/\S+/gi, (u) => redactUrl(u))
    .replace(/\/join\/[^/\s]+/gi, '/join/<redacted>');
}

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
    // Redact on the way OUT, not just at each call site: this is the single
    // funnel every captured error passes through before it's persisted, so a
    // future caller can't accidentally route a token-bearing URL around it.
    const body = redactUrls(
      [message, stack ? `\n${stack.slice(0, 1500)}` : '', `\n@ ${location.pathname}`].join('')
    ).slice(0, 2000);
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
    // so this stops being an un-actionable "Script error." (#30). The full href
    // is the most useful thing here AND the most dangerous: on the magic-link
    // return it holds a live session token in the fragment. Redact it.
    return {
      message: `Script error (cross-origin, detail masked) @ ${redactUrl(ctx.pathname)}`,
      stack: `location: ${redactUrl(ctx.href)}\nsource: ${redactUrl(e.filename || '<masked>')}:${e.lineno ?? 0}:${e.colno ?? 0}`,
    };
  }
  return {
    message: e.message || 'window.error',
    stack: `${e.filename}:${e.lineno ?? 0}:${e.colno ?? 0}`,
  };
}

// Returns true when url belongs to the same origin as base — only same-origin
// resource failures are ours to fix. Exported for unit tests.
export function isCapturable(url: string, base: string): boolean {
  try {
    return new URL(url, base).origin === new URL(base).origin;
  } catch {
    return true; // keep if URL is unparseable
  }
}

export function initErrorLogging(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    // Resource-load failures (a chunk/img/font 404) arrive as an `error` event on
    // the element, not on window — they have a `target` but no `message`. Skip
    // third-party resources (e.g. Vercel Live toolbar) — those aren't our bugs.
    const target = e.target as (HTMLElement & { src?: string; href?: string }) | null;
    if (target && target !== (window as unknown as EventTarget) && (target.src || target.href)) {
      const url = target.src || target.href!;
      if (!isCapturable(url, location.href)) return;
      void captureError(
        `Resource failed to load: ${target.tagName?.toLowerCase() ?? 'asset'}`,
        `url: ${url}\n@ ${location.pathname}`
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
