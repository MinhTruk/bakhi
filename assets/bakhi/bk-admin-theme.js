/* =========================================================================
   Bá Khí — bk-admin-theme.js
   Chủ đề Dark / Light riêng cho Administrator Dashboard (trang /admin).
   Không can thiệp chủ đề của index.html: chỉ dùng khi trang nạp tệp này.
   Công khai: window.BKAdminTheme
   ========================================================================= */
(function (global) {
    'use strict';

    var KEY = 'bkAdminTheme';
    var root = global.document ? global.document.documentElement : null;
    if (!root) return;

    function normalize(value) {
        return String(value || '').toLowerCase() === 'light' ? 'light' : 'dark';
    }
    function read() {
        try {
            return normalize(global.localStorage.getItem(KEY) || 'dark');
        } catch (e) {
            return 'dark';
        }
    }
    function icons(theme) {
        var nodes = global.document.querySelectorAll('[data-bk-theme-toggle]');
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            node.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
            node.title = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
            node.setAttribute('aria-label', node.title);
            var ic = node.querySelector('i');
            if (ic) ic.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            var txt = node.querySelector('[data-bk-theme-label]');
            if (txt) txt.textContent = theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối';
        }
    }
    function apply(theme, persist) {
        var next = normalize(theme);
        root.classList.toggle('dark', next === 'dark');
        root.setAttribute('data-bk-theme', next);
        root.style.colorScheme = next;
        if (persist !== false) {
            try { global.localStorage.setItem(KEY, next); } catch (e) { }
        }
        icons(next);
        try {
            global.dispatchEvent(new global.CustomEvent('bkadmin:theme', { detail: { theme: next } }));
        } catch (e) { }
        return next;
    }
    function toggle() {
        return apply(read() === 'dark' ? 'light' : 'dark');
    }
    function bind(node) {
        if (!node || node.__bkThemeBound) return node;
        node.__bkThemeBound = true;
        node.addEventListener('click', function (e) {
            e.preventDefault();
            toggle();
        });
        return node;
    }

    global.BKAdminTheme = {
        KEY: KEY,
        get: read,
        set: function (theme) { return apply(theme, true); },
        toggle: toggle,
        apply: apply,
        bind: bind,
        init: function () { return apply(read(), false); }
    };

    /* Áp dụng ngay trong <head> để không nháy màu khi tải trang. */
    apply(read(), false);

    /* Tự gắn mọi nút [data-bk-theme-toggle] có sẵn trong trang. */
    function bindAll() {
        if (!global.document || typeof global.document.querySelectorAll !== 'function') return;
        var nodes = global.document.querySelectorAll('[data-bk-theme-toggle]');
        for (var i = 0; i < nodes.length; i++) bind(nodes[i]);
        icons(read());
    }
    if (global.document) {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', bindAll);
        } else {
            bindAll();
        }
    }
})(typeof window !== 'undefined' ? window : this);
