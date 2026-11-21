/* =========================================================================
   Bá Khí — bk-devboard-gamification.js (8.3.0)
   Mô-đun quản trị Gamification nằm trong Administrator / Founder Dashboard.

   Tách khỏi bk-devboard.js để dashboard giữ nguyên kích thước; dashboard chỉ
   gọi BKGamificationAdmin.render(pane, helpers). Mọi thao tác ghi đều đi qua
   Edge Function gamification-api với x-admin-token; quyền Founder kiểm tra ở
   máy chủ, không dựa vào giao diện.
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;

    function num(v, d) {
        var n = Number(v);
        return isFinite(n) ? n : d;
    }

    function render(pane, U) {
        var h = U.h, icon = U.icon, btn = U.btn, card = U.card, table = U.table,
            emptyRow = U.emptyRow, fieldRow = U.fieldRow, input = U.input,
            textarea = U.textarea, checkbox = U.checkbox, alertBox = U.alertBox,
            pill = U.pill, statCard = U.statCard, toast = U.toast;

        var defs = null;
        var painters = [];
        var loaded = false;

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

        /* ------------------------------------------------------------ Overview */
        var hero = card('Gamification 2.0', [
            btn('Làm mới', 'bkc-btn-ghost', function () { load(); }, 'fa-rotate')
        ], 'XP, cấp độ, cây kỹ năng, thành tựu, nhiệm vụ, thử thách Boss và kho vật phẩm.');
        pane.appendChild(hero.root);
        hero.body.appendChild(alertBox(
            'Học sinh KHÔNG ghi trực tiếp bảng tiến trình: mọi thay đổi đi qua hàm bk_gam_* trong Postgres, ' +
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
        function definitionCard(spec) {
            var box = card(spec.title, [
                btn('Tạo mới', 'bkc-btn-ghost', function () { editor.load(null); }, 'fa-plus')
            ], spec.subtitle);
            pane.appendChild(box.root);

            var tableHost = h('div');
            box.body.appendChild(tableHost);

            var form = h('div', 'bkc-subcard');
            form.appendChild(h('h4', 'bkc-sub-title', spec.editorTitle || 'Soạn / sửa'));
            var grid = h('div', 'bkc-form-grid');
            var controls = {};
            spec.fields.forEach(function (f) {
                var control;
                if (f.type === 'textarea') {
                    control = textarea(f.ph || '', '', 5);
                } else if (f.type === 'number') {
                    control = numberInput('');
                } else if (f.type === 'check') {
                    control = checkbox(f.label, false).input;
                    grid.appendChild(checkbox(f.label, false, function (v) { control.checked = v; }).root);
                    controls[f.key] = control;
                    return;
                } else {
                    control = txt('', f.ph || '');
                }
                if (f.type === 'check') return;
                controls[f.key] = control;
                grid.appendChild(fieldRow(f.label, control, f.hint));
            });
            form.appendChild(grid);

            var editor = {
                load: function (item) {
                    spec.fields.forEach(function (f) {
                        var c = controls[f.key];
                        if (!c) return;
                        var v = item ? item[f.key] : '';
                        if (f.type === 'check') c.checked = item ? item[f.key] !== false : true;
                        else if (f.type === 'number') c.value = item ? num(v, 0) : (f.default != null ? f.default : '');
                        else c.value = v == null ? '' : (f.type === 'textarea' ? spec.toText(item) : v);
                    });
                    form.classList.add('is-open');
                    form.setAttribute('data-editing', item && item[spec.idKey] ? String(item[spec.idKey]) : '');
                    try { grid.querySelector('input, textarea, select').focus(); } catch (e) { }
                }
            };

            var save = btn('Lưu', 'bkc-btn-primary', function () {
                var payload = spec.collect(controls);
                if (!payload) { toast('Hãy điền đủ thông tin bắt buộc.', 'error'); return; }
                save.disabled = true;
                call(spec.action, { [spec.payloadKey]: payload }, spec.savedText || 'Đã lưu.')
                    .then(function () { load(); }, function () { })
                    .then(function () { save.disabled = false; });
            }, 'fa-floppy-disk');
            form.appendChild(save);
            box.body.appendChild(form);

            function paint() {
                tableHost.textContent = '';
                var t = table(spec.columns);
                var list = (defs && defs[spec.listKey]) || [];
                if (!list.length) emptyRow(t.tbody, spec.columns.length, 'Chưa có dữ liệu.');
                list.forEach(function (item) {
                    var tr = h('tr');
                    spec.row(item).forEach(function (value) {
                        var td = h('td');
                        if (value && value.nodeType) td.appendChild(value);
                        else td.textContent = value == null ? '—' : String(value);
                        tr.appendChild(td);
                    });
                    var actions = h('td');
                    actions.appendChild(btn('Sửa', 'bkc-btn-ghost', function () { spec.prepare(item, editor); }, 'fa-pen'));
                    tr.appendChild(actions);
                    t.tbody.appendChild(tr);
                });
                tableHost.appendChild(t.wrap);
            }
            painters.push(paint);
            paint();
            return box;
        }

        /* --------------------------------------------------------- Achievements */
        definitionCard({
            title: 'Thành tựu',
            subtitle: 'Điều kiện tính từ chỉ số máy chủ (sổ XP, Boss, cây kỹ năng). Không có điều kiện do client gửi.',
            listKey: 'achievements',
            idKey: 'id',
            payloadKey: 'achievement',
            action: 'admin.achievement.save',
            columns: ['Mã', 'Tên', 'Nhóm', 'Độ hiếm', 'Điều kiện', 'Bậc', 'Bật'],
            row: function (a) {
                var cond = (a.conditions || []).map(function (c) { return c.metric + ' ≥ ' + c.target; }).join('; ');
                return [a.id, a.name, a.category, a.rarity, cond, a.stages, a.is_active ? 'Có' : 'Không'];
            },
            fields: [
                { key: 'id', label: 'Mã', ph: 'ach-vi-du' },
                { key: 'name', label: 'Tên', ph: 'Tên thành tựu' },
                { key: 'category', label: 'Nhóm', ph: 'quiz | reading | revision | consistency | boss | milestone | skill | event' },
                { key: 'rarity', label: 'Độ hiếm', ph: 'common | uncommon | rare | epic | legendary' },
                { key: 'icon', label: 'Icon FA', ph: 'fa-medal' },
                { key: 'metric', label: 'Chỉ số', ph: 'quiz_completed' },
                { key: 'target', label: 'Mốc', type: 'number', default: 1 },
                { key: 'stages', label: 'Số bậc', type: 'number', default: 1 },
                { key: 'items', label: 'Vật phẩm thưởng', ph: 'frame-laurel, theme-dawn' },
                { key: 'is_hidden', label: 'Thành tựu ẩn', type: 'check' },
                { key: 'is_active', label: 'Đang bật', type: 'check' }
            ],
            prepare: function (item, editor) {
                editor.load(Object.assign({}, item, {
                    metric: (item.conditions && item.conditions[0] && item.conditions[0].metric) || '',
                    target: (item.conditions && item.conditions[0] && item.conditions[0].target) || 1,
                    items: ((item.reward && item.reward.items) || []).join(', ')
                }));
            },
            collect: function (c) {
                var id = String(c.id.value || '').trim();
                var metric = String(c.metric.value || '').trim();
                if (!id || !metric) return null;
                return {
                    id: id,
                    name: c.name.value || id,
                    description: c.name.value || '',
                    icon: c.icon.value || 'fa-medal',
                    rarity: c.rarity.value || 'common',
                    category: c.category.value || 'learning',
                    conditions: [{ metric: metric, target: Math.max(1, num(c.target.value, 1)) }],
                    stages: Math.max(1, num(c.stages.value, 1)),
                    reward: { items: String(c.items.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean) },
                    is_hidden: !!c.is_hidden.checked,
                    is_active: !!c.is_active.checked,
                    sort_order: 0
                };
            },
            toText: function () { return ''; }
        });

        /* ------------------------------------------------------------- Missions */
        definitionCard({
            title: 'Nhiệm vụ',
            subtitle: 'Chu kỳ ngày/tuần tính theo UTC ở máy chủ; người học thấy giờ máy của mình.',
            listKey: 'missions',
            idKey: 'id',
            payloadKey: 'mission',
            action: 'admin.mission.save',
            columns: ['Mã', 'Tên', 'Chu kỳ', 'Chỉ số', 'Mốc', 'Cấp tối thiểu', 'Bật'],
            row: function (m) {
                return [m.id, m.name, m.cadence, m.metric, m.target, m.min_level, m.is_active ? 'Có' : 'Không'];
            },
            fields: [
                { key: 'id', label: 'Mã', ph: 'mission-vi-du' },
                { key: 'name', label: 'Tên', ph: 'Tên nhiệm vụ' },
                { key: 'category', label: 'Nhóm', ph: 'learning | practice | revision | consistency | mastery' },
                { key: 'difficulty', label: 'Độ khó', ph: 'easy | normal | hard' },
                { key: 'metric', label: 'Chỉ số', ph: 'quiz_completed' },
                { key: 'target', label: 'Mốc', type: 'number', default: 1 },
                { key: 'cadence', label: 'Chu kỳ', ph: 'daily | weekly' },
                { key: 'min_level', label: 'Cấp tối thiểu', type: 'number', default: 1 },
                { key: 'xp', label: 'XP thưởng', type: 'number', default: 40 },
                { key: 'is_active', label: 'Đang bật', type: 'check' }
            ],
            prepare: function (item, editor) {
                editor.load(Object.assign({}, item, { xp: (item.reward && item.reward.xp) || 40 }));
            },
            collect: function (c) {
                var id = String(c.id.value || '').trim();
                var metric = String(c.metric.value || '').trim();
                if (!id || !metric) return null;
                return {
                    id: id,
                    name: c.name.value || id,
                    description: c.name.value || '',
                    category: c.category.value || 'learning',
                    difficulty: c.difficulty.value || 'normal',
                    metric: metric,
                    target: Math.max(1, num(c.target.value, 1)),
                    cadence: c.cadence.value === 'weekly' ? 'weekly' : 'daily',
                    reward: { xp: Math.max(0, num(c.xp.value, 0)) },
                    min_level: Math.max(1, num(c.min_level.value, 1)),
                    is_active: !!c.is_active.checked,
                    sort_order: 0
                };
            },
            toText: function () { return ''; }
        });

        /* ------------------------------------------------------------ Skill tree */
        definitionCard({
            title: 'Cây kỹ năng',
            subtitle: 'Node mở theo chỉ số thật và theo thứ tự node trước. Máy chủ không cho tự mở node.',
            listKey: 'nodes',
            idKey: 'id',
            payloadKey: 'node',
            action: 'admin.node.save',
            columns: ['Mã', 'Nhánh', 'Tên', 'Chỉ số', 'Mốc', 'Cần trước', 'Bật'],
            row: function (n) {
                return [n.id, n.branch, n.name, n.metric, n.target, (n.requires || []).join(', ') || '—', n.is_active ? 'Có' : 'Không'];
            },
            fields: [
                { key: 'id', label: 'Mã', ph: 'practice-4' },
                { key: 'name', label: 'Tên', ph: 'Tên node' },
                { key: 'branch', label: 'Nhánh', ph: 'knowledge | practice | memory | consistency | mastery' },
                { key: 'description', label: 'Mô tả', ph: 'Mô tả ngắn' },
                { key: 'icon', label: 'Icon FA', ph: 'fa-circle-nodes' },
                { key: 'metric', label: 'Chỉ số', ph: 'quiz_completed' },
                { key: 'target', label: 'Mốc', type: 'number', default: 1 },
                { key: 'requires', label: 'Node cần trước', ph: 'knowledge-1, knowledge-2' },
                { key: 'items', label: 'Vật phẩm thưởng', ph: 'frame-laurel' },
                { key: 'sort_order', label: 'Thứ tự', type: 'number', default: 100 },
                { key: 'is_active', label: 'Đang bật', type: 'check' }
            ],
            prepare: function (item, editor) {
                editor.load(Object.assign({}, item, {
                    requires: (item.requires || []).join(', '),
                    items: ((item.reward && item.reward.items) || []).join(', ')
                }));
            },
            collect: function (c) {
                var id = String(c.id.value || '').trim();
                var metric = String(c.metric.value || '').trim();
                if (!id || !metric) return null;
                return {
                    id: id,
                    branch: c.branch.value || 'knowledge',
                    name: c.name.value || id,
                    description: c.description.value || '',
                    icon: c.icon.value || 'fa-circle-nodes',
                    metric: metric,
                    target: Math.max(1, num(c.target.value, 1)),
                    requires: String(c.requires.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
                    reward: { items: String(c.items.value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean) },
                    sort_order: num(c.sort_order.value, 100),
                    is_active: !!c.is_active.checked
                };
            },
            toText: function () { return ''; }
        });

        /* ----------------------------------------------------------- Reward catalog */
        definitionCard({
            title: 'Danh mục phần thưởng',
            subtitle: 'Vật phẩm trang trí, không tạo lợi thế trong hoạt động học tập. Badge/Title cũ giữ nguyên.',
            listKey: 'rewards',
            idKey: 'id',
            payloadKey: 'reward',
            action: 'admin.reward.save',
            columns: ['Mã', 'Loại', 'Tên', 'Độ hiếm', 'Bật'],
            row: function (r) { return [r.id, r.kind, r.name, r.rarity, r.is_active ? 'Có' : 'Không']; },
            fields: [
                { key: 'id', label: 'Mã', ph: 'frame-bac' },
                { key: 'kind', label: 'Loại', ph: 'frame | theme | decoration | title | badge | background | xp_bonus' },
                { key: 'name', label: 'Tên', ph: 'Tên vật phẩm' },
                { key: 'description', label: 'Mô tả', ph: 'Mô tả ngắn' },
                { key: 'icon', label: 'Icon FA', ph: 'fa-gift' },
                { key: 'rarity', label: 'Độ hiếm', ph: 'common | uncommon | rare | epic | legendary' },
                { key: 'sort_order', label: 'Thứ tự', type: 'number', default: 100 },
                { key: 'is_active', label: 'Đang bật', type: 'check' }
            ],
            prepare: function (item, editor) { editor.load(item); },
            collect: function (c) {
                var id = String(c.id.value || '').trim();
                var kind = String(c.kind.value || '').trim();
                if (!id || !kind) return null;
                return {
                    id: id,
                    kind: kind,
                    name: c.name.value || id,
                    description: c.description.value || '',
                    icon: c.icon.value || 'fa-gift',
                    rarity: c.rarity.value || 'common',
                    metadata: {},
                    sort_order: num(c.sort_order.value, 100),
                    is_active: !!c.is_active.checked
                };
            },
            toText: function () { return ''; }
        });

        /* ----------------------------------------------------------- Boss challenge */
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

        var bossCard = card('Thử thách Boss', [
            btn('Soạn mới', 'bkc-btn-ghost', function () { bossEditor(null); }, 'fa-plus')
        ], 'Nội dung do quản trị viên biên soạn. Câu hỏi và đáp án chỉ nằm ở máy chủ, chấm điểm tại máy chủ.');
        pane.appendChild(bossCard.root);
        var bossTableHost = h('div');
        bossCard.body.appendChild(bossTableHost);
        var bossForm = h('div', 'bkc-subcard');
        bossCard.body.appendChild(bossForm);

        function bossEditor(item) {
            bossForm.textContent = '';
            bossForm.appendChild(h('h4', 'bkc-sub-title', item ? 'Sửa thử thách: ' + item.slug : 'Thử thách mới'));
            var grid = h('div', 'bkc-form-grid');
            var f = {};
            [
                ['slug', 'Mã (slug)'], ['name', 'Tên'], ['kind', 'Loại (subject|chapter|knowledge|revision|weekly)'],
                ['subject', 'Môn'], ['chapter', 'Chương / chủ đề'], ['difficulty', 'Độ khó (easy|normal|hard)'],
                ['pass_score', 'Điểm đạt (%)', 'number'], ['max_attempts', 'Số lượt tối đa', 'number'],
                ['closes_at', 'Đóng lúc (ISO, trống = không đóng)']
            ].forEach(function (row) {
                var control = row[2] === 'number' ? numberInput('') : txt('', '');
                if (item) {
                    if (row[0] === 'closes_at') control.value = item.closes_at ? String(item.closes_at).slice(0, 16) : '';
                    else control.value = item[row[0]] == null ? '' : item[row[0]];
                } else if (row[0] === 'pass_score') control.value = '70';
                else if (row[0] === 'max_attempts') control.value = '3';
                f[row[0]] = control;
                grid.appendChild(fieldRow(row[1], control));
            });
            var active = checkbox('Đang mở', item ? item.is_active !== false : true);
            grid.appendChild(active.root);
            f.is_active = active.input;
            bossForm.appendChild(grid);

            var qBox = textarea('Mỗi dòng: Nội dung câu hỏi | Phương án 1 | Phương án 2 | ... | số thứ tự đáp án đúng | Giải thích', '', 6);
            bossForm.appendChild(fieldRow('Câu hỏi', qBox,
                'Ví dụ: Thủ đô Việt Nam là gì? | Hà Nội | Huế | Đà Nẵng | 1 | Hà Nội là thủ đô.'));
            if (item) {
                /* Chỉ hiển thị nội dung câu hỏi đã có; đáp án đúng do máy chủ giữ, không đổ về trình duyệt. */
                qBox.value = '';
                qBox.placeholder = 'Nhập lại toàn bộ câu hỏi khi sửa (đáp án không hiển thị để tránh lộ).';
            }
            var saveBtn = btn('Lưu thử thách', 'bkc-btn-primary', function () {
                var questions = parseQuestions(qBox.value);
                if (!questions.length) { toast('Cần ít nhất một câu hỏi đúng định dạng.', 'error'); return; }
                var payload = {
                    slug: f.slug.value,
                    name: f.name.value,
                    kind: f.kind.value || 'subject',
                    subject: f.subject.value || '',
                    chapter: f.chapter.value || '',
                    difficulty: f.difficulty.value || 'normal',
                    pass_score: num(f.pass_score.value, 70),
                    max_attempts: num(f.max_attempts.value, 3),
                    closes_at: f.closes_at.value ? new Date(f.closes_at.value).toISOString() : null,
                    is_active: !!f.is_active.checked,
                    questions: questions
                };
                saveBtn.disabled = true;
                call('admin.challenge.save', { challenge: payload }, 'Đã lưu thử thách và bộ câu hỏi.')
                    .then(function () { load(); }, function () { })
                    .then(function () { saveBtn.disabled = false; });
            }, 'fa-floppy-disk');
            bossForm.appendChild(saveBtn);
        }

        function paintBoss() {
            bossTableHost.textContent = '';
            var t = table(['Mã', 'Tên', 'Loại', 'Điểm đạt', 'Số câu', 'Lượt', 'Trạng thái', '']);
            var list = (defs && defs.challenges) || [];
            if (!list.length) emptyRow(t.tbody, 8, 'Chưa có thử thách nào. Dùng "Soạn mới" để tạo.');
            list.forEach(function (c) {
                var tr = h('tr');
                [c.slug, c.name, c.kind, c.pass_score + '%',
                    (c.boss_questions && c.boss_questions[0] && c.boss_questions[0].count) || 0,
                    c.max_attempts, c.is_active ? 'Đang mở' : 'Đã đóng'].forEach(function (v) {
                        var td = h('td');
                        td.textContent = v == null ? '—' : String(v);
                        tr.appendChild(td);
                    });
                var actions = h('td');
                actions.appendChild(btn('Sửa', 'bkc-btn-ghost', function () { bossEditor(c); }, 'fa-pen'));
                actions.appendChild(btn('Đóng', 'bkc-btn-ghost', function () {
                    call('admin.challenge.delete', { slug: c.slug }, 'Đã đóng thử thách.').then(load, function () { });
                }, 'fa-ban'));
                tr.appendChild(actions);
                t.tbody.appendChild(tr);
            });
            bossTableHost.appendChild(t.wrap);
        }
        painters.push(paintBoss);

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

    global.BKGamificationAdmin = { render: render, __ready: true };
})(typeof window !== 'undefined' ? window : this);
