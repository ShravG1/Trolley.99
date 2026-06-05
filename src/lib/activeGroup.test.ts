import { describe, it, expect } from 'vitest';
import { resolveActiveGroup } from './activeGroup';
import type { MyGroup } from '@/types/models';

const group = (group_id: string, name: string): MyGroup => ({
  group_id,
  name,
  display_name: 'Me',
});

const groups = [group('home', 'Home'), group('flat', 'The Flat')];

describe('resolveActiveGroup (multi-group §12)', () => {
  it('keeps the preferred group when it is one of yours', () => {
    expect(resolveActiveGroup(groups, 'flat')).toBe('flat');
  });

  it('falls back to the first group when there is no preference', () => {
    expect(resolveActiveGroup(groups, null)).toBe('home');
  });

  it('falls back to the first group when the preference is stale (left it)', () => {
    expect(resolveActiveGroup(groups, 'gone')).toBe('home');
  });

  it('returns null when you have no groups', () => {
    expect(resolveActiveGroup([], 'home')).toBeNull();
  });
});
