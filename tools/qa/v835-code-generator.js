#!/usr/bin/env node
/**
 * v835-code-generator.js — mã tự sinh cho Thành tựu / Boss / Nhiệm vụ (8.3.5).
 *
 * Yêu cầu: người quản trị chỉ nhập TÊN, hệ thống tạo mã đọc được:
 *   Ma Vương → ma_vuong · Đỉnh Cao Kiến Thức → dinh_cao_kien_thuc
 *   Long Thần Hủy Diệt → long_than_huy_diet · Boss 01 → boss_01
 * Mã trùng phải được phát hiện và đề xuất mã khác, không tự ghi đè.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/v835-code-generator.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-devboard-gamification.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function eq(actual, expected, name) {
    actual === expected ? ok(name, actual) : bad(name, 'nhận ' + JSON.stringify(actual) + ', cần ' + JSON.stringify(expected));
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://minhtruk.github.io/bakhi/founder/',
    runScripts: 'outside-only'
});
dom.window.eval(SRC);
const G = dom.window.BKGamificationAdmin;

console.log('Bá Khí 8.3.5 — Sinh mã tự động\n');

if (!G || typeof G.slugify !== 'function') {
    bad('module quản trị nạp được', 'không thấy BKGamificationAdmin.slugify');
    console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
    process.exit(1);
}

/* 1. Bảng ví dụ bắt buộc trong yêu cầu */
console.log('[1] Bảng ví dụ bắt buộc');
[
    ['Ma Vương', 'ma_vuong'],
    ['Nhà Thám Hiểm', 'nha_tham_hiem'],
    ['Bậc Thầy Kiến Thức', 'bac_thay_kien_thuc'],
    ['Chiến Binh Tri Thức', 'chien_binh_tri_thuc'],
    ['Người Ôn Tập Chăm Chỉ', 'nguoi_on_tap_cham_chi'],
    ['Đỉnh Cao Kiến Thức', 'dinh_cao_kien_thuc'],
    ['Long Thần Hủy Diệt', 'long_than_huy_diet'],
    ['Đường Đến Thành Công', 'duong_den_thanh_cong'],
    ['Boss 01', 'boss_01']
].forEach(([input, expected]) => eq(G.slugify(input), expected, '“' + input + '” → ' + expected));

/* 2. Biên */
console.log('\n[2] Trường hợp biên');
eq(G.slugify('  MA   VƯƠNG  '), 'ma_vuong', 'chữ hoa + khoảng trắng liên tiếp');
eq(G.slugify('đường_đến'), 'duong_den', 'đ → d, gộp dấu phân cách');
eq(G.slugify('Ma Vương!!!'), 'ma_vuong', 'bỏ ký tự đặc biệt');
eq(G.slugify(''), '', 'tên rỗng → mã rỗng (không lưu)');
eq(G.slugify('!!!'), '', 'chỉ ký tự đặc biệt → mã rỗng');
eq(G.slugify('__a__b__'), 'a_b', 'bỏ dấu gạch dưới thừa hai đầu');
eq(G.slugify('Kiến thức số 1'), 'kien_thuc_so_1', 'số được giữ lại');

/* 3. Chống trùng */
console.log('\n[3] Mã trùng có đề xuất, không tự ghi đè');
eq(G.suggestCode('ma_vuong', []), 'ma_vuong', 'chưa ai dùng → giữ nguyên');
eq(G.suggestCode('ma_vuong', ['ma_vuong']), 'ma_vuong_2', 'trùng → đề xuất _2');
eq(G.suggestCode('ma_vuong', ['ma_vuong', 'ma_vuong_2']), 'ma_vuong_3', 'trùng nhiều → đề xuất _3');
eq(G.suggestCode('!!!', ['x']), '', 'không tạo mã rỗng');

/* 4. Câu hỏi Boss */
console.log('\n[4] Bộ đọc câu hỏi Boss');
const qs = G.parseQuestions('Thủ đô Việt Nam là gì? | Hà Nội | Huế | 1 | Hà Nội là thủ đô.');
eq(qs.length, 1, 'nhận 1 câu hỏi hợp lệ');
eq(qs[0] && qs[0].correct_index, 0, 'đáp án đúng là phương án 1');
eq(G.parseQuestions('dòng hỏng không đủ cột').length, 0, 'bỏ dòng sai định dạng');
eq(G.parseQuestions('Câu | A | B | 9 | x').length, 0, 'bỏ câu có đáp án ngoài danh sách');

console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
