// Domain types (§4). These are now DERIVED from the schema-generated
// `src/types/database.ts` (regenerate with `supabase gen types typescript
// --project-id <ref>`), so a column rename/removal/type change breaks the build
// loudly instead of drifting silently (§6.1). Only two kinds of deviation from
// the raw rows are kept deliberately:
//   • narrowings — DB stores `category`/`recurrence_rule` as `text`; the app
//     knows the tighter union (AisleKey / RecurrenceRule).
//   • client-only fields — e.g. `Trip.shopper_name` is resolved from
//     group_members at read time and never persisted on the `trips` row.

import type { AisleKey } from '@/lib/aisles';
import type { Database } from '@/types/database';

type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

// Enums come straight from the schema — drift here is now a type error.
export type TripStatus = Database['public']['Enums']['trip_status'];
export type ItemStatus = Database['public']['Enums']['item_status'];
export type Priority = Database['public']['Enums']['priority'];

// `recurrence_rule` is free `text` in the DB; the app constrains it.
export type RecurrenceRule =
  | 'daily'
  | 'twice_weekly'
  | 'thrice_weekly'
  | 'weekly'
  | 'custom';

export type Group = Row<'groups'>;

// A named tab within a group's list (#19). Each shop runs its own trip
// lifecycle; items belong to a shop via their trip's shop_id (NULL = Unsorted).
export type Shop = Row<'shops'>;

export interface GroupMember extends Omit<Row<'group_members'>, 'role'> {
  role: 'member';
}

// A group the signed-in user belongs to: the group's own name plus their
// per-group display name. Powers the multi-group switcher (§12). This is a
// join shape, not a single table row, so it stays hand-written.
export interface MyGroup {
  group_id: string;
  display_name: string;
  name: string;
}

export type Invite = Row<'invites'>;

export interface Trip extends Row<'trips'> {
  // Resolved from group_members at read time for display; never on the row (§6.5).
  shopper_name: string | null;
  // shop_id comes from the row (#19): NULL = the Unsorted tab.
}

export interface Item extends Omit<Row<'items'>, 'category' | 'added_by'> {
  category: AisleKey; // narrowed from text
  added_by: string; // never null in practice (set by the add RPC/audit trail)
}

export interface RecurringItem
  extends Omit<Row<'recurring_items'>, 'category' | 'recurrence_rule'> {
  category: AisleKey; // narrowed from text
  recurrence_rule: RecurrenceRule; // narrowed from text
}

export type HotListEntry = Row<'hot_list'>;
