// Server-clock offset (§6.5). The last-minute window and the lock are judged
// server-side against now(); but the UI's "is the window open / has the shopper
// gone quiet" checks ran on the *device* clock, so a skewed phone offered (or
// hid) the add affordance at the wrong moment — and the optimistic write then
// bounced off the RLS WITH CHECK. We learn a one-off offset on bootstrap and
// judge UI time against it. This is never a security boundary (the DB judges the
// real now()); it only makes the UI agree with the server. Falls back to the
// device clock (offset 0) when the server time is unknown.

let offsetMs = 0;

export function setServerOffset(ms: number): void {
  offsetMs = ms;
}

/** Offset = server time − the device time observed at the same moment. */
export function computeOffset(serverMs: number, clientMs: number): number {
  return serverMs - clientMs;
}

/** Best estimate of the server's current epoch-ms. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}
