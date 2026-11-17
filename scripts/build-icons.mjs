// Draws the app icon: a "t" in the theme's ground colour on its ink colour.
// Writes public/icon.svg and the PNG sizes that phones ask for. The mark sits
// inside the middle of the square, so a phone that masks the icon to a circle
// does not cut into it.
//
//   node scripts/build-icons.mjs

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const INK = [0x16, 0x18, 0x1d];
const GROUND = [0xf3, 0xf4, 0xf1];

// The mark on a 512 grid, as [x, y, width, height]: stem, crossbar, foot.
const MARK = [
  [216, 128, 80, 256],
  [152, 200, 208, 64],
  [216, 320, 144, 64],
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), body.length + 4);
  return out;
};

function png(size) {
  const scale = size / 512;
  const inMark = (x, y) => MARK.some(([mx, my, w, h]) => x >= mx * scale && x < (mx + w) * scale && y >= my * scale && y < (my + h) * scale);
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) rows.set(inMark(x + 0.5, y + 0.5) ? GROUND : INK, row + 1 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits a channel, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${hex(INK)}"/>
${MARK.map(([x, y, w, h]) => `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${hex(GROUND)}"/>`).join('\n')}
</svg>
`;

writeFileSync('public/icon.svg', svg);
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) writeFileSync('public/' + name, png(size));
console.log('icons written to public/');
