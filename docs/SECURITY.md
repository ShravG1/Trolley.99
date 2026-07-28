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
| `groups` | `is_member(id)` | delete: creator. **No client insert/update** — `create_group` RPC only (0017) |
| `group_members` | own rows OR `is_member` | inserts via `join_group` RPC only; delete = self-leave / creator-remove |
| `invites` | `is_member` | **mint: `create_invite` RPC only** (0017); revoke: any member (#37) |
| `trips` | `is_member` | **no client insert or update** — every transition is an RPC (0008, 0017) |
| `items` | `is_member(trip→group)` | insert `WITH CHECK` enforces window/shopper (§7.2); update column-scoped (0008) + `WITH CHECK` on audit stamps and shopping actions (0013) |
| `recurring_items` | `is_member` | members; `category` allow-listed (0017) |
| `hot_list` | `is_member` read | written server-side (service_role) |
| `item_categories` | `is_member` | **`set_item_category` RPC only** — no policy, no grant (0016) |
| `push_subscriptions` | own only | own only; `endpoint` must be `https://` (0017) |

### Write-surface principle (0017)

RLS decides *which rows*; the table GRANT decides *whether the operation exists at
all*. The rule now is: **a client only holds the privileges the app actually uses.**
Everything else goes through a `SECURITY DEFINER` RPC, which runs as the table
owner and is unaffected by grants.

That closed four in-household escalations that RLS alone allowed — none of them
crossed a household boundary, but each let a member do something the RPC they were
supposed to use deliberately prevents:

- **Forged trips.** `INSERT` on `trips` was granted with only a membership check, so
  a member could write a `completed` trip that shows up in History and Reporting as
  if it happened, or a `shopping` trip naming someone *else* as the shopper.
- **Forged invites.** `INSERT` on `invites` let a member write `code = 'AAAAAAAA'`,
  `expires_at = null` — a guessable, never-expiring key to the household, sidestepping
  `create_invite`'s entropy and 7-day expiry entirely.
- **Ownership transfer.** `groups_update` had a `USING` clause and no `WITH CHECK`,
  so the creator could `PATCH created_by` to another user.
- **Category poisoning → denial of service.** `items.category` was unconstrained
  `text` and client-writable (rightly — re-aisling is a core action). One `PATCH` to
  a value the client doesn't know would throw on `AISLES[category].label` mid-render
  — a white screen for *everyone* in the household. Now allow-listed in the DB, and
  the client narrows unknown values to Other at the read boundary rather than casting.

Each has a pgTAP assertion, alongside a positive control proving the real app path
still works.

### Invite codes (0017)

`create_invite` builds the 8-char code from `gen_random_bytes` (pgcrypto CSPRNG),
not `random()` — a seeded PRNG whose output is a deterministic function of a
per-backend seed, and so correlated across codes minted on the same connection.
The alphabet is 32 symbols and 256 % 32 = 0, so the byte-modulo mapping is unbiased.
The link token is 256 bits of the same CSPRNG.

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

**Anonymous-first (the shipped model).** A shopping list is low-sensitivity, so the
default is zero-friction: opening the app silently calls `signInAnonymously()`,
minting a real `auth.uid()` with no email/password. The user picks a display name
and creates a group (gets a code) or joins by code. **RLS is unchanged** — every
anonymous user is a real identity, so membership-based isolation still holds. This
is the key point: we dropped the login *friction*, not the security model.

- **Optional email backup.** An anonymous account is device-bound (session in
  localStorage). The creator can attach an email in Settings (`updateUser({email})`),
  which makes the account permanent and recoverable on another device via magic
  link. Opt-in, off by default (§11 minimisation).
- **Magic-link recovery.** Kept as the recovery path for users who attached an
  email (GroupSetup → "Recover it", or the fallback Welcome screen if anonymous
  sign-ins are ever disabled). The link is the auth: short TTL, single-use; the
  "sent" response is uniform whether or not the email exists (no enumeration).
- Sessions are long-lived with refresh-token rotation (`config.toml`) so nobody is
  bounced to login mid-shop.

Trade-off accepted: clearing browser data / switching device without an attached
email = a new identity (re-enter the code to rejoin). Fine for a fridge list.
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
- **`send-push` is the one place a stored value decides where we connect.** The
  subscription `endpoint` is a self-owned, user-supplied string, and the function
  holds `service_role` and reaches the network — so an `http://169.254.169.254/…`
  endpoint would have been a blind SSRF primitive. `endpoint` is now constrained to
  `https://` at the table (0017) *and* re-checked before each send: the boundary is
  the constraint, the re-check is defence in depth.
- Every string in the push body is clamped in the function (item 80, actor 40,
  count/minutes bounded). The DB bounds those columns, but the function is callable
  directly with any JSON a member composes.

## Error capture must not exfiltrate credentials (§9)

Auto-captured errors land in `feedback`, and the daily digest opens a **GitHub
issue** for each — so anything the logger records leaves the app permanently. Two
URL shapes in this app carry a live credential, and `errorLog` was recording
`location.href` verbatim:

- the magic-link return, `…/#access_token=ey…&refresh_token=…` — Supabase hands the
  session back in the fragment, so an error on that first paint would have filed a
  **working session token** into an issue;
- `/join/<token>` — the invite token *is* the key to the household, valid 7 days.

`redactUrls()` now runs on the single funnel every captured error passes through
(`captureError`), not just at each call site, so a future caller can't route around
it. Query and fragment are dropped wholesale and the invite token is masked, keeping
the route shape so the report is still locatable. Unit-tested in `errorLog.test.ts`.

## Input & abuse (§5.5–5.6)

- Length/shape limits are DB constraints, not just form validation. Names trimmed,
  empties rejected.
- Magic-link sends, invite-code attempts and per-group push are rate-limited; the
  client also batches normal adds so ten quick adds = one notification.
- Values that come back *from* the server are re-validated before the UI trusts
  them, because "the DB constrains it" and "this render can't crash" are different
  claims. `isAisleKey`/`aisleOf` narrow `items.category` (plain `text`) at the read
  boundary, and `loadCategoryMemory` re-validates every entry it reads out of
  localStorage — which is user-writable, and which JSON can give an own `__proto__`
  key.

## Response headers (§5.7)

Set at the edge in `vercel.json`: HSTS (2y, preload), `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` (so an
invite path never leaks in a cross-origin referrer), `Permissions-Policy`,
`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`,
and a CSP with `script-src 'self'` (the pre-paint theme script is an external file
precisely so no inline script is needed), `object-src`/`frame-src`/`child-src 'none'`,
`base-uri`/`form-action 'self'`, `frame-ancestors 'none'` and
`upgrade-insecure-requests`. `style-src` keeps `'unsafe-inline'` — the app sets aisle
colours via style attributes.

## Dependencies

`npm audit` is clean apart from **react-router**, and that one is a deliberate hold,
not an oversight. Both advisories against 6.x are unreachable here: the SSR
hydration issue needs SSR (this is a pure SPA with no loaders or hydration), and the
open redirect needs attacker-controlled input reaching `<Link to>` / `useNavigate` —
every navigation target in `src/` is a hard-coded literal or `navigate(-1)`. Moving
to v7 does not help: 7.12–8.2 carry a *high* RSC-mode CSRF advisory (also unreachable
— no RSC), and the only clean-looking downgrade, 7.11, falls back inside the 6.x
range. There is no advisory-free version, so the app stays on the tested v6 line.
Re-evaluate when a clean release exists.

`fast-uri` and `brace-expansion` are pinned forward through `overrides` (both are
transitive, build-time only) and `postcss` is bumped within semver.

## Privacy (§11)

- Personal data held: emails, display names, push subscriptions, and a behavioural
  audit trail (who added/bought what) — possibly about children.
- Display names are **snapshotted** at action time (`added_by_name`/`acted_by_name`)
  so "Mum binned this" survives account deletion while the account detaches cleanly.
- Reporting is **off by default, opt-in, group-scoped, deletable**.
- Account/group lifecycle controls (leave, remove, delete account/group, clear
  history) are surfaced in the Privacy screen (§11.4).
