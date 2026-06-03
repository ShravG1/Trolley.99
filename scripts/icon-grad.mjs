// Tilted motion cart on GRADIENT backgrounds — variations. One contact sheet.
// Run: node scripts/icon-grad.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const C = {
  green: '#2F8F5B', greenLt: '#46B26F', greenDk: '#1F5E3C', teal: '#3FA199', tealDk: '#2B7E77',
  paper: '#F6F1E7', white: '#FFFFFF', paprika: '#E0552B', amber: '#D99A2B',
  plum: '#7E58B6', charcoal: '#241F1B', honey: '#FFE3B0',
};
const Rk = 112;

function lines(color, style = 'taper') {
  const sets = {
    taper: [[84, 158, 206], [104, 158, 258], [120, 158, 310]],
    long: [[70, 156, 210], [86, 156, 262], [70, 156, 314]],
  }[style];
  return `<g stroke="${color}" stroke-width="20" stroke-linecap="round">${sets
    .map(([x1, x2, y]) => `<path d="M${x1} ${y} h${x2 - x1}"/>`).join('')}</g>`;
}
function cart(stroke, { solid = false, dot, tilt = -10 } = {}) {
  const inner = solid
    ? `<path d="M196 196 H404 L362 316 H236 Z" fill="${stroke}"/>
       <path d="M120 150 h44 l28 118" fill="none" stroke="${stroke}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="232" cy="372" r="22" fill="${stroke}"/><circle cx="352" cy="372" r="22" fill="${stroke}"/>`
    : `<g fill="none" stroke="${stroke}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
         <path d="M120 150 h44 l40 168 h150 l40 -120 H196"/>
         <circle cx="222" cy="372" r="20" fill="${stroke}"/><circle cx="350" cy="372" r="20" fill="${stroke}"/></g>`;
  const acc = dot ? `<circle cx="300" cy="232" r="16" fill="${dot}"/>` : '';
  return `<g transform="rotate(${tilt} 290 260)"><g transform="translate(26,0)">${inner}${acc}</g></g>`;
}
// gradient bg; dir: 'diag' | 'diagRev' | 'vert' | 'horiz'
function gbg(id, a, b, dir = 'diag') {
  const d = { diag: [0,0,1,1], diagRev: [1,0,0,1], vert: [0,0,0,1], horiz: [0,0,1,0] }[dir];
  return `<defs><linearGradient id="${id}" x1="${d[0]}" y1="${d[1]}" x2="${d[2]}" y2="${d[3]}">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="512" height="512" rx="${Rk}" fill="url(#${id})"/>`;
}

const designs = {
  // the requested base: #9 tilt + #8 gradient
  base:    `${gbg('a', C.greenLt, C.teal)}${lines(C.white)}${cart(C.white, { dot: C.honey, tilt: -10 })}`,
  reverse: `${gbg('b', C.teal, C.green, 'diagRev')}${lines(C.white)}${cart(C.white, { dot: C.honey, tilt: -10 })}`,
  subtle:  `${gbg('c', C.greenLt, C.green)}${lines(C.white)}${cart(C.white, { dot: C.honey, tilt: -8 })}`,
  deep:    `${gbg('d', C.green, C.greenDk)}${lines(C.white)}${cart(C.white, { dot: C.amber, tilt: -10 })}`,
  sunset:  `${gbg('e', C.green, C.amber)}${lines(C.white)}${cart(C.white, { dot: C.paprika, tilt: -10 })}`,
  warm:    `${gbg('f', C.green, C.paprika)}${lines(C.white)}${cart(C.white, { dot: C.honey, tilt: -10 })}`,
  vert:    `${gbg('g', C.greenLt, C.tealDk, 'vert')}${lines(C.white)}${cart(C.white, { dot: C.honey, tilt: -10 })}`,
  darkgrad:`${gbg('h', C.charcoal, C.green, 'diag')}${lines(C.greenLt)}${cart(C.white, { dot: C.paprika, tilt: -10 })}`,
  plum:    `${gbg('i', C.green, C.plum)}${lines(C.white)}${cart(C.white, { dot: C.honey, tilt: -10 })}`,
  solid:   `${gbg('j', C.greenLt, C.teal)}${lines(C.white)}${cart(C.white, { solid: true, tilt: -10 })}`,
  moretilt:`${gbg('k', C.greenLt, C.teal)}${lines(C.white, 'long')}${cart(C.white, { dot: C.honey, tilt: -14 })}`,
  tealgreen:`${gbg('l', C.teal, C.greenDk, 'horiz')}${lines(C.white)}${cart(C.white, { dot: C.honey, tilt: -10 })}`,
};

const labels = ['1 Base (9+8)','2 Reverse','3 Subtle','4 Deep green','5 Sunset','6 Warm/paprika','7 Vertical','8 Dark grad','9 Plum','10 Solid cart','11 More tilt','12 Teal→green'];
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
writeFileSync('icon-previews/grad.png', new Resvg(sheet, { fitTo: { mode: 'width', value: W } }).render().asPng());
console.log('wrote icon-previews/grad.png', W, 'x', H);
