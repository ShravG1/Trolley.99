# Add via Siri (§22)

"Hey Siri, add milk to Trolley" — done through the iOS Shortcuts app, not
through anything Apple gives a plain web app. A PWA has no access to
SiriKit/App Intents (that needs a native wrapper), so this works by having a
Shortcut the household member builds once make an authenticated HTTP call to
a small Supabase Edge Function, which drops the item straight onto the
group's list. No app has to open; Siri just confirms out loud.

## How it works

- **Trust model is deliberately different from the rest of the app.** Every
  other write goes through a real Supabase session (RLS, §5.1). A Shortcut
  has no session — it can only hold a static secret. So a member mints a
  **quick-add token** from Settings → "Add via Siri" (`create_quick_add_token`,
  migration `0019_quick_add_tokens.sql`), which:
  - is a 256-bit random value, shown **once**, at mint time;
  - is stored **hashed** (sha256) — the plaintext is never persisted, so even
    a full DB dump can't recover it;
  - can do exactly **one thing**: add a pending item to that member's group's
    open list (`quick_add_item`). It cannot read the list, see members, or
    touch anything else. A leaked token is worth exactly as much as "someone
    can add junk to my shopping list," which is revocable any time.
- **The Edge Function** (`supabase/functions/quick-add`) takes the token as a
  `Bearer` header, forwards it to `quick_add_item`, and returns a short JSON
  result. It runs with `verify_jwt = false` (there's no JWT to verify) and
  never touches any RLS-gated table directly.
- **Scope, on purpose:** the item always lands on the group's shop-less
  ("Unsorted") list, and only while that list is `active` (nobody's mid-shop).
  If a shop's in progress, the call fails with a clear reason rather than
  guessing which shop tab or ignoring the shopper's last-minute window — a
  voice add has no context for either.

## Setting it up (per member, per phone)

1. In Trolley, open **Settings → Add via Siri → Set up a Shortcut**. This
   shows an **endpoint URL** and a **token**, both shown once — copy both
   somewhere (a Shortcuts action, a password manager) before leaving the
   screen.
2. Open the **Shortcuts** app on iPhone → **+** → add action **"Get Contents
   of URL"**.
   - URL: paste the endpoint.
   - Method: **POST**.
   - Headers: `Authorization` → `Bearer <the token>`.
   - Request Body: **JSON**, with a field `name` set to the text you want
     added. To make it work from a spoken phrase, first add an **"Ask for
     Input"** (Text) action above it, and use that variable as `name`.
3. Tap the Shortcut's settings (the "..." icon) → rename it to something like
   **"Add to Trolley"** → turn on **"Use with Siri"** and record/confirm the
   phrase (usually just the Shortcut's name).
4. Test it: run the Shortcut once by tapping it. You should see the item
   appear on the list within a couple of seconds.
5. Say **"Hey Siri, add to Trolley"** — Siri asks what to add (the "Ask for
   Input" step), you answer, it's on the list.

If you'd rather skip the "Ask for Input" step, you can instead make separate
Shortcuts per common item ("Add milk to Trolley", "Add bread to Trolley")
each with a fixed `name`, or use Siri's **"Add [x] to Trolley"** phrasing
directly if you name the Shortcut with a `%1` placeholder — iOS Shortcuts'
own docs cover parameterised Siri phrases better than we can here; the
`name` field is the only thing this integration needs filled in.

## Revoking a token

Settings → "Add via Siri" lists every token you've minted (label + last-used
date, never the token itself again) with a **Revoke** button. Revoking is
immediate and doesn't affect anyone else's Shortcut — tokens are per-member,
not shared across the household.

## The manual fallback: `/add?item=`

Independent of the token flow, opening the app at `/add?item=Milk` while
already signed in on that device opens the add sheet prefilled with "Milk"
— no token needed, since it rides your existing session. Useful for testing,
or as a same-device Spotlight/Shortcuts "Open URL" action that doesn't need
the Siri setup above. It does need the app (and your session) open on that
device, unlike the token-based flow, which works from anywhere.
