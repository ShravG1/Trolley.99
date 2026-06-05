// Domain types (§4). In production these are GENERATED from the schema via
// `supabase gen types typescript` (§6.1) so a schema change breaks the build
// loudly. This hand-written mirror documents the shape and powers the local
// store until the generated file lands at src/types/database.ts.

import type { AisleKey } from '@/lib/aisles';

export type TripStatus = 'active' | 'shopping' | 'completed';
export type ItemStatus = 'pending' | 'bought' | 'substituted' | 'not_found' | 'deleted';
export type Priority = 'normal' | 'urgent';
export type RecurrenceRule =
  | 'daily'
  | 'twice_weekly'
  | 'thrice_weekly'
  | 'weekly'
  | 'custom';

export interface Group {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
  role: 'member';
}

// A group the signed-in user belongs to: the group's own name plus their
// per-group display name. Powers the multi-group switcher (§12).
export interface MyGroup {
  group_id: string;
  display_name: string;
  name: string;
}

export interface Invite {
  group_id: string;
  code: string;
  token: string;
  expires_at: string | null;
  created_by: string;
}

export interface Trip {
  id: string;
  group_id: string;
  status: TripStatus;
  shopper_id: string | null;
  shopper_name: string | null;
  lastminute_until: string | null; // timestamptz — judged against server time (§6.5)
  started_at: string | null;
  completed_at: string | null;
}

export interface Item {
  id: string; // client-generated UUID for optimistic dedupe (§6.3)
  trip_id: string;
  name: string;
  quantity: number; // >= 1
  category: AisleKey;
  priority: Priority;
  status: ItemStatus;
  added_by: string;
  added_by_name: string; // snapshot for the audit trail (§11.2)
  acted_by: string | null;
  acted_by_name: string | null;
  substitution_note: string | null;
  attempt_count: number; // default 1, bumped on rollover (§7.4)
  created_at: string;
  acted_at: string | null;
}

export interface RecurringItem {
  id: string;
  group_id: string;
  name: string;
  default_qty: number;
  category: AisleKey;
  recurrence_rule: RecurrenceRule;
  active: boolean;
  last_added_at: string | null;
}

export interface HotListEntry {
  group_id: string;
  item_name: string;
  frequency: number;
}
