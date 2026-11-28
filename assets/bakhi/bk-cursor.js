/* =========================================================================
   Bá Khí — bk-cursor.js
   Con trỏ tuỳ biến (vòng + điểm) dựng trên nhận diện cũ.

   · một vòng lặp rAF duy nhất, chỉ ghi transform (translate3d + scale)
   · trạng thái: normal / hover / text / grab / grabbing / resize / move /
     disabled / loading / pressed / scrolling / hidden
   · phát hiện vùng bấm bằng uỷ nhiệm pointerover + computed cursor
   · đọc lựa chọn trong Cài đặt (bakhiA11y.v1 → cursor: 'custom' | 'native'):
     đổi sang 'native' thì gỡ toàn bộ DOM, listener, rAF và trả con trỏ hệ
     điều hành; đổi lại 'custom' thì dựng lại.
   · chỉ gắn khi (hover: hover) and (pointer: fine); không gắn trên cảm ứng
   · giảm chuyển động: con trỏ vẫn dùng được nhưng bám tức thời, không đuổi

   Công khai: window.BKCursor = { destroy, state, __ready }
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || !D.documentElement) return;
    if (global.BKCursor && global.BKCursor.__ready) return;

    var A11Y_KEY = 'bakhiA11y.v1';
    var M = global.BKMotion || {};
    var SPR = M.SPRING || { follow: .22, damp: .72, scroll: .6, scrollDecay: .86, scrollMax: 26 };
    var clamp = M.clamp || function (n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; };
    var now = function () { return global.performance && performance.now ? performance.now() : Date.now(); };

    var S = {
        x: -100, y: -100, rx: -100, ry: -100, rvx: 0, rvy: 0,
        sx: 1, sy: 1, tsx: 1, tsy: 1, ds: 1, dsy: 1, tds: 1, tdsy: 1,
        impulse: 0, lastScroll: 0, down: false, active: false, state: '',
        scrolling: false, mounted: false, native: false,
        raf: 0, lastMove: 0, root: null, ring: null, dot: null,
        observer: null, scrollTimer: 0, listeners: []
    };

    function el(tag, cls) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        return n;
    }

    function fine() {
        if (M.fine) return M.fine();
        try {
            return global.matchMedia('(hover: hover) and (pointer: fine)').matches &&
                !global.matchMedia('(pointer: coarse)').matches;
        } catch (e) { return false; }
    }

    function a11y() {
        try {
            var raw = JSON.parse(global.localStorage.getItem(A11Y_KEY) || '{}');
            return raw && typeof raw === 'object' ? raw : {};
        } catch (e) { return {}; }
    }

    function pref() {
        return a11y().cursor === 'native' ? 'native' : 'custom';
    }

    function reduced() {
        if (a11y().reduceMotion) return true;
        return M.reduced ? M.reduced() : false;
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

    /* Trạng thái theo phần tử dưới con trỏ. Một phép tra mỗi lần đổi target. */
    function probe(target) {
        if (!target || target.nodeType !== 1 || !target.closest) return '';
        if (target.closest(':disabled,[aria-disabled="true"]')) return 'disabled';
        if (target.closest('[aria-busy="true"],.is-loading,.bk-loading,.bk-skeleton')) return 'loading';
        if (target.closest('input[type="range"],input[type="checkbox"],input[type="radio"],input[type="color"]')) return 'hover';
        if (target.closest('textarea,[contenteditable=""],[contenteditable="true"],input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="color"])')) return 'text';

        var c = '';
        try { c = global.getComputedStyle(target).cursor || ''; } catch (e) { }
        if (c === 'grabbing') return 'grabbing';
        if (c === 'grab') return S.down ? 'grabbing' : 'grab';
        if (c === 'move' || c === 'all-scroll') return 'move';
        if (c === 'wait' || c === 'progress') return 'loading';
        if (c === 'not-allowed') return 'disabled';
        if (/resize$/.test(c)) return 'resize';
        if (c === 'text') return 'text';
        if (c === 'pointer') return 'hover';
        if (target.closest('a,button,summary,label,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[onclick],.bk-card,.bk-tile,.bk-stat,.bk-folder')) return 'hover';
        return '';
    }

    function paintClass() {
        if (!S.root) return;
        S.root.className = 'bk-cur' +
            (S.active ? ' is-on' : '') +
            (S.state ? ' is-' + S.state : '') +
            (S.down ? ' is-down' : '') +
            (S.scrolling ? ' is-scrolling' : '') +
            (reduced() ? ' is-reduced' : '');
    }

    function setState(state) {
        if (S.state === state) return;
        S.state = state;
        var scale = {
            '': [1, 1, 1, 1],
            hover: [1.55, 1.55, 1.5, 1],
            text: [.5, 1.3, 1, 3.4],
            grab: [1.28, 1.28, 1.35, 1.35],
            grabbing: [1.12, 1.12, 1.55, 1.55],
            resize: [1.18, 1.18, 1.1, 1.1],
            disabled: [.9, .9, .75, .75],
            loading: [1.15, 1.15, 1.15, 1.15],
            move: [1.2, 1.2, 1.2, 1.2]
        }[state] || [1, 1, 1, 1];
        S.tsx = scale[0];
        S.tsy = scale[1];
        S.tds = scale[2];
        S.tdsy = scale[3];
        paintClass();
    }

    function activate() {
        if (S.active || S.native) return;
        S.active = true;
        S.rx = S.x; S.ry = S.y; S.rvx = 0; S.rvy = 0;
        D.documentElement.classList.add('bk-cur-on');
        paintClass();
        kick();
    }

    function deactivate() {
        S.active = false;
        S.scrolling = false;
        D.documentElement.classList.remove('bk-cur-on');
        paintClass();
        if (S.raf) { global.cancelAnimationFrame(S.raf); S.raf = 0; }
    }

    function frame() {
        S.raf = 0;
        var t = now();
        var calm = reduced();
        var k = calm ? 1 : SPR.follow;
        var damp = calm ? 0 : SPR.damp;
        var targetY = S.y + S.impulse;

        var r = M.settle ? M.settle(S.rx, S.x, S.rvx, k, damp) : { value: S.x, velocity: 0 };
        S.rx = r.value; S.rvx = r.velocity;
        r = M.settle ? M.settle(S.ry, targetY, S.rvy, k, damp) : { value: targetY, velocity: 0 };
        S.ry = r.value; S.rvy = r.velocity;

        var step = calm ? 1 : .2;
        S.sx += (S.tsx - S.sx) * step;
        S.sy += (S.tsy - S.sy) * step;
        S.ds += (S.tds - S.ds) * step;
        S.dsy += (S.tdsy - S.dsy) * step;
        if (!calm) S.impulse *= SPR.scrollDecay;

        var press = S.down ? .88 : 1;
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
        if (!S.active || S.native || S.raf) return;
        S.raf = global.requestAnimationFrame(frame);
    }

    function recheck() {
        if (!S.active) return;
        var x = Math.max(0, Math.min(S.x, global.innerWidth - 1));
        var y = Math.max(0, Math.min(S.y, global.innerHeight - 1));
        try { setState(probe(D.elementFromPoint(x, y))); } catch (e) { }
    }

    function debounceRecheck() {
        if (S.scrollTimer) global.clearTimeout(S.scrollTimer);
        S.scrollTimer = global.setTimeout(recheck, 120);
    }

    function markScroll() {
        if (!S.scrolling) {
            S.scrolling = true;
            paintClass();
        }
        if (S.scrollTimer) global.clearTimeout(S.scrollTimer);
        S.scrollTimer = global.setTimeout(function () {
            S.scrolling = false;
            paintClass();
        }, 180);
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
            if (S.state === 'grab') setState('grabbing');
            paintClass();
            kick();
        }, { passive: true });

        on(D, 'pointerup', function () {
            S.down = false;
            if (S.state === 'grabbing') recheck();
            paintClass();
            kick();
        }, { passive: true });

        on(D, 'pointercancel', function () {
            S.down = false;
            paintClass();
            kick();
        }, { passive: true });

        on(global, 'blur', deactivate);
        on(D, 'visibilitychange', function () { if (D.hidden) deactivate(); });

        on(global, 'scroll', function () {
            var y = global.pageYOffset || D.documentElement.scrollTop || 0;
            var dy = y - S.lastScroll;
            S.lastScroll = y;
            if (!reduced()) S.impulse = clamp(S.impulse + dy * SPR.scroll, -SPR.scrollMax, SPR.scrollMax);
            markScroll();
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
        if (S.scrollTimer) global.clearTimeout(S.scrollTimer);
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
        S.mounted = false;
        S.active = false;
        S.down = false;
        S.scrolling = false;
        S.state = '';
        S.scrollTimer = 0;
    }

    function applyPref() {
        if (!fine()) return;
        var wantNative = pref() === 'native';
        if (wantNative) {
            S.native = true;
            if (S.mounted) destroy();
            else D.documentElement.classList.remove('bk-cur-on');
            return;
        }
        S.native = false;
        if (S.mounted || !D.body) return;
        mount();
        S.mounted = true;
    }

    function start() {
        if (!D.body) { D.addEventListener('DOMContentLoaded', start, { once: true }); return; }
        applyPref();
        /* Các listener vòng đời này không nằm trong S.listeners: destroy() khi
           chuyển sang con trỏ hệ điều hành không được tháo chúng, nếu không
           chuyển ngược lại sẽ không có gì dựng lại con trỏ. */
        global.addEventListener('storage', function (e) { if (!e || e.key === A11Y_KEY) applyPref(); }, false);
        D.addEventListener('bk:a11y', applyPref, false);
        global.addEventListener('pagehide', deactivate, false);
    }
    start();

    global.BKCursor = {
        __ready: true,
        destroy: destroy,
        state: function () { return S.state; },
        __state: S
    };
})(typeof window !== 'undefined' ? window : this);
