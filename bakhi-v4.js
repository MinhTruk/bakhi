/* =========================================================================
   bakhi-v4.js — Lớp tính năng V4 của trang chủ (tách ra từ index.html)
   ---------------------------------------------------------------------
   Nội dung:
     1. CSS V4 (design tokens, aurora, spotlight, tilt, shimmer, reveal,
        ripple, micro-interaction, style Developer Toolkit) — tự inject
        thành <style id="bk-v4-css">, không cần sửa <head>.
     2. V4-A Animation Engine  -> window.__anim, window.__tokens, window.__v4ui
     3. V4-B Animation Studio  -> window.__studio, effect presets, theme tokens
     4. V4-C Developer Toolkit -> audit/debug/adv/insp/perf, help, palette
   ---------------------------------------------------------------------
   Cách dùng: đặt ngay trước </body>, SAU các script inline của trang
   (cần có sẵn __fx, __bkt, __fav, DX, showToast, switchDevTab...):

       <script src="bakhi-v4.js"></script>

   Không có file này thì trang vẫn chạy như bản cũ (chỉ thiếu phần V4).
   ========================================================================= */
(function () {
    'use strict';
    var CSS = "        .dv-tab { flex: 0 0 auto; min-width: 6.75rem; padding: .7rem 1.15rem; font-size: .78rem; font-weight: 600; border-bottom: 2px solid transparent; opacity: .65; cursor: pointer; transition: all .2s; text-align: center; white-space: nowrap; -webkit-tap-highlight-color: transparent; }\n        .dv-tab.on { border-color: #6366f1; color: #6366f1; opacity: 1; }\n        .dv-tabbar { flex-shrink: 0; min-height: 3.3rem; align-items: stretch; scrollbar-width: thin; }\n        .dv-tabbar::-webkit-scrollbar { height: 6px; }\n        .dv-tabbar::-webkit-scrollbar-thumb { background: rgba(100,116,139,.45); border-radius: 999px; }\n\n        /* ===================== Bakhi V4: Design Tokens ===================== */\n        :root {\n            --bk-primary: #6366f1; --bk-secondary: #a855f7; --bk-accent: #0ea5e9;\n            --bk-radius: 12px; --bk-shadow: 1; --bk-bg-opacity: .55; --bk-blur: 14px; --bk-font-scale: 1;\n            --bk-anim-speed: 1; --bk-anim-intensity: 1; --bk-aur-speed: 1;\n            --bk-spot-r: 260px; --bk-spot-a: .30; --bk-spot-rgb: 129,140,248;\n            --bk-rip-rgb: 165,180,252; --bk-rip-a: .35;\n            --bk-aur-1: #6366f1; --bk-aur-2: #a855f7; --bk-aur-3: #0ea5e9;\n            --bk-shim-dur: 6s; --bk-shim-a: .45;\n            --bk-mx: 50vw; --bk-my: 50vh;\n        }\n        .logo-glow { background: linear-gradient(135deg, var(--bk-primary), var(--bk-secondary)) !important; }\n        .title-shine { background-image: linear-gradient(90deg, var(--bk-primary), var(--bk-secondary), var(--bk-accent), var(--bk-primary)); }\n        html.dark .title-shine { background-image: linear-gradient(90deg, #fff, #a5b4fc, #c4b5fd, #fff); }\n        .fc-inner a { border-radius: var(--bk-radius); box-shadow: 0 calc(2px * var(--bk-shadow)) calc(10px * var(--bk-shadow)) rgba(15, 23, 42, calc(.16 * var(--bk-shadow))); }\n        .dv-btn { background: var(--bk-primary); border-radius: calc(var(--bk-radius) * .65); }\n        .dv-tab.on { color: var(--bk-primary); border-color: var(--bk-primary); }\n        .fx-fab { background: linear-gradient(135deg, var(--bk-primary), var(--bk-secondary)); }\n        .hl-card { box-shadow: 0 0 0 1px var(--bk-primary), 0 0 16px rgba(99, 102, 241, calc(.30 * var(--bk-shadow))); }\n\n        /* ===================== Animation master switch ===================== */\n        html.bk-anim-off *, html.bk-anim-off *::before, html.bk-anim-off *::after { animation: none !important; transition: none !important; }\n        html.bk-anim-off #bkt { display: none !important; }\n\n        /* ===================== Aurora ===================== */\n        #bkAurora { position: fixed; inset: -25vmax; z-index: 0; pointer-events: none; opacity: 0; overflow: hidden;\n            transition: opacity .9s ease; filter: blur(calc(var(--bk-blur) * 1.5)); }\n        #bkAurora.off { display: none; }\n        #bkAurora > div { position: absolute; inset: 0; mix-blend-mode: screen; opacity: calc(.55 * var(--bk-anim-intensity));\n            animation-name: bkAuroraDrift; animation-timing-function: ease-in-out; animation-iteration-count: infinite; animation-direction: alternate;\n            animation-duration: calc(30s / var(--bk-anim-speed) / var(--bk-aur-speed)); will-change: transform; }\n        #bkAurora .a1 { background: radial-gradient(45vmax 45vmax at 30% 35%, color-mix(in srgb, var(--bk-aur-1) 62%, transparent), transparent 62%); }\n        #bkAurora .a2 { animation-delay: -9s; animation-duration: calc(38s / var(--bk-anim-speed) / var(--bk-aur-speed));\n            background: radial-gradient(42vmax 42vmax at 72% 60%, color-mix(in srgb, var(--bk-aur-2) 55%, transparent), transparent 62%),\n                        radial-gradient(38vmax 38vmax at 45% 80%, color-mix(in srgb, var(--bk-aur-3) 50%, transparent), transparent 65%); }\n        @keyframes bkAuroraDrift {\n            0% { transform: translate3d(-3%, -2%, 0) scale(1) rotate(0deg); }\n            50% { transform: translate3d(4%, 3%, 0) scale(1.12) rotate(4deg); }\n            100% { transform: translate3d(-2%, 5%, 0) scale(1.06) rotate(-3deg); }\n        }\n        html:not(.dark) #bkAurora { opacity: .5; }\n\n        /* ===================== Cursor spotlight ===================== */\n        #bkSpot { position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: 0; transition: opacity .5s ease;\n            background: radial-gradient(circle var(--bk-spot-r) at var(--bk-mx) var(--bk-my), rgba(var(--bk-spot-rgb), var(--bk-spot-a)), transparent 72%); }\n        #bkSpot.on { opacity: 1; }\n\n        /* ===================== Card tilt / magnetic / shimmer ===================== */\n        .bk-tilt { position: relative; transform-style: preserve-3d; will-change: transform; }\n        .bk-tilt::before { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; opacity: 0;\n            transition: opacity .25s; mix-blend-mode: overlay; z-index: 1;\n            background: radial-gradient(220px circle at var(--bk-gx, 50%) var(--bk-gy, 50%), rgba(255, 255, 255, .55), transparent 62%); }\n        .bk-tilt:hover::before { opacity: calc(.9 * var(--bk-tilt-glare, 1)); }\n        .bk-magnet { transition: transform .22s cubic-bezier(.34, 1.56, .64, 1); }\n        .bk-shimmer { position: relative; overflow: hidden; isolation: isolate; }\n        .bk-shimmer::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2;\n            background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, var(--bk-shim-a)) 50%, transparent 65%);\n            transform: translateX(-120%); animation: bkShim calc(var(--bk-shim-dur) / var(--bk-anim-speed)) linear infinite; }\n        @keyframes bkShim { to { transform: translateX(120%); } }\n\n        /* ===================== Scroll reveal ===================== */\n        .bk-reveal { opacity: 0; animation: none !important; transform: translateY(var(--bk-rev-d, 22px));\n            transition: opacity .55s ease, transform .55s cubic-bezier(.2, .7, .2, 1), filter .55s ease; transition-delay: var(--bk-rev-delay, 0ms); }\n        .bk-reveal.rv-zoom { transform: scale(.94); }\n        .bk-reveal.rv-blur { filter: blur(8px); }\n        .bk-reveal.rv-slide { transform: translateX(calc(var(--bk-rev-d, 22px) * -1)); }\n        .bk-reveal.rv-in { opacity: 1; transform: none; filter: none; }\n\n        /* ===================== Click ripple / micro ===================== */\n        .bk-ripple { position: fixed; z-index: 9999; pointer-events: none; border-radius: 50%;\n            transform: translate(-50%, -50%) scale(0); background: rgba(var(--bk-rip-rgb), var(--bk-rip-a)); animation: bkRip .62s ease-out forwards; }\n        @keyframes bkRip { to { transform: translate(-50%, -50%) scale(1); opacity: 0; } }\n        body.bk-micro button:not(:disabled):active, body.bk-micro .fc-inner a:active { transform: scale(.96); }\n        body.bk-micro .folder-header:hover .folder-ico { transform: scale(1.18) rotate(-8deg); }\n\n        /* ===================== Developer Toolkit v4 ===================== */\n        #dev-panel-modal > div { max-height: 92vh; }\n        .bk-group { border: 1px solid rgba(100, 116, 139, .22); border-radius: 12px; margin: 10px 0; background: rgba(100, 116, 139, .07); overflow: hidden; }\n        .bk-group > summary { cursor: pointer; padding: 8px 12px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; list-style: none; user-select: none; }\n        .bk-group > summary::-webkit-details-marker { display: none; }\n        .bk-group > summary::after { content: '\\f078'; font-family: 'Font Awesome 6 Free'; font-weight: 900; margin-left: auto; font-size: 9px; opacity: .6; transition: transform .2s; }\n        .bk-group[open] > summary::after { transform: rotate(180deg); }\n        .bk-group-body { padding: 4px 12px 10px; }\n        .bk-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 4px 12px; }\n        .bk-note { font-size: 10px; opacity: .68; line-height: 1.55; margin-top: 6px; }\n        .bk-tool-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }\n        .bk-out { font: 11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; max-height: 190px; overflow: auto; padding: 6px 8px; border-radius: 8px; background: rgba(2, 6, 23, .06); white-space: pre-wrap; word-break: break-word; }\n        html.dark .bk-out { background: rgba(2, 6, 23, .5); }\n        .bk-out .ok { color: #10b981; } .bk-out .err { color: #f43f5e; } .bk-out .warn { color: #f59e0b; }\n        .bk-row { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 3px 0; border-bottom: 1px solid rgba(100, 116, 139, .13); }\n        .bk-row .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n        .bk-stat { display: inline-flex; gap: 4px; align-items: center; font: 600 10px ui-monospace, monospace; padding: 2px 6px; border-radius: 6px; background: rgba(99, 102, 241, .15); color: var(--bk-primary); }\n        #bkStage { height: 120px; display: grid; place-items: center; border-radius: 12px; overflow: hidden;\n            background: repeating-conic-gradient(rgba(100, 116, 139, .13) 0 25%, transparent 0 50%) 0 0 / 18px 18px; }\n        #bkStageBox { width: 64px; height: 64px; border-radius: 12px; background: linear-gradient(135deg, var(--bk-primary), var(--bk-secondary)); box-shadow: 0 6px 18px -6px rgba(99, 102, 241, .7); }\n        #bkTimeline { position: relative; height: 34px; border-radius: 8px; background: rgba(100, 116, 139, .14); overflow: hidden; margin-top: 8px; }\n        #bkTlFill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, rgba(99, 102, 241, .55), rgba(168, 85, 247, .55)); }\n        .bk-tl-mark { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(148, 163, 184, .75); }\n        .bk-tl-mark span { position: absolute; top: 2px; left: 3px; font: 9px ui-monospace, monospace; opacity: .8; white-space: nowrap; }\n        .bk-run { display: flex; align-items: center; gap: 4px; font-size: 11px; padding: 4px 0; border-bottom: 1px solid rgba(100, 116, 139, .15); }\n        .bk-run .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n        .bk-token-row { display: grid; grid-template-columns: minmax(0, 1fr) 92px 76px auto; gap: 6px; align-items: center; font-size: 11px; padding: 3px 0; }\n        .bk-token-row input[type=text] { min-width: 0; width: 100%; }\n        .bk-swatch { width: 26px; height: 26px; border-radius: 6px; border: 1px solid rgba(100, 116, 139, .4); padding: 0; background: none; cursor: pointer; }\n        .bk-kbd { display: inline-block; font: 600 10px ui-monospace, monospace; padding: 1px 5px; border-radius: 5px; background: rgba(100, 116, 139, .22); }\n        .bk-help-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(100, 116, 139, .15); font-size: 11px; }\n        .bk-sysbar { font: 600 10px ui-monospace, monospace; padding: 5px 12px; border-top: 1px solid rgba(100, 116, 139, .25); display: flex; flex-wrap: wrap; gap: 10px; align-items: center; opacity: .85; }\n        .bk-cmd-group { padding: 6px 12px 2px; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; opacity: .55; }\n        .bk-cmd { display: flex; width: 100%; align-items: center; gap: 8px; text-align: left; padding: 7px 12px; font-size: 12px; cursor: pointer; }\n        .bk-cmd:hover, .bk-cmd.on { background: rgba(99, 102, 241, .16); }\n        .bk-cmd kbd { margin-left: auto; font: 600 10px ui-monospace, monospace; opacity: .65; }\n        html.lite #bkAurora { display: none; }\n        @media (max-width: 640px) { .bk-token-row { grid-template-columns: minmax(0, 1fr) 80px auto; } }\n        @media (prefers-reduced-motion: reduce) { .bk-shimmer::after { animation: none; } }\n    ";
    function inject() {
        if (document.getElementById('bk-v4-css')) return;
        var st = document.createElement('style');
        st.id = 'bk-v4-css';
        st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    }
    inject();

    /* Gắn class .dv-tabbar cho thanh tab Developer để CSS (min-height, flex-shrink: 0)
       áp dụng dù index.html không phải sửa markup. */
    function markTabbar() {
        var first = document.querySelector('#dev-panel-modal .dv-tab');
        var bar = first && first.parentElement;
        if (bar && !bar.classList.contains('dv-tabbar')) bar.classList.add('dv-tabbar');
    }
    markTabbar();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markTabbar);
})();

/* =========================================================================
   Bakhi V4-A — Animation Engine, Design Tokens & shared UI helpers
   Không thay thế hệ thống cũ: chỉ mở rộng __fx / __bkt / __fav / DX.
   ========================================================================= */
