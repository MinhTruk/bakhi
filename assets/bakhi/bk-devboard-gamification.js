/* =========================================================================
   Bá Khí — bk-devboard-gamification.js (8.3.5)
   Mô-đun quản trị Gamification nằm trong Administrator / Founder Dashboard.

   Tách khỏi bk-devboard.js để dashboard giữ nguyên kích thước; dashboard chỉ
   gọi BKGamificationAdmin.render(pane, helpers). Mọi thao tác ghi đều đi qua
   Edge Function gamification-api với x-admin-token; quyền Founder kiểm tra ở
   máy chủ, không dựa vào giao diện.

   8.3.5 — ĐƠN GIẢN HOÁ CHO NGƯỜI KHÔNG BIẾT LẬP TRÌNH:
   · Mã (thành tựu, Boss, nhiệm vụ, node, phần thưởng) TỰ SINH từ tên:
     “Ma Vương” → ma_vuong, “Đỉnh Cao Kiến Thức” → dinh_cao_kien_thuc.
   · Mã trùng được phát hiện trước khi lưu và đề xuất mã khác (ma_vuong_2);
     người quản trị xem trước rồi mới dùng.
   · Trường kỹ thuật (mã, thứ tự, thời gian đóng) nằm trong “Cài đặt nâng cao”,
     mặc định đóng.
   · Mỗi biểu mẫu có xem trước ngay khi gõ.
   · Lỗi hiển thị bằng tiếng Việt, chỉ rõ trường cần sửa.
   Không có JSON, SQL hay API nào hiện ra cho người quản trị.
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;

    function num(v, d) {
        var n = Number(v);
        return isFinite(n) ? n : d;
    }

    /* ---------------------------------------------------------------------
       Sinh mã từ tên — MỘT hàm duy nhất cho toàn bộ dashboard.
       Quy tắc (8.3.5): chữ thường, bỏ dấu tiếng Việt, đ → d, ký tự khác
       chữ/số thành "_", gộp "_" liên tiếp, bỏ "_" ở hai đầu.
       ------------------------------------------------------------------ */
    function slugify(value) {
        var s = String(value == null ? '' : value);
        try { s = s.normalize('NFD'); } catch (e) { /* trình duyệt rất cũ */ }
        return s
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, function (ch) { return ch === 'Đ' ? 'D' : 'd'; })
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 64);
    }

    /** Mã chưa bị dùng; nếu trùng thì đề xuất ten_2, ten_3… */
    /** Giữ nguyên mã đã có (kể cả dấu '-') khi quản trị viên dán vào. */
    function normalizeCode(value) {
        return String(value == null ? '' : value)
            .trim().toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '_')
            .replace(/^[_-]+|[_-]+$/g, '')
            .slice(0, 64);
    }

    /** Câu hỏi Boss: mỗi dòng “Nội dung | A | B | số đáp án đúng | giải thích”. */
    function parseQuestions(text) {
        var out = [];
        String(text || '').split('\n').forEach(function (line) {
            line = line.trim();
            if (!line) return;
            var parts = line.split('|').map(function (s) { return s.trim(); });
            if (parts.length < 4) return;
            var prompt = parts[0];
            var options = [];
            var correct = null;
            var explanation = [];
            for (var i = 1; i < parts.length; i++) {
                var p = parts[i];
                if (correct === null && /^\d+$/.test(p)) { correct = Number(p) - 1; continue; }
                if (correct !== null) explanation.push(p);
                else options.push(p);
            }
            if (!prompt || options.length < 2 || correct === null || correct >= options.length) return;
            out.push({ prompt: prompt, options: options, correct_index: correct, explanation: explanation.join(' | ') });
        });
        return out;
    }

    function suggestCode(base, taken) {
        var code = slugify(base);
        if (!code) return '';
        var used = {};
        (taken || []).forEach(function (id) { used[String(id)] = 1; });
        if (!used[code]) return code;
        var n = 2;
        while (used[code + '_' + n] && n < 999) n++;
        return code + '_' + n;
    }

    function scrollToEditor(node) {
        if (!node || typeof node.scrollIntoView !== 'function') return;
        try { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { }
    }

    function render(pane, U) {
        var h = U.h, icon = U.icon, btn = U.btn, card = U.card, table = U.table,
            emptyRow = U.emptyRow, fieldRow = U.fieldRow, input = U.input,
            textarea = U.textarea, checkbox = U.checkbox, alertBox = U.alertBox,
            pill = U.pill, statCard = U.statCard, toast = U.toast;

        var defs = null;
        var painters = [];
        var loaded = false;

        var RARITY_LABELS = {
            common: 'Phổ biến', uncommon: 'Ít gặp', rare: 'Hiếm',
            epic: 'Cực hiếm', legendary: 'Huyền thoại'
        };
        var METRIC_LABELS = {
            quiz_completed: 'Số bài quiz đã hoàn thành',
            lesson_study: 'Số bài đã học',
            listening_completed: 'Số bài luyện nghe',
            revision_session: 'Số phiên ôn tập',
            mistake_mastered: 'Số câu sai đã xử lý',
            goal_completed: 'Số mục tiêu hoàn thành',
            xp_total: 'Tổng XP',
            level: 'Cấp độ',
            boss_passed: 'Số Boss đã vượt',
            boss_attempts: 'Số lượt đánh Boss',
            skill_nodes_completed: 'Số node kỹ năng hoàn thành',
            achievements_unlocked: 'Số thành tựu đã mở',
            distinct_active_days: 'Số ngày có học',
            streak_days: 'Chuỗi ngày học liên tiếp',
            inventory_count: 'Số vật phẩm sở hữu'
        };

        function call(action, payload, okText) {
            return U.api(action, payload).then(function (res) {
                if (okText) toast(okText, 'success');
                return res;
            }, function (err) {
                toast((err && err.message) || 'Thao tác không thành công.', 'error');
                throw err;
            });
        }

        function txt(value, ph) { return input('text', ph, value == null ? '' : value); }
        function numberInput(value) {
            var i = input('number', '', value == null ? '' : value);
            return i;
        }
        function selectInput(options, value) {
            var sel = h('select', 'bkc-input');
            (options || []).forEach(function (opt) {
                var o = h('option', null, opt[1]);
                o.value = opt[0];
                sel.appendChild(o);
            });
            if (value != null) sel.value = String(value);
            return sel;
        }
        function cellRow(tbody, cells) {
            var tr = h('tr');
            (cells || []).forEach(function (c) {
                var td = h('td');
                if (c && c.nodeType) td.appendChild(c);
                else td.textContent = c == null ? '—' : String(c);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
            return tr;
        }
        function metricLabel(metric) { return METRIC_LABELS[metric] || metric; }

        /* Thông điệp trường bắt buộc, tiếng Việt, chỉ rõ chỗ cần sửa. */
        function required(text) {
            var box = h('p', 'bkc-field-error');
            box.setAttribute('role', 'alert');
            box.textContent = text;
            return box;
        }

        /* ------------------------------------------------------------ Overview */
        var hero = card('Gamification 2.0', [
            btn('Làm mới', 'bkc-btn-ghost', function () { load(); }, 'fa-rotate')
        ], 'XP, cấp độ, cây kỹ năng, thành tựu, nhiệm vụ, thử thách Boss và kho vật phẩm.');
        pane.appendChild(hero.root);
        hero.body.appendChild(alertBox(
            'Học sinh không ghi trực tiếp bảng tiến trình: mọi thay đổi đi qua hàm bk_gam_* trong Postgres, ' +
            'có idempotency và audit. Điều chỉnh XP chỉ dành cho Founder và bắt buộc nhập lý do.',
            'info'));
        var stats = h('div', 'bkc-status-grid');
        hero.body.appendChild(stats);
        var statsHost = h('div');
        hero.body.appendChild(statsHost);

        function paintOverview(res) {
            stats.textContent = '';
            statsHost.textContent = '';
            var counts = (res && res.counts) || {};
            statCard(stats, 'Giao dịch XP', counts.xp, 'Sổ xp_transactions', 'fa-coins', 'info');
            statCard(stats, 'Thành tựu đã mở', counts.achievements, 'Toàn hệ thống', 'fa-medal', 'ok');
            statCard(stats, 'Nhiệm vụ đã nhận', counts.missions, 'Đã claim thưởng', 'fa-list-check', 'info');
            statCard(stats, 'Lượt Boss', counts.boss, 'Đã chấm tại máy chủ', 'fa-dragon', 'warn');
            statCard(stats, 'Vật phẩm đã cấp', counts.items, 'Kho người học', 'fa-box-open', 'ok');

            if (!(res && res.config)) return;
            var rows = res.top || [];
            var topCard = h('div', 'bkc-subcard');
            topCard.appendChild(h('h4', 'bkc-sub-title', 'Top XP'));
            if (!rows.length) {
                topCard.appendChild(h('p', 'bkc-hint', 'Chưa có giao dịch XP nào trên hệ thống.'));
            } else {
                var t = table(['Học sinh', 'Cấp', 'XP']);
                rows.forEach(function (r) {
                    var name = (r.students && r.students.display_name) || r.student_id;
                    cellRow(t.tbody, [name, r.level, r.total_xp]);
                });
                topCard.appendChild(t.wrap);
            }
            statsHost.appendChild(topCard);
        }

        /* -------------------------------------------------------------- Config */
        var ruleInputs = {};
        var flagInputs = {};
        var cfgCard = card('Cấu hình XP & tính năng', [
            btn('Lưu cấu hình', 'bkc-btn-primary', saveConfig, 'fa-floppy-disk')
        ], 'Bảng XP tập trung — không hardcode điểm ở bất kỳ mô-đun nào khác.');
        pane.appendChild(cfgCard.root);
        var cfgBody = cfgCard.body;

        function paintConfig(cfg) {
            cfgBody.textContent = '';
            ruleInputs = {};
            flagInputs = {};
            var flags = (cfg && cfg.feature_flags) || {};
            var flagRow = h('div', 'bkc-form-grid');
            [
                ['xp', 'Cộng XP'], ['achievements', 'Thành tựu'], ['missions', 'Nhiệm vụ'],
                ['skill_tree', 'Cây kỹ năng'], ['boss', 'Thử thách Boss'], ['inventory', 'Kho vật phẩm']
            ].forEach(function (f) {
                var cb = checkbox(f[1], flags[f[0]] !== false);
                flagInputs[f[0]] = cb.input;
                flagRow.appendChild(cb.root);
            });
            cfgBody.appendChild(h('h4', 'bkc-sub-title', 'Bật / tắt tính năng'));
            cfgBody.appendChild(flagRow);

            cfgBody.appendChild(h('h4', 'bkc-sub-title', 'Điểm XP theo hoạt động'));
            var rules = (cfg && cfg.xp_rules) || {};
            var t = table(['Hoạt động', 'XP', 'Giới hạn / ngày', 'Ghi chú']);
            Object.keys(rules).forEach(function (key) {
                var rule = rules[key] || {};
                var xp = numberInput(num(rule.xp, 0));
                var cap = numberInput(num(rule.daily_cap, 0));
                ruleInputs[key] = { xp: xp, cap: cap };
                cellRow(t.tbody, [key, xp, cap, 'Giới hạn do máy chủ áp dụng, không tin client.']);
            });
            if (!Object.keys(rules).length) emptyRow(t.tbody, 4, 'Chưa có cấu hình XP.');
            cfgBody.appendChild(t.wrap);
        }

        function saveConfig() {
            var xpRules = {};
            Object.keys(ruleInputs).forEach(function (k) {
                xpRules[k] = {
                    xp: Math.max(0, Math.round(num(ruleInputs[k].xp.value, 0))),
                    daily_cap: Math.max(0, Math.round(num(ruleInputs[k].cap.value, 0)))
                };
            });
            var flags = {};
            Object.keys(flagInputs).forEach(function (k) { flags[k] = !!flagInputs[k].checked; });
            call('admin.config.set', { xp_rules: xpRules, feature_flags: flags }, 'Đã lưu cấu hình gamification.')
                .then(function (res) { paintConfig(res.config); }, function () { });
        }

        /* ----------------------------------------------------- Definition card */
        /**
         * Khu vực quản lý một loại định nghĩa.
         * spec: title, subtitle, listKey, idKey, payloadKey, action, columns, row,
         *       fields, prepare, collect, codeFrom, filters, canDelete, onDelete,
         *       preview(item), toggle(item, nextActive), savedText, editorTitle
         */
        function definitionCard(spec) {
            var box = card(spec.title, [
                btn('Tạo mới', 'bkc-btn-primary', function () { editor.load(null); }, 'fa-plus')
            ], spec.subtitle);
            pane.appendChild(box.root);

            var search = input('search', 'Tìm theo tên hoặc mã…', '');
            search.setAttribute('aria-label', 'Tìm ' + spec.title.toLowerCase());
            var filterSelect = null;
            var filterRow = h('div', 'bkc-toolbar');
            filterRow.appendChild(search);
            if (spec.filters) {
                filterSelect = selectInput(spec.filters, spec.filters[0][0]);
                filterRow.appendChild(filterSelect);
            }
            box.body.appendChild(filterRow);

            var tableHost = h('div');
            box.body.appendChild(tableHost);

            var form = h('div', 'bkc-subcard bkc-editor');
            box.body.appendChild(form);

            var editor = {
                current: null,
                isNew: false,
                load: function (item) {
                    form.textContent = '';
                    editor.current = item || null;
                    editor.isNew = !item || !item[spec.idKey];
                    form.classList.add('is-open');

                    var head = h('div', 'bkc-editor-head');
                    head.appendChild(h('h4', 'bkc-sub-title',
                        item ? 'Chỉnh sửa: ' + (item.name || item[spec.idKey]) : (spec.editorTitle || 'Tạo mới')));
                    form.appendChild(head);

                    /* Nhóm 1 — thông tin cơ bản */
                    var basics = h('div', 'bkc-form-grid');
                    form.appendChild(h('h5', 'bkc-group-title', '1. Thông tin cơ bản'));
                    form.appendChild(basics);

                    /* Nhóm 2 — điều kiện */
                    var conditionGrid = h('div', 'bkc-form-grid');
                    form.appendChild(h('h5', 'bkc-group-title', spec.conditionTitle || '2. Điều kiện nhận'));
                    form.appendChild(conditionGrid);

                    /* Nhóm 3 — phần thưởng / hiển thị */
                    var extraGrid = h('div', 'bkc-form-grid');
                    form.appendChild(h('h5', 'bkc-group-title', spec.extraTitle || '3. Phần thưởng & hiển thị'));
                    form.appendChild(extraGrid);

                    var controls = {};
                    var codeControl = null;
                    var codeEdited = false;
                    var codeHint = h('p', 'bkc-hint');

                    (spec.fields || []).forEach(function (f) {
                        if (f.type === 'check') {
                            /* Dùng CHÍNH ô checkbox hiển thị làm control — trước đây
                               tạo thêm một input ẩn nên khi sửa, trạng thái hiển thị
                               và giá trị gửi lên có thể lệch nhau. */
                            var cb = checkbox(f.label,
                                item ? item[f.key] !== false : (f.default !== false),
                                function () { refreshPreview(); });
                            controls[f.key] = cb.input;
                            extraGrid.appendChild(cb.root);
                            return;
                        }
                        var control;
                        if (f.type === 'textarea') control = textarea(f.ph || '', '', 4);
                        else if (f.type === 'number') control = numberInput('');
                        else if (f.type === 'select') control = selectInput(f.options, '');
                        else control = txt('', f.ph || '');
                        controls[f.key] = control;
                        if (f.advanced) {
                            var advBody = form.querySelector('.bkc-advanced-body');
                            if (!advBody) {
                                var details = h('details', 'bkc-advanced');
                                details.appendChild(h('summary', null, 'Cài đặt nâng cao (dành cho kỹ thuật)'));
                                details.appendChild(h('p', 'bkc-hint',
                                    'Bình thường không cần mở. Hệ thống đã tự điền giúp bạn.'));
                                advBody = h('div', 'bkc-advanced-body');
                                details.appendChild(advBody);
                                form.appendChild(details);
                            }
                            advBody.appendChild(fieldRow(f.label, control, f.hint));
                            if (f.key === spec.idKey) codeControl = control;
                            return;
                        }
                        var target = f.group === 'condition' ? conditionGrid
                            : (f.group === 'extra' ? extraGrid : basics);
                        var row = fieldRow(f.label, control, f.hint);
                        target.appendChild(row);
                        if (f.key === 'name' && spec.codeFrom) {
                            control.addEventListener('input', function () {
                                if (codeEdited || !codeControl) return;
                                codeControl.value = codeEdited ? codeControl.value : slugify(control.value);
                                checkCode();
                                refreshPreview();
                            });
                        }
                    });

                    if (codeControl) {
                        codeControl.addEventListener('input', function () {
                            codeEdited = true;
                            checkCode();
                        });
                        form.querySelector('.bkc-advanced-body').appendChild(codeHint);
                    }

                    /* Xem trước */
                    var previewBox = h('div', 'bkc-preview');
                    previewBox.appendChild(h('h5', 'bkc-group-title', 'Xem trước'));
                    var previewBody = h('div', 'bkc-preview-body');
                    previewBox.appendChild(previewBody);
                    form.appendChild(previewBox);

                    var errorBox = h('div');
                    form.appendChild(errorBox);

                    function payloadNow() {
                        return spec.collect(controls, {
                            id: codeControl ? codeControl.value : '',
                            isNew: editor.isNew
                        });
                    }
                    function refreshPreview() {
                        previewBody.textContent = '';
                        var payload = null;
                        try { payload = payloadNow(); } catch (e) { payload = null; }
                        if (spec.preview) previewBody.appendChild(spec.preview(payload || {}, h, icon, pill));
                        else previewBody.appendChild(h('p', 'bkc-hint', 'Chưa đủ thông tin để xem trước.'));
                    }
                    function takenCodes() {
                        var list = (defs && defs[spec.listKey]) || [];
                        return list.map(function (x) { return String(x[spec.idKey]); })
                            .filter(function (id) { return !editor.current || id !== String(editor.current[spec.idKey]); });
                    }
                    function checkCode() {
                        if (!codeControl) return true;
                        var code = slugify(codeControl.value) || String(codeControl.value || '').trim().toLowerCase();
                        codeHint.textContent = '';
                        codeHint.className = 'bkc-hint';
                        if (!code) {
                            codeHint.textContent = 'Mã sẽ được tạo tự động từ tên.';
                            return true;
                        }
                        var taken = takenCodes();
                        if (taken.indexOf(code) === -1) {
                            codeHint.textContent = 'Mã sẽ dùng: ' + code;
                            return true;
                        }
                        var suggestion = suggestCode(code, taken);
                        codeHint.className = 'bkc-field-error';
                        codeHint.textContent = 'Mã “' + code + '” đã tồn tại. Đề xuất: “' + suggestion + '”.';
                        var useBtn = h('button', 'bkc-btn-ghost', 'Dùng mã đề xuất');
                        useBtn.type = 'button';
                        useBtn.addEventListener('click', function () {
                            codeControl.value = suggestion;
                            codeEdited = true;
                            checkCode();
                        });
                        codeHint.appendChild(useBtn);
                        return false;
                    }

                    if (item) {
                        (spec.fields || []).forEach(function (f) {
                            var c = controls[f.key];
                            if (!c) return;
                            var v = item[f.key];
                            if (f.type === 'check') { c.checked = item[f.key] !== false; }
                            else if (f.type === 'number') c.value = num(v, 0);
                            else if (f.type === 'select') c.value = v == null ? '' : String(v);
                            else c.value = v == null ? '' : (f.type === 'textarea' ? spec.toText(item, f.key) : v);
                        });
                        if (spec.prepare) spec.prepare(item, controls);
                    } else {
                        (spec.fields || []).forEach(function (f) {
                            var c = controls[f.key];
                            if (!c) return;
                            if (f.type === 'check') c.checked = f.default !== false;
                            else if (f.type === 'number') c.value = f.default != null ? f.default : '';
                            else if (f.type === 'select' && f.options && f.options.length) c.value = f.options[0][0];
                        });
                    }

                    Array.prototype.slice.call(form.querySelectorAll('input, textarea, select'))
                        .forEach(function (el) {
                            el.addEventListener('input', refreshPreview);
                            el.addEventListener('change', refreshPreview);
                        });
                    if (codeControl) codeControl.value = codeControl.value || (item ? String(item[spec.idKey] || '') : '');
                    if (codeControl) codeEdited = !!item;
                    checkCode();
                    refreshPreview();

                    var actions = h('div', 'bkc-editor-actions');

                    var save = btn('Lưu thay đổi', 'bkc-btn-primary', function () {
                        errorBox.textContent = '';
                        var payload = payloadNow();
                        if (!payload) {
                            errorBox.appendChild(required(spec.missingText || 'Hãy nhập đủ thông tin bắt buộc (tên và mã).'));
                            return;
                        }
                        if (!checkCode()) {
                            errorBox.appendChild(required('Mã bị trùng. Hãy bấm “Dùng mã đề xuất” hoặc sửa mã.'));
                            return;
                        }
                        save.disabled = true;
                        var body = {};
                        body[spec.payloadKey] = payload;
                        if (editor.isNew) body.expect_new = true;
                        call(spec.action, body, spec.savedText || 'Đã lưu.')
                            .then(function () { load(); }, function () { })
                            .then(function () { save.disabled = false; });
                    }, 'fa-floppy-disk');
                    actions.appendChild(save);

                    actions.appendChild(btn('Hủy', 'bkc-btn-ghost', function () {
                        form.classList.remove('is-open');
                        form.textContent = '';
                        editor.current = null;
                    }, 'fa-xmark'));

                    form.appendChild(actions);
                    try { form.querySelector('input, textarea, select').focus(); } catch (e) { }
                }
            };

            function paint() {
                tableHost.textContent = '';
                var q = String(search.value || '').toLowerCase().trim();
                var filter = filterSelect ? filterSelect.value : '';
                var list = (defs && defs[spec.listKey]) || [];
                if (spec.filterFn && filter) list = list.filter(function (x) { return spec.filterFn(x, filter); });
                if (q) {
                    list = list.filter(function (x) {
                        return String(x.name + ' ' + x[spec.idKey]).toLowerCase().indexOf(q) >= 0;
                    });
                }
                var t = table(spec.columns.concat(['']));
                if (!list.length) emptyRow(t.tbody, spec.columns.length + 1, spec.emptyText || 'Chưa có dữ liệu.');
                list.forEach(function (item) {
                    var tr = h('tr');
                    spec.row(item).forEach(function (value) {
                        var td = h('td');
                        if (value && value.nodeType) td.appendChild(value);
                        else td.textContent = value == null ? '—' : String(value);
                        tr.appendChild(td);
                    });
                    var actions = h('td', 'bkc-row-actions');
                    actions.appendChild(btn('Sửa', 'bkc-btn-ghost', function () {
                        editor.load(item);
                        scrollToEditor(form);
                    }, 'fa-pen'));
                    if (spec.toggle) {
                        var on = item.is_active !== false;
                        actions.appendChild(btn(on ? 'Tạm ngừng' : 'Kích hoạt', 'bkc-btn-ghost', function () {
                            spec.toggle(item, !on);
                        }, on ? 'fa-pause' : 'fa-play'));
                    }
                    if (spec.canDelete) {
                        actions.appendChild(btn('Xóa', 'bkc-btn-ghost is-danger', function () {
                            spec.canDelete(item);
                        }, 'fa-trash'));
                    }
                    tr.appendChild(actions);
                    t.tbody.appendChild(tr);
                });
                tableHost.appendChild(t.wrap);
            }
            painters.push(paint);
            paint();
            search.addEventListener('input', paint);
            if (filterSelect) filterSelect.addEventListener('change', paint);
            return box;
        }

        /* --------------------------------------------------------- Achievements */
        definitionCard({
            title: 'Thành tựu',
            subtitle: 'Chỉ cần nhập tên, chọn điều kiện và nhập mốc — mã được tạo tự động từ tên. Điều kiện do máy chủ tính từ dữ liệu học tập thật (sổ XP, Boss, cây kỹ năng).',
            listKey: 'achievements',
            idKey: 'id',
            payloadKey: 'achievement',
            action: 'admin.achievement.save',
            editorTitle: 'Tạo thành tựu mới',
            savedText: 'Đã lưu thành tựu.',
            missingText: 'Hãy nhập tên thành tựu và chọn điều kiện nhận.',
            codeFrom: 'name',
            conditionTitle: '2. Điều kiện nhận',
            extraTitle: '3. Phần thưởng, hiển thị & trạng thái',
            filters: [['all', 'Tất cả trạng thái'], ['on', 'Đang bật'], ['off', 'Đang tắt'], ['hidden', 'Đang ẩn']],
            filterFn: function (a, f) {
                if (f === 'on') return a.is_active !== false;
                if (f === 'off') return a.is_active === false;
                if (f === 'hidden') return a.is_hidden === true;
                return true;
            },
            columns: ['Tên', 'Nhóm', 'Độ hiếm', 'Điều kiện', 'Phần thưởng', 'Trạng thái'],
            row: function (a) {
                var cond = (a.conditions || []).map(function (c) {
                    return metricLabel(c.metric) + ' ≥ ' + c.target;
                }).join('; ');
                var items = (a.reward && a.reward.items) || [];
                return [
                    a.name, a.category, RARITY_LABELS[a.rarity] || a.rarity, cond,
                    items.length ? items.join(', ') : '—',
                    a.is_active === false ? 'Đang tắt' : (a.is_hidden ? 'Đang bật · Ẩn' : 'Đang bật')
                ];
            },
            fields: [
                { key: 'name', label: 'Tên thành tựu', ph: 'Ví dụ: Ma Vương', hint: 'Tên học sinh nhìn thấy. Mã được tạo tự động từ tên.' },
                { key: 'description', label: 'Mô tả', type: 'textarea', ph: 'Một câu mô tả cách đạt thành tựu này.' },
                { key: 'icon', label: 'Biểu tượng (Font Awesome)', ph: 'fa-medal', hint: 'Ví dụ fa-medal, fa-crown, fa-dragon.' },
                { key: 'rarity', label: 'Độ hiếm', type: 'select', options: [
                    ['common', 'Phổ biến'], ['uncommon', 'Ít gặp'], ['rare', 'Hiếm'],
                    ['epic', 'Cực hiếm'], ['legendary', 'Huyền thoại']
                ] },
                { key: 'category', label: 'Nhóm', type: 'select', options: [
                    ['learning', 'Học tập'], ['practice', 'Luyện tập'], ['revision', 'Ôn tập'],
                    ['consistency', 'Đều đặn'], ['mastery', 'Tinh thông']
                ] },
                { key: 'metric', label: 'Điều kiện nhận', type: 'select', group: 'condition', options: [
                    ['quiz_completed', 'Số bài quiz đã hoàn thành'],
                    ['lesson_study', 'Số bài đã học'],
                    ['listening_completed', 'Số bài luyện nghe'],
                    ['revision_session', 'Số phiên ôn tập'],
                    ['mistake_mastered', 'Số câu sai đã xử lý'],
                    ['goal_completed', 'Số mục tiêu hoàn thành'],
                    ['xp_total', 'Tổng XP đạt được'],
                    ['level', 'Đạt cấp độ'],
                    ['boss_passed', 'Số Boss đã vượt'],
                    ['skill_nodes_completed', 'Số node kỹ năng hoàn thành'],
                    ['achievements_unlocked', 'Số thành tựu khác đã mở'],
                    ['distinct_active_days', 'Số ngày có học'],
                    ['streak_days', 'Chuỗi ngày học liên tiếp']
                ], hint: 'Máy chủ tự đếm, học sinh không thể tự khai.' },
                { key: 'target', label: 'Mốc cần đạt', type: 'number', default: 1, group: 'condition', hint: 'Ví dụ: chọn “Tổng XP” và nhập 1000 nghĩa là đạt 1000 XP.' },
                { key: 'stages', label: 'Số bậc', type: 'number', default: 1, group: 'condition', hint: '1 = một lần. Lớn hơn 1 = nhiều bậc (Bậc 1, Bậc 2…).' },
                { key: 'items', label: 'Vật phẩm thưởng', ph: 'frame-laurel, theme-dawn', group: 'extra', hint: 'Mã vật phẩm trong Danh mục phần thưởng, cách nhau bằng dấu phẩy. Có thể để trống.' },
                { key: 'xp_reward', label: 'XP thưởng thêm', type: 'number', default: 0, group: 'extra', hint: 'Để 0 nếu không cộng XP.' },
                { key: 'is_hidden', label: 'Ẩn khỏi danh sách (thành tựu bí mật)', type: 'check', default: false, group: 'extra' },
                { key: 'is_active', label: 'Đang bật (học sinh có thể nhận)', type: 'check', default: true, group: 'extra' },
                { key: 'id', label: 'Mã (tự tạo từ tên)', advanced: true, ph: 'ma_vuong', hint: 'Chỉ đổi khi thật cần. Đổi mã sẽ tạo thành tựu mới, không giữ lịch sử cũ.' },
                { key: 'sort_order', label: 'Thứ tự hiển thị', type: 'number', default: 0, advanced: true }
            ],
            prepare: function (item, c) {
                var cond = (item.conditions || [])[0] || {};
                c.metric.value = cond.metric || 'quiz_completed';
                c.target.value = cond.target || 1;
                c.items.value = ((item.reward && item.reward.items) || []).join(', ');
                c.xp_reward.value = (item.reward && item.reward.xp) || 0;
                c.is_hidden.checked = !!item.is_hidden;
                c.is_active.checked = item.is_active !== false;
                c.sort_order.value = item.sort_order || 0;
            },
            toText: function (item, key) { return item[key] == null ? '' : String(item[key]); },
            collect: function (c) {
                var code = slugify(c.id.value) || slugify(c.name.value);
                var name = String(c.name.value || '').trim();
                if (!name || !code) return null;
                var items = String(c.items.value || '').split(',')
                    .map(function (s) { return s.trim(); }).filter(Boolean);
                var xp = Math.max(0, num(c.xp_reward.value, 0));
                var reward = { items: items };
                if (xp > 0) reward.xp = xp;
                return {
                    id: code,
                    name: name,
                    description: String(c.description.value || '').trim() || name,
                    icon: String(c.icon.value || '').trim() || 'fa-medal',
                    rarity: c.rarity.value || 'common',
                    category: c.category.value || 'learning',
                    conditions: [{
                        metric: c.metric.value || 'quiz_completed',
                        target: Math.max(1, num(c.target.value, 1))
                    }],
                    stages: Math.max(1, Math.min(10, num(c.stages.value, 1))),
                    reward: reward,
                    is_hidden: !!c.is_hidden.checked,
                    is_active: !!c.is_active.checked,
                    sort_order: num(c.sort_order.value, 0)
                };
            },
            toggle: function (item, next) {
                saveAchievement(Object.assign({}, item, { is_active: next }),
                    next ? 'Đã bật thành tựu.' : 'Đã tạm ngừng thành tựu.');
            },
            canDelete: function (item) {
                if (!global.confirm('Xoá hẳn thành tựu “' + item.name + '”?\n' +
                    'Nếu đã có học sinh nhận, hệ thống sẽ từ chối và bạn nên dùng “Tạm ngừng”.')) return;
                call('admin.achievement.delete', { id: item.id }, 'Đã xoá thành tựu.')
                    .then(function () { load(); }, function () { });
            },
            preview: function (p, hh, ic, pill) {
                var box = hh('div', 'bkg-ach is-unlocked rarity-' + (p.rarity || 'common'));
                var top = hh('div', 'bkg-ach-top');
                var badge = hh('span', 'bkg-ach-icon');
                badge.appendChild(ic(p.icon || 'fa-medal'));
                top.appendChild(badge);
                var meta = hh('div', 'bkg-ach-meta');
                meta.appendChild(hh('h4', null, p.name || 'Tên thành tựu'));
                meta.appendChild(hh('span', 'bkg-ach-rarity', RARITY_LABELS[p.rarity] || p.rarity || 'Phổ biến'));
                top.appendChild(meta);
                box.appendChild(top);
                if (p.description) box.appendChild(hh('p', 'bkg-card-desc', p.description));
                var cond = (p.conditions || [])[0];
                if (cond) box.appendChild(hh('p', 'bkc-hint',
                    'Điều kiện: ' + metricLabel(cond.metric) + ' ≥ ' + cond.target));
                var items = (p.reward && p.reward.items) || [];
                if (items.length) box.appendChild(hh('p', 'bkc-hint', 'Thưởng: ' + items.join(', ')));
                return box;
            }
        });

        function saveAchievement(item, okText) {
            call('admin.achievement.save', {
                achievement: {
                    id: item.id,
                    name: item.name,
                    description: item.description || item.name,
                    icon: item.icon || 'fa-medal',
                    rarity: item.rarity || 'common',
                    category: item.category || 'learning',
                    conditions: item.conditions || [],
                    stages: item.stages || 1,
                    reward: item.reward || {},
                    is_hidden: !!item.is_hidden,
                    is_repeatable: !!item.is_repeatable,
                    is_active: item.is_active !== false,
                    sort_order: num(item.sort_order, 0)
                }
            }, okText).then(function () { load(); }, function () { });
        }

        /* ------------------------------------------------------------- Missions */
        definitionCard({
            title: 'Nhiệm vụ',
            subtitle: 'Chu kỳ ngày/tuần tính theo UTC ở máy chủ; người học thấy giờ máy của mình.',
            listKey: 'missions',
            idKey: 'id',
            payloadKey: 'mission',
            action: 'admin.mission.save',
            savedText: 'Đã lưu nhiệm vụ.',
            codeFrom: 'name',
            conditionTitle: '2. Điều kiện & chu kỳ',
            extraTitle: '3. Phần thưởng & trạng thái',
            columns: ['Tên', 'Chu kỳ', 'Điều kiện', 'Cấp tối thiểu', 'XP', 'Trạng thái'],
            row: function (m) {
                return [
                    m.name, m.cadence === 'weekly' ? 'Hằng tuần' : 'Hằng ngày',
                    metricLabel(m.metric) + ' ≥ ' + m.target,
                    m.min_level, (m.reward && m.reward.xp) || 0,
                    m.is_active === false ? 'Đang tắt' : 'Đang bật'
                ];
            },
            fields: [
                { key: 'name', label: 'Tên nhiệm vụ', ph: 'Ví dụ: Một bài quiz hôm nay' },
                { key: 'description', label: 'Mô tả', type: 'textarea', ph: 'Học sinh thấy dòng này.' },
                { key: 'metric', label: 'Điều kiện', type: 'select', group: 'condition', options: [
                    ['quiz_completed', 'Số bài quiz'], ['lesson_study', 'Số bài đã học'],
                    ['listening_completed', 'Số bài luyện nghe'], ['revision_session', 'Số phiên ôn tập'],
                    ['mistake_mastered', 'Số câu sai đã xử lý'], ['goal_completed', 'Số mục tiêu'],
                    ['xp_total', 'Tổng XP'], ['boss_passed', 'Số Boss đã vượt']
                ] },
                { key: 'target', label: 'Mốc cần đạt', type: 'number', default: 1, group: 'condition' },
                { key: 'cadence', label: 'Chu kỳ', type: 'select', group: 'condition', options: [['daily', 'Hằng ngày'], ['weekly', 'Hằng tuần']] },
                { key: 'min_level', label: 'Cấp tối thiểu', type: 'number', default: 1, group: 'condition' },
                { key: 'xp', label: 'XP thưởng', type: 'number', default: 40, group: 'extra' },
                { key: 'category', label: 'Nhóm', type: 'select', group: 'extra', options: [
                    ['learning', 'Học tập'], ['practice', 'Luyện tập'], ['revision', 'Ôn tập'],
                    ['consistency', 'Đều đặn'], ['mastery', 'Tinh thông']
                ] },
                { key: 'difficulty', label: 'Độ khó', type: 'select', group: 'extra', options: [['easy', 'Dễ'], ['normal', 'Bình thường'], ['hard', 'Khó']] },
                { key: 'is_active', label: 'Đang bật', type: 'check', default: true, group: 'extra' },
                { key: 'id', label: 'Mã (tự tạo từ tên)', advanced: true, ph: 'quiz_hom_nay' },
                { key: 'sort_order', label: 'Thứ tự', type: 'number', default: 0, advanced: true }
            ],
            prepare: function (item, c) {
                c.xp.value = (item.reward && item.reward.xp) || 40;
                c.sort_order.value = item.sort_order || 0;
            },
            toText: function (item, key) { return item[key] == null ? '' : String(item[key]); },
            collect: function (c) {
                var code = slugify(c.id.value) || slugify(c.name.value);
                var name = String(c.name.value || '').trim();
                if (!name || !code) return null;
                return {
                    id: code,
                    name: name,
                    description: String(c.description.value || '').trim() || name,
                    category: c.category.value || 'learning',
                    difficulty: c.difficulty.value || 'normal',
                    metric: c.metric.value || 'quiz_completed',
                    target: Math.max(1, num(c.target.value, 1)),
                    cadence: c.cadence.value === 'weekly' ? 'weekly' : 'daily',
                    reward: { xp: Math.max(0, num(c.xp.value, 0)) },
                    min_level: Math.max(1, num(c.min_level.value, 1)),
                    is_active: !!c.is_active.checked,
                    sort_order: num(c.sort_order.value, 0)
                };
            },
            preview: function (p, hh, ic) {
                var box = hh('div', 'bkg-card is-mission');
                var head = hh('div', 'bkg-card-head');
                head.appendChild(hh('h4', null, p.name || 'Tên nhiệm vụ'));
                head.appendChild(hh('span', 'bkg-pill is-info', p.cadence === 'weekly' ? 'Hằng tuần' : 'Hằng ngày'));
                box.appendChild(head);
                if (p.description) box.appendChild(hh('p', 'bkg-card-desc', p.description));
                var cond = p.metric ? 'Điều kiện: ' + metricLabel(p.metric) + ' ≥ ' + p.target : '';
                if (cond) box.appendChild(hh('p', 'bkc-hint', cond));
                return box;
            }
        });

        /* ------------------------------------------------------------ Skill tree */
        definitionCard({
            title: 'Cây kỹ năng',
            subtitle: 'Node mở theo chỉ số thật và theo thứ tự node trước. Máy chủ không cho tự mở node.',
            listKey: 'nodes',
            idKey: 'id',
            payloadKey: 'node',
            action: 'admin.node.save',
            savedText: 'Đã lưu node kỹ năng.',
            codeFrom: 'name',
            conditionTitle: '2. Điều kiện mở',
            extraTitle: '3. Phần thưởng & trạng thái',
            columns: ['Tên', 'Nhánh', 'Điều kiện', 'Cần trước', 'Trạng thái'],
            row: function (n) {
                return [
                    n.name, n.branch, metricLabel(n.metric) + ' ≥ ' + n.target,
                    (n.requires || []).join(', ') || '—', n.is_active === false ? 'Đang tắt' : 'Đang bật'
                ];
            },
            fields: [
                { key: 'name', label: 'Tên node', ph: 'Ví dụ: Nền tảng vững chắc' },
                { key: 'branch', label: 'Nhánh', type: 'select', options: [
                    ['knowledge', 'Kiến thức'], ['practice', 'Luyện tập'], ['memory', 'Ghi nhớ'],
                    ['consistency', 'Đều đặn'], ['mastery', 'Tinh thông']
                ] },
                { key: 'description', label: 'Mô tả', ph: 'Mô tả ngắn' },
                { key: 'icon', label: 'Biểu tượng', ph: 'fa-circle-nodes' },
                { key: 'metric', label: 'Điều kiện', type: 'select', group: 'condition', options: [
                    ['quiz_completed', 'Số bài quiz'], ['lesson_study', 'Số bài đã học'],
                    ['revision_session', 'Số phiên ôn tập'], ['mistake_mastered', 'Số câu sai đã xử lý'],
                    ['xp_total', 'Tổng XP'], ['boss_passed', 'Số Boss đã vượt'],
                    ['distinct_active_days', 'Số ngày có học'], ['streak_days', 'Chuỗi ngày học']
                ] },
                { key: 'target', label: 'Mốc', type: 'number', default: 1, group: 'condition' },
                { key: 'requires', label: 'Node cần hoàn thành trước', ph: 'knowledge_1, knowledge_2', group: 'condition', hint: 'Để trống nếu đây là node đầu nhánh.' },
                { key: 'items', label: 'Vật phẩm thưởng', ph: 'frame-laurel', group: 'extra' },
                { key: 'is_active', label: 'Đang bật', type: 'check', default: true, group: 'extra' },
                { key: 'id', label: 'Mã (tự tạo từ tên)', advanced: true, ph: 'knowledge_1' },
                { key: 'sort_order', label: 'Thứ tự', type: 'number', default: 100, advanced: true }
            ],
            prepare: function (item, c) {
                c.requires.value = (item.requires || []).join(', ');
                c.items.value = ((item.reward && item.reward.items) || []).join(', ');
                c.sort_order.value = item.sort_order || 0;
            },
            toText: function (item, key) { return item[key] == null ? '' : String(item[key]); },
            collect: function (c) {
                var code = slugify(c.id.value) || slugify(c.name.value);
                var name = String(c.name.value || '').trim();
                if (!name || !code) return null;
                return {
                    id: code,
                    branch: c.branch.value || 'knowledge',
                    name: name,
                    description: String(c.description.value || '').trim(),
                    icon: String(c.icon.value || '').trim() || 'fa-circle-nodes',
                    metric: c.metric.value || 'quiz_completed',
                    target: Math.max(1, num(c.target.value, 1)),
                    requires: String(c.requires.value || '').split(',').map(function (s) {
                        return normalizeCode(s);
                    }).filter(Boolean),
                    reward: {
                        items: String(c.items.value || '').split(',').map(function (s) {
                            return s.trim();
                        }).filter(Boolean)
                    },
                    sort_order: num(c.sort_order.value, 100),
                    is_active: !!c.is_active.checked
                };
            },
            preview: function (p, hh, ic) {
                var li = hh('div', 'bkg-node is-in_progress');
                var head = hh('div', 'bkg-node-head');
                var icn = hh('span', 'bkg-node-icon');
                icn.appendChild(ic(p.icon || 'fa-circle-nodes'));
                head.appendChild(icn);
                var info = hh('div', 'bkg-node-info');
                info.appendChild(hh('b', null, p.name || 'Tên node'));
                info.appendChild(hh('span', 'bkg-muted', p.description || ''));
                head.appendChild(info);
                li.appendChild(head);
                if (p.metric) li.appendChild(hh('p', 'bkg-node-note',
                    'Mở khi ' + metricLabel(p.metric) + ' ≥ ' + p.target + '.'));
                return li;
            }
        });

        /* ----------------------------------------------------------- Reward catalog */
        definitionCard({
            title: 'Danh mục phần thưởng',
            subtitle: 'Vật phẩm trang trí, không tạo lợi thế trong hoạt động học tập. Badge/Title cũ giữ nguyên.',
            listKey: 'rewards',
            idKey: 'id',
            payloadKey: 'reward',
            action: 'admin.reward.save',
            savedText: 'Đã lưu phần thưởng.',
            codeFrom: 'name',
            extraTitle: '2. Hiển thị & trạng thái',
            columns: ['Tên', 'Loại', 'Độ hiếm', 'Khung hồ sơ', 'Trạng thái'],
            row: function (r) {
                return [
                    r.name, r.kind, RARITY_LABELS[r.rarity] || r.rarity,
                    r.kind === 'frame'
                        ? ((r.metadata && r.metadata.profile_frame) || '—')
                        : '—',
                    r.is_active === false ? 'Đang tắt' : 'Đang bật'
                ];
            },
            fields: [
                { key: 'name', label: 'Tên vật phẩm', ph: 'Ví dụ: Khung Nguyệt Quế' },
                { key: 'kind', label: 'Loại', type: 'select', options: [
                    ['frame', 'Khung avatar'], ['theme', 'Giao diện'], ['decoration', 'Trang trí'],
                    ['background', 'Hình nền'], ['title', 'Danh hiệu'], ['badge', 'Huy hiệu'],
                    ['xp_bonus', 'Thưởng XP']
                ] },
                { key: 'description', label: 'Mô tả', ph: 'Mô tả ngắn' },
                { key: 'icon', label: 'Biểu tượng', ph: 'fa-gift' },
                { key: 'rarity', label: 'Độ hiếm', type: 'select', options: [
                    ['common', 'Phổ biến'], ['uncommon', 'Ít gặp'], ['rare', 'Hiếm'],
                    ['epic', 'Cực hiếm'], ['legendary', 'Huyền thoại']
                ] },
                { key: 'profile_frame', label: 'Khung hồ sơ tương ứng', group: 'extra', ph: 'wreath', hint: 'Chỉ dùng cho loại “Khung avatar”. Mã khung trong bộ khung của hồ sơ (ví dụ wreath, crown, sakura).' },
                { key: 'is_active', label: 'Đang bật', type: 'check', default: true, group: 'extra' },
                { key: 'id', label: 'Mã (tự tạo từ tên)', advanced: true, ph: 'frame_nguyet_que' },
                { key: 'sort_order', label: 'Thứ tự', type: 'number', default: 100, advanced: true }
            ],
            prepare: function (item, c) {
                c.profile_frame.value = (item.metadata && item.metadata.profile_frame) || '';
                c.sort_order.value = item.sort_order || 0;
            },
            toText: function (item, key) { return item[key] == null ? '' : String(item[key]); },
            collect: function (c) {
                var code = slugify(c.id.value) || slugify(c.name.value);
                var name = String(c.name.value || '').trim();
                if (!name || !code) return null;
                var metadata = {};
                var pf = String(c.profile_frame.value || '').trim();
                if (c.kind.value === 'frame' && pf) metadata.profile_frame = slugify(pf) || pf;
                return {
                    id: code,
                    kind: c.kind.value || 'frame',
                    name: name,
                    description: String(c.description.value || '').trim(),
                    icon: String(c.icon.value || '').trim() || 'fa-gift',
                    rarity: c.rarity.value || 'common',
                    metadata: metadata,
                    sort_order: num(c.sort_order.value, 100),
                    is_active: !!c.is_active.checked
                };
            },
            preview: function (p, hh, ic) {
                var box = hh('div', 'bkg-card is-item');
                var head = hh('div', 'bkg-card-head');
                var icn = hh('span', 'bkg-item-icon');
                icn.appendChild(ic(p.icon || 'fa-gift'));
                head.appendChild(icn);
                var info = hh('div');
                info.appendChild(hh('h4', null, p.name || 'Tên vật phẩm'));
                info.appendChild(hh('span', 'bkg-ach-rarity',
                    (RARITY_LABELS[p.rarity] || 'Phổ biến') + ' · ' + (p.kind || 'frame')));
                head.appendChild(info);
                box.appendChild(head);
                if (p.description) box.appendChild(hh('p', 'bkg-card-desc', p.description));
                return box;
            }
        });

        /* ----------------------------------------------------------- Boss challenge */
        var bossCard = card('Thử thách Boss', [
            btn('Soạn Boss mới', 'bkc-btn-primary', function () { bossEditor(null); }, 'fa-plus')
        ], 'Chỉ cần nhập tên, nội dung và câu hỏi. Mã Boss được tạo tự động từ tên. Câu hỏi và đáp án chỉ nằm ở máy chủ.');
        pane.appendChild(bossCard.root);
        var bossTableHost = h('div');
        bossCard.body.appendChild(bossTableHost);
        var bossSearch = input('search', 'Tìm Boss theo tên hoặc mã…', '');
        bossSearch.setAttribute('aria-label', 'Tìm Boss');
        bossCard.body.appendChild(bossSearch);
        var bossForm = h('div', 'bkc-subcard bkc-editor');
        bossCard.body.appendChild(bossForm);
        var bossTableWrap = h('div');
        bossCard.body.appendChild(bossTableWrap);
        bossTableHost.appendChild(bossTableWrap);

        function bossTakenSlugs(exceptSlug) {
            return ((defs && defs.challenges) || [])
                .map(function (c) { return String(c.slug); })
                .filter(function (s) { return s !== exceptSlug; });
        }

        function bossEditor(item) {
            bossForm.textContent = '';
            bossForm.classList.add('is-open');
            var isNew = !item;
            bossForm.appendChild(h('h4', 'bkc-sub-title',
                item ? 'Chỉnh sửa Boss: ' + item.name : 'Soạn Boss mới'));

            var basics = h('div', 'bkc-form-grid');
            bossForm.appendChild(h('h5', 'bkc-group-title', '1. Thông tin Boss'));
            bossForm.appendChild(basics);
            var content = h('div', 'bkc-form-grid');
            bossForm.appendChild(h('h5', 'bkc-group-title', '2. Điều kiện & độ khó'));
            bossForm.appendChild(content);

            var f = {};
            function addField(key, label, control, hint, group) {
                f[key] = control;
                (group === 'content' ? content : basics).appendChild(fieldRow(label, control, hint));
            }
            var nameInput = txt(item ? item.name : '', 'Ví dụ: Ma Vương');
            addField('name', 'Tên Boss', nameInput, 'Học sinh thấy tên này. Mã được tạo tự động từ tên.');
            addField('kind', 'Loại thử thách', selectInput([
                ['subject', 'Theo môn'], ['chapter', 'Theo chương'], ['knowledge', 'Kiến thức'],
                ['revision', 'Ôn tập'], ['weekly', 'Hằng tuần']
            ], item ? item.kind : 'subject'), '', 'content');
            addField('subject', 'Môn học', txt(item ? item.subject : '', 'Ví dụ: Toán'), '', 'content');
            addField('chapter', 'Chương / chủ đề', txt(item ? item.chapter : '', 'Ví dụ: Hàm số bậc hai'), '', 'content');
            addField('difficulty', 'Độ khó', selectInput([
                ['easy', 'Dễ'], ['normal', 'Bình thường'], ['hard', 'Khó']
            ], item ? item.difficulty : 'normal'), '', 'content');
            addField('pass_score', 'Điểm đạt (%)', numberInput(item ? item.pass_score : 70),
                'Ví dụ 70 nghĩa là phải đúng từ 70% mới được tính vượt Boss.', 'content');
            addField('max_attempts', 'Số lượt thử tối đa', numberInput(item ? item.max_attempts : 3), '', 'content');
            var active = checkbox('Đang mở cho học sinh', item ? item.is_active !== false : true);
            f.is_active = active.input;
            content.appendChild(active.root);

            /* Cài đặt nâng cao */
            var details = h('details', 'bkc-advanced');
            details.appendChild(h('summary', null, 'Cài đặt nâng cao (dành cho kỹ thuật)'));
            var advBody = h('div', 'bkc-advanced-body');
            details.appendChild(advBody);
            var slugInput = txt(item ? item.slug : '', 'ma_vuong');
            var slugHint = h('p', 'bkc-hint', 'Mã tự tạo từ tên. Chỉ đổi khi thật cần — mã cũ đang được dùng để mở thử thách.');
            var slugEdited = !!item;
            f.slug = slugInput;
            advBody.appendChild(fieldRow('Mã Boss (tự tạo từ tên)', slugInput, slugHint));
            var closesInput = txt(item && item.closes_at ? String(item.closes_at).slice(0, 16) : '', '');
            f.closes_at = closesInput;
            advBody.appendChild(fieldRow('Tự đóng lúc (để trống = không đóng)', closesInput,
                'Định dạng ngày-giờ của trình duyệt. Không bắt buộc.'));
            bossForm.appendChild(details);

            /* Câu hỏi */
            bossForm.appendChild(h('h5', 'bkc-group-title', '3. Câu hỏi'));
            var qBox = textarea('Mỗi dòng một câu: Nội dung | Phương án 1 | Phương án 2 | … | số thứ tự đáp án đúng | Giải thích',
                '', 6);
            bossForm.appendChild(fieldRow('Danh sách câu hỏi', qBox,
                'Ví dụ: Thủ đô Việt Nam là gì? | Hà Nội | Huế | Đà Nẵng | 1 | Hà Nội là thủ đô.'));
            if (item) {
                qBox.value = '';
                qBox.placeholder = 'Nhập lại toàn bộ câu hỏi khi sửa (đáp án không hiển thị để tránh lộ).';
            }
            var countHint = h('p', 'bkc-hint', 'Đã nhận 0 câu hỏi hợp lệ.');
            bossForm.appendChild(countHint);

            /* Xem trước */
            bossForm.appendChild(h('h5', 'bkc-group-title', '4. Xem trước'));
            var previewBody = h('div', 'bkc-preview-body');
            bossForm.appendChild(previewBody);

            var errorBox = h('div');
            bossForm.appendChild(errorBox);

            function codeNow() {
                var code = slugify(slugInput.value) || slugify(nameInput.value);
                return code;
            }
            function updateHint() {
                var code = codeNow();
                var taken = bossTakenSlugs(item ? String(item.slug) : '');
                if (!code) {
                    slugHint.className = 'bkc-hint';
                    slugHint.textContent = 'Mã tự tạo từ tên Boss.';
                    return true;
                }
                if (taken.indexOf(code) === -1) {
                    slugHint.className = 'bkc-hint';
                    slugHint.textContent = 'Mã Boss sẽ dùng: ' + code;
                    return true;
                }
                var suggestion = suggestCode(code, taken);
                slugHint.className = 'bkc-field-error';
                slugHint.textContent = 'Mã “' + code + '” đã tồn tại. Đề xuất: “' + suggestion + '”.';
                var use = h('button', 'bkc-btn-ghost', 'Dùng mã đề xuất');
                use.type = 'button';
                use.addEventListener('click', function () {
                    slugInput.value = suggestion;
                    slugEdited = true;
                    updateHint();
                });
                slugHint.appendChild(use);
                return false;
            }
            function refreshPreview() {
                previewBody.textContent = '';
                var qs = parseQuestions(qBox.value);
                countHint.textContent = 'Đã nhận ' + qs.length + ' câu hỏi hợp lệ.';
                var box = h('div', 'bkg-card is-boss');
                var head = h('div', 'bkg-card-head');
                head.appendChild(h('h4', null, nameInput.value || 'Tên Boss'));
                head.appendChild(pill('Điểm đạt ' + num(f.pass_score.value, 70) + '%', 'warn'));
                box.appendChild(head);
                var metaBits = [];
                var kindLabels = {
                    subject: 'Theo môn', chapter: 'Theo chương', knowledge: 'Kiến thức',
                    revision: 'Ôn tập', weekly: 'Hằng tuần'
                };
                metaBits.push(kindLabels[f.kind.value] || f.kind.value);
                if (f.subject.value) metaBits.push(f.subject.value);
                if (f.chapter.value) metaBits.push(f.chapter.value);
                var diffLabels = { easy: 'Dễ', normal: 'Bình thường', hard: 'Khó' };
                metaBits.push(diffLabels[f.difficulty.value] || f.difficulty.value);
                box.appendChild(h('p', 'bkc-hint', metaBits.join(' · ')));
                box.appendChild(h('p', 'bkc-hint', 'Mã Boss: ' + (codeNow() || '—')));
                box.appendChild(h('p', 'bkc-hint',
                    qs.length + ' câu hỏi · tối đa ' + num(f.max_attempts.value, 3) + ' lượt thử'));
                previewBody.appendChild(box);
            }
            nameInput.addEventListener('input', function () {
                if (!slugEdited) slugInput.value = slugify(nameInput.value);
                updateHint();
                refreshPreview();
            });
            slugInput.addEventListener('input', function () {
                slugEdited = true;
                updateHint();
                refreshPreview();
            });
            [f.kind, f.subject, f.chapter, f.difficulty, f.pass_score, f.max_attempts, qBox].forEach(function (el) {
                el.addEventListener('input', refreshPreview);
                el.addEventListener('change', refreshPreview);
            });
            if (!slugInput.value) slugInput.value = slugify(nameInput.value);
            updateHint();
            refreshPreview();

            var actions = h('div', 'bkc-editor-actions');
            var saveBtn = btn('Lưu Boss', 'bkc-btn-primary', function () {
                errorBox.textContent = '';
                var code = codeNow();
                var name = String(nameInput.value || '').trim();
                var questions = parseQuestions(qBox.value);
                if (!name) { errorBox.appendChild(required('Hãy nhập tên Boss.')); return; }
                if (!code) { errorBox.appendChild(required('Chưa tạo được mã Boss từ tên. Hãy nhập tên có chữ hoặc số.')); return; }
                if (takenCheckFails(code)) {
                    errorBox.appendChild(required('Mã Boss bị trùng. Hãy bấm “Dùng mã đề xuất” hoặc đổi tên.'));
                    return;
                }
                if (!questions.length) {
                    errorBox.appendChild(required('Cần ít nhất một câu hỏi đúng định dạng. Xem ví dụ ngay dưới ô câu hỏi.'));
                    return;
                }
                var payload = {
                    slug: code,
                    name: name,
                    kind: f.kind.value || 'subject',
                    subject: String(f.subject.value || '').trim(),
                    chapter: String(f.chapter.value || '').trim(),
                    difficulty: f.difficulty.value || 'normal',
                    pass_score: Math.max(1, Math.min(100, num(f.pass_score.value, 70))),
                    max_attempts: Math.max(1, Math.min(50, num(f.max_attempts.value, 3))),
                    closes_at: f.closes_at.value ? new Date(f.closes_at.value).toISOString() : null,
                    is_active: !!f.is_active.checked,
                    questions: questions
                };
                saveBtn.disabled = true;
                var body = { challenge: payload };
                if (isNew) body.expect_new = true;
                call('admin.challenge.save', body, isNew ? 'Đã tạo Boss.' : 'Đã cập nhật Boss.')
                    .then(function () { load(); }, function () { })
                    .then(function () { saveBtn.disabled = false; });
            }, 'fa-floppy-disk');
            function takenCheckFails(code) {
                return bossTakenSlugs(item ? String(item.slug) : '').indexOf(code) !== -1;
            }
            actions.appendChild(saveBtn);
            actions.appendChild(btn('Hủy', 'bkc-btn-ghost', function () {
                bossForm.textContent = '';
                bossForm.classList.remove('is-open');
            }, 'fa-xmark'));
            bossForm.appendChild(actions);
            try { nameInput.focus(); } catch (e) { }
        }

        function paintBoss() {
            bossTableWrap.textContent = '';
            var q = String(bossSearch.value || '').toLowerCase().trim();
            var list = (defs && defs.challenges) || [];
            if (q) {
                list = list.filter(function (c) {
                    return String(c.name + ' ' + c.slug).toLowerCase().indexOf(q) >= 0;
                });
            }
            var t = table(['Tên Boss', 'Mã', 'Loại', 'Điểm đạt', 'Số câu', 'Lượt', 'Trạng thái', '']);
            if (!list.length) emptyRow(t.tbody, 8, 'Chưa có Boss nào. Dùng “Soạn Boss mới” để tạo.');
            list.forEach(function (c) {
                var tr = h('tr');
                var kindLabels = {
                    subject: 'Theo môn', chapter: 'Theo chương', knowledge: 'Kiến thức',
                    revision: 'Ôn tập', weekly: 'Hằng tuần'
                };
                [c.name, c.slug, kindLabels[c.kind] || c.kind, c.pass_score + '%',
                    (c.boss_questions && c.boss_questions[0] && c.boss_questions[0].count) || 0,
                    c.max_attempts, c.is_active ? 'Đang mở' : 'Đã đóng'].forEach(function (v) {
                        var td = h('td');
                        td.textContent = v == null ? '—' : String(v);
                        tr.appendChild(td);
                    });
                var actions = h('td', 'bkc-row-actions');
                actions.appendChild(btn('Sửa', 'bkc-btn-ghost', function () {
                    bossEditor(c);
                    scrollToEditor(bossForm);
                }, 'fa-pen'));
                actions.appendChild(btn(c.is_active ? 'Lưu trữ' : 'Mở lại', 'bkc-btn-ghost', function () {
                    call('admin.challenge.delete', { slug: c.slug },
                        c.is_active ? 'Đã lưu trữ Boss (không xoá câu hỏi và lịch sử).' : 'Đã đóng thử thách.')
                        .then(load, function () { });
                }, 'fa-box-archive'));
                tr.appendChild(actions);
                t.tbody.appendChild(tr);
            });
            bossTableWrap.appendChild(t.wrap);
        }
        painters.push(paintBoss);
        bossSearch.addEventListener('input', paintBoss);

        /* --------------------------------------------------------- Founder tools */
        if (U.isFounder && U.isFounder()) {
            var founderCard = card('Founder — điều chỉnh XP & nhật ký', [
                btn('Tải nhật ký', 'bkc-btn-ghost', loadLogs, 'fa-clock-rotate-left')
            ], 'Chỉ Founder. Mọi điều chỉnh đều ghi sổ giao dịch, audit log và bắt buộc có lý do.');
            pane.appendChild(founderCard.root);

            var adjust = h('div', 'bkc-form-grid');
            var studentSelect = h('select', 'bkc-input');
            studentSelect.appendChild(h('option', null, 'Chọn học sinh…'));
            studentSelect.value = '';
            var searchInput = input('text', 'Tìm học sinh', '');
            var amountInput = numberInput('');
            var reasonInput = txt('', 'Lý do điều chỉnh (bắt buộc)');
            adjust.appendChild(fieldRow('Tìm học sinh', searchInput));
            adjust.appendChild(fieldRow('Học sinh', studentSelect));
            adjust.appendChild(fieldRow('Số XP (âm để trừ)', amountInput));
            adjust.appendChild(fieldRow('Lý do', reasonInput));
            founderCard.body.appendChild(adjust);

            searchInput.addEventListener('change', function () {
                call('admin.students.list', { q: searchInput.value }, null).then(function (res) {
                    studentSelect.textContent = '';
                    (res.students || []).forEach(function (s) {
                        var opt = h('option', null, s.display_name + ' · ' + (s.user_progression && s.user_progression.level ? 'cấp ' + s.user_progression.level : 'chưa có XP'));
                        opt.value = s.id;
                        studentSelect.appendChild(opt);
                    });
                    if (!(res.students || []).length) studentSelect.appendChild(h('option', null, 'Không tìm thấy học sinh'));
                }, function () { });
            }, false);

            founderCard.body.appendChild(btn('Điều chỉnh XP', 'bkc-btn-primary', function () {
                if (!studentSelect.value) { toast('Hãy chọn học sinh.', 'error'); return; }
                call('admin.xp.adjust', {
                    student_id: studentSelect.value,
                    amount: num(amountInput.value, 0),
                    reason: reasonInput.value
                }, 'Đã điều chỉnh XP và ghi audit.').then(function () { loadLogs(); load(); }, function () { });
            }, 'fa-scale-balanced'));

            var logsHost = h('div');
            founderCard.body.appendChild(logsHost);
            function loadLogs() {
                call('admin.logs', { limit: 40 }, null).then(function (res) {
                    logsHost.textContent = '';
                    var t = table(['Thời điểm', 'Hành động', 'Học sinh', 'Chi tiết']);
                    (res.logs || []).forEach(function (l) {
                        cellRow(t.tbody, [
                            new Date(l.created_at).toLocaleString('vi-VN'),
                            l.action,
                            l.student_id || '—',
                            JSON.stringify(l.detail || {})
                        ]);
                    });
                    if (!(res.logs || []).length) emptyRow(t.tbody, 4, 'Chưa có bản ghi.');
                    logsHost.appendChild(t.wrap);
                }, function () { });
            }
        }

        /* ------------------------------------------------------------------ Load */
        function paintDefs() {
            painters.forEach(function (paint) { try { paint(); } catch (e) { } });
        }

        function load() {
            loaded = true;
            U.api('admin.overview').then(function (res) {
                paintOverview(res);
                if (res && res.config) paintConfig(res.config);
            }, function (err) {
                statsHost.textContent = '';
                statsHost.appendChild(alertBox((err && err.message) || 'Không tải được tổng quan gamification.', 'error'));
            });
            U.api('admin.defs.list').then(function (res) {
                defs = res;
                paintDefs();
            }, function (err) {
                toast((err && err.message) || 'Không tải được định nghĩa gamification.', 'error');
            });
        }

        load();
        if (!loaded) paintDefs();
    }

    global.BKGamificationAdmin = {
        render: render,
        slugify: slugify,
        suggestCode: suggestCode,
        parseQuestions: parseQuestions,
        normalizeCode: normalizeCode,
        __ready: true
    };
})(typeof window !== 'undefined' ? window : this);
