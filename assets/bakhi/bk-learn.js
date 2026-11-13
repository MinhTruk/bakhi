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
    var hub = { modal: null, tab: 'overview', root: null, navItems: {} };
    var state = {
        reviewQuery: '', reviewSubject: '', reviewShowMastered: false, reviewActive: 0,
        noteQuery: '', noteCategory: '', historyQuery: '', historyKind: '',
        bookmarkQuery: '', bookmarkType: ''
    };

    var TABS = [
        { id: 'overview', label: 'Tổng quan', icon: 'fa-chart-simple' },
        { id: 'review', label: 'Ôn tập', icon: 'fa-rotate' },
        { id: 'notes', label: 'Ghi chú', icon: 'fa-pen-nib' },
        { id: 'bookmarks', label: 'Đánh dấu', icon: 'fa-bookmark' },
        { id: 'history', label: 'Lịch sử', icon: 'fa-clock-rotate-left' },
        { id: 'achievements', label: 'Thành tích', icon: 'fa-medal' },
        { id: 'settings', label: 'Cài đặt', icon: 'fa-gear' }
    ];

    function openHub(tab) {
        if (hub.modal) {
            if (tab) setTab(tab);
            return;
        }
        var body = el('div', 'bk-hub');
        var nav = el('nav', 'bk-hub-nav');
        nav.setAttribute('aria-label', 'Khu vực học tập');
        var main = el('div', 'bk-hub-main');
        main.id = 'bkHubMain';
        TABS.forEach(function (t) {
            var b = el('button', 'bk-hub-tab' + (t.id === (tab || 'overview') ? ' on' : ''));
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.appendChild(el('i', 'fa-solid ' + t.icon));
            b.appendChild(el('span', null, t.label));
            b.addEventListener('click', function () { setTab(t.id); });
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

        hub.modal = BK.ui.modal({
            title: 'Trung tâm học tập',
            body: wrap,
            wide: true,
            className: 'bk-hub-modal',
            labelledBy: 'bkHubTitle'
        });
        hub.modal.panel.querySelector('.bk-modal-title').id = 'bkHubTitle';
        hub.root = main;
        setTab(tab || 'overview');
    }

    function setTab(tab) {
        hub.tab = tab;
        Object.keys(hub.navItems).forEach(function (k) {
            hub.navItems[k].classList.toggle('on', k === tab);
            hub.navItems[k].setAttribute('aria-selected', k === tab ? 'true' : 'false');
        });
        renderTab();
    }

    function renderTab() {
        var root = hub.root;
        if (!root) return;
        root.innerHTML = '';
        var map = {
            overview: renderOverview, review: renderReview, notes: renderNotes,
            bookmarks: renderBookmarks, history: renderHistory,
            achievements: renderAchievements, settings: renderSettings
        };
        (map[hub.tab] || renderOverview)(root);
    }

    /* --------------------------- Tổng quan ------------------------------ */
    function renderOverview(root) {
        var s = BK.store.get();
        var acc = BK.stats.accuracy(s);

        root.appendChild(el('h3', null, 'Tiến độ học tập của bạn'));
        root.appendChild(el('p', 'bk-sub', 'Ghi nhận hoạt động luyện tập và ôn lại — không đo thời gian, không xếp hạng, không áp lực.'));

        var cards = el('div', 'bk-cards');
        [
            ['Đã luyện', acc.total, 'câu hỏi'],
            ['Đúng', acc.correct, pct(acc.total ? (acc.correct / acc.total) * 100 : 0)],
            ['Sai', acc.wrong, 'đã lưu để ôn'],
            ['Độ chính xác', pct(acc.pct), acc.total ? acc.total + ' câu' : 'chưa có dữ liệu']
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
            hint.appendChild(el('p', 'muted bk-small', 'Khi bạn làm câu hỏi trên các trang bài học, kết quả sẽ được ghi nhận tự động tại đây. Câu làm sai sẽ được đưa vào mục Ôn tập.'));
            root.appendChild(hint);
        }

        /* Hoạt động 14 ngày */
        root.appendChild(el('h4', null, 'Hoạt động 14 ngày gần nhất'));
        var days = [];
        var today = new Date(); today.setHours(0, 0, 0, 0);
        for (var i = 13; i >= 0; i--) {
            var d = new Date(today.getTime() - i * 86400000);
            var key = BK.util.dayKey(d.getTime());
            var count = s.practice.filter(function (p) { return BK.util.dayKey(p.ts) === key; }).length;
            days.push({ key: key, label: d.getDate() + '/' + (d.getMonth() + 1), count: count });
        }
        root.appendChild(barChart(days, 'Số câu luyện mỗi ngày'));

        /* Hoạt động 8 tuần */
        root.appendChild(el('h4', null, 'Hoạt động 8 tuần gần nhất'));
        var weeks = [];
        for (var w = 7; w >= 0; w--) {
            var start = today.getTime() - (w * 7 + 6) * 86400000;
            var end = today.getTime() - w * 7 * 86400000;
            var wc = s.practice.filter(function (p) { return p.ts >= start && p.ts <= end + 86400000; }).length;
            weeks.push({ label: w === 0 ? 'Tuần này' : '-' + w + 'w', count: wc });
        }
        root.appendChild(barChart(weeks, 'Số câu luyện mỗi tuần'));

        /* Theo môn */
        root.appendChild(el('h4', null, 'Tiến độ theo môn'));
        var bySubject = groupBy(s.practice, function (p) { return p.subject || 'khac'; });
        var subjectIds = Object.keys(bySubject);
        if (!subjectIds.length) {
            root.appendChild(emptyState('Chưa có dữ liệu môn học.', 'fa-layer-group'));
        } else {
            subjectIds.sort(function (a, b) { return bySubject[b].length - bySubject[a].length; });
            subjectIds.forEach(function (id) {
                var items = bySubject[id];
                var correct = items.filter(function (p) { return p.correct; }).length;
                root.appendChild(meter(subjectName(id), correct, items.length, correct + '/' + items.length));
            });
        }

        /* Theo chủ đề */
        root.appendChild(el('h4', null, 'Tiến độ theo chủ đề'));
        var byTopic = groupBy(s.practice.filter(function (p) { return p.topic; }), function (p) { return p.topic; });
        var topics = Object.keys(byTopic).sort(function (a, b) { return byTopic[b].length - byTopic[a].length; }).slice(0, 10);
        if (!topics.length) root.appendChild(emptyState('Chưa có chủ đề nào được ghi nhận.', 'fa-tags'));
        topics.forEach(function (t) {
            var items = byTopic[t];
            var correct = items.filter(function (p) { return p.correct; }).length;
            root.appendChild(meter(t, correct, items.length, correct + '/' + items.length));
        });

        /* Chủ đề hay sai */
        root.appendChild(el('h4', null, 'Chủ đề thường làm sai'));
        var wrongTopics = groupBy(s.review.filter(function (r) { return !r.mastered; }), function (r) { return r.topic || subjectName(r.subject); });
        var wt = Object.keys(wrongTopics).sort(function (a, b) {
            return wrongTopics[b].reduce(function (x, r) { return x + r.wrong; }, 0) - wrongTopics[a].reduce(function (x, r) { return x + r.wrong; }, 0);
        }).slice(0, 8);
        if (!wt.length) root.appendChild(emptyState('Chưa có câu nào cần ôn. Tốt lắm!', 'fa-circle-check'));
        wt.forEach(function (t) {
            var row = el('div', 'bk-meter');
            row.appendChild(el('span', 'bk-meter-name', t));
            var wrap = el('div');
            var total = wrongTopics[t].reduce(function (a, r) { return a + r.wrong; }, 0);
            var bar = el('div', 'bk-progress');
            var fill = el('span');
            fill.style.width = Math.min(100, total * 10) + '%';
            bar.appendChild(fill); wrap.appendChild(bar);
            row.appendChild(wrap);
            row.appendChild(el('span', 'bk-meter-val', total + ' lần'));
            root.appendChild(row);
        });

        /* Mốc học tập */
        var unlocked = s.achievements.unlocked || {};
        var achieved = BK.achievements.list.filter(function (a) { return unlocked[a.id]; });
        root.appendChild(el('h4', null, 'Mốc học tập đã đạt'));
        if (!achieved.length) {
            root.appendChild(emptyState('Chưa có mốc nào. Mốc đầu tiên sẽ đến khi bạn luyện câu hỏi đầu tiên.', 'fa-flag-checkered'));
        } else {
            var row = el('div', 'bk-pill-row');
            achieved.slice(0, 12).forEach(function (a) {
                var b = badge(a.name, 'ok');
                b.title = fmtDate(unlocked[a.id]);
                row.appendChild(b);
            });
            root.appendChild(row);
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

    /* ----------------------------- Ôn tập ------------------------------- */
    function renderReview(root) {
        var s = BK.store.get();
        var subjects = {};
        s.review.forEach(function (r) { subjects[r.subject] = true; });
        var subjectOptions = [{ value: '', label: 'Tất cả môn' }].concat(Object.keys(subjects).map(function (id) {
            return { value: id, label: subjectName(id) };
        }));

        root.appendChild(el('h3', null, 'Ôn tập thông minh'));
        root.appendChild(el('p', 'bk-sub', 'Câu làm sai được lưu tự động. Ôn lại theo nhịp độ của bạn — khoảng cách ôn dựa trên kết quả, không dựa trên thời gian học bắt buộc.'));

        var controls = el('div', 'bk-row');
        controls.style.marginBottom = '.7rem';
        var search = textInput(state.reviewQuery, 'Tìm câu hỏi cần ôn…', function (v) {
            state.reviewQuery = v; state.reviewActive = 0; renderTab();
        }, 'Tìm câu hỏi cần ôn');
        search.style.maxWidth = '16rem';
        controls.appendChild(search);
        var sel = select(subjectOptions, state.reviewSubject, function (v) { state.reviewSubject = v; state.reviewActive = 0; renderTab(); }, 'Lọc theo môn');
        sel.style.maxWidth = '10rem';
        controls.appendChild(sel);
        var label = el('label', 'bk-row bk-small');
        var cb = el('input');
        cb.type = 'checkbox'; cb.checked = state.reviewShowMastered;
        cb.addEventListener('change', function () { state.reviewShowMastered = cb.checked; state.reviewActive = 0; renderTab(); });
        label.appendChild(cb);
        label.appendChild(el('span', null, 'Hiện câu đã thành thạo'));
        controls.appendChild(label);
        root.appendChild(controls);

        var q = norm(state.reviewQuery);
        var items = s.review.filter(function (r) {
            if (!state.reviewShowMastered && r.mastered) return false;
            if (state.reviewSubject && r.subject !== state.reviewSubject) return false;
            if (q && norm(r.question + ' ' + (r.topic || '')).indexOf(q) < 0) return false;
            return true;
        }).sort(function (a, b) {
            if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
            if (a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;
            return b.wrong - a.wrong;
        });

        if (!items.length) {
            root.appendChild(emptyState('Không có câu nào trong mục ôn tập với bộ lọc hiện tại.', 'fa-circle-check'));
            return;
        }

        var list = el('div', 'bk-list');
        list.id = 'bkReviewList';
        list.setAttribute('tabindex', '0');
        list.setAttribute('aria-label', 'Danh sách câu cần ôn');
        items.forEach(function (item, index) {
            list.appendChild(reviewCard(item, index));
        });
        root.appendChild(list);

        var due = items.filter(function (r) { return r.nextReview <= Date.now() && !r.mastered; }).length;
        var summary = el('p', 'bk-small bk-muted');
        summary.style.marginTop = '.6rem';
        summary.textContent = items.length + ' câu · ' + due + ' câu đến hạn ôn hôm nay · dùng ← → để chuyển câu, A/B/C/D để chọn đáp án.';
        root.appendChild(summary);

        list.addEventListener('keydown', function (e) {
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            var cards = Array.prototype.slice.call(list.querySelectorAll('.bk-item'));
            if (!cards.length) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault(); focusCard(cards, 1); return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault(); focusCard(cards, -1); return;
            }
            if (/^[a-dA-D]$/.test(e.key)) {
                var active = list.querySelector('.bk-item.bk-active') || cards[0];
                var idx = 'abcd'.indexOf(e.key.toLowerCase());
                var opt = active.querySelectorAll('.bk-opt')[idx];
                if (opt && !opt.disabled) { e.preventDefault(); opt.click(); }
            }
        });
    }

    function focusCard(cards, delta) {
        var list = cards[0].parentElement;
        var cur = list.querySelector('.bk-item.bk-active');
        var i = cur ? cards.indexOf(cur) : -1;
        var next = Math.max(0, Math.min(cards.length - 1, i + delta));
        cards.forEach(function (c) { c.classList.remove('bk-active'); });
        cards[next].classList.add('bk-active');
        if (cards[next].scrollIntoView) cards[next].scrollIntoView({ block: 'nearest' });
        var head = cards[next].querySelector('.bk-item-title');
        if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); }
    }

    function reviewCard(item, index) {
        var card = el('div', 'bk-item' + (index === state.reviewActive ? ' bk-active' : ''));
        card.dataset.key = item.key;
        var head = el('div', 'bk-item-head');
        var titleWrap = el('div');
        titleWrap.style.minWidth = '0';
        var title = el('p', 'bk-item-title');
        title.style.fontWeight = '600';
        title.textContent = subjectName(item.subject) + (item.topic ? ' · ' + item.topic : '');
        titleWrap.appendChild(title);
        var meta = el('div', 'bk-item-meta');
        meta.appendChild(badge('Sai ' + item.wrong + ' lần', 'danger'));
        meta.appendChild(badge('Đúng ' + item.right + ' lần', 'ok'));
        if (item.mastered) meta.appendChild(badge('Đã thành thạo', 'ok'));
        else if (item.nextReview <= Date.now()) meta.appendChild(badge('Đến hạn ôn', 'warn'));
        else meta.appendChild(badge('Ôn từ ' + fmtDate(item.nextReview)));
        if (item.difficulty) meta.appendChild(badge('Độ khó: ' + item.difficulty));
        titleWrap.appendChild(meta);
        head.appendChild(titleWrap);
        card.appendChild(head);

        var qtext = el('p', 'bk-qtext');
        qtext.textContent = item.question;
        card.appendChild(qtext);

        var opts = Array.isArray(item.options) ? item.options : [];
        var answer = item.answer;

        if (opts.length && answer != null && !item.mastered) {
            var box = el('div', 'bk-opts');
            opts.forEach(function (opt, i) {
                var b = el('button', 'bk-opt');
                b.type = 'button';
                b.dataset.opt = String(i);
                b.appendChild(el('b', null, String.fromCharCode(65 + i) + '.'));
                b.appendChild(el('span', null, opt));
                b.addEventListener('click', function () { attemptReview(item, i, box); });
                box.appendChild(b);
            });
            card.appendChild(box);
        }

        var actions = el('div', 'bk-item-actions');
        if (!opts.length || answer == null) {
            actions.appendChild(ghostBtn('Nhớ tốt', function () { mark('good'); }, 'fa-check'));
            actions.appendChild(ghostBtn('Chưa nhớ', function () { mark('again'); }, 'fa-rotate-left'));
        }
        actions.appendChild(ghostBtn('Thành thạo', function () { mark('mastered'); }, 'fa-check-double'));
        actions.appendChild(ghostBtn('Ghi chú', function () {
            openNoteEditor(null, { subject: item.subject, questionId: item.questionId || item.key, title: subjectName(item.subject) + ' — ghi chú câu hỏi' });
        }, 'fa-pen-nib'));
        actions.appendChild(ghostBtn('Đánh dấu', function () {
            var b = BK.addBookmark({
                type: 'question', title: item.question.slice(0, 120), subject: item.subject,
                ref: item.key, url: item.source || '', folder: 'Câu cần ôn'
            });
            BK.ui.toast(b ? 'Đã lưu câu hỏi vào Đánh dấu' : 'Câu này đã được đánh dấu', b ? 'success' : 'info');
        }, 'fa-bookmark'));
        if (item.source) {
            var open = ghostBtn('Mở bài học', function () { location.href = item.source; }, 'fa-arrow-up-right-from-square');
            actions.appendChild(open);
        }

        var dateWrap = el('span', 'bk-row');
        dateWrap.style.marginLeft = 'auto';
        var date = el('input', 'bk-input');
        date.type = 'date'; date.style.width = '9.4rem'; date.style.padding = '.28rem .4rem';
        date.setAttribute('aria-label', 'Hẹn ngày ôn lại');
        var d = new Date(item.nextReview || Date.now());
        date.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        dateWrap.appendChild(date);
        dateWrap.appendChild(ghostBtn('Hẹn', function () {
            var r = BK.scheduleReview(item.key, date.value);
            BK.ui.toast(r ? 'Đã hẹn ngày ôn lại' : 'Không hẹn được ngày này', r ? 'success' : 'error');
            renderTab();
        }, 'fa-calendar-check'));
        actions.appendChild(dateWrap);
        card.appendChild(actions);

        function mark(perf) {
            BK.markReview(item.key, perf);
            BK.ui.toast(perf === 'mastered' ? 'Đã đánh dấu thành thạo' : perf === 'again' ? 'Sẽ ôn lại sớm' : 'Đã ghi nhận tiến bộ', 'success');
            renderTab();
        }

        return card;
    }

    function attemptReview(item, choice, box) {
        var answer = item.answer;
        var correct = (typeof answer === 'number')
            ? choice === answer
            : String(item.options[choice]).trim() === String(answer).trim();
        Array.prototype.forEach.call(box.querySelectorAll('.bk-opt'), function (b, i) {
            b.disabled = true;
            if (typeof answer === 'number' ? i === answer : String(item.options[i]).trim() === String(answer).trim()) b.classList.add('is-right');
        });
        if (!correct) box.querySelectorAll('.bk-opt')[choice].classList.add('is-wrong');
        BK.practice({
            question: item.question, questionId: item.questionId || item.key, subject: item.subject,
            topic: item.topic, difficulty: item.difficulty, correct: correct,
            options: item.options, answer: item.answer, explanation: item.explanation,
            source: item.source, lesson: item.source, silent: false
        });
        BK.ui.toast(correct ? 'Chính xác! Tiến bộ đã được ghi nhận.' : 'Chưa đúng — câu này sẽ được ôn lại sớm.', correct ? 'success' : 'error');
        setTimeout(renderTab, 550);
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
                if (hub.modal) renderTab();
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
                        if (hub.modal) renderTab();
                    }
                }
            ]
        });
    }

    /* ---------------------------- Lịch sử ------------------------------- */
    function renderHistory(root) {
        var s = BK.store.get();
        root.appendChild(el('h3', null, 'Lịch sử học tập'));
        root.appendChild(el('p', 'bk-sub', 'Bài học đã mở, câu đã luyện, câu đã ôn. Đây là lịch sử học tập — không phải hồ sơ thi cử.'));

        var controls = el('div', 'bk-row');
        controls.style.marginBottom = '.7rem';
        var search = textInput(state.historyQuery, 'Tìm trong lịch sử…', function (v) { state.historyQuery = v; renderTab(); }, 'Tìm trong lịch sử');
        search.style.maxWidth = '15rem';
        controls.appendChild(search);
        var sel = select([
            { value: '', label: 'Tất cả hoạt động' }, { value: 'lesson', label: 'Bài học' },
            { value: 'practice', label: 'Luyện tập' }, { value: 'review', label: 'Ôn tập' }
        ], state.historyKind, function (v) { state.historyKind = v; renderTab(); }, 'Lọc hoạt động');
        sel.style.maxWidth = '10rem';
        controls.appendChild(sel);
        controls.appendChild(ghostBtn('Xoá tất cả', function () {
            BK.ui.confirm({
                title: 'Xoá toàn bộ lịch sử',
                message: 'Xoá toàn bộ lịch sử học tập? Ghi chú, đánh dấu và câu cần ôn sẽ được giữ lại.',
                ok: 'Xoá lịch sử', danger: true
            }).then(function (ok) {
                if (!ok) return;
                BK.store.update(function (st) { st.history = []; return st; });
                renderTab();
                BK.ui.toast('Đã xoá lịch sử học tập', 'success');
            });
        }, 'fa-trash'));
        root.appendChild(controls);

        var q = norm(state.historyQuery);
        var items = s.history.slice().reverse().filter(function (h) {
            if (state.historyKind && h.kind !== state.historyKind) return false;
            if (q && norm(h.title + ' ' + h.meta + ' ' + subjectName(h.subject)).indexOf(q) < 0) return false;
            return true;
        }).slice(0, 200);

        if (!items.length) {
            root.appendChild(emptyState('Chưa có hoạt động nào được ghi nhận.', 'fa-clock-rotate-left'));
            return;
        }
        var list = el('div', 'bk-list');
        items.forEach(function (h) {
            var card = el('div', 'bk-item');
            var head = el('div', 'bk-item-head');
            var w = el('div'); w.style.minWidth = '0';
            var title = el('p', 'bk-item-title', h.title || '(không tiêu đề)');
            w.appendChild(title);
            var meta = el('div', 'bk-item-meta');
            meta.appendChild(badge(h.kind === 'lesson' ? 'Bài học' : h.kind === 'review' ? 'Ôn tập' : 'Luyện tập',
                h.meta === 'correct' ? 'ok' : h.meta === 'incorrect' ? 'danger' : ''));
            if (h.subject) meta.appendChild(badge(subjectName(h.subject)));
            meta.appendChild(el('span', null, fmtTime(h.ts)));
            w.appendChild(meta);
            head.appendChild(w);
            card.appendChild(head);
            var actions = el('div', 'bk-item-actions');
            if (h.url) actions.appendChild(ghostBtn('Mở', function () { location.href = h.url; }, 'fa-arrow-up-right-from-square'));
            actions.appendChild(ghostBtn('Xoá mục này', function () {
                BK.store.update(function (st) { st.history = st.history.filter(function (x) { return x.id !== h.id; }); return st; });
                renderTab();
            }, 'fa-xmark'));
            card.appendChild(actions);
            list.appendChild(card);
        });
        root.appendChild(list);
    }

    /* --------------------------- Thành tích ----------------------------- */
    function renderAchievements(root) {
        var s = BK.store.get();
        var unlocked = s.achievements.unlocked || {};
        var list = BK.achievements.list;
        var count = list.filter(function (a) { return unlocked[a.id]; }).length;

        root.appendChild(el('h3', null, 'Thành tích học tập'));
        root.appendChild(el('p', 'bk-sub', 'Chỉ dựa trên hoạt động học thật. Không có chuỗi ngày, không yêu cầu điểm danh, không tạo áp lực.'));

        var progress = el('div', 'bk-item');
        progress.appendChild(el('p', 'bk-item-title', count + '/' + list.length + ' mốc đã đạt'));
        var bar = el('div', 'bk-progress');
        bar.style.marginTop = '.45rem';
        var fill = el('span');
        fill.style.width = (list.length ? Math.round((count / list.length) * 100) : 0) + '%';
        bar.appendChild(fill);
        progress.appendChild(bar);
        root.appendChild(progress);

        var grid = el('div', 'bk-ach-grid');
        grid.style.marginTop = '.7rem';
        list.forEach(function (a) {
            var on = !!unlocked[a.id];
            var tile = el('div', 'bk-ach' + (on ? ' on' : ''));
            var ico = el('div', 'bk-ach-ico');
            ico.innerHTML = '<i class="fa-solid ' + a.icon + '"></i>';
            tile.appendChild(ico);
            var w = el('div');
            w.appendChild(el('b', null, a.name));
            w.appendChild(el('span', null, a.desc));
            if (on) w.appendChild(el('span', null, ' · ' + fmtDate(unlocked[a.id])));
            tile.appendChild(w);
            grid.appendChild(tile);
        });
        root.appendChild(grid);
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
                                if (hub.modal) renderTab();
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

    function commands() {
        var cmds = [
            { label: 'Trung tâm học tập — Tổng quan', icon: 'fa-chart-simple', run: function () { openHub('overview'); } },
            { label: 'Ôn tập câu đã làm sai', icon: 'fa-rotate', run: function () { openHub('review'); } },
            { label: 'Ghi chú cá nhân', icon: 'fa-pen-nib', run: function () { openHub('notes'); } },
            { label: 'Đánh dấu', icon: 'fa-bookmark', run: function () { openHub('bookmarks'); } },
            { label: 'Lịch sử học tập', icon: 'fa-clock-rotate-left', run: function () { openHub('history'); } },
            { label: 'Thành tích', icon: 'fa-medal', run: function () { openHub('achievements'); } },
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
        if (r.type === 'review') return openHub('review');
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
            { icon: 'fa-chart-simple', label: 'Trung tâm học tập (Ctrl+K)', run: function () { openHub('overview'); } },
            { icon: 'fa-rotate', label: 'Ôn tập câu đã sai', run: function () { openHub('review'); } },
            { icon: 'fa-pen-nib', label: 'Ghi chú', run: function () { openHub('notes'); } },
            { icon: 'fa-bookmark', label: 'Đánh dấu', run: function () { openHub('bookmarks'); } },
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
            else if (['overview', 'review', 'notes', 'bookmarks', 'history', 'achievements', 'settings'].indexOf(bk) >= 0) openHub(bk);
        } catch (e) { /* bỏ qua */ }
    }

    function init() {
        applyPreferences();
        buildDock();
        BK.achievements.check();
        handleUrlParams();
        BK.store.on('practice', function () {
            if (hub.modal && (hub.tab === 'overview' || hub.tab === 'review')) renderTab();
        });
    }

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();

    global.BKLearn = {
        openHub: openHub, openSearch: openSearch, openPalette: openPalette,
        openNote: openNoteEditor, openBookmark: openBookmarkEditor,
        toggleFocus: toggleFocus, exportData: exportData, importData: importData,
        applyPreferences: applyPreferences, renderTab: renderTab
    };
})(typeof window !== 'undefined' ? window : this);
