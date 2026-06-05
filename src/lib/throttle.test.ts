import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('throttle (§6.4)', () => {
  it('fires immediately on the leading edge', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
  });

  it('coalesces a burst into one leading + one trailing call with the latest args', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1); // leading — fires now
    t(2);
    t(3); // latest within the window
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3); // trailing delivers the final state
  });

  it('does not schedule a trailing call when only the leading call happened', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t('only');
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops a queued trailing call', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1); // leading
    t(2); // queued trailing
    t.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1); // only the leading survived
  });
});
