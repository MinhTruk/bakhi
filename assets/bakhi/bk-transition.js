/* =========================================================================
   Bá Khí — bk-transition.js
   Nền void dùng chung + chuyển trang Void/Galaxy.

   · #bkVoid: sao + tinh vân tĩnh, cùng một hình mỗi trang nên trông liền mạch.
   · #bkVT: lớp phủ exit (trước khi rời trang) và enter (trang mới).
   · Bắt click nội bộ ở capture; bỏ qua link ngoài, tải xuống, target mới,
     phím bổ trợ và neo cùng trang. Một lần điều hướng tại một thời điểm.
   · Lớp "bàn tay kéo" cũ (bk-bkt) bị tắt qua window.__bktOff; trình thử
     __bkt.test() trong Developer Playground vẫn chạy.
   · bfcache: pageshow persisted dọn lớp phủ; pagehide dọn trước khi chụp.

   Công khai: window.BKTransition = { go, enter, exit, __ready }
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || !D.documentElement) return;
    if (global.BKTransition && global.BKTransition.__ready) return;

    var M = global.BKMotion || {};
    var html = D.documentElement;
    var NAV = 'bkVtNav';
    var S = { busy: false, overlay: null, glow: null, streaks: [], enterTimer: 0 };

    function el(tag, cls) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        return n;
    }

    function ss(k, v) {
        try {
            if (v === undefined) return global.sessionStorage.getItem(k);
            global.sessionStorage.setItem(k, v);
        } catch (e) { return null; }
        return null;
    }

    function reduced() {
        return M.reduced ? M.reduced() :
            !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function dur(name, fallback) {
        return (M.DUR && M.DUR[name]) || fallback;
    }

    function buildVoid() {
        if (D.getElementById('bkVoid')) return;
        var v = el('div');
        v.id = 'bkVoid';
        v.setAttribute('aria-hidden', 'true');
        v.appendChild(el('div', 'bkv-neb'));
        v.appendChild(el('div', 'bkv-stars'));
        D.body.appendChild(v);
    }

    function buildOverlay() {
        if (D.getElementById('bkVT')) return;
        var o = el('div');
        o.id = 'bkVT';
        o.setAttribute('aria-hidden', 'true');
        o.appendChild(el('div', 'bkvt-bg'));
        S.glow = el('div', 'bkvt-glow');
        o.appendChild(S.glow);
        var spots = [12, 28, 44, 60, 76, 88];
        for (var i = 0; i < spots.length; i++) {
            var s = el('span', 'bkvt-streak');
            s.style.left = spots[i] + '%';
            o.appendChild(s);
            S.streaks.push(s);
        }
        D.body.appendChild(o);
        S.overlay = o;
    }

    function clean() {
        if (!S.overlay) return;
        S.overlay.classList.remove('is-on');
        S.overlay.style.opacity = '';
        for (var i = 0; i < S.streaks.length; i++) {
            try { S.streaks[i].getAnimations().forEach(function (a) { a.cancel(); }); } catch (e) { }
        }
        html.classList.remove('bk-vt-entering');
    }

    function exit(done) {
        if (!S.overlay) { if (done) done(); return; }
        S.busy = true;
        S.overlay.classList.add('is-on');
        S.overlay.style.opacity = '1';
        if (reduced()) {
            global.setTimeout(function () { if (done) done(); }, 140);
            return;
        }
        var ms = dur('exit', 420);
        S.overlay.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: Math.round(ms * .45), easing: 'linear', fill: 'both'
        });
        if (S.glow) {
            S.glow.animate([
                { opacity: 0, transform: 'translate(-50%,-50%) scale(.55)' },
                { opacity: .9, transform: 'translate(-50%,-50%) scale(1.15)' }
            ], { duration: ms, easing: 'cubic-bezier(.2,0,0,1)', fill: 'both' });
        }
        for (var i = 0; i < S.streaks.length; i++) {
            S.streaks[i].animate([
                { opacity: 0, transform: 'translate3d(0,-120%,0) scaleY(.6)' },
                { opacity: .9, transform: 'translate3d(0,40%,0) scaleY(1)' },
                { opacity: 0, transform: 'translate3d(0,220%,0) scaleY(1.3)' }
            ], {
                duration: ms, delay: i * 36,
                easing: 'cubic-bezier(.4,0,.7,1)', fill: 'both'
            });
        }
        global.setTimeout(function () { if (done) done(); }, ms + 30);
    }

    function enter() {
        if (!S.overlay) return;
        html.classList.remove('bk-vt-boot');
        S.overlay.classList.add('is-on');
        S.overlay.style.opacity = '1';
        if (reduced()) {
            var a0 = S.overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: 200, easing: 'linear', fill: 'forwards'
            });
            if (a0 && a0.finished && a0.finished.then) a0.finished.then(clean, clean);
            global.setTimeout(clean, 320);
            return;
        }
        html.classList.add('bk-vt-entering');
        var ms = dur('enter', 520);
        var a = S.overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: ms, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards'
        });
        if (S.glow) {
            S.glow.animate([
                { opacity: .75, transform: 'translate(-50%,-50%) scale(1.5)' },
                { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' }
            ], { duration: ms, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
        }
        for (var i = 0; i < S.streaks.length; i++) {
            S.streaks[i].animate([
                { opacity: 0, transform: 'translate3d(0,-60%,0) scaleY(.7)' },
                { opacity: .7, transform: 'translate3d(0,120%,0) scaleY(1)' },
                { opacity: 0, transform: 'translate3d(0,260%,0) scaleY(1.2)' }
            ], { duration: ms, delay: i * 28, easing: 'linear', fill: 'both' });
        }
        if (a && a.finished && a.finished.then) a.finished.then(clean, clean);
        global.clearTimeout(S.enterTimer);
        S.enterTimer = global.setTimeout(clean, ms + 320);
        S.busy = false;
        D.dispatchEvent(new global.Event('bk:vtdone'));
    }

    function focusMain() {
        var main = D.querySelector('main');
        if (!main) return;
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        try { main.focus({ preventScroll: true }); } catch (e) { try { main.focus(); } catch (x) { } }
    }

    function go(url) {
        if (S.busy) return;
        try { ss(NAV, String(Date.now())); } catch (e) { }
        exit(function () { global.location.href = url; });
        /* Lưới an toàn: không bao giờ kẹt lớp phủ nếu exit() không gọi lại. */
        global.setTimeout(function () {
            if (S.busy) global.location.href = url;
        }, 1000);
    }

    function onClick(e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-bk-no-vt')) return;
        var raw = a.getAttribute('href') || '';
        if (/^(mailto:|tel:|javascript:)/i.test(raw)) return;
        var u;
        try { u = new global.URL(a.href, global.location.href); } catch (err) { return; }
        if (u.origin !== global.location.origin) return;
        if (u.pathname === global.location.pathname && u.search === global.location.search) return;

        e.preventDefault();
        if (S.busy) return;
        go(u.href);
    }

    function ready() {
        if (!D.body) { D.addEventListener('DOMContentLoaded', ready, { once: true }); return; }
        buildVoid();
        buildOverlay();

        var at = Number(ss(NAV) || 0);
        var fresh = at > 0 && Date.now() - at < 15000;
        if (fresh) ss(NAV, '');
        var navType = '';
        try {
            var list = global.performance.getEntriesByType && global.performance.getEntriesByType('navigation');
            navType = list && list[0] ? list[0].type : '';
        } catch (e) { }
        var back = navType === 'back_forward';
        var boot = html.classList.contains('bk-vt-boot');

        if (boot || fresh || back) {
            /* Intro là chủ sân khi nó sắp chạy: không chồng hai màn hình. */
            if (D.getElementById('bkIntro')) html.classList.remove('bk-vt-boot');
            else {
                enter();
                if (fresh || back) focusMain();
            }
        }
    }

    /* Tắt lớp "bàn tay kéo" cũ cho click; __bkt.test() vẫn hoạt động. */
    global.__bktOff = true;

    D.addEventListener('click', onClick, true);

    global.addEventListener('pageshow', function (e) {
        if (e.persisted) {
            clean();
            html.classList.remove('bk-vt-boot');
            S.busy = false;
        }
    });
    global.addEventListener('pagehide', function () {
        clean();
        html.classList.remove('bk-vt-boot');
        S.busy = false;
    });

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();

    global.BKTransition = {
        __ready: true,
        go: go,
        enter: enter,
        exit: exit
    };
})(typeof window !== 'undefined' ? window : this);
