#!/usr/bin/env node
/**
 * Bá Khí — sinh favicon PNG/ICO tĩnh từ cùng hình học với favicon.svg.
 *
 * Không dùng thư viện ngoài: tự vẽ (supersampling 4×) và tự mã hoá PNG
 * bằng zlib của Node. Chạy lại khi muốn tạo lại bộ biểu tượng:
 *
 *   node tools/make-favicon.js
 *
 * Đầu ra (assets/bakhi/):
 *   favicon-16x16.png, favicon-32x32.png, favicon-48x48.png,
 *   favicon-192x192.png, favicon-512x512.png, apple-touch-icon.png,
 *   favicon.ico (16/32/48, PNG-in-ICO)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'bakhi');
const SS = 4; // supersampling mỗi trục

const TILE_FROM = [24, 24, 31];
const TILE_TO = [12, 12, 16];
const PINK = [255, 182, 193];

/** Điểm nằm trong hình chữ nhật bo góc (toạ độ 64×64). */
function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Cung tròn SVG (góc độ, y hướng xuống) thành các điểm đa giác. */
function arc(cx, cy, r, fromDeg, toDeg, steps, out) {
  for (let i = 0; i <= steps; i += 1) {
    const a = (fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
}

/** Dấu "khí": điểm neo có quầng, hai cung aura và một vệt echo mảnh (khung 64). */
const AURA = {
  cx: 24, cy: 40, dot: 5.2,
  rings: [[22, 2.2, -90, -18], [13, 2.0, -92, -30]],
  halo: [8.7, 0.6],
  echo: [30, 0.5, -90, -44]
};

function insideAura(x, y, detail, micro) {
  const dx = x - AURA.cx;
  const dy = y - AURA.cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  /* Cỡ 16/32: chỉ còn điểm neo + một cung dày, nếu không sẽ nhoè thành vệt. */
  if (micro) {
    if (d <= 7.4) return true;
    return Math.abs(d - 13.6) <= 4.4 && ang >= -102 && ang <= -30;
  }
  /* Cỡ nhỏ-vừa: nét dày lên để đọc được sau khi thu nhỏ. */
  const k = detail ? 1 : 1.45;
  if (d <= (detail ? AURA.dot : AURA.dot + 0.6)) return true;
  const hit = (r, w, a0, a1) => Math.abs(d - r) <= w * k && ang >= a0 && ang <= a1;
  if (AURA.rings.some(([r, w, a0, a1]) => hit(r, w, a0, a1))) return true;
  if (!detail) return false;
  const [hr, hw] = AURA.halo;
  if (Math.abs(d - hr) <= hw) return true;
  const [er, ew, ea0, ea1] = AURA.echo;
  return Math.abs(d - er) <= ew && ang >= ea0 && ang <= ea1;
}

/** Nền graphite, sáng dần từ góc trên-trái. */
function tileColor(x, y) {
  const t = Math.min(1, Math.max(0, (x + y) / 112));
  return [0, 1, 2].map((i) => Math.round(TILE_FROM[i] + (TILE_TO[i] - TILE_FROM[i]) * t));
}

function insidePolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function gradientColor(x, y) {
  const t = Math.min(1, Math.max(0, ((x - 4) + (y - 4)) / 112));
  const r = Math.round(INDIGO[0] + (PURPLE[0] - INDIGO[0]) * t);
  const g = Math.round(INDIGO[1] + (PURPLE[1] - INDIGO[1]) * t);
  const b = Math.round(INDIGO[2] + (PURPLE[2] - INDIGO[2]) * t);
  return [r, g, b];
}

/**
 * Vẽ biểu tượng thành RGBA.
 * @param {number} size cạnh ảnh đầu ra
 * @param {boolean} square nền vuông kín (apple-touch-icon) thay vì bo góc
 */
function render(size, square) {
  const rgba = Buffer.alloc(size * size * 4, 0);
  const scale = 64 / size;
  const radius = square ? 0 : 16;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let bgHits = 0;
      let fgHits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) * scale;
          const y = (py + (sy + 0.5) / SS) * scale;
          if (square || insideRoundedRect(x, y, 0, 0, 64, 64, radius)) {
            bgHits += 1;
            if (insideAura(x, y, size >= 48, size <= 32)) fgHits += 1;
          }
        }
      }
      const total = SS * SS;
      const bgA = bgHits / total;
      const fgA = fgHits / total;
      if (bgA === 0) continue;
      const [r, g, b] = tileColor(px * scale, py * scale);
      // Trộn hồng (logo) lên nền graphite.
      const mix = (base, i) => Math.round(base + (PINK[i] - base) * (fgA / bgA));
      const i = (py * size + px) * 4;
      rgba[i] = mix(r, 0);
      rgba[i + 1] = mix(g, 1);
      rgba[i + 2] = mix(b, 2);
      rgba[i + 3] = Math.round(bgA * 255);
    }
  }
  return rgba;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0; // filter none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  images.forEach((img) => {
    const entry = Buffer.alloc(16);
    entry[0] = img.size >= 256 ? 0 : img.size;
    entry[1] = img.size >= 256 ? 0 : img.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += img.data.length;
    entries.push(entry);
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

function pngFor(size, square) {
  return encodePng(render(size, square), size);
}

fs.mkdirSync(OUT, { recursive: true });
const files = [
  ['favicon-16x16.png', pngFor(16, false)],
  ['favicon-32x32.png', pngFor(32, false)],
  ['favicon-48x48.png', pngFor(48, false)],
  ['favicon-192x192.png', pngFor(192, false)],
  ['favicon-512x512.png', pngFor(512, false)],
  ['apple-touch-icon.png', pngFor(180, true)]
];
for (const [name, data] of files) {
  fs.writeFileSync(path.join(OUT, name), data);
  console.log(`  + assets/bakhi/${name} (${data.length} bytes)`);
}

const ico = encodeIco([
  { size: 16, data: pngFor(16, false) },
  { size: 32, data: pngFor(32, false) },
  { size: 48, data: pngFor(48, false) }
]);
fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico);
console.log(`  + assets/bakhi/favicon.ico (${ico.length} bytes)`);
