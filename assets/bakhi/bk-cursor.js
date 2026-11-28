/* =========================================================================
   Bá Khí — bk-cursor.js
   Con trỏ tuỳ biến (vòng + điểm) dựng trên nền nhận diện cũ:
   · một vòng lặp rAF duy nhất, chỉ ghi transform (translate3d + scale)
   · phát hiện vùng bấm bằng uỷ nhiệm pointerover + computed cursor
   · cuộn: xung lực ngắn theo vận tốc, tắt dần về đúng vị trí con trỏ
   · trạng thái: normal / hover / text / pressed / hidden
   · chỉ gắn khi (hover: hover) and (pointer: fine); không gắn trên cảm ứng
   · destroy() gỡ mọi listener, observer, rAF và trả con trỏ hệ điều hành

   Công khai: window.BKCursor = { destroy, state, __ready }
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || !D.documentElement) return;
    if (global.BKCursor && global.BKCursor.__ready) return;

    var M = global.BKMotion || {};
    var fine = M.fine ? M.fine() : false;
    if (!fine) return;

    var reduced = M.reduced ? M.reduced() : false;
    var SPR = M.SPRING || { follow: .22, damp: .72, scroll: .6, scrollDecay: .86, scrollMax: 26 };
    var clamp = M.clamp || function (n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; };
    var now = function () { return global.performance && performance.now ? performance.now() : Date.now(); };

    var S = {
        x: -100, y: -100, rx: -100, ry: -100, rvx: 0, rvy: 0,
        sx: 1, sy: 1, tsx: 1, tsy: 1, ds: 1, dsy: 1, tds: 1, tdsy: 1,
        impulse: 0, lastScroll: 0, down: false, active: false, state: '',
        raf: 0, lastMove: 0, root: null, ring: null, dot: null,
        observer: null, timer: 0, listeners: []
    };

    function el(tag, cls) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        return n;
    }

    function on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts || false);
        S.listeners.push([target, type, fn, opts || false]);
    }

    function build() {
        var root = el('div', 'bk-cur');
        root.setAttribute('aria-hidden', 'true');
        var ring = el('div', 'bk-cur-ring');
        var dot = el('div', 'bk-cur-dot');
        root.appendChild(ring);
        root.appendChild(dot);
        D.body.appendChild(root);
        S.root = root;
        S.ring = ring;
        S.dot = dot;
        S.lastScroll = global.pageYOffset || D.documentElement.scrollTop || 0;
    }

    /* Trả về 'text' | 'hover' | ''. Một phép tra cho mỗi lần đổi phần tử. */
    function probe(target) {
        if (!target || target.nodeType !== 1 || !target.closest) return '';
        if (target.closest('input[type="range"],input[type="checkbox"],input[type="radio"],input[type="color"]')) return 'hover';
        if (target.closest('textarea,[contenteditable="true"],input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"])')) return 'text';
        if (target.closest('a,button,summary,label,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[onclick],.bk-card,.bk-tile,.bk-stat,.bk-folder')) return 'hover';
        try {
            var c = global.getComputedStyle(target).cursor;
            if (c === 'pointer') return 'hover';
            if (c === 'text') return 'text';
        } catch (e) { }
        return '';
    }

    function setState(state) {
        if (S.state === state) return;
        S.state = state;
        S.root.className = 'bk-cur' + (S.active ? ' is-on' : '') + (state ? ' is-' + state : '') + (S.down ? ' is-down' : '');
        S.tsx = state === 'hover' ? 1.55 : state === 'text' ? .5 : 1;
        S.tsy = state === 'hover' ? 1.55 : state === 'text' ? 1.3 : 1;
        S.tds = state === 'hover' ? 1.5 : 1;
        S.tdsy = state === 'text' ? 3.4 : 1;
    }

    function activate() {
        if (S.active) return;
        S.active = true;
        S.rx = S.x; S.ry = S.y; S.rvx = 0; S.rvy = 0;
        S.root.classList.add('is-on');
        D.documentElement.classList.add('bk-cur-on');
        kick();
    }

    function deactivate() {
        S.active = false;
        S.root.classList.remove('is-on');
        D.documentElement.classList.remove('bk-cur-on');
        if (S.raf) { global.cancelAnimationFrame(S.raf); S.raf = 0; }
    }

    function frame() {
        S.raf = 0;
        var t = now();
        var k = reduced ? 1 : SPR.follow;
        var damp = reduced ? 0 : SPR.damp;
        var targetY = S.y + S.impulse;

        var r = M.settle ? M.settle(S.rx, S.x, S.rvx, k, damp) : { value: S.x, velocity: 0 };
        S.rx = r.value; S.rvx = r.velocity;
        r = M.settle ? M.settle(S.ry, targetY, S.rvy, k, damp) : { value: targetY, velocity: 0 };
        S.ry = r.value; S.rvy = r.velocity;

        var step = reduced ? 1 : .2;
        S.sx += (S.tsx - S.sx) * step;
        S.sy += (S.tsy - S.sy) * step;
        S.ds += (S.tds - S.ds) * step;
        S.dsy += (S.tdsy - S.dsy) * step;
        if (!reduced) S.impulse *= SPR.scrollDecay;

        var press = S.down ? .85 : 1;
        S.ring.style.transform = 'translate3d(' + S.rx.toFixed(2) + 'px,' + S.ry.toFixed(2) + 'px,0) scale(' +
            (S.sx * press).toFixed(3) + ',' + (S.sy * press).toFixed(3) + ')';
        S.dot.style.transform = 'translate3d(' + S.x.toFixed(2) + 'px,' + (S.y + S.impulse * .28).toFixed(2) + 'px,0) scale(' +
            S.ds.toFixed(3) + ',' + S.dsy.toFixed(3) + ')';

        var moving = Math.abs(S.rvx) + Math.abs(S.rvy) > .04 || Math.abs(S.impulse) > .15 ||
            Math.abs(S.tsx - S.sx) > .004 || Math.abs(S.tsy - S.sy) > .004 ||
            Math.abs(S.tds - S.ds) > .004 || Math.abs(S.tdsy - S.dsy) > .004;
        if (S.active && (moving || t - S.lastMove < 260)) kick();
    }

    function kick() {
        if (!S.active || S.raf) return;
        S.raf = global.requestAnimationFrame(frame);
    }

    function recheck() {
        if (!S.active) return;
        try { setState(probe(D.elementFromPoint(S.x, S.y))); } catch (e) { }
    }

    function debounceRecheck() {
        if (S.timer) global.clearTimeout(S.timer);
        S.timer = global.setTimeout(recheck, 120);
    }

    function mount() {
        build();

        on(D, 'pointermove', function (e) {
            S.x = e.clientX; S.y = e.clientY;
            S.lastMove = now();
            if (!S.active) activate();
            kick();
        }, { passive: true });

        on(D, 'pointerover', function (e) { setState(probe(e.target)); kick(); }, { passive: true });

        /* Rời cửa sổ: relatedTarget rỗng. */
        on(D, 'pointerout', function (e) {
            if (!e.relatedTarget && !e.toElement) deactivate();
        }, { passive: true });

        on(D, 'pointerdown', function () {
            S.down = true;
            if (S.root) S.root.classList.add('is-down');
            kick();
        }, { passive: true });

        on(D, 'pointerup', function () {
            S.down = false;
            if (S.root) S.root.classList.remove('is-down');
            kick();
        }, { passive: true });

        on(global, 'blur', deactivate);
        on(D, 'visibilitychange', function () { if (D.hidden) deactivate(); });

        on(global, 'scroll', function () {
            var y = global.pageYOffset || D.documentElement.scrollTop || 0;
            var dy = y - S.lastScroll;
            S.lastScroll = y;
            if (!reduced) S.impulse = clamp(S.impulse + dy * SPR.scroll, -SPR.scrollMax, SPR.scrollMax);
            kick();
        }, { passive: true });

        /* Modal / route / dropdown xuất hiện dưới con trỏ đứng yên. */
        if (global.MutationObserver) {
            S.observer = new global.MutationObserver(debounceRecheck);
            S.observer.observe(D.body, { childList: true, subtree: true });
        }
        on(global, 'bk:vtdone', recheck);
    }

    function destroy() {
        if (S.raf) global.cancelAnimationFrame(S.raf);
        if (S.timer) global.clearTimeout(S.timer);
        if (S.observer) S.observer.disconnect();
        for (var i = 0; i < S.listeners.length; i++) {
            var l = S.listeners[i];
            try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) { }
        }
        S.listeners = [];
        if (S.root && S.root.parentNode) S.root.parentNode.removeChild(S.root);
        D.documentElement.classList.remove('bk-cur-on');
        S.root = S.ring = S.dot = S.observer = null;
        S.raf = 0;
    }

    function start() {
        if (!D.body) { D.addEventListener('DOMContentLoaded', start, { once: true }); return; }
        mount();
    }
    start();

    global.BKCursor = {
        __ready: true,
        destroy: destroy,
        state: function () { return S.state; },
        __state: S
    };
})(typeof window !== 'undefined' ? window : this);
