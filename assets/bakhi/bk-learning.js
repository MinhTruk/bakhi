/* =========================================================================
   Bá Khí — bk-learning.js  (8.2.0 · Learning Intelligence)

   Bốn hệ thống dùng chung MỘT nguồn dữ liệu trong BK.store:
     · Sổ tay câu sai  → BK.mistakes   (s.review, schema 2)
     · Phân tích       → BK.analytics  (tính lại từ s.practice/s.review/s.plans)
     · Kế hoạch        → BK.planner    (s.plans)
     · Ôn tập          → BK.revision   (s.review + s.revisionSessions)
     · Mục tiêu        → BK.goals      (s.goals)

   Nguyên tắc:
   - Không có bộ đếm thời gian, không bài thi thử, không xếp hạng.
   - Không tạo bản sao dữ liệu: mọi con số đều suy ra từ dữ liệu gốc.
   - Không bịa số liệu: chỗ nào chưa đủ dữ liệu thì nói rõ "chưa đủ dữ liệu".
   - Không nạp thư viện biểu đồ: SVG tự dựng, nhẹ và không phụ thuộc mạng.
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    var BK = global.BK;
    if (!D || !BK) return;
    if (global.BKLearning) return;

    var el = BK.ui.el;
    var norm = BK.util.norm;
    var fmtDate = BK.util.fmtDate;
    var fmtTime = BK.util.fmtTime;
    var C = BK.constants;
    var DAY = 86400000;

    var state = {
        subject: '',
        mQuery: '', mStatus: 'active', mError: '', mTopic: '', mSort: 'priority', mLimit: 20,
        range: 30,
        plannerView: 'week', plannerSubject: '',
        revisionScope: 'due',
        session: null,
        suggestionsDismissed: {}
    };

    var hooks = { rerender: function () { } };

    /* ----------------------------- tiện ích ----------------------------- */
    function btn(label, cls, onClick, icon) {
        var b = el('button', 'bk-btn ' + (cls || ''), '');
        b.type = 'button';
        if (icon) {
            var i = el('i', 'fa-solid ' + icon);
            i.setAttribute('aria-hidden', 'true');
            b.appendChild(i);
        }
        if (label) b.appendChild(D.createTextNode(' ' + label));
        b.addEventListener('click', onClick);
        return b;
    }
    function ghost(label, onClick, icon) { return btn(label, 'bk-btn-ghost bk-btn-sm', onClick, icon); }
    function pill(text, kind) { return el('span', 'bk-badge' + (kind ? ' bk-badge-' + kind : ''), text); }
    function empty(text, icon) {
        var d = el('div', 'bk-empty');
        d.appendChild(el('i', 'fa-solid ' + (icon || 'fa-inbox')));
        d.appendChild(el('p', null, text));
        return d;
    }
    function field(label, control) {
        var f = el('label', 'bk-field');
        f.appendChild(el('span', null, label));
        f.appendChild(control);
        return f;
    }
    function select(options, value, onChange, aria) {
        var s = el('select', 'bk-select');
        if (aria) s.setAttribute('aria-label', aria);
        options.forEach(function (o) {
            var op = el('option', null, o.label);
            op.value = o.value;
            s.appendChild(op);
        });
        s.value = value;
        if (onChange) s.addEventListener('change', function () { onChange(s.value); });
        return s;
    }
    function input(value, placeholder, onInput, aria, type) {
        var i = el('input', 'bk-input');
        i.type = type || 'text';
        i.value = value || '';
        if (placeholder) i.placeholder = placeholder;
        if (aria) i.setAttribute('aria-label', aria);
        if (onInput) i.addEventListener('input', BK.util.debounce(function () { onInput(i.value); }, 200));
        return i;
    }
    function textarea(value, placeholder, aria) {
        var t = el('textarea', 'bk-textarea');
        t.value = value || '';
        t.placeholder = placeholder || '';
        if (aria) t.setAttribute('aria-label', aria);
        return t;
    }
    function card(k, v, hint) {
        var c = el('div', 'bk-card');
        c.appendChild(el('div', 'bk-card-k', k));
        c.appendChild(el('div', 'bk-card-v', String(v)));
        if (hint) c.appendChild(el('div', 'bk-card-hint', hint));
        return c;
    }
    function cards(list) {
        var g = el('div', 'bk-cards');
        list.forEach(function (x) { g.appendChild(x); });
        return g;
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
    function subjectName(id) { return id ? BK.subjectName(id) : 'Chưa gắn môn'; }
    function dayShift(n) { return BK.util.dayKeyOf(n); }
    function dayLabel(key) {
        if (!key) return '—';
        var parts = String(key).split('-');
        return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : key;
    }
    function isoWeekday(dateKey) {
        /* Tính trên lịch UTC của khoá ngày để không phụ thuộc múi giờ máy. */
        var d = new Date(dateKey + 'T00:00:00Z');
        return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    }
    function subjectOptions(includeAll) {
        var ids = {};
        BK.store.get().practice.forEach(function (p) { if (p.subject) ids[p.subject] = 1; });
        BK.store.get().review.forEach(function (r) { if (r.subject) ids[r.subject] = 1; });
        BK.store.get().plans.forEach(function (p) { if (p.subject) ids[p.subject] = 1; });
        var list = Object.keys(ids).map(function (id) { return { value: id, label: subjectName(id) }; });
        if (!list.length) {
            list = Object.keys(BK.subjects).map(function (id) { return { value: id, label: subjectName(id) }; });
        }
        return (includeAll ? [{ value: '', label: 'Tất cả môn' }] : [{ value: '', label: 'Không gắn môn' }]).concat(list);
    }
    function rangeLabel(days) { return days ? days + ' ngày' : 'Tất cả thời gian'; }

    /* ----------------------------- biểu đồ ----------------------------- */
    var SVGNS = 'http://www.w3.org/2000/svg';
    function svg(tag, attrs) {
        var n = D.createElementNS(SVGNS, tag);
        Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        return n;
    }

    /* Biểu đồ cột dùng CSS sẵn có (.bk-bars) — không cần SVG. */
    function bars(data, label) {
        var holder = el('div');
        holder.setAttribute('role', 'img');
        holder.setAttribute('aria-label', label + ': ' + data.map(function (d) { return d.label + ' ' + d.value; }).join(', '));
        var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
        var chart = el('div', 'bk-bars');
        data.forEach(function (d) {
            var bar = el('div', 'bk-bar' + (d.value ? '' : ' is-empty'));
            bar.appendChild(el('span', 'bk-bar-count', d.value ? String(d.value) : ''));
            var track = el('div', 'bk-bar-track');
            var fill = el('div', 'bk-bar-fill');
            fill.style.height = (d.value ? Math.max(6, Math.round((d.value / max) * 100)) : 2) + '%';
            if (d.color) fill.style.background = d.color;
            track.appendChild(fill);
            bar.appendChild(track);
            bar.appendChild(el('span', 'bk-bar-label', d.label));
            chart.appendChild(bar);
        });
        holder.appendChild(chart);
        return holder;
    }

    /* Biểu đồ đường (accuracy trend) — SVG, không phụ thuộc thư viện. */
    function line(points, label) {
        var holder = el('div', 'bk-chart');
        var valid = points.filter(function (p) { return p.value != null; });
        if (valid.length < 2) {
            holder.appendChild(empty('Cần ít nhất 2 ngày có dữ liệu để vẽ xu hướng.', 'fa-chart-line'));
            return holder;
        }
        var W = 640, H = 160, padL = 30, padB = 22, padT = 10;
        var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label });
        root.setAttribute('class', 'bk-svg');
        [0, 50, 100].forEach(function (v) {
            var y = padT + (100 - v) / 100 * (H - padT - padB);
            root.appendChild(svg('line', {
                x1: padL, x2: W - 4, y1: y, y2: y, stroke: 'currentColor',
                'stroke-opacity': '0.14', 'stroke-width': '1'
            }));
            var t = svg('text', { x: 2, y: y + 3, fill: 'currentColor', 'font-size': '9', 'fill-opacity': '0.6' });
            t.textContent = v + '%';
            root.appendChild(t);
        });
        var step = points.length > 1 ? (W - padL - 8) / (points.length - 1) : 0;
        var d = '';
        points.forEach(function (p, i) {
            if (p.value == null) return;
            var x = padL + i * step;
            var y = padT + (100 - p.value) / 100 * (H - padT - padB);
            d += (d ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        });
        root.appendChild(svg('path', {
            d: d, fill: 'none', stroke: 'var(--bkl-primary, #6366f1)',
            'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }));
        var firstLabel = svg('text', { x: padL, y: H - 5, fill: 'currentColor', 'font-size': '9', 'fill-opacity': '0.6' });
        firstLabel.textContent = points[0].label;
        root.appendChild(firstLabel);
        var lastLabel = svg('text', { x: W - 4, y: H - 5, fill: 'currentColor', 'font-size': '9', 'fill-opacity': '0.6', 'text-anchor': 'end' });
        lastLabel.textContent = points[points.length - 1].label;
        root.appendChild(lastLabel);
        holder.appendChild(root);
        return holder;
    }

    /* Vòng phân bố lỗi. */
    function donut(parts, label) {
        var holder = el('div', 'bk-donut-wrap');
        var total = parts.reduce(function (a, p) { return a + p.value; }, 0);
        if (!total) {
            holder.appendChild(empty('Chưa có câu sai nào để phân loại.', 'fa-chart-pie'));
            return holder;
        }
        var size = 132, r = 52, c = 2 * Math.PI * r, offset = 0;
        var root = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': label });
        root.setAttribute('class', 'bk-svg bk-donut');
        root.appendChild(svg('circle', {
            cx: size / 2, cy: size / 2, r: r, fill: 'none',
            stroke: 'currentColor', 'stroke-opacity': '0.12', 'stroke-width': '14'
        }));
        var palette = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#a855f7'];
        parts.forEach(function (p, i) {
            if (!p.value) return;
            var len = (p.value / total) * c;
            var seg = svg('circle', {
                cx: size / 2, cy: size / 2, r: r, fill: 'none',
                stroke: palette[i % palette.length], 'stroke-width': '14',
                'stroke-dasharray': len.toFixed(2) + ' ' + (c - len).toFixed(2),
                'stroke-dashoffset': (-offset).toFixed(2),
                transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'
            });
            root.appendChild(seg);
            offset += len;
        });
        holder.appendChild(root);
        var legend = el('div', 'bk-legend');
        parts.forEach(function (p, i) {
            if (!p.value) return;
            var row = el('div', 'bk-legend-row');
            var dot = el('span', 'bk-legend-dot');
            dot.style.background = palette[i % palette.length];
            row.appendChild(dot);
            row.appendChild(el('span', 'bk-legend-label', p.label));
            row.appendChild(el('span', 'bk-legend-val', String(p.value)));
            legend.appendChild(row);
        });
        holder.appendChild(legend);
        return holder;
    }

    /* =====================================================================
       Tab 2 — My Subjects
       ================================================================== */
    function renderSubjects(root) {
        var s = BK.store.get();
        var perf = BK.analytics.subjects(0);
        var stats = BK.mistakes.stats();

        root.appendChild(el('h3', null, 'Môn học của tôi'));
        root.appendChild(el('p', 'bk-sub',
            'Tiến độ từng môn lấy từ hoạt động thật: câu đã luyện, bài đã mở, câu sai và kế hoạch. ' +
            'Không có môn nào bị tính điểm khi bạn chưa mở bài.'));

        var byId = {};
        perf.forEach(function (p) { byId[p.id] = p; });
        s.history.forEach(function (h) {
            if (h.kind !== 'lesson' || !h.subject || byId[h.subject]) return;
            byId[h.subject] = {
                id: h.subject, name: subjectName(h.subject), total: 0, correct: 0, accuracy: 0,
                lastAt: h.ts, mistakes: 0, mastered: 0, lessons: 0, plans: 0
            };
        });
        var list = Object.keys(byId).map(function (k) { return byId[k]; })
            .sort(function (a, b) { return (b.total + b.lessons) - (a.total + a.lessons); });

        if (!list.length) {
            root.appendChild(empty('Chưa có dữ liệu môn học. Mở một bài học hoặc luyện vài câu hỏi để bắt đầu.', 'fa-layer-group'));
            return;
        }

        root.appendChild(cards([
            card('Môn có dữ liệu', list.length, 'trong ' + Object.keys(BK.subjects).length + ' môn'),
            card('Câu đã luyện', stats.total ? s.practice.length : s.practice.length, 'trên toàn hệ thống'),
            card('Câu đang cần ôn', stats.due, 'đến hạn hôm nay')
        ]));

        var wrap = el('div', 'bk-list');
        wrap.style.marginTop = '.8rem';
        list.forEach(function (m) {
            var item = el('div', 'bk-item');
            var head = el('div', 'bk-item-head');
            var w = el('div');
            w.style.minWidth = '0';
            var t = el('p', 'bk-item-title');
            t.textContent = m.name;
            w.appendChild(t);
            var meta = el('div', 'bk-item-meta');
            meta.appendChild(pill(m.total + ' câu'));
            if (m.total) meta.appendChild(pill('Đúng ' + m.accuracy + '%', m.accuracy >= 70 ? 'ok' : 'warn'));
            meta.appendChild(pill(m.lessons + ' bài đã mở'));
            if (m.mistakes) meta.appendChild(pill(m.mistakes + ' câu sai', 'danger'));
            if (m.mastered) meta.appendChild(pill(m.mastered + ' thành thạo', 'ok'));
            if (m.lastAt) meta.appendChild(el('span', null, 'Gần nhất ' + fmtDate(m.lastAt)));
            w.appendChild(meta);
            head.appendChild(w);
            item.appendChild(head);

            item.appendChild(meter('Độ chính xác', m.correct, m.total, m.total ? m.accuracy + '%' : 'chưa có'));

            var actions = el('div', 'bk-item-actions');
            actions.appendChild(ghost('Xem câu sai', function () {
                state.subject = m.id; state.mQuery = ''; state.mStatus = 'active';
                hooks.openTab('mistakes');
            }, 'fa-book-skull'));
            actions.appendChild(ghost('Luyện ôn môn này', function () {
                startSession('due', m.id);
            }, 'fa-rotate'));
            actions.appendChild(ghost('Lập kế hoạch', function () {
                state.plannerSubject = m.id;
                hooks.openTab('planner');
            }, 'fa-calendar-plus'));
            item.appendChild(actions);
            wrap.appendChild(item);
        });
        root.appendChild(wrap);
    }

    /* =====================================================================
       Tab 3 — Sổ tay câu sai
       ================================================================== */
    function statusPill(r) {
        var kind = r.status === 'mastered' ? 'ok'
            : r.status === 'needs_attention' ? 'danger'
                : r.status === 'archived' ? '' : 'warn';
        return pill(C.STATUS_LABELS[r.status] || r.status, kind);
    }

    function renderMistakes(root) {
        var stats = BK.mistakes.stats();

        root.appendChild(el('h3', null, 'Sổ tay câu sai'));
        root.appendChild(el('p', 'bk-sub',
            'Câu làm sai được ghi tự động từ mọi bài luyện tập. Bạn quyết định cách phân loại lỗi, ' +
            'ghi chú và khi nào coi là thành thạo — hệ thống không tự kết luận nguyên nhân sai.'));

        root.appendChild(cards([
            card('Tổng câu sai', stats.total, stats.total ? stats.unclassified + ' chưa phân loại' : 'chưa có'),
            card('Đang cần ôn', stats.active, stats.due + ' đến hạn'),
            card('Thành thạo', stats.mastered, 'chuỗi đúng ≥ 2'),
            card('Đã lưu trữ', stats.archived, 'vẫn giữ lịch sử')
        ]));

        /* Bộ lọc */
        var controls = el('div', 'bk-row bk-filters');
        controls.style.margin = '.7rem 0';
        var search = input(state.mQuery, 'Tìm câu hỏi, ghi chú…', function (v) {
            state.mQuery = v; state.mLimit = 20; hooks.rerender();
        }, 'Tìm trong sổ tay câu sai');
        search.style.maxWidth = '15rem';
        controls.appendChild(search);

        var sel = select(subjectOptions(true), state.subject, function (v) {
            state.subject = v; state.mTopic = ''; state.mLimit = 20; hooks.rerender();
        }, 'Lọc môn học');
        sel.style.maxWidth = '9rem';
        controls.appendChild(sel);

        var topics = BK.mistakes.topics(state.subject);
        if (topics.length) {
            var topicSel = select([{ value: '', label: 'Tất cả chương' }].concat(topics.map(function (t) {
                return { value: t, label: t };
            })), state.mTopic, function (v) { state.mTopic = v; state.mLimit = 20; hooks.rerender(); }, 'Lọc chương');
            topicSel.style.maxWidth = '10rem';
            controls.appendChild(topicSel);
        }

        var errSel = select([{ value: '', label: 'Mọi loại lỗi' }].concat(Object.keys(C.ERROR_TYPES).map(function (k) {
            return { value: k, label: C.ERROR_TYPES[k] };
        })), state.mError, function (v) { state.mError = v; state.mLimit = 20; hooks.rerender(); }, 'Lọc loại lỗi');
        errSel.style.maxWidth = '10rem';
        controls.appendChild(errSel);

        var statusSel = select([
            { value: 'active', label: 'Đang theo dõi' },
            { value: 'all', label: 'Tất cả trạng thái' },
            { value: 'new', label: 'Mới' },
            { value: 'reviewing', label: 'Đang ôn' },
            { value: 'needs_attention', label: 'Cần chú ý' },
            { value: 'mastered', label: 'Thành thạo' },
            { value: 'archived', label: 'Đã lưu trữ' }
        ], state.mStatus, function (v) { state.mStatus = v; state.mLimit = 20; hooks.rerender(); }, 'Lọc trạng thái');
        statusSel.style.maxWidth = '9.5rem';
        controls.appendChild(statusSel);

        var sortSel = select([
            { value: 'priority', label: 'Ưu tiên' },
            { value: 'due', label: 'Đến hạn' },
            { value: 'recent', label: 'Gần đây' },
            { value: 'wrong', label: 'Sai nhiều' }
        ], state.mSort, function (v) { state.mSort = v; hooks.rerender(); }, 'Sắp xếp');
        sortSel.style.maxWidth = '8rem';
        controls.appendChild(sortSel);

        var dueBtn = ghost('Chỉ câu đến hạn', function () {
            state.mStatus = 'active'; state.mQuery = ''; state.mSort = 'due'; hooks.openTab('revision');
        }, 'fa-clock');
        controls.appendChild(dueBtn);
        root.appendChild(controls);

        var items = BK.mistakes.list({
            query: state.mQuery, subject: state.subject, topic: state.mTopic,
            errorType: state.mError, status: state.mStatus, sort: state.mSort
        });

        if (!items.length) {
            root.appendChild(empty(stats.total
                ? 'Không có câu nào khớp bộ lọc hiện tại.'
                : 'Chưa có câu sai nào. Khi bạn làm sai một câu hỏi, câu đó sẽ tự động vào đây.', 'fa-book-skull'));
            return;
        }

        var summary = el('p', 'bk-small bk-muted');
        summary.textContent = items.length + ' câu trong sổ tay · hiển thị ' + Math.min(items.length, state.mLimit) + '.';
        root.appendChild(summary);

        var list = el('div', 'bk-list');
        items.slice(0, state.mLimit).forEach(function (r) { list.appendChild(mistakeCard(r)); });
        root.appendChild(list);

        if (items.length > state.mLimit) {
            root.appendChild(ghost('Tải thêm', function () {
                state.mLimit += 20; hooks.rerender();
            }, 'fa-chevron-down'));
        }
    }

    function answerText(r, value) {
        if (value == null) return '—';
        if (typeof value === 'number' && r.options && r.options[value] != null) return String(r.options[value]);
        return String(value);
    }

    function mistakeCard(r) {
        var item = el('div', 'bk-item' + (r.status === 'needs_attention' ? ' bk-needs-attention' : ''));
        var head = el('div', 'bk-item-head');
        var w = el('div');
        w.style.minWidth = '0';
        var title = el('p', 'bk-item-title');
        title.textContent = subjectName(r.subject) + (r.topic ? ' · ' + r.topic : '');
        w.appendChild(title);
        var meta = el('div', 'bk-item-meta');
        meta.appendChild(statusPill(r));
        meta.appendChild(pill('Sai ' + r.wrong + ' lần', 'danger'));
        if (r.right) meta.appendChild(pill('Đúng ' + r.right + ' lần', 'ok'));
        meta.appendChild(pill(C.ERROR_TYPES[r.errorType]));
        if (r.nextReview <= Date.now() && r.status !== 'mastered' && r.status !== 'archived') {
            meta.appendChild(pill('Đến hạn ôn', 'warn'));
        } else if (r.status !== 'mastered' && r.status !== 'archived') {
            meta.appendChild(el('span', null, 'Ôn từ ' + fmtDate(r.nextReview)));
        }
        if (r.pinned) meta.appendChild(pill('Ghim'));
        w.appendChild(meta);
        head.appendChild(w);
        item.appendChild(head);

        var q = el('p', 'bk-qtext');
        q.textContent = r.question;
        item.appendChild(q);

        var answers = el('div', 'bk-answer-grid');
        var chosenRow = el('div', 'bk-answer bk-answer-wrong');
        chosenRow.appendChild(el('b', null, 'Bạn chọn: '));
        chosenRow.appendChild(el('span', null, answerText(r, r.chosen)));
        answers.appendChild(chosenRow);
        var rightRow = el('div', 'bk-answer bk-answer-right');
        rightRow.appendChild(el('b', null, 'Đáp án đúng: '));
        rightRow.appendChild(el('span', null, answerText(r, r.answer)));
        answers.appendChild(rightRow);
        item.appendChild(answers);

        if (r.explanation) {
            var exp = el('details', 'bk-explain');
            exp.appendChild(el('summary', null, 'Giải thích'));
            exp.appendChild(el('p', null, r.explanation));
            item.appendChild(exp);
        }

        if (r.history && r.history.length) {
            var hist = el('p', 'bk-small bk-muted');
            hist.textContent = 'Lịch sử: ' + r.history.slice(-5).map(function (h) {
                return (h.correct ? '✓' : '✗') + ' ' + fmtDate(h.ts);
            }).join(' · ');
            item.appendChild(hist);
        }
        if (r.note) {
            var note = el('p', 'bk-small bk-note-line');
            note.textContent = '📝 ' + r.note;
            item.appendChild(note);
        }

        var actions = el('div', 'bk-item-actions');
        actions.appendChild(ghost('Ôn lại câu này', function () {
            startSession('single', '', [r.key]);
        }, 'fa-rotate-right'));
        actions.appendChild(ghost('Phân loại & ghi chú', function () { editMistake(r); }, 'fa-tags'));
        if (r.status !== 'mastered') {
            actions.appendChild(ghost('Thành thạo', function () {
                BK.mistakes.update(r.id, { status: 'mastered' });
                try {
                    if (BK.gamification) BK.gamification.track('mistake_mastered', r.key, { dayScoped: false });
                } catch (e) { }
                BK.ui.toast('Đã đánh dấu thành thạo', 'success');
                hooks.rerender();
            }, 'fa-check-double'));
        }
        if (r.status !== 'needs_attention' && r.status !== 'archived') {
            actions.appendChild(ghost('Cần chú ý', function () {
                BK.mistakes.update(r.id, { status: 'needs_attention' });
                BK.ui.toast('Đã đưa vào nhóm cần chú ý', 'info');
                hooks.rerender();
            }, 'fa-triangle-exclamation'));
        }
        if (r.status !== 'archived') {
            actions.appendChild(ghost('Lưu trữ', function () {
                BK.mistakes.update(r.id, { status: 'archived' });
                BK.ui.toast('Đã lưu trữ câu này (lịch sử bài làm vẫn giữ nguyên)', 'success');
                hooks.rerender();
            }, 'fa-box-archive'));
        } else {
            actions.appendChild(ghost('Bỏ lưu trữ', function () {
                BK.mistakes.update(r.id, { status: 'reviewing' });
                hooks.rerender();
            }, 'fa-rotate-left'));
        }
        actions.appendChild(ghost(r.pinned ? 'Bỏ ghim' : 'Ghim', function () {
            BK.mistakes.update(r.id, { pinned: !r.pinned });
            hooks.rerender();
        }, 'fa-thumbtack'));
        if (r.source) {
            actions.appendChild(ghost('Mở bài học', function () { global.location.href = r.source; }, 'fa-arrow-up-right-from-square'));
        }
        actions.appendChild(ghost('Xoá khỏi sổ tay', function () { removeMistake(r); }, 'fa-trash'));
        item.appendChild(actions);

        return item;
    }

    function editMistake(r) {
        var body = el('div');
        var typeSel = select(Object.keys(C.ERROR_TYPES).map(function (k) {
            return { value: k, label: C.ERROR_TYPES[k] };
        }), r.errorType, null, 'Loại lỗi');
        body.appendChild(field('Loại lỗi', typeSel));
        body.appendChild(el('p', 'bk-small bk-muted',
            'Hệ thống không tự khẳng định nguyên nhân sai. Bạn là người quyết định phân loại.'));
        var statusSel = select([
            { value: 'new', label: C.STATUS_LABELS.new },
            { value: 'reviewing', label: C.STATUS_LABELS.reviewing },
            { value: 'needs_attention', label: C.STATUS_LABELS.needs_attention },
            { value: 'mastered', label: C.STATUS_LABELS.mastered },
            { value: 'archived', label: C.STATUS_LABELS.archived }
        ], r.status, null, 'Trạng thái ôn tập');
        body.appendChild(field('Trạng thái', statusSel));
        var note = textarea(r.note, 'Ghi chú cá nhân cho câu này…', 'Ghi chú');
        body.appendChild(field('Ghi chú', note));

        BK.ui.modal({
            title: 'Phân loại câu sai', body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost' },
                {
                    label: 'Lưu', variant: 'primary', onClick: function (close) {
                        BK.mistakes.update(r.id, {
                            errorType: typeSel.value, status: statusSel.value, note: note.value
                        });
                        close();
                        BK.ui.toast('Đã lưu phân loại', 'success');
                        hooks.rerender();
                    }
                }
            ]
        });
    }

    function removeMistake(r) {
        BK.ui.confirm({
            title: 'Xoá khỏi sổ tay câu sai',
            message: 'Xoá câu này khỏi Sổ tay câu sai? Lịch sử luyện tập gốc vẫn được giữ nguyên.',
            ok: 'Xoá', danger: true
        }).then(function (ok) {
            if (!ok) return;
            BK.mistakes.remove(r.id);
            BK.ui.toast('Đã xoá khỏi sổ tay', 'success');
            hooks.rerender();
        });
    }

    /* =====================================================================
       Tab 4 — Learning Analytics
       ================================================================== */
    function renderAnalytics(root) {
        var days = state.range;
        var sum = BK.analytics.summary(days);
        var score = BK.analytics.learningScore();

        root.appendChild(el('h3', null, 'Phân tích học tập'));
        root.appendChild(el('p', 'bk-sub',
            'Mọi con số dưới đây được tính lại từ hoạt động thật của bạn. ' +
            'Độ chính xác chỉ tính lần trả lời đầu tiên của mỗi câu trong ngày để tránh làm lại vô nghĩa.'));

        var rangeRow = el('div', 'bk-pill-row');
        rangeRow.style.marginBottom = '.7rem';
        C.ANALYTICS_RANGES.forEach(function (r) {
            var chip = el('button', 'bk-chip' + (state.range === r ? ' on' : ''), r ? r + ' ngày' : 'Tất cả');
            chip.type = 'button';
            chip.setAttribute('aria-pressed', state.range === r ? 'true' : 'false');
            chip.addEventListener('click', function () {
                state.range = r;
                BK.store.update(function (s) { s.prefs.analytics.range = r; return s.prefs.analytics; });
                hooks.rerender();
            });
            rangeRow.appendChild(chip);
        });
        root.appendChild(rangeRow);

        root.appendChild(cards([
            card('Câu đã luyện', sum.total, rangeLabel(days)),
            card('Độ chính xác', sum.total ? sum.accuracy + '%' : '—', sum.total ? sum.correct + '/' + sum.total + ' câu' : 'chưa đủ dữ liệu'),
            card('Ngày hoạt động', sum.activeDays, 'không đếm chuỗi ngày'),
            card('Bài đã mở', sum.lessons, 'bài khác nhau')
        ]));

        /* Learning Score */
        var scoreCard = el('div', 'bk-item bk-score');
        scoreCard.style.marginTop = '.8rem';
        scoreCard.appendChild(el('h4', null, 'Learning Score'));
        if (!score.sufficient) {
            scoreCard.appendChild(el('p', 'bk-small bk-muted',
                'Cần ít nhất 10 câu luyện tập để tính chỉ số này (hiện có ' + score.sample + '). ' +
                'Chỉ số không dùng thay điểm học tập chính thức.'));
        } else {
            var head = el('div', 'bk-score-head');
            head.appendChild(el('span', 'bk-score-num', String(score.score)));
            head.appendChild(el('span', 'bk-score-sub', '/100 · từ ' + score.sample + ' câu, ' + score.activeDays + ' ngày hoạt động'));
            scoreCard.appendChild(head);
            var bar = el('div', 'bk-progress bk-score-bar');
            var fill = el('span');
            fill.style.width = score.score + '%';
            bar.appendChild(fill);
            scoreCard.appendChild(bar);
            score.parts.forEach(function (p) {
                scoreCard.appendChild(meter(p.label + ' (' + p.points + '/' + p.weight + ')', p.pct, 100, p.pct + '%'));
            });
            scoreCard.appendChild(el('p', 'bk-small bk-muted',
                'Trọng số: Accuracy 40 · Consistency 20 · Progress 20 · Revision 10 · Planning 10 (bỏ qua nếu chưa có kế hoạch). ' +
                'Lặp lại cùng một câu trong ngày không làm tăng chỉ số.'));
        }
        root.appendChild(scoreCard);

        /* Biểu đồ hoạt động */
        var series = BK.analytics.series(days);
        root.appendChild(el('h4', null, 'Hoạt động theo ngày'));
        root.appendChild(bars(series.slice(-31).map(function (d) {
            return { label: d.label, value: d.total };
        }), 'Số câu luyện theo ngày'));

        root.appendChild(el('h4', null, 'Xu hướng độ chính xác'));
        var trend = [];
        for (var i = 0; i < series.length; i += Math.max(1, Math.ceil(series.length / 12))) {
            var chunk = series.slice(i, i + Math.max(1, Math.ceil(series.length / 12)));
            var t = chunk.reduce(function (a, x) { return a + x.total; }, 0);
            var c = chunk.reduce(function (a, x) { return a + x.correct; }, 0);
            trend.push({
                label: chunk[0].label,
                value: t ? Math.round((c / t) * 100) : null
            });
        }
        root.appendChild(line(trend, 'Độ chính xác theo thời gian'));

        /* Hiệu suất môn */
        root.appendChild(el('h4', null, 'Kết quả từng môn'));
        var perf = BK.analytics.subjects(days);
        if (!perf.length) root.appendChild(empty('Chưa có dữ liệu môn học.', 'fa-layer-group'));
        perf.forEach(function (m) {
            root.appendChild(meter(m.name, m.correct, m.total, m.accuracy + '% · ' + m.total + ' câu'));
        });

        /* Phân bố lỗi */
        root.appendChild(el('h4', null, 'Phân bố lỗi trong Sổ tay câu sai'));
        var dist = BK.analytics.distribution(days);
        root.appendChild(donut(Object.keys(dist).map(function (k) {
            return { label: C.ERROR_TYPES[k], value: dist[k] };
        }), 'Phân bố loại lỗi'));

        /* Tuần / tháng */
        root.appendChild(el('h4', null, 'Tiến độ 8 tuần'));
        var weeks = [];
        for (var w = 7; w >= 0; w--) {
            var start = Date.now() - (w * 7 + 6) * DAY;
            var end = Date.now() - w * 7 * DAY;
            var all = BK.store.get().practice;
            weeks.push({
                label: w === 0 ? 'Tuần này' : '-' + w + 'w',
                value: all.filter(function (p) { return p.ts >= start && p.ts <= end; }).length
            });
        }
        root.appendChild(bars(weeks, 'Số câu luyện mỗi tuần'));

        root.appendChild(el('h4', null, 'Tổng quan 6 tháng'));
        var months = [];
        for (var m = 5; m >= 0; m--) {
            var d0 = new Date();
            d0.setDate(1); d0.setHours(0, 0, 0, 0);
            var from = new Date(d0.getFullYear(), d0.getMonth() - m, 1).getTime();
            var to = new Date(d0.getFullYear(), d0.getMonth() - m + 1, 1).getTime();
            var mp = BK.store.get().practice.filter(function (p) { return p.ts >= from && p.ts < to; });
            months.push({
                label: 'T' + (new Date(from).getMonth() + 1),
                value: mp.length
            });
        }
        root.appendChild(bars(months, 'Số câu luyện theo tháng'));

        /* Điểm yếu */
        root.appendChild(el('h4', null, 'Chủ đề cần chú ý'));
        var weak = BK.analytics.weakTopics(8);
        if (!weak.length) {
            root.appendChild(el('p', 'bk-small bk-muted',
                'Chưa phát hiện chủ đề yếu. Cần tối thiểu 4 câu trên một chủ đề để kết luận.'));
        } else {
            var weakList = el('div', 'bk-list');
            weak.forEach(function (t) {
                var item = el('div', 'bk-item');
                var head = el('div', 'bk-item-head');
                head.appendChild(el('span', 'bk-item-title', t.topic));
                head.appendChild(pill(t.accuracy + '%', t.accuracy < 50 ? 'danger' : 'warn'));
                item.appendChild(head);
                item.appendChild(el('p', 'bk-small bk-muted',
                    subjectName(t.subject) + ' · ' + t.correct + '/' + t.total + ' câu đúng · ' +
                    t.mistakes + ' câu trong sổ tay'));
                var actions = el('div', 'bk-item-actions');
                actions.appendChild(ghost('Ôn câu sai của chủ đề', function () {
                    startSession('weak', t.subject);
                }, 'fa-rotate'));
                actions.appendChild(ghost('Thêm vào kế hoạch', function () {
                    BK.planner.add({
                        title: 'Luyện lại: ' + t.topic, subject: t.subject,
                        topic: t.topic, date: dayShift(0), durationMin: 20
                    });
                    BK.ui.toast('Đã thêm nhiệm vụ vào hôm nay', 'success');
                    hooks.openTab('planner');
                }, 'fa-calendar-plus'));
                item.appendChild(actions);
                weakList.appendChild(item);
            });
            root.appendChild(weakList);
        }

        /* Nhật ký hoạt động (gộp từ tab Lịch sử) */
        root.appendChild(el('h4', null, 'Nhật ký hoạt động'));
        var history = BK.store.get().history.slice().reverse().slice(0, 15);
        if (!history.length) root.appendChild(empty('Chưa có hoạt động nào được ghi nhận.', 'fa-clock-rotate-left'));
        history.forEach(function (h) {
            var row = el('div', 'bk-setting-row');
            row.appendChild(el('span', null, (h.title || '(không tiêu đề)')));
            row.appendChild(el('span', 'bk-small bk-muted', fmtTime(h.ts)));
            root.appendChild(row);
        });
        if (history.length) {
            root.appendChild(ghost('Xoá nhật ký hoạt động', function () {
                BK.ui.confirm({
                    title: 'Xoá nhật ký hoạt động',
                    message: 'Xoá nhật ký hoạt động? Ghi chú, đánh dấu, sổ tay câu sai và kế hoạch vẫn được giữ lại.',
                    ok: 'Xoá nhật ký', danger: true
                }).then(function (ok) {
                    if (!ok) return;
                    BK.store.update(function (s) { s.history = []; return s; });
                    hooks.rerender();
                });
            }, 'fa-trash'));
        }
    }

    /* =====================================================================
       Tab 5 — Smart Study Planner
       ================================================================== */
    function renderPlanner(root) {
        var groups = BK.planner.list({ groups: true, subject: state.plannerSubject });

        root.appendChild(el('h3', null, 'Kế hoạch học tập'));
        root.appendChild(el('p', 'bk-sub',
            'Kế hoạch do bạn tạo. Gợi ý thông minh chỉ được đề xuất — không tự thêm vào lịch và ' +
            'không tạo lời nhắc gây áp lực. Thời lượng là ước lượng, không phải bộ đếm giờ.'));

        var controls = el('div', 'bk-row');
        controls.style.marginBottom = '.7rem';
        controls.appendChild(btn('Thêm nhiệm vụ', 'bk-btn', function () { editPlan(null); }, 'fa-plus'));
        controls.appendChild(ghost('Hôm nay', function () { state.plannerView = 'day'; hooks.rerender(); }, 'fa-sun'));
        controls.appendChild(ghost('Tuần', function () { state.plannerView = 'week'; hooks.rerender(); }, 'fa-calendar-week'));
        controls.appendChild(ghost('Tháng', function () { state.plannerView = 'month'; hooks.rerender(); }, 'fa-calendar'));
        var sel = select(subjectOptions(true), state.plannerSubject, function (v) {
            state.plannerSubject = v; hooks.rerender();
        }, 'Lọc môn học');
        sel.style.maxWidth = '9rem';
        controls.appendChild(sel);
        root.appendChild(controls);

        root.appendChild(cards([
            card('Hôm nay', groups.today.length, 'nhiệm vụ đang chờ'),
            card('Quá hạn', groups.overdue.length, groups.overdue.length ? 'cần sắp xếp lại' : 'không có'),
            card('Sắp tới', groups.upcoming.length, 'nhiệm vụ đã lên lịch'),
            card('Đã xong', groups.done.length, 'trong tổng ' + groups.all.length)
        ]));

        /* Lịch */
        var calCard = el('div', 'bk-item');
        calCard.style.marginTop = '.8rem';
        if (state.plannerView === 'month') {
            calCard.appendChild(monthGrid(groups.all));
        } else if (state.plannerView === 'week') {
            calCard.appendChild(weekGrid(groups.all));
        } else {
            calCard.appendChild(el('h4', null, 'Hôm nay · ' + dayLabel(dayShift(0))));
            var todayList = groups.all.filter(function (p) { return p.date === dayShift(0); });
            if (!todayList.length) calCard.appendChild(el('p', 'bk-small bk-muted', 'Chưa có nhiệm vụ nào cho hôm nay.'));
            todayList.forEach(function (p) { calCard.appendChild(planRow(p)); });
        }
        root.appendChild(calCard);

        /* Gợi ý */
        var sugg = BK.planner.suggestions(4).filter(function (x) { return !state.suggestionsDismissed[x.title]; });
        if (sugg.length) {
            root.appendChild(el('h4', null, 'Gợi ý cho bạn'));
            var sg = el('div', 'bk-list');
            sugg.forEach(function (x) {
                var item = el('div', 'bk-item bk-suggestion');
                var head = el('div', 'bk-item-head');
                head.appendChild(el('span', 'bk-item-title', x.title));
                head.appendChild(pill('Gợi ý'));
                item.appendChild(head);
                item.appendChild(el('p', 'bk-small bk-muted', x.reason));
                var actions = el('div', 'bk-item-actions');
                actions.appendChild(ghost('Nhận', function () {
                    BK.planner.add({
                        title: x.title, subject: x.subject, date: x.date,
                        durationMin: x.durationMin, source: 'suggestion'
                    });
                    BK.ui.toast('Đã thêm vào kế hoạch hôm nay', 'success');
                    hooks.rerender();
                }, 'fa-check'));
                actions.appendChild(ghost('Chỉnh sửa', function () {
                    editPlan({
                        title: x.title, subject: x.subject, date: x.date,
                        durationMin: x.durationMin, source: 'suggestion'
                    }, x);
                }, 'fa-pen'));
                actions.appendChild(ghost('Bỏ qua', function () {
                    state.suggestionsDismissed[x.title] = true;
                    hooks.rerender();
                }, 'fa-xmark'));
                item.appendChild(actions);
                sg.appendChild(item);
            });
            root.appendChild(sg);
        }

        /* Danh sách theo nhóm */
        [
            ['Quá hạn', groups.overdue, 'fa-triangle-exclamation'],
            ['Hôm nay', groups.today.filter(function (p) { return p.date === dayShift(0); }), 'fa-sun'],
            ['Sắp tới', groups.upcoming.slice(0, 20), 'fa-calendar-days'],
            ['Đã xong', groups.done.slice(-10).reverse(), 'fa-check']
        ].forEach(function (g) {
            if (!g[1].length) return;
            root.appendChild(el('h4', null, g[0] + ' (' + g[1].length + ')'));
            var list = el('div', 'bk-list');
            g[1].forEach(function (p) { list.appendChild(planRow(p)); });
            root.appendChild(list);
        });
    }

    function planRow(p) {
        var row = el('div', 'bk-item bk-plan-row bk-plan-' + p.status);
        var head = el('div', 'bk-item-head');
        var w = el('div');
        w.style.minWidth = '0';
        var t = el('p', 'bk-item-title');
        t.textContent = p.title;
        w.appendChild(t);
        var meta = el('div', 'bk-item-meta');
        meta.appendChild(pill(dayLabel(p.date)));
        if (p.subject) meta.appendChild(pill(subjectName(p.subject)));
        meta.appendChild(pill(p.durationMin + ' phút ước lượng'));
        meta.appendChild(pill(p.status === 'done' ? 'Đã xong' : p.status === 'postponed' ? 'Tạm hoãn' : 'Đang chờ'));
        if (p.source === 'suggestion') meta.appendChild(pill('Từ gợi ý'));
        if (!p.subject) w.appendChild(meta); else w.appendChild(meta);
        head.appendChild(w);
        row.appendChild(head);
        if (p.notes) row.appendChild(el('p', 'bk-small bk-muted', p.notes));

        var actions = el('div', 'bk-item-actions');
        if (p.status !== 'done') {
            actions.appendChild(ghost('Hoàn thành', function () {
                BK.planner.update(p.id, { status: 'done' });
                BK.ui.toast('Đã hoàn thành nhiệm vụ', 'success');
                hooks.rerender();
            }, 'fa-check'));
            actions.appendChild(ghost('Hoãn sang mai', function () {
                BK.planner.update(p.id, { date: dayShift(1), status: 'planned' });
                hooks.rerender();
            }, 'fa-clock'));
        } else {
            actions.appendChild(ghost('Mở lại', function () {
                BK.planner.update(p.id, { status: 'planned' });
                hooks.rerender();
            }, 'fa-rotate-left'));
        }
        actions.appendChild(ghost('Sửa', function () { editPlan(p); }, 'fa-pen'));
        actions.appendChild(ghost('Xoá', function () {
            BK.ui.confirm({
                title: 'Xoá nhiệm vụ', message: 'Xoá nhiệm vụ “' + p.title + '”?',
                ok: 'Xoá', danger: true
            }).then(function (ok) {
                if (ok) { BK.planner.remove(p.id); hooks.rerender(); }
            });
        }, 'fa-trash'));
        row.appendChild(actions);
        return row;
    }

    function weekGrid(plans) {
        var wrap = el('div');
        wrap.appendChild(el('h4', null, 'Tuần này'));
        var grid = el('div', 'bk-cal bk-cal-week');
        var wd = isoWeekday(dayShift(0));
        var monday = dayShift(1 - wd);
        for (var i = 0; i < 7; i++) {
            var key = dayKeyAdd(monday, i);
            var col = el('div', 'bk-cal-col' + (key === dayShift(0) ? ' is-today' : ''));
            col.appendChild(el('div', 'bk-cal-head', dayLabel(key)));
            plans.filter(function (p) { return p.date === key; }).forEach(function (p) {
                var chip = el('div', 'bk-cal-item bk-cal-' + p.status, p.title);
                chip.title = p.title;
                col.appendChild(chip);
            });
            grid.appendChild(col);
        }
        wrap.appendChild(grid);
        return wrap;
    }

    function monthGrid(plans) {
        var wrap = el('div');
        wrap.appendChild(el('h4', null, 'Tháng này'));
        var grid = el('div', 'bk-cal bk-cal-month');
        var today = BK.util.todayKey();
        var tp = today.split('-');
        var year = Number(tp[0]);
        var month = Number(tp[1]) - 1;
        var firstKey = year + '-' + String(month + 1).padStart(2, '0') + '-01';
        var daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        var lead = isoWeekday(firstKey) - 1;
        for (var i = 0; i < lead; i++) {
            var blank = el('div', 'bk-cal-day is-blank');
            grid.appendChild(blank);
        }
        for (var d = 1; d <= daysInMonth; d++) {
            var key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            var cell = el('div', 'bk-cal-day' + (key === today ? ' is-today' : ''));
            cell.appendChild(el('div', 'bk-cal-num', String(d)));
            var count = plans.filter(function (p) { return p.date === key && p.status === 'planned'; }).length;
            if (count) cell.appendChild(el('div', 'bk-cal-dot', count + ' việc'));
            grid.appendChild(cell);
        }
        wrap.appendChild(grid);
        return wrap;
    }

    function dayKeyAdd(key, n) { return BK.util.keyAdd(key, n); }

    function editPlan(plan, suggestion) {
        var isNew = !plan;
        var body = el('div');
        var title = input(plan ? plan.title : (suggestion ? suggestion.title : ''), 'Ví dụ: Ôn chương 2 Vật lý', null, 'Tên nhiệm vụ');
        body.appendChild(field('Nhiệm vụ', title));
        var subject = select(subjectOptions(false), plan ? plan.subject : (suggestion ? suggestion.subject : ''), null, 'Môn học');
        var date = input(plan ? plan.date : (suggestion ? suggestion.date : dayShift(0)), '', null, 'Ngày', 'date');
        var row = el('div', 'bk-row');
        var f1 = field('Môn học', subject); f1.style.flex = '1';
        var f2 = field('Ngày', date); f2.style.flex = '1';
        row.appendChild(f1); row.appendChild(f2);
        body.appendChild(row);
        var duration = input(String(plan ? plan.durationMin : (suggestion ? suggestion.durationMin : 20)), '', null, 'Thời lượng ước lượng', 'number');
        body.appendChild(field('Thời lượng ước lượng (phút)', duration));
        var notes = textarea(plan ? plan.notes : '', 'Ghi chú cho nhiệm vụ…', 'Ghi chú');
        body.appendChild(field('Ghi chú', notes));
        body.appendChild(el('p', 'bk-small bk-muted', 'Đây là ước lượng để bạn tự sắp xếp. Bá Khí không đếm ngược và không chấm thời gian.'));

        BK.ui.modal({
            title: isNew ? 'Nhiệm vụ mới' : 'Sửa nhiệm vụ', body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost' },
                {
                    label: isNew ? 'Thêm' : 'Lưu', variant: 'primary', onClick: function (close) {
                        var payload = {
                            title: title.value.trim() || 'Nhiệm vụ học tập',
                            subject: subject.value, date: date.value || dayShift(0),
                            durationMin: Number(duration.value) || 20,
                            notes: notes.value,
                            source: plan ? plan.source : (suggestion ? 'suggestion' : 'user')
                        };
                        if (isNew) BK.planner.add(payload);
                        else BK.planner.update(plan.id, payload);
                        close();
                        BK.ui.toast(isNew ? 'Đã thêm nhiệm vụ' : 'Đã lưu nhiệm vụ', 'success');
                        hooks.rerender();
                    }
                }
            ]
        });
    }

    /* =====================================================================
       Tab 6 — Revision Center
       ================================================================== */
    function renderRevision(root) {
        if (state.session) return renderSession(root);

        var due = BK.revision.queue('due');
        var upcoming = BK.revision.queue('upcoming');
        var overdue = BK.revision.queue('overdue');
        var weak = BK.revision.queue('weak');
        var recent = BK.revision.queue('recent', { limit: 12 });

        root.appendChild(el('h3', null, 'Trung tâm ôn tập'));
        root.appendChild(el('p', 'bk-sub',
            'Ôn tập theo lịch tính từ chính kết quả của bạn. Một câu chỉ được coi là thành thạo ' +
            'khi bạn đúng liên tiếp và khoảng cách ôn đủ dài. Phiên ôn không sửa kết quả bài làm gốc.'));

        root.appendChild(cards([
            card('Đến hạn hôm nay', due.length, due.length ? 'sẵn sàng ôn' : 'không có gì'),
            card('Quá hạn', overdue.length, overdue.length ? 'nên ôn sớm' : 'không có'),
            card('Sắp tới', upcoming.length, upcoming.length ? 'ngày ' + fmtDate(upcoming[0].nextReview) : 'trống'),
            card('Chủ đề yếu', weak.length, 'câu sai ở chủ đề yếu')
        ]));

        var controls = el('div', 'bk-row');
        controls.style.margin = '.7rem 0';
        var scopes = [
            { v: 'due', label: 'Đến hạn' }, { v: 'overdue', label: 'Quá hạn' },
            { v: 'weak', label: 'Chủ đề yếu' }, { v: 'recent', label: 'Mới sai gần đây' }
        ];
        scopes.forEach(function (s) {
            var chip = el('button', 'bk-chip' + (state.revisionScope === s.v ? ' on' : ''), s.label);
            chip.type = 'button';
            chip.addEventListener('click', function () { state.revisionScope = s.v; hooks.rerender(); });
            controls.appendChild(chip);
        });
        root.appendChild(controls);

        var queue = BK.revision.queue(state.revisionScope, { limit: 40 });
        if (!queue.length) {
            root.appendChild(empty('Không có câu nào trong hàng đợi này. Hãy luyện thêm hoặc quay lại sau.', 'fa-circle-check'));
        } else {
            root.appendChild(btn('Bắt đầu ôn ' + queue.length + ' câu', 'bk-btn', function () {
                startSession(state.revisionScope);
            }, 'fa-play'));
            root.appendChild(el('h4', null, 'Trong hàng đợi'));
            var list = el('div', 'bk-list');
            queue.slice(0, 12).forEach(function (r) {
                var row = el('div', 'bk-item bk-queue-row');
                var head = el('div', 'bk-item-head');
                var w = el('div');
                w.style.minWidth = '0';
                w.appendChild(el('p', 'bk-item-title', subjectName(r.subject) + (r.topic ? ' · ' + r.topic : '')));
                var meta = el('div', 'bk-item-meta');
                meta.appendChild(statusPill(r));
                meta.appendChild(pill('Sai ' + r.wrong + ' lần', 'danger'));
                meta.appendChild(pill(r.nextReview <= Date.now() ? 'Đến hạn' : 'Từ ' + fmtDate(r.nextReview)));
                w.appendChild(meta);
                head.appendChild(w);
                row.appendChild(head);
                var q = el('p', 'bk-small bk-muted');
                q.textContent = r.question.slice(0, 160);
                row.appendChild(q);
                list.appendChild(row);
            });
            root.appendChild(list);
        }

        var sessions = BK.revision.sessions().slice(0, 5);
        if (sessions.length) {
            root.appendChild(el('h4', null, 'Phiên ôn gần đây'));
            sessions.forEach(function (x) {
                var done = x.items.filter(function (i) { return i.correct; }).length;
                var row = el('div', 'bk-setting-row');
                row.appendChild(el('span', null, 'Phiên ' + x.scope + ' · ' + done + '/' + x.items.length + ' đúng'));
                row.appendChild(el('span', 'bk-small bk-muted', fmtTime(x.startedAt)));
                root.appendChild(row);
            });
        }
    }

    function startSession(scope, subject, keys) {
        var session = null;
        if (scope === 'single' && keys && keys.length) {
            session = BK.revision.start('single', keys);
        } else {
            var queue = BK.revision.queue(scope === 'single' ? 'due' : scope, { subject: subject || '' });
            if (!queue.length) {
                BK.ui.toast('Không có câu nào đến hạn ôn', 'info');
                return;
            }
            session = BK.revision.start(scope || 'due', queue.map(function (r) { return r.key; }));
        }
        if (!session) {
            BK.ui.toast('Không có câu nào để ôn', 'info');
            return;
        }
        state.session = {
            id: session.id, keys: session.items.map(function (i) { return i.key; }),
            index: 0, answered: false, lastCorrect: null, total: session.items.length, correct: 0
        };
        hooks.openTab('revision');
        hooks.rerender();
    }

    function renderSession(root) {
        var st = state.session;
        var key = st.keys[st.index];
        var item = null;
        BK.store.get().review.forEach(function (r) { if (r.key === key) item = r; });

        root.appendChild(el('h3', null, 'Phiên ôn tập'));
        if (!item) {
            root.appendChild(empty('Câu hỏi không còn trong sổ tay.', 'fa-circle-question'));
            root.appendChild(ghost('Kết thúc phiên', function () { finishSession(); }, 'fa-flag-checkered'));
            return;
        }

        var progress = el('div', 'bk-progress bk-session-bar');
        var fill = el('span');
        fill.style.width = Math.round(((st.index) / Math.max(1, st.total)) * 100) + '%';
        progress.appendChild(fill);
        root.appendChild(progress);
        root.appendChild(el('p', 'bk-small bk-muted',
            'Câu ' + (st.index + 1) + '/' + st.total + ' · ' + subjectName(item.subject) +
            (item.topic ? ' · ' + item.topic : '')));

        var card = el('div', 'bk-item bk-active');
        var q = el('p', 'bk-qtext');
        q.textContent = item.question;
        card.appendChild(q);

        var opts = Array.isArray(item.options) ? item.options : [];
        var hasOptions = opts.length > 0 && item.answer != null;

        if (hasOptions && !st.answered) {
            var box = el('div', 'bk-opts');
            opts.forEach(function (opt, i) {
                var b = el('button', 'bk-opt');
                b.type = 'button';
                b.appendChild(el('b', null, String.fromCharCode(65 + i) + '.'));
                b.appendChild(el('span', null, opt));
                b.addEventListener('click', function () { grade(item, isCorrectOption(item, i), box, i); });
                box.appendChild(b);
            });
            card.appendChild(box);
        }

        if (!hasOptions && !st.answered) {
            card.appendChild(el('p', 'bk-small bk-muted', 'Câu này không có phương án lưu sẵn. Tự nhớ lại rồi chọn mức độ:'));
            var recall = el('div', 'bk-item-actions');
            recall.appendChild(ghost('Nhớ tốt', function () { grade(item, true, null, null); }, 'fa-check'));
            recall.appendChild(ghost('Chưa nhớ', function () { grade(item, false, null, null); }, 'fa-rotate-left'));
            card.appendChild(recall);
        }

        if (st.answered) {
            var result = el('p', 'bk-small ' + (st.lastCorrect ? 'bk-ok-text' : 'bk-danger-text'));
            result.textContent = st.lastCorrect ? '✓ Chính xác' : '✗ Chưa đúng — câu này sẽ quay lại sớm hơn.';
            card.appendChild(result);
            if (item.explanation) {
                var exp = el('div', 'bk-explain-open');
                exp.appendChild(el('b', null, 'Giải thích: '));
                exp.appendChild(el('span', null, item.explanation));
                card.appendChild(exp);
            }
            var answers = el('div', 'bk-answer-grid');
            var rightRow = el('div', 'bk-answer bk-answer-right');
            rightRow.appendChild(el('b', null, 'Đáp án đúng: '));
            rightRow.appendChild(el('span', null, answerText(item, item.answer)));
            answers.appendChild(rightRow);
            card.appendChild(answers);
        }
        root.appendChild(card);

        var actions = el('div', 'bk-item-actions');
        if (st.answered) {
            actions.appendChild(btn(st.index + 1 >= st.total ? 'Xem kết quả' : 'Câu tiếp theo', 'bk-btn', function () {
                st.index++;
                st.answered = false;
                st.lastCorrect = null;
                if (st.index >= st.total) finishSession();
                else hooks.rerender();
            }, 'fa-arrow-right'));
        }
        actions.appendChild(ghost('Kết thúc phiên', function () { finishSession(); }, 'fa-flag-checkered'));
        root.appendChild(actions);
    }

    function isCorrectOption(item, choice) {
        var answer = item.answer;
        if (typeof answer === 'number') return choice === answer;
        if (item.options && item.options[answer] != null) return String(item.options[choice]).trim() === String(item.options[answer]).trim();
        return String(item.options[choice]).trim() === String(answer).trim();
    }

    function grade(item, correct, box, index) {
        var st = state.session;
        if (!st) return;
        if (box) {
            Array.prototype.forEach.call(box.querySelectorAll('.bk-opt'), function (b, i) {
                b.disabled = true;
                if (isCorrectOption(item, i)) b.classList.add('is-right');
            });
            if (!correct && box.querySelectorAll('.bk-opt')[index]) {
                box.querySelectorAll('.bk-opt')[index].classList.add('is-wrong');
            }
        }
        BK.revision.answer(st.id, item.key, correct);
        st.answered = true;
        st.lastCorrect = correct;
        if (correct) st.correct++;
        BK.ui.toast(correct ? 'Chính xác! Lịch ôn đã được cập nhật.' : 'Chưa đúng — sẽ ôn lại sớm.', correct ? 'success' : 'error');
        setTimeout(hooks.rerender, 400);
    }

    function finishSession() {
        var st = state.session;
        if (!st) return;
        var res = BK.revision.end(st.id);
        /* 8.3.0: chỉ ghi khi phiên ôn thật sự có câu trả lời. */
        try {
            if (BK.gamification && res && res.total > 0) {
                BK.gamification.track('revision_session', st.id, { dayScoped: false });
            }
        } catch (e) { }
        state.session = null;
        hooks.rerender();
        var body = el('div');
        var total = res ? res.total : st.total;
        var correct = res ? res.correct : st.correct;
        body.appendChild(el('p', null,
            'Bạn đã ôn ' + total + ' câu, đúng ' + correct + ' câu (' +
            (total ? Math.round((correct / total) * 100) : 0) + '%).'));
        body.appendChild(el('p', 'bk-small bk-muted',
            'Lịch ôn của từng câu đã được cập nhật. Kết quả bài làm gốc không bị thay đổi.'));
        BK.ui.modal({
            title: 'Kết thúc phiên ôn',
            body: body,
            actions: [{ label: 'Đóng', variant: 'primary', onClick: function (c) { c(); } }]
        });
    }

    /* =====================================================================
       Tab 7 — Learning Goals
       ================================================================== */
    function renderGoals(root) {
        var items = BK.goals.items();

        root.appendChild(el('h3', null, 'Mục tiêu học tập'));
        root.appendChild(el('p', 'bk-sub',
            'Mục tiêu được đo bằng chính hoạt động của bạn, không bằng điểm số hay thời gian. ' +
            'Bạn có thể đổi hoặc bỏ mục tiêu bất cứ lúc nào.'));

        var controls = el('div', 'bk-row');
        controls.style.marginBottom = '.7rem';
        controls.appendChild(btn('Mục tiêu mới', 'bk-btn', function () { editGoal(null); }, 'fa-plus'));
        root.appendChild(controls);

        var active = items.filter(function (i) { return i.goal.status === 'active'; });
        var done = items.filter(function (i) { return i.goal.status !== 'active'; });

        root.appendChild(cards([
            card('Đang theo đuổi', active.length, 'mục tiêu đang hoạt động'),
            card('Đã đạt', done.filter(function (i) { return i.goal.status === 'done'; }).length, 'mục tiêu hoàn thành'),
            card('Quá hạn', items.filter(function (i) { return i.overdue; }).length, 'cần điều chỉnh')
        ]));

        if (!items.length) {
            root.appendChild(empty('Chưa có mục tiêu nào. Tạo mục tiêu đầu tiên để theo dõi tiến độ của bạn.', 'fa-bullseye'));
            return;
        }

        [['Đang hoạt động', active], ['Đã kết thúc', done]].forEach(function (group) {
            if (!group[1].length) return;
            root.appendChild(el('h4', null, group[0]));
            var list = el('div', 'bk-list');
            group[1].forEach(function (g) {
                var item = el('div', 'bk-item');
                var head = el('div', 'bk-item-head');
                head.appendChild(el('span', 'bk-item-title', g.goal.title));
                head.appendChild(pill(g.goal.status === 'done' ? 'Đã đạt' : g.overdue ? 'Quá hạn' : 'Đang chạy',
                    g.goal.status === 'done' ? 'ok' : g.overdue ? 'danger' : 'warn'));
                item.appendChild(head);
                item.appendChild(el('p', 'bk-small bk-muted',
                    (g.goal.subject ? subjectName(g.goal.subject) + ' · ' : '') +
                    C.GOAL_METRICS[g.goal.metric] + ' · mục tiêu ' + g.target +
                    (g.goal.deadline ? ' · hạn ' + dayLabel(g.goal.deadline) : '')));
                item.appendChild(meter('Tiến độ', g.current, g.target, g.current + '/' + g.target + ' (' + g.pct + '%)'));
                var actions = el('div', 'bk-item-actions');
                if (g.goal.status === 'active') {
                    actions.appendChild(ghost('Đánh dấu đạt', function () {
                        BK.goals.update(g.goal.id, { status: 'done' });
                        try {
                            if (BK.gamification) BK.gamification.track('goal_completed', g.goal.id, { dayScoped: false });
                        } catch (e) { }
                        BK.ui.toast('Chúc mừng! Đã đánh dấu hoàn thành mục tiêu.', 'success');
                        hooks.rerender();
                    }, 'fa-check'));
                } else {
                    actions.appendChild(ghost('Kích hoạt lại', function () {
                        BK.goals.update(g.goal.id, { status: 'active' });
                        hooks.rerender();
                    }, 'fa-rotate-left'));
                }
                actions.appendChild(ghost('Sửa', function () { editGoal(g.goal); }, 'fa-pen'));
                actions.appendChild(ghost('Xoá', function () {
                    BK.ui.confirm({ title: 'Xoá mục tiêu', message: 'Xoá mục tiêu “' + g.goal.title + '”?', ok: 'Xoá', danger: true })
                        .then(function (ok) { if (ok) { BK.goals.remove(g.goal.id); hooks.rerender(); } });
                }, 'fa-trash'));
                item.appendChild(actions);
                list.appendChild(item);
            });
            root.appendChild(list);
        });
    }

    function editGoal(goal) {
        var isNew = !goal;
        var body = el('div');
        var title = input(goal ? goal.title : '', 'Ví dụ: Luyện 50 câu Hóa trong tháng này', null, 'Tên mục tiêu');
        body.appendChild(field('Mục tiêu', title));
        var subject = select(subjectOptions(true), goal ? goal.subject : '', null, 'Môn học');
        body.appendChild(field('Môn học', subject));
        var metric = select(Object.keys(C.GOAL_METRICS).map(function (k) {
            return { value: k, label: C.GOAL_METRICS[k] };
        }), goal ? goal.metric : 'questions', null, 'Cách đo');
        body.appendChild(field('Đo bằng', metric));
        var target = input(String(goal ? goal.target : 50), '', null, 'Số lượng mục tiêu', 'number');
        var deadline = input(goal ? goal.deadline : '', '', null, 'Hạn hoàn thành', 'date');
        var row = el('div', 'bk-row');
        var f1 = field('Số lượng', target); f1.style.flex = '1';
        var f2 = field('Hạn (tuỳ chọn)', deadline); f2.style.flex = '1';
        row.appendChild(f1); row.appendChild(f2);
        body.appendChild(row);
        body.appendChild(el('p', 'bk-small bk-muted',
            'Tiến độ được tính lại từ hoạt động thật kể từ khi tạo mục tiêu. Không có mục tiêu nào tự cộng điểm.'));

        BK.ui.modal({
            title: isNew ? 'Mục tiêu mới' : 'Sửa mục tiêu', body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost' },
                {
                    label: isNew ? 'Tạo' : 'Lưu', variant: 'primary', onClick: function (close) {
                        if (isNew) {
                            BK.goals.add({
                                title: title.value.trim() || 'Mục tiêu học tập',
                                subject: subject.value, metric: metric.value,
                                target: Number(target.value) || 10, deadline: deadline.value
                            });
                        } else {
                            BK.goals.update(goal.id, {
                                title: title.value.trim(), subject: subject.value,
                                target: Number(target.value) || goal.target, deadline: deadline.value
                            });
                        }
                        close();
                        BK.ui.toast(isNew ? 'Đã tạo mục tiêu' : 'Đã lưu mục tiêu', 'success');
                        hooks.rerender();
                    }
                }
            ]
        });
    }

    /* ----------------------------- công khai ----------------------------- */
    global.BKLearning = {
        tabs: {
            subjects: { label: 'Môn học', icon: 'fa-layer-group', render: renderSubjects },
            mistakes: { label: 'Sổ tay câu sai', icon: 'fa-book-skull', render: renderMistakes },
            analytics: { label: 'Phân tích', icon: 'fa-chart-line', render: renderAnalytics },
            planner: { label: 'Kế hoạch', icon: 'fa-calendar-days', render: renderPlanner },
            revision: { label: 'Ôn tập', icon: 'fa-rotate', render: renderRevision },
            goals: { label: 'Mục tiêu', icon: 'fa-bullseye', render: renderGoals }
        },
        setHooks: function (h) { hooks = h || hooks; },
        startSession: startSession,
        state: state,
        resetSession: function () { state.session = null; }
    };
})(typeof window !== 'undefined' ? window : this);
