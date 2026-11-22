/* =========================================================================
   Bá Khí — bk-founder-gamification.js  (8.3.8)

   Tab "Gamification" trong Founder Dashboard. Founder chọn MỘT đối tượng
   (toàn bộ học sinh / một học sinh / khoảng cấp độ) rồi:
     · đặt cấp độ cho đối tượng đó,
     · buff XP có thời hạn cho đối tượng đó,
     · kết thúc buff đang chạy.

   Mọi tính toán nằm ở máy chủ (bk_gam_set_level, gamification_xp_buffs,
   bk_gam_active_buff). Mô-đun này chỉ gửi đối tượng + tham số và hiển thị
   kết quả; không tự cộng XP, không tự đổi cấp.

   Công khai: window.BKFounderGamification
   ========================================================================= */
(function (global) {
    'use strict';

    if (global.BKFounderGamification) return;

    var D = global.document;

    function el(h, tag, cls, text) {
        var node = h(tag, cls);
        if (text != null) node.textContent = String(text);
        return node;
    }

    function num(v, dflt) {
        var n = Number(v);
        return Number.isFinite(n) ? n : dflt;
    }

    function audienceText(a) {
        if (!a) return 'Chưa chọn';
        if (a.kind === 'all') return 'Toàn bộ học sinh đang hoạt động';
        if (a.kind === 'student') return 'Một học sinh: ' + (a.name || a.student_id || '—');
        if (a.kind === 'level') return 'Học sinh từ cấp ' + a.min + ' đến cấp ' + a.max;
        return 'Chưa chọn';
    }

    function fmtd(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { return String(iso); }
    }

    function render(pane, kit) {
        if (!pane || !kit || !kit.h) return;
        var h = kit.h;
        /* Tab Gamification gọi gamification-api (không phải admin-actions);
           dashboard truyền đúng lớp qua gamificationApi, còn kit.api chỉ là
           phương án dự phòng cho bản dashboard cũ đã cache. */
        var api = kit.gamificationApi || kit.api;
        var toast = kit.toast || function () { };
        var ctx = { audience: { kind: 'all' }, selected: null };

        /* --------------------------------------------------------------
           Bộ chọn đối tượng dùng chung cho cả hai thẻ
           -------------------------------------------------------------- */
        var audienceCard = kit.card(
            'Đối tượng nhận',
            null,
            'Chọn ai sẽ nhận thay đổi. Mọi thao tác đều chạy trên máy chủ và ghi nhật ký; ' +
            'bạn sẽ thấy số người thực sự bị ảnh hưởng trước khi xác nhận.'
        );
        pane.appendChild(audienceCard.root);

        var kindRow = el(h, 'div', 'bkf-choice');
        var kinds = [
            ['all', 'Toàn bộ học sinh'],
            ['student', 'Một học sinh'],
            ['level', 'Theo khoảng cấp độ']
        ];
        var kindButtons = {};
        kinds.forEach(function (k) {
            var b = kit.btn(k[1], 'bkc-btn-ghost', function () { setKind(k[0]); }, null);
            kindButtons[k[0]] = b;
            kindRow.appendChild(b);
        });
        audienceCard.body.appendChild(kindRow);

        var studentBox = el(h, 'div', 'bkf-aud-sub');
        studentBox.hidden = true;
        var search = kit.input('search', 'Nhập tên hoặc username học sinh…');
        search.className = 'bkc-input bkf-input';
        search.setAttribute('aria-label', 'Tìm học sinh');
        var searchBtn = kit.btn('Tìm', 'bkc-btn-ghost', function () { runSearch(); }, 'fa-magnifying-glass');
        var searchRow = el(h, 'div', 'bkf-searchrow');
        searchRow.appendChild(search);
        searchRow.appendChild(searchBtn);
        studentBox.appendChild(searchRow);
        var searchHint = el(h, 'div', 'bkf-hint', 'Gõ ít nhất 2 ký tự rồi bấm Tìm.');
        studentBox.appendChild(searchHint);
        var searchResults = el(h, 'div', 'bkf-results');
        studentBox.appendChild(searchResults);
        audienceCard.body.appendChild(studentBox);

        var levelBox = el(h, 'div', 'bkf-aud-sub');
        levelBox.hidden = true;
        var levelRow = el(h, 'div', 'bkc-form-grid');
        var minInput = el(h, 'input', 'bkc-input');
        minInput.type = 'number'; minInput.min = '1'; minInput.max = '1000'; minInput.value = '1';
        var maxInput = el(h, 'input', 'bkc-input');
        maxInput.type = 'number'; maxInput.min = '1'; maxInput.max = '1000'; maxInput.value = '10';
        levelRow.appendChild(labeled(h, 'Từ cấp', minInput));
        levelRow.appendChild(labeled(h, 'Đến cấp', maxInput));
        levelBox.appendChild(levelRow);
        audienceCard.body.appendChild(levelBox);

        var current = el(h, 'p', 'bkf-hint');
        audienceCard.body.appendChild(current);

        function setKind(kind) {
            ctx.audience = { kind: kind };
            if (kind === 'level') {
                ctx.audience.min = Math.max(1, num(minInput.value, 1));
                ctx.audience.max = Math.max(ctx.audience.min, num(maxInput.value, 10));
            }
            studentBox.hidden = kind !== 'student';
            levelBox.hidden = kind !== 'level';
            Object.keys(kindButtons).forEach(function (k) {
                kindButtons[k].classList.toggle('is-active', k === kind);
                kindButtons[k].setAttribute('aria-pressed', k === kind ? 'true' : 'false');
            });
            paintAudience();
        }

        minInput.addEventListener('change', function () { if (ctx.audience.kind === 'level') { setKind('level'); } });
        maxInput.addEventListener('change', function () { if (ctx.audience.kind === 'level') { setKind('level'); } });

        function paintAudience() {
            current.textContent = 'Đang chọn: ' + audienceText(ctx.audience) + '.';
        }

        /* 8.3.7: gamification-api có action quản trị riêng `admin.students.search`.
           Bản 8.3.6 gọi `students.search` — không phải action quản trị nên máy chủ
           xử lý ở nhánh học sinh và trả UNKNOWN_ACTION: “Hành động không hợp lệ.”
           Chỉ lùi về `admin.students.list` khi máy chủ còn là bản cũ đã cache. */
        function isUnknownAction(err) {
            if (!err) return false;
            if (err.code === 'UNKNOWN_ACTION') return true;
            return /Hành động không hợp lệ|UNKNOWN_ACTION/i.test(String(err.message || ''));
        }

        function runSearch() {
            var q = String(search.value || '').trim();
            if (q.length < 2) {
                searchHint.textContent = 'Gõ ít nhất 2 ký tự.';
                return;
            }
            searchHint.textContent = 'Đang tìm “' + q + '”…';
            searchResults.textContent = '';
            api('admin.students.search', { q: q, limit: 8 }).catch(function (err) {
                if (isUnknownAction(err)) {
                    return api('admin.students.list', { q: q, limit: 8 });
                }
                throw err;
            }).then(function (res) {
                var list = (res && res.students) || [];
                searchHint.textContent = list.length ? (list.length + ' kết quả') : 'Không tìm thấy học sinh.';
                if (!list.length) {
                    kit.emptyState(searchResults, 'fa-user-slash', 'Không tìm thấy',
                        'Thử tên khác hoặc mã học sinh.');
                    return;
                }
                var box = el(h, 'div', 'bkf-result-list');
                list.forEach(function (s) {
                    var row = el(h, 'button', 'bkf-result');
                    row.type = 'button';
                    var info = el(h, 'span', 'bkf-result-info');
                    info.appendChild(el(h, 'b', null, s.display_name));
                    var sub = [];
                    if (s.student_code) sub.push('Mã: ' + s.student_code);
                    if (s.disambiguator) sub.push(s.disambiguator);
                    info.appendChild(el(h, 'span', 'bkf-sub', sub.join(' · ') || '—'));
                    row.appendChild(info);
                    row.appendChild(kit.icon('fa-check'));
                    row.addEventListener('click', function () {
                        ctx.audience = { kind: 'student', student_id: s.id, name: s.display_name };
                        ctx.selected = s;
                        searchResults.textContent = '';
                        searchHint.textContent = 'Đã chọn: ' + s.display_name;
                        search.value = s.display_name;
                        paintAudience();
                    });
                    box.appendChild(row);
                });
                searchResults.appendChild(box);
            }).catch(function (err) {
                searchHint.textContent = '';
                searchResults.textContent = '';
                searchResults.appendChild(kit.alertBox((err && err.message) || 'Tìm kiếm thất bại.', 'error'));
            });
        }
        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
        });
        /* Gõ tên khác sau khi đã chọn một học sinh thì bỏ lựa chọn cũ, tránh
           gửi nhầm người vừa chọn trước đó vào thao tác đặt cấp/buff. */
        search.addEventListener('input', function () {
            if (ctx.audience.kind !== 'student' || !ctx.selected) return;
            if (String(search.value || '').trim() === String(ctx.selected.display_name || '')) return;
            ctx.selected = null;
            ctx.audience = { kind: 'student' };
            searchResults.textContent = '';
            searchHint.textContent = 'Gõ ít nhất 2 ký tự rồi bấm Tìm.';
            paintAudience();
        });

        /* “Một học sinh” nhưng chưa chọn ai: báo ngay tại chỗ thay vì để máy chủ
           từ chối với thông báo chung “Đối tượng nhận không hợp lệ”. */
        function audienceProblem() {
            if (ctx.audience.kind === 'student' && !ctx.audience.student_id) {
                return 'Hãy tìm và chọn một học sinh trước khi xem trước.';
            }
            return '';
        }

        setKind('all');

        /* --------------------------------------------------------------
           Thẻ 1 — Đặt cấp độ
           -------------------------------------------------------------- */
        var levelCard = kit.card(
            'Đặt cấp độ',
            null,
            'Đặt cấp độ chính xác cho đối tượng đã chọn. Hệ thống ghi phần chênh lệch vào sổ XP ' +
            'nên tổng XP và cấp độ luôn khớp nhau; không có XP nào bị mất hoặc tự tạo.'
        );
        pane.appendChild(levelCard.root);

        var levelForm = el(h, 'div', 'bkc-form-grid');
        var targetLevel = el(h, 'input', 'bkc-input');
        targetLevel.type = 'number'; targetLevel.min = '1'; targetLevel.max = '100'; targetLevel.value = '10';
        var levelReason = el(h, 'input', 'bkc-input');
        levelReason.type = 'text';
        levelReason.placeholder = 'Ví dụ: thưởng tiến độ học kỳ I';
        levelReason.maxLength = 300;
        levelForm.appendChild(labeled(h, 'Cấp độ muốn đặt (1–100)', targetLevel));
        levelForm.appendChild(labeled(h, 'Lý do (bắt buộc)', levelReason));
        levelCard.body.appendChild(levelForm);

        var levelPreview = el(h, 'div', 'bkf-preview');
        levelCard.body.appendChild(levelPreview);
        var levelConfirmWrap = el(h, 'div', 'bkc-actions');
        levelCard.body.appendChild(levelConfirmWrap);

        var pendingLevel = null;
        levelCard.body.appendChild(kit.btn('Xem trước', 'bkc-btn-ghost', function () {
            var lv = Math.round(num(targetLevel.value, 0));
            if (!(lv >= 1 && lv <= 100)) { toast('Cấp độ phải từ 1 đến 100.', 'error'); return; }
            var reason = String(levelReason.value || '').trim();
            if (reason.length < 3) { toast('Hãy nhập lý do đặt cấp độ.', 'error'); return; }
            var problem = audienceProblem();
            if (problem) { levelPreview.textContent = problem; return; }
            pendingLevel = null;
            levelConfirmWrap.textContent = '';
            levelPreview.textContent = 'Đang đếm đối tượng…';
            api('admin.audience.preview', { audience: ctx.audience }).then(function (res) {
                var count = Number(res && res.count) || 0;
                if (!count) {
                    levelPreview.textContent = 'Không có học sinh nào trong đối tượng đã chọn.';
                    return;
                }
                levelPreview.textContent = 'Sẽ đặt cấp ' + lv + ' cho ' + count + ' học sinh: ' +
                    ((res.sample || []).map(function (s) { return s.name + ' (cấp ' + s.level + ')'; }).join(', ')) +
                    (count > (res.sample || []).length ? '…' : '') + ' · Lý do: ' + reason;
                pendingLevel = { level: lv, reason: reason };
                var confirm = kit.btn('Xác nhận đặt cấp ' + lv + ' cho ' + count + ' học sinh',
                    'bkc-btn-primary', applyLevel, 'fa-check');
                levelConfirmWrap.appendChild(confirm);
            }).catch(function (err) {
                levelPreview.textContent = (err && err.message) || 'Không đếm được đối tượng.';
            });
        }, 'fa-eye'));

        function applyLevel() {
            if (!pendingLevel) return;
            var data = pendingLevel;
            pendingLevel = null;
            levelConfirmWrap.textContent = '';
            levelPreview.textContent = 'Đang đặt cấp độ…';
            api('admin.level.set', {
                audience: ctx.audience,
                level: data.level,
                reason: data.reason
            }).then(function (res) {
                levelPreview.textContent = 'Đã đặt cấp ' + res.level + ' cho ' + res.updated + ' học sinh' +
                    (res.failed && res.failed.length ? ' · ' + res.failed.length + ' lỗi (xem nhật ký).' : '.');
                toast('Đã đặt cấp độ và ghi nhật ký.', 'success');
                loadBuffs();
                loadLogs();
            }).catch(function (err) {
                levelPreview.textContent = (err && err.message) || 'Không đặt được cấp độ.';
                toast((err && err.message) || 'Không đặt được cấp độ.', 'error');
            });
        }

        /* --------------------------------------------------------------
           Thẻ 2 — Buff XP
           -------------------------------------------------------------- */
        var buffCard = kit.card(
            'Buff XP',
            null,
            'Nhân XP nhận được cho đối tượng đã chọn trong một khoảng thời gian. ' +
            'Máy chủ áp dụng hệ số khi cộng XP; hết hạn là tự dừng, không cần thao tác thêm.'
        );
        pane.appendChild(buffCard.root);

        var buffForm = el(h, 'div', 'bkc-form-grid');
        var multSel = el(h, 'select', 'bkc-input');
        ['1.25', '1.5', '2', '3', '5'].forEach(function (m) {
            var o = el(h, 'option', null, 'x' + m);
            o.value = m;
            if (m === '2') o.selected = true;
            multSel.appendChild(o);
        });
        var hoursInput = el(h, 'input', 'bkc-input');
        hoursInput.type = 'number'; hoursInput.min = '1'; hoursInput.max = '720'; hoursInput.value = '48';
        var buffLabel = el(h, 'input', 'bkc-input');
        buffLabel.type = 'text';
        buffLabel.placeholder = 'Ví dụ: Tuần lễ ôn tập';
        buffLabel.maxLength = 120;
        buffForm.appendChild(labeled(h, 'Hệ số', multSel));
        buffForm.appendChild(labeled(h, 'Thời hạn (giờ)', hoursInput));
        buffForm.appendChild(labeled(h, 'Tên buff (không bắt buộc)', buffLabel));
        buffCard.body.appendChild(buffForm);

        var buffPreview = el(h, 'div', 'bkf-preview');
        buffCard.body.appendChild(buffPreview);
        var buffConfirmWrap = el(h, 'div', 'bkc-actions');
        buffCard.body.appendChild(buffConfirmWrap);
        var pendingBuff = null;

        buffCard.body.appendChild(kit.btn('Xem trước buff', 'bkc-btn-ghost', function () {
            var mult = num(multSel.value, 0);
            var hours = Math.round(num(hoursInput.value, 0));
            if (!(mult >= 1.1 && mult <= 10)) { toast('Hệ số buff phải từ 1,1 đến 10.', 'error'); return; }
            if (!(hours >= 1 && hours <= 720)) { toast('Thời hạn phải từ 1 đến 720 giờ.', 'error'); return; }
            var problem = audienceProblem();
            if (problem) { buffPreview.textContent = problem; return; }
            pendingBuff = null;
            buffConfirmWrap.textContent = '';
            buffPreview.textContent = 'Đang đếm đối tượng…';
            api('admin.audience.preview', { audience: ctx.audience }).then(function (res) {
                var count = Number(res && res.count) || 0;
                if (!count) {
                    buffPreview.textContent = 'Không có học sinh nào trong đối tượng đã chọn.';
                    return;
                }
                buffPreview.textContent = 'Buff x' + mult + ' trong ' + hours + ' giờ cho ' + count +
                    ' học sinh (' + audienceText(ctx.audience) + ').';
                pendingBuff = { multiplier: mult, hours: hours, label: String(buffLabel.value || '').trim() };
                buffConfirmWrap.appendChild(kit.btn('Xác nhận tạo buff', 'bkc-btn-primary', applyBuff, 'fa-bolt'));
            }).catch(function (err) {
                buffPreview.textContent = (err && err.message) || 'Không đếm được đối tượng.';
            });
        }, 'fa-eye'));

        function applyBuff() {
            if (!pendingBuff) return;
            var data = pendingBuff;
            pendingBuff = null;
            buffConfirmWrap.textContent = '';
            buffPreview.textContent = 'Đang tạo buff…';
            api('admin.xp.buff', {
                audience: ctx.audience,
                multiplier: data.multiplier,
                hours: data.hours,
                label: data.label
            }).then(function (res) {
                buffPreview.textContent = 'Đã tạo buff, hết hạn lúc ' + fmtd(res.ends_at) + '.';
                toast('Đã tạo buff XP.', 'success');
                loadBuffs();
                loadLogs();
            }).catch(function (err) {
                buffPreview.textContent = (err && err.message) || 'Không tạo được buff.';
                toast((err && err.message) || 'Không tạo được buff.', 'error');
            });
        }

        /* --------------------------------------------------------------
           Danh sách buff
           -------------------------------------------------------------- */
        var listCard = kit.card('Buff đã tạo', [kit.btn('Làm mới', 'bkc-btn-ghost', loadBuffs, 'fa-rotate')],
            'Buff đang chạy sẽ tự hết hạn. Kết thúc sớm không xoá lịch sử.');
        pane.appendChild(listCard.root);
        var buffHost = el(h, 'div', 'bkf-section');
        listCard.body.appendChild(buffHost);

        function loadBuffs() {
            kit.loading(buffHost, 'Đang tải danh sách buff…');
            api('admin.xp.buff.list', {}).then(function (res) {
                buffHost.textContent = '';
                var list = (res && res.buffs) || [];
                if (!list.length) {
                    kit.emptyState(buffHost, 'fa-bolt', 'Chưa có buff nào',
                        'Tạo buff đầu tiên ở thẻ phía trên.');
                    return;
                }
                var t = kit.table(['Tên', 'Hệ số', 'Đối tượng', 'Bắt đầu', 'Kết thúc', 'Trạng thái', '']);
                list.forEach(function (b) {
                    var tr = el(h, 'tr');
                    [
                        b.label || '(không tên)',
                        'x' + b.multiplier,
                        audienceText(b.audience),
                        fmtd(b.starts_at),
                        fmtd(b.ends_at),
                        b.is_live ? 'Đang chạy' : (b.is_active === false ? 'Đã kết thúc' : 'Hết hạn')
                    ].forEach(function (v) {
                        tr.appendChild(el(h, 'td', null, v == null ? '—' : String(v)));
                    });
                    var td = el(h, 'td', 'bkc-row-actions');
                    if (b.is_live) {
                        td.appendChild(kit.btn('Kết thúc', 'bkc-btn-ghost', function () {
                            api('admin.xp.buff.end', { id: b.id }).then(function () {
                                toast('Đã kết thúc buff.', 'success');
                                loadBuffs();
                                loadLogs();
                            }).catch(function (err) {
                                toast((err && err.message) || 'Không kết thúc được buff.', 'error');
                            });
                        }, 'fa-stop'));
                    }
                    tr.appendChild(td);
                    t.tbody.appendChild(tr);
                });
                buffHost.appendChild(t.wrap);
            }).catch(function (err) {
                buffHost.textContent = '';
                buffHost.appendChild(kit.alertBox((err && err.message) || 'Không tải được danh sách buff.', 'error'));
            });
        }

        /* --------------------------------------------------------------
           Nhật ký thay đổi gần đây
           -------------------------------------------------------------- */
        var logCard = kit.card('Nhật ký gần đây', [kit.btn('Làm mới', 'bkc-btn-ghost', loadLogs, 'fa-rotate')],
            'Chỉ hiển thị thao tác đặt cấp độ và buff XP.');
        pane.appendChild(logCard.root);
        var logHost = el(h, 'div', 'bkf-section');
        logCard.body.appendChild(logHost);

        function loadLogs() {
            api('admin.logs', { limit: 60 }).then(function (res) {
                logHost.textContent = '';
                var rows = ((res && res.logs) || []).filter(function (l) {
                    return l.action === 'level_set' || l.action === 'xp_buff_created' || l.action === 'xp_buff_ended';
                }).slice(0, 20);
                if (!rows.length) {
                    kit.emptyState(logHost, 'fa-clock-rotate-left', 'Chưa có thao tác nào',
                        'Nhật ký sẽ xuất hiện sau lần đặt cấp độ hoặc tạo buff đầu tiên.');
                    return;
                }
                var t = kit.table(['Thời điểm', 'Hành động', 'Chi tiết']);
                rows.forEach(function (l) {
                    var tr = el(h, 'tr');
                    tr.appendChild(el(h, 'td', null, fmtd(l.created_at)));
                    tr.appendChild(el(h, 'td', null, l.action === 'level_set' ? 'Đặt cấp độ'
                        : (l.action === 'xp_buff_created' ? 'Tạo buff XP' : 'Kết thúc buff XP')));
                    var detail = l.detail || {};
                    /* Nhật ký level_set lưu { level, reason, updated, audience };
                       bản 8.3.6 đọc from_level/to_level nên hiện “undefined”. */
                    var text = l.action === 'level_set'
                        ? ('cấp ' + (detail.level != null ? detail.level : '—') +
                            (detail.updated != null ? ' · ' + detail.updated + ' học sinh' : '') +
                            (detail.reason ? ' · ' + detail.reason : ''))
                        : (l.action === 'xp_buff_created'
                            ? ('x' + detail.multiplier + ' · ' + detail.hours + ' giờ · ' + (detail.label || ''))
                            : '');
                    tr.appendChild(el(h, 'td', null, text));
                    t.tbody.appendChild(tr);
                });
                logHost.appendChild(t.wrap);
            }).catch(function (err) {
                logHost.textContent = '';
                logHost.appendChild(kit.alertBox((err && err.message) || 'Không tải được nhật ký.', 'error'));
            });
        }

        /* 8.3.8: cấp trọn cây kỹ năng, trao vật phẩm/thành tựu và lịch sử. */
        if (global.BKFounderGrants && typeof global.BKFounderGrants.render === 'function') {
            global.BKFounderGrants.render(pane, kit, {
                getStudent: function () {
                    return ctx.audience.kind === 'student' ? (ctx.audience.student_id || '') : '';
                },
                getStudentName: function () {
                    return ctx.selected ? String(ctx.selected.display_name || '') : '';
                },
                onChanged: function () { loadBuffs(); loadLogs(); }
            });
        } else {
            pane.appendChild(kit.alertBox(
                'Không tải được mô-đun trao tặng (bk-founder-grants.js). Hãy tải lại trang.', 'error'));
        }

        /* 8.3.8: cấu hình cây kỹ năng (node, nhánh, điều kiện, toạ độ). */
        if (global.BKFounderGrants && typeof global.BKFounderGrants.renderTreeManager === 'function') {
            global.BKFounderGrants.renderTreeManager(pane, kit);
        }

        loadBuffs();
        loadLogs();
    }

    function labeled(h, label, control) {
        var row = h('div', 'bkc-field');
        var lab = h('label', 'bkc-label', label);
        row.appendChild(lab);
        row.appendChild(control);
        return row;
    }

    global.BKFounderGamification = {
        render: render,
        version: '8.5.2'
    };
})(typeof window !== 'undefined' ? window : this);
