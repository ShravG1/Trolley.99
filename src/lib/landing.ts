// Landing behaviour for multi-group (§12). When you belong to more than one
// group, the app opens on the "Your lists" overview so you see them all at once
// (the request). Once you've picked a list this session, "/" shows that list
// rather than bouncing back to the overview. Single-group users skip it entirely.
//
// "Entered a list" is intentionally in-memory (resets on reload) so a fresh app
// open always greets a multi-group user with the overview, but navigating around
// within a session keeps them on their list.

let entered = false;

export function markEnteredList(): void {
  entered = true;
}

/** Test seam — reset the in-memory flag. */
export function resetEntered(): void {
  entered = false;
}

/** Pure decision: should "/" redirect to the lists overview? */
export function shouldShowOverview(groupCount: number, enteredList: boolean): boolean {
  return groupCount >= 2 && !enteredList;
}

/** Stateful convenience the router uses (wraps the in-memory flag). */
export function showOverviewNow(groupCount: number): boolean {
  return shouldShowOverview(groupCount, entered);
}
