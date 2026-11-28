/* =========================================================================
   Bá Khí — bk-intro.js
   Màn mở đầu dựng lại theo video tham chiếu, một dòng thời gian duy nhất:

     chấm hồng → vòng tròn mảnh → chữ b (nét dọc mọc lên) → BAKHI
     → “nền tảng học tập” → giữ yên → mờ lớp phủ, lộ trang chủ.

   Mốc (ms, tính từ lúc chấm xuất hiện):
     0–150    chấm hồng hiện đúng tâm
     150–750  chấm nở thành vòng tròn mảnh (tâm vòng = tâm khung nhìn)
     750–1050 giữ nguyên vòng làm bát chữ b, nét dọc mọc từ đáy lên
     1050–1400 BAKHI hiện từ mờ → nét
     1400–1650 “nền tảng học tập” hiện từ mờ → nét
     1650–1950 giữ nguyên bố cục cuối
     1950–2250 nền tối tan dần, logo đứng thêm một nhịp rồi tan theo

   Nguyên tắc:
   - Không keyframe CSS, không thư viện. Mọi chuyển động là WAAPI trên một
     mốc thời gian tuyệt đối, chỉ dùng transform/opacity (riêng nét vẽ dùng
     stroke-dashoffset trong 300 ms).
   - Chỉ một phiên chạy một lần (sessionStorage bakhiIntroSeen.v1).
     ?intro=1 ép chạy, ?intro=0 bỏ qua.
   - Bỏ qua bằng chạm hoặc phím bất kỳ; luôn kết thúc ở trạng thái sạch.
   - prefers-reduced-motion: hiện ngay bố cục cuối, giữ một nhịp rồi mờ.
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

    /* Mốc tuyệt đối (ms) — khớp bảng nhịp của video tham chiếu. */
    var T = {
        ringIn: 0, ringInDur: 150,
        ringGrow: 150, ringGrowDur: 600,
        morph: 750, stemDur: 300,
        word: 1050, wordDur: 350,
        sub: 1400, subDur: 250,
        reveal: 1950, veilOut: 260,
        logoOut: 2040, logoOutDur: 210,
        end: 2280
    };

    var root = D.documentElement;
    var query = '';
    try { query = String(global.location.search || ''); } catch (e) { }

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

    /* ------------------------------------------------------------- dựng DOM ---
       Chữ b: bát là một đường tròn tâm (23,44) bán kính 20; nét dọc nằm trên
       tiếp tuyến trái x=3, chạy từ đáy bát (y=64) lên đỉnh (y=3). Vòng tròn
       ở pha 02 chính là bát này nên pha morph chỉ cần vẽ thêm nét dọc. */
    function build() {
        var overlay = el('div', 'bk-intro');
        overlay.id = 'bkIntro';
        overlay.setAttribute('aria-hidden', 'true');

        var veil = el('div', 'bki-veil');
        var glow = el('div', 'bki-glow');
        var stage = el('div', 'bki-stage');
        var logo = el('div', 'bki-logo');

        var svg = sv('svg', {
            viewBox: '0 0 46 66',
            'class': 'bki-mark',
            focusable: 'false',
            'aria-hidden': 'true'
        });
        var ring = sv('circle', {
            cx: 23, cy: 44, r: 20,
            'class': 'bki-ring',
            'vector-effect': 'non-scaling-stroke'
        });
        var stem = sv('path', {
            d: 'M3 64V3',
            pathLength: 100,
            'class': 'bki-stem'
        });
        svg.appendChild(ring);
        svg.appendChild(stem);

        var word = el('div', 'bki-word', 'BAKHI');
        var sub = el('div', 'bki-sub', 'nền tảng học tập');

        logo.appendChild(svg);
        logo.appendChild(word);
        logo.appendChild(sub);
        stage.appendChild(logo);

        overlay.appendChild(veil);
        overlay.appendChild(glow);
        overlay.appendChild(stage);
        (D.body || root).appendChild(overlay);

        return {
            overlay: overlay, veil: veil, glow: glow, stage: stage, logo: logo,
            mark: svg, ring: ring, stem: stem, word: word, sub: sub,
            closed: false, revealed: false, removed: false,
            revealTimer: 0, hardTimer: 0, onKey: null, onTap: null, anims: []
        };
    }

    /* ------------------------------------------------------------ vòng đời */
    function remove(ctx) {
        if (ctx.removed) return;
        ctx.removed = true;
        ctx.closed = true;
        global.clearTimeout(ctx.revealTimer);
        global.clearTimeout(ctx.hardTimer);
        if (ctx.onKey) D.removeEventListener('keydown', ctx.onKey, true);
        if (ctx.onTap) ctx.overlay.removeEventListener('pointerdown', ctx.onTap);
        if (ctx.overlay.parentNode) ctx.overlay.parentNode.removeChild(ctx.overlay);
    }

    /* Lộ trang chủ: nền tối tan trước, logo đứng thêm một nhịp rồi tan theo.
       Nếu index.html còn khoá khởi động (đang xác định phiên), giữ logo yên
       tối đa 900 ms thay vì lộ splash trắng. */
    function reveal(ctx, fast) {
        if (ctx.closed || ctx.revealed) return;
        ctx.revealed = true;
        global.clearTimeout(ctx.revealTimer);

        var veilDur = fast ? 150 : T.veilOut;
        var logoDelay = fast ? 10 : (T.logoOut - T.reveal);
        var logoDur = fast ? 150 : T.logoOutDur;

        function go() {
            if (ctx.closed) return;
            anim(ctx, ctx.veil, [{ opacity: 1 }, { opacity: 0 }],
                { duration: veilDur, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
            anim(ctx, ctx.glow, [{ opacity: .9 }, { opacity: 0 }],
                { duration: logoDur, delay: logoDelay, easing: 'linear', fill: 'forwards' });
            anim(ctx, ctx.logo, [{ opacity: 1 }, { opacity: 0 }],
                { duration: logoDur, delay: logoDelay, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
            global.setTimeout(function () { remove(ctx); }, Math.max(veilDur, logoDelay + logoDur) + 50);
        }

        if (!fast && root.classList.contains('bk-boot-lock') && global.MutationObserver) {
            var obs = new global.MutationObserver(function () {
                if (root.classList.contains('bk-boot-lock')) return;
                obs.disconnect();
                go();
            });
            obs.observe(root, { attributes: true, attributeFilter: ['class'] });
            global.setTimeout(function () { obs.disconnect(); go(); }, 900);
            return;
        }
        go();
    }

    function skip(ctx) {
        if (ctx.closed) return;
        for (var i = 0; i < ctx.anims.length; i++) {
            try { ctx.anims[i].finish(); } catch (e) { }
        }
        reveal(ctx, true);
    }

    /* --------------------------------------------------------- chuyển động */
    function anim(ctx, node, frames, opts) {
        if (!node || !node.animate) return null;
        var a = node.animate(frames, opts);
        ctx.anims.push(a);
        return a;
    }

    function playFull(ctx) {
        if (ctx.closed) return;

        /* 0–150: chấm hồng ở đúng tâm. Vòng thu về 2% nên chỉ còn một điểm
           ~3 px, viền không co giãn nhờ vector-effect. */
        anim(ctx, ctx.ring, [{ opacity: 0 }, { opacity: 1 }],
            { duration: T.ringInDur, easing: 'linear', fill: 'both' });
        anim(ctx, ctx.ring, [{ transform: 'scale(.02)' }, { transform: 'scale(1)' }],
            { duration: T.ringGrowDur, delay: T.ringGrow, easing: 'cubic-bezier(.16,.84,.25,1)', fill: 'both' });

        /* Quầng hồng đậm dần khi vòng nở. */
        anim(ctx, ctx.glow, [
            { opacity: .55, transform: 'translate(-50%,-50%) scale(.92)' },
            { opacity: .9, transform: 'translate(-50%,-50%) scale(1.05)' }
        ], { duration: 620, delay: 130, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });

        /* 750–1050: nét dọc mọc từ đáy bát lên đỉnh, hoàn tất chữ b. */
        anim(ctx, ctx.stem, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }],
            { duration: T.stemDur, delay: T.morph, easing: 'cubic-bezier(.33,.06,.18,1)', fill: 'both' });

        /* 1050–1400: BAKHI từ mờ → nét, không chạy từng chữ. */
        anim(ctx, ctx.word, [
            { opacity: 0, transform: 'translateY(4px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ], { duration: T.wordDur, delay: T.word, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'both' });

        /* 1400–1650: phụ đề Việt từ mờ → nét. */
        anim(ctx, ctx.sub, [
            { opacity: 0, transform: 'translateY(3px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ], { duration: T.subDur, delay: T.sub, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'both' });

        ctx.revealTimer = global.setTimeout(function () { reveal(ctx); }, T.reveal);
        ctx.hardTimer = global.setTimeout(function () { remove(ctx); }, 4200);
    }

    /* Giảm chuyển động: bố cục cuối hiện ngay, không nở, không trượt. */
    function playReduced(ctx) {
        ctx.overlay.classList.add('bki-static');
        ctx.revealTimer = global.setTimeout(function () { reveal(ctx); }, 1200);
        ctx.hardTimer = global.setTimeout(function () { remove(ctx); }, 2600);
    }

    /* ------------------------------------------------------------------ API */
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
        else playFull(ctx);

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
