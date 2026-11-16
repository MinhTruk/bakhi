/* =========================================================================
   Bá Khí — bk-roles.js
   Danh vị hiển thị của học sinh (Lớp trưởng, Bí thư, Người sáng lập…).

   - Nguồn duy nhất: bảng public.student_roles, khoá theo canonical student_id.
   - Chỉ là nhãn hiển thị: KHÔNG cấp quyền Administrator/Dev.
   - Cache cục bộ 1 giờ để không gọi mạng mỗi lần vẽ avatar.
   - Không dựa vào tên hiển thị do client gửi lên.

   Công khai: window.BKRoles
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKRoles) return;

    var KEY = 'bakhiRoles.v1';
    var TTL = 60 * 60 * 1000;
    var map = {};
    var ready = false;
    var loading = false;
    var waiters = [];
    var retryTimer = null;

    function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }

    function readCache() {
        var raw = lsGet(KEY);
        if (!raw) return false;
        try {
            var data = JSON.parse(raw);
            if (!data || typeof data !== 'object' || !data.map) return false;
            map = data.map;
            ready = true;
            return Date.now() - Number(data.at || 0) < TTL;
        } catch (e) { return false; }
    }

    function flush() {
        var list = waiters.splice(0);
        list.forEach(function (fn) { try { fn(); } catch (e) { } });
    }

    function normalize(rows) {
        var out = {};
        (Array.isArray(rows) ? rows : []).forEach(function (r) {
            if (!r || !r.student_id) return;
            out[String(r.student_id)] = {
                key: String(r.role_key || 'member'),
                label: String(r.role_label || '')
            };
        });
        return out;
    }

    function load() {
        if (loading) return;
        var cfg = global.BK_SUPABASE;
        if (!cfg || typeof cfg.configured !== 'function' || !cfg.configured()) {
            if (!retryTimer) {
                retryTimer = setTimeout(function () { retryTimer = null; load(); }, 900);
            }
            return;
        }
        loading = true;
        try {
            global.fetch(cfg.url + '/rest/v1/student_roles?select=student_id,role_key,role_label', {
                headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
                cache: 'no-store'
            }).then(function (res) { return res.ok ? res.json() : null; })
                .then(function (rows) {
                    if (!Array.isArray(rows)) return;
                    map = normalize(rows);
                    ready = true;
                    lsSet(KEY, JSON.stringify({ at: Date.now(), map: map }));
                    flush();
                }).catch(function () { /* giữ cache cũ */ })
                .then(function () { loading = false; });
        } catch (e) {
            loading = false;
        }
    }

    function labelFor(id) {
        var row = id ? map[String(id)] : null;
        return row && row.label ? row.label : '';
    }
    function keyFor(id) {
        var row = id ? map[String(id)] : null;
        return row && row.key ? row.key : '';
    }
    function onReady(fn) {
        if (typeof fn !== 'function') return;
        if (ready) { try { fn(); } catch (e) { } return; }
        waiters.push(fn);
    }

    global.BKRoles = {
        __ready: true,
        labelFor: labelFor,
        keyFor: keyFor,
        onReady: onReady,
        has: function (id) { return !!labelFor(id); },
        refresh: load,
        snapshot: function () { return map; }
    };

    if (!readCache()) load();
    else load();
})(typeof window !== 'undefined' ? window : this);
