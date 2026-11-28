/* =========================================================================
   Bá Khí — bk-intro.js
   Màn hình mở đầu kiếm Nhật (katana), một đồng hồ duy nhất:

     O (vẽ nét) → kiếm lao vào, nhịp lấy đà, chém → chớp + sóng xung kích
     → kiếm xoay thành nét đứng của chữ B → hai bát chữ B + BAKHI
     → “nền tảng học tập” → rút kiếm, phóng to thoát khung
     → nhát chém toàn màn hình tách lớp void, lộ website thật.

   Nguyên tắc:
   - MỌI animation dùng chung duration TOTAL và đặt nhịp bằng offset, nên
     không pha nào lệch. Không thư viện, không keyframe CSS chạy song song.
   - Chỉ một phiên chạy một lần (sessionStorage bakhiIntroSeen.v1).
     ?intro=1 ép chạy, ?intro=0 bỏ qua. Vào trang qua chuyển trang void thì
     không chạy (bk-transition đã dựng lớp enter).
   - Bỏ qua bằng chạm hoặc phím bất kỳ; luôn kết thúc ở trạng thái sạch,
     có hẹn giờ cứng dự phòng.
   - prefers-reduced-motion: hiện bố cục cuối rồi mờ dần, không chém, không
     chớp, không rung.
   - Chỉ đụng DOM của chính nó; không gọi Supabase hay mô-đun nào khác.

   Công khai: window.BKIntro = { play, skip, shown }
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || !D.documentElement) return;
    if (global.BKIntro && global.BKIntro.__ready) return;

    var NS = 'http://www.w3.org/2000/svg';
    var SEEN_KEY = 'bakhiIntroSeen.v1';
    var M = global.BKMotion || {};
    var TOTAL = (M.DUR && M.DUR.intro) || 5000;

    /* Nhịp (ms) — nguồn duy nhất cho toàn bộ chuỗi. */
    var B = {
        oIn: 100, oDrawn: 700,
        katEnter: 760, katPull: 980, anticip: 1120, strike: 1330,
        oOut: 1760, morph: 2150,
        stem: 2350, bowls: 2650,
        word: 2950, sub: 3150, hold: 3600,
        pullOut: 4250, stageOut: 4520,
        splitAt: 4450, splitEnd: 4950
    };

    var root = D.documentElement;
    var query = '';
    try { query = String(global.location.search || ''); } catch (e) { }

    function at(ms) { return Math.min(1, Math.max(0, ms / TOTAL)); }

    function forced() {
        if (/(?:[?&])intro=0(?:&|$)/.test(query)) return false;
        if (/(?:[?&])intro=1(?:&|$)/.test(query)) return true;
        return null;
    }
    function seen() { try { return global.sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } }
    function remember() { try { global.sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { } }
    function reduced() {
        try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }

    function el(tag, cls, text) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function sv(tag, attrs, text) {
        var n = D.createElementNS(NS, tag);
        for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
        if (text != null) n.textContent = text;
        return n;
    }

    /* ------------------------------------------------------------ katana ---
       Vẽ dọc +X: chuôi (-124..-6) · tsuba (0) · lưỡi (6..440). Gốc toạ độ
       nằm ở tsuba để xoay/scale quanh đúng chỗ nối chuôi–lưỡi. */
    function katana(cls) {
        var g = sv('g', { 'class': cls });

        var blade = sv('g', { 'class': 'bki-blade' });
        blade.appendChild(sv('path', {
            'class': 'bki-blade-fill',
            d: 'M6 -13 L378 -7 L440 0 L378 7 L6 13 Z'
        }));
        blade.appendChild(sv('path', {
            'class': 'bki-blade-edge',
            d: 'M6 -13 L378 -7 L440 0'
        }));
        blade.appendChild(sv('path', {
            'class': 'bki-blade-hamon',
            d: 'M44 4 Q72 -3 100 4 T156 4 T212 4 T268 4 T324 4 T372 3'
        }));
        g.appendChild(blade);

        g.appendChild(sv('rect', { 'class': 'bki-tsuba', x: -7, y: -19, width: 14, height: 38, rx: 5 }));
        g.appendChild(sv('rect', { 'class': 'bki-handle', x: -126, y: -9, width: 120, height: 18, rx: 8 }));

        var wrap = sv('g', { 'class': 'bki-wrap' });
        for (var x = -112; x < -12; x += 16) {
            wrap.appendChild(sv('path', { d: 'M' + x + ' -8 L' + (x + 10) + ' 8' }));
        }
        g.appendChild(wrap);
        g.appendChild(sv('circle', { 'class': 'bki-pommel', cx: -130, cy: 0, r: 10 }));
        return g;
    }

    function build() {
        var overlay = el('div', 'bk-intro');
        overlay.id = 'bkIntro';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('role', 'presentation');

        var halfTop = el('div', 'bki-half bki-top');
        var halfBot = el('div', 'bki-half bki-bot');
        var cut = el('div', 'bki-cut');
        var flash = el('div', 'bki-flash');

        var stage = el('div', 'bki-stage');
        var svg = sv('svg', {
            viewBox: '0 0 1200 800',
            preserveAspectRatio: 'xMidYMid meet',
            'class': 'bki-svg',
            focusable: 'false'
        });

        var defs = sv('defs');
        var grad = sv('linearGradient', { id: 'bkiSteel', x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.appendChild(sv('stop', { offset: '0', 'stop-color': '#f2f6fd' }));
        grad.appendChild(sv('stop', { offset: '.45', 'stop-color': '#b9c2d4' }));
        grad.appendChild(sv('stop', { offset: '1', 'stop-color': '#7b8497' }));
        defs.appendChild(grad);
        var wordClip = sv('clipPath', { id: 'bkiWordClip' });
        var wordRect = sv('rect', { x: 508, y: 430, width: 320, height: 130, 'class': 'bki-word-clip' });
        wordClip.appendChild(wordRect);
        defs.appendChild(wordClip);
        svg.appendChild(defs);

        var wave = sv('circle', { cx: 600, cy: 380, r: 112, 'class': 'bki-wave' });
        var o = sv('ellipse', { cx: 600, cy: 380, rx: 112, ry: 112, pathLength: 100, 'class': 'bki-o' });
        var slash = sv('line', { x1: 150, y1: 168, x2: 1050, y2: 592, pathLength: 100, 'class': 'bki-slash' });

        var stem = sv('path', { d: 'M429 446 V530', pathLength: 100, 'class': 'bki-stem' });
        var bowlUp = sv('path', { d: 'M429 446 C470 446 500 452 500 466 C500 480 470 487 429 487', pathLength: 100, 'class': 'bki-bowl' });
        var bowlLo = sv('path', { d: 'M429 487 C476 487 506 494 506 508 C506 522 476 530 429 530', pathLength: 100, 'class': 'bki-bowl' });

        var word = sv('text', { x: 515, y: 530, 'class': 'bki-word' }, 'AKHI');
        word.setAttribute('clip-path', 'url(#bkiWordClip)');
        var sub = sv('text', { x: 600, y: 582, 'text-anchor': 'middle', 'class': 'bki-sub' }, 'nền tảng học tập');

        var trail = katana('bki-katana bki-trail');
        var blade = katana('bki-katana');

        svg.appendChild(wave);
        svg.appendChild(o);
        svg.appendChild(slash);
        svg.appendChild(stem);
        svg.appendChild(bowlUp);
        svg.appendChild(bowlLo);
        svg.appendChild(word);
        svg.appendChild(sub);
        svg.appendChild(trail);
        svg.appendChild(blade);

        stage.appendChild(svg);
        overlay.appendChild(halfTop);
        overlay.appendChild(halfBot);
        overlay.appendChild(stage);
        overlay.appendChild(cut);
        overlay.appendChild(flash);
        (D.body || root).appendChild(overlay);

        return {
            overlay: overlay, stage: stage, halfTop: halfTop, halfBot: halfBot,
            cut: cut, flash: flash, o: o, wave: wave, slash: slash,
            stem: stem, bowls: [bowlUp, bowlLo], word: word, sub: sub, wordRect: wordRect,
            blade: blade, trail: trail, closed: false, timer: 0,
            onKey: null, onTap: null, anims: []
        };
    }

    /* ------------------------------------------------------------ vòng đời */
    function remove(ctx) {
        if (ctx.overlay.parentNode) ctx.overlay.parentNode.removeChild(ctx.overlay);
    }

    function exit(ctx) {
        if (ctx.closed) return;
        ctx.closed = true;
        global.clearTimeout(ctx.timer);
        if (ctx.onKey) D.removeEventListener('keydown', ctx.onKey, true);
        if (ctx.onTap) ctx.overlay.removeEventListener('pointerdown', ctx.onTap);

        var fade = ctx.overlay.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: reduced() ? 160 : 260, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }
        );
        if (fade && fade.finished && fade.finished.then) fade.finished.then(function () { remove(ctx); }, function () { remove(ctx); });
        global.setTimeout(function () { remove(ctx); }, 520);
    }

    /* Chờ index.html gỡ khoá khởi động (xác định phiên học sinh) rồi mới mờ. */
    function finish(ctx) {
        if (ctx.closed) return;
        if (root.classList.contains('bk-boot-lock') && global.MutationObserver) {
            var obs = new global.MutationObserver(function () {
                if (root.classList.contains('bk-boot-lock')) return;
                obs.disconnect();
                exit(ctx);
            });
            obs.observe(root, { attributes: true, attributeFilter: ['class'] });
            global.setTimeout(function () { obs.disconnect(); exit(ctx); }, 1400);
            return;
        }
        exit(ctx);
    }

    function skip(ctx) {
        if (ctx.closed) return;
        global.clearTimeout(ctx.timer);
        for (var i = 0; i < ctx.anims.length; i++) {
            try { ctx.anims[i].finish(); } catch (e) { }
        }
        exit(ctx);
    }

    /* --------------------------------------------------------- chuyển động */
    function anim(ctx, node, frames) {
        if (!node || !node.animate) return null;
        var a = node.animate(frames, { duration: TOTAL, fill: 'both' });
        ctx.anims.push(a);
        return a;
    }

    var STILL = 'translate(429px,446px) rotate(90deg) scale(.1909)';

    function bladeFrames(offsetMs, opacity) {
        var d = offsetMs;
        return [
            { offset: 0, opacity: 0, transform: 'translate(1250px,-160px) rotate(22deg) scale(1.05)' },
            { offset: at(B.katEnter), opacity: 1, transform: 'translate(1250px,-160px) rotate(22deg) scale(1.05)', easing: 'cubic-bezier(.3,0,.2,1)' },
            { offset: at(B.katPull + d), opacity: 1, transform: 'translate(210px,190px) rotate(22deg) scale(1)', easing: 'cubic-bezier(.4,0,.2,1)' },
            { offset: at(B.anticip + d), opacity: 1, transform: 'translate(150px,150px) rotate(18deg) scale(1)', easing: 'cubic-bezier(.5,0,.9,.4)' },
            { offset: at(B.strike + d), opacity: 1, transform: 'translate(240px,232px) rotate(20deg) scale(1)', easing: 'linear' },
            { offset: at(B.strike + 220 + d), opacity: 1, transform: 'translate(240px,232px) rotate(20deg) scale(1)', easing: 'cubic-bezier(.16,1,.3,1)' },
            { offset: at(B.morph + d), opacity: 1, transform: STILL },
            { offset: at(B.hold + d), opacity: 1, transform: STILL, easing: 'cubic-bezier(.5,0,.9,.4)' },
            { offset: at(B.pullOut + d), opacity: 1, transform: 'translate(429px,-2600px) rotate(94deg) scale(5.2)' },
            { offset: at(B.pullOut + 130 + d), opacity: 0, transform: 'translate(429px,-3200px) rotate(94deg) scale(5.2)' },
            { offset: 1, opacity: 0, transform: 'translate(429px,-3200px) rotate(94deg) scale(5.2)' }
        ].map(function (f) {
            if (opacity == null || f.opacity == null) return f;
            var c = {};
            for (var k in f) c[k] = f[k];
            c.opacity = f.opacity * opacity;
            return c;
        });
    }

    function playFull(ctx) {
        if (ctx.closed) return;

        anim(ctx, ctx.o, [
            { offset: 0, opacity: 0, strokeDashoffset: 100, transform: 'scale(.86)' },
            { offset: at(B.oIn), opacity: 1, strokeDashoffset: 100, transform: 'scale(.86)', easing: 'cubic-bezier(.33,0,.67,1)' },
            { offset: at(B.oDrawn), opacity: 1, strokeDashoffset: 0, transform: 'scale(1)', easing: 'cubic-bezier(.2,.6,.24,1)' },
            { offset: at(B.strike), opacity: 1, strokeDashoffset: 0, transform: 'scale(1)', easing: 'linear' },
            { offset: at(B.strike + 260), opacity: 1, strokeDashoffset: 0, transform: 'scale(1.16)', easing: 'cubic-bezier(.3,0,.7,1)' },
            { offset: at(B.oOut), opacity: 0, strokeDashoffset: 0, transform: 'scale(1.34)' },
            { offset: 1, opacity: 0, strokeDashoffset: 0, transform: 'scale(1.34)' }
        ]);

        anim(ctx, ctx.wave, [
            { offset: 0, opacity: 0, transform: 'scale(.7)' },
            { offset: at(B.strike), opacity: 0, transform: 'scale(.7)' },
            { offset: at(B.strike + 30), opacity: .85, transform: 'scale(.8)' },
            { offset: at(B.oOut + 80), opacity: 0, transform: 'scale(2.5)' },
            { offset: 1, opacity: 0, transform: 'scale(2.5)' }
        ]);

        anim(ctx, ctx.slash, [
            { offset: 0, opacity: 0, strokeDashoffset: 100 },
            { offset: at(B.anticip), opacity: 0, strokeDashoffset: 100 },
            { offset: at(B.strike), opacity: 1, strokeDashoffset: 0 },
            { offset: at(B.strike + 180), opacity: 0, strokeDashoffset: 0 },
            { offset: 1, opacity: 0, strokeDashoffset: 0 }
        ]);

        anim(ctx, ctx.stage, [
            { offset: 0, opacity: 1, transform: 'translate3d(0,0,0)' },
            { offset: at(B.strike), opacity: 1, transform: 'translate3d(0,0,0)' },
            { offset: at(B.strike + 20), opacity: 1, transform: 'translate3d(5px,-4px,0)' },
            { offset: at(B.strike + 50), opacity: 1, transform: 'translate3d(-5px,3px,0)' },
            { offset: at(B.strike + 80), opacity: 1, transform: 'translate3d(3px,-2px,0)' },
            { offset: at(B.strike + 120), opacity: 1, transform: 'translate3d(0,0,0)' },
            { offset: at(B.stageOut), opacity: 1, transform: 'translate3d(0,0,0)' },
            { offset: at(B.stageOut + 120), opacity: 0, transform: 'translate3d(0,0,0)' },
            { offset: 1, opacity: 0, transform: 'translate3d(0,0,0)' }
        ]);

        anim(ctx, ctx.flash, [
            { offset: 0, opacity: 0 },
            { offset: at(B.strike), opacity: 0 },
            { offset: at(B.strike + 25), opacity: .2 },
            { offset: at(B.strike + 150), opacity: 0 },
            { offset: 1, opacity: 0 }
        ]);

        anim(ctx, ctx.stem, [
            { offset: 0, opacity: 0, strokeDashoffset: 100 },
            { offset: at(B.strike + 300), opacity: 0, strokeDashoffset: 100 },
            { offset: at(B.morph - 100), opacity: 1, strokeDashoffset: 100, easing: 'cubic-bezier(.3,0,.2,1)' },
            { offset: at(B.stem), opacity: 1, strokeDashoffset: 0 },
            { offset: 1, opacity: 1, strokeDashoffset: 0 }
        ]);

        anim(ctx, ctx.bowls[0], [
            { offset: 0, opacity: 0, strokeDashoffset: 100 },
            { offset: at(B.morph + 40), opacity: 0, strokeDashoffset: 100, easing: 'cubic-bezier(.35,0,.25,1)' },
            { offset: at(B.bowls), opacity: 1, strokeDashoffset: 0 },
            { offset: 1, opacity: 1, strokeDashoffset: 0 }
        ]);
        anim(ctx, ctx.bowls[1], [
            { offset: 0, opacity: 0, strokeDashoffset: 100 },
            { offset: at(B.morph + 120), opacity: 0, strokeDashoffset: 100, easing: 'cubic-bezier(.35,0,.25,1)' },
            { offset: at(B.bowls + 80), opacity: 1, strokeDashoffset: 0 },
            { offset: 1, opacity: 1, strokeDashoffset: 0 }
        ]);

        anim(ctx, ctx.word, [
            { offset: 0, opacity: 0, transform: 'translateY(8px)' },
            { offset: at(B.morph + 200), opacity: 0, transform: 'translateY(8px)' },
            { offset: at(B.morph + 260), opacity: 1, transform: 'translateY(8px)' },
            { offset: at(B.word), opacity: 1, transform: 'translateY(0)' },
            { offset: 1, opacity: 1, transform: 'translateY(0)' }
        ]);
        anim(ctx, ctx.wordRect, [
            { offset: 0, transform: 'scaleX(0)' },
            { offset: at(B.morph + 240), transform: 'scaleX(0)', easing: 'cubic-bezier(.2,.6,.24,1)' },
            { offset: at(B.word), transform: 'scaleX(1)' },
            { offset: 1, transform: 'scaleX(1)' }
        ]);

        anim(ctx, ctx.sub, [
            { offset: 0, opacity: 0, transform: 'translateY(8px)' },
            { offset: at(B.sub - 380), opacity: 0, transform: 'translateY(8px)' },
            { offset: at(B.sub), opacity: 1, transform: 'translateY(0)', easing: 'cubic-bezier(.2,.6,.24,1)' },
            { offset: 1, opacity: 1, transform: 'translateY(0)' }
        ]);

        anim(ctx, ctx.blade, bladeFrames(0, 1));
        anim(ctx, ctx.trail, bladeFrames(40, .32));

        anim(ctx, ctx.cut, [
            { offset: 0, opacity: 0, transform: 'rotate(-3deg) scaleX(.1)' },
            { offset: at(B.splitAt), opacity: 0, transform: 'rotate(-3deg) scaleX(.1)' },
            { offset: at(B.splitAt + 100), opacity: 1, transform: 'rotate(-3deg) scaleX(1)' },
            { offset: at(B.splitAt + 380), opacity: 0, transform: 'rotate(-3deg) scaleX(1.05)' },
            { offset: 1, opacity: 0, transform: 'rotate(-3deg) scaleX(1.05)' }
        ]);

        anim(ctx, ctx.halfTop, [
            { offset: 0, transform: 'translate3d(0,0,0)' },
            { offset: at(B.splitAt), transform: 'translate3d(0,0,0)', easing: 'cubic-bezier(.7,0,.2,1)' },
            { offset: at(B.splitEnd), transform: 'translate3d(0,-106%,0)' },
            { offset: 1, transform: 'translate3d(0,-106%,0)' }
        ]);
        anim(ctx, ctx.halfBot, [
            { offset: 0, transform: 'translate3d(0,0,0)' },
            { offset: at(B.splitAt), transform: 'translate3d(0,0,0)', easing: 'cubic-bezier(.7,0,.2,1)' },
            { offset: at(B.splitEnd), transform: 'translate3d(0,106%,0)' },
            { offset: 1, transform: 'translate3d(0,106%,0)' }
        ]);

        global.clearTimeout(ctx.timer);
        ctx.timer = global.setTimeout(function () { finish(ctx); }, TOTAL + 60);
    }

    function playReduced(ctx) {
        ctx.o.style.opacity = '0';
        ctx.wave.style.opacity = '0';
        ctx.slash.style.opacity = '0';
        ctx.flash.style.opacity = '0';
        ctx.blade.style.opacity = '0';
        ctx.trail.style.opacity = '0';
        ctx.stem.style.strokeDashoffset = '0';
        ctx.stem.style.opacity = '1';
        for (var i = 0; i < ctx.bowls.length; i++) {
            ctx.bowls[i].style.strokeDashoffset = '0';
            ctx.bowls[i].style.opacity = '1';
        }
        ctx.word.style.opacity = '1';
        ctx.word.style.clipPath = 'none';
        ctx.sub.style.opacity = '1';

        ctx.overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
        global.clearTimeout(ctx.timer);
        ctx.timer = global.setTimeout(function () { finish(ctx); }, 1100);
    }

    /* ------------------------------------------------------------------ API */
    function whenReady(fn) {
        var done = false;
        function go() { if (done) return; done = true; fn(); }
        try {
            if (D.fonts && D.fonts.ready && D.fonts.ready.then) D.fonts.ready.then(go, go);
        } catch (e) { }
        global.setTimeout(go, 400);
    }

    function play() {
        var mode = forced();
        if (mode === false) return null;
        if (global.__bkIntroShown || D.getElementById('bkIntro')) return null;
        if (mode !== true && seen()) return null;

        global.__bkIntroShown = true;
        remember();

        var ctx = build();
        ctx.onKey = function (ev) {
            var key = ev && ev.key;
            if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return;
            skip(ctx);
        };
        ctx.onTap = function () { skip(ctx); };
        D.addEventListener('keydown', ctx.onKey, true);
        ctx.overlay.addEventListener('pointerdown', ctx.onTap);

        if (reduced()) playReduced(ctx);
        else whenReady(function () { playFull(ctx); });

        global.clearTimeout(ctx.timer);
        ctx.timer = global.setTimeout(function () { finish(ctx); }, TOTAL + 1200);
        return ctx;
    }

    var api = {
        __ready: true,
        shown: false,
        play: play,
        skip: function () {
            var node = D.getElementById('bkIntro');
            if (node) node.dispatchEvent(new global.Event('pointerdown'));
        }
    };
    global.BKIntro = api;

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', play);
    else play();
})(typeof window !== 'undefined' ? window : this);
