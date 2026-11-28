/* Hiệu ứng chuyển trang BAKHI — Seamless O → B → O (void).
   Tái dùng cơ chế click-intercept + cờ sessionStorage 'bkVtNav' của bk-bkt cũ,
   nhưng thay toàn bộ animation bằng chuỗi: phủ đen → O → b → giữ → trang mới → b → O → co đen → chấm. */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || !D.documentElement) return;
    if (global.BKTransition && global.BKTransition.__ready) return;

    var html = D.documentElement;
    html.style.background = '#050506';

    var NAV = 'bkVtNav';
    var S = { busy: false, overlay: null, mask: null, glow: null, mark: null, stem: null, svg: null };

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
        return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function injectStyle() {
        if (D.getElementById('bkvt-style')) return;
        var st = el('style');
        st.id = 'bkvt-style';
        st.textContent =
            'html.bk-vt-boot body > * { visibility: hidden !important; }' +
            'html.bk-vt-boot #bkVT { visibility: visible !important; opacity: 1; }' +
            '#bkVT { position: fixed; inset: 0; z-index: 2147482400; overflow: hidden; pointer-events: none; opacity: 0; visibility: hidden; }' +
            '#bkVT.is-on { visibility: visible; opacity: 1; }' +
            '#bkVT .bkvt-mask { position: absolute; inset: 0; background: #050506; clip-path: circle(0% at 50% 50%); }' +
            '#bkVT .bkvt-glow { position: absolute; left: 50%; top: 50%; width: min(100vmax, 960px); height: min(100vmax, 960px); border-radius: 50%; background: radial-gradient(circle, rgba(233,150,185,.26), rgba(196,181,253,.08) 42%, transparent 70%); transform: translate(-50%, -50%) scale(.6); opacity: 0; }' +
            '#bkVT .bkvt-mark { position: absolute; left: 0; right: 0; top: 50%; width: calc(64px * 46 / 66); margin-inline: auto; transform: translateY(calc(64px * -0.6667)); opacity: 0; }' +
            '#bkVT .bkvt-mark svg { width: 100%; height: auto; display: block; }' +
            '#bkVT .bkvt-ring, #bkVT .bkvt-stem { fill: none; stroke: #e996b9; stroke-width: 2.4; vector-effect: non-scaling-stroke; }' +
            '#bkVT .bkvt-stem { stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100; }' +
            '@media (prefers-reduced-motion: reduce) { #bkVT .bkvt-mask { transition: none; } }';
        (D.head || html).appendChild(st);
    }

    function build() {
        if (D.getElementById('bkVT')) {
            S.overlay = D.getElementById('bkVT');
            S.mask = S.overlay.querySelector('.bkvt-mask');
            S.glow = S.overlay.querySelector('.bkvt-glow');
            S.mark = S.overlay.querySelector('.bkvt-mark');
            S.svg = S.mark ? S.mark.querySelector('svg') : null;
            S.stem = S.overlay.querySelector('.bkvt-stem');
            return;
        }
        var o = el('div');
        o.id = 'bkVT';
        o.setAttribute('aria-hidden', 'true');
        S.mask = el('div', 'bkvt-mask');
        o.appendChild(S.mask);
        S.glow = el('div', 'bkvt-glow');
        o.appendChild(S.glow);
        S.mark = el('div', 'bkvt-mark');
        S.mark.innerHTML = '<svg viewBox="0 0 46 66" aria-hidden="true"><circle class="bkvt-ring" cx="23" cy="44" r="20"/><path class="bkvt-stem" d="M3 64V3" pathLength="100"/></svg>';
        o.appendChild(S.mark);
        S.svg = S.mark.querySelector('svg');
        S.stem = S.mark.querySelector('.bkvt-stem');
        (D.body || html).appendChild(o);
        S.overlay = o;
    }

    /* Trang đích: dựng b ngay trong <head> (trước khi body được vẽ) để chữ b
       không biến mất trong lúc chờ DOMContentLoaded. */
    function preboot() {
        build();
        if (!S.overlay) return;
        S.overlay.classList.add('is-on');
        if (S.mask) S.mask.style.clipPath = 'circle(150% at 50% 50%)';
        if (S.mark) S.mark.style.opacity = '1';
        if (S.stem) S.stem.style.strokeDashoffset = '0';
        if (S.svg) { S.svg.style.transform = 'scale(1)'; S.svg.style.opacity = '1'; }
        if (S.glow) S.glow.style.opacity = '.8';
    }

    function focusMain() {
        var main = D.querySelector('main');
        if (!main) return;
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        try { main.focus({ preventScroll: true }); } catch (e) { try { main.focus(); } catch (x) { } }
    }

    function clean() {
        if (!S.overlay) return;
        S.overlay.classList.remove('is-on');
        S.overlay.style.opacity = '';
        [S.mask, S.glow, S.svg, S.stem, S.mark].forEach(function (n) {
            if (!n || !n.getAnimations) return;
            n.getAnimations().forEach(function (a) { a.cancel(); });
        });
        if (S.mask) S.mask.style.clipPath = '';
        if (S.mark) S.mark.style.opacity = '';
        if (S.stem) S.stem.style.strokeDashoffset = '100';
        html.classList.remove('bk-vt-boot');
        html.style.background = '';
        S.busy = false;
    }

    function removeBoot() {
        html.classList.remove('bk-vt-boot');
    }

    function cover(done) {
        if (!S.mask) { if (done) done(); return; }
        S.mask.style.clipPath = 'circle(0% at 50% 50%)';
        var a = S.mask.animate(
            [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(150% at 50% 50%)' }],
            { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
        );
        if (a && a.finished && a.finished.then) a.finished.then(function () { if (done) done(); }, function () { if (done) done(); });
        else global.setTimeout(function () { if (done) done(); }, 320);
    }

    function exit(done) {
        if (S.busy) return;
        S.busy = true;
        build();
        S.overlay.classList.add('is-on');
        try { ss(NAV, String(Date.now())); } catch (e) { }

        if (reduced()) {
            global.setTimeout(function () {
                if (done) done();
            }, 40);
            return;
        }

        // 1. Phủ đen từ tâm.
        cover(function () {
            // 2. Hiện O (vòng tròn).
            if (S.mark) {
                S.mark.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'forwards' });
            }
            if (S.glow) {
                S.glow.animate(
                    [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.6)' },
                     { opacity: .8, transform: 'translate(-50%, -50%) scale(1)' }],
                    { duration: 180, easing: 'cubic-bezier(.16,.84,.25,1)', fill: 'forwards' }
                );
            }
            if (S.stem) S.stem.style.strokeDashoffset = '100';
            if (S.svg) {
                S.svg.animate(
                    [{ transform: 'scale(.02)', opacity: 0 },
                     { transform: 'scale(1)', opacity: 1 }],
                    { duration: 200, delay: 60, easing: 'cubic-bezier(.16,.84,.25,1)', fill: 'forwards' }
                );
            }
            // 3. Morph O → b: kéo nét dọc từ đáy lên.
            global.setTimeout(function () {
                if (S.stem) {
                    S.stem.animate(
                        [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }],
                        { duration: 300, easing: 'cubic-bezier(.16,.84,.25,1)', fill: 'forwards' }
                    );
                }
            }, 280);
            // 4. Giữ b rồi điều hướng (morph kết thúc ~880 ms).
            global.setTimeout(function () { if (done) done(); }, 900);
        });
    }

    function enter() {
        build();
        S.overlay.classList.add('is-on');
        removeBoot();
        if (S.mask) S.mask.style.clipPath = 'circle(150% at 50% 50%)';
        if (S.stem) S.stem.style.strokeDashoffset = '0';
        if (S.mark) S.mark.style.opacity = '1';
        if (S.svg) { S.svg.style.transform = 'scale(1)'; S.svg.style.opacity = '1'; }
        if (S.glow) S.glow.style.opacity = '.8';

        if (reduced()) {
            global.setTimeout(clean, 60);
            return;
        }

        // 5. b → O: thu nét dọc xuống.
        global.setTimeout(function () {
            if (S.stem) {
                S.stem.animate(
                    [{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }],
                    { duration: 300, easing: 'cubic-bezier(.16,.84,.25,1)', fill: 'forwards' }
                );
            }
        }, 120);

        // 6. Co đen + O tan vào chấm.
        global.setTimeout(function () {
            if (S.mask) {
                S.mask.animate(
                    [{ clipPath: 'circle(150% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }],
                    { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
                );
            }
            if (S.svg) {
                S.svg.animate(
                    [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.02)', opacity: 0 }],
                    { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
                );
            }
            if (S.glow) {
                S.glow.animate(
                    [{ opacity: .8 }, { opacity: 0 }],
                    { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
                );
            }
        }, 440);

        global.setTimeout(clean, 920);
    }

    function go(url) {
        if (S.busy) return;
        try { ss(NAV, String(Date.now())); } catch (e) { }
        exit(function () { global.location.href = url; });
        global.setTimeout(function () {
            if (S.busy) global.location.href = url;
        }, 2000);
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
        injectStyle();
        build();

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

        if (D.getElementById('bkIntro') && !fresh && !boot) {
            html.classList.remove('bk-vt-boot');
        } else if (boot || fresh || back) {
            /* Vào trang bằng chuyển trang/back thì bỏ intro để chuỗi b → O liền mạch. */
            ss('bakhiIntroSeen.v1', '1');
            if (D.getElementById('bkIntro') && global.BKIntro && global.BKIntro.skip) global.BKIntro.skip();
            enter();
            if (fresh || back) focusMain();
        } else {
            html.classList.remove('bk-vt-boot');
        }
        global.setTimeout(function () { html.classList.remove('bk-vt-boot'); }, 3000);
    }

    injectStyle();
    try {
        var at0 = Number(ss(NAV) || 0);
        if (at0 > 0 && Date.now() - at0 < 15000) preboot();
    } catch (e) { }

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

    global.__bkt = {
        cfg: { on: true, style: 'bkt', speed: 1 },
        go: go,
        play: function (dir) {
            dir = dir || 'L';
            exit(function () {
                global.setTimeout(function () { enter(); }, 300);
            });
        },
        test: function (d) {
            d = d || 'L';
            exit(function () { global.setTimeout(enter, 900); });
        },
        save: function () { }
    };
})(typeof window !== 'undefined' ? window : this);
