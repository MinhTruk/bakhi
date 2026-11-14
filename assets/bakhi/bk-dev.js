/* =========================================================================
   Bá Khí — bk-dev.js : Developer Playground 2.0
   ---------------------------------------------------------------------
   Cửa sổ nổi (kéo/đổi kích thước/thu nhỏ/phóng to, nhớ vị trí & tab),
   gồm: Inspector 2.0, CSS Studio, Animation Studio, Performance Lab,
   Storage Manager, Console Pro, Network Monitor, Theme Editor,
   Component Library, Backup Manager.

   - Không sửa file nguồn của dự án; mọi thay đổi CSS/theme chỉ là preview
     tạm thời (lưu trong localStorage của trình duyệt).
   - Bảo vệ dữ liệu quan trọng khi xoá trong Storage Manager.
   - Không lấy cắp hay gửi dữ liệu ra ngoài.
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    var BK = global.BK;
    if (!D || !BK || global.BKDev) return;

    var el = BK.ui.el;
    var esc = BK.util.esc;
    var clamp = BK.util.clamp;
    var UI_KEY = 'bk.dev.ui.v1';

    /* CSS */
    (function () {
        if (D.getElementById('bk-css-dev')) return;
        var link = D.createElement('link');
        link.id = 'bk-css-dev'; link.rel = 'stylesheet';
        link.href = BK.util.basePath() + 'assets/bakhi/bk-dev.css';
        (D.head || D.documentElement).appendChild(link);
    })();

    /* ------------------------------ Helpers ------------------------------ */
    function btn(label, cls, icon, fn) {
        var b = el('button', 'bk-btn ' + (cls || 'bk-btn-ghost bk-btn-sm'));
        b.type = 'button';
        if (icon) b.appendChild(el('i', 'fa-solid ' + icon));
        if (label) b.appendChild(D.createTextNode(label));
        if (fn) b.addEventListener('click', fn);
        return b;
    }
    function h4(text) { return el('div', 'bkdev-h4', text); }
    function note(text) { return el('div', 'bkdev-note', text); }
    function row() {
        var r = el('div', 'bkdev-row');
        for (var i = 0; i < arguments.length; i++) if (arguments[i]) r.appendChild(arguments[i]);
        return r;
    }
    function field(label, input) {
        var f = el('label', 'bkdev-field');
        f.appendChild(el('span', null, label));
        f.appendChild(input);
        if (input && !input.getAttribute('aria-label') && input.tagName !== 'LABEL') input.setAttribute('aria-label', label);
        return f;
    }
    function input(type, value) {
        var i = el('input', 'bk-input');
        i.type = type || 'text';
        if (value != null) i.value = String(value);
        return i;
    }
    function txtArea(value, rows) {
        var t = el('textarea', 'bk-textarea');
        t.value = value || '';
        t.rows = rows || 5;
        return t;
    }
    function selectOpts(pairs, value) {
        var s = el('select', 'bk-select');
        pairs.forEach(function (p) {
            var o = el('option', null, p[1]);
            o.value = p[0];
            s.appendChild(o);
        });
        if (value != null) s.value = value;
        return s;
    }
    function outBox() { return el('pre', 'bkdev-out'); }
    function download(name, text, mime) { BK.util.download(name, text, mime); }
    function bytes(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(2) + ' MB';
    }
    /** Đọc Performance entries an toàn (một số trình duyệt/WebView không hỗ trợ). */
    function perfEntries(type) {
        try {
            return (global.performance && typeof performance.getEntriesByType === 'function' && performance.getEntriesByType(type)) || [];
        } catch (e) { return []; }
    }

    function read(key, def) {
        try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; }
    }
    function write(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }

    /* --------------------------- Panel state ----------------------------- */
    var ui = read(UI_KEY, {}) || {};
    var panel = null, bodyEl = null, tabBar = null, built = {}, current = 'inspector';
    var lastFocus = null;

    function saveUI(patch) {
        Object.keys(patch || {}).forEach(function (k) { ui[k] = patch[k]; });
        write(UI_KEY, ui);
    }

    var TABS = [
        { id: 'inspector', label: 'Inspector', icon: 'fa-magnifying-glass-chart', build: buildInspector },
        { id: 'css', label: 'CSS Studio', icon: 'fa-paintbrush', build: buildCss },
        { id: 'anim', label: 'Animation', icon: 'fa-film', build: buildAnim },
        { id: 'perf', label: 'Performance', icon: 'fa-gauge-high', build: buildPerf },
        { id: 'storage', label: 'Storage', icon: 'fa-database', build: buildStorage },
        { id: 'console', label: 'Console', icon: 'fa-terminal', build: buildConsole },
        { id: 'network', label: 'Network', icon: 'fa-network-wired', build: buildNetwork },
        { id: 'theme', label: 'Theme', icon: 'fa-swatchbook', build: buildTheme },
        { id: 'components', label: 'Components', icon: 'fa-shapes', build: buildComponents },
        { id: 'backup', label: 'Backup', icon: 'fa-clock-rotate-left', build: buildBackup },
        { id: 'music', label: 'Music', icon: 'fa-music', build: buildMusic }
    ];

    function buildPanel() {
        if (panel) return;
        panel = el('div', 'bkdev-panel');
        panel.id = 'bkDevPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-label', 'Developer Playground');
        panel.tabIndex = -1;

        var head = el('div', 'bkdev-head');
        var title = el('div', 'bkdev-title');
        title.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i><span>Developer Playground</span><small>2.0</small>';
        head.appendChild(title);

        var headBtns = el('div', 'bkdev-headbtns');
        var minBtn = el('button', 'bkdev-hbtn');
        minBtn.type = 'button'; minBtn.setAttribute('aria-label', 'Thu nhỏ'); minBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
        var maxBtn = el('button', 'bkdev-hbtn');
        maxBtn.type = 'button'; maxBtn.setAttribute('aria-label', 'Phóng to'); maxBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        var closeBtn = el('button', 'bkdev-hbtn');
        closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Đóng'); closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        headBtns.appendChild(minBtn); headBtns.appendChild(maxBtn); headBtns.appendChild(closeBtn);
        head.appendChild(headBtns);
        panel.appendChild(head);

        tabBar = el('div', 'bkdev-tabs');
        tabBar.setAttribute('role', 'tablist');
        TABS.forEach(function (t) {
            var b = el('button', 'bkdev-tab');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.dataset.tab = t.id;
            b.innerHTML = '<i class="fa-solid ' + t.icon + '" style="margin-right:.3rem;opacity:.8"></i>' + t.label;
            b.addEventListener('click', function () { activate(t.id); });
            tabBar.appendChild(b);
        });
        panel.appendChild(tabBar);

        bodyEl = el('div', 'bkdev-body');
        panel.appendChild(bodyEl);

        var foot = el('div', 'bkdev-foot');
        foot.id = 'bkDevFoot';
        panel.appendChild(foot);

        var resize = el('div', 'bkdev-resize');
        resize.title = 'Kéo để đổi kích thước';
        panel.appendChild(resize);

        D.body.appendChild(panel);

        closeBtn.addEventListener('click', close);
        minBtn.addEventListener('click', function () { panel.classList.toggle('bkdev-min'); saveUI({ min: panel.classList.contains('bkdev-min') }); });
        maxBtn.addEventListener('click', function () { panel.classList.toggle('bkdev-max'); saveUI({ max: panel.classList.contains('bkdev-max') }); });

        makeDraggable(head);
        makeResizable(resize);
        applyGeometry();
        updateFoot();
        activate(ui.tab || 'inspector', true);

        panel.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !picker.active) { e.stopPropagation(); close(); }
            if (e.key === 'Tab') BK.ui.trapFocus(e, panel);
        });
    }

    function applyGeometry() {
        if (!panel) return;
        if (ui.max) { panel.classList.add('bkdev-max'); return; }
        panel.classList.remove('bkdev-max');
        if (ui.min) panel.classList.add('bkdev-min');
        var w = clamp(ui.w || Math.min(830, innerWidth - 40), 340, Math.max(340, innerWidth - 16));
        var h = clamp(ui.h || Math.min(610, innerHeight - 40), 240, Math.max(240, innerHeight - 16));
        panel.style.width = w + 'px';
        panel.style.height = h + 'px';
        var x = ui.x;
        var y = ui.y;
        if (x == null) x = Math.max(8, (innerWidth - w) / 2);
        if (y == null) y = Math.max(8, (innerHeight - h) / 2);
        panel.style.left = clamp(x, 0, Math.max(0, innerWidth - w)) + 'px';
        panel.style.top = clamp(y, 0, Math.max(0, innerHeight - h)) + 'px';
    }

    function makeDraggable(handle) {
        var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        handle.addEventListener('pointerdown', function (e) {
            if (e.target.closest('button')) return;
            if (innerWidth <= 720) return;
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            var r = panel.getBoundingClientRect();
            ox = r.left; oy = r.top;
            handle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        handle.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var nx = clamp(ox + e.clientX - sx, 0, Math.max(0, innerWidth - panel.offsetWidth));
            var ny = clamp(oy + e.clientY - sy, 0, Math.max(0, innerHeight - 40));
            panel.style.left = nx + 'px';
            panel.style.top = ny + 'px';
        });
        function stop() {
            if (!dragging) return;
            dragging = false;
            saveUI({ x: parseInt(panel.style.left, 10), y: parseInt(panel.style.top, 10) });
        }
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
    }

    function makeResizable(handle) {
        var resizing = false, sx = 0, sy = 0, ow = 0, oh = 0;
        handle.addEventListener('pointerdown', function (e) {
            resizing = true;
            sx = e.clientX; sy = e.clientY;
            ow = panel.offsetWidth; oh = panel.offsetHeight;
            handle.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        handle.addEventListener('pointermove', function (e) {
            if (!resizing) return;
            panel.style.width = clamp(ow + e.clientX - sx, 340, innerWidth - 16) + 'px';
            panel.style.height = clamp(oh + e.clientY - sy, 240, innerHeight - 16) + 'px';
        });
        function stop() {
            if (!resizing) return;
            resizing = false;
            saveUI({ w: panel.offsetWidth, h: panel.offsetHeight, max: false });
            panel.classList.remove('bkdev-max');
        }
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
    }

    function activate(id, skipSave) {
        if (!panel) return;
        var tab = TABS.filter(function (t) { return t.id === id; })[0] || TABS[0];
        current = tab.id;
        Array.prototype.forEach.call(tabBar.children, function (b) {
            var on = b.dataset.tab === tab.id;
            b.classList.toggle('on', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        Array.prototype.forEach.call(bodyEl.children, function (p) {
            p.hidden = p.dataset.pane !== tab.id;
        });
        if (!built[tab.id]) {
            var pane = el('div', 'bkdev-pane');
            pane.dataset.pane = tab.id;
            bodyEl.appendChild(pane);
            built[tab.id] = pane;
            try { tab.build(pane); } catch (e) {
                pane.appendChild(el('pre', 'bkdev-out err', 'Lỗi khởi tạo tab: ' + e.message));
                console.warn('[BKDev]', e);
            }
        }
        var paneEl = built[tab.id];
        if (paneEl) {
            /* Chuyển động nhẹ khi đổi tab; lặp lại được nhờ reflow. */
            paneEl.classList.remove('bkdev-pane-in');
            void paneEl.offsetWidth;
            paneEl.classList.add('bkdev-pane-in');
        }
        if (!skipSave) saveUI({ tab: tab.id });
        updateFoot();
        if (tab.id === 'console') renderLogs();
        if (tab.id === 'storage') refreshStorageList();
        if (tab.id === 'network') renderNetwork();
        if (tab.id === 'perf') renderPerf();
    }

    function updateFoot() {
        var foot = D.getElementById('bkDevFoot');
        if (!foot) return;
        var parts = [
            innerWidth + '×' + innerHeight,
            'DPR ' + (global.devicePixelRatio || 1).toFixed(2),
            navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' luồng' : '',
            navigator.deviceMemory ? navigator.deviceMemory + 'GB' : '',
            current
        ].filter(Boolean);
        foot.textContent = parts.join(' · ');
    }

    function open(force) {
        if (!force && !authorized()) {
            BK.ui.toast('Cần xác thực Developer: menu 3 gạch → nhập mã Developer', 'error');
            try {
                if (typeof global.toggleHamburgerMenu === 'function') global.toggleHamburgerMenu();
                var inp = D.getElementById('devCodeInput');
                if (inp) setTimeout(function () { inp.focus(); }, 60);
            } catch (e) { /* bỏ qua */ }
            return false;
        }
        buildPanel();
        lastFocus = D.activeElement;
        panel.hidden = false;
        panel.style.display = '';
        panel.focus({ preventScroll: true });
        updateFoot();
        return true;
    }
    function close() {
        if (!panel) return;
        picker.stop();
        panel.hidden = true;
        /* .bkdev-panel đặt display:flex nên thuộc tính hidden không đủ; ẩn bằng inline style. */
        panel.style.display = 'none';
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { } }
    }
    function authorized() {
        var c = D.getElementById('devPanelBtnContainer');
        if (c) return !c.classList.contains('hidden');
        try { return !!localStorage.getItem('devToken'); } catch (e) { return false; }
    }

    /* =====================================================================
       1. Inspector 2.0
       ================================================================== */
    var picker = (function () {
        var active = false, node = null, overlay = null, selected = null, originals = {};
        var hoverHandler = null, clickHandler = null, keyHandler = null;

        function ensureOverlay() {
            if (overlay) return overlay;
            overlay = el('div', 'bkdev-pick');
            var label = el('span');
            overlay.appendChild(label);
            D.body.appendChild(overlay);
            return overlay;
        }
        function describe(t) {
            var id = t.id ? '#' + t.id : '';
            var cls = typeof t.className === 'string' && t.className.trim() ? '.' + t.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
            return t.tagName.toLowerCase() + id + cls;
        }
        function showRect(t) {
            ensureOverlay();
            var r = t.getBoundingClientRect();
            Object.assign(overlay.style, {
                display: 'block', left: r.left + 'px', top: r.top + 'px',
                width: r.width + 'px', height: r.height + 'px'
            });
            overlay.firstChild.textContent = describe(t) + ' ' + Math.round(r.width) + '×' + Math.round(r.height);
        }
        function start() {
            if (active) return;
            active = true;
            ensureOverlay();
            panel.hidden = true;
            BK.ui.toast('Di chuột và bấm để chọn phần tử · Esc để thoát', 'info');
            hoverHandler = function (e) {
                if (!e.target || e.target.closest('#bkDevPanel')) return;
                showRect(e.target);
            };
            clickHandler = function (e) {
                if (e.target && e.target.closest('#bkDevPanel')) return;
                e.preventDefault(); e.stopPropagation();
                var t = e.target;
                stop();
                selected = t;
                panel.hidden = false;
                renderInspector();
            };
            keyHandler = function (e) {
                if (e.key === 'Escape') { e.preventDefault(); stop(); panel.hidden = false; }
            };
            D.addEventListener('pointermove', hoverHandler, true);
            D.addEventListener('click', clickHandler, true);
            D.addEventListener('keydown', keyHandler, true);
        }
        function stop() {
            if (!active) return;
            active = false;
            if (overlay) overlay.style.display = 'none';
            if (hoverHandler) D.removeEventListener('pointermove', hoverHandler, true);
            if (clickHandler) D.removeEventListener('click', clickHandler, true);
            if (keyHandler) D.removeEventListener('keydown', keyHandler, true);
            hoverHandler = clickHandler = keyHandler = null;
        }
        function setSelected(t) { selected = t; renderInspector(); }
        function getSelected() { return selected; }

        function selectorFor(node) {
            if (!node || node.nodeType !== 1) return '';
            if (node.id) return '#' + cssEscape(node.id);
            var parts = [];
            var n = node;
            while (n && n.nodeType === 1 && n !== D.documentElement && parts.length < 6) {
                if (n.id) { parts.unshift('#' + cssEscape(n.id)); break; }
                var sel = n.tagName.toLowerCase();
                var parent = n.parentElement;
                if (parent) {
                    var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === n.tagName; });
                    if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
                }
                parts.unshift(sel);
                n = parent;
            }
            return parts.join(' > ');
        }
        function cssEscape(s) {
            if (global.CSS && CSS.escape) return CSS.escape(s);
            return String(s).replace(/([^\w-])/g, '\\$1');
        }

        function applyStyle(prop, value) {
            var t = selected;
            if (!t) return;
            if (!(prop in originals)) originals[prop] = t.style.getPropertyValue(prop);
            if (value === '') t.style.removeProperty(prop);
            else t.style.setProperty(prop, value);
            renderBoxModel();
        }
        function restore() {
            var t = selected;
            if (!t) return;
            Object.keys(originals).forEach(function (prop) {
                if (originals[prop]) t.style.setProperty(prop, originals[prop]);
                else t.style.removeProperty(prop);
            });
            originals = {};
            BK.ui.toast('Đã khôi phục style gốc của phần tử', 'success');
            renderInspector();
        }

        var PROPS = ['display', 'position', 'width', 'height', 'margin', 'padding', 'border', 'border-radius',
            'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color',
            'opacity', 'z-index', 'flex-direction', 'justify-content', 'align-items', 'gap',
            'grid-template-columns', 'overflow', 'box-shadow', 'transform'];

        var infoBox = null, crumbBox = null, childBox = null, cssBox = null, boxModel = null, styleHost = null;

        function buildInspector(pane) {
            pane.appendChild(row(
                btn('Chọn phần tử', 'bk-btn', 'fa-crosshairs', start),
                btn('Khôi phục style', '', 'fa-rotate-left', restore),
                btn('Copy selector', '', 'fa-copy', function () {
                    var s = picker.getSelected();
                    if (!s) return BK.ui.toast('Chưa chọn phần tử', 'error');
                    BK.util.copy(selectorFor(s)).then(function () { BK.ui.toast('Đã copy selector', 'success'); },
                        function () { BK.ui.toast('Không copy được', 'error'); });
                }),
                btn('Copy HTML', '', 'fa-code', function () {
                    var s = picker.getSelected();
                    if (!s) return BK.ui.toast('Chưa chọn phần tử', 'error');
                    BK.util.copy(s.outerHTML.slice(0, 8000)).then(function () { BK.ui.toast('Đã copy HTML', 'success'); },
                        function () { BK.ui.toast('Không copy được', 'error'); });
                })
            ));
            pane.appendChild(note('Bấm “Chọn phần tử” rồi trỏ vào trang. Mọi chỉnh sửa style là tạm thời và có thể khôi phục.'));

            pane.appendChild(h4('Phần tử'));
            infoBox = el('div', 'bkdev-insp-info');
            pane.appendChild(infoBox);
            crumbBox = el('div', 'bkdev-crumbs');
            pane.appendChild(crumbBox);
            childBox = el('div', 'bkdev-insp-info');
            childBox.style.marginTop = '.35rem';
            pane.appendChild(childBox);

            pane.appendChild(h4('Box model'));
            boxModel = el('div', 'bkdev-boxmodel');
            pane.appendChild(boxModel);

            pane.appendChild(h4('Computed styles'));
            var filter = input('text');
            filter.placeholder = 'Lọc thuộc tính…';
            filter.setAttribute('aria-label', 'Lọc thuộc tính CSS');
            filter.addEventListener('input', BK.util.debounce(renderInspector, 120));
            filter.dataset.role = 'inspFilter';
            pane.appendChild(filter);
            cssBox = el('div', 'bkdev-insp-info');
            cssBox.style.marginTop = '.35rem';
            pane.appendChild(cssBox);

            pane.appendChild(h4('Chỉnh style trực tiếp (tạm thời)'));
            styleHost = el('div', 'bkdev-grid2');
            [
                ['color', 'Màu chữ', '#e2e8f0'],
                ['background-color', 'Nền', '#6366f1'],
                ['padding', 'Padding', '8px'],
                ['margin', 'Margin', '0px'],
                ['border-radius', 'Bo góc', '8px'],
                ['font-size', 'Cỡ chữ', '16px']
            ].forEach(function (p) {
                var i = input('text');
                i.placeholder = p[2];
                i.addEventListener('change', function () { applyStyle(p[0], i.value.trim()); });
                styleHost.appendChild(field(p[1], i));
            });
            pane.appendChild(styleHost);

            infoBox.textContent = 'Chưa chọn phần tử.';
        }

        function renderInspector() {
            if (!infoBox) return;
            var t = selected;
            infoBox.innerHTML = '';
            crumbBox.innerHTML = '';
            childBox.innerHTML = '';
            cssBox.innerHTML = '';
            boxModel.innerHTML = '';
            if (!t || !t.isConnected) { infoBox.textContent = 'Chưa chọn phần tử.'; return; }

            var r = t.getBoundingClientRect();
            [
                ['Tag', t.tagName.toLowerCase()],
                ['ID', t.id || '—'],
                ['Class', typeof t.className === 'string' && t.className.trim() ? t.className : '—'],
                ['Kích thước', Math.round(r.width) + ' × ' + Math.round(r.height) + ' px'],
                ['Vị trí', Math.round(r.left) + ', ' + Math.round(r.top) + ' px'],
                ['Selector', selectorFor(t)],
                ['Thuộc tính', Array.prototype.map.call(t.attributes, function (a) { return a.name + '="' + a.value.slice(0, 60) + '"'; }).join(' ') || '—']
            ].forEach(function (p) {
                var d = el('div');
                d.appendChild(el('b', null, p[0] + ': '));
                d.appendChild(D.createTextNode(String(p[1])));
                infoBox.appendChild(d);
            });

            var chain = [];
            var n = t;
            while (n && n.nodeType === 1 && chain.length < 7) { chain.unshift(n); n = n.parentElement; }
            chain.forEach(function (node, i) {
                var b = el('button', null, node.tagName.toLowerCase() + (node.id ? '#' + node.id : ''));
                b.type = 'button';
                b.title = selectorFor(node);
                b.addEventListener('click', function () { selected = node; renderInspector(); });
                crumbBox.appendChild(b);
                if (i < chain.length - 1) crumbBox.appendChild(D.createTextNode(' › '));
            });

            var kids = Array.prototype.slice.call(t.children, 0, 25);
            if (!kids.length) childBox.appendChild(el('div', 'bkdev-note', '(không có phần tử con)'));
            kids.forEach(function (c) {
                var b = el('button', 'bk-btn bk-btn-ghost bk-btn-sm');
                b.type = 'button';
                b.style.cssText = 'text-align:left;justify-content:flex-start;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
                b.textContent = '└ ' + describe(c);
                b.addEventListener('click', function () { selected = c; renderInspector(); });
                childBox.appendChild(b);
                childBox.appendChild(D.createTextNode(' '));
            });

            var cs = getComputedStyle(t);
            var filterEl = styleHost && styleHost.parentElement.querySelector('[data-role="inspFilter"]');
            var q = filterEl ? filterEl.value.trim().toLowerCase() : '';
            PROPS.filter(function (p) { return !q || p.indexOf(q) >= 0; }).forEach(function (p) {
                var d = el('div');
                d.style.display = 'flex';
                d.style.justifyContent = 'space-between';
                d.style.gap = '.5rem';
                d.appendChild(el('span', 'bk-muted', p));
                d.appendChild(el('span', null, cs.getPropertyValue(p) || '—'));
                cssBox.appendChild(d);
            });

            renderBoxModel();
        }

        function renderBoxModel() {
            if (!boxModel) return;
            var t = selected;
            boxModel.innerHTML = '';
            if (!t) return;
            var cs = getComputedStyle(t);
            function sides(p) {
                return ['Top', 'Right', 'Bottom', 'Left'].map(function (s) {
                    return Math.round(parseFloat(cs.getPropertyValue(p + '-' + s.toLowerCase())) || 0);
                }).join(' ');
            }
            var content = el('div', 'l c', 'content');
            var padding = el('div', 'l p');
            padding.appendChild(el('div', null, 'padding ' + sides('padding')));
            padding.appendChild(content);
            var border = el('div', 'l b');
            border.appendChild(el('div', null, 'border ' + sides('border') + ' · width ' + sides('border-width')));
            border.appendChild(padding);
            var margin = el('div', 'l m');
            margin.appendChild(el('div', null, 'margin ' + sides('margin')));
            margin.appendChild(border);
            boxModel.appendChild(margin);
        }

        return {
            start: start, stop: stop, getSelected: getSelected, build: buildInspector,
            setSelected: setSelected, selectorFor: selectorFor, restore: restore,
            get isActive() { return active; }
        };
    })();

    /** Wrapper cấp module để TABS có thể tham chiếu (buildInspector nằm trong closure của picker). */
    function buildInspector(pane) { picker.build(pane); }

    /* =====================================================================
       2. CSS Studio
       ================================================================== */
    var cssState = { text: '', undo: [], redo: [] };

    function cssPreviewEl() {
        var id = 'bkdev-css-preview';
        var st = D.getElementById(id);
        if (!st) { st = el('style'); st.id = id; (D.head || D.documentElement).appendChild(st); }
        return st;
    }
    function applyCssText(text, pushHistory) {
        cssState.text = text;
        cssPreviewEl().textContent = text;
        if (pushHistory) {
            if (!cssState.undo.length || cssState.undo[cssState.undo.length - 1] !== text) {
                cssState.undo.push(text);
                if (cssState.undo.length > 40) cssState.undo.shift();
                cssState.redo = [];
            }
            write('bk.dev.css.v1', { text: text, at: Date.now() });
        }
    }

    function buildCss(pane) {
        var saved = read('bk.dev.css.v1', null);
        cssState.text = saved && saved.text || '';
        cssPreviewEl();

        pane.appendChild(h4('Live CSS'));
        pane.appendChild(note('CSS dưới đây chỉ áp dụng tạm thời trong tab này, không ghi vào file dự án.'));
        var ta = txtArea(cssState.text, 7);
        ta.spellcheck = false;
        ta.setAttribute('aria-label', 'CSS tùy chỉnh');
        ta.addEventListener('input', BK.util.debounce(function () { applyCssText(ta.value, true); }, 300));
        pane.appendChild(ta);

        pane.appendChild(row(
            btn('Áp dụng', 'bk-btn', 'fa-play', function () { applyCssText(ta.value, true); BK.ui.toast('Đã áp dụng CSS tạm thời', 'success'); }),
            btn('Hoàn tác', '', 'fa-rotate-left', function () {
                if (cssState.undo.length > 1) {
                    var cur = cssState.undo.pop();
                    cssState.redo.push(cur);
                    var prev = cssState.undo[cssState.undo.length - 1] || '';
                    cssState.text = prev; ta.value = prev;
                    cssPreviewEl().textContent = prev;
                }
            }),
            btn('Làm lại', '', 'fa-rotate-right', function () {
                var next = cssState.redo.pop();
                if (next == null) return;
                cssState.undo.push(next); cssState.text = next; ta.value = next;
                cssPreviewEl().textContent = next;
            }),
            btn('Đặt lại', '', 'fa-trash', function () {
                BK.ui.confirm({ title: 'Đặt lại CSS', message: 'Xoá toàn bộ CSS tạm thời?', ok: 'Đặt lại', danger: true }).then(function (ok) {
                    if (!ok) return;
                    ta.value = ''; cssState.text = ''; cssState.undo = []; cssState.redo = [];
                    cssPreviewEl().textContent = '';
                    try { localStorage.removeItem('bk.dev.css.v1'); } catch (e) { }
                });
            }),
            btn('Xuất CSS', '', 'fa-download', function () {
                download('bakhi-studio.css', ta.value || '/* empty */', 'text/css');
            })
        ));

        pane.appendChild(h4('Bảng điều khiển nhanh'));
        var target = input('text', '.fc-inner a');
        target.setAttribute('aria-label', 'Selector mục tiêu');
        pane.appendChild(field('Selector', target));
        var decls = { 'color': '#e2e8f0', 'background-color': '#6366f1', 'font-size': '14px', 'padding': '8px', 'border-radius': '10px', 'box-shadow': '0 8px 20px -12px rgba(0,0,0,.6)' };
        var grid = el('div', 'bkdev-grid2');
        Object.keys(decls).forEach(function (prop) {
            var i = input('text');
            i.placeholder = decls[prop];
            i.addEventListener('keydown', function (e) { if (e.key === 'Enter') addRule(); });
            grid.appendChild(field(prop, i));
            i.dataset.prop = prop;
        });
        pane.appendChild(grid);
        function addRule() {
            var sel = target.value.trim();
            if (!sel) return BK.ui.toast('Cần selector', 'error');
            var lines = Array.prototype.filter.call(grid.querySelectorAll('input'), function (i) { return i.value.trim(); })
                .map(function (i) { return '  ' + i.dataset.prop + ': ' + i.value.trim() + ';'; });
            if (!lines.length) return BK.ui.toast('Chưa nhập thuộc tính nào', 'error');
            var block = sel + ' {\n' + lines.join('\n') + '\n}\n';
            ta.value = (ta.value ? ta.value.replace(/\s*$/, '\n') : '') + block;
            applyCssText(ta.value, true);
            BK.ui.toast('Đã thêm rule vào bản xem trước', 'success');
        }
        pane.appendChild(row(btn('Thêm rule', 'bk-btn', 'fa-plus', addRule)));

        if (cssState.text) applyCssText(cssState.text, false);
    }

    /* =====================================================================
       3. Animation Studio
       ================================================================== */
    var ANIM_PRESETS = {
        fadeIn: { name: 'Fade in', kf: 'from { opacity: 0; }\nto { opacity: 1; }', duration: 600, easing: 'ease-out' },
        slideUp: { name: 'Slide up', kf: 'from { opacity: 0; transform: translateY(18px); }\nto { opacity: 1; transform: none; }', duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' },
        pop: { name: 'Pop', kf: '0% { transform: scale(.7); }\n60% { transform: scale(1.06); }\n100% { transform: scale(1); }', duration: 420, easing: 'ease-out' },
        bounce: { name: 'Bounce', kf: '0%,100% { transform: translateY(0); }\n35% { transform: translateY(-22px); }\n65% { transform: translateY(-8px); }', duration: 900, easing: 'ease-in-out' },
        shake: { name: 'Shake', kf: '0%,100% { transform: translateX(0); }\n25% { transform: translateX(-8px); }\n75% { transform: translateX(8px); }', duration: 500, easing: 'ease-in-out' },
        pulse: { name: 'Pulse', kf: '0%,100% { transform: scale(1); }\n50% { transform: scale(1.14); }', duration: 1200, easing: 'ease-in-out' },
        spin: { name: 'Spin', kf: 'to { transform: rotate(360deg); }', duration: 1400, easing: 'linear', iteration: 'infinite' }
    };

    function buildAnim(pane) {
        var animName = 'bkDevAnimPreview';
        var reduce = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

        pane.appendChild(h4('Thư viện animation'));
        var lib = el('div', 'bkdev-row');
        Object.keys(ANIM_PRESETS).forEach(function (k) {
            lib.appendChild(btn(ANIM_PRESETS[k].name, '', 'fa-wand-magic-sparkles', function () {
                var p = ANIM_PRESETS[k];
                kf.value = p.kf; duration.value = p.duration; easing.value = p.easing;
                iteration.value = p.iteration || '1';
                play();
            }));
        });
        pane.appendChild(lib);

        var stage = el('div', 'bkdev-stage');
        var box = el('div', 'bkdev-stage-box');
        box.id = 'bkdevStageBox';
        stage.appendChild(box);
        pane.appendChild(stage);

        var timeline = el('div', 'bkdev-timeline');
        var fill = el('div', 'bkdev-tl-fill');
        timeline.appendChild(fill);
        [0, 25, 50, 75, 100].forEach(function (p) {
            var m = el('div', 'bkdev-tl-mark');
            m.style.left = p + '%';
            var s = el('span', null, p + '%');
            m.appendChild(s);
            timeline.appendChild(m);
        });
        pane.appendChild(timeline);

        var kf = txtArea(ANIM_PRESETS.slideUp.kf, 5);
        kf.spellcheck = false;
        kf.setAttribute('aria-label', 'Keyframes');
        var duration = input('number', 520);
        duration.min = '0'; duration.step = '20';
        var delay = input('number', 0);
        delay.min = '0'; delay.step = '20';
        var easing = selectOpts([['linear', 'linear'], ['ease', 'ease'], ['ease-in', 'ease-in'], ['ease-out', 'ease-out'], ['ease-in-out', 'ease-in-out'], ['cubic-bezier', 'cubic-bezier']], 'cubic-bezier');
        var cubic = input('text', '0.2, 0.8, 0.2, 1');
        cubic.setAttribute('aria-label', 'Giá trị cubic-bezier');
        var direction = selectOpts([['normal', 'normal'], ['reverse', 'reverse'], ['alternate', 'alternate'], ['alternate-reverse', 'alternate-reverse']], 'normal');
        var iteration = input('text', '1');
        iteration.setAttribute('aria-label', 'Số lần lặp');

        var grid = el('div', 'bkdev-grid2');
        grid.appendChild(field('Thời lượng (ms)', duration));
        grid.appendChild(field('Trễ (ms)', delay));
        grid.appendChild(field('Easing', easing));
        grid.appendChild(field('cubic-bezier', cubic));
        grid.appendChild(field('Hướng', direction));
        grid.appendChild(field('Lặp', iteration));
        pane.appendChild(grid);
        pane.appendChild(field('Keyframes', kf));

        var styleEl = el('style');
        styleEl.id = 'bkdev-anim-kf';
        (D.head || D.documentElement).appendChild(styleEl);
        var running = null;

        function easingValue() {
            if (easing.value !== 'cubic-bezier') return easing.value;
            var v = cubic.value.split(',').map(Number);
            return v.length === 4 && v.every(function (n) { return isFinite(n); }) ? 'cubic-bezier(' + v.join(',') + ')' : 'ease';
        }
        function apply() {
            styleEl.textContent = '@keyframes ' + animName + ' {\n' + kf.value + '\n}';
            box.style.animation = 'none';
            void box.offsetWidth;
            if (running === false) return;
            box.style.animation = animName + ' ' + Math.max(0, Number(duration.value) || 0) + 'ms ' + easingValue() +
                ' ' + Math.max(0, Number(delay.value) || 0) + 'ms ' + (iteration.value || '1') + ' ' +
                (direction.value || 'normal') + ' both';
            trackTimeline();
        }
        function trackTimeline() {
            if (running !== null) cancelAnimationFrame(running);
            var start = performance.now();
            var total = Math.max(200, (Number(duration.value) || 0) + (Number(delay.value) || 0));
            (function tick(t) {
                var pct = Math.min(100, ((t - start) / total) * 100);
                fill.style.width = pct + '%';
                if (pct < 100) running = requestAnimationFrame(tick);
                else running = null;
            })(start);
        }
        function play() {
            running = true;
            apply();
        }
        pane.appendChild(row(
            btn('Phát', 'bk-btn', 'fa-play', play),
            btn('Tạm dừng', '', 'fa-pause', function () {
                box.style.animationPlayState = 'paused';
            }),
            btn('Tiếp tục', '', 'fa-play', function () {
                box.style.animationPlayState = 'running';
            }),
            btn('Chạy lại', '', 'fa-rotate-right', function () {
                box.style.animationPlayState = 'running';
                apply();
            }),
            btn('Xuất CSS', '', 'fa-download', function () {
                var css = '@keyframes ' + animName + ' {\n' + kf.value + '\n}\n\n.bk-anim-target {\n  animation: ' +
                    animName + ' ' + duration.value + 'ms ' + easingValue() + ' ' + delay.value + 'ms ' + iteration.value + ' ' + direction.value + ' both;\n}\n';
                download('bakhi-animation.css', css, 'text/css');
            })
        ));
        kf.addEventListener('input', BK.util.debounce(apply, 260));
        [duration, delay, iteration].forEach(function (i) { i.addEventListener('change', apply); });
        [easing, direction].forEach(function (i) { i.addEventListener('change', apply); });

        pane.appendChild(h4('Preset đã lưu'));
        var presetList = el('div', 'bkdev-row');
        pane.appendChild(presetList);
        var presets = read('bk.dev.anim.v1', []) || [];

        function renderPresets() {
            presetList.innerHTML = '';
            var saved = read('bk.dev.anim.v1', []) || [];
            if (!saved.length) { presetList.appendChild(note('Chưa có preset nào.')); return; }
            saved.forEach(function (p, i) {
                presetList.appendChild(btn(p.name, '', 'fa-bookmark', function () {
                    kf.value = p.kf; duration.value = p.duration; delay.value = p.delay;
                    easing.value = p.easing; cubic.value = p.cubic || '0.2,0.8,0.2,1';
                    direction.value = p.direction; iteration.value = p.iteration;
                    apply();
                }));
                presetList.appendChild(btn('', '', 'fa-trash', function () {
                    presets.splice(i, 1); write('bk.dev.anim.v1', presets); renderPresets();
                }));
            });
        }
        renderPresets();

        pane.appendChild(row(
            btn('Lưu preset', 'bk-btn', 'fa-floppy-disk', function () {
                var name = global.prompt ? global.prompt('Tên preset:', 'Preset ' + (presets.length + 1)) : null;
                if (!name) return;
                presets.push({
                    name: name, kf: kf.value, duration: duration.value, delay: delay.value,
                    easing: easing.value, cubic: cubic.value, direction: direction.value, iteration: iteration.value
                });
                write('bk.dev.anim.v1', presets);
                renderPresets();
                BK.ui.toast('Đã lưu preset animation', 'success');
            }),
            btn('Nhập preset JSON', '', 'fa-upload', function () {
                var raw = global.prompt ? global.prompt('Dán JSON preset (mảng hoặc 1 object):') : null;
                if (!raw) return;
                try {
                    var parsed = JSON.parse(raw);
                    var list = Array.isArray(parsed) ? parsed : [parsed];
                    list.forEach(function (p) {
                        if (p && p.name && p.kf) presets.push(p);
                    });
                    write('bk.dev.anim.v1', presets);
                    renderPresets();
                    BK.ui.toast('Đã nhập preset', 'success');
                } catch (e) { BK.ui.toast('JSON không hợp lệ', 'error'); }
            })
        ));

        if (reduce) {
            pane.appendChild(note('Thiết bị đang bật “giảm chuyển động” — animation chỉ chạy khi bạn bấm Phát.'));
        }
        apply();
    }

    /* =====================================================================
       4. Performance Lab
       ================================================================== */
    var perfData = { lcp: null, cls: 0, longTasks: [], resources: [] };
    (function observePerf() {
        if (!global.PerformanceObserver) return;
        try {
            new PerformanceObserver(function (list) {
                var es = list.getEntries();
                if (es.length) perfData.lcp = es[es.length - 1].startTime;
            }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) { /* bỏ qua */ }
        try {
            new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (e) { if (!e.hadRecentInput) perfData.cls += e.value; });
            }).observe({ type: 'layout-shift', buffered: true });
        } catch (e) { /* bỏ qua */ }
        try {
            new PerformanceObserver(function (list) {
                list.getEntries().forEach(function (e) {
                    perfData.longTasks.push({ start: e.startTime, duration: e.duration });
                });
            }).observe({ type: 'longtask', buffered: true });
        } catch (e) { /* bỏ qua */ }
    })();

    function buildPerf(pane) {
        var box = el('div');
        box.id = 'bkdevPerfOut';
        pane.appendChild(box);
        pane.appendChild(row(
            btn('Làm mới', 'bk-btn', 'fa-rotate', renderPerf),
            btn('Đo FPS (1 giây)', '', 'fa-gauge-high', measureFps),
            btn('Xuất báo cáo', '', 'fa-download', function () {
                download('bakhi-performance-' + BK.util.dayKey() + '.json', JSON.stringify(collectPerf(), null, 2));
            })
        ));
        pane.appendChild(note('Số liệu đọc trực tiếp từ Performance API của trình duyệt. Giá trị không hỗ trợ sẽ hiển thị “không hỗ trợ”, không suy đoán.'));
        var fpsOut = el('pre', 'bkdev-out');
        fpsOut.id = 'bkdevFpsOut';
        pane.appendChild(fpsOut);
        renderPerf();
    }

    function collectPerf() {
        var nav = perfEntries('navigation')[0] || {};
        var paints = perfEntries('paint');
        var fcp = (paints.filter(function (p) { return p.name === 'first-contentful-paint'; })[0] || {}).startTime;
        var rs = perfEntries('resource');
        return {
            navigation: {
                ttfb: Math.round((nav.responseStart || 0)),
                domContentLoaded: Math.round((nav.domContentLoadedEventEnd || 0)),
                load: Math.round((nav.loadEventEnd || 0)),
                transferSize: nav.transferSize || 0
            },
            fcp: fcp ? Math.round(fcp) : null,
            lcp: perfData.lcp ? Math.round(perfData.lcp) : null,
            cls: Number(perfData.cls.toFixed(4)),
            longTasks: perfData.longTasks.slice(-20),
            resources: rs.length,
            resourcesFailed: rs.filter(function (r) { return r.responseStatus >= 400; }).length,
            memory: performance.memory ? {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize
            } : null
        };
    }

    function renderPerf() {
        var box = D.getElementById('bkdevPerfOut');
        if (!box) return;
        var d = collectPerf();
        box.innerHTML = '';
        var cards = el('div', 'bk-cards');
        [
            ['TTFB', d.navigation.ttfb + ' ms'],
            ['DOMContentLoaded', d.navigation.domContentLoaded + ' ms'],
            ['Load', d.navigation.load + ' ms'],
            ['FCP', d.fcp != null ? d.fcp + ' ms' : 'không hỗ trợ'],
            ['LCP', d.lcp != null ? d.lcp + ' ms' : 'không hỗ trợ'],
            ['CLS', String(d.cls)],
            ['Tài nguyên', String(d.resources)],
            ['Tải lỗi', String(d.resourcesFailed)]
        ].forEach(function (p) {
            var c = el('div', 'bk-card');
            c.appendChild(el('div', 'bk-card-k', p[0]));
            c.appendChild(el('div', 'bk-card-v', p[1]));
            cards.appendChild(c);
        });
        box.appendChild(cards);

        box.appendChild(h4('Long tasks (' + d.longTasks.length + ')'));
        var tbl = el('table', 'bkdev-table');
        tbl.innerHTML = '<thead><tr><th>Bắt đầu</th><th>Thời lượng</th></tr></thead>';
        var tb = el('tbody');
        if (!d.longTasks.length) {
            var tr = el('tr'); var td = el('td', null, 'Không phát hiện long task (>50ms) hoặc trình duyệt không hỗ trợ.');
            td.colSpan = 2; tr.appendChild(td); tb.appendChild(tr);
        }
        d.longTasks.slice(-12).forEach(function (t) {
            var tr = el('tr');
            tr.appendChild(el('td', null, Math.round(t.start) + ' ms'));
            tr.appendChild(el('td', null, Math.round(t.duration) + ' ms'));
            tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        box.appendChild(tbl);

        box.appendChild(h4('5 tài nguyên nặng nhất'));
        var rs = perfEntries('resource').slice().sort(function (a, b) { return (b.transferSize || 0) - (a.transferSize || 0); }).slice(0, 5);
        var rt = el('table', 'bkdev-table');
        rt.innerHTML = '<thead><tr><th>Tài nguyên</th><th>KB</th><th>ms</th></tr></thead>';
        var rtb = el('tbody');
        rs.forEach(function (r) {
            var tr = el('tr');
            tr.appendChild(el('td', null, (r.name.split('/').pop() || r.name).split('?')[0]));
            tr.appendChild(el('td', null, ((r.transferSize || 0) / 1024).toFixed(1)));
            tr.appendChild(el('td', null, String(Math.round(r.duration || 0))));
            rtb.appendChild(tr);
        });
        rt.appendChild(rtb);
        box.appendChild(rt);
        if (d.memory) {
            box.appendChild(note('JS heap: ' + bytes(d.memory.used) + ' / ' + bytes(d.memory.total)));
        }
    }

    function measureFps() {
        var out = D.getElementById('bkdevFpsOut');
        if (!out) return;
        out.textContent = 'Đang đo 1 giây…';
        var frames = 0;
        var start = performance.now();
        (function tick(t) {
            frames++;
            if (t - start < 1000) { requestAnimationFrame(tick); return; }
            var fps = Math.round((frames * 1000) / (t - start));
            out.textContent = 'FPS ước lượng: ' + fps + ' (đo ' + frames + ' khung hình trong ' + Math.round(t - start) + ' ms)';
        })(start);
    }

    /* =====================================================================
       5. Storage Manager
       ================================================================== */
    var PROTECTED = ['bakhiLearn.v1', 'bakhiBackups', 'appHighlightsDataMap', 'theme', 'devToken'];

    function buildStorage(pane) {
        pane.appendChild(h4('localStorage / sessionStorage'));
        pane.appendChild(note('Dữ liệu quan trọng (' + PROTECTED.join(', ') + ') được bảo vệ: cần xác nhận riêng khi xoá.'));

        var search = input('text');
        search.placeholder = 'Lọc theo tên key…';
        search.setAttribute('aria-label', 'Lọc key lưu trữ');
        search.addEventListener('input', BK.util.debounce(refreshStorageList, 150));
        search.dataset.role = 'storageFilter';
        pane.appendChild(search);

        var usage = el('div', 'bkdev-note');
        usage.id = 'bkdevStorageUsage';
        pane.appendChild(usage);

        var list = el('div');
        list.id = 'bkdevStorageList';
        list.style.marginTop = '.4rem';
        pane.appendChild(list);

        var editor = el('div');
        editor.id = 'bkdevStorageEditor';
        pane.appendChild(editor);

        pane.appendChild(row(
            btn('Xuất toàn bộ', 'bk-btn', 'fa-download', function () {
                var data = {};
                ['localStorage', 'sessionStorage'].forEach(function (area) {
                    data[area] = {};
                    var store = global[area];
                    for (var i = 0; i < store.length; i++) {
                        var k = store.key(i);
                        data[area][k] = store.getItem(k);
                    }
                });
                download('bakhi-storage-' + BK.util.dayKey() + '.json', JSON.stringify(data, null, 2));
            }),
            btn('Nhập JSON', '', 'fa-upload', importStorage),
            btn('Làm mới', '', 'fa-rotate', refreshStorageList)
        ));

        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function (est) {
                usage.textContent = 'Dung lượng trình duyệt: ' + bytes(est.usage) + ' / ' + bytes(est.quota);
            }, function () { });
        } else {
            usage.textContent = 'Trình duyệt không hỗ trợ ước lượng dung lượng.';
        }
        refreshStorageList();
    }

    function refreshStorageList() {
        var list = D.getElementById('bkdevStorageList');
        if (!list) return;
        var filterEl = list.parentElement.querySelector('[data-role="storageFilter"]');
        var q = filterEl ? filterEl.value.trim().toLowerCase() : '';
        list.innerHTML = '';
        var total = 0, count = 0;

        ['localStorage', 'sessionStorage'].forEach(function (area) {
            var store;
            try { store = global[area]; } catch (e) { return; }
            if (!store) return;
            var keys = [];
            for (var i = 0; i < store.length; i++) keys.push(store.key(i));
            keys.sort();
            var filtered = keys.filter(function (k) { return !q || k.toLowerCase().indexOf(q) >= 0; });
            var title = el('div', 'bkdev-h4', area + ' (' + keys.length + ')');
            list.appendChild(title);
            if (!filtered.length) { list.appendChild(note('Không có key phù hợp.')); return; }

            filtered.forEach(function (key) {
                var val = store.getItem(key) || '';
                total += val.length; count++;
                var rowEl = el('div', 'bkdev-row');
                rowEl.style.borderBottom = '1px solid rgba(148,163,184,.12)';
                rowEl.style.padding = '.2rem 0';
                var name = el('span', 'bk-mono');
                name.textContent = key;
                name.style.flex = '1';
                name.style.overflow = 'hidden';
                name.style.textOverflow = 'ellipsis';
                name.style.whiteSpace = 'nowrap';
                name.title = key + ' · ' + bytes(val.length);
                rowEl.appendChild(name);
                if (PROTECTED.indexOf(key) >= 0) rowEl.appendChild(el('span', 'bk-badge bk-badge-warn', 'bảo vệ'));
                rowEl.appendChild(el('span', 'bkdev-note', bytes(val.length)));
                rowEl.appendChild(btn('Xem', '', 'fa-eye', function () { editStorageKey(area, key); }));
                rowEl.appendChild(btn('Xoá', '', 'fa-trash', function () { deleteStorageKey(area, key); }));
                list.appendChild(rowEl);
            });
        });
        list.insertBefore(note(count + ' key · ' + bytes(total) + ' ký tự dữ liệu'), list.firstChild);
    }

    function editStorageKey(area, key) {
        var editor = D.getElementById('bkdevStorageEditor');
        if (!editor) return;
        editor.innerHTML = '';
        var store = global[area];
        var ta = txtArea(store.getItem(key) || '', 6);
        ta.spellcheck = false;
        ta.setAttribute('aria-label', 'Giá trị của ' + key);
        editor.appendChild(h4('Sửa: ' + key));
        editor.appendChild(ta);
        var status = el('div', 'bkdev-note');
        editor.appendChild(row(
            btn('Lưu', 'bk-btn', 'fa-floppy-disk', function () {
                try {
                    store.setItem(key, ta.value);
                    status.textContent = 'Đã lưu vào ' + area + '.';
                    status.className = 'bkdev-note ok';
                    refreshStorageList();
                } catch (e) {
                    status.textContent = 'Không lưu được: ' + e.message;
                    status.className = 'bkdev-note err';
                }
            }),
            btn('JSON hợp lệ?', '', 'fa-check', function () {
                try { JSON.parse(ta.value); status.textContent = 'JSON hợp lệ.'; status.className = 'bkdev-note ok'; }
                catch (e) { status.textContent = 'JSON lỗi: ' + e.message; status.className = 'bkdev-note err'; }
            }),
            btn('Xoá key', '', 'fa-trash', function () { deleteStorageKey(area, key); })
        ));
        editor.appendChild(status);
    }

    function deleteStorageKey(area, key) {
        var store = global[area];
        var warn = PROTECTED.indexOf(key) >= 0
            ? 'Đây là dữ liệu quan trọng của ứng dụng. Xoá có thể làm mất cấu hình hoặc tiến độ học tập. '
            : '';
        BK.ui.confirm({
            title: 'Xoá key',
            message: warn + 'Xoá "' + key + '" khỏi ' + area + '?',
            ok: 'Xoá', danger: true
        }).then(function (ok) {
            if (!ok) return;
            try { store.removeItem(key); } catch (e) { }
            refreshStorageList();
            BK.ui.toast('Đã xoá ' + key, 'success');
        });
    }

    function importStorage() {
        var raw = global.prompt ? global.prompt('Dán JSON dạng {"localStorage": {...}, "sessionStorage": {...}}:') : null;
        if (!raw) return;
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return BK.ui.toast('JSON không hợp lệ', 'error'); }
        if (!parsed || typeof parsed !== 'object') return BK.ui.toast('Dữ liệu không hợp lệ', 'error');
        var count = 0;
        ['localStorage', 'sessionStorage'].forEach(function (area) {
            var src = parsed[area];
            if (!src || typeof src !== 'object') return;
            Object.keys(src).forEach(function (k) {
                if (typeof src[k] !== 'string') return;
                try { global[area].setItem(k, src[k]); count++; } catch (e) { }
            });
        });
        refreshStorageList();
        BK.ui.toast('Đã nhập ' + count + ' key', 'success');
    }

    /* =====================================================================
       6. Console Pro
       ================================================================== */
    var logs = [];
    var originalConsole = {};
    (function patchConsole() {
        ['log', 'warn', 'error', 'info', 'debug'].forEach(function (level) {
            originalConsole[level] = console[level] ? console[level].bind(console) : function () { };
            console[level] = function () {
                try {
                    logs.push({ level: level, ts: Date.now(), args: Array.prototype.slice.call(arguments).map(stringify) });
                    if (logs.length > 600) logs.splice(0, logs.length - 600);
                    if (current === 'console') scheduleLogRender();
                } catch (e) { /* bỏ qua */ }
                originalConsole[level].apply(null, arguments);
            };
        });
        D.addEventListener('error', function (e) {
            logs.push({ level: 'error', ts: Date.now(), args: ['Uncaught: ' + (e.message || 'lỗi'), (e.filename || '') + ':' + (e.lineno || 0)] });
            if (current === 'console') scheduleLogRender();
        });
        D.addEventListener('unhandledrejection', function (e) {
            var reason = e.reason && (e.reason.stack || e.reason.message) || String(e.reason);
            logs.push({ level: 'error', ts: Date.now(), args: ['Unhandled rejection: ' + reason] });
            if (current === 'console') scheduleLogRender();
        });
    })();

    function stringify(v) {
        if (typeof v === 'string') return v;
        if (v instanceof Error) return v.stack || v.message;
        try { return JSON.stringify(v); } catch (e) { return String(v); }
    }

    var logRenderTimer = null;
    function scheduleLogRender() {
        if (logRenderTimer) return;
        logRenderTimer = setTimeout(function () {
            logRenderTimer = null;
            renderLogs();
        }, 250);
    }

    function buildConsole(pane) {
        pane.appendChild(row(
            selectOpts([['all', 'Tất cả'], ['error', 'Lỗi'], ['warn', 'Cảnh báo'], ['info', 'Info'], ['log', 'Log']], 'all'),
            btn('Xoá', 'bk-btn', 'fa-trash', function () { logs = []; renderLogs(); }),
            btn('Xuất log', '', 'fa-download', function () {
                download('bakhi-console-' + BK.util.dayKey() + '.json', JSON.stringify(logs, null, 2));
            })
        ));
        var sev = pane.querySelector('select');
        sev.setAttribute('aria-label', 'Lọc mức độ log');
        var search = input('text');
        search.placeholder = 'Tìm trong log…';
        search.setAttribute('aria-label', 'Tìm trong log');
        pane.appendChild(search);
        var list = el('div');
        list.id = 'bkdevLogList';
        list.style.marginTop = '.4rem';
        pane.appendChild(list);
        pane.appendChild(note('Console gốc vẫn hoạt động bình thường; đây chỉ là bản ghi thêm (tối đa 600 dòng).'));

        var filter = function () { renderLogs(sev.value, search.value); };
        sev.addEventListener('change', filter);
        search.addEventListener('input', BK.util.debounce(filter, 150));
        renderLogs();
    }

    function renderLogs(level, query) {
        var list = D.getElementById('bkdevLogList');
        if (!list) return;
        var sevEl = list.parentElement.querySelector('select');
        var qEl = list.parentElement.querySelector('[aria-label="Tìm trong log"]');
        level = level || (sevEl && sevEl.value) || 'all';
        query = query != null ? query : (qEl ? qEl.value : '');
        var q = String(query || '').toLowerCase();
        list.innerHTML = '';
        var items = logs.filter(function (l) {
            if (level !== 'all' && l.level !== level) return false;
            if (q && norm(l.args.join(' ')).indexOf(norm(q)) < 0) return false;
            return true;
        }).slice(-300);
        if (!items.length) { list.appendChild(note('Chưa có log phù hợp.')); return; }
        items.forEach(function (l) {
            var r = el('div', 'bkdev-log log-' + l.level);
            r.appendChild(el('span', 't', new Date(l.ts).toLocaleTimeString('vi-VN')));
            r.appendChild(el('span', 'm', l.args.join(' ')));
            list.appendChild(r);
        });
        list.scrollTop = list.scrollHeight;
    }
    function norm(s) { return BK.util.norm(s); }

    /* =====================================================================
       7. Network Monitor
       ================================================================== */
    function buildNetwork(pane) {
        pane.appendChild(row(
            btn('Làm mới', 'bk-btn', 'fa-rotate', renderNetwork),
            btn('Xuất JSON', '', 'fa-download', function () {
                download('bakhi-resources-' + BK.util.dayKey() + '.json', JSON.stringify(perfEntries('resource').map(function (r) {
                    return { name: r.name, type: r.initiatorType, duration: Math.round(r.duration), transferSize: r.transferSize, status: r.responseStatus || null };
                }), null, 2));
            })
        ));
        pane.appendChild(note('Chỉ đọc dữ liệu PerformanceResourceTiming. Không chặn, không sửa, không phát lại request.'));
        var box = el('div');
        box.id = 'bkdevNetOut';
        pane.appendChild(box);
        renderNetwork();
    }

    function renderNetwork() {
        var box = D.getElementById('bkdevNetOut');
        if (!box) return;
        var rs = perfEntries('resource');
        box.innerHTML = '';
        var failed = rs.filter(function (r) { return r.responseStatus >= 400; });
        box.appendChild(note(rs.length + ' tài nguyên · ' + failed.length + ' tải lỗi (>=400)'));

        var tbl = el('table', 'bkdev-table');
        tbl.innerHTML = '<thead><tr><th>Tài nguyên</th><th>Loại</th><th>ms</th><th>KB</th><th>Status</th></tr></thead>';
        var tb = el('tbody');
        rs.slice().sort(function (a, b) { return b.duration - a.duration; }).slice(0, 60).forEach(function (r) {
            var tr = el('tr');
            var name = r.name.split('/').pop().split('?')[0] || r.name;
            tr.appendChild(el('td', null, name)).title = r.name;
            tr.appendChild(el('td', null, r.initiatorType || '—'));
            tr.appendChild(el('td', null, String(Math.round(r.duration || 0))));
            tr.appendChild(el('td', null, ((r.transferSize || 0) / 1024).toFixed(1)));
            tr.appendChild(el('td', null, r.responseStatus ? String(r.responseStatus) : '—'));
            tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        box.appendChild(tbl);
    }

    /* =====================================================================
       8. Theme Editor
       ================================================================== */
    var THEME_VARS = [
        ['--bk-primary', 'Màu chính', '#6366f1'],
        ['--bk-secondary', 'Màu phụ', '#a855f7'],
        ['--bk-accent', 'Màu nhấn', '#0ea5e9'],
        ['--bkl-surface', 'Nền bề mặt', '#ffffff'],
        ['--bkl-surface-2', 'Nền phụ', '#f8fafc'],
        ['--bkl-text', 'Màu chữ', '#0f172a'],
        ['--bkl-muted', 'Chữ mờ', '#64748b'],
        ['--bkl-radius', 'Bo góc', '14px'],
        ['--bkl-space', 'Khoảng cách', '1rem'],
        ['--bkl-shadow', 'Đổ bóng', '0 18px 50px -20px rgba(2,6,23,.45)']
    ];

    function buildTheme(pane) {
        pane.appendChild(h4('Biến giao diện toàn cục'));
        pane.appendChild(note('Xem trước trực tiếp trên trang. Nhấn “Khôi phục mặc định” để trở lại ban đầu.'));
        var grid = el('div', 'bkdev-grid2');
        var inputs = {};
        THEME_VARS.forEach(function (v) {
            var i = input('text');
            i.value = getComputedStyle(D.documentElement).getPropertyValue(v[0]).trim() || v[2];
            i.dataset.var = v[0];
            i.addEventListener('input', function () {
                D.documentElement.style.setProperty(v[0], i.value.trim());
            });
            inputs[v[0]] = i;
            grid.appendChild(field(v[1], i));
        });
        pane.appendChild(grid);

        var nameInput = input('text', 'Preset của tôi');
        nameInput.setAttribute('aria-label', 'Tên preset giao diện');
        var presetRow = el('div');
        presetRow.id = 'bkdevThemePresets';
        pane.appendChild(row(
            nameInput,
            btn('Lưu preset', 'bk-btn', 'fa-floppy-disk', function () {
                var presets = read('bk.dev.theme.v1', []) || [];
                var vals = {};
                Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].value.trim(); });
                presets.push({ name: nameInput.value.trim() || 'Preset ' + (presets.length + 1), vars: vals });
                write('bk.dev.theme.v1', presets);
                renderThemePresets(presetRow, inputs);
                BK.ui.toast('Đã lưu preset giao diện', 'success');
            })
        ));
        pane.appendChild(presetRow);

        pane.appendChild(row(
            btn('Sáng / Tối', 'bk-btn', 'fa-circle-half-stroke', function () {
                if (typeof global.toggleDarkMode === 'function') { try { global.toggleDarkMode(); return; } catch (e) { } }
                var dark = !D.documentElement.classList.contains('dark');
                D.documentElement.classList.toggle('dark', dark);
                try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) { }
            }),
            btn('Khôi phục mặc định', '', 'fa-rotate-left', function () {
                THEME_VARS.forEach(function (v) {
                    D.documentElement.style.removeProperty(v[0]);
                    inputs[v[0]].value = getComputedStyle(D.documentElement).getPropertyValue(v[0]).trim() || v[2];
                });
                BK.ui.toast('Đã khôi phục biến giao diện mặc định', 'success');
            }),
            btn('Xuất JSON', '', 'fa-download', function () {
                var vals = {};
                Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].value.trim(); });
                download('bakhi-theme.json', JSON.stringify({ app: 'bakhi', kind: 'theme', version: 1, vars: vals }, null, 2));
            })
        ));
        renderThemePresets(presetRow, inputs);
    }

    function renderThemePresets(host, inputs) {
        if (!host) return;
        host.innerHTML = '';
        var presets = read('bk.dev.theme.v1', []) || [];
        if (!presets.length) { host.appendChild(note('Chưa có preset giao diện.')); return; }
        presets.forEach(function (p, idx) {
            host.appendChild(el('span', 'bk-badge', p.name));
            host.appendChild(btn('Áp dụng', '', 'fa-play', function () {
                Object.keys(p.vars || {}).forEach(function (k) {
                    D.documentElement.style.setProperty(k, p.vars[k]);
                    if (inputs[k]) inputs[k].value = p.vars[k];
                });
            }));
            host.appendChild(btn('', '', 'fa-trash', function () {
                presets.splice(idx, 1);
                write('bk.dev.theme.v1', presets);
                renderThemePresets(host, inputs);
            }));
        });
    }

    /* =====================================================================
       9. Component Library
       ================================================================== */
    function buildComponents(pane) {
        pane.appendChild(note('Thành phần tái sử dụng của Bá Khí. Bấm thử trực tiếp; mã mẫu hiển thị bên dưới mỗi nhóm.'));
        var grid = el('div', 'bkdev-comp-grid');

        function showcase(title, buildDemo, code) {
            var c = el('div', 'bkdev-comp');
            c.appendChild(el('h5', null, title));
            var demo = el('div', 'bk-row');
            buildDemo(demo);
            c.appendChild(demo);
            c.appendChild(el('code', null, code));
            grid.appendChild(c);
        }

        showcase('Buttons', function (d) {
            d.appendChild(btn('Primary', 'bk-btn', '', function () { BK.ui.toast('Nút primary', 'success'); }));
            d.appendChild(btn('Ghost', '', '', function () { BK.ui.toast('Nút ghost', 'info'); }));
            d.appendChild(btn('Danger', 'bk-btn-danger', '', function () { BK.ui.toast('Nút nguy hiểm', 'error'); }));
        }, '<button class="bk-btn">Primary</button>');

        showcase('Badges & Progress', function (d) {
            d.appendChild(el('span', 'bk-badge', 'Mặc định'));
            d.appendChild(el('span', 'bk-badge bk-badge-ok', 'Đạt'));
            d.appendChild(el('span', 'bk-badge bk-badge-warn', 'Cần ôn'));
            d.appendChild(el('span', 'bk-badge bk-badge-danger', 'Sai'));
            var p = el('div', 'bk-progress');
            p.style.width = '100%';
            var f = el('span'); f.style.width = '62%'; p.appendChild(f);
            d.appendChild(p);
        }, '<div class="bk-progress"><span style="width:62%"></span></div>');

        showcase('Inputs & Fields', function (d) {
            var i = input('text');
            i.placeholder = 'Nhập nội dung…';
            d.appendChild(i);
            d.appendChild(selectOpts([['1', 'Lựa chọn 1'], ['2', 'Lựa chọn 2']], '1'));
        }, '<input class="bk-input" placeholder="Nhập nội dung…">');

        showcase('Card', function (d) {
            var c = el('div', 'bk-card');
            c.style.minWidth = '8rem';
            c.appendChild(el('div', 'bk-card-k', 'Đã luyện'));
            c.appendChild(el('div', 'bk-card-v', '128'));
            c.appendChild(el('div', 'bk-card-hint', 'câu hỏi'));
            d.appendChild(c);
        }, '<div class="bk-card"><div class="bk-card-k">Đã luyện</div><div class="bk-card-v">128</div></div>');

        showcase('Modal & Confirm', function (d) {
            d.appendChild(btn('Mở modal', 'bk-btn', 'fa-window-restore', function () {
                BK.ui.modal({ title: 'Modal mẫu', body: BK.ui.el('p', null, 'Nội dung modal dùng chung, hỗ trợ Esc và bẫy focus.') });
            }));
            d.appendChild(btn('Xác nhận', '', 'fa-circle-question', function () {
                BK.ui.confirm({ title: 'Xác nhận mẫu', message: 'Đây là hộp thoại xác nhận dùng chung.' })
                    .then(function (ok) { BK.ui.toast(ok ? 'Bạn đã đồng ý' : 'Bạn đã huỷ', ok ? 'success' : 'info'); });
            }));
        }, 'BK.ui.modal({ title, body })\nBK.ui.confirm({ title, message })');

        showcase('Toast', function (d) {
            d.appendChild(btn('Thành công', 'bk-btn-ok', '', function () { BK.ui.toast('Thành công', 'success'); }));
            d.appendChild(btn('Lỗi', 'bk-btn-danger', '', function () { BK.ui.toast('Có lỗi xảy ra', 'error'); }));
            d.appendChild(btn('Info', '', '', function () { BK.ui.toast('Thông tin', 'info'); }));
        }, "BK.ui.toast('Thành công', 'success')");

        showcase('Tabs', function (d) {
            var tabs = ['Một', 'Hai', 'Ba'];
            var box = el('div');
            tabs.forEach(function (t, i) {
                var b = el('button', 'bk-chip' + (i === 0 ? ' on' : ''), t);
                b.type = 'button';
                b.addEventListener('click', function () {
                    Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('on'); });
                    b.classList.add('on');
                });
                box.appendChild(b);
            });
            d.appendChild(box);
        }, '<button class="bk-chip on">Một</button>');

        showcase('Tooltip', function (d) {
            var b = btn('Rê chuột', '', 'fa-circle-info', function () { });
            b.title = 'Tooltip gốc của trình duyệt, dễ truy cập.';
            d.appendChild(b);
        }, '<button title="Tooltip">Rê chuột</button>');

        showcase('Dropdown', function (d) {
            var sel = selectOpts([['a', 'Tùy chọn A'], ['b', 'Tùy chọn B']], 'a');
            d.appendChild(sel);
        }, '<select class="bk-select">…</select>');

        showcase('Loading & Empty', function (d) {
            d.appendChild(el('div', 'bk-spinner'));
            var e = el('div', 'bk-empty');
            e.appendChild(el('i', 'fa-solid fa-inbox'));
            e.appendChild(el('p', null, 'Chưa có dữ liệu'));
            d.appendChild(e);
        }, '<div class="bk-spinner"></div>\n<div class="bk-empty">…</div>');

        pane.appendChild(grid);
    }

    /* =====================================================================
       10. Backup Manager
       ================================================================== */
    var BACKUP_KEY = 'bk.dev.backups.v1';
    var BACKUP_KEYS = ['bakhiLearn.v1', 'theme', 'fxCfg', 'uiCfg', 'favCfg', 'bktCfg', 'appHighlightsDataMap', 'bgOpacity', 'bgmMuted', 'bk.dev.ui.v1', 'bk.dev.theme.v1', 'bk.dev.anim.v1', 'bk.dev.css.v1'];

    function buildBackup(pane) {
        pane.appendChild(h4('Sao lưu cấu hình'));
        pane.appendChild(note('Sao lưu cấu hình giao diện, Developer Playground và tuỳ chọn học tập. Không bao gồm nội dung giáo dục.'));
        var list = el('div');
        list.id = 'bkdevBackupList';
        pane.appendChild(list);
        pane.appendChild(row(
            btn('Tạo bản sao lưu', 'bk-btn', 'fa-camera', function () { createBackup(); renderBackups(); }),
            btn('Xuất bản mới nhất', '', 'fa-download', function () {
                var list = read(BACKUP_KEY, []) || [];
                if (!list.length) return BK.ui.toast('Chưa có bản sao lưu', 'error');
                download('bakhi-backup-' + BK.util.dayKey() + '.json', JSON.stringify(list[0], null, 2));
            }),
            btn('Nhập bản sao lưu', '', 'fa-upload', importBackup)
        ));
        renderBackups();
    }

    function createBackup() {
        var snap = {};
        BACKUP_KEYS.forEach(function (k) {
            var v = null;
            try { v = localStorage.getItem(k); } catch (e) { }
            if (v != null) snap[k] = v;
        });
        var list = read(BACKUP_KEY, []) || [];
        list.unshift({ version: 1, app: 'bakhi', at: Date.now(), keys: snap });
        write(BACKUP_KEY, list.slice(0, 5));
        BK.ui.toast('Đã tạo bản sao lưu cấu hình', 'success');
    }

    function renderBackups() {
        var host = D.getElementById('bkdevBackupList');
        if (!host) return;
        host.innerHTML = '';
        var list = read(BACKUP_KEY, []) || [];
        if (!list.length) { host.appendChild(note('Chưa có bản sao lưu nào.')); return; }
        list.forEach(function (b, i) {
            var size = JSON.stringify(b).length;
            var card = el('div', 'bk-item');
            var head = el('div', 'bk-item-head');
            var w = el('div');
            w.appendChild(el('p', 'bk-item-title', 'Bản sao lưu #' + (i + 1) + ' · ' + BK.util.fmtTime(b.at)));
            var meta = el('div', 'bk-item-meta');
            meta.appendChild(el('span', 'bk-badge', Object.keys(b.keys || {}).length + ' key'));
            meta.appendChild(el('span', 'bk-badge', bytes(size)));
            w.appendChild(meta);
            head.appendChild(w);
            card.appendChild(head);
            var actions = el('div', 'bk-item-actions');
            actions.appendChild(btn('Xem trước', '', 'fa-eye', function () { previewBackup(b); }));
            actions.appendChild(btn('Khôi phục', '', 'fa-rotate-left', function () { restoreBackup(b); }));
            actions.appendChild(btn('Xoá', '', 'fa-trash', function () {
                list.splice(i, 1); write(BACKUP_KEY, list); renderBackups();
            }));
            card.appendChild(actions);
            host.appendChild(card);
        });
    }

    function previewBackup(b) {
        var body = el('div');
        body.appendChild(el('p', null, 'Tạo lúc ' + BK.util.fmtTime(b.at) + ' · phiên bản ' + (b.version || 1)));
        var tbl = el('table', 'bkdev-table');
        tbl.innerHTML = '<thead><tr><th>Key</th><th>Kích thước</th><th>Bản ghi</th></tr></thead>';
        var tb = el('tbody');
        Object.keys(b.keys || {}).forEach(function (k) {
            var tr = el('tr');
            tr.appendChild(el('td', null, k));
            tr.appendChild(el('td', null, bytes((b.keys[k] || '').length)));
            var records = '—';
            try {
                var parsed = JSON.parse(b.keys[k]);
                if (Array.isArray(parsed)) records = parsed.length + ' mục';
                else if (parsed && typeof parsed === 'object') records = Object.keys(parsed).length + ' khoá';
            } catch (e) { /* bỏ qua */ }
            tr.appendChild(el('td', null, records));
            tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        body.appendChild(tbl);
        body.appendChild(note('Khôi phục sẽ ghi đè các key có trong bản sao lưu. Dữ liệu học tập hiện tại nên được xuất trước.'));
        BK.ui.modal({ title: 'Xem trước bản sao lưu', body: body, wide: true });
    }

    function restoreBackup(b) {
        if (!b || !b.keys) return BK.ui.toast('Bản sao lưu không hợp lệ', 'error');
        BK.ui.confirm({
            title: 'Khôi phục bản sao lưu',
            message: 'Ghi đè ' + Object.keys(b.keys).length + ' key từ bản sao lưu lúc ' + BK.util.fmtTime(b.at) + '? Nên xuất dữ liệu hiện tại trước khi khôi phục.',
            ok: 'Khôi phục'
        }).then(function (ok) {
            if (!ok) return;
            var count = 0;
            Object.keys(b.keys).forEach(function (k) {
                try { localStorage.setItem(k, b.keys[k]); count++; } catch (e) { }
            });
            BK.ui.toast('Đã khôi phục ' + count + ' key. Tải lại trang để áp dụng đầy đủ.', 'success');
            try { if (globalsafe('BKLearn')) BKLearn.applyPreferences(); } catch (e) { }
        });
    }

    function globalsafe(name) { return global[name]; }

    function importBackup() {
        var raw = global.prompt ? global.prompt('Dán nội dung bản sao lưu JSON:') : null;
        if (!raw) return;
        var parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return BK.ui.toast('JSON không hợp lệ', 'error'); }
        var entry = Array.isArray(parsed) ? parsed[0] : parsed;
        if (!entry || !entry.keys || typeof entry.keys !== 'object') return BK.ui.toast('Không phải bản sao lưu hợp lệ', 'error');
        var list = read(BACKUP_KEY, []) || [];
        list.unshift({ version: Number(entry.version) || 1, app: 'bakhi', at: Number(entry.at) || Date.now(), keys: entry.keys });
        write(BACKUP_KEY, list.slice(0, 5));
        renderBackups();
        BK.ui.toast('Đã nhập bản sao lưu', 'success');
    }

    /* =====================================================================
       11. Music (tích hợp Music Player dùng chung)
       ================================================================== */
    function buildMusic(pane) {
        var M = global.BKMusic;
        pane.appendChild(h4('Music Player'));
        if (!M) {
            pane.appendChild(note('Music Player chưa nạp. Tải lại trang hoặc kiểm tra assets/bakhi/bk-music.js.'));
            return;
        }

        var status = el('div', 'bkdev-note');
        var out = el('pre', 'bkdev-out');
        var listBox = el('div');

        function fmtT(t) { return isFinite(t) ? Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0') : '0:00'; }

        function renderStatus() {
            var s = M.state;
            var t = M.tracks[s.queue[s.qi]] || {};
            status.textContent = [
                'Đang phát: ' + (t.title || '—'),
                'Queue: ' + s.queue.length + ' bài (vị trí ' + (s.qi + 1) + ')',
                'Shuffle: ' + (s.shuffle ? 'on' : 'off'),
                'Repeat: ' + ['off', 'all', 'one'][s.repeat] || 'off',
                'Âm lượng: ' + Math.round(s.volume * 100) + '%' + (s.muted ? ' (muted)' : ''),
                'Trạng thái: ' + (s.playing ? 'playing' : 'paused')
            ].join(' · ');
        }

        function renderList() {
            listBox.innerHTML = '';
            var tbl = el('table', 'bkdev-table');
            tbl.innerHTML = '<thead><tr><th>#</th><th>Bài hát</th><th>File</th><th></th></tr></thead>';
            var tb = el('tbody');
            M.tracks.forEach(function (t, i) {
                var tr = el('tr');
                tr.appendChild(el('td', null, String(i + 1)));
                tr.appendChild(el('td', null, t.title));
                var fileCell = el('td');
                var link = el('a', null, t.src.split('/').pop());
                link.href = t.src;
                link.target = '_blank';
                link.rel = 'noopener';
                fileCell.appendChild(link);
                tr.appendChild(fileCell);
                var act = el('td');
                act.appendChild(btn('Phát', 'bk-btn bk-btn-sm', 'fa-play', function () {
                    var qi = M.state.queue.indexOf(i);
                    if (qi < 0) { M.addToQueue(i); qi = M.state.queue.indexOf(i); }
                    M.loadTrack(qi, true);
                    renderStatus();
                }));
                act.appendChild(btn('Queue', 'bk-btn bk-btn-ghost bk-btn-sm', 'fa-plus', function () {
                    M.addToQueue(i); renderStatus();
                }));
                tr.appendChild(act);
                tb.appendChild(tr);
            });
            tbl.appendChild(tb);
            listBox.appendChild(tbl);
        }

        function checkFiles() {
            out.textContent = 'Đang kiểm tra ' + M.tracks.length + ' file…';
            var lines = [];
            var left = M.tracks.length;
            M.tracks.forEach(function (t) {
                var probe = new Audio();
                probe.preload = 'metadata';
                probe.onloadedmetadata = function () { done(t, 'OK ' + Math.round(probe.duration) + 's'); };
                probe.onerror = function () { done(t, 'LỖI không tải được'); };
                function done(track, msg) {
                    lines.push((msg.indexOf('OK') === 0 ? '✓ ' : '✗ ') + track.title + ' — ' + msg);
                    probe.src = '';
                    if (--left === 0) out.textContent = lines.join('\n');
                }
                probe.src = t.src;
            });
        }

        pane.appendChild(row(
            btn('Mở Music Player', 'bk-btn', 'fa-music', function () { M.open(); renderStatus(); }),
            btn('Phóng to', '', 'fa-expand', function () { M.maximize(true); }),
            btn('Thu nhỏ', '', 'fa-compress', function () { M.minimize(true); }),
            btn('Đặt lại bố cục', '', 'fa-arrows-to-dot', function () { M.resetLayout(); }),
            btn('Đóng Music Player', '', 'fa-xmark', function () { M.close(); }),
            btn('Bật / Tắt phát', '', 'fa-play', function () { M.playPause(); renderStatus(); }),
            btn('Bài kế', '', 'fa-forward-step', function () { M.next(); renderStatus(); }),
            btn('Bài trước', '', 'fa-backward-step', function () { M.prev(); renderStatus(); }),
            btn('Shuffle', '', 'fa-shuffle', function () { M.setShuffle(!M.state.shuffle); renderStatus(); }),
            btn('Repeat', '', 'fa-repeat', function () { M.setRepeat((M.state.repeat + 1) % 3); renderStatus(); }),
            btn('Reset trạng thái', '', 'fa-rotate-left', function () {
                BK.ui.confirm({ title: 'Reset Music Player', message: 'Đưa queue, shuffle, repeat và âm lượng về mặc định?', ok: 'Reset', danger: true }).then(function (ok) {
                    if (!ok) return;
                    M.reset(); renderStatus();
                });
            })
        ));
        pane.appendChild(status);
        pane.appendChild(row(
            btn('Kiểm tra file nhạc', 'bk-btn', 'fa-circle-check', checkFiles),
            btn('Xem Queue', '', 'fa-list', function () { M.open(); renderStatus(); })
        ));
        pane.appendChild(out);

        pane.appendChild(h4('Thư viện (' + M.tracks.length + ' bài)'));
        pane.appendChild(listBox);
        renderList();
        renderStatus();
        /* Cập nhật theo sự kiện thay vì polling mỗi giây; tự gỡ khi rời tab. */
        var unsub = (typeof M.on === 'function') ? M.on(function () { renderStatus(); }) : null;
        var watch = setInterval(function () {
            if (D.body.contains(pane)) return;
            clearInterval(watch);
            if (unsub) unsub();
        }, 5000);
        pane.appendChild(note('Space phát / tạm dừng khi Music Player đang mở. Kéo thanh tiêu đề để di chuyển, kéo góc dưới-trái để đổi kích thước, nhấp đúp tiêu đề để đặt lại. Tab này chỉ đọc trạng thái player dùng chung; mọi thay đổi thực hiện qua Music Player để đồng bộ toàn site.'));
    }

    /* =====================================================================
       Khởi động
       ================================================================== */
    var FAB_KEY = 'bk.dev.fab.v1';

    function buildFab() {
        if (D.getElementById('bkdevFab')) return;
        var fab = el('button', 'bkdev-fab');
        fab.id = 'bkdevFab';
        fab.type = 'button';
        fab.title = 'Developer Playground (Ctrl+Shift+G) — kéo để di chuyển, chuột phải để đặt lại vị trí';
        fab.setAttribute('aria-label', 'Mở Developer Playground');
        fab.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i>';
        D.body.appendChild(fab);
        makeFabDraggable(fab);
    }

    /**
     * Logo Dev Panel kéo thả tự do bằng Pointer Events (chuột + cảm ứng).
     * - Vị trí lưu ở localStorage (FAB_KEY).
     * - Chỉ mở panel khi click KHÔNG kèm thao tác kéo (ngưỡng 5px).
     * - Không giới hạn trong khung nhìn; chuột phải để đặt lại vị trí mặc định.
     */
    function makeFabDraggable(fab) {
        var pos = read(FAB_KEY, null);
        var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null;
        var suppressClick = false;

        function apply() {
            if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
            fab.style.left = pos.x + 'px';
            fab.style.top = pos.y + 'px';
            fab.style.bottom = 'auto';
            fab.style.right = 'auto';
        }
        apply();

        fab.style.touchAction = 'none';

        fab.addEventListener('pointerdown', function (e) {
            if (e.button != null && e.button !== 0) return;
            dragging = true; moved = false;
            suppressClick = false;
            pid = e.pointerId;
            sx = e.clientX; sy = e.clientY;
            var r = fab.getBoundingClientRect();
            ox = r.left; oy = r.top;
            try { fab.setPointerCapture(pid); } catch (err) { }
            fab.classList.add('bkdev-fab-drag');
        });

        fab.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
            moved = true;
            e.preventDefault();
            fab.style.left = (ox + dx) + 'px';
            fab.style.top = (oy + dy) + 'px';
            fab.style.bottom = 'auto';
            fab.style.right = 'auto';
        });

        function end(e) {
            if (!dragging) return;
            dragging = false;
            fab.classList.remove('bkdev-fab-drag');
            try { if (pid != null) fab.releasePointerCapture(pid); } catch (err) { }
            pid = null;
            if (moved) {
                suppressClick = true;
                var r = fab.getBoundingClientRect();
                pos = { x: Math.round(r.left), y: Math.round(r.top) };
                write(FAB_KEY, pos);
                /* Trả lại false ngay sau khi click tổng hợp bị chặn. */
                setTimeout(function () { suppressClick = false; }, 0);
            }
            if (e && e.pointerType === 'touch') { /* tránh click giả lập */ }
        }
        fab.addEventListener('pointerup', end);
        fab.addEventListener('pointercancel', end);

        fab.addEventListener('click', function (e) {
            if (moved || suppressClick) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
            open();
        });

        fab.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            pos = null;
            try { localStorage.removeItem(FAB_KEY); } catch (err) { }
            fab.style.left = ''; fab.style.top = '';
            fab.style.bottom = ''; fab.style.right = '';
            BK.ui.toast('Đã đặt lại vị trí logo Dev Panel', 'success');
        });
    }

    D.addEventListener('keydown', function (e) {
        if (e.defaultPrevented) return;
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            open();
        }
    });

    function init() {
        buildFab();
        if (ui.min || ui.max || ui.w) { /* panel sẽ áp dụng khi mở */ }
    }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();

    global.BKDev = {
        open: open, close: close, activate: activate, authorized: authorized,
        inspector: picker, version: '2.0.0'
    };
})(typeof window !== 'undefined' ? window : this);
