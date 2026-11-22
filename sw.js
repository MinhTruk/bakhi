/* =========================================================================
   Bá Khí — sw.js (8.4.4)
   Service worker tối giản để mở lại được trang khi mạng trường yếu.

   Nguyên tắc an toàn:
   - HTML: network-first (luôn ưu tiên bản mới), chỉ dùng cache khi mất mạng.
   - Tài nguyên assets/bakhi/: cache-first vì URL đã có ?v=<phiên bản>; đổi bản
     phát hành là đổi URL nên không bao giờ phục vụ JS/CSS cũ.
   - Không cache Supabase (/rest/, /auth/, /functions/), không cache cross-origin.
   - Cache cũ bị xoá khi kích hoạt bản mới; đăng ký kèm ?v= để mỗi bản một cache.
   ========================================================================= */
'use strict';

var VERSION = 'dev';
try {
    VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
} catch (e) { }
var CACHE = 'bakhi-' + VERSION;
var ASSET_RE = /\/assets\/bakhi\//;

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) {
                return k.indexOf('bakhi-') === 0 && k !== CACHE;
            }).map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

function offlinePage() {
    return new Response(
        '<!doctype html><meta charset="utf-8"><title>Bá Khí</title>' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="font-family:system-ui,sans-serif;background:#0b1120;color:#e2e8f0;padding:2rem;line-height:1.6">' +
        '<h1 style="font-size:1.2rem">Chưa có kết nối mạng</h1>' +
        '<p>Trang này chưa được lưu trên thiết bị. Hãy kết nối lại rồi tải lại trang.</p>' +
        '</body>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    var url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.origin !== self.location.origin) return;
    /* Dữ liệu người học luôn đi thẳng tới máy chủ, không qua cache. */
    if (/\/(rest|auth|storage|functions)\/v1\//.test(url.pathname)) return;

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).then(function (res) {
                if (res && res.ok) {
                    var copy = res.clone();
                    caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
                }
                return res;
            }).catch(function () {
                return caches.match(req, { ignoreSearch: true }).then(function (hit) {
                    return hit || offlinePage();
                });
            })
        );
        return;
    }

    if (ASSET_RE.test(url.pathname)) {
        event.respondWith(
            caches.match(req).then(function (hit) {
                if (hit) return hit;
                return fetch(req).then(function (res) {
                    if (res && res.ok && res.type === 'basic') {
                        var copy = res.clone();
                        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
                    }
                    return res;
                });
            })
        );
    }
});
