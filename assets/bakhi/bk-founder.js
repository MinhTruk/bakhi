/* =========================================================================
   Bá Khí — bk-founder.js  (7.5.3)

   Mô-đun Founder Dashboard: tìm người nhận, chọn vật phẩm, trao badge/khung,
   trao toàn bộ badge, tự động xét badge và xem lịch sử cấp.

   Nguyên tắc:
   - Không tự quyết định quyền: mọi thao tác đều để Edge Function kiểm tra.
   - Tìm người nhận qua máy chủ (tối đa 8 dòng), không tải cả bảng học sinh.
   - Một nguồn trạng thái cho mỗi khu vực; tra cứu có debounce và chống kết
     quả cũ bằng số thứ tự (sequence token).
   - Mọi thao tác ghi đều có hộp xác nhận rõ người nhận + vật phẩm + lý do,
     khoá nút khi đang gửi và gửi kèm request_id để chạy lại an toàn.

   Công khai: window.BKFounder.render(pane, kit)
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKFounder) return;

    /* ---------------------------------------------------------------------
       Tiện ích dùng chung
       ------------------------------------------------------------------ */
    function newRequestId() {
        try {
            if (global.crypto && typeof global.crypto.randomUUID === 'function') {
                return global.crypto.randomUUID();
            }
        } catch (e) { }
        return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    /* ---------------------------------------------------------------------
       Tương thích máy chủ cũ

       Nếu Edge Function `admin-actions` chưa được deploy lên bản 7.5.x, các
       action mới (students.search, admin.items.list, students.inventory,
       admin.grantHistory, founder.grantItem, badges.grantAllPreview) rơi vào
       nhánh default và trả UNKNOWN_ACTION — giao diện hiện "Hành động không
       hợp lệ". Các hàm dưới đây tự lùi về action đã có từ 7.3.0 để dashboard
       vẫn dùng được ngay, không cần chờ deploy.
       ------------------------------------------------------------------ */
    function isUnknownAction(err) {
        if (!err) return false;
        if (err.code === 'UNKNOWN_ACTION') return true;
        return /Hành động không hợp lệ|UNKNOWN_ACTION/i.test(String(err.message || ''));
    }

    /** Badge mở khoá một khung — dùng cho fallback badges.grant. */
    function badgeIdForFrame(frameId) {
        var B = global.BK && global.BK.badges ? global.BK.badges : null;
        if (!B || !B.CATALOG) return '';
        for (var i = 0; i < B.CATALOG.length; i++) {
            if (B.CATALOG[i].frame === frameId) return B.CATALOG[i].id;
        }
        return '';
    }

    function avatarEl(h, student, size) {
        var box = h('span', 'bkf-avatar');
        box.style.width = (size || 36) + 'px';
        box.style.height = (size || 36) + 'px';
        if (student && student.avatar_url) {
            var img = D.createElement('img');
            img.alt = '';
            img.src = student.avatar_url;
            img.addEventListener('error', function () {
                box.textContent = initials(student.display_name);
            });
            box.appendChild(img);
        } else {
            box.textContent = initials(student && student.display_name);
        }
        return box;
    }

    /* Hộp xác nhận: trả Promise<boolean>. Dùng BK.ui.modal của site; nếu thiếu
       thì quay về confirm() của trình duyệt để không bao giờ trao nhầm. */
    function confirmDialog(h, title, rows, okLabel, variant) {
        return new Promise(function (resolve) {
            var body = h('div', 'bkf-confirm');
            rows.forEach(function (r) {
                var line = h('div', 'bkf-confirm-row');
                line.appendChild(h('span', 'bkf-confirm-label', r[0]));
                var value = h('span', 'bkf-confirm-value');
                if (r[1] && r[1].nodeType) value.appendChild(r[1]);
                else value.textContent = String(r[1] == null ? '' : r[1]);
                line.appendChild(value);
                body.appendChild(line);
            });

            var ui = global.BK && global.BK.ui;
            if (!ui || typeof ui.modal !== 'function') {
                var text = rows.map(function (r) {
                    return r[0] + ': ' + (r[1] && r[1].textContent ? r[1].textContent : r[1]);
                }).join('\n');
                resolve(global.confirm ? global.confirm(title + '\n\n' + text) : false);
                return;
            }

            var settled = false;
            function finish(value) {
                if (settled) return;
                settled = true;
                resolve(value);
            }
            ui.modal({
                title: title,
                body: body,
                className: 'bkf-modal',
                actions: [
                    {
                        label: 'Huỷ', variant: 'ghost',
                        onClick: function (close) { finish(false); close(); }
                    },
                    {
                        label: okLabel || 'Xác nhận', variant: variant || 'primary',
                        onClick: function (close) { finish(true); close(); }
                    }
                ],
                onClose: function () { finish(false); }
            });
        });
    }

    function resultBox(h, ok, text) {
        var box = h('div', 'bkf-result ' + (ok ? 'is-ok' : 'is-error'));
        box.setAttribute('role', 'status');
        box.textContent = text;
        return box;
    }

    global.BKFounder = {
        render: function (pane, kit) {
            if (!pane || !kit || !kit.h) return;
            build(pane, kit);
        },
        version: '7.5.3'
    };

    function build(pane, kit) {
        var h = kit.h;
        var btn = kit.btn;
        var icon = kit.icon;
        var iconBtn = kit.iconBtn;
        var input = kit.input;
        var card = kit.card;
        var alertBox = kit.alertBox;
        var table = kit.table;
        var emptyState = kit.emptyState;
        var loading = kit.loading;
        var toast = kit.toast;
        var api = kit.api;
        var fmt = kit.fmt;
        var B = global.BK && global.BK.badges ? global.BK.badges : null;
        var P = global.BKProfile || null;

        /* Trạng thái dùng chung giữa các khu vực. */
        var state = {
            student: null,
            inventory: null,
            type: 'badge',
            items: [],
            item: null,
            busy: false
        };

        /* ------------------------------ Tìm người nhận -------------------- */
        function recipientBox(opts) {
            opts = opts || {};
            var root = h('div', 'bkf-recipient');
            var row = h('div', 'bkf-searchrow');
            var field = input('search', opts.placeholder || 'Nhập tên hoặc username…');
            field.className = 'bkc-input bkf-input';
            field.setAttribute('aria-label', 'Tìm người nhận');
            field.setAttribute('autocomplete', 'off');
            var clearBtn = iconBtn('fa-xmark', 'Bỏ chọn người nhận', function () { reset(); }, 'bkc-icon-btn-ghost');
            row.appendChild(field);
            row.appendChild(clearBtn);
            root.appendChild(row);

            var hint = h('div', 'bkf-hint');
            hint.textContent = 'Gõ ít nhất 2 ký tự. Kết quả tìm kiếm chạy trên máy chủ.';
            root.appendChild(hint);
            var results = h('div', 'bkf-results');
            root.appendChild(results);
            var picked = h('div', 'bkf-picked');
            root.appendChild(picked);

            var selected = null;
            var timer = null;
            var seq = 0;
            var lastQuery = '';

            function reset() {
                selected = null;
                field.value = '';
                results.textContent = '';
                picked.textContent = '';
                lastQuery = '';
                hint.textContent = 'Gõ ít nhất 2 ký tự. Kết quả tìm kiếm chạy trên máy chủ.';
                if (timer) { clearTimeout(timer); timer = null; }
                seq++;
                if (opts.onSelect) opts.onSelect(null);
            }

            function choose(student) {
                selected = student;
                seq++;
                results.textContent = '';
                picked.textContent = '';
                var chip = h('div', 'bkf-card is-picked');
                chip.appendChild(avatarEl(h, student, 40));
                var info = h('div', 'bkf-picked-info');
                info.appendChild(h('b', null, student.display_name));
                var sub = [];
                if (student.disambiguator) sub.push(student.disambiguator);
                if (student.student_code) sub.push('Mã: ' + student.student_code);
                info.appendChild(h('span', 'bkf-sub', sub.join(' · ') || 'Không có mã phân biệt'));
                if (student.is_founder) {
                    var tag = h('span', 'bkf-tag is-founder', 'Người sáng lập');
                    info.appendChild(tag);
                }
                chip.appendChild(info);
                chip.appendChild(iconBtn('fa-xmark', 'Bỏ chọn', function () { reset(); }, 'bkc-icon-btn-ghost'));
                picked.appendChild(chip);
                field.value = student.display_name;
                lastQuery = '';
                if (opts.onSelect) opts.onSelect(student);
            }

            function renderStudents(students, q) {
                if (!students.length) {
                    emptyState(results, 'fa-user-slash', 'Không tìm thấy tài khoản',
                        'Không có tài khoản nào khớp “' + q + '”. Thử tên khác hoặc mã học sinh.');
                    return;
                }
                var list = h('div', 'bkf-result-list');
                students.forEach(function (s) {
                    var rowEl = h('button', 'bkf-result');
                    rowEl.type = 'button';
                    rowEl.appendChild(avatarEl(h, s, 34));
                    var info = h('span', 'bkf-result-info');
                    info.appendChild(h('b', null, s.display_name));
                    var sub = [];
                    if (s.disambiguator) sub.push(s.disambiguator);
                    if (s.student_code) sub.push(s.student_code);
                    if (s.is_founder) sub.push('Founder');
                    info.appendChild(h('span', 'bkf-sub', sub.join(' · ')));
                    rowEl.appendChild(info);
                    rowEl.appendChild(icon('fa-arrow-right'));
                    rowEl.addEventListener('click', function () { choose(s); });
                    list.appendChild(rowEl);
                });
                results.appendChild(list);
            }

            /* students.search là action 7.5.0; máy chủ cũ chỉ có students.list. */
            function searchStudents(q) {
                return api('students.search', { q: q, limit: 8 }).catch(function (err) {
                    if (!isUnknownAction(err)) throw err;
                    return api('students.list', { q: q, limit: 8, status: 'active' }).then(function (data) {
                        var list = (data && data.students) || [];
                        return {
                            ok: true,
                            fallback: true,
                            query: q,
                            count: list.length,
                            students: list.filter(function (s) { return s.is_active !== false; }).map(function (s) {
                                return {
                                    id: s.id,
                                    display_name: s.display_name,
                                    disambiguator: s.disambiguator || '',
                                    student_code: s.student_code || '',
                                    avatar_url: '',
                                    is_founder: !!s.is_founder
                                };
                            })
                        };
                    });
                });
            }

            function run(q) {
                var mine = ++seq;
                hint.textContent = 'Đang tìm “' + q + '”…';
                results.textContent = '';
                searchStudents(q).then(function (data) {
                    if (mine !== seq) return;   /* bỏ kết quả của lần gõ cũ */
                    hint.textContent = (data.count ? data.count + ' gợi ý' : '') +
                        (data.fallback ? ' · máy chủ cũ (students.list)' : '');
                    renderStudents(data.students || [], q);
                }).catch(function (err) {
                    if (mine !== seq) return;
                    hint.textContent = '';
                    results.textContent = '';
                    results.appendChild(alertBox((err && err.message) || 'Tìm kiếm thất bại. Thử lại sau.', 'error'));
                });
            }

            field.addEventListener('input', function () {
                var q = field.value.trim();
                if (timer) { clearTimeout(timer); timer = null; }
                if (q.length < 2) {
                    results.textContent = '';
                    hint.textContent = 'Gõ ít nhất 2 ký tự. Kết quả tìm kiếm chạy trên máy chủ.';
                    return;
                }
                if (q === lastQuery) return;
                hint.textContent = 'Đang chờ nhập xong…';
                timer = setTimeout(function () {
                    timer = null;
                    lastQuery = q;
                    run(q);
                }, 280);
            });
            field.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var q = field.value.trim();
                    if (!q) return;
                    if (timer) { clearTimeout(timer); timer = null; }
                    lastQuery = q;
                    run(q);
                } else if (e.key === 'Escape') {
                    reset();
                }
            });

            return {
                root: root,
                get: function () { return selected; },
                clear: reset,
                field: field
            };
        }

        /* Các khu vực được dựng theo thứ tự thao tác của Founder. */
        var ctx = { h: h, kit: kit, state: state, recipientBox: recipientBox, toast: toast };
        sectionGrant(pane, ctx);
        sectionBulk(pane, ctx);
        sectionAuto(pane, ctx);
        sectionFull(pane, ctx);
        sectionHistory(pane, ctx);
    }

    /* ---------------------------------------------------------------------
       Danh mục vật phẩm dùng chung cho mọi khu vực
       ------------------------------------------------------------------ */
    function badgeMeta(id) {
        var B = global.BK && global.BK.badges ? global.BK.badges : null;
        var def = B && typeof B.byId === 'function' ? B.byId(id) : null;
        return def || { id: id, name: id, desc: '', icon: 'fa-award', rarity: 'secret', category: 'secret' };
    }

    function frameMeta(id) {
        var P = global.BKProfile;
        var def = P && typeof P.frameById === 'function' ? P.frameById(id) : null;
        if (!def) return { id: id, name: id, desc: '' };
        return def;
    }

    /* Cơ cấu danh mục dùng chung cho mọi thông báo trao tặng. */
    function catalogMix(fromServer) {
        if (fromServer && typeof fromServer.total === 'number') return fromServer;
        var B = global.BK && global.BK.badges ? global.BK.badges : null;
        if (B && typeof B.breakdown === 'function') return B.breakdown();
        return { total: 0, auto: 0, founder: 0, dev: 0, admin: 0 };
    }

    function mixText(mix) {
        return mix.auto + ' tự động · ' + mix.founder + ' Founder · ' +
            mix.dev + ' Developer · ' + mix.admin + ' Administrator';
    }

    function itemName(item) {
        return item.type === 'frame' ? frameMeta(item.id).name : badgeMeta(item.id).name;
    }

    function itemDesc(item) {
        if (item.type === 'frame') return frameMeta(item.id).desc || 'Khung avatar trang trí quanh ảnh đại diện.';
        return badgeMeta(item.id).desc || '';
    }

    /** Hình xem trước: badge dùng SVG riêng (nếu có), khung dùng frameOverlay. */
    function artNode(h, icon, item, big) {
        var wrap = h('span', 'bkf-art' + (big ? ' is-big' : ''));
        if (item.type === 'badge') {
            var def = badgeMeta(item.id);
            var B = global.BK && global.BK.badges ? global.BK.badges : null;
            if (def.art && B && typeof B.art === 'function') {
                wrap.innerHTML = B.art(def.art);   /* markup hằng số từ danh mục */
                wrap.classList.add('is-svg');
            } else {
                wrap.appendChild(icon(def.icon || 'fa-award'));
            }
            return wrap;
        }
        var P = global.BKProfile;
        var art = P && typeof P.frameOverlay === 'function' ? P.frameOverlay(item.id) : null;
        if (art) {
            wrap.classList.add('is-frame');
            wrap.appendChild(art);
        } else {
            wrap.appendChild(icon('fa-circle-notch'));
        }
        return wrap;
    }

    /* ---------------------------------------------------------------------
       Bộ chọn vật phẩm: 4 nhóm nhưng dùng một danh mục và một cơ chế chọn.
       ------------------------------------------------------------------ */
    function createPicker(ctx) {
        var h = ctx.h;
        var btn = ctx.kit.btn;
        var input = ctx.kit.input;
        var icon = ctx.kit.icon;
        var emptyState = ctx.kit.emptyState;
        var loading = ctx.kit.loading;
        var alertBox = ctx.kit.alertBox;
        var api = ctx.kit.api;
        var state = ctx.state;

        var root = h('div', 'bkf-picker');
        var tabs = h('div', 'bkf-tabs');
        var TYPES = [
            ['badge', 'Badge'],
            ['founder-badge', 'Founder Badge'],
            ['frame', 'Khung avatar'],
            ['founder-frame', 'Khung Founder']
        ];
        var tabButtons = {};
        TYPES.forEach(function (pair) {
            var b = btn(pair[1], 'bkc-btn-ghost', function () {
                state.type = pair[0];
                paintTabs();
                load();
            });
            b.classList.add('bkf-tab');
            b.setAttribute('data-type', pair[0]);
            tabButtons[pair[0]] = b;
            tabs.appendChild(b);
        });
        root.appendChild(tabs);

        var tools = h('div', 'bkf-tools');
        var filter = input('search', 'Lọc theo tên hoặc mã…');
        filter.className = 'bkc-input bkf-input';
        filter.setAttribute('aria-label', 'Lọc vật phẩm');
        var onlyUnowned = h('label', 'bkf-check');
        var onlyBox = h('input');
        onlyBox.type = 'checkbox';
        onlyUnowned.appendChild(onlyBox);
        onlyUnowned.appendChild(h('span', null, 'Chỉ hiện món chưa sở hữu'));
        tools.appendChild(filter);
        tools.appendChild(onlyUnowned);
        root.appendChild(tools);

        var summary = h('div', 'bkf-hint');
        root.appendChild(summary);
        var grid = h('div', 'bkf-grid');
        root.appendChild(grid);
        var preview = h('div', 'bkf-preview');
        root.appendChild(preview);

        function paintTabs() {
            TYPES.forEach(function (pair) {
                var active = pair[0] === state.type;
                var b = tabButtons[pair[0]];
                b.classList.toggle('bkc-btn-primary', active);
                b.classList.toggle('bkc-btn-ghost', !active);
                b.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }

        function paintPreview(item) {
            preview.textContent = '';
            if (!item) {
                preview.appendChild(h('p', 'bkf-hint', 'Chọn một vật phẩm để xem trước.'));
                return;
            }
            var box = h('div', 'bkf-preview-inner');
            box.appendChild(artNode(h, icon, item, true));
            var info = h('div', 'bkf-preview-info');
            info.appendChild(h('b', 'bkf-preview-name', itemName(item)));
            info.appendChild(h('span', 'bkf-preview-id', item.id));
            var tags = h('div', 'bkf-tags');
            if (item.exclusive) tags.appendChild(h('span', 'bkf-tag is-exclusive', 'Độc quyền'));
            if (item.founderOnly) tags.appendChild(h('span', 'bkf-tag is-founder', 'Founder'));
            if (item.devOnly) tags.appendChild(h('span', 'bkf-tag is-dev', 'Developer'));
            if (item.owned) tags.appendChild(h('span', 'bkf-tag is-owned', 'Đã sở hữu'));
            else if (item.owned === false) tags.appendChild(h('span', 'bkf-tag', 'Chưa sở hữu'));
            if (item.type === 'frame' && item.grantable === false) tags.appendChild(h('span', 'bkf-tag is-muted', 'Không trao riêng'));
            info.appendChild(tags);
            var desc = itemDesc(item);
            if (desc) info.appendChild(h('p', 'bkf-preview-desc', desc));
            if (item.type === 'frame') {
                info.appendChild(h('p', 'bkf-sub', 'Trao khung sẽ mở khoá badge tương ứng, không đổi khung đang trang bị.'));
            }
            box.appendChild(info);
            preview.appendChild(box);
        }

        function visibleItems() {
            var q = String(filter.value || '').trim().toLowerCase();
            return state.items.filter(function (it) {
                if (onlyBox.checked && it.owned !== false) return false;
                if (!q) return true;
                return String(it.id).toLowerCase().indexOf(q) !== -1 ||
                    itemName(it).toLowerCase().indexOf(q) !== -1;
            });
        }

        function paintGrid() {
            grid.textContent = '';
            var items = visibleItems();
            summary.textContent = items.length + ' / ' + state.items.length + ' vật phẩm' +
                (state.type === 'frame' ? ' · khung không gắn badge sẽ không trao được' : '') +
                (state.itemsFallback ? ' · danh mục cục bộ (máy chủ cũ)' : '');
            if (!items.length) {
                emptyState(grid, 'fa-box-open', 'Không có vật phẩm phù hợp',
                    'Thử bỏ bộ lọc hoặc chọn nhóm vật phẩm khác.');
                return;
            }
            var frag = D.createDocumentFragment();
            items.forEach(function (it) {
                var tile = h('button', 'bkf-item' + (state.item && state.item.id === it.id ? ' is-selected' : '') +
                    (it.owned ? ' is-owned' : ''));
                tile.type = 'button';
                tile.setAttribute('aria-pressed', state.item && state.item.id === it.id ? 'true' : 'false');
                if (it.grantable === false) tile.classList.add('is-disabled');
                tile.appendChild(artNode(h, icon, it, false));
                var name = h('b', 'bkf-item-name', itemName(it));
                tile.appendChild(name);
                tile.appendChild(h('span', 'bkf-item-id', it.id));
                var line = h('span', 'bkf-item-meta');
                if (it.exclusive) line.appendChild(h('span', 'bkf-tag is-exclusive', 'Độc quyền'));
                if (it.owned) line.appendChild(h('span', 'bkf-tag is-owned', 'Đã có'));
                else if (it.owned === false) line.appendChild(h('span', 'bkf-tag', 'Chưa có'));
                tile.appendChild(line);
                tile.addEventListener('click', function () {
                    state.item = it;
                    paintGrid();
                    paintPreview(it);
                    if (ctx.onItemChange) ctx.onItemChange(it);
                });
                frag.appendChild(tile);
            });
            grid.appendChild(frag);
        }

        function load() {
            var type = state.type === 'frame' || state.type === 'founder-frame' ? 'frame' : 'badge';
            var founderOnly = state.type === 'founder-badge' || state.type === 'founder-frame';
            grid.textContent = '';
            preview.textContent = '';
            state.item = null;
            if (ctx.onItemChange) ctx.onItemChange(null);
            loading(grid, 'Đang tải danh mục vật phẩm…');
            var payload = { type: type };
            if (state.student) payload.id = state.student.id;

            function applyItems(data) {
                var items = (data.items || []).filter(function (it) {
                    if (founderOnly) return it.founderOnly === true;
                    return it.founderOnly !== true;
                });
                if (type === 'frame') {
                    items = items.filter(function (it) { return it.id !== 'none'; });
                }
                state.items = items;
                state.itemsFallback = !!data.fallback;
                paintGrid();
                paintPreview(null);
            }

            /* Dựng danh mục vật phẩm từ bk-badges.js khi máy chủ chưa có
               admin.items.list. Quyền sở hữu lấy từ tồn kho đã đọc trước đó. */
            function localItems() {
                var B = global.BK && global.BK.badges ? global.BK.badges : null;
                var catalog = (B && B.CATALOG) ? B.CATALOG : [];
                var inv = state.inventory;
                var known = !!(inv && Array.isArray(inv.badges));
                var owned = {};
                if (known) {
                    inv.badges.forEach(function (b) { owned[String(b.id)] = true; });
                }
                if (type === 'badge') {
                    return catalog.map(function (b) {
                        return {
                            id: b.id, type: 'badge', name: b.name, category: b.category, rarity: b.rarity,
                            frame: b.frame || null, exclusive: !!b.exclusive,
                            founderOnly: b.exclusive === 'founder', devOnly: b.exclusive === 'dev',
                            adminOnly: !!b.adminOnly, grantable: true,
                            owned: known ? !!owned[b.id] : null
                        };
                    });
                }
                var seen = { none: true };
                var frames = [{
                    id: 'none', type: 'frame', badgeId: '', founderOnly: false, devOnly: false,
                    exclusive: false, grantable: false, owned: known ? true : null
                }];
                catalog.forEach(function (b) {
                    if (!b.frame || seen[b.frame]) return;
                    seen[b.frame] = true;
                    frames.push({
                        id: b.frame, type: 'frame', badgeId: b.id,
                        founderOnly: b.exclusive === 'founder', devOnly: b.exclusive === 'dev',
                        exclusive: !!b.exclusive, grantable: true,
                        owned: known ? (b.frame === 'leaf' ? true : !!owned[b.id]) : null
                    });
                });
                return frames;
            }

            api('admin.items.list', payload).then(applyItems).catch(function (err) {
                if (isUnknownAction(err)) {
                    applyItems({ ok: true, fallback: true, items: localItems() });
                    return;
                }
                grid.textContent = '';
                grid.appendChild(alertBox((err && err.message) || 'Không tải được danh mục vật phẩm.', 'error'));
            });
        }

        filter.addEventListener('input', paintGrid);
        onlyBox.addEventListener('change', paintGrid);
        paintTabs();

        return {
            root: root,
            load: load,
            reload: load,
            selected: function () { return state.item; },
            type: function () { return state.type; }
        };
    }

    /* ---------------------------------------------------------------------
       Khu vực 1 — trao một vật phẩm
       ------------------------------------------------------------------ */
    function sectionGrant(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var state = ctx.state;
        var toast = ctx.toast;

        var box = kit.card('Trao badge và khung avatar', null,
            'Chọn người nhận, chọn đúng vật phẩm rồi xác nhận. Mọi điều kiện quyền hạn được kiểm tra lại ở máy chủ.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var inventoryHost = h('div', 'bkf-inventory');
        var resultHost = h('div', 'bkf-result-host');

        var recipient = ctx.recipientBox({
            placeholder: 'Tìm người nhận: tên hoặc username…',
            onSelect: function (student) {
                state.student = student;
                state.inventory = null;
                inventoryHost.textContent = '';
                resultHost.textContent = '';
                if (student) loadInventory(student.id);
                picker.load();
                syncConfirm();
            }
        });
        host.appendChild(recipient.root);
        host.appendChild(inventoryHost);

        /* Nút xác nhận phải tồn tại trước khi picker.load() gọi syncConfirm(). */
        var confirmBtn = kit.btn('Xác nhận trao tặng', 'bkc-btn-primary', doGrant, 'fa-gift');
        confirmBtn.disabled = true;

        var picker = createPicker({
            h: h,
            kit: kit,
            state: state,
            onItemChange: function () { syncConfirm(); }
        });
        picker.load();
        host.appendChild(picker.root);

        var reason = kit.input('text', 'Lý do trao (không bắt buộc, tối đa 200 ký tự)');
        reason.className = 'bkc-input bkf-reason';
        reason.setAttribute('aria-label', 'Lý do trao tặng');
        reason.maxLength = 200;
        host.appendChild(reason);
        host.appendChild(confirmBtn);
        host.appendChild(resultHost);

        function syncConfirm() {
            confirmBtn.disabled = state.busy || !state.student || !state.item;
        }

        function loadInventory(id) {
            kit.loading(inventoryHost, 'Đang đọc tồn kho vật phẩm…');
            kit.api('students.inventory', { id: id }).catch(function (err) {
                if (!isUnknownAction(err)) throw err;
                /* Máy chủ cũ: đọc badge sở hữu qua badges.list rồi tự dựng tồn kho. */
                return kit.api('badges.list', { id: id }).then(function (res) {
                    var rows = (res && res.badges) || [];
                    var B = global.BK && global.BK.badges ? global.BK.badges : null;
                    var P2 = global.BKProfile;
                    return {
                        ok: true,
                        fallback: true,
                        studentId: id,
                        studentName: (state.student && state.student.display_name) || '',
                        isFounder: !!(state.student && state.student.is_founder),
                        isActive: true,
                        badges: rows.map(function (r) {
                            var def = badgeMeta(String(r.badge_id));
                            return {
                                id: String(r.badge_id),
                                name: def.name,
                                source: r.manual_granted ? 'granted' : (r.auto_earned ? 'auto' : 'granted'),
                                awardedAt: r.awarded_at || null
                            };
                        }),
                        frames: (P2 && P2.ownedFrames) ? P2.ownedFrames() : ['none', 'leaf'],
                        equippedFrame: (P2 && P2.get) ? P2.get().frame : 'none',
                        catalogTotal: (B && B.breakdown) ? B.breakdown().total : 0,
                        catalog: (B && B.breakdown) ? B.breakdown() : undefined
                    };
                });
            }).then(function (data) {
                state.inventory = data;
                inventoryHost.textContent = '';
                var line = h('div', 'bkf-inventory-line');
                line.appendChild(h('span', 'bkf-inventory-name', data.studentName));
                line.appendChild(h('span', 'bkf-tag', data.badges.length + ' / ' + data.catalogTotal + ' badge'));
                line.appendChild(h('span', 'bkf-tag', data.frames.length + ' khung'));
                if (data.equippedFrame && data.equippedFrame !== 'none') {
                    line.appendChild(h('span', 'bkf-tag is-owned', 'Đang dùng: ' + data.equippedFrame));
                }
                if (data.isFounder) line.appendChild(h('span', 'bkf-tag is-founder', 'Người sáng lập'));
                inventoryHost.appendChild(line);
            }).catch(function (err) {
                inventoryHost.textContent = '';
                inventoryHost.appendChild(kit.alertBox((err && err.message) || 'Không đọc được tồn kho.', 'error'));
            });
        }

        function doGrant() {
            if (state.busy) return;
            var student = state.student;
            var item = state.item;
            if (!student || !item) {
                toast('Chọn người nhận và vật phẩm trước.', 'warn');
                return;
            }
            var rows = [
                ['Người nhận', student.display_name + (student.student_code ? ' · ' + student.student_code : '')],
                ['Loại vật phẩm', item.type === 'frame' ? 'Khung avatar' : 'Badge'],
                ['Vật phẩm', itemName(item) + '  (' + item.id + ')'],
                ['Hiện trạng', item.owned ? 'Đã sở hữu — sẽ không tạo bản ghi trùng' : 'Chưa sở hữu'],
                ['Lý do', String(reason.value || '').trim() || '(không ghi lý do)']
            ];
            confirmDialog(h, 'Xác nhận trao vật phẩm', rows, 'Trao ngay').then(function (ok) {
                if (!ok) return;
                state.busy = true;
                confirmBtn.disabled = true;
                resultHost.textContent = '';
                kit.loading(resultHost, 'Đang trao vật phẩm…');
                var reasonText = String(reason.value || '').trim();
                kit.api('founder.grantItem', {
                    id: student.id,
                    item_type: item.type,
                    item_id: item.id,
                    reason: reasonText,
                    request_id: newRequestId()
                }).catch(function (err) {
                    if (!isUnknownAction(err)) throw err;
                    /* Máy chủ cũ: trao qua badges.grant (badge mở khoá khung). */
                    var badgeId = item.type === 'frame' ? badgeIdForFrame(item.id) : item.id;
                    if (!badgeId) {
                        throw new Error('Máy chủ chưa cập nhật founder.grantItem nên không trao được khung này. Hãy deploy admin-actions 7.5.3.');
                    }
                    return kit.api('badges.grant', {
                        id: student.id,
                        badge_id: badgeId,
                        reason: reasonText,
                        request_id: newRequestId()
                    }).then(function (res) {
                        /* badges.grant cũ chỉ trả { ok, badges } nên trạng thái suy ra
                           từ tồn kho đã đọc trước khi trao. */
                        return {
                            ok: true,
                            status: (res && res.status) || (item.owned === true ? 'already_owned' : 'granted'),
                            studentName: (res && res.studentName) || student.display_name,
                            item_name: itemName(item),
                            item_type: item.type,
                            item_id: item.id
                        };
                    });
                }).then(function (data) {
                    resultHost.textContent = '';
                    resultHost.appendChild(resultBox(h, true,
                        data.status === 'already_owned'
                            ? '“' + data.item_name + '” đã có trong tồn kho — không tạo bản ghi trùng.'
                            : 'Đã trao “' + data.item_name + '” cho ' + data.studentName + '.'));
                    reason.value = '';
                    toast('Đã cập nhật tồn kho của ' + data.studentName + '.', 'success');
                    if (state.student && state.student.id === student.id) loadInventory(student.id);
                    picker.reload();
                }).catch(function (err) {
                    resultHost.textContent = '';
                    resultHost.appendChild(kit.alertBox((err && err.message) || 'Không trao được vật phẩm.', 'error'));
                }).then(function () {
                    state.busy = false;
                    syncConfirm();
                });
            });
        }
    }

    /* ---------------------------------------------------------------------
       Khu vực 2 — trao toàn bộ badge đồng bộ (xem trước rồi mới cấp)
       ------------------------------------------------------------------ */
    function sectionBulk(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var state = ctx.state;
        var toast = ctx.toast;

        var mix = catalogMix();
        var box = kit.card('Trao tặng toàn bộ badge', null,
            'Cấp mọi badge có thể trao cho một tài khoản, tự động trừ badge độc quyền. Có bản xem trước chỉ đọc trước khi xác nhận. ' +
            'Danh mục hiện có ' + mix.total + ' badge: ' + mixText(mix) + '.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var bulk = { student: null, preview: null, busy: false };
        var recipient = ctx.recipientBox({
            placeholder: 'Tìm người nhận badge…',
            onSelect: function (student) {
                bulk.student = student;
                bulk.preview = null;
                previewHost.textContent = '';
                reportHost.textContent = '';
                confirmBtn.disabled = true;
                if (student) loadPreview(student.id);
            }
        });
        host.appendChild(recipient.root);

        var previewHost = h('div', 'bkf-preview-block');
        host.appendChild(previewHost);
        var confirmBtn = kit.btn('Cấp toàn bộ badge đủ điều kiện', 'bkc-btn-primary', doBulk, 'fa-layer-group');
        confirmBtn.disabled = true;
        host.appendChild(confirmBtn);
        var reportHost = h('div', 'bkf-result-host');
        host.appendChild(reportHost);

        function loadPreview(id) {
            kit.loading(previewHost, 'Đang đối chiếu danh mục với tồn kho…');
            kit.api('badges.grantAllPreview', { id: id }).catch(function (err) {
                if (!isUnknownAction(err)) throw err;
                /* Máy chủ cũ: tự dựng bản xem trước chỉ đọc từ danh mục + badges.list. */
                return kit.api('badges.list', { id: id }).then(function (res) {
                    var B = global.BK && global.BK.badges ? global.BK.badges : null;
                    var catalog = (B && B.CATALOG) ? B.CATALOG : [];
                    var owned = {};
                    ((res && res.badges) || []).forEach(function (r) { owned[String(r.badge_id)] = true; });
                    var grantable = catalog.filter(function (b) { return !b.exclusive; });
                    var toGrant = grantable.filter(function (b) { return !owned[b.id]; });
                    var already = grantable.filter(function (b) { return owned[b.id]; });
                    var excluded = catalog.filter(function (b) { return !!b.exclusive; });
                    return {
                        ok: true,
                        dryRun: true,
                        fallback: true,
                        studentId: id,
                        studentName: (bulk.student && bulk.student.display_name) || '',
                        totalGrantable: grantable.length,
                        toGrant: toGrant.map(function (b) { return { id: b.id, name: b.name }; }),
                        toAddCount: toGrant.length,
                        alreadyOwned: already.map(function (b) { return b.id; }),
                        alreadyOwnedCount: already.length,
                        excluded: excluded.map(function (b) { return b.id; }),
                        excludedCount: excluded.length,
                        catalog: (B && B.breakdown) ? B.breakdown() : undefined
                    };
                });
            }).then(function (data) {
                bulk.preview = data;
                previewHost.textContent = '';
                var head = h('div', 'bkf-preview-head');
                head.appendChild(h('b', null, 'Dự kiến cấp ' + data.toAddCount + ' badge'));
                head.appendChild(h('span', 'bkf-sub',
                    'Có thể trao ' + data.totalGrantable + ' · đã sở hữu ' + data.alreadyOwnedCount +
                    ' · loại trừ ' + data.excludedCount + ' badge độc quyền'));
                previewHost.appendChild(head);
                var mixPreview = catalogMix(data.catalog);
                previewHost.appendChild(h('p', 'bkf-hint',
                    'Danh mục ' + mixPreview.total + ' badge: ' + mixText(mixPreview) +
                    ' — cấp hàng loạt chỉ áp dụng cho nhóm tự động.'));

                var chips = h('div', 'bkf-chips');
                (data.excluded || []).forEach(function (id) {
                    chips.appendChild(h('span', 'bkf-tag is-exclusive', id));
                });
                if (chips.children.length) {
                    previewHost.appendChild(h('p', 'bkf-hint', 'Badge độc quyền bị loại trừ (không cấp hàng loạt):'));
                    previewHost.appendChild(chips);
                }
                if (data.fallback) {
                    previewHost.appendChild(h('p', 'bkf-hint',
                        'Máy chủ đang chạy bản cũ: bản xem trước được tính cục bộ từ danh mục và badges.list.'));
                }
                if (data.toGrant && data.toGrant.length) {
                    var list = h('div', 'bkf-chips');
                    data.toGrant.slice(0, 24).forEach(function (it) {
                        list.appendChild(h('span', 'bkf-tag', it.name));
                    });
                    if (data.toGrant.length > 24) {
                        list.appendChild(h('span', 'bkf-tag is-muted', '+' + (data.toGrant.length - 24) + ' nữa'));
                    }
                    previewHost.appendChild(h('p', 'bkf-hint', 'Sẽ được cấp:'));
                    previewHost.appendChild(list);
                } else {
                    previewHost.appendChild(kit.alertBox('Tài khoản này đã có đủ badge có thể trao.', 'info'));
                }
                confirmBtn.disabled = bulk.busy || data.toAddCount === 0;
            }).catch(function (err) {
                previewHost.textContent = '';
                previewHost.appendChild(kit.alertBox((err && err.message) || 'Không tải được bản xem trước.', 'error'));
                confirmBtn.disabled = true;
            });
        }

        function doBulk() {
            if (bulk.busy) return;
            var student = bulk.student;
            var preview = bulk.preview;
            if (!student || !preview) {
                toast('Chọn người nhận trước.', 'warn');
                return;
            }
            var rows = [
                ['Người nhận', student.display_name + (student.student_code ? ' · ' + student.student_code : '')],
                ['Số badge sẽ cấp', String(preview.toAddCount)],
                ['Đã sở hữu', preview.alreadyOwnedCount + ' badge'],
                ['Loại trừ', preview.excludedCount + ' badge độc quyền (Founder/Developer)'],
                ['Phạm vi', 'Chỉ tài khoản này; không ảnh hưởng học sinh khác']
            ];
            confirmDialog(h, 'Xác nhận cấp toàn bộ badge', rows, 'Cấp ' + preview.toAddCount + ' badge').then(function (ok) {
                if (!ok) return;
                bulk.busy = true;
                confirmBtn.disabled = true;
                reportHost.textContent = '';
                kit.loading(reportHost, 'Đang cấp badge…');
                kit.api('badges.grantAll', { id: student.id, request_id: newRequestId() }).then(function (data) {
                    reportHost.textContent = '';
                    var boxEl = h('div', 'bkf-report');
                    var mixAfter = catalogMix(data.catalog);
                    boxEl.appendChild(resultBox(h, true,
                        'Đã cấp ' + data.added + ' badge cho ' + (data.studentName || student.display_name) +
                        ' (đã có ' + data.alreadyOwned + ', loại trừ ' + data.excludedCount + ' badge độc quyền: ' +
                        mixAfter.founder + ' Founder + ' + mixAfter.dev + ' Developer).'));
                    if (data.failed && data.failed.length) {
                        boxEl.appendChild(kit.alertBox('Không cấp được: ' + data.failed.join(', '), 'error'));
                    }
                    reportHost.appendChild(boxEl);
                    toast('Đã cấp ' + data.added + ' badge trong ' + mixAfter.total + ' badge danh mục.', 'success');
                    loadPreview(student.id);
                }).catch(function (err) {
                    reportHost.textContent = '';
                    reportHost.appendChild(kit.alertBox((err && err.message) || 'Không cấp được badge.', 'error'));
                }).then(function () {
                    bulk.busy = false;
                    confirmBtn.disabled = false;
                });
            });
        }
    }

    /* ---------------------------------------------------------------------
       Khu vực 3 — tự động xét và cấp badge theo điều kiện
       ------------------------------------------------------------------ */
    function sectionAuto(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var toast = ctx.toast;

        var box = kit.card('Tự động xét badge đủ điều kiện', null,
            'Máy chủ tính lại chỉ số từ dữ liệu học tập rồi chỉ cấp badge tự động đủ điều kiện. Badge độc quyền và badge trao tay không bao giờ được cấp ở đây.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var auto = { student: null, busy: false };
        var recipient = ctx.recipientBox({
            placeholder: 'Tìm học sinh cần xét thành tích…',
            onSelect: function (student) {
                auto.student = student;
                reportHost.textContent = '';
                runBtn.disabled = !student;
            }
        });
        host.appendChild(recipient.root);

        var runBtn = kit.btn('Kiểm tra và cấp badge đủ điều kiện', 'bkc-btn-primary', runAuto, 'fa-bolt');
        runBtn.disabled = true;
        host.appendChild(runBtn);
        var reportHost = h('div', 'bkf-result-host');
        host.appendChild(reportHost);

        function chipList(items) {
            var wrap = h('div', 'bkf-chips');
            items.forEach(function (it) {
                wrap.appendChild(h('span', 'bkf-tag', typeof it === 'string' ? it : it.name || it.id));
            });
            return wrap;
        }

        function runAuto() {
            if (auto.busy || !auto.student) return;
            auto.busy = true;
            runBtn.disabled = true;
            reportHost.textContent = '';
            kit.loading(reportHost, 'Đang tính lại thành tích từ dữ liệu đã đồng bộ…');
            kit.api('badges.autoGrant', { id: auto.student.id }).then(function (data) {
                reportHost.textContent = '';
                var report = h('div', 'bkf-report');
                report.appendChild(h('b', null, 'Báo cáo cho ' + (data.studentName || auto.student.display_name)));

                var grid = h('div', 'bkf-report-grid');
                grid.appendChild(h('span', 'bkf-tag is-owned', 'Mới cấp: ' + data.earned.length));
                grid.appendChild(h('span', 'bkf-tag', 'Đã sở hữu: ' + data.alreadyOwned.length));
                grid.appendChild(h('span', 'bkf-tag', 'Chưa đủ điều kiện: ' + data.notEligible.length));
                grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Bị loại trừ: ' + data.excluded.length));
                report.appendChild(grid);

                report.appendChild(h('p', 'bkf-hint', 'Badge mới được cấp'));
                report.appendChild(data.earned.length
                    ? chipList(data.earned)
                    : kit.alertBox('Không có badge mới — học sinh chưa đạt thêm điều kiện nào.', 'info'));

                if (data.excluded.length) {
                    report.appendChild(h('p', 'bkf-hint', 'Không xét tự động (kèm lý do)'));
                    var ex = h('ul', 'bkf-reasons');
                    data.excluded.forEach(function (it) {
                        var li = h('li');
                        li.appendChild(h('b', null, it.name + ': '));
                        li.appendChild(h('span', null, it.reason));
                        ex.appendChild(li);
                    });
                    report.appendChild(ex);
                }
                if (data.notEligible.length) {
                    var details = D.createElement('details');
                    details.className = 'bkf-details';
                    var sum = D.createElement('summary');
                    sum.textContent = 'Xem ' + data.notEligible.length + ' badge chưa đủ điều kiện';
                    details.appendChild(sum);
                    details.appendChild(chipList(data.notEligible));
                    report.appendChild(details);
                }
                reportHost.appendChild(report);
                toast('Đã cấp ' + data.earned.length + ' badge mới.', 'success');
            }).catch(function (err) {
                reportHost.textContent = '';
                reportHost.appendChild(kit.alertBox((err && err.message) || 'Không xét được thành tích.', 'error'));
            }).then(function () {
                auto.busy = false;
                runBtn.disabled = !auto.student;
            });
        }
    }

    /* ---------------------------------------------------------------------
       Khu vực 4 — cấp trọn bộ danh mục cho hồ sơ Founder
       ------------------------------------------------------------------ */
    function sectionFull(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var toast = ctx.toast;
        var B = global.BK && global.BK.badges ? global.BK.badges : null;
        var P = global.BKProfile;

        var mix = catalogMix();
        var badgeTotal = B && B.CATALOG ? B.CATALOG.length : mix.total;
        var frameTotal = P && P.frames ? P.frames.length : 0;

        var box = kit.card('Cấp trọn bộ cho hồ sơ Founder', null,
            'Trao toàn bộ ' + badgeTotal + ' badge trong danh mục (' + mixText(mix) + ') và mở toàn bộ ' +
            frameTotal + ' khung avatar cho hồ sơ Người sáng lập. Thao tác idempotent: chạy lại không tạo bản ghi trùng.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var full = { student: null, busy: false };
        var recipient = ctx.recipientBox({
            placeholder: 'Để trống để tự xác định hồ sơ Founder duy nhất…',
            onSelect: function (student) { full.student = student; }
        });
        host.appendChild(recipient.root);

        var runBtn = kit.btn('Cấp toàn bộ badge và khung', 'bkc-btn-primary', run, 'fa-crown');
        host.appendChild(runBtn);
        var reportHost = h('div', 'bkf-result-host');
        host.appendChild(reportHost);

        function run() {
            if (full.busy) return;
            var student = full.student;
            var rows = [
                ['Người nhận', student ? (student.display_name + (student.student_code ? ' · ' + student.student_code : '')) : 'Hồ sơ Founder duy nhất (máy chủ tự xác định)'],
                ['Số badge', String(badgeTotal) + ' (' + mixText(mix) + ')'],
                ['Số khung', String(frameTotal) + ' khung avatar'],
                ['Ghi chú', 'Không ghi đè quyền sở hữu cũ; chỉ thêm bản ghi còn thiếu.']
            ];
            confirmDialog(h, 'Cấp trọn bộ danh mục', rows, 'Cấp trọn bộ').then(function (ok) {
                if (!ok) return;
                full.busy = true;
                runBtn.disabled = true;
                reportHost.textContent = '';
                kit.loading(reportHost, 'Đang cấp toàn bộ danh mục…');
                var payload = { request_id: newRequestId() };
                if (student) payload.id = student.id;
                kit.api('founder.grantAll', payload).then(function (data) {
                    reportHost.textContent = '';
                    var report = h('div', 'bkf-report');
                    var who = data.studentName || (student ? student.display_name : 'hồ sơ Founder');
                    report.appendChild(resultBox(h, true,
                        'Đã cấp ' + data.added + ' badge mới cho ' + who + '.'));
                    var mixDone = catalogMix(data.catalog);
                    var grid = h('div', 'bkf-report-grid');
                    grid.appendChild(h('span', 'bkf-tag', 'Danh mục: ' + (data.badgeTotal || mixDone.total) + ' badge'));
                    grid.appendChild(h('span', 'bkf-tag', 'Tự động: ' + mixDone.auto));
                    grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Founder: ' + mixDone.founder));
                    grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Developer: ' + mixDone.dev));
                    grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Administrator: ' + mixDone.admin));
                    grid.appendChild(h('span', 'bkf-tag is-owned', 'Mới cấp: ' + data.added));
                    grid.appendChild(h('span', 'bkf-tag', 'Đã có: ' + data.alreadyOwned));
                    grid.appendChild(h('span', 'bkf-tag', 'Khung: ' + data.frameCount));
                    if (data.equippedFrame) grid.appendChild(h('span', 'bkf-tag is-owned', 'Đang dùng: ' + data.equippedFrame));
                    report.appendChild(grid);
                    reportHost.appendChild(report);
                    toast('Đã cấp trọn bộ cho ' + who + '.', 'success');
                }).catch(function (err) {
                    reportHost.textContent = '';
                    reportHost.appendChild(kit.alertBox((err && err.message) || 'Không cấp được trọn bộ.', 'error'));
                }).then(function () {
                    full.busy = false;
                    runBtn.disabled = false;
                });
            });
        }
    }

    /* ---------------------------------------------------------------------
       Khu vực 5 — lịch sử cấp vật phẩm
       ------------------------------------------------------------------ */
    function sectionHistory(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;

        var box = kit.card('Lịch sử cấp vật phẩm', null,
            'Mọi thao tác trao badge/khung từ Founder Dashboard, kèm người nhận và mã yêu cầu.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var listHost = h('div', 'bkf-history');
        host.appendChild(listHost);
        var moreBtn = kit.btn('Tải thêm', 'bkc-btn-ghost', function () { load(offset); }, 'fa-rotate');
        moreBtn.disabled = true;
        host.appendChild(moreBtn);

        var offset = 0;
        var busy = false;

        function load(nextOffset) {
            if (busy) return;
            busy = true;
            moreBtn.disabled = true;
            if (nextOffset === 0) {
                listHost.textContent = '';
                kit.loading(listHost, 'Đang tải lịch sử…');
            } else {
                moreBtn.textContent = '';
                moreBtn.appendChild(kit.icon('fa-circle-notch fa-spin'));
                moreBtn.appendChild(D.createTextNode('Đang tải…'));
            }
            kit.api('admin.grantHistory', { limit: 30, offset: nextOffset }).then(function (data) {
                if (nextOffset === 0) listHost.textContent = '';
                var rows = data.history || [];
                offset = nextOffset + rows.length;
                if (nextOffset === 0 && !rows.length) {
                    kit.emptyState(listHost, 'fa-clock-rotate-left', 'Chưa có lịch sử',
                        'Các lần trao vật phẩm sẽ xuất hiện ở đây.');
                    moreBtn.disabled = true;
                    return;
                }
                var t = listHost.querySelector('table');
                var body;
                if (!t) {
                    var built = kit.table(['Thời gian', 'Người nhận', 'Loại', 'Vật phẩm', 'Người thực hiện', 'Lý do']);
                    listHost.appendChild(built.wrap);
                    body = built.tbody;
                } else {
                    body = t.querySelector('tbody');
                }
                rows.forEach(function (r) {
                    var tr = h('tr');
                    tr.appendChild(h('td', null, r.createdAt ? kit.fmt(r.createdAt) : '—'));
                    tr.appendChild(h('td', null, r.studentName || String(r.targetStudent || '').slice(0, 8)));
                    tr.appendChild(h('td', null, r.itemType === 'frame' ? 'Khung' : 'Badge'));
                    var item = h('td');
                    item.appendChild(h('b', null, r.itemName || r.itemId));
                    item.appendChild(h('span', 'bkf-sub', ' ' + r.itemId));
                    tr.appendChild(item);
                    tr.appendChild(h('td', null, r.actorScope === 'founder' ? 'Founder' : 'Administrator'));
                    tr.appendChild(h('td', null, r.reason || ''));
                    body.appendChild(tr);
                });
                moreBtn.disabled = rows.length < 30;
            }).catch(function (err) {
                if (nextOffset === 0) listHost.textContent = '';
                if (isUnknownAction(err)) {
                    listHost.appendChild(kit.alertBox(
                        'Máy chủ chưa cập nhật action admin.grantHistory (admin-actions 7.5.x). ' +
                        'Các lần trao vẫn được ghi vào nhật ký quản trị và sẽ hiện ở đây sau khi deploy.', 'info'));
                    moreBtn.disabled = true;
                    return;
                }
                listHost.appendChild(kit.alertBox((err && err.message) || 'Không tải được lịch sử.', 'error'));
                moreBtn.disabled = false;
            }).then(function () {
                busy = false;
                moreBtn.textContent = '';
                moreBtn.appendChild(kit.icon('fa-rotate'));
                moreBtn.appendChild(D.createTextNode(' Tải thêm'));
                if (offset > 0) moreBtn.disabled = moreBtn.disabled === true;
            });
        }

        load(0);
    }
})(typeof window !== 'undefined' ? window : this);
