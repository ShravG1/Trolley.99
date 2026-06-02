// View Transitions API helper for the signature mode-shift (§1.6).
// Degrades to an instant state change where unsupported or under
// prefers-reduced-motion.

type StartViewTransition = (cb: () => void) => unknown;

export function withViewTransition(update: () => void) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;
  if (reduced || typeof start !== 'function') {
    update();
    return;
  }
  start.call(document, update);
}
