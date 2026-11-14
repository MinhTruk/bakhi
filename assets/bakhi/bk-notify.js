/*!
 * Bá Khí — Thông báo cập nhật dùng chung cho mọi trang.
 *
 * Mỗi mục `## [x.y.z] — ngày` trong CHANGELOG.md là một thông báo.
 * - Chuông nổi ở góc phải dưới, badge số chưa đọc.
 * - Bảng thông báo: mở từng mục, “Đánh dấu đã đọc tất cả”.
 * - Nhấp một mục → mở toàn màn hình đầy đủ nội dung phiên bản, có nút × và Esc.
 * - Trạng thái đã đọc ở `bakhiNotify.v1` (không đụng dữ liệu học tập).
 */
(function () {
    'use strict';
    var global = typeof window !== 'undefined' ? window : this;
    var D = global.document;
    if (!D || global.BKNotifyLoaded) return;
    /* Chỉ mount chuông ở trang chủ Bá Khí: index.html ở gốc site. */
    (function () {
        try {
            var p = (global.location && location.pathname) || '';
            var endsSlash = /\/$/.test(p) || p === '';
            var parts = p.split('/').filter(Boolean);
            var isIndex = parts.length > 0 && /^index\.html?$/i.test(parts[parts.length - 1]);
            var dirs = isIndex ? parts.slice(0, -1) : parts;
            var isHome = (endsSlash || isIndex || parts.length === 0 || (parts.length === 1 && !/\./.test(parts[0]))) && dirs.length <= 1;
            if (!isHome) { global.BKNotifyLoaded = true; throw new Error('skip'); }
        } catch (e) { if (e && e.message === 'skip') return; }
    })();
    if (global.BKNotifyLoaded && !global.BKNotify) return;
    global.BKNotifyLoaded = true;

    var KEY = 'bakhiNotify.v1';
    var STATE_LIMIT = 400;

    function now() { return Date.now(); }
    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function makeSvg(path) {
        var svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var p = D.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', path);
        p.setAttribute('fill', 'currentColor');
        svg.appendChild(p);
        return svg;
    }
    function basePath() {
        try {
            if (global.BK && global.BK.util && global.BK.util.basePath) return global.BK.util.basePath();
        } catch (e) { }
        var s = D.currentScript;
        var src = (s && s.src) || '';
        var i = src.indexOf('/assets/bakhi/');
        return i >= 0 ? src.slice(0, i + 1) : './';
    }
    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function clip(text, max) {
        var s = String(text || '').replace(/\s+/g, ' ').trim();
        if (s.length <= max) return s;
        var cut = s.slice(0, max);
        var space = cut.lastIndexOf(' ');
        if (space > max * 0.6) cut = cut.slice(0, space);
        return cut.replace(/[.,;:—-]$/, '') + '…';
    }
    /** 2026-11-14 → 14/11/2026, giữ nguyên nếu định dạng khác. */
    function prettyDate(value) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
        return m ? m[3] + '/' + m[2] + '/' + m[1] : String(value || '').trim();
    }
    function md(src) {
        try {
            if (global.BK && global.BK.ui && global.BK.ui.markdown) return global.BK.ui.markdown(src);
        } catch (e) { }
        /* Fallback tối thiểu, đã escape. */
        return escapeHtml(src).split(/\r?\n\r?\n/).map(function (p) {
            return '<p>' + p.replace(/\r?\n/g, '<br>') + '</p>';
        }).join('');
    }

    /* ---------------------------- Trạng thái ---------------------------- */
    function readState() {
        var st = { v: 1, read: {}, lastSeen: 0 };
        var raw = null;
        try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
        if (!raw) return st;
        var p = null;
        try { p = JSON.parse(raw); } catch (e) { p = null; }
        if (!p || typeof p !== 'object') return st;
        var src = p.read && typeof p.read === 'object' ? p.read : {};
        Object.keys(src).slice(0, STATE_LIMIT).forEach(function (k) {
            var v = Number(src[k]);
            if (isFinite(v) && v > 0) st.read[String(k).slice(0, 40)] = v;
        });
        st.lastSeen = Number(p.lastSeen) || 0;
        return st;
    }
    function writeState(st) {
        st.v = 1;
        try { global.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { }
    }

    /* ------------------------- Phân tích CHANGELOG ---------------------- */
    /** Tách CHANGELOG.md thành từng phiên bản: mỗi `## [x] — ngày` là một mục. */
    function parse(text) {
        var lines = String(text || '').split(/\r?\n/);
        var out = [];
        var cur = null;
        function flush() {
            if (!cur) return;
            /* CHANGELOG xuống dòng trong một gạch đầu dòng (thụt lề 2 dấu cách).
               Gộp lại để vừa đếm thay đổi vừa hiển thị đúng danh sách ở cửa sổ đọc. */
            var lines = [];
            cur.lines.forEach(function (line) {
                if (/^\s*[-*]\s+/.test(line)) { lines.push(line.replace(/^\s+/, '')); return; }
                if (lines.length && /^\s{2,}\S/.test(line) && /^[-*]\s/.test(lines[lines.length - 1])) {
                    lines[lines.length - 1] += ' ' + line.trim();
                    return;
                }
                lines.push(line);
            });
            var body = lines.join('\n').trim();
            var heading = '';
            var bullets = [];
            lines.forEach(function (line) {
                var h = /^###\s+(.+)$/.exec(line);
                if (h && !heading) heading = h[1].trim();
                var b = /^[-*]\s+(.+)$/.exec(line);
                if (b) bullets.push(b[1].replace(/\*\*/g, '').replace(/`/g, '').trim());
            });
            var highlights = bullets.filter(Boolean).slice(0, 3);
            /* Bỏ tiêu đề đầu mục vì đã hiển thị ở đầu cửa sổ đọc. */
            if (/^###\s+/.test(body.split('\n')[0] || '')) body = body.split('\n').slice(1).join('\n').trim();
            out.push({
                id: cur.version,
                version: cur.version,
                date: prettyDate(cur.date),
                title: heading || ('Bá Khí ' + cur.version),
                summary: clip(highlights[0] || body.split('\n')[0] || 'Cập nhật mới', 130).replace(/`/g, ''),
                highlights: highlights,
                count: bullets.filter(Boolean).length,
                body: body
            });
            cur = null;
        }
        lines.forEach(function (line) {
            var m = /^##\s+\[?([0-9A-Za-z][^\]]*?)\]?\s*(?:[—–-]\s*(.*))?$/.exec(line);
            if (m) {
                flush();
                cur = { version: m[1].trim(), date: (m[2] || '').trim(), lines: [] };
                return;
            }
            if (/^#\s+/.test(line)) { flush(); return; }
            if (cur) cur.lines.push(line);
        });
        flush();
        return out;
    }

    var entries = null;
    var loading = null;
    var OFFLINE = [{
        id: 'offline', version: '—', date: '',
        title: 'Chưa tải được CHANGELOG.md',
        summary: 'Trang đang mở ngoài máy chủ nên không đọc được tệp changelog. Mở trang qua http(s) để xem thông báo cập nhật.',
        highlights: [], count: 0,
        body: 'Trình duyệt không cho phép đọc `CHANGELOG.md` khi trang mở bằng `file://`. Hãy chạy một máy chủ tĩnh (ví dụ `python3 -m http.server`) hoặc mở bản trên GitHub Pages để thấy đầy đủ thông báo theo từng phiên bản.'
    }];

    function load() {
        if (entries) return Promise.resolve(entries);
        if (loading) return loading;
        if (typeof global.fetch !== 'function') { entries = OFFLINE; return Promise.resolve(entries); }
        loading = global.fetch(basePath() + 'CHANGELOG.md', { cache: 'no-store' })
            .then(function (res) {
                if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                return res.text();
            })
            .then(function (text) {
                var parsed = parse(text);
                entries = parsed.length ? parsed : OFFLINE;
                return entries;
            })
            .catch(function () {
                entries = OFFLINE;
                return entries;
            })
            .then(function (list) {
                loading = null;
                paint();
                return list;
            });
        return loading;
    }

    /* ------------------------------- UI -------------------------------- */
    var ui = { bell: null, badge: null, panel: null, list: null, modal: null, lastFocus: null };
    var panelOpen = false;

    function unreadList() {
        var st = readState();
        return (entries || []).filter(function (e) { return !st.read[e.id]; });
    }
    function unreadCount() { return unreadList().length; }

    /** Tìm chỗ gắn chuông: cạnh nút README (trang chủ) hoặc nhóm nút bên phải header. */
    function findBellSlot() {
        var readme = D.querySelector('button[onclick*="openReadmeModal"]');
        if (readme && readme.parentNode) return { before: readme };
        var header = D.querySelector('header') || D.querySelector('[role="banner"]');
        if (!header) return null;
        var groups = header.querySelectorAll('div, nav');
        var best = null;
        for (var i = groups.length - 1; i >= 0; i--) {
            var g = groups[i];
            if (g === header) continue;
            if (g.querySelectorAll('button').length < 2) continue;
            if (g.getBoundingClientRect().width <= 0) continue;
            best = g;
            break;
        }
        return { append: best || header };
    }

    function buildBell() {
        if (ui.bell) return;
        var bell = el('button', 'bknt-bell');
        bell.type = 'button';
        bell.setAttribute('aria-haspopup', 'dialog');
        bell.setAttribute('aria-expanded', 'false');
        bell.setAttribute('aria-controls', 'bkntPanel');
        bell.setAttribute('aria-label', 'Thông báo cập nhật');
        bell.title = 'Thông báo cập nhật';
        bell.appendChild(makeSvg('M12 22a2.6 2.6 0 0 0 2.6-2.6h-5.2A2.6 2.6 0 0 0 12 22Zm7-6.2V11a7 7 0 0 0-5.3-6.8V3.4a1.7 1.7 0 1 0-3.4 0v.8A7 7 0 0 0 5 11v4.8l-1.6 1.6v.9h17.2v-.9Z'));
        var badge = el('span', 'bknt-badge', '0');
        badge.setAttribute('aria-hidden', 'true');
        bell.appendChild(badge);
        bell.addEventListener('click', function (e) {
            e.stopPropagation();
            togglePanel();
        });
        ui.bell = bell;
        ui.badge = badge;
        mountBell(bell);
    }

    /** Nếu header quá chật (điện thoại), chuông ra ngoài thành nút nổi dưới header. */
    function floatBell(bell) {
        bell.classList.remove('bknt-in-header');
        bell.classList.add('bknt-bell--float');
        D.body.appendChild(bell);
        var header = D.querySelector('header');
        if (header) bell.style.top = Math.round(header.getBoundingClientRect().bottom - 10) + 'px';
        bell.style.right = '.75rem';
    }

    function mountBell(bell) {
        var slot = findBellSlot();
        if (!slot) { floatBell(bell); return; }
        var beforeWidth = D.documentElement.scrollWidth;
        var host = null;
        if (slot.before && slot.before.parentNode) {
            slot.before.parentNode.insertBefore(bell, slot.before);
            host = slot.before.parentNode;
        } else if (slot.append) {
            slot.append.appendChild(bell);
            host = slot.append;
        }
        if (!host) { floatBell(bell); return; }
        bell.classList.add('bknt-in-header');
        /* Đo tràn ngang: nếu thêm chuông làm header rộng quá màn hình thì cho nổi. */
        var header = bell.closest && bell.closest('header');
        var overflow = D.documentElement.scrollWidth > Math.max(beforeWidth, global.innerWidth) + 1;
        if (header && header.scrollWidth > header.clientWidth + 1) overflow = true;
        if (overflow) floatBell(bell);
    }

    function buildPanel() {
        if (ui.panel) return;
        var panel = el('div', 'bknt-panel');
        panel.id = 'bkntPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-label', 'Danh sách thông báo cập nhật');
        panel.hidden = true;

        var head = el('div', 'bknt-head');
        var titles = el('div');
        titles.appendChild(el('b', 'bknt-title', 'Thông báo cập nhật'));
        titles.appendChild(el('span', 'bknt-sub', 'Theo từng phiên bản trong CHANGELOG.md'));
        head.appendChild(titles);
        panel.appendChild(head);

        var actions = el('div', 'bknt-head-actions');
        var all = el('button', 'bknt-mark', 'Đánh dấu đã đọc tất cả');
        all.type = 'button';
        all.addEventListener('click', function () { markAll(); });
        actions.appendChild(all);
        var close = el('button', 'bknt-x bknt-x-small');
        close.type = 'button';
        close.setAttribute('aria-label', 'Đóng danh sách thông báo');
        close.textContent = '×';
        close.addEventListener('click', function () { closePanel(); });
        actions.appendChild(close);
        panel.appendChild(actions);

        var list = el('ul', 'bknt-list');
        panel.appendChild(list);
        var foot = el('div', 'bknt-foot', 'Bấm một thông báo để đọc đầy đủ nội dung.');
        panel.appendChild(foot);
        D.body.appendChild(panel);
        ui.panel = panel;
        ui.list = list;

        D.addEventListener('click', function (e) {
            if (!panelOpen) return;
            if (panel.contains(e.target) || (ui.bell && ui.bell.contains(e.target))) return;
            closePanel();
        });
        var move = function () {
            if (ui.bell && ui.bell.classList.contains('bknt-bell--float')) {
                var head = D.querySelector('header');
                if (head) ui.bell.style.top = Math.round(head.getBoundingClientRect().bottom - 10) + 'px';
            }
            if (panelOpen) placePanel();
        };
        global.addEventListener('resize', move);
        global.addEventListener('scroll', move, true);
    }

    function paint() {
        if (!ui.bell) return;
        var list = entries || [];
        var st = readState();
        var n = 0;
        list.forEach(function (e) { if (!st.read[e.id]) n++; });
        if (n > 0) {
            ui.badge.textContent = n > 99 ? '99+' : String(n);
            ui.badge.hidden = false;
            ui.bell.classList.add('has-unread');
            ui.bell.setAttribute('aria-label', 'Thông báo cập nhật: ' + n + ' chưa đọc');
        } else {
            ui.badge.hidden = true;
            ui.bell.classList.remove('has-unread');
            ui.bell.setAttribute('aria-label', 'Thông báo cập nhật: đã đọc tất cả');
        }
        if (ui.panel && panelOpen) renderList();
    }

    function renderList() {
        if (!ui.list) return;
        ui.list.innerHTML = '';
        var st = readState();
        var list = entries || [];
        if (!list.length) {
            var li = el('li', 'bknt-empty', 'Đang tải thông báo…');
            ui.list.appendChild(li);
            return;
        }
        if (!unreadCount()) {
            var done = el('li', 'bknt-allread');
            done.appendChild(el('span', 'bknt-check', '✓'));
            done.appendChild(el('span', null, 'Bạn đã đọc tất cả thông báo.'));
            ui.list.appendChild(done);
        }
        list.forEach(function (e) {
            var unread = !st.read[e.id];
            var li = el('li', 'bknt-li');
            var b = el('button', 'bknt-item' + (unread ? ' unread' : ''));
            b.type = 'button';
            b.setAttribute('data-id', e.id);
            var dot = el('span', 'bknt-dot');
            dot.setAttribute('aria-hidden', 'true');
            b.appendChild(dot);
            var main = el('span', 'bknt-item-main');
            var top = el('span', 'bknt-item-top');
            top.appendChild(el('b', 'bknt-item-title', e.version === '—' ? e.title : 'Phiên bản ' + e.version));
            if (e.date) top.appendChild(el('span', 'bknt-chip', e.date));
            main.appendChild(top);
            main.appendChild(el('span', 'bknt-item-sum', e.summary));
            main.appendChild(el('span', 'bknt-item-meta', e.count ? e.count + ' thay đổi · bấm để đọc đầy đủ' : 'Bấm để đọc đầy đủ'));
            b.appendChild(main);
            if (unread) main.appendChild(el('span', 'bknt-sr', 'Chưa đọc'));
            b.addEventListener('click', function () { openArticle(e.id); });
            li.appendChild(b);
            ui.list.appendChild(li);
        });
    }

    function togglePanel() {
        if (panelOpen) closePanel();
        else openPanel();
    }
    /** Đặt bảng ngay dưới chuông, canh phải — luôn nằm trong màn hình. */
    function placePanel() {
        if (!ui.panel || !ui.bell) return;
        var r = ui.bell.getBoundingClientRect();
        var vh = global.innerHeight || 640;
        /* Bảng luôn bám góc trên bên phải màn hình, ngay dưới chuông. */
        var right = 8;
        var top = r.bottom + 8;
        if (top > vh - 180) top = Math.max(8, r.top - 8 - Math.min(420, vh - 24));
        ui.panel.style.left = 'auto';
        ui.panel.style.right = right + 'px';
        ui.panel.style.top = Math.max(8, top) + 'px';
        ui.panel.style.bottom = 'auto';
        ui.panel.style.maxHeight = Math.max(160, vh - Math.max(8, top) - 12) + 'px';
    }

    function openPanel() {
        buildBell();
        buildPanel();
        panelOpen = true;
        ui.panel.hidden = false;
        ui.bell.setAttribute('aria-expanded', 'true');
        renderList();
        placePanel();
        if (!entries) load();
        var first = ui.list.querySelector('.bknt-item');
        if (first && first.focus) first.focus();
    }
    function closePanel() {
        if (!ui.panel) return;
        panelOpen = false;
        ui.panel.hidden = true;
        if (ui.bell) {
            ui.bell.setAttribute('aria-expanded', 'false');
            ui.bell.focus();
        }
    }

    function markAll() {
        var st = readState();
        (entries || []).forEach(function (e) { st.read[e.id] = st.read[e.id] || now(); });
        st.lastSeen = now();
        writeState(st);
        paint();
        if (ui.panel && panelOpen) renderList();
        if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast('Đã đánh dấu tất cả thông báo là đã đọc', 'success');
    }
    function markRead(id) {
        if (!id) return;
        var st = readState();
        if (st.read[id]) return;
        st.read[id] = now();
        st.lastSeen = now();
        writeState(st);
        paint();
        if (ui.panel && panelOpen) renderList();
    }

    /* --------------------- Toàn màn hình nội dung ---------------------- */
    function closeArticle() {
        if (!ui.modal) return;
        ui.modal.remove();
        ui.modal = null;
        D.documentElement.classList.remove('bknt-lock');
        D.removeEventListener('keydown', onArticleKey);
        if (ui.lastFocus && ui.lastFocus.focus) { try { ui.lastFocus.focus(); } catch (e) { } }
        ui.lastFocus = null;
    }
    function onArticleKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeArticle(); }
        else if (e.key === 'Tab' && ui.modal && global.BK && global.BK.ui && global.BK.ui.trapFocus) {
            global.BK.ui.trapFocus(e, ui.modal.querySelector('.bknt-sheet'));
        }
    }
    function openArticle(id) {
        var item = null;
        (entries || []).forEach(function (e) { if (e.id === id) item = e; });
        if (!item) return;
        markRead(item.id);
        closeArticle();
        closePanel();

        var wrap = el('div', 'bknt-modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'bkntArticleTitle');
        var sheet = el('div', 'bknt-sheet');

        var head = el('div', 'bknt-sheet-head');
        var titles = el('div', 'bknt-sheet-titles');
        var line = el('div', 'bknt-sheet-line');
        line.appendChild(el('span', 'bknt-chip bknt-chip-strong', item.version === '—' ? 'Thông báo' : 'Phiên bản ' + item.version));
        if (item.date) line.appendChild(el('span', 'bknt-chip', item.date));
        titles.appendChild(line);
        var h = el('h2', 'bknt-sheet-title', item.title);
        h.id = 'bkntArticleTitle';
        titles.appendChild(h);
        head.appendChild(titles);

        var x = el('button', 'bknt-x');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng thông báo');
        x.title = 'Đóng (Esc)';
        x.textContent = '×';
        /* Đóng cả khi trình duyệt nuốt sự kiện click (một số bàn phím cảm ứng),
           nhưng chỉ với nút chuột trái / chạm chính. */
        x.addEventListener('click', closeArticle);
        x.addEventListener('pointerup', function (e) {
            if (e && e.button != null && e.button > 0) return;
            closeArticle();
        });
        head.appendChild(x);
        sheet.appendChild(head);

        var body = el('div', 'bknt-body');
        body.innerHTML = md(item.body);
        sheet.appendChild(body);

        var foot = el('div', 'bknt-sheet-foot');
        var closeBtn = el('button', 'bknt-btn', 'Đóng');
        closeBtn.type = 'button';
        closeBtn.addEventListener('click', closeArticle);
        foot.appendChild(closeBtn);
        sheet.appendChild(foot);

        wrap.appendChild(sheet);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closeArticle(); });
        D.body.appendChild(wrap);
        ui.modal = wrap;
        ui.lastFocus = D.activeElement;
        D.documentElement.classList.add('bknt-lock');
        D.addEventListener('keydown', onArticleKey);
        x.focus();
    }

    /* ----------------------------- Khởi động --------------------------- */
    function init() {
        if (!D.body) { global.setTimeout(init, 60); return; }
        if (!D.querySelector('link[data-bk-notify]')) {
            var link = D.createElement('link');
            link.rel = 'stylesheet';
            link.href = basePath() + 'assets/bakhi/bk-notify.css?v=2.4.3';
            link.setAttribute('data-bk-notify', '1');
            (D.head || D.documentElement).appendChild(link);
        }
        buildBell();
        buildPanel();
        paint();
        load();
    }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();

    global.BKNotify = {
        KEY: KEY,
        parse: parse,
        /** Dùng nội dung CHANGELOG có sẵn (ví dụ nhúng trong trang) thay vì tải. */
        setSource: function (text) {
            var parsed = parse(text);
            entries = parsed.length ? parsed : OFFLINE;
            paint();
            return entries;
        },
        refresh: function () { entries = null; loading = null; return load(); },
        items: function () { return (entries || []).slice(); },
        unread: unreadCount,
        open: openPanel,
        close: closePanel,
        openArticle: openArticle,
        closeArticle: closeArticle,
        markAll: markAll,
        state: readState
    };
})();
