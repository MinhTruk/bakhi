/* =========================================================================
   Bá Khí — bk-motion.js
   Nguồn DUY NHẤT cho nhịp, easing và lớp z của chuyển động toàn website.
   Cursor, intro, chuyển trang và nền void đều đọc từ đây; không mô-đun nào
   được tự khai báo bộ số riêng.

   Công khai: window.BKMotion = { DUR, EASE, SPRING, Z, reduced, fine,
                                  clamp, lerp, settle }
   ========================================================================= */
(function (global) {
    'use strict';
    if (global.BKMotion && global.BKMotion.__ready) return;

    var DUR = {
        fast: 160,
        std: 240,
        emph: 380,
        page: 520,
        exit: 420,
        enter: 520,
        intro: 2900
    };

    var EASE = {
        out: 'cubic-bezier(.16,1,.3,1)',
        std: 'cubic-bezier(.2,0,0,1)',
        in: 'cubic-bezier(.55,0,.9,.4)',
        void: 'cubic-bezier(.65,0,.35,1)'
    };

    /* Hệ số lò xo: càng lớn càng bám nhanh; damp < 1 để không nảy quá đà. */
    var SPRING = {
        follow: 0.22,
        damp: 0.72,
        scroll: 0.6,
        scrollDecay: 0.86,
        scrollMax: 26
    };

    var Z = {
        void: -1,
        intro: 2147482000,
        transition: 2147482400,
        cursor: 2147482500
    };

    function mq(q) {
        try { return !!(global.matchMedia && global.matchMedia(q).matches); } catch (e) { return false; }
    }

    function reduced() {
        return mq('(prefers-reduced-motion: reduce)') ||
            !!(global.document && global.document.documentElement &&
                global.document.documentElement.getAttribute('data-motion') === 'reduced');
    }

    /* Cursor chỉ tồn tại trên thiết bị trỏ chính xác có hover thật. */
    function fine() {
        return mq('(hover: hover) and (pointer: fine)') && !mq('(pointer: coarse)');
    }

    function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }
    function lerp(a, b, t) { return a + (b - a) * t; }

    /* Một bước lò xo cho cursor; trả về vận tốc mới để gọi ở khung kế tiếp. */
    function settle(current, target, velocity, k, damp) {
        var v = (velocity + (target - current) * (k == null ? SPRING.follow : k)) *
            (damp == null ? SPRING.damp : damp);
        return { value: current + v, velocity: v };
    }

    global.BKMotion = {
        __ready: true,
        DUR: DUR,
        EASE: EASE,
        SPRING: SPRING,
        Z: Z,
        reduced: reduced,
        fine: fine,
        clamp: clamp,
        lerp: lerp,
        settle: settle
    };
})(typeof window !== 'undefined' ? window : this);
