// Canonical icon generator — the chosen design: a forward-tilted motion trolley
// (white) with speed lines, on a VERTICAL green→teal gradient. No accent dot.
// Re-run after design tweaks:  node scripts/gen-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });

const TOP = '#46B26F'; // greenLt
const BOT = '#2B7E77'; // tealDk
const LINE = '#FFFFFF';
const Rk = 112; // corner radius at 512

const grad = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${TOP}"/><stop offset="1" stop-color="${BOT}"/></linearGradient></defs>`;

// speed lines (left) + forward-tilted cart (white), no dot
const content = `
  <g stroke="${LINE}" stroke-width="20" stroke-linecap="round">
    <path d="M84 206 h74"/><path d="M104 258 h54"/><path d="M120 310 h38"/>
  </g>
  <g transform="rotate(-10 290 260)"><g transform="translate(26,0)">
    <g fill="none" stroke="${LINE}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
      <path d="M120 150 h44 l40 168 h150 l40 -120 H196"/>
      <circle cx="222" cy="372" r="20" fill="${LINE}"/><circle cx="350" cy="372" r="20" fill="${LINE}"/>
    </g>
  </g></g>`;

// variant: 'rounded' (standard/any), 'mask' (full-bleed + safe-zone), 'square' (apple)
function svg(variant) {
  const bg =
    variant === 'rounded'
      ? `<rect width="512" height="512" rx="${Rk}" fill="url(#g)"/>`
      : `<rect width="512" height="512" fill="url(#g)"/>`; // full-bleed for mask + apple
  // maskable safe zone: shrink content to the central ~80% so circular masks don't clip
  const inner =
    variant === 'mask'
      ? `<g transform="translate(256 256) scale(0.8) translate(-256 -256)">${content}</g>`
      : content;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${grad}${bg}${inner}</svg>`;
}

const png = (s, size) => new Resvg(s, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync('public/pwa-192.png', png(svg('rounded'), 192));
writeFileSync('public/pwa-512.png', png(svg('rounded'), 512));
writeFileSync('public/pwa-512-maskable.png', png(svg('mask'), 512));
writeFileSync('public/apple-touch-icon.png', png(svg('square'), 180));
writeFileSync('public/favicon.svg', svg('rounded'));
console.log('icons written to public/ (vertical green→teal gradient, tilted motion trolley)');
