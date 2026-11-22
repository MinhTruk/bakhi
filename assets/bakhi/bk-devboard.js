/* =========================================================================
   Bá Khí — bk-devboard.js
   Administrator Dashboard 4.2: shell hiện đại, 13 khu vực quản trị
   (Overview, Students, Profiles, Badges, Chat, Notifications, What's New,
   Changelog, Logs, Monitoring, Permissions, Settings, Data).
   Mọi thao tác ghi đều đi qua Edge Function admin-actions với admin session
   token — client không bao giờ tự quyết định quyền.

   Công khai: window.openDevDashboard(), window.mountDevMenu, window.BKDashboard
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKDashboardLoaded) return;
    global.BKDashboardLoaded = true;

    var APP_VERSION = '8.4.3';

    var TYPES = [['general', 'Chung'], ['announcement', 'Thông báo'], ['update', 'Cập nhật'],
        ['important', 'Quan trọng'], ['maintenance', 'Bảo trì']];
    var PRIORITIES = [['low', 'Thấp'], ['normal', 'Bình thường'], ['high', 'Cao'], ['critical', 'Khẩn']];
    var CATEGORIES = [['features', 'Tính năng mới'], ['improvements', 'Cải tiến'], ['fixes', 'Sửa lỗi'],
        ['ui', 'Giao diện'], ['performance', 'Hiệu năng'], ['security', 'Bảo mật'],
        ['notice', 'Thông báo'], ['other', 'Khác']];
    var ALL_TABS = [
        ['overview', 'Tổng quan', 'fa-gauge-high'],
        ['students', 'Học sinh', 'fa-user-graduate'],
        ['profiles', 'Hồ sơ', 'fa-id-card'],
        ['badges', 'Thành tích', 'fa-medal'],
        ['gamification', 'Tiến trình', 'fa-gamepad'],
        ['chat', 'Chat', 'fa-comments'],
        ['reports', 'Report', 'fa-flag'],
        ['notifications', 'Thông báo', 'fa-bullhorn'],
        ['whatsnew', "What's New", 'fa-star'],
        ['changelog', 'Changelog', 'fa-code-branch'],
        ['logs', 'Nhật ký', 'fa-clock-rotate-left'],
        ['monitoring', 'Giám sát', 'fa-heart-pulse'],
        ['permissions', 'Quyền & bảo mật', 'fa-shield-halved'],
        ['settings', 'Cấu hình', 'fa-gear'],
        ['maintenance', 'Bảo trì', 'fa-screwdriver-wrench'],
        ['data', 'Dữ liệu & sao lưu', 'fa-database']
    ];
    var TAB_SUBS = {
        overview: 'Toàn cảnh dữ liệu và hoạt động quản trị',
        students: 'Danh sách học sinh, phân biệt hồ sơ trùng tên',
        profiles: 'Xem hồ sơ, khung avatar và thành tích của từng học sinh',
        badges: 'Trao và thu hồi hai badge dành riêng cho Administrator',
        gamification: 'Cấu hình XP, thành tựu, nhiệm vụ, cây kỹ năng, thử thách và phần thưởng',
        chat: 'Kiểm duyệt phòng chung, tin nhắn riêng và nhóm nhỏ',
        reports: 'Tiếp nhận, trao đổi và hoàn thiện báo cáo của học sinh',
        notifications: 'Soạn, xem trước và xuất bản thông báo tức thời',
        whatsnew: 'Bật/tắt khối "Cập nhật gần đây" và xem trước nội dung',
        changelog: 'Quản lý lịch sử phiên bản hiển thị trên website',
        logs: 'Nhật ký thao tác quản trị trên máy chủ',
        monitoring: 'Sức khoẻ máy chủ, đồng bộ và lỗi gần đây',
        permissions: 'Mô hình quyền hiện tại và phiên quản trị',
        settings: 'Kết nối, feature flag, giao diện và phiên làm việc',
        maintenance: 'Bật/tắt bảo trì toàn website và soạn thông báo đóng cửa tạm thời',
        data: 'Kiểm tra toàn vẹn, xuất dữ liệu an toàn',
        founder: 'Toàn quyền Founder: cấp trọn bộ badge, khung và đồng bộ tức thời'
    };

    /* Founder Dashboard = đủ 14 mô-đun + tab Founder. Administrator thường
       không thấy các mô-đun tối mật (bảo trì, dữ liệu); máy chủ cũng chặn. */
    function dashboardScope() {
        if (global.BK_DASH_SCOPE === 'founder') return 'founder';
        try {
            var raw = global.sessionStorage.getItem('bakhiAdmin.v1');
            var saved = raw ? JSON.parse(raw) : null;
            return saved && saved.token && saved.scope === 'founder' ? 'founder' : 'admin';
        } catch (e) { return 'admin'; }
    }
    function isFounder() { return dashboardScope() === 'founder'; }
    /* Administrator và Founder dùng chung một dashboard; tên mặc định đổi theo
       phạm vi đăng nhập. Tên tuỳ chỉnh (public.branding) vẫn được ưu tiên. */
    function defaultDashboardName() {
        return isFounder() ? 'Founder Dashboard' : 'Administrator Dashboard';
    }
    /* Migration 7.0 ghi sẵn "Administrator Dashboard" vào app_settings như một
       giá trị mặc định, không phải tên do người dùng đặt. Trong phạm vi Founder,
       coi giá trị đó là "chưa tuỳ chỉnh" để tiêu đề luôn là Founder Dashboard. */
    function brandingName(raw) {
        var name = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, 40);
        if (isFounder() && name === 'Administrator Dashboard') return defaultDashboardName();
        return name || defaultDashboardName();
    }
    function isExclusiveBadge(id) {
        return id === 'founder' ||
            String(id).indexOf('dev-exclusive-') === 0 ||
            String(id).indexOf('founder-') === 0;
    }
    var TABS = ALL_TABS.filter(function (t) {
        if (isFounder()) return true;
        return t[0] !== 'maintenance' && t[0] !== 'data';
    });
    if (isFounder()) TABS.push(['founder', 'Founder', 'fa-crown']);
    var tabState = isFounder() ? 'founder' : 'admin';
    var TYPE_META = {
        general: { icon: 'fa-circle-info' }, announcement: { icon: 'fa-bullhorn' },
        update: { icon: 'fa-arrow-up-right-dots' }, important: { icon: 'fa-triangle-exclamation' },
        maintenance: { icon: 'fa-screwdriver-wrench' }
    };

    var S = {
        root: null, body: null, statusPill: null, statusText: null, headSub: null,
        tab: 'overview', status: null, statusAt: 0, cmdOpen: false,
        notif: {
            editing: null, draft: null, list: [], q: '', filterType: '', filterStatus: '',
            page: 1, pageSize: 20, total: 0
        },
        cl: {
            editing: null, draft: null, sections: [], loadedFor: null, list: [], q: '',
            filterCat: '', filterStatus: '', filterSource: '', filterSync: '',
            page: 1, pageSize: 20, total: 0
        },
        students: { q: '', status: 'all', reviewOnly: false, list: [], importText: '', page: 1, pageSize: 20, total: 0 },
        profiles: { q: '', list: [], page: 1, pageSize: 20, total: 0, loading: false },
        badges: { q: '', list: [], page: 1, pageSize: 20, total: 0, selected: null, badges: [], badgeId: 'admin-chosen', reason: '' },
        chat: { rooms: [], active: null, data: null, loading: false },
        reports: {
            list: [], stats: null, total: 0, page: 1, pageSize: 20, q: '',
            status: 'all', category: 'all', priority: 'all', unread: false,
            from: '', to: '', loading: false, searchTimer: null,
            activeId: null, detail: null, detailLoading: false
        },
        whatsnew: { flags: [], entries: [], loading: false },
        logs: { list: [], q: '', target: '', limit: 100, page: 1, total: 0, from: '', to: '' },
        monitor: { data: null },
        permissions: { data: null },
        data: { integrity: null, flags: [] },
        maintenance: { history: [], q: '', status: 'all', total: 0, loading: false, cycle: null, searchTimer: null },
        branding: { adminDashboardName: defaultDashboardName() }
    };

    /* ------------------------------ Tiện ích ------------------------------ */
    function h(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function icon(name) {
        return h('i', 'fa-solid ' + (name || 'fa-circle'));
    }
    function btn(label, cls, onClick, iconName) {
        var b = h('button', 'bkc-btn' + (cls ? ' ' + cls : ''));
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        b.appendChild(D.createTextNode(label));
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function iconBtn(iconName, title, onClick, cls) {
        var b = h('button', 'bkc-icon-btn' + (cls ? ' ' + cls : ''));
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.appendChild(icon(iconName));
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function toast(message, type) {
        if (global.BK && global.BK.ui && global.BK.ui.toast) {
            try { global.BK.ui.toast(message, type); return; } catch (e) { }
        }
        console.log('[BKDashboard]', message);
    }
    function fmt(iso) {
        if (!iso) return '—';
        if (global.BK && BK.util && BK.util.fmtTime) return BK.util.fmtTime(iso);
        return '—';
    }
    function fmtDay(iso) {
        if (!iso) return '—';
        if (global.BK && BK.util && BK.util.fmtDate) return BK.util.fmtDate(iso);
        return '—';
    }
    function greeting() {
        var hour = new Date().getHours();
        try { if (global.BK && BK.util && BK.util.vnParts) hour = Number(BK.util.vnParts(Date.now()).hour); } catch (e) { }
        if (hour < 11) return 'Chào buổi sáng';
        if (hour < 14) return 'Chào buổi trưa';
        if (hour < 18) return 'Chào buổi chiều';
        return 'Chào buổi tối';
    }
    function labelOf(pairs, value) {
        for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === value) return pairs[i][1];
        return value || '—';
    }
    function selectBox(pairs, value, onChange) {
        var s = h('select', 'bkc-select');
        pairs.forEach(function (p) {
            var o = h('option', null, p[1]);
            o.value = p[0];
            if (p[0] === value) o.selected = true;
            s.appendChild(o);
        });
        if (onChange) s.addEventListener('change', function () { onChange(s.value); });
        return s;
    }
    function fieldRow(labelText, control, hint) {
        var row = h('div', 'bkc-form-row');
        row.appendChild(h('label', 'bkc-label', labelText));
        row.appendChild(control);
        if (hint) row.appendChild(h('span', 'bkc-hint', hint));
        return row;
    }
    function input(type, placeholder, value) {
        var i = h('input', 'bkc-input');
        i.type = type || 'text';
        if (placeholder) i.placeholder = placeholder;
        if (value != null) i.value = value;
        return i;
    }
    function textarea(placeholder, value, rows) {
        var t = h('textarea', 'bkc-textarea');
        if (placeholder) t.placeholder = placeholder;
        if (value != null) t.value = value;
        if (rows) t.rows = rows;
        return t;
    }
    function card(titleText, actions, subtitle) {
        var root = h('div', 'bkc-card');
        var head = h('div', 'bkc-card-head');
        var titles = h('div', 'bkc-card-titles');
        titles.appendChild(h('h3', 'bkc-sec-title', titleText));
        if (subtitle) titles.appendChild(h('p', 'bkc-card-sub', subtitle));
        head.appendChild(titles);
        if (actions && actions.length) {
            var acts = h('div', 'bkc-actions');
            actions.forEach(function (a) { acts.appendChild(a); });
            head.appendChild(acts);
        }
        root.appendChild(head);
        var body = h('div', 'bkc-card-body');
        root.appendChild(body);
        return { root: root, body: body, head: head, titles: titles };
    }
    function alertBox(text, kind) {
        var a = h('div', 'bkc-alert' + (kind ? ' is-' + kind : ''));
        a.appendChild(icon(kind === 'error' ? 'fa-circle-exclamation' : kind === 'ok' ? 'fa-circle-check' : 'fa-circle-info'));
        a.appendChild(h('span', null, text));
        return a;
    }
    function table(headers) {
        var wrap = h('div', 'bkc-table-wrap');
        var t = h('table', 'bkc-table');
        var thead = h('thead');
        var tr = h('tr');
        headers.forEach(function (x) { tr.appendChild(h('th', null, x)); });
        thead.appendChild(tr);
        t.appendChild(thead);
        var tbody = h('tbody');
        t.appendChild(tbody);
        wrap.appendChild(t);
        return { wrap: wrap, tbody: tbody };
    }
    function emptyRow(tbody, cols, text) {
        var tr = h('tr');
        var td = h('td', null, text || 'Chưa có dữ liệu.');
        td.colSpan = cols;
        td.className = 'bkc-td-empty';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    function emptyState(host, iconName, title, text) {
        var box = h('div', 'bkc-empty-card');
        var ic = h('span', 'bkc-empty-ic');
        ic.appendChild(icon(iconName || 'fa-inbox'));
        box.appendChild(ic);
        box.appendChild(h('b', 'bkc-empty-title', title));
        if (text) box.appendChild(h('p', 'bkc-empty-text', text));
        host.appendChild(box);
        return box;
    }
    function loading(host, text) {
        var box = h('div', 'bkc-loading');
        box.appendChild(h('span', 'bkc-spinner'));
        box.appendChild(h('span', null, text || 'Đang tải…'));
        host.appendChild(box);
        return box;
    }
    function statCard(grid, label, value, hint, iconName, tone) {
        var c = h('div', 'bkc-stat' + (tone ? ' is-' + tone : ''));
        var top = h('div', 'bkc-stat-top');
        var ic = h('span', 'bkc-stat-ic');
        ic.appendChild(icon(iconName || 'fa-chart-simple'));
        top.appendChild(ic);
        top.appendChild(h('span', 'bkc-stat-label', label));
        c.appendChild(top);
        c.appendChild(h('span', 'bkc-stat-value', String(value == null ? '—' : value)));
        if (hint) c.appendChild(h('span', 'bkc-stat-hint', hint));
        grid.appendChild(c);
    }
    function pill(text, kind) {
        return h('span', 'bkc-pill' + (kind ? ' is-' + kind : ''), text);
    }
    function counter(control, max) {
        var c = h('span', 'bkc-counter');
        function paint() {
            var n = String(control.value || '').length;
            c.textContent = n + '/' + max;
            c.classList.toggle('is-over', n > max);
        }
        control.addEventListener('input', paint);
        paint();
        return c;
    }
    function checkbox(labelText, checked, onChange) {
        var wrap = h('label', 'bkc-check');
        var box = h('input');
        box.type = 'checkbox';
        box.checked = !!checked;
        if (onChange) box.addEventListener('change', function () { onChange(box.checked); });
        wrap.appendChild(box);
        wrap.appendChild(h('span', null, labelText));
        return { root: wrap, input: box };
    }
    /**
     * Phân trang dùng chung cho mọi bảng quản trị. Máy chủ trả total/offset;
     * client chỉ yêu cầu trang hiện tại, không tải toàn bộ bảng.
     */
    function renderPager(host, opts) {
        host.textContent = '';
        var total = Math.max(0, Number(opts.total) || 0);
        var pageSize = Math.max(1, Number(opts.pageSize) || 20);
        var pages = Math.max(1, Math.ceil(total / pageSize));
        var page = Math.min(Math.max(1, Number(opts.page) || 1), pages);
        var prev = btn('‹ Trước', 'bkc-btn-ghost bkc-btn-xs', function () {
            if (page > 1) opts.onPage(page - 1);
        });
        prev.disabled = page <= 1;
        var next = btn('Sau ›', 'bkc-btn-ghost bkc-btn-xs', function () {
            if (page < pages) opts.onPage(page + 1);
        });
        next.disabled = page >= pages;
        if (pages > 1) {
            host.appendChild(prev);
            host.appendChild(h('span', 'bkc-page-label',
                'Trang ' + page + ' / ' + pages + ' · ' + total + ' ' + (opts.unit || 'dòng')));
            host.appendChild(next);
        } else {
            host.appendChild(h('span', 'bkc-page-label', total + ' ' + (opts.unit || 'dòng')));
        }
        if (opts.onSize) {
            var sizes = opts.sizes || [10, 20, 50];
            var size = selectBox(sizes.map(function (n) { return [String(n), n + ' / trang']; }),
                String(pageSize), function (v) {
                    opts.onSize(parseInt(v, 10) || 20);
                });
            size.className = 'bkc-select bkc-select-sm';
            host.appendChild(size);
        }
        return { page: page, pages: pages };
    }
    function copyText(text, okMessage) {
        var value = String(text == null ? '' : text);
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(function () {
                toast(okMessage || 'Đã sao chép', 'success');
            }).catch(function () { legacyCopy(value, okMessage); });
        } else legacyCopy(value, okMessage);
    }
    function legacyCopy(value, okMessage) {
        try {
            var t = D.createElement('textarea');
            t.value = value;
            t.style.position = 'fixed';
            t.style.opacity = '0';
            (D.body || D.documentElement).appendChild(t);
            t.select();
            D.execCommand('copy');
            t.remove();
            toast(okMessage || 'Đã sao chép', 'success');
        } catch (e) { toast('Không sao chép được', 'error'); }
    }
    function download(filename, content, mime) {
        try {
            var blob = new global.Blob([content], { type: mime || 'text/plain;charset=utf-8' });
            var url = global.URL.createObjectURL(blob);
            var a = D.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            (D.body || D.documentElement).appendChild(a);
            a.click();
            setTimeout(function () {
                try { a.remove(); global.URL.revokeObjectURL(url); } catch (e) { }
            }, 400);
        } catch (e) {
            toast('Trình duyệt không hỗ trợ tải tệp', 'error');
        }
    }
    function csvCell(value) {
        var s = String(value == null ? '' : value).replace(/"/g, '""');
        return '"' + s + '"';
    }
    function csv(rows) {
        return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    }
    function basePath() {
        try {
            if (global.BK && global.BK.util && global.BK.util.basePath) return global.BK.util.basePath();
        } catch (e) { }
        return '../../';
    }
    function ensureDashCss() {
        if (!D || typeof D.querySelector !== 'function') return;
        if (D.querySelector('link[data-bk-admin-dash]')) return;
        var link = D.createElement('link');
        link.rel = 'stylesheet';
        link.setAttribute('data-bk-admin-dash', '1');
        link.href = basePath() + 'assets/bakhi/bk-admin-dashboard.css?v=' + APP_VERSION;
        (D.head || D.documentElement).appendChild(link);
    }
    function adminSession() {
        try {
            var raw = global.sessionStorage.getItem('bakhiAdmin.v1');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function bumpVersion(value) {
        var m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value || ''));
        if (!m) return String(value || '');
        return m[1] + '.' + m[2] + '.' + (parseInt(m[3], 10) + 1);
    }
    function downloadJson(name, data) {
        download(name, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    }

    /* -------------------------------- API --------------------------------- */
    function api(action, payload) {
        if (!global.BKCloud || typeof global.BKCloud.adminAction !== 'function') {
            return Promise.reject(new Error('Chưa tải được lớp Supabase. Hãy tải lại trang.'));
        }
        return global.BKCloud.adminAction(action, payload).catch(function (err) {
            if (err && err.status === 401) {
                err.handled = true;
                try { global.BKCloud.adminLogout(); } catch (e) { }
                toast('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.', 'error');
                closeDash();
                if (typeof global.mountDevMenu === 'function') {
                    try { global.mountDevMenu(); } catch (e) { }
                }
            }
            throw err;
        });
    }
    function fail(err, host) {
        if (!err || err.handled) return;
        if (host) {
            host.textContent = '';
            host.appendChild(alertBox(err.message || 'Thao tác thất bại.', 'error'));
        } else {
            toast(err.message || 'Thao tác thất bại.', 'error');
        }
    }

    /* --------------------------- Đăng nhập Admin -------------------------- */
    function closeMenu() {
        var dd = D.getElementById('hamburgerDropdown');
        if (dd) dd.classList.add('hidden');
    }

    /**
     * Mục Administrator Dashboard nằm trong menu 3 gạch và CHỈ hiện sau khi xác
     * thực Administrator Code thành công (hoặc khi còn phiên quản trị).
     */
    function mountDevMenu() {
        var row = D.getElementById('bkDevAuthRow');
        var section = D.getElementById('bkDevDashSection');
        if (!section) return;
        var hasSession = !!(global.BKCloud && global.BKCloud.adminToken && global.BKCloud.adminToken());
        section.classList.toggle('hidden', !hasSession);
        if (row) row.classList.toggle('hidden', hasSession);

        var reveal = D.getElementById('bkDevRevealBtn');
        var codeWrap = D.getElementById('bkDevCodeWrap');
        if (reveal && codeWrap) {
            if (hasSession) codeWrap.classList.add('hidden');
            if (!reveal.__bkBound) {
                reveal.__bkBound = true;
                reveal.addEventListener('click', function () {
                    codeWrap.classList.toggle('hidden');
                    var field = D.getElementById('bkDevCodeInput');
                    if (field && !codeWrap.classList.contains('hidden')) field.focus();
                });
            }
        }

        var input = D.getElementById('bkDevCodeInput');
        var submit = D.getElementById('bkDevAuthBtn');
        var msg = D.getElementById('bkDevAuthMsg');

        function setMsg(text, kind) {
            if (!msg) return;
            msg.textContent = text || '';
            msg.className = 'text-[10px] leading-snug ' + (
                kind === 'error' ? 'text-rose-400' : kind === 'warn' ? 'text-amber-400' :
                    kind === 'ok' ? 'text-emerald-400' : 'text-slate-400');
        }

        function authenticate() {
            var code = input ? input.value.trim() : '';
            if (!code) {
                setMsg('Nhập Administrator Code trước khi xác thực.', 'warn');
                if (input) input.focus();
                return;
            }
            if (!global.BKCloud || !global.BKCloud.configured || !global.BKCloud.configured()) {
                setMsg('Chưa cấu hình Supabase cho trang này.', 'error');
                return;
            }
            if (submit) submit.disabled = true;
            setMsg('Đang xác thực trên máy chủ…', '');
            global.BKCloud.adminLogin(code).then(function () {
                if (submit) submit.disabled = false;
                if (input) input.value = '';
                setMsg('', '');
                mountDevMenu();
                closeMenu();
                /* Không tự mở dashboard: chỉ báo thành công và để người dùng
                   chủ động mở Administrator Dashboard ở tab riêng. */
                toast('Xác thực Administrator thành công. Bảng quản trị đã sẵn sàng trong menu.', 'success');
            }).catch(function (err) {
                if (submit) submit.disabled = false;
                setMsg((err && err.message) || 'Administrator Code không đúng.', 'error');
            });
        }

        if (submit && !submit.__bkBound) {
            submit.__bkBound = true;
            submit.addEventListener('click', authenticate);
            if (input) input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); authenticate(); }
            });
        }

        var logout = D.getElementById('bkDevLogoutBtn');
        if (logout && !logout.__bkBound) {
            logout.__bkBound = true;
            logout.addEventListener('click', function () {
                if (global.BKCloud) global.BKCloud.adminLogout();
                closeDash();
                mountDevMenu();
                closeMenu();
                toast('Đã thoát Administrator Dashboard', 'info');
            });
        }
    }

    function openDevDashboard() {
        if (!global.BKCloud || !global.BKCloud.configured()) {
            toast('Cấu hình Supabase chưa hoàn tất — mở assets/bakhi/bk-supabase.config.js.', 'error');
            return;
        }
        closeMenu();
        if (global.BKCloud.adminToken()) { openDash(); return; }
        promptCode();
    }

    function promptCode() {
        if (!global.BK || !global.BK.ui || !global.BK.ui.modal) {
            toast('Không tải được giao diện xác thực. Hãy tải lại trang.', 'error');
            return;
        }
        var body = h('div', 'bkc-form');
        body.appendChild(h('p', 'bkc-muted',
            'Nhập Administrator Code để mở Administrator Dashboard. Mã được xác thực trên máy chủ và không được lưu lại.'));
        var code = input('password', 'Administrator Code…');
        code.autocomplete = 'off';
        body.appendChild(fieldRow('Administrator Code', code));
        var msg = h('p', 'bkc-gate-msg');
        body.appendChild(msg);

        var modal = global.BK.ui.modal({
            title: 'Administrator Dashboard',
            body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost', onClick: function (c) { c(); } },
                { label: 'Xác thực', variant: 'primary', onClick: function () { submit(); } }
            ]
        });

        function submit() {
            var value = code.value.trim();
            msg.className = 'bkc-gate-msg';
            if (!value) { msg.textContent = 'Vui lòng nhập Administrator Code.'; msg.className = 'bkc-gate-msg is-warn'; return; }
            msg.textContent = 'Đang xác thực…';
            global.BKCloud.adminLogin(value).then(function () {
                code.value = '';
                try { modal.close(); } catch (e) { }
                openDash();
            }).catch(function (err) {
                msg.textContent = err.message || 'Administrator Code không đúng.';
                msg.className = 'bkc-gate-msg is-error';
            });
        }
        code.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        setTimeout(function () { try { code.focus(); } catch (e) { } }, 60);
    }

    /* ------------------------------ Vỏ dashboard -------------------------- */
    function build() {
        ensureDashCss();
        if (S.root) return;
        var root = h('div', 'bkc-dash');
        root.id = 'bkDevDashboard';
        root.hidden = true;

        var shell = h('div', 'bkc-shell');

        /* Sidebar */
        var side = h('aside', 'bkc-side');
        side.setAttribute('aria-label', 'Điều hướng quản trị');

        var brand = h('div', 'bkc-brand');
        var mark = h('span', 'bkc-brand-mark');
        mark.appendChild(icon('fa-shield-halved'));
        brand.appendChild(mark);
        var brandText = h('div', 'bkc-brand-text');
        var brandNameEl = h('b', null, S.branding.adminDashboardName || defaultDashboardName());
        brandText.appendChild(brandNameEl);
        brandText.appendChild(h('span', null, 'Console v' + APP_VERSION));
        brand.appendChild(brandText);
        brand.appendChild(iconBtn('fa-xmark', 'Đóng điều hướng', function () { root.classList.remove('is-nav-open'); }, 'bkc-side-close'));
        side.appendChild(brand);
        S.brandNameEl = brandNameEl;

        var nav = h('nav', 'bkc-nav');
        nav.setAttribute('role', 'tablist');
        TABS.forEach(function (t) {
            var b = h('button', 'bkc-tab');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.setAttribute('data-tab', t[0]);
            b.setAttribute('aria-selected', 'false');
            b.appendChild(icon(t[2]));
            b.appendChild(h('span', 'bkc-tab-label', t[1]));
            if (t[0] === 'students' || t[0] === 'reports') {
                var badge = h('span', 'bkc-tab-badge');
                badge.hidden = true;
                b.appendChild(badge);
            }
            b.addEventListener('click', function () { switchTab(t[0]); });
            nav.appendChild(b);
        });
        side.appendChild(nav);

        var sideFoot = h('div', 'bkc-side-foot');
        if (global.BKAdminTheme) {
            var themeBtn = h('button', 'bkc-side-btn');
            themeBtn.type = 'button';
            themeBtn.setAttribute('data-bk-theme-toggle', '');
            themeBtn.appendChild(icon(global.BKAdminTheme.get() === 'dark' ? 'fa-sun' : 'fa-moon'));
            themeBtn.appendChild(h('span', null, 'Đổi giao diện'));
            global.BKAdminTheme.bind(themeBtn);
            sideFoot.appendChild(themeBtn);
        }
        sideFoot.appendChild(btn('Trợ giúp phím tắt', 'bkc-side-btn', openHelp, 'fa-keyboard'));
        sideFoot.appendChild(btn('Đăng xuất', 'bkc-side-btn is-danger', doLogout, 'fa-right-from-bracket'));
        var footNote = h('div', 'bkc-side-note');
        footNote.appendChild(h('span', null, 'Phiên quản trị có hạn'));
        sideFoot.appendChild(footNote);
        side.appendChild(sideFoot);

        shell.appendChild(side);

        var scrim = h('div', 'bkc-nav-scrim');
        scrim.addEventListener('click', function () { root.classList.remove('is-nav-open'); });
        shell.appendChild(scrim);

        /* Main */
        var main = h('div', 'bkc-main');
        var head = h('header', 'bkc-dash-head');

        var headLeft = h('div', 'bkc-dash-left');
        headLeft.appendChild(iconBtn('fa-bars', 'Mở điều hướng', function () { root.classList.add('is-nav-open'); }, 'bkc-nav-toggle'));
        var titles = h('div', 'bkc-dash-titles');
        var titleRow = h('div', 'bkc-dash-title-row');
        S.titleEl = h('span', 'bkc-dash-title', S.branding.adminDashboardName || defaultDashboardName());
        titleRow.appendChild(S.titleEl);
        var live = h('span', 'bkc-live-dot');
        live.title = 'Đang hoạt động';
        titleRow.appendChild(live);
        titles.appendChild(titleRow);
        S.headSub = h('span', 'bkc-dash-sub', TAB_SUBS.overview);
        titles.appendChild(S.headSub);
        headLeft.appendChild(titles);
        head.appendChild(headLeft);

        var tools = h('div', 'bkc-dash-tools');
        S.statusPill = pill('Đang kết nối…', 'warn');
        S.statusPill.classList.add('bkc-status-pill');
        tools.appendChild(S.statusPill);
        tools.appendChild(btn('Tìm nhanh', 'bkc-btn-ghost bkc-kbd-btn', openCmd, 'fa-magnifying-glass'));
        tools.appendChild(iconBtn('fa-rotate', 'Làm mới dữ liệu', function () { refreshTab(true); }, 'bkc-refresh'));
        if (global.BKAdminTheme) {
            var headTheme = h('button', 'bkc-icon-btn');
            headTheme.type = 'button';
            headTheme.setAttribute('data-bk-theme-toggle', '');
            headTheme.appendChild(icon(global.BKAdminTheme.get() === 'dark' ? 'fa-sun' : 'fa-moon'));
            global.BKAdminTheme.bind(headTheme);
            tools.appendChild(headTheme);
        }
        tools.appendChild(iconBtn('fa-xmark', 'Đóng bảng quản trị', closeDash));
        head.appendChild(tools);
        main.appendChild(head);

        S.body = h('div', 'bkc-dash-body');
        main.appendChild(S.body);
        shell.appendChild(main);
        root.appendChild(shell);
        (D.body || D.documentElement).appendChild(root);
        S.root = root;

        /* Bảo trì đổi ở tab/thiết bị khác → lịch sử tự làm mới khi đang mở. */
        global.addEventListener('bk:settings-changed', function () {
            if (S.tab === 'maintenance' && typeof S.maintenance.refresh === 'function') {
                try { S.maintenance.refresh(); } catch (e) { }
            }
        });

        try {
            if (global.localStorage.getItem('bkAdminCompact') === '1') root.classList.add('is-compact');
        } catch (e) { }

        checkStatus();
        loadBranding();
    }

    /* Tên hiển thị Dashboard do Founder chỉnh trong tab Cấu hình, lưu ở
       app_settings.public.branding. Không đổi đường dẫn /admin/. */
    function applyBranding(name) {
        var clean = brandingName(name);
        S.branding.adminDashboardName = clean;
        if (S.titleEl) S.titleEl.textContent = clean;
        if (S.brandNameEl) S.brandNameEl.textContent = clean;
        try {
            D.title = clean + ' — Bá Khí';
        } catch (e) { }
        return clean;
    }
    function loadBranding() {
        return api('settings.get').then(function (data) {
            var row = (data.settings || []).filter(function (x) { return x.key === 'public.branding'; })[0];
            var value = row && row.value && typeof row.value === 'object' ? row.value : {};
            applyBranding(value.adminDashboardName);
        }).catch(function () {
            /* Không có cấu hình branding vẫn dùng tên mặc định. */
            applyBranding(S.branding.adminDashboardName);
        });
    }

    function checkStatus() {
        return api('settings.status').then(function (data) {
            S.status = (data && data.status) || {};
            S.statusAt = Date.now();
            if (S.statusPill) {
                S.statusPill.textContent = 'Đã kết nối';
                S.statusPill.className = 'bkc-pill is-ok bkc-status-pill';
                S.statusPill.title = 'Supabase Edge Functions + RLS';
            }
            return S.status;
        }).catch(function (err) {
            if (err && err.handled) return null;
            if (S.statusPill) {
                S.statusPill.textContent = 'Mất kết nối';
                S.statusPill.className = 'bkc-pill is-off bkc-status-pill';
                S.statusPill.title = (err && err.message) || 'Không gọi được máy chủ';
            }
            return null;
        });
    }

    function openDash() {
        build();
        S.root.hidden = false;
        D.documentElement.classList.add('bkc-lock');
        switchTab(S.tab || 'overview');
        if (!S.escBound) {
            S.escBound = true;
            D.addEventListener('keydown', onDashKey);
        }
    }
    function closeDash() {
        stopReportRefresh();
        if (S.root) {
            S.root.hidden = true;
            S.root.classList.remove('is-nav-open');
        }
        closeCmd();
        D.documentElement.classList.remove('bkc-lock');
        if (typeof global.BK_ON_DASH_CLOSE === 'function') {
            try { global.BK_ON_DASH_CLOSE(); } catch (e) { }
        }
    }
    function doLogout() {
        if (global.BKCloud) global.BKCloud.adminLogout();
        stopReportRefresh();
        closeDash();
        if (typeof global.mountDevMenu === 'function') { try { global.mountDevMenu(); } catch (e) { } }
        toast('Đã đăng xuất Administrator Dashboard', 'info');
        try { global.dispatchEvent(new global.CustomEvent('bkadmin:logout')); } catch (e) { }
    }

    function onDashKey(e) {
        if (!S.root || S.root.hidden) return;
        if (e.key === 'Escape') {
            if (S.cmdOpen) { e.preventDefault(); closeCmd(); return; }
            if (D.querySelector('.bkc-modal, .bk-overlay')) return; /* overlay tự xử lý */
            if (S.root.classList.contains('is-nav-open')) {
                e.preventDefault();
                S.root.classList.remove('is-nav-open');
                return;
            }
            e.preventDefault();
            closeDash();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (S.cmdOpen) closeCmd(); else openCmd();
            return;
        }
        var tag = (e.target && e.target.tagName ? e.target.tagName : '').toLowerCase();
        var typing = /^(input|textarea|select)$/.test(tag) || (e.target && e.target.isContentEditable);
        if (typing) return;
        if (e.altKey && /^[1-9]$/.test(e.key)) {
            e.preventDefault();
            switchTab(TABS[Number(e.key) - 1][0]);
            return;
        }
        if (e.key === '?') { e.preventDefault(); openHelp(); }
    }

    function switchTab(tab) {
        S.tab = tab;
        stopReportRefresh();
        if (!S.root) return;
        Array.prototype.forEach.call(S.root.querySelectorAll('.bkc-tab'), function (b) {
            var on = b.getAttribute('data-tab') === tab;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        if (S.headSub) S.headSub.textContent = TAB_SUBS[tab] || '';
        S.root.classList.remove('is-nav-open');
        S.body.textContent = '';
        var pane = h('div', 'bkc-pane');
        S.body.appendChild(pane);
        ({
            overview: renderOverview,
            students: renderStudents,
            profiles: renderProfiles,
            badges: renderBadges,
            gamification: renderGamification,
            chat: renderChatAdmin,
            reports: renderReports,
            notifications: renderNotifications,
            whatsnew: renderWhatsNewAdmin,
            changelog: renderChangelog,
            logs: renderLogs,
            monitoring: renderMonitoring,
            permissions: renderPermissions,
            settings: renderSettings,
            maintenance: renderMaintenance,
            data: renderData,
            founder: renderFounder
        }[tab] || renderOverview)(pane);
        S.body.scrollTop = 0;
    }

    function refreshTab(showToast) {
        switchTab(S.tab || 'overview');
        checkStatus();
        if (showToast) toast('Đã làm mới dữ liệu', 'info');
    }

    function paintTabBadge(tab, n) {
        if (!S.root) return;
        var badge = S.root.querySelector('.bkc-tab[data-tab="' + tab + '"] .bkc-tab-badge');
        if (!badge) return;
        badge.hidden = !n;
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.title = n ? (n + ' mục cần chú ý') : '';
    }
    function paintNavBadge(n) { paintTabBadge('students', n); }
    function paintReportBadge(n) { paintTabBadge('reports', n); }

    /* -------------------------------- Overview ---------------------------- */
    function renderOverview(pane) {
        var hero = h('section', 'bkc-hero');
        var heroMain = h('div', 'bkc-hero-main');
        heroMain.appendChild(h('span', 'bkc-hero-eyebrow', greeting() + ' · ' + fmtDay(new Date().toISOString())));
        heroMain.appendChild(h('h2', 'bkc-hero-title', 'Trung tâm điều hành Bá Khí'));
        heroMain.appendChild(h('p', 'bkc-hero-sub',
            'Xuất bản thông báo và changelog tức thời, quản lý học sinh và theo dõi mọi thao tác quản trị.'));
        hero.appendChild(heroMain);
        var heroActions = h('div', 'bkc-hero-actions');
        heroActions.appendChild(btn('Tạo thông báo', 'bkc-btn-primary', function () {
            S.notif.editing = null; S.notif.draft = null; switchTab('notifications');
        }, 'fa-plus'));
        heroActions.appendChild(btn('Đăng changelog', 'bkc-btn-ghost', function () {
            S.cl.editing = null; S.cl.draft = null; S.cl.sections = []; S.cl.loadedFor = null; switchTab('changelog');
        }, 'fa-code-branch'));
        hero.appendChild(heroActions);
        pane.appendChild(hero);

        var statsHost = h('div');
        var grid = h('div', 'bkc-grid');
        statsHost.appendChild(grid);
        pane.appendChild(statsHost);

        var quick = card('Thao tác nhanh', null, 'Đi thẳng tới việc bạn cần làm');
        var quickGrid = h('div', 'bkc-quick');
        [
            ['fa-bullhorn', 'Thông báo mới', 'Soạn và push ngay', function () {
                S.notif.editing = null; S.notif.draft = null; switchTab('notifications');
            }],
            ['fa-user-plus', 'Import học sinh', 'Tải danh sách từ TXT', function () { switchTab('students'); }],
            ['fa-file-arrow-up', 'Changelog mới', 'Ghi lại bản cập nhật', function () {
                S.cl.editing = null; S.cl.draft = null; S.cl.sections = []; S.cl.loadedFor = null; switchTab('changelog');
            }],
            ['fa-clock-rotate-left', 'Nhật ký hoạt động', 'Xem thao tác gần đây', function () { switchTab('logs'); }]
        ].forEach(function (q) {
            var item = h('button', 'bkc-quick-item');
            item.type = 'button';
            var qi = h('span', 'bkc-quick-ic');
            qi.appendChild(icon(q[0]));
            item.appendChild(qi);
            var qt = h('span', 'bkc-quick-text');
            qt.appendChild(h('b', null, q[1]));
            qt.appendChild(h('span', null, q[2]));
            item.appendChild(qt);
            item.appendChild(icon('fa-arrow-right'));
            item.addEventListener('click', q[3]);
            quickGrid.appendChild(item);
        });
        quick.body.appendChild(quickGrid);
        pane.appendChild(quick.root);

        var reviewCard = h('div');
        pane.appendChild(reviewCard);

        var recent = card('Hoạt động gần đây', [btn('Xem tất cả', 'bkc-btn-ghost', function () { switchTab('logs'); })],
            '10 thao tác quản trị mới nhất');
        pane.appendChild(recent.root);

        var loadingBox = loading(pane, 'Đang tải tổng quan…');

        api('overview').then(function (data) {
            loadingBox.remove();
            grid.textContent = '';
            var c = data.counts || {};
            var review = data.needsReview || [];
            statCard(grid, 'Tổng học sinh', c.students, (c.studentsActive || 0) + ' đang hoạt động', 'fa-users', 'indigo');
            statCard(grid, 'Học sinh hoạt động', c.studentsActive, 'Được phép chọn tên', 'fa-user-check', 'green');
            statCard(grid, 'Cần phân biệt', review.length, review.length ? 'Trùng họ tên' : 'Không có hồ sơ trùng', 'fa-user-clock', review.length ? 'amber' : 'green');
            statCard(grid, 'Tổng thông báo', c.announcements, (c.announcementsPublished || 0) + ' đang hiển thị', 'fa-bullhorn', 'purple');
            statCard(grid, 'Đang hiển thị', c.announcementsPublished, 'Trên website', 'fa-eye', 'sky');
            statCard(grid, 'Changelog', c.changelog, 'Bản ghi lịch sử', 'fa-code-branch', 'slate');
            statCard(grid, 'Phiên bản mới nhất', data.latestVersion ? data.latestVersion.version : '—',
                data.latestVersion ? fmt(data.latestVersion.published_at || data.latestVersion.created_at) : 'Chưa có', 'fa-tag', 'indigo');
            statCard(grid, 'Cập nhật gần nhất',
                data.recentActivity && data.recentActivity[0] ? fmt(data.recentActivity[0].created_at) : '—',
                'Hoạt động quản trị', 'fa-clock', 'slate');

            paintNavBadge(review.length);
            if (S.statusPill) {
                S.statusPill.textContent = 'Đã kết nối';
                S.statusPill.className = 'bkc-pill is-ok bkc-status-pill';
            }

            reviewCard.textContent = '';
            if (review.length) {
                var warnCard = card('Hồ sơ cần phân biệt', [
                    btn('Mở danh sách', 'bkc-btn-ghost', function () {
                        S.students.reviewOnly = true;
                        S.students.status = 'all';
                        S.students.page = 1;
                        switchTab('students');
                    })
                ], 'Có ' + review.length + ' hồ sơ trùng họ tên cần bổ sung thông tin phân biệt.');
                warnCard.body.appendChild(alertBox(
                    'Có ' + review.length + ' hồ sơ trùng họ tên cần phân biệt. Hãy thêm ghi chú (lớp, STT…) để học sinh chọn đúng.', 'warn'));
                var list = h('div', 'bkc-review-list');
                review.forEach(function (st) {
                    var item = h('div', 'bkc-review-item');
                    var info = h('div', 'bkc-review-info');
                    info.appendChild(h('b', null, st.display_name));
                    info.appendChild(h('span', null, st.disambiguator || 'Chưa có thông tin phân biệt'));
                    item.appendChild(info);
                    item.appendChild(btn('Phân biệt', 'bkc-btn-primary bkc-btn-xs', function () {
                        openStudentEditor({ id: st.id, display_name: st.display_name, disambiguator: st.disambiguator || '' }, function () {
                            switchTab('overview');
                        });
                    }, 'fa-pen'));
                    list.appendChild(item);
                });
                warnCard.body.appendChild(list);
                reviewCard.appendChild(warnCard.root);
            }

            recent.body.textContent = '';
            if (!data.recentActivity || !data.recentActivity.length) {
                emptyState(recent.body, 'fa-clock-rotate-left', 'Chưa có hoạt động', 'Các thao tác quản trị sẽ xuất hiện tại đây.');
            } else {
                var act = h('div', 'bkc-activity');
                data.recentActivity.forEach(function (log) {
                    var item = h('div', 'bkc-activity-item');
                    item.appendChild(h('span', 'bkc-activity-dot'));
                    var main = h('div', 'bkc-activity-main');
                    main.appendChild(h('b', null, log.action));
                    if (log.target_type) main.appendChild(h('span', null, ' · ' + log.target_type));
                    if (log.target_id) main.appendChild(h('span', 'bkc-activity-id', ' · ' + log.target_id));
                    item.appendChild(main);
                    item.appendChild(h('span', 'bkc-activity-time', fmt(log.created_at)));
                    act.appendChild(item);
                });
                recent.body.appendChild(act);
            }
        }).catch(function (err) {
            if (!loadingBox.parentNode) return;
            loadingBox.remove();
            pane.appendChild(alertBox(err.message || 'Không tải được tổng quan.', 'error'));
        });
    }

    /* ------------------------------ Notifications ------------------------- */
    /* ------------------------------- Report --------------------------------
       Tab Report dùng CHUNG dữ liệu public.reports với Administrator và
       Founder Dashboard. Máy chủ kiểm tra quyền cho từng action reports.*
       --------------------------------------------------------------------- */
    var REPORT_STATUSES = [
        ['new', 'Mới'], ['pending', 'Chờ xử lý'], ['in_progress', 'Đang xử lý'],
        ['waiting_student', 'Chờ học sinh'], ['resolved', 'Đã giải quyết'], ['closed', 'Đã đóng']
    ];
    var REPORT_CATEGORIES = [
        ['bug', 'Lỗi kỹ thuật'], ['ui', 'Giao diện'], ['content', 'Nội dung'],
        ['answer', 'Đáp án / Giải thích'], ['account', 'Tài khoản'],
        ['performance', 'Hiệu năng'], ['feature', 'Đề xuất'], ['data', 'Dữ liệu'], ['other', 'Khác']
    ];
    var REPORT_PRIORITIES = [['low', 'Thấp'], ['normal', 'Bình thường'], ['high', 'Cao'], ['critical', 'Khẩn']];
    function reportStatusLabel(value) { return labelOf(REPORT_STATUSES, value); }
    function reportCategoryLabel(value) { return labelOf(REPORT_CATEGORIES, value); }
    function reportPriorityLabel(value) { return labelOf(REPORT_PRIORITIES, value); }
    function reportStatusTone(value) {
        if (value === 'resolved') return 'ok';
        if (value === 'closed') return 'muted';
        if (value === 'new' || value === 'in_progress') return 'info';
        return 'warn';
    }

    function askText(opts) {
        var body = h('div');
        if (opts.text) body.appendChild(h('p', 'bkc-hint', opts.text));
        var ta = h('textarea', 'bkc-input');
        ta.rows = 4;
        ta.maxLength = opts.max || 2000;
        ta.placeholder = opts.placeholder || '';
        if (opts.value) ta.value = opts.value;
        body.appendChild(ta);
        var msg = h('div', 'bkc-hint');
        body.appendChild(msg);
        if (global.BK && global.BK.ui && global.BK.ui.modal) {
            global.BK.ui.modal({
                title: opts.title,
                body: body,
                actions: [
                    { label: 'Huỷ', variant: 'ghost', onClick: function (c) { c(); } },
                    {
                        label: opts.okLabel || 'Xác nhận', variant: 'primary', onClick: function (c) {
                            var v = String(ta.value || '').trim();
                            if (opts.min && v.length < opts.min) {
                                msg.textContent = 'Cần ít nhất ' + opts.min + ' ký tự.';
                                msg.classList.add('bkc-alert');
                                return;
                            }
                            c();
                            opts.onSubmit(v);
                        }
                    }
                ]
            });
            setTimeout(function () { try { ta.focus(); } catch (e) { } }, 40);
            return;
        }
        var v = global.prompt ? global.prompt(opts.title, '') : null;
        if (v != null && String(v).trim()) opts.onSubmit(String(v).trim());
    }

    function renderReports(pane) {
        var R = S.reports;
        stopReportRefresh();
        if (R.activeId) return renderReportDetail(pane, R.activeId);

        var statsHost = h('div');
        var statsGrid = h('div', 'bkc-grid');
        statsHost.appendChild(statsGrid);
        pane.appendChild(statsHost);

        var toolbar = card('Báo cáo của học sinh', [
            btn('Làm mới', 'bkc-btn-ghost bkc-btn-sm', function () {
                loadReportStats(statsGrid);
                loadReportList();
            }, 'fa-rotate'),
            btn('Xuất CSV', 'bkc-btn-ghost bkc-btn-sm', function () {
                exportReports();
            }, 'fa-file-csv')
        ], 'Tìm kiếm, lọc và mở từng báo cáo để trao đổi riêng với người gửi');
        pane.appendChild(toolbar.root);

        var filters = h('div', 'bkc-actions bkc-filters');
        var search = input('search', 'Tìm mã, tiêu đề, nội dung…', R.q);
        search.addEventListener('input', function () {
            R.q = search.value;
            clearTimeout(R.searchTimer);
            R.searchTimer = setTimeout(function () { R.page = 1; loadReportList(); }, 350);
        });
        filters.appendChild(search);
        filters.appendChild(selectBox(REPORT_STATUSES, R.status, function (v) {
            R.status = v; R.page = 1; loadReportList();
        }));
        filters.appendChild(selectBox([['all', 'Mọi nhóm']].concat(REPORT_CATEGORIES), R.category, function (v) {
            R.category = v; R.page = 1; loadReportList();
        }));
        filters.appendChild(selectBox([['all', 'Mọi ưu tiên']].concat(REPORT_PRIORITIES), R.priority, function (v) {
            R.priority = v; R.page = 1; loadReportList();
        }));
        var unreadBtn = btn('Chưa đọc', 'bkc-btn-ghost bkc-btn-sm', function () {
            R.unread = !R.unread;
            unreadBtn.classList.toggle('is-active', R.unread);
            unreadBtn.setAttribute('aria-pressed', R.unread ? 'true' : 'false');
            R.page = 1;
            loadReportList();
        }, 'fa-envelope');
        unreadBtn.setAttribute('aria-pressed', 'false');
        filters.appendChild(unreadBtn);
        var from = input('date', '', R.from);
        from.type = 'date';
        from.title = 'Từ ngày';
        from.addEventListener('change', function () { R.from = from.value; R.page = 1; loadReportList(); });
        filters.appendChild(from);
        var to = input('date', '', R.to);
        to.type = 'date';
        to.title = 'Đến ngày';
        to.addEventListener('change', function () { R.to = to.value; R.page = 1; loadReportList(); });
        filters.appendChild(to);
        var clearBtn = btn('Xoá lọc', 'bkc-btn-ghost bkc-btn-sm', function () {
            R.q = ''; R.status = 'all'; R.category = 'all'; R.priority = 'all';
            R.unread = false; R.from = ''; R.to = ''; R.page = 1;
            switchTab('reports');
        }, 'fa-filter-circle-xmark');
        filters.appendChild(clearBtn);
        toolbar.body.appendChild(filters);

        var listCard = card('Danh sách báo cáo', null, null);
        toolbar.body.appendChild(listCard.root);
        R.listHost = listCard.body;
        R.pagerHost = h('div', 'bkc-pager');

        loadReportStats(statsGrid);
        loadReportList();
        startReportRefresh(statsGrid);
    }

    /* Tự làm mới khi đang mở tab Report: người dùng thấy báo cáo mới mà không
       phải bấm Làm mới. Chỉ chạy khi tab còn mở, dừng khi đổi tab/đóng dashboard. */
    var reportTimer = null;
    function startReportRefresh(statsGrid) {
        stopReportRefresh();
        reportTimer = global.setInterval(function () {
            if (S.tab !== 'reports' || !S.root || S.root.hidden) return stopReportRefresh();
            if (S.reports.activeId) return;
            loadReportStats(statsGrid);
            if (!S.reports.loading) loadReportList();
        }, 45000);
    }
    function stopReportRefresh() {
        if (reportTimer) { global.clearInterval(reportTimer); reportTimer = null; }
    }

    function exportReports() {
        var R = S.reports;
        toast('Đang tạo tệp CSV từ máy chủ…', 'info');
        api('reports.export', {
            q: R.q, status: R.status, category: R.category, priority: R.priority,
            unread: R.unread, from: R.from ? R.from + 'T00:00:00' : '',
            to: R.to ? R.to + 'T23:59:59' : ''
        }).then(function (data) {
            if (!data || !data.csv) throw new Error('Máy chủ không trả về dữ liệu CSV.');
            download(data.filename || ('bakhi-reports-' + Date.now() + '.csv'),
                '\ufeff' + data.csv, 'text/csv;charset=utf-8');
            toast('Đã xuất ' + (data.rows || 0) + ' báo cáo', 'success');
        }).catch(function (err) { fail(err); });
    }

    function loadReportStats(host) {
        host.textContent = '';
        statCard(host, 'Tổng báo cáo', '…', 'Đang tải', 'fa-flag');
        api('reports.stats', {}).then(function (data) {
            var s = data.stats || {};
            host.textContent = '';
            statCard(host, 'Tổng báo cáo', s.total || 0, 'Toàn bộ thời gian', 'fa-flag');
            statCard(host, 'Mới', s.new || 0, 'Chưa tiếp nhận', 'fa-inbox', 'info');
            statCard(host, 'Đang xử lý', s.in_progress || 0, 'Có người phụ trách', 'fa-spinner', 'info');
            statCard(host, 'Chờ học sinh', s.waiting_student || 0, 'Cần bổ sung thông tin', 'fa-hourglass-half', 'warn');
            statCard(host, 'Đã giải quyết', s.resolved || 0, 'Đã hoàn thiện', 'fa-circle-check', 'ok');
            statCard(host, 'Cần chú ý', s.attention || 0, 'Ưu tiên cao / khẩn', 'fa-triangle-exclamation', 'warn');
            statCard(host, 'Chưa đọc', s.unread || 0, 'Hội thoại có tin mới', 'fa-envelope-open-text', 'info');
            S.reports.stats = s;
            paintReportBadge(Number(s.unread || 0) + Number(s.new || 0));
        }).catch(function (err) {
            host.textContent = '';
            host.appendChild(alertBox((err && err.message) || 'Không tải được thống kê báo cáo.', 'error'));
        });
    }

    function loadReportList() {
        var R = S.reports;
        if (!R.listHost) return;
        R.loading = true;
        R.listHost.textContent = '';
        loading(R.listHost, 'Đang tải báo cáo…');
        api('reports.list', {
            page: R.page, page_size: R.pageSize, q: R.q,
            status: R.status, category: R.category, priority: R.priority,
            unread: R.unread, from: R.from ? R.from + 'T00:00:00' : '',
            to: R.to ? R.to + 'T23:59:59' : ''
        }).then(function (data) {
            R.loading = false;
            R.list = data.reports || [];
            R.total = data.total || 0;
            R.pageSize = data.pageSize || R.pageSize;
            R.listHost.textContent = '';
            var t = table(['Mã', 'Tiêu đề', 'Học sinh', 'Nhóm', 'Ưu tiên', 'Trạng thái', 'Cập nhật', '']);
            if (!R.list.length) {
                emptyRow(t.tbody, 8, 'Chưa có báo cáo phù hợp với bộ lọc.');
            }
            R.list.forEach(function (row) {
                var tr = h('tr');
                if (row.staff_unread > 0) tr.className = 'is-unread';
                tr.appendChild(h('td', null, row.code));
                var titleTd = h('td');
                titleTd.appendChild(h('b', null, row.title));
                if (row.staff_unread > 0) titleTd.appendChild(h('span', 'bkc-pill is-info', 'Mới'));
                tr.appendChild(titleTd);
                tr.appendChild(h('td', null, row.student_name || 'Học sinh'));
                tr.appendChild(h('td', null, reportCategoryLabel(row.category)));
                tr.appendChild(h('td', null, reportPriorityLabel(row.priority)));
                var statusTd = h('td');
                statusTd.appendChild(pill(reportStatusLabel(row.status), reportStatusTone(row.status)));
                tr.appendChild(statusTd);
                tr.appendChild(h('td', null, fmt(row.updated_at)));
                var actTd = h('td');
                actTd.appendChild(btn('Mở', 'bkc-btn-ghost bkc-btn-xs', function () {
                    R.activeId = row.id;
                    switchTab('reports');
                }, 'fa-arrow-up-right-from-square'));
                tr.appendChild(actTd);
                t.tbody.appendChild(tr);
            });
            R.listHost.appendChild(t.wrap);
            /* renderPager tự xoá host của nó — phải dùng một host riêng, nếu
               không toàn bộ bảng vừa dựng sẽ bị xoá ngay (lỗi 8.0.1: tab Report
               chỉ còn phần phân trang, không hiện dòng nào). */
            var pagerHost = h('div', 'bkc-pager-host');
            R.listHost.appendChild(pagerHost);
            renderPager(pagerHost, {
                total: R.total, page: R.page, pageSize: R.pageSize, unit: 'báo cáo',
                onPage: function (p) { R.page = p; loadReportList(); },
                onSize: function (n) { R.pageSize = n; R.page = 1; loadReportList(); }
            });
        }).catch(function (err) {
            R.loading = false;
            R.listHost.textContent = '';
            R.listHost.appendChild(alertBox((err && err.message) || 'Không tải được danh sách báo cáo.', 'error'));
        });
    }

    function renderReportDetail(pane, id) {
        var R = S.reports;
        var back = btn('Quay lại danh sách', 'bkc-btn-ghost bkc-btn-sm', function () {
            R.activeId = null;
            R.detail = null;
            switchTab('reports');
        }, 'fa-arrow-left');
        pane.appendChild(back);
        var host = h('div');
        pane.appendChild(host);
        loading(host, 'Đang mở báo cáo…');
        api('reports.detail', { report_id: id }).then(function (data) {
            R.detail = data;
            host.textContent = '';
            paintReportDetail(host, data);
        }).catch(function (err) {
            host.textContent = '';
            host.appendChild(alertBox((err && err.message) || 'Không mở được báo cáo.', 'error'));
        });
    }

    function paintReportDetail(host, data) {
        var r = data.report;
        var info = card(r.code + ' · ' + r.title, [
            pill(reportStatusLabel(r.status), reportStatusTone(r.status))
        ], (data.student ? data.student.display_name : 'Học sinh') +
            (data.student && data.student.student_code ? ' · ' + data.student.student_code : '') +
            ' · ' + fmt(r.created_at));
        host.appendChild(info.root);

        var grid = h('div', 'bkc-kv');
        [['Nhóm', reportCategoryLabel(r.category)],
        ['Loại', r.issue_type],
        ['Ưu tiên', reportPriorityLabel(r.priority)],
        ['Trang', r.page_title || r.page_url || '—'],
        ['Đường dẫn', r.page_url || '—'],
        ['Người xử lý', r.assigned_to || '—'],
        ['Cập nhật cuối', fmt(r.updated_at)]].forEach(function (pair) {
            var row = h('div', 'bkc-kv-row');
            row.appendChild(h('span', 'bkc-kv-key', pair[0]));
            row.appendChild(h('span', 'bkc-kv-val', pair[1]));
            grid.appendChild(row);
        });
        info.body.appendChild(grid);
        info.body.appendChild(h('p', 'bkc-report-desc', r.description));

        if (data.attachments && data.attachments.length) {
            var files = h('div', 'bkc-actions');
            data.attachments.forEach(function (f) {
                var a = h('a', 'bkc-btn bkc-btn-ghost bkc-btn-xs', f.name || 'Tệp');
                a.href = f.url || '#';
                a.target = '_blank';
                a.rel = 'noopener';
                files.appendChild(a);
            });
            info.body.appendChild(files);
        }
        if (r.context_data && Object.keys(r.context_data).length) {
            info.body.appendChild(h('p', 'bkc-hint',
                'Ngữ cảnh: ' + Object.keys(r.context_data).map(function (k) {
                    return k + '=' + String(r.context_data[k] || '');
                }).filter(function (x) { return !/=$/.test(x); }).join(' · ')));
        }

        /* --------------------------- Khu vực xử lý --------------------------- */
        var actions = card('Xử lý báo cáo', null, 'Mọi thay đổi được ghi vào nhật ký và tạo thông báo riêng cho người gửi');
        host.appendChild(actions.root);
        var bar = h('div', 'bkc-actions');
        bar.appendChild(selectBox(REPORT_STATUSES, r.status, function (v) {
            if (v === r.status) return;
            api('reports.status', { report_id: r.id, status: v }).then(function () {
                toast('Đã chuyển trạng thái báo cáo', 'success');
                reloadReportDetail();
            }).catch(function (err) { fail(err); });
        }));
        bar.appendChild(btn('Complete Report', 'bkc-btn-primary bkc-btn-sm', function () {
            askText({
                title: 'Hoàn thiện báo cáo ' + r.code,
                text: 'Nhập ghi chú kết quả xử lý. Học sinh sẽ nhận thông báo riêng và thấy nội dung này trong Q&A.',
                placeholder: 'Ví dụ: Đã sửa lại đáp án câu 5 và cập nhật giải thích.',
                min: 3, max: 2000, okLabel: 'Hoàn thiện',
                onSubmit: function (note) {
                    api('reports.complete', { report_id: r.id, resolution_note: note }).then(function () {
                        toast('Báo cáo đã hoàn thiện và đã gửi thông báo cho học sinh', 'success');
                        reloadReportDetail();
                    }).catch(function (err) { fail(err); });
                }
            });
        }, 'fa-circle-check'));
        bar.appendChild(selectBox([['', 'Chưa gán người xử lý'], ['admin', 'Administrator'],
            ['founder', 'Founder']], r.assigned_to || '', function (v) {
            api('reports.assign', { report_id: r.id, assigned_to: v }).then(function () {
                toast(v ? ('Đã gán cho ' + (v === 'founder' ? 'Founder' : 'Administrator')) : 'Đã bỏ gán người xử lý', 'success');
                reloadReportDetail();
            }).catch(function (err) { fail(err); });
        }));
        bar.appendChild(btn('Gửi tin nhắn riêng', 'bkc-btn-ghost bkc-btn-sm', function () {
            askText({
                title: 'Gửi tin nhắn riêng cho người báo cáo',
                text: 'Chỉ học sinh đã tạo báo cáo ' + r.code + ' nhận được thông báo này.',
                placeholder: 'Nội dung tin nhắn…',
                min: 1, max: 2000, okLabel: 'Gửi',
                onSubmit: function (text) {
                    api('reports.privateMessage', { report_id: r.id, body: text }).then(function () {
                        toast('Đã gửi tin nhắn riêng', 'success');
                        reloadReportDetail();
                    }).catch(function (err) { fail(err); });
                }
            });
        }, 'fa-paper-plane'));
        if (['resolved', 'closed'].indexOf(r.status) >= 0) {
            bar.appendChild(btn('Mở lại', 'bkc-btn-ghost bkc-btn-sm', function () {
                askText({
                    title: 'Mở lại báo cáo ' + r.code,
                    text: 'Nhập lý do mở lại — lý do được lưu vào nhật ký.',
                    min: 3, max: 500, okLabel: 'Mở lại',
                    onSubmit: function (reason) {
                        api('reports.reopen', { report_id: r.id, reason: reason }).then(function () {
                            toast('Đã mở lại báo cáo', 'success');
                            reloadReportDetail();
                        }).catch(function (err) { fail(err); });
                    }
                });
            }, 'fa-rotate-left'));
        }
        actions.body.appendChild(bar);
        if (r.resolution_note) {
            actions.body.appendChild(alertBox('Kết quả xử lý: ' + r.resolution_note, 'ok'));
        }

        /* ------------------------------ Hội thoại --------------------------- */
        var conv = card('Q&A của báo cáo', null, 'Tin nhắn của học sinh và ban quản trị, theo thứ tự thời gian');
        host.appendChild(conv.root);
        var thread = h('div', 'bkc-rep-thread');
        if (!(data.messages || []).length) {
            thread.appendChild(h('p', 'bkc-hint', 'Chưa có tin nhắn nào ngoài nội dung báo cáo.'));
        }
        (data.messages || []).forEach(function (m) {
            var mine = m.sender_kind === 'staff';
            var box = h('div', 'bkc-rep-msg' + (mine ? ' is-staff' : ' is-student'));
            var head = h('div', 'bkc-rep-msg-head');
            head.appendChild(h('b', null, mine ? (m.sender_label || 'Ban quản trị') : 'Học sinh'));
            if (m.is_private) head.appendChild(h('span', 'bkc-pill is-warn', 'Tin nhắn riêng'));
            head.appendChild(h('span', 'bkc-hint', fmt(m.created_at)));
            if (mine && m.read_by_student_at) head.appendChild(h('span', 'bkc-pill is-ok', 'Đã đọc'));
            box.appendChild(head);
            box.appendChild(h('p', 'bkc-rep-msg-body', m.body));
            if (m.attachment_urls && m.attachment_urls.length) {
                var fl = h('div', 'bkc-actions');
                m.attachment_urls.forEach(function (f) {
                    var a = h('a', 'bkc-btn bkc-btn-ghost bkc-btn-xs', f.name || 'Tệp');
                    a.href = f.url || '#';
                    a.target = '_blank';
                    a.rel = 'noopener';
                    fl.appendChild(a);
                });
                box.appendChild(fl);
            }
            thread.appendChild(box);
        });
        conv.body.appendChild(thread);

        var form = h('form', 'bkc-rep-reply');
        form.noValidate = true;
        var ta = h('textarea', 'bkc-input');
        ta.rows = 3;
        ta.maxLength = 4000;
        ta.placeholder = r.status === 'closed'
            ? 'Báo cáo đã đóng — hãy mở lại trước khi trả lời.'
            : 'Trả lời học sinh…';
        ta.disabled = r.status === 'closed';
        form.appendChild(ta);
        var send = btn('Gửi trả lời', 'bkc-btn-primary bkc-btn-sm', null, 'fa-reply');
        send.type = 'submit';
        send.disabled = r.status === 'closed';
        var foot = h('div', 'bkc-actions');
        foot.appendChild(send);
        form.appendChild(foot);
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var text = String(ta.value || '').trim();
            if (!text) { toast('Nội dung trả lời đang trống.', 'error'); return; }
            send.disabled = true;
            api('reports.reply', { report_id: r.id, body: text }).then(function () {
                toast('Đã gửi phản hồi và thông báo cho học sinh', 'success');
                reloadReportDetail();
            }).catch(function (err) {
                send.disabled = false;
                fail(err);
            });
        });
        conv.body.appendChild(form);

        /* --------------------------- Nhật ký xử lý --------------------------- */
        if ((data.activity || []).length) {
            var logs = card('Lịch sử xử lý', null, 'Ai làm gì, khi nào');
            host.appendChild(logs.root);
            var lt = table(['Thời gian', 'Người thực hiện', 'Hành động', 'Từ', 'Đến']);
            data.activity.forEach(function (row) {
                var tr = h('tr');
                tr.appendChild(h('td', null, fmt(row.created_at)));
                tr.appendChild(h('td', null, row.actor_label || row.actor_kind));
                tr.appendChild(h('td', null, row.action));
                tr.appendChild(h('td', null, row.old_value || '—'));
                tr.appendChild(h('td', null, row.new_value || '—'));
                lt.tbody.appendChild(tr);
            });
            logs.body.appendChild(lt.wrap);
        }
    }

    function reloadReportDetail() {
        if (S.tab !== 'reports' || !S.reports.activeId) return;
        switchTab('reports');
    }

    function renderNotifications(pane) {
        var seed = S.notif.editing || S.notif.draft || {};
        var editing = !!S.notif.editing;

        var statsHost = h('div');
        pane.appendChild(statsHost);
        loadStats();

        var layout = h('div', 'bkc-split');
        pane.appendChild(layout);

        var formCard = card(editing ? 'Chỉnh sửa thông báo' : 'Tạo thông báo',
            editing ? [btn('Tạo mới', 'bkc-btn-ghost', function () {
                S.notif.editing = null; S.notif.draft = null; switchTab('notifications');
            }, 'fa-plus')] : null,
            'Nội dung hiển thị ngay trên website sau khi xuất bản.');
        layout.appendChild(formCard.root);

        var f = h('div', 'bkc-form');
        var title = input('text', 'Tiêu đề thông báo', seed.title || '');
        title.maxLength = 160;
        var titleRow = h('div', 'bkc-label-row');
        titleRow.appendChild(h('label', 'bkc-label', 'Tiêu đề'));
        titleRow.appendChild(counter(title, 160));
        f.appendChild(titleRow);
        f.appendChild(title);

        var content = textarea('Nội dung thông báo…', seed.content || '', 7);
        content.maxLength = 20000;
        var contentRow = h('div', 'bkc-label-row');
        contentRow.appendChild(h('label', 'bkc-label', 'Nội dung'));
        contentRow.appendChild(counter(content, 20000));
        f.appendChild(contentRow);
        f.appendChild(content);

        var type = selectBox(TYPES, seed.type || 'general');
        var priority = selectBox(PRIORITIES, seed.priority || 'normal');
        var status = selectBox([['draft', 'Draft — chưa hiển thị'], ['published', 'Published — hiển thị ngay']],
            editing && S.notif.editing.is_published ? 'published' : (seed.is_published ? 'published' : 'draft'));
        var grid = h('div', 'bkc-form-grid');
        grid.appendChild(fieldRow('Loại thông báo', type));
        grid.appendChild(fieldRow('Mức độ ưu tiên', priority));
        grid.appendChild(fieldRow('Trạng thái xuất bản', status));
        f.appendChild(grid);

        var previewHost = h('div', 'bkc-live-preview');
        f.appendChild(h('span', 'bkc-label', 'Xem trước trực tiếp'));
        f.appendChild(previewHost);

        function paintPreview() {
            renderNotificationPreview(previewHost, {
                title: title.value.trim() || 'Tiêu đề thông báo…',
                content: content.value.trim() || 'Nội dung thông báo sẽ hiển thị tại đây khi bạn nhập.',
                type: type.value,
                priority: priority.value,
                published_at: status.value === 'published' ? new Date().toISOString() : null
            });
        }
        title.addEventListener('input', paintPreview);
        content.addEventListener('input', paintPreview);
        type.addEventListener('change', paintPreview);
        priority.addEventListener('change', paintPreview);
        status.addEventListener('change', paintPreview);
        paintPreview();

        var actions = h('div', 'bkc-actions');
        actions.appendChild(btn('PUSH NOTIFICATION NOW', 'bkc-btn-push', function () {
            var payload = readNotifForm();
            if (!payload) return;
            payload.is_published = true;
            previewNotification(payload, function () { saveNotification(payload); });
        }, 'fa-paper-plane'));
        actions.appendChild(btn(editing ? 'Lưu thay đổi' : 'Lưu', 'bkc-btn-primary', function () {
            var payload = readNotifForm();
            if (!payload) return;
            payload.is_published = status.value === 'published';
            saveNotification(payload);
        }, 'fa-floppy-disk'));
        if (editing) {
            actions.appendChild(btn('Huỷ sửa', 'bkc-btn-ghost', function () {
                S.notif.editing = null;
                S.notif.draft = null;
                switchTab('notifications');
            }, 'fa-xmark'));
        }
        f.appendChild(actions);
        formCard.body.appendChild(f);

        function readNotifForm() {
            var t = title.value.trim();
            var c = content.value.trim();
            if (!t) { toast('Cần nhập tiêu đề thông báo.', 'error'); title.focus(); return null; }
            if (!c) { toast('Cần nhập nội dung thông báo.', 'error'); content.focus(); return null; }
            return {
                title: t, content: c, type: type.value, priority: priority.value,
                id: S.notif.editing ? S.notif.editing.id : undefined
            };
        }

        /* Danh sách */
        var listCard = card('Quản lý thông báo', [
            btn('Xuất JSON', 'bkc-btn-ghost', function () {
                downloadJson('bakhi-announcements-' + Date.now() + '.json', S.notif.list);
            }, 'fa-download'),
            iconBtn('fa-rotate', 'Làm mới danh sách', function () { loadNotifList(); })
        ], 'Tìm kiếm, xem trước, ẩn hoặc nhân bản thông báo.');
        layout.appendChild(listCard.root);

        var filters = h('div', 'bkc-filters');
        var search = input('search', 'Tìm theo tiêu đề…', S.notif.q || '');
        search.className = 'bkc-input bkc-grow';
        var fType = selectBox([['', 'Tất cả loại']].concat(TYPES), S.notif.filterType || '');
        var fStatus = selectBox([['', 'Tất cả trạng thái'], ['published', 'Đã xuất bản'], ['draft', 'Nháp']],
            S.notif.filterStatus || '');
        filters.appendChild(search);
        filters.appendChild(fType);
        filters.appendChild(fStatus);
        filters.appendChild(btn('Tìm', '', function () {
            S.notif.q = search.value.trim();
            S.notif.filterType = fType.value;
            S.notif.filterStatus = fStatus.value;
            S.notif.page = 1;
            loadNotifList();
        }, 'fa-magnifying-glass'));
        listCard.body.appendChild(filters);
        var listHost = h('div');
        listCard.body.appendChild(listHost);
        var pageHost = h('div', 'bkc-pager');
        listCard.body.appendChild(pageHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                S.notif.q = search.value.trim();
                S.notif.page = 1;
                loadNotifList();
            }
        });
        fType.addEventListener('change', function () {
            S.notif.filterType = fType.value;
            S.notif.page = 1;
            loadNotifList();
        });
        fStatus.addEventListener('change', function () {
            S.notif.filterStatus = fStatus.value;
            S.notif.page = 1;
            loadNotifList();
        });

        function loadStats() {
            statsHost.textContent = '';
            loading(statsHost, 'Đang tải số liệu thông báo…');
            api('announcements.stats').then(function (data) {
                statsHost.textContent = '';
                var st = data.stats || {};
                var grid = h('div', 'bkc-grid');
                statCard(grid, 'Tổng thông báo', st.total, 'Tất cả bản ghi', 'fa-bullhorn', 'purple');
                statCard(grid, 'Đang hiển thị', st.published, 'Học sinh có thể xem', 'fa-eye', 'green');
                statCard(grid, 'Bản nháp', st.draft, 'Chưa xuất bản', 'fa-pen-to-square', 'amber');
                statCard(grid, 'Lượt đã đọc', st.reads, 'Ghi nhận trên máy chủ', 'fa-envelope-open', 'sky');
                statCard(grid, 'Liên kết changelog', st.linkedToChangelog, 'Thông báo theo phiên bản', 'fa-code-branch', 'indigo');
                statsHost.appendChild(grid);
                var types = st.byType || {};
                var keys = Object.keys(types);
                if (keys.length) {
                    var summary = h('div', 'bkc-summary-row');
                    keys.forEach(function (key) {
                        summary.appendChild(pill(labelOf(TYPES, key) + ': ' + types[key]));
                    });
                    statsHost.appendChild(summary);
                }
            }).catch(function (err) {
                statsHost.textContent = '';
                statsHost.appendChild(alertBox(err.message || 'Không tải được số liệu thông báo.', 'error'));
            });
        }

        function loadNotifList() {
            listHost.textContent = '';
            loading(listHost, 'Đang tải thông báo…');
            pageHost.textContent = '';
            var offset = (Math.max(1, S.notif.page) - 1) * S.notif.pageSize;
            api('announcements.list', {
                q: S.notif.q || '', type: S.notif.filterType || undefined,
                status: S.notif.filterStatus || undefined,
                limit: S.notif.pageSize, offset: offset
            }).then(function (data) {
                listHost.textContent = '';
                S.notif.list = data.announcements || [];
                S.notif.total = data.total || S.notif.list.length;
                var pages = Math.max(1, Math.ceil(S.notif.total / S.notif.pageSize));
                if (S.notif.page > pages) {
                    S.notif.page = pages;
                    loadNotifList();
                    return;
                }
                if (!S.notif.list.length) {
                    emptyState(listHost, 'fa-bullhorn', 'Chưa có thông báo',
                        'Tạo thông báo đầu tiên ở phía trên — nội dung sẽ hiển thị ngay sau khi xuất bản.');
                } else {
                    var t = table(['Tiêu đề', 'Loại', 'Ưu tiên', 'Trạng thái', 'Phiên bản', 'Xuất bản', 'Thao tác']);
                    S.notif.list.forEach(function (a) {
                        var tr = h('tr');
                        var titleCell = h('td');
                        titleCell.appendChild(h('b', null, a.title));
                        titleCell.appendChild(h('span', 'bkc-row-sub', clip(a.content, 80)));
                        tr.appendChild(titleCell);
                        tr.appendChild(h('td', null, labelOf(TYPES, a.type)));
                        var pCell = h('td');
                        pCell.appendChild(pill(labelOf(PRIORITIES, a.priority),
                            a.priority === 'critical' ? 'off' : a.priority === 'high' ? 'warn' : null));
                        tr.appendChild(pCell);
                        var stCell = h('td');
                        stCell.appendChild(pill(a.is_published ? 'Published' : 'Draft', a.is_published ? 'ok' : 'warn'));
                        tr.appendChild(stCell);
                        var linkedCell = h('td');
                        linkedCell.appendChild(a.changelog_version
                            ? pill('v' + a.changelog_version, 'ok') : pill('—'));
                        tr.appendChild(linkedCell);
                        tr.appendChild(h('td', null, fmt(a.published_at)));
                        var acts = h('td');
                        var row = h('div', 'bkc-row-actions');
                        row.appendChild(btn('Xem', '', function () { previewNotification(a, null); }));
                        row.appendChild(btn('Sửa', '', function () {
                            S.notif.editing = a;
                            S.notif.draft = null;
                            switchTab('notifications');
                        }));
                        if (a.is_published) {
                            row.appendChild(btn('Ẩn', '', function () {
                                mutate('announcements.unpublish', { id: a.id }, 'Đã ẩn thông báo');
                            }));
                        } else {
                            row.appendChild(btn('Đăng', '', function () {
                                mutate('announcements.publish', { id: a.id }, 'Đã đăng thông báo');
                            }));
                        }
                        row.appendChild(btn('Nhân bản', '', function () {
                            S.notif.editing = null;
                            S.notif.draft = {
                                title: a.title + ' (bản sao)',
                                content: a.content,
                                type: a.type,
                                priority: a.priority,
                                is_published: false
                            };
                            switchTab('notifications');
                        }));
                        row.appendChild(btn('Xoá', 'is-danger', function () {
                            confirmDelete('thông báo', a.title, function () {
                                mutate('announcements.delete', { id: a.id }, 'Đã xoá thông báo');
                            });
                        }));
                        acts.appendChild(row);
                        tr.appendChild(acts);
                        t.tbody.appendChild(tr);
                    });
                    listHost.appendChild(t.wrap);
                }
                renderPager(pageHost, {
                    total: S.notif.total, page: S.notif.page, pageSize: S.notif.pageSize,
                    unit: 'thông báo',
                    onPage: function (p) { S.notif.page = p; loadNotifList(); },
                    onSize: function (n) { S.notif.pageSize = n; S.notif.page = 1; loadNotifList(); }
                });
            }).catch(function (err) {
                listHost.textContent = '';
                listHost.appendChild(alertBox(err.message || 'Không tải được danh sách.', 'error'));
            });
        }

        function mutate(action, payload, okMessage) {
            api(action, payload).then(function () {
                toast(okMessage, 'success');
                loadStats();
                loadNotifList();
            }).catch(function (err) { fail(err); });
        }

        function saveNotification(payload) {
            api('announcements.save', payload).then(function () {
                toast(payload.is_published
                    ? 'Đã xuất bản thông báo — hiển thị ngay trên website'
                    : 'Đã lưu nháp thông báo', 'success');
                S.notif.editing = null;
                S.notif.draft = null;
                switchTab('notifications');
            }).catch(function (err) { fail(err); });
        }

        loadNotifList();
    }

    function clip(text, max) {
        var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    }

    function renderNotificationPreview(host, item) {
        host.textContent = '';
        var box = h('div', 'bkc-preview-card');
        var line = h('div', 'bkc-sheet-line');
        line.appendChild(h('span', 'bkc-tag bkc-tag-' + (item.type || 'general'), labelOf(TYPES, item.type || 'general')));
        if (item.priority === 'high' || item.priority === 'critical') {
            line.appendChild(h('span', 'bkc-tag bkc-tag-pri', labelOf(PRIORITIES, item.priority)));
        }
        if (item.published_at) line.appendChild(h('span', 'bkc-tag', fmt(item.published_at)));
        else line.appendChild(h('span', 'bkc-tag', 'Draft'));
        box.appendChild(line);
        box.appendChild(h('h3', 'bkc-preview-title', item.title || 'Tiêu đề thông báo…'));
        var body = h('div', 'bkc-preview-body');
        String(item.content || '').split(/\n{2,}/).forEach(function (par) {
            if (!par.trim()) return;
            body.appendChild(h('p', null, par.trim()));
        });
        box.appendChild(body);
        host.appendChild(box);
    }

    function previewNotification(item, onConfirm) {
        openSheet({
            tags: [
                ['bkc-tag-' + (item.type || 'general'), labelOf(TYPES, item.type || 'general')],
                ['', labelOf(PRIORITIES, item.priority)],
                ['', item.published_at ? fmt(item.published_at) : 'Draft']
            ],
            title: item.title,
            body: function (host) { renderNotificationPreview(host, item); host.classList.add('is-plain'); },
            confirmLabel: onConfirm ? 'Xác nhận & Push' : null,
            onConfirm: onConfirm
        });
    }

    /** Overlay xem trước dùng chung cho thông báo/changelog. */
    function openSheet(opts) {
        var wrap = h('div', 'bkc-modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var sheet = h('div', 'bkc-sheet' + (opts.wide ? ' bkc-sheet-wide' : ''));
        var head = h('div', 'bkc-sheet-head');
        var titles = h('div', 'bkc-sheet-titles');
        var line = h('div', 'bkc-sheet-line');
        (opts.tags || []).forEach(function (tag) {
            line.appendChild(h('span', 'bkc-tag ' + (tag[0] || ''), tag[1]));
        });
        titles.appendChild(line);
        titles.appendChild(h('h2', 'bkc-sheet-title', opts.title || ''));
        head.appendChild(titles);
        var x = h('button', 'bkc-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng xem trước');
        head.appendChild(x);
        sheet.appendChild(head);

        var body = h('div', 'bkc-sheet-body');
        if (typeof opts.body === 'function') opts.body(body);
        else (opts.body || []).forEach(function (node) { body.appendChild(node); });
        sheet.appendChild(body);

        var foot = h('div', 'bkc-sheet-foot');
        foot.appendChild(btn('Đóng', 'bkc-btn-ghost', close));
        if (opts.confirmLabel) {
            foot.appendChild(btn(opts.confirmLabel, 'bkc-btn-primary', function () {
                close();
                if (opts.onConfirm) opts.onConfirm();
            }, 'fa-paper-plane'));
        }
        sheet.appendChild(foot);
        wrap.appendChild(sheet);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
        (D.body || D.documentElement).appendChild(wrap);
        D.documentElement.classList.add('bkc-lock');
        D.addEventListener('keydown', onKey);
        function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
        function close() {
            wrap.remove();
            if (!S.root || S.root.hidden) D.documentElement.classList.remove('bkc-lock');
            D.removeEventListener('keydown', onKey);
        }
        x.addEventListener('click', close);
        x.focus();
        return { close: close };
    }

    function confirmDelete(what, name, onYes) {
        var body = h('div');
        body.appendChild(h('p', 'bkc-muted', 'Bạn sắp xoá ' + what + ':'));
        body.appendChild(h('p', 'bkc-confirm-name', name));
        body.appendChild(h('p', 'bkc-muted', 'Thao tác này không thể hoàn tác.'));
        if (!global.BK || !global.BK.ui || !global.BK.ui.modal) {
            if (global.confirm('Xoá ' + what + ' "' + name + '"?')) onYes();
            return;
        }
        global.BK.ui.modal({
            title: 'XÁC NHẬN XOÁ',
            body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost', onClick: function (c) { c(); } },
                { label: 'Xoá', variant: 'danger', onClick: function (c) { c(); onYes(); } }
            ]
        });
    }

    /* -------------------------------- Changelog --------------------------- */
    function ensureChangelogSections() {
        if (!S.cl.sections.length) {
            S.cl.sections = [{ category: 'features', text: '' }];
        }
        if (S.cl.editing && S.cl.loadedFor !== S.cl.editing.id) {
            S.cl.loadedFor = S.cl.editing.id;
            S.cl.sections = (S.cl.editing.content || []).map(function (s) {
                return { category: s.category || 'other', text: (s.items || []).join('\n') };
            });
            if (!S.cl.sections.length) S.cl.sections = [{ category: 'features', text: '' }];
        }
    }

    function renderChangelog(pane) {
        var editing = S.cl.editing;
        ensureChangelogSections();

        /* Bố cục dọc: form tạo/chỉnh sửa chiếm toàn chiều rộng phía trên,
           lịch sử phiên bản chiếm toàn chiều rộng phía dưới. */
        var layout = h('div', 'bkc-stack');
        pane.appendChild(layout);

        var formCard = card(editing ? 'Chỉnh sửa changelog' : 'Tạo changelog',
            editing ? [btn('Tạo mới', 'bkc-btn-ghost', function () {
                S.cl.editing = null; S.cl.draft = null; S.cl.sections = []; S.cl.loadedFor = null;
                switchTab('changelog');
            }, 'fa-plus')] : null,
            'Mỗi mục thay đổi là một dòng; nhóm theo danh mục để dễ đọc.');
        layout.appendChild(formCard.root);

        var f = h('div', 'bkc-form');
        var version = input('text', '4.0.0', editing ? editing.version : (S.cl.draft ? S.cl.draft.version : ''));
        version.maxLength = 32;
        var title = input('text', 'Tiêu đề bản cập nhật', editing ? editing.title : (S.cl.draft ? S.cl.draft.title : ''));
        var summary = input('text', 'Mô tả ngắn (không bắt buộc)', editing ? (editing.summary || '') : (S.cl.draft ? S.cl.draft.summary : ''));
        var category = selectBox(CATEGORIES, editing ? editing.category : (S.cl.draft ? S.cl.draft.category : 'features'));

        var meta = h('div', 'bkc-form-grid');
        meta.appendChild(fieldRow('Phiên bản', version));
        meta.appendChild(fieldRow('Danh mục chính', category));
        f.appendChild(meta);
        f.appendChild(fieldRow('Tiêu đề', title));
        f.appendChild(fieldRow('Mô tả ngắn', summary));

        var sectionsWrap = h('div', 'bkc-form-row');
        var secHead = h('div', 'bkc-label-row');
        secHead.appendChild(h('label', 'bkc-label', 'Danh sách thay đổi'));
        secHead.appendChild(btn('+ Thêm mục', 'bkc-btn-ghost bkc-btn-xs', function () {
            S.cl.sections.push({ category: 'features', text: '' });
            paintSections();
        }, 'fa-plus'));
        sectionsWrap.appendChild(secHead);
        var sections = h('div', 'bkc-sections');
        sectionsWrap.appendChild(sections);
        f.appendChild(sectionsWrap);

        function paintSections() {
            sections.textContent = '';
            S.cl.sections.forEach(function (section, index) {
                var row = h('div', 'bkc-section-row');
                var cat = selectBox(CATEGORIES, section.category, function (v) { section.category = v; });
                row.appendChild(cat);
                var ta = textarea('Added Student Identification.\nAdded Notification Center.', section.text, 3);
                ta.addEventListener('input', function () { section.text = ta.value; });
                row.appendChild(ta);
                var tools = h('div', 'bkc-section-tools');
                tools.appendChild(btn('↑', 'bkc-btn-ghost bkc-btn-xs', function () {
                    if (index === 0) return;
                    var tmp = S.cl.sections[index - 1];
                    S.cl.sections[index - 1] = S.cl.sections[index];
                    S.cl.sections[index] = tmp;
                    paintSections();
                }));
                tools.appendChild(btn('↓', 'bkc-btn-ghost bkc-btn-xs', function () {
                    if (index >= S.cl.sections.length - 1) return;
                    var tmp = S.cl.sections[index + 1];
                    S.cl.sections[index + 1] = S.cl.sections[index];
                    S.cl.sections[index] = tmp;
                    paintSections();
                }));
                tools.appendChild(btn('×', 'bkc-btn-ghost bkc-btn-xs is-danger', function () {
                    S.cl.sections.splice(index, 1);
                    if (!S.cl.sections.length) S.cl.sections.push({ category: 'features', text: '' });
                    paintSections();
                }));
                row.appendChild(tools);
                sections.appendChild(row);
            });
        }
        paintSections();

        var actions = h('div', 'bkc-actions');
        actions.appendChild(btn('PUSH CHANGELOG NOW', 'bkc-btn-push', function () {
            var payload = readForm();
            if (!payload) return;
            payload.is_published = true;
            previewChangelog(payload, function () { saveChangelog(payload); });
        }, 'fa-paper-plane'));
        actions.appendChild(btn('Lưu nháp', 'bkc-btn-primary', function () {
            var payload = readForm();
            if (!payload) return;
            payload.is_published = false;
            saveChangelog(payload);
        }, 'fa-floppy-disk'));
        actions.appendChild(btn('Gợi ý phiên bản', 'bkc-btn-ghost', function () {
            var latest = S.cl.list[0];
            version.value = latest ? bumpVersion(latest.version) : (version.value || '4.0.0');
            toast('Đã điền phiên bản tiếp theo', 'info');
        }, 'fa-wand-magic-sparkles'));
        if (editing) {
            actions.appendChild(btn('Huỷ sửa', 'bkc-btn-ghost', function () {
                S.cl.editing = null; S.cl.draft = null; S.cl.sections = []; S.cl.loadedFor = null;
                switchTab('changelog');
            }, 'fa-xmark'));
        }
        f.appendChild(actions);
        formCard.body.appendChild(f);

        function readForm() {
            var v = version.value.trim();
            var t = title.value.trim();
            if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(v)) {
                toast('Phiên bản không hợp lệ (chữ, số, . + _ -).', 'error');
                version.focus();
                return null;
            }
            if (!t) { toast('Cần nhập tiêu đề.', 'error'); title.focus(); return null; }
            var content = S.cl.sections.map(function (s) {
                return {
                    category: s.category,
                    items: String(s.text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean)
                };
            }).filter(function (s) { return s.items.length; });
            if (!content.length) { toast('Cần ít nhất một mục thay đổi.', 'error'); return null; }
            return {
                id: editing ? editing.id : undefined,
                version: v, title: t, summary: summary.value.trim(),
                category: category.value, content: content
            };
        }

        function saveChangelog(payload) {
            api('changelog.save', payload).then(function () {
                toast(payload.is_published
                    ? 'Đã xuất bản changelog — hiển thị ngay trên website'
                    : 'Đã lưu nháp changelog', 'success');
                S.cl.editing = null;
                S.cl.draft = null;
                S.cl.sections = [];
                S.cl.loadedFor = null;
                switchTab('changelog');
            }).catch(function (err) { fail(err); });
        }

        /* Danh sách */
        var listCard = card('Lịch sử phiên bản', [
            btn('Xuất JSON', 'bkc-btn-ghost', function () {
                downloadJson('bakhi-changelog-' + Date.now() + '.json', S.cl.list);
            }, 'fa-download'),
            iconBtn('fa-rotate', 'Làm mới danh sách', function () { load(); })
        ], 'Các phiên bản đã đăng hoặc đang ở dạng nháp.');
        layout.appendChild(listCard.root);
        var filters = h('div', 'bkc-filters');
        var search = input('search', 'Tìm theo phiên bản hoặc tiêu đề…', S.cl.q || '');
        search.className = 'bkc-input bkc-grow';
        var fCat = selectBox([['', 'Tất cả danh mục']].concat(CATEGORIES), S.cl.filterCat || '');
        var fStatus = selectBox([['', 'Tất cả trạng thái'], ['published', 'Đã xuất bản'], ['draft', 'Nháp']],
            S.cl.filterStatus || '');
        var fSource = selectBox([['', 'Tất cả nguồn'], ['github', 'GitHub Actions'], ['admin', 'Quản trị viên']],
            S.cl.filterSource || '');
        var fSync = selectBox([['', 'Tất cả đồng bộ'], ['published', 'Đã đồng bộ'], ['draft', 'Nháp'], ['failed', 'Lỗi đồng bộ']],
            S.cl.filterSync || '');
        filters.appendChild(search);
        filters.appendChild(fCat);
        filters.appendChild(fStatus);
        filters.appendChild(fSource);
        filters.appendChild(fSync);
        filters.appendChild(btn('Tìm', '', function () {
            S.cl.q = search.value.trim();
            S.cl.filterCat = fCat.value;
            S.cl.filterStatus = fStatus.value;
            S.cl.filterSource = fSource.value;
            S.cl.filterSync = fSync.value;
            S.cl.page = 1;
            load();
        }, 'fa-magnifying-glass'));
        listCard.body.appendChild(filters);
        var listHost = h('div');
        listCard.body.appendChild(listHost);
        var pageHost = h('div', 'bkc-pager');
        listCard.body.appendChild(pageHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                S.cl.q = search.value.trim();
                S.cl.page = 1;
                load();
            }
        });
        fCat.addEventListener('change', function () {
            S.cl.filterCat = fCat.value;
            S.cl.page = 1;
            load();
        });
        fStatus.addEventListener('change', function () {
            S.cl.filterStatus = fStatus.value;
            S.cl.page = 1;
            load();
        });
        fSource.addEventListener('change', function () {
            S.cl.filterSource = fSource.value;
            S.cl.page = 1;
            load();
        });
        fSync.addEventListener('change', function () {
            S.cl.filterSync = fSync.value;
            S.cl.page = 1;
            load();
        });

        function syncLabel(state) {
            return {
                published: 'Đã đồng bộ', draft: 'Nháp', failed: 'Lỗi đồng bộ'
            }[state] || (state || '—');
        }

        function load() {
            listHost.textContent = '';
            loading(listHost, 'Đang tải changelog…');
            pageHost.textContent = '';
            var offset = (Math.max(1, S.cl.page) - 1) * S.cl.pageSize;
            api('changelog.list', {
                q: S.cl.q || '', category: S.cl.filterCat || undefined,
                status: S.cl.filterStatus || undefined, source: S.cl.filterSource || undefined,
                sync_state: S.cl.filterSync || undefined, limit: S.cl.pageSize, offset: offset
            }).then(function (data) {
                listHost.textContent = '';
                S.cl.list = data.changelog || [];
                S.cl.total = data.total || S.cl.list.length;
                var pages = Math.max(1, Math.ceil(S.cl.total / S.cl.pageSize));
                if (S.cl.page > pages) {
                    S.cl.page = pages;
                    load();
                    return;
                }
                if (!S.cl.list.length) {
                    emptyState(listHost, 'fa-code-branch', 'Chưa có phiên bản nào',
                        'Tạo bản ghi đầu tiên để thông báo thay đổi cho học sinh.');
                } else {
                    var t = table(['Version', 'Tiêu đề', 'Danh mục', 'Trạng thái', 'Nguồn', 'Đồng bộ', 'Xuất bản', 'Thao tác']);
                    S.cl.list.forEach(function (entry) {
                        var tr = h('tr');
                        tr.appendChild(h('td', 'bkc-code', entry.version));
                        var titleCell = h('td');
                        titleCell.appendChild(h('b', null, entry.title));
                        if (entry.summary) titleCell.appendChild(h('span', 'bkc-row-sub', entry.summary));
                        tr.appendChild(titleCell);
                        tr.appendChild(h('td', null, labelOf(CATEGORIES, entry.category)));
                        var stCell = h('td');
                        stCell.appendChild(pill(entry.is_published ? 'Published' : 'Draft', entry.is_published ? 'ok' : 'warn'));
                        tr.appendChild(stCell);
                        tr.appendChild(h('td', null, entry.source === 'github' ? 'GitHub Actions'
                            : entry.source === 'admin' ? 'Quản trị viên' : '—'));
                        var syncCell = h('td');
                        syncCell.appendChild(pill(syncLabel(entry.sync_state),
                            entry.sync_state === 'failed' ? 'off' : entry.sync_state === 'published' ? 'ok' : 'warn'));
                        if (entry.sync_error) syncCell.appendChild(h('span', 'bkc-row-sub', clip(entry.sync_error, 70)));
                        tr.appendChild(syncCell);
                        tr.appendChild(h('td', null, fmt(entry.published_at)));
                        var acts = h('td');
                        var row = h('div', 'bkc-row-actions');
                        row.appendChild(btn('Xem', '', function () { previewChangelog(entry, null); }));
                        row.appendChild(btn('Sửa', '', function () {
                            S.cl.editing = entry;
                            S.cl.draft = null;
                            S.cl.loadedFor = null;
                            switchTab('changelog');
                        }));
                        if (entry.is_published) {
                            row.appendChild(btn('Ẩn', '', function () {
                                mutate('changelog.unpublish', { id: entry.id }, 'Đã ẩn phiên bản');
                            }));
                        } else {
                            row.appendChild(btn('Đăng', '', function () {
                                mutate('changelog.publish', { id: entry.id }, 'Đã đăng phiên bản');
                            }));
                        }
                        row.appendChild(btn('Nhân bản', '', function () {
                            S.cl.editing = null;
                            S.cl.draft = {
                                version: bumpVersion(entry.version),
                                title: entry.title + ' (bản sao)',
                                summary: entry.summary || '',
                                category: entry.category
                            };
                            S.cl.sections = (entry.content || []).map(function (s) {
                                return { category: s.category || 'other', text: (s.items || []).join('\n') };
                            });
                            if (!S.cl.sections.length) S.cl.sections = [{ category: 'features', text: '' }];
                            S.cl.loadedFor = null;
                            switchTab('changelog');
                        }));
                        row.appendChild(btn('Xoá', 'is-danger', function () {
                            confirmDelete('phiên bản', entry.version, function () {
                                mutate('changelog.delete', { id: entry.id }, 'Đã xoá phiên bản');
                            });
                        }));
                        acts.appendChild(row);
                        tr.appendChild(acts);
                        t.tbody.appendChild(tr);
                    });
                    listHost.appendChild(t.wrap);
                }
                renderPager(pageHost, {
                    total: S.cl.total, page: S.cl.page, pageSize: S.cl.pageSize,
                    unit: 'phiên bản',
                    onPage: function (p) { S.cl.page = p; load(); },
                    onSize: function (n) { S.cl.pageSize = n; S.cl.page = 1; load(); }
                });
            }).catch(function (err) {
                listHost.textContent = '';
                listHost.appendChild(alertBox(err.message || 'Không tải được danh sách.', 'error'));
            });
        }

        function mutate(action, payload, okMessage) {
            api(action, payload).then(function () {
                toast(okMessage, 'success');
                load();
            }).catch(function (err) { fail(err); });
        }

        load();
    }

    function previewChangelog(payload, onConfirm) {
        openSheet({
            wide: true,
            tags: [['bkc-tag-update', 'Phiên bản ' + payload.version], ['', labelOf(CATEGORIES, payload.category)]],
            title: payload.title,
            body: function (host) {
                if (payload.summary) host.appendChild(h('p', 'bkc-wn-sum', payload.summary));
                (payload.content || []).forEach(function (section) {
                    var cat = h('div', 'bkc-cat');
                    cat.appendChild(h('div', 'bkc-cat-title', labelOf(CATEGORIES, section.category)));
                    var ul = h('ul', 'bkc-cat-list');
                    (section.items || []).forEach(function (text) { ul.appendChild(h('li', null, text)); });
                    cat.appendChild(ul);
                    host.appendChild(cat);
                });
            },
            confirmLabel: onConfirm ? 'Xác nhận & Push' : null,
            onConfirm: onConfirm
        });
    }

    /* -------------------------------- Students ---------------------------- */
    function renderStudents(pane) {
        var importCard = card('Import danh sách học sinh', null,
            'Mỗi dòng một họ tên đầy đủ. Dòng trống và dòng bắt đầu bằng “#” được bỏ qua.');
        pane.appendChild(importCard.root);

        var info = h('div', 'bkc-form');
        var drop = h('div', 'bkc-drop');
        drop.appendChild(icon('fa-cloud-arrow-up'));
        drop.appendChild(h('b', null, 'Kéo thả tệp .txt vào đây'));
        drop.appendChild(h('span', null, 'hoặc bấm để chọn tệp — dữ liệu chỉ gửi tới máy chủ, không lưu vào repository.'));
        var fileInput = h('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,text/plain';
        fileInput.hidden = true;
        drop.appendChild(fileInput);
        var ta = textarea('Dán nội dung students.txt vào đây (hoặc chọn tệp ở trên)…', S.students.importText || '', 6);
        var parseHint = h('span', 'bkc-hint');
        var resultHost = h('div');

        function paintParse() {
            var lines = String(ta.value || '').split(/\r?\n/);
            var names = [];
            var seen = {};
            var dup = 0;
            lines.forEach(function (line) {
                var s = line.trim();
                if (!s || s.charAt(0) === '#') return;
                var key = s.replace(/\s+/g, ' ').toLowerCase();
                if (seen[key]) dup++;
                seen[key] = true;
                names.push(s);
            });
            S.students.importText = ta.value;
            parseHint.textContent = names.length
                ? names.length + ' họ tên hợp lệ' + (dup ? ' · ' + dup + ' dòng trùng trong tệp' : '')
                : 'Chưa có dòng hợp lệ nào.';
        }

        ta.addEventListener('input', paintParse);
        paintParse();

        function readFile(file) {
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { toast('Tệp quá lớn (tối đa 2 MB).', 'error'); return; }
            var reader = new FileReader();
            reader.onload = function () {
                ta.value = String(reader.result || '');
                paintParse();
                drop.classList.add('is-loaded');
                var label = drop.querySelector('b');
                if (label) label.textContent = file.name;
            };
            reader.onerror = function () { toast('Không đọc được tệp TXT.', 'error'); };
            reader.readAsText(file, 'utf-8');
        }

        drop.addEventListener('click', function () { fileInput.click(); });
        drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
        drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
        drop.addEventListener('drop', function (e) {
            e.preventDefault();
            drop.classList.remove('is-over');
            var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            readFile(file);
        });
        fileInput.addEventListener('change', function () {
            readFile(fileInput.files && fileInput.files[0]);
            fileInput.value = '';
        });

        info.appendChild(drop);
        info.appendChild(fieldRow('Nội dung', ta));
        info.appendChild(parseHint);

        var importBtn = btn('Import danh sách', 'bkc-btn-primary', function () {
            var text = ta.value;
            if (!text.trim()) { toast('Chưa có nội dung để import.', 'warn'); return; }
            importBtn.disabled = true;
            resultHost.textContent = '';
            loading(resultHost, 'Đang import danh sách…');
            global.BKCloud.importStudents(text).then(function (data) {
                importBtn.disabled = false;
                resultHost.textContent = '';
                var s = data.summary || {};
                resultHost.appendChild(alertBox(
                    'Đã xử lý ' + (s.added || 0) + ' thêm mới · ' + (s.updated || 0) + ' cập nhật · ' +
                    (s.unchanged || 0) + ' không đổi · ' + (s.duplicated || 0) + ' trùng · ' +
                    (s.skipped || 0) + ' bỏ qua.', 'ok'));
                if (data.duplicates && data.duplicates.length) {
                    resultHost.appendChild(alertBox('Họ tên trùng cần Admin phân biệt: ' +
                        data.duplicates.map(function (d) { return d.name; }).join(', '), 'warn'));
                }
                S.students.importText = '';
                ta.value = '';
                paintParse();
                drop.classList.remove('is-loaded');
                var label = drop.querySelector('b');
                if (label) label.textContent = 'Kéo thả tệp .txt vào đây';
                loadStudents();
            }).catch(function (err) {
                importBtn.disabled = false;
                resultHost.textContent = '';
                resultHost.appendChild(alertBox(err.message || 'Import thất bại.', 'error'));
            });
        }, 'fa-file-import');
        var acts = h('div', 'bkc-actions');
        acts.appendChild(importBtn);
        acts.appendChild(btn('Xoá nội dung', 'bkc-btn-ghost', function () {
            ta.value = '';
            paintParse();
            resultHost.textContent = '';
        }, 'fa-eraser'));
        info.appendChild(acts);
        info.appendChild(resultHost);
        importCard.body.appendChild(info);

        /* Danh sách học sinh */
        var listCard = card('Danh sách học sinh', [
            btn('Xuất CSV', 'bkc-btn-ghost', function () { exportStudents(); }, 'fa-file-csv'),
            iconBtn('fa-rotate', 'Làm mới danh sách', function () { loadStudents(); })
        ], 'Tìm kiếm, phân biệt hồ sơ trùng tên và quản lý trạng thái.');
        pane.appendChild(listCard.root);

        var filters = h('div', 'bkc-filters');
        var search = input('search', 'Tìm theo họ tên…', S.students.q || '');
        search.className = 'bkc-input bkc-grow';
        var fStatus = selectBox([['all', 'Tất cả trạng thái'], ['active', 'Đang hoạt động'], ['inactive', 'Đã vô hiệu']],
            S.students.status || 'all');
        var review = checkbox('Chỉ hồ sơ cần phân biệt', S.students.reviewOnly, function (v) {
            S.students.reviewOnly = v;
            S.students.page = 1;
            loadStudents();
        });
        filters.appendChild(search);
        filters.appendChild(fStatus);
        filters.appendChild(review.root);
        filters.appendChild(btn('Tìm', '', function () {
            S.students.q = search.value.trim();
            S.students.status = fStatus.value;
            S.students.page = 1;
            loadStudents();
        }, 'fa-magnifying-glass'));
        listCard.body.appendChild(filters);

        var summaryHost = h('div', 'bkc-summary-row');
        listCard.body.appendChild(summaryHost);
        var listHost = h('div');
        listCard.body.appendChild(listHost);
        var pageHost = h('div', 'bkc-pager');
        listCard.body.appendChild(pageHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                S.students.q = search.value.trim();
                S.students.page = 1;
                loadStudents();
            }
        });
        fStatus.addEventListener('change', function () {
            S.students.status = fStatus.value;
            S.students.page = 1;
            loadStudents();
        });

        function exportStudents() {
            toast('Đang chuẩn bị tệp CSV từ máy chủ…', 'info');
            api('students.export').then(function (data) {
                if (!data.csv) throw new Error('Máy chủ không trả về dữ liệu CSV.');
                download(data.filename || ('bakhi-students-' + Date.now() + '.csv'),
                    '\ufeff' + data.csv, 'text/csv;charset=utf-8');
                toast('Đã xuất ' + (data.rows || 0) + ' hồ sơ học sinh', 'success');
            }).catch(function (err) { fail(err); });
        }

        function loadStudents() {
            listHost.textContent = '';
            loading(listHost, 'Đang tải danh sách học sinh…');
            pageHost.textContent = '';
            var offset = (Math.max(1, S.students.page) - 1) * S.students.pageSize;
            api('students.list', {
                q: S.students.q || '', status: S.students.status,
                review_only: !!S.students.reviewOnly,
                limit: S.students.pageSize, offset: offset
            }).then(function (data) {
                listHost.textContent = '';
                S.students.list = data.students || [];
                S.students.total = data.total || S.students.list.length;
                var pages = Math.max(1, Math.ceil(S.students.total / S.students.pageSize));
                if (S.students.page > pages) {
                    S.students.page = pages;
                    loadStudents();
                    return;
                }

                var active = S.students.list.filter(function (s) { return s.is_active; }).length;
                var need = S.students.list.filter(function (s) { return s.needs_review; }).length;
                summaryHost.textContent = '';
                var row = h('div', 'bkc-summary-row');
                row.appendChild(pill(S.students.total + ' hồ sơ'));
                row.appendChild(pill(active + ' hoạt động trên trang', 'ok'));
                row.appendChild(pill(need + ' cần phân biệt trên trang', need ? 'warn' : 'ok'));
                summaryHost.appendChild(row);

                if (!S.students.list.length) {
                    emptyState(listHost, 'fa-user-graduate', 'Chưa có học sinh nào',
                        S.students.q || S.students.status !== 'all' || S.students.reviewOnly
                            ? 'Không có hồ sơ nào khớp bộ lọc hiện tại.'
                            : 'Hãy import danh sách students.txt ở phía trên.');
                } else {
                    paintTable();
                }
                renderPager(pageHost, {
                    total: S.students.total, page: S.students.page, pageSize: S.students.pageSize,
                    unit: 'hồ sơ',
                    onPage: function (p) { S.students.page = p; loadStudents(); },
                    onSize: function (n) { S.students.pageSize = n; S.students.page = 1; loadStudents(); }
                });
            }).catch(function (err) {
                listHost.textContent = '';
                listHost.appendChild(alertBox(err.message || 'Không tải được danh sách.', 'error'));
            });
        }

        function paintTable() {
            listHost.textContent = '';
            var t = table(['Họ tên', 'Mã học sinh', 'Trạng thái', 'Tạo', 'Đồng bộ gần nhất', 'Thao tác']);
            S.students.list.forEach(function (st) {
                var tr = h('tr');
                var nameCell = h('td');
                var nameRow = h('div', 'bkc-name-row');
                var avatar = h('span', 'bkc-avatar', initials(st.display_name));
                nameRow.appendChild(avatar);
                var nameInfo = h('div');
                nameInfo.appendChild(h('b', null, st.display_name));
                if (st.disambiguator) nameInfo.appendChild(h('span', 'bkc-row-sub', st.disambiguator));
                nameRow.appendChild(nameInfo);
                nameCell.appendChild(nameRow);
                if (st.needs_review) nameCell.appendChild(pill('Cần phân biệt', 'warn'));
                tr.appendChild(nameCell);

                var codeCell = h('td');
                var codeRow = h('div', 'bkc-code-row');
                codeRow.appendChild(h('span', 'bkc-code', st.student_code || '—'));
                codeRow.appendChild(iconBtn('fa-copy', 'Sao chép mã nội bộ', function () {
                    copyText(st.student_code || st.id, 'Đã sao chép mã học sinh');
                }, 'bkc-icon-btn-xs'));
                codeCell.appendChild(codeRow);
                codeCell.appendChild(h('span', 'bkc-row-sub', st.id));
                tr.appendChild(codeCell);

                var stCell = h('td');
                stCell.appendChild(pill(st.is_active ? 'Active' : 'Đã khoá', st.is_active ? 'ok' : 'off'));
                tr.appendChild(stCell);
                tr.appendChild(h('td', null, fmtDay(st.created_at)));
                tr.appendChild(h('td', null, fmt(st.last_sync_at)));

                var actsCell = h('td');
                var row = h('div', 'bkc-row-actions');
                row.appendChild(btn('Chi tiết', '', function () { openStudentDetail(st); }, 'fa-circle-info'));
                row.appendChild(btn('Sửa', '', function () { openStudentEditor(st, loadStudents); }));
                row.appendChild(btn(st.is_active ? 'Vô hiệu' : 'Kích hoạt', '', function () {
                    api('students.update', { id: st.id, is_active: !st.is_active }).then(function () {
                        toast(st.is_active ? 'Đã vô hiệu hoá hồ sơ' : 'Đã kích hoạt lại hồ sơ', 'success');
                        loadStudents();
                    }).catch(function (err) { fail(err); });
                }));
                actsCell.appendChild(row);
                tr.appendChild(actsCell);
                t.tbody.appendChild(tr);
            });
            listHost.appendChild(t.wrap);
        }

        loadStudents();
    }

    /** Hồ sơ chi tiết chỉ đọc: thiết bị, tiến trình, lượt đọc thông báo. */
    function openStudentDetail(st) {
        openSheet({
            wide: true,
            tags: [['bkc-tag-general', st.student_code || st.id],
                ['', st.is_active ? 'Đang hoạt động' : 'Đã khoá'],
                st.needs_review ? ['bkc-tag-important', 'Cần phân biệt'] : ['', 'Đã phân biệt']],
            title: st.display_name,
            body: function (host) {
                loading(host, 'Đang tải hồ sơ chi tiết…');
                api('students.detail', { id: st.id }).then(function (data) {
                    host.textContent = '';
                    var s = data.student || {};
                    var totals = data.totals || {};

                    var grid = h('div', 'bkc-grid');
                    statCard(grid, 'Thiết bị', totals.devices, 'Đã nhận diện', 'fa-mobile-screen', 'sky');
                    statCard(grid, 'Tiến trình', totals.progressKeys, 'Khoá dữ liệu học tập', 'fa-chart-line', 'green');
                    statCard(grid, 'Dung lượng', formatBytes(totals.progressBytes), 'Tiến trình đã lưu', 'fa-database', 'purple');
                    statCard(grid, 'Đã đọc', totals.reads, 'Lượt đọc thông báo', 'fa-envelope-open', 'amber');
                    host.appendChild(grid);

                    var infoGrid = h('div', 'bkc-status-grid');
                    infoGrid.appendChild(infoItem('student_id', s.id || '—', 'Khoá máy chủ, không đổi', 'ok'));
                    infoGrid.appendChild(infoItem('Phân biệt', s.disambiguator || '—',
                        s.needs_review ? 'Cần bổ sung thông tin phân biệt' : 'Không trùng họ tên', s.needs_review ? 'warn' : 'ok'));
                    infoGrid.appendChild(infoItem('Tạo hồ sơ', fmt(s.created_at), 'Thời điểm import', 'info'));
                    infoGrid.appendChild(infoItem('Cập nhật cuối', fmt(s.updated_at), 'Hồ sơ học sinh', 'info'));
                    host.appendChild(infoGrid);

                    var devSection = h('div');
                    devSection.appendChild(h('h4', 'bkc-sec-title', 'Thiết bị gần đây'));
                    if (!(data.devices || []).length) {
                        emptyState(devSection, 'fa-mobile-screen', 'Chưa có thiết bị',
                            'Thiết bị xuất hiện sau khi học sinh chọn tên.');
                    } else {
                        var dt = table(['Thiết bị', 'Tạo', 'Hoạt động cuối']);
                        data.devices.forEach(function (d) {
                            var tr = h('tr');
                            tr.appendChild(h('td', 'bkc-code', d.id));
                            tr.appendChild(h('td', null, fmt(d.created_at)));
                            tr.appendChild(h('td', null, fmt(d.last_seen_at)));
                            dt.tbody.appendChild(tr);
                        });
                        devSection.appendChild(dt.wrap);
                    }
                    host.appendChild(devSection);

                    var progSection = h('div');
                    progSection.appendChild(h('h4', 'bkc-sec-title', 'Tiến trình học tập'));
                    if (!(data.progress || []).length) {
                        emptyState(progSection, 'fa-chart-line', 'Chưa có tiến trình',
                            'Tiến trình được đồng bộ khi học sinh học trên website.');
                    } else {
                        var pt = table(['Khoá tiến trình', 'Kích thước', 'Cập nhật']);
                        data.progress.forEach(function (p) {
                            var tr = h('tr');
                            tr.appendChild(h('td', 'bkc-code', p.progress_key));
                            tr.appendChild(h('td', null, formatBytes(p.bytes)));
                            tr.appendChild(h('td', null, fmt(p.updated_at)));
                            pt.tbody.appendChild(tr);
                        });
                        progSection.appendChild(pt.wrap);
                    }
                    host.appendChild(progSection);

                    var readSection = h('div');
                    readSection.appendChild(h('h4', 'bkc-sec-title', 'Thông báo đã đọc'));
                    if (!(data.reads || []).length) {
                        emptyState(readSection, 'fa-envelope-open', 'Chưa đọc thông báo',
                            'Lượt đọc được ghi nhận khi học sinh mở thông báo.');
                    } else {
                        var rt = table(['Announcement ID', 'Đọc lúc']);
                        data.reads.forEach(function (r) {
                            var tr = h('tr');
                            tr.appendChild(h('td', 'bkc-code', r.announcement_id));
                            tr.appendChild(h('td', null, fmt(r.read_at)));
                            rt.tbody.appendChild(tr);
                        });
                        readSection.appendChild(rt.wrap);
                    }
                    host.appendChild(readSection);
                }).catch(function (err) {
                    host.textContent = '';
                    host.appendChild(alertBox(err.message || 'Không tải được hồ sơ chi tiết.', 'error'));
                });
            }
        });
    }

    function formatBytes(n) {
        var bytes = Number(n) || 0;
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    function initials(name) {
        var parts = String(name || '?').trim().split(/\s+/);
        if (!parts.length) return '?';
        var first = parts[0].charAt(0);
        var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
    }

    function openStudentEditor(st, onDone) {
        var body = h('div', 'bkc-form');
        var name = input('text', 'Họ và tên', st.display_name || '');
        var dis = input('text', 'Lớp / STT / ghi chú phân biệt', st.disambiguator || '');
        var active = checkbox('Hồ sơ đang hoạt động', st.is_active !== false);
        body.appendChild(fieldRow('Họ và tên', name));
        body.appendChild(fieldRow('Phân biệt hồ sơ', dis,
            'Bắt buộc khi có học sinh khác trùng họ tên. Ví dụ: “Lớp 11A1”.'));
        body.appendChild(active.root);
        body.appendChild(h('p', 'bkc-hint', 'student_id: ' + (st.id || '—') + (st.student_code ? ' · Mã nội bộ: ' + st.student_code : '')));
        var msg = h('p', 'bkc-gate-msg');
        body.appendChild(msg);

        if (!global.BK || !global.BK.ui || !global.BK.ui.modal) {
            toast('Không mở được hộp thoại cập nhật.', 'error');
            return;
        }
        var m = global.BK.ui.modal({
            title: 'Cập nhật hồ sơ học sinh',
            body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost', onClick: function (c) { c(); } },
                {
                    label: 'Lưu thay đổi', variant: 'primary', onClick: function (c) {
                        var display = name.value.trim();
                        if (!display) {
                            msg.textContent = 'Họ tên không được để trống.';
                            msg.className = 'bkc-gate-msg is-error';
                            name.focus();
                            return;
                        }
                        api('students.update', {
                            id: st.id,
                            display_name: display,
                            disambiguator: dis.value.trim(),
                            is_active: active.input.checked
                        }).then(function () {
                            c();
                            toast('Đã cập nhật hồ sơ', 'success');
                            if (onDone) onDone();
                        }).catch(function (err) {
                            msg.textContent = err.message || 'Không lưu được.';
                            msg.className = 'bkc-gate-msg is-error';
                        });
                    }
                }
            ]
        });
        return m;
    }

    /* ------------------------------- Hồ sơ ------------------------------- */
    /**
     * Danh mục badge công khai nằm trong bk-badges.js. Trang quản trị không bắt
     * buộc nạp tệp đó, nên mọi chỗ dùng đều có phương án dự phòng chỉ với hai
     * badge Administrator — đúng hai id mà máy chủ cho phép trao tay.
     */
    function badgeCatalog() {
        try {
            if (global.BK && global.BK.badges && global.BK.badges.CATALOG) return global.BK.badges.CATALOG;
        } catch (e) { }
        return [];
    }
    function badgeMeta(id) {
        var list = badgeCatalog();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return {
            id: id,
            name: id === 'admin-chosen' ? 'Được chọn'
                : id === 'admin-legend' ? 'Huyền thoại Bá Khí' : String(id || '—'),
            icon: id === 'admin-legend' ? 'fa-crown' : 'fa-medal',
            desc: '',
            adminOnly: String(id || '').indexOf('admin-') === 0
        };
    }
    function frameLabel(id) {
        var frames = [];
        try { frames = (global.BKProfile && global.BKProfile.frames) || []; } catch (e) { frames = []; }
        for (var i = 0; i < frames.length; i++) if (frames[i].id === id) return frames[i].name;
        return id ? String(id) : 'Mặc định';
    }

    /* ----------------------- Chi tiết thành tích (modal) ------------------ */
    /* Dùng chung cho tab Hồ sơ và tab Thành tích: bấm vào ô badge để xem
       đầy đủ mô tả, độ hiếm, cách lấy, phần thưởng khung và trạng thái. */
    function badgeRarity(id) {
        var list = [];
        try { list = (global.BK && global.BK.badges && global.BK.badges.RARITIES) || []; } catch (e) { list = []; }
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }
    function badgeCategory(id) {
        var list = [];
        try { list = (global.BK && global.BK.badges && global.BK.badges.CATEGORIES) || []; } catch (e) { list = []; }
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }
    function badgeScope(meta) {
        if (!meta || !meta.adminOnly) return 'Tự động — máy chủ xác minh từ tiến trình học tập.';
        if (meta.id === 'founder') return 'Badge tối cao — chỉ cấp cho hồ sơ is_founder = true.';
        if (meta.exclusive === 'founder') return 'Độc quyền Founder — Founder trao tay cho học sinh từ Founder Dashboard.';
        if (meta.exclusive === 'dev') return 'Độc quyền Developer — chỉ Founder trao được.';
        return 'Administrator trao tay từ Dashboard.';
    }
    function openBadgeDetail(badgeId, opts) {
        opts = opts || {};
        var meta = badgeMeta(badgeId);
        if (!meta) return;
        var rarity = badgeRarity(meta.rarity);
        var cat = badgeCategory(meta.category);
        var owned = opts.owned === true;
        var tags = [];
        if (rarity) tags.push(['', rarity.name]);
        if (cat) tags.push(['', cat.name]);
        if (meta.adminOnly) tags.push(['bkc-tag-general', 'Trao tay']);
        else tags.push(['', 'Tự động']);
        if (opts.ownedDate) tags.push(['', 'Đã sở hữu']);

        openSheet({
            title: meta.name,
            tags: tags,
            body: function (host) {
                var head = h('div', 'bkc-badge-detail-head');
                var ic = h('span', 'bkc-badge-detail-icon' + (owned ? ' is-owned' : ''));
                ic.appendChild(icon(meta.icon || 'fa-medal'));
                head.appendChild(ic);
                var text = h('div', 'bkc-badge-detail-text');
                text.appendChild(h('b', null, meta.name));
                text.appendChild(h('span', 'bkc-row-sub', badgeScope(meta)));
                if (opts.ownedDate) {
                    text.appendChild(h('span', 'bkc-row-sub',
                        'Trao ngày ' + fmt(opts.ownedDate) + (opts.kind === 'auto' ? ' · tự động' : ' · quản trị viên')));
                }
                head.appendChild(text);
                host.appendChild(head);

                host.appendChild(h('h4', 'bkc-sec-title', 'Mô tả'));
                host.appendChild(h('p', 'bkc-muted', meta.desc || 'Chưa có mô tả cho badge này.'));

                host.appendChild(h('h4', 'bkc-sec-title', 'Cách lấy'));
                host.appendChild(h('p', 'bkc-muted',
                    meta.adminOnly
                        ? badgeScope(meta)
                        : 'Đạt mục tiêu ' + (meta.goal > 1 ? meta.goal + ' lần hoạt động' : '1 lần') +
                          ' theo dữ liệu học tập đã đồng bộ. Máy chủ tính lại độc lập, không tin trình duyệt.'));

                if (opts.reason) {
                    host.appendChild(h('h4', 'bkc-sec-title', 'Lý do trao'));
                    host.appendChild(h('p', 'bkc-muted', opts.reason));
                }

                if (meta.frame) {
                    host.appendChild(h('h4', 'bkc-sec-title', 'Phần thưởng khung avatar'));
                    var preview = h('div', 'bkc-badge-frame-preview');
                    var frame = null;
                    try {
                        var frames = (global.BKProfile && global.BKProfile.frames) || [];
                        for (var i = 0; i < frames.length; i++) if (frames[i].id === meta.frame) frame = frames[i];
                    } catch (e) { frame = null; }
                    if (frame) preview.style.setProperty('--bkc-frame-ring', frame.ring || '#94a3b8');
                    var avatar = h('span', 'bkc-badge-frame-avatar', initials(opts.studentName || 'BK'));
                    preview.appendChild(avatar);
                    try {
                        if (frame && global.BKProfile && global.BKProfile.frameOverlay) {
                            var art = global.BKProfile.frameOverlay(frame.id);
                            if (art) preview.appendChild(art);
                        }
                    } catch (e) { }
                    host.appendChild(preview);
                    host.appendChild(h('p', 'bkc-hint', 'Khung “' + frameLabel(meta.frame) +
                        '” mở khoá khi học sinh sở hữu badge này. Khung chỉ trang trí ảnh đại diện.'));
                }
            }
        });
    }

    /* Biến ô badge trong dashboard thành nút mở chi tiết, giữ thao tác riêng
       (thu hồi) hoạt động độc lập. */
    function makeBadgeTappable(tile, badgeId, opts) {
        tile.classList.add('is-tappable');
        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');
        tile.setAttribute('title', 'Ấn để xem chi tiết thành tích');
        tile.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            openBadgeDetail(badgeId, opts);
        });
        tile.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openBadgeDetail(badgeId, opts);
            }
        });
    }
    function badgeCountText(profile, count) {
        if (count == null) return '—';
        return String(count) + ' thành tích';
    }

    function renderProfiles(pane) {
        var listCard = card('Hồ sơ học sinh', [
            iconBtn('fa-rotate', 'Làm mới danh sách hồ sơ', function () { load(); })
        ], 'Đọc trực tiếp từ student_profiles và student_badges qua Edge Function admin-actions.');
        pane.appendChild(listCard.root);

        var filters = h('div', 'bkc-filters');
        var search = input('search', 'Tìm theo họ tên…', S.profiles.q || '');
        search.className = 'bkc-input bkc-grow';
        filters.appendChild(search);
        filters.appendChild(btn('Tìm', '', function () {
            S.profiles.q = search.value.trim();
            S.profiles.page = 1;
            load();
        }, 'fa-magnifying-glass'));
        listCard.body.appendChild(filters);

        var summaryHost = h('div', 'bkc-summary-row');
        listCard.body.appendChild(summaryHost);
        var listHost = h('div');
        listCard.body.appendChild(listHost);
        var pageHost = h('div', 'bkc-pager');
        listCard.body.appendChild(pageHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                S.profiles.q = search.value.trim();
                S.profiles.page = 1;
                load();
            }
        });

        function load() {
            listHost.textContent = '';
            loading(listHost, 'Đang tải hồ sơ học sinh…');
            summaryHost.textContent = '';
            pageHost.textContent = '';
            var offset = (Math.max(1, S.profiles.page) - 1) * S.profiles.pageSize;
            api('profiles.list', {
                q: S.profiles.q || '', limit: S.profiles.pageSize, offset: offset
            }).then(function (data) {
                listHost.textContent = '';
                S.profiles.list = data.profiles || [];
                S.profiles.total = data.total || S.profiles.list.length;
                var pages = Math.max(1, Math.ceil(S.profiles.total / S.profiles.pageSize));
                if (S.profiles.page > pages) {
                    S.profiles.page = pages;
                    load();
                    return;
                }

                var withProfile = S.profiles.list.filter(function (r) { return !!r.profile; }).length;
                var withBadges = S.profiles.list.filter(function (r) { return (r.badges || 0) > 0; }).length;
                var summary = h('div', 'bkc-summary-row');
                summary.appendChild(pill(S.profiles.total + ' hồ sơ'));
                summary.appendChild(pill(withProfile + ' đã tuỳ chỉnh hồ sơ trên trang', withProfile ? 'ok' : 'warn'));
                summary.appendChild(pill(withBadges + ' có thành tích trên trang', withBadges ? 'ok' : 'warn'));
                summaryHost.appendChild(summary);

                if (!S.profiles.list.length) {
                    emptyState(listHost, 'fa-id-card', 'Chưa có hồ sơ nào',
                        S.profiles.q ? 'Không có hồ sơ nào khớp từ khoá tìm kiếm.'
                            : 'Hồ sơ xuất hiện sau khi học sinh chọn tên và tuỳ chỉnh trang cá nhân.');
                } else {
                    paint();
                }
                renderPager(pageHost, {
                    total: S.profiles.total, page: S.profiles.page, pageSize: S.profiles.pageSize,
                    unit: 'hồ sơ',
                    onPage: function (p) { S.profiles.page = p; load(); },
                    onSize: function (n) { S.profiles.pageSize = n; S.profiles.page = 1; load(); }
                });
            }).catch(function (err) {
                listHost.textContent = '';
                listHost.appendChild(alertBox(profilesErrorText(err), 'error'));
            });
        }

        function paint() {
            var t = table(['Học sinh', 'Biệt danh', 'Khung avatar', 'Thành tích', 'Cập nhật hồ sơ', 'Thao tác']);
            S.profiles.list.forEach(function (row) {
                var profile = row.profile || {};
                var tr = h('tr');

                var nameCell = h('td');
                var nameRow = h('div', 'bkc-name-row');
                nameRow.appendChild(h('span', 'bkc-avatar', initials(row.display_name)));
                var info = h('div');
                info.appendChild(h('b', null, row.display_name));
                if (row.disambiguator) info.appendChild(h('span', 'bkc-row-sub', row.disambiguator));
                nameRow.appendChild(info);
                nameCell.appendChild(nameRow);
                if (!row.is_active) nameCell.appendChild(pill('Đã khoá', 'off'));
                if (row.needs_review) nameCell.appendChild(pill('Cần phân biệt', 'warn'));
                tr.appendChild(nameCell);

                tr.appendChild(h('td', null, profile.nickname || '—'));
                tr.appendChild(h('td', null, frameLabel(profile.frame)));
                tr.appendChild(h('td', null, badgeCountText(profile, row.badges)));
                tr.appendChild(h('td', null, profile.updated_at ? fmt(profile.updated_at) : 'Chưa tuỳ chỉnh'));

                var acts = h('td');
                var rowActs = h('div', 'bkc-row-actions');
                rowActs.appendChild(btn('Chi tiết', '', function () { openProfileDetail(row); }, 'fa-circle-info'));
                rowActs.appendChild(btn('Badge', '', function () {
                    S.badges.selected = row;
                    switchTab('badges');
                }, 'fa-medal'));
                acts.appendChild(rowActs);
                tr.appendChild(acts);
                t.tbody.appendChild(tr);
            });
            listHost.appendChild(t.wrap);
        }

        load();
    }

    function profilesErrorText(err) {
        var msg = (err && err.message) || 'Không tải được hồ sơ học sinh.';
        if (/does not exist|schema cache|could not find the table|relation|42P01|404|not found/i.test(msg)) {
            return 'Máy chủ hồ sơ chưa được triển khai. Chạy migration 20261119000000_bakhi_profile_badges.sql và deploy Edge Function student-profile.';
        }
        return msg;
    }

    function openProfileDetail(row) {
        openSheet({
            wide: true,
            tags: [['bkc-tag-general', row.disambiguator || 'Học sinh'],
                ['', row.is_active ? 'Đang hoạt động' : 'Đã khoá']],
            title: row.display_name,
            body: function (host) {
                loading(host, 'Đang tải hồ sơ chi tiết…');
                api('profiles.detail', { id: row.id }).then(function (data) {
                    host.textContent = '';
                    var profile = data.profile || {};
                    var badges = data.badges || [];

                    var head = h('div', 'bkc-profile-head');
                    var avatar = h('span', 'bkc-profile-avatar');
                    var avatarUrl = String(profile.avatar_url || '');
                    if (/^https?:\/\//i.test(avatarUrl)) {
                        var img = h('img');
                        img.src = avatarUrl;
                        img.alt = '';
                        img.loading = 'lazy';
                        img.referrerPolicy = 'no-referrer';
                        avatar.appendChild(img);
                    } else {
                        avatar.textContent = initials(row.display_name);
                    }
                    avatar.className += ' frame-' + (profile.frame || 'none');
                    head.appendChild(avatar);
                    var headInfo = h('div', 'bkc-profile-head-info');
                    headInfo.appendChild(h('b', null, row.display_name));
                    headInfo.appendChild(h('span', 'bkc-row-sub',
                        'Biệt danh: ' + (profile.nickname || '—') + ' · Khung: ' + frameLabel(profile.frame)));
                    headInfo.appendChild(h('span', 'bkc-row-sub',
                        'Thành tích: ' + badges.length + ' · Cập nhật: ' + fmt(profile.updated_at)));
                    headInfo.appendChild(h('span', 'bkc-row-sub', 'student_id: ' + row.id));
                    head.appendChild(headInfo);
                    host.appendChild(head);

                    var infoGrid = h('div', 'bkc-status-grid');
                    infoGrid.appendChild(infoItem('Mã nội bộ', row.student_code || '—',
                        'Chỉ hiển thị trong trang quản trị', 'info'));
                    infoGrid.appendChild(infoItem('Phân biệt', row.disambiguator || '—',
                        row.needs_review ? 'Cần bổ sung thông tin phân biệt' : 'Không trùng họ tên',
                        row.needs_review ? 'warn' : 'ok'));
                    infoGrid.appendChild(infoItem('Khung avatar', frameLabel(profile.frame),
                        'Khung phải sở hữu qua badge đã xác minh', 'info'));
                    infoGrid.appendChild(infoItem('Ảnh bìa', profile.cover_url ? 'Đã đặt' : 'Chưa đặt',
                        'URL công khai trong bucket hồ sơ', 'info'));
                    host.appendChild(infoGrid);

                    if (profile.bio) {
                        var bio = h('div', 'bkc-profile-bio');
                        bio.appendChild(h('h4', 'bkc-sec-title', 'Giới thiệu'));
                        bio.appendChild(h('p', null, profile.bio));
                        host.appendChild(bio);
                    }

                    var badgeSection = h('div');
                    badgeSection.appendChild(h('h4', 'bkc-sec-title', 'Thành tích đã xác minh'));
                    if (!badges.length) {
                        emptyState(badgeSection, 'fa-medal', 'Chưa có thành tích',
                            'Badge tự động do máy chủ tính lại từ tiến trình đã đồng bộ; hai badge Administrator do quản trị viên trao.');
                    } else {
                        var grid = h('div', 'bkc-badge-grid');
                        badges.forEach(function (b) {
                            var meta = badgeMeta(b.badge_id);
                            var tile = h('div', 'bkc-badge-tile' + (b.kind === 'admin' ? ' is-admin' : ''));
                            var ic = h('span', 'bkc-badge-ic');
                            ic.appendChild(icon(meta.icon || 'fa-medal'));
                            tile.appendChild(ic);
                            var body = h('div', 'bkc-badge-body');
                            body.appendChild(h('b', null, meta.name));
                            body.appendChild(h('span', 'bkc-row-sub',
                                (b.kind === 'admin' ? 'Administrator trao' : 'Tự động') + ' · ' + fmt(b.awarded_at)));
                            if (b.reason) body.appendChild(h('span', 'bkc-hint', b.reason));
                            tile.appendChild(body);
                            makeBadgeTappable(tile, b.badge_id, {
                                owned: true, ownedDate: b.awarded_at, kind: b.kind,
                                reason: b.reason, studentName: row.display_name
                            });
                            grid.appendChild(tile);
                        });
                        badgeSection.appendChild(grid);
                    }
                    host.appendChild(badgeSection);
                }).catch(function (err) {
                    host.textContent = '';
                    host.appendChild(alertBox(profilesErrorText(err), 'error'));
                });
            }
        });
    }

    /* ------------------------------ Thành tích ---------------------------- */
    function renderBadges(pane) {
        var fullCatalog = badgeCatalog();
        var mix = (global.BK && global.BK.badges && typeof global.BK.badges.breakdown === 'function')
            ? global.BK.badges.breakdown()
            : { total: fullCatalog.length, auto: 0, founder: 0, dev: 0, admin: 0 };
        var catalog = fullCatalog;
        if (!isFounder()) {
            catalog = catalog.filter(function (b) { return !isExclusiveBadge(b.id); });
        }
        var adminIds = ['admin-chosen', 'admin-legend'];
        var catalogCard = card('Danh mục thành tích', null,
            'Administrator có thể trao mọi badge trong danh mục. Badge tự động vẫn được máy chủ tính lại độc lập.');
        pane.appendChild(catalogCard.root);

        var infoGrid = h('div', 'bkc-status-grid');
        if (fullCatalog.length) {
            infoGrid.appendChild(infoItem('Tổng badge', mix.total || fullCatalog.length,
                'Danh mục trong bk-badges.js', 'ok'));
            infoGrid.appendChild(infoItem('Tự động', mix.auto,
                'Máy chủ tính từ tiến trình đã đồng bộ', 'info'));
            infoGrid.appendChild(infoItem('Founder', mix.founder,
                'Chỉ trao cho hồ sơ is_founder = true', 'warn'));
            infoGrid.appendChild(infoItem('Developer', mix.dev,
                'Hai badge độc quyền của Bá Khí', 'warn'));
            infoGrid.appendChild(infoItem('Administrator', mix.admin,
                'Trao tay từ Administrator Dashboard', 'warn'));
        } else {
            infoGrid.appendChild(infoItem('Danh mục', 'Chưa nạp', 'Trang quản trị không nạp bk-badges.js', 'warn'));
            infoGrid.appendChild(infoItem('Administrator', '—', 'Không đọc được danh mục badge', 'warn'));
        }
        catalogCard.body.appendChild(infoGrid);

        catalogCard.body.appendChild(alertBox(
            'Badge tự động đạt và badge trao tay được lưu TÁCH BIỆT: thu hồi trao tay không xoá kết quả tự động. ' +
            (isFounder()
                ? 'Founder trao được toàn bộ ' + (mix.total || fullCatalog.length || 'danh mục') + ' badge (' +
                    mix.auto + ' tự động + ' + mix.founder + ' Founder + ' + mix.dev + ' Developer + ' +
                    mix.admin + ' Administrator), kể cả Founder và hai badge Developer; badge Founder vẫn chỉ áp dụng cho hồ sơ is_founder = true.'
                : 'Badge Founder/Developer là độc quyền và chỉ xuất hiện trong Founder Dashboard.'), 'info'));

        /* Chọn học sinh */
        var pickerCard = card('Chọn học sinh', [
            iconBtn('fa-rotate', 'Làm mới danh sách', function () { loadStudents(); })
        ], 'Tìm học sinh rồi chọn để xem và quản lý thành tích.');
        pane.appendChild(pickerCard.root);

        var filters = h('div', 'bkc-filters');
        var search = input('search', 'Tìm theo họ tên…', S.badges.q || '');
        search.className = 'bkc-input bkc-grow';
        filters.appendChild(search);
        filters.appendChild(btn('Tìm', '', function () {
            S.badges.q = search.value.trim();
            S.badges.page = 1;
            loadStudents();
        }, 'fa-magnifying-glass'));
        pickerCard.body.appendChild(filters);

        var pickerHost = h('div');
        pickerCard.body.appendChild(pickerHost);
        var pickerPage = h('div', 'bkc-pager');
        pickerCard.body.appendChild(pickerPage);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                S.badges.q = search.value.trim();
                S.badges.page = 1;
                loadStudents();
            }
        });

        function loadStudents() {
            pickerHost.textContent = '';
            loading(pickerHost, 'Đang tải danh sách học sinh…');
            pickerPage.textContent = '';
            var offset = (Math.max(1, S.badges.page) - 1) * S.badges.pageSize;
            api('profiles.list', {
                q: S.badges.q || '', limit: S.badges.pageSize, offset: offset
            }).then(function (data) {
                pickerHost.textContent = '';
                S.badges.list = data.profiles || [];
                S.badges.total = data.total || S.badges.list.length;
                var pages = Math.max(1, Math.ceil(S.badges.total / S.badges.pageSize));
                if (S.badges.page > pages) { S.badges.page = pages; loadStudents(); return; }

                if (!S.badges.list.length) {
                    emptyState(pickerHost, 'fa-user-graduate', 'Không có học sinh nào',
                        S.badges.q ? 'Không có hồ sơ nào khớp từ khoá.' : 'Hãy import danh sách học sinh trước.');
                } else {
                    var t = table(['Học sinh', 'Thành tích', 'Cập nhật hồ sơ', 'Thao tác']);
                    S.badges.list.forEach(function (row) {
                        var tr = h('tr');
                        var nameCell = h('td');
                        var nameRow = h('div', 'bkc-name-row');
                        nameRow.appendChild(h('span', 'bkc-avatar', initials(row.display_name)));
                        var info = h('div');
                        info.appendChild(h('b', null, row.display_name));
                        if (row.disambiguator) info.appendChild(h('span', 'bkc-row-sub', row.disambiguator));
                        nameRow.appendChild(info);
                        nameCell.appendChild(nameRow);
                        tr.appendChild(nameCell);
                        tr.appendChild(h('td', null, badgeCountText(row.profile, row.badges)));
                        tr.appendChild(h('td', null, row.profile && row.profile.updated_at
                            ? fmt(row.profile.updated_at) : 'Chưa tuỳ chỉnh'));
                        var acts = h('td');
                        var rowActs = h('div', 'bkc-row-actions');
                        rowActs.appendChild(btn(S.badges.selected && S.badges.selected.id === row.id
                            ? 'Đang chọn' : 'Chọn', '', function () {
                            S.badges.selected = row;
                            paintSelected();
                        }, 'fa-check'));
                        acts.appendChild(rowActs);
                        tr.appendChild(acts);
                        t.tbody.appendChild(tr);
                    });
                    pickerHost.appendChild(t.wrap);
                }
                renderPager(pickerPage, {
                    total: S.badges.total, page: S.badges.page, pageSize: S.badges.pageSize,
                    unit: 'học sinh',
                    onPage: function (p) { S.badges.page = p; loadStudents(); },
                    onSize: function (n) { S.badges.pageSize = n; S.badges.page = 1; loadStudents(); }
                });
                paintSelected();
            }).catch(function (err) {
                pickerHost.textContent = '';
                pickerHost.appendChild(alertBox(profilesErrorText(err), 'error'));
            });
        }

        /* Badge của học sinh đang chọn */
        var selectedCard = card('Thành tích của học sinh', null,
            'Chỉ hai badge Administrator mới trao tay được; mọi thao tác đều đi qua admin-actions.');
        pane.appendChild(selectedCard.root);
        var selectedHost = h('div', 'bkc-form');
        selectedCard.body.appendChild(selectedHost);

        function paintSelected() {
            selectedHost.textContent = '';
            var row = S.badges.selected;
            if (!row) {
                emptyState(selectedHost, 'fa-hand-pointer', 'Chưa chọn học sinh',
                    'Chọn một học sinh trong danh sách phía trên để xem thành tích.');
                return;
            }

            var head = h('div', 'bkc-picker-head');
            head.appendChild(h('span', 'bkc-avatar', initials(row.display_name)));
            var headInfo = h('div');
            var name = h('b', null, row.display_name);
            headInfo.appendChild(name);
            headInfo.appendChild(h('span', 'bkc-row-sub', row.id));
            head.appendChild(headInfo);
            selectedHost.appendChild(head);

            var grantBox = h('div', 'bkc-grant-box');

            /* Tìm + lọc trong TOÀN BỘ danh mục badge. */
            var badgeSearch = input('search', 'Tìm badge theo tên, mô tả hoặc mã…', '');
            var raritySel = selectBox([['all', 'Mọi độ hiếm']].concat(
                ((global.BK && global.BK.badges && global.BK.badges.RARITIES) || [])
                    .map(function (r) { return [r.id, r.name]; })), 'all');
            var grantFilter = h('div', 'bkc-filters');
            badgeSearch.className = 'bkc-input bkc-grow';
            grantFilter.appendChild(badgeSearch);
            grantFilter.appendChild(raritySel);
            grantBox.appendChild(grantFilter);

            var selectHost = h('div');
            grantBox.appendChild(selectHost);
            var previewHost = h('p', 'bkc-hint');
            grantBox.appendChild(previewHost);

            function paintPreview() {
                var meta = badgeMeta(S.badges.badgeId);
                var rar = ((global.BK && global.BK.badges && global.BK.badges.RARITIES) || [])
                    .filter(function (x) { return x.id === meta.rarity; })[0];
                var scope = meta.adminOnly
                    ? (meta.exclusive === 'founder' ? 'chỉ hồ sơ Founder' : meta.exclusive === 'dev' ? 'khung Developer' : 'Administrator')
                    : 'tự động';
                previewHost.textContent = 'Xem trước: ' + meta.name + ' — ' + (meta.desc || '') +
                    ' · ' + (rar ? rar.name : (meta.rarity || '')) +
                    (meta.goal > 1 ? ' · mục tiêu ' + meta.goal : '') + ' · ' + scope;
            }
            function paintBadgeSelect() {
                selectHost.textContent = '';
                var q = String(badgeSearch.value || '').trim().toLowerCase();
                var rarity = raritySel.value || 'all';
                var list = (catalog.length ? catalog : []).filter(function (b) {
                    if (b.id === 'none') return false;
                    if (rarity !== 'all' && b.rarity !== rarity) return false;
                    if (!q) return true;
                    return (b.id + ' ' + b.name + ' ' + (b.desc || '')).toLowerCase().indexOf(q) !== -1;
                });
                if (!list.length) {
                    selectHost.appendChild(alertBox('Không có badge nào khớp bộ lọc.', 'info'));
                    previewHost.textContent = '';
                    return;
                }
                var current = S.badges.badgeId;
                if (!list.some(function (b) { return b.id === current; })) current = list[0].id;
                S.badges.badgeId = current;
                var badgeSelect = selectBox(list.map(function (b) {
                    var mark = b.adminOnly
                        ? (b.exclusive === 'founder' ? '★ Founder' : b.exclusive === 'dev' ? '◆ Dev' : '✦ Admin')
                        : '• Tự động';
                    return [b.id, mark + ' · ' + b.name];
                }), current, function (v) { S.badges.badgeId = v; paintPreview(); });
                selectHost.appendChild(fieldRow('Badge cần trao', badgeSelect));
                paintPreview();
            }
            badgeSearch.addEventListener('input', paintBadgeSelect);
            raritySel.addEventListener('change', paintBadgeSelect);
            paintBadgeSelect();

            var reason = input('text', 'Lý do trao (không bắt buộc, tối đa 200 ký tự)…', S.badges.reason || '');
            reason.maxLength = 200;
            reason.addEventListener('input', function () { S.badges.reason = reason.value; });
            grantBox.appendChild(fieldRow('Lý do', reason));
            var grantBtn = btn('Trao badge', 'bkc-btn-primary', function () {
                grantBtn.disabled = true;
                api('badges.grant', {
                    id: row.id,
                    badge_id: S.badges.badgeId,
                    reason: reason.value.trim()
                }).then(function (data) {
                    grantBtn.disabled = false;
                    S.badges.badges = data.badges || [];
                    toast('Đã trao badge ' + badgeMeta(S.badges.badgeId).name, 'success');
                    paintList(S.badges.badges);
                }).catch(function (err) {
                    grantBtn.disabled = false;
                    fail(err);
                });
            }, 'fa-award');
            var grantActions = h('div', 'bkc-actions');
            grantActions.appendChild(grantBtn);
            grantBox.appendChild(grantActions);
            selectedHost.appendChild(grantBox);

            /* Cấp hàng loạt: tính lại badge tự động + cấp trọn bộ badge thường.
               Cả hai đều chạy phía máy chủ và ghi audit log. */
            var bulkBox = h('div', 'bkc-grant-box bkc-bulk-box');
            bulkBox.appendChild(h('h4', 'bkc-sec-title', 'Cấp thành tích hàng loạt'));
            bulkBox.appendChild(h('p', 'bkc-hint',
                'Cấp tự động dùng đúng quy tắc của student-profile. Cấp trọn bộ bỏ qua badge Founder ' +
                'và toàn bộ badge Developer độc quyền; badge đã có không bị nhân đôi.'));
            var bulkActions = h('div', 'bkc-actions');
            var autoBtn = btn('Cấp thành tích tự động', '', function () {
                autoBtn.disabled = true;
                bulkResult.textContent = '';
                loading(bulkResult, 'Đang tính lại thành tích tự động…');
                api('badges.autoGrant', { id: row.id }).then(function (data) {
                    bulkResult.textContent = '';
                    var earned = data.earned || [];
                    bulkResult.appendChild(alertBox(
                        earned.length
                            ? 'Đã cấp ' + earned.length + ' thành tích tự động còn thiếu.'
                            : 'Không có thành tích tự động mới — hồ sơ đã đạt mọi điều kiện hiện tại.',
                        'success'));
                    S.badges.badges = data.badges || [];
                    paintList(S.badges.badges);
                    toast('Đã tính lại thành tích tự động.', 'success');
                }).catch(function (err) {
                    bulkResult.textContent = '';
                    bulkResult.appendChild(alertBox((err && err.message) || 'Không cấp được thành tích tự động.', 'error'));
                }).then(function () { autoBtn.disabled = false; });
            }, 'fa-wand-magic-sparkles');
            bulkActions.appendChild(autoBtn);

            var allBtn = btn('Cấp toàn bộ badge', 'bkc-btn-primary', function () {
                var run = function () {
                    allBtn.disabled = true;
                    bulkResult.textContent = '';
                    loading(bulkResult, 'Đang cấp trọn bộ thành tích…');
                    api('badges.grantAll', { id: row.id }).then(function (data) {
                        bulkResult.textContent = '';
                        var parts = [];
                        parts.push('Đã thêm ' + (data.added || 0) + ' badge');
                        if (data.alreadyOwned) parts.push((data.alreadyOwned) + ' badge đã có sẵn');
                        if ((data.excluded || []).length) parts.push('bỏ qua ' + data.excluded.length + ' badge độc quyền');
                        if ((data.failed || []).length) parts.push('lỗi ' + data.failed.length + ' badge');
                        bulkResult.appendChild(alertBox(parts.join(' · ') + '.', (data.failed || []).length ? 'warn' : 'success'));
                        if (S.badges.selected && S.badges.selected.id === row.id) {
                            api('badges.list', { id: row.id }).then(function (fresh) {
                                S.badges.badges = fresh.badges || [];
                                paintList(S.badges.badges);
                            }).catch(function () { });
                        }
                        toast('Đã cấp trọn bộ badge thường cho ' + row.display_name + '.', 'success');
                    }).catch(function (err) {
                        bulkResult.textContent = '';
                        bulkResult.appendChild(alertBox((err && err.message) || 'Không cấp được trọn bộ badge.', 'error'));
                    }).then(function () { allBtn.disabled = false; });
                };
                if (global.BK && global.BK.ui && global.BK.ui.confirm) {
                    global.BK.ui.confirm({
                        title: 'Cấp toàn bộ badge?',
                        message: 'Trao mọi badge thường cho ' + row.display_name + '. Bỏ qua badge Founder và '
                            + 'hai badge Developer độc quyền. Thao tác được ghi nhật ký và không xoá badge đã có.',
                        ok: 'Cấp trọn bộ', danger: false
                    }).then(function (yes) { if (yes) run(); });
                } else if (global.confirm('Cấp toàn bộ badge thường cho ' + row.display_name + '?')) {
                    run();
                }
            }, 'fa-layer-group');
            bulkActions.appendChild(allBtn);
            bulkBox.appendChild(bulkActions);
            var bulkResult = h('div');
            bulkBox.appendChild(bulkResult);
            selectedHost.appendChild(bulkBox);

            var listHost = h('div');
            selectedHost.appendChild(listHost);
            loading(listHost, 'Đang tải thành tích…');

            api('badges.list', { id: row.id }).then(function (data) {
                S.badges.badges = data.badges || [];
                paintList(S.badges.badges);
            }).catch(function (err) {
                listHost.textContent = '';
                listHost.appendChild(alertBox(profilesErrorText(err), 'error'));
            });

            function paintList(badges) {
                listHost.textContent = '';
                if (!badges.length) {
                    emptyState(listHost, 'fa-medal', 'Chưa có thành tích',
                        'Badge tự động xuất hiện sau khi máy chủ xác minh tiến trình đã đồng bộ.');
                    return;
                }
                var grid = h('div', 'bkc-badge-grid');
                badges.forEach(function (b) {
                    var meta = badgeMeta(b.badge_id);
                    var tile = h('div', 'bkc-badge-tile' + (b.kind === 'admin' ? ' is-admin' : ''));
                    var ic = h('span', 'bkc-badge-ic');
                    ic.appendChild(icon(meta.icon || 'fa-medal'));
                    tile.appendChild(ic);
                    var body = h('div', 'bkc-badge-body');
                    body.appendChild(h('b', null, meta.name));
                    body.appendChild(h('span', 'bkc-row-sub',
                        (b.manual_granted || b.kind === 'admin' ? 'Administrator trao' : 'Tự động') +
                        (b.auto_earned ? ' + tự động đạt' : '') + ' · ' + fmt(b.awarded_at)));
                    if (b.reason) body.appendChild(h('span', 'bkc-hint', b.reason));
                    tile.appendChild(body);

                    var tileActs = h('div', 'bkc-badge-acts');
                    if (b.manual_granted || b.kind === 'admin') {
                        tileActs.appendChild(btn('Thu hồi', 'bkc-btn-danger bkc-btn-xs', function () {
                            confirmDelete('badge Administrator trao tay', meta.name, function () {
                                api('badges.revoke', { id: row.id, badge_id: b.badge_id }).then(function () {
                                    toast('Đã thu hồi badge ' + meta.name, 'success');
                                    api('badges.list', { id: row.id }).then(function (fresh) {
                                        S.badges.badges = fresh.badges || [];
                                        paintList(S.badges.badges);
                                    });
                                }).catch(function (err) { fail(err); });
                            });
                        }, 'fa-rotate-left'));
                    } else {
                        tileActs.appendChild(pill('Máy chủ xác minh', 'ok'));
                    }
                    tile.appendChild(tileActs);
                    makeBadgeTappable(tile, b.badge_id, {
                        owned: true, ownedDate: b.awarded_at,
                        kind: b.manual_granted || b.kind === 'admin' ? 'admin' : 'auto',
                        reason: b.reason, studentName: row.display_name
                    });
                    grid.appendChild(tile);
                });
                listHost.appendChild(grid);
                listHost.appendChild(h('p', 'bkc-hint',
                    'Badge tự động không có nút thu hồi: máy chủ tính lại từ tiến trình đã đồng bộ và sẽ tự gỡ nếu điều kiện không còn.'));
            }
        }

        paintSelected();
        loadStudents();
    }

    /* --------------------------- Chat kiểm duyệt -------------------------- */
    function chatKinds() {
        return [['global', 'Phòng chung'], ['dm', 'Tin nhắn riêng'], ['group', 'Nhóm nhỏ']];
    }
    function chatRoomTitle(room) {
        if (!room) return '—';
        if (room.title) return room.title;
        if (room.kind === 'global') return 'Phòng chung Bá Khí';
        if (room.kind === 'dm') return 'Hội thoại riêng';
        return 'Nhóm chưa đặt tên';
    }
    function chatErrorText(err) {
        var msg = (err && err.message) || 'Không tải được dữ liệu Chat.';
        if (/does not exist|schema cache|could not find the table|relation|42P01|404|not found/i.test(msg)) {
            return 'Máy chủ Chat chưa được triển khai. Chạy migration 20261120000000_bakhi_chat.sql và deploy Edge Function chat-api để bật mô-đun này.';
        }
        return msg;
    }
    function chatMessagePreview(message) {
        if (!message) return '—';
        if (message.deleted_at) return 'Tin nhắn đã được xoá';
        if (message.image_path) return '[Ảnh]';
        return String(message.body || '').slice(0, 80) || '—';
    }

    function renderChatAdmin(pane) {
        var roomsCard = card('Phòng chat', [
            iconBtn('fa-rotate', 'Làm mới danh sách phòng', function () { loadRooms(); })
        ], 'Kiểm duyệt phòng chung, tin nhắn riêng và nhóm nhỏ. Mọi thao tác xoá/khoá đều được ghi nhật ký.');
        pane.appendChild(roomsCard.root);

        roomsCard.body.appendChild(alertBox(
            'Phòng chung không thể xoá và không có danh sách thành viên để gỡ. ' +
            'Tin nhắn bị xoá là xoá mềm: học sinh vẫn thấy “Tin nhắn đã được xoá”.', 'info'));

        var roomsHost = h('div');
        roomsCard.body.appendChild(roomsHost);

        function loadRooms() {
            roomsHost.textContent = '';
            loading(roomsHost, 'Đang tải phòng chat…');
            api('chat.rooms', { limit: 60 }).then(function (data) {
                roomsHost.textContent = '';
                S.chat.rooms = data.rooms || [];
                if (!S.chat.rooms.length) {
                    emptyState(roomsHost, 'fa-comments', 'Chưa có phòng chat',
                        'Phòng chung được tạo tự động khi migration chạy; phòng riêng và nhóm do học sinh mở.');
                    return;
                }
                var t = table(['Loại', 'Tên', 'Thành viên', 'Tin nhắn', 'Tin cuối', 'Hoạt động cuối', 'Thao tác']);
                S.chat.rooms.forEach(function (room) {
                    var tr = h('tr');
                    tr.appendChild(h('td', null, labelOf(chatKinds(), room.kind)));
                    tr.appendChild(h('td', null, chatRoomTitle(room)));
                    tr.appendChild(h('td', null, room.member_count == null ? '—' : room.member_count));
                    tr.appendChild(h('td', null, room.message_count == null ? '—' : room.message_count));
                    tr.appendChild(h('td', null, chatMessagePreview(room.last_message)));
                    tr.appendChild(h('td', null, fmt(room.last_message_at || room.created_at)));
                    var acts = h('td');
                    var rowActs = h('div', 'bkc-row-actions');
                    rowActs.appendChild(btn('Mở', '', function () { openRoom(room); }, 'fa-folder-open'));
                    acts.appendChild(rowActs);
                    tr.appendChild(acts);
                    t.tbody.appendChild(tr);
                });
                roomsHost.appendChild(t.wrap);
            }).catch(function (err) {
                roomsHost.textContent = '';
                roomsHost.appendChild(alertBox(chatErrorText(err), 'error'));
            });
        }

        function openRoom(room) {
            var sheet = openSheet({
                wide: true,
                tags: [['bkc-tag-general', labelOf(chatKinds(), room.kind)],
                    room.kind === 'global' ? ['', 'Bảo vệ'] : ['bkc-tag-important', 'Có thể xoá']],
                title: chatRoomTitle(room),
                body: function (host) {
                    loading(host, 'Đang tải hội thoại…');
                    api('chat.messages', { room_id: room.id, limit: 100 }).then(function (data) {
                        host.textContent = '';
                        var members = data.members || [];
                        var messages = data.messages || [];

                        var memberCard = h('div', 'bkc-chat-members');
                        memberCard.appendChild(h('h4', 'bkc-sec-title', 'Thành viên (' + members.length + ')'));
                        if (!members.length) {
                            memberCard.appendChild(h('p', 'bkc-hint',
                                room.kind === 'global' ? 'Phòng chung không lưu danh sách thành viên.'
                                    : 'Chưa có thành viên.'));
                        } else {
                            var mt = table(['Học sinh', 'Vai trò', 'Tham gia', 'Đọc cuối', 'Thao tác']);
                            members.forEach(function (m) {
                                var tr = h('tr');
                                tr.appendChild(h('td', null, m.display_name || 'Học sinh'));
                                tr.appendChild(h('td', null,
                                    m.role === 'owner' ? 'Trưởng nhóm' : 'Thành viên'));
                                tr.appendChild(h('td', null, fmt(m.joined_at)));
                                tr.appendChild(h('td', null, fmt(m.last_read_at)));
                                var acts = h('td');
                                var rowActs = h('div', 'bkc-row-actions');
                                if (room.kind !== 'global') {
                                    rowActs.appendChild(btn(m.muted ? 'Mở khoá' : 'Tạm khoá',
                                        m.muted ? '' : 'bkc-btn-danger', function () {
                                        api('chat.mute', {
                                            room_id: room.id, student_id: m.student_id, muted: !m.muted
                                        }).then(function () {
                                            toast(m.muted ? 'Đã mở khoá gửi tin' : 'Đã tạm khoá gửi tin', 'success');
                                            sheet.close();
                                            openRoom(room);
                                            loadRooms();
                                        }).catch(function (err) { fail(err); });
                                    }, m.muted ? 'fa-lock-open' : 'fa-comment-slash'));
                                    rowActs.appendChild(btn('Gỡ', 'bkc-btn-danger', function () {
                                        confirmDelete('thành viên khỏi phòng', m.display_name || 'Học sinh', function () {
                                            api('chat.member.remove', {
                                                room_id: room.id, student_id: m.student_id
                                            }).then(function () {
                                                toast('Đã gỡ thành viên khỏi phòng', 'success');
                                                sheet.close();
                                                openRoom(room);
                                                loadRooms();
                                            }).catch(function (err) { fail(err); });
                                        });
                                    }, 'fa-user-minus'));
                                } else {
                                    rowActs.appendChild(pill('Không áp dụng', 'off'));
                                }
                                acts.appendChild(rowActs);
                                tr.appendChild(acts);
                                mt.tbody.appendChild(tr);
                            });
                            memberCard.appendChild(mt.wrap);
                        }
                        host.appendChild(memberCard);

                        var thread = h('div', 'bkc-thread');
                        thread.appendChild(h('h4', 'bkc-sec-title', 'Tin nhắn gần nhất (' + messages.length + ')'));
                        if (!messages.length) {
                            emptyState(thread, 'fa-comment-dots', 'Chưa có tin nhắn',
                                'Tin nhắn sẽ xuất hiện khi học sinh trò chuyện trong phòng này.');
                        } else {
                            messages.forEach(function (m) {
                                var row = h('div', 'bkc-msg' + (m.deleted_at ? ' is-deleted' : ''));
                                var head = h('div', 'bkc-msg-head');
                                head.appendChild(h('b', null, m.sender_name || 'Học sinh'));
                                head.appendChild(h('span', 'bkc-row-sub', fmt(m.created_at)));
                                row.appendChild(head);
                                var body = h('div', 'bkc-msg-body');
                                if (m.deleted_at) {
                                    body.appendChild(h('em', null, 'Tin nhắn đã được xoá'));
                                } else if (m.image_path) {
                                    var url = '';
                                    try {
                                        if (global.BKCloud && global.BKCloud.storagePublicUrl) {
                                            url = global.BKCloud.storagePublicUrl('chat-images', m.image_path);
                                        }
                                    } catch (e) { url = ''; }
                                    if (/^https?:\/\//i.test(url)) {
                                        var img = h('img', 'bkc-msg-img');
                                        img.src = url;
                                        img.alt = 'Ảnh trong chat';
                                        img.loading = 'lazy';
                                        img.referrerPolicy = 'no-referrer';
                                        body.appendChild(img);
                                    } else {
                                        body.appendChild(h('span', 'bkc-hint', '[Ảnh]'));
                                    }
                                    if (m.body) body.appendChild(h('p', null, m.body));
                                } else {
                                    body.appendChild(h('p', null, m.body || ''));
                                }
                                row.appendChild(body);
                                if (!m.deleted_at) {
                                    var acts = h('div', 'bkc-msg-acts');
                                    acts.appendChild(btn('Xoá tin', 'bkc-btn-danger bkc-btn-xs', function () {
                                        confirmDelete('tin nhắn', chatMessagePreview(m), function () {
                                            api('chat.delete', { message_id: m.id }).then(function () {
                                                toast('Đã xoá tin nhắn', 'success');
                                                sheet.close();
                                                openRoom(room);
                                                loadRooms();
                                            }).catch(function (err) { fail(err); });
                                        });
                                    }, 'fa-trash-can'));
                                    row.appendChild(acts);
                                }
                                thread.appendChild(row);
                            });
                        }
                        host.appendChild(thread);

                        if (room.kind !== 'global') {
                            var danger = h('div', 'bkc-actions');
                            danger.appendChild(btn('Xoá toàn bộ phòng', 'bkc-btn-danger', function () {
                                confirmDelete('phòng chat', chatRoomTitle(room), function () {
                                    api('chat.room.delete', { room_id: room.id }).then(function () {
                                        toast('Đã xoá phòng chat', 'success');
                                        sheet.close();
                                        loadRooms();
                                    }).catch(function (err) { fail(err); });
                                });
                            }, 'fa-trash-can'));
                            host.appendChild(danger);
                        }
                    }).catch(function (err) {
                        host.textContent = '';
                        host.appendChild(alertBox(chatErrorText(err), 'error'));
                    });
                }
            });
            return sheet;
        }

        loadRooms();
    }

    /* ------------------------------ What's New ---------------------------- */
    function renderWhatsNewAdmin(pane) {
        var toggleCard = card("Khối “Cập nhật gần đây”", [
            iconBtn('fa-rotate', 'Tải lại trạng thái', function () { loadFlag(); })
        ], 'Chỉ trang chủ đăng ký data-bk-whatsnew; Studio và Word & Paint không bao giờ hiện khối này.');
        pane.appendChild(toggleCard.root);

        var toggleHost = h('div', 'bkc-form');
        toggleCard.body.appendChild(toggleHost);

        function loadFlag() {
            toggleHost.textContent = '';
            loading(toggleHost, 'Đang tải feature flag…');
            api('settings.get').then(function (data) {
                toggleHost.textContent = '';
                var list = data.settings || [];
                S.whatsnew.flags = list;
                var row = null;
                for (var i = 0; i < list.length; i++) if (list[i].key === 'public.whatsnew') row = list[i];
                if (!row) {
                    emptyState(toggleHost, 'fa-star', 'Chưa có feature flag public.whatsnew',
                        'Migration app_settings chưa tạo dữ liệu mặc định cho khoá này.');
                    return;
                }
                var value = row.value && typeof row.value === 'object' ? row.value : {};
                var enabled = value.enabled !== false;
                var status = h('div', 'bkc-summary-row');
                status.appendChild(pill(enabled ? 'Đang hiển thị' : 'Đang tắt', enabled ? 'ok' : 'off'));
                status.appendChild(pill('public.whatsnew'));
                toggleHost.appendChild(status);

                var box = checkbox('Hiển thị khối “Cập nhật gần đây” trên trang chủ', enabled);
                toggleHost.appendChild(box.root);

                var actions = h('div', 'bkc-actions');
                var save = btn('Lưu trạng thái', 'bkc-btn-primary', function () {
                    save.disabled = true;
                    api('settings.set', {
                        key: 'public.whatsnew', enabled: box.input.checked
                    }).then(function () {
                        save.disabled = false;
                        toast('Đã lưu — trình duyệt học sinh nhận cập nhật qua realtime', 'success');
                        loadFlag();
                    }).catch(function (err) {
                        save.disabled = false;
                        fail(err);
                    });
                }, 'fa-floppy-disk');
                actions.appendChild(save);
                actions.appendChild(btn('Mở trang chủ', 'bkc-btn-ghost', function () {
                    global.open(basePath() + 'index.html', '_blank', 'noopener');
                }, 'fa-house'));
                toggleHost.appendChild(actions);
                toggleHost.appendChild(h('p', 'bkc-hint',
                    'Cùng một khoá public.whatsnew cũng xuất hiện ở tab Cấu hình; cả hai nơi ghi qua settings.set và ghi nhật ký.'));
            }).catch(function (err) {
                toggleHost.textContent = '';
                toggleHost.appendChild(alertBox(err.message || 'Không tải được feature flag.', 'error'));
            });
        }

        var previewCard = card('Nội dung sẽ hiển thị', [
            iconBtn('fa-rotate', 'Tải lại changelog', function () { loadEntries(); })
        ], 'Lấy các phiên bản đã xuất bản mới nhất — không tạo bản ghi mới, không sửa bảng changelog.');
        pane.appendChild(previewCard.root);

        var previewHost = h('div', 'bkc-form');
        previewCard.body.appendChild(previewHost);

        function loadEntries() {
            previewHost.textContent = '';
            loading(previewHost, 'Đang tải phiên bản đã xuất bản…');
            api('changelog.list', { status: 'published', limit: 8 }).then(function (data) {
                previewHost.textContent = '';
                S.whatsnew.entries = data.changelog || [];
                if (!S.whatsnew.entries.length) {
                    emptyState(previewHost, 'fa-code-branch', 'Chưa có phiên bản nào được xuất bản',
                        'Xuất bản changelog ở tab Changelog để khối “Cập nhật gần đây” có nội dung.');
                    return;
                }
                var t = table(['Phiên bản', 'Tiêu đề', 'Xuất bản', 'Nguồn', 'Xem trước']);
                S.whatsnew.entries.forEach(function (entry) {
                    var tr = h('tr');
                    tr.appendChild(h('td', 'bkc-code', entry.version || '—'));
                    tr.appendChild(h('td', null, entry.title || '—'));
                    tr.appendChild(h('td', null, fmt(entry.published_at || entry.created_at)));
                    tr.appendChild(h('td', null, entry.source === 'github' ? 'GitHub Actions' : 'Quản trị viên'));
                    var acts = h('td');
                    var rowActs = h('div', 'bkc-row-actions');
                    rowActs.appendChild(btn('Xem', '', function () {
                        previewChangelog(entry, null);
                    }, 'fa-eye'));
                    acts.appendChild(rowActs);
                    tr.appendChild(acts);
                    t.tbody.appendChild(tr);
                });
                previewHost.appendChild(t.wrap);
                previewHost.appendChild(h('p', 'bkc-hint',
                    'Đây chỉ là bản xem trước. Muốn sửa nội dung, dùng tab Changelog; muốn tắt khối, dùng công tắc phía trên.'));
            }).catch(function (err) {
                previewHost.textContent = '';
                previewHost.appendChild(alertBox(err.message || 'Không tải được changelog.', 'error'));
            });
        }

        loadFlag();
        loadEntries();
    }

    /* ------------------------------ Activity Logs ------------------------- */
    function renderLogs(pane) {
        var c = card('Nhật ký hoạt động', [
            btn('Xuất CSV', 'bkc-btn-ghost', function () { exportLogs(); }, 'fa-file-csv'),
            btn('Làm mới', 'bkc-btn-ghost', function () { load(); }, 'fa-rotate')
        ], 'Mọi thao tác quản trị được máy chủ ghi lại kèm thời gian.');
        pane.appendChild(c.root);

        var filters = h('div', 'bkc-filters');
        var search = input('search', 'Tìm hành động, đối tượng, ID…', S.logs.q || '');
        search.className = 'bkc-input bkc-grow';
        var targetSel = selectBox([['', 'Tất cả đối tượng'], ['student', 'student'], ['announcement', 'announcement'],
            ['changelog', 'changelog'], ['session', 'session'], ['setting', 'setting']], S.logs.target || '');
        var from = input('date', '', S.logs.from || '');
        from.title = 'Từ ngày';
        var to = input('date', '', S.logs.to || '');
        to.title = 'Đến ngày';
        filters.appendChild(search);
        filters.appendChild(targetSel);
        filters.appendChild(from);
        filters.appendChild(to);
        filters.appendChild(btn('Lọc', '', function () {
            S.logs.q = search.value.trim();
            S.logs.target = targetSel.value;
            S.logs.from = from.value;
            S.logs.to = to.value;
            S.logs.page = 1;
            load();
        }, 'fa-filter'));
        c.body.appendChild(filters);

        var host = h('div');
        c.body.appendChild(host);
        var pageHost = h('div', 'bkc-pager');
        c.body.appendChild(pageHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                S.logs.q = search.value.trim();
                S.logs.page = 1;
                load();
            }
        });
        targetSel.addEventListener('change', function () {
            S.logs.target = targetSel.value;
            S.logs.page = 1;
            load();
        });

        function filtersPayload() {
            return {
                q: S.logs.q || '', target: S.logs.target || undefined,
                from: S.logs.from || undefined, to: S.logs.to || undefined
            };
        }

        function load() {
            host.textContent = '';
            loading(host, 'Đang tải nhật ký…');
            pageHost.textContent = '';
            var params = filtersPayload();
            params.limit = S.logs.limit || 100;
            params.offset = (Math.max(1, S.logs.page) - 1) * (S.logs.limit || 100);
            api('logs.list', params).then(function (data) {
                host.textContent = '';
                S.logs.list = data.logs || [];
                S.logs.total = data.total || S.logs.list.length;
                var pages = Math.max(1, Math.ceil(S.logs.total / (S.logs.limit || 100)));
                if (S.logs.page > pages) {
                    S.logs.page = pages;
                    load();
                    return;
                }
                if (!S.logs.list.length) {
                    emptyState(host, 'fa-clock-rotate-left', 'Chưa có hoạt động nào',
                        S.logs.q || S.logs.target || S.logs.from || S.logs.to
                            ? 'Không có dòng nào khớp bộ lọc hiện tại.'
                            : 'Các thao tác quản trị sẽ xuất hiện tại đây.');
                } else {
                    var t = table(['Thời gian', 'Hành động', 'Đối tượng', 'Chi tiết', '']);
                    S.logs.list.forEach(function (log) {
                        var tr = h('tr');
                        tr.appendChild(h('td', null, fmt(log.created_at)));
                        tr.appendChild(h('td', 'bkc-code', log.action));
                        tr.appendChild(h('td', null, (log.target_type || '—') + (log.target_id ? ' · ' + log.target_id : '')));
                        var detail = h('td');
                        var raw = JSON.stringify(log.detail || {}, null, 2);
                        detail.appendChild(h('pre', 'bkc-pre', raw));
                        tr.appendChild(detail);
                        var act = h('td');
                        act.appendChild(iconBtn('fa-copy', 'Sao chép chi tiết', function () {
                            copyText(raw, 'Đã sao chép chi tiết');
                        }, 'bkc-icon-btn-xs'));
                        tr.appendChild(act);
                        t.tbody.appendChild(tr);
                    });
                    host.appendChild(t.wrap);
                }
                renderPager(pageHost, {
                    total: S.logs.total, page: S.logs.page, pageSize: S.logs.limit || 100,
                    unit: 'dòng', sizes: [60, 100, 200],
                    onPage: function (p) { S.logs.page = p; load(); },
                    onSize: function (n) { S.logs.limit = n; S.logs.page = 1; load(); }
                });
            }).catch(function (err) {
                host.textContent = '';
                host.appendChild(alertBox(err.message || 'Không tải được nhật ký.', 'error'));
            });
        }

        function exportLogs() {
            var params = filtersPayload();
            toast('Đang chuẩn bị tệp CSV từ máy chủ…', 'info');
            api('logs.export', params).then(function (data) {
                if (!data.csv) throw new Error('Máy chủ không trả về dữ liệu CSV.');
                download(data.filename || ('bakhi-activity-' + Date.now() + '.csv'),
                    '\ufeff' + data.csv, 'text/csv;charset=utf-8');
                toast('Đã xuất ' + (data.rows || 0) + ' dòng nhật ký', 'success');
            }).catch(function (err) { fail(err); });
        }

        load();
    }

    /* ------------------------------- Monitoring --------------------------- */
    function renderMonitoring(pane) {
        var c = card('Sức khoẻ hệ thống', [
            btn('Kiểm tra lại', 'bkc-btn-ghost', function () { load(); }, 'fa-heart-pulse')
        ], 'Đọc trực tiếp từ Supabase: số bản ghi, phiên quản trị, lỗi đồng bộ và độ trễ.');
        pane.appendChild(c.root);
        var host = h('div');
        c.body.appendChild(host);

        function load() {
            host.textContent = '';
            loading(host, 'Đang kiểm tra máy chủ…');
            api('system.health').then(function (data) {
                host.textContent = '';
                var counts = data.counts || {};
                var secrets = data.secrets || {};

                var summary = h('div', 'bkc-summary-row');
                summary.appendChild(pill(data.dbOk ? 'Cơ sở dữ liệu: OK' : 'Cơ sở dữ liệu: có lỗi',
                    data.dbOk ? 'ok' : 'off'));
                summary.appendChild(pill('Độ trễ: ' + (data.latencyMs == null ? '—' : data.latencyMs + ' ms'),
                    (data.latencyMs || 0) < 800 ? 'ok' : 'warn'));
                summary.appendChild(pill('Kiểm tra: ' + fmt(data.checkedAt)));
                host.appendChild(summary);

                var grid = h('div', 'bkc-grid');
                statCard(grid, 'Học sinh', counts.students, (counts.studentsActive || 0) + ' đang hoạt động', 'fa-users', 'indigo');
                statCard(grid, 'Thiết bị', counts.devices, 'Đã nhận diện', 'fa-mobile-screen', 'sky');
                statCard(grid, 'Tiến trình', counts.progressRows, 'Bản ghi đồng bộ', 'fa-chart-line', 'green');
                statCard(grid, 'Thông báo', counts.announcements, (counts.announcementsPublished || 0) + ' đang hiển thị', 'fa-bullhorn', 'purple');
                statCard(grid, 'Changelog', counts.changelog, 'Phiên bản đã lưu', 'fa-code-branch', 'indigo');
                statCard(grid, 'Nhật ký', counts.activity, 'Thao tác quản trị', 'fa-clock-rotate-left', 'slate');
                statCard(grid, 'Phiên quản trị', counts.adminSessions, 'Còn hiệu lực', 'fa-key', 'amber');
                statCard(grid, 'Lượt đọc', counts.reads, 'Announcement reads', 'fa-envelope-open', 'sky');
                host.appendChild(grid);

                var secretGrid = h('div', 'bkc-status-grid');
                secretGrid.appendChild(statusItem('ADMIN_DEV_CODE', secrets.adminDevCode,
                    secrets.adminDevCode ? 'Đã đặt secret' : 'Thiếu secret', 'Dùng để xác thực Administrator.'));
                secretGrid.appendChild(statusItem('service_role', secrets.serviceRole,
                    secrets.serviceRole ? 'Đã đặt secret' : 'Thiếu secret', 'Chỉ tồn tại phía Edge Function.'));
                secretGrid.appendChild(statusItem('STUDENT_ROSTER_SECRET', secrets.rosterSecret,
                    secrets.rosterSecret ? 'Đã đặt secret' : 'Chưa đặt', 'Bảo vệ endpoint import danh sách.'));
                host.appendChild(secretGrid);

                var latestSection = h('div');
                latestSection.appendChild(h('h4', 'bkc-sec-title', 'Phiên bản mới nhất'));
                if (!data.latestVersion) {
                    emptyState(latestSection, 'fa-tag', 'Chưa có changelog', 'Phiên bản đầu tiên sẽ xuất hiện tại đây.');
                } else {
                    var lv = data.latestVersion;
                    var latestRow = h('div', 'bkc-status-grid');
                    latestRow.appendChild(infoItem('Phiên bản', lv.version || '—',
                        lv.title || '', 'ok'));
                    latestRow.appendChild(infoItem('Xuất bản', fmt(lv.published_at), 'Thời điểm hiển thị', 'info'));
                    latestRow.appendChild(infoItem('Nguồn', lv.source === 'github' ? 'GitHub Actions'
                        : lv.source === 'admin' ? 'Quản trị viên' : '—', 'Nơi tạo bản ghi', 'info'));
                    latestRow.appendChild(infoItem('Đồng bộ', lv.sync_state || '—',
                        lv.synced_at ? fmt(lv.synced_at) : 'Chưa đồng bộ', lv.sync_state === 'failed' ? 'off' : 'ok'));
                    latestSection.appendChild(latestRow);
                }
                host.appendChild(latestSection);

                var failSection = h('div');
                failSection.appendChild(h('h4', 'bkc-sec-title', 'Lỗi đồng bộ changelog'));
                if (!(data.syncFailures || []).length) {
                    failSection.appendChild(alertBox('Không có lỗi đồng bộ nào được ghi nhận.', 'ok'));
                } else {
                    var ft = table(['Phiên bản', 'Nguồn', 'Lỗi', 'Lúc']);
                    data.syncFailures.forEach(function (f) {
                        var tr = h('tr');
                        tr.appendChild(h('td', 'bkc-code', f.version));
                        tr.appendChild(h('td', null, f.source === 'github' ? 'GitHub' : (f.source || '—')));
                        tr.appendChild(h('td', null, f.sync_error || '—'));
                        tr.appendChild(h('td', null, fmt(f.synced_at)));
                        ft.tbody.appendChild(tr);
                    });
                    failSection.appendChild(ft.wrap);
                }
                host.appendChild(failSection);

                var recentSection = h('div');
                recentSection.appendChild(h('h4', 'bkc-sec-title', 'Hoạt động gần đây'));
                if (!(data.recentActivity || []).length) {
                    emptyState(recentSection, 'fa-clock-rotate-left', 'Chưa có hoạt động', 'Thao tác quản trị sẽ xuất hiện tại đây.');
                } else {
                    var act = h('div', 'bkc-activity');
                    data.recentActivity.forEach(function (log) {
                        var item = h('div', 'bkc-activity-item');
                        item.appendChild(h('span', 'bkc-activity-dot'));
                        var main = h('div', 'bkc-activity-main');
                        main.appendChild(h('b', null, log.action));
                        if (log.target_type) main.appendChild(h('span', null, ' · ' + log.target_type));
                        if (log.target_id) main.appendChild(h('span', 'bkc-activity-id', ' · ' + log.target_id));
                        item.appendChild(main);
                        item.appendChild(h('span', 'bkc-activity-time', fmt(log.created_at)));
                        act.appendChild(item);
                    });
                    recentSection.appendChild(act);
                }
                host.appendChild(recentSection);
            }).catch(function (err) {
                host.textContent = '';
                host.appendChild(alertBox(err.message || 'Không kiểm tra được hệ thống.', 'error'));
            });
        }

        load();
    }

    /* ------------------------------- Permissions -------------------------- */
    function renderPermissions(pane) {
        var c = card('Mô hình quyền hiện tại', [
            btn('Tải lại', 'bkc-btn-ghost', function () { load(); }, 'fa-rotate')
        ], 'Quyền được xác định phía máy chủ; dashboard chỉ hiển thị báo cáo.');
        pane.appendChild(c.root);
        var host = h('div');
        c.body.appendChild(host);

        var CAP_LABELS = {
            overview: 'Xem tổng quan', students: 'Xem học sinh', studentsWrite: 'Sửa học sinh',
            notifications: 'Quản lý thông báo', changelog: 'Quản lý changelog', logs: 'Xem nhật ký',
            monitoring: 'Giám sát hệ thống', settings: 'Cài đặt & feature flag',
            dataExport: 'Xuất dữ liệu', roles: 'Quản lý vai trò'
        };

        function load() {
            host.textContent = '';
            loading(host, 'Đang tải thông tin quyền…');
            api('permissions.get').then(function (data) {
                host.textContent = '';
                var role = data.role || {};
                host.appendChild(alertBox(
                    'Hệ thống hiện dùng một Administrator Code dùng chung. Chưa có danh tính quản trị riêng ' +
                    'nên không thể cấp quyền theo từng tài khoản.', 'warn'));

                var roleGrid = h('div', 'bkc-status-grid');
                roleGrid.appendChild(infoItem('Vai trò', role.label || 'Administrator',
                    role.description || '', 'ok'));
                roleGrid.appendChild(infoItem('Chế độ xác thực', data.mode || 'single-admin-code',
                    'Phiên lưu trong sessionStorage của tab.', 'info'));
                if (data.session) {
                    roleGrid.appendChild(infoItem('Phiên hiện tại', data.session.id || '—',
                        'Tạo: ' + fmt(data.session.created_at), 'info'));
                    roleGrid.appendChild(infoItem('Hết hạn', fmt(data.session.expires_at),
                        'Dùng lần cuối: ' + fmt(data.session.last_used_at), 'warn'));
                }
                host.appendChild(roleGrid);

                var caps = data.capabilities || {};
                var t = table(['Quyền', 'Giá trị', 'Ghi chú']);
                Object.keys(CAP_LABELS).forEach(function (key) {
                    var tr = h('tr');
                    tr.appendChild(h('td', null, CAP_LABELS[key]));
                    var vCell = h('td');
                    vCell.appendChild(pill(caps[key] ? 'Được phép' : 'Chưa hỗ trợ', caps[key] ? 'ok' : 'off'));
                    tr.appendChild(vCell);
                    tr.appendChild(h('td', null, key === 'roles'
                        ? 'Cần mô hình nhiều quản trị viên trước khi bật.'
                        : 'Thực thi phía Edge Function admin-actions.'));
                    t.tbody.appendChild(tr);
                });
                host.appendChild(t.wrap);

                if (data.report_error) {
                    host.appendChild(alertBox('Không đọc được catalog quyền: ' + data.report_error, 'error'));
                }

                var fnList = data.functions || [];
                if (fnList.length) {
                    var fnCard = card('Hàm trong schema public (' + fnList.length + ')', null,
                        'Đọc từ pg_proc. Cột anon = true nghĩa là khách chưa đăng nhập cũng gọi được.');
                    var ft = table(['Hàm', 'SECURITY DEFINER', 'anon', 'authenticated', 'service_role']);
                    fnList.forEach(function (fn) {
                        var tr = h('tr');
                        tr.appendChild(h('td', 'bkc-code', fn.name || '—'));
                        var dCell = h('td');
                        dCell.appendChild(pill(fn.security_definer ? 'Có' : 'Không', fn.security_definer ? 'warn' : 'off'));
                        tr.appendChild(dCell);
                        [['anon_execute', 'warn'], ['authenticated_execute', 'ok'], ['service_execute', 'ok']]
                            .forEach(function (pair) {
                                var cell = h('td');
                                cell.appendChild(pill(fn[pair[0]] ? 'Có' : 'Không', fn[pair[0]] ? pair[1] : 'off'));
                                tr.appendChild(cell);
                            });
                        ft.tbody.appendChild(tr);
                    });
                    fnCard.body.appendChild(ft.wrap);
                    host.appendChild(fnCard.root);
                }

                var tblList = data.tables || [];
                if (tblList.length) {
                    var tbCard = card('Bảng & RLS (' + tblList.length + ')', null,
                        'RLS là lớp bảo vệ chính; quyền anon chỉ nên mở ở bảng công khai.');
                    var tt = table(['Bảng', 'RLS', 'Policy', 'anon SELECT', 'authenticated SELECT', 'anon INSERT', 'authenticated INSERT']);
                    tblList.forEach(function (tb) {
                        var tr = h('tr');
                        tr.appendChild(h('td', 'bkc-code', tb.name || '—'));
                        var rlsCell = h('td');
                        rlsCell.appendChild(pill(tb.rls_enabled ? 'Bật' : 'Tắt', tb.rls_enabled ? 'ok' : 'warn'));
                        tr.appendChild(rlsCell);
                        tr.appendChild(h('td', null, String(tb.policy_count == null ? '—' : tb.policy_count)));
                        [['anon_select', 'warn'], ['authenticated_select', 'ok'], ['anon_insert', 'warn'], ['authenticated_insert', 'ok']]
                            .forEach(function (pair) {
                                var cell = h('td');
                                cell.appendChild(pill(tb[pair[0]] ? 'Có' : 'Không', tb[pair[0]] ? pair[1] : 'off'));
                                tr.appendChild(cell);
                            });
                        tt.tbody.appendChild(tr);
                    });
                    tbCard.body.appendChild(tt.wrap);
                    host.appendChild(tbCard.root);
                }

                var polList = data.policies || [];
                if (polList.length) {
                    var polCard = card('Policy đang áp dụng (' + polList.length + ')', null,
                        'Đọc từ pg_policies — chỉ hiển thị, không sửa từ dashboard.');
                    var pt = table(['Bảng', 'Policy', 'Lệnh', 'Kiểu', 'Vai trò']);
                    polList.forEach(function (pol) {
                        var tr = h('tr');
                        tr.appendChild(h('td', 'bkc-code', pol.table_name || '—'));
                        tr.appendChild(h('td', null, pol.name || '—'));
                        tr.appendChild(h('td', null, pol.command || '—'));
                        tr.appendChild(h('td', null, pol.permissive ? 'Permissive' : 'Restrictive'));
                        tr.appendChild(h('td', null, (pol.roles || []).join(', ') || 'PUBLIC'));
                        pt.tbody.appendChild(tr);
                    });
                    polCard.body.appendChild(pt.wrap);
                    host.appendChild(polCard.root);
                }

                if ((data.limitations || []).length) {
                    var limitCard = card('Giới hạn đã biết', null, 'Không có thao tác giả lập nào được bật.');
                    data.limitations.forEach(function (text) {
                        limitCard.body.appendChild(alertBox(text, 'warn'));
                    });
                    host.appendChild(limitCard.root);
                }
            }).catch(function (err) {
                host.textContent = '';
                host.appendChild(alertBox(err.message || 'Không tải được thông tin quyền.', 'error'));
            });
        }

        load();
    }

    /* ---------------------------------- Data ------------------------------ */
    /* ------------------------------- Founder ------------------------------ */
    function renderFounder(pane) {
        /* 7.5.0: toàn bộ khu vực Founder được tách sang bk-founder.js (tìm người
           nhận, bộ chọn vật phẩm, xác nhận, báo cáo, lịch sử) để dashboard không
           còn một hàm 500 dòng với ba khối tìm kiếm trùng nhau. */
        if (global.BKFounder && typeof global.BKFounder.render === 'function') {
            global.BKFounder.render(pane, {
                h: h, icon: icon, btn: btn, iconBtn: iconBtn, input: input, card: card,
                alertBox: alertBox, table: table, emptyState: emptyState, loading: loading,
                toast: toast, api: api, gamificationApi: gamificationAdminApi, fmt: fmt
            });
            return;
        }
        pane.appendChild(alertBox('Không tải được mô-đun Founder Dashboard (bk-founder.js). Hãy tải lại trang.', 'error'));
    }

    function renderData(pane) {
        var integrityCard = card('Toàn vẹn dữ liệu', [
            btn('Kiểm tra lại', 'bkc-btn-ghost', function () { load(); }, 'fa-shield-halved')
        ], 'Chỉ đọc và đối chiếu — không tự động sửa hoặc xoá dữ liệu.');
        pane.appendChild(integrityCard.root);
        var host = h('div');
        integrityCard.body.appendChild(host);

        var exportCard = card('Xuất dữ liệu', null,
            'Tệp được tạo phía máy chủ với quyền quản trị. Không có thao tác xoá hàng loạt.');
        pane.appendChild(exportCard.root);
        var exportActions = h('div', 'bkc-actions');
        exportActions.appendChild(btn('Xuất học sinh (CSV)', 'bkc-btn-ghost', function () {
            toast('Đang chuẩn bị tệp CSV từ máy chủ…', 'info');
            api('students.export').then(function (data) {
                if (!data.csv) throw new Error('Máy chủ không trả về dữ liệu CSV.');
                download(data.filename || ('bakhi-students-' + Date.now() + '.csv'),
                    '\ufeff' + data.csv, 'text/csv;charset=utf-8');
                toast('Đã xuất ' + (data.rows || 0) + ' hồ sơ học sinh', 'success');
            }).catch(function (err) { fail(err); });
        }, 'fa-user-graduate'));
        exportActions.appendChild(btn('Xuất nhật ký (CSV)', 'bkc-btn-ghost', function () {
            toast('Đang chuẩn bị tệp CSV từ máy chủ…', 'info');
            api('logs.export').then(function (data) {
                if (!data.csv) throw new Error('Máy chủ không trả về dữ liệu CSV.');
                download(data.filename || ('bakhi-activity-' + Date.now() + '.csv'),
                    '\ufeff' + data.csv, 'text/csv;charset=utf-8');
                toast('Đã xuất ' + (data.rows || 0) + ' dòng nhật ký', 'success');
            }).catch(function (err) { fail(err); });
        }, 'fa-clock-rotate-left'));
        exportCard.body.appendChild(exportActions);
        exportCard.body.appendChild(h('p', 'bkc-hint',
            'Dữ liệu học tập của học sinh vẫn nằm nguyên trên máy chủ; xuất CSV chỉ tạo bản sao để kiểm tra.'));

        function load() {
            host.textContent = '';
            loading(host, 'Đang kiểm tra toàn vẹn dữ liệu…');
            api('data.integrity').then(function (data) {
                host.textContent = '';
                var totals = data.totals || {};
                var summary = h('div', 'bkc-summary-row');
                summary.appendChild(pill(data.issues ? data.issues + ' vấn đề' : 'Không có vấn đề',
                    data.issues ? 'warn' : 'ok'));
                summary.appendChild(pill(totals.students + ' học sinh'));
                summary.appendChild(pill((totals.settings || 0) + ' cài đặt'));
                summary.appendChild(pill('Kiểm tra: ' + fmt(data.checkedAt)));
                host.appendChild(summary);

                var t = table(['Hạng mục', 'Trạng thái', 'Số lượng', 'Chi tiết']);
                (data.checks || []).forEach(function (check) {
                    var tr = h('tr');
                    tr.appendChild(h('td', null, check.label));
                    var stCell = h('td');
                    stCell.appendChild(pill(check.status === 'ok' ? 'OK'
                        : check.status === 'warn' ? 'Cần xem' : 'Lỗi',
                        check.status === 'ok' ? 'ok' : check.status === 'warn' ? 'warn' : 'off'));
                    tr.appendChild(stCell);
                    tr.appendChild(h('td', 'bkc-code', check.count == null ? '—' : check.count));
                    tr.appendChild(h('td', null, check.detail || '—'));
                    t.tbody.appendChild(tr);
                });
                host.appendChild(t.wrap);

                var detailCard = card('Cài đặt đang áp dụng', [
                    btn('Xuất báo cáo JSON', 'bkc-btn-ghost', function () {
                        downloadJson('bakhi-integrity-' + Date.now() + '.json', data);
                    }, 'fa-download')
                ], 'Feature flag công khai và thời điểm cập nhật.');
                if (!(data.settings || []).length) {
                    emptyState(detailCard.body, 'fa-sliders', 'Chưa có cài đặt', 'Các feature flag sẽ xuất hiện tại đây.');
                } else {
                    var st = table(['Khoá', 'Giá trị', 'Cập nhật']);
                    data.settings.forEach(function (row) {
                        var tr = h('tr');
                        tr.appendChild(h('td', 'bkc-code', row.key));
                        tr.appendChild(h('td', 'bkc-code', JSON.stringify(row.value)));
                        tr.appendChild(h('td', null, fmt(row.updated_at)));
                        st.tbody.appendChild(tr);
                    });
                    detailCard.body.appendChild(st.wrap);
                }
                host.appendChild(detailCard.root);
            }).catch(function (err) {
                host.textContent = '';
                host.appendChild(alertBox(err.message || 'Không kiểm tra được dữ liệu.', 'error'));
            });
        }

        load();
    }

    /* --------------------------------- Settings --------------------------- */
    /* ------------------------------ Bảo trì ------------------------------- */
    function renderMaintenance(pane) {
        var cardEl = card('Bảo trì toàn website', [
            iconBtn('fa-rotate', 'Tải lại cấu hình bảo trì', function () { load(); })
        ], 'Khi bật, mọi trang public hiển thị thông báo bảo trì. Administrator đã đăng nhập vẫn vào được Dashboard.');
        pane.appendChild(cardEl.root);
        cardEl.body.appendChild(alertBox(
            'Trạng thái được lưu ở app_settings.public.maintenance và đọc qua Supabase. Tắt bảo trì không xoá dữ liệu, ' +
            'không vô hiệu hoá đăng nhập. Chỉ phiên Administrator hợp lệ mới ghi được.', 'info'));

        var host = h('div', 'bkc-form');
        cardEl.body.appendChild(host);

        var form = {};
        function toLocal(iso) {
            if (!iso) return '';
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            var p = function (n) { return n < 10 ? '0' + n : String(n); };
            return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
        }
        function preview() {
            var box = h('div', 'bkc-maint-preview');
            box.appendChild(h('h3', null, form.title.value || 'Bá Khí đang bảo trì'));
            box.appendChild(h('p', null, form.message.value || 'Website tạm đóng để nâng cấp. Dữ liệu học tập của bạn được giữ nguyên.'));
            if (form.reason.value) box.appendChild(h('p', 'bkc-row-sub', 'Lý do: ' + form.reason.value));
            if (form.startAt.value || form.endAt.value) {
                box.appendChild(h('p', 'bkc-row-sub',
                    (form.startAt.value ? 'Bắt đầu: ' + form.startAt.value : '') +
                    (form.startAt.value && form.endAt.value ? ' · ' : '') +
                    (form.endAt.value ? 'Dự kiến mở lại: ' + form.endAt.value : '')));
            }
            return box;
        }

        function paint(data) {
            host.textContent = '';
            var value = (data && data.value) || {};
            form = {};
            var enabled = checkbox('Đang bật bảo trì', value.enabled === true, function () { });
            host.appendChild(enabled.root);
            form.title = input('text', 'Tiêu đề thông báo…', value.title || 'Bá Khí đang bảo trì');
            form.title.maxLength = 120;
            host.appendChild(fieldRow('Tiêu đề', form.title));
            form.message = textarea('Nội dung hiển thị cho học sinh…', value.message || '', 3);
            form.message.maxLength = 1200;
            host.appendChild(fieldRow('Nội dung', form.message));
            form.reason = input('text', 'Lý do bảo trì…', value.reason || '');
            form.reason.maxLength = 400;
            host.appendChild(fieldRow('Lý do', form.reason));
            form.startAt = input('datetime-local', '', toLocal(value.startAt));
            host.appendChild(fieldRow('Bắt đầu', form.startAt));
            form.endAt = input('datetime-local', '', toLocal(value.endAt));
            host.appendChild(fieldRow('Dự kiến mở lại', form.endAt));

            var status = h('p', 'bkc-hint', value.enabled
                ? 'Trạng thái: ĐANG BẬT · cập nhật ' + (value.updatedAt ? fmt(value.updatedAt) : '—')
                : 'Trạng thái: đang tắt · cập nhật ' + (value.updatedAt ? fmt(value.updatedAt) : '—'));
            host.appendChild(status);

            /* Mốc bắt đầu do máy chủ/DB ghi, không phải ô nhập của người dùng. */
            var startedIso = value.maintenance_started_at || value.cycleStartedAt || null;
            host.appendChild(h('p', 'bkc-hint',
                'Thời gian bắt đầu (máy chủ): ' + (startedIso ? fmt(startedIso) : '—') +
                ' · Người bật: ' + (value.maintenance_started_by || '—')));
            host.appendChild(h('p', 'bkc-hint',
                'Administrator thường không thể bật/tắt bảo trì hoặc vượt qua màn hình bảo trì. ' +
                'Mọi thay đổi được máy chủ kiểm tra lại phạm vi phiên.'));

            var previewHost = h('div');
            previewHost.appendChild(preview());
            host.appendChild(previewHost);
            [form.title, form.message, form.reason, form.startAt, form.endAt].forEach(function (elx) {
                elx.addEventListener('input', function () {
                    previewHost.textContent = '';
                    previewHost.appendChild(preview());
                });
            });

            var actions = h('div', 'bkc-actions');
            actions.appendChild(btn('Lưu cấu hình', 'bkc-btn-primary', function () { save(false); }, 'fa-floppy-disk'));
            actions.appendChild(btn('Bật bảo trì', 'bkc-btn-danger', function () { confirmSave(true); }, 'fa-lock'));
            actions.appendChild(btn('Tắt bảo trì', 'bkc-btn-ghost', function () { confirmStop(); }, 'fa-lock-open'));
            host.appendChild(actions);

            function payload(on) {
                return {
                    key: 'public.maintenance',
                    enabled: on,
                    title: form.title.value.trim(),
                    message: form.message.value.trim(),
                    reason: form.reason.value.trim(),
                    startAt: form.startAt.value || null,
                    endAt: form.endAt.value || null
                };
            }
            function save(on, forceOff) {
                var body = payload(forceOff ? false : (on || enabled.input.checked));
                api('settings.set', body).then(function () {
                    toast(forceOff ? 'Đã tắt bảo trì.' : (body.enabled ? 'Đã bật bảo trì.' : 'Đã lưu cấu hình bảo trì.'), 'success');
                    load();
                }).catch(function (err) { fail(err); });
            }
            function confirmSave(on) {
                if (global.BK && global.BK.ui && global.BK.ui.confirm) {
                    global.BK.ui.confirm({
                        title: 'Bật bảo trì toàn website?',
                        message: 'Toàn bộ website công khai sẽ chuyển sang màn hình bảo trì ngay khi lưu. ' +
                            'Chỉ Founder đăng nhập được từ màn hình đó; Administrator vẫn bị khoá.',
                        ok: 'Bật bảo trì', danger: true
                    }).then(function (yes) { if (yes) save(on); });
                } else if (global.confirm('Bật bảo trì toàn website?')) save(on);
            }
            function confirmStop() {
                if (global.BK && global.BK.ui && global.BK.ui.confirm) {
                    global.BK.ui.confirm({
                        title: 'Tắt bảo trì toàn website?',
                        message: 'Mọi website sẽ hoạt động trở lại ngay khi lưu. Lịch sử bảo trì được giữ nguyên.',
                        ok: 'Tắt bảo trì', danger: false
                    }).then(function (yes) { if (yes) save(false, true); });
                } else if (global.confirm('Tắt bảo trì toàn website?')) save(false, true);
            }
        }

        function load() {
            host.textContent = '';
            loading(host, 'Đang tải cấu hình bảo trì…');
            api('settings.get').then(function (data) {
                var row = (data.settings || []).filter(function (x) { return x.key === 'public.maintenance'; })[0];
                paint(row || null);
            }).catch(function (err) {
                host.textContent = '';
                host.appendChild(alertBox((err && err.message) || 'Không tải được cấu hình bảo trì.', 'error'));
            });
        }
        load();

        /* --------------------------- Founder Access -------------------------- */
        if (isFounder()) {
            var access = card('Founder Access', [
                iconBtn('fa-rotate', 'Kiểm tra lại phiên Founder', function () { loadAccess(); })
            ], 'Phiên Founder được xác minh ở máy chủ (admin-actions: session.check). Đăng nhập Founder không làm thay đổi trạng thái bảo trì.');
            pane.appendChild(access.root);
            var accessHost = h('div', 'bkc-form');
            access.body.appendChild(accessHost);

            var loadAccess = function () {
                accessHost.textContent = '';
                loading(accessHost, 'Đang kiểm tra phiên Founder…');
                api('session.check').then(function (data) {
                    accessHost.textContent = '';
                    var grid = h('div', 'bkc-status-grid');
                    grid.appendChild(infoItem('Phiên Founder',
                        data.scope === 'founder' ? 'Còn hiệu lực' : 'Không phải Founder',
                        data.expiresAt ? 'Hết hạn: ' + fmt(data.expiresAt) : 'Máy chủ không trả hạn phiên.',
                        data.scope === 'founder' ? 'ok' : 'off'));
                    var mt = data.maintenance || {};
                    var startedIso = mt.maintenance_started_at || mt.cycleStartedAt || null;
                    grid.appendChild(infoItem('Bảo trì toàn hệ thống',
                        mt.enabled ? 'Đang bật' : 'Đang tắt',
                        mt.reason ? 'Lý do: ' + mt.reason : 'Chưa có lý do.',
                        mt.enabled ? 'warn' : 'ok'));
                    grid.appendChild(infoItem('Thời gian bắt đầu',
                        startedIso ? fmt(startedIso) : '—',
                        'Mốc do máy chủ/DB ghi, không lấy từ client.', 'info'));
                    grid.appendChild(infoItem('Máy chủ',
                        data.serverVersion || '—', 'Phiên bản admin-actions đang chạy.', 'info'));
                    accessHost.appendChild(grid);
                    var acts = h('div', 'bkc-actions');
                    acts.appendChild(btn('Mở trang bảo trì toàn cục', 'bkc-btn-ghost', function () {
                        window.open(basePath() + 'index.html', '_blank', 'noopener');
                    }, 'fa-lock'));
                    acts.appendChild(btn('Mở Founder Dashboard', 'bkc-btn-ghost', function () {
                        window.location.href = basePath() + 'founder/';
                    }, 'fa-crown'));
                    accessHost.appendChild(acts);
                    accessHost.appendChild(h('p', 'bkc-hint',
                        'Mọi website (trang chủ, trang môn học, chat, Studio) dùng chung màn hình bảo trì ' +
                        'với nút Đăng nhập Founder. Nút này dùng đúng mã và phiên của Founder Dashboard; ' +
                        'đăng nhập không tự động tắt bảo trì.'));
                }).catch(function (err) {
                    accessHost.textContent = '';
                    accessHost.appendChild(alertBox((err && err.message) || 'Không kiểm tra được phiên Founder.', 'error'));
                });
            };
            loadAccess();
        }

        /* ----------------------------- Lịch sử ----------------------------- */
        var historyCard = card('Lịch sử bảo trì', [
            iconBtn('fa-rotate', 'Tải lại lịch sử', function () { loadHistory(); })
        ], 'Mỗi chu kỳ bật/tắt bảo trì được ghi nhận: người thao tác, lý do, thời lượng và trạng thái.');
        pane.appendChild(historyCard.root);

        var historyFilters = h('div', 'bkc-filters');
        var historySearch = input('search', 'Tìm theo lý do hoặc người thao tác…', S.maintenance.q || '');
        historySearch.className = 'bkc-input bkc-grow';
        historyFilters.appendChild(historySearch);
        var historyStatus = selectBox([
            ['all', 'Mọi trạng thái'],
            ['active', 'Đang bảo trì'],
            ['completed', 'Đã kết thúc']
        ], S.maintenance.status || 'all', function (v) {
            S.maintenance.status = v;
            loadHistory();
        });
        historyFilters.appendChild(historyStatus);
        historyFilters.appendChild(btn('Tìm', '', function () {
            S.maintenance.q = historySearch.value.trim();
            loadHistory();
        }, 'fa-magnifying-glass'));
        historyCard.body.appendChild(historyFilters);
        historySearch.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                S.maintenance.q = historySearch.value.trim();
                loadHistory();
            }
        });

        var historySummary = h('div', 'bkc-summary-row');
        historyCard.body.appendChild(historySummary);
        var historyHost = h('div');
        historyCard.body.appendChild(historyHost);

        function durationText(seconds, startedAt, endedAt) {
            var secs = Number(seconds);
            if (!isFinite(secs) || secs < 0) {
                if (!startedAt) return '—';
                secs = Math.max(0, Math.round(((endedAt ? new Date(endedAt) : new Date()).getTime()
                    - new Date(startedAt).getTime()) / 1000));
            }
            if (!isFinite(secs)) return '—';
            var hh = Math.floor(secs / 3600);
            var mm = Math.floor((secs % 3600) / 60);
            var ss = secs % 60;
            if (hh) return hh + ' giờ ' + mm + ' phút';
            if (mm) return mm + ' phút ' + ss + ' giây';
            return ss + ' giây';
        }

        function loadHistory() {
            if (!historyHost.isConnected) return;
            historyHost.textContent = '';
            loading(historyHost, 'Đang tải lịch sử bảo trì…');
            api('maintenance.history', {
                q: S.maintenance.q || '',
                status: S.maintenance.status || 'all',
                limit: 100
            }).then(function (data) {
                if (!historyHost.isConnected) return;
                historyHost.textContent = '';
                historySummary.textContent = '';
                var rows = data.history || [];
                S.maintenance.history = rows;
                S.maintenance.total = data.total || rows.length;
                var active = rows.filter(function (r) { return r.status === 'active'; })[0] || null;
                S.maintenance.cycle = active;
                historySummary.appendChild(pill(S.maintenance.total + ' chu kỳ'));
                historySummary.appendChild(pill(active ? 'Đang bảo trì' : 'Không có phiên mở', active ? 'warn' : 'ok'));
                if (active) {
                    historySummary.appendChild(pill('Bắt đầu ' + fmt(active.started_at), 'warn'));
                }

                if (!rows.length) {
                    emptyState(historyHost, 'fa-clock-rotate-left', 'Chưa có lịch sử',
                        S.maintenance.q || S.maintenance.status !== 'all'
                            ? 'Không có chu kỳ nào khớp bộ lọc.'
                            : 'Lịch sử xuất hiện sau lần bật/tắt bảo trì đầu tiên kể từ phiên bản 7.0.');
                    return;
                }

                var t = table(['Bắt đầu', 'Kết thúc', 'Thời lượng', 'Người bật', 'Người tắt', 'Lý do', 'Trạng thái']);
                rows.forEach(function (r) {
                    var tr = h('tr');
                    tr.appendChild(h('td', null, r.started_at ? fmt(r.started_at) : '—'));
                    tr.appendChild(h('td', null, r.ended_at ? fmt(r.ended_at) : '—'));
                    tr.appendChild(h('td', null, durationText(r.duration_seconds, r.started_at, r.ended_at)));
                    tr.appendChild(h('td', 'bkc-code', r.started_by || '—'));
                    tr.appendChild(h('td', 'bkc-code', r.ended_by || '—'));
                    tr.appendChild(h('td', null, r.reason || '—'));
                    var st = h('td');
                    st.appendChild(pill(r.status === 'active' ? 'Đang bảo trì' : 'Đã kết thúc',
                        r.status === 'active' ? 'warn' : 'ok'));
                    if (r.completion_announcement_id) st.appendChild(pill('Đã thông báo', 'info'));
                    tr.appendChild(st);
                    t.tbody.appendChild(tr);
                });
                historyHost.appendChild(t.wrap);
                historyHost.appendChild(h('p', 'bkc-hint',
                    'Một thông báo hoàn tất được tạo cho mỗi chu kỳ (không trùng lặp). ' +
                    'Thời lượng do máy chủ tính từ started_at và ended_at.'));
            }).catch(function (err) {
                if (!historyHost.isConnected) return;
                historyHost.textContent = '';
                historyHost.appendChild(alertBox((err && err.message) || 'Không tải được lịch sử bảo trì.', 'error'));
            });
        }
        S.maintenance.refresh = loadHistory;
        loadHistory();
    }

    function renderSettings(pane) {
        var appearance = card('Giao diện', null, 'Lựa chọn được lưu riêng cho Administrator Dashboard.');
        paintThemeSettings(appearance.body);
        pane.appendChild(appearance.root);

        var flagsCard = card('Feature flag công khai', [
            iconBtn('fa-rotate', 'Tải lại feature flag', function () { loadFlags(); })
        ], 'Bật/tắt khối cập nhật và thông báo bảo trì trên toàn website.');
        pane.appendChild(flagsCard.root);
        var flagsHost = h('div', 'bkc-form');
        flagsCard.body.appendChild(flagsHost);

        function loadFlags() {
            flagsHost.textContent = '';
            loading(flagsHost, 'Đang tải feature flag…');
            api('settings.get').then(function (data) {
                flagsHost.textContent = '';
                /* Administrator thường không thấy bảo trì ở đây: quyền đổi khoá
                   public.maintenance chỉ Founder, máy chủ cũng chặn. */
                var list = (data.settings || []).filter(function (row) {
                    return isFounder() || row.key !== 'public.maintenance';
                });
                S.data.flags = list;
                if (!list.length) {
                    emptyState(flagsHost, 'fa-sliders', 'Chưa có feature flag',
                        'Migration app_settings chưa tạo dữ liệu mặc định.');
                    return;
                }

                var controls = {};
                list.forEach(function (row) {
                    var value = row.value && typeof row.value === 'object' ? row.value : {};
                    var enabled = value.enabled !== false;
                    var box = checkbox(row.key === 'public.maintenance'
                        ? 'Bật thông báo bảo trì toàn website' : 'Hiển thị khối Cập nhật gần đây',
                    enabled);
                    var group = h('div', 'bkc-form-row');
                    group.appendChild(h('div', 'bkc-label-row',
                        row.description || row.key));
                    group.appendChild(box.root);
                    var message = null;
                    if (row.key === 'public.maintenance') {
                        message = input('text', 'Nội dung thông báo bảo trì…', value.message || '');
                        message.maxLength = 240;
                        group.appendChild(message);
                    }
                    controls[row.key] = { enabled: box.input, message: message, value: value };
                    flagsHost.appendChild(group);
                });

                var actions = h('div', 'bkc-actions');
                var save = btn('Lưu feature flag', 'bkc-btn-primary', function () {
                    save.disabled = true;
                    var payloads = Object.keys(controls).map(function (key) {
                        var c = controls[key];
                        var body = { key: key, enabled: !!c.enabled.checked };
                        if (c.message) body.message = c.message.value.trim();
                        return api('settings.set', body);
                    });
                    Promise.all(payloads).then(function () {
                        save.disabled = false;
                        toast('Đã lưu feature flag — website nhận cập nhật realtime', 'success');
                        loadFlags();
                    }).catch(function (err) {
                        save.disabled = false;
                        fail(err);
                    });
                }, 'fa-floppy-disk');
                actions.appendChild(save);
                actions.appendChild(btn('Về trang chủ', 'bkc-btn-ghost', function () {
                    window.open(basePath() + 'index.html', '_blank', 'noopener');
                }, 'fa-house'));
                flagsHost.appendChild(actions);
                flagsHost.appendChild(h('p', 'bkc-hint',
                    'Feature flag được đọc từ bảng app_settings phía Supabase; trình duyệt học sinh cập nhật qua realtime.'));
            }).catch(function (err) {
                flagsHost.textContent = '';
                flagsHost.appendChild(alertBox(err.message || 'Không tải được feature flag.', 'error'));
            });
        }
        loadFlags();

        if (isFounder()) {
            var brandCard = card('Tên hiển thị Dashboard', [
                iconBtn('fa-rotate', 'Tải lại tên hiển thị', function () { loadBrandName(); })
            ], 'Founder đổi được tên hiển thị của dashboard. Đường dẫn /admin/ và quyền truy cập không đổi.');
            pane.appendChild(brandCard.root);
            var brandHost = h('div', 'bkc-form');
            brandCard.body.appendChild(brandHost);

            function loadBrandName() {
                brandHost.textContent = '';
                loading(brandHost, 'Đang tải tên hiển thị…');
                api('settings.get').then(function (data) {
                    brandHost.textContent = '';
                    var row = (data.settings || []).filter(function (x) { return x.key === 'public.branding'; })[0];
                    var value = row && row.value && typeof row.value === 'object' ? row.value : {};
                    var current = brandingName(value.adminDashboardName);
                    var nameInput = input('text', 'Tên hiển thị, tối đa 40 ký tự…', current);
                    nameInput.maxLength = 40;
                    brandHost.appendChild(fieldRow('Tên hiển thị', nameInput));
                    var preview = h('p', 'bkc-hint', 'Xem trước: ' + current);
                    nameInput.addEventListener('input', function () {
                        preview.textContent = 'Xem trước: ' + (nameInput.value.trim() || defaultDashboardName());
                    });
                    brandHost.appendChild(preview);
                    var acts = h('div', 'bkc-actions');
                    var saveBrand = btn('Lưu tên hiển thị', 'bkc-btn-primary', function () {
                        var name = nameInput.value.trim();
                        if (!name) { toast('Tên hiển thị không được để trống.', 'error'); return; }
                        saveBrand.disabled = true;
                        api('settings.set', { key: 'public.branding', adminDashboardName: name })
                            .then(function (data) {
                                saveBrand.disabled = false;
                                var saved = data && data.value && data.value.adminDashboardName;
                                applyBranding(saved || name);
                                toast('Đã lưu tên hiển thị Dashboard.', 'success');
                            }).catch(function (err) {
                                saveBrand.disabled = false;
                                fail(err, brandHost);
                            });
                    }, 'fa-floppy-disk');
                    acts.appendChild(saveBrand);
                    brandHost.appendChild(acts);
                }).catch(function (err) {
                    brandHost.textContent = '';
                    brandHost.appendChild(alertBox((err && err.message) || 'Không tải được tên hiển thị.', 'error'));
                });
            }
            loadBrandName();
        }

        var c = card('Trạng thái hệ thống', [iconBtn('fa-rotate', 'Kiểm tra lại', function () { switchTab('settings'); })],
            'Các secret chỉ được kiểm tra sự tồn tại, không bao giờ hiển thị giá trị.');
        pane.appendChild(c.root);
        var host = h('div', 'bkc-form');
        c.body.appendChild(host);
        loading(host, 'Đang kiểm tra hệ thống…');

        api('settings.status').then(function (data) {
            var st = data.status || {};
            S.status = st;
            host.textContent = '';

            var statusGrid = h('div', 'bkc-status-grid');
            statusGrid.appendChild(statusItem('ADMIN_DEV_CODE', st.adminDevCode, st.adminDevCode ? 'ADMIN_DEV_CODE: đã đặt' : 'ADMIN_DEV_CODE: thiếu',
                'Mã quản trị dùng để đăng nhập.'));
            statusGrid.appendChild(statusItem('service_role', st.serviceRole, st.serviceRole ? 'service_role: sẵn sàng' : 'service_role: thiếu',
                'Chỉ dùng trong Edge Function Secrets.'));
            statusGrid.appendChild(statusItem('STUDENT_ROSTER_SECRET', st.rosterSecret, st.rosterSecret ? 'STUDENT_ROSTER_SECRET: đã đặt' : 'STUDENT_ROSTER_SECRET: chưa đặt',
                'Bảo vệ endpoint import danh sách.'));
            statusGrid.appendChild(statusItem('Học sinh', st.students, 'Học sinh: ' + (st.students == null ? '—' : st.students),
                'Tổng số hồ sơ trên máy chủ.'));
            host.appendChild(statusGrid);

            var cloud = global.BKCloud && global.BKCloud.state ? global.BKCloud.state() : {};
            var session = adminSession();
            var sessionCard = card('Phiên làm việc', null, 'Token chỉ lưu trong sessionStorage của tab hiện tại.');
            var rows = h('div', 'bkc-status-grid');
            rows.appendChild(infoItem('Phiên học sinh', cloud.bound ? 'Đã gắn' : 'Chưa chọn',
                cloud.bound && cloud.student ? cloud.student.display_name : 'Trang quản trị không cần chọn học sinh.', cloud.bound ? 'ok' : 'warn'));
            rows.appendChild(infoItem('Lần đồng bộ cuối',
                cloud.lastSyncAt ? fmt(new Date(cloud.lastSyncAt).toISOString()) : '—',
                'Đồng bộ tiến độ từ trình duyệt.', 'info'));
            rows.appendChild(infoItem('Phiên quản trị', session && session.expiresAt ? 'Còn hiệu lực' : 'Không xác định',
                session && session.expiresAt ? 'Hết hạn: ' + fmt(session.expiresAt) : 'Đăng nhập lại nếu cần.', 'ok'));
            rows.appendChild(infoItem('Kết nối', S.statusAt ? 'Đã kiểm tra' : 'Chưa kiểm tra',
                S.statusAt ? fmt(new Date(S.statusAt).toISOString()) : 'Bấm làm mới để kiểm tra.', 'info'));
            sessionCard.body.appendChild(rows);
            pane.appendChild(sessionCard.root);

            var docs = card('Tài liệu & công cụ', null, 'Mở trong tab mới.');
            var docActs = h('div', 'bkc-actions');
            docActs.appendChild(btn('Hướng dẫn Supabase', 'bkc-btn-ghost', function () {
                window.open(basePath() + 'docs/SUPABASE_SETUP.md', '_blank', 'noopener');
            }, 'fa-book'));
            docActs.appendChild(btn('README', 'bkc-btn-ghost', function () {
                window.open(basePath() + 'README.md', '_blank', 'noopener');
            }, 'fa-file-lines'));
            docActs.appendChild(btn('CHANGELOG', 'bkc-btn-ghost', function () {
                window.open(basePath() + 'CHANGELOG.md', '_blank', 'noopener');
            }, 'fa-code-branch'));
            docActs.appendChild(btn('Về trang chủ', 'bkc-btn-ghost', function () {
                window.location.href = basePath() + 'index.html';
            }, 'fa-house'));
            docs.body.appendChild(docActs);
            pane.appendChild(docs.root);

            var danger = card('Phiên quản trị', null, 'Đăng xuất sẽ xoá token khỏi tab này.');
            var dangerActs = h('div', 'bkc-actions');
            dangerActs.appendChild(btn('Đóng bảng quản trị', 'bkc-btn-ghost', closeDash, 'fa-xmark'));
            dangerActs.appendChild(btn('Đăng xuất Administrator', 'bkc-btn-danger', doLogout, 'fa-right-from-bracket'));
            danger.body.appendChild(dangerActs);
            danger.body.appendChild(h('p', 'bkc-hint',
                'Administrator Code và service_role key chỉ tồn tại trong Supabase Edge Function Secrets. ' +
                'Dashboard không bao giờ đọc hay hiển thị giá trị của chúng.'));
            pane.appendChild(danger.root);
        }).catch(function (err) {
            host.textContent = '';
            host.appendChild(alertBox(err.message || 'Không đọc được trạng thái.', 'error'));
        });
    }

    function paintThemeSettings(host) {
        var wrap = h('div', 'bkc-theme-choice');
        var current = global.BKAdminTheme ? global.BKAdminTheme.get() : null;
        [
            ['dark', 'fa-moon', 'Tối', 'Phù hợp làm việc ban đêm'],
            ['light', 'fa-sun', 'Sáng', 'Tương phản cao, dễ đọc']
        ].forEach(function (t) {
            var b = h('button', 'bkc-theme-card' + (current === t[0] ? ' is-active' : ''));
            b.type = 'button';
            b.appendChild(icon(t[1]));
            var txt = h('span');
            txt.appendChild(h('b', null, t[2]));
            txt.appendChild(h('span', null, t[3]));
            b.appendChild(txt);
            b.addEventListener('click', function () {
                if (!global.BKAdminTheme) {
                    toast('Trang này dùng giao diện chung của index.html.', 'info');
                    return;
                }
                global.BKAdminTheme.set(t[0]);
                Array.prototype.forEach.call(wrap.children, function (n) {
                    n.classList.toggle('is-active', n === b);
                });
                toast('Đã chuyển sang giao diện ' + t[2].toLowerCase(), 'success');
            });
            wrap.appendChild(b);
        });
        host.appendChild(wrap);

        var compact = h('label', 'bkc-check');
        var box = h('input');
        box.type = 'checkbox';
        try { box.checked = global.localStorage.getItem('bkAdminCompact') === '1'; } catch (e) { }
        box.addEventListener('change', function () {
            try { global.localStorage.setItem('bkAdminCompact', box.checked ? '1' : '0'); } catch (e) { }
            if (S.root) S.root.classList.toggle('is-compact', box.checked);
            toast(box.checked ? 'Đã bật chế độ gọn' : 'Đã tắt chế độ gọn', 'info');
        });
        compact.appendChild(box);
        compact.appendChild(h('span', null, 'Chế độ gọn: giảm khoảng cách và cỡ chữ trong bảng'));
        host.appendChild(compact);
        if (!global.BKAdminTheme) {
            host.appendChild(h('p', 'bkc-hint',
                'Trang hiện tại không nạp mô-đun chủ đề riêng; hãy đổi giao diện bằng menu 3 gạch của index.html.'));
        }
    }

    function statusItem(name, ok, text, hint) {
        var box = h('div', 'bkc-status-item' + (ok ? ' is-ok' : ' is-off'));
        var top = h('div', 'bkc-status-top');
        top.appendChild(h('span', 'bkc-status-dot'));
        top.appendChild(h('b', null, name));
        box.appendChild(top);
        box.appendChild(pill(text, ok ? 'ok' : 'off'));
        if (hint) box.appendChild(h('span', 'bkc-hint', hint));
        return box;
    }
    function infoItem(label, value, hint, kind) {
        var box = h('div', 'bkc-status-item' + (kind ? ' is-' + kind : ''));
        var top = h('div', 'bkc-status-top');
        top.appendChild(h('span', 'bkc-status-dot'));
        top.appendChild(h('b', null, label));
        box.appendChild(top);
        box.appendChild(h('span', 'bkc-status-value', value));
        if (hint) box.appendChild(h('span', 'bkc-hint', hint));
        return box;
    }

    /* ---------------------------- Command palette ------------------------- */
    function commandActions() {
        var list = TABS.map(function (t) {
            return { icon: t[2], label: t[1], hint: 'Alt+' + (TABS.indexOf(t) + 1), run: function () { switchTab(t[0]); } };
        });
        list.push({ icon: 'fa-rotate', label: 'Làm mới dữ liệu', hint: 'Refresh', run: function () { refreshTab(true); } });
        list.push({
            icon: 'fa-plus', label: 'Tạo thông báo mới', hint: 'Notifications',
            run: function () { S.notif.editing = null; S.notif.draft = null; switchTab('notifications'); }
        });
        list.push({
            icon: 'fa-code-branch', label: 'Tạo changelog mới', hint: 'Changelog',
            run: function () { S.cl.editing = null; S.cl.draft = null; S.cl.sections = []; S.cl.loadedFor = null; switchTab('changelog'); }
        });
        list.push({
            icon: 'fa-user-plus', label: 'Import danh sách học sinh', hint: 'Students',
            run: function () { switchTab('students'); }
        });
        list.push({
            icon: 'fa-heart-pulse', label: 'Kiểm tra sức khoẻ hệ thống', hint: 'Monitoring',
            run: function () { switchTab('monitoring'); }
        });
        if (isFounder()) {
            list.push({
                icon: 'fa-shield-halved', label: 'Kiểm tra toàn vẹn dữ liệu', hint: 'Data',
                run: function () { switchTab('data'); }
            });
        }
        if (global.BKAdminTheme) {
            list.push({
                icon: 'fa-circle-half-stroke', label: 'Đổi giao diện sáng / tối', hint: 'Theme',
                run: function () {
                    var t = global.BKAdminTheme.toggle();
                    toast('Đã chuyển sang giao diện ' + (t === 'dark' ? 'tối' : 'sáng'), 'success');
                }
            });
        }
        list.push({ icon: 'fa-keyboard', label: 'Xem phím tắt', hint: '?', run: openHelp });
        list.push({ icon: 'fa-right-from-bracket', label: 'Đăng xuất Administrator', hint: 'Logout', run: doLogout });
        return list;
    }

    function openCmd() {
        if (S.cmdOpen) { closeCmd(); return; }
        S.cmdOpen = true;
        var wrap = h('div', 'bkc-cmd');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var box = h('div', 'bkc-cmd-box');
        var searchWrap = h('div', 'bkc-cmd-search');
        searchWrap.appendChild(icon('fa-magnifying-glass'));
        var search = input('text', 'Tìm lệnh hoặc chuyển nhanh…');
        search.className = 'bkc-input';
        searchWrap.appendChild(search);
        searchWrap.appendChild(h('kbd', null, 'Esc'));
        box.appendChild(searchWrap);
        var list = h('div', 'bkc-cmd-list');
        box.appendChild(list);
        var foot = h('div', 'bkc-cmd-foot');
        foot.appendChild(h('span', null, '↑ ↓ để chọn · Enter để chạy · Ctrl/⌘+K để đóng'));
        box.appendChild(foot);
        wrap.appendChild(box);
        (D.body || D.documentElement).appendChild(wrap);
        S.cmdEl = wrap;
        S.cmdIndex = 0;
        S.cmdItems = commandActions();

        function paint() {
            var q = search.value.trim().toLowerCase();
            var items = S.cmdItems.filter(function (a) {
                return !q || (a.label + ' ' + (a.hint || '')).toLowerCase().indexOf(q) >= 0;
            });
            list.textContent = '';
            if (!items.length) {
                list.appendChild(h('div', 'bkc-cmd-empty', 'Không có lệnh phù hợp.'));
                S.cmdVisible = [];
                return;
            }
            if (S.cmdIndex >= items.length) S.cmdIndex = 0;
            S.cmdVisible = items;
            items.forEach(function (a, i) {
                var b = h('button', 'bkc-cmd-item' + (i === S.cmdIndex ? ' is-active' : ''));
                b.type = 'button';
                b.appendChild(icon(a.icon));
                b.appendChild(h('span', 'bkc-cmd-label', a.label));
                if (a.hint) b.appendChild(h('kbd', null, a.hint));
                b.addEventListener('mouseenter', function () { S.cmdIndex = i; syncActive(); });
                b.addEventListener('click', function () { run(a); });
                list.appendChild(b);
            });
            syncActive();
        }
        function syncActive() {
            Array.prototype.forEach.call(list.children, function (n, i) {
                n.classList.toggle('is-active', i === S.cmdIndex);
            });
            var active = list.children[S.cmdIndex];
            if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
        }
        function run(a) {
            closeCmd();
            if (a && a.run) setTimeout(a.run, 20);
        }
        search.addEventListener('input', function () { S.cmdIndex = 0; paint(); });
        search.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                S.cmdIndex = Math.min((S.cmdVisible ? S.cmdVisible.length : 1) - 1, S.cmdIndex + 1);
                syncActive();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                S.cmdIndex = Math.max(0, S.cmdIndex - 1);
                syncActive();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                run(S.cmdVisible && S.cmdVisible[S.cmdIndex]);
            }
        });
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closeCmd(); });
        paint();
        setTimeout(function () { try { search.focus(); } catch (e) { } }, 30);
    }
    function closeCmd() {
        if (S.cmdEl && S.cmdEl.parentNode) S.cmdEl.parentNode.removeChild(S.cmdEl);
        S.cmdEl = null;
        S.cmdOpen = false;
    }

    function openHelp() {
        if (!global.BK || !global.BK.ui || !global.BK.ui.modal) return;
        var body = h('div', 'bkc-shortcuts');
        [
            ['Ctrl / ⌘ + K', 'Mở bảng lệnh nhanh'],
            ['Alt + 1 … 9', 'Chuyển nhanh 9 khu vực quản trị đầu tiên'],
            ['Esc', 'Đóng hộp thoại hoặc bảng quản trị'],
            ['Enter', 'Chạy lệnh đang chọn trong bảng lệnh'],
            ['?', 'Mở trợ giúp phím tắt']
        ].forEach(function (row) {
            var line = h('div', 'bkc-shortcut-row');
            line.appendChild(h('kbd', null, row[0]));
            line.appendChild(h('span', null, row[1]));
            body.appendChild(line);
        });
        global.BK.ui.modal({
            title: 'Phím tắt Administrator Dashboard',
            body: body,
            actions: [{ label: 'Đóng', variant: 'primary', onClick: function (c) { c(); } }]
        });
    }

    /* ------------------------- Gamification 2.0 (8.3.0) ------------------- */
    function gamificationAdminApi(action, payload) {
        if (!global.BKCloud || typeof global.BKCloud.gamificationAdmin !== 'function') {
            return Promise.reject(new Error('Chưa tải được lớp Supabase. Hãy tải lại trang.'));
        }
        return global.BKCloud.gamificationAdmin(action, payload).catch(function (err) {
            if (err && err.status === 401) {
                err.handled = true;
                try { global.BKCloud.adminLogout(); } catch (e) { }
                toast('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.', 'error');
                closeDash();
                if (typeof global.mountDevMenu === 'function') {
                    try { global.mountDevMenu(); } catch (e) { }
                }
            }
            throw err;
        });
    }

    function renderGamification(pane) {
        if (!global.BKGamificationAdmin || typeof global.BKGamificationAdmin.render !== 'function') {
            pane.appendChild(alertBox(
                'Chưa tải được mô-đun quản trị gamification (bk-devboard-gamification.js). Hãy tải lại trang.',
                'error'));
            return;
        }
        global.BKGamificationAdmin.render(pane, {
            h: h, icon: icon, btn: btn, card: card, table: table, emptyRow: emptyRow,
            fieldRow: fieldRow, input: input, textarea: textarea, checkbox: checkbox,
            alertBox: alertBox, pill: pill, statCard: statCard, toast: toast,
            api: gamificationAdminApi, isFounder: isFounder
        });
    }

    /* ------------------------------- Bootstrap ---------------------------- */
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', mountDevMenu);
    else setTimeout(mountDevMenu, 0);

    global.openDevDashboard = openDevDashboard;
    global.mountDevMenu = mountDevMenu;
    global.BKDashboard = {
        open: openDevDashboard,
        close: closeDash,
        refresh: function () { refreshTab(false); },
        tab: function (name) { if (S.root) switchTab(name); },
        version: APP_VERSION
    };
})(typeof window !== 'undefined' ? window : this);
