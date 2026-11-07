// Renders the screen backdrop (src/components/ui/Backdrop.tsx) to two small PNGs, once, instead of drawing SVG
// radial gradients on every screen. Stretched to fill the screen (like the SVG's preserveAspectRatio="none"), so the
// gradients are computed in 0–1 box coordinates. Light ordered dithering keeps the dark gradients free of banding.
// Usage: node scripts/generate-backdrop.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 180;
const H = 390;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex(process.env.BG ?? '#081220');
const BLUE = hex('#2563EB');
const ORANGE = hex('#F97316');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const dither = (x, y) => BAYER[(y % 4) * 4 + (x % 4)];

/** Linear radial falloff, like an SVG radialGradient with stops 0 → 1 (objectBoundingBox units). */
const radial = (x, y, cx, cy, r) => Math.max(0, 1 - Math.hypot(x / W - cx, y / H - cy) / r);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(pixel, ditherAlpha = false) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const p = pixel(x, y);
      const o = y * (W * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 4; i++) raw[o + i] = Math.max(0, Math.min(255, Math.round(p[i] + ((i < 3) !== ditherAlpha ? dither(x, y) : 0))));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Base: the navy with the cool key light from the upper left (stop opacity 0.22).
writeFileSync(
  'assets/images/backdrop/base.png',
  png((x, y) => {
    const a = 0.22 * radial(x, y, 0.15, 0, 0.75);
    return [...BG.map((c, i) => c + (BLUE[i] - c) * a), 255];
  }),
);
// Rim: the warm light from the lower right at full strength; the component sets its opacity (the old `warm` prop).
writeFileSync(
  'assets/images/backdrop/rim.png',
  png((x, y) => [...ORANGE, 255 * radial(x, y, 1, 1, 0.7)], true),
);
console.log('wrote assets/images/backdrop/base.png and rim.png');