(function () {
    'use strict';
    var D = document, R = D.documentElement, B = D.body;
    var $ = function (id) { return D.getElementById(id); };
    var rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var hasIO = 'IntersectionObserver' in window;

    /* ---------- helpers ---------- */
    function mk(tag, cls, txt) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }
    function clamp(v, a, b) { v = Number(v); return isFinite(v) ? Math.min(b, Math.max(a, v)) : a; }
    function toast(m, t) { try { showToast(m, t || 'success'); } catch (e) { console.log('[bakhi] ' + m); } }
    function store(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); return true; }
        catch (e) { toast('Không lưu được ' + k + ' (bộ nhớ đầy?)', 'error'); return false; }
    }
    function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function liteMode() { return R.classList.contains('lite'); }
    function hexToRgb(h) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h).trim());
        if (!m) return { r: 129, g: 140, b: 248 };
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    }
    function isHex(v) { return /^#[0-9a-f]{6}$/i.test(String(v)); }

    /* ---------- shared UI kit ---------- */
    var ui = {
        mk: mk,
        toast: toast,
        btn: function (label, fn, opts) {
            opts = opts || {};
            var b = mk('button', 'dv-btn' + (opts.alt ? ' alt' : ''), label);
            b.type = 'button';
            if (opts.title) b.title = opts.title;
            if (opts.icon) {
                var i = mk('i', 'fa-solid ' + opts.icon);
                i.style.marginRight = '5px';
                b.insertBefore(i, b.firstChild);
            }
            b.addEventListener('click', fn);
            return b;
        },
        group: function (parent, title, icon, open) {
            var d = mk('details', 'bk-group');
            if (open) d.open = true;
            var s = mk('summary');
            var i = mk('i', 'fa-solid ' + (icon || 'fa-layer-group'));
            i.style.opacity = '.8';
            s.appendChild(i);
            s.appendChild(D.createTextNode(title));
            var b = mk('div', 'bk-group-body');
            d.appendChild(s); d.appendChild(b);
            parent.appendChild(d);
            return b;
        },
        row: function (parent, label, control) {
            var r = mk('label', 'dv-row');
            r.appendChild(mk('span', null, label));
            r.appendChild(control);
            parent.appendChild(r);
            return r;
        },
        check: function (parent, label, value, onChange, extra) {
            var i = mk('input', 'accent-indigo-600');
            i.type = 'checkbox'; i.style.width = '1rem'; i.style.height = '1rem';
            i.checked = !!value;
            i.addEventListener('change', function () { onChange(i.checked); });
            var r = ui.row(parent, label, i);
            if (extra) extra(r, i);
            return i;
        },
        range: function (parent, label, value, min, max, step, onChange) {
            var wrap = mk('span', 'flex items-center gap-2');
            var out = mk('b', null, String(value));
            var i = mk('input', 'accent-indigo-600');
            i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
            i.style.width = '8.5rem';
            i.addEventListener('input', function () { out.textContent = i.value; onChange(Number(i.value)); });
            wrap.appendChild(i); wrap.appendChild(out);
            ui.row(parent, label, wrap);
            return i;
        },
        select: function (parent, label, options, value, onChange) {
            var s = mk('select', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs');
            options.forEach(function (o) {
                var op = mk('option', null, o[1]); op.value = o[0]; s.appendChild(op);
            });
            s.value = value;
            s.addEventListener('change', function () { onChange(s.value); });
            ui.row(parent, label, s);
            return s;
        },
        text: function (placeholder, value, cls) {
            var i = mk('input', cls || 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs');
            i.type = 'text'; i.placeholder = placeholder || ''; i.value = value == null ? '' : value;
            return i;
        },
        out: function (parent, id) { var o = mk('div', 'bk-out'); if (id) o.id = id; parent.appendChild(o); return o; },
        note: function (parent, txt) { parent.appendChild(mk('div', 'bk-note', txt)); },
        line: function (box, kind, txt) {
            var d = mk('div', kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : kind === 'warn' ? 'warn' : '', txt);
            box.appendChild(d);
            return d;
        },
        copy: function (txt, msg) {
            try {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(txt).then(function () { toast(msg || 'Đã copy', 'success'); },
                        function () { toast('Không copy được', 'error'); });
                } else { toast('Trình duyệt không hỗ trợ clipboard', 'error'); }
            } catch (e) { toast('Không copy được', 'error'); }
        }
    };

    window.__v4ui = ui;

    /* ---------- animation config ---------- */
    var A_DEF = {
        on: true, speed: 1, intensity: 1,
        aurora: { on: false, intensity: .8, speed: 1, c1: '#6366f1', c2: '#a855f7', c3: '#0ea5e9' },
        spotlight: { on: false, radius: 260, strength: .30, color: '#818cf8' },
        tilt: { on: false, max: 8, glare: true },
        magnetic: { on: false, strength: .22, max: 6 },
        shimmer: { on: false, speed: 1, strength: .45 },
        reveal: { on: false, type: 'fade', stagger: true, distance: 22 },
        ripple: { on: false, size: 120, color: '#a5b4fc', alpha: .35 },
        micro: { on: true },
        particles: 1
    };
    function deepMerge(base, inc) {
        var out = JSON.parse(JSON.stringify(base));
        if (!inc || typeof inc !== 'object' || Array.isArray(inc)) return out;
        Object.keys(out).forEach(function (k) {
            if (!(k in inc)) return;
            var b = out[k], v = inc[k];
            if (typeof b === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
            else if (typeof b === 'number') { if (typeof v === 'number' && isFinite(v)) out[k] = v; }
            else if (typeof b === 'string') { if (typeof v === 'string' && v.length <= 40) out[k] = v; }
            else if (b && typeof b === 'object') out[k] = deepMerge(b, v);
        });
        return out;
    }
    function sanitize(a) {
        a.speed = clamp(a.speed, .25, 3);
        a.intensity = clamp(a.intensity, .2, 2);
        a.particles = clamp(a.particles, .2, 2);
        a.aurora.intensity = clamp(a.aurora.intensity, .1, 1);
        a.aurora.speed = clamp(a.aurora.speed, .2, 3);
        ['c1', 'c2', 'c3'].forEach(function (k) { if (!isHex(a.aurora[k])) a.aurora[k] = A_DEF.aurora[k]; });
        a.spotlight.radius = clamp(a.spotlight.radius, 80, 600);
        a.spotlight.strength = clamp(a.spotlight.strength, .05, .8);
        if (!isHex(a.spotlight.color)) a.spotlight.color = A_DEF.spotlight.color;
        a.tilt.max = clamp(a.tilt.max, 0, 20);
        a.magnetic.strength = clamp(a.magnetic.strength, 0, .6);
        a.magnetic.max = clamp(a.magnetic.max, 0, 16);
        a.shimmer.speed = clamp(a.shimmer.speed, .25, 4);
        a.shimmer.strength = clamp(a.shimmer.strength, .05, 1);
        if (['fade', 'slide', 'zoom', 'blur'].indexOf(a.reveal.type) < 0) a.reveal.type = 'fade';
        a.reveal.distance = clamp(a.reveal.distance, 0, 80);
        a.ripple.size = clamp(a.ripple.size, 40, 400);
        a.ripple.alpha = clamp(a.ripple.alpha, .05, .8);
        if (!isHex(a.ripple.color)) a.ripple.color = A_DEF.ripple.color;
        return a;
    }
    var A = sanitize(deepMerge(A_DEF, read('bakhiAnimCfg', {})));

    function save() { return store('bakhiAnimCfg', A); }
    function active() { return A.on && !rmq.matches; }

    /* ---------- effect layers ---------- */
    var aur = null, spot = null;
    function ensureLayers() {
        if (!aur) {
            aur = mk('div'); aur.id = 'bkAurora'; aur.setAttribute('aria-hidden', 'true');
            aur.appendChild(mk('div', 'a1')); aur.appendChild(mk('div', 'a2'));
            B.appendChild(aur);
        }
        if (!spot) {
            spot = mk('div'); spot.id = 'bkSpot'; spot.setAttribute('aria-hidden', 'true');
            B.appendChild(spot);
        }
    }

    var tiltEl = null, tiltPt = null, tiltRaf = 0, magEl = null;
    function resetTilt() {
        if (tiltEl) { tiltEl.style.transform = ''; tiltEl.style.removeProperty('--bk-gx'); tiltEl.style.removeProperty('--bk-gy'); }
        tiltEl = null; tiltPt = null;
    }
    function paintTilt() {
        tiltRaf = 0;
        if (!tiltEl || !tiltEl.isConnected || !tiltPt) return;
        var r = tiltEl.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var px = clamp((tiltPt.x - r.left) / r.width, 0, 1), py = clamp((tiltPt.y - r.top) / r.height, 0, 1);
        var m = A.tilt.max;
        tiltEl.style.transform = 'perspective(760px) rotateX(' + ((.5 - py) * m * 2).toFixed(2) + 'deg) rotateY(' +
            ((px - .5) * m * 2).toFixed(2) + 'deg) translateY(-2px)';
        tiltEl.style.setProperty('--bk-gx', (px * 100).toFixed(1) + '%');
        tiltEl.style.setProperty('--bk-gy', (py * 100).toFixed(1) + '%');
        tiltEl.style.setProperty('--bk-tilt-glare', A.tilt.glare ? '1' : '0');
    }
    function resetMag() { if (magEl) { magEl.style.transform = ''; magEl = null; } }

    var spotRaf = 0, spotPt = null;
    var finePointer = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : true;

    D.addEventListener('pointermove', function (e) {
        if (!active()) return;
        /* spotlight */
        if (A.spotlight.on && finePointer) {
            spotPt = e;
            if (!spotRaf) spotRaf = requestAnimationFrame(function () {
                spotRaf = 0;
                if (!spotPt) return;
                R.style.setProperty('--bk-mx', spotPt.clientX + 'px');
                R.style.setProperty('--bk-my', spotPt.clientY + 'px');
            });
        }
        /* tilt */
        if (A.tilt.on && finePointer) {
            var card = e.target && e.target.closest ? e.target.closest('.bk-tilt') : null;
            if (!card) { if (tiltEl) resetTilt(); }
            else { tiltEl = card; tiltPt = e; if (!tiltRaf) tiltRaf = requestAnimationFrame(paintTilt); }
        }
        /* magnetic */
        if (A.magnetic.on && finePointer) {
            var t = e.target && e.target.closest ? e.target.closest('.bk-magnet') : null;
            if (!t) { if (magEl) resetMag(); }
            else {
                var r = t.getBoundingClientRect();
                var dx = clamp((e.clientX - (r.left + r.width / 2)) * A.magnetic.strength, -A.magnetic.max, A.magnetic.max);
                var dy = clamp((e.clientY - (r.top + r.height / 2)) * A.magnetic.strength, -A.magnetic.max, A.magnetic.max);
                if (magEl && magEl !== t) resetMag();
                magEl = t;
                t.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
            }
        }
    }, { passive: true });

    /* ripple */
    D.addEventListener('pointerdown', function (e) {
        if (!active() || !A.ripple.on || rmq.matches) return;
        var t = e.target && e.target.closest ? e.target.closest('button, a, .dv-tab, .folder-header') : null;
        if (!t) return;
        var size = clamp(A.ripple.size, 40, 400);
        var d = mk('span', 'bk-ripple');
        d.style.width = d.style.height = size + 'px';
        d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
        B.appendChild(d);
        var kill = function () { if (d.parentNode) d.remove(); };
        d.addEventListener('animationend', kill);
        setTimeout(kill, 900);
    }, { passive: true });

    /* scroll reveal */
    var io = null;
    var REV_CLASSES = ['bk-reveal', 'rv-in', 'rv-zoom', 'rv-blur', 'rv-slide'];
    function setupReveal(on) {
        var els = D.querySelectorAll('main > *, main .folder-header, #categoriesTree > div > div');
        if (io) { io.disconnect(); io = null; }
        if (!on) {
            Array.prototype.forEach.call(els, function (el) {
                REV_CLASSES.forEach(function (c) { el.classList.remove(c); });
                el.style.removeProperty('--bk-rev-delay');
                el.style.removeProperty('--bk-rev-d');
            });
            return;
        }
        if (!hasIO) return;
        io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('rv-in'); io.unobserve(en.target); }
            });
        }, { threshold: .06, rootMargin: '0px 0px -6% 0px' });
        Array.prototype.forEach.call(els, function (el, i) {
            if (el.id === 'searchResultsSection' || el.closest('#searchResultsSection')) return;
            if (el.closest('#dev-panel-modal, #readme-modal, #highlight-manager-modal')) return;
            el.classList.add('bk-reveal');
            var v = A.reveal.type === 'zoom' ? 'rv-zoom' : A.reveal.type === 'blur' ? 'rv-blur' : A.reveal.type === 'slide' ? 'rv-slide' : '';
            ['rv-zoom', 'rv-blur', 'rv-slide'].forEach(function (c) { if (c !== v) el.classList.remove(c); });
            if (v) el.classList.add(v);
            el.style.setProperty('--bk-rev-d', A.reveal.distance + 'px');
            el.style.setProperty('--bk-rev-delay', (A.reveal.stagger ? Math.min(i, 6) * 70 : 0) + 'ms');
            io.observe(el);
        });
    }

    function decor() {
        var off = !active() || liteMode();
        Array.prototype.forEach.call(D.querySelectorAll('.fc-inner a'), function (c) {
            c.classList.toggle('bk-tilt', !off && A.tilt.on);
            c.classList.toggle('bk-shimmer', !off && A.shimmer.on);
            if (off || !A.tilt.on) {
                c.style.transform = '';
                c.style.removeProperty('--bk-gx'); c.style.removeProperty('--bk-gy');
            }
        });
        Array.prototype.forEach.call(D.querySelectorAll('.hdr-btn, .dv-btn, .dv-tab, .bgm-mini'), function (c) {
            c.classList.toggle('bk-magnet', !off && A.magnetic.on);
            if (off || !A.magnetic.on) c.style.transform = '';
        });
        if (off || !A.tilt.on) resetTilt();
        if (off || !A.magnetic.on) resetMag();
    }

    function apply() {
        R.classList.toggle('bk-anim-off', !A.on);
        B.classList.toggle('bk-micro', !!A.micro.on && A.on);
        R.style.setProperty('--bk-anim-speed', String(A.speed));
        R.style.setProperty('--bk-anim-intensity', String(A.intensity));

        ensureLayers();

        var aOn = A.aurora.on && active() && !liteMode();
        aur.classList.toggle('off', !aOn);
        aur.style.opacity = aOn ? String(clamp(.92 * A.aurora.intensity * A.intensity, 0, 1)) : '0';
        R.style.setProperty('--bk-aur-1', A.aurora.c1);
        R.style.setProperty('--bk-aur-2', A.aurora.c2);
        R.style.setProperty('--bk-aur-3', A.aurora.c3);
        R.style.setProperty('--bk-aur-speed', String(A.aurora.speed));

        var sOn = A.spotlight.on && active() && finePointer && !liteMode();
        spot.classList.toggle('on', sOn);
        var sc = hexToRgb(A.spotlight.color);
        R.style.setProperty('--bk-spot-rgb', sc.r + ',' + sc.g + ',' + sc.b);
        R.style.setProperty('--bk-spot-r', clamp(A.spotlight.radius, 80, 600) + 'px');
        R.style.setProperty('--bk-spot-a', String(clamp(A.spotlight.strength * A.intensity, 0, .9)));

        var rc = hexToRgb(A.ripple.color);
        R.style.setProperty('--bk-rip-rgb', rc.r + ',' + rc.g + ',' + rc.b);
        R.style.setProperty('--bk-rip-a', String(A.ripple.alpha));

        R.style.setProperty('--bk-shim-dur', (6 / Math.max(.25, A.shimmer.speed)).toFixed(2) + 's');
        R.style.setProperty('--bk-shim-a', String(A.shimmer.strength));

        decor();
        setupReveal(A.reveal.on && active() && !liteMode());

        document.dispatchEvent(new CustomEvent('bakhi:anim', { detail: { cfg: A } }));
    }

    /* ---------- design tokens ---------- */
    var TOK = [
        { k: '--bk-primary', label: 'Primary color', type: 'color' },
        { k: '--bk-secondary', label: 'Secondary color', type: 'color' },
        { k: '--bk-accent', label: 'Accent color', type: 'color' },
        { k: '--bk-radius', label: 'Border radius', type: 'num', min: 0, max: 28, step: 1, unit: 'px' },
        { k: '--bk-shadow', label: 'Shadow intensity', type: 'num', min: 0, max: 2, step: .1, unit: '' },
        { k: '--bk-bg-opacity', label: 'Background opacity', type: 'num', min: 0, max: 1, step: .05, unit: '' },
        { k: '--bk-blur', label: 'Blur strength', type: 'num', min: 0, max: 30, step: 1, unit: 'px' },
        { k: '--bk-font-scale', label: 'Typography scale', type: 'num', min: .8, max: 1.3, step: .05, unit: '' }
    ];
    var TOK_DEF = {};
    TOK.forEach(function (t) { TOK_DEF[t.k] = ''; });
    TOK_DEF['--bk-primary'] = '#6366f1';
    TOK_DEF['--bk-secondary'] = '#a855f7';
    TOK_DEF['--bk-accent'] = '#0ea5e9';
    TOK_DEF['--bk-radius'] = '12px';
    TOK_DEF['--bk-shadow'] = '1';
    TOK_DEF['--bk-bg-opacity'] = '.55';
    TOK_DEF['--bk-blur'] = '14px';
    TOK_DEF['--bk-font-scale'] = '1';

    function tokValid(t) {
        var out = {};
        TOK.forEach(function (d) {
            var v = t && t[d.k];
            if (d.type === 'color') out[d.k] = isHex(v) ? String(v).toLowerCase() : TOK_DEF[d.k];
            else {
                var n = parseFloat(v);
                out[d.k] = isFinite(n) ? clamp(n, d.min, d.max) + (d.unit || '') : TOK_DEF[d.k];
            }
        });
        return out;
    }
    var T = tokValid(read('bakhiThemeTokens', {}));

    function typeScale() {
        try {
            if (typeof uiCfg === 'undefined') return;
            var scale = parseFloat(R.style.getPropertyValue('--bk-font-scale')) || 1;
            R.style.fontSize = Math.round(uiCfg.font * scale) + '%';
        } catch (e) {}
    }
    function tokensApply(t, persist) {
        var v = tokValid(t || T);
        TOK.forEach(function (d) { R.style.setProperty(d.k, v[d.k]); });
        typeScale();
        if (persist) { T = v; store('bakhiThemeTokens', T); }
        return v;
    }
    window.__tokens = {
        def: TOK_DEF, meta: TOK, get: function () { return tokValid(T); },
        apply: function (t) { return tokensApply(t, false); },
        save: function (t) { return tokensApply(t, true); },
        reset: function () { T = tokValid({}); store('bakhiThemeTokens', T); tokensApply(T, false); return T; },
        cssText: function () { var v = tokValid(T); return ':root {\n' + TOK.map(function (d) { return '  ' + d.k + ': ' + v[d.k] + ';'; }).join('\n') + '\n}'; }
    };

    /* ---------- animation library ---------- */
    var LIB = {
        fadeIn: { label: 'Fade In', kf: [{ opacity: 0 }, { opacity: 1 }] },
        fadeOut: { label: 'Fade Out', kf: [{ opacity: 1 }, { opacity: 0 }] },
        slideUp: { label: 'Slide Up', kf: [{ transform: 'translateY(32px)', opacity: 0 }, { transform: 'none', opacity: 1 }] },
        slideDown: { label: 'Slide Down', kf: [{ transform: 'translateY(-32px)', opacity: 0 }, { transform: 'none', opacity: 1 }] },
        slideLeft: { label: 'Slide Left', kf: [{ transform: 'translateX(32px)', opacity: 0 }, { transform: 'none', opacity: 1 }] },
        slideRight: { label: 'Slide Right', kf: [{ transform: 'translateX(-32px)', opacity: 0 }, { transform: 'none', opacity: 1 }] },
        zoomIn: { label: 'Zoom In', kf: [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }] },
        zoomOut: { label: 'Zoom Out', kf: [{ transform: 'scale(1.4)', opacity: 1 }, { transform: 'none', opacity: 0 }] },
        bounce: { label: 'Bounce', kf: [{ transform: 'translateY(0)' }, { transform: 'translateY(-24px)' }, { transform: 'translateY(0)' }] },
        elastic: { label: 'Elastic', kf: [{ transform: 'scale(.4)' }, { transform: 'scale(1.14)' }, { transform: 'scale(.95)' }, { transform: 'scale(1.03)' }, { transform: 'none' }] },
        blurIn: { label: 'Blur In', kf: [{ filter: 'blur(12px)', opacity: 0 }, { filter: 'blur(0px)', opacity: 1 }] },
        rotate: { label: 'Rotate', kf: [{ transform: 'rotate(-180deg)', opacity: 0 }, { transform: 'none', opacity: 1 }] },
        flip: { label: 'Flip', kf: [{ transform: 'perspective(700px) rotateY(90deg)' }, { transform: 'perspective(700px) rotateY(0deg)' }] },
        swing: { label: 'Swing', kf: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(14deg)' }, { transform: 'rotate(-10deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(0deg)' }] },
        shake: { label: 'Shake', kf: [{ transform: 'translateX(0)' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(9px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' }] },
        pulse: { label: 'Pulse', kf: [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }] },
        rubberBand: { label: 'Rubber Band', kf: [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.22, .78)' }, { transform: 'scale(.86, 1.16)' }, { transform: 'scale(1.06, .94)' }, { transform: 'scale(1, 1)' }] },
        custom: { label: 'Custom', custom: true, kf: [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }] }
    };
    function kebab(p) { return p.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }); }
    function kfCss(kf) {
        var n = kf.length;
        return kf.map(function (f, i) {
            var pct = n > 1 ? Math.round(i / (n - 1) * 100) : 100;
            var decl = Object.keys(f).map(function (p) { return kebab(p) + ': ' + f[p] + ';'; }).join(' ');
            return '  ' + pct + '% { ' + decl + ' }';
        }).join('\n');
    }
    function parseDecl(txt) {
        var o = {};
        String(txt || '').split(';').forEach(function (part) {
            var i = part.indexOf(':');
            if (i < 0) return;
            var k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
            if (!k || !v || k.length > 40 || v.length > 120) return;
            o[k.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); })] = v;
        });
        return o;
    }

    /* ---------- keep the old globals in sync (no rewrite of the old systems) ---------- */
    var _renderTree = window.renderSubjectsTree;
    if (typeof _renderTree === 'function') {
        window.renderSubjectsTree = function () {
            var r = _renderTree.apply(this, arguments);
            try { decor(); if (A.reveal.on) setupReveal(active() && !liteMode()); } catch (e) {}
            return r;
        };
    }
    var _applyUi = window.applyUi;
    if (typeof _applyUi === 'function') {
        window.applyUi = function () { var r = _applyUi.apply(this, arguments); typeScale(); return r; };
    }

    /* pause decorative effects while the tab is hidden */
    D.addEventListener('visibilitychange', function () {
        if (D.hidden) { if (io) io.disconnect(); }
        else { if (A.reveal.on) setupReveal(active() && !liteMode()); }
    });

    window.__anim = {
        cfg: A, DEF: A_DEF, save: save, apply: apply, decor: decor, active: active,
        sanitize: sanitize, merge: deepMerge, lib: LIB, kfCss: kfCss, parseDecl: parseDecl, kebab: kebab,
        reset: function () {
            var def = sanitize(deepMerge(A_DEF, {}));
            Object.keys(A).forEach(function (k) { delete A[k]; });
            Object.assign(A, def);
            save(); apply();
        },
        set: function (path, val) {
            var p = path.split('.'), o = A;
            for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
            o[p[p.length - 1]] = val;
            sanitize(A); return save();
        }
    };

    /* ---------- init ---------- */
    tokensApply(T, false);
    apply();
    window.addEventListener('load', function () { decor(); }, { once: true });
    if (rmq.addEventListener) rmq.addEventListener('change', apply);
    else if (rmq.addListener) rmq.addListener(apply);
})();
/* =========================================================================
   Bakhi V4-B — Animation Studio, Effect presets, Tokens editor, Studio tools
   ========================================================================= */
