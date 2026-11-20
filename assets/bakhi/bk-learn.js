/* =========================================================================
   Bá Khí — bk-learn.js
   Trung tâm học tập: phân tích tiến độ, ôn tập thông minh (spaced repetition),
   ghi chú, đánh dấu, lịch sử, thành tích, tìm kiếm toàn cục, command palette,
   chế độ tập trung, xuất/nhập dữ liệu.

   Nguyên tắc:
   - Không có bộ đếm thời gian, không có bài thi thử, không có áp lực.
   - Không sửa nội dung giáo dục gốc; chỉ hiển thị và lưu hoạt động người dùng.
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    var BK = global.BK;
    if (!D || !BK) return;
    if (global.BKLearn) return;

    var el = BK.ui.el;
    var esc = BK.util.esc;
    var norm = BK.util.norm;
    var fmtDate = BK.util.fmtDate;
    var fmtTime = BK.util.fmtTime;

    /* Nạp CSS. */
    (function () {
        var id = 'bk-css-learn';
        if (D.getElementById(id)) return;
        var link = D.createElement('link');
        link.id = id; link.rel = 'stylesheet';
        link.href = BK.util.basePath() + 'assets/bakhi/bk-learn.css';
        (D.head || D.documentElement).appendChild(link);
    })();

    function btn(label, cls, onClick, icon) {
        var b = el('button', 'bk-btn ' + (cls || ''), '');
        b.type = 'button';
        if (icon) {
            var i = el('i', 'fa-solid ' + icon);
            i.setAttribute('aria-hidden', 'true');
            b.appendChild(i);
        }
        if (label) b.appendChild(D.createTextNode(label));
        b.addEventListener('click', onClick);
        return b;
    }
    function ghostBtn(label, onClick, icon) { return btn(label, 'bk-btn-ghost bk-btn-sm', onClick, icon); }
    function field(labelText, control) {
        var f = el('label', 'bk-field');
        f.appendChild(el('span', null, labelText));
        f.appendChild(control);
        return f;
    }
    function select(options, value, onChange, ariaLabel) {
        var s = el('select', 'bk-select');
        if (ariaLabel) s.setAttribute('aria-label', ariaLabel);
        options.forEach(function (o) {
            var op = el('option', null, o.label);
            op.value = o.value;
            s.appendChild(op);
        });
        s.value = value;
        if (onChange) s.addEventListener('change', function () { onChange(s.value); });
        return s;
    }
    function textInput(value, placeholder, onInput, ariaLabel) {
        var i = el('input', 'bk-input');
        i.type = 'text';
        i.value = value || '';
        if (placeholder) i.placeholder = placeholder;
        if (ariaLabel) i.setAttribute('aria-label', ariaLabel);
        if (onInput) i.addEventListener('input', BK.util.debounce(function () { onInput(i.value); }, 180));
        return i;
    }
    function emptyState(text, icon) {
        var d = el('div', 'bk-empty');
        d.appendChild(el('i', 'fa-solid ' + (icon || 'fa-inbox')));
        d.appendChild(el('p', null, text));
        return d;
    }
    function pct(n) { return Math.round(n) + '%'; }
    function dayShift(n) {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        return BK.util.dayKey(d.getTime() + n * 86400000);
    }
    function subjectName(id) { return BK.subjectName(id); }
    function subjectColor(id) { return BK.subjectColor(id); }
    function badge(text, kind) {
        return el('span', 'bk-badge' + (kind ? ' bk-badge-' + kind : ''), text);
    }

    /* =====================================================================
       Chế độ tập trung
       ================================================================== */
    function applyPreferences() {
        var s = BK.store.get();
        var root = D.documentElement;
        root.classList.toggle('bk-focus', !!s.prefs.focus);
        root.classList.toggle('bk-ambient', !!s.prefs.focus && !!s.prefs.ambient);
        root.style.setProperty('--bkl-font-scale', String(BK.util.clamp(s.prefs.fontSize, 85, 160) / 100));
    }
    function setPref(patch) {
        BK.store.update(function (s) {
            Object.keys(patch).forEach(function (k) { s.prefs[k] = patch[k]; });
            return s.prefs;
        });
        applyPreferences();
    }
    function toggleFocus(force) {
        var s = BK.store.get();
        var on = typeof force === 'boolean' ? force : !s.prefs.focus;
        setPref({ focus: on });
        BK.ui.toast(on ? 'Đã bật chế độ tập trung (Esc để thoát)' : 'Đã tắt chế độ tập trung', 'info');
    }

    /* =====================================================================
       Hub
       ================================================================== */
    var hub = { modal: null, inline: null, tab: 'overview', root: null, navItems: {} };
    var state = {
        noteQuery: '', noteCategory: '',
        bookmarkQuery: '', bookmarkType: '',
        achFilter: 'all', achQuery: ''
    };

    /*
     * 8.2.0 — Trung tâm học tập được tổ chức lại thành 6 khu vực Learning
     * Intelligence (do bk-learning.js đảm nhận) + nhóm công cụ cá nhân.
     * Tab "Ôn tập" cũ (trùng logic với Sổ tay câu sai) đã được thay bằng
     * Sổ tay câu sai + Trung tâm ôn tập; tab "Lịch sử" gộp vào Phân tích.
     */
    var TABS = [
        { id: 'overview', label: 'Tổng quan', icon: 'fa-gauge-high', group: 'Học tập' },
        { id: 'subjects', label: 'Môn học', icon: 'fa-layer-group', group: '' },
        { id: 'mistakes', label: 'Sổ tay câu sai', icon: 'fa-book-skull', group: '' },
        { id: 'analytics', label: 'Phân tích', icon: 'fa-chart-line', group: '' },
        { id: 'planner', label: 'Kế hoạch', icon: 'fa-calendar-days', group: '' },
        { id: 'revision', label: 'Ôn tập', icon: 'fa-rotate', group: '' },
        { id: 'goals', label: 'Mục tiêu', icon: 'fa-bullseye', group: '' },
        { id: 'notes', label: 'Ghi chú', icon: 'fa-pen-nib', group: 'Cá nhân' },
        { id: 'bookmarks', label: 'Đánh dấu', icon: 'fa-bookmark', group: '' },
        { id: 'achievements', label: 'Thành tích', icon: 'fa-medal', group: '' },
        { id: 'settings', label: 'Cài đặt', icon: 'fa-gear', group: '' }
    ];
    var TAB_ALIASES = { review: 'mistakes', history: 'analytics', hub: 'overview', mistake: 'mistakes', plan: 'planner' };

    /* Dựng khung điều hướng + nội dung dùng chung cho cả modal và trang Cài đặt. */
    function buildHubBody(tab) {
        var body = el('div', 'bk-hub');
        var nav = el('nav', 'bk-hub-nav');
        nav.setAttribute('aria-label', 'Khu vực học tập');
        nav.setAttribute('role', 'tablist');
        var main = el('div', 'bk-hub-main');
        main.id = 'bkHubMain';
        hub.navItems = {};
        var lastGroup = null;
        TABS.forEach(function (t) {
            if (t.group && t.group !== lastGroup) {
                lastGroup = t.group;
                nav.appendChild(el('div', 'bk-hub-group', t.group));
            }
            var b = el('button', 'bk-hub-tab' + (t.id === (tab || 'overview') ? ' on' : ''));
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.appendChild(el('i', 'fa-solid ' + t.icon));
            b.appendChild(el('span', null, t.label));
            if (t.id === 'achievements') {
                var cnt = el('span', 'bk-hub-count', '');
                cnt.id = 'bkAchCount';
                b.appendChild(cnt);
            }
            b.addEventListener('click', function () { setTab(t.id); });
            b.tabIndex = t.id === (tab || 'overview') ? 0 : -1;
            b.addEventListener('keydown', function (e) {
                var ids = TABS.map(function (x) { return x.id; });
                var i = ids.indexOf(t.id), n = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % ids.length;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + ids.length) % ids.length;
                else if (e.key === 'Home') n = 0;
                else if (e.key === 'End') n = ids.length - 1;
                if (n == null) return;
                e.preventDefault();
                setTab(ids[n]);
                if (hub.navItems[ids[n]]) hub.navItems[ids[n]].focus();
            });
            nav.appendChild(b);
            hub.navItems[t.id] = b;
        });
        body.appendChild(nav);
        body.appendChild(main);

        var foot = el('div', 'bk-hub-foot');
        foot.appendChild(el('span', null, 'Dữ liệu lưu trên thiết bị này · không có áp lực thời gian'));
        var footActions = el('span', 'bk-row');
        footActions.appendChild(ghostBtn('Tìm kiếm', function () { openSearch(); }, 'fa-magnifying-glass'));
        footActions.appendChild(ghostBtn('Xuất dữ liệu', function () { exportData('all'); }, 'fa-download'));
        foot.appendChild(footActions);

        var wrap = el('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.minHeight = '0';
        wrap.appendChild(body);
        wrap.appendChild(foot);
        return { wrap: wrap, main: main };
    }

    /**
     * Gắn Trung tâm học tập vào một phần tử bất kỳ (trang Cài đặt).
     * Dùng chung đúng bộ tab và dữ liệu với modal — không có hệ thống thứ hai.
     */
    function mountHub(container, tab) {
        if (!container) return null;
        hub.inline = container;
        container.innerHTML = '';
        var parts = buildHubBody(tab);
        container.appendChild(parts.wrap);
        hub.root = parts.main;
        setTab(tab || 'overview');
        return { setTab: setTab, element: container };
    }

    function openHub(tab) {
        if (hub.modal) {
            if (tab) setTab(tab);
            return;
        }
        var parts = buildHubBody(tab);

        hub.modal = BK.ui.modal({
            title: 'Trung tâm học tập',
            body: parts.wrap,
            wide: true,
            className: 'bk-hub-modal',
            labelledBy: 'bkHubTitle',
            onClose: function () {
                /* Xoá tham chiếu để lần sau mở lại được (trước đây modal cũ bị giữ mãi). */
                hub.modal = null;
                hub.root = null;
                hub.navItems = {};
            }
        });
        hub.modal.panel.querySelector('.bk-modal-title').id = 'bkHubTitle';
        hub.root = parts.main;
        setTab(tab || 'overview');
    }

    function setTab(tab) {
        tab = TAB_ALIASES[tab] || tab;
        hub.tab = tab;
        syncAchBadge();
        Object.keys(hub.navItems).forEach(function (k) {
            var b = hub.navItems[k];
            var on = k === tab;
            b.classList.toggle('on', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
        renderTab();
        /* Chuyển động nhẹ khi đổi tab (tự tắt khi người dùng giảm chuyển động). */
        var root = hub.root;
        if (root && root.classList) {
            root.classList.remove('bk-tab-in');
            void root.offsetWidth;
            root.classList.add('bk-tab-in');
        }
    }

    function renderTab() {
        var root = hub.root;
        if (!root) return;
        root.innerHTML = '';
        var map = {
            overview: renderOverview, notes: renderNotes,
            bookmarks: renderBookmarks,
            achievements: renderAchievements, settings: renderSettings
        };
        var learn = global.BKLearning && global.BKLearning.tabs;
        if (learn && learn[hub.tab] && typeof learn[hub.tab].render === 'function') {
            learn[hub.tab].render(root);
            return;
        }
        (map[hub.tab] || renderOverview)(root);
    }

    /* --------------------------- Tổng quan ------------------------------ */
    function renderOverview(root) {
        var s = BK.store.get();
        var acc = BK.stats.accuracy(s);
        var stats = BK.mistakes.stats();
        var score = BK.analytics.learningScore();
        var plans = BK.planner.list({ groups: true });
        var due = BK.revision.queue('due');
        var goals = BK.goals.items().filter(function (g) { return g.goal.status === 'active'; });

        root.appendChild(el('h3', null, 'Tổng quan học tập'));
        root.appendChild(el('p', 'bk-sub', 'Một nơi duy nhất cho câu sai, phân tích, kế hoạch và ôn tập — cùng một nguồn dữ liệu, không đo thời gian, không xếp hạng.'));

        var cards = el('div', 'bk-cards');
        [
            ['Learning Score', score.sufficient ? String(score.score) : '—', score.sufficient ? '/100 · ' + score.sample + ' câu' : 'cần thêm dữ liệu'],
            ['Sổ tay câu sai', stats.active, stats.due + ' câu đến hạn ôn'],
            ['Đến hạn hôm nay', due.length, due.length ? 'sẵn sàng ôn' : 'đã ôn hết'],
            ['Việc hôm nay', plans.today.length, plans.all.length + ' nhiệm vụ tổng cộng']
        ].forEach(function (c) {
            var card = el('div', 'bk-card');
            card.appendChild(el('div', 'bk-card-k', c[0]));
            card.appendChild(el('div', 'bk-card-v', String(c[1])));
            card.appendChild(el('div', 'bk-card-hint', c[2]));
            cards.appendChild(card);
        });
        root.appendChild(cards);

        if (!acc.total) {
            var hint = el('div', 'bk-item');
            hint.style.marginTop = '.8rem';
            hint.appendChild(el('p', 'bk-item-title', 'Bắt đầu bằng một bài luyện tập'));
            hint.appendChild(el('p', 'muted bk-small', 'Khi bạn làm câu hỏi trên các trang bài học, kết quả sẽ được ghi nhận tự động vào đây. Câu làm sai sẽ tự vào Sổ tay câu sai và lịch ôn.'));
            root.appendChild(hint);
        }

        /* Việc nên làm — mỗi nút mở đúng một hệ thống, không nhân bản logic. */
        root.appendChild(el('h4', null, 'Cần bạn hôm nay'));
        var actions = el('div', 'bk-item-actions bk-overview-actions');
        if (due.length) {
            actions.appendChild(ghostBtn('Ôn ' + due.length + ' câu đến hạn', function () {
                if (global.BKLearning) global.BKLearning.startSession('due');
                else setTab('revision');
            }, 'fa-rotate'));
        }
        actions.appendChild(ghostBtn('Sổ tay câu sai (' + stats.active + ')', function () { setTab('mistakes'); }, 'fa-book-skull'));
        actions.appendChild(ghostBtn('Kế hoạch hôm nay' + (plans.today.length ? ' (' + plans.today.length + ')' : ''), function () { setTab('planner'); }, 'fa-calendar-days'));
        actions.appendChild(ghostBtn('Xem phân tích', function () { setTab('analytics'); }, 'fa-chart-line'));
        actions.appendChild(ghostBtn('Mục tiêu' + (goals.length ? ' (' + goals.length + ')' : ''), function () { setTab('goals'); }, 'fa-bullseye'));
        root.appendChild(actions);

        /* Hoạt động 14 ngày — dữ liệu thật, cùng nguồn với tab Phân tích. */
        root.appendChild(el('h4', null, 'Hoạt động 14 ngày gần nhất'));
        var series = BK.analytics.series(14);
        root.appendChild(barChart(series.map(function (d) {
            return { label: d.label, count: d.total };
        }), 'Số câu luyện mỗi ngày'));

        /* Tiến độ môn — bản tóm tắt; chi tiết ở tab Môn học. */
        root.appendChild(el('h4', null, 'Tiến độ theo môn'));
        var perf = BK.analytics.subjects(0).slice(0, 5);
        if (!perf.length) {
            root.appendChild(emptyState('Chưa có dữ liệu môn học.', 'fa-layer-group'));
        } else {
            perf.forEach(function (m) {
                root.appendChild(meter(m.name, m.correct, m.total, m.total ? m.accuracy + '%' : '—'));
            });
            root.appendChild(ghostBtn('Xem tất cả môn', function () { setTab('subjects'); }, 'fa-arrow-right'));
        }

                /* Huy hiệu hồ sơ: đếm đúng danh mục badge, không dùng mốc nội bộ. */
        var pb = profileBadgeStats();
        root.appendChild(el('h4', null, 'Huy hiệu hồ sơ (' + pb.done + '/' + pb.total + ')'));
        var badgeCard = el('div', 'bk-item');
        var badgeBar = el('div', 'bk-progress');
        var badgeFill = el('span');
        badgeFill.style.width = (pb.total ? Math.round((pb.done / pb.total) * 100) : 0) + '%';
        badgeBar.appendChild(badgeFill);
        badgeCard.appendChild(badgeBar);
        var frameCount = 0;
        try { if (BK.badges && BK.badges.ownedFrames) frameCount = BK.badges.ownedFrames().length; } catch (e) { }
        badgeCard.appendChild(el('p', 'bk-small bk-muted',
            'Tổng ' + pb.total + ' huy hiệu · đã mở ' + pb.done +
            (frameCount ? ' · ' + frameCount + '/30 khung avatar' : '') + '.'));
        var badgeMore = ghostBtn('Xem hồ sơ & bộ sưu tập', function () {
            global.location.href = (BK.util && BK.util.basePath ? BK.util.basePath() : '') + 'profile/';
        }, 'fa-id-card');
        badgeCard.appendChild(badgeMore);
        var nextBadges = pb.list.filter(function (b) { return !b.unlockedAt && !b.adminOnly; })
            .sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); }).slice(0, 3);
        if (nextBadges.length) {
            var nextLine = el('p', 'bk-small bk-muted');
            nextLine.style.margin = '.5rem 0 0';
            nextLine.textContent = 'Gần mở nhất: ' + nextBadges.map(function (b) {
                return b.name + ' (' + b.current + '/' + b.goal + ')';
            }).join(' · ');
            badgeCard.appendChild(nextLine);
        }
        root.appendChild(badgeCard);

        try {
            if (global.BKCloud && BKCloud.state) {
                var cs = BKCloud.state();
                var notifyCard = el('div', 'bk-item');
                notifyCard.appendChild(el('p', 'bk-item-title', 'Thông báo từ quản trị viên'));
                notifyCard.appendChild(el('p', 'bk-small bk-muted',
                    (cs.notificationsUnread || 0) + ' thông báo chưa đọc · ' +
                    (cs.announcements || 0) + ' thông báo đang hiển thị.'));
                var notifyBtn = ghostBtn('Mở trung tâm thông báo', function () {
                    if (BKCloud.openNotifications) BKCloud.openNotifications();
                }, 'fa-bell');
                notifyCard.appendChild(notifyBtn);
                root.appendChild(notifyCard);
            }
        } catch (e) { }

        /* Mốc học tập (12 mốc nội bộ của Trung tâm học tập) */
        var achs = BK.achievements.progress();
        var achieved = achs.filter(function (a) { return a.unlockedAt; });
        root.appendChild(el('h4', null, 'Mốc học tập (' + achieved.length + '/' + achs.length + ')'));
        var achCard = el('div', 'bk-item');
        var bar = el('div', 'bk-progress');
        var fill = el('span');
        fill.style.width = (achs.length ? Math.round((achieved.length / achs.length) * 100) : 0) + '%';
        bar.appendChild(fill);
        achCard.appendChild(bar);
        var next = BK.achievements.next(3);
        if (next.length) {
            achCard.appendChild(el('p', 'bk-small bk-muted', 'Gần đạt tiếp theo:'));
            next.forEach(function (a) {
                var row = el('div', 'bk-ach-next');
                row.appendChild(el('span', 'bk-ach-next-name', a.name));
                row.appendChild(el('span', 'bk-small bk-muted', a.current + '/' + a.goal));
                achCard.appendChild(row);
            });
        } else if (!achieved.length) {
            achCard.appendChild(el('p', 'bk-small bk-muted', 'Mốc đầu tiên sẽ đến khi bạn mở bài học hoặc luyện câu hỏi đầu tiên.'));
        }
        var more = ghostBtn('Xem tất cả thành tích', function () { setTab('achievements'); }, 'fa-medal');
        achCard.appendChild(more);
        root.appendChild(achCard);
        if (achieved.length) {
            var rowPills = el('div', 'bk-pill-row');
            achieved.slice(-8).reverse().forEach(function (a) {
                var b = badge(a.name, 'ok');
                b.title = fmtDate(a.unlockedAt);
                rowPills.appendChild(b);
            });
            root.appendChild(rowPills);
        }
    }

    function groupBy(list, keyFn) {
        var out = {};
        list.forEach(function (x) {
            var k = keyFn(x);
            (out[k] = out[k] || []).push(x);
        });
        return out;
    }
    function meter(name, correct, total, right) {
        var row = el('div', 'bk-meter');
        row.appendChild(el('span', 'bk-meter-name', name));
        var wrap = el('div');
        var bar = el('div', 'bk-progress');
        var fill = el('span');
        fill.style.width = (total ? Math.round((correct / total) * 100) : 0) + '%';
        bar.appendChild(fill);
        wrap.appendChild(bar);
        row.appendChild(wrap);
        row.appendChild(el('span', 'bk-meter-val', right || (correct + '/' + total)));
        return row;
    }
    function barChart(data, label) {
        var holder = el('div');
        holder.setAttribute('role', 'img');
        holder.setAttribute('aria-label', label + ': ' + data.map(function (d) { return d.label + ' ' + d.count; }).join(', '));
        var max = Math.max.apply(null, data.map(function (d) { return d.count; }).concat([1]));
        var chart = el('div', 'bk-bars');
        data.forEach(function (d) {
            var bar = el('div', 'bk-bar' + (d.count ? '' : ' is-empty'));
            bar.appendChild(el('span', 'bk-bar-count', d.count ? String(d.count) : ''));
            var track = el('div', 'bk-bar-track');
            var fill = el('div', 'bk-bar-fill');
            fill.style.height = (d.count ? Math.max(6, Math.round((d.count / max) * 100)) : 2) + '%';
            track.appendChild(fill);
            bar.appendChild(track);
            bar.appendChild(el('span', 'bk-bar-label', d.label));
            chart.appendChild(bar);
        });
        holder.appendChild(chart);
        return holder;
    }

    /* ----------------------------- Ghi chú ------------------------------ */
    function renderNotes(root) {
        var s = BK.store.get();
        root.appendChild(el('h3', null, 'Ghi chú cá nhân'));
        root.appendChild(el('p', 'bk-sub', 'Ghi chú theo môn, theo câu hỏi. Hỗ trợ Markdown an toàn (in đậm, nghiêng, danh sách, liên kết http/https).'));

        var controls = el('div', 'bk-row');
        controls.style.marginBottom = '.7rem';
        var search = textInput(state.noteQuery, 'Tìm ghi chú…', function (v) { state.noteQuery = v; renderTab(); }, 'Tìm ghi chú');
        search.style.maxWidth = '16rem';
        controls.appendChild(search);
        controls.appendChild(btn('Ghi chú mới', 'bk-btn', function () { openNoteEditor(null); }, 'fa-plus'));
        controls.appendChild(ghostBtn('Xuất ghi chú', function () { exportData('notes'); }, 'fa-download'));
        root.appendChild(controls);

        var categories = {};
        s.notes.forEach(function (n) { categories[n.category] = true; });
        var cats = Object.keys(categories);
        if (cats.length > 1) {
            var chips = el('div', 'bk-pill-row');
            chips.style.marginBottom = '.6rem';
            [{ v: '', label: 'Tất cả' }].concat(cats.map(function (c) { return { v: c, label: c }; })).forEach(function (c) {
                var chip = el('button', 'bk-chip' + (state.noteCategory === c.v ? ' on' : ''), c.label);
                chip.type = 'button';
                chip.addEventListener('click', function () { state.noteCategory = c.v; renderTab(); });
                chips.appendChild(chip);
            });
            root.appendChild(chips);
        }

        var q = norm(state.noteQuery);
        var notes = s.notes.filter(function (n) {
            if (state.noteCategory && n.category !== state.noteCategory) return false;
            if (q && norm(n.title + ' ' + n.body + ' ' + n.category + ' ' + subjectName(n.subject)).indexOf(q) < 0) return false;
            return true;
        }).sort(function (a, b) {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updatedAt - a.updatedAt;
        });

        if (!notes.length) {
            root.appendChild(emptyState(s.notes.length ? 'Không có ghi chú khớp bộ lọc.' : 'Chưa có ghi chú nào. Tạo ghi chú đầu tiên của bạn.', 'fa-pen-nib'));
            return;
        }

        var list = el('div', 'bk-list');
        notes.forEach(function (n) {
            var card = el('div', 'bk-item bk-note-card' + (n.pinned ? ' pinned' : ''));
            var head = el('div', 'bk-item-head');
            var w = el('div');
            w.style.minWidth = '0';
            var title = el('p', 'bk-item-title');
            title.textContent = (n.pinned ? '📌 ' : '') + n.title;
            w.appendChild(title);
            var meta = el('div', 'bk-item-meta');
            meta.appendChild(badge(subjectName(n.subject)));
            meta.appendChild(badge(n.category));
            meta.appendChild(el('span', null, 'Cập nhật ' + fmtDate(n.updatedAt)));
            w.appendChild(meta);
            head.appendChild(w);
            card.appendChild(head);

            var body = el('div', 'bk-note-body bk-md');
            body.innerHTML = BK.ui.markdown(n.body.slice(0, 1200));
            card.appendChild(body);

            var actions = el('div', 'bk-item-actions');
            actions.appendChild(ghostBtn('Sửa', function () { openNoteEditor(n); }, 'fa-pen'));
            actions.appendChild(ghostBtn(n.pinned ? 'Bỏ ghim' : 'Ghim', function () {
                BK.updateNote(n.id, { pinned: !n.pinned }); renderTab();
            }, 'fa-thumbtack'));
            actions.appendChild(ghostBtn('Sao chép', function () {
                BK.util.copy(n.body).then(function () { BK.ui.toast('Đã sao chép ghi chú', 'success'); },
                    function () { BK.ui.toast('Trình duyệt không cho phép sao chép', 'error'); });
            }, 'fa-copy'));
            actions.appendChild(ghostBtn('Xoá', function () {
                BK.ui.confirm({ title: 'Xoá ghi chú', message: 'Xoá ghi chú "' + n.title + '"? Hành động này không thể hoàn tác.', ok: 'Xoá', danger: true })
                    .then(function (ok) { if (ok) { BK.removeNote(n.id); renderTab(); BK.ui.toast('Đã xoá ghi chú', 'success'); } });
            }, 'fa-trash'));
            card.appendChild(actions);
            list.appendChild(card);
        });
        root.appendChild(list);
    }

    function openNoteEditor(note, preset) {
        preset = preset || {};
        var isNew = !note;
        var body = el('div');
        var title = textInput(note ? note.title : (preset.title || ''), 'Tiêu đề ghi chú', null, 'Tiêu đề');
        body.appendChild(field('Tiêu đề', title));

        var subjectOptions = Object.keys(BK.subjects).map(function (id) { return { value: id, label: subjectName(id) }; })
            .concat([{ value: 'khac', label: 'Khác' }]);
        var subject = select(subjectOptions, note ? note.subject : (preset.subject || BK.subjectOf()), null, 'Môn học');
        var category = textInput(note ? note.category : (preset.category || 'Chung'), 'Danh mục (ví dụ: Công thức)', null, 'Danh mục');
        var row = el('div', 'bk-row');
        var f1 = field('Môn học', subject); f1.style.flex = '1';
        var f2 = field('Danh mục', category); f2.style.flex = '1';
        row.appendChild(f1); row.appendChild(f2);
        body.appendChild(row);

        var textarea = el('textarea', 'bk-textarea');
        textarea.value = note ? note.body : (preset.body || '');
        textarea.placeholder = 'Nội dung ghi chú (hỗ trợ **in đậm**, *nghiêng*, `code`, danh sách "- ")';
        body.appendChild(field('Nội dung', textarea));

        var pinnedWrap = el('label', 'bk-row bk-small');
        var pinned = el('input'); pinned.type = 'checkbox'; pinned.checked = !!(note && note.pinned);
        pinnedWrap.appendChild(pinned); pinnedWrap.appendChild(el('span', null, 'Ghim ghi chú này'));
        body.appendChild(pinnedWrap);

        var previewLabel = el('div', 'bk-small bk-muted');
        previewLabel.style.margin = '.4rem 0 .2rem';
        previewLabel.textContent = 'Xem trước:';
        var preview = el('div', 'bk-md bk-item');
        preview.style.maxHeight = '9rem';
        preview.style.overflow = 'auto';
        body.appendChild(previewLabel);
        body.appendChild(preview);

        var updatePreview = BK.util.debounce(function () {
            preview.innerHTML = BK.ui.markdown(textarea.value || '*(trống)*');
        }, 150);
        textarea.addEventListener('input', updatePreview);
        updatePreview();

        var actions = [
            { label: 'Huỷ', variant: 'ghost' }
        ];
        if (!isNew) {
            actions.push({
                label: 'Xoá', variant: 'danger', onClick: function (close) {
                    close();
                    BK.removeNote(note.id); renderTab(); BK.ui.toast('Đã xoá ghi chú', 'success');
                }
            });
        }
        actions.push({
            label: isNew ? 'Tạo ghi chú' : 'Lưu', variant: 'primary', onClick: function (close) {
                var payload = {
                    title: title.value.trim() || 'Ghi chú', body: textarea.value,
                    subject: subject.value, category: category.value.trim() || 'Chung',
                    pinned: pinned.checked, questionId: (note && note.questionId) || preset.questionId || ''
                };
                if (isNew) BK.addNote(payload);
                else BK.updateNote(note.id, payload);
                close();
                BK.ui.toast(isNew ? 'Đã tạo ghi chú' : 'Đã lưu ghi chú', 'success');
                if (hub.modal || hub.inline) renderTab();
            }
        });

        BK.ui.modal({ title: isNew ? 'Ghi chú mới' : 'Sửa ghi chú', body: body, actions: actions, wide: false });
    }

    /* ---------------------------- Đánh dấu ------------------------------ */
    function renderBookmarks(root) {
        var s = BK.store.get();
        root.appendChild(el('h3', null, 'Đánh dấu'));
        root.appendChild(el('p', 'bk-sub', 'Lưu câu hỏi, bài học, môn học và tài liệu để xem lại sau.'));

        var controls = el('div', 'bk-row');
        controls.style.marginBottom = '.7rem';
        var search = textInput(state.bookmarkQuery, 'Tìm đánh dấu…', function (v) { state.bookmarkQuery = v; renderTab(); }, 'Tìm đánh dấu');
        search.style.maxWidth = '15rem';
        controls.appendChild(search);
        var types = [{ value: '', label: 'Tất cả loại' }, { value: 'question', label: 'Câu hỏi' }, { value: 'lesson', label: 'Bài học' }, { value: 'subject', label: 'Môn học' }, { value: 'resource', label: 'Tài liệu' }];
        var sel = select(types, state.bookmarkType, function (v) { state.bookmarkType = v; renderTab(); }, 'Lọc loại đánh dấu');
        sel.style.maxWidth = '9rem';
        controls.appendChild(sel);
        controls.appendChild(btn('Thêm đánh dấu', 'bk-btn', openBookmarkEditor, 'fa-plus'));
        controls.appendChild(ghostBtn('Xuất', function () { exportData('bookmarks'); }, 'fa-download'));
        root.appendChild(controls);

        var q = norm(state.bookmarkQuery);
        var items = s.bookmarks.filter(function (b) {
            if (state.bookmarkType && b.type !== state.bookmarkType) return false;
            if (q && norm(b.title + ' ' + b.folder + ' ' + b.url + ' ' + subjectName(b.subject)).indexOf(q) < 0) return false;
            return true;
        }).sort(function (a, b) { return b.createdAt - a.createdAt; });

        if (!items.length) {
            root.appendChild(emptyState(s.bookmarks.length ? 'Không có đánh dấu khớp bộ lọc.' : 'Chưa có đánh dấu nào.', 'fa-bookmark'));
            return;
        }
        var list = el('div', 'bk-list');
        items.forEach(function (b) {
            var card = el('div', 'bk-item');
            var head = el('div', 'bk-item-head');
            var w = el('div'); w.style.minWidth = '0';
            var title = el('p', 'bk-item-title', b.title);
            w.appendChild(title);
            var meta = el('div', 'bk-item-meta');
            meta.appendChild(badge(({ question: 'Câu hỏi', lesson: 'Bài học', subject: 'Môn học', resource: 'Tài liệu' })[b.type] || 'Đánh dấu'));
            meta.appendChild(badge(subjectName(b.subject)));
            meta.appendChild(badge(b.folder));
            meta.appendChild(el('span', null, fmtDate(b.createdAt)));
            w.appendChild(meta);
            head.appendChild(w);
            card.appendChild(head);

            if (b.url) {
                var link = el('a', 'bk-small', b.url);
                link.href = b.url;
                link.style.color = 'var(--bk-primary)';
                link.style.display = 'inline-block';
                link.style.marginTop = '.35rem';
                link.style.wordBreak = 'break-all';
                card.appendChild(link);
            }
            var actions = el('div', 'bk-item-actions');
            if (b.url) actions.appendChild(ghostBtn('Mở', function () { location.href = b.url; }, 'fa-arrow-up-right-from-square'));
            actions.appendChild(ghostBtn('Sao chép liên kết', function () {
                BK.util.copy(b.url || b.title).then(function () { BK.ui.toast('Đã sao chép', 'success'); }, function () { BK.ui.toast('Không sao chép được', 'error'); });
            }, 'fa-link'));
            actions.appendChild(ghostBtn('Xoá', function () {
                BK.removeBookmark(b.id); renderTab(); BK.ui.toast('Đã xoá đánh dấu', 'success');
            }, 'fa-trash'));
            card.appendChild(actions);
            list.appendChild(card);
        });
        root.appendChild(list);
    }

    function openBookmarkEditor(preset) {
        preset = preset || {};
        var body = el('div');
        var title = textInput(preset.title || '', 'Tên hiển thị', null, 'Tên đánh dấu');
        body.appendChild(field('Tên', title));
        var type = select([
            { value: 'lesson', label: 'Bài học' }, { value: 'question', label: 'Câu hỏi' },
            { value: 'subject', label: 'Môn học' }, { value: 'resource', label: 'Tài liệu' }
        ], preset.type || 'lesson', null, 'Loại');
        var folder = textInput(preset.folder || 'Chung', 'Nhóm (ví dụ: Ôn cuối kỳ)', null, 'Nhóm');
        var row = el('div', 'bk-row');
        var f1 = field('Loại', type); f1.style.flex = '1';
        var f2 = field('Nhóm', folder); f2.style.flex = '1';
        row.appendChild(f1); row.appendChild(f2);
        body.appendChild(row);
        var url = textInput(preset.url || '', 'Liên kết (tuỳ chọn)', null, 'Liên kết');
        body.appendChild(field('Liên kết', url));

        BK.ui.modal({
            title: 'Thêm đánh dấu', body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost' },
                {
                    label: 'Lưu', variant: 'primary', onClick: function (close) {
                        var r = BK.addBookmark({
                            type: type.value, title: title.value.trim() || 'Đánh dấu',
                            folder: folder.value.trim() || 'Chung', url: url.value.trim(),
                            subject: preset.subject || BK.subjectOf()
                        });
                        close();
                        BK.ui.toast(r ? 'Đã thêm đánh dấu' : 'Đánh dấu này đã tồn tại', r ? 'success' : 'info');
                        if (hub.modal || hub.inline) renderTab();
                    }
                }
            ]
        });
    }

    /* --------------------------- Thành tích ----------------------------- */
    function profileBadgeProgress() {
        try {
            if (BK.badges && typeof BK.badges.progress === 'function') return BK.badges.progress();
        } catch (e) { }
        return [];
    }

    function profileBadgeStats() {
        var list = profileBadgeProgress();
        return {
            list: list,
            total: list.length,
            done: list.filter(function (b) { return b.unlockedAt; }).length
        };
    }

    function syncAchBadge() {
        var b = D.getElementById('bkAchCount');
        if (!b) return;
        var pb = profileBadgeStats();
        if (pb.total) {
            b.textContent = pb.done + '/' + pb.total;
            b.title = pb.done + ' trên ' + pb.total + ' huy hiệu hồ sơ đã mở';
            return;
        }
        var p = BK.achievements.progress();
        var n = p.filter(function (a) { return a.unlockedAt; }).length;
        b.textContent = n + '/' + p.length;
        b.title = n + ' trên ' + p.length + ' mốc đã đạt';
    }

    function openBadgeDetail(row) {
        if (!row || !BK.ui || !BK.ui.modal) return;
        var body = el('div');
        body.appendChild(el('p', null, row.desc));
        body.appendChild(el('p', 'bk-small bk-muted', 'Cách lấy: ' +
            (BK.badges && BK.badges.howTo ? BK.badges.howTo(row) : row.desc)));
        if (!row.adminOnly) {
            body.appendChild(el('p', 'bk-small', 'Tiến độ: ' + row.current + '/' + row.goal +
                (row.unlockedAt ? ' · đã mở khóa' : '')));
        }
        if (row.frame) body.appendChild(el('p', 'bk-small bk-muted', 'Phần thưởng: khung avatar “' + row.frame + '”.'));
        BK.ui.modal({ title: row.name, body: body, actions: [{ label: 'Đóng', variant: 'ghost', onClick: function (c) { c(); } }] });
    }

    function renderAchievements(root) {
        var list = BK.achievements.progress();
        var count = list.filter(function (a) { return a.unlockedAt; }).length;
        syncAchBadge();

        var pb = profileBadgeStats();
        root.appendChild(el('h3', null, 'Huy hiệu hồ sơ'));
        root.appendChild(el('p', 'bk-sub',
            'Danh mục hồ sơ có ' + pb.total + ' huy hiệu, bạn đã mở ' + pb.done +
            '. Huy hiệu tự động do máy chủ xác minh; huy hiệu độc quyền do Founder/Administrator trao.'));
        var pbCard = el('div', 'bk-item');
        var pbBar = el('div', 'bk-progress');
        var pbFill = el('span');
        pbFill.style.width = (pb.total ? Math.round((pb.done / pb.total) * 100) : 0) + '%';
        pbBar.appendChild(pbFill);
        pbCard.appendChild(pbBar);
        if (pb.list.length) {
            var pbGroups = {};
            pb.list.forEach(function (b) {
                var g = b.category || 'Khác';
                pbGroups[g] = pbGroups[g] || { done: 0, total: 0 };
                pbGroups[g].total++;
                if (b.unlockedAt) pbGroups[g].done++;
            });
            var pbPills = el('div', 'bk-pill-row');
            Object.keys(pbGroups).forEach(function (g) {
                pbPills.appendChild(badge(g + ' ' + pbGroups[g].done + '/' + pbGroups[g].total));
            });
            pbCard.appendChild(pbPills);
        }
        root.appendChild(pbCard);

        /* Huy hiệu gần mở + cách lấy, đồng bộ với hồ sơ và máy chủ. */
        var next = pb.list.filter(function (b) { return !b.unlockedAt && !b.adminOnly; })
            .sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); }).slice(0, 6);
        if (next.length) {
            root.appendChild(el('h3', null, 'Huy hiệu gần mở'));
            var nextList = el('div', 'bk-list');
            next.forEach(function (row) {
                var item = el('button', 'bk-item bk-item-button');
                item.type = 'button';
                item.setAttribute('aria-label', row.name + ' — xem cách lấy');
                var head = el('div', 'bk-item-head');
                head.appendChild(el('span', 'bk-item-title', row.name));
                head.appendChild(badge(row.current + '/' + row.goal));
                item.appendChild(head);
                var bar = el('div', 'bk-progress');
                var fill = el('span');
                fill.style.width = Math.max(0, Math.min(100, row.pct || 0)) + '%';
                bar.appendChild(fill);
                item.appendChild(bar);
                item.appendChild(el('div', 'bk-item-meta', row.desc));
                item.addEventListener('click', function () { openBadgeDetail(row); });
                nextList.appendChild(item);
            });
            root.appendChild(nextList);
        }

        root.appendChild(el('h3', null, 'Mốc học tập'));
        root.appendChild(el('p', 'bk-sub', 'Mỗi mốc gắn với một việc bạn tự làm: mở bài, luyện câu hỏi, ghi chú, ôn tập, dùng Studio, nghe nhạc. Không có chuỗi ngày, không điểm danh, không áp lực thời gian.'));

        var progress = el('div', 'bk-item');
        progress.appendChild(el('p', 'bk-item-title', count + '/' + list.length + ' mốc đã đạt'));
        var bar = el('div', 'bk-progress');
        bar.style.marginTop = '.45rem';
        var fill = el('span');
        fill.style.width = (list.length ? Math.round((count / list.length) * 100) : 0) + '%';
        bar.appendChild(fill);
        progress.appendChild(bar);

        var groups = BK.achievements.groups || [];
        var groupBar = el('div', 'bk-pill-row');
        groupBar.style.marginTop = '.5rem';
        groups.forEach(function (g) {
            var items = list.filter(function (a) { return a.group === g; });
            var n = items.filter(function (a) { return a.unlockedAt; }).length;
            groupBar.appendChild(badge(g + ' ' + n + '/' + items.length));
        });
        progress.appendChild(groupBar);
        root.appendChild(progress);

        /* Bộ lọc + tìm kiếm */
        var toolbar = el('div', 'bk-ach-toolbar');
        [['all', 'Tất cả'], ['done', 'Đã đạt'], ['todo', 'Chưa đạt']].forEach(function (f) {
            var chip = el('button', 'bk-chip' + (state.achFilter === f[0] ? ' on' : ''), f[1]);
            chip.type = 'button';
            chip.setAttribute('aria-pressed', state.achFilter === f[0] ? 'true' : 'false');
            chip.addEventListener('click', function () { state.achFilter = f[0]; renderTab(); });
            toolbar.appendChild(chip);
        });
        var q = el('input', 'bk-input bk-ach-search');
        q.type = 'search';
        q.placeholder = 'Tìm thành tích…';
        q.value = state.achQuery;
        q.setAttribute('aria-label', 'Tìm thành tích');
        q.addEventListener('input', BK.util.debounce(function () { state.achQuery = q.value; renderTab(); }, 150));
        toolbar.appendChild(q);
        root.appendChild(toolbar);

        var nq = BK.util.norm(state.achQuery);
        var visible = list.filter(function (a) {
            if (state.achFilter === 'done' && !a.unlockedAt) return false;
            if (state.achFilter === 'todo' && a.unlockedAt) return false;
            if (!nq) return true;
            return BK.util.norm(a.name + ' ' + a.desc + ' ' + a.group).indexOf(nq) >= 0;
        });

        if (!visible.length) {
            root.appendChild(emptyState(nq ? 'Không có mốc nào khớp “' + state.achQuery + '”.' : 'Chưa có mốc nào ở mục này.', 'fa-medal'));
            return;
        }

        groups.concat(['Khác']).forEach(function (g) {
            var items = visible.filter(function (a) { return g === 'Khác' ? groups.indexOf(a.group) < 0 : a.group === g; });
            if (!items.length) return;
            var done = items.filter(function (a) { return a.unlockedAt; }).length;
            var head = el('h4', 'bk-ach-group', g + ' · ' + done + '/' + items.length);
            root.appendChild(head);
            var grid = el('div', 'bk-ach-grid');
            grid.style.margin = '.4rem 0 .8rem';
            items.forEach(function (a) {
                var on = !!a.unlockedAt;
                var tile = el('div', 'bk-ach' + (on ? ' on' : ''));
                tile.setAttribute('title', a.desc);
                var ico = el('div', 'bk-ach-ico');
                ico.innerHTML = '<i class="fa-solid ' + a.icon + '"></i>';
                tile.appendChild(ico);
                var w = el('div', 'bk-ach-body');
                w.appendChild(el('b', null, a.name));
                w.appendChild(el('span', null, a.desc));
                if (on) {
                    w.appendChild(el('span', 'bk-ach-meta', 'Đạt ' + fmtDate(a.unlockedAt)));
                } else if (a.goal > 1) {
                    var mini = el('div', 'bk-progress bk-ach-bar');
                    var mfill = el('span');
                    mfill.style.width = a.pct + '%';
                    mini.appendChild(mfill);
                    w.appendChild(mini);
                    w.appendChild(el('span', 'bk-ach-meta', a.current + '/' + a.goal));
                }
                tile.appendChild(w);
                grid.appendChild(tile);
            });
            root.appendChild(grid);
        });
    }

    /* --------------------------- Cài đặt -------------------------------- */
    function renderSettings(root) {
        var s = BK.store.get();
        root.appendChild(el('h3', null, 'Cài đặt học tập'));
        root.appendChild(el('p', 'bk-sub', 'Mọi dữ liệu được lưu cục bộ trên thiết bị này. Bạn có thể xuất để sao lưu bất cứ lúc nào.'));

        var card = el('div', 'bk-item');
        card.appendChild(el('h4', null, 'Hiển thị'));
        card.appendChild(settingRow('Chế độ tập trung', 'Ẩn bớt điều hướng và hiệu ứng để đọc dễ hơn. Nhấn Esc để thoát.', switchControl(!!s.prefs.focus, function (v) { setPref({ focus: v }); renderTab(); })));
        card.appendChild(settingRow('Hiệu ứng nền nhẹ', 'Chỉ áp dụng khi bật chế độ tập trung.', switchControl(!!s.prefs.ambient, function (v) { setPref({ ambient: v }); renderTab(); })));
        var size = el('input');
        size.type = 'range'; size.min = '85'; size.max = '160'; size.step = '5'; size.value = String(s.prefs.fontSize);
        size.setAttribute('aria-label', 'Cỡ chữ khi tập trung');
        var sizeVal = el('span', 'bk-small bk-muted', s.prefs.fontSize + '%');
        size.addEventListener('input', BK.util.debounce(function () {
            sizeVal.textContent = size.value + '%';
            setPref({ fontSize: Number(size.value) });
        }, 120));
        var sizeWrap = el('span', 'bk-row');
        sizeWrap.appendChild(size); sizeWrap.appendChild(sizeVal);
        card.appendChild(settingRow('Cỡ chữ khi tập trung', 'Điều chỉnh riêng cho chế độ đọc.', sizeWrap));
        root.appendChild(card);

        /* Spaced repetition */
        var spaced = el('div', 'bk-item');
        spaced.style.marginTop = '.6rem';
        spaced.appendChild(el('h4', null, 'Nhịp ôn tập'));
        spaced.appendChild(el('p', 'bk-small bk-muted', 'Khoảng cách ôn (ngày) theo kết quả ôn. Đây là cấu hình tuỳ chọn, không bắt buộc.'));
        var grid = el('div', 'bk-cards');
        [['again', 'Chưa nhớ'], ['hard', 'Khó'], ['good', 'Nhớ tốt'], ['easy', 'Dễ'], ['max', 'Tối đa']].forEach(function (pair) {
            var input = el('input', 'bk-input');
            input.type = 'number'; input.min = '1'; input.max = '365'; input.value = String(s.prefs.spaced[pair[0]]);
            input.setAttribute('aria-label', pair[1]);
            input.addEventListener('change', function () {
                var v = BK.util.clamp(input.value, 1, 365);
                input.value = String(v);
                BK.store.update(function (st) { st.prefs.spaced[pair[0]] = v; return st.prefs.spaced; });
                BK.ui.toast('Đã lưu nhịp ôn tập', 'success');
            });
            var cell = el('div', 'bk-card');
            cell.appendChild(el('div', 'bk-card-k', pair[1]));
            cell.appendChild(input);
            grid.appendChild(cell);
        });
        spaced.appendChild(grid);
        root.appendChild(spaced);

        /* AI */
        var ai = el('div', 'bk-item');
        ai.style.marginTop = '.6rem';
        ai.appendChild(el('h4', null, 'AI hỗ trợ (tuỳ chọn)'));
        var aiStatus = BK.ai.status();
        ai.appendChild(el('p', 'bk-small muted', aiStatus.ok ? 'Đã cấu hình endpoint. AI chỉ tạo nội dung tham khảo, luôn được gắn nhãn và không bao giờ thay thế nội dung gốc.' : 'Chưa cấu hình. AI chỉ hoạt động khi bạn cung cấp một endpoint proxy an toàn — không đặt API key trong trình duyệt.'));
        var ep = textInput(s.prefs.ai.endpoint, 'https://your-proxy.example/api/ai', null, 'Endpoint AI');
        var model = textInput(s.prefs.ai.model, 'Tên model (tuỳ chọn)', null, 'Model AI');
        var aiRow = el('div', 'bk-row');
        var f1 = field('Endpoint proxy', ep); f1.style.flex = '1';
        var f2 = field('Model', model); f2.style.flex = '1';
        aiRow.appendChild(f1); aiRow.appendChild(f2);
        ai.appendChild(aiRow);
        var aiActions = el('div', 'bk-row');
        aiActions.appendChild(ghostBtn('Lưu cấu hình AI', function () {
            BK.ai.configure({ endpoint: ep.value.trim(), model: model.value.trim() });
            BK.ui.toast('Đã lưu cấu hình AI', 'success');
        }, 'fa-floppy-disk'));
        aiActions.appendChild(ghostBtn('Kiểm tra kết nối', function () {
            if (!BK.ai.configured()) return BK.ui.toast('Chưa cấu hình endpoint AI', 'error');
            BK.ai.ask('Trả lời ngắn: 1+1 bằng mấy?').then(function (r) {
                BK.ui.modal({
                    title: 'Kiểm tra AI',
                    body: BK.ui.el('div', 'bk-md').appendChild(BK.ui.el('p', null, r.ok ? r.text : r.error))
                });
            });
        }, 'fa-plug'));
        ai.appendChild(aiActions);
        ai.appendChild(el('p', 'bk-small bk-muted', 'Xem docs/SUPABASE_SETUP.md và docs/FEATURES.md để biết mẫu proxy & bảng dữ liệu.'));
        root.appendChild(ai);

        /* Supabase */
        var cloud = el('div', 'bk-item');
        cloud.style.marginTop = '.6rem';
        cloud.appendChild(el('h4', null, 'Đồng bộ Supabase (tuỳ chọn)'));
        var cStatus = BK.cloud.status();
        cloud.appendChild(el('p', 'bk-small muted', 'Local-first: mọi tính năng hoạt động không cần Supabase. Khi cấu hình, chỉ dùng anon key + Row Level Security; không bao giờ dùng service-role key trong trình duyệt.'));
        if (typeof global.supabase === 'undefined') {
            cloud.appendChild(el('p', 'bk-small', cStatus.ok ? 'Đã lưu cấu hình nhưng chưa nạp thư viện @supabase/supabase-js trên trang.' : 'Chưa nạp @supabase/supabase-js. Xem docs/SUPABASE_SETUP.md.'));
        }
        var url = textInput(s.prefs.cloud.url, 'https://xxxx.supabase.co', null, 'Supabase URL');
        var anon = textInput(s.prefs.cloud.anonKey, 'anon public key', null, 'Supabase anon key');
        cloud.appendChild(field('Supabase URL', url));
        cloud.appendChild(field('Anon key', anon));
        var cActions = el('div', 'bk-row');
        cActions.appendChild(ghostBtn('Lưu cấu hình', function () {
            BK.cloud.configure({ url: url.value.trim(), anonKey: anon.value.trim() });
            BK.ui.toast('Đã lưu cấu hình Supabase', 'success');
            renderTab();
        }, 'fa-floppy-disk'));
        cActions.appendChild(ghostBtn('Gửi dữ liệu', function () {
            BK.cloud.push().then(function () { BK.ui.toast('Đã gửi dữ liệu lên Supabase', 'success'); },
                function (e) { BK.ui.toast('Không gửi được: ' + e.message, 'error'); });
        }, 'fa-cloud-arrow-up'));
        cActions.appendChild(ghostBtn('Hợp nhất dữ liệu', function () {
            BK.cloud.pull().then(function (remote) {
                if (!remote) return BK.ui.toast('Chưa có dữ liệu từ xa', 'info');
                BK.cloud.merge(remote);
                BK.ui.toast('Đã hợp nhất dữ liệu từ xa', 'success');
                renderTab();
            }).catch(function (e) { BK.ui.toast('Không tải được: ' + e.message, 'error'); });
        }, 'fa-cloud-arrow-down'));
        cloud.appendChild(cActions);
        root.appendChild(cloud);

        /* Dữ liệu */
        var data = el('div', 'bk-item');
        data.style.marginTop = '.6rem';
        data.appendChild(el('h4', null, 'Dữ liệu'));
        var dActions = el('div', 'bk-row');
        dActions.appendChild(ghostBtn('Xuất tất cả', function () { exportData('all'); }, 'fa-download'));
        dActions.appendChild(ghostBtn('Xuất ghi chú', function () { exportData('notes'); }, 'fa-file-lines'));
        dActions.appendChild(ghostBtn('Xuất đánh dấu', function () { exportData('bookmarks'); }, 'fa-bookmark'));
        dActions.appendChild(ghostBtn('Xuất thống kê', function () { exportData('stats'); }, 'fa-chart-simple'));
        dActions.appendChild(ghostBtn('Nhập JSON', function () { importData(); }, 'fa-upload'));
        data.appendChild(dActions);
        var danger = el('div', 'bk-row');
        danger.style.marginTop = '.5rem';
        danger.appendChild(ghostBtn('Xoá toàn bộ dữ liệu học tập', function () {
            BK.ui.confirm({
                title: 'Xoá dữ liệu học tập',
                message: 'Xoá toàn bộ tiến độ, ghi chú, đánh dấu, lịch sử và thành tích trên thiết bị này? Hãy xuất sao lưu trước nếu cần.',
                ok: 'Xoá tất cả', danger: true
            }).then(function (ok) {
                if (!ok) return;
                BK.store.reset();
                renderTab();
                BK.ui.toast('Đã xoá dữ liệu học tập', 'success');
            });
        }, 'fa-trash'));
        data.appendChild(danger);
        root.appendChild(data);

        var shortcuts = el('div', 'bk-item');
        shortcuts.style.marginTop = '.6rem';
        shortcuts.appendChild(el('h4', null, 'Phím tắt'));
        [['Ctrl/⌘ + K', 'Mở command palette'], ['/', 'Tìm kiếm toàn cục'], ['Esc', 'Đóng hộp thoại / thoát chế độ tập trung'], ['← →', 'Chuyển câu trong Ôn tập'], ['A B C D', 'Chọn đáp án khi ôn tập'], ['Ctrl/⌘ + Shift + G', 'Mở Developer Playground (nếu đã xác thực)']]
            .forEach(function (p) {
                var row = el('div', 'bk-setting-row');
                row.appendChild(el('span', null, p[1]));
                row.appendChild(el('kbd', 'bk-mono bk-small', p[0]));
                shortcuts.appendChild(row);
            });
        root.appendChild(shortcuts);
    }

    function settingRow(label, hint, control) {
        var row = el('div', 'bk-setting-row');
        var w = el('div');
        w.appendChild(el('span', null, label));
        if (hint) w.appendChild(el('div', 'bk-small bk-muted', hint));
        row.appendChild(w);
        var c = el('div', 'bk-controls');
        c.appendChild(control);
        row.appendChild(c);
        return row;
    }
    function switchControl(checked, onChange) {
        var label = el('label', 'bk-switch');
        var input = el('input');
        input.type = 'checkbox'; input.checked = !!checked;
        input.addEventListener('change', function () { onChange(input.checked); });
        label.appendChild(input);
        label.appendChild(el('span'));
        return label;
    }

    /* ------------------------- Xuất / nhập dữ liệu ---------------------- */
    function exportData(scope) {
        var file = scope === 'notes' ? '-notes' : scope === 'bookmarks' ? '-bookmarks' : scope === 'stats' ? '-stats' : '';
        var name = 'bakhi-learning' + file + '-' + BK.util.dayKey() + '.json';
        var ok = BK.util.download(name, JSON.stringify(BK.io.exportPayload(scope), null, 2));
        BK.ui.toast(ok ? 'Đã xuất ' + name : 'Không xuất được tệp', ok ? 'success' : 'error');
        if (ok) {
            BK.signals.bump('backup.exports');
            BK.achievements.check();
            if (hub.modal || hub.inline) renderTab();
        }
    }

    function importData() {
        var input = el('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.style.display = 'none';
        D.body.appendChild(input);
        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            input.remove();
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) return BK.ui.toast('Tệp quá lớn (giới hạn 8MB)', 'error');
            var reader = new FileReader();
            reader.onload = function () {
                var raw = null;
                try { raw = JSON.parse(String(reader.result)); }
                catch (e) { return BK.ui.toast('Tệp không phải JSON hợp lệ', 'error'); }
                var report = BK.io.validateImport(raw);
                var body = el('div');
                if (!report.ok) {
                    var warn = el('div', 'bk-item');
                    warn.style.borderColor = 'var(--bk-danger)';
                    warn.appendChild(el('b', null, 'Cảnh báo dữ liệu:'));
                    var ul = el('ul');
                    ul.style.paddingLeft = '1.1rem';
                    ul.style.listStyle = 'disc';
                    report.issues.forEach(function (i) { ul.appendChild(el('li', 'bk-small', i)); });
                    warn.appendChild(ul);
                    body.appendChild(warn);
                }
                var counts = report.counts || {};
                var list = el('div', 'bk-item');
                list.appendChild(el('p', 'bk-item-title', 'Nội dung sẽ được hợp nhất (không ghi đè dữ liệu hiện có):'));
                [['practice', 'Lượt luyện tập'], ['review', 'Câu cần ôn'], ['notes', 'Ghi chú'], ['bookmarks', 'Đánh dấu'], ['history', 'Lịch sử']].forEach(function (p) {
                    var row = el('div', 'bk-setting-row');
                    row.appendChild(el('span', null, p[1]));
                    row.appendChild(el('span', 'bk-badge', String(counts[p[0]] || 0)));
                    list.appendChild(row);
                });
                body.appendChild(list);
                body.appendChild(el('p', 'bk-small bk-muted', 'Không có nội dung giáo dục gốc nào bị thay đổi bởi thao tác nhập dữ liệu.'));

                BK.ui.modal({
                    title: 'Xem trước dữ liệu nhập', body: body,
                    actions: [
                        { label: 'Huỷ', variant: 'ghost' },
                        {
                            label: 'Nhập dữ liệu', variant: 'primary', onClick: function (close) {
                                var res = BK.io.importPayload(raw, { force: !report.ok });
                                close();
                                if (!res.ok) return BK.ui.toast(res.error || 'Nhập thất bại', 'error');
                                BK.ui.toast('Đã nhập dữ liệu học tập', 'success');
                                if (hub.modal || hub.inline) renderTab();
                            }
                        }
                    ]
                });
            };
            reader.onerror = function () { BK.ui.toast('Không đọc được tệp', 'error'); };
            reader.readAsText(file);
        });
        input.click();
    }

    /* =====================================================================
       Tìm kiếm & Command Palette
       ================================================================== */
    var overlay = null;

    function achLabel() {
        try {
            var pb = profileBadgeStats();
            if (pb.total) return 'Huy hiệu hồ sơ (' + pb.done + '/' + pb.total + ')';
            var p = BK.achievements.progress();
            var n = p.filter(function (a) { return a.unlockedAt; }).length;
            return 'Mốc học tập (' + n + '/' + p.length + ')';
        } catch (e) { return 'Thành tích'; }
    }

    function commands() {
        var cmds = [
            { label: 'Trung tâm học tập — Tổng quan', icon: 'fa-gauge-high', run: function () { openHub('overview'); } },
            { label: 'Sổ tay câu sai', icon: 'fa-book-skull', run: function () { openHub('mistakes'); } },
            { label: 'Ôn tập hôm nay', icon: 'fa-rotate', run: function () { openHub('revision'); } },
            { label: 'Phân tích học tập', icon: 'fa-chart-line', run: function () { openHub('analytics'); } },
            { label: 'Kế hoạch học tập', icon: 'fa-calendar-days', run: function () { openHub('planner'); } },
            { label: 'Mục tiêu học tập', icon: 'fa-bullseye', run: function () { openHub('goals'); } },
            { label: 'Môn học của tôi', icon: 'fa-layer-group', run: function () { openHub('subjects'); } },
            { label: 'Ghi chú cá nhân', icon: 'fa-pen-nib', run: function () { openHub('notes'); } },
            { label: 'Đánh dấu', icon: 'fa-bookmark', run: function () { openHub('bookmarks'); } },
            { label: achLabel(), icon: 'fa-medal', run: function () { openHub('achievements'); } },
            { label: 'Cài đặt học tập & dữ liệu', icon: 'fa-gear', run: function () { openHub('settings'); } },
            { label: 'Tìm kiếm toàn cục', icon: 'fa-magnifying-glass', run: function () { openSearch(); } },
            { label: 'Bật/tắt chế độ tập trung', icon: 'fa-moon', run: function () { toggleFocus(); } },
            { label: 'Đổi giao diện sáng/tối', icon: 'fa-circle-half-stroke', run: toggleTheme },
            { label: 'Tạo ghi chú mới', icon: 'fa-plus', run: function () { openNoteEditor(null); } },
            { label: 'Xuất toàn bộ dữ liệu học tập', icon: 'fa-download', run: function () { exportData('all'); } },
            { label: 'Nhập dữ liệu từ tệp JSON', icon: 'fa-upload', run: importData },
            { label: 'Mở rộng tất cả thư mục', icon: 'fa-folder-open', run: function () { if (typeof global.expandAll === 'function') global.expandAll(true); } },
            { label: 'Thu gọn tất cả thư mục', icon: 'fa-folder', run: function () { if (typeof global.expandAll === 'function') global.expandAll(false); } }
        ];
        if (typeof global.openDevPanel === 'function') {
            cmds.push({ label: 'Bảng điều khiển Developer (cũ)', icon: 'fa-terminal', run: function () { global.openDevPanel(); } });
        }
        if (global.BKDev && typeof global.BKDev.open === 'function') {
            cmds.push({ label: 'Developer Playground (2.0)', icon: 'fa-screwdriver-wrench', run: function () { global.BKDev.open(); } });
        }
        cmds.push({
            label: 'Mở Bá Khí Studio (Word & Paint)',
            icon: 'fa-pen-ruler',
            run: function () {
                var base = (BK && BK.util && BK.util.basePath) ? BK.util.basePath() : '';
                global.open(base + 'studio/word-paint.html', '_blank', 'noopener');
            }
        });
        if (typeof global.palette === 'function') {
            cmds.push({ label: 'Command palette (Developer cũ)', icon: 'fa-terminal', run: function () { global.palette(); } });
        }
        return cmds;
    }

    function toggleTheme() {
        if (typeof global.toggleDarkMode === 'function') {
            try { global.toggleDarkMode(); return; } catch (e) { /* dùng fallback */ }
        }
        var root = D.documentElement;
        var dark = !root.classList.contains('dark');
        root.classList.toggle('dark', dark);
        try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) { /* bỏ qua */ }
    }

    function ensureOverlay() {
        if (overlay) return overlay;
        var wrap = el('div', 'bk-search-overlay');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Tìm kiếm và lệnh');
        var panel = el('div', 'bk-search');
        var head = el('div', 'bk-search-head');
        head.innerHTML = '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>';
        var input = el('input', 'bk-search-input');
        input.type = 'text';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        input.setAttribute('aria-label', 'Tìm kiếm nội dung hoặc gõ lệnh');
        head.appendChild(input);
        head.appendChild(el('span', 'bk-search-kbd', 'Esc'));
        panel.appendChild(head);

        var filters = el('div', 'bk-search-filters');
        panel.appendChild(filters);

        var results = el('div', 'bk-search-results');
        results.id = 'bkSearchResults';
        results.setAttribute('role', 'listbox');
        panel.appendChild(results);

        var hint = el('div', 'bk-search-kbd-hint');
        hint.innerHTML = '<span>↑ ↓ di chuyển</span><span>Enter chọn</span><span>Esc đóng</span>';
        panel.appendChild(hint);

        wrap.appendChild(panel);
        D.body.appendChild(wrap);

        overlay = { wrap: wrap, panel: panel, input: input, filters: filters, results: results, items: [], index: 0, mode: 'palette', category: '' };

        input.addEventListener('input', onOverlayInput);
        input.addEventListener('keydown', onOverlayKey);
        wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) closeOverlay(); });

        return overlay;
    }

    var CATEGORIES = ['', 'Bài học', 'Câu hỏi đã luyện', 'Cần ôn lại', 'Ghi chú', 'Đánh dấu', 'Lệnh'];

    function openSearch(initial) {
        var o = ensureOverlay();
        o.mode = 'search';
        o.category = '';
        o.input.value = initial || '';
        o.input.placeholder = 'Tìm bài học, câu hỏi đã luyện, ghi chú, đánh dấu…';
        renderOverlay();
        setTimeout(function () { o.input.focus(); }, 20);
    }

    function openPalette(initial) {
        try {
            BK.signals.bump('ui.palette');
            BK.achievements.check();
        } catch (e) { /* không chặn bảng lệnh nếu tín hiệu lỗi */ }
        var o = ensureOverlay();
        o.mode = 'palette';
        o.category = '';
        o.input.value = initial || '';
        o.input.placeholder = 'Gõ lệnh hoặc tìm kiếm nội dung…';
        renderOverlay();
        setTimeout(function () { o.input.focus(); }, 20);
    }

    function closeOverlay() {
        if (!overlay) return;
        overlay.wrap.remove();
        overlay = null;
    }

    function onOverlayInput() {
        if (!overlay) return;
        renderOverlay();
    }

    function onOverlayKey(e) {
        if (!overlay) return;
        if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveIndex(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveIndex(-1); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            var active = overlay.items[overlay.index];
            if (active && active.run) runOverlay(active);
        }
        if (e.key === 'Tab') BK.ui.trapFocus(e, overlay.panel);
    }

    function moveIndex(delta) {
        if (!overlay || !overlay.items.length) return;
        overlay.index = (overlay.index + delta + overlay.items.length) % overlay.items.length;
        paintActive();
    }

    function paintActive() {
        if (!overlay) return;
        var nodes = overlay.results.querySelectorAll('.bk-result');
        Array.prototype.forEach.call(nodes, function (n, i) { n.classList.toggle('on', i === overlay.index); });
        var cur = nodes[overlay.index];
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    }

    function runOverlay(item) {
        closeOverlay();
        setTimeout(function () { try { item.run(); } catch (e) { BK.ui.toast('Không thực hiện được lệnh', 'error'); console.warn(e); } }, 30);
    }

    function renderOverlay() {
        if (!overlay) return;
        var q = overlay.input.value.trim();
        /* Tìm kiếm còn lại của website là bảng lệnh/tìm kiếm này — đếm một lần
           mỗi phiên để thành tích "Tầm Bảo Nhất Niệm" vẫn đạt được. */
        if (q.length > 1 && !overlay.counted) {
            overlay.counted = true;
            if (global.BK && BK.badges && BK.badges.bumpCounter) {
                try { BK.badges.bumpCounter('search.used'); } catch (e) { }
            }
        }
        overlay.index = 0;
        overlay.items = [];
        overlay.results.innerHTML = '';

        if (overlay.mode === 'palette' && !q) {
            appendGroup('Lệnh', commands().map(function (c) {
                return { title: c.label, icon: c.icon, sub: 'Lệnh', run: c.run };
            }));
            var recent = BK.store.get().history.slice().reverse().filter(function (h) { return h.kind === 'lesson'; }).slice(0, 5);
            if (recent.length) {
                appendGroup('Bài học gần đây', recent.map(function (h) {
                    return {
                        title: h.title, icon: 'fa-book-open', sub: subjectName(h.subject),
                        run: function () { if (h.url) location.href = h.url; }
                    };
                }));
            }
            paintActive();
            return;
        }

        if (!q && overlay.mode === 'search') {
            overlay.filters.innerHTML = '<span class="bk-small bk-muted">Gợi ý: tên môn, chủ đề, từ khoá trong câu hỏi, ghi chú…</span>';
            appendGroup('Gần đây', BK.store.get().history.slice().reverse().slice(0, 6).map(function (h) {
                return { title: h.title, icon: 'fa-clock-rotate-left', sub: fmtTime(h.ts), run: function () { if (h.url) location.href = h.url; } };
            }));
            if (!overlay.items.length) overlay.results.appendChild(emptyState('Bắt đầu gõ để tìm kiếm.', 'fa-magnifying-glass'));
            paintActive();
            return;
        }

        var found = BK.search.all(q);
        var flat = found.flat || [];
        var cats = Object.keys(found.groups || {});

        overlay.filters.innerHTML = '';
        if (overlay.mode === 'search' && cats.length) {
            ['Tất cả'].concat(cats).forEach(function (c) {
                var real = c === 'Tất cả' ? '' : c;
                var chip = el('button', 'bk-chip' + (overlay.category === real ? ' on' : ''), c);
                chip.type = 'button';
                chip.addEventListener('click', function () { overlay.category = real; renderOverlay(); });
                overlay.filters.appendChild(chip);
            });
        } else {
            overlay.filters.innerHTML = '<span class="bk-small bk-muted">' + (found.total ? found.total + ' kết quả' : 'Không có kết quả') + '</span>';
        }

        var cmds = [];
        if (overlay.mode === 'palette') {
            var nq = norm(q);
            cmds = commands().filter(function (c) { return norm(c.label).indexOf(nq) >= 0; });
            if (cmds.length) {
                appendGroup('Lệnh', cmds.slice(0, 6).map(function (c) {
                    return { title: c.label, icon: c.icon, sub: 'Lệnh', run: c.run };
                }));
            }
        }

        cats.forEach(function (cat) {
            if (overlay.category && cat !== overlay.category) return;
            var group = (found.groups[cat] || []).slice(0, 8);
            appendGroup(cat, group.map(function (r) {
                return {
                    title: r.title, icon: resultIcon(r.type), sub: r.snippet || r.meta || '',
                    html: BK.search.highlight(truncate(r.title, 120), q),
                    run: function () { openResult(r); }
                };
            }));
        });

        if (!overlay.items.length) {
            overlay.results.appendChild(emptyState('Không tìm thấy kết quả cho "' + q + '".', 'fa-magnifying-glass'));
        }
        paintActive();
    }

    function appendGroup(name, items) {
        if (!items.length) return;
        overlay.results.appendChild(el('div', 'bk-search-group', name));
        items.forEach(function (item) {
            var b = el('button', 'bk-result');
            b.type = 'button';
            b.setAttribute('role', 'option');
            var ic = el('i', 'fa-solid ' + (item.icon || 'fa-file-lines'));
            b.appendChild(ic);
            var main = el('span', 'bk-result-main');
            var title = el('span', 'bk-result-title');
            if (item.html) title.innerHTML = item.html;
            else title.textContent = item.title;
            main.appendChild(title);
            if (item.sub) main.appendChild(el('span', 'bk-result-sub', item.sub));
            b.appendChild(main);
            b.addEventListener('click', function () { runOverlay(item); });
            b.addEventListener('mouseenter', function () {
                overlay.index = overlay.items.indexOf(item);
                paintActive();
            });
            overlay.results.appendChild(b);
            overlay.items.push(item);
        });
    }

    function resultIcon(type) {
        return ({
            lesson: 'fa-book-open', question: 'fa-circle-question', review: 'fa-rotate',
            note: 'fa-pen-nib', bookmark: 'fa-bookmark', subject: 'fa-layer-group'
        })[type] || 'fa-file-lines';
    }
    function truncate(s, n) {
        s = String(s || '');
        return s.length > n ? s.slice(0, n) + '…' : s;
    }
    function openResult(r) {
        if (r.type === 'note' && r.id) {
            var note = BK.store.get().notes.filter(function (n) { return n.id === r.id; })[0];
            if (note) return openNoteEditor(note);
        }
        if (r.type === 'review') return openHub('mistakes');
        if (r.type === 'bookmark' || r.type === 'lesson') {
            if (r.url) { location.href = r.url; return; }
        }
        if (r.url) { location.href = r.url; return; }
        BK.ui.toast('Không có liên kết cho mục này', 'info');
    }

    /* =====================================================================
       Dock
       ================================================================== */
    function buildDock() {
        if (D.getElementById('bkDock')) return;
        var dock = el('div', 'bk-dock');
        dock.id = 'bkDock';
        var actions = el('div', 'bk-dock-actions');
        actions.setAttribute('role', 'toolbar');
        actions.setAttribute('aria-label', 'Công cụ học tập');
        [
            { icon: 'fa-gauge-high', label: 'Trung tâm học tập (Ctrl+K)', run: function () { openHub('overview'); } },
            { icon: 'fa-book-skull', label: 'Sổ tay câu sai', run: function () { openHub('mistakes'); } },
            { icon: 'fa-rotate', label: 'Ôn tập hôm nay', run: function () { openHub('revision'); } },
            { icon: 'fa-calendar-days', label: 'Kế hoạch học tập', run: function () { openHub('planner'); } },
            { icon: 'fa-chart-line', label: 'Phân tích học tập', run: function () { openHub('analytics'); } },
            { icon: 'fa-pen-nib', label: 'Ghi chú', run: function () { openHub('notes'); } },
            { icon: 'fa-magnifying-glass', label: 'Tìm kiếm (/)', run: function () { openSearch(); } },
            { icon: 'fa-moon', label: 'Chế độ tập trung', run: function () { toggleFocus(); } }
        ].forEach(function (a) {
            var b = el('button', 'bk-dock-btn');
            b.type = 'button';
            b.setAttribute('aria-label', a.label);
            b.title = a.label;
            b.innerHTML = '<i class="fa-solid ' + a.icon + '" aria-hidden="true"></i>';
            b.appendChild(el('span', 'bk-dock-label', a.label));
            b.addEventListener('click', a.run);
            actions.appendChild(b);
        });
        var toggle = el('button', 'bk-dock-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Mở công cụ học tập');
        toggle.innerHTML = '<i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>';
        toggle.addEventListener('click', function () {
            var collapsed = dock.classList.toggle('collapsed');
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });
        dock.appendChild(actions);
        dock.appendChild(toggle);
        D.body.appendChild(dock);
    }

    /* =====================================================================
       Phím tắt & khởi tạo
       ================================================================== */
    function isTyping(target) {
        if (!target) return false;
        var tag = (target.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    }

    D.addEventListener('keydown', function (e) {
        // Command palette: luôn do lớp học tập xử lý (kể cả khi Developer Panel mở).
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            e.stopPropagation();
            if (overlay) closeOverlay();
            openPalette();
            return;
        }
        if (e.key === 'Escape') {
            if (overlay) { e.preventDefault(); closeOverlay(); return; }
            if (D.documentElement.classList.contains('bk-focus') && !D.querySelector('.bk-overlay')) {
                e.preventDefault(); toggleFocus(false);
            }
            return;
        }
        if (e.key === '/' && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            var anyModal = D.querySelector('.bk-overlay');
            if (anyModal) return;
            e.preventDefault();
            openSearch();
            return;
        }
        // Developer Playground (chỉ khi đã xác thực — kiểm tra bên trong BKDev).
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
            if (global.BKDev && typeof global.BKDev.open === 'function') {
                e.preventDefault();
                global.BKDev.open();
            }
        }
    }, true);

    function handleUrlParams() {
        try {
            var p = new URLSearchParams(location.search);
            var bk = p.get('bk');
            if (!bk) return;
            if (bk === 'search') openSearch(p.get('q') || '');
            else if (TABS.some(function (t) { return t.id === bk; }) || TAB_ALIASES[bk]) openHub(bk);
        } catch (e) { /* bỏ qua */ }
    }

    function init() {
        applyPreferences();
        buildDock();
        BK.achievements.check();
        handleUrlParams();
        /* bk-learning.js vẽ 6 tab Learning Intelligence trong cùng khung này. */
        if (global.BKLearning && global.BKLearning.setHooks) {
            global.BKLearning.setHooks({
                rerender: function () { if (hub.modal || hub.inline) renderTab(); },
                openTab: function (id) {
                    if (hub.modal || hub.inline) setTab(id);
                    else openHub(id);
                }
            });
        }
        BK.store.on('practice', function () {
            var live = ['overview', 'mistakes', 'analytics', 'revision', 'planner', 'subjects', 'goals'];
            if ((hub.modal || hub.inline) && live.indexOf(hub.tab) >= 0) renderTab();
        });
        /* Đổi học sinh: làm mới thành tích/tiến độ đang mở, không cần F5. */
        global.addEventListener('bkbadges', function () {
            try { syncAchBadge(); } catch (e) { }
        });
        global.addEventListener('bk:identity', function () {
            try {
                if (hub.modal || hub.inline) renderTab();
                BK.achievements.check();
            } catch (e) { }
        });
        global.addEventListener('bkprofile', function () {
            try {
                if ((hub.modal || hub.inline) && hub.tab === 'achievements') renderTab();
            } catch (e) { }
        });
    }

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();

    global.BKLearn = {
        openHub: openHub, openSearch: openSearch, openPalette: openPalette,
        mountHub: mountHub,
        openNote: openNoteEditor, openBookmark: openBookmarkEditor,
        toggleFocus: toggleFocus, exportData: exportData, importData: importData,
        applyPreferences: applyPreferences, renderTab: renderTab
    };
})(typeof window !== 'undefined' ? window : this);
