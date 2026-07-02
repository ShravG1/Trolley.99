import { motion, useReducedMotion } from 'framer-motion';

interface Props {
  /** Diameter of the loader's stage in px. */
  size?: number;
  /** Optional caption under the scene (e.g. "Trolley…"). */
  caption?: string;
}

// CartLoader — the app's loading state (#loading). A small dimensional stage:
// the logo's cart sits tilted in real 3D (CSS perspective + rotateX/rotateY),
// riding a slow figure-eight while its wheels spin on their own axis, above a
// soft contact shadow and a faint reflection on the "floor". A dashed orbit
// ring drifts beneath it in the same 3D space for parallax. Everything is CSS
// 3D transforms + gradients — no canvas, no new deps (Framer Motion already
// shipped with the app). Honours prefers-reduced-motion with a still,
// gently-breathing cart (no travel, no spin).
export function CartLoader({ size = 132, caption }: Props) {
  const reduce = useReducedMotion();
  const stagePx = size;

  return (
    <div className="flex flex-col items-center gap-5" role="status" aria-live="polite">
      <div
        className="relative"
        style={{ width: stagePx, height: stagePx, perspective: stagePx * 3.2 }}
      >
        {/* Floor: a soft radial disc that reads as the surface the cart rides
            over, plus a faint reflection so the scene feels grounded rather
            than floating in space. */}
        <div
          className="absolute left-1/2 top-[64%] -translate-x-1/2"
          style={{
            width: stagePx * 0.92,
            height: stagePx * 0.34,
            transform: 'translate(-50%, 0) rotateX(72deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(closest-side, color-mix(in oklab, var(--ink) 16%, transparent) 0%, transparent 72%)',
            }}
          />
          {/* Dashed orbit track the cart laps — drawn as an ellipse to imply
              perspective on the tilted floor plane. */}
          <svg
            className="absolute inset-0 text-line"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <ellipse
              cx="50"
              cy="50"
              rx="46"
              ry="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="2 9"
              strokeLinecap="round"
              opacity="0.9"
            />
          </svg>
        </div>

        {/* 3D stage: the cart itself, tilted for depth and (unless reduced
            motion) drifting through a slow figure-eight above the floor. */}
        <div
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {reduce ? (
            <motion.div
              className="absolute inset-0 grid place-items-center"
              style={{ transformStyle: 'preserve-3d' }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
            >
              <div style={{ transform: 'rotateX(18deg) rotateY(-24deg)', transformStyle: 'preserve-3d' }}>
                <Cart3D px={stagePx * 0.5} spin={false} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              className="absolute inset-0 grid place-items-center"
              style={{ transformStyle: 'preserve-3d' }}
              animate={{
                x: [0, stagePx * 0.16, 0, -stagePx * 0.16, 0],
                y: [0, -stagePx * 0.05, 0, stagePx * 0.03, 0],
                rotateY: [-24, 8, 26, 8, -24],
                rotateZ: [0, 2, 0, -2, 0],
              }}
              transition={{ duration: 3.6, ease: [0.45, 0, 0.2, 1], repeat: Infinity }}
            >
              <motion.div
                style={{ transformStyle: 'preserve-3d' }}
                animate={{ rotateX: [16, 20, 16] }}
                transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity }}
              >
                <Cart3D px={stagePx * 0.5} spin />
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>

      {caption && <p className="font-display text-display-s text-ink-soft">{caption}</p>}
      <span className="sr-only">Loading</span>
    </div>
  );
}

// A dimensional build of the logo's cart: a beveled basket (front/back/base
// planes shaded via gradients to fake lighting) plus two wheels that spin on
// their own axis. Pure CSS 3D transforms — each "panel" is a positioned div
// with a gradient standing in for a lit surface, composited in a
// preserve-3d parent so the perspective set on the stage applies.
function Cart3D({ px, spin }: { px: number; spin: boolean }) {
  const w = px * 1.55; // basket width
  const h = px * 0.95; // basket height
  const depth = px * 0.42; // basket depth (front-to-back)
  const wheelPx = px * 0.34;

  return (
    <div
      className="relative"
      style={{ width: w, height: h, transformStyle: 'preserve-3d' }}
    >
      {/* Back panel — furthest from camera, darkest. */}
      <div
        className="absolute rounded-[18%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
        style={{
          width: w * 0.86,
          height: h * 0.72,
          left: w * 0.07,
          top: 0,
          transform: `translateZ(-${depth / 2}px)`,
          background:
            'linear-gradient(160deg, color-mix(in oklab, var(--brand-strong) 88%, black) 0%, var(--brand-strong) 100%)',
        }}
      />
      {/* Left + right side panels, angled to close the box in 3D. */}
      <div
        className="absolute"
        style={{
          width: depth,
          height: h * 0.72,
          left: w * 0.07,
          top: 0,
          transformOrigin: 'right center',
          transform: `translateZ(-${depth / 2}px) rotateY(-90deg)`,
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--brand) 92%, black) 0%, var(--brand) 100%)',
        }}
      />
      <div
        className="absolute"
        style={{
          width: depth,
          height: h * 0.72,
          right: w * 0.07,
          top: 0,
          transformOrigin: 'left center',
          transform: `translateZ(-${depth / 2}px) rotateY(90deg)`,
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--brand-strong) 90%, black) 0%, var(--brand-strong) 100%)',
        }}
      />
      {/* Front panel — closest to camera, brightest, carries the sheen sweep. */}
      <div
        className="absolute overflow-hidden rounded-[18%]"
        style={{
          width: w * 0.86,
          height: h * 0.72,
          left: w * 0.07,
          top: 0,
          transform: `translateZ(${depth / 2}px)`,
          background: 'linear-gradient(155deg, var(--brand) 0%, var(--brand-strong) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -10px 18px rgba(0,0,0,0.18)',
        }}
      >
        {/* Specular sheen: a soft diagonal highlight that sweeps across the
            face on a slow loop, so the panel reads as glossy rather than flat. */}
        {spin && (
          <motion.div
            className="absolute inset-y-0 w-1/3"
            style={{
              background:
                'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.55) 45%, transparent 90%)',
              filter: 'blur(2px)',
            }}
            animate={{ x: ['-140%', '260%'] }}
            transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.1 }}
          />
        )}
        {/* Basket lattice — three horizontal ribs like a wire shopping basket,
            catching the light differently from the panel behind them. */}
        <svg
          className="absolute inset-0 h-full w-full text-on-brand"
          viewBox="0 0 100 62"
          fill="none"
          aria-hidden="true"
        >
          <rect x="10" y="12" width="80" height="38" rx="6" stroke="currentColor" strokeWidth="5" opacity="0.85" />
          <path d="M10 26 H90" stroke="currentColor" strokeWidth="3" opacity="0.45" />
          <path d="M10 38 H90" stroke="currentColor" strokeWidth="3" opacity="0.45" />
        </svg>
      </div>
      {/* Base / floor of the basket, gives the box a bottom so it doesn't
          look hollow when tilted. */}
      <div
        className="absolute"
        style={{
          width: w * 0.86,
          height: depth,
          left: w * 0.07,
          top: h * 0.72 - depth / 2,
          transformOrigin: 'top center',
          transform: 'rotateX(90deg)',
          background: 'linear-gradient(180deg, color-mix(in oklab, var(--brand-strong) 80%, black) 0%, color-mix(in oklab, var(--brand-strong) 60%, black) 100%)',
        }}
      />

      {/* Wheels: spoked discs that sit forward of the basket (positive Z) and
          spin on their own axis independent of the cart's drift. */}
      {[w * 0.2, w * 0.72].map((left, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: wheelPx,
            height: wheelPx,
            left,
            top: h * 0.72 + h * 0.06,
            transform: `translateZ(${depth * 0.7}px) rotateY(20deg)`,
            transformStyle: 'preserve-3d',
            background: 'radial-gradient(circle at 35% 30%, var(--ink-soft) 0%, var(--ink) 70%)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.35), inset 0 0 0 2px color-mix(in oklab, var(--surface) 30%, transparent)',
          }}
          animate={spin ? { rotate: 360 } : undefined}
          transition={{ duration: 0.7, ease: 'linear', repeat: Infinity }}
        >
          <div
            className="absolute inset-[28%] rounded-full"
            style={{ background: 'var(--ink-soft)', opacity: 0.9 }}
          />
          {[0, 45, 90, 135].map((deg) => (
            <div
              key={deg}
              className="absolute left-1/2 top-1/2 h-[2px] w-full -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: 'var(--surface)', opacity: 0.55, transform: `translate(-50%, -50%) rotate(${deg}deg)` }}
            />
          ))}
        </motion.div>
      ))}
    </div>
  );
}
