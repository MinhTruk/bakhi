/* =========================================================================
   Bá Khí — bk-devboard.js
   Dev Dashboard: 6 tab (Overview, Notifications, Changelog, Students,
   Activity Logs, Settings). Mọi thao tác ghi đều đi qua Edge Function
   admin-actions với Dev session token — không có thao tác tin client.

   Công khai: window.openDevDashboard(), window.BKDashboard
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKDashboardLoaded) return;
    global.BKDashboardLoaded = true;

    var TYPES = [['general', 'General'], ['announcement', 'Announcement'], ['update', 'Update'],
        ['important', 'Important'], ['maintenance', 'Maintenance']];
    var PRIORITIES = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['critical', 'Critical']];
    var CATEGORIES = [['features', 'Tính năng mới'], ['improvements', 'Cải tiến'], ['fixes', 'Sửa lỗi'],
        ['ui', 'Giao diện'], ['performance', 'Hiệu năng'], ['other', 'Khác']];
    var TABS = [['overview', 'Overview', 'fa-gauge-high'], ['notifications', 'Notifications', 'fa-bullhorn'],
        ['changelog', 'Changelog', 'fa-code-branch'], ['students', 'Students', 'fa-user-graduate'],
        ['logs', 'Activity Logs', 'fa-clock-rotate-left'], ['settings', 'Settings', 'fa-gear']];

    var S = {
        root: null, body: null, statusPill: null, tab: null,
        notif: { editing: null, list: [] },
        cl: { editing: null, sections: [], list: [] },
        students: { q: '', status: 'all', list: [], importText: '' },
        logs: []
    };

    /* ------------------------------ Tiện ích ------------------------------ */
    function h(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function btn(label, cls, onClick) {
        var b = h('button', 'bkc-btn' + (cls ? ' ' + cls : ''), label);
        b.type = 'button';
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function toast(msg, type) {
        if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast(msg, type);
        else console.log('[BKDashboard]', msg);
    }
    function fmt(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        var p = function (n) { return n < 10 ? '0' + n : String(n); };
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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
    function fieldRow(labelText, control) {
        var row = h('div', 'bkc-form-row');
        row.appendChild(h('label', 'bkc-label', labelText));
        row.appendChild(control);
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
    function card(titleText, actions) {
        var root = h('div', 'bkc-card');
        var head = h('div', 'bkc-card-head');
        head.appendChild(h('h3', 'bkc-sec-title', titleText));
        if (actions && actions.length) {
            var acts = h('div', 'bkc-actions');
            actions.forEach(function (a) { acts.appendChild(a); });
            head.appendChild(acts);
        }
        root.appendChild(head);
        var body = h('div');
        root.appendChild(body);
        return { root: root, body: body, head: head };
    }
    function alertBox(text, kind) {
        var a = h('div', 'bkc-alert' + (kind ? ' is-' + kind : ''));
        a.appendChild(h('i', 'fa-solid fa-circle-info'));
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
        td.style.color = 'var(--bkl-muted, #64748b)';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
    function statCard(grid, label, value, hint) {
        var c = h('div', 'bkc-stat');
        c.appendChild(h('span', 'bkc-stat-label', label));
        c.appendChild(h('span', 'bkc-stat-value', String(value == null ? '—' : value)));
        if (hint) c.appendChild(h('span', 'bkc-stat-hint', hint));
        grid.appendChild(c);
    }
    function pill(text, kind) {
        return h('span', 'bkc-pill' + (kind ? ' is-' + kind : ''), text);
    }

    /** Gọi admin-actions; tự đăng xuất khi phiên hết hạn. */
    function api(action, payload) {
        return global.BKCloud.adminAction(action, payload).catch(function (err) {
            if (err && err.status === 401) {
                global.BKCloud.adminLogout();
                err.handled = true;
                toast('Phiên quản trị đã hết hạn. Vui lòng nhập lại Dev Code.', 'error');
                closeDash();
                promptCode();
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

    /* --------------------------- Đăng nhập Dev ---------------------------- */
    function openDevDashboard() {
        if (!global.BKCloud || !global.BKCloud.configured()) {
            toast('Cấu hình Supabase chưa hoàn tất — mở assets/bakhi/bk-supabase.config.js.', 'error');
            return;
        }
        if (global.BKCloud.adminToken()) { openDash(); return; }
        promptCode();
    }

    function promptCode() {
        var body = h('div', 'bkc-form');
        body.appendChild(h('p', 'bkc-muted',
            'Nhập Dev Code để mở Dev Dashboard. Mã được xác thực trên máy chủ và không được lưu lại.'));
        var code = input('password', 'Dev Code…');
        code.autocomplete = 'off';
        body.appendChild(fieldRow('Dev Code', code));
        var msg = h('p', 'bkc-gate-msg');
        body.appendChild(msg);

        var modal = global.BK.ui.modal({
            title: 'Dev Dashboard',
            body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost', onClick: function (c) { c(); } },
                { label: 'Xác thực', variant: 'primary', onClick: function () { submit(); } }
            ]
        });

        function submit() {
            var value = code.value.trim();
            msg.className = 'bkc-gate-msg';
            if (!value) { msg.textContent = 'Vui lòng nhập Dev Code.'; msg.className = 'bkc-gate-msg is-warn'; return; }
            msg.textContent = 'Đang xác thực…';
            global.BKCloud.adminLogin(value).then(function () {
                code.value = '';
                try { modal.close(); } catch (e) { }
                openDash();
            }).catch(function (err) {
                msg.textContent = err.message || 'Dev Code không đúng.';
                msg.className = 'bkc-gate-msg is-error';
            });
        }
        code.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        setTimeout(function () { try { code.focus(); } catch (e) { } }, 60);
    }

    /* ------------------------------ Vỏ dashboard ------------------------- */
    function openDash() {
        build();
        S.root.hidden = false;
        D.documentElement.classList.add('bkc-lock');
        switchTab('overview');
    }
    function closeDash() {
        if (S.root) S.root.hidden = true;
        D.documentElement.classList.remove('bkc-lock');
    }

    function build() {
        if (S.root) return;
        var root = h('div', 'bkc-dash');
        root.id = 'bkDevDashboard';
        root.hidden = true;

        var head = h('div', 'bkc-dash-head');
        var mark = h('div', 'bkc-dash-mark');
        mark.innerHTML = '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>';
        head.appendChild(mark);
        var titles = h('div', 'bkc-dash-titles');
        titles.appendChild(h('span', 'bkc-dash-title', 'Bá Khí — Dev Dashboard'));
        titles.appendChild(h('span', 'bkc-dash-sub', 'Xuất bản tức thời · không cần commit GitHub'));
        head.appendChild(titles);

        var tools = h('div', 'bkc-dash-tools');
        S.statusPill = pill('Đang kiểm tra…', 'warn');
        tools.appendChild(S.statusPill);
        tools.appendChild(btn('Làm mới', 'bkc-btn-ghost', function () { refreshTab(true); }));
        tools.appendChild(btn('Đóng', 'bkc-btn-ghost', closeDash));
        head.appendChild(tools);
        root.appendChild(head);

        var tabs = h('div', 'bkc-tabs');
        tabs.setAttribute('role', 'tablist');
        TABS.forEach(function (t) {
            var b = h('button', 'bkc-tab');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.setAttribute('data-tab', t[0]);
            b.appendChild(h('i', 'fa-solid ' + t[2]));
            b.appendChild(D.createTextNode(' ' + t[1]));
            b.addEventListener('click', function () { switchTab(t[0]); });
            tabs.appendChild(b);
        });
        root.appendChild(tabs);

        S.body = h('div', 'bkc-dash-body');
        root.appendChild(S.body);
        (D.body || D.documentElement).appendChild(root);
        S.root = root;
        checkStatus();
    }

    function checkStatus() {
        api('settings.status').then(function (data) {
            var st = data.status || {};
            if (S.statusPill) {
                S.statusPill.textContent = 'Đã kết nối Supabase';
                S.statusPill.className = 'bkc-pill is-ok';
            }
            S.status = st;
        }).catch(function () {
            if (S.statusPill) {
                S.statusPill.textContent = 'Mất kết nối';
                S.statusPill.className = 'bkc-pill is-off';
            }
        });
    }

    function switchTab(tab) {
        S.tab = tab;
        Array.prototype.forEach.call(S.root.querySelectorAll('.bkc-tab'), function (b) {
            b.classList.toggle('is-active', b.getAttribute('data-tab') === tab);
            b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true' : 'false');
        });
        S.body.textContent = '';
        var pane = h('div', 'bkc-pane');
        S.body.appendChild(pane);
        ({
            overview: renderOverview,
            notifications: renderNotifications,
            changelog: renderChangelog,
            students: renderStudents,
            logs: renderLogs,
            settings: renderSettings
        }[tab] || renderOverview)(pane);
        S.body.scrollTop = 0;
    }

    function refreshTab(showToast) {
        switchTab(S.tab || 'overview');
        if (showToast) toast('Đã làm mới dữ liệu', 'info');
    }

    /* -------------------------------- Overview ---------------------------- */
    function renderOverview(pane) {
        var grid = h('div', 'bkc-grid');
        pane.appendChild(grid);
        var reviewCard = h('div');
        pane.appendChild(reviewCard);
        var recent = card('Recent Activity');
        pane.appendChild(recent.root);
        var loading = alertBox('Đang tải tổng quan…');
        pane.appendChild(loading);

        api('overview').then(function (data) {
            loading.remove();
            grid.textContent = '';
            var c = data.counts || {};
            statCard(grid, 'Tổng số học sinh', c.students, c.studentsActive + ' đang hoạt động');
            statCard(grid, 'Học sinh hoạt động', c.studentsActive, 'Được phép chọn tên');
            statCard(grid, 'Tổng thông báo', c.announcements, c.announcementsPublished + ' đang hiển thị');
            statCard(grid, 'Thông báo đang hiển thị', c.announcementsPublished, 'Trên website');
            statCard(grid, 'Changelog', c.changelog, 'Bản ghi lịch sử');
            statCard(grid, 'Phiên bản mới nhất', data.latestVersion ? data.latestVersion.version : '—',
                data.latestVersion ? fmt(data.latestVersion.published_at || data.latestVersion.created_at) : 'Chưa có');
            statCard(grid, 'Cập nhật gần nhất',
                data.recentActivity && data.recentActivity[0] ? fmt(data.recentActivity[0].created_at) : '—',
                'Hoạt động quản trị');
            statCard(grid, 'Kết nối Supabase', 'OK', 'Edge Functions + RLS');

            if (S.statusPill) { S.statusPill.textContent = 'Đã kết nối Supabase'; S.statusPill.className = 'bkc-pill is-ok'; }

            if (data.needsReview && data.needsReview.length) {
                var warn = alertBox('Có ' + data.needsReview.length +
                    ' hồ sơ trùng họ tên cần phân biệt trong tab Students.', 'warn');
                reviewCard.appendChild(warn);
            }

            recent.body.textContent = '';
            var list = h('div', 'bkc-activity');
            if (!data.recentActivity || !data.recentActivity.length) {
                recent.body.appendChild(h('p', 'bkc-hint', 'Chưa có hoạt động quản trị nào.'));
            } else {
                data.recentActivity.forEach(function (log) {
                    var item = h('div', 'bkc-activity-item');
                    item.appendChild(h('span', 'bkc-activity-dot'));
                    var main = h('div', 'bkc-activity-main');
                    main.appendChild(h('b', null, log.action));
                    if (log.target_type) main.appendChild(h('span', null, ' · ' + log.target_type));
                    item.appendChild(main);
                    item.appendChild(h('span', 'bkc-activity-time', fmt(log.created_at)));
                    list.appendChild(item);
                });
                recent.body.appendChild(list);
            }
        }).catch(function (err) {
            loading.textContent = '';
            loading.className = 'bkc-alert is-error';
            loading.appendChild(h('span', null, err.message || 'Không tải được tổng quan.'));
        });
    }

    /* ------------------------------ Notifications ------------------------- */
    function renderNotifications(pane) {
        var formCard = card(S.notif.editing ? 'Chỉnh sửa thông báo' : 'Tạo thông báo');
        pane.appendChild(formCard.root);

        var f = h('div', 'bkc-form');
        var title = input('text', 'Tiêu đề thông báo', S.notif.editing ? S.notif.editing.title : '');
        title.maxLength = 160;
        var content = textarea('Nội dung thông báo…', S.notif.editing ? S.notif.editing.content : '', 5);
        content.maxLength = 20000;
        var type = selectBox(TYPES, S.notif.editing ? S.notif.editing.type : 'general');
        var priority = selectBox(PRIORITIES, S.notif.editing ? S.notif.editing.priority : 'normal');
        var status = selectBox([['draft', 'Draft (chưa hiển thị)'], ['published', 'Published (hiển thị ngay)']],
            S.notif.editing && S.notif.editing.is_published ? 'published' : 'draft');

        f.appendChild(fieldRow('Tiêu đề', title));
        f.appendChild(fieldRow('Nội dung', content));
        var grid = h('div', 'bkc-form-grid');
        grid.appendChild(fieldRow('Loại thông báo', type));
        grid.appendChild(fieldRow('Mức độ ưu tiên', priority));
        grid.appendChild(fieldRow('Trạng thái xuất bản', status));
        f.appendChild(grid);

        var actions = h('div', 'bkc-actions');
        var push = btn('PUSH NOTIFICATION NOW', 'bkc-btn-push', function () {
            var payload = readNotifForm();
            if (!payload) return;
            payload.is_published = true;
            previewNotification(payload, function () { saveNotification(payload); });
        });
        actions.appendChild(push);
        actions.appendChild(btn('Lưu', 'bkc-btn-primary', function () {
            var payload = readNotifForm();
            if (!payload) return;
            payload.is_published = status.value === 'published';
            saveNotification(payload);
        }));
        if (S.notif.editing) {
            actions.appendChild(btn('Huỷ sửa', 'bkc-btn-ghost', function () {
                S.notif.editing = null;
                switchTab('notifications');
            }));
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
        var listCard = card('Quản lý thông báo');
        pane.appendChild(listCard.root);
        var filters = h('div', 'bkc-actions');
        var search = input('search', 'Tìm theo tiêu đề…', S.notif.q || '');
        search.style.maxWidth = '14rem';
        var fType = selectBox([['', 'Tất cả loại']].concat(TYPES.map(function (p) { return [p[0], p[1]]; })),
            S.notif.filterType || '');
        var fStatus = selectBox([['', 'Tất cả trạng thái'], ['published', 'Đã xuất bản'], ['draft', 'Nháp']],
            S.notif.filterStatus || '');
        filters.appendChild(search);
        filters.appendChild(fType);
        filters.appendChild(fStatus);
        listCard.body.appendChild(filters);
        var listHost = h('div');
        listCard.body.appendChild(listHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { S.notif.q = search.value.trim(); loadNotifList(); }
        });
        fType.addEventListener('change', function () { S.notif.filterType = fType.value; loadNotifList(); });
        fStatus.addEventListener('change', function () { S.notif.filterStatus = fStatus.value; loadNotifList(); });

        function loadNotifList() {
            listHost.textContent = '';
            listHost.appendChild(h('p', 'bkc-hint', 'Đang tải…'));
            api('announcements.list', {
                q: S.notif.q || '', type: S.notif.filterType || undefined,
                status: S.notif.filterStatus || undefined, limit: 100
            }).then(function (data) {
                listHost.textContent = '';
                S.notif.list = data.announcements || [];
                if (!S.notif.list.length) {
                    listHost.appendChild(alertBox('Chưa có thông báo nào.', 'ok'));
                    return;
                }
                var t = table(['Tiêu đề', 'Loại', 'Ưu tiên', 'Trạng thái', 'Xuất bản', 'Thao tác']);
                S.notif.list.forEach(function (a) {
                    var tr = h('tr');
                    tr.appendChild(h('td', null, a.title));
                    tr.appendChild(h('td', null, labelOf(TYPES, a.type)));
                    tr.appendChild(h('td', null, labelOf(PRIORITIES, a.priority)));
                    var stCell = h('td');
                    stCell.appendChild(pill(a.is_published ? 'Published' : 'Draft', a.is_published ? 'ok' : 'warn'));
                    tr.appendChild(stCell);
                    tr.appendChild(h('td', null, fmt(a.published_at)));
                    var acts = h('td');
                    var row = h('div', 'bkc-row-actions');
                    row.appendChild(btn('Xem', '', function () {
                        previewNotification(a, null);
                    }));
                    row.appendChild(btn('Sửa', '', function () {
                        S.notif.editing = a;
                        switchTab('notifications');
                    }));
                    if (a.is_published) {
                        row.appendChild(btn('Ẩn', '', function () {
                            mutate('announcements.unpublish', { id: a.id }, 'Đã ẩn thông báo');
                        }));
                    } else {
                        row.appendChild(btn('Đăng lại', '', function () {
                            mutate('announcements.publish', { id: a.id }, 'Đã đăng thông báo');
                        }));
                    }
                    row.appendChild(btn('Xoá', '', function () {
                        confirmDelete('thông báo', a.title, function () {
                            mutate('announcements.delete', { id: a.id }, 'Đã xoá thông báo');
                        });
                    }));
                    acts.appendChild(row);
                    tr.appendChild(acts);
                    t.tbody.appendChild(tr);
                });
                listHost.appendChild(t.wrap);
            }).catch(function (err) {
                listHost.textContent = '';
                listHost.appendChild(alertBox(err.message || 'Không tải được danh sách.', 'error'));
            });
        }

        function mutate(action, payload, okMessage) {
            api(action, payload).then(function () {
                toast(okMessage, 'success');
                loadNotifList();
            }).catch(function (err) { fail(err); });
        }

        function saveNotification(payload) {
            api('announcements.save', payload).then(function (data) {
                toast(payload.is_published ? 'Đã xuất bản thông báo — hiển thị ngay trên website' : 'Đã lưu nháp thông báo', 'success');
                S.notif.editing = null;
                switchTab('notifications');
            }).catch(function (err) { fail(err); });
        }

        loadNotifList();
    }

    function previewNotification(item, onConfirm) {
        var wrap = h('div', 'bkc-modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var sheet = h('div', 'bkc-sheet');
        var head = h('div', 'bkc-sheet-head');
        var titles = h('div', 'bkc-sheet-titles');
        var line = h('div', 'bkc-sheet-line');
        line.appendChild(h('span', 'bkc-tag bkc-tag-' + item.type, labelOf(TYPES, item.type)));
        line.appendChild(h('span', 'bkc-tag', labelOf(PRIORITIES, item.priority)));
        if (item.published_at) line.appendChild(h('span', 'bkc-tag', fmt(item.published_at)));
        titles.appendChild(line);
        titles.appendChild(h('h2', 'bkc-sheet-title', item.title));
        head.appendChild(titles);
        var x = h('button', 'bkc-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng xem trước');
        head.appendChild(x);
        sheet.appendChild(head);

        var body = h('div', 'bkc-sheet-body');
        String(item.content || '').split(/\n{2,}/).forEach(function (par) {
            if (!par.trim()) return;
            var p = h('p');
            p.textContent = par.trim();
            body.appendChild(p);
        });
        sheet.appendChild(body);

        var foot = h('div', 'bkc-sheet-foot');
        foot.appendChild(btn('Đóng', 'bkc-btn-ghost', close));
        if (onConfirm) {
            foot.appendChild(btn('Xác nhận & Push', 'bkc-btn-primary', function () {
                close();
                onConfirm();
            }));
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
            D.documentElement.classList.remove('bkc-lock');
            D.removeEventListener('keydown', onKey);
        }
        x.addEventListener('click', close);
        x.focus();
    }

    function confirmDelete(what, name, onYes) {
        var body = h('div');
        body.appendChild(h('p', 'bkc-muted', 'Bạn sắp xoá ' + what + ':'));
        body.appendChild(h('p', 'bkc-confirm-name', name));
        body.appendChild(h('p', 'bkc-muted', 'Thao tác này không thể hoàn tác.'));
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
    function renderChangelog(pane) {
        var editing = S.cl.editing;
        var formCard = card(editing ? 'Chỉnh sửa changelog' : 'Tạo changelog');
        pane.appendChild(formCard.root);

        var f = h('div', 'bkc-form');
        var version = input('text', '2.5.0', editing ? editing.version : '');
        version.maxLength = 32;
        var title = input('text', 'Tiêu đề bản cập nhật', editing ? editing.title : '');
        var summary = input('text', 'Mô tả ngắn (không bắt buộc)', editing ? (editing.summary || '') : '');
        var category = selectBox(CATEGORIES, editing ? editing.category : 'features');

        f.appendChild(fieldRow('Version', version));
        f.appendChild(fieldRow('Title', title));
        f.appendChild(fieldRow('Description', summary));
        f.appendChild(fieldRow('Category', category));

        var sectionsWrap = h('div', 'bkc-form-row');
        sectionsWrap.appendChild(h('label', 'bkc-label', 'Danh sách thay đổi (mỗi dòng một mục)'));
        var sections = h('div', 'bkc-sections');
        sectionsWrap.appendChild(sections);
        var addSection = btn('+ Thêm mục', 'bkc-btn-ghost', function () {
            S.cl.sections.push({ category: 'features', text: '' });
            paintSections();
        });
        sectionsWrap.appendChild(addSection);
        f.appendChild(sectionsWrap);

        if (!S.cl.sections.length) {
            var initial = editing && Array.isArray(editing.content) ? editing.content : [{ category: 'features', items: [] }];
            S.cl.sections = initial.map(function (s) {
                return { category: s.category || 'features', text: (s.items || []).join('\n') };
            });
        }

        function paintSections() {
            sections.textContent = '';
            S.cl.sections.forEach(function (section, index) {
                var row = h('div', 'bkc-section-row');
                row.appendChild(selectBox(CATEGORIES, section.category, function (v) { section.category = v; }));
                var ta = textarea('Added Student Identification.\nAdded Notification Center.', section.text, 3);
                ta.addEventListener('input', function () { section.text = ta.value; });
                row.appendChild(ta);
                row.appendChild(btn('×', 'bkc-btn-ghost', function () {
                    S.cl.sections.splice(index, 1);
                    if (!S.cl.sections.length) S.cl.sections.push({ category: 'features', text: '' });
                    paintSections();
                }));
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
        }));
        actions.appendChild(btn('Lưu nháp', 'bkc-btn-primary', function () {
            var payload = readForm();
            if (!payload) return;
            payload.is_published = false;
            saveChangelog(payload);
        }));
        if (editing) {
            actions.appendChild(btn('Huỷ sửa', 'bkc-btn-ghost', function () {
                S.cl.editing = null;
                S.cl.sections = [];
                switchTab('changelog');
            }));
        }
        f.appendChild(actions);
        formCard.body.appendChild(f);

        function readForm() {
            var v = version.value.trim();
            var t = title.value.trim();
            if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(v)) {
                toast('Version không hợp lệ (chữ, số, . + _ -).', 'error');
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
                toast(payload.is_published ? 'Đã xuất bản changelog — hiển thị ngay trên website' : 'Đã lưu nháp changelog', 'success');
                S.cl.editing = null;
                S.cl.sections = [];
                switchTab('changelog');
            }).catch(function (err) { fail(err); });
        }

        /* Danh sách */
        var listCard = card('Lịch sử phiên bản');
        pane.appendChild(listCard.root);
        var filters = h('div', 'bkc-actions');
        var search = input('search', 'Tìm theo version…', S.cl.q || '');
        search.style.maxWidth = '14rem';
        var fCat = selectBox([['', 'Tất cả danh mục']].concat(CATEGORIES.map(function (p) { return [p[0], p[1]]; })), S.cl.filterCat || '');
        var fStatus = selectBox([['', 'Tất cả trạng thái'], ['published', 'Đã xuất bản'], ['draft', 'Nháp']], S.cl.filterStatus || '');
        filters.appendChild(search);
        filters.appendChild(fCat);
        filters.appendChild(fStatus);
        listCard.body.appendChild(filters);
        var listHost = h('div');
        listCard.body.appendChild(listHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { S.cl.q = search.value.trim(); load(); }
        });
        fCat.addEventListener('change', function () { S.cl.filterCat = fCat.value; load(); });
        fStatus.addEventListener('change', function () { S.cl.filterStatus = fStatus.value; load(); });

        function load() {
            listHost.textContent = '';
            listHost.appendChild(h('p', 'bkc-hint', 'Đang tải…'));
            api('changelog.list', {
                q: S.cl.q || '', category: S.cl.filterCat || undefined,
                status: S.cl.filterStatus || undefined, limit: 100
            }).then(function (data) {
                listHost.textContent = '';
                S.cl.list = data.changelog || [];
                if (!S.cl.list.length) {
                    listHost.appendChild(alertBox('Chưa có phiên bản nào.', 'ok'));
                    return;
                }
                var t = table(['Version', 'Tiêu đề', 'Danh mục', 'Trạng thái', 'Xuất bản', 'Thao tác']);
                S.cl.list.forEach(function (entry) {
                    var tr = h('tr');
                    tr.appendChild(h('td', 'bkc-code', entry.version));
                    tr.appendChild(h('td', null, entry.title));
                    tr.appendChild(h('td', null, labelOf(CATEGORIES, entry.category)));
                    var stCell = h('td');
                    stCell.appendChild(pill(entry.is_published ? 'Published' : 'Draft', entry.is_published ? 'ok' : 'warn'));
                    tr.appendChild(stCell);
                    tr.appendChild(h('td', null, fmt(entry.published_at)));
                    var acts = h('td');
                    var row = h('div', 'bkc-row-actions');
                    row.appendChild(btn('Sửa', '', function () {
                        S.cl.editing = entry;
                        S.cl.sections = (entry.content || []).map(function (s) {
                            return { category: s.category || 'other', text: (s.items || []).join('\n') };
                        });
                        switchTab('changelog');
                    }));
                    if (entry.is_published) {
                        row.appendChild(btn('Ẩn', '', function () {
                            mutate('changelog.unpublish', { id: entry.id }, 'Đã ẩn phiên bản');
                        }));
                    } else {
                        row.appendChild(btn('Đăng lại', '', function () {
                            mutate('changelog.publish', { id: entry.id }, 'Đã đăng phiên bản');
                        }));
                    }
                    row.appendChild(btn('Xoá', '', function () {
                        confirmDelete('phiên bản', entry.version, function () {
                            mutate('changelog.delete', { id: entry.id }, 'Đã xoá phiên bản');
                        });
                    }));
                    acts.appendChild(row);
                    tr.appendChild(acts);
                    t.tbody.appendChild(tr);
                });
                listHost.appendChild(t.wrap);
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
        var item = { title: payload.title, type: 'update', priority: 'normal', content: '' };
        var wrap = h('div', 'bkc-modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var sheet = h('div', 'bkc-sheet');
        var head = h('div', 'bkc-sheet-head');
        var titles = h('div', 'bkc-sheet-titles');
        var line = h('div', 'bkc-sheet-line');
        line.appendChild(h('span', 'bkc-tag bkc-tag-update', 'Phiên bản ' + payload.version));
        line.appendChild(h('span', 'bkc-tag', labelOf(CATEGORIES, payload.category)));
        titles.appendChild(line);
        titles.appendChild(h('h2', 'bkc-sheet-title', payload.title));
        head.appendChild(titles);
        var x = h('button', 'bkc-x', '×');
        x.type = 'button';
        head.appendChild(x);
        sheet.appendChild(head);

        var body = h('div', 'bkc-sheet-body');
        if (payload.summary) body.appendChild(h('p', 'bkc-wn-sum', payload.summary));
        payload.content.forEach(function (section) {
            var cat = h('div', 'bkc-cat');
            cat.appendChild(h('div', 'bkc-cat-title', labelOf(CATEGORIES, section.category)));
            var ul = h('ul', 'bkc-cat-list');
            section.items.forEach(function (text) { ul.appendChild(h('li', null, text)); });
            cat.appendChild(ul);
            body.appendChild(cat);
        });
        sheet.appendChild(body);

        var foot = h('div', 'bkc-sheet-foot');
        foot.appendChild(btn('Đóng', 'bkc-btn-ghost', close));
        foot.appendChild(btn('Xác nhận & Push', 'bkc-btn-primary', function () { close(); onConfirm(); }));
        sheet.appendChild(foot);
        wrap.appendChild(sheet);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
        (D.body || D.documentElement).appendChild(wrap);
        D.documentElement.classList.add('bkc-lock');
        D.addEventListener('keydown', onKey);
        function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
        function close() {
            wrap.remove();
            D.documentElement.classList.remove('bkc-lock');
            D.removeEventListener('keydown', onKey);
        }
        x.addEventListener('click', close);
        x.focus();
    }

    /* -------------------------------- Students ---------------------------- */
    function renderStudents(pane) {
        var importCard = card('Import danh sách từ students.txt');
        pane.appendChild(importCard.root);

        var info = h('div', 'bkc-form');
        info.appendChild(h('p', 'bkc-hint',
            'Mỗi dòng là một họ tên đầy đủ (UTF-8, tiếng Việt có dấu). Dòng trống và dòng bắt đầu bằng “#” được bỏ qua. ' +
            'Danh sách được xử lý trên máy chủ và không được lưu vào repository hay GitHub Pages.'));

        var fileInput = h('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,text/plain';
        fileInput.className = 'bkc-input';
        var ta = textarea('Dán nội dung students.txt vào đây (hoặc chọn tệp ở trên)…', S.students.importText || '', 6);

        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () { ta.value = String(reader.result || ''); S.students.importText = ta.value; };
            reader.onerror = function () { toast('Không đọc được tệp TXT.', 'error'); };
            reader.readAsText(file, 'utf-8');
        });

        info.appendChild(fieldRow('Tệp TXT', fileInput));
        info.appendChild(fieldRow('Nội dung', ta));

        var resultHost = h('div');
        var importBtn = btn('Import danh sách', 'bkc-btn-primary', function () {
            var text = ta.value;
            if (!text.trim()) { toast('Chưa có nội dung để import.', 'warn'); return; }
            importBtn.disabled = true;
            resultHost.textContent = '';
            resultHost.appendChild(alertBox('Đang import…'));
            global.BKCloud.importStudents(text).then(function (data) {
                importBtn.disabled = false;
                resultHost.textContent = '';
                var s = data.summary || {};
                resultHost.appendChild(alertBox(
                    'Đã xử lý ' + s.added + ' thêm mới · ' + s.updated + ' cập nhật · ' +
                    s.unchanged + ' không đổi · ' + s.duplicated + ' trùng · ' + s.skipped + ' bỏ qua.',
                    'ok'));
                if (data.duplicates && data.duplicates.length) {
                    var warn = alertBox('Họ tên trùng cần Admin phân biệt: ' +
                        data.duplicates.map(function (d) { return d.name; }).join(', '), 'warn');
                    resultHost.appendChild(warn);
                }
                S.students.importText = '';
                ta.value = '';
                loadStudents();
            }).catch(function (err) {
                importBtn.disabled = false;
                resultHost.textContent = '';
                resultHost.appendChild(alertBox(err.message || 'Import thất bại.', 'error'));
            });
        });
        var acts = h('div', 'bkc-actions');
        acts.appendChild(importBtn);
        info.appendChild(acts);
        info.appendChild(resultHost);
        importCard.body.appendChild(info);

        /* Danh sách học sinh */
        var listCard = card('Danh sách học sinh');
        pane.appendChild(listCard.root);

        var filters = h('div', 'bkc-actions');
        var search = input('search', 'Tìm theo họ tên…', S.students.q || '');
        search.style.maxWidth = '15rem';
        var fStatus = selectBox([['all', 'Tất cả'], ['active', 'Đang hoạt động'], ['inactive', 'Đã vô hiệu']],
            S.students.status || 'all');
        filters.appendChild(search);
        filters.appendChild(fStatus);
        listCard.body.appendChild(filters);

        var listHost = h('div');
        listCard.body.appendChild(listHost);

        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { S.students.q = search.value.trim(); loadStudents(); }
        });
        fStatus.addEventListener('change', function () { S.students.status = fStatus.value; loadStudents(); });

        function loadStudents() {
            listHost.textContent = '';
            listHost.appendChild(h('p', 'bkc-hint', 'Đang tải…'));
            api('students.list', {
                q: S.students.q || '', status: S.students.status, limit: 200
            }).then(function (data) {
                listHost.textContent = '';
                S.students.list = data.students || [];
                if (!S.students.list.length) {
                    listHost.appendChild(alertBox('Chưa có học sinh nào. Hãy import students.txt ở trên.', 'ok'));
                    return;
                }
                var t = table(['Họ tên', 'student_id', 'Mã nội bộ', 'Trạng thái', 'Tạo', 'Đồng bộ gần nhất', 'Thao tác']);
                S.students.list.forEach(function (st) {
                    var tr = h('tr');
                    var nameCell = h('td');
                    nameCell.appendChild(h('b', null, st.display_name));
                    if (st.disambiguator) nameCell.appendChild(h('div', 'bkc-hint', st.disambiguator));
                    if (st.needs_review) nameCell.appendChild(pill('Cần phân biệt', 'warn'));
                    tr.appendChild(nameCell);
                    tr.appendChild(h('td', 'bkc-code', st.id));
                    tr.appendChild(h('td', 'bkc-code', st.student_code));
                    var stCell = h('td');
                    stCell.appendChild(pill(st.is_active ? 'Active' : 'Đã khoá', st.is_active ? 'ok' : 'off'));
                    tr.appendChild(stCell);
                    tr.appendChild(h('td', null, fmt(st.created_at)));
                    tr.appendChild(h('td', null, fmt(st.last_sync_at)));
                    var actsCell = h('td');
                    var row = h('div', 'bkc-row-actions');
                    row.appendChild(btn('Sửa', '', function () { editStudent(st); }));
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
            }).catch(function (err) {
                listHost.textContent = '';
                listHost.appendChild(alertBox(err.message || 'Không tải được danh sách.', 'error'));
            });
        }

        function editStudent(st) {
            var body = h('div', 'bkc-form');
            var name = input('text', 'Họ và tên', st.display_name);
            var dis = input('text', 'Thông tin phân biệt (bắt buộc khi trùng tên)', st.disambiguator || '');
            body.appendChild(fieldRow('Họ và tên', name));
            body.appendChild(fieldRow('Phân biệt hồ sơ', dis));
            body.appendChild(h('p', 'bkc-hint', 'student_id: ' + st.id + ' · Mã nội bộ: ' + st.student_code));
            var msg = h('p', 'bkc-gate-msg');
            body.appendChild(msg);

            var m = global.BK.ui.modal({
                title: 'Cập nhật hồ sơ học sinh',
                body: body,
                actions: [
                    { label: 'Huỷ', variant: 'ghost', onClick: function (c) { c(); } },
                    {
                        label: 'Lưu', variant: 'primary', onClick: function (c) {
                            api('students.update', {
                                id: st.id,
                                display_name: name.value.trim(),
                                disambiguator: dis.value.trim()
                            }).then(function () {
                                c();
                                toast('Đã cập nhật hồ sơ', 'success');
                                loadStudents();
                            }).catch(function (err) {
                                msg.textContent = err.message || 'Không lưu được.';
                                msg.className = 'bkc-gate-msg is-error';
                            });
                        }
                    }
                ]
            });
        }

        loadStudents();
    }

    /* ------------------------------ Activity Logs ------------------------- */
    function renderLogs(pane) {
        var c = card('Activity Logs', [btn('Làm mới', 'bkc-btn-ghost', function () { switchTab('logs'); })]);
        pane.appendChild(c.root);
        var host = h('div');
        c.body.appendChild(host);
        host.appendChild(h('p', 'bkc-hint', 'Đang tải…'));
        api('logs.list', { limit: 100 }).then(function (data) {
            host.textContent = '';
            S.logs = data.logs || [];
            if (!S.logs.length) { host.appendChild(alertBox('Chưa có hoạt động nào.', 'ok')); return; }
            var t = table(['Thời gian', 'Hành động', 'Đối tượng', 'Chi tiết']);
            S.logs.forEach(function (log) {
                var tr = h('tr');
                tr.appendChild(h('td', null, fmt(log.created_at)));
                tr.appendChild(h('td', 'bkc-code', log.action));
                tr.appendChild(h('td', null, (log.target_type || '') + (log.target_id ? ' · ' + log.target_id : '')));
                var detail = h('td');
                var pre = h('pre', 'bkc-pre', JSON.stringify(log.detail || {}));
                detail.appendChild(pre);
                tr.appendChild(detail);
                t.tbody.appendChild(tr);
            });
            host.appendChild(t.wrap);
        }).catch(function (err) {
            host.textContent = '';
            host.appendChild(alertBox(err.message || 'Không tải được nhật ký.', 'error'));
        });
    }

    /* --------------------------------- Settings --------------------------- */
    function renderSettings(pane) {
        var c = card('Trạng thái hệ thống');
        pane.appendChild(c.root);
        var host = h('div', 'bkc-form');
        c.body.appendChild(host);
        host.appendChild(h('p', 'bkc-hint', 'Đang kiểm tra…'));

        api('settings.status').then(function (data) {
            var st = data.status || {};
            host.textContent = '';
            var line = h('div', 'bkc-actions');
            line.appendChild(pill(st.adminDevCode ? 'ADMIN_DEV_CODE: đã đặt' : 'ADMIN_DEV_CODE: thiếu',
                st.adminDevCode ? 'ok' : 'off'));
            line.appendChild(pill(st.serviceRole ? 'service_role: sẵn sàng' : 'service_role: thiếu',
                st.serviceRole ? 'ok' : 'off'));
            line.appendChild(pill(st.rosterSecret ? 'STUDENT_ROSTER_SECRET: đã đặt' : 'STUDENT_ROSTER_SECRET: chưa đặt',
                st.rosterSecret ? 'ok' : 'warn'));
            line.appendChild(pill('Học sinh: ' + st.students, 'ok'));
            host.appendChild(line);

            var cloud = global.BKCloud && global.BKCloud.state ? global.BKCloud.state() : {};
            var rows = h('div', 'bkc-actions');
            rows.appendChild(pill(cloud.bound ? 'Phiên học sinh: đã gắn' : 'Phiên học sinh: chưa chọn',
                cloud.bound ? 'ok' : 'warn'));
            rows.appendChild(pill('Lần đồng bộ cuối: ' + (cloud.lastSyncAt ? fmt(new Date(cloud.lastSyncAt).toISOString()) : '—')));
            host.appendChild(rows);

            host.appendChild(h('p', 'bkc-hint',
                'Dev Code và service_role key chỉ tồn tại trong Supabase Edge Function Secrets. ' +
                'Dashboard không bao giờ đọc hay hiển thị giá trị của chúng.'));

            var acts = h('div', 'bkc-actions');
            acts.appendChild(btn('Đọc hướng dẫn cài đặt', 'bkc-btn-ghost', function () {
                var a = D.createElement('a');
                a.href = (global.BK && BK.util && BK.util.basePath ? BK.util.basePath() : './') + 'docs/SUPABASE_SETUP.md';
                a.target = '_blank';
                a.rel = 'noopener';
                a.click();
            }));
            acts.appendChild(btn('Đăng xuất Dev', 'bkc-btn-danger', function () {
                global.BKCloud.adminLogout();
                closeDash();
                toast('Đã đăng xuất Dev Dashboard', 'info');
            }));
            host.appendChild(acts);
        }).catch(function (err) {
            host.textContent = '';
            host.appendChild(alertBox(err.message || 'Không đọc được trạng thái.', 'error'));
        });
    }

    global.openDevDashboard = openDevDashboard;
    global.BKDashboard = {
        open: openDevDashboard,
        close: closeDash,
        refresh: function () { refreshTab(false); },
        tab: function (name) { if (S.root) switchTab(name); }
    };
})(typeof window !== 'undefined' ? window : this);
