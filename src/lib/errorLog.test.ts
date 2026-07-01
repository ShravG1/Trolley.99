import { describe, it, expect } from 'vitest';
import { describeErrorEvent } from './errorLog';

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
