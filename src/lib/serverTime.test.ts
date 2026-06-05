import { describe, it, expect, beforeEach } from 'vitest';
import { computeOffset, serverNow, setServerOffset } from './serverTime';

beforeEach(() => setServerOffset(0));

describe('serverTime (§6.5)', () => {
  it('computeOffset is server minus client', () => {
    expect(computeOffset(1_000_500, 1_000_000)).toBe(500);
    expect(computeOffset(1_000_000, 1_000_400)).toBe(-400);
  });

  it('serverNow falls back to the device clock when no offset is set', () => {
    const before = Date.now();
    expect(serverNow()).toBeGreaterThanOrEqual(before);
  });

  it('serverNow applies a positive offset (device clock running slow)', () => {
    setServerOffset(10_000);
    expect(serverNow()).toBeGreaterThan(Date.now() + 9_000);
  });

  it('serverNow applies a negative offset (device clock running fast)', () => {
    setServerOffset(-10_000);
    expect(serverNow()).toBeLessThan(Date.now() - 9_000);
  });
});
