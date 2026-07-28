import { describe, it, expect } from 'vitest';
import { describeErrorEvent, isCapturable, redactUrl, redactUrls } from './errorLog';

// Issue #30: an auto-captured "[Trolley error] Script error." with :0:0 and no
// stack. That's the browser masking a cross-origin script error — the raw event
// carries no detail. describeErrorEvent must turn each event shape into the most
// actionable message + stack we can produce.

const ctx = { pathname: '/trip/abc', href: 'https://trolley-nine.vercel.app/trip/abc' };

describe('describeErrorEvent', () => {
  it('surfaces the real message + stack when an error object is present', () => {
    const out = describeErrorEvent(
      {
        message: 'Uncaught TypeError: x is not a function',
        filename: 'https://trolley-nine.vercel.app/assets/index-abc.js',
        lineno: 10,
        colno: 5,
        error: { message: 'x is not a function', stack: 'TypeError: x is not a function\n  at f (index.js:10:5)' },
      },
      ctx
    );
    expect(out.message).toBe('x is not a function');
    expect(out.stack).toContain('at f (index.js:10:5)');
  });

  it('tags a cross-origin-masked "Script error." with the route and full URL', () => {
    const out = describeErrorEvent(
      { message: 'Script error.', filename: '', lineno: 0, colno: 0, error: null },
      ctx
    );
    expect(out.message).toBe('Script error (cross-origin, detail masked) @ /trip/abc');
    expect(out.stack).toContain('location: https://trolley-nine.vercel.app/trip/abc');
    // Must NOT be logged as the bare, useless "Script error.".
    expect(out.message).not.toBe('Script error.');
  });

  it('treats an empty message with no error object as masked too', () => {
    const out = describeErrorEvent({ message: '', error: null }, ctx);
    expect(out.message).toContain('cross-origin, detail masked');
    expect(out.stack).toContain('/trip/abc');
  });

  it('keeps filename:line:col for a same-origin error that has no error object', () => {
    const out = describeErrorEvent(
      { message: 'Boom', filename: 'https://trolley-nine.vercel.app/assets/x.js', lineno: 3, colno: 9, error: null },
      ctx
    );
    expect(out.message).toBe('Boom');
    expect(out.stack).toBe('https://trolley-nine.vercel.app/assets/x.js:3:9');
  });
});

describe('isCapturable', () => {
  const base = 'https://trolley-nine.vercel.app/shop';

  it('captures same-origin absolute URLs', () => {
    expect(isCapturable('https://trolley-nine.vercel.app/assets/chunk.js', base)).toBe(true);
  });

  it('captures same-origin relative URLs', () => {
    expect(isCapturable('/assets/img.png', base)).toBe(true);
  });

  it('drops cross-origin URLs (e.g. Vercel Live toolbar)', () => {
    expect(isCapturable('https://vercel.live/_next-live/feedback/feedback.js', base)).toBe(false);
  });

  it('drops other third-party origins', () => {
    expect(isCapturable('https://cdn.jsdelivr.net/some/lib.js', base)).toBe(false);
  });
});

// Captured errors are persisted to `feedback` and the daily digest opens a
// GitHub issue for each. Two URL shapes in this app carry a live credential —
// the magic-link fragment and the /join/<token> invite — so neither may survive
// into a report.
describe('redactUrl / redactUrls', () => {
  it('strips the magic-link session token from the fragment', () => {
    const href = 'https://trolley-nine.vercel.app/#access_token=eyJhbGciOi.SECRET&refresh_token=r-SECRET';
    const out = redactUrl(href);
    expect(out).not.toMatch(/SECRET/);
    expect(out).toBe('https://trolley-nine.vercel.app/#<redacted>');
  });

  it('strips a query string too', () => {
    expect(redactUrl('https://x.test/cb?code=abc123')).toBe('https://x.test/cb?<redacted>');
  });

  it('masks the invite token but keeps the route shape', () => {
    expect(redactUrl('https://trolley-nine.vercel.app/join/deadbeefcafe0123'))
      .toBe('https://trolley-nine.vercel.app/join/<redacted>');
    expect(redactUrl('/join/deadbeefcafe0123')).toBe('/join/<redacted>');
  });

  it('leaves an ordinary route alone', () => {
    expect(redactUrl('https://trolley-nine.vercel.app/settings'))
      .toBe('https://trolley-nine.vercel.app/settings');
    expect(redactUrl('')).toBe('');
  });

  it('redacts URLs inside a longer string without eating the prose', () => {
    const body = 'TypeError: x is not a function?\n  at https://app.test/a.js#access_token=SECRET\n@ /join/tok3n';
    const out = redactUrls(body);
    expect(out).not.toMatch(/SECRET/);
    expect(out).not.toMatch(/tok3n/);
    expect(out).toContain('is not a function?'); // prose question mark survives
    expect(out).toContain('/join/<redacted>');
  });

  it('describeErrorEvent never reports a raw credential-bearing href', () => {
    const out = describeErrorEvent(
      { message: 'Script error.', filename: '', lineno: 0, colno: 0, error: null },
      { pathname: '/join/tok3n', href: 'https://app.test/join/tok3n#access_token=SECRET' }
    );
    expect(`${out.message} ${out.stack}`).not.toMatch(/SECRET|tok3n/);
  });
});
