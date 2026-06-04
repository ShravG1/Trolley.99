/** @type {import('tailwindcss').Config} */
// Tokens map to CSS custom properties (defined in src/styles/tokens.css) so the
// light/dark themes switch via [data-theme] without rebuilding classes (§1.1–1.2).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-faint)',
        brand: 'var(--brand)',
        'brand-strong': 'var(--brand-strong)',
        'brand-tint': 'var(--brand-tint)',
        'on-brand': 'var(--on-brand)',
        urgent: 'var(--urgent)',
        'urgent-tint': 'var(--urgent-tint)',
        sub: 'var(--sub)',
        'sub-tint': 'var(--sub-tint)',
        bin: 'var(--bin)',
      },
      fontFamily: {
        // @fontsource-variable registers the "… Variable" family names.
        display: ['"Bricolage Grotesque Variable"', '"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        body: ['"Hanken Grotesk Variable"', '"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // §1.4 type scale — [size, line-height]
        'display-l': ['26px', '1.1'],
        'display-s': ['21px', '1.15'],
        item: ['17px', '1.25'],
        aisle: ['14px', '1.2'],
        meta: ['13px', '1.3'],
        body: ['15px', '1.45'],
        caption: ['12px', '1.3'],
        stat: ['34px', '1.0'],
      },
      borderRadius: {
        xs: '8px',
        sm: '12px',
        md: '16px',
        lg: '22px',
        pill: '999px',
      },
      boxShadow: {
        e1: 'var(--e1)',
        e2: 'var(--e2)',
        e3: 'var(--e3)',
      },
      spacing: {
        // 4px base scale (§1.5)
        13: '52px',
        18: '72px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(.2,.8,.2,1)',
        spring: 'cubic-bezier(.34,1.56,.64,1)',
        'in-out': 'cubic-bezier(.45,0,.2,1)',
      },
      transitionDuration: {
        micro: '120ms',
        base: '220ms',
        considered: '320ms',
        scene: '460ms',
      },
    },
  },
  plugins: [],
};
