# Security model

The spine is **Row Level Security**. The Supabase anon key ships inside the client
and is public; RLS is the only thing stopping one household reading another's list
(§5.1). It's written first and tested hardest — see `supabase/tests/rls_test.sql`.

## RLS (§5.1)

- RLS is enabled on **every** table in `0001_init.sql`.
- Core rule: *you may only touch a row whose group you belong to.*
- The membership check is centralised in `is_member(gid)`, declared
  `SECURITY DEFINER` to dodge the `group_members`-querying-`group_members`
  recursion gotcha. `trip_group(tid)` resolves an item's trip to its group.
- Realtime respects RLS, but only because subscriptions are group-scoped — see
  `docs/ARCHITECTURE.md`.

| Table | Read | Write |
|-------|------|-------|
| `groups` | `is_member(id)` | create: authed (`created_by = uid`); update/delete: creator |
| `group_members` | own rows OR `is_member` | inserts via `join_group` RPC only; delete = self-leave / creator-remove |
| `invites` | `is_member` | mint/revoke by members |
| `trips` | `is_member` | members; meaningful transitions via RPCs |
| `items` | `is_member(trip→group)` | insert `WITH CHECK` enforces window/shopper (§7.2); update: members |
| `recurring_items` | `is_member` | members |
| `hot_list` | `is_member` read | written server-side (service_role) |
| `push_subscriptions` | own only | own only |

## Invite links = credentials (§5.2)

- The link carries a long high-entropy `token`; the short `code` (≥8 unambiguous
  chars) is the fallback.
- Invites expire (`expires_at`, default ~7 days) and are revocable (delete row).
- **Joining is the `join_group` RPC**, never a raw `group_members` insert — nobody
  is granted insert on that table.
- **Decision (explicit): auto-join on a valid code.** Fine for a household, but it
  means the link *is* the credential — so it must be rotatable and expirable, which
  it is. Member-approval would be the alternative if groups ever go semi-public.
- Rate-limit code attempts per IP/user so the short code can't be brute-forced
  (platform rate limiting + the `code` uniqueness/entropy).

## Auth (§5.3)

- Magic link only. The link *is* the auth: short TTL, single-use, bound to the
  requesting email. The "magic link sent" response is uniform whether or not the
  email exists (no enumeration).
- Sessions are long-lived with refresh-token rotation (`config.toml`) so nobody is
  bounced to login mid-shop.
- **Token storage decision (explicit): `localStorage`** (Supabase default). Accepted
  *only because* XSS is locked down — React escaping everywhere, zero
  `dangerouslySetInnerHTML`, and a CSP at the edge (§5.5, §5.7). Revisit (cookie
  option) if that ever weakens.

## Edge Functions & secrets (§5.4)

- `service_role` and the **VAPID private key** live ONLY in Edge Function env. The
  client carries the anon key and the VAPID *public* key — nothing else.
- `send-push` verifies the caller's JWT → confirms group membership → *then* uses
  `service_role` to read that group's subscriptions and send. `groupId` from the
  body is never trusted on its own. A caller cannot push to a group they're not in.

## Input & abuse (§5.5–5.6)

- Length/shape limits are DB constraints, not just form validation. Names trimmed,
  empties rejected.
- Magic-link sends, invite-code attempts and per-group push are rate-limited; the
  client also batches normal adds so ten quick adds = one notification.

## Privacy (§11)

- Personal data held: emails, display names, push subscriptions, and a behavioural
  audit trail (who added/bought what) — possibly about children.
- Display names are **snapshotted** at action time (`added_by_name`/`acted_by_name`)
  so "Mum binned this" survives account deletion while the account detaches cleanly.
- Reporting is **off by default, opt-in, group-scoped, deletable**.
- Account/group lifecycle controls (leave, remove, delete account/group, clear
  history) are surfaced in the Privacy screen (§11.4).
