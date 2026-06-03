// Renders icon design OPTIONS to preview PNGs so we can pick one.
// Run: node scripts/icon-options.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('icon-previews', { recursive: true });

// Warm palette (design language §1).
const C = {
  green: '#2F8F5B',
  greenDark: '#226E45',
  paper: '#F6F1E7',
  paprika: '#E0552B',
  white: '#FFFFFF',
  ink: '#2A241F',
  amber: '#D99A2B',
};

// Rounded background helper (preview shows home-screen rounding).
const bg = (fill, r = 112) =>
  `<rect width="512" height="512" rx="${r}" fill="${fill}"/>`;

// --- Designs (512x512) ----------------------------------------------------
const designs = {
  // A — Shopping trolley, white on green. The literal "Trolley".
  trolley: `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${bg(C.green)}
      <g fill="none" stroke="${C.white}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
        <path d="M120 150 h44 l40 168 h150 l40 -120 H196"/>
        <circle cx="222" cy="372" r="20" fill="${C.white}"/>
        <circle cx="350" cy="372" r="20" fill="${C.white}"/>
      </g>
    </svg>`,

  // B — Basket with a paprika tick (the satisfying check).
  basket: `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${bg(C.green)}
      <g fill="none" stroke="${C.white}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
        <path d="M150 220 h212 l-26 150 a16 16 0 0 1 -16 14 H192 a16 16 0 0 1 -16 -14 Z"/>
        <path d="M206 220 l40 -70 M306 220 l-40 -70"/>
      </g>
      <path d="M214 300 l34 34 l66 -74" fill="none" stroke="${C.paprika}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

  // C — Bold "T" monogram with a paprika dot.
  monogram: `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${bg(C.green)}
      <path d="M150 168 h212 a14 14 0 0 1 14 14 v22 a14 14 0 0 1 -14 14 h-72 v138 a16 16 0 0 1 -16 16 h-26 a16 16 0 0 1 -16 -16 v-138 h-72 a14 14 0 0 1 -14 -14 v-22 a14 14 0 0 1 14 -14 Z" fill="${C.white}"/>
      <circle cx="344" cy="356" r="20" fill="${C.paprika}"/>
    </svg>`,

  // D — Grocery paper bag with a green leaf (warm paper background).
  bag: `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${bg(C.paper)}
      <path d="M168 196 h176 v150 a40 40 0 0 1 -40 40 H208 a40 40 0 0 1 -40 -40 Z" fill="${C.amber}" opacity="0.25"/>
      <path d="M168 196 h176 v150 a40 40 0 0 1 -40 40 H208 a40 40 0 0 1 -40 -40 Z" fill="none" stroke="${C.ink}" stroke-width="20"/>
      <path d="M168 196 l24 -40 h128 l24 40" fill="none" stroke="${C.ink}" stroke-width="20" stroke-linejoin="round"/>
      <path d="M256 196 c0 -34 22 -58 56 -58 c0 34 -22 58 -56 58 Z" fill="${C.green}"/>
      <path d="M256 196 v-30" stroke="${C.green}" stroke-width="14" stroke-linecap="round"/>
    </svg>`,

  // E — Big satisfying tick (minimal, the dopamine of ticking off).
  tick: `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${bg(C.green)}
      <circle cx="256" cy="256" r="130" fill="none" stroke="${C.white}" stroke-width="14" opacity="0.45"/>
      <path d="M196 262 l44 44 l84 -96" fill="none" stroke="${C.white}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

  // F — Trolley on warm paper (light/daytime variant of A).
  trolleyPaper: `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      ${bg(C.paper)}
      <g fill="none" stroke="${C.green}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
        <path d="M120 150 h44 l40 168 h150 l40 -120 H196"/>
        <circle cx="222" cy="372" r="20" fill="${C.green}"/>
        <circle cx="350" cy="372" r="20" fill="${C.green}"/>
      </g>
      <circle cx="300" cy="232" r="16" fill="${C.paprika}"/>
    </svg>`,
};

for (const [name, svg] of Object.entries(designs)) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng();
  writeFileSync(`icon-previews/${name}.png`, png);
  console.log('wrote', name);
}
