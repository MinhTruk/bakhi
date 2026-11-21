/* =========================================================================
   Bá Khí — bk-founder-grants.js (8.4.1)
   Các thẻ quyền Founder trong tab Gamification:
     · Cấp trọn cây kỹ năng
     · Trao giao diện (Give Themes, 8.4.1)
     · Trao vật phẩm (có số lượng, tôn trọng giới hạn)
     · Trao thành tựu (nhiều thành tựu một lần, không trao trùng)
     · Lịch sử trao tặng (lọc theo người nhận / loại)

   Mọi thao tác gọi gamification-api bằng phiên quản trị; máy chủ kiểm tra
   scope founder lần nữa và ghi gamification_activity_logs. Mô-đun này không
   tự quyết định ai được nhận gì.
   ========================================================================= */
(function (global) {
    'use strict';

    if (global.BKFounderGrants) return;

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
    function fmtd(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { return String(iso); }
    }
    var RARITY = {
        common: 'Phổ biến', uncommon: 'Ít gặp', rare: 'Hiếm',
        epic: 'Cực hiếm', legendary: 'Huyền thoại'
    };
    var KIND = {
        badge: 'Huy hiệu', title: 'Danh hiệu', frame: 'Khung avatar', theme: 'Giao diện',
        background: 'Hình nền', decoration: 'Trang trí', xp_bonus: 'Thưởng XP'
    };
    var CATEGORY = {
        learning: 'Học tập', quiz: 'Quiz', reading: 'Đọc hiểu', listening: 'Luyện nghe',
        revision: 'Ôn tập', consistency: 'Đều đặn', skill: 'Kỹ năng', boss: 'Boss',
        milestone: 'Cấp độ', event: 'Sự kiện', mission: 'Nhiệm vụ', activity: 'Hoạt động',
        discovery: 'Khám phá', gamification: 'Gamification', special: 'Đặc biệt',
        limited: 'Giới hạn'
    };
    var ACTION_LABEL = {
        items_granted: 'Trao vật phẩm',
        achievement_granted: 'Trao thành tựu',
        achievement_unlocked: 'Thành tựu tự động',
        skill_tree_granted: 'Cấp trọn cây kỹ năng',
        skill_node_granted: 'Cấp node kỹ năng',
        skill_node_completed: 'Hoàn thành node',
        level_set: 'Đặt cấp độ',
        xp_buff_created: 'Tạo buff XP',
        xp_buff_ended: 'Kết thúc buff XP'
    };

    function render(pane, kit, opts) {
        if (!pane || !kit || !kit.h) return;
        var h = kit.h;
        var api = kit.gamificationApi || kit.api;
        var toast = kit.toast || function () { };
        function studentId() {
            return (opts && typeof opts.getStudent === 'function') ? String(opts.getStudent() || '') : '';
        }
        function studentName() {
            return (opts && typeof opts.getStudentName === 'function') ? String(opts.getStudentName() || '') : '';
        }
        function changed() {
            if (opts && typeof opts.onChanged === 'function') {
                try { opts.onChanged(); } catch (e) { }
            }
        }

        /* ---------------------------------------------------- Cây kỹ năng */
        var treeCard = kit.card('Give Full Skills Tree — cấp trọn cây kỹ năng', null,
            'Mở toàn bộ node kỹ năng cho một học sinh, bỏ qua điều kiện thường. ' +
            'Không xoá node đã hoàn thành, không trao trùng vật phẩm, có xác nhận trước khi ghi.');
        pane.appendChild(treeCard.root);
        renderSpecialBadges(pane, kit, opts);
        var treeReason = kit.input('text', 'Lý do cấp (không bắt buộc, tối đa 300 ký tự)');
        treeReason.maxLength = 300;
        treeCard.body.appendChild(treeReason);
        var treePreview = el(h, 'div', 'bkf-preview');
        treeCard.body.appendChild(treePreview);
        var treeActions = el(h, 'div', 'bkc-actions');
        treeCard.body.appendChild(treeActions);
        var pendingTree = null;

        treeCard.body.appendChild(kit.btn('Xem trước cây kỹ năng', 'bkc-btn-ghost', function () {
            var sid = studentId();
            treeActions.textContent = '';
            pendingTree = null;
            if (!sid) {
                treePreview.textContent = 'Hãy chọn “Một học sinh” ở thẻ Đối tượng nhận rồi chọn đúng người nhận.';
                return;
            }
            treePreview.textContent = 'Đang đọc tiến trình cây kỹ năng…';
            api('admin.skilltree.preview', { student_id: sid }).then(function (res) {
                var total = num(res && res.total, 0);
                var completed = num(res && res.completed, 0);
                var remaining = Math.max(0, total - completed);
                var names = ((res && res.nodes) || [])
                    .filter(function (n) { return n.status !== 'completed'; })
                    .map(function (n) { return n.name; });
                treePreview.textContent = (studentName() || 'Học sinh') + ': ' + completed + '/' + total +
                    ' node đã hoàn thành. Sẽ cấp thêm ' + remaining + ' node' +
                    (names.length ? ' (' + names.slice(0, 8).join(', ') + (names.length > 8 ? '…' : '') + ')' : '') + '.';
                if (!remaining) {
                    treePreview.textContent += ' Không còn node nào cần cấp.';
                    return;
                }
                pendingTree = { sid: sid, remaining: remaining };
                treeActions.appendChild(kit.btn('Xác nhận cấp ' + remaining + ' node', 'bkc-btn-primary', function () {
                    if (!pendingTree) return;
                    var data = pendingTree;
                    pendingTree = null;
                    treeActions.textContent = '';
                    treePreview.textContent = 'Đang cấp cây kỹ năng…';
                    api('admin.skilltree.grant', {
                        student_id: data.sid,
                        confirm: true,
                        reason: String(treeReason.value || '').trim()
                    }).then(function (out) {
                        var result = (out && out.result) || {};
                        var granted = num(result.granted, 0);
                        var evalObj = result.evaluation || {};
                        var ach = Array.isArray(evalObj.achievements) ? evalObj.achievements.length : 0;
                        treePreview.textContent = 'Đã cấp ' + granted + ' node cho ' +
                            ((out && out.student && out.student.display_name) || studentName() || 'học sinh') +
                            (ach ? ' · mở thêm ' + ach + ' thành tựu.' : '.');
                        toast('Đã cấp trọn cây kỹ năng và ghi nhật ký.', 'success');
                        changed();
                        loadHistory();
                    }).catch(function (err) {
                        treePreview.textContent = (err && err.message) || 'Không cấp được cây kỹ năng.';
                        toast(treePreview.textContent, 'error');
                    });
                }, 'fa-sitemap'));
            }).catch(function (err) {
                treePreview.textContent = (err && err.message) || 'Không đọc được cây kỹ năng.';
            });
        }, 'fa-eye'));

        /* ------------------------------------------------------- Vật phẩm */
        var itemCard = kit.card('Trao vật phẩm', [
            kit.btn('Tải kho vật phẩm', 'bkc-btn-ghost', function () { loadCatalog(); }, 'fa-rotate')
        ], 'Chọn vật phẩm trong kho Gamification và số lượng. Máy chủ tôn trọng giới hạn của từng vật phẩm và ghi lịch sử.');
        pane.appendChild(itemCard.root);

        var itemTools = el(h, 'div', 'bkf-tools');
        var itemSearch = kit.input('search', 'Tìm vật phẩm…');
        itemSearch.className = 'bkc-input bkf-input';
        var itemKind = el(h, 'select', 'bkc-input');
        var allKind = el(h, 'option', null, 'Mọi loại');
        allKind.value = 'all';
        itemKind.appendChild(allKind);
        Object.keys(KIND).forEach(function (k) {
            var o = el(h, 'option', null, KIND[k]);
            o.value = k;
            itemKind.appendChild(o);
        });
        itemTools.appendChild(itemSearch);
        itemTools.appendChild(itemKind);
        itemCard.body.appendChild(itemTools);

        var itemGrid = el(h, 'div', 'bkf-grid');
        itemCard.body.appendChild(itemGrid);
        var itemSelection = el(h, 'div', 'bkf-preview');
        itemCard.body.appendChild(itemSelection);
        var itemActions = el(h, 'div', 'bkc-actions');
        itemCard.body.appendChild(itemActions);
        var itemCatalog = [];
        var itemPicked = {};
        var pendingItems = null;

        function paintItems() {
            itemGrid.textContent = '';
            var q = String(itemSearch.value || '').toLowerCase().trim();
            var kind = itemKind.value;
            var list = itemCatalog.filter(function (i) {
                if (kind !== 'all' && i.kind !== kind) return false;
                if (q && String(i.name + ' ' + i.description).toLowerCase().indexOf(q) < 0) return false;
                return true;
            });
            if (!list.length) {
                kit.emptyState(itemGrid, 'fa-box-open', 'Không có vật phẩm phù hợp',
                    'Thử từ khoá khác hoặc đổi loại vật phẩm.');
                return;
            }
            list.forEach(function (item) {
                var card = el(h, 'button', 'bkf-item' + (itemPicked[item.id] ? ' is-selected' : '') +
                    (item.owned ? ' is-owned' : ''));
                card.type = 'button';
                card.setAttribute('aria-pressed', itemPicked[item.id] ? 'true' : 'false');
                var art = el(h, 'span', 'bkf-art');
                art.appendChild(kit.icon(item.icon || 'fa-gift'));
                card.appendChild(art);
                card.appendChild(el(h, 'span', 'bkf-item-name', item.name));
                var meta = el(h, 'span', 'bkf-item-meta');
                meta.appendChild(kit.pill ? kit.pill(KIND[item.kind] || item.kind, 'muted')
                    : el(h, 'span', 'bkf-sub', KIND[item.kind] || item.kind));
                meta.appendChild(kit.pill ? kit.pill(RARITY[item.rarity] || item.rarity, 'muted')
                    : el(h, 'span', 'bkf-sub', RARITY[item.rarity] || item.rarity));
                card.appendChild(meta);
                card.appendChild(el(h, 'span', 'bkf-item-id',
                    'Đang có: ' + num(item.owned, 0) + (item.max_quantity ? ' / ' + item.max_quantity : '')));
                card.addEventListener('click', function () {
                    if (itemPicked[item.id]) delete itemPicked[item.id];
                    else itemPicked[item.id] = 1;
                    itemActions.textContent = '';
                    pendingItems = null;
                    paintItems();
                    paintItemSelection();
                });
                itemGrid.appendChild(card);
            });
        }

        function paintItemSelection() {
            itemSelection.textContent = '';
            var ids = Object.keys(itemPicked);
            if (!ids.length) {
                itemSelection.textContent = 'Chưa chọn vật phẩm nào.';
                return;
            }
            var box = el(h, 'div', 'bkf-section');
            box.appendChild(el(h, 'p', null, 'Đã chọn ' + ids.length + ' vật phẩm. Chỉnh số lượng trước khi xem trước:'));
            ids.forEach(function (id) {
                var item = itemCatalog.filter(function (i) { return i.id === id; })[0];
                if (!item) return;
                var row = el(h, 'div', 'bkf-searchrow');
                row.appendChild(el(h, 'span', 'bkf-input', item.name));
                var qty = el(h, 'input', 'bkc-input');
                qty.type = 'number';
                qty.min = '1';
                qty.max = String(item.max_quantity || 999);
                qty.value = String(itemPicked[id] || 1);
                qty.setAttribute('aria-label', 'Số lượng ' + item.name);
                qty.addEventListener('input', function () {
                    itemPicked[id] = Math.max(1, Math.min(999, num(qty.value, 1)));
                    itemActions.textContent = '';
                    pendingItems = null;
                });
                row.appendChild(qty);
                box.appendChild(row);
            });
            itemSelection.appendChild(box);
        }

        function loadCatalog() {
            var sid = studentId();
            kit.loading(itemGrid, 'Đang tải kho vật phẩm…');
            api('admin.items.catalog', sid ? { student_id: sid } : {}).then(function (res) {
                itemCatalog = (res && res.items) || [];
                itemPicked = {};
                itemActions.textContent = '';
                pendingItems = null;
                paintItems();
                paintItemSelection();
            }).catch(function (err) {
                itemGrid.textContent = '';
                itemGrid.appendChild(kit.alertBox((err && err.message) || 'Không tải được kho vật phẩm.', 'error'));
            });
        }

        itemSearch.addEventListener('input', paintItems);
        itemKind.addEventListener('change', paintItems);

        itemCard.body.appendChild(kit.btn('Xem trước trao vật phẩm', 'bkc-btn-ghost', function () {
            var sid = studentId();
            itemActions.textContent = '';
            pendingItems = null;
            if (!sid) {
                itemSelection.textContent = 'Hãy chọn “Một học sinh” ở thẻ Đối tượng nhận rồi chọn đúng người nhận.';
                return;
            }
            var ids = Object.keys(itemPicked);
            if (!ids.length) {
                itemSelection.textContent = 'Hãy chọn ít nhất một vật phẩm.';
                return;
            }
            var items = ids.map(function (id) {
                return { item_id: id, quantity: Math.max(1, num(itemPicked[id], 1)) };
            });
            itemSelection.textContent = 'Đang kiểm tra tồn kho…';
            api('admin.items.preview', { student_id: sid, items: items }).then(function (res) {
                var rows = (res && res.items) || [];
                var box = el(h, 'div', 'bkf-section');
                var t = kit.table(['Vật phẩm', 'Số lượng trao', 'Đang có', 'Sau khi trao']);
                rows.forEach(function (r) {
                    var tr = el(h, 'tr');
                    [r.name, r.quantity, r.before, r.after].forEach(function (v) {
                        tr.appendChild(el(h, 'td', null, String(v)));
                    });
                    t.tbody.appendChild(tr);
                });
                box.appendChild(t.wrap);
                itemSelection.textContent = '';
                itemSelection.appendChild(box);
                pendingItems = { sid: sid, items: items };
                itemActions.appendChild(kit.btn('Xác nhận trao ' + items.length + ' vật phẩm',
                    'bkc-btn-primary', function () {
                        if (!pendingItems) return;
                        var data = pendingItems;
                        pendingItems = null;
                        itemActions.textContent = '';
                        itemSelection.textContent = 'Đang trao vật phẩm…';
                        api('admin.items.grant', {
                            student_id: data.sid,
                            items: data.items,
                            reason: ''
                        }).then(function (out) {
                            var result = (out && out.result) || {};
                            var granted = result.granted || [];
                            var skipped = result.skipped || [];
                            itemSelection.textContent = 'Đã trao ' + granted.length + ' loại vật phẩm cho ' +
                                ((out && out.student && out.student.display_name) || studentName() || 'học sinh') +
                                (skipped.length ? ' · ' + skipped.length + ' mục bị bỏ qua (đã đạt giới hạn).' : '.');
                            toast('Đã trao vật phẩm và ghi nhật ký.', 'success');
                            itemPicked = {};
                            changed();
                            loadCatalog();
                            loadHistory();
                        }).catch(function (err) {
                            itemSelection.textContent = (err && err.message) || 'Không trao được vật phẩm.';
                            toast(itemSelection.textContent, 'error');
                        });
                    }, 'fa-gift'));
            }).catch(function (err) {
                itemSelection.textContent = (err && err.message) || 'Không xem trước được.';
            });
        }, 'fa-eye'));

        /* ------------------------------------------------------ Giao diện */
        /* Give Themes dùng chung đối tượng nhận với các thẻ trao tặng khác và
           tự làm mới lịch sử ngay sau khi máy chủ xác nhận. */
        renderThemes(pane, kit, {
            getStudent: opts && opts.getStudent,
            getStudentName: opts && opts.getStudentName,
            onChanged: function () {
                if (opts && typeof opts.onChanged === 'function') {
                    try { opts.onChanged(); } catch (e) { }
                }
                loadHistory(0);
            }
        });

        /* ----------------------------------------------------- Thành tựu */
        var achCard = kit.card('Trao thành tựu', [
            kit.btn('Tải bộ sưu tập', 'bkc-btn-ghost', function () { loadAchievements(); }, 'fa-rotate')
        ], 'Chọn nhiều thành tựu trong bộ sưu tập Gamification. Máy chủ bỏ qua thành tựu đã sở hữu để không trao trùng.');
        pane.appendChild(achCard.root);

        var achTools = el(h, 'div', 'bkf-tools');
        var achSearch = kit.input('search', 'Tìm thành tựu…');
        achSearch.className = 'bkc-input bkf-input';
        var achCat = el(h, 'select', 'bkc-input');
        var allCat = el(h, 'option', null, 'Mọi nhóm');
        allCat.value = 'all';
        achCat.appendChild(allCat);
        Object.keys(CATEGORY).forEach(function (k) {
            var o = el(h, 'option', null, CATEGORY[k]);
            o.value = k;
            achCat.appendChild(o);
        });
        achTools.appendChild(achSearch);
        achTools.appendChild(achCat);
        achCard.body.appendChild(achTools);

        var achGrid = el(h, 'div', 'bkf-grid');
        achCard.body.appendChild(achGrid);
        var achSelection = el(h, 'div', 'bkf-preview');
        achCard.body.appendChild(achSelection);
        var achActions = el(h, 'div', 'bkc-actions');
        achCard.body.appendChild(achActions);
        var achCatalog = [];
        var achPicked = {};
        var pendingAch = null;

        function paintAchievements() {
            achGrid.textContent = '';
            var q = String(achSearch.value || '').toLowerCase().trim();
            var cat = achCat.value;
            var list = achCatalog.filter(function (a) {
                if (cat !== 'all' && a.category !== cat) return false;
                if (q && String(a.name + ' ' + a.description).toLowerCase().indexOf(q) < 0) return false;
                return true;
            });
            if (!list.length) {
                kit.emptyState(achGrid, 'fa-medal', 'Không có thành tựu phù hợp',
                    'Thử từ khoá khác hoặc đổi nhóm.');
                return;
            }
            list.forEach(function (a) {
                var owned = num(a.owned_stages, 0) >= num(a.stages, 1);
                var card = el(h, 'button', 'bkf-item' + (achPicked[a.id] ? ' is-selected' : '') +
                    (owned ? ' is-owned is-disabled' : ''));
                card.type = 'button';
                card.setAttribute('aria-pressed', achPicked[a.id] ? 'true' : 'false');
                if (owned) card.disabled = true;
                var art = el(h, 'span', 'bkf-art');
                art.appendChild(kit.icon(a.icon || 'fa-medal'));
                card.appendChild(art);
                card.appendChild(el(h, 'span', 'bkf-item-name', a.name));
                var meta = el(h, 'span', 'bkf-item-meta');
                meta.appendChild(el(h, 'span', 'bkf-sub', CATEGORY[a.category] || a.category));
                meta.appendChild(el(h, 'span', 'bkf-sub', RARITY[a.rarity] || a.rarity));
                card.appendChild(meta);
                card.appendChild(el(h, 'span', 'bkf-item-id', owned ? 'Đã sở hữu' : 'Chưa sở hữu'));
                card.addEventListener('click', function () {
                    if (achPicked[a.id]) delete achPicked[a.id];
                    else achPicked[a.id] = 1;
                    achActions.textContent = '';
                    pendingAch = null;
                    paintAchievements();
                    paintAchSelection();
                });
                achGrid.appendChild(card);
            });
        }

        function paintAchSelection() {
            var ids = Object.keys(achPicked);
            achSelection.textContent = ids.length
                ? ('Đã chọn ' + ids.length + ' thành tựu. Bấm “Xem trước trao thành tựu”.')
                : 'Chưa chọn thành tựu nào.';
        }

        function loadAchievements() {
            var sid = studentId();
            kit.loading(achGrid, 'Đang tải bộ sưu tập thành tựu…');
            api('admin.achievements.catalog', sid ? { student_id: sid } : {}).then(function (res) {
                achCatalog = (res && res.achievements) || [];
                achPicked = {};
                achActions.textContent = '';
                pendingAch = null;
                paintAchievements();
                paintAchSelection();
            }).catch(function (err) {
                achGrid.textContent = '';
                achGrid.appendChild(kit.alertBox((err && err.message) || 'Không tải được bộ sưu tập.', 'error'));
            });
        }

        achSearch.addEventListener('input', paintAchievements);
        achCat.addEventListener('change', paintAchievements);

        achCard.body.appendChild(kit.btn('Xem trước trao thành tựu', 'bkc-btn-ghost', function () {
            var sid = studentId();
            achActions.textContent = '';
            pendingAch = null;
            if (!sid) {
                achSelection.textContent = 'Hãy chọn “Một học sinh” ở thẻ Đối tượng nhận rồi chọn đúng người nhận.';
                return;
            }
            var ids = Object.keys(achPicked);
            if (!ids.length) {
                achSelection.textContent = 'Hãy chọn ít nhất một thành tựu.';
                return;
            }
            achSelection.textContent = 'Đang kiểm tra thành tựu đã sở hữu…';
            api('admin.achievements.preview', { student_id: sid, ids: ids }).then(function (res) {
                var rows = (res && res.achievements) || [];
                var box = el(h, 'div', 'bkf-section');
                var t = kit.table(['Thành tựu', 'Bậc', 'Đã sở hữu']);
                rows.forEach(function (r) {
                    var tr = el(h, 'tr');
                    tr.appendChild(el(h, 'td', null, r.name));
                    tr.appendChild(el(h, 'td', null, String(r.stages || 1)));
                    tr.appendChild(el(h, 'td', null, String(num(r.owned_stages, 0))));
                    t.tbody.appendChild(tr);
                });
                box.appendChild(t.wrap);
                achSelection.textContent = '';
                achSelection.appendChild(box);
                pendingAch = { sid: sid, ids: ids };
                achActions.appendChild(kit.btn('Xác nhận trao ' + ids.length + ' thành tựu',
                    'bkc-btn-primary', function () {
                        if (!pendingAch) return;
                        var data = pendingAch;
                        pendingAch = null;
                        achActions.textContent = '';
                        achSelection.textContent = 'Đang trao thành tựu…';
                        api('admin.achievements.grant', {
                            student_id: data.sid,
                            ids: data.ids,
                            reason: ''
                        }).then(function (out) {
                            var result = (out && out.result) || {};
                            var granted = result.granted || [];
                            var skipped = result.skipped || [];
                            achSelection.textContent = 'Đã trao ' + granted.length + ' bậc thành tựu cho ' +
                                ((out && out.student && out.student.display_name) || studentName() || 'học sinh') +
                                (skipped.length ? ' · ' + skipped.length + ' mục đã sở hữu nên bỏ qua.' : '.');
                            toast('Đã trao thành tựu và ghi nhật ký.', 'success');
                            achPicked = {};
                            changed();
                            loadAchievements();
                            loadHistory();
                        }).catch(function (err) {
                            achSelection.textContent = (err && err.message) || 'Không trao được thành tựu.';
                            toast(achSelection.textContent, 'error');
                        });
                    }, 'fa-medal'));
            }).catch(function (err) {
                achSelection.textContent = (err && err.message) || 'Không xem trước được.';
            });
        }, 'fa-eye'));

        /* ------------------------------------------------------- Lịch sử */
        var historyCard = kit.card('Lịch sử trao tặng', [
            kit.btn('Làm mới', 'bkc-btn-ghost', function () { loadHistory(0); }, 'fa-rotate')
        ], 'Lọc theo học sinh đang chọn hoặc xem toàn bộ. Chỉ đọc gamification_activity_logs.');
        pane.appendChild(historyCard.root);

        var histTools = el(h, 'div', 'bkf-tools');
        var histKind = el(h, 'select', 'bkc-input');
        [['all', 'Mọi loại'], ['items', 'Vật phẩm'], ['achievements', 'Thành tựu'],
         ['skills', 'Kỹ năng'], ['level', 'Cấp độ'], ['buffs', 'Buff XP']].forEach(function (pair) {
            var o = el(h, 'option', null, pair[1]);
            o.value = pair[0];
            histKind.appendChild(o);
        });
        var histOnlyStudent = kit.input('checkbox', 'Chỉ học sinh đang chọn');
        histTools.appendChild(histKind);
        if (histOnlyStudent && histOnlyStudent.root) histTools.appendChild(histOnlyStudent.root);
        else if (histOnlyStudent && histOnlyStudent.nodeType) histTools.appendChild(histOnlyStudent);
        historyCard.body.appendChild(histTools);

        var histHost = el(h, 'div', 'bkf-section');
        historyCard.body.appendChild(histHost);
        var histMore = kit.btn('Tải thêm', 'bkc-btn-ghost', function () { loadHistory(histOffset); }, 'fa-rotate');
        histMore.hidden = true;
        historyCard.body.appendChild(histMore);
        var histOffset = 0;

        function histChecked() {
            if (!histOnlyStudent) return false;
            var input = histOnlyStudent.input || histOnlyStudent;
            return !!(input && input.checked);
        }

        function loadHistory(offset) {
            histOffset = Math.max(0, num(offset, 0));
            var payload = { limit: 20, offset: histOffset, kind: histKind.value };
            var sid = studentId();
            if (sid && histChecked()) payload.student_id = sid;
            if (!histOffset) kit.loading(histHost, 'Đang tải lịch sử…');
            api('admin.grants.history', payload).then(function (res) {
                var rows = (res && res.rows) || [];
                if (!histOffset) histHost.textContent = '';
                if (!rows.length && !histOffset) {
                    kit.emptyState(histHost, 'fa-clock-rotate-left', 'Chưa có thao tác nào',
                        'Lịch sử xuất hiện sau khi Founder trao vật phẩm, thành tựu hoặc cấp cây kỹ năng.');
                    histMore.hidden = true;
                    return;
                }
                var t = kit.table(['Thời điểm', 'Người nhận', 'Hành động', 'Chi tiết']);
                rows.forEach(function (l) {
                    var tr = el(h, 'tr');
                    tr.appendChild(el(h, 'td', null, fmtd(l.created_at)));
                    tr.appendChild(el(h, 'td', null, l.student_name || (l.student_id ? 'Học sinh' : '—')));
                    tr.appendChild(el(h, 'td', null, ACTION_LABEL[l.action] || l.action));
                    tr.appendChild(el(h, 'td', null, detailText(l)));
                    t.tbody.appendChild(tr);
                });
                histHost.appendChild(t.wrap);
                histOffset += rows.length;
                histMore.hidden = rows.length < 20;
            }).catch(function (err) {
                histHost.textContent = '';
                histHost.appendChild(kit.alertBox((err && err.message) || 'Không tải được lịch sử.', 'error'));
            });
        }

        function detailText(l) {
            var d = l.detail || {};
            if (l.action === 'items_granted') {
                var items = (d.items || []).map(function (i) {
                    return i.item_id + ' ×' + i.quantity;
                });
                return items.join(', ') || '—';
            }
            if (l.action === 'achievement_granted') {
                return (d.achievement || '') + (d.stage ? ' · bậc ' + d.stage : '') +
                    (d.reason ? ' · ' + d.reason : '');
            }
            if (l.action === 'skill_tree_granted') {
                return 'Cấp ' + (d.granted != null ? d.granted : '—') + ' node' +
                    (d.reason ? ' · ' + d.reason : '');
            }
            if (l.action === 'level_set') {
                return 'cấp ' + (d.level != null ? d.level : '—') +
                    (d.updated != null ? ' · ' + d.updated + ' học sinh' : '') +
                    (d.reason ? ' · ' + d.reason : '');
            }
            if (l.action === 'xp_buff_created') {
                return 'x' + (d.multiplier != null ? d.multiplier : '—') +
                    ' · ' + (d.hours != null ? d.hours : '—') + ' giờ' +
                    (d.label ? ' · ' + d.label : '');
            }
            if (l.action === 'xp_buff_ended') return 'Đã kết thúc buff.';
            return d.node || d.achievement || '—';
        }

        histKind.addEventListener('change', function () { histOffset = 0; loadHistory(0); });
        if (histOnlyStudent) {
            var cb = histOnlyStudent.input || histOnlyStudent;
            if (cb && cb.addEventListener) cb.addEventListener('change', function () { loadHistory(0); });
        }

        loadCatalog();
        loadAchievements();
        loadHistory(0);
    }


    /* =====================================================================
       4 huy hiệu đặc biệt — Founder trao tay (8.4.0 §2.2)
       Mã thành tựu đã có trong migration 20261212000000 (ach-active-30,
       ach-boss-10, ach-discovery-5, ach-season-1). Việc trao vẫn đi qua
       gamification-api → bk_gam_grant_achievements, nên máy chủ kiểm tra
       quyền founder và bỏ qua huy hiệu đã sở hữu (không trao trùng).
       ===================================================================== */
    var SPECIAL_BADGES = [
        { id: 'ach-active-30', name: 'Ba mươi ngày học', rarity: 'Cực hiếm',
          category: 'Hoạt động', icon: 'fa-calendar-days',
          desc: 'Có hoạt động học tập trong 30 ngày.' },
        { id: 'ach-boss-10', name: 'Mười ải Boss', rarity: 'Huyền thoại',
          category: 'Boss', icon: 'fa-dragon',
          desc: 'Vượt qua 10 thử thách Boss.' },
        { id: 'ach-discovery-5', name: 'Nhà thám hiểm', rarity: 'Ít gặp',
          category: 'Khám phá', icon: 'fa-map-location-dot',
          desc: 'Thử sức 5 lượt thử thách Boss.' },
        { id: 'ach-season-1', name: 'Mùa Khởi Đầu', rarity: 'Huyền thoại',
          category: 'Giới hạn', icon: 'fa-sun',
          desc: 'Có 20 ngày hoạt động trong mùa đầu tiên.' }
    ];

    function renderSpecialBadges(pane, kit, opts) {
        if (!pane || !kit || !kit.h) return;
        var h = kit.h;
        var api = kit.gamificationApi || kit.api;
        var toast = kit.toast || function () { };

        function studentId() {
            return (opts && typeof opts.getStudent === 'function') ? String(opts.getStudent() || '') : '';
        }
        function studentName() {
            return (opts && typeof opts.getStudentName === 'function') ? String(opts.getStudentName() || '') : '';
        }
        function changed() {
            if (opts && typeof opts.onChanged === 'function') {
                try { opts.onChanged(); } catch (e) { }
            }
        }

        var card = kit.card('Give Special Badges — 4 huy hiệu đặc biệt', null,
            'Chọn học sinh ở thẻ Đối tượng nhận, rồi chọn một hoặc nhiều huy hiệu. ' +
            'Máy chủ ghi nguồn trao là Founder, bỏ qua huy hiệu đã có và không đụng tới ' +
            'huy hiệu học sinh tự đạt.');
        pane.appendChild(card.root);

        var grid = el(h, 'div', 'bkf-grid');
        card.body.appendChild(grid);
        var status = el(h, 'div', 'bkf-preview');
        card.body.appendChild(status);
        var actions = el(h, 'div', 'bkc-actions');
        card.body.appendChild(actions);

        var picked = {};

        function paint() {
            grid.textContent = '';
            SPECIAL_BADGES.forEach(function (b) {
                var on = !!picked[b.id];
                var btn = el(h, 'button', 'bkf-item' + (on ? ' is-selected' : ''));
                btn.type = 'button';
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                var art = el(h, 'span', 'bkf-art');
                art.appendChild(kit.icon(b.icon));
                btn.appendChild(art);
                btn.appendChild(el(h, 'span', 'bkf-item-name', b.name));
                var meta = el(h, 'span', 'bkf-item-meta');
                meta.appendChild(el(h, 'span', 'bkf-sub', b.rarity + ' · ' + b.category));
                btn.appendChild(meta);
                btn.appendChild(el(h, 'span', 'bkf-item-id', b.desc));
                btn.addEventListener('click', function () {
                    if (picked[b.id]) delete picked[b.id];
                    else picked[b.id] = 1;
                    paint();
                    var n = Object.keys(picked).length;
                    status.textContent = n ? ('Đã chọn ' + n + ' huy hiệu.') : '';
                });
                grid.appendChild(btn);
            });
        }

        function grant() {
            var sid = studentId();
            var ids = Object.keys(picked);
            actions.textContent = '';
            if (!sid) {
                status.textContent = 'Hãy chọn “Một học sinh” ở thẻ Đối tượng nhận trước.';
                return;
            }
            if (!ids.length) {
                status.textContent = 'Hãy chọn ít nhất một huy hiệu.';
                return;
            }
            status.textContent = 'Đang kiểm tra huy hiệu đã sở hữu…';
            api('admin.achievements.preview', { student_id: sid, ids: ids }).then(function (res) {
                var rows = (res && res.achievements) || [];
                var owned = rows.filter(function (r) {
                    return Number(r.owned_stages || 0) >= Number(r.stages || 1);
                }).map(function (r) { return r.name; });
                var lines = ids.map(function (id) {
                    var b = SPECIAL_BADGES.filter(function (x) { return x.id === id; })[0];
                    return '• ' + (b ? b.name : id);
                }).join('\n');
                var warn = owned.length
                    ? ('\n\nĐã sở hữu (máy chủ sẽ bỏ qua): ' + owned.join(', '))
                    : '';
                status.textContent = 'Chuẩn bị trao cho ' + (studentName() || 'học sinh') + ':';
                var box = el(h, 'div', 'bkf-section');
                box.appendChild(el(h, 'p', null, 'Chuẩn bị trao cho ' + (studentName() || 'học sinh') + ':'));
                var ul = el(h, 'ul', 'bkf-reasons');
                lines.split('\n').forEach(function (line) {
                    ul.appendChild(el(h, 'li', null, line.replace(/^• /, '')));
                });
                box.appendChild(ul);
                if (owned.length) box.appendChild(kit.alertBox('Máy chủ sẽ bỏ qua: ' + owned.join(', '), 'warn'));
                status.textContent = '';
                status.appendChild(box);
                actions.appendChild(kit.btn('Xác nhận trao ' + ids.length + ' huy hiệu', 'bkc-btn-primary', function () {
                    if (!global.confirm || !global.confirm('Trao huy hiệu cho ' +
                        (studentName() || 'học sinh') + '?\n\n' + lines + warn)) {
                        return;
                    }
                    actions.textContent = '';
                    status.textContent = 'Đang trao huy hiệu…';
                    api('admin.achievements.grant', {
                        student_id: sid,
                        ids: ids,
                        reason: 'Founder trao huy hiệu đặc biệt'
                    }).then(function (out) {
                        var result = (out && out.result) || {};
                        var ok = result.granted || [];
                        var skipped = result.skipped || [];
                        status.textContent = 'Đã trao ' + ok.length + ' huy hiệu cho ' +
                            ((out && out.student && out.student.display_name) || studentName() || 'học sinh') +
                            (skipped.length ? ' · ' + skipped.length + ' huy hiệu đã sở hữu nên bỏ qua.' : '.');
                        toast('Đã trao huy hiệu và ghi nhật ký Founder.', 'success');
                        picked = {};
                        paint();
                        changed();
                    }).catch(function (err) {
                        status.textContent = (err && err.message) || 'Không trao được huy hiệu.';
                        toast(status.textContent, 'error');
                    });
                }, 'fa-medal'));
                actions.appendChild(kit.btn('Huỷ', 'bkc-btn-ghost', function () {
                    actions.textContent = '';
                    status.textContent = '';
                }, 'fa-xmark'));
            }).catch(function (err) {
                status.textContent = (err && err.message) || 'Không kiểm tra được huy hiệu.';
            });
        }

        card.body.appendChild(kit.btn('Trao huy hiệu đã chọn', 'bkc-btn-primary', grant, 'fa-award'));
        paint();
    }

    /* =====================================================================
       Give Themes — trao giao diện (8.4.1)
       Cùng luồng với Give Special Badges: chọn học sinh → chọn giao diện →
       xem trước → xác nhận. Máy chủ quyết định: trao qua bk_gam_grant_items
       (kind = 'theme'), tôn trọng max_quantity, bỏ qua giao diện đã sở hữu
       và ghi gamification_activity_logs.

       Danh mục lấy từ admin.items.catalog để không dựng danh sách thứ hai;
       BKThemes.THEMES chỉ bổ sung tên/mô tả cho giao diện chưa có trong kho
       (ví dụ khi migration 20261213000000 chưa được áp dụng).
       ===================================================================== */
    function renderThemes(pane, kit, opts) {
        if (!pane || !kit || !kit.h) return;
        var h = kit.h;
        var api = kit.gamificationApi || kit.api;
        var toast = kit.toast || function () { };

        function studentId() {
            return (opts && typeof opts.getStudent === 'function') ? String(opts.getStudent() || '') : '';
        }
        function studentName() {
            return (opts && typeof opts.getStudentName === 'function') ? String(opts.getStudentName() || '') : '';
        }
        function changed() {
            if (opts && typeof opts.onChanged === 'function') {
                try { opts.onChanged(); } catch (e) { }
            }
        }
        function builtinThemes() {
            return (global.BKThemes && Array.isArray(global.BKThemes.THEMES))
                ? global.BKThemes.THEMES : [];
        }
        function builtinMeta(id) {
            var list = builtinThemes();
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) return list[i];
            }
            return null;
        }

        var card = kit.card('Give Themes — trao giao diện', [
            kit.btn('Tải kho giao diện', 'bkc-btn-ghost', function () { loadCatalog(); }, 'fa-rotate')
        ], 'Chọn học sinh ở thẻ Đối tượng nhận, rồi chọn một hoặc nhiều giao diện. ' +
            'Máy chủ bỏ qua giao diện học sinh đã sở hữu, không trao trùng và ghi nhật ký Founder.');
        pane.appendChild(card.root);

        var tools = el(h, 'div', 'bkf-tools');
        var search = kit.input('search', 'Tìm giao diện…');
        search.className = 'bkc-input bkf-input';
        tools.appendChild(search);
        tools.appendChild(kit.btn('Chọn tất cả chưa sở hữu', 'bkc-btn-ghost', function () {
            rows().forEach(function (r) {
                if (!r.owned && !r.missing) picked[r.id] = 1;
            });
            paintGrid();
            paintSelection();
        }, 'fa-list-check'));
        tools.appendChild(kit.btn('Bỏ chọn', 'bkc-btn-ghost', function () {
            picked = {};
            actions.textContent = '';
            pending = null;
            paintGrid();
            paintSelection();
        }, 'fa-xmark'));
        card.body.appendChild(tools);

        var grid = el(h, 'div', 'bkf-grid');
        card.body.appendChild(grid);
        var status = el(h, 'div', 'bkf-preview');
        card.body.appendChild(status);
        var actions = el(h, 'div', 'bkc-actions');
        card.body.appendChild(actions);

        var catalog = [];
        var picked = {};
        var pending = null;

        /* Hợp nhất danh mục máy chủ với danh mục hiển thị của BKThemes.
           Giao diện chỉ có trong BKThemes = chưa có bản ghi trong kho. */
        function rows() {
            var out = [];
            var seen = {};
            catalog.forEach(function (item) {
                if (item.kind !== 'theme') return;
                var meta = builtinMeta(item.id) || {};
                seen[item.id] = true;
                out.push({
                    id: item.id,
                    name: item.name || meta.name || item.id,
                    desc: item.description || meta.desc || '',
                    icon: item.icon || 'fa-palette',
                    rarity: RARITY[item.rarity] || item.rarity || '',
                    owned: num(item.owned, 0) > 0,
                    missing: false
                });
            });
            builtinThemes().forEach(function (t) {
                if (seen[t.id]) return;
                out.push({
                    id: t.id, name: t.name, desc: t.desc || '', icon: 'fa-palette',
                    rarity: '', owned: false, missing: true
                });
            });
            return out;
        }

        function paintGrid() {
            grid.textContent = '';
            var q = String(search.value || '').toLowerCase().trim();
            var list = rows().filter(function (r) {
                if (!q) return true;
                return String(r.name + ' ' + r.desc + ' ' + r.id).toLowerCase().indexOf(q) >= 0;
            });
            if (!list.length) {
                kit.emptyState(grid, 'fa-palette', 'Không có giao diện phù hợp',
                    'Thử từ khoá khác. Nếu kho trống, hãy chạy migration giao diện theo mùa.');
                return;
            }
            list.forEach(function (r) {
                var on = !!picked[r.id];
                var btn = el(h, 'button', 'bkf-item' + (on ? ' is-selected' : '') +
                    ((r.owned || r.missing) ? ' is-owned' : ''));
                btn.type = 'button';
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                if (r.owned || r.missing) btn.disabled = true;
                var art = el(h, 'span', 'bkf-art');
                art.appendChild(kit.icon(r.icon));
                btn.appendChild(art);
                btn.appendChild(el(h, 'span', 'bkf-item-name', r.name));
                var meta = el(h, 'span', 'bkf-item-meta');
                meta.appendChild(el(h, 'span', 'bkf-sub', r.rarity ? (r.rarity + ' · Giao diện') : 'Giao diện'));
                btn.appendChild(meta);
                btn.appendChild(el(h, 'span', 'bkf-item-id',
                    r.missing ? 'Chưa có trong kho — cần chạy migration'
                        : (r.owned ? 'Đã sở hữu' : 'Chưa sở hữu')));
                btn.addEventListener('click', function () {
                    if (r.owned || r.missing) return;
                    if (picked[r.id]) delete picked[r.id];
                    else picked[r.id] = 1;
                    actions.textContent = '';
                    pending = null;
                    paintGrid();
                    paintSelection();
                });
                grid.appendChild(btn);
            });
        }

        function paintSelection() {
            var ids = Object.keys(picked);
            status.textContent = ids.length
                ? ('Đã chọn ' + ids.length + ' giao diện. Bấm “Xem trước trao giao diện”.')
                : 'Chưa chọn giao diện nào.';
        }

        function loadCatalog(done) {
            var sid = studentId();
            kit.loading(grid, 'Đang tải kho giao diện…');
            api('admin.items.catalog', sid ? { student_id: sid } : {}).then(function (res) {
                catalog = (res && res.items) || [];
                picked = {};
                pending = null;
                actions.textContent = '';
                paintGrid();
                paintSelection();
                if (typeof done === 'function') done();
            }).catch(function (err) {
                grid.textContent = '';
                grid.appendChild(kit.alertBox((err && err.message) || 'Không tải được kho giao diện.', 'error'));
            });
        }

        search.addEventListener('input', paintGrid);

        card.body.appendChild(kit.btn('Xem trước trao giao diện', 'bkc-btn-ghost', function () {
            var sid = studentId();
            var ids = Object.keys(picked);
            actions.textContent = '';
            pending = null;
            if (!sid) {
                status.textContent = 'Hãy chọn “Một học sinh” ở thẻ Đối tượng nhận rồi chọn đúng người nhận.';
                return;
            }
            if (!ids.length) {
                status.textContent = 'Hãy chọn ít nhất một giao diện.';
                return;
            }
            var items = ids.map(function (id) { return { item_id: id, quantity: 1 }; });
            status.textContent = 'Đang kiểm tra giao diện đã sở hữu…';
            api('admin.items.preview', { student_id: sid, items: items }).then(function (res) {
                var list = (res && res.items) || [];
                var box = el(h, 'div', 'bkf-section');
                box.appendChild(el(h, 'p', null, 'Chuẩn bị trao cho ' + (studentName() || 'học sinh') + ':'));
                var t = kit.table(['Giao diện', 'Đang có', 'Sau khi trao']);
                list.forEach(function (r) {
                    var tr = el(h, 'tr');
                    tr.appendChild(el(h, 'td', null, String(r.name)));
                    tr.appendChild(el(h, 'td', null, String(r.before)));
                    tr.appendChild(el(h, 'td', null, String(r.after)));
                    t.tbody.appendChild(tr);
                });
                box.appendChild(t.wrap);
                var owned = list.filter(function (r) {
                    return num(r.before, 0) >= num(r.quantity, 1);
                }).map(function (r) { return r.name; });
                if (owned.length) {
                    box.appendChild(kit.alertBox('Máy chủ sẽ bỏ qua: ' + owned.join(', '), 'warn'));
                }
                status.textContent = '';
                status.appendChild(box);
                pending = { sid: sid, items: items, count: ids.length };
                actions.appendChild(kit.btn('Xác nhận trao ' + ids.length + ' giao diện',
                    'bkc-btn-primary', function () {
                        if (!pending) return;
                        var data = pending;
                        pending = null;
                        actions.textContent = '';
                        status.textContent = 'Đang trao giao diện…';
                        api('admin.items.grant', {
                            student_id: data.sid,
                            items: data.items,
                            reason: 'Founder trao giao diện'
                        }).then(function (out) {
                            var result = (out && out.result) || {};
                            var granted = result.granted || [];
                            var skipped = result.skipped || [];
                            var message = 'Đã trao ' + granted.length + ' giao diện cho ' +
                                ((out && out.student && out.student.display_name) || studentName() || 'học sinh') +
                                (skipped.length ? ' · ' + skipped.length + ' mục đã sở hữu nên bỏ qua.' : '.');
                            toast('Đã trao giao diện và ghi nhật ký.', 'success');
                            changed();
                            loadCatalog(function () { status.textContent = message; });
                        }).catch(function (err) {
                            status.textContent = (err && err.message) || 'Không trao được giao diện.';
                            toast(status.textContent, 'error');
                        });
                    }, 'fa-palette'));
                actions.appendChild(kit.btn('Huỷ', 'bkc-btn-ghost', function () {
                    actions.textContent = '';
                    status.textContent = '';
                    pending = null;
                }, 'fa-xmark'));
            }).catch(function (err) {
                status.textContent = (err && err.message) || 'Không xem trước được.';
            });
        }, 'fa-eye'));

        loadCatalog();
    }

    /* ----------------------------------------------------------------
       Quản lý cấu trúc cây kỹ năng (Founder)
       Tạo/sửa/lưu trữ node, thêm nhánh, kiểm tra vòng lặp và node cô lập.
       ---------------------------------------------------------------- */
    function renderTreeManager(pane, kit, opts) {
        if (!pane || !kit || !kit.h) return;
        var h = kit.h;
        var api = kit.gamificationApi || kit.api;
        var toast = kit.toast || function () { };

        var card = kit.card('Cấu hình cây kỹ năng', [
            kit.btn('Kiểm tra cấu trúc', 'bkc-btn-ghost', validateTree, 'fa-shield-halved'),
            kit.btn('Làm mới', 'bkc-btn-ghost', loadAll, 'fa-rotate')
        ], 'Tạo node, đặt điều kiện mở (cấp độ, nhiệm vụ, thành tựu, node trước), toạ độ hiển thị ' +
            'và vị trí trên sơ đồ. Máy chủ chặn vòng lặp điều kiện và mã trùng.');
        pane.appendChild(card.root);

        var notice = el(h, 'div', 'bkf-preview');
        card.body.appendChild(notice);

        var editor = el(h, 'div', 'bkf-section');
        card.body.appendChild(editor);

        var tableHost = el(h, 'div', 'bkf-section');
        card.body.appendChild(tableHost);

        var branchCard = kit.card('Nhánh kỹ năng', null,
            'Nhánh mới xuất hiện trong bộ lọc cây và trên sơ đồ /skills/. Chỉ lưu trữ được nhánh không còn node đang bật.');
        pane.appendChild(branchCard.root);
        var branchForm = el(h, 'div', 'bkc-form-grid');
        var bName = kit.input('text', 'Tên nhánh, ví dụ: Sáng tạo');
        var bIcon = kit.input('text', 'fa-lightbulb');
        var bDesc = kit.input('text', 'Mô tả ngắn (không bắt buộc)');
        var bOrder = el(h, 'input', 'bkc-input');
        bOrder.type = 'number';
        bOrder.value = '60';
        [
            ['Tên nhánh', bName], ['Biểu tượng', bIcon],
            ['Mô tả', bDesc], ['Thứ tự', bOrder]
        ].forEach(function (pair) {
            var row = el(h, 'div', 'bkc-field');
            row.appendChild(el(h, 'label', 'bkc-label', pair[0]));
            row.appendChild(pair[1]);
            branchForm.appendChild(row);
        });
        branchCard.body.appendChild(branchForm);
        var branchActions = el(h, 'div', 'bkc-actions');
        branchActions.appendChild(kit.btn('Lưu nhánh', 'bkc-btn-primary', function () {
            var name = String(bName.value || '').trim();
            if (!name) { toast('Hãy nhập tên nhánh.', 'error'); return; }
            api('admin.branch.save', {
                branch: {
                    name: name,
                    icon: String(bIcon.value || '').trim() || 'fa-circle-nodes',
                    description: String(bDesc.value || '').trim(),
                    sort_order: num(bOrder.value, 60),
                    is_active: true
                }
            }).then(function () {
                toast('Đã lưu nhánh.', 'success');
                bName.value = ''; bDesc.value = '';
                loadAll();
            }).catch(function (err) {
                toast((err && err.message) || 'Không lưu được nhánh.', 'error');
            });
        }, 'fa-plus'));
        branchCard.body.appendChild(branchActions);
        var branchHost = el(h, 'div', 'bkf-section');
        branchCard.body.appendChild(branchHost);

        var defs = { nodes: [], branches: [] };
        var editing = null;
        var fields = null;

        function loadAll() {
            kit.loading(tableHost, 'Đang tải cây kỹ năng…');
            api('admin.defs.list', {}).then(function (res) {
                defs.nodes = (res && res.nodes) || [];
                defs.branches = (res && res.branches) || [];
                paintBranches();
                paintTable();
            }).catch(function (err) {
                tableHost.textContent = '';
                tableHost.appendChild(kit.alertBox((err && err.message) || 'Không tải được cây kỹ năng.', 'error'));
            });
        }

        function paintBranches() {
            branchHost.textContent = '';
            if (!defs.branches.length) {
                branchHost.appendChild(el(h, 'p', 'bkf-hint', 'Chưa có nhánh nào. Hãy tạo nhánh trước khi thêm node.'));
                return;
            }
            var t = kit.table(['Nhánh', 'Mã', 'Biểu tượng', 'Trạng thái', '']);
            defs.branches.forEach(function (b) {
                var tr = el(h, 'tr');
                [b.name, b.id, b.icon, b.is_active === false ? 'Đang tắt' : 'Đang bật'].forEach(function (v) {
                    tr.appendChild(el(h, 'td', null, String(v == null ? '—' : v)));
                });
                var td = el(h, 'td', 'bkc-row-actions');
                if (b.is_active !== false) {
                    td.appendChild(kit.btn('Lưu trữ', 'bkc-btn-ghost', function () {
                        if (!global.confirm || !global.confirm('Lưu trữ nhánh “' + b.name + '”?')) return;
                        api('admin.branch.delete', { id: b.id }).then(function () {
                            toast('Đã lưu trữ nhánh.', 'success');
                            loadAll();
                        }).catch(function (err) {
                            toast((err && err.message) || 'Không lưu trữ được nhánh.', 'error');
                        });
                    }, 'fa-box-archive'));
                }
                tr.appendChild(td);
                t.tbody.appendChild(tr);
            });
            branchHost.appendChild(t.wrap);
        }

        function paintTable() {
            tableHost.textContent = '';
            if (!defs.nodes.length) {
                kit.emptyState(tableHost, 'fa-circle-nodes', 'Chưa có node nào',
                    'Bấm “Tạo node mới” để thêm node đầu tiên.');
                return;
            }
            var t = kit.table(['Node', 'Nhánh', 'Điều kiện', 'Mở khi', 'Toạ độ', 'Trạng thái', '']);
            defs.nodes.forEach(function (n) {
                var tr = el(h, 'tr');
                tr.appendChild(el(h, 'td', null, n.name + ' (' + n.id + ')'));
                tr.appendChild(el(h, 'td', null, n.branch));
                tr.appendChild(el(h, 'td', null, n.metric + ' ≥ ' + n.target));
                var reqs = []
                    .concat(n.min_level > 1 ? ['cấp ' + n.min_level] : [])
                    .concat((n.requires || []).length ? ['node: ' + (n.requires || []).join(', ')] : [])
                    .concat((n.required_missions || []).length ? ['nhiệm vụ: ' + (n.required_missions || []).join(', ')] : [])
                    .concat((n.required_achievements || []).length ? ['thành tựu: ' + (n.required_achievements || []).join(', ')] : []);
                tr.appendChild(el(h, 'td', null, reqs.join(' · ') || '—'));
                tr.appendChild(el(h, 'td', null, (num(n.pos_x, 0)) + ', ' + (num(n.pos_y, 0))));
                tr.appendChild(el(h, 'td', null, n.is_active === false ? 'Đang tắt' : 'Đang bật'));
                var td = el(h, 'td', 'bkc-row-actions');
                td.appendChild(kit.btn('Sửa', 'bkc-btn-ghost', function () { openEditor(n); }, 'fa-pen'));
                td.appendChild(kit.btn('Lưu trữ', 'bkc-btn-ghost', function () {
                    if (!global.confirm || !global.confirm('Lưu trữ node “' + n.name + '”? Học sinh đã hoàn thành vẫn giữ tiến trình.')) return;
                    api('admin.node.delete', { id: n.id }).then(function (res) {
                        toast(res && res.archived ? 'Đã lưu trữ node.' : 'Đã xoá node.', 'success');
                        loadAll();
                    }).catch(function (err) {
                        toast((err && err.message) || 'Không lưu trữ được node.', 'error');
                    });
                }, 'fa-box-archive'));
                tr.appendChild(td);
                t.tbody.appendChild(tr);
            });
            tableHost.appendChild(t.wrap);
        }

        function openEditor(node) {
            editing = node || {};
            editor.textContent = '';
            editor.appendChild(el(h, 'h4', 'bkc-sub-title', node ? 'Sửa node: ' + node.name : 'Node mới'));
            var grid = el(h, 'div', 'bkc-form-grid');
            fields = {};

            function addField(key, label, control) {
                var row = el(h, 'div', 'bkc-field');
                row.appendChild(el(h, 'label', 'bkc-label', label));
                row.appendChild(control);
                grid.appendChild(row);
                fields[key] = control;
            }

            var name = kit.input('text', 'Tên node', node ? node.name : '');
            var branchSel = el(h, 'select', 'bkc-input');
            defs.branches.filter(function (b) { return b.is_active !== false; }).forEach(function (b) {
                var o = el(h, 'option', null, b.name + ' (' + b.id + ')');
                o.value = b.id;
                branchSel.appendChild(o);
            });
            if (node && node.branch) branchSel.value = node.branch;
            var iconInput = kit.input('text', 'fa-circle-nodes', node ? node.icon : '');
            var descInput = kit.input('text', 'Mô tả ngắn', node ? node.description : '');
            var metricSel = el(h, 'select', 'bkc-input');
            [
                ['quiz_completed', 'Số bài quiz'], ['lesson_study', 'Số bài đã học'],
                ['listening_completed', 'Số bài luyện nghe'], ['revision_session', 'Số phiên ôn tập'],
                ['mistake_mastered', 'Số câu sai đã xử lý'], ['goal_completed', 'Số mục tiêu'],
                ['xp_total', 'Tổng XP'], ['level', 'Cấp độ'], ['boss_passed', 'Số Boss đã vượt'],
                ['boss_attempts', 'Số lượt thử Boss'], ['distinct_active_days', 'Số ngày có học'],
                ['streak_days', 'Chuỗi ngày học'], ['skill_nodes_completed', 'Node kỹ năng hoàn thành'],
                ['achievements_unlocked', 'Thành tựu đã mở'], ['missions_completed', 'Nhiệm vụ đã hoàn thành'],
                ['inventory_count', 'Vật phẩm sở hữu']
            ].forEach(function (pair) {
                var o = el(h, 'option', null, pair[1]);
                o.value = pair[0];
                metricSel.appendChild(o);
            });
            if (node && node.metric) metricSel.value = node.metric;
            var target = el(h, 'input', 'bkc-input');
            target.type = 'number'; target.min = '1'; target.value = String(node ? node.target : 1);
            var minLevel = el(h, 'input', 'bkc-input');
            minLevel.type = 'number'; minLevel.min = '1'; minLevel.value = String(node ? num(node.min_level, 1) : 1);
            var requires = kit.input('text', 'knowledge-1, knowledge-2', node ? (node.requires || []).join(', ') : '');
            var missions = kit.input('text', 'mission-daily-quiz-3', node ? (node.required_missions || []).join(', ') : '');
            var achievements = kit.input('text', 'ach-level-5', node ? (node.required_achievements || []).join(', ') : '');
            var items = kit.input('text', 'frame-laurel, theme-dawn',
                node && node.reward ? ((node.reward.items || []).join(', ')) : '');
            var posX = el(h, 'input', 'bkc-input');
            posX.type = 'number'; posX.value = String(node ? num(node.pos_x, 0) : 0);
            var posY = el(h, 'input', 'bkc-input');
            posY.type = 'number'; posY.value = String(node ? num(node.pos_y, 0) : 0);
            var sortOrder = el(h, 'input', 'bkc-input');
            sortOrder.type = 'number'; sortOrder.value = String(node ? num(node.sort_order, 100) : 100);
            var active = h('input');
            active.type = 'checkbox';
            active.checked = !node || node.is_active !== false;
            var activeRow = el(h, 'label', 'bkf-check');
            activeRow.appendChild(active);
            activeRow.appendChild(el(h, 'span', null, 'Đang bật (học sinh có thể mở node này)'));

            addField('name', 'Tên node', name);
            addField('branch', 'Nhánh', branchSel);
            addField('icon', 'Biểu tượng', iconInput);
            addField('description', 'Mô tả', descInput);
            addField('metric', 'Điều kiện chỉ số', metricSel);
            addField('target', 'Mốc chỉ số', target);
            addField('min_level', 'Cấp độ tối thiểu', minLevel);
            addField('requires', 'Node tiên quyết', requires);
            addField('required_missions', 'Nhiệm vụ bắt buộc', missions);
            addField('required_achievements', 'Thành tựu bắt buộc', achievements);
            addField('items', 'Vật phẩm thưởng', items);
            addField('pos_x', 'Toạ độ X', posX);
            addField('pos_y', 'Toạ độ Y', posY);
            addField('sort_order', 'Thứ tự', sortOrder);
            editor.appendChild(grid);
            editor.appendChild(activeRow);

            var actions = el(h, 'div', 'bkc-actions');
            actions.appendChild(kit.btn(node ? 'Lưu thay đổi' : 'Tạo node', 'bkc-btn-primary', function () {
                var payload = {
                    id: node ? node.id : '',
                    name: String(name.value || '').trim(),
                    branch: branchSel.value,
                    icon: String(iconInput.value || '').trim(),
                    description: String(descInput.value || '').trim(),
                    metric: metricSel.value,
                    target: num(target.value, 1),
                    min_level: num(minLevel.value, 1),
                    requires: splitList(requires.value),
                    required_missions: splitList(missions.value),
                    required_achievements: splitList(achievements.value),
                    reward: { items: splitList(items.value) },
                    pos_x: num(posX.value, 0),
                    pos_y: num(posY.value, 0),
                    sort_order: num(sortOrder.value, 100),
                    is_active: !!active.checked
                };
                if (!payload.name) { toast('Hãy nhập tên node.', 'error'); return; }
                if (!payload.branch) { toast('Hãy tạo và chọn một nhánh trước.', 'error'); return; }
                var body = { node: payload };
                if (!node) body.expect_new = true;
                api('admin.node.save', body).then(function () {
                    toast('Đã lưu node kỹ năng.', 'success');
                    editing = null;
                    editor.textContent = '';
                    notice.textContent = '';
                    loadAll();
                }).catch(function (err) {
                    notice.textContent = (err && err.message) || 'Không lưu được node.';
                    toast(notice.textContent, 'error');
                });
            }, 'fa-floppy-disk'));
            actions.appendChild(kit.btn('Huỷ', 'bkc-btn-ghost', function () {
                editing = null;
                editor.textContent = '';
            }, 'fa-xmark'));
            editor.appendChild(actions);
            try { editor.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { }
        }

        function splitList(value) {
            return String(value || '').split(',').map(function (s) {
                return s.trim();
            }).filter(Boolean);
        }

        function validateTree() {
            notice.textContent = 'Đang kiểm tra cấu trúc cây…';
            api('admin.skilltree.validate', {}).then(function (res) {
                var issues = (res && res.issues) || [];
                notice.textContent = '';
                if (!issues.length) {
                    notice.appendChild(kit.alertBox('Cấu trúc cây hợp lệ: không có vòng lặp, tham chiếu thiếu hay node cô lập.', 'success'));
                    return;
                }
                notice.appendChild(kit.alertBox(
                    'Có ' + num(res.errors, 0) + ' lỗi và ' + num(res.warnings, 0) + ' cảnh báo cần xem.', 'warn'));
                var ul = el(h, 'ul', 'bkf-reasons');
                issues.forEach(function (i) {
                    var li = el(h, 'li');
                    li.appendChild(el(h, 'b', null, (i.node || '') + ': '));
                    li.appendChild(el(h, 'span', null, i.message || ''));
                    ul.appendChild(li);
                });
                notice.appendChild(ul);
            }).catch(function (err) {
                notice.textContent = (err && err.message) || 'Không kiểm tra được cấu trúc cây.';
            });
        }

        paintTable();
        paintBranches();
        loadAll();
    }

    global.BKFounderGrants = {
        render: render,
        renderThemes: renderThemes,
        renderTreeManager: renderTreeManager,
        version: '8.4.1'
    };
})(typeof window !== 'undefined' ? window : this);