(function () {
    'use strict';
    var U = window.__v4ui, AN = window.__anim;
    if (!U || !AN) return;
    var D = document, $ = function (id) { return D.getElementById(id); }, qs = function (s, r) { return (r || D).querySelector(s); };
    var mk = U.mk, btn = U.btn, group = U.group, note = U.note, out = U.out, line = U.line, toast = U.toast || function () {}, copy = U.copy;
    var A = AN.cfg, LIB = AN.lib;

    function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Không lưu được ' + k + ' (bộ nhớ đầy?)', 'error'); return false; } }
    function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function mergeInto(t, s) {
        Object.keys(s).forEach(function (k) {
            if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') mergeInto(t[k], s[k]);
            else t[k] = s[k];
        });
    }
    var STUDIO = Object.assign({ css: '', snQ: '', type: 'fadeIn', duration: 700, delay: 0, easing: 'ease-out', iterations: 1, direction: 'normal', fill: 'both', rate: 1, customFrom: 'opacity: 0; transform: translateY(24px);', customTo: 'opacity: 1; transform: none;' },
        read('bakhiStudioCfg', {}));
    function saveStudio() { store('bakhiStudioCfg', STUDIO); }

    /* =====================================================================
       1. Hiệu ứng — master switch + preset
       ===================================================================== */
    var fxPane = qs('[data-pane="fx"]');
    var PRESETS = {
        minimal: {
            label: 'Minimal', desc: 'Tối giản, ít chuyển động',
            anim: { on: true, speed: 1, intensity: .5, aurora: { on: false }, spotlight: { on: false }, tilt: { on: false }, magnetic: { on: false }, shimmer: { on: false }, reveal: { on: false }, ripple: { on: false }, micro: { on: true } },
            fx: { stars: true, shooters: false, nebula: false, density: .5, freq: 2, quality: 'auto', speed: .8, tapSpark: false }
        },
        smooth: {
            label: 'Smooth', desc: 'Animation nhẹ nhàng',
            anim: { on: true, speed: .9, intensity: .7, aurora: { on: false }, spotlight: { on: false }, tilt: { on: false }, magnetic: { on: true, strength: .15, max: 4 }, shimmer: { on: false }, reveal: { on: true, type: 'fade', stagger: true, distance: 18 }, ripple: { on: false }, micro: { on: true } },
            fx: { stars: true, shooters: true, nebula: true, density: .8, freq: 4, quality: 'auto', speed: .9, tapSpark: true }
        },
        cyber: {
            label: 'Cyber', desc: 'Neon, glow, particle',
            anim: { on: true, speed: 1.15, intensity: 1.1, aurora: { on: false }, spotlight: { on: true, strength: .38, radius: 300 }, tilt: { on: false }, magnetic: { on: false }, shimmer: { on: true, speed: 1.4, strength: .5 }, reveal: { on: true, type: 'slide', stagger: true, distance: 26 }, ripple: { on: true, alpha: .4 }, micro: { on: true } },
            fx: { stars: true, shooters: true, nebula: true, density: 1.3, freq: 8, quality: 'high', speed: 1.2, tapSpark: true, palette: 0 }
        },
        aurora: {
            label: 'Aurora', desc: 'Nền cực quang chuyển động',
            anim: { on: true, speed: 1, intensity: .9, aurora: { on: true, intensity: .85, speed: 1 }, spotlight: { on: false }, tilt: { on: false }, magnetic: { on: false }, shimmer: { on: false }, reveal: { on: true, type: 'blur', stagger: true, distance: 14 }, ripple: { on: false }, micro: { on: true } },
            fx: { stars: true, shooters: false, nebula: true, density: .8, freq: 4, quality: 'auto', speed: .9, tapSpark: false }
        },
        glass: {
            label: 'Glass', desc: 'Glassmorphism + shimmer',
            anim: { on: true, speed: 1, intensity: .9, aurora: { on: false }, spotlight: { on: false }, tilt: { on: true, max: 8, glare: true }, magnetic: { on: true, strength: .2, max: 6 }, shimmer: { on: true, speed: 1, strength: .4 }, reveal: { on: true, type: 'fade', stagger: true, distance: 16 }, ripple: { on: true, alpha: .3 }, micro: { on: true } },
            fx: { stars: true, shooters: true, nebula: false, density: .7, freq: 3, quality: 'auto', speed: 1, tapSpark: false }
        },
        dynamic: {
            label: 'Dynamic', desc: 'Đầy đủ hiệu ứng tương tác',
            anim: { on: true, speed: 1, intensity: 1, aurora: { on: false }, spotlight: { on: true, strength: .3, radius: 280 }, tilt: { on: true, max: 8, glare: true }, magnetic: { on: true, strength: .22, max: 6 }, shimmer: { on: true, speed: 1, strength: .4 }, reveal: { on: true, type: 'zoom', stagger: true, distance: 22 }, ripple: { on: true, alpha: .35 }, micro: { on: true } },
            fx: { stars: true, shooters: true, nebula: true, density: 1.2, freq: 6, quality: 'high', speed: 1.2, tapSpark: true, palette: 0 }
        },
        performance: {
            label: 'Performance', desc: 'Ưu tiên FPS, tiết kiệm tài nguyên',
            anim: { on: true, speed: 1, intensity: .3, aurora: { on: false }, spotlight: { on: false }, tilt: { on: false }, magnetic: { on: false }, shimmer: { on: false }, reveal: { on: false }, ripple: { on: false }, micro: { on: false } },
            fx: { stars: true, shooters: false, nebula: false, density: .3, freq: 1, quality: 'lite', speed: .6, tapSpark: false }
        }
    };

    var fxBox = null;
    function buildFxPanel() {
        if (!fxPane) return;
        var host = $('bkV4Fx');
        if (!host) {
            host = group(fxPane, 'Hệ thống hiệu ứng V4 — Animation Master', 'fa-wand-sparkles', true);
            host.id = 'bkV4Fx';
            fxBox = host;
        } else { host.textContent = ''; fxBox = host; }
        var fx = window.__fx.cfg;

        U.check(host, 'Bật toàn bộ hiệu ứng chuyển động', A.on, function (v) { A.on = v; AN.save(); AN.apply(); });
        U.range(host, 'Tốc độ animation tổng (×)', A.speed, .25, 3, .05, function (v) { A.speed = v; AN.save(); AN.apply(); });
        U.range(host, 'Cường độ hiệu ứng', A.intensity, .2, 2, .05, function (v) { A.intensity = v; AN.save(); AN.apply(); });
        U.range(host, 'Mật độ hạt / sao (Particle density)', fx.density, .2, 2, .05, function (v) {
            fx.density = v; window.__fx.save(); A.particles = v; AN.save();
        });
        U.check(host, 'Hiệu ứng nền (tinh vân)', !!fx.nebula, function (v) { fx.nebula = v; window.__fx.save(); });
        U.check(host, 'Hiệu ứng con trỏ (spotlight)', A.spotlight.on, function (v) { A.spotlight.on = v; AN.save(); AN.apply(); buildFxPanel(); });
        U.check(host, 'Hiệu ứng hover (nghiêng thẻ)', A.tilt.on, function (v) { A.tilt.on = v; AN.save(); AN.apply(); buildFxPanel(); });
        U.check(host, 'Hiệu ứng cuộn (scroll reveal)', A.reveal.on, function (v) { A.reveal.on = v; AN.save(); AN.apply(); buildFxPanel(); });
        U.check(host, 'Micro-interactions (nút, icon, thẻ)', A.micro.on, function (v) { A.micro.on = v; AN.save(); AN.apply(); });

        var sub = U.group(host, 'Tùy chỉnh chi tiết từng hiệu ứng', 'fa-sliders', false);
        U.check(sub, 'Aurora background', A.aurora.on, function (v) { A.aurora.on = v; AN.save(); AN.apply(); });
        U.range(sub, 'Aurora — độ sáng', A.aurora.intensity, .1, 1, .05, function (v) { A.aurora.intensity = v; AN.save(); AN.apply(); });
        U.range(sub, 'Aurora — tốc độ', A.aurora.speed, .2, 3, .1, function (v) { A.aurora.speed = v; AN.save(); AN.apply(); });
        [['c1', 'Aurora màu 1'], ['c2', 'Aurora màu 2'], ['c3', 'Aurora màu 3']].forEach(function (p) {
            var inp = mk('input', 'bk-swatch');
            inp.type = 'color'; inp.value = A.aurora[p[0]];
            inp.addEventListener('input', function () { A.aurora[p[0]] = inp.value; AN.save(); AN.apply(); });
            var wrap = mk('span', 'flex items-center gap-2');
            wrap.appendChild(inp); wrap.appendChild(mk('span', 'opacity-70 text-[10px]', A.aurora[p[0]]));
            inp.addEventListener('input', function () { wrap.lastChild.textContent = inp.value; });
            U.row(sub, p[1], wrap);
        });

        U.range(sub, 'Spotlight — bán kính', A.spotlight.radius, 80, 600, 10, function (v) { A.spotlight.radius = v; AN.save(); AN.apply(); });
        U.range(sub, 'Spotlight — độ sáng', A.spotlight.strength, .05, .8, .05, function (v) { A.spotlight.strength = v; AN.save(); AN.apply(); });
        var scIn = mk('input', 'bk-swatch'); scIn.type = 'color'; scIn.value = A.spotlight.color;
        scIn.addEventListener('input', function () { A.spotlight.color = scIn.value; AN.save(); AN.apply(); });
        U.row(sub, 'Spotlight — màu', scIn);

        U.range(sub, 'Card tilt — góc nghiêng tối đa', A.tilt.max, 0, 20, 1, function (v) { A.tilt.max = v; AN.save(); AN.apply(); });
        U.check(sub, 'Card tilt — ánh sáng phản chiếu', A.tilt.glare, function (v) { A.tilt.glare = v; AN.apply(); });
        U.check(sub, 'Magnetic hover', A.magnetic.on, function (v) { A.magnetic.on = v; AN.save(); AN.apply(); });
        U.range(sub, 'Magnetic — lực hút', A.magnetic.strength, 0, .6, .02, function (v) { A.magnetic.strength = v; AN.save(); });
        U.range(sub, 'Magnetic — giới hạn di chuyển (px)', A.magnetic.max, 0, 16, 1, function (v) { A.magnetic.max = v; AN.save(); });
        U.check(sub, 'Glass shimmer', A.shimmer.on, function (v) { A.shimmer.on = v; AN.save(); AN.apply(); });
        U.range(sub, 'Shimmer — tốc độ', A.shimmer.speed, .25, 4, .05, function (v) { A.shimmer.speed = v; AN.save(); AN.apply(); });
        U.range(sub, 'Shimmer — độ sáng', A.shimmer.strength, .05, 1, .05, function (v) { A.shimmer.strength = v; AN.save(); AN.apply(); });
        U.select(sub, 'Scroll reveal — kiểu', [['fade', 'Fade'], ['slide', 'Slide'], ['zoom', 'Zoom'], ['blur', 'Blur']], A.reveal.type, function (v) { A.reveal.type = v; AN.save(); AN.apply(); });
        U.check(sub, 'Scroll reveal — stagger', A.reveal.stagger, function (v) { A.reveal.stagger = v; AN.save(); AN.apply(); });
        U.range(sub, 'Scroll reveal — khoảng dịch (px)', A.reveal.distance, 0, 80, 2, function (v) { A.reveal.distance = v; AN.save(); AN.apply(); });
        U.check(sub, 'Click ripple', A.ripple.on, function (v) { A.ripple.on = v; AN.save(); AN.apply(); });
        U.range(sub, 'Ripple — kích thước', A.ripple.size, 40, 400, 10, function (v) { A.ripple.size = v; AN.save(); });
        U.range(sub, 'Ripple — độ mờ', A.ripple.alpha, .05, .8, .05, function (v) { A.ripple.alpha = v; AN.save(); AN.apply(); });
        var rpIn = mk('input', 'bk-swatch'); rpIn.type = 'color'; rpIn.value = A.ripple.color;
        rpIn.addEventListener('input', function () { A.ripple.color = rpIn.value; AN.save(); AN.apply(); });
        U.row(sub, 'Ripple — màu', rpIn);

        var pbox = U.group(host, 'Effect Presets', 'fa-bolt', true);
        Object.keys(PRESETS).forEach(function (k) {
            var p = PRESETS[k];
            var r = mk('div', 'bk-row');
            var t = mk('div', 'grow');
            t.appendChild(mk('b', null, p.label));
            t.appendChild(mk('div', 'bk-note', p.desc));
            var b = btn('Áp dụng', function () { applyEffectPreset(k); }, { alt: true });
            r.appendChild(t); r.appendChild(b);
            pbox.appendChild(r);
        });
        var rowBtns = mk('div', 'bk-tool-row');
        rowBtns.appendChild(btn('Restore Default', function () { restoreDefaults(); }, { alt: true, icon: 'fa-rotate-left' }));
        rowBtns.appendChild(btn('Save Configuration', function () { AN.save(); window.__fx.save(); saveStudio(); toast('Đã lưu cấu hình hiệu ứng', 'success'); }, { icon: 'fa-floppy-disk' }));
        pbox.appendChild(rowBtns);
        note(pbox, 'Preset chỉ đổi hiệu ứng, không đổi cấu trúc thư mục môn học hay danh sách môn.');
    }

    function applyEffectPreset(key) {
        var p = PRESETS[key];
        if (!p) return;
        mergeInto(A, p.anim);
        AN.sanitize(A);
        Object.assign(window.__fx.cfg, p.fx);
        AN.save(); window.__fx.save(); AN.apply(); buildFxPanel();
        toast('Đã áp dụng preset “' + p.label + '”', 'success');
    }
    function restoreDefaults() {
        if (!confirm('Khôi phục hiệu ứng mặc định (V4 + canvas sao)? Cấu hình hiện tại sẽ bị thay thế.')) return;
        AN.reset();
        Object.assign(window.__fx.cfg, window.__fx.DEF);
        window.__fx.save(); AN.apply(); buildFxPanel();
        toast('Đã khôi phục hiệu ứng mặc định', 'success');
    }
    buildFxPanel();

    /* =====================================================================
       2. Animation Studio
       ===================================================================== */
    var animPane = qs('[data-pane="anim"]');
    var S = {
        type: STUDIO.type, duration: STUDIO.duration, delay: STUDIO.delay, easing: STUDIO.easing,
        iterations: STUDIO.iterations, direction: STUDIO.direction, fill: STUDIO.fill, rate: STUDIO.rate,
        customFrom: STUDIO.customFrom, customTo: STUDIO.customTo,
        target: null, anim: null, runs: [], timer: 0
    };
    if (!LIB[S.type]) S.type = 'fadeIn';
    var refs = {};

    function currentKf() {
        if (S.type === 'custom') {
            var a = AN.parseDecl(S.customFrom), b = AN.parseDecl(S.customTo);
            if (!Object.keys(a).length || !Object.keys(b).length) return LIB.fadeIn.kf;
            return [a, b];
        }
        return (LIB[S.type] || LIB.fadeIn).kf;
    }
    function currentOpts() {
        return {
            duration: Math.max(16, Number(S.duration) || 700),
            delay: Math.max(0, Number(S.delay) || 0),
            easing: S.easing || 'ease-out',
            iterations: S.iterations === 'infinite' ? Infinity : Math.max(1, Number(S.iterations) || 1),
            direction: S.direction, fill: S.fill
        };
    }
    function animName() { return 'bk-' + (S.type === 'custom' ? 'custom' : S.type); }
    function cssFor() {
        return '@keyframes ' + animName() + ' {\n' + AN.kfCss(currentKf()) + '\n}\n\n.bk-animated {\n' +
            '  animation: ' + animName() + ' ' + (Number(S.duration) || 700) + 'ms ' + S.easing + ' ' +
            (Number(S.delay) || 0) + 'ms ' + S.iterations + ' ' + S.direction + ' ' + S.fill + ';\n}';
    }
    function jsFor() {
        return 'element.animate(' + JSON.stringify(currentKf(), null, 2) + ', {\n' +
            '  duration: ' + (Number(S.duration) || 700) + ',\n  delay: ' + (Number(S.delay) || 0) + ',\n' +
            "  easing: '" + S.easing + "',\n  iterations: " + (S.iterations === 'infinite' ? 'Infinity' : Number(S.iterations) || 1) + ",\n" +
            "  direction: '" + S.direction + "',\n  fill: '" + S.fill + "'\n});";
    }

    function stageEl() { return $('bkStageBox'); }
    function previewTarget() {
        if (S.target && S.target.isConnected) return S.target;
        return stageEl() || document.body;
    }

    function buildStudio() {
        if (!animPane || $('bkV4Studio')) { if (refs.info) syncStudioInfo(); return; }
        var host = group(animPane, 'Animation Studio — Bộ sinh & xem trước animation', 'fa-film', true);
        host.id = 'bkV4Studio';

        var pre = U.group(host, 'Animation Presets', 'fa-shapes', true);
        var sel = mk('select', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs');
        Object.keys(LIB).forEach(function (k) { var o = mk('option', null, LIB[k].label); o.value = k; sel.appendChild(o); });
        sel.value = S.type;
        var selRow = mk('label', 'dv-row');
        selRow.appendChild(mk('span', null, 'Loại animation'));
        selRow.appendChild(sel);
        pre.appendChild(selRow);
        refs.type = sel;

        var cf = U.text('vd: opacity: 0; transform: translateY(24px);', S.customFrom, 'w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[11px] font-mono');
        var ct = U.text('vd: opacity: 1; transform: none;', S.customTo, 'w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[11px] font-mono');
        var cw = mk('div', 'bk-grid2');
        var c1 = mk('label', 'text-[11px]'); c1.appendChild(mk('div', 'bk-note', 'Custom — keyframe đầu')); c1.appendChild(cf);
        var c2 = mk('label', 'text-[11px]'); c2.appendChild(mk('div', 'bk-note', 'Custom — keyframe cuối')); c2.appendChild(ct);
        cw.appendChild(c1); cw.appendChild(c2);
        pre.appendChild(cw);
        [cf, ct].forEach(function (i) { i.addEventListener('input', function () { S.customFrom = cf.value; S.customTo = ct.value; STUDIO.customFrom = cf.value; STUDIO.customTo = ct.value; saveStudio(); syncStudioInfo(); }); });
        refs.customWrap = cw;
        function toggleCustom() { cw.style.display = S.type === 'custom' ? '' : 'none'; }
        sel.addEventListener('change', function () { S.type = sel.value; STUDIO.type = S.type; saveStudio(); toggleCustom(); syncStudioInfo(); });
        toggleCustom();

        var stage = mk('div');
        stage.id = 'bkStage';
        var box = mk('div'); box.id = 'bkStageBox';
        stage.appendChild(box);
        pre.appendChild(stage);
        var tl = mk('div'); tl.id = 'bkTimeline'; tl.appendChild(mk('div', '', '')).id = 'bkTlFill';
        pre.appendChild(tl);
        refs.timeline = tl;
        refs.fill = tl.firstChild;
        var info = mk('div', 'bk-note');
        info.id = 'bkV4Info';
        pre.appendChild(info);
        refs.info = info;

        var ctl = U.group(host, 'Animation Controls', 'fa-sliders', true);
        U.range(ctl, 'Duration (ms)', S.duration, 100, 5000, 50, function (v) { S.duration = v; STUDIO.duration = v; saveStudio(); syncStudioInfo(); });
        U.range(ctl, 'Delay (ms)', S.delay, 0, 2000, 25, function (v) { S.delay = v; STUDIO.delay = v; saveStudio(); syncStudioInfo(); });
        U.select(ctl, 'Easing', [['linear', 'linear'], ['ease', 'ease'], ['ease-in', 'ease-in'], ['ease-out', 'ease-out'], ['ease-in-out', 'ease-in-out'], ['cubic-bezier(.2,.7,.2,1)', 'smooth'], ['cubic-bezier(.34,1.56,.64,1)', 'spring'], ['steps(6,end)', 'steps(6)']], S.easing, function (v) { S.easing = v; STUDIO.easing = v; saveStudio(); syncStudioInfo(); });
        U.select(ctl, 'Iteration count', [['1', '1'], ['2', '2'], ['3', '3'], ['5', '5'], ['infinite', '∞ (vô hạn)']], String(S.iterations), function (v) { S.iterations = v === 'infinite' ? 'infinite' : Number(v); STUDIO.iterations = S.iterations; saveStudio(); syncStudioInfo(); });
        U.select(ctl, 'Direction', [['normal', 'normal'], ['reverse', 'reverse'], ['alternate', 'alternate'], ['alternate-reverse', 'alternate-reverse']], S.direction, function (v) { S.direction = v; STUDIO.direction = v; saveStudio(); syncStudioInfo(); });
        U.select(ctl, 'Fill mode', [['none', 'none'], ['forwards', 'forwards'], ['backwards', 'backwards'], ['both', 'both']], S.fill, function (v) { S.fill = v; STUDIO.fill = v; saveStudio(); syncStudioInfo(); });
        U.select(ctl, 'Playback speed', [['.25', '0.25×'], ['.5', '0.5×'], ['1', '1×'], ['1.5', '1.5×'], ['2', '2×']], String(S.rate), function (v) { S.rate = Number(v); STUDIO.rate = S.rate; saveStudio(); applyRate(); syncStudioInfo(); });

        var pv = U.group(host, 'Preview System', 'fa-circle-play', true);
        var row1 = mk('div', 'bk-tool-row');
        row1.appendChild(btn('Preview', function () { playPreview(true); }, { icon: 'fa-play' }));
        row1.appendChild(btn('Replay', function () { playPreview(true); }, { alt: true, icon: 'fa-rotate-right' }));
        row1.appendChild(btn('Pause', function () { if (S.anim) S.anim.pause(); syncStudioInfo(); }, { alt: true }));
        row1.appendChild(btn('Play', function () { if (S.anim) S.anim.play(); syncStudioInfo(); }, { alt: true }));
        row1.appendChild(btn('Stop', stopPreview, { alt: true, icon: 'fa-stop' }));
        row1.appendChild(btn('Reset', function () { stopPreview(); if (S.target) S.target.style.cssText = S.target.style.cssText; syncStudioInfo(); }, { alt: true }));
        pv.appendChild(row1);
        note(pv, 'Preview chỉ tác động lên phần tử đang chọn hoặc ô xem trước, không dừng animation khác của trang.');

        var elBox = U.group(host, 'Element Animation', 'fa-arrow-pointer', true);
        var tLabel = mk('div', 'text-[11px] font-mono mb-1', 'Chưa chọn phần tử — đang dùng ô xem trước.');
        var row2 = mk('div', 'bk-tool-row');
        row2.appendChild(btn('Chọn phần tử', pickElement, { icon: 'fa-crosshairs' }));
        row2.appendChild(btn('Áp dụng lên phần tử', function () { playPreview(true); }, { alt: true }));
        row2.appendChild(btn('Bỏ chọn', function () { S.target = null; tLabel.textContent = 'Chưa chọn phần tử — đang dùng ô xem trước.'; }, { alt: true }));
        row2.appendChild(btn('Reset animation', function () { stopPreview(); }, { alt: true }));
        elBox.appendChild(tLabel); elBox.appendChild(row2);
        var row3 = mk('div', 'bk-tool-row');
        row3.appendChild(btn('Copy CSS Keyframes', function () { copy(cssFor(), 'Đã copy CSS keyframes'); }, { alt: true, icon: 'fa-code' }));
        row3.appendChild(btn('Copy JS (Web Animations)', function () { copy(jsFor(), 'Đã copy mã Web Animations API'); }, { alt: true, icon: 'fa-file-code' }));
        elBox.appendChild(row3);
        refs.targetLabel = tLabel;

        var runs = U.group(host, 'Running animations (Studio)', 'fa-list-check', false);
        var runsOut = mk('div');
        runsOut.id = 'bkV4Runs';
        runs.appendChild(runsOut);
        refs.runs = runsOut;

        var pm = U.group(host, 'Animation Preset Manager', 'fa-bookmark', false);
        var nameIn = U.text('Tên preset (vd: Card nổi bật)', '', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs flex-1 min-w-0');
        var prow = mk('div', 'bk-tool-row');
        prow.appendChild(nameIn);
        prow.appendChild(btn('Lưu preset hiện tại', function () { savePreset(nameIn.value); }, { icon: 'fa-floppy-disk' }));
        pm.appendChild(prow);
        var q = U.text('Tìm preset...', '', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs flex-1 min-w-0');
        var qrow = mk('div', 'bk-tool-row');
        qrow.appendChild(q);
        qrow.appendChild(btn('Export JSON', exportPresets, { alt: true }));
        qrow.appendChild(importLabel());
        pm.appendChild(qrow);
        var plist = mk('div');
        plist.id = 'bkV4Presets';
        pm.appendChild(plist);
        q.addEventListener('input', renderPresets);
        refs.presets = plist;
        refs.presetName = nameIn;

        var perf = U.group(host, 'Animation Performance Monitor', 'fa-gauge-high', false);
        var perfOut = mk('div', 'bk-out');
        perfOut.id = 'bkV4AnimPerf';
        perf.appendChild(perfOut);
        perf.appendChild(btn('Đo lại', function () { measurePerf(); }, { alt: true }));
        refs.perf = perfOut;

        renderRuns(); renderPresets(); renderTimeline(); syncStudioInfo(); measurePerf();
        D.addEventListener('visibilitychange', function () {
            if (D.hidden && S.timer) { clearInterval(S.timer); S.timer = 0; }
        });
    }

    function importLabel() {
        var l = mk('label', 'dv-btn alt cursor-pointer', 'Import');
        var i = mk('input'); i.type = 'file'; i.accept = 'application/json'; i.className = 'hidden';
        i.addEventListener('change', function () { importPresets(i); });
        l.appendChild(i);
        return l;
    }

    function renderTimeline() {
        if (!refs.timeline) return;
        Array.prototype.slice.call(refs.timeline.querySelectorAll('.bk-tl-mark')).forEach(function (n) { n.remove(); });
        var kf = currentKf(), n = kf.length;
        for (var i = 0; i < n; i++) {
            var pct = n > 1 ? Math.round(i / (n - 1) * 100) : 100;
            var m = mk('div', 'bk-tl-mark');
            m.style.left = pct + '%';
            m.appendChild(mk('span', null, pct + '%'));
            refs.timeline.appendChild(m);
        }
    }
    function applyRate() { if (S.anim) { try { S.anim.playbackRate = S.rate; } catch (e) {} } }
    function playPreview(replay) {
        var target = previewTarget();
        if (replay && S.anim) { try { S.anim.cancel(); } catch (e) {} S.anim = null; }
        try {
            var an = target.animate(currentKf(), currentOpts());
            an.playbackRate = S.rate;
            S.anim = an;
            addRun(an, (LIB[S.type] || {}).label || S.type, target);
            an.addEventListener('finish', function () { syncStudioInfo(); measurePerf(); });
            an.addEventListener('cancel', function () { syncStudioInfo(); });
            trackProgress(an);
        } catch (e) { toast('Không chạy được animation: ' + e.message, 'error'); }
        syncStudioInfo();
    }
    function stopPreview() {
        if (S.anim) { try { S.anim.cancel(); } catch (e) {} S.anim = null; }
        syncStudioInfo();
    }
    function trackProgress(an) {
        if (S.timer) clearInterval(S.timer);
        var started = performance.now();
        S.timer = setInterval(function () {
            if (!an || an.playState === 'idle') { clearInterval(S.timer); S.timer = 0; return; }
            var dur = (currentOpts().duration || 700) / Math.max(.05, S.rate);
            var p = Math.min(1, (performance.now() - started) / dur);
            if (refs.fill) refs.fill.style.width = (p * 100).toFixed(1) + '%';
            if (p >= 1 || an.playState === 'finished') { clearInterval(S.timer); S.timer = 0; }
        }, 60);
    }
    function syncStudioInfo() {
        if (!refs.info) return;
        var kf = currentKf(), n = kf.length;
        var state = S.anim ? S.anim.playState : 'idle';
        refs.info.textContent = (LIB[S.type] || {}).label + ' · ' + (Number(S.duration) || 700) + 'ms · ' + S.easing +
            ' · ' + S.iterations + '× · ' + S.direction + ' · ' + S.fill + ' · tốc độ ' + S.rate + '× · ' + n + ' keyframe · trạng thái: ' + state;
        renderTimeline();
        if (refs.targetLabel) {
            refs.targetLabel.textContent = S.target && S.target.isConnected
                ? 'Phần tử: ' + targetLabel(S.target) + (S.target.isConnected ? '' : ' (đã rời DOM)')
                : 'Chưa chọn phần tử — đang dùng ô xem trước.';
        }
    }
    function targetLabel(el) {
        var s = el.tagName.toLowerCase();
        if (el.id) s += '#' + el.id;
        if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
        return s;
    }

    /* element picker (scoped to the studio, does not hijack page clicks otherwise) */
    var pickBox = null, picking = false;
    function pickElement() {
        if (!pickBox) {
            pickBox = mk('div');
            pickBox.id = 'bkV4Pick';
            pickBox.style.cssText = 'position:fixed;z-index:9995;pointer-events:none;border:2px solid #38bdf8;background:rgba(56,189,248,.15);font:600 10px monospace;color:#fff;display:none';
            var s = mk('span');
            s.style.cssText = 'position:absolute;top:-18px;left:-2px;background:#0284c7;padding:1px 5px;white-space:nowrap';
            pickBox.appendChild(s);
            D.body.appendChild(pickBox);
        }
        picking = true;
        try { window.__bktOff = true; } catch (e) {}
        closePanel();
        toast('Di chuột rồi bấm để chọn phần tử · Esc để hủy', 'success');
    }
    function pickStop() {
        picking = false;
        if (pickBox) pickBox.style.display = 'none';
        try { window.__bktOff = false; } catch (e) {}
    }
    D.addEventListener('pointermove', function (e) {
        if (!picking) return;
        var el = e.target;
        if (!el || el.closest('#dev-panel-modal')) { pickBox.style.display = 'none'; return; }
        var r = el.getBoundingClientRect();
        Object.assign(pickBox.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        pickBox.firstChild.textContent = targetLabel(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height);
    }, { passive: true });
    D.addEventListener('click', function (e) {
        if (!picking) return;
        e.preventDefault(); e.stopPropagation();
        S.target = e.target; pickStop();
        openPanel(); switchTab('anim');
        buildStudio(); syncStudioInfo();
        toast('Đã chọn ' + targetLabel(S.target), 'success');
    }, true);
    D.addEventListener('keydown', function (e) {
        if (picking && e.key === 'Escape') { pickStop(); openPanel(); switchTab('anim'); }
    });
    function openPanel() { try { window.openDevPanel(); } catch (e) {} }
    function closePanel() { try { window.closeDevPanel(); } catch (e) {} }
    function switchTab(t) { try { window.switchDevTab(t); } catch (e) {} }

    /* ---------- running animations (scoped) ---------- */
    function addRun(an, name, target) {
        S.runs.unshift({ an: an, name: name, target: target, t: Date.now() });
        if (S.runs.length > 8) {
            var old = S.runs.pop();
            try { old.an.cancel(); } catch (e) {}
        }
        renderRuns();
    }
    function renderRuns() {
        if (!refs.runs) return;
        refs.runs.textContent = '';
        S.runs = S.runs.filter(function (r) { return r.an; });
        if (!S.runs.length) { refs.runs.appendChild(mk('div', 'bk-note', '(chưa có animation nào do Studio tạo)')); return; }
        S.runs.forEach(function (r) {
            var row = mk('div', 'bk-run');
            var st = r.an.playState;
            row.appendChild(mk('span', 'grow', r.name + ' · ' + targetLabel(r.target || D.body) + ' · ' + st));
            row.appendChild(btn('❚❚', function () { try { r.an.pause(); } catch (e) {} renderRuns(); }, { alt: true, title: 'Pause' }));
            row.appendChild(btn('▶', function () { try { r.an.play(); } catch (e) {} renderRuns(); }, { alt: true, title: 'Play' }));
            row.appendChild(btn('↺', function () { try { r.an.currentTime = 0; r.an.play(); } catch (e) {} renderRuns(); }, { alt: true, title: 'Reset' }));
            row.appendChild(btn('×', function () {
                try { r.an.cancel(); } catch (e) {}
                S.runs = S.runs.filter(function (x) { return x !== r; });
                renderRuns();
            }, { alt: true, title: 'Xóa animation này' }));
            refs.runs.appendChild(row);
        });
    }

    function measurePerf() {
        if (!refs.perf) return;
        var all = 0;
        try { all = D.getAnimations ? D.getAnimations().length : 0; } catch (e) { all = 0; }
        var t0 = performance.now(), frames = 0;
        var raf = requestAnimationFrame(function tick() {
            frames++;
            if (performance.now() - t0 < 500) requestAnimationFrame(tick);
            else {
                var fps = Math.round(frames * 1000 / (performance.now() - t0));
                refs.perf.textContent = 'Animation toàn trang (getAnimations): ' + all + '\n' +
                    'Studio đang giữ: ' + S.runs.length + ' · trạng thái: ' + (S.anim ? S.anim.playState : 'idle') + '\n' +
                    'FPS ước lượng trong 500ms: ' + fps + (fps < 40 ? ' (đang tải animation nặng)' : '') + '\n' +
                    'Lưu ý: FPS đo trong lúc panel mở nên thấp hơn thực tế do công cụ dev.';
            }
        });
    }

    /* ---------- preset manager ---------- */
    var P_KEY = 'bakhiAnimPresets';
    function validPreset(p) {
        return !!p && typeof p === 'object' &&
            typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 60 &&
            ['duration', 'delay', 'rate'].every(function (k) { return typeof p[k] === 'number' && isFinite(p[k]); }) &&
            typeof p.easing === 'string' && p.easing.length <= 40 &&
            Array.isArray(p.kf) && p.kf.length >= 2 && p.kf.length <= 12 &&
            p.kf.every(function (f) { return f && typeof f === 'object' && Object.keys(f).length <= 8; }) &&
            typeof p.type === 'string';
    }
    function presets() {
        var v = read(P_KEY, []);
        if (!Array.isArray(v)) return [];
        return v.filter(validPreset);
    }
    function savePresets(l) { store(P_KEY, l.slice(0, 40)); renderPresets(); }
    function savePreset(name) {
        name = String(name || '').trim();
        if (!name) { toast('Hãy đặt tên cho preset', 'error'); return; }
        if (name.length > 60) { toast('Tên quá dài (tối đa 60 ký tự)', 'error'); return; }
        var p = {
            id: 'p' + Date.now().toString(36), name: name, type: S.type, kf: currentKf(),
            duration: Number(S.duration) || 700, delay: Number(S.delay) || 0, easing: S.easing,
            iterations: S.iterations, direction: S.direction, fill: S.fill, rate: S.rate,
            customFrom: S.customFrom, customTo: S.customTo
        };
        savePresets([p].concat(presets()));
        if (refs.presetName) refs.presetName.value = '';
        toast('Đã lưu preset “' + name + '”', 'success');
    }
    function applyPreset(p) {
        S.type = LIB[p.type] ? p.type : 'custom';
        S.duration = p.duration; S.delay = p.delay; S.easing = p.easing;
        S.iterations = p.iterations; S.direction = p.direction; S.fill = p.fill; S.rate = p.rate;
        if (p.type === 'custom') { S.customFrom = p.customFrom || STUDIO.customFrom; S.customTo = p.customTo || STUDIO.customTo; }
        Object.assign(STUDIO, { type: S.type, duration: S.duration, delay: S.delay, easing: S.easing, iterations: S.iterations, direction: S.direction, fill: S.fill, rate: S.rate, customFrom: S.customFrom, customTo: S.customTo });
        saveStudio();
        refreshStudioInputs();
        syncStudioInfo();
        toast('Đã áp dụng preset “' + p.name + '”', 'success');
    }
    function renderPresets() {
        if (!refs.presets) return;
        var q = (qs('#bkV4Studio input[placeholder="Tìm preset..."]') || {}).value || '';
        q = q.toLowerCase();
        var l = presets().filter(function (p) { return !q || p.name.toLowerCase().includes(q) || p.type.includes(q); });
        refs.presets.textContent = '';
        if (!l.length) { refs.presets.appendChild(mk('div', 'bk-note', '(chưa có preset tự lưu — bấm “Lưu preset hiện tại”)')); return; }
        l.forEach(function (p) {
            var row = mk('div', 'bk-run');
            row.appendChild(mk('span', 'grow', p.name + ' · ' + p.type + ' · ' + p.duration + 'ms'));
            row.appendChild(btn('Dùng', function () { applyPreset(p); }, { alt: true }));
            row.appendChild(btn('Đổi tên', function () {
                var n = prompt('Tên mới cho preset:', p.name);
                if (n == null) return;
                n = String(n).trim();
                if (!n) return;
                var all = presets();
                all.forEach(function (x) { if (x.id === p.id) x.name = n.slice(0, 60); });
                savePresets(all);
            }, { alt: true }));
            row.appendChild(btn('Nhân bản', function () {
                var c = JSON.parse(JSON.stringify(p));
                c.id = 'p' + Date.now().toString(36); c.name = p.name + ' (copy)';
                savePresets([c].concat(presets()));
            }, { alt: true }));
            row.appendChild(btn('×', function () {
                if (!confirm('Xóa preset “' + p.name + '”?')) return;
                savePresets(presets().filter(function (x) { return x.id !== p.id; }));
            }, { alt: true, title: 'Xóa' }));
            refs.presets.appendChild(row);
        });
    }
    function exportPresets() {
        var data = { app: 'bakhi', kind: 'anim-presets', version: 1, exportedAt: new Date().toISOString(), presets: presets() };
        var a = D.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = 'bakhi-anim-presets.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    function importPresets(inp) {
        var f = inp.files && inp.files[0];
        inp.value = '';
        if (!f) return;
        if (f.size > 200 * 1024) { toast('File quá lớn (tối đa 200KB)', 'error'); return; }
        f.text().then(function (t) {
            var d = JSON.parse(t);
            var arr = Array.isArray(d) ? d : d && Array.isArray(d.presets) ? d.presets : null;
            if (!arr || !arr.every(validPreset)) throw new Error('cấu trúc preset không hợp lệ');
            var merged = arr.map(function (p) {
                return Object.assign({}, p, { id: 'p' + Math.random().toString(36).slice(2, 9), name: String(p.name).slice(0, 60) });
            }).concat(presets());
            savePresets(merged);
            toast('Đã nhập ' + arr.length + ' preset (animation không tự chạy)', 'success');
        }).catch(function (e) { toast('Nhập preset thất bại: ' + e.message, 'error'); });
    }
    function refreshStudioInputs() {
        if (refs.type) refs.type.value = S.type;
        if (refs.customWrap) refs.customWrap.style.display = S.type === 'custom' ? '' : 'none';
        renderTimeline();
    }

    buildStudio();

    /* =====================================================================
       3. Trang chuyển trang (BKT) — đồng bộ UI + preview
       ===================================================================== */
    function buildBkt() {
        if (!animPane || $('bkV4Bkt')) return;
        var host = group(animPane, 'Chuyển trang BKT — 5 kiểu + thời lượng', 'fa-right-left', false);
        host.id = 'bkV4Bkt';
        var cfg = window.__bkt && window.__bkt.cfg;
        if (!cfg) { note(host, 'Không tìm thấy engine chuyển trang (__bkt).'); return; }
        var STYLES = [['hand', 'Bàn tay kéo'], ['iris', 'Mở vòng tròn'], ['fade', 'Mờ dần'], ['curtain', 'Rèm buông'], ['zoom', 'Thu phóng'], ['blur', 'Mờ (blur)']];
        if (!STYLES.some(function (s) { return s[0] === cfg.style; })) { cfg.style = 'hand'; window.__bkt.save(); }
        U.check(host, 'Bật hiệu ứng chuyển trang', cfg.on !== false, function (v) { cfg.on = v; window.__bkt.save(); });
        U.select(host, 'Kiểu chuyển trang', STYLES, cfg.style, function (v) { cfg.style = v; window.__bkt.save(); var s = $('bktStyle'); if (s) s.value = v; });
        U.range(host, 'Thời lượng (×)', cfg.speed || 1, .5, 3, .25, function (v) { cfg.speed = v; window.__bkt.save(); var s = $('bktSp'); if (s) s.value = v; var t = $('bktSpV'); if (t) t.textContent = v; });
        var r1 = mk('div', 'bk-tool-row');
        r1.appendChild(btn('Preview sang phải →', function () { try { window.__bkt.test('L'); } catch (e) {} }, { icon: 'fa-arrow-right' }));
        r1.appendChild(btn('← Preview sang trái', function () { try { window.__bkt.test('R'); } catch (e) {} }, { alt: true }));
        r1.appendChild(btn('Đi & quay về', function () {
            try {
                window.__bkt.play('L', 'in', 'Đi & quay về').then(function () { setTimeout(function () { window.__bkt.play('L', 'out'); }, 550); });
            } catch (e) {}
        }, { alt: true, icon: 'fa-arrows-rotate' }));
        host.appendChild(r1);

        var varBox = mk('div', 'bk-note');
        varBox.id = 'bkV4BktVars';
        host.appendChild(varBox);
        function listVars() {
            var out = [];
            for (var i = 0; i < D.documentElement.style.length; i++) {
                var p = D.documentElement.style[i];
                if (p.indexOf('--bk-bkt') === 0) out.push(p);
            }
            varBox.textContent = out.length ? 'Biến CSS: ' + out.join(', ') : 'Không có biến CSS riêng; kiểu chuyển trang dùng clip-path / transform / filter trong engine.';
        }
        listVars();
    }
    buildBkt();

    /* =====================================================================
       4. Studio tab — CSS editor tools, Snippet manager v2, Animation generator
       ===================================================================== */
    var stPane = qs('[data-pane="studio"]');
    var hist = [], histPos = -1, histTimer = 0;
    function stCss() { return $('stCss'); }
    function pushHist() {
        var t = stCss(); if (!t) return;
        var v = t.value;
        if (hist[histPos] === v) return;
        hist = hist.slice(0, histPos + 1);
        hist.push(v);
        if (hist.length > 120) hist.shift();
        histPos = hist.length - 1;
    }
    function undo() { if (histPos > 0) { histPos--; stCss().value = hist[histPos]; applyLive(); } }
    function redo() { if (histPos < hist.length - 1) { histPos++; stCss().value = hist[histPos]; applyLive(); } }
    function applyLive() { try { window.DX.cssRun(); } catch (e) {} }
    function formatCss(txt) {
        var out = '', depth = 0, i = 0, s = String(txt);
        for (; i < s.length; i++) {
            var c = s[i];
            if (c === '{') { out = out.replace(/\s+$/, '') + ' {\n'; depth++; out += '  '.repeat(depth); }
            else if (c === '}') { depth = Math.max(0, depth - 1); out = out.replace(/\s+$/, '') + '\n' + '  '.repeat(depth) + '}\n' + '  '.repeat(depth); }
            else if (c === ';') { out = out.replace(/\s+$/, '') + ';\n' + '  '.repeat(depth); }
            else if (c === '\n') { if (!/\n\s*$/.test(out)) out += '\n' + '  '.repeat(depth); }
            else out += c;
        }
        return out.replace(/\n{3,}/g, '\n\n').trim();
    }

    function buildStudioTools() {
        if (!stPane || $('bkV4StudioTools')) return;
        var t = stCss(); if (!t) return;
        if (!STUDIO.css && t.value) STUDIO.css = t.value;
        if (STUDIO.css) t.value = STUDIO.css;
        pushHist();

        var tools = U.group(stPane, 'CSS Editor — công cụ', 'fa-code', false);
        tools.id = 'bkV4StudioTools';
        var r = mk('div', 'bk-tool-row');
        r.appendChild(btn('Format CSS', function () { pushHist(); t.value = formatCss(t.value); STUDIO.css = t.value; saveStudio(); applyLive(); }, { icon: 'fa-align-left' }));
        r.appendChild(btn('Kiểm tra ngoặc', function () {
            var msg = checkBraces(t.value);
            toast(msg || 'Dấu ngoặc cân bằng', msg ? 'error' : 'success');
        }, { alt: true }));
        r.appendChild(btn('Undo', undo, { alt: true, icon: 'fa-rotate-left' }));
        r.appendChild(btn('Redo', redo, { alt: true, icon: 'fa-rotate-right' }));
        tools.appendChild(r);

        var find = U.text('Tìm trong CSS...', '', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs flex-1 min-w-0');
        var findInfo = mk('span', 'bk-note');
        var fr = mk('div', 'bk-tool-row');
        fr.appendChild(find);
        fr.appendChild(btn('Tìm', function () {
            var q = find.value;
            if (!q) { findInfo.textContent = ''; return; }
            var idx = t.value.indexOf(q);
            findInfo.textContent = idx < 0 ? 'Không tìm thấy' : 'Vị trí ' + idx + ' · ' + (t.value.split(q).length - 1) + ' lần xuất hiện';
            if (idx >= 0) { t.focus(); t.setSelectionRange(idx, idx + q.length); }
        }, { alt: true }));
        fr.appendChild(findInfo);
        tools.appendChild(fr);

        tools.appendChild(btn('Live Preview (Chạy thử)', applyLive, { icon: 'fa-play' }));
        note(tools, 'CSS được áp dụng vào <style id="dv-live">. Undo/Redo chỉ trong phiên này; nội dung được lưu vào bakhiStudioCfg.');

        t.addEventListener('input', function () {
            clearTimeout(histTimer);
            histTimer = setTimeout(function () { pushHist(); STUDIO.css = t.value; saveStudio(); }, 400);
        });

        /* ---- Snippet manager v2 ---- */
        var sn = U.group(stPane, 'Snippet Manager', 'fa-scissors', false);
        var q = U.text('Tìm snippet...', '', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs flex-1 min-w-0');
        var list = mk('div');
        list.id = 'bkV4Snips';
        var sr = mk('div', 'bk-tool-row');
        sr.appendChild(q);
        sr.appendChild(btn('Export', function () {
            var a = D.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(snips(), null, 2)], { type: 'application/json' }));
            a.download = 'bakhi-snippets.json'; a.click();
        }, { alt: true }));
        sn.appendChild(sr);
        sn.appendChild(list);
        note(sn, 'Snippet JavaScript chỉ được nạp/copy — không bao giờ tự chạy khi import.');
        q.addEventListener('input', renderSnips);
        renderSnips();

        function snips() {
            var v = read('bakhiSnips', []);
            return Array.isArray(v) ? v.filter(function (s) { return s && typeof s.n === 'string' && typeof s.code === 'string' && ['css', 'html', 'js'].indexOf(s.type) >= 0; }) : [];
        }
        function saveSnips(l) { store('bakhiSnips', l.slice(0, 50)); renderSnips(); try { window.DX.snList(); } catch (e) {} }
        function renderSnips() {
            list.textContent = '';
            var all = snips(), term = q.value.toLowerCase();
            var l = all.map(function (s, i) { return [s, i]; }).filter(function (p) { return !term || (p[0].n + p[0].code).toLowerCase().indexOf(term) >= 0; });
            if (!l.length) { list.appendChild(mk('div', 'bk-note', '(chưa có snippet)')); return; }
            l.forEach(function (p) {
                var s = p[0];
                var row = mk('div', 'bk-run');
                row.appendChild(mk('span', 'grow', '[' + s.type + '] ' + s.n));
                row.appendChild(btn('Copy', function () { copy(s.code); }, { alt: true }));
                row.appendChild(btn(s.type === 'css' ? 'Nạp CSS' : 'Nạp', function () {
                    t.value = s.code; STUDIO.css = s.code; saveStudio();
                    if (s.type === 'css') applyLive();
                    else toast('Đã nạp snippet vào ô CSS — JavaScript không tự chạy', 'success');
                }, { alt: true }));
                row.appendChild(btn('Đổi tên', function () {
                    var n = prompt('Tên mới:', s.n); if (n == null || !n.trim()) return;
                    var all2 = snips(); all2.forEach(function (x) { if (x === s) x.n = n.trim().slice(0, 80); });
                    saveSnips(all2);
                }, { alt: true }));
                row.appendChild(btn('Nhân bản', function () {
                    var all2 = snips();
                    all2.push({ n: s.n + ' (copy)', type: s.type, code: s.code });
                    saveSnips(all2);
                }, { alt: true }));
                row.appendChild(btn('×', function () {
                    if (!confirm('Xóa snippet “' + s.n + '”?')) return;
                    var all2 = snips().filter(function (x) { return x !== s; });
                    saveSnips(all2);
                }, { alt: true }));
                list.appendChild(row);
            });
        }

        /* ---- Animation generator ---- */
        var gen = U.group(stPane, 'Animation Generator', 'fa-wand-magic-sparkles', false);
        var gsel = mk('select', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:bg-slate-800 text-xs');
        Object.keys(LIB).forEach(function (k) { var o = mk('option', null, LIB[k].label); o.value = k; gsel.appendChild(o); });
        var gdur = mk('input', 'px-1 rounded bg-transparent border border-slate-300 dark:border-slate-600 text-xs');
        gdur.type = 'number'; gdur.min = 50; gdur.max = 5000; gdur.value = 700; gdur.style.width = '5rem';
        var gease = mk('select', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs');
        ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(.34,1.56,.64,1)'].forEach(function (e) { var o = mk('option', null, e); o.value = e; gease.appendChild(o); });
        var gr = mk('div', 'bk-tool-row');
        gr.appendChild(gsel); gr.appendChild(gdur); gr.appendChild(gease);
        gr.appendChild(btn('Sinh code', function () { renderGen(); }, { icon: 'fa-bolt' }));
        gen.appendChild(gr);
        var ta = mk('textarea', 'w-full p-2 rounded-xl bg-slate-950 text-sky-300 font-mono text-[10px] outline-none');
        ta.rows = 7; ta.readOnly = true;
        gen.appendChild(ta);
        var gr2 = mk('div', 'bk-tool-row');
        gr2.appendChild(btn('Copy CSS', function () { copy(ta.dataset.css || '', 'Đã copy CSS'); }, { alt: true }));
        gr2.appendChild(btn('Copy JS', function () { copy(ta.dataset.js || '', 'Đã copy JS'); }, { alt: true }));
        gen.appendChild(gr2);
        function renderGen() {
            var kf = (LIB[gsel.value] || LIB.fadeIn).kf;
            var dur = Math.max(50, Math.min(5000, Number(gdur.value) || 700));
            var name = 'bk-' + gsel.value;
            var css = '@keyframes ' + name + ' {\n' + AN.kfCss(kf) + '\n}\n\n.animated {\n  animation: ' + name + ' ' + dur + 'ms ' + gease.value + ' both;\n}';
            var js = 'element.animate(' + JSON.stringify(kf, null, 2) + ', { duration: ' + dur + ", easing: '" + gease.value + "', fill: 'both' });";
            ta.value = css + '\n\n/* JavaScript (Web Animations API) */\n' + js;
            ta.dataset.css = css; ta.dataset.js = js;
        }
        renderGen();
    }
    function checkBraces(s) {
        var d = 0, q = null;
        for (var i = 0; i < s.length; i++) {
            var c = s[i];
            if (q) { if (c === q && s[i - 1] !== '\\') q = null; continue; }
            if (c === '"' || c === "'") { q = c; continue; }
            if (c === '{') d++;
            else if (c === '}') { d--; if (d < 0) return 'Thừa dấu } tại vị trí ' + i; }
        }
        return d ? 'Thiếu ' + d + ' dấu }' : '';
    }
    buildStudioTools();

    /* =====================================================================
       5. Giao diện — CSS Design Tokens + Theme Customizer
       ===================================================================== */
    var uiPane = qs('[data-pane="ui"]');
    var tokenDraft = null, tokenDirty = false;

    function currentTokens() {
        return tokenDraft || window.__tokens.get();
    }
    function setToken(k, v) {
        tokenDirty = true;
        var t = Object.assign({}, currentTokens());
        t[k] = v;
        tokenDraft = window.__tokens.apply(t);
    }
    function buildTokens() {
        if (!uiPane || $('bkV4Tokens')) return;
        var host = U.group(uiPane, 'CSS Design Tokens (biến :root)', 'fa-swatchbook', false);
        host.id = 'bkV4Tokens';
        var rows = mk('div');
        host.appendChild(rows);
        function render() {
            rows.textContent = '';
            var vals = currentTokens();
            window.__tokens.meta.forEach(function (d) {
                var row = mk('div', 'bk-token-row');
                row.appendChild(mk('code', 'truncate', d.k));
                var val = vals[d.k];
                var ctl;
                if (d.type === 'color') {
                    ctl = mk('input', 'bk-swatch'); ctl.type = 'color'; ctl.value = val;
                    ctl.addEventListener('input', function () { setToken(d.k, ctl.value); txt.value = ctl.value; });
                } else {
                    ctl = mk('input'); ctl.type = 'text'; ctl.value = val;
                    ctl.className = 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[11px]';
                    ctl.addEventListener('change', function () { setToken(d.k, ctl.value); render(); });
                }
                row.appendChild(ctl);
                var txt = mk('input');
                txt.type = 'text';
                txt.className = 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[11px]';
                txt.value = val;
                txt.addEventListener('change', function () { setToken(d.k, txt.value); render(); });
                row.appendChild(txt);
                var rb = btn('↺', function () {
                    var def = window.__tokens.def[d.k];
                    setToken(d.k, def);
                    render();
                }, { alt: true, title: 'Reset biến này' });
                row.appendChild(rb);
                rows.appendChild(row);
            });
        }
        render();

        var acts = mk('div', 'bk-tool-row');
        acts.appendChild(btn('Lưu vào LocalStorage', function () {
            window.__tokens.save(currentTokens());
            tokenDirty = false; tokenDraft = null;
            toast('Đã lưu theme tokens', 'success');
        }, { icon: 'fa-floppy-disk' }));
        acts.appendChild(btn('Revert', function () {
            tokenDraft = null; tokenDirty = false;
            window.__tokens.apply(window.__tokens.get());
            render();
            toast('Đã hoàn tác thay đổi tokens (chưa lưu)', 'success');
        }, { alt: true }));
        acts.appendChild(btn('Reset tất cả', function () {
            if (!confirm('Reset toàn bộ design tokens về mặc định?')) return;
            tokenDraft = null;
            window.__tokens.reset();
            render();
        }, { alt: true }));
        acts.appendChild(btn('Export CSS', function () { copy(window.__tokens.cssText(), 'Đã copy CSS :root'); }, { alt: true }));
        host.appendChild(acts);
        note(host, 'Thay đổi được áp dụng ngay qua biến CSS (không sửa style gốc trong file). Bấm “Lưu vào LocalStorage” để giữ lại sau khi tải trang.');

        /* Theme customizer */
        var th = U.group(uiPane, 'Theme Customizer', 'fa-palette', false);
        var t = currentTokens();
        U.range(th, 'Border radius', parseFloat(t['--bk-radius']) || 12, 0, 28, 1, function (v) { setToken('--bk-radius', v + 'px'); });
        U.range(th, 'Shadow intensity', parseFloat(t['--bk-shadow']) || 1, 0, 2, .1, function (v) { setToken('--bk-shadow', String(v)); });
        U.range(th, 'Background opacity', parseFloat(t['--bk-bg-opacity']) || .55, 0, 1, .05, function (v) { setToken('--bk-bg-opacity', String(v)); });
        U.range(th, 'Blur strength', parseFloat(t['--bk-blur']) || 14, 0, 30, 1, function (v) { setToken('--bk-blur', v + 'px'); });
        U.range(th, 'Typography scale', parseFloat(t['--bk-font-scale']) || 1, .8, 1.3, .05, function (v) { setToken('--bk-font-scale', String(v)); });
        var colors = [['--bk-primary', 'Primary color'], ['--bk-secondary', 'Secondary color'], ['--bk-accent', 'Accent color']];
        colors.forEach(function (p) {
            var i = mk('input', 'bk-swatch'); i.type = 'color'; i.value = currentTokens()[p[0]];
            i.addEventListener('input', function () { setToken(p[0], i.value); });
            U.row(th, p[1], i);
        });
        var save = mk('div', 'bk-tool-row');
        save.appendChild(btn('Áp dụng & Lưu', function () {
            window.__tokens.save(currentTokens()); tokenDraft = null; tokenDirty = false;
            toast('Đã lưu theme', 'success');
        }));
        save.appendChild(btn('Revert', function () {
            tokenDraft = null; window.__tokens.apply(window.__tokens.get()); toast('Đã hoàn tác', 'success');
        }, { alt: true }));
        th.appendChild(save);
    }
    buildTokens();

    /* refresh when tabs open */
    var sw = window.switchDevTab;
    if (typeof sw === 'function') {
        window.switchDevTab = function (t) {
            var r = sw.apply(this, arguments);
            if (t === 'anim') { syncStudioInfo(); renderRuns(); renderPresets(); measurePerf(); }
            if (t === 'studio') { buildStudioTools(); }
            if (t === 'ui') { buildTokens(); }
            if (t === 'fx') { buildFxPanel(); }
            return r;
        };
    }

    window.__studio = {
        S: S, LIB: LIB, build: buildStudio, play: playPreview, stop: stopPreview,
        css: cssFor, js: jsFor, kf: currentKf, presets: presets, savePreset: savePreset,
        STYLES: [['hand', 'Bàn tay kéo'], ['iris', 'Mở vòng tròn'], ['fade', 'Mờ dần'], ['curtain', 'Rèm buông'], ['zoom', 'Thu phóng'], ['blur', 'Mờ (blur)']]
    };
})();
/* =========================================================================
   Bakhi V4-C — Developer Toolkit: Audit, Debug, Advanced, Inspector extras,
   Performance snapshots, Command Palette, Help, schema-safe import/export.
   ========================================================================= */
(function () {
    'use strict';
    var U = window.__v4ui;
    if (!U) return;
    var D = document, $ = function (id) { return D.getElementById(id); }, qs = function (s, r) { return (r || D).querySelector(s); };
    var mk = U.mk, btn = U.btn, group = U.group, note = U.note, line = U.line, copy = U.copy;
    function toast(m, t) { try { showToast(m, t || 'success'); } catch (e) { console.log(m); } }
    function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Không lưu được ' + k, 'error'); return false; } }
    function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function num(v, a, b) { return typeof v === 'number' && isFinite(v) && v >= a && v <= b; }
    function label(el) {
        if (!el || !el.tagName) return '?';
        var s = el.tagName.toLowerCase();
        if (el.id) s += '#' + el.id;
        if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
        return s;
    }
    function inPanel(n) { return !!(n && n.closest && n.closest('#dev-panel-modal,#pal,#bkHelpModal,#bkV4Pick,#dvPick')); }
    function paneOpen(t) { var p = qs('[data-pane="' + t + '"]'); return p && !p.classList.contains('hidden'); }

    function locate(el) {
        if (!el || !el.isConnected) { toast('Phần tử không còn trong DOM', 'error'); return; }
        try { window.closeDevPanel(); } catch (e) {}
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
        var po = el.style.outline, pOf = el.style.outlineOffset;
        el.style.outline = '2px solid #f43f5e'; el.style.outlineOffset = '2px';
        setTimeout(function () {
            el.style.outline = po; el.style.outlineOffset = pOf;
            try { window.openDevPanel(); } catch (e) {}
        }, 1700);
    }

    /* =====================================================================
       A. Tab Công cụ — Audit / Scanner
       ===================================================================== */
    var toolsPane = qs('[data-pane="tools"]');
    var auditBox = null;

    function toolBlock(title, icon) {
        var g = group(auditBox, title, icon, false);
        var row = mk('div', 'bk-tool-row');
        g.appendChild(row);
        var o = mk('div', 'bk-out');
        g.appendChild(o);
        row.appendChild(btn('Copy Report', function () { copy(title + '\n' + o.textContent, 'Đã copy báo cáo'); }, { alt: true }));
        return { box: g, row: row, out: o };
    }
    function actionRow(container, el, extra) {
        var r = mk('div', 'bk-row');
        r.appendChild(mk('span', 'grow', label(el) + ' — ' + (el.textContent || '').trim().slice(0, 48)));
        r.appendChild(btn('Locate', function () { locate(el); }, { alt: true }));
        r.appendChild(btn('Copy Selector', function () { copy(window.uniqSel(el), 'Đã copy selector'); }, { alt: true }));
        if (extra) r.appendChild(extra);
        container.appendChild(r);
    }
    function reportSummary(o, ok, txt) { o.textContent = ''; line(o, ok ? 'ok' : 'err', (ok ? '✔ ' : '✖ ') + txt); }

    function buildAudit() {
        if (!toolsPane || auditBox) return;
        auditBox = group(toolsPane, 'Audit & Scanner V4', 'fa-magnifying-glass-chart', true);

        /* ---- Duplicate ID ---- */
        var b1 = toolBlock('Duplicate ID Scanner', 'fa-clone');
        b1.row.appendChild(btn('Quét ID trùng', function () {
            var map = {};
            Array.prototype.forEach.call(D.querySelectorAll('[id]'), function (el) {
                if (inPanel(el)) return;
                (map[el.id] = map[el.id] || []).push(el);
            });
            var bad = Object.keys(map).filter(function (k) { return map[k].length > 1; });
            reportSummary(b1.out, !bad.length, bad.length ? bad.length + ' ID bị trùng' : 'Không có ID trùng (' + Object.keys(map).length + ' ID)');
            var rows = [];
            bad.forEach(function (k) {
                map[k].forEach(function (el) { rows.push(k); actionRow(b1.out, el); });
            });
        }, { icon: 'fa-clone' }));

        /* ---- Empty elements ---- */
        var b2 = toolBlock('Empty Element Scanner', 'fa-eraser');
        b2.row.appendChild(btn('Quét phần tử rỗng', function () {
            var bad = [];
            Array.prototype.forEach.call(D.querySelectorAll('a,button,[role=button]'), function (el) {
                if (inPanel(el) || el.closest('.fab, #bkt')) return;
                var r = el.getBoundingClientRect();
                if (!r.width || !r.height) return;
                var txt = (el.textContent || '').trim();
                var hasIcon = !!el.querySelector('i,svg,img');
                var named = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('aria-labelledby') ||
                    (el.querySelector('img') && el.querySelector('img').getAttribute('alt'));
                if (!txt && !hasIcon && !named) bad.push(el);
            });
            reportSummary(b2.out, !bad.length, bad.length ? bad.length + ' phần tử không có nội dung/nhãn' : 'Mọi button/link đều có nội dung hoặc nhãn');
            bad.forEach(function (el) { actionRow(b2.out, el); });
        }, { icon: 'fa-magnifying-glass' }));

        /* ---- Anchors ---- */
        var b3 = toolBlock('Anchor Checker', 'fa-anchor');
        b3.row.appendChild(btn('Kiểm tra anchor nội bộ', function () {
            var bad = [];
            Array.prototype.forEach.call(D.querySelectorAll('a[href*="#"]'), function (a) {
                var href = a.getAttribute('href') || '';
                if (/^https?:/i.test(href) && href.indexOf(location.origin) !== 0) return;
                var hash = href.split('#')[1];
                if (!hash || hash.indexOf('!') === 0) return;
                var id = decodeURIComponent(hash);
                if (!D.getElementById(id)) bad.push({ a: a, id: id });
            });
            reportSummary(b3.out, !bad.length, bad.length ? bad.length + ' liên kết trỏ tới ID không tồn tại' : 'Mọi anchor nội bộ đều tồn tại');
            bad.forEach(function (x) {
                var r = mk('div', 'bk-row');
                r.appendChild(mk('span', 'grow', '#' + x.id + ' ← ' + (x.a.getAttribute('href') || '')));
                r.appendChild(btn('Locate', function () { locate(x.a); }, { alt: true }));
                b3.out.appendChild(r);
            });
        }, { icon: 'fa-link' }));

        /* ---- Images ---- */
        var b4 = toolBlock('Image Alt Checker', 'fa-image');
        b4.row.appendChild(btn('Kiểm tra alt của ảnh', function () {
            var bad = [];
            Array.prototype.forEach.call(D.images, function (img) {
                if (inPanel(img)) return;
                if (!img.hasAttribute('alt') || (img.getAttribute('alt') === '' && img.getAttribute('role') !== 'presentation')) bad.push(img);
            });
            reportSummary(b4.out, !bad.length, bad.length ? bad.length + '/' + D.images.length + ' ảnh thiếu alt' : 'Mọi ảnh (' + D.images.length + ') đều có alt');
            bad.forEach(function (img) { actionRow(b4.out, img); });
        }, { icon: 'fa-image' }));

        /* ---- Headings ---- */
        var b5 = toolBlock('Heading Structure Checker', 'fa-heading');
        b5.row.appendChild(btn('Kiểm tra thứ tự heading', function () {
            var hs = Array.prototype.filter.call(D.querySelectorAll('h1,h2,h3,h4,h5,h6'), function (h) { return !inPanel(h) && h.getBoundingClientRect().width; });
            var rows = [], lv = hs.map(function (h) { return Number(h.tagName[1]); });
            var h1 = lv.filter(function (x) { return x === 1; }).length;
            if (!h1) rows.push(['err', 'Không có H1 trên trang']);
            if (h1 > 1) rows.push(['warn', 'Có ' + h1 + ' thẻ H1 (nên có đúng 1)']);
            for (var i = 1; i < lv.length; i++) if (lv[i] - lv[i - 1] > 1) rows.push(['warn', 'Bỏ cấp: ' + hs[i - 1].tagName + ' → ' + hs[i].tagName]);
            rows.push(['ok', hs.length + ' heading · H1: ' + h1]);
            b5.out.textContent = '';
            rows.forEach(function (r) { line(b5.out, r[0], (r[0] === 'ok' ? '✔ ' : '! ') + r[1]); });
            hs.slice(0, 12).forEach(function (h) { actionRow(b5.out, h); });
        }, { icon: 'fa-list-ol' }));

        /* ---- Event diagnostic ---- */
        var b6 = toolBlock('Event Diagnostic', 'fa-bolt');
        var ev = { on: false, count: 0, log: [], handler: null, out: b6.out };
        function renderEv() {
            ev.out.textContent = '';
            line(ev.out, 'ok', 'Đang theo dõi: ' + (ev.on ? 'BẬT' : 'TẮT') + ' · ' + ev.count + ' sự kiện');
            ev.log.slice(0, 16).forEach(function (t) { line(ev.out, '', t); });
        }
        b6.row.appendChild(btn('Start', function () {
            if (ev.on) return;
            ev.on = true;
            ev.handler = function (e) {
                if (inPanel(e.target)) return;
                ev.count++;
                var t = (e.target.closest && e.target.closest('button,a,[role=button],input')) || e.target;
                ev.log.unshift(new Date().toLocaleTimeString() + ' · ' + e.type + ' · ' + label(t));
                if (ev.log.length > 40) ev.log.pop();
                renderEv();
            };
            ['click', 'pointerdown', 'keydown', 'submit'].forEach(function (n) { D.addEventListener(n, ev.handler, true); });
            renderEv();
        }, { icon: 'fa-play' }));
        b6.row.appendChild(btn('Stop', function () {
            if (!ev.on) return;
            ev.on = false;
            ['click', 'pointerdown', 'keydown', 'submit'].forEach(function (n) { D.removeEventListener(n, ev.handler, true); });
            renderEv();
        }, { alt: true }));
        b6.row.appendChild(btn('Clear', function () { ev.count = 0; ev.log = []; renderEv(); }, { alt: true }));
        renderEv();

        /* ---- DOM statistics ---- */
        var b7 = toolBlock('DOM Statistics', 'fa-sitemap');
        b7.row.appendChild(btn('Đo DOM', function () {
            var els = D.getElementsByTagName('*').length, nodes = 0, depth = 0;
            (function walk(n, d) {
                nodes++;
                if (d > depth) depth = d;
                for (var c = n.firstChild; c; c = c.nextSibling) walk(c, d + 1);
            })(D.documentElement, 0);
            var anims = 0; try { anims = D.getAnimations().length; } catch (e) {}
            b7.out.textContent = '';
            line(b7.out, 'ok', 'Element: ' + els + ' · Node: ' + nodes + ' · Độ sâu DOM: ' + depth);
            line(b7.out, '', 'Script: ' + D.scripts.length + ' · Stylesheet: ' + D.styleSheets.length + ' · Ảnh: ' + D.images.length + ' · Animation: ' + anims);
        }, { icon: 'fa-ruler-combined' }));

        /* ---- Quick element search ---- */
        var b8 = toolBlock('Quick Element Search', 'fa-magnifying-glass');
        var qi = U.text('ID, class hoặc tag...', '', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs flex-1 min-w-0');
        b8.row.appendChild(qi);
        b8.row.appendChild(btn('Tìm', function () {
            var q = qi.value.trim().toLowerCase();
            b8.out.textContent = '';
            if (!q) { line(b8.out, 'warn', 'Nhập từ khóa để tìm'); return; }
            var found = [];
            Array.prototype.forEach.call(D.querySelectorAll('*'), function (el) {
                if (inPanel(el) || found.length >= 40) return;
                if (el.tagName.toLowerCase() === q || el.id.toLowerCase().indexOf(q) >= 0 ||
                    (typeof el.className === 'string' && el.className.toLowerCase().indexOf(q) >= 0)) found.push(el);
            });
            line(b8.out, found.length ? 'ok' : 'warn', found.length ? found.length + ' kết quả' + (found.length >= 40 ? ' (giới hạn 40)' : '') : 'Không tìm thấy');
            found.forEach(function (el) { actionRow(b8.out, el); });
        }, { icon: 'fa-magnifying-glass' }));

        note(auditBox, 'Audit chỉ đọc DOM hiện tại, không sửa nội dung. “Locate” cuộn tới phần tử và tô viền tạm 1,7 giây.');
    }
    buildAudit();

    /* =====================================================================
       B. Tab Debug — console filter/search, errors, storage, mutations
       ===================================================================== */
    var dbgPane = qs('[data-pane="debug"]');
    var dbgBuilt = false, mut = { obs: null, on: false, count: 0, byType: {}, log: [] };

    function buildDebug() {
        if (!dbgPane || dbgBuilt) return;
        dbgBuilt = true;

        /* console */
        var g1 = group(dbgPane, 'Console Filter & Search', 'fa-filter', false);
        var flt = mk('select', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs');
        [['all', 'Tất cả'], ['log', 'Log'], ['warn', 'Warning'], ['error', 'Error'], ['promise', 'Promise Rejection']].forEach(function (o) {
            var op = mk('option', null, o[1]); op.value = o[0]; flt.appendChild(op);
        });
        var q = U.text('Tìm trong log...', '', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs flex-1 min-w-0');
        var r1 = mk('div', 'bk-tool-row');
        r1.appendChild(flt); r1.appendChild(q);
        r1.appendChild(btn('Làm mới', function () { renderConsole4(); }, { alt: true }));
        r1.appendChild(btn('Copy tất cả', function () {
            copy(logs4().join('\n'), 'Đã copy log');
        }, { alt: true }));
        g1.appendChild(r1);
        var logBox = mk('div', 'bk-out');
        g1.appendChild(logBox);
        flt.addEventListener('change', renderConsole4);
        q.addEventListener('input', renderConsole4);

        function logs4() {
            try { return typeof _logs !== 'undefined' ? _logs : []; } catch (e) { return []; }
        }
        function levelOf(l) {
            if (/\sERROR\s/.test(l)) return /Promise:/.test(l) ? 'promise' : 'error';
            if (/\sWARN\s/.test(l)) return 'warn';
            return 'log';
        }
        function renderConsole4() {
            logBox.textContent = '';
            var lv = flt.value, term = q.value.toLowerCase();
            var rows = logs4().filter(function (l) { return (lv === 'all' || levelOf(l) === lv) && (!term || l.toLowerCase().indexOf(term) >= 0); });
            if (!rows.length) { line(logBox, 'warn', 'Không có dòng log phù hợp'); return; }
            rows.slice(-80).forEach(function (l) {
                var r = mk('div', 'bk-row');
                var s = mk('span', 'grow', l);
                s.title = l;
                r.appendChild(s);
                r.appendChild(btn('Copy', function () { copy(l, 'Đã copy dòng log'); }, { alt: true }));
                logBox.appendChild(r);
            });
        }
        renderConsole4();

        /* error detail */
        var g2 = group(dbgPane, 'Error Detail', 'fa-triangle-exclamation', false);
        var eb = mk('div', 'bk-out');
        g2.appendChild(eb);
        g2.appendChild(btn('Làm mới lỗi', function () { renderErrors4(); }, { alt: true }));
        var stacks = [];
        window.addEventListener('error', function (e) {
            if (e.error && e.error.stack) stacks.unshift(String(e.error.stack).slice(0, 800));
            if (stacks.length > 20) stacks.pop();
            renderErrors4();
        });
        window.addEventListener('unhandledrejection', function (e) {
            var r = e.reason;
            stacks.unshift(String((r && (r.stack || r.message)) || r).slice(0, 800));
            if (stacks.length > 20) stacks.pop();
        });
        function renderErrors4() {
            eb.textContent = '';
            var errs = [];
            try { errs = typeof _errs !== 'undefined' ? _errs : []; } catch (e) { errs = []; }
            if (!errs.length) { line(eb, 'ok', 'Chưa ghi nhận lỗi nào trong phiên này.'); }
            errs.slice(-12).reverse().forEach(function (x, i) {
                var r = mk('div', 'bk-row');
                var s = mk('span', 'grow', '[' + (x.type || '?') + '] ' + (x.msg || '') + ' · ' + (x.src || '') + ' · ' + new Date(x.t).toLocaleTimeString());
                s.title = (x.msg || '') + '\n' + (x.src || '');
                r.appendChild(s);
                r.appendChild(btn('Copy', function () {
                    copy(JSON.stringify(x, null, 2) + (stacks[i] ? '\n\n' + stacks[i] : ''), 'Đã copy chi tiết lỗi');
                }, { alt: true }));
                eb.appendChild(r);
            });
            if (stacks.length) {
                var d = mk('div', 'bk-note');
                d.textContent = 'Stack gần nhất: ' + stacks[0].split('\n').slice(0, 3).join(' | ');
                eb.appendChild(d);
            }
        }
        renderErrors4();

        /* storage */
        var g3 = group(dbgPane, 'Storage Inspector', 'fa-hard-drive', false);
        var sq = U.text('Tìm key...', '', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs flex-1 min-w-0');
        var sf = mk('select', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs');
        [['both', 'Local + Session'], ['local', 'LocalStorage'], ['session', 'SessionStorage']].forEach(function (o) { var op = mk('option', null, o[1]); op.value = o[0]; sf.appendChild(op); });
        var ss = mk('select', 'px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs');
        [['key', 'Theo tên'], ['size', 'Theo dung lượng']].forEach(function (o) { var op = mk('option', null, o[1]); op.value = o[0]; ss.appendChild(op); });
        var r3 = mk('div', 'bk-tool-row');
        r3.appendChild(sq); r3.appendChild(sf); r3.appendChild(ss);
        r3.appendChild(btn('Làm mới', function () { renderStore4(); }, { alt: true }));
        g3.appendChild(r3);
        var sbox = mk('div', 'bk-out');
        g3.appendChild(sbox);
        note(g3, 'Không hiển thị hay xuất devToken. Sửa/xóa đều có xác nhận và tự sao lưu trước khi ghi.');
        [sq, sf, ss].forEach(function (x) { x.addEventListener(x.tagName === 'SELECT' ? 'change' : 'input', renderStore4); });

        function renderStore4() {
            sbox.textContent = '';
            var term = sq.value.toLowerCase(), mode = sf.value, sort = ss.value, rows = [];
            [['local', localStorage], ['session', sessionStorage]].forEach(function (p) {
                if (mode !== 'both' && mode !== p[0]) return;
                var keys = []; try { keys = Object.keys(p[1]); } catch (e) {}
                keys.forEach(function (k) {
                    var v = ''; try { v = p[1].getItem(k) || ''; } catch (e) {}
                    if (k === 'devToken') { rows.push({ k: k, s: p[1], v: '(ẩn)', sz: 0, hidden: true }); return; }
                    if (term && k.toLowerCase().indexOf(term) < 0) return;
                    rows.push({ k: k, s: p[1], v: v, sz: (k.length + v.length) * 2, hidden: false });
                });
            });
            if (sort === 'size') rows.sort(function (a, b) { return b.sz - a.sz; });
            else rows.sort(function (a, b) { return a.k.localeCompare(b.k); });
            if (!rows.length) { line(sbox, 'warn', 'Không có key phù hợp'); return; }
            rows.slice(0, 80).forEach(function (r) {
                var row = mk('div', 'bk-row');
                row.appendChild(mk('span', 'grow', r.k + ' · ' + (r.sz / 1024).toFixed(1) + 'KB'));
                if (!r.hidden) {
                    row.appendChild(btn('Copy', function () { copy(r.v, 'Đã copy value'); }, { alt: true }));
                    row.appendChild(btn('Export', function () {
                        var a = D.createElement('a');
                        a.href = URL.createObjectURL(new Blob([r.v], { type: 'application/json' }));
                        a.download = 'bakhi-' + r.k.replace(/[^a-z0-9._-]/gi, '_') + '.txt';
                        a.click();
                    }, { alt: true }));
                    row.appendChild(btn('Sửa', function () { try { window.editKey(r.s, r.k); } catch (e) {} renderStore4(); }, { alt: true }));
                    row.appendChild(btn('Xóa', function () { try { window.delKey(r.k, r.s); } catch (e) {} renderStore4(); }, { alt: true }));
                }
                sbox.appendChild(row);
            });
        }
        renderStore4();

        /* mutation monitor */
        var g4 = group(dbgPane, 'Mutation Monitor', 'fa-diagram-project', false);
        var r4 = mk('div', 'bk-tool-row');
        r4.appendChild(btn('Start', function () { mutStart(); }, { icon: 'fa-play' }));
        r4.appendChild(btn('Stop', function () { mutStop(true); }, { alt: true }));
        r4.appendChild(btn('Clear', function () { mut.count = 0; mut.byType = {}; mut.log = []; renderMut(); }, { alt: true }));
        g4.appendChild(r4);
        var mbox = mk('div', 'bk-out');
        mbox.id = 'bkV4Mut';
        g4.appendChild(mbox);
        note(g4, 'Observer tự dừng khi đóng Developer Panel hoặc rời tab Debug — không chạy nền.');

        function renderMut() {
            mbox.textContent = '';
            line(mbox, mut.on ? 'ok' : 'warn', (mut.on ? 'Đang theo dõi' : 'Đã dừng') + ' · ' + mut.count + ' mutation');
            var types = Object.keys(mut.byType);
            if (types.length) line(mbox, '', types.map(function (t) { return t + ': ' + mut.byType[t]; }).join(' · '));
            mut.log.slice(0, 14).forEach(function (t) { line(mbox, '', t); });
        }
        var mutDirty = false, mutTimer = 0;
        function scheduleMutRender() {
            // Không render ngay trong callback: render lại chính vùng đang bị theo dõi sẽ tự kích hoạt observer vô hạn.
            if (mutTimer) return;
            mutTimer = setTimeout(function () {
                mutTimer = 0;
                if (!mutDirty) return;
                mutDirty = false;
                renderMut();
            }, 450);
        }
        function mutStart() {
            if (mut.obs) return;
            mut.on = true;
            mutDirty = false;
            mut.obs = new MutationObserver(function (list) {
                var hit = 0;
                list.forEach(function (m) {
                    if (inPanel(m.target)) return;
                    hit++;
                    mut.byType[m.type] = (mut.byType[m.type] || 0) + 1;
                    if (mut.log.length < 60) mut.log.unshift(new Date().toLocaleTimeString() + ' · ' + m.type + ' · ' + label(m.target));
                });
                if (!hit) return;
                mut.count += hit;
                mutDirty = true;
                scheduleMutRender();
            });
            mut.obs.observe(D.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'id'] });
            renderMut();
        }
        function mutStop(silent) {
            if (mut.obs) { mut.obs.disconnect(); mut.obs = null; }
            if (mutTimer) { clearTimeout(mutTimer); mutTimer = 0; }
            mutDirty = false;
            mut.on = false;
            renderMut();
            if (!silent) toast('Đã dừng Mutation Monitor', 'success');
        }
        mut.stop = mutStop;
        renderMut();
    }
    buildDebug();

    /* =====================================================================
       C. Tab Nâng cao — layout inspectors
       ===================================================================== */
    var advPane = qs('[data-pane="adv"]');
    var advLive = { timer: 0, scrollRaf: 0 };

    function buildAdv4() {
        if (!advPane || $('bkV4Adv')) return;
        var host = group(advPane, 'Layout & Responsive Inspectors', 'fa-ruler-combined', false);
        host.id = 'bkV4Adv';

        /* breakpoint + viewport */
        var b1 = toolBlockIn(host, 'Responsive Breakpoint Inspector', 'fa-mobile-screen');
        var live = mk('div', 'bk-out');
        b1.box.appendChild(live);
        var BPS = [['base', 0], ['sm', 640], ['md', 768], ['lg', 1024], ['xl', 1280], ['2xl', 1536]];
        function bpUpdate() {
            if (!paneOpen('adv')) return;
            var w = innerWidth, cur = 'base', next = null;
            BPS.forEach(function (b) { if (w >= b[1]) cur = b[0]; else if (!next) next = b[0]; });
            var media = [['sm ≥640', matchMedia('(min-width:640px)').matches], ['md ≥768', matchMedia('(min-width:768px)').matches],
                ['lg ≥1024', matchMedia('(min-width:1024px)').matches], ['xl ≥1280', matchMedia('(min-width:1280px)').matches],
                ['2xl ≥1536', matchMedia('(min-width:1536px)').matches], ['dark', matchMedia('(prefers-color-scheme: dark)').matches],
                ['reduced-motion', matchMedia('(prefers-reduced-motion: reduce)').matches], ['hover', matchMedia('(hover: hover)').matches]];
            live.textContent = '';
            line(live, 'ok', 'Viewport: ' + w + '×' + innerHeight + ' @' + (devicePixelRatio || 1) + 'x · DPR devicePixelRatio');
            line(live, '', 'Breakpoint hiện tại: ' + cur + (next ? ' · breakpoint kế tiếp: ' + next : ' (lớn nhất)'));
            line(live, '', 'Tailwind tương ứng: ' + (cur === 'base' ? '< sm (mobile)' : cur + ' (≥' + (BPS.filter(function (b) { return b[0] === cur; })[0] || [0, 0])[1] + 'px)'));
            line(live, '', 'Media query: ' + media.map(function (m) { return m[0] + (m[1] ? ' ✓' : ' ✗'); }).join(' · '));
            line(live, 'warn', 'Đây chỉ là kích thước viewport hiện tại, không mô phỏng thiết bị cụ thể.');
        }
        b1.row.appendChild(btn('Cập nhật', bpUpdate, { alt: true }));
        b1.row.appendChild(btn('Theo dõi trực tiếp', function () {
            if (advLive.timer) { clearInterval(advLive.timer); advLive.timer = 0; toast('Đã dừng theo dõi', 'success'); return; }
            bpUpdate();
            advLive.timer = setInterval(function () {
                if (!$('dev-panel-modal') || $('dev-panel-modal').classList.contains('hidden') || !paneOpen('adv')) {
                    clearInterval(advLive.timer); advLive.timer = 0; return;
                }
                bpUpdate();
            }, 500);
        }, { icon: 'fa-satellite-dish' }));
        bpUpdate();

        /* z-index */
        var b2 = toolBlockIn(host, 'Z-index Inspector', 'fa-layer-group');
        b2.row.appendChild(btn('Quét z-index', function () {
            var rows = [];
            Array.prototype.forEach.call(D.querySelectorAll('body *'), function (el) {
                if (inPanel(el)) return;
                var z = getComputedStyle(el).zIndex;
                if (z !== 'auto' && z !== '0') rows.push({ el: el, z: parseInt(z) || 0 });
            });
            rows.sort(function (a, b) { return b.z - a.z; });
            b2.out.textContent = '';
            line(b2.out, 'ok', rows.length + ' phần tử có z-index');
            rows.slice(0, 20).forEach(function (r) { actionRow(b2.out, r.el, mk('span', 'bk-stat', 'z=' + r.z)); });
        }, { icon: 'fa-layer-group' }));

        /* positioning */
        var b3 = toolBlockIn(host, 'Position / Fixed Element Detector', 'fa-thumbtack');
        b3.row.appendChild(btn('Quét fixed/sticky/absolute', function () {
            var fixed = [], sticky = [], abs = [];
            Array.prototype.forEach.call(D.querySelectorAll('body *'), function (el) {
                if (inPanel(el)) return;
                var p = getComputedStyle(el).position;
                if (p === 'fixed') fixed.push(el); else if (p === 'sticky') sticky.push(el); else if (p === 'absolute') abs.push(el);
            });
            b3.out.textContent = '';
            line(b3.out, 'ok', 'fixed: ' + fixed.length + ' · sticky: ' + sticky.length + ' · absolute: ' + abs.length);
            fixed.slice(0, 8).forEach(function (el) { actionRow(b3.out, el, mk('span', 'bk-stat', 'fixed')); });
            sticky.slice(0, 6).forEach(function (el) { actionRow(b3.out, el, mk('span', 'bk-stat', 'sticky')); });
        }, { icon: 'fa-thumbtack' }));

        /* overflow */
        var b4 = toolBlockIn(host, 'Overflow Detector', 'fa-arrows-left-right');
        b4.row.appendChild(btn('Tìm tràn ngang', function () {
            var bad = [];
            Array.prototype.forEach.call(D.querySelectorAll('body *'), function (el) {
                if (inPanel(el) || bad.length > 40) return;
                if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
                    var cs = getComputedStyle(el);
                    if (cs.overflowX === 'visible' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') bad.push(el);
                }
            });
            b4.out.textContent = '';
            line(b4.out, bad.length ? 'warn' : 'ok', bad.length ? bad.length + ' phần tử có nội dung tràn ngang' : 'Không phát hiện tràn ngang');
            bad.slice(0, 20).forEach(function (el) { actionRow(b4.out, el); });
        }, { icon: 'fa-arrows-left-right' }));

        /* scroll */
        var b5 = toolBlockIn(host, 'Scroll Position Monitor', 'fa-scroll');
        var sOut = mk('div', 'bk-out');
        b5.box.appendChild(sOut);
        function scrollUpdate() {
            if (!paneOpen('adv')) return;
            var max = Math.max(1, D.documentElement.scrollHeight - innerHeight);
            sOut.textContent = 'scrollY: ' + Math.round(scrollY) + 'px · ' + (scrollY / max * 100).toFixed(1) + '% · ' +
                'còn lại: ' + Math.round(max - scrollY) + 'px · hướng cuộn: ' + (advLive.lastY != null && scrollY < advLive.lastY ? 'lên' : 'xuống');
            advLive.lastY = scrollY;
        }
        window.addEventListener('scroll', function () {
            if (advLive.scrollRaf) return;
            advLive.scrollRaf = requestAnimationFrame(function () { advLive.scrollRaf = 0; scrollUpdate(); });
        }, { passive: true });

        /* contrast */
        var b6 = toolBlockIn(host, 'Color Contrast Checker', 'fa-circle-half-stroke');
        var fg = mk('input', 'bk-swatch'); fg.type = 'color'; fg.value = '#6366f1';
        var bg = mk('input', 'bk-swatch'); bg.type = 'color'; bg.value = '#0f172a';
        var cOut = mk('div', 'bk-out');
        b6.row.appendChild(mk('span', 'text-[11px]', 'Chữ'));
        b6.row.appendChild(fg);
        b6.row.appendChild(mk('span', 'text-[11px]', 'Nền'));
        b6.row.appendChild(bg);
        b6.box.appendChild(cOut);
        function lum(h) {
            var c = [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }).map(function (v) {
                return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
            });
            return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
        }
        function contrast() {
            var l1 = lum(fg.value), l2 = lum(bg.value);
            var ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
            cOut.textContent = '';
            line(cOut, ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'warn' : 'err', 'Tỷ lệ tương phản: ' + ratio.toFixed(2) + ':1');
            line(cOut, '', 'WCAG AA (chữ thường ≥4.5): ' + (ratio >= 4.5 ? 'Đạt' : 'Không đạt') +
                ' · AA chữ lớn (≥3): ' + (ratio >= 3 ? 'Đạt' : 'Không đạt') +
                ' · AAA (≥7): ' + (ratio >= 7 ? 'Đạt' : 'Không đạt'));
        }
        fg.addEventListener('input', contrast);
        bg.addEventListener('input', contrast);
        contrast();
    }
    function toolBlockIn(parent, title, icon) {
        var g = group(parent, title, icon, false);
        var row = mk('div', 'bk-tool-row');
        g.appendChild(row);
        var o = mk('div', 'bk-out');
        g.appendChild(o);
        row.appendChild(btn('Copy Report', function () { copy(title + '\n' + o.textContent, 'Đã copy báo cáo'); }, { alt: true }));
        return { box: g, row: row, out: o };
    }
    buildAdv4();

    /* =====================================================================
       D. Tab Kiểm tra — class/ID editor, text preview, CSS tạm thời + undo
       ===================================================================== */
    var inspPane = qs('[data-pane="insp"]');
    function buildInsp() {
        if (!inspPane || $('bkV4Insp')) return;
        var host = group(inspPane, 'Element Editor — Class / ID / CSS tạm thời', 'fa-pen-to-square', false);
        host.id = 'bkV4Insp';

        var info = mk('div', 'bk-note', 'Chọn phần tử bằng nút “Chọn phần tử” ở trên.');
        host.appendChild(info);

        var classIn = U.text('class1 class2', '', 'w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[11px] font-mono');
        var idIn = U.text('element-id', '', 'w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[11px] font-mono');
        var cssIn = mk('textarea', 'w-full p-2 rounded-xl bg-slate-950 text-sky-300 font-mono text-[11px] outline-none');
        cssIn.rows = 3;
        cssIn.placeholder = 'vd: color: #f43f5e; padding: 4px;';
        var textPrev = mk('div', 'bk-out');
        textPrev.style.maxHeight = '80px';

        var grid = mk('div', 'bk-grid2');
        var l1 = mk('label', 'text-[11px]'); l1.appendChild(mk('div', 'bk-note', 'Class (cách nhau bởi khoảng trắng')); l1.appendChild(classIn);
        var l2 = mk('label', 'text-[11px]'); l2.appendChild(mk('div', 'bk-note', 'ID (chỉ chữ, số, -, _)')); l2.appendChild(idIn);
        grid.appendChild(l1); grid.appendChild(l2);
        host.appendChild(grid);
        host.appendChild(mk('div', 'bk-note', 'CSS tạm thời (inline style)'));
        host.appendChild(cssIn);
        host.appendChild(mk('div', 'bk-note', 'Text content preview'));
        host.appendChild(textPrev);

        var undoStack = [];
        function sel() { try { return window.DX && window.DX.getSel ? window.DX.getSel() : null; } catch (e) { return null; } }
        function snapshot(el) { return { cls: el.className, id: el.id, css: el.getAttribute('style') || '', text: el.textContent }; }
        function refresh() {
            var el = sel();
            if (!el || !el.isConnected) {
                info.textContent = 'Chưa chọn phần tử — dùng “Chọn phần tử” hoặc Element Picker.';
                return;
            }
            info.textContent = 'Đang sửa: ' + label(el) + ' · ' + Math.round(el.getBoundingClientRect().width) + '×' + Math.round(el.getBoundingClientRect().height);
            classIn.value = typeof el.className === 'string' ? el.className : '';
            idIn.value = el.id || '';
            cssIn.value = '';
            textPrev.textContent = (el.textContent || '').trim().slice(0, 300) || '(không có text)';
            try { renderVars(); } catch (e) {}
        }
        classIn.addEventListener('change', function () {
            var el = sel(); if (!el) return;
            undoStack.push({ el: el, s: snapshot(el) });
            if (undoStack.length > 40) undoStack.shift();
            el.className = classIn.value.trim();
            refresh();
        });
        idIn.addEventListener('change', function () {
            var el = sel(); if (!el) return;
            var v = idIn.value.trim();
            if (v && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(v)) { toast('ID không hợp lệ (bắt đầu bằng chữ, chỉ chữ/số/-/_)', 'error'); idIn.value = el.id; return; }
            if (v && D.querySelectorAll('#' + CSS.escape(v)).length > 1) { toast('ID đã tồn tại, không ghi đè', 'error'); idIn.value = el.id; return; }
            undoStack.push({ el: el, s: snapshot(el) });
            if (v) el.id = v; else el.removeAttribute('id');
            refresh();
        });
        cssIn.addEventListener('change', function () {
            var el = sel(); if (!el) return;
            if (cssIn.value.trim() === '') return;
            undoStack.push({ el: el, s: snapshot(el) });
            var parts = cssIn.value.split(';');
            parts.forEach(function (p) {
                var i = p.indexOf(':'); if (i < 0) return;
                var k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
                if (k && v && /^[a-z-]+$/i.test(k)) el.style.setProperty(k, v);
            });
            cssIn.value = '';
            toast('Đã áp dụng CSS tạm thời (có thể hoàn tác)', 'success');
            refresh();
        });
        host.appendChild(mk('div', 'bk-note', 'CSS variables đang áp dụng (:root)'));
        var varsBox = mk('div', 'bk-out');
        varsBox.style.maxHeight = '110px';
        host.appendChild(varsBox);
        function renderVars() {
            varsBox.textContent = '';
            window.__tokens.meta.forEach(function (m) {
                line(varsBox, '', m.k + ': ' + getComputedStyle(document.documentElement).getPropertyValue(m.k).trim());
            });
        }
        renderVars();

        host.appendChild(btn('Hoàn tác thay đổi', function () {
            var last = undoStack.pop();
            if (!last) { toast('Không có thay đổi để hoàn tác', 'error'); return; }
            if (!last.el.isConnected) { toast('Phần tử đã rời DOM', 'error'); return; }
            last.el.className = last.s.cls;
            if (last.s.id) last.el.id = last.s.id; else last.el.removeAttribute('id');
            last.el.setAttribute('style', last.s.css);
            refresh();
            toast('Đã hoàn tác', 'success');
        }, { alt: true, icon: 'fa-rotate-left' }));

        var sw = window.switchDevTab;
        if (typeof sw === 'function') {
            window.switchDevTab = function (t) { var r = sw.apply(this, arguments); if (t === 'insp') refresh(); return r; };
        }
        refresh();
    }
    buildInsp();

    /* =====================================================================
       E. Tab Hiệu năng — snapshot & so sánh
       ===================================================================== */
    var perfPane = qs('[data-pane="perf"]');
    var cls4 = { value: 0 };
    try {
        new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) cls4.value += e.value; }); })
            .observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}

    function buildPerf4() {
        if (!perfPane || $('bkV4Perf')) return;
        var host = group(perfPane, 'Performance Snapshot & Monitor', 'fa-camera', false);
        host.id = 'bkV4Perf';

        var live = mk('div', 'bk-out');
        host.appendChild(live);
        var row = mk('div', 'bk-tool-row');
        row.appendChild(btn('Chụp snapshot', function () { capture(); }, { icon: 'fa-camera' }));
        row.appendChild(btn('Export JSON', function () {
            var a = D.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(snaps, null, 2)], { type: 'application/json' }));
            a.download = 'bakhi-perf-snapshots.json';
            a.click();
        }, { alt: true }));
        row.appendChild(btn('Xóa so sánh', function () { snaps = []; render(); }, { alt: true }));
        host.appendChild(row);
        var table = mk('div', 'bk-out');
        table.style.maxHeight = '260px';
        host.appendChild(table);
        note(host, 'Số liệu chỉ lấy từ API trình duyệt hỗ trợ. Không có API (vd. performance.memory trên Firefox/Safari) thì hiển thị “không hỗ trợ”, không tạo số giả.');

        var snaps = [];

        /* live monitor — chỉ chạy khi người dùng bật và tab Hiệu năng đang mở */
        var mon = { timer: 0 };
        var monOut = mk('div', 'bk-out');
        host.appendChild(monOut);
        function monTick() {
            var anims = 0; try { anims = D.getAnimations().length; } catch (e) {}
            var lt = 0; try { lt = typeof _lt !== 'undefined' ? _lt : 0; } catch (e) {}
            var heap = null; try { heap = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + 'MB' : null; } catch (e) {}
            monOut.textContent = 'Long task: ' + lt + ' · DOM node (element): ' + D.getElementsByTagName('*').length +
                ' · Animation: ' + anims + ' · Layout shift: ' + cls4.value.toFixed(4) +
                ' · JS Heap: ' + (heap || 'không hỗ trợ (chỉ Chromium)');
        }
        row.appendChild(btn('Theo dõi trực tiếp', function () {
            if (mon.timer) { clearInterval(mon.timer); mon.timer = 0; return; }
            monTick();
            mon.timer = setInterval(function () {
                if (!paneOpen('perf') || !$('dev-panel-modal') || $('dev-panel-modal').classList.contains('hidden')) {
                    clearInterval(mon.timer); mon.timer = 0; return;
                }
                monTick();
            }, 1000);
        }, { alt: true, icon: 'fa-satellite-dish' }));

        function metrics() {
            return new Promise(function (resolve) {
                var t0 = performance.now(), frames = 0;
                (function tick() {
                    frames++;
                    if (performance.now() - t0 < 450) requestAnimationFrame(tick);
                    else {
                        var res = performance.getEntriesByType('resource');
                        var heap = null;
                        try { heap = performance.memory ? performance.memory.usedJSHeapSize : null; } catch (e) { heap = null; }
                        var anims = 0; try { anims = D.getAnimations().length; } catch (e) {}
                        resolve({
                            t: new Date().toISOString(),
                            fps: Math.round(frames * 1000 / (performance.now() - t0)),
                            domElements: D.getElementsByTagName('*').length,
                            animations: anims,
                            heapMB: heap ? +(heap / 1048576).toFixed(1) : null,
                            longTasks: (function () { try { return typeof _lt !== 'undefined' ? _lt : 0; } catch (e) { return 0; } })(),
                            resources: res.length,
                            transferKB: Math.round(res.reduce(function (s, r) { return s + (r.transferSize || 0); }, 0) / 1024),
                            layoutShift: +cls4.value.toFixed(4)
                        });
                    }
                })();
            });
        }
        function capture() {
            metrics().then(function (m) {
                snaps.push(m);
                if (snaps.length > 2) snaps.shift();
                render();
                toast('Đã chụp snapshot', 'success');
            });
        }
        function render() {
            live.textContent = '';
            table.textContent = '';
            if (!snaps.length) { line(live, 'warn', 'Chưa có snapshot — bấm “Chụp snapshot”.'); return; }
            var a = snaps[0], b = snaps[1];
            line(live, 'ok', 'Đã chụp ' + snaps.length + ' snapshot' + (snaps.length === 2 ? ' — đang so sánh A (cũ) với B (mới)' : ''));
            var keys = [['fps', 'FPS'], ['domElements', 'DOM element'], ['animations', 'Animation'], ['heapMB', 'JS Heap (MB)'], ['longTasks', 'Long task'], ['resources', 'Resource'], ['transferKB', 'Dung lượng (KB)'], ['layoutShift', 'Layout shift']];
            keys.forEach(function (k) {
                var av = a[k[0]], bv = b ? b[k[0]] : null;
                var d = b && av != null && bv != null ? (bv - av) : null;
                var rowEl = mk('div', 'bk-row');
                var txt = k[1] + ': ' + (av == null ? 'không hỗ trợ' : av) + (b ? ' → ' + (bv == null ? 'không hỗ trợ' : bv) : '');
                if (d != null) txt += ' (' + (d > 0 ? '+' : '') + (Math.round(d * 100) / 100) + ')';
                rowEl.appendChild(mk('span', 'grow', txt));
                table.appendChild(rowEl);
            });
        }
        render();
    }
    buildPerf4();

    /* =====================================================================
       F. Animation scope controls (toàn trang vs phần tử)
       ===================================================================== */
    function buildAnimScope() {
        var pane = qs('[data-pane="anim"]');
        if (!pane || $('bkV4Scope')) return;
        var host = group(pane, 'Điều khiển animation: toàn trang / phần tử đang chọn', 'fa-sliders', false);
        host.id = 'bkV4Scope';
        var scope = 'all';
        var lbl = mk('div', 'bk-note', 'Phạm vi: toàn trang');
        U.select(host, 'Phạm vi điều khiển', [['all', 'Toàn trang'], ['element', 'Chỉ phần tử đang chọn']], 'all', function (v) {
            scope = v;
            var el = window.DX && window.DX.getSel ? window.DX.getSel() : null;
            lbl.textContent = 'Phạm vi: ' + (v === 'element' ? (el ? label(el) : 'chưa chọn phần tử') : 'toàn trang');
        });
        host.appendChild(lbl);
        var row = mk('div', 'bk-tool-row');
        row.appendChild(btn('Pause', function () { window.DX.an('pause', 0, scope); }, { alt: true }));
        row.appendChild(btn('Play', function () { window.DX.an('play', 0, scope); }, { alt: true }));
        row.appendChild(btn('Reset', function () { window.DX.an('reset', 0, scope); }, { alt: true }));
        row.appendChild(btn('Rate 0.25×', function () { window.DX.an('rate', .25, scope); }, { alt: true }));
        row.appendChild(btn('Rate 1×', function () { window.DX.an('rate', 1, scope); }, { alt: true }));
        host.appendChild(row);
        note(host, 'Chọn “Chỉ phần tử” để không ảnh hưởng animation toàn trang. Danh sách animation của Studio nằm ở nhóm phía trên và chỉ hủy animation do Studio tạo.');
    }
    buildAnimScope();

    /* =====================================================================
       G. System status bar + tab tracking + cleanup
       ===================================================================== */
    var modal = $('dev-panel-modal');
    var sysTimer = 0;
    var devCfg = read('bakhiDevCfg', { tab: 'fx' });
    if (!isObj(devCfg)) devCfg = { tab: 'fx' };

    function sysUpdate() {
        var bar = $('bkSysBar');
        if (!bar) return;
        var kb = 0;
        try { for (var k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) kb += (k.length + (localStorage[k] || '').length) * 2; } catch (e) {}
        var anims = 0; try { anims = D.getAnimations().length; } catch (e) {}
        bar.textContent = '';
        bar.appendChild(mk('span', null, 'FX ' + (window.__fx ? window.__fx.info() : '?')));
        bar.appendChild(mk('span', null, 'Anim ' + (window.__anim && window.__anim.cfg.on ? 'ON' : 'OFF') + ' · speed ' + (window.__anim ? window.__anim.cfg.speed : '?') + '×'));
        bar.appendChild(mk('span', null, 'getAnimations ' + anims));
        bar.appendChild(mk('span', null, 'Storage ' + (kb / 1024).toFixed(1) + 'KB'));
        bar.appendChild(mk('span', null, 'Theme ' + (D.documentElement.classList.contains('dark') ? 'dark' : 'light') + ' · lite ' + (D.documentElement.classList.contains('lite') ? 'ON' : 'off')));
        var h = btn('Phím tắt', openHelp, { alt: true, icon: 'fa-keyboard' });
        h.style.padding = '.15rem .5rem';
        bar.appendChild(h);
    }

    if (modal) {
        var inner = modal.firstElementChild;
        if (inner && !$('bkSysBar')) {
            var bar = mk('div', 'bk-sysbar');
            bar.id = 'bkSysBar';
            inner.appendChild(bar);
        }
        new MutationObserver(function () {
            var open = !modal.classList.contains('hidden');
            if (open) {
                sysUpdate();
                if (!sysTimer) sysTimer = setInterval(function () {
                    if (modal.classList.contains('hidden')) { clearInterval(sysTimer); sysTimer = 0; return; }
                    if (!paneOpen('debug') && !paneOpen('adv') && !paneOpen('perf')) sysUpdate();
                }, 3000);
            } else {
                if (sysTimer) { clearInterval(sysTimer); sysTimer = 0; }
                if (mut.stop) mut.stop(true);
                if (advLive.timer) { clearInterval(advLive.timer); advLive.timer = 0; }
            }
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    var sw2 = window.switchDevTab;
    if (typeof sw2 === 'function') {
        window.switchDevTab = function (t) {
            var r = sw2.apply(this, arguments);
            if (DEV_TAB_OK(t)) { devCfg.tab = t; store('bakhiDevCfg', devCfg); }
            if (t !== 'debug' && mut.stop) mut.stop(true);
            if (t !== 'adv' && advLive.timer) { clearInterval(advLive.timer); advLive.timer = 0; }
            sysUpdate();
            return r;
        };
    }
    function DEV_TAB_OK(t) {
        try { return typeof DEV_TABS !== 'undefined' && DEV_TABS.indexOf(t) >= 0; } catch (e) { return false; }
    }

    /* =====================================================================
       H. Help modal
       ===================================================================== */
    var SHORTCUTS = [
        ['Ctrl + Shift + D', 'Mở / đóng Developer Panel (khi đã xác thực)'],
        ['Ctrl + Shift + F', 'Bật / tắt đồng hồ FPS'],
        ['Ctrl + Shift + M', 'Bắn sao băng nổ'],
        ['Ctrl + Shift + E', 'Mở / đóng mọi thư mục môn'],
        ['Ctrl + Shift + H', 'Mở cửa sổ trợ giúp phím tắt'],
        ['Ctrl + K', 'Command Palette'],
        ['Ctrl + /', 'Mở menu và focus ô tìm kiếm'],
        ['↑ / ↓', 'Di chuyển trong Command Palette'],
        ['Enter', 'Chạy lệnh đang chọn / gửi mã Developer'],
        ['Esc', 'Đóng modal, palette, element picker'],
        ['Trong ô nhập / REPL', 'Phím tắt của panel không kích hoạt để tránh xung đột']
    ];
    function openHelp() {
        var m = $('bkHelpModal');
        if (!m) {
            m = mk('div', 'hidden fixed inset-0 z-[9997] bg-slate-950/80 flex items-center justify-center p-4');
            m.id = 'bkHelpModal';
            var card = mk('div', 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden');
            var head = mk('div', 'px-5 py-3.5 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between');
            var title = mk('div', 'flex items-center gap-2.5');
            title.appendChild(mk('i', 'fa-solid fa-keyboard text-indigo-500 text-lg'));
            title.appendChild(mk('b', null, 'Phím tắt & trợ giúp'));
            var close = btn('×', function () { m.classList.add('hidden'); }, { alt: true });
            head.appendChild(title); head.appendChild(close);
            var bodyBox = mk('div', 'p-5 overflow-y-auto text-slate-700 dark:text-slate-300');
            SHORTCUTS.forEach(function (s) {
                var row = mk('div', 'bk-help-row');
                row.appendChild(mk('span', null, s[1]));
                row.appendChild(mk('span', 'bk-kbd', s[0]));
                bodyBox.appendChild(row);
            });
            bodyBox.appendChild(mk('div', 'bk-note', 'Mã Developer chỉ là khóa giao diện phía client, không phải xác thực bảo mật. REPL chạy JavaScript thật trong trang và KHÔNG phải sandbox — không tự động chạy snippet/JS từ file import.'));
            card.appendChild(head); card.appendChild(bodyBox);
            m.appendChild(card);
            m.addEventListener('mousedown', function (e) { if (e.target === m) m.classList.add('hidden'); });
            D.body.appendChild(m);
        }
        m.classList.remove('hidden');
        var first = m.querySelector('button');
        if (first) first.focus();
    }
    window.__bkHelp = openHelp;

    /* =====================================================================
       I. Command Palette (thay palette cũ bằng bản nhóm + phím mũi tên)
       ===================================================================== */
    function cmds() {
        var list = [];
        var devTabs = [['fx', 'Hiệu ứng'], ['tools', 'Công cụ / Audit'], ['data', 'Dữ liệu'], ['ui', 'Giao diện'], ['debug', 'Debug'], ['anim', 'Animation Studio'], ['adv', 'Nâng cao'], ['insp', 'Kiểm tra (Inspector)'], ['perf', 'Hiệu năng'], ['studio', 'Studio'], ['bk', 'Bakhi']];
        var dev = devTabs.map(function (t) {
            return { group: 'Developer', name: 'Mở tab ' + t[1], run: function () { window.openDevPanel(); window.switchDevTab(t[0]); } };
        });
        dev.unshift({ group: 'Developer', name: 'Mở bảng điều khiển Developer', key: 'Ctrl+Shift+D', run: function () { window.openDevPanel(); } });
        dev.push({ group: 'Developer', name: 'Chọn phần tử (Element Picker)', run: function () { window.DX.pick(); } });
        dev.push({ group: 'Developer', name: 'Mở Animation Studio', run: function () { window.openDevPanel(); window.switchDevTab('anim'); } });
        dev.push({ group: 'Developer', name: 'Mở Inspector', run: function () { window.openDevPanel(); window.switchDevTab('insp'); } });
        dev.push({ group: 'Developer', name: 'Mở Audit / Công cụ', run: function () { window.openDevPanel(); window.switchDevTab('tools'); } });
        dev.push({ group: 'Developer', name: 'Export Settings (JSON)', run: function () { window.exportSettings(); } });
        dev.push({ group: 'Developer', name: 'Tạo sao lưu thủ công', run: function () { window.makeBackupUi(); } });
        dev.push({ group: 'Developer', name: 'Xem phím tắt', key: 'Ctrl+Shift+H', run: openHelp });

        var A = window.__anim.cfg;
        var fx = [
            { name: 'Bật/tắt toàn bộ hiệu ứng', run: function () { A.on = !A.on; window.__anim.save(); window.__anim.apply(); toast('Hiệu ứng: ' + (A.on ? 'BẬT' : 'TẮT')); } },
            { name: 'Bật/tắt Aurora background', run: function () { A.aurora.on = !A.aurora.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Bật/tắt Cursor spotlight', run: function () { A.spotlight.on = !A.spotlight.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Bật/tắt Card tilt', run: function () { A.tilt.on = !A.tilt.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Bật/tắt Magnetic hover', run: function () { A.magnetic.on = !A.magnetic.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Bật/tắt Glass shimmer', run: function () { A.shimmer.on = !A.shimmer.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Bật/tắt Scroll reveal', run: function () { A.reveal.on = !A.reveal.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Bật/tắt Click ripple', run: function () { A.ripple.on = !A.ripple.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Bật/tắt Micro-interactions', run: function () { A.micro.on = !A.micro.on; window.__anim.save(); window.__anim.apply(); } },
            { name: 'Tắt tất cả animation (Disable All)', run: function () { A.on = false; window.__anim.save(); window.__anim.apply(); toast('Đã tắt toàn bộ animation'); } },
            { name: 'Sao băng nổ', run: function () { window.__fx.shot(); } },
            { name: 'Chế độ máy yếu (lite)', run: function () { var f = window.__fx; window.setFx('quality', f.cfg.quality === 'lite' ? 'auto' : 'lite'); toast('Chất lượng hiệu ứng: ' + f.cfg.quality); } }
        ].map(function (c) { c.group = 'Hiệu ứng'; return c; });

        var uiCmds = [
            { name: 'Đổi giao diện sáng/tối', run: function () { window.toggleDarkMode(); } },
            { name: 'Mở/đóng mọi thư mục', key: 'Ctrl+Shift+E', run: function () { window.expandAll(!document.querySelector('#categoriesTree .folder-content.open')); } },
            { name: 'Bật/tắt đồng hồ FPS', key: 'Ctrl+Shift+F', run: function () { window.setUi('fps', !uiCfg.fps); } },
            { name: 'Mở README', run: function () { window.openReadmeModal(); } },
            { name: 'Xóa cache & tải lại', run: function () { window.hardReload(); } },
            { name: 'Xuất cài đặt', run: function () { window.exportSettings(); } },
            { name: 'Nhập cài đặt (chọn file)', run: function () { window.openDevPanel(); window.switchDevTab('data'); var i = document.querySelector('[data-pane="data"] input[type=file]'); if (i) i.click(); } }
        ].map(function (c) { c.group = 'Giao diện & dữ liệu'; return c; });

        return dev.concat(fx, uiCmds);
    }

    function v4Palette() {
        var old = $('pal');
        if (old) { old.remove(); return; }
        var p = mk('div', 'fixed inset-0 z-[9996] bg-slate-950/70 flex items-start justify-center pt-20 px-4');
        p.id = 'pal';
        var card = mk('div', 'w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden');
        var input = mk('input', 'w-full px-4 py-3 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100');
        input.placeholder = 'Gõ tên lệnh… (↑↓ chọn, Enter chạy, Esc đóng)';
        var listBox = mk('div', 'max-h-80 overflow-y-auto text-xs');
        card.appendChild(input); card.appendChild(listBox);
        p.appendChild(card);
        D.body.appendChild(p);
        var active = 0, flat = [];

        function render() {
            var q = input.value.toLowerCase().trim();
            var all = cmds();
            flat = all.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) >= 0 || (c.group || '').toLowerCase().indexOf(q) >= 0; });
            active = Math.min(active, Math.max(0, flat.length - 1));
            listBox.textContent = '';
            if (!flat.length) { listBox.appendChild(mk('div', 'px-4 py-3 opacity-60', 'Không có lệnh phù hợp')); return; }
            var lastGroup = null;
            flat.forEach(function (c, i) {
                if (c.group !== lastGroup) {
                    listBox.appendChild(mk('div', 'bk-cmd-group', c.group));
                    lastGroup = c.group;
                }
                var b = mk('button', 'bk-cmd' + (i === active ? ' on' : ''));
                b.appendChild(mk('span', 'grow', c.name));
                if (c.key) b.appendChild(mk('kbd', null, c.key));
                b.addEventListener('click', function () { run(c); });
                b.addEventListener('mousemove', function () { if (active !== i) { active = i; paint(); } });
                listBox.appendChild(b);
            });
            function paint() {
                Array.prototype.forEach.call(listBox.querySelectorAll('.bk-cmd'), function (el, i) { el.classList.toggle('on', i === active); });
                var cur = listBox.querySelectorAll('.bk-cmd')[active];
                if (cur) cur.scrollIntoView({ block: 'nearest' });
            }
            paint();
        }
        function run(c) { p.remove(); try { c.run(); } catch (e) { toast('Lệnh lỗi: ' + e.message, 'error'); } }
        input.addEventListener('input', function () { active = 0; render(); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { p.remove(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(flat.length - 1, active + 1); render(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
            if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) run(flat[active]); }
        });
        p.addEventListener('mousedown', function (e) { if (e.target === p) p.remove(); });
        render();
        input.focus();
    }
    window.palette = v4Palette;

    /* =====================================================================
       J. Storage: export/import schema v4 (an toàn, có giới hạn)
       ===================================================================== */
    var BKT_STYLES = ['hand', 'iris', 'fade', 'curtain', 'zoom', 'blur'];

    function v4ValidTokens(o) {
        if (!isObj(o)) return null;
        var out = {}, meta = window.__tokens.meta;
        for (var i = 0; i < meta.length; i++) {
            var m = meta[i];
            if (!(m.k in o)) continue;
            var v = o[m.k];
            if (m.type === 'color') { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) return null; out[m.k] = v.toLowerCase(); }
            else {
                var n = parseFloat(v);
                if (!isFinite(n) || n < m.min || n > m.max) return null;
                out[m.k] = String(v);
            }
        }
        return Object.keys(out).length ? out : null;
    }
    function v4ValidPresets(arr) {
        if (!Array.isArray(arr) || arr.length > 40) return null;
        var ok = arr.every(function (p) {
            return isObj(p) && typeof p.name === 'string' && p.name.trim() && p.name.length <= 60 &&
                typeof p.type === 'string' && Array.isArray(p.kf) && p.kf.length >= 2 && p.kf.length <= 12 &&
                num(p.duration, 16, 60000) && num(p.delay, 0, 60000) && num(p.rate, .05, 8) &&
                typeof p.easing === 'string' && p.easing.length <= 40 &&
                typeof p.iterations === 'string' && typeof p.direction === 'string' && typeof p.fill === 'string';
        });
        if (!ok) return null;
        return arr.map(function (p) {
            return {
                id: 'p' + Math.random().toString(36).slice(2, 9), name: p.name.slice(0, 60), type: p.type,
                kf: p.kf.slice(0, 12), duration: p.duration, delay: p.delay, easing: p.easing.slice(0, 40),
                iterations: p.iterations, direction: p.direction, fill: p.fill, rate: p.rate,
                customFrom: typeof p.customFrom === 'string' ? p.customFrom.slice(0, 500) : '',
                customTo: typeof p.customTo === 'string' ? p.customTo.slice(0, 500) : ''
            };
        });
    }

    window.exportSettings = function () {
        var studio = read('bakhiStudioCfg', {});
        var payload = {
            app: 'bakhi', version: SCHEMA_VER, exportedAt: new Date().toISOString(),
            highlights: getHighlightsData(), fx: window.__fx.cfg, ui: uiCfg,
            hiddenSubjects: getHidden(), fav: window.__fav.cf, bkt: window.__bkt.cfg,
            theme: localStorage.getItem('theme'), bgOpacity: localStorage.getItem('bgOpacity'),
            anim: window.__anim.cfg,
            animPresets: window.__studio ? window.__studio.presets() : [],
            themeTokens: window.__tokens.get(),
            dev: { tab: devCfg.tab },
            studio: {
                type: studio.type, duration: studio.duration, delay: studio.delay, easing: studio.easing,
                iterations: studio.iterations, direction: studio.direction, fill: studio.fill, rate: studio.rate,
                css: typeof studio.css === 'string' ? studio.css.slice(0, 20000) : ''
            }
        };
        dlJson('bakhi-settings.json', payload);
    };

    window.importSettings = function (ev) {
        var f = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!f) return;
        if (f.size > 400 * 1024) { toast('File quá lớn (tối đa 400KB)', 'error'); return; }
        f.text().then(function (txt) {
            var d = JSON.parse(txt);
            if (!isObj(d)) throw new Error('JSON gốc phải là object');
            if (d.app && d.app !== 'bakhi') throw new Error('không phải file cài đặt Bakhi');
            var ver = Number(d.version || 1);
            if (!isFinite(ver) || ver > SCHEMA_VER) throw new Error('file thuộc phiên bản mới hơn (' + ver + ')');
            var o = {}, bad = [];

            if ('highlights' in d) {
                var v = validHl(d.highlights);
                v ? o.appHighlightsDataMap = Object.assign({}, getHighlightsData(), v) : bad.push('highlights');
            }
            if ('fx' in d) {
                var fv = validFx(d.fx);
                fv ? o.fxCfg = Object.assign({}, window.__fx.cfg, fv) : bad.push('fx');
            }
            if ('ui' in d) {
                var u = d.ui;
                if (isObj(u) && num(u.font, 80, 130) && [1, 2, 3].indexOf(u.cols) >= 0 && ['paths', 'outline', 'fps'].every(function (k) { return typeof u[k] === 'boolean'; }))
                    o.uiCfg = { font: u.font, cols: u.cols, paths: u.paths, outline: u.outline, fps: u.fps };
                else bad.push('ui');
            }
            if ('hiddenSubjects' in d) {
                var h = d.hiddenSubjects;
                (Array.isArray(h) && h.every(function (x) { return subjects.some(function (s) { return s.id === x; }); }))
                    ? o.hiddenSubjects = Array.from(new Set(h)) : bad.push('hiddenSubjects');
            }
            if ('fav' in d) { isObj(d.fav) && typeof d.fav.on === 'boolean' ? o.favCfg = { on: d.fav.on } : bad.push('fav'); }
            if ('bkt' in d) {
                var b = d.bkt;
                (isObj(b) && typeof b.on === 'boolean' && BKT_STYLES.indexOf(b.style) >= 0 && num(b.speed, .5, 3))
                    ? o.bktCfg = { on: b.on, style: b.style, speed: b.speed } : bad.push('bkt');
            }
            if (d.theme != null) { ['dark', 'light'].indexOf(d.theme) >= 0 ? o.theme = d.theme : bad.push('theme'); }
            if (d.bgOpacity != null) { num(+d.bgOpacity, .5, .98) ? o.bgOpacity = String(+d.bgOpacity) : bad.push('bgOpacity'); }
            if ('anim' in d) {
                if (isObj(d.anim)) o.bakhiAnimCfg = window.__anim.sanitize(window.__anim.merge(window.__anim.DEF, d.anim));
                else bad.push('anim');
            }
            if ('themeTokens' in d) {
                var t = v4ValidTokens(d.themeTokens);
                t ? o.bakhiThemeTokens = t : bad.push('themeTokens');
            }
            if ('animPresets' in d) {
                var pr = v4ValidPresets(d.animPresets);
                pr ? o.bakhiAnimPresets = pr : bad.push('animPresets');
            }
            if ('dev' in d) {
                if (isObj(d.dev) && typeof d.dev.tab === 'string' && DEV_TAB_OK(d.dev.tab)) o.bakhiDevCfg = { tab: d.dev.tab };
                else bad.push('dev');
            }
            if ('studio' in d) {
                var st = d.studio;
                if (isObj(st)) {
                    var clean = {};
                    if (typeof st.type === 'string' && st.type.length <= 30) clean.type = st.type;
                    ['duration', 'delay', 'rate'].forEach(function (k) { if (num(st[k], 0, 60000)) clean[k] = st[k]; });
                    ['easing', 'iterations', 'direction', 'fill'].forEach(function (k) { if (typeof st[k] === 'string' && st[k].length <= 40) clean[k] = st[k]; });
                    if (typeof st.css === 'string' && st.css.length <= 20000) clean.css = st.css;
                    o.bakhiStudioCfg = clean;
                } else bad.push('studio');
            }
            if (bad.length) throw new Error('dữ liệu không hợp lệ: ' + bad.join(', '));
            if (!Object.keys(o).length) throw new Error('không có cấu hình nào được hỗ trợ');

            makeBackup('trước khi nhập file v4');
            Object.keys(o).forEach(function (k) {
                localStorage.setItem(k, typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k]));
            });
            showToast('Đã nhập cài đặt (đã sao lưu bản cũ), đang tải lại...', 'success');
            setTimeout(function () { location.reload(); }, 700);
        }).catch(function (e) { showToast('Nhập thất bại: ' + e.message, 'error'); });
    };

    /* =====================================================================
       K. Keyboard: không xung đột với ô nhập / REPL; Ctrl+Shift+H
       ===================================================================== */
    function typing(el) {
        if (!el) return false;
        var t = el.tagName;
        return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable || (el.closest && el.closest('[contenteditable="true"],#replIn'));
    }
    D.addEventListener('keydown', function (e) {
        if (!typing(e.target)) return;
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) e.stopPropagation();
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') e.stopPropagation();
    }, true);
    D.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') {
            if (typing(e.target)) return;
            e.preventDefault();
            openHelp();
        }
        if (e.key === 'Escape' && $('pal')) $('pal').remove();
    });

    /* expose for debugging/automation */
    window.__devtools = {
        audit: buildAudit, debug: buildDebug, adv: buildAdv4, perf: buildPerf4,
        help: openHelp, palette: v4Palette, mutation: mut, locate: locate,
        exportSettings: window.exportSettings, importSettings: window.importSettings
    };
})();
