#!/usr/bin/env node
/**
 * Bá Khí 8.7.3 — QA tĩnh cho Intelligent Caching.
 *
 * Chạy thật mã của assets/bakhi/bk-cache.js trong một sandbox tối giản
 * (không jsdom, không mạng) để kiểm tra hành vi: hit/miss, TTL, LRU, giới hạn
 * byte, invalidation theo key/tag/namespace, request dedup, lỗi + thử lại,
 * fallback khi không có IndexedDB.
 *
 * Phần còn lại kiểm tra nối dây: mọi trang nạp bk-cache.js TRƯỚC bk-cloud.js,
 * service worker gắn cache với ?v=, và Rust có cache module + metrics + cấu hình.
 *
 *   node tools/qa/v873-cache.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/* ------------------------------------------------------------------------ */
/* Sandbox chạy bk-cache.js thật                                             */
/* ------------------------------------------------------------------------ */
const sandbox = { console, setTimeout, clearTimeout, Date, JSON, Math, Map, Promise, Error };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('assets/bakhi/bk-cache.js'), sandbox, { filename: 'bk-cache.js' });

(async function main() {
  console.log('== 1. L1: hit / miss / TTL / LRU / byte ==');
  const BK = sandbox.BKCache;
  ok('công bố window.BKCache', !!BK && typeof BK.create === 'function');
  ok('có instance dùng chung', !!BK.shared && typeof BK.shared.wrap === 'function');

  const cache = BK.create({ name: 'qa', defaultTtl: 30000 });
  await cache.set('k', { n: 1 });
  const hit = await cache.get('k');
  ok('get trả đúng dữ liệu đã set', hit && hit.n === 1);
  ok('miss trả null', (await cache.get('khong-co')) === null);
  const stats1 = cache.stats();
  ok('đếm hit/miss', stats1.hits === 1 && stats1.misses === 1, JSON.stringify(stats1));
  ok('hitRate tính theo hit/(hit+miss)', stats1.hitRate === 50, String(stats1.hitRate));

  const shortTtl = BK.create({ name: 'ttl' });
  await shortTtl.set('a', 'x', { ttl: 15 });
  await sleep(40);
  ok('entry hết TTL không được trả', (await shortTtl.get('a')) === null);
  ok('đếm expiration', shortTtl.stats().expirations === 1, String(shortTtl.stats().expirations));

  const lru = BK.create({ name: 'lru', maxEntries: 2 });
  await lru.set('a', 1); await lru.set('b', 2);
  await lru.get('a');
  await lru.set('c', 3);
  ok('LRU loại entry ít dùng nhất', (await lru.get('b')) === null);
  ok('LRU giữ entry vừa dùng', (await lru.get('a')) === 1);
  ok('đếm eviction', lru.stats().evictions === 1, String(lru.stats().evictions));

  const bytes = BK.create({ name: 'bytes', maxBytes: 700 });
  await bytes.set('big', 'x'.repeat(4000));
  ok('payload vượt hạn mức bị từ chối', bytes.stats().entryCount === 0);

  console.log('\n== 2. Invalidation: key / tag / namespace ==');
  const inv = BK.create({ name: 'inv', namespace: 'mod' });
  await inv.set('a', 1, { tags: ['t1'] });
  await inv.set('b', 2, { tags: ['t2'] });
  inv.del('a');
  ok('xoá theo key', (await inv.get('a')) === null);
  inv.invalidateTag('t2');
  ok('xoá theo tag', (await inv.get('b')) === null);
  await inv.set('c', 3);
  ok('clear namespace xoá toàn bộ', inv.clear() === 1 && inv.stats().entryCount === 0);
  ok('đếm invalidation', inv.stats().invalidations >= 3, String(inv.stats().invalidations));

  console.log('\n== 3. Request dedup (read coalescing) ==');
  const dedup = BK.create({ name: 'dedup' });
  let loads = 0;
  function loader() {
    loads++;
    return sleep(30).then(() => ({ ok: true }));
  }
  const results = await Promise.all([
    dedup.wrap('same', loader),
    dedup.wrap('same', loader),
    dedup.wrap('same', loader)
  ]);
  ok('ba lời gọi đồng thời chỉ chạy loader một lần', loads === 1, 'loads=' + loads);
  ok('cả ba nhận cùng kết quả', results.every((r) => r && r.ok === true));
  ok('đếm dedup', dedup.stats().dedup === 2, String(dedup.stats().dedup));
  ok('dedup không để lại in-flight sau khi xong', dedup.stats().entryCount === 1);

  const failing = BK.create({ name: 'fail' });
  let attempts = 0;
  const bad = () => { attempts++; return Promise.reject(new Error('nguồn lỗi')); };
  let errorSeen = 0;
  await Promise.all([
    failing.wrap('x', bad).catch(() => { errorSeen++; }),
    failing.wrap('x', bad).catch(() => { errorSeen++; })
  ]);
  ok('lỗi được trả cho mọi lời gọi đang chờ', errorSeen === 2, String(errorSeen));
  const recovered = await failing.wrap('x', () => { attempts++; return Promise.resolve('ok'); });
  ok('sau lỗi, request mới được thực hiện lại', recovered === 'ok' && attempts === 2, 'attempts=' + attempts);

  const off = BK.create({ name: 'off', enabled: false });
  const bypass = await off.wrap('k', () => Promise.resolve(42));
  ok('cache tắt ⇒ gọi thẳng nguồn', bypass === 42 && off.stats().entryCount === 0);

  console.log('\n== 4. L2 fallback an toàn ==');
  const noIdb = BK.create({ name: 'noidb', persist: true });
  await noIdb.set('p', 'v', { persist: true });
  ok('không có IndexedDB vẫn giữ L1', (await noIdb.get('p')) === 'v');
  ok('L2 báo không khả dụng thay vì lỗi', noIdb.stats().l2Available === false);
  ok('stats JSON không chứa payload', JSON.stringify(noIdb.stats()).indexOf('"v"') < 0);

  console.log('\n== 5. An toàn tài khoản ==');
  const priv = BK.create({ name: 'priv', private: true, scope: 'u1' });
  await priv.set('profile', { name: 'A' });
  ok('instance riêng không ghi L2', priv.stats().persist === false);
  priv.setScope('u2');
  ok('đổi tài khoản xoá dữ liệu riêng', (await priv.get('profile')) === null);
  const pub = BK.create({ name: 'pub' });
  await pub.set('ann', [1, 2]);
  pub.setScope('u3');
  ok('instance công khai không bị xoá khi đổi tài khoản', (await pub.get('ann')).length === 2);

  console.log('\n== 6. Nối dây trong website ==');
  const CLOUD = read('assets/bakhi/bk-cloud.js');
  ok('bk-cloud dùng BKCache.shared cho nội dung công khai',
    /BKCache\.shared/.test(CLOUD) && /cachedRead\('announcements:v1'/.test(CLOUD));
  ok('cache changelog + feature flags', /cachedRead\('changelog:v1'/.test(CLOUD) && /cachedRead\('site-flags:v1'/.test(CLOUD));
  ok('KHÔNG cache phản hồi báo cáo cá nhân',
    !/cachedRead\('report/.test(CLOUD) && !/BKCache[^\n]*report_notifications/.test(CLOUD));

  const htmlFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.html$/i.test(entry.name)) htmlFiles.push(full);
    });
  })(ROOT);

  let missing = 0;
  let order = 0;
  htmlFiles.forEach((file) => {
    const html = fs.readFileSync(file, 'utf8');
    if (!/bk-cloud\.js/.test(html)) return;
    /* Chỉ so vị trí THẺ SCRIPT, không so chỗ nhắc tên trong chú thích. */
    const tags = html.match(/<script[^>]*src="[^"]*bk-(?:cache|cloud)\.js[^"]*"[^>]*>/g) || [];
    const cacheAt = tags.findIndex((tag) => tag.indexOf('bk-cache.js') >= 0);
    const cloudAt = tags.findIndex((tag) => tag.indexOf('bk-cloud.js') >= 0);
    if (cacheAt < 0) missing++;
    else if (cloudAt >= 0 && cacheAt > cloudAt) order++;
  });
  ok('mọi trang nạp bk-cloud.js đều nạp bk-cache.js', missing === 0, String(missing));
  ok('bk-cache.js nạp TRƯỚC bk-cloud.js', order === 0, String(order));

  const SW = read('sw.js');
  ok('service worker gắn cache với ?v= phiên bản', /searchParams\.get\('v'\)/.test(SW));
  ok('service worker tăng REVISION khi đổi logic', /var REVISION = '\d+'/.test(SW));
  ok('service worker không cache Supabase', /rest\|auth\|storage\|functions/.test(SW));

  console.log('\n== 7. Rust: Cache Engine + metrics ==');
  ok('có module cache độc lập', fs.existsSync(path.join(ROOT, 'rust-backend/src/cache/mod.rs')));
  ok('có singleflight riêng', fs.existsSync(path.join(ROOT, 'rust-backend/src/cache/singleflight.rs')));
  /* Bỏ phần test (có .await của tokio::time::sleep) trước khi kiểm tra thân
     module: điều cần chứng minh là code chạy thật không giữ khoá qua await. */
  const CACHE = read('rust-backend/src/cache/mod.rs')
    .split('#[cfg(test)]')[0]
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  ok('L1 có TTL + LRU + giới hạn byte',
    /expires_at/.test(CACHE) && /order: BTreeMap/.test(CACHE) && /max_bytes/.test(CACHE));
  ok('có invalidation key/namespace/tag',
    /fn invalidate\(/.test(CACHE) && /fn invalidate_namespace/.test(CACHE) && /fn invalidate_tag/.test(CACHE));
  ok('cache không giữ khoá qua await', !/\.await/.test(CACHE));
  ok('metrics cache đầy đủ', /bakhi_cache_hit_total/.test(CACHE) && /bakhi_cache_dedup_total/.test(CACHE)
    && /bakhi_cache_lookup|lookup_p95_us/.test(CACHE));
  const SF = read('rust-backend/src/cache/singleflight.rs');
  ok('singleflight xoá in-flight sau khi xong', /flights\.remove/.test(SF) && /dedup_joined/.test(SF));
  const SETTINGS = read('rust-backend/src/config/settings.rs');
  ['CACHE_ENABLED', 'CACHE_L1_ENABLED', 'CACHE_DEDUP_ENABLED', 'CACHE_MAX_ENTRIES',
    'CACHE_MAX_MEMORY_BYTES', 'CACHE_DEFAULT_TTL', 'CACHE_STALE_WHILE_REVALIDATE'].forEach((name) => {
    ok('cấu hình ' + name, SETTINGS.indexOf(name) >= 0);
  });
  const AI = read('rust-backend/src/services/ai_service.rs');
  ok('cấu hình AI đọc qua cache + singleflight',
    /config_value\("ai:settings:v1"/.test(AI) && /flights\s*\n?\s*\.run/.test(AI));
  ok('lỗi nguồn dữ liệu dùng bản stale thay vì làm hỏng chat', /get_stale/.test(AI));
  ok('metrics route xuất cache', /push_str\(&cache\.prometheus\(\)\)/.test(read('rust-backend/src/routes/metrics.rs')));
  ok('summary observability có khối cache', /object\.insert\("cache"/.test(read('rust-backend/src/routes/observability.rs')));

  if (process.argv.includes('--bench')) {
    console.log('\n== 8. Benchmark cục bộ (microbenchmark, không phải end-to-end) ==');
    const bench = BK.create({ name: 'bench' });
    const payload = Array.from({ length: 40 }, (_, index) => ({
      id: index,
      title: 'x'.repeat(60),
      summary: 'y'.repeat(200)
    }));
    await bench.set('payload', payload, { ttl: 60000 });

    function measure(label, iters, run) {
      for (let index = 0; index < iters / 10; index++) run();
      const started = process.hrtime.bigint();
      for (let index = 0; index < iters; index++) run();
      const ns = Number(process.hrtime.bigint() - started) / iters;
      console.log('  ' + label + ' — ' + Math.round(ns) + ' ns/op');
    }

    measure('BKCache.get (L1 hit, gồm Promise)', 200000, () => bench.get('payload'));
    measure('BKCache.peek (L1 hit, đồng bộ)', 200000, () => bench.peek('payload'));
    measure('baseline: xử lý lại payload (JSON round-trip)', 200000,
      () => JSON.parse(JSON.stringify(payload)));
  }

  console.log('\n' + (failures ? 'FAILED (' + failures + ')' : 'OK — tất cả kiểm tra đạt'));
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error('QA lỗi không mong đợi:', error);
  process.exit(1);
});
