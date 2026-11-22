/* =========================================================================
   Bá Khí — bk-themes.js (8.4.0)
   Hệ thống "Giao diện" (Theme) + thành phần tên người dùng có trang trí.

   Nguyên tắc:
   - Quyền sở hữu và lựa chọn giao diện là dữ liệu MÁY CHỦ (user_inventory,
     kind = 'theme'). Tệp này chỉ giữ bản cache cục bộ để trang tĩnh (trang
     môn học) hiện đúng giao diện ngay khi tải, kể cả khi chưa đăng nhập.
   - Không tự mở khoá giao diện: chỉ áp dụng khi giao diện có trong danh sách
     đã sở hữu do máy chủ trả về.
   - Không đổi dữ liệu học tập, không cộng XP.

   Phạm vi (xem bk-themes.css):
     page   → trang chủ, nền phủ toàn màn hình
     head   → trang môn học, chỉ header
     accent → hồ sơ / tiến trình / cài đặt, chỉ điểm nhấn

   Công khai: window.BKThemes, window.BKUserName
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKThemes) return;

    var STORAGE = 'bakhiTheme.v1';
    var HTML = D.documentElement;

    /* ------------------------------------------------------- Danh mục giao diện */
    var THEMES = [
        { id: 'theme-dawn', name: 'Bình Minh', art: 'sunrise', accent: '#f59e0b',
          desc: 'Tông cam hồng của buổi sớm, nền sáng dần từ chân trời.' },
        { id: 'theme-midnight', name: 'Nửa Đêm', art: 'night', accent: '#38bdf8',
          desc: 'Xanh đêm sâu với quầng sáng lạnh, dịu mắt khi học khuya.' },
        { id: 'theme-sakura', name: 'Anh Đào', art: 'sakura', accent: '#f472b6',
          desc: 'Hồng phấn và tím nhạt, nhẹ nhàng như cánh hoa rơi.' },
        { id: 'theme-ocean', name: 'Đại Dương', art: 'ocean', accent: '#0ea5e9',
          desc: 'Xanh biển sâu chuyển sang ngọc lam.' },
        { id: 'theme-forest', name: 'Rừng Xanh', art: 'forest', accent: '#22c55e',
          desc: 'Xanh lá trầm, phù hợp buổi học dài.' },
        { id: 'theme-royal', name: 'Hoàng Gia', art: 'royal', accent: '#a855f7',
          desc: 'Tím vương giả phối vàng đồng.' },
        { id: 'theme-mint', name: 'Bạc Hà', art: 'mint', accent: '#14b8a6',
          desc: 'Xanh ngọc mát, tối giản.' },
        { id: 'theme-ember', name: 'Hồng Ngọc', art: 'ember', accent: '#f43f5e',
          desc: 'Đỏ ấm như than hồng, dành cho ngày ôn thi.' },
        { id: 'theme-halloween', name: 'Halloween', art: 'halloween', accent: '#fb923c',
          desc: 'Đêm Halloween với bí ngô khắc mặt phát sáng và dơi bay.' },
        { id: 'theme-christmas', name: 'Giáng Sinh', art: 'christmas', accent: '#f87171',
          desc: 'Mùa đông xanh đỏ, tuyết rơi liên tục và cây thông trang trí.' }
    ];
    var BY_ID = {};
    THEMES.forEach(function (t) { BY_ID[t.id] = t; });

    /* Hai giao diện theo mùa MIỄN PHÍ cho toàn bộ học sinh (8.4.3).
       Máy chủ cấp sẵn dòng user_inventory (migration 20261215000000); client vẫn
       coi là đã sở hữu ngay cả khi kho chưa đồng bộ, để chọn được tức thì trong
       Cài đặt → Hình nền. Không mở khoá bất kỳ giao diện nào khác. */
    var FREE_THEMES = ['theme-halloween', 'theme-christmas'];
    function isFree(id) { return FREE_THEMES.indexOf(id) >= 0; }

    /* ------------------------------------------------------------- Tiện ích */
    function el(tag, cls, text) {
        var node = D.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = String(text);
        return node;
    }
    function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function read() {
        var raw = lsGet(STORAGE);
        if (!raw) return { id: null, owned: [], deco: null };
        var v;
        try { v = JSON.parse(raw); } catch (e) { v = null; }
        if (!v || typeof v !== 'object') return { id: null, owned: [], deco: null };
        return {
            id: v.id && BY_ID[v.id] ? v.id : null,
            owned: Array.isArray(v.owned) ? v.owned.filter(function (x) { return typeof x === 'string'; }) : [],
            deco: v.deco && v.deco.icon ? { icon: String(v.deco.icon), name: String(v.deco.name || '') } : null
        };
    }
    function write(next) {
        var cur = read();
        var merged = {
            id: next.id !== undefined ? next.id : cur.id,
            owned: next.owned !== undefined ? next.owned : cur.owned,
            deco: next.deco !== undefined ? next.deco : cur.deco
        };
        lsSet(STORAGE, JSON.stringify(merged));
        return merged;
    }
    function reducedMotion() {
        if (HTML.classList.contains('bk-a11y-reduce-motion')) return true;
        try {
            return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) { return false; }
    }

    /* ------------------------------------------------------- Phạm vi hiển thị */
    var SUBJECT_DIRS = ['ktgk1', 'ktgk2', 'ktck1', 'ktck2', 'kttx'];

    /* Trang có chủ đề riêng (không phủ nền): hồ sơ, tiến trình, cài đặt… */
    var ACCENT_DIRS = ['profile', 'settings', 'gamification', 'skills', 'chat', 'studio'];
    var ADMIN_DIRS = ['admin', 'founder'];

    function detectScope() {
        var declared = D.body && D.body.getAttribute && D.body.getAttribute('data-bk-theme-scope');
        if (declared === 'page' || declared === 'head' || declared === 'accent' || declared === 'none') {
            return declared;
        }
        /* GitHub Pages phục vụ site dưới /bakhi/, nên phải tìm thư mục quen thuộc
           ở BẤT KỲ vị trí nào trong đường dẫn, không chỉ đoạn đầu. */
        var parts = String(global.location && global.location.pathname || '/')
            .split('/').filter(Boolean);
        for (var i = 0; i < parts.length; i++) {
            if (SUBJECT_DIRS.indexOf(parts[i]) >= 0) return 'head';
            if (ADMIN_DIRS.indexOf(parts[i]) >= 0) return 'none';
            if (ACCENT_DIRS.indexOf(parts[i]) >= 0) return 'accent';
        }
        return 'page';
    }

    function headTargets() {
        var out = [];
        var selectors = ['.bk-page-head', '.bk-topbar', 'header', 'nav'];
        for (var i = 0; i < selectors.length; i++) {
            var node = D.querySelector(selectors[i]);
            if (node) { out.push(node); break; }
        }
        if (!out.length) {
            var main = D.querySelector('main');
            if (main) out.push(main);
        }
        return out;
    }

    /* ---------------------------------------------------------------- Lớp nền */
    function removeNode(id) {
        var old = D.getElementById(id);
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    function clearLayer() {
        removeNode('bkThemeLayer');
        removeNode('bkThemeFx');
    }

    /* Tuyết dùng chung cho cả ba phạm vi: nền trang chủ, lớp phủ toàn trang
       (hồ sơ/cài đặt/tiến trình) và khung header trang môn học. */
    function snowPile(count, cls) {
        var snow = el('div', cls || null);
        if (reducedMotion()) return snow;
        for (var i = 0; i < count; i++) {
            var size = 3 + (i % 5);
            var flake = el('span', 'bkth-flake');
            flake.style.left = ((i * 97) % 100) + '%';
            flake.style.width = size + 'px';
            flake.style.height = size + 'px';
            flake.style.animationDuration = (9 + (i % 7) * 2) + 's';
            flake.style.animationDelay = '-' + (i % 11) + 's';
            flake.style.opacity = String(0.35 + ((i % 4) * 0.15));
            snow.appendChild(flake);
        }
        return snow;
    }

    function buildLayer(theme) {
        clearLayer();
        var layer = el('div');
        layer.id = 'bkThemeLayer';
        layer.setAttribute('aria-hidden', 'true');

        var art = el('div', 'bkth-' + theme.art);
        layer.appendChild(art);
        layer.appendChild(el('div', 'bkth-veil'));

        /* Hiệu ứng chuyển động nằm ở lớp riêng TRÊN nội dung (#bkThemeFx) để bí ngô
           rơi và tuyết rơi thấy được khắp trang; nền + veil vẫn ở dưới nội dung. */
        var fx = el('div');
        fx.id = 'bkThemeFx';
        fx.setAttribute('aria-hidden', 'true');
        var hasFx = false;

        if (theme.art === 'halloween') {
            hasFx = true;
            ['is-a', 'is-b', 'is-c'].forEach(function (cls) {
                var p = el('div', 'bkth-pumpkin ' + cls);
                p.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'%3E%3Cellipse cx='80' cy='72' rx='54' ry='42' fill='%23f97316'/%3E%3Cellipse cx='80' cy='72' rx='54' ry='42' fill='none' stroke='%239a3412' stroke-width='3'/%3E%3Cellipse cx='80' cy='72' rx='34' ry='42' fill='none' stroke='%23ea580c' stroke-width='2.5'/%3E%3Cellipse cx='80' cy='72' rx='16' ry='42' fill='none' stroke='%23ea580c' stroke-width='2.5'/%3E%3Cpath d='M80 30 q8 -14 18 -16 q-6 10 -3 18z' fill='%2315803d'/%3E%3Cpath d='M54 64 l18 0 l-9 15z' fill='%23111827'/%3E%3Cpath d='M106 64 l-18 0 l9 15z' fill='%23111827'/%3E%3Cpath d='M56 86 q24 16 48 0 l-8 12 l-8 -7 l-6 10 l-6 -10 l-8 7z' fill='%23111827'/%3E%3C/svg%3E\")";
                fx.appendChild(p);
            });
            if (!reducedMotion()) {
                [0, 1].forEach(function (i) {
                    var bat = el('div', 'bkth-bat');
                    bat.style.top = (12 + i * 9) + 'vw';
                    bat.style.animationDelay = (i * 6) + 's';
                    fx.appendChild(bat);
                });
            }
        } else if (theme.art === 'christmas') {
            hasFx = true;
            fx.appendChild(snowPile(44, 'bkth-snow'));
            var tree = el('div', 'bkth-tree');
            tree.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'%3E%3Cpath d='M70 8 L104 56 L88 56 L112 96 L92 96 L118 132 L22 132 L48 96 L28 96 L52 56 L36 56 Z' fill='%2315803d'/%3E%3Cpath d='M70 8 L104 56 L88 56 L112 96 L92 96 L118 132 L70 132 Z' fill='%23166534' opacity='.7'/%3E%3Ccircle cx='70' cy='52' r='5' fill='%23facc15'/%3E%3Ccircle cx='56' cy='82' r='4.5' fill='%23ef4444'/%3E%3Ccircle cx='86' cy='92' r='4.5' fill='%23e2e8f0'/%3E%3Ccircle cx='64' cy='112' r='4' fill='%2338bdf8'/%3E%3Cpath d='M70 132 l-4 8 h8 z' fill='%2378350f'/%3E%3C/svg%3E\")";
            layer.appendChild(tree);
        }

        var nodes = hasFx ? [layer, fx] : [layer];
        if (D.body) {
            nodes.forEach(function (n) { D.body.appendChild(n); });
        } else {
            D.addEventListener('DOMContentLoaded', function () {
                if (D.body) nodes.forEach(function (n) { D.body.appendChild(n); });
            }, { once: true });
        }
        return layer;
    }

    /* Trang chỉ dùng điểm nhấn (hồ sơ, cài đặt, tiến trình…): tuyết rơi phủ
       toàn trang nhưng KHÔNG vẽ lại nền, để nội dung vẫn đọc rõ. */
    function buildOverlay(theme) {
        removeNode('bkThemeOverlay');
        if (!theme || theme.art !== 'christmas' || !D.body) return null;
        var layer = el('div');
        layer.id = 'bkThemeOverlay';
        layer.setAttribute('aria-hidden', 'true');
        layer.appendChild(snowPile(30, 'bkth-snow'));
        D.body.appendChild(layer);
        return layer;
    }

    /* Trang môn học: tuyết rơi trong đúng khung header, phần bài học giữ nguyên. */
    function buildHeadSnow(targets, theme) {
        if (!theme || theme.art !== 'christmas') return;
        targets.forEach(function (node) {
            var box = el('div', 'bkth-head-snow');
            box.setAttribute('aria-hidden', 'true');
            box.appendChild(snowPile(20));
            node.appendChild(box);
        });
    }

    /* ------------------------------------------------------------- Áp dụng */
    function clearScopeMarks() {
        var marked = D.querySelectorAll('.bk-theme-head');
        for (var i = 0; i < marked.length; i++) marked[i].classList.remove('bk-theme-head');
        var snowHeads = D.querySelectorAll('.bkth-head-snow');
        for (var j = 0; j < snowHeads.length; j++) {
            if (snowHeads[j].parentNode) snowHeads[j].parentNode.removeChild(snowHeads[j]);
        }
        removeNode('bkThemeOverlay');
        HTML.removeAttribute('data-bk-theme');
        HTML.removeAttribute('data-bk-theme-scope');
        clearLayer();
    }

    function paint(id) {
        var theme = id ? BY_ID[id] : null;
        if (!theme) { clearScopeMarks(); return null; }
        var scope = detectScope();
        clearScopeMarks();
        if (scope === 'none') return null;
        HTML.setAttribute('data-bk-theme', theme.id);
        HTML.setAttribute('data-bk-theme-scope', scope);
        if (scope === 'page') {
            buildLayer(theme);
        } else if (scope === 'head') {
            var targets = headTargets();
            targets.forEach(function (node) { node.classList.add('bk-theme-head'); });
            buildHeadSnow(targets, theme);
        } else if (scope === 'accent') {
            buildOverlay(theme);
        }
        return { id: theme.id, scope: scope };
    }

    /* ------------------------------------------------------------ Máy chủ */
    function api() {
        if (global.BKCloud && typeof global.BKCloud.gamificationApi === 'function') {
            return global.BKCloud.gamificationApi;
        }
        if (global.BK && global.BK.gamification && typeof global.BK.gamification.api === 'function') {
            return global.BK.gamification.api;
        }
        return null;
    }

    function equipOnServer(itemId, equipped) {
        var call = api();
        if (!call) return Promise.resolve({ ok: false, offline: true });
        try {
            return Promise.resolve(call({ action: 'equip', item_id: itemId, equipped: !!equipped }))
                .catch(function () { return { ok: false, offline: true }; });
        } catch (e) {
            return Promise.resolve({ ok: false, offline: true });
        }
    }

    /* ---------------------------------------------------------- Trạng thái */
    function current() {
        var cache = read();
        return cache.id && BY_ID[cache.id] ? BY_ID[cache.id] : null;
    }
    function ownedIds() {
        return read().owned.slice();
    }
    function owns(id) {
        if (isFree(id)) return true;
        var owned = ownedIds();
        if (!owned.length) return false;
        return owned.indexOf(id) >= 0;
    }

    /**
     * Đồng bộ từ trạng thái gamification (n-nguồn sự thật của kho vật phẩm).
     * Gọi từ bk-gamification.js sau mỗi lần tải/đổi trạng thái.
     */
    function syncFromState(state) {
        if (!state || !Array.isArray(state.inventory)) return read();
        var owned = [];
        var themeId = null;
        var deco = null;
        state.inventory.forEach(function (item) {
            if (!item) return;
            if (item.kind === 'theme') {
                if (item.item_id) owned.push(String(item.item_id));
                if (item.is_equipped && !themeId) themeId = String(item.item_id);
            }
            if (item.kind === 'decoration' && item.is_equipped && !deco) {
                deco = { icon: String(item.icon || 'fa-feather'), name: String(item.name || '') };
            }
        });
        FREE_THEMES.forEach(function (id) {
            if (owned.indexOf(id) < 0) owned.push(id);
        });
        var next = write({ id: themeId, owned: owned, deco: deco });
        paint(next.id);
        if (global.BKUserName) {
            try { global.BKUserName.refresh(); } catch (e) { }
        }
        return next;
    }

    /**
     * Người dùng chọn giao diện. Trả về Promise<{ok, id, error}>.
     * Không cho áp dụng giao diện chưa sở hữu (khi đã biết danh sách sở hữu).
     */
    function setTheme(id) {
        var theme = id && id !== 'none' ? BY_ID[id] : null;
        if (id && id !== 'none' && !theme) {
            return Promise.resolve({ ok: false, error: 'Giao diện không tồn tại.' });
        }
        if (theme && ownedIds().length && !owns(theme.id)) {
            return Promise.resolve({ ok: false, error: 'Bạn chưa sở hữu giao diện này.' });
        }
        var prev = read();
        write({ id: theme ? theme.id : null });
        paint(theme ? theme.id : null);

        if (!theme) {
            var fallback = prev.id;
            if (!fallback) return Promise.resolve({ ok: true, id: null, synced: true });
            return equipOnServer(fallback, false).then(function (res) {
                return { ok: true, id: null, synced: !(res && res.offline) };
            });
        }
        if (prev.id && prev.id !== theme.id) equipOnServer(prev.id, false);
        return equipOnServer(theme.id, true).then(function (res) {
            return { ok: true, id: theme.id, synced: !(res && res.offline) };
        });
    }

    /* ------------------------------------------------------ Thẻ chọn giao diện */
    function themeThumb(theme, active) {
        var card = el('button', 'bkth-card' + (active ? ' is-active' : ''));
        card.type = 'button';
        card.setAttribute('data-theme-id', theme.id);
        card.setAttribute('aria-pressed', active ? 'true' : 'false');

        var thumb = el('span', 'bkth-thumb');
        thumb.style.background = 'linear-gradient(135deg,' + (theme.accent || '#6366f1') + ', #0f172a)';
        if (theme.art === 'halloween' || theme.art === 'christmas') {
            var art = el('span', 'bkth-thumb-art');
            art.style.backgroundImage = 'var(--bkth-art-' + theme.art + ')';
            thumb.appendChild(art);
        }
        card.appendChild(thumb);

        var body = el('span', 'bkth-body');
        body.appendChild(el('span', 'bkth-name', theme.name));
        card.appendChild(body);
        return card;
    }

    /**
     * Dựng danh sách giao diện trong Cài đặt → Hình nền.
     * opts: { host, toast, onApplied }
     */
    function renderPicker(host, opts) {
        if (!host) return;
        opts = opts || {};
        var toast = opts.toast || function () { };
        host.textContent = '';

        /* Xem trước */
        var preview = el('div', 'bkth-preview');
        var previewArt = el('div', 'bkth-thumb-art');
        var veil = el('div', 'bkth-veil');
        preview.appendChild(previewArt);
        preview.appendChild(veil);
        host.appendChild(preview);

        var note = el('p', 'bkth-note',
            'Giao diện mở khoá từ Kho vật phẩm; riêng Halloween và Giáng Sinh miễn phí cho mọi học sinh. ' +
            'Chọn một giao diện để dùng — lựa chọn được lưu trên máy chủ ' +
            'theo tài khoản nên vẫn giữ khi đăng nhập thiết bị khác. Trang chủ hiện nền toàn màn hình, ' +
            'trang môn học chỉ hiện ở phần đầu trang.');
        host.appendChild(note);

        var grid = el('div', 'bkth-grid');
        host.appendChild(grid);

        var actions = el('div');
        actions.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap;margin:.2rem 0 .4rem';
        var reset = el('button', 'bk-btn bk-btn-ghost');
        reset.type = 'button';
        reset.appendChild(el('i', 'fa-solid fa-ban'));
        reset.appendChild(el('span', null, 'Về giao diện mặc định'));
        actions.appendChild(reset);
        host.appendChild(actions);

        var activeId = (current() || {}).id || null;

        function paintPreview(id) {
            var theme = id && BY_ID[id];
            if (!theme) {
                preview.style.background = 'linear-gradient(135deg,#0f172a,#1e293b)';
                previewArt.style.backgroundImage = 'none';
                return;
            }
            preview.style.background = 'linear-gradient(135deg,' + theme.accent + ', #0b1120)';
            if (theme.art === 'halloween' || theme.art === 'christmas') {
                previewArt.style.backgroundImage = 'var(--bkth-art-' + theme.art + ')';
            } else {
                previewArt.style.backgroundImage = 'none';
            }
        }

        function paintGrid() {
            grid.textContent = '';
            THEMES.forEach(function (theme) {
                var isActive = theme.id === activeId;
                var card = themeThumb(theme, isActive);
                var body = card.querySelector('.bkth-body');
                if (!owns(theme.id) && ownedIds().length) {
                    card.classList.add('is-locked');
                    card.disabled = true;
                    card.setAttribute('aria-disabled', 'true');
                    var lock = el('span', 'bkth-badge', 'Chưa sở hữu');
                    card.appendChild(lock);
                    body.appendChild(el('span', 'bkth-state', 'Mở từ Kho vật phẩm'));
                } else {
                    if (isFree(theme.id)) {
                        card.appendChild(el('span', 'bkth-badge is-free', 'Miễn phí'));
                    }
                    body.appendChild(el('span', 'bkth-state' + (isActive ? ' is-active' : ''),
                        isActive ? 'Đang dùng' : (isFree(theme.id) ? 'Sẵn sàng · miễn phí' : 'Sẵn sàng')));
                }
                card.addEventListener('mouseenter', function () { paintPreview(theme.id); });
                card.addEventListener('focus', function () { paintPreview(theme.id); });
                card.addEventListener('click', function () {
                    if (card.disabled) return;
                    card.setAttribute('aria-busy', 'true');
                    setTheme(theme.id).then(function (res) {
                        card.removeAttribute('aria-busy');
                        if (!res.ok) { toast(res.error || 'Không đổi được giao diện.', 'error'); return; }
                        activeId = res.id;
                        paintGrid();
                        paintPreview(activeId);
                        toast(res.synced === false
                            ? 'Đã đổi giao diện trên thiết bị này. Máy chủ chưa xác nhận.'
                            : 'Đã đổi giao diện và đồng bộ tài khoản.', res.synced === false ? 'warn' : 'success');
                        if (typeof opts.onApplied === 'function') opts.onApplied(res);
                    });
                });
                grid.appendChild(card);
            });
            paintPreview(activeId);
        }

        reset.addEventListener('click', function () {
            setTheme('none').then(function (res) {
                activeId = null;
                paintGrid();
                toast(res && res.synced === false
                    ? 'Đã về giao diện mặc định trên thiết bị này.'
                    : 'Đã về giao diện mặc định.', 'success');
                if (typeof opts.onApplied === 'function') opts.onApplied(res);
            });
        });

        paintGrid();
    }

    /* =====================================================================
       Tên người dùng có biểu tượng trang trí (thành phần dùng chung)
       Không nơi nào tự dựng icon riêng — mọi chỗ gọi BKUserName.
       ===================================================================== */
    var UserName = (function () {
        function deco() {
            var cache = read();
            return cache.deco || null;
        }
        function decoNode(d, opts) {
            if (!d || !d.icon) return null;
            var i = el('i', 'fa-solid ' + d.icon + ' bk-user-deco' +
                (opts && opts.plain ? ' is-plain' : ''));
            i.setAttribute('aria-hidden', 'true');
            if (d.name) i.setAttribute('title', d.name);
            return i;
        }
        /**
         * node(name, {deco, size: 'compact'|'large', plain, tag})
         * deco = {icon, name} | null ; mặc định lấy biểu tượng đang trang bị.
         */
        function node(name, opts) {
            opts = opts || {};
            var wrap = el(opts.tag || 'span', 'bk-user-name' +
                (opts.size ? ' is-' + opts.size : ''));
            var text = el('span', 'bk-user-name-text', name == null ? '' : name);
            wrap.appendChild(text);
            var d = opts.deco !== undefined ? opts.deco : deco();
            var badge = decoNode(d, opts);
            if (badge) wrap.appendChild(badge);
            wrap.setAttribute('data-bk-user-name', '1');
            return wrap;
        }
        /** Mini profile: [Avatar] Tên [Biểu tượng] + dòng phụ. */
        function mini(opts) {
            opts = opts || {};
            var wrap = el('div', 'bk-mini-profile');
            if (opts.avatar) {
                var holder = el('span', 'bk-mini-profile-avatar');
                if (typeof opts.avatar === 'string') {
                    holder.appendChild(D.createTextNode(opts.avatar));
                } else {
                    holder.appendChild(opts.avatar);
                }
                wrap.appendChild(holder);
            }
            var body = el('div', 'bk-mini-profile-body');
            body.appendChild(node(opts.name, {
                deco: opts.deco,
                size: opts.size || 'compact'
            }));
            if (opts.sub) body.appendChild(el('span', 'bk-mini-profile-sub', opts.sub));
            wrap.appendChild(body);
            return wrap;
        }
        /** Cập nhật mọi phần tử đang hiển thị tên có trang trí. */
        function refresh() {
            var nodes = D.querySelectorAll('[data-bk-user-name]');
            for (var i = 0; i < nodes.length; i++) {
                var host = nodes[i];
                var old = host.querySelector('.bk-user-deco');
                if (old && old.parentNode) old.parentNode.removeChild(old);
                var d = deco();
                var badge = decoNode(d, {});
                if (badge) host.appendChild(badge);
            }
        }
        return { node: node, mini: mini, deco: deco, refresh: refresh };
    })();

    /* ------------------------------------------------------------- Khởi động */
    var booted = false;
    function boot() {
        if (booted) return;
        booted = true;
        var cache = read();
        if (cache.id) paint(cache.id);
        try {
            var mq = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
            if (mq && mq.addEventListener) {
                mq.addEventListener('change', function () { paint(read().id); });
            }
        } catch (e) { }
    }

    boot();
    if (D.readyState === 'loading') {
        D.addEventListener('DOMContentLoaded', boot, { once: true });
    }

    global.BKThemes = {
        version: '8.4.0',
        THEMES: THEMES,
        FREE_THEMES: FREE_THEMES,
        isFree: isFree,
        boot: boot,
        current: current,
        owned: ownedIds,
        owns: owns,
        setTheme: setTheme,
        syncFromState: syncFromState,
        renderPicker: renderPicker,
        refresh: function () { paint(read().id); },
        scope: detectScope
    };
    global.BKUserName = UserName;
})(typeof window !== 'undefined' ? window : this);
