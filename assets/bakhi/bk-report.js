/* =========================================================================
   Bá Khí — bk-report.js
   Report Issue + Q&A dùng chung cho TOÀN website.

   Một component duy nhất, hai cách hiển thị:
     • Cửa sổ nổi (FAB góc phải) trên mọi trang môn học / bài học / Studio.
     • Nhúng trong Cài đặt → Report Issue trên trang chủ.

   Toàn bộ dữ liệu đi qua Edge Function `report-api`; máy chủ tự xác định học
   sinh từ phiên thiết bị. Không có student_id nào do trình duyệt gửi lên.

   Công khai: window.BKReport
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKReportLoaded) return;
    global.BKReportLoaded = true;

    var POS_KEY = 'bakhiReport.v1';
    var FAB_KEY = 'bakhiReportFab.v1';
    var DRAFT_KEY = 'bakhiReportDraft.v1';
    var MAX_FILES = 4;
    var MAX_BYTES = 5 * 1024 * 1024;
    var ALLOWED = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i;

    var CATEGORIES = [
        ['bug', 'Lỗi kỹ thuật'],
        ['ui', 'Giao diện / Trải nghiệm'],
        ['content', 'Nội dung học tập'],
        ['answer', 'Đáp án / Giải thích sai'],
        ['account', 'Tài khoản / Đăng nhập'],
        ['performance', 'Hiệu năng'],
        ['feature', 'Đề xuất tính năng'],
        ['data', 'Dữ liệu / Tiến trình'],
        ['other', 'Khác']
    ];
    var ISSUE_TYPES = [
        ['bug', 'Có lỗi xảy ra'],
        ['content_error', 'Nội dung chưa đúng'],
        ['question', 'Cần hỏi thêm'],
        ['suggestion', 'Góp ý / đề xuất']
    ];
    var PRIORITIES = [
        ['low', 'Thấp'],
        ['normal', 'Bình thường'],
        ['high', 'Cao'],
        ['critical', 'Khẩn']
    ];
    var STATUS = {
        new: { label: 'Mới', tone: 'info' },
        pending: { label: 'Chờ xử lý', tone: 'warn' },
        in_progress: { label: 'Đang xử lý', tone: 'info' },
        waiting_student: { label: 'Chờ bạn bổ sung', tone: 'warn' },
        resolved: { label: 'Đã giải quyết', tone: 'ok' },
        closed: { label: 'Đã đóng', tone: 'muted' }
    };

    var S = {
        win: null, host: null, mode: 'window', view: 'compose',
        tab: 'compose', booted: false, student: null, counts: null,
        list: [], listTotal: 0, listLoaded: false, listBusy: false,
        listQuery: '', listStatus: 'all', listSeq: 0, listHost: null,
        detail: null, detailBusy: false, sending: false, files: [],
        draft: null, draftTimer: null, lastFocus: null, dragging: null,
        fab: null, fabDot: null, fabDrag: null, fabDraggedAt: 0
    };

    /* ------------------------------- Tiện ích ----------------------------- */
    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function icon(name) {
        var i = el('i', 'fa-solid ' + (name || 'fa-circle'));
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function btn(cls, label, iconName, onClick) {
        var b = el('button', 'bkrep-btn' + (cls ? ' ' + cls : ''));
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        if (label) b.appendChild(D.createTextNode(label));
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function toast(msg, type) {
        if (global.BK && global.BK.ui && global.BK.ui.toast) {
            try { global.BK.ui.toast(msg, type); return; } catch (e) { }
        }
        try { global.console.log('[BKReport]', msg); } catch (e) { }
    }
    function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
    function fmt(iso) {
        if (!iso) return '';
        try {
            if (global.BK && global.BK.util && global.BK.util.fmtTime) return global.BK.util.fmtTime(iso);
        } catch (e) { }
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit',
            year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
    function rel(iso) {
        var t = new Date(iso || 0).getTime();
        if (!t) return '';
        var diff = Math.floor((Date.now() - t) / 1000);
        if (diff < 60) return 'vừa xong';
        if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
        if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
        if (diff < 604800) return Math.floor(diff / 86400) + ' ngày trước';
        return fmt(iso);
    }
    function configured() {
        return !!(global.BKCloud && global.BKCloud.configured && global.BKCloud.configured());
    }
    /* Chưa nhận diện học sinh thì report-api trả 409 NOT_BOUND. Không hỏi máy chủ
       trong trường hợp đó để trang khách không phát sinh lỗi mạng; lần mở đầu
       tiên của cửa sổ báo cáo (openWindow) sẽ tự nạp lại sau khi đã nhận diện. */
    function hasStudent() {
        try {
            var raw = global.sessionStorage.getItem('bakhiStudent.v1');
            return !!raw && raw !== 'null';
        } catch (e) { return false; }
    }
    function api(body) {
        if (!global.BKCloud || typeof global.BKCloud.reportApi !== 'function') {
            return Promise.reject(new Error('Report Issue chưa sẵn sàng. Hãy tải lại trang.'));
        }
        return global.BKCloud.reportApi(body);
    }
    function pos() {
        try {
            var raw = JSON.parse(global.localStorage.getItem(POS_KEY) || 'null');
            if (raw && typeof raw === 'object' && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
        } catch (e) { }
        return null;
    }
    function savePos(p) {
        try { global.localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch (e) { }
    }
    /* Bản nháp được giữ qua lần chuyển trang: học sinh đang viết dở không mất
       nội dung khi mở bài khác. Xoá ngay sau khi gửi thành công hoặc bấm
       "Xoá nội dung". */
    function loadDraft() {
        try {
            var raw = JSON.parse(global.localStorage.getItem(DRAFT_KEY) || 'null');
            if (!raw || typeof raw !== 'object') return null;
            var clean = {
                title: String(raw.title || '').slice(0, 160),
                description: String(raw.description || '').slice(0, 5000),
                category: String(raw.category || 'bug'),
                issue_type: String(raw.issue_type || 'bug'),
                priority: String(raw.priority || 'normal')
            };
            /* Giá trị đã lưu có thể bị sửa tay: chỉ nhận lựa chọn hợp lệ. */
            if (!CATEGORIES.some(function (p) { return p[0] === clean.category; })) clean.category = 'bug';
            if (!ISSUE_TYPES.some(function (p) { return p[0] === clean.issue_type; })) clean.issue_type = 'bug';
            if (!PRIORITIES.some(function (p) { return p[0] === clean.priority; })) clean.priority = 'normal';
            if (!clean.title && !clean.description) return null;
            return clean;
        } catch (e) { return null; }
    }
    function saveDraftSoon(draft) {
        clearTimeout(S.draftTimer);
        S.draftTimer = global.setTimeout(function () { saveDraftNow(draft); }, 350);
    }
    function saveDraftNow(draft) {
        clearTimeout(S.draftTimer);
        S.draftTimer = null;
        try {
            if (!draft || (!String(draft.title || '').trim() && !String(draft.description || '').trim())) {
                global.localStorage.removeItem(DRAFT_KEY);
                return;
            }
            global.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch (e) { }
    }
    function clearDraft() {
        clearTimeout(S.draftTimer);
        S.draftTimer = null;
        try { global.localStorage.removeItem(DRAFT_KEY); } catch (e) { }
    }
    function statusMeta(status) { return STATUS[status] || { label: status || '—', tone: 'muted' }; }
    function statusPill(status) {
        var meta = statusMeta(status);
        return el('span', 'bkrep-pill is-' + meta.tone, meta.label);
    }
    function priorityLabel(value) {
        for (var i = 0; i < PRIORITIES.length; i++) if (PRIORITIES[i][0] === value) return PRIORITIES[i][1];
        return value || '—';
    }
    function categoryLabel(value) {
        for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][0] === value) return CATEGORIES[i][1];
        return value || '—';
    }
    function subjectFromPath() {
        try {
            var seg = String(global.location.pathname || '').split('/').filter(Boolean);
            var known = { ktgk1: 'Kiểm tra giữa kỳ 1', ktgk2: 'Kiểm tra giữa kỳ 2', ktck1: 'Kiểm tra cuối kỳ 1', ktck2: 'Kiểm tra cuối kỳ 2', kttx: 'Kiểm tra thường xuyên', studio: 'Bá Khí Studio', profile: 'Hồ sơ', settings: 'Cài đặt', admin: 'Quản trị', founder: 'Founder' };
            for (var i = seg.length - 1; i >= 0; i--) {
                if (known[seg[i]]) return known[seg[i]];
            }
            return seg.length ? seg[0] : 'Trang chủ';
        } catch (e) { return 'Trang chủ'; }
    }
    function captureContext() {
        var nav = global.navigator || {};
        return {
            user_agent: String(nav.userAgent || '').slice(0, 300),
            platform: String(nav.platform || '').slice(0, 120),
            language: String(nav.language || '').slice(0, 20),
            screen: global.screen ? (global.screen.width + '×' + global.screen.height) : '',
            viewport: global.innerWidth ? (global.innerWidth + '×' + global.innerHeight) : '',
            timezone: (function () {
                try { return String(global.Intl.DateTimeFormat().resolvedOptions().timeZone || ''); }
                catch (e) { return ''; }
            })(),
            captured_at: new Date().toISOString()
        };
    }

    /* --------------------------- CSS tự chèn ----------------------------- */
    function injectCss() {
        if (D.getElementById('bkReportCss')) return;
        var base = (global.BKShell && global.BKShell.basePath) ? global.BKShell.basePath() : '';
        var link = D.createElement('link');
        link.id = 'bkReportCss';
        link.rel = 'stylesheet';
        link.href = base + 'assets/bakhi/bk-report.css?v=8.2.0';
        D.head.appendChild(link);
    }

    /* --------------------------- Khung cửa sổ ---------------------------- */
    function buildWindow() {
        if (S.win) return S.win;
        var wrap = el('div', 'bkrep');
        wrap.id = 'bkReportWin';
        wrap.hidden = true;

        var shell = el('div', 'bkrep-shell');
        shell.setAttribute('role', 'dialog');
        shell.setAttribute('aria-modal', 'false');
        shell.setAttribute('aria-labelledby', 'bkRepTitle');

        var head = el('div', 'bkrep-head');
        var titles = el('div', 'bkrep-head-titles');
        var h = el('b', 'bkrep-title', 'Báo cáo vấn đề');
        h.id = 'bkRepTitle';
        titles.appendChild(h);
        titles.appendChild(el('span', 'bkrep-sub', 'Trao đổi riêng với ban quản trị'));
        head.appendChild(titles);

        var actions = el('div', 'bkrep-head-actions');
        var min = el('button', 'bkrep-x');
        min.type = 'button';
        min.setAttribute('aria-label', 'Thu nhỏ cửa sổ báo cáo');
        min.appendChild(icon('fa-minus'));
        min.addEventListener('click', function () { wrap.classList.toggle('is-min'); });
        actions.appendChild(min);
        var close = el('button', 'bkrep-x');
        close.type = 'button';
        close.setAttribute('aria-label', 'Đóng cửa sổ báo cáo');
        close.appendChild(icon('fa-xmark'));
        close.addEventListener('click', function () { closeWindow(); });
        actions.appendChild(close);
        head.appendChild(actions);
        shell.appendChild(head);

        var tabs = el('div', 'bkrep-tabs');
        tabs.setAttribute('role', 'tablist');
        [['compose', 'Gửi báo cáo', 'fa-paper-plane'], ['list', 'Báo cáo của tôi', 'fa-inbox']].forEach(function (t) {
            var b = el('button', 'bkrep-tab');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.setAttribute('data-tab', t[0]);
            b.appendChild(icon(t[2]));
            b.appendChild(D.createTextNode(t[1]));
            b.addEventListener('click', function () { showTab(t[0]); });
            tabs.appendChild(b);
        });
        shell.appendChild(tabs);

        S.body = el('div', 'bkrep-body');
        shell.appendChild(S.body);

        wrap.appendChild(shell);
        (D.body || D.documentElement).appendChild(wrap);
        S.win = wrap;
        makeDraggable(shell, head);
        return wrap;
    }

    function makeDraggable(shell, handle) {
        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            if (e.target && e.target.closest && e.target.closest('button')) return;
            var box = shell.getBoundingClientRect();
            S.dragging = {
                id: e.pointerId, dx: e.clientX - box.left, dy: e.clientY - box.top,
                w: box.width, h: box.height
            };
            shell.classList.add('is-drag');
            try { handle.setPointerCapture(e.pointerId); } catch (err) { }
        });
        handle.addEventListener('pointermove', function (e) {
            if (!S.dragging || S.dragging.id !== e.pointerId) return;
            var x = Math.max(8, Math.min(global.innerWidth - S.dragging.w - 8, e.clientX - S.dragging.dx));
            var y = Math.max(8, Math.min(global.innerHeight - 60, e.clientY - S.dragging.dy));
            shell.style.left = x + 'px';
            shell.style.top = y + 'px';
            shell.style.right = 'auto';
            shell.style.bottom = 'auto';
        });
        handle.addEventListener('pointerup', function (e) {
            if (!S.dragging || S.dragging.id !== e.pointerId) return;
            var box = shell.getBoundingClientRect();
            savePos({ x: Math.round(box.left), y: Math.round(box.top) });
            S.dragging = null;
            shell.classList.remove('is-drag');
        });
    }

    function applyPos() {
        if (!S.win) return;
        var shell = S.win.querySelector('.bkrep-shell');
        var p = pos();
        if (!p || !shell) return;
        var maxX = Math.max(8, global.innerWidth - 380);
        var maxY = Math.max(8, global.innerHeight - 120);
        shell.style.left = Math.min(Math.max(8, p.x), maxX) + 'px';
        shell.style.top = Math.min(Math.max(8, p.y), maxY) + 'px';
        shell.style.right = 'auto';
        shell.style.bottom = 'auto';
    }

    function openWindow(tab) {
        injectCss();
        var wrap = buildWindow();
        wrap.hidden = false;
        wrap.classList.remove('is-min');
        applyPos();
        S.lastFocus = D.activeElement;
        showTab(tab || 'compose');
        var first = S.body.querySelector('input, textarea, select, button');
        if (first) { try { first.focus(); } catch (e) { } }
    }
    function closeWindow() {
        if (S.win) { S.win.hidden = true; S.win.classList.remove('is-min'); }
        if (S.lastFocus && S.lastFocus.focus) { try { S.lastFocus.focus(); } catch (e) { } }
    }
    function isWindowOpen() { return !!(S.win && !S.win.hidden); }

    /* ------------------------------- FAB --------------------------------- */
    /* Vị trí nút nổi:
       • Chưa kéo lần nào → bám ngay TRÊN chuông thông báo nổi (.bkc-bell-float),
         nhờ vậy các trang môn học không còn hai nút chồng lên nhau.
       • Đã kéo → nhớ đúng vị trí đã kéo trong localStorage (bakhiReportFab.v1).
       • Trang chủ không có chuông nổi → giữ mặc định góc phải dưới của CSS. */
    function fabSaved() {
        try {
            var raw = JSON.parse(global.localStorage.getItem(FAB_KEY) || 'null');
            if (raw && typeof raw === 'object' && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
        } catch (e) { }
        return null;
    }
    function saveFabPos(p) {
        try { global.localStorage.setItem(FAB_KEY, JSON.stringify(p)); } catch (e) { }
    }
    function clearFabPos() {
        try { global.localStorage.removeItem(FAB_KEY); } catch (e) { }
    }
    function placeFab(x, y) {
        if (!S.fab) return null;
        var w = S.fab.offsetWidth || 108;
        var h = S.fab.offsetHeight || 38;
        var maxX = Math.max(8, (global.innerWidth || 1024) - w - 8);
        var maxY = Math.max(8, (global.innerHeight || 768) - h - 8);
        x = Math.max(8, Math.min(Math.round(x), maxX));
        y = Math.max(8, Math.min(Math.round(y), maxY));
        S.fab.style.left = x + 'px';
        S.fab.style.top = y + 'px';
        S.fab.style.right = 'auto';
        S.fab.style.bottom = 'auto';
        return { x: x, y: y };
    }
    function layoutFab() {
        if (!S.fab || S.fabDrag) return;
        var saved = fabSaved();
        if (saved) {
            placeFab(saved.x, saved.y);
            S.fab.classList.add('is-moved');
            return;
        }
        S.fab.classList.remove('is-moved');
        S.fab.style.left = '';
        S.fab.style.top = '';
        S.fab.style.right = '';
        S.fab.style.bottom = '';
        var bell = D.querySelector('.bkc-bell-float');
        if (!bell || !bell.getBoundingClientRect) return;
        /* Chỉ neo khi chuông thật sự nổi (position: fixed). Chuông nằm trong header
           được tính theo luồng trang nên không dùng làm mốc. */
        var style = global.getComputedStyle ? global.getComputedStyle(bell) : null;
        if (style && style.position && style.position !== 'fixed') return;
        var box = bell.getBoundingClientRect();
        if (!box || !box.height) return;
        S.fab.style.right = Math.max(8, Math.round((global.innerWidth || 0) - box.right)) + 'px';
        S.fab.style.bottom = Math.max(8, Math.round((global.innerHeight || 0) - box.top + 12)) + 'px';
    }
    function resetFab() {
        clearFabPos();
        if (S.fab) {
            S.fab.style.left = '';
            S.fab.style.top = '';
            S.fab.style.right = '';
            S.fab.style.bottom = '';
        }
        layoutFab();
    }
    function makeFabDraggable(fab) {
        fab.addEventListener('pointerdown', function (e) {
            if (e.button != null && e.button !== 0) return;
            var box = fab.getBoundingClientRect();
            S.fabDrag = {
                id: e.pointerId, startX: e.clientX, startY: e.clientY,
                offX: e.clientX - box.left, offY: e.clientY - box.top, moved: false
            };
            try { fab.setPointerCapture(e.pointerId); } catch (err) { }
        });
        fab.addEventListener('pointermove', function (e) {
            var drag = S.fabDrag;
            if (!drag || drag.id !== e.pointerId) return;
            var dx = e.clientX - drag.startX;
            var dy = e.clientY - drag.startY;
            if (!drag.moved && (Math.abs(dx) + Math.abs(dy) < 6)) return;
            drag.moved = true;
            fab.classList.add('is-drag');
            if (e.cancelable) e.preventDefault();
            drag.last = placeFab(e.clientX - drag.offX, e.clientY - drag.offY);
        });
        function endDrag(e) {
            var drag = S.fabDrag;
            if (!drag || drag.id !== e.pointerId) return;
            S.fabDrag = null;
            fab.classList.remove('is-drag');
            try { fab.releasePointerCapture(e.pointerId); } catch (err) { }
            if (!drag.moved) return;
            /* Chặn cú click phát sinh ngay sau khi kéo (không mở cửa sổ ngoài ý muốn). */
            S.fabDraggedAt = Date.now();
            var box = fab.getBoundingClientRect();
            var p = drag.last || placeFab(box.left, box.top);
            if (p) saveFabPos(p);
            fab.classList.add('is-moved');
        }
        fab.addEventListener('pointerup', endDrag);
        fab.addEventListener('pointercancel', endDrag);
        /* Bàn phím: mũi tên di chuyển 12px (Shift 40px), Home trả về vị trí mặc định. */
        fab.addEventListener('keydown', function (e) {
            var step = e.shiftKey ? 40 : 12;
            var box = fab.getBoundingClientRect();
            var x = box.left, y = box.top, handled = true;
            if (e.key === 'ArrowLeft') x -= step;
            else if (e.key === 'ArrowRight') x += step;
            else if (e.key === 'ArrowUp') y -= step;
            else if (e.key === 'ArrowDown') y += step;
            else if (e.key === 'Home') { e.preventDefault(); resetFab(); toast('Đã trả nút Báo cáo về vị trí mặc định.', 'info'); return; }
            else handled = false;
            if (!handled) return;
            e.preventDefault();
            var p = placeFab(x, y);
            if (p) { saveFabPos(p); fab.classList.add('is-moved'); }
        });
    }

    function mountFab() {
        if (D.getElementById('bkReportFab')) return;
        if (!configured()) return;
        var fab = el('button', 'bkrep-fab');
        fab.id = 'bkReportFab';
        fab.type = 'button';
        fab.title = 'Báo cáo vấn đề — kéo để đổi vị trí, nhấn Home để trả về mặc định';
        fab.setAttribute('aria-label', 'Báo cáo vấn đề');
        fab.appendChild(icon('fa-flag'));
        fab.appendChild(el('span', 'bkrep-fab-label', 'Báo cáo'));
        var dot = el('span', 'bkrep-fab-dot');
        dot.hidden = true;
        fab.appendChild(dot);
        fab.addEventListener('click', function () {
            if (Date.now() - S.fabDraggedAt < 350) return;
            openWindow('compose');
        });
        (D.body || D.documentElement).appendChild(fab);
        S.fab = fab;
        S.fabDot = dot;
        makeFabDraggable(fab);
        layoutFab();
        /* Chuông nổi có thể được dựng sau nút (defer + nhận diện học sinh):
           căn lại vài lần, chỉ khi người dùng chưa tự kéo nút. */
        [120, 600, 1600].forEach(function (ms) { global.setTimeout(layoutFab, ms); });
    }

    function paintFab() {
        if (!S.fab || !S.fabDot) return;
        var n = S.counts && S.counts.unread ? S.counts.unread : 0;
        S.fabDot.hidden = !n;
        S.fabDot.textContent = n > 9 ? '9+' : String(n);
        S.fab.classList.toggle('has-unread', !!n);
    }

    /* ------------------------------- Bootstrap ---------------------------- */
    function bootstrap(force) {
        if (S.booted && !force) return Promise.resolve(S);
        return api({ action: 'bootstrap' }).then(function (data) {
            S.booted = true;
            S.student = data.student;
            S.counts = data.counts || null;
            paintFab();
            return S;
        }).catch(function (err) {
            S.booted = false;
            S.error = err;
            throw err;
        });
    }

    /* -------------------------------- Tabs ------------------------------- */
    function paintTabs() {
        if (!S.win) return;
        Array.prototype.forEach.call(S.win.querySelectorAll('.bkrep-tab'), function (b) {
            var on = b.getAttribute('data-tab') === S.tab;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }

    function showTab(tab) {
        S.tab = tab;
        if (S.win) paintTabs();
        if (tab === 'list') return showList();
        return showCompose();
    }

    /* ------------------------------- Compose ------------------------------ */
    function field(labelText, control, hint, max) {
        var row = el('div', 'bkrep-field');
        var lab = el('label', 'bkrep-label', labelText);
        var id = control.id || ('bkRep' + Math.random().toString(36).slice(2, 8));
        control.id = id;
        lab.setAttribute('for', id);
        row.appendChild(lab);
        row.appendChild(control);
        if (hint || max) {
            var foot = el('div', 'bkrep-field-foot');
            if (hint) foot.appendChild(el('span', 'bkrep-hint', hint));
            if (max) {
                var count = el('span', 'bkrep-count');
                var paint = function () {
                    var n = String(control.value || '').length;
                    count.textContent = n + '/' + max;
                    count.classList.toggle('is-over', n > max);
                };
                control.addEventListener('input', paint);
                paint();
                foot.appendChild(count);
            }
            row.appendChild(foot);
        }
        return row;
    }
    function select(pairs, value) {
        var s = el('select', 'bkrep-input');
        pairs.forEach(function (p) {
            var o = el('option', null, p[1]);
            o.value = p[0];
            if (p[0] === value) o.selected = true;
            s.appendChild(o);
        });
        return s;
    }

    function showCompose() {
        S.tab = 'compose';
        if (S.win) paintTabs();
        var host = S.body;
        if (!host) return;
        clear(host);

        if (!configured()) {
            host.appendChild(notice('info', 'Report Issue cần kết nối máy chủ. Trang vẫn dùng được ở chế độ học cục bộ.', 'fa-circle-info'));
            return;
        }

        var busy = el('div', 'bkrep-loading');
        busy.appendChild(el('span', 'bkrep-spinner'));
        busy.appendChild(el('span', null, 'Đang chuẩn bị…'));
        host.appendChild(busy);

        bootstrap().then(function () {
            renderComposeForm();
        }).catch(function (err) {
            clear(host);
            host.appendChild(notBoundNotice(err));
        });
    }

    function notBoundNotice(err) {
        var box = notice('warn', (err && err.code === 'NOT_BOUND')
            ? 'Thiết bị này chưa gắn với học sinh nào. Hãy chọn họ tên ở trang chủ để gửi báo cáo và nhận phản hồi riêng.'
            : ('Không kết nối được máy chủ báo cáo. ' + ((err && err.message) || '')),
            'fa-triangle-exclamation');
        if (err && err.code === 'NOT_BOUND') {
            var a = el('a', 'bkrep-link', 'Mở trang chủ để chọn học sinh');
            a.href = ((global.BKShell && global.BKShell.basePath) ? global.BKShell.basePath() : '') + 'index.html';
            box.appendChild(a);
        }
        return box;
    }

    function notice(kind, text, iconName) {
        var box = el('div', 'bkrep-notice is-' + kind);
        box.appendChild(icon(iconName || 'fa-circle-info'));
        var body = el('div');
        body.appendChild(el('span', null, text));
        box.appendChild(body);
        return box;
    }

    function renderComposeForm() {
        var host = S.body;
        if (!host) return;
        clear(host);
        var d = S.draft || (S.draft = loadDraft() || {
            title: '', description: '', category: 'bug', issue_type: 'bug', priority: 'normal'
        });

        var form = el('form', 'bkrep-form');
        form.noValidate = true;

        var title = el('input', 'bkrep-input');
        title.type = 'text';
        title.maxLength = 160;
        title.placeholder = 'Ví dụ: Đáp án câu 5 sai ở phần Ôn tập';
        title.value = d.title || '';
        form.appendChild(field('Tiêu đề', title, 'Từ 4 đến 160 ký tự.', 160));

        var row = el('div', 'bkrep-row');
        var cat = select(CATEGORIES, d.category);
        var type = select(ISSUE_TYPES, d.issue_type);
        var pri = select(PRIORITIES, d.priority);
        [cat, type, pri].forEach(function (box) {
            box.addEventListener('change', function () {
                if (!S.draft) return;
                S.draft.category = cat.value;
                S.draft.issue_type = type.value;
                S.draft.priority = pri.value;
                saveDraftSoon(S.draft);
            });
        });
        row.appendChild(field('Nhóm vấn đề', cat));
        row.appendChild(field('Loại báo cáo', type));
        row.appendChild(field('Mức ưu tiên', pri));
        form.appendChild(row);

        var desc = el('textarea', 'bkrep-input bkrep-textarea');
        desc.rows = 5;
        desc.maxLength = 5000;
        desc.placeholder = 'Mô tả càng rõ càng tốt: bạn đang ở đâu, làm gì, thấy gì và mong đợi điều gì.';
        desc.value = d.description || '';
        form.appendChild(field('Mô tả chi tiết', desc, 'Từ 10 đến 5.000 ký tự.', 5000));

        /* Ngữ cảnh tự thu thập — không có mật khẩu/token/cookie. */
        var ctxWrap = el('details', 'bkrep-ctx');
        ctxWrap.appendChild(el('summary', null, 'Thông tin ngữ cảnh được gửi kèm'));
        var ctxList = el('ul', 'bkrep-ctx-list');
        var captured = captureContext();
        [['Trang', global.location.pathname + global.location.search],
        ['Tiêu đề trang', D.title],
        ['Khu vực', subjectFromPath()],
        ['Trình duyệt', captured.platform + ' · ' + captured.language],
        ['Màn hình', captured.viewport + (captured.screen ? ' · ' + captured.screen : '')]].forEach(function (p) {
            var li = el('li');
            li.appendChild(el('b', null, p[0] + ': '));
            li.appendChild(el('span', null, p[1] || '—'));
            ctxList.appendChild(li);
        });
        ctxWrap.appendChild(ctxList);
        ctxWrap.appendChild(el('p', 'bkrep-hint',
            'Không thu thập mật khẩu, token, cookie hay dữ liệu cá nhân không cần thiết.'));
        form.appendChild(ctxWrap);

        form.appendChild(buildAttachments());

        var msg = el('div', 'bkrep-form-msg');
        msg.hidden = true;
        form.appendChild(msg);

        var foot = el('div', 'bkrep-foot');
        var reset = btn('is-ghost', 'Xoá nội dung', 'fa-rotate-left', function () {
            S.draft = null;
            S.files = [];
            clearDraft();
            renderComposeForm();
        });
        var submit = btn('is-primary', 'Gửi báo cáo', 'fa-paper-plane', null);
        submit.type = 'submit';
        foot.appendChild(reset);
        foot.appendChild(submit);
        form.appendChild(foot);

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            submitReport({ title: title, desc: desc, cat: cat, type: type, pri: pri, msg: msg, button: submit });
        });
        [title, desc].forEach(function (input) {
            input.addEventListener('input', function () {
                if (!S.draft) S.draft = loadDraft() || { category: 'bug', issue_type: 'bug', priority: 'normal' };
                if (input === title) S.draft.title = input.value;
                else S.draft.description = input.value;
                saveDraftSoon(S.draft);
            });
        });
        host.appendChild(form);
        try { title.focus(); } catch (e) { }
    }

    function buildAttachments() {
        var wrap = el('div', 'bkrep-field');
        wrap.appendChild(el('label', 'bkrep-label', 'Tệp đính kèm (tuỳ chọn)'));
        var pick = el('input', 'bkrep-file');
        pick.type = 'file';
        pick.accept = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';
        pick.multiple = true;
        pick.id = 'bkRepFiles';
        var label = el('label', 'bkrep-filebtn');
        label.setAttribute('for', 'bkRepFiles');
        label.appendChild(icon('fa-image'));
        label.appendChild(D.createTextNode('Chọn ảnh hoặc PDF'));
        wrap.appendChild(pick);
        wrap.appendChild(label);
        wrap.appendChild(el('span', 'bkrep-hint', 'Tối đa 4 tệp, mỗi tệp ≤ 5 MB (PNG, JPG, WEBP, GIF, PDF).'));

        var list = el('div', 'bkrep-files');
        wrap.appendChild(list);

        function paint() {
            clear(list);
            S.files.forEach(function (f, index) {
                var item = el('div', 'bkrep-file-item');
                item.appendChild(icon(f.type === 'application/pdf' ? 'fa-file-pdf' : 'fa-image'));
                item.appendChild(el('span', 'bkrep-file-name', f.name));
                item.appendChild(el('span', 'bkrep-file-size', Math.round(f.size / 1024) + ' KB'));
                var x = el('button', 'bkrep-x');
                x.type = 'button';
                x.setAttribute('aria-label', 'Xoá ' + f.name);
                x.appendChild(icon('fa-xmark'));
                x.addEventListener('click', function () { S.files.splice(index, 1); paint(); });
                item.appendChild(x);
                list.appendChild(item);
            });
        }

        pick.addEventListener('change', function () {
            var picked = Array.prototype.slice.call(pick.files || []);
            picked.forEach(function (f) {
                if (S.files.length >= MAX_FILES) return;
                if (!ALLOWED.test(f.type)) { toast('Chỉ nhận ảnh PNG/JPG/WEBP/GIF hoặc PDF.', 'error'); return; }
                if (f.size > MAX_BYTES) { toast('Tệp "' + f.name + '" vượt quá 5 MB.', 'error'); return; }
                S.files.push(f);
            });
            pick.value = '';
            paint();
        });
        return wrap;
    }

    function submitReport(parts) {
        var title = String(parts.title.value || '').trim();
        var desc = String(parts.desc.value || '').trim();
        if (title.length < 4) return formError(parts.msg, 'Tiêu đề cần ít nhất 4 ký tự.');
        if (desc.length < 10) return formError(parts.msg, 'Mô tả cần ít nhất 10 ký tự.');
        if (S.sending) return;
        S.sending = true;
        parts.button.disabled = true;
        parts.button.classList.add('is-busy');
        formError(parts.msg, '');

        uploadAll(S.files).then(function (paths) {
            var captured = captureContext();
            return api({
                action: 'create',
                title: title,
                description: desc,
                category: parts.cat.value,
                issue_type: parts.type.value,
                priority: parts.pri.value,
                page_url: String(global.location.href || '').slice(0, 500),
                page_title: String(D.title || '').slice(0, 200),
                route: String(global.location.pathname || '').slice(0, 200),
                subject: subjectFromPath(),
                context: captured,
                attachments: paths
            });
        }).then(function (data) {
            S.sending = false;
            parts.button.disabled = false;
            parts.button.classList.remove('is-busy');
            S.draft = null;
            S.files = [];
            S.listLoaded = false;
            clearDraft();
            if (data.duplicate) {
                toast('Báo cáo đã gửi. Có một báo cáo tương tự gần đây: ' + data.duplicate.code + '.', 'info');
            } else {
                toast('Đã gửi báo cáo ' + data.report.code + '. Bạn sẽ nhận phản hồi trong mục Báo cáo của tôi.', 'success');
            }
            bootstrap(true).catch(function () { });
            showReport(data.report.id);
        }).catch(function (err) {
            S.sending = false;
            parts.button.disabled = false;
            parts.button.classList.remove('is-busy');
            formError(parts.msg, (err && err.message) || 'Không gửi được báo cáo.');
        });
    }

    function formError(host, text) {
        if (!host) return;
        host.textContent = text || '';
        host.hidden = !text;
    }

    function uploadAll(files) {
        if (!files.length) return Promise.resolve([]);
        if (!global.BKCloud || typeof global.BKCloud.reportUpload !== 'function') {
            return Promise.reject(new Error('Chưa tải được lớp tải tệp.'));
        }
        var chain = Promise.resolve([]);
        files.forEach(function (f) {
            chain = chain.then(function (acc) {
                return global.BKCloud.reportUpload(f).then(function (path) { acc.push(path); return acc; });
            });
        });
        return chain;
    }

    /* ---------------------------- Danh sách của tôi ------------------------ */
    function showList() {
        S.tab = 'list';
        S.view = 'list';
        S.listSeq++;
        if (S.win) paintTabs();
        var host = S.body;
        if (!host) return;
        clear(host);

        var head = el('div', 'bkrep-list-head');
        S.listCountEl = el('span', 'bkrep-list-count', 'Đang tải…');
        head.appendChild(S.listCountEl);
        head.appendChild(btn('is-ghost is-sm', 'Báo cáo mới', 'fa-plus', function () {
            S.draft = null; S.files = []; showCompose();
        }));
        host.appendChild(head);

        /* Tìm kiếm và lọc ngay trong “Báo cáo của tôi” — không cần mở từng
           báo cáo hay tải lại trang. */
        var filters = el('div', 'bkrep-filters');
        var search = el('input', 'bkrep-input bkrep-search');
        search.type = 'search';
        search.placeholder = 'Tìm mã hoặc tiêu đề…';
        search.value = S.listQuery || '';
        search.setAttribute('aria-label', 'Tìm báo cáo của tôi');
        var searchTimer = null;
        search.addEventListener('input', function () {
            S.listQuery = search.value;
            clearTimeout(searchTimer);
            searchTimer = global.setTimeout(function () { loadMyReports(false); }, 320);
        });
        filters.appendChild(search);
        var status = select([['all', 'Tất cả'], ['open', 'Đang mở'], ['resolved', 'Đã xử lý']], S.listStatus || 'all');
        status.className = 'bkrep-input bkrep-filter-status';
        status.setAttribute('aria-label', 'Lọc theo trạng thái');
        status.addEventListener('change', function () {
            S.listStatus = status.value;
            loadMyReports(false);
        });
        filters.appendChild(status);
        host.appendChild(filters);

        S.listHost = el('div', 'bkrep-list-host');
        host.appendChild(S.listHost);
        loadMyReports(false);
    }

    function loadMyReports(append) {
        if (!S.listHost) return;
        if (!append) {
            clear(S.listHost);
            var loading = el('div', 'bkrep-loading');
            loading.appendChild(el('span', 'bkrep-spinner'));
            loading.appendChild(el('span', null, 'Đang tải báo cáo…'));
            S.listHost.appendChild(loading);
        }
        var seq = S.listSeq;
        api({
            action: 'list', limit: 20, offset: append ? S.list.length : 0,
            q: S.listQuery || '', status: S.listStatus || 'all'
        }).then(function (data) {
            /* Người dùng có thể đã mở chi tiết trong lúc chờ: bỏ phản hồi cũ. */
            if (seq !== S.listSeq) return;
            var rows = data.reports || [];
            S.list = append ? S.list.concat(rows) : rows;
            S.listTotal = data.total || 0;
            S.listLoaded = true;
            S.view = 'list';
            renderList();
        }).catch(function (err) {
            if (seq !== S.listSeq) return;
            clear(S.listHost);
            S.listHost.appendChild(notBoundNotice(err));
        });
    }

    function renderList() {
        var host = S.listHost;
        if (!host) return;
        clear(host);
        if (S.listCountEl) {
            S.listCountEl.textContent = S.listTotal
                ? (S.listTotal + (S.listStatus !== 'all' || S.listQuery ? ' kết quả' : ' báo cáo'))
                : 'Chưa có báo cáo nào';
        }

        if (!S.list.length) {
            var empty = el('div', 'bkrep-empty');
            empty.appendChild(icon('fa-inbox'));
            empty.appendChild(el('b', null, (S.listQuery || S.listStatus !== 'all')
                ? 'Không có báo cáo khớp bộ lọc'
                : 'Bạn chưa gửi báo cáo nào'));
            empty.appendChild(el('p', null, (S.listQuery || S.listStatus !== 'all')
                ? 'Thử từ khoá khác hoặc bỏ bộ lọc trạng thái.'
                : 'Khi phát hiện lỗi nội dung, giao diện hay tài khoản, hãy gửi báo cáo để ban quản trị phản hồi riêng cho bạn.'));
            host.appendChild(empty);
            return;
        }

        var list = el('div', 'bkrep-list');
        S.list.forEach(function (r) {
            var item = el('button', 'bkrep-item');
            item.type = 'button';
            var top = el('div', 'bkrep-item-top');
            top.appendChild(el('span', 'bkrep-code', r.code));
            top.appendChild(statusPill(r.status));
            if (r.student_unread > 0) top.appendChild(el('span', 'bkrep-unread', 'Phản hồi mới'));
            item.appendChild(top);
            item.appendChild(el('b', 'bkrep-item-title', r.title));
            if (r.last_message_preview) {
                item.appendChild(el('span', 'bkrep-item-preview', r.last_message_preview));
            }
            var meta = el('div', 'bkrep-item-meta');
            meta.appendChild(el('span', null, categoryLabel(r.category)));
            meta.appendChild(el('span', null, 'Ưu tiên ' + priorityLabel(r.priority)));
            meta.appendChild(el('span', null, rel(r.updated_at)));
            if (r.attachment_count) meta.appendChild(el('span', null, r.attachment_count + ' tệp'));
            item.appendChild(meta);
            item.addEventListener('click', function () { showReport(r.id); });
            list.appendChild(item);
        });
        host.appendChild(list);

        if (S.list.length < S.listTotal) {
            var more = btn('is-ghost is-sm bkrep-more',
                'Tải thêm (' + (S.listTotal - S.list.length) + ')', 'fa-chevron-down',
                function () {
                    more.disabled = true;
                    loadMyReports(true);
                });
            var foot = el('div', 'bkrep-list-more');
            foot.appendChild(more);
            host.appendChild(foot);
        }
    }

    /* ------------------------------- Chi tiết ----------------------------- */
    function showReport(id) {
        if (!id) return showList();
        S.tab = 'list';
        S.view = 'detail';
        S.listSeq++;
        if (S.win) paintTabs();
        var host = S.body;
        if (!host) return;
        clear(host);
        var loading = el('div', 'bkrep-loading');
        loading.appendChild(el('span', 'bkrep-spinner'));
        loading.appendChild(el('span', null, 'Đang mở báo cáo…'));
        host.appendChild(loading);

        api({ action: 'detail', report_id: id }).then(function (data) {
            S.detail = data;
            renderDetail(data);
        }).catch(function (err) {
            clear(host);
            host.appendChild(notice('error', (err && err.message) || 'Không mở được báo cáo.', 'fa-circle-exclamation'));
            host.appendChild(btn('is-ghost', 'Quay lại danh sách', 'fa-arrow-left', function () { showList(); }));
        });
    }

    function renderDetail(data) {
        var host = S.body;
        if (!host) return;
        clear(host);
        var r = data.report;

        var back = el('button', 'bkrep-back');
        back.type = 'button';
        back.appendChild(icon('fa-arrow-left'));
        back.appendChild(D.createTextNode('Danh sách báo cáo'));
        back.addEventListener('click', function () { S.listLoaded = false; showList(); });
        host.appendChild(back);

        var head = el('div', 'bkrep-detail-head');
        var titles = el('div');
        titles.appendChild(el('span', 'bkrep-code', r.code));
        titles.appendChild(el('h3', 'bkrep-detail-title', r.title));
        head.appendChild(titles);
        head.appendChild(statusPill(r.status));
        host.appendChild(head);

        var meta = el('div', 'bkrep-item-meta');
        meta.appendChild(el('span', null, categoryLabel(r.category)));
        meta.appendChild(el('span', null, 'Ưu tiên ' + priorityLabel(r.priority)));
        meta.appendChild(el('span', null, 'Gửi ' + fmt(r.created_at)));
        if (r.page_title) meta.appendChild(el('span', null, r.page_title));
        host.appendChild(meta);

        var body = el('div', 'bkrep-desc');
        body.textContent = r.description;
        host.appendChild(body);

        if (data.attachments && data.attachments.length) {
            host.appendChild(attachmentList(data.attachments));
        }

        if (r.status === 'resolved' && r.resolution_note) {
            var res = notice('ok', 'Kết quả xử lý: ' + r.resolution_note, 'fa-circle-check');
            host.appendChild(res);
        }
        if (r.status === 'closed') {
            host.appendChild(notice('info', 'Báo cáo này đã đóng. Nếu vấn đề còn tiếp diễn, hãy gửi báo cáo mới.', 'fa-lock'));
        }

        host.appendChild(el('h4', 'bkrep-qa-title', 'Trao đổi với ban quản trị'));
        var thread = el('div', 'bkrep-thread');
        thread.setAttribute('role', 'log');
        thread.setAttribute('aria-live', 'polite');
        var messages = data.messages || [];
        if (!messages.length) {
            var empty = el('div', 'bkrep-thread-empty');
            empty.appendChild(el('span', null, 'Chưa có phản hồi. Ban quản trị sẽ trả lời tại đây và gửi thông báo cho bạn.'));
            thread.appendChild(empty);
        }
        messages.forEach(function (m) {
            var mine = m.sender_kind === 'student';
            var row = el('div', 'bkrep-msg' + (mine ? ' is-me' : ' is-staff'));
            var bubble = el('div', 'bkrep-bubble');
            var top = el('div', 'bkrep-bubble-top');
            top.appendChild(el('b', null, mine ? 'Bạn' : (m.sender_label || 'Ban quản trị')));
            if (m.is_private) top.appendChild(el('span', 'bkrep-tag', 'Tin nhắn riêng'));
            top.appendChild(el('span', 'bkrep-msg-time', fmt(m.created_at)));
            bubble.appendChild(top);
            var text = el('p', 'bkrep-msg-body');
            text.textContent = m.body;
            bubble.appendChild(text);
            if (m.attachment_urls && m.attachment_urls.length) {
                bubble.appendChild(attachmentList(m.attachment_urls));
            }
            row.appendChild(bubble);
            thread.appendChild(row);
        });
        host.appendChild(thread);

        if (r.status !== 'closed') {
            var form = el('form', 'bkrep-reply');
            form.noValidate = true;
            var input = el('textarea', 'bkrep-input bkrep-textarea');
            input.rows = 3;
            input.maxLength = 4000;
            input.placeholder = 'Trả lời hoặc bổ sung thông tin…';
            input.setAttribute('aria-label', 'Nội dung trả lời');
            form.appendChild(input);
            var msg = el('div', 'bkrep-form-msg');
            msg.hidden = true;
            form.appendChild(msg);
            var send = btn('is-primary', 'Gửi trả lời', 'fa-paper-plane', null);
            send.type = 'submit';
            var foot = el('div', 'bkrep-foot');
            if (r.status === 'resolved') {
                foot.appendChild(el('span', 'bkrep-hint', 'Gửi trả lời sẽ mở lại báo cáo này.'));
            }
            foot.appendChild(send);
            form.appendChild(foot);
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var text = String(input.value || '').trim();
                if (!text) return formError(msg, 'Nội dung trả lời đang trống.');
                if (send.disabled) return;
                send.disabled = true;
                api({ action: 'message.send', report_id: r.id, body: text }).then(function (out) {
                    input.value = '';
                    send.disabled = false;
                    var entry = out.message;
                    entry.attachment_urls = entry.attachment_urls || [];
                    data.messages.push(entry);
                    data.report.status = out.status || data.report.status;
                    S.listLoaded = false;
                    renderDetail(data);
                    toast('Đã gửi trả lời.', 'success');
                }).catch(function (err) {
                    send.disabled = false;
                    formError(msg, (err && err.message) || 'Không gửi được trả lời.');
                });
            });
            host.appendChild(form);
        }
    }

    function attachmentList(files) {
        var box = el('div', 'bkrep-attachments');
        files.forEach(function (f) {
            var a = el('a', 'bkrep-attach');
            a.href = f.url || '#';
            a.target = '_blank';
            a.rel = 'noopener';
            a.appendChild(icon(/\.pdf$/i.test(f.path || f.name || '') ? 'fa-file-pdf' : 'fa-image'));
            a.appendChild(el('span', null, f.name || 'tệp'));
            box.appendChild(a);
        });
        return box;
    }

    /* ------------------------------- Public API --------------------------- */
    function mount(host, opts) {
        if (!host) return null;
        opts = opts || {};
        injectCss();
        var wrap = el('div', 'bkrep-inline');
        host.appendChild(wrap);
        var savedBody = S.body;
        var savedWin = S.win;
        var savedTab = S.tab;
        S.body = wrap;
        S.win = null;
        S.tab = opts.tab || 'compose';
        if (S.tab === 'list') showList(); else showCompose();
        var handle = {
            refresh: function () { S.body = wrap; S.win = null; if (S.tab === 'list') showList(); else showCompose(); },
            openReport: function (id) { S.body = wrap; S.win = null; S.tab = 'list'; showReport(id); },
            destroy: function () { S.body = savedBody; S.win = savedWin; S.tab = savedTab; wrap.remove(); }
        };
        return handle;
    }

    function init() {
        if (!configured()) return;
        /* Trang quản trị dùng tab Report riêng trong dashboard; nút nổi dành cho
           học sinh không được xuất hiện ở /admin hay /founder. */
        if (global.BK_ADMIN_ONLY) return;
        if (!S.draft) S.draft = loadDraft();
        injectCss();
        mountFab();
        if (hasStudent()) bootstrap().catch(function () { });
        D.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (isWindowOpen()) { e.preventDefault(); closeWindow(); }
        });
        global.addEventListener('resize', function () { layoutFab(); });
        /* Trung tâm thông báo vừa tải phản hồi mới → cập nhật chấm đỏ của nút và
           danh sách đang mở, không cần tải lại trang. */
        global.addEventListener('bk:report-notes', function () {
            if (!S.booted) return;
            bootstrap(true).then(function () {
                if (isWindowOpen() && S.view === 'list' && S.tab === 'list' && S.listHost) {
                    loadMyReports(false);
                }
            }).catch(function () { });
        });
    }

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();

    global.BKReport = {
        open: openWindow,
        openReport: function (id) {
            if (!id) return openWindow('list');
            openWindow('list');
            showReport(id);
        },
        close: closeWindow,
        mount: mount,
        resetPosition: resetFab,
        refresh: function () { return bootstrap(true).then(function () { if (isWindowOpen()) showTab(S.tab); }); },
        count: function () { return S.counts; },
        __state: S
    };
})(typeof window !== 'undefined' ? window : this);
