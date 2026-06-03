// 12 TROLLEY style variations on one contact sheet.
// Run: node scripts/icon-trolleys.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const C = {
  green: '#2F8F5B', greenLt: '#46B26F', greenDk: '#226E45', teal: '#3FA199',
  paper: '#F6F1E7', cream: '#EFE6D6', white: '#FFFFFF',
  paprika: '#E0552B', amber: '#D99A2B', plum: '#7E58B6',
  ink: '#2A241F', charcoal: '#241F1B',
};
const Rk = 112;
const bg = (f) => `<rect width="512" height="512" rx="${Rk}" fill="${f}"/>`;

// outline cart (variable stroke + wheel radius), optional accent dot
const outline = (st, sw = 26, wr = 20, dot) => `
  <g fill="none" stroke="${st}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M120 150 h44 l40 168 h150 l40 -120 H196"/>
    <circle cx="222" cy="372" r="${wr}" fill="${st}"/><circle cx="350" cy="372" r="${wr}" fill="${st}"/>
  </g>${dot ? `<circle cx="300" cy="232" r="16" fill="${dot}"/>` : ''}`;

const designs = {
  // 1 classic outline — white bg
  classic: `${bg(C.white)}${outline(C.green, 26, 20, C.paprika)}`,
  // 2 solid silhouette — cream bg
  solid: `${bg(C.cream)}
    <path d="M196 196 H404 L362 316 H236 Z" fill="${C.green}"/>
    <path d="M120 150 h44 l28 118" fill="none" stroke="${C.green}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="232" cy="372" r="24" fill="${C.green}"/><circle cx="352" cy="372" r="24" fill="${C.green}"/>`,
  // 3 chunky rounded — paprika bg, cream cart
  chunky: `${bg(C.paprika)}${outline(C.paper, 42, 26)}`,
  // 4 front-view grid basket — dark bg
  front: `${bg(C.charcoal)}
    <g fill="none" stroke="${C.greenLt}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">
      <path d="M168 196 H344 L326 330 H186 Z"/>
      <path d="M214 196 V330 M256 196 V330 M298 196 V330"/>
      <path d="M168 230 H344"/>
      <circle cx="214" cy="372" r="18" fill="${C.greenLt}"/><circle cx="298" cy="372" r="18" fill="${C.greenLt}"/></g>`,
  // 5 cart with groceries — cream bg, ink cart + colour items
  items: `${bg(C.cream)}
    <circle cx="232" cy="170" r="26" fill="${C.paprika}"/>
    <rect x="270" y="150" width="46" height="46" rx="8" fill="${C.green}"/>
    <circle cx="344" cy="172" r="22" fill="${C.amber}"/>
    ${outline(C.ink, 24, 18)}`,
  // 6 cart carrying a tick — white bg
  tickcart: `${bg(C.white)}
    ${outline(C.green, 24, 18)}
    <path d="M232 250 l28 28 l54 -62" fill="none" stroke="${C.paprika}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 7 duotone — paper bg, green basket + paprika handle/wheels
  duotone: `${bg(C.paper)}
    <path d="M204 318 h150 l40 -120 H196" fill="none" stroke="${C.green}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M120 150 h44 l40 168" fill="none" stroke="${C.paprika}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="222" cy="372" r="22" fill="${C.paprika}"/><circle cx="350" cy="372" r="22" fill="${C.paprika}"/>`,
  // 8 cart + leaf — cream bg
  leaf: `${bg(C.cream)}
    ${outline(C.green, 26, 20)}
    <path d="M300 196 c0 -40 26 -66 64 -66 c0 40 -26 66 -64 66 Z" fill="${C.greenLt}"/>
    <path d="M300 196 v-26" stroke="${C.greenLt}" stroke-width="12" stroke-linecap="round"/>`,
  // 9 minimal basket only — white bg, ink
  minimal: `${bg(C.white)}
    <path d="M150 200 h150 l-22 120 h-106 Z" fill="none" stroke="${C.ink}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M300 200 l44 -36" fill="none" stroke="${C.ink}" stroke-width="26" stroke-linecap="round"/>
    <circle cx="194" cy="360" r="16" fill="${C.ink}"/><circle cx="262" cy="360" r="16" fill="${C.ink}"/>`,
  // 10 geometric / angular — dark bg, teal
  geometric: `${bg(C.charcoal)}
    <g fill="none" stroke="${C.teal}" stroke-width="26" stroke-linejoin="miter" stroke-linecap="butt">
      <path d="M130 152 h46 l44 166 h150 l36 -118 H206"/>
      <rect x="206" y="352" width="36" height="36"/><rect x="332" y="352" width="36" height="36"/></g>`,
  // 11 motion / in-the-shop — amber bg, ink cart + speed lines
  motion: `${bg(C.amber)}
    <g stroke="${C.ink}" stroke-width="20" stroke-linecap="round"><path d="M96 210 h54"/><path d="M104 262 h54"/><path d="M96 314 h54"/></g>
    <g transform="translate(26,0)">${outline(C.ink, 26, 20, C.paprika)}</g>`,
  // 12 cart-as-T — two-tone bg, white cart with bold T handle
  cartT: `<defs><clipPath id="r"><rect width="512" height="512" rx="${Rk}"/></clipPath></defs>
    <g clip-path="url(#r)"><rect width="512" height="512" fill="${C.green}"/><path d="M0 0 H512 L0 512 Z" fill="${C.greenDk}"/></g>
    <path d="M150 150 h150 M225 150 v60" stroke="${C.white}" stroke-width="30" stroke-linecap="round"/>
    <path d="M204 318 h150 l40 -120 H210" fill="none" stroke="${C.white}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="232" cy="372" r="20" fill="${C.white}"/><circle cx="350" cy="372" r="20" fill="${C.white}"/>`,
};

const labels = ['1 Classic','2 Solid','3 Chunky','4 Front grid','5 Groceries','6 Tick-cart','7 Duotone','8 Leaf','9 Minimal','10 Geometric','11 Motion','12 Cart-T'];
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
writeFileSync('icon-previews/trolleys.png', new Resvg(sheet, { fitTo: { mode: 'width', value: W } }).render().asPng());
console.log('wrote icon-previews/trolleys.png', W, 'x', H);
