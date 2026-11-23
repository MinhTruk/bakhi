/* =========================================================================
   Bá Khí — bk-theme-boot.js (8.5.6)
   Khởi tạo giao diện SỚM, ngay trong <head>, trước khi trình duyệt vẽ khung
   đầu tiên. Nhờ vậy không còn hiện tượng nháy tối → sáng (FOUC) khi người
   học đã chọn giao diện sáng.

   Một nguồn trạng thái duy nhất: localStorage `theme` ('dark' | 'light').
   Tối là mặc định; chỉ khi người học chủ động chọn sáng mới có `html.light`
   (xem bk-tokens.css). Khoá cũ `bkAdminTheme` của trang quản trị được đọc
   một lần để không mất lựa chọn đã lưu trước 8.5.6.

   Công khai: window.BKThemeBoot
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKThemeBoot) return;

    var KEY = 'theme';
    var LEGACY_ADMIN_KEY = 'bkAdminTheme';
    var root = D.documentElement;

    function normalize(value) {
        return String(value || '').toLowerCase() === 'light' ? 'light' : 'dark';
    }

    function stored(key) {
        try {
            var v = global.localStorage.getItem(key);
            return v === 'light' || v === 'dark' ? v : null;
        } catch (e) { return null; }
    }

    /* Đọc lựa chọn đã lưu. Nếu chỉ có khoá cũ của trang quản trị, chuyển nó
       sang khoá chung để toàn website dùng cùng một giao diện. */
    function read() {
        var value = stored(KEY);
        if (value) return value;
        var legacy = stored(LEGACY_ADMIN_KEY);
        if (legacy) {
            try { global.localStorage.setItem(KEY, legacy); } catch (e) { }
            return legacy;
        }
        return 'dark';
    }

    function apply(theme, persist) {
        var next = normalize(theme);
        if (root) {
            root.classList.toggle('dark', next === 'dark');
            root.classList.toggle('light', next === 'light');
            /* Thuộc tính gợi ý cho CSS/JS khác và cho trình duyệt biết theme. */
            root.setAttribute('data-bk-theme', next);
            root.style.colorScheme = next;
        }
        if (persist) {
            try { global.localStorage.setItem(KEY, next); } catch (e) { }
        }
        try {
            global.dispatchEvent(new global.CustomEvent('bk:theme', {
                detail: { theme: next }
            }));
        } catch (e) { }
        return next;
    }

    function current() {
        if (root) {
            if (root.classList.contains('light')) return 'light';
            if (root.classList.contains('dark')) return 'dark';
        }
        return read();
    }

    global.BKThemeBoot = {
        KEY: KEY,
        read: read,
        apply: apply,
        current: current
    };

    /* Áp dụng ngay — chạy đồng bộ trong <head> nên không ai thấy khung sai màu. */
    apply(read(), false);

    /* Tab khác đổi giao diện → tab này đổi theo, kể cả trang không nạp
       bk-shell.js (trang bài học, studio, quản trị). */
    global.addEventListener('storage', function (e) {
        if (!e || (e.key !== KEY && e.key !== LEGACY_ADMIN_KEY)) return;
        apply(read(), false);
    });
})(typeof window !== 'undefined' ? window : this);
