// One-off icon generator — writes brand-green PNGs with a white "T" glyph so the
// PWA has valid icons without a binary asset pipeline. Re-run with `node
// scripts/gen-icons.mjs`. Replace with proper designed icons before launch.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });

const BRAND = [0x2f, 0x8f, 0x5b];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, { maskable } = {}) {
  const px = (x, y) => {
    // glyph geometry — a chunky "T"
    const m = maskable ? 0.78 : 0.62; // glyph extent (smaller for maskable safe zone)
    const cx = size / 2;
    const half = (size * m) / 2;
    const top = cx - half;
    const bottom = cx + half;
    const barH = size * 0.16;
    const stemW = size * 0.16;
    const inX = x >= top && x <= bottom;
    const inTopBar = y >= top && y <= top + barH && inX;
    const inStem = Math.abs(x - cx) <= stemW / 2 && y >= top && y <= bottom;
    return inTopBar || inStem ? WHITE : BRAND;
  };

  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/pwa-192.png', png(192));
writeFileSync('public/pwa-512.png', png(512));
writeFileSync('public/pwa-512-maskable.png', png(512, { maskable: true }));
writeFileSync('public/apple-touch-icon.png', png(180));
console.log('icons written to public/');
