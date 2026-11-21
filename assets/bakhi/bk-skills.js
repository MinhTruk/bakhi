/* =========================================================================
   Bá Khí — bk-skills.js (8.3.8)
   Trang Cây kỹ năng độc lập (/skills/): sơ đồ phân nhánh trực quan, kéo để
   di chuyển, zoom, căn giữa, tìm kiếm, lọc nhánh và bảng chi tiết node.

   Dữ liệu đến từ gamification-api (action "state") — cùng nguồn sự thật với
   trang Tiến trình. Không tự tính điều kiện mở khoá ở client: mọi trạng thái
   (locked / available / in_progress / completed) do hàm bk_gam_evaluate của
   Postgres quyết định, kèm danh sách điều kiện còn thiếu.
   ========================================================================= */
(function (global) {
    'use strict';

    if (global.BKSkills) return;

    var D = global.document;
    if (!D) return;

    var NODE_W = 190;
    var NODE_H = 86;
    var PAD = 60;
    var MIN_SCALE = 0.35;
    var MAX_SCALE = 2.2;
    var SEEN_KEY = 'bakhiSkillsSeen.v1';

    var STATUS_LABELS = {
        locked: 'Chưa đủ điều kiện',
        available: 'Có thể mở',
        in_progress: 'Đang thực hiện',
        completed: 'Hoàn thành'
    };
    var METRIC_LABELS = {
        quiz_completed: 'Bài quiz đã hoàn thành',
        lesson_study: 'Lượt bài học đã học',
        listening_completed: 'Bài luyện nghe',
        revision_session: 'Phiên ôn tập',
        mistake_mastered: 'Câu sai đã xử lý',
        goal_completed: 'Mục tiêu hoàn thành',
        xp_total: 'Tổng XP',
        level: 'Cấp độ',
        boss_passed: 'Boss đã vượt',
        boss_attempts: 'Lượt thử Boss',
        skill_nodes_completed: 'Node kỹ năng hoàn thành',
        achievements_unlocked: 'Thành tựu đã mở',
        missions_completed: 'Nhiệm vụ đã hoàn thành',
        distinct_active_days: 'Ngày có học',
        streak_days: 'Chuỗi ngày liên tiếp',
        inventory_count: 'Vật phẩm sở hữu'
    };
    var RARITY_LABELS = {
        common: 'Phổ biến', uncommon: 'Ít gặp', rare: 'Hiếm',
        epic: 'Cực hiếm', legendary: 'Huyền thoại'
    };

    var S = {
        host: null,
        state: null,
        details: null,
        status: 'idle',
        error: '',
        loaded: false,
        scale: 1,
        tx: 0,
        ty: 0,
        dragging: false,
        dragStart: null,
        selected: null,
        branch: 'all',
        query: ''
    };

    function el(tag, cls, text) {
        var node = D.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }
    function icon(name, cls) {
        var i = el('i', 'fa-solid ' + (name || 'fa-circle') + (cls ? ' ' + cls : ''));
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function num(v, d) {
        var n = Number(v);
        return isFinite(n) ? n : d;
    }
    function studentId() {
        try {
            var raw = global.localStorage.getItem('bakhiStudent.v1');
            var obj = raw ? JSON.parse(raw) : null;
            if (obj && obj.id) return String(obj.id);
        } catch (e) { }
        var c = global.BKCloud;
        if (c && typeof c.identity === 'function') {
            var ident = c.identity();
            if (ident && ident.id) return String(ident.id);
        }
        return '';
    }
    function readSeen() {
        try {
            var raw = global.localStorage.getItem(SEEN_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function writeSeen(map) {
        try { global.localStorage.setItem(SEEN_KEY, JSON.stringify(map)); } catch (e) { }
    }

    function callState() {
        var c = global.BKCloud;
        if (!c || typeof c.gamificationApi !== 'function') {
            return Promise.reject(new Error('Chưa tải được lớp kết nối Supabase. Hãy tải lại trang.'));
        }
        return c.gamificationApi({ action: 'state' }).then(function (res) {
            if (!res || !res.state) {
                var err = new Error('Máy chủ trả dữ liệu cây kỹ năng không đúng cấu trúc.');
                err.code = 'BAD_PAYLOAD';
                throw err;
            }
            return res;
        });
    }

    function load() {
        if (!studentId()) {
            S.status = 'no_session';
            paint();
            return;
        }
        S.status = S.state ? 'ready' : 'loading';
        paint();
        callState().then(function (res) {
            S.state = res.state;
            S.status = 'ready';
            S.error = '';
            S.loaded = true;
            paint();
            selectDefault();
        }).catch(function (err) {
            S.status = S.state ? 'ready' : 'error';
            S.error = String((err && err.message) || 'Không tải được cây kỹ năng.');
            paint();
        });
    }

    /* ------------------------------------------------------------------ DOM */
    function shell() {
        var host = S.host;
        host.textContent = '';

        if (S.status === 'no_session') {
            var gate = el('div', 'bks-gate');
            gate.appendChild(icon('fa-user-lock', 'bks-gate-icon'));
            gate.appendChild(el('h2', null, 'Chưa nhận diện học sinh'));
            gate.appendChild(el('p', 'bks-muted',
                'Cây kỹ năng gắn với tiến trình học tập trên máy chủ. Hãy nhận diện ở trang chủ rồi quay lại.'));
            var home = el('a', 'bks-btn is-primary', 'Về trang chủ');
            home.href = '../';
            gate.appendChild(home);
            host.appendChild(gate);
            return false;
        }

        if (S.status === 'loading' && !S.state) {
            var loading = el('div', 'bks-gate');
            loading.appendChild(el('div', 'bks-spinner'));
            loading.appendChild(el('p', 'bks-muted', 'Đang tải cây kỹ năng…'));
            host.appendChild(loading);
            return false;
        }

        if (S.status === 'error' && !S.state) {
            var box = el('div', 'bks-gate');
            box.appendChild(icon('fa-triangle-exclamation', 'bks-gate-icon is-error'));
            box.appendChild(el('h2', null, 'Không tải được cây kỹ năng'));
            box.appendChild(el('p', 'bks-muted', S.error));
            var retry = el('button', 'bks-btn is-primary', 'Thử lại');
            retry.type = 'button';
            retry.addEventListener('click', function () { load(); });
            box.appendChild(retry);
            host.appendChild(box);
            return false;
        }

        var st = S.state;
        var wrap = el('div', 'bks-wrap');

        /* Thanh công cụ */
        var bar = el('div', 'bks-toolbar');
        var searchWrap = el('label', 'bks-search');
        searchWrap.appendChild(icon('fa-magnifying-glass'));
        var search = el('input', 'bks-input');
        search.type = 'search';
        search.placeholder = 'Tìm kỹ năng…';
        search.value = S.query;
        search.setAttribute('aria-label', 'Tìm kỹ năng theo tên');
        search.addEventListener('input', function () {
            S.query = String(search.value || '');
            paintCanvas();
        });
        searchWrap.appendChild(search);
        bar.appendChild(searchWrap);

        var branchSel = el('select', 'bks-select');
        branchSel.setAttribute('aria-label', 'Lọc theo nhánh kỹ năng');
        var all = el('option', null, 'Tất cả nhánh');
        all.value = 'all';
        branchSel.appendChild(all);
        (branches(st)).forEach(function (b) {
            var o = el('option', null, b.name);
            o.value = b.id;
            branchSel.appendChild(o);
        });
        branchSel.value = S.branch;
        branchSel.addEventListener('change', function () {
            S.branch = branchSel.value;
            paintCanvas();
            resetView();
        });
        bar.appendChild(branchSel);

        var zoomOut = el('button', 'bks-icon-btn', null);
        zoomOut.type = 'button';
        zoomOut.setAttribute('aria-label', 'Thu nhỏ');
        zoomOut.appendChild(icon('fa-magnifying-glass-minus'));
        zoomOut.addEventListener('click', function () { zoomBy(0.85); });
        bar.appendChild(zoomOut);

        var zoomIn = el('button', 'bks-icon-btn', null);
        zoomIn.type = 'button';
        zoomIn.setAttribute('aria-label', 'Phóng to');
        zoomIn.appendChild(icon('fa-magnifying-glass-plus'));
        zoomIn.addEventListener('click', function () { zoomBy(1.18); });
        bar.appendChild(zoomIn);

        var reset = el('button', 'bks-btn', null);
        reset.type = 'button';
        reset.appendChild(icon('fa-crosshairs'));
        reset.appendChild(el('span', null, 'Về giữa'));
        reset.addEventListener('click', resetView);
        bar.appendChild(reset);
        wrap.appendChild(bar);

        /* Sân khấu */
        var stage = el('div', 'bks-stage');
        stage.setAttribute('tabindex', '0');
        stage.setAttribute('role', 'application');
        stage.setAttribute('aria-label', 'Sơ đồ cây kỹ năng. Kéo để di chuyển, dùng nút phóng to thu nhỏ để đổi tỉ lệ.');
        var canvas = el('div', 'bks-canvas');
        canvas.id = 'bksCanvas';
        stage.appendChild(canvas);
        wrap.appendChild(stage);

        var legend = el('div', 'bks-legend');
        [['completed', 'Hoàn thành'], ['available', 'Có thể mở'],
         ['in_progress', 'Đang thực hiện'], ['locked', 'Chưa đủ điều kiện']].forEach(function (pair) {
            var chip = el('span', 'bks-legend is-' + pair[0]);
            chip.appendChild(el('span', 'bks-dot'));
            chip.appendChild(el('span', null, pair[1]));
            legend.appendChild(chip);
        });
        var summary = el('span', 'bks-legend-summary',
            (st.nodes || []).filter(function (n) { return n.status === 'completed'; }).length +
            ' / ' + (st.nodes || []).length + ' node hoàn thành');
        legend.appendChild(summary);
        wrap.appendChild(legend);

        /* Bảng chi tiết */
        var panel = el('aside', 'bks-panel');
        panel.id = 'bksPanel';
        panel.setAttribute('aria-live', 'polite');
        wrap.appendChild(panel);

        host.appendChild(wrap);
        bindPan(stage, canvas);
        S.stage = stage;
        S.canvas = canvas;
        S.panel = panel;
        if (S.error) {
            var notice = el('div', 'bks-notice', S.error);
            wrap.insertBefore(notice, wrap.firstChild);
        }
        return true;
    }

    function branches(st) {
        var defs = (st && st.branch_defs) || [];
        if (defs.length) return defs;
        var seen = {};
        var out = [];
        (st.nodes || []).forEach(function (n) {
            if (seen[n.branch]) return;
            seen[n.branch] = 1;
            out.push({ id: n.branch, name: n.branch });
        });
        return out;
    }

    function paint() {
        if (!S.host) return;
        if (!shell()) return;
        paintCanvas();
        paintPanel();
    }

    /* --------------------------------------------------------------- Canvas */
    function visibleNodes() {
        var st = S.state;
        var q = S.query.toLowerCase().trim();
        return (st.nodes || []).filter(function (n) {
            if (S.branch !== 'all' && n.branch !== S.branch) return false;
            if (q && String(n.name + ' ' + n.description).toLowerCase().indexOf(q) < 0) return false;
            return true;
        });
    }

    function positions(nodes) {
        var st = S.state;
        var defs = branches(st);
        var seenZero = {};
        var pos = {};
        var bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        nodes.forEach(function (n) {
            var bi = 0;
            defs.forEach(function (b, i) { if (b.id === n.branch) bi = i; });
            var bucket = n.branch + ':' + (n.pos_x || 0) + ':' + (n.pos_y || 0);
            var x = num(n.pos_x, 0);
            var y = num(n.pos_y, 0);
            /* Node mới chưa đặt toạ độ: xếp theo nhánh + thứ tự, không chồng nhau. */
            if (x === 0 && y === 0 && seenZero[bucket]) {
                x = bi * 260;
                y = num(n.sort_order, 0) * 1.4;
            }
            seenZero[bucket] = 1;
            pos[n.id] = { x: x, y: y };
            bounds.minX = Math.min(bounds.minX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.maxY = Math.max(bounds.maxY, y);
        });
        return { pos: pos, bounds: bounds };
    }

    function paintCanvas() {
        var canvas = S.canvas;
        if (!canvas) return;
        canvas.textContent = '';
        var st = S.state;
        var shown = visibleNodes();
        var layout = positions(shown);
        var pos = layout.pos;
        var minX = layout.bounds.minX - PAD;
        var minY = layout.bounds.minY - PAD;
        var width = layout.bounds.maxX - layout.bounds.minX + NODE_W + PAD * 2;
        var height = layout.bounds.maxY - layout.bounds.minY + NODE_H + PAD * 2;

        canvas.style.width = Math.max(320, width) + 'px';
        canvas.style.height = Math.max(320, height) + 'px';

        var svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'bks-lines');
        svg.setAttribute('width', String(Math.max(320, width)));
        svg.setAttribute('height', String(Math.max(320, height)));
        svg.setAttribute('aria-hidden', 'true');

        var ids = {};
        shown.forEach(function (n) { ids[n.id] = 1; });

        shown.forEach(function (n) {
            (n.requires || []).forEach(function (req) {
                if (!pos[req]) return;
                var a = pos[req];
                var b = pos[n.id];
                var x1 = a.x - minX + NODE_W / 2;
                var y1 = a.y - minY + NODE_H;
                var x2 = b.x - minX + NODE_W / 2;
                var y2 = b.y - minY;
                var mid = (y1 + y2) / 2;
                var path = D.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + mid + ' ' +
                    x2 + ',' + mid + ' ' + x2 + ',' + y2);
                var cls = 'bks-line';
                if (n.status === 'completed') cls += ' is-done';
                else if (n.status === 'locked') cls += ' is-locked';
                else cls += ' is-open';
                if (n.granted) cls += ' is-granted';
                path.setAttribute('class', cls);
                svg.appendChild(path);
            });
        });
        canvas.appendChild(svg);

        var seen = readSeen();
        var changed = false;

        shown.forEach(function (n) {
            var p = pos[n.id];
            var btn = el('button', 'bks-node is-' + n.status + (n.granted ? ' is-granted' : ''));
            btn.type = 'button';
            btn.style.left = (p.x - minX) + 'px';
            btn.style.top = (p.y - minY) + 'px';
            btn.setAttribute('aria-pressed', S.selected === n.id ? 'true' : 'false');
            btn.setAttribute('data-node-id', n.id);
            btn.setAttribute('aria-label', n.name + ' — ' + (STATUS_LABELS[n.status] || n.status));
            if (S.selected === n.id) btn.classList.add('is-selected');
            if (n.status === 'completed' && !seen[n.id]) {
                btn.classList.add('is-new');
                seen[n.id] = 1;
                changed = true;
            }
            var top = el('div', 'bks-node-top');
            var ic = el('span', 'bks-node-icon');
            ic.appendChild(icon(n.status === 'completed' ? 'fa-check'
                : (n.status === 'locked' ? 'fa-lock' : (n.icon || 'fa-circle-nodes'))));
            top.appendChild(ic);
            top.appendChild(el('span', 'bks-node-status', STATUS_LABELS[n.status] || n.status));
            btn.appendChild(top);
            btn.appendChild(el('span', 'bks-node-name', n.name));
            var bar = el('span', 'bks-progress');
            var fill = el('span', 'bks-progress-fill');
            fill.style.width = Math.max(0, Math.min(100, num(n.progress, 0))) + '%';
            bar.appendChild(fill);
            btn.appendChild(bar);
            btn.addEventListener('click', function () { selectNode(n.id); });
            canvas.appendChild(btn);
        });

        if (changed) writeSeen(seen);
        if (!shown.length) {
            var empty = el('div', 'bks-empty');
            empty.appendChild(icon('fa-circle-nodes'));
            empty.appendChild(el('p', null, 'Không có kỹ năng phù hợp bộ lọc.'));
            canvas.appendChild(empty);
        }
        applyTransform();
    }

    function applyTransform() {
        if (!S.canvas) return;
        S.canvas.style.transform = 'translate(' + S.tx + 'px,' + S.ty + 'px) scale(' + S.scale + ')';
    }

    function stageSize() {
        var stage = S.stage;
        if (!stage) return { w: 800, h: 520 };
        var rect = stage.getBoundingClientRect();
        return { w: rect.width || 800, h: rect.height || 520 };
    }

    function resetView() {
        if (!S.canvas) return;
        var size = stageSize();
        var width = parseFloat(S.canvas.style.width) || 800;
        var height = parseFloat(S.canvas.style.height) || 520;
        S.scale = Math.max(MIN_SCALE, Math.min(1, (size.w - 16) / width, (size.h - 16) / height));
        S.tx = (size.w - width * S.scale) / 2;
        S.ty = (size.h - height * S.scale) / 2;
        applyTransform();
    }

    function zoomBy(factor) {
        var size = stageSize();
        var next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, S.scale * factor));
        var cx = size.w / 2;
        var cy = size.h / 2;
        S.tx = cx - ((cx - S.tx) / S.scale) * next;
        S.ty = cy - ((cy - S.ty) / S.scale) * next;
        S.scale = next;
        applyTransform();
    }

    function zoomAt(factor, clientX, clientY) {
        var stage = S.stage;
        if (!stage) return;
        var rect = stage.getBoundingClientRect();
        var x = clientX - rect.left;
        var y = clientY - rect.top;
        var next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, S.scale * factor));
        S.tx = x - ((x - S.tx) / S.scale) * next;
        S.ty = y - ((y - S.ty) / S.scale) * next;
        S.scale = next;
        applyTransform();
    }

    function bindPan(stage, canvas) {
        stage.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            if (e.target && e.target.closest && e.target.closest('.bks-node')) return;
            S.dragging = true;
            S.dragStart = { x: e.clientX, y: e.clientY, tx: S.tx, ty: S.ty };
            stage.classList.add('is-dragging');
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
        });
        stage.addEventListener('pointermove', function (e) {
            if (!S.dragging || !S.dragStart) return;
            S.tx = S.dragStart.tx + (e.clientX - S.dragStart.x);
            S.ty = S.dragStart.ty + (e.clientY - S.dragStart.y);
            applyTransform();
        });
        function endDrag(e) {
            if (!S.dragging) return;
            S.dragging = false;
            S.dragStart = null;
            stage.classList.remove('is-dragging');
            try { stage.releasePointerCapture(e.pointerId); } catch (err) { }
        }
        stage.addEventListener('pointerup', endDrag);
        stage.addEventListener('pointercancel', endDrag);
        stage.addEventListener('wheel', function (e) {
            if (!e.ctrlKey && !e.metaKey) return;   /* giữ cuộn trang bình thường */
            e.preventDefault();
            zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX, e.clientY);
        }, { passive: false });
        stage.addEventListener('keydown', function (e) {
            var step = 40;
            if (e.key === 'ArrowLeft') { S.tx += step; applyTransform(); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { S.tx -= step; applyTransform(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { S.ty += step; applyTransform(); e.preventDefault(); }
            else if (e.key === 'ArrowDown') { S.ty -= step; applyTransform(); e.preventDefault(); }
            else if (e.key === '+' || e.key === '=') { zoomBy(1.15); e.preventDefault(); }
            else if (e.key === '-') { zoomBy(0.87); e.preventDefault(); }
            else if (e.key === '0') { resetView(); e.preventDefault(); }
        });
    }

    /* ---------------------------------------------------------------- Panel */
    function selectNode(id) {
        S.selected = id;
        if (S.canvas) {
            Array.prototype.forEach.call(S.canvas.querySelectorAll('.bks-node'), function (n) {
                n.classList.remove('is-selected');
                n.setAttribute('aria-pressed', 'false');
            });
            var target = null;
            var nodes = S.canvas.querySelectorAll('.bks-node');
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].getAttribute('data-node-id') === id) target = nodes[i];
            }
            if (target) {
                target.classList.add('is-selected');
                target.setAttribute('aria-pressed', 'true');
            }
        }
        paintPanel();
        if (S.panel) {
            S.panel.classList.add('is-open');
            try { S.panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { }
        }
    }

    function findNode(id) {
        var nodes = (S.state && S.state.nodes) || [];
        for (var i = 0; i < nodes.length; i++) if (nodes[i].id === id) return nodes[i];
        return null;
    }

    function paintPanel() {
        var panel = S.panel;
        if (!panel) return;
        panel.textContent = '';
        var n = S.selected ? findNode(S.selected) : null;
        if (!n) {
            panel.classList.remove('is-open');
            panel.appendChild(el('p', 'bks-muted', 'Chọn một node trên sơ đồ để xem điều kiện, phần thưởng và tiến độ.'));
            return;
        }
        var st = S.state;

        var head = el('div', 'bks-panel-head');
        var art = el('span', 'bks-panel-icon is-' + n.status);
        art.appendChild(icon(n.status === 'completed' ? 'fa-check' : (n.icon || 'fa-circle-nodes')));
        head.appendChild(art);
        var title = el('div');
        title.appendChild(el('h2', null, n.name));
        var bName = (branches(st).filter(function (b) { return b.id === n.branch; })[0] || {}).name || n.branch;
        title.appendChild(el('p', 'bks-muted', 'Nhánh ' + bName));
        head.appendChild(title);
        var close = el('button', 'bks-icon-btn', null);
        close.type = 'button';
        close.setAttribute('aria-label', 'Đóng chi tiết');
        close.appendChild(icon('fa-xmark'));
        close.addEventListener('click', function () {
            S.selected = null;
            paintPanel();
            if (S.canvas) {
                Array.prototype.forEach.call(S.canvas.querySelectorAll('.bks-node'), function (x) {
                    x.classList.remove('is-selected');
                });
            }
        });
        head.appendChild(close);
        panel.appendChild(head);

        panel.appendChild(el('span', 'bks-status is-' + n.status, STATUS_LABELS[n.status] || n.status));
        if (n.description) panel.appendChild(el('p', null, n.description));

        var progress = el('div', 'bks-panel-progress');
        progress.appendChild(el('span', 'bks-muted', 'Tiến độ ' + num(n.progress, 0) + '%'));
        var bar = el('span', 'bks-progress is-lg');
        var fill = el('span', 'bks-progress-fill');
        fill.style.width = Math.max(0, Math.min(100, num(n.progress, 0))) + '%';
        bar.appendChild(fill);
        progress.appendChild(bar);
        panel.appendChild(progress);

        var list = el('div', 'bks-panel-rows');
        list.appendChild(row('Điều kiện chỉ số',
            (METRIC_LABELS[n.metric] || n.metric) + ' ≥ ' + num(n.target, 1) +
            ' (hiện tại ' + num(n.metric_value, 0) + ')'));
        if (num(n.min_level, 1) > 1) {
            list.appendChild(row('Cấp độ tối thiểu', String(num(n.min_level, 1))));
        }
        if ((n.requires || []).length) {
            list.appendChild(row('Kỹ năng cần mở trước', (n.requires || []).map(function (id) {
                var p = findNode(id);
                return p ? p.name : id;
            }).join(', ')));
        }
        if ((n.required_missions || []).length) {
            list.appendChild(row('Nhiệm vụ bắt buộc', (n.required_missions || []).join(', ')));
        }
        if ((n.required_achievements || []).length) {
            list.appendChild(row('Thành tựu bắt buộc', (n.required_achievements || []).join(', ')));
        }
        var items = (n.reward && n.reward.items) || [];
        list.appendChild(row('Phần thưởng khi mở', items.length
            ? items.map(function (id) { return itemName(id); }).join(', ')
            : 'Không có vật phẩm — vẫn nhận XP theo cấu hình máy chủ.'));
        if (n.granted) list.appendChild(row('Nguồn mở khoá', 'Founder cấp trực tiếp'));
        if (n.completed_at) list.appendChild(row('Hoàn thành lúc', fmtTime(n.completed_at)));
        panel.appendChild(list);

        var blockers = n.blockers || [];
        if (blockers.length) {
            panel.appendChild(el('h3', 'bks-panel-title', 'Còn thiếu để mở'));
            var ul = el('ul', 'bks-blockers');
            blockers.forEach(function (b) {
                var li = el('li', null);
                li.appendChild(icon('fa-lock'));
                li.appendChild(el('span', null, b.label || ''));
                ul.appendChild(li);
            });
            panel.appendChild(ul);
        } else if (n.status !== 'completed') {
            panel.appendChild(el('p', 'bks-ok-note',
                'Đã đủ điều kiện mở. Hoàn thành mốc chỉ số ở trên để nhận node này.'));
        } else {
            panel.appendChild(el('p', 'bks-ok-note', 'Bạn đã hoàn thành node này.'));
        }
    }

    function row(label, value) {
        var r = el('div', 'bks-row');
        r.appendChild(el('span', 'bks-row-label', label));
        r.appendChild(el('span', 'bks-row-value', value));
        return r;
    }

    function itemName(id) {
        var catalog = (S.state && S.state.catalog) || [];
        for (var i = 0; i < catalog.length; i++) if (catalog[i].item_id === id) return catalog[i].name;
        return id;
    }

    function fmtTime(iso) {
        try {
            return new Date(iso).toLocaleString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { return String(iso); }
    }

    function selectDefault() {
        /* Tự chọn node đang làm dở để người học thấy ngay việc cần làm. */
        var nodes = (S.state && S.state.nodes) || [];
        var pick = nodes.filter(function (n) { return n.status === 'in_progress'; })[0] ||
            nodes.filter(function (n) { return n.status === 'available'; })[0] || null;
        if (pick) S.selected = pick.id;
        paintPanel();
    }

    function mount(host) {
        if (typeof host === 'string') host = D.getElementById(host);
        if (!host) return;
        S.host = host;
        var redraw = function () { if (S.state) paintCanvas(); else paint(); };
        global.addEventListener('resize', redraw);

        global.addEventListener('bk:identity', function () {
            S.state = null;
            S.loaded = false;
            load();
        });
        if (studentId()) {
            load();
        } else {
            S.status = 'no_session';
            paint();
        }
    }

    global.BKSkills = {
        mount: mount,
        reload: load,
        version: '8.3.8',
        state: function () { return S.state; },
        __ready: true
    };
})(typeof window !== 'undefined' ? window : this);
