import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  /** Diameter of the loader in px (the cart orbits within this). */
  size?: number;
  /** Optional caption under the cart (e.g. "Trolley…"). */
  caption?: string;
}

// CartLoader — the app's loading state (#loading). The shopping cart from the
// logo (favicon.svg) drives around a circular track on its two wheels and loops
// back round, wheels spinning. Built with Framer Motion: an outer ring rotates
// the cart around the centre (orbit), an inner layer counter-rotates so the cart
// stays upright as it travels ("Pin" orientation), and each wheel spins on its
// own axis. Honours prefers-reduced-motion with a still cart that gently pulses.
export function CartLoader({ size = 112, caption }: Props) {
  const reduce = useReducedMotion();
  const radius = size * 0.36; // how far the cart sits from the centre
  const cartPx = size * 0.36; // the cart glyph's own size
  const lap = 2.2; // seconds per full lap (orbit + counter-rotation share this)

  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Faint dashed track so the circle it laps is legible. */}
        <svg className="absolute inset-0 text-line" width={size} height={size} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="3 7"
            strokeLinecap="round"
            opacity={0.85}
          />
        </svg>

        {reduce ? (
          // Reduced motion: no travel/spin — just a soft pulse so it still reads
          // as "working" without anything whirling around.
          <motion.div
            className="absolute inset-0 grid place-items-center"
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
          >
            <CartGlyph px={cartPx} spin={false} />
          </motion.div>
        ) : (
          // Orbit driver — rotates the whole layer around the centre.
          <motion.div
            className="absolute inset-0"
            style={{ transformOrigin: 'center' }}
            animate={{ rotate: 360 }}
            transition={{ duration: lap, ease: 'linear', repeat: Infinity }}
          >
            {/* Lift the cart to the top of the circle; the orbit carries it round. */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{ transform: `translate(-50%, -50%) translateY(-${radius}px)` }}
            >
              {/* Counter-rotate so the cart stays upright the whole way round. */}
              <motion.div
                style={{ transformOrigin: 'center' }}
                animate={{ rotate: -360 }}
                transition={{ duration: lap, ease: 'linear', repeat: Infinity }}
              >
                <CartGlyph px={cartPx} spin />
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>

      {caption && <p className="font-display text-display-s text-ink-soft">{caption}</p>}
      <span className="sr-only">Loading</span>
    </div>
  );
}

// The cart, lifted straight from the logo's paths (favicon.svg) and recoloured to
// the brand via currentColor. Wheels are drawn as spoked rings so their spin
// actually reads (the logo's solid dots wouldn't show rotation).
function CartGlyph({ px, spin }: { px: number; spin: boolean }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="96 120 320 300"
      fill="none"
      aria-hidden="true"
      className="text-brand"
    >
      {/* Basket — the logo's cart outline. */}
      <path
        d="M120 150 h44 l40 168 h150 l40 -120 H196"
        stroke="currentColor"
        strokeWidth={26}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[222, 350].map((cx) => (
        <motion.g
          key={cx}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={spin ? { rotate: 360 } : undefined}
          transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }}
        >
          <circle cx={cx} cy={372} r={18} stroke="currentColor" strokeWidth={9} />
          <line x1={cx} y1={356} x2={cx} y2={388} stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
          <line x1={cx - 16} y1={372} x2={cx + 16} y2={372} stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
        </motion.g>
      ))}
    </svg>
  );
}
