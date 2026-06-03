// Renders 10 varied icon designs onto ONE contact sheet for side-by-side compare.
// Run: node scripts/icon-options2.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const C = {
  green: '#2F8F5B', greenLt: '#46B26F', greenDk: '#226E45', teal: '#3FA199',
  paper: '#F6F1E7', cream: '#EFE6D6', white: '#FFFFFF',
  paprika: '#E0552B', amber: '#D99A2B', plum: '#7E58B6',
  ink: '#2A241F', charcoal: '#241F1B',
};

// Each design returns inner SVG drawn in a 512 box, including its rounded bg.
const R = 112;
const bg = (fill) => `<rect width="512" height="512" rx="${R}" fill="${fill}"/>`;
const cart = (stroke, dot) => `
  <g fill="none" stroke="${stroke}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <path d="M120 150 h44 l40 168 h150 l40 -120 H196"/>
    <circle cx="222" cy="372" r="20" fill="${stroke}"/>
    <circle cx="350" cy="372" r="20" fill="${stroke}"/>
  </g>${dot ? `<circle cx="300" cy="232" r="16" fill="${dot}"/>` : ''}`;

const designs = {
  // 1 — paper bag, warm cream, ink outline + green leaf (fixed flap)
  bag: `${bg(C.cream)}
    <path d="M176 206 h160 v140 a44 44 0 0 1 -44 44 H220 a44 44 0 0 1 -44 -44 Z" fill="${C.amber}" opacity="0.3"/>
    <path d="M176 206 h160 v140 a44 44 0 0 1 -44 44 H220 a44 44 0 0 1 -44 -44 Z" fill="none" stroke="${C.ink}" stroke-width="20"/>
    <path d="M176 206 v-26 h160 v26" fill="none" stroke="${C.ink}" stroke-width="20" stroke-linejoin="round"/>
    <path d="M256 206 c0 -36 24 -60 58 -60 c0 36 -24 60 -58 60 Z" fill="${C.green}"/>`,
  // 2 — clean white, green trolley + paprika item
  trolleyWhite: `${bg(C.white)}${cart(C.green, C.paprika)}`,
  // 3 — dark "sofa at 11", green trolley
  trolleyDark: `${bg(C.charcoal)}${cart(C.greenLt, C.paprika)}`,
  // 4 — diagonal two-tone (paper / green), white trolley
  split: `<defs><clipPath id="r"><rect width="512" height="512" rx="${R}"/></clipPath></defs>
    <g clip-path="url(#r)"><rect width="512" height="512" fill="${C.paper}"/>
    <path d="M512 0 L512 512 L0 512 Z" fill="${C.green}"/></g>${cart(C.white, C.paprika)}`,
  // 5 — paprika background, cream trolley (bold, different colour)
  paprika: `${bg(C.paprika)}${cart(C.paper, C.white)}`,
  // 6 — checklist / notepad on cream (three lines + tick)
  checklist: `${bg(C.cream)}
    <g stroke="${C.ink}" stroke-width="22" stroke-linecap="round"><path d="M214 188 h130"/><path d="M214 256 h130"/><path d="M214 324 h90"/></g>
    <g stroke="${C.green}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M150 178 l20 20 l34 -38"/><path d="M150 246 l20 20 l34 -38"/></g>
    <path d="M150 314 l20 20 l34 -38" fill="none" stroke="${C.paprika}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 7 — gradient green→teal, white trolley
  gradient: `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.greenLt}"/><stop offset="1" stop-color="${C.teal}"/></linearGradient></defs>
    <rect width="512" height="512" rx="${R}" fill="url(#g)"/>${cart(C.white, '#FFE3B0')}`,
  // 8 — basket on cream, green basket + paprika tick
  basketCream: `${bg(C.cream)}
    <g fill="none" stroke="${C.green}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
      <path d="M150 220 h212 l-26 150 a16 16 0 0 1 -16 14 H192 a16 16 0 0 1 -16 -14 Z"/>
      <path d="M206 220 l40 -70 M306 220 l-40 -70"/></g>
    <path d="M214 300 l34 34 l66 -74" fill="none" stroke="${C.paprika}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 9 — roundel/badge: paper bg, green ring + trolley
  roundel: `${bg(C.paper)}
    <circle cx="256" cy="256" r="150" fill="none" stroke="${C.green}" stroke-width="18"/>
    <g transform="translate(40,46) scale(0.82)">${cart(C.green, C.paprika)}</g>`,
  // 10 — amber/honey bg, ink trolley (warm, grocery-stall feel)
  amber: `${bg(C.amber)}${cart(C.ink, C.paprika)}`,
};

// --- compose contact sheet: 5 cols x 2 rows --------------------------------
const labels = ['1 Bag','2 Trolley/white','3 Trolley/dark','4 Two-tone','5 Paprika','6 Checklist','7 Gradient','8 Basket','9 Roundel','10 Amber'];
const keys = Object.keys(designs);
const cols = 5, rows = 2, icon = 300, padX = 56, padY = 40, labelH = 54;
const cellW = icon + padX, cellH = icon + labelH + padY;
const W = cols * cellW + padX, H = rows * cellH + padY;
let cells = '';
keys.forEach((k, i) => {
  const cx = padX + (i % cols) * cellW;
  const cy = padY + Math.floor(i / cols) * cellH;
  const s = icon / 512;
  cells += `
    <g transform="translate(${cx},${cy})">
      <g transform="scale(${s})">${designs[k]}</g>
      <rect width="${icon}" height="${icon}" rx="${R * s}" fill="none" stroke="#0000001a" stroke-width="2"/>
      <text x="${icon / 2}" y="${icon + 36}" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#2A241F">${labels[i]}</text>
    </g>`;
});
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FBF8F1"/>${cells}</svg>`;
writeFileSync('icon-previews/sheet.png', new Resvg(sheet, { fitTo: { mode: 'width', value: W } }).render().asPng());
console.log('wrote icon-previews/sheet.png', W, 'x', H);
