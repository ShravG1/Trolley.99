import { describe, it, expect } from 'vitest';
import { shouldShowOverview } from './landing';

describe('shouldShowOverview (multi-group landing §12)', () => {
  it('shows the overview for a multi-group user who has not yet entered a list', () => {
    expect(shouldShowOverview(2, false)).toBe(true);
    expect(shouldShowOverview(5, false)).toBe(true);
  });

  it('does not show it once a list has been entered this session', () => {
    expect(shouldShowOverview(2, true)).toBe(false);
  });

  it('never shows it for a single-group user', () => {
    expect(shouldShowOverview(1, false)).toBe(false);
  });

  it('does not show it when you have no groups', () => {
    expect(shouldShowOverview(0, false)).toBe(false);
  });
});
