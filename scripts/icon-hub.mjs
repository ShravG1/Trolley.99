// HUB app icon — glowing amber core + radiating network forming an "H".
// Near-black bg, top radial amber glow, faint scanlines. Renders a compare sheet
// plus full-res outputs. Run: node scripts/icon-hub.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('icon-previews', { recursive: true });
mkdirSync('hub-icons', { recursive: true });

const BG = '#0B0B0D';
const AMBER = '#E0A84E';
const AMBER_HOT = '#F4C77A';
const OFF = '#E9E5DB';

// H-network geometry (512 box)
const Lx = 182, Rx = 330, top = 156, mid = 256, bot = 356, cx = 256, cy = 256;
const N = {
  lt: [Lx, top], lm: [Lx, mid], lb: [Lx, bot],
  rt: [Rx, top], rm: [Rx, mid], rb: [Rx, bot],
};
const line = (a, b, w, op) =>
  `<path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]}" stroke="${AMBER}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
const node = (p, r, fill = AMBER, op = 1) => `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${fill}" opacity="${op}"/>`;

function scanlines() {
  let s = '';
  for (let y = 0; y < 512; y += 5) s += `<rect x="0" y="${y}" width="512" height="1" fill="${OFF}" opacity="0.022"/>`;
  return `<g>${s}</g>`;
}

// variant opts: diagonals (faint nexus lines), glowSd (blur), dense (extra nodes)
function hub({ diagonals = true, glowSd = 6, dense = false, rounded = true } = {}) {
  const clip = rounded ? `<clipPath id="c"><rect width="512" height="512" rx="112"/></clipPath>` : '';
  const frame = rounded ? `clip-path="url(#c)"` : '';

  const legs =
    line(N.lt, N.lm, 6, 0.95) + line(N.lm, N.lb, 6, 0.95) +
    line(N.rt, N.rm, 6, 0.95) + line(N.rm, N.rb, 6, 0.95);
  const cross = line(N.lm, [cx, cy], 6, 1) + line([cx, cy], N.rm, 6, 1);
  const diag = diagonals
    ? line([cx, cy], N.lt, 2.5, 0.32) + line([cx, cy], N.lb, 2.5, 0.32) +
      line([cx, cy], N.rt, 2.5, 0.32) + line([cx, cy], N.rb, 2.5, 0.32)
    : '';
  const extra = dense
    ? node([cx, 150], 3, AMBER, 0.5) + node([cx, 362], 3, AMBER, 0.5) +
      line([cx, cy], [cx, 150], 2, 0.22) + line([cx, cy], [cx, 362], 2, 0.22)
    : '';

  const nodes =
    node(N.lt, 9) + node(N.lb, 9) + node(N.rt, 9) + node(N.rb, 9) +
    node(N.lm, 12) + node(N.rm, 12);

  // core: layered halo + hot centre
  const core =
    `<circle cx="${cx}" cy="${cy}" r="34" fill="${AMBER}" opacity="0.18"/>` +
    `<circle cx="${cx}" cy="${cy}" r="22" fill="${AMBER}" opacity="0.9"/>` +
    `<circle cx="${cx}" cy="${cy}" r="11" fill="${AMBER_HOT}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="5" fill="${OFF}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>${clip}
      <radialGradient id="top" cx="50%" cy="2%" r="75%">
        <stop offset="0" stop-color="${AMBER}" stop-opacity="0.28"/>
        <stop offset="45%" stop-color="${AMBER}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${AMBER}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vig" cx="50%" cy="50%" r="75%">
        <stop offset="60%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
      </radialGradient>
      <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="${glowSd}" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g ${frame}>
      <rect width="512" height="512" fill="${BG}"/>
      <rect width="512" height="512" fill="url(#top)"/>
      ${scanlines()}
      <rect width="512" height="512" fill="url(#vig)"/>
      <g filter="url(#glow)">${diag}${extra}${legs}${cross}${nodes}</g>
      ${core}
    </g>
  </svg>`;
}

const variants = {
  A_balanced: hub({ diagonals: true, glowSd: 6 }),
  B_minimal: hub({ diagonals: false, glowSd: 5 }),
  C_dense: hub({ diagonals: true, glowSd: 7, dense: true }),
};

// compare sheet
const labels = ['A · Balanced', 'B · Minimal (H bold)', 'C · Denser nexus'];
const keys = Object.keys(variants);
const icon = 360, pad = 60, labelH = 56;
const W = keys.length * (icon + pad) + pad, H = icon + labelH + pad * 2;
let cells = '';
keys.forEach((k, i) => {
  const x = pad + i * (icon + pad), s = icon / 512;
  cells += `<g transform="translate(${x},${pad})"><g transform="scale(${s})">${variants[k].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>
    <text x="${icon / 2}" y="${icon + 38}" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#2A241F">${labels[i]}</text></g>`;
});
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#FBF8F1"/>${cells}</svg>`;
writeFileSync('icon-previews/hub.png', new Resvg(sheet, { fitTo: { mode: 'width', value: W } }).render().asPng());

// also render each at small size (96px) to check legibility
const small = keys.map((k, i) => {
  const s = 96 / 512;
  return `<g transform="translate(${pad + i * (110)},${pad})"><g transform="scale(${s})">${variants[k].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g></g>`;
}).join('');
const smallSheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${pad * 2 + keys.length * 110}" height="${96 + pad * 2}"><rect width="100%" height="100%" fill="#FBF8F1"/>${small}</svg>`;
writeFileSync('icon-previews/hub-small.png', new Resvg(smallSheet, { fitTo: { mode: 'width', value: pad * 2 + keys.length * 110 } }).render().asPng());

console.log('wrote icon-previews/hub.png + hub-small.png');
