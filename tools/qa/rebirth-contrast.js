#!/usr/bin/env node
/* =========================================================================
   tools/qa/rebirth-contrast.js
   Kiểm tra tương phản WCAG 2.1 của token trong assets/bakhi/bk-rebirth.css.
   Đọc giá trị THẬT từ CSS (`:root, html.dark` và `html.light`), không chép tay.

   Chạy: node tools/qa/rebirth-contrast.js [--md]
   Mã thoát 1 nếu có cặp dưới ngưỡng (chữ thường 4.5, UI/large 3).
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const CSS = path.resolve(__dirname, '../../assets/bakhi/bk-rebirth.css');
const source = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const lightAt = source.indexOf('html.light {');
if (lightAt < 0) {
    console.error('Không tìm thấy khối html.light trong bk-rebirth.css');
    process.exit(2);
}
const lightBlock = source.slice(lightAt, source.indexOf('}', lightAt));

function readTokens(block) {
    const out = {};
    const re = /--rb-([a-z0-9-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(block))) if (!(m[1] in out)) out[m[1]] = m[2].trim();
    return out;
}

const dark = readTokens(source.slice(0, lightAt));
const light = Object.assign({}, dark, readTokens(lightBlock));

function resolve(tokens, value, depth = 0) {
    if (depth > 6) return value;
    const m = /^var\(--rb-([a-z0-9-]+)\)$/.exec(value.trim());
    if (!m) return value;
    return resolve(tokens, tokens[m[1]] || '#000', depth + 1);
}

function parse(tokens, value) {
    const v = resolve(tokens, value);
    let m = /^#([0-9a-f]{3,8})$/i.exec(v);
    if (m) {
        let h = m[1];
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        if (h.length !== 6) return null;
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (m) {
        const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    return null;
}

function over(fg, bg) {
    const a = fg.a == null ? 1 : fg.a;
    return {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
        a: 1
    };
}

function luminance(c) {
    const ch = (x) => {
        const s = x / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

function ratio(fg, bg) {
    const a = luminance(over(fg, bg));
    const b = luminance(bg);
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ['text', 'text-2', 'text-3', 'accent-text', 'violet', 'sky', 'ok', 'warn', 'danger'];
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'];

const rows = [];
let failures = 0;

for (const [theme, tokens] of [['dark', dark], ['light', light]]) {
    for (const surf of SURFACES) {
        const bg = parse(tokens, tokens[surf]);
        if (!bg) { console.error(`Token nền không đọc được: --rb-${surf} (${tokens[surf]})`); process.exit(2); }
        for (const key of TEXT) {
            const fg = parse(tokens, tokens[key]);
            if (!fg) { console.error(`Token chữ không đọc được: --rb-${key} (${tokens[key]})`); process.exit(2); }
            const r = ratio(fg, bg);
            const pass = r >= 4.5;
            if (!pass) failures++;
            rows.push({ theme, fg: key, bg: surf, ratio: r, min: 4.5, pass });
        }
    }
    // Chữ trên nền accent (nút chính) và accent như thành phần UI (notch, viền).
    /* Accent chỉ dùng làm nền có chữ `accent-ink` hoặc thanh mảnh kèm hairline,
       không bao giờ làm màu chữ trên nền sáng — nên chỉ kiểm cặp ink/accent. */
    const accent = parse(tokens, tokens.accent);
    const ink = parse(tokens, tokens['accent-ink']);
    const onAccent = ratio(ink, accent);
    if (onAccent < 4.5) failures++;
    rows.push({ theme, fg: 'accent-ink', bg: 'accent', ratio: onAccent, min: 4.5, pass: onAccent >= 4.5 });
}

const fmt = (r, min) => `${r.toFixed(2)}:1 (≥${min})`;

if (process.argv.includes('--md')) {
    console.log('| Theme | Chữ | Nền | Tỷ lệ | Kết quả |');
    console.log('|---|---|---|---:|---|');
    for (const r of rows) console.log(`| ${r.theme} | \`--rb-${r.fg}\` | \`--rb-${r.bg}\` | ${fmt(r.ratio, r.min)} | ${r.pass ? 'Đạt' : '**Không đạt**'} |`);
} else {
    for (const r of rows) {
        if (!r.pass) console.log(`FAIL ${r.theme}: --rb-${r.fg} trên --rb-${r.bg} = ${fmt(r.ratio, r.min)}`);
    }
    const total = rows.length;
    const worst = rows.reduce((a, b) => (a.ratio < b.ratio ? a : b));
    console.log(`[rebirth-contrast] ${total} cặp · ${failures} không đạt · thấp nhất ${worst.theme} ${worst.fg}/${worst.bg} ${fmt(worst.ratio, worst.min)}`);
}

process.exitCode = failures ? 1 : 0;
