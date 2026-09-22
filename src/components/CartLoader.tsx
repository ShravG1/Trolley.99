interface Props {
  /** Diameter of the loader in px (the cart orbits within this). */
  size?: number;
  /** Optional caption under the cart (e.g. "Trolley…"). */
  caption?: string;
}

// CartLoader — the app's loading state (#loading). The shopping cart from the
// logo (favicon.svg) drives around a circular track on its two wheels and loops
// back round, wheels spinning. An outer layer rotates the cart around the
// centre (orbit), an inner layer counter-rotates so the cart stays upright as
// it travels ("Pin" orientation), and each wheel spins on its own axis.
//
// Pure CSS keyframes (see the <style> block below), not Framer Motion — this
// is the very first thing painted on cold load (App's <Splash/>), so it can't
// afford to pull an animation library into the critical bundle just to spin a
// cart. `prefers-reduced-motion` is handled by CSS media queries alone (no JS
// needed): the orbit/spin keyframes only apply under `no-preference`, and a
// gentle opacity pulse takes over under `reduce`.
export function CartLoader({ size = 112, caption }: Props) {
  const radius = size * 0.36; // how far the cart sits from the centre
  const cartPx = size * 0.36; // the cart glyph's own size

  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
      <div className="relative trolley-cart-pulse" style={{ width: size, height: size }}>
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

        {/* Orbit driver — rotates the whole layer around the centre. */}
        <div className="absolute inset-0 trolley-cart-orbit" style={{ transformOrigin: 'center' }}>
          {/* Lift the cart to the top of the circle; the orbit carries it round. */}
          <div
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(-50%, -50%) translateY(-${radius}px)` }}
          >
            {/* Counter-rotate so the cart stays upright the whole way round. */}
            <div className="trolley-cart-counter" style={{ transformOrigin: 'center' }}>
              <CartGlyph px={cartPx} />
            </div>
          </div>
        </div>
      </div>

      {caption && <p className="font-display text-display-s text-ink-soft">{caption}</p>}
      <span className="sr-only">Loading</span>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .trolley-cart-orbit { animation: trolley-cart-orbit 2.2s linear infinite; }
          .trolley-cart-counter { animation: trolley-cart-counter 2.2s linear infinite; }
          .trolley-cart-wheel { animation: trolley-cart-wheel 0.8s linear infinite; }
        }
        @media (prefers-reduced-motion: reduce) {
          .trolley-cart-pulse { animation: trolley-cart-fade 1.6s ease-in-out infinite; }
        }
        @keyframes trolley-cart-orbit { to { transform: rotate(360deg); } }
        @keyframes trolley-cart-counter { to { transform: rotate(-360deg); } }
        @keyframes trolley-cart-wheel { to { transform: rotate(360deg); } }
        @keyframes trolley-cart-fade { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}

// The cart, lifted straight from the logo's paths (favicon.svg) and recoloured to
// the brand via currentColor. Wheels are drawn as spoked rings so their spin
// actually reads (the logo's solid dots wouldn't show rotation).
function CartGlyph({ px }: { px: number }) {
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
        <g
          key={cx}
          className="trolley-cart-wheel"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          <circle cx={cx} cy={372} r={18} stroke="currentColor" strokeWidth={9} />
          <line x1={cx} y1={356} x2={cx} y2={388} stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
          <line x1={cx - 16} y1={372} x2={cx + 16} y2={372} stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
