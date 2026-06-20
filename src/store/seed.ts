import type { GroupMember, Item, Trip } from '@/types/models';

// Demo seed data so the UI is explorable without a live Supabase project.
// Replace with Realtime-subscribed data when the backend is wired (§13 step 4).

const GROUP_ID = '00000000-0000-0000-0000-0000000000aa';
const TRIP_ID = '00000000-0000-0000-0000-0000000000bb';

export const CURRENT_USER: GroupMember = {
  group_id: GROUP_ID,
  user_id: 'user-shrav',
  display_name: 'Shrav',
  joined_at: '2026-05-01T10:00:00Z',
  role: 'member',
};

export const seedMembers: GroupMember[] = [
  CURRENT_USER,
  { group_id: GROUP_ID, user_id: 'user-mum', display_name: 'Mum', joined_at: '2026-05-01T10:00:00Z', role: 'member' },
  { group_id: GROUP_ID, user_id: 'user-dad', display_name: 'Dad', joined_at: '2026-05-02T10:00:00Z', role: 'member' },
];

export const seedTrip: Trip = {
  id: TRIP_ID,
  group_id: GROUP_ID,
  status: 'active',
  shop_id: null, // Unsorted (#19) — demo starts with no shops
  shopper_id: null,
  shopper_name: null,
  lastminute_until: null,
  started_at: null,
  completed_at: null,
};

const base = {
  trip_id: TRIP_ID,
  acted_by: null,
  acted_by_name: null,
  substitution_note: null,
  note: null,
  unit: null,
  attempt_count: 1,
  acted_at: null,
};

export const seedItems: Item[] = [
  { ...base, id: crypto.randomUUID(), name: 'Milk', quantity: 2, category: 'dairy', priority: 'normal', status: 'pending', added_by: 'user-mum', added_by_name: 'Mum', created_at: '2026-06-01T08:00:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Eggs', quantity: 1, category: 'dairy', priority: 'normal', status: 'pending', added_by: 'user-shrav', added_by_name: 'Shrav', created_at: '2026-06-01T08:01:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Bananas', quantity: 1, category: 'produce', priority: 'normal', status: 'pending', added_by: 'user-dad', added_by_name: 'Dad', created_at: '2026-06-01T08:02:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Spinach', quantity: 1, category: 'produce', priority: 'normal', status: 'pending', added_by: 'user-mum', added_by_name: 'Mum', created_at: '2026-06-01T08:03:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Calpol', quantity: 1, category: 'health', priority: 'urgent', status: 'pending', added_by: 'user-mum', added_by_name: 'Mum', created_at: '2026-06-01T09:00:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Bread', quantity: 1, category: 'bakery', priority: 'normal', status: 'pending', added_by: 'user-shrav', added_by_name: 'Shrav', created_at: '2026-06-01T08:04:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Chicken breasts', quantity: 1, category: 'meat', priority: 'normal', status: 'pending', added_by: 'user-dad', added_by_name: 'Dad', created_at: '2026-06-01T08:05:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Pasta', quantity: 2, category: 'cupboard', priority: 'normal', status: 'pending', added_by: 'user-shrav', added_by_name: 'Shrav', created_at: '2026-06-01T08:06:00Z' },
  { ...base, id: crypto.randomUUID(), name: 'Washing up liquid', quantity: 1, category: 'household', priority: 'normal', status: 'pending', added_by: 'user-mum', added_by_name: 'Mum', created_at: '2026-06-01T08:07:00Z' },
];
