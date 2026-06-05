// Leading + trailing throttle (§6.4).
//
// Fires immediately on the first call, then at most once per `wait` ms, and
// always delivers a final trailing call so the last value isn't dropped. That
// trailing guarantee matters for presence: a burst of join/leave events must
// settle on the *true* final viewer set, not whichever event happened to land
// on the leading edge. Hand-rolled to keep deps minimal (no lodash).
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number
): ((...args: A) => void) & { cancel: () => void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const invoke = (args: A) => {
    last = Date.now();
    fn(...args);
  };

  const throttled = (...args: A) => {
    const remaining = wait - (Date.now() - last);
    if (remaining <= 0) {
      // Past the window — fire now and drop any queued trailing call.
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke(args);
    } else {
      // Inside the window — remember the latest args for the trailing call.
      pending = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pending) {
            const p = pending;
            pending = null;
            invoke(p);
          }
        }, remaining);
      }
    }
  };

  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
    last = 0;
  };

  return throttled;
}
