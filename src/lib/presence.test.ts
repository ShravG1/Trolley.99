import { describe, it, expect } from 'vitest';
import { viewerNames } from './presence';
import type { GroupMember } from '@/types/models';

const member = (user_id: string, display_name: string): GroupMember => ({
  group_id: 'g',
  user_id,
  display_name,
  joined_at: '2026-01-01T00:00:00Z',
  role: 'member',
});

const members = [member('a', 'Ann'), member('b', 'Bob'), member('c', 'Cat')];

describe('viewerNames (live presence §6.4)', () => {
  it('maps present ids to names, excluding self', () => {
    expect(viewerNames(['a', 'b'], members, ['a'])).toEqual(['Bob']);
  });

  it('excludes the shopper as well as self (spectator view)', () => {
    expect(viewerNames(['a', 'b', 'c'], members, ['a', 'b'])).toEqual(['Cat']);
  });

  it('drops ids not in the members list', () => {
    expect(viewerNames(['a', 'ghost'], members, ['a'])).toEqual([]);
  });

  it('returns [] when nobody else is present', () => {
    expect(viewerNames(['a'], members, ['a'])).toEqual([]);
  });
});
