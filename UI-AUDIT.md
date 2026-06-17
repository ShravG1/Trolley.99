# Trolley — UI audit & fixes (affordance + interaction pass)

**Date:** 2026-06-17 · **Branch:** `claude/upbeat-planck-tfufdp`

Triggered by two screenshots: (1) the group/shop switcher not reading as tappable and hiding that other shops exist; (2) a bought item that was also mid-swipe showing "Delete" — the bought/delete/not-found visuals overlapping into a mess.

## Method (usage-aware)

Captured a full **state screenshot set** in a real mobile browser (Playwright, 390px) using a **dev-only `window.__store` hook** (stripped from production builds) to set up states cheaply: list / shopping / spectator, multi-group switcher, "Your lists", every item state (pending / urgent / bought / substituted / not-found), bought-then-swiped, the Add / Item / Start-shopping sheets, settings, privacy, archive, history, onboarding, empty. Then ran **3 parallel audit agents** — 2× Sonnet for visual/UX critique over **disjoint** screenshot sets, 1× Haiku for a static affordance/tap-target code scan. Agents analysed the **pre-captured** screenshots + code rather than each driving their own browser (one browser pass, shared dev server).

## Fixed

### The reported issues
- **[Blocker] Resolved rows showed ghost "Bought"/"Delete" text bleeding through** (even when not swiped — see the old `item-states`). Root cause: the whole row was rendered at `opacity-50/70`, so its background went translucent and the always-present swipe-reveal layer behind it showed through. Fix (`ItemRow.tsx`): render the reveal layer **only while swiping/revealed**, and de-emphasise resolved rows via **text styling, not element opacity**, so the row background stays opaque.
- **[Major] The shop switcher ("Home ⌄") didn't look tappable** and gave no hint other shops exist. Fix (`Home.tsx`): it's now a **bordered, shaded pill with a persistent chevron** (a clear dropdown affordance) that taps through to "Your lists" — where you switch shops and "Create or join another list".
- **[Major] "Delete this list" didn't look clickable**, and destructive vs neutral controls looked identical. Fix (`Privacy.tsx`): lifecycle controls are now **tappable rows with a chevron**; destructive ones get a **solid red border + tint + red chevron**. Confirm buttons now **name the action** ("Delete list" rather than "Yes, do it").

### Interaction model — bought / delete / not-found "thought out properly"
- **[Blocker] The kebab on a bought row deleted instantly, no confirmation** → accidental data loss. Now the kebab **always opens the actions sheet**; the two-step swipe is the only fast-delete path.
- **[Blocker] No way to un-tick a bought item** (a mis-tick was a dead end). The checkbox is now a **toggle**: tick a pending item, un-tick a done one back to pending (applies to bought *and* substituted).
- **[Major/Polish] not-found rows** were dimmed like resolved items with a near-invisible icon. Now treated as **pending-with-history**: not dimmed, icon at `ink-soft`, and the attempt count moved off the (truncating) name into the subtitle.

### Quick wins
- Urgent section now shows a **count**, matching the aisle headers.
- **"I'm going shopping" is hidden on an empty list** (it was a no-op).
- Tap targets bumped to ≥44px: Toasts "Undo", AddSheet clear-input button.

## Follow-up pass — all flagged items now done

**Major**
- Settings entry is now a **gear icon** (was an unlabeled kebab), on both the list and "Your lists" headers.
- The **archive/bin count** is now a bordered chip — clearly tappable, better contrast.
- AddSheet's **"Unit"** field now has a visible label.
- **SegmentedControl** inactive options now have a press (`active:`) state, not hover-only.

**Minor / Polish**
- Settings list rows ("Past shops", "Binned items", "How Trolley works", "Privacy") now have a chevron + press state, so they read as tappable rows.
- **"Leave this group"** now carries an inline hint that it deletes the group if you're the last one out.
- **Spectators now see the last-minute-window countdown** (not just the shopper).
- The **History/empty-state icon** is now a visible soft-brand mark (was near-invisible). Verified light **and** dark.
- Privacy copy de-jargoned ("UK GDPR:" → "You're always in control…"); confirm buttons name the action ("Delete list", not "Yes, do it").

> Note: the colour tokens are plain `var(--x)`, so Tailwind's `/opacity` modifier produces invalid CSS (silently transparent) — tints use `color-mix` instead, the repo's existing pattern (`aisles.ts`). Verified across light and dark themes.

## Health
`tsc` clean · **96/96 tests** · production build green · demo mode intact · **no dependencies added**. The only non-UI change is a **dev-only `window.__store`** hook (guarded by `import.meta.env.DEV` + a `typeof window` check; stripped from production) to support QA/screenshot harnesses.
