/* =========================================================================
   Bá Khí — bk-titles.js (7.7.0)

   Danh hiệu (Title) là lớp hiển thị ĐỘC LẬP với badge, khung avatar và thành
   tích, nhưng mặc định ánh xạ 1-1 từ badge nguồn để xác minh quyền sở hữu.

   Mô-đun này cung cấp:
   - BK.titles.chip(title)      chip danh hiệu dùng chung (chat, hồ sơ, dashboard)
   - BK.titles.apply(node, t)   áp kiểu hiển thị lên một node đã có
   - BK.titles.card()           khối "Danh hiệu của tôi" cho trang Hồ sơ / Cài đặt
   - BK.titles.preview(host, t) vẽ trước một danh hiệu trong trình soạn danh mục

   Hai kiểu hiển thị:
   - plain   : font thường, màu tĩnh.
   - special : font đặc biệt + gradient màu chuyển động (tôn trọng
               prefers-reduced-motion và công tắc "Animate Avatar Borders").
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BK && global.BK.titles) return;

    var FONTS = ['sans', 'serif', 'display', 'mono', 'elegant', 'rounded'];
    var EFFECTS = ['none', 'flow', 'shimmer', 'pulse', 'aurora'];
    var COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

    function el(tag, cls, text) {
        var node = D.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        var i = el('i', 'fa-solid ' + (name || 'fa-medal'));
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function normalize(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var name = String(raw.name || '').trim();
        if (!name) return null;
        var style = String(raw.style || 'plain') === 'special' ? 'special' : 'plain';
        var font = String(raw.font || '').toLowerCase();
        var effect = String(raw.effect || 'none').toLowerCase();
        var palette = String(raw.palette || '').split(',')
            .map(function (c) { return c.trim(); })
            .filter(function (c) { return COLOR_RE.test(c); })
            .slice(0, 4);
        return {
            id: String(raw.id || ''),
            name: name,
            short: String(raw.short || name).trim() || name,
            color: COLOR_RE.test(String(raw.color || '')) ? String(raw.color) : '',
            icon: String(raw.icon || ''),
            description: String(raw.description || ''),
            badgeId: raw.badgeId ? String(raw.badgeId) : null,
            style: style,
            font: FONTS.indexOf(font) === -1 ? '' : font,
            palette: palette,
            effect: EFFECTS.indexOf(effect) === -1 ? 'none' : effect
        };
    }

    /* Áp kiểu hiển thị. Mọi biến màu đi qua CSS custom property để CSS quyết
       định gradient/animation — không có style inline cho animation. */
    function apply(node, raw) {
        var t = normalize(raw);
        if (!node || !t) return node;
        node.classList.add('bk-title');
        node.classList.toggle('is-special', t.style === 'special');
        node.classList.toggle('is-plain', t.style !== 'special');
        if (t.font) node.classList.add('bk-title-font-' + t.font);
        node.classList.add('bk-title-fx-' + (t.style === 'special' ? t.effect : 'none'));
        if (t.color) node.style.setProperty('--bkt-color', t.color);
        var base = t.palette.length ? t.palette : (t.color ? [t.color] : []);
        if (base.length) {
            node.style.setProperty('--bkt-palette', base.join(','));
            base.forEach(function (c, i) { node.style.setProperty('--bkt-c' + (i + 1), c); });
        }
        node.setAttribute('data-title-style', t.style);
        return node;
    }

    /** Chip danh hiệu: `NHÃN` + icon, đứng TRƯỚC tên hiển thị. */
    function chip(raw, opts) {
        var t = normalize(raw);
        if (!t) return null;
        opts = opts || {};
        var node = el('span', 'bk-title-chip');
        if (opts.className) node.className += ' ' + opts.className;
        if (/^fa-[a-z0-9-]+$/.test(t.icon)) {
            var ic = icon(t.icon);
            ic.className += ' bk-title-chip-icon';
            node.appendChild(ic);
        }
        var label = opts.full ? t.name : String(t.short || t.name).toUpperCase();
        node.appendChild(D.createTextNode(label));
        node.title = t.name;
        node.setAttribute('aria-label', 'Danh hiệu: ' + t.name);
        apply(node, t);
        return node;
    }

    /** Vẽ trước danh hiệu vào một khung cho trước (dùng trong trình soạn). */
    function preview(host, raw) {
        if (!host) return;
        host.textContent = '';
        var t = normalize(raw);
        if (!t) {
            host.appendChild(el('span', 'bk-title-empty', 'Chưa có danh hiệu để xem trước'));
            return;
        }
        var wrap = el('div', 'bk-title-preview');
        var line = el('div', 'bk-title-preview-line');
        line.appendChild(el('span', 'bk-title-preview-name', 'Học sinh'));
        var chipNode = chip(t, { full: true });
        line.insertBefore(chipNode, line.firstChild);
        wrap.appendChild(line);
        var meta = el('div', 'bk-title-preview-meta');
        meta.appendChild(el('span', 'bk-title-tag', t.style === 'special' ? 'Đặc biệt' : 'Bình thường'));
        if (t.font) meta.appendChild(el('span', 'bk-title-tag', 'Font: ' + t.font));
        if (t.effect && t.effect !== 'none') meta.appendChild(el('span', 'bk-title-tag', 'Hiệu ứng: ' + t.effect));
        if (t.badgeId) meta.appendChild(el('span', 'bk-title-tag', 'Badge: ' + t.badgeId));
        else meta.appendChild(el('span', 'bk-title-tag', 'Danh hiệu tự tạo'));
        wrap.appendChild(meta);
        host.appendChild(wrap);
    }

    /* ---------------------------------------------------------------------
       "Danh hiệu của tôi" — học sinh tự chọn/gỡ trong số danh hiệu mình sở hữu
       ------------------------------------------------------------------ */
    function card() {
        var root = el('div', 'bk-title-card');
        root.id = 'bkProfileTitles';
        var head = el('div', 'bk-title-card-head');
        head.appendChild(el('h3', null, 'Danh hiệu'));
        head.appendChild(el('p', 'bk-title-hint',
            'Danh hiệu đứng trước tên của bạn trong Chat và Hồ sơ. Bạn chỉ có thể chọn những danh hiệu mình đã mở khoá bằng badge hoặc được Founder trao.'));
        root.appendChild(head);

        var currentRow = el('div', 'bk-title-current');
        root.appendChild(currentRow);
        var grid = el('div', 'bk-title-grid');
        root.appendChild(grid);
        var msg = el('p', 'bk-title-msg');
        msg.setAttribute('role', 'status');
        root.appendChild(msg);

        function say(text, kind) {
            msg.textContent = text || '';
            msg.className = 'bk-title-msg' + (kind ? ' is-' + kind : '');
        }

        function cloud() {
            var c = global.BKCloud;
            return c && typeof c.studentProfile === 'function' ? c : null;
        }

        function paintCurrent(titles, currentId) {
            currentRow.textContent = '';
            var t = null;
            (titles || []).forEach(function (row) { if (row.id === currentId) t = row; });
            if (!t) {
                currentRow.appendChild(el('span', 'bk-title-current-label', 'Đang dùng: chưa chọn danh hiệu'));
                return;
            }
            currentRow.appendChild(el('span', 'bk-title-current-label', 'Đang dùng:'));
            currentRow.appendChild(chip(t, { full: true }));
        }

        function paintGrid(titles, currentId, busy) {
            grid.textContent = '';
            var eligible = (titles || []).filter(function (t) { return t.eligible; });
            if (!eligible.length) {
                grid.appendChild(el('p', 'bk-title-empty',
                    'Chưa có danh hiệu nào để chọn. Mở khoá badge tương ứng hoặc nhờ Founder trao danh hiệu.'));
                return;
            }
            eligible.forEach(function (t) {
                var tile = el('button', 'bk-title-tile' + (t.id === currentId ? ' is-current' : ''));
                tile.type = 'button';
                tile.setAttribute('aria-pressed', t.id === currentId ? 'true' : 'false');
                var art = el('span', 'bk-title-tile-art');
                var c = chip(t, { full: true });
                if (c) art.appendChild(c);
                tile.appendChild(art);
                tile.appendChild(el('span', 'bk-title-tile-name', t.name));
                if (t.description) tile.appendChild(el('span', 'bk-title-tile-desc', t.description));
                var meta = el('span', 'bk-title-tile-meta');
                meta.appendChild(el('span', 'bk-title-tag', t.style === 'special' ? 'Đặc biệt' : 'Bình thường'));
                if (t.badgeId) meta.appendChild(el('span', 'bk-title-tag is-badge', 'Từ badge'));
                else meta.appendChild(el('span', 'bk-title-tag is-grant', 'Được trao'));
                if (t.id === currentId) meta.appendChild(el('span', 'bk-title-tag is-current', 'Đang dùng'));
                tile.appendChild(meta);
                tile.disabled = !!busy;
                tile.addEventListener('click', function () { equip(t); });
                grid.appendChild(tile);
            });
        }

        function equip(t) {
            var c = cloud();
            if (!c) { say('Cần kết nối Supabase để đổi danh hiệu.', 'warn'); return; }
            say('Đang lưu danh hiệu…');
            c.studentProfile({ action: 'title', title_id: t.id }).then(function (data) {
                say((data && data.message) || 'Đã trang bị danh hiệu.', 'ok');
                load();
                try { global.dispatchEvent(new global.CustomEvent('bk:title-changed', { detail: data })); } catch (e) { }
            }).catch(function (err) {
                say((err && err.message) || 'Không lưu được danh hiệu.', 'error');
            });
        }

        function clear() {
            var c = cloud();
            if (!c) { say('Cần kết nối Supabase để gỡ danh hiệu.', 'warn'); return; }
            say('Đang gỡ danh hiệu…');
            c.studentProfile({ action: 'title', title_id: '' }).then(function () {
                say('Đã gỡ danh hiệu.', 'ok');
                load();
                try { global.dispatchEvent(new global.CustomEvent('bk:title-changed', {})); } catch (e) { }
            }).catch(function (err) {
                say((err && err.message) || 'Không gỡ được danh hiệu.', 'error');
            });
        }

        var clearBtn = el('button', 'bk-title-clear', 'Gỡ danh hiệu');
        clearBtn.type = 'button';
        clearBtn.addEventListener('click', clear);
        root.appendChild(clearBtn);

        function load() {
            var c = cloud();
            if (!c) {
                say('Chưa kết nối máy chủ nên chưa tải được danh hiệu.', 'warn');
                return;
            }
            say('Đang tải danh hiệu…');
            c.studentProfile({ action: 'titles' }).then(function (data) {
                say('');
                var titles = (data && data.titles) || [];
                var currentId = (data && data.currentTitleId) || '';
                paintCurrent(titles, currentId);
                paintGrid(titles, currentId, false);
                clearBtn.hidden = !currentId;
            }).catch(function (err) {
                say((err && err.message) || 'Không tải được danh hiệu.', 'error');
            });
        }

        root.__refresh = load;
        load();
        return root;
    }

    var api = {
        chip: chip,
        apply: apply,
        preview: preview,
        card: card,
        normalize: normalize,
        fonts: FONTS,
        effects: EFFECTS,
        version: '7.7.0'
    };
    if (global.BK) global.BK.titles = api;
    else global.BK = { titles: api };
    global.BKTitles = api;
})(typeof window !== 'undefined' ? window : this);
