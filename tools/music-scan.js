'use strict';
/**
 * Bá Khí — tools/music-scan.js
 *
 * Quét music/*.mp3 và sinh music/library.json để Music Player tự thêm bài mới
 * mà không cần sửa mã. Chạy sau khi thả file .mp3 vào thư mục music/:
 *
 *   node tools/music-scan.js           # ghi lại music/library.json
 *   node tools/music-scan.js --check   # chỉ kiểm tra, exit 1 nếu lệch
 *
 * Quy ước tên tệp: music/<id>.mp3, trong đó <id> chỉ gồm chữ, số, dấu chấm,
 * gạch ngang và gạch dưới. Lời bài hát (music/<id>.txt) và ảnh bìa
 * (music/<id>.png|jpg|jpeg|webp) là tuỳ chọn, player tự dò.
 *
 * Năm bài đầu tiên là thư viện gốc của Bá Khí (giữ đúng tên/nghệ sĩ). Bài mới
 * lấy tên từ id (vd. "bai-hat-moi" → "Bai hat moi") và giữ tên đã có trong
 * library.json nếu người biên tập sửa tay.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MUSIC_DIR = path.join(ROOT, 'music');
const MANIFEST = path.join(MUSIC_DIR, 'library.json');
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

/** Thư viện gốc — phải khớp LIBRARY trong assets/bakhi/bk-music.js. */
const CURATED = [
  { id: 'gia-nhu', title: 'Giá như', artist: 'xoxad' },
  { id: 'co-le-anh', title: 'Có lẽ anh', artist: 'fishy' },
  { id: 'xuong-rong-intro', title: 'Xương rồng (intro)', artist: 'dangrangto' },
  { id: 'du-bao-thoi-tiet-hom-nay-mua', title: 'Dự báo thời tiết hôm nay mưa', artist: 'GREY D' },
  { id: 'homesick', title: 'homesick', artist: 'wave to earth' }
];

function prettifyId(id) {
  const s = String(id || '').replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return id;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function readExisting() {
  try {
    const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.tracks) ? data.tracks : []);
    const map = new Map();
    list.forEach((t) => {
      if (!t || typeof t.id !== 'string' || !ID_RE.test(t.id)) return;
      map.set(t.id, { title: String(t.title || '').trim(), artist: String(t.artist || '').trim() });
    });
    return map;
  } catch (e) {
    return new Map();
  }
}

function listMp3() {
  if (!fs.existsSync(MUSIC_DIR)) return [];
  return fs.readdirSync(MUSIC_DIR)
    .filter((name) => /\.mp3$/i.test(name))
    .map((name) => name.replace(/\.mp3$/i, ''))
    .filter((id, index, all) => ID_RE.test(id) && all.indexOf(id) === index)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function build() {
  const existing = readExisting();
  const ids = listMp3();
  const rows = [];
  const seen = new Set();

  /* Bài gốc luôn đứng đầu, đúng thứ tự người biên tập. */
  CURATED.forEach((t) => {
    if (ids.indexOf(t.id) < 0) return;
    rows.push({ id: t.id, title: t.title, artist: t.artist });
    seen.add(t.id);
  });

  ids.forEach((id) => {
    if (seen.has(id)) return;
    const prev = existing.get(id) || {};
    rows.push({
      id: id,
      title: prev.title || prettifyId(id),
      artist: prev.artist || 'Bá Khí'
    });
  });

  const manifest = {
    version: 1,
    generatedBy: 'tools/music-scan.js',
    tracks: rows
  };

  return { manifest, json: JSON.stringify(manifest, null, 2) + '\n' };
}

function main() {
  const check = process.argv.indexOf('--check') >= 0;
  const { manifest, json } = build();
  let current = '';
  try { current = fs.readFileSync(MANIFEST, 'utf8'); } catch (e) { current = ''; }

  if (check) {
    if (current !== json) {
      console.error('music/library.json đã lệch với music/*.mp3. Chạy: node tools/music-scan.js');
      process.exit(1);
    }
    console.log('music/library.json khớp (' + manifest.tracks.length + ' bài).');
    return;
  }

  if (current !== json) {
    fs.writeFileSync(MANIFEST, json, 'utf8');
    console.log('Đã cập nhật music/library.json (' + manifest.tracks.length + ' bài).');
  } else {
    console.log('music/library.json không đổi (' + manifest.tracks.length + ' bài).');
  }
}

main();
