# Trolley — backlog & "pick this up later"

Running list so nothing's lost between sessions. Newest intent at the top.

## ⏸️ Parked — come back to these
- **Offline edit can be lost if another member finishes that trip first.**
  `complete_trip` mints NEW item ids for rolled-over (pending/not-found) items, but
  the offline queue replays a patch by item id — so an edit made offline while a
  *different* member completes that same trip lands on the now-completed-trip row
  and never reaches the rolled-over twin (silently dropped on the next reload).
  Rare (needs a concurrent rollover inside your offline window) and pre-dates
  per-shop tabs. Offline *adds* are safe — `items_insert` rejects inserts into a
  completed trip, so they surface as a "changes dropped" toast rather than orphaning.
  A proper fix needs stable item ids across rollover (which rewrites completed-trip
  history), so it's deferred. (Found in the #19 review.)
- **Offline real-world test pass.** Validate the offline queue + read-cache on a
  real phone with patchy signal / airplane mode. Steps in `docs/OFFLINE_TEST_PASS.md`.
- **Offline trip lifecycle (start/finish) — decision pending.** Sticking with the
  *messaging baseline* (offline, those buttons are disabled with a reason). If we
  ever want them to work offline, the scoped design is in
  `docs/OFFLINE_TRIP_LIFECYCLE_PLAN.md` (Option B: queue cancel + soft start only).

## 🔜 Requested features (not started)
1. **Delete a shopping list.** Let an owner delete a whole group/list (not just
   leave it). Needs an RLS-safe delete (group `created_by` only?) + a confirm flow.
2. **Sub-lists per shop, "like Chrome tabs".** Inside a list, switch between
   per-shop sub-lists (e.g. Tesco / Aldi tabs) so items can be split by where you'll
   buy them. Sizable — touches the data model (a list → many shop-lists) and the UI.
3. **Settings split: per-list vs per-user.** A settings surface scoped to a single
   list, plus a global user-settings surface for the person themselves.

## 🧪 V3 idea (note only — after this version is fully complete)
- **Price-aware auto-delegation.** Check whether items are cheaper elsewhere and
  auto-assign them to the shop with the best price, given a minimum saving of X%.
  Big: needs price data/source, per-shop modelling, and the sub-lists feature first.

## ✅ Fixed this pass
- **Sync stuck / deletes not saving.** The offline queue never drained: the
  connectivity probe relied on the HTTP `Date` header, which browsers can't read
  cross-origin (not CORS-exposed), so it always read "offline". Replaced with a
  header-free probe that just checks the request completes.
- **Buttons overflowing the frame.** Hardened action-button rows (ItemSheet actions
  now wrap; AddSheet aisle tag truncates) so they hold up at large system fonts.
