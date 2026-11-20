'use strict';
/**
 * Bá Khí — harness dùng chung cho các smoke test Learning Intelligence (8.2.0).
 *
 * Mỗi file test tự dựng một DOM jsdom riêng, nạp bk-core.js (+ tuỳ chọn
 * bk-learning.js / bk-learn.js) và đọc lại localStorage để kiểm tra dữ liệu
 * thật đã lưu — không kiểm tra biến trong bộ nhớ.
 *
 * Cài jsdom trước khi chạy:
 *   npm install jsdom@31.0.1 --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/<tên>.js
 */

const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
let total = 0;

function ok(name, cond, extra) {
  total++;
  if (cond) console.log('  PASS ' + name);
  else {
    failures++;
    console.log('  FAIL ' + name + (extra ? ' :: ' + extra : ''));
  }
}

function make(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e && (e.stack || e.message)));
  const dom = new JSDOM(
    '<!DOCTYPE html><html lang="vi"><head><title>Bá Khí</title></head>' +
    '<body><main><a href="ktgk1/ly/ly1.html"><span class="truncate">Vật Lý · KTGK1</span></a></main></body></html>',
    {
      url: opts.url || 'https://minhtruk.github.io/bakhi/index.html',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: vc
    }
  );
  const w = dom.window;
  w.matchMedia = w.matchMedia || ((q) => ({
    matches: false, media: q, addEventListener() { }, removeEventListener() { }
  }));
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(w.performance.now()), 0);
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  w.confirm = () => true;

  if (opts.seed) w.localStorage.setItem('bakhiLearn.v1', JSON.stringify(opts.seed));

  const load = (file) => w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  load('assets/bakhi/bk-core.js');
  if (opts.withUi) {
    load('assets/bakhi/bk-learning.js');
    if (opts.withLearn) load('assets/bakhi/bk-learn.js');
  } else if (opts.withLearn) {
    load('assets/bakhi/bk-learn.js');
  }

  return {
    w,
    errors,
    load,
    store() {
      const raw = w.localStorage.getItem('bakhiLearn.v1');
      return raw ? JSON.parse(raw) : null;
    },
    reload() {
      /* Mô phỏng tải lại trang: xoá cache trong bộ nhớ rồi nạp lại module. */
      delete w.BK;
      delete w.BKLearning;
      delete w.BKLearn;
      w.eval('window.BK = undefined; window.BKLearning = undefined; window.BKLearn = undefined;');
      load('assets/bakhi/bk-core.js');
      if (opts.withUi) {
        load('assets/bakhi/bk-learning.js');
        if (opts.withLearn) load('assets/bakhi/bk-learn.js');
      }
      return w.BK;
    }
  };
}

function done(label) {
  if (failures) {
    console.log('\n=== ' + failures + '/' + total + ' FAILURE(S) — ' + label + ' ===');
    process.exit(1);
  }
  console.log('\n=== ALL ' + total + ' CHECKS PASSED — ' + label + ' ===');
}

module.exports = { make, ok, done, ROOT };
