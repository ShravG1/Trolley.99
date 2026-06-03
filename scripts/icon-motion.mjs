// Variations on the "motion" trolley (cart + speed lines). One contact sheet.
// Run: node scripts/icon-motion.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const C = {
  green: '#2F8F5B', greenLt: '#46B26F', greenDk: '#226E45', teal: '#3FA199',
  paper: '#F6F1E7', cream: '#EFE6D6', white: '#FFFFFF',
  paprika: '#E0552B', amber: '#D99A2B', ink: '#2A241F', charcoal: '#241F1B',
};
const Rk = 112;

// speed lines on the left at 3 heights; style controls taper/length
function lines(color, style = 'short') {
  const sets = {
    short: [[96, 150, 210], [104, 158, 262], [96, 150, 314]],
    taper: [[84, 158, 206], [104, 158, 258], [120, 158, 310]],
    taperUp: [[120, 158, 206], [104, 158, 258], [84, 158, 310]],
    long: [[70, 156, 210], [86, 156, 262], [70, 156, 314]],
  }[style];
  return `<g stroke="${color}" stroke-width="20" stroke-linecap="round">${sets
    .map(([x1, x2, y]) => `<path d="M${x1} ${y} h${x2 - x1}"/>`)
    .join('')}</g>`;
}

// outline or solid cart, shifted right to leave room for the lines
function cart(stroke, { solid = false, dot, tilt = 0 } = {}) {
  const inner = solid
    ? `<path d="M196 196 H404 L362 316 H236 Z" fill="${stroke}"/>
       <path d="M120 150 h44 l28 118" fill="none" stroke="${stroke}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="232" cy="372" r="22" fill="${stroke}"/><circle cx="352" cy="372" r="22" fill="${stroke}"/>`
    : `<g fill="none" stroke="${stroke}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
         <path d="M120 150 h44 l40 168 h150 l40 -120 H196"/>
         <circle cx="222" cy="372" r="20" fill="${stroke}"/><circle cx="350" cy="372" r="20" fill="${stroke}"/></g>`;
  const acc = dot ? `<circle cx="300" cy="232" r="16" fill="${dot}"/>` : '';
  const g = `<g transform="translate(26,0)">${inner}${acc}</g>`;
  return tilt ? `<g transform="rotate(${tilt} 290 260)">${g}</g>` : g;
}

const bg = (f) => `<rect width="512" height="512" rx="${Rk}" fill="${f}"/>`;
const grad = (id, a, b) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
const twotone = (id, base, dark) =>
  `<defs><clipPath id="${id}"><rect width="512" height="512" rx="${Rk}"/></clipPath></defs>
   <g clip-path="url(#${id})"><rect width="512" height="512" fill="${base}"/><path d="M512 0 H0 L512 512 Z" fill="${dark}"/></g>`;

const designs = {
  amber:    `${bg(C.amber)}${lines(C.ink, 'short')}${cart(C.ink, { dot: C.paprika })}`,
  green:    `${bg(C.green)}${lines(C.paper, 'taper')}${cart(C.paper, { dot: C.amber })}`,
  white:    `${bg(C.white)}${lines(C.paprika, 'taper')}${cart(C.green, { dot: C.paprika })}`,
  dark:     `${bg(C.charcoal)}${lines(C.teal, 'long')}${cart(C.greenLt, { dot: C.paprika })}`,
  paprika:  `${bg(C.paprika)}${lines(C.paper, 'taper')}${cart(C.paper, { solid: true })}`,
  creamG:   `${bg(C.cream)}${lines(C.paprika, 'taperUp')}${cart(C.green, { dot: C.paprika, tilt: -8 })}`,
  inkSolid: `${bg(C.white)}${lines(C.paprika, 'short')}${cart(C.ink, { solid: true })}`,
  gradient: `${grad('g1', C.greenLt, C.teal)}<rect width="512" height="512" rx="${Rk}" fill="url(#g1)"/>${lines(C.white, 'taper')}${cart(C.white, { dot: '#FFE3B0' })}`,
  tilt:     `${bg(C.paper)}${lines(C.green, 'long')}${cart(C.green, { dot: C.paprika, tilt: -10 })}`,
  twotone:  `${twotone('t1', C.green, C.greenDk)}${lines(C.white, 'taper')}${cart(C.white, { dot: '#FFE3B0' })}`,
  duo:      `${bg(C.paper)}${lines(C.green, 'taper')}
             <g transform="translate(26,0)">
               <path d="M204 318 h150 l40 -120 H196" fill="none" stroke="${C.green}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
               <path d="M120 150 h44 l40 168" fill="none" stroke="${C.paprika}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
               <circle cx="222" cy="372" r="22" fill="${C.paprika}"/><circle cx="350" cy="372" r="22" fill="${C.paprika}"/></g>`,
  darkGreen:`${bg(C.charcoal)}${lines(C.paprika, 'long')}${cart(C.greenLt, { tilt: -8 })}`,
};

const labels = ['1 Amber','2 Green','3 White','4 Dark/teal','5 Paprika','6 Cream tilt','7 Ink solid','8 Gradient','9 Paper tilt','10 Two-tone','11 Duotone','12 Dark green'];
const keys = Object.keys(designs);
const cols = 4, icon = 300, padX = 56, padY = 44, labelH = 54;
const rows = Math.ceil(keys.length / cols);
const cellW = icon + padX, cellH = icon + labelH + padY;
const W = cols * cellW + padX, H = rows * cellH + padY;
let cells = '';
keys.forEach((k, i) => {
  const cx = padX + (i % cols) * cellW, cy = padY + Math.floor(i / cols) * cellH, s = icon / 512;
  cells += `<g transform="translate(${cx},${cy})"><g transform="scale(${s})">${designs[k]}</g>
    <rect width="${icon}" height="${icon}" rx="${Rk * s}" fill="none" stroke="#0000001a" stroke-width="2"/>
    <text x="${icon / 2}" y="${icon + 36}" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#2A241F">${labels[i]}</text></g>`;
});
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#FBF8F1"/>${cells}</svg>`;
writeFileSync('icon-previews/motion.png', new Resvg(sheet, { fitTo: { mode: 'width', value: W } }).render().asPng());
console.log('wrote icon-previews/motion.png', W, 'x', H);
