/* =========================================================================
   Bá Khí — bk-founder.js  (8.2.0)

   Founder Dashboard: ba khu vực độc lập
     1. Thành tích  — tồn kho, trao badge/khung (một, nhiều), cấp hàng loạt,
                      tự động xét badge, cấp trọn bộ, lịch sử cấp.
     2. Danh hiệu   — danh mục Title ánh xạ badge + Title tự tạo, hai kiểu hiển
                      thị (bình thường / đặc biệt), trao, thu hồi, người giữ.
     3. Founder     — trạng thái hồ sơ Người sáng lập và danh vị (không trao
                      badge/khung ở đây nữa).

   Nguyên tắc:
   - Không tự quyết định quyền: mọi thao tác đều để Edge Function kiểm tra.
   - Một hợp đồng phản hồi trao tặng duy nhất (success, status, *_count,
     granted_badges, errors, message); phản hồi lạ → chuyển sang "cần đối soát",
     không tự gửi lại giao dịch chưa xác định kết quả.
   - Mọi thao tác ghi có hộp xác nhận, khoá nút khi đang gửi và gửi kèm
     request_id để chạy lại an toàn (máy chủ chống trao lặp).

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

    /* Tương thích máy chủ cũ: action mới rơi vào default → UNKNOWN_ACTION. */
    function isUnknownAction(err) {
        if (!err) return false;
        if (err.code === 'UNKNOWN_ACTION') return true;
        return /Hành động không hợp lệ|UNKNOWN_ACTION/i.test(String(err.message || ''));
    }

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
                    { label: 'Huỷ', variant: 'ghost', onClick: function (close) { finish(false); close(); } },
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

    /* Đọc một con số từ phản hồi; null khi thiếu để không in "undefined". */
    function countOr(value) {
        var n = typeof value === 'number' ? value : Number(value);
        return (typeof value !== 'undefined' && value !== null && value !== '' && isFinite(n)) ? n : null;
    }

    function countText(value) {
        var n = countOr(value);
        return n === null ? '—' : String(n);
    }

    function catalogMix(fromServer) {
        var B = global.BK && global.BK.badges ? global.BK.badges : null;
        var base = (B && typeof B.breakdown === 'function')
            ? B.breakdown()
            : { total: 0, auto: 0, founder: 0, dev: 0, admin: 0 };
        var src = (fromServer && typeof fromServer === 'object') ? fromServer : base;
        function pick(key) {
            var n = countOr(src[key]);
            if (n !== null) return n;
            n = countOr(base[key]);
            return n === null ? 0 : n;
        }
        return { total: pick('total'), auto: pick('auto'), founder: pick('founder'), dev: pick('dev'), admin: pick('admin') };
    }

    function mixText(mix) {
        return mix.auto + ' tự động · ' + mix.founder + ' Founder · ' +
            mix.dev + ' Developer · ' + mix.admin + ' Administrator';
    }

    function frameCatalogSize(B, P) {
        if (P && P.frames && P.frames.length) return P.frames.length;
        var seen = {};
        var count = 0;
        var list = (B && B.CATALOG) ? B.CATALOG : [];
        for (var i = 0; i < list.length; i++) {
            var id = list[i].frame;
            if (id && !seen[id]) { seen[id] = true; count++; }
        }
        return count;
    }

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

    function itemName(item) {
        return item.type === 'frame' ? frameMeta(item.id).name : badgeMeta(item.id).name;
    }

    /* ---------------------------------------------------------------------
       Chip danh hiệu dùng chung (bk-titles.js); tự vẽ nếu trang thiếu mô-đun.
       ------------------------------------------------------------------ */
    function titleChip(h, t) {
        if (!t) return null;
        var shared = global.BK && global.BK.titles && typeof global.BK.titles.chip === 'function'
            ? global.BK.titles.chip(t, { full: true })
            : null;
        if (shared) return shared;
        var chip = h('span', 'bkf-title-chip');
        chip.textContent = String(t.short || t.name || '').toUpperCase();
        if (t.color) chip.style.setProperty('--bkt-color', t.color);
        return chip;
    }

    function titlePreview(h, host, t) {
        if (global.BK && global.BK.titles && typeof global.BK.titles.preview === 'function') {
            global.BK.titles.preview(host, t);
            return;
        }
        host.textContent = '';
        host.appendChild(titleChip(h, t) || h('span', 'bkf-hint', 'Chưa có danh hiệu'));
    }

    global.BKFounder = {
        render: function (pane, kit) {
            if (!pane || !kit || !kit.h) return;
            build(pane, kit);
        },
        version: '8.3.8'
    };

    /* ---------------------------------------------------------------------
       Khung dashboard: 3 tab
       ------------------------------------------------------------------ */
    var FOUNDER_TABS = [
        ['achievements', 'Thành tích', 'fa-medal'],
        ['titles', 'Danh hiệu', 'fa-signature'],
        ['gamification', 'Gamification', 'fa-bolt'],
        ['founder', 'Founder', 'fa-crown']
    ];

    function build(pane, kit) {
        var h = kit.h;
        var api = kit.api;
        var state = {
            student: null,
            inventory: null,
            type: 'badge',
            items: [],
            item: null,
            selected: {},
            busy: false,
            titles: [],
            titlesLoaded: false,
            titleStudent: null,
            version: null
        };

        var ctx = { h: h, kit: kit, state: state, toast: kit.toast, api: api };

        /* Thanh tab nội bộ của khu vực Founder. */
        var bar = h('div', 'bkf-tabbar');
        bar.setAttribute('role', 'tablist');
        var panels = {};
        var buttons = {};
        FOUNDER_TABS.forEach(function (t) {
            var b = h('button', 'bkf-tabbtn');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.setAttribute('data-tab', t[0]);
            b.appendChild(kit.icon(t[2]));
            b.appendChild(h('span', null, t[1]));
            b.addEventListener('click', function () { show(t[0]); });
            buttons[t[0]] = b;
            bar.appendChild(b);
        });
        pane.appendChild(bar);

        var host = h('div', 'bkf-tabhost');
        pane.appendChild(host);

        /* Dải thông tin phiên bản máy chủ — để không còn cảnh frontend báo
           7.6.0 trong khi backend đã lên 7.7.0 hoặc ngược lại. */
        var versionLine = h('div', 'bkf-version');
        versionLine.textContent = 'Đang kiểm tra phiên bản máy chủ…';
        pane.appendChild(versionLine);
        api('version', {}).then(function (data) {
            state.version = data && data.serverVersion ? data.serverVersion : null;
            versionLine.textContent = state.version
                ? 'Máy chủ admin-actions ' + state.version + ' · ' +
                    (data.titles && data.titles.total != null ? data.titles.total + ' danh hiệu trong cơ sở dữ liệu' : '')
                : 'Máy chủ chưa trả về phiên bản (admin-actions cũ).';
        }).catch(function (err) {
            versionLine.textContent = isUnknownAction(err)
                ? 'Máy chủ admin-actions đang chạy bản cũ (chưa có action version). Hãy deploy bản 7.7.0.'
                : 'Không đọc được phiên bản máy chủ: ' + ((err && err.message) || 'lỗi không rõ');
        });

        function show(name) {
            FOUNDER_TABS.forEach(function (t) {
                var on = t[0] === name;
                var b = buttons[t[0]];
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            host.textContent = '';
            if (!panels[name]) {
                var panel = h('div', 'bkf-tabpanel');
                if (name === 'achievements') tabAchievements(panel, ctx);
                else if (name === 'titles') tabTitles(panel, ctx);
                else if (name === 'gamification') tabGamification(panel, ctx);
                else tabFounder(panel, ctx);
                panels[name] = panel;
            }
            host.appendChild(panels[name]);
        }

        show('achievements');
    }

    /* ---------------------------------------------------------------------
       TAB GAMIFICATION (8.3.6) — đặt cấp độ, buff XP theo đối tượng
       ------------------------------------------------------------------ */
    function tabGamification(pane, ctx) {
        var mod = global.BKFounderGamification;
        if (!mod || typeof mod.render !== 'function') {
            pane.appendChild(ctx.kit.alertBox(
                'Không tải được mô-đun Gamification (bk-founder-gamification.js). Hãy tải lại trang.',
                'error'));
            return;
        }
        mod.render(pane, ctx.kit);
    }

    /* ---------------------------------------------------------------------
       TAB 1 — THÀNH TÍCH (badge + khung avatar)
       ------------------------------------------------------------------ */
    function tabAchievements(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var state = ctx.state;

        sectionGrant(pane, ctx);
        sectionGamificationBadges(pane, ctx);
        sectionBulk(pane, ctx);
        sectionAuto(pane, ctx);
        sectionFull(pane, ctx);
        sectionHistory(pane, ctx);
    }

    /* Bộ chọn người nhận dùng chung cho mọi khu vực. */
    function makeRecipient(ctx, opts) {
        var h = ctx.h;
        var kit = ctx.kit;
        var api = ctx.api;
        opts = opts || {};

        var root = h('div', 'bkf-recipient');
        var row = h('div', 'bkf-searchrow');
        var field = kit.input('search', opts.placeholder || 'Nhập tên hoặc username…');
        field.className = 'bkc-input bkf-input';
        field.setAttribute('aria-label', 'Tìm người nhận');
        field.setAttribute('autocomplete', 'off');
        var clearBtn = kit.iconBtn('fa-xmark', 'Bỏ chọn người nhận', function () { reset(); }, 'bkc-icon-btn-ghost');
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
            if (student.is_founder) info.appendChild(h('span', 'bkf-tag is-founder', 'Người sáng lập'));
            chip.appendChild(info);
            chip.appendChild(kit.iconBtn('fa-xmark', 'Bỏ chọn', function () { reset(); }, 'bkc-icon-btn-ghost'));
            picked.appendChild(chip);
            field.value = student.display_name;
            lastQuery = '';
            if (opts.onSelect) opts.onSelect(student);
        }

        function renderStudents(students, q) {
            if (!students.length) {
                kit.emptyState(results, 'fa-user-slash', 'Không tìm thấy tài khoản',
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
                rowEl.appendChild(kit.icon('fa-arrow-right'));
                rowEl.addEventListener('click', function () { choose(s); });
                list.appendChild(rowEl);
            });
            results.appendChild(list);
        }

        function searchStudents(q) {
            return api('students.search', { q: q, limit: 8 }).catch(function (err) {
                if (!isUnknownAction(err)) throw err;
                return api('students.list', { q: q, limit: 8, status: 'active' }).then(function (data) {
                    var list = (data && data.students) || [];
                    return {
                        ok: true,
                        fallback: true,
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
                if (mine !== seq) return;
                hint.textContent = (data.count ? data.count + ' gợi ý' : '') +
                    (data.fallback ? ' · máy chủ cũ (students.list)' : '');
                renderStudents(data.students || [], q);
            }).catch(function (err) {
                if (mine !== seq) return;
                hint.textContent = '';
                results.textContent = '';
                results.appendChild(kit.alertBox((err && err.message) || 'Tìm kiếm thất bại. Thử lại sau.', 'error'));
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

    /* Hình xem trước vật phẩm */
    function artNode(h, item, big) {
        var wrap = h('span', 'bkf-art' + (big ? ' is-big' : ''));
        if (item.type === 'badge') {
            var def = badgeMeta(item.id);
            var B = global.BK && global.BK.badges ? global.BK.badges : null;
            if (def.art && B && typeof B.art === 'function') {
                wrap.innerHTML = B.art(def.art);
                wrap.classList.add('is-svg');
            } else {
                wrap.appendChild(h('i', 'fa-solid ' + (def.icon || 'fa-award')));
            }
            return wrap;
        }
        var P = global.BKProfile;
        var art = P && typeof P.frameOverlay === 'function' ? P.frameOverlay(item.id) : null;
        if (art) {
            wrap.classList.add('is-frame');
            wrap.appendChild(art);
        } else {
            wrap.appendChild(h('i', 'fa-solid fa-circle-notch'));
        }
        return wrap;
    }

    /* ---------------------------------------------------------------------
       Báo cáo trao tặng — MỘT hợp đồng cho mọi action
       ------------------------------------------------------------------ */
    function paintGrantReport(h, kit, host, data, fallbackName, opts) {
        opts = opts || {};
        host.textContent = '';
        var box = h('div', 'bkf-report');
        var who = (data && data.studentName) || fallbackName || 'người nhận';
        var requested = countOr(data && data.requested_count);
        if (requested === null) requested = countOr(data && data.requested);
        if (requested === null && data && Array.isArray(data.addedIds)) {
            requested = data.addedIds.length + (countOr(data.alreadyOwned) || 0);
        }
        var granted = countOr(data && data.granted_count);
        if (granted === null) granted = countOr(data && data.added);
        if (granted === null && data && Array.isArray(data.addedIds)) granted = data.addedIds.length;
        if (granted === null && data && Array.isArray(data.badges)) granted = data.badges.length;
        var already = countOr(data && data.already_owned_count);
        if (already === null) already = countOr(data && data.alreadyOwned);
        var failed = countOr(data && data.failed_count);
        if (failed === null && data && Array.isArray(data.failed)) failed = data.failed.length;
        var status = data && data.status ? String(data.status) : '';

        /* Phản hồi KHÔNG cho biết kết quả → chuyển sang đối soát, không cho
           chạy lại ngay và không tự gửi lại giao dịch. */
        var unknown = granted === null && !status;
        if (unknown) {
            var warn = h('div', 'bkf-result is-warn');
            warn.setAttribute('role', 'alert');
            warn.appendChild(h('b', null, 'Cần đối soát giao dịch'));
            warn.appendChild(h('p', null,
                'Máy chủ đã nhận yêu cầu cấp cho ' + who + ' nhưng không trả về kết quả đã lưu. ' +
                'Không tự gửi lại. Hãy đối chiếu tồn kho và lịch sử bên dưới trước khi chạy lại.'));
            box.appendChild(warn);
            if (opts.onReconcile) {
                var recon = kit.btn('Đối chiếu tồn kho ngay', 'bkc-btn-ghost', opts.onReconcile, 'fa-scale-balanced');
                box.appendChild(recon);
            }
            host.appendChild(box);
            return;
        }

        var okStatus = status === 'granted' || status === 'partial' || status === 'already_owned' || status === 'replayed';
        var line = h('div', 'bkf-result ' + (okStatus ? 'is-ok' : (status === 'failed' ? 'is-error' : 'is-warn')));
        line.setAttribute('role', 'status');
        var text;
        if (status === 'replayed') {
            text = (data && data.message) || 'Yêu cầu này đã được xử lý trước đó — không trao lặp.';
        } else if (status === 'already_owned') {
            text = 'Không cấp mới: ' + who + ' đã sở hữu toàn bộ vật phẩm được chọn (không tạo bản ghi trùng).';
        } else if (status === 'failed') {
            text = 'Không cấp được vật phẩm nào cho ' + who + '. Xem lỗi bên dưới.';
        } else if (status === 'none') {
            text = 'Không có vật phẩm nào để cấp cho ' + who + '.';
        } else if (status === 'partial') {
            text = 'Cấp một phần cho ' + who + ': ' + granted + ' mới, ' + already + ' đã có, ' + failed + ' lỗi.';
        } else {
            text = 'Đã cấp ' + granted + ' vật phẩm mới cho ' + who + '.';
        }
        line.appendChild(h('span', null, text));
        box.appendChild(line);

        var grid = h('div', 'bkf-report-grid');
        if (requested !== null) grid.appendChild(h('span', 'bkf-tag', 'Yêu cầu: ' + requested));
        grid.appendChild(h('span', 'bkf-tag is-owned', 'Cấp mới: ' + countText(granted)));
        grid.appendChild(h('span', 'bkf-tag', 'Đã sở hữu: ' + countText(already)));
        grid.appendChild(h('span', 'bkf-tag' + (failed ? ' is-exclusive' : ''), 'Lỗi: ' + countText(failed)));
        if (status) grid.appendChild(h('span', 'bkf-tag is-muted', 'Trạng thái: ' + status));
        box.appendChild(grid);

        if (data && Array.isArray(data.granted_badges) && data.granted_badges.length) {
            var chips = h('div', 'bkf-chips');
            data.granted_badges.slice(0, 32).forEach(function (b) {
                chips.appendChild(h('span', 'bkf-tag is-owned', b.name || b.id));
            });
            if (data.granted_badges.length > 32) {
                chips.appendChild(h('span', 'bkf-tag is-muted', '+' + (data.granted_badges.length - 32) + ' nữa'));
            }
            box.appendChild(h('p', 'bkf-hint', 'Vật phẩm đã cấp mới'));
            box.appendChild(chips);
        }
        if (data && Array.isArray(data.errors) && data.errors.length) {
            var errList = h('ul', 'bkf-reasons');
            data.errors.slice(0, 20).forEach(function (e) {
                var li = h('li');
                li.appendChild(h('b', null, (e.name || e.id) + ': '));
                li.appendChild(h('span', null, e.message || 'lỗi không rõ'));
                errList.appendChild(li);
            });
            box.appendChild(h('p', 'bkf-hint', 'Lỗi khi cấp'));
            box.appendChild(errList);
        }
        host.appendChild(box);
        return { granted: granted, already: already, failed: failed, status: status };
    }

    /* ---------------------------------------------------------------------
       Tồn kho người nhận
       ------------------------------------------------------------------ */
    function loadInventory(ctx, host, student, onDone) {
        var h = ctx.h;
        var kit = ctx.kit;
        var api = ctx.api;
        kit.loading(host, 'Đang đọc tồn kho vật phẩm…');
        api('students.inventory', { id: student.id }).catch(function (err) {
            if (!isUnknownAction(err)) throw err;
            return api('badges.list', { id: student.id }).then(function (res) {
                var rows = (res && res.badges) || [];
                var B = global.BK && global.BK.badges ? global.BK.badges : null;
                var P2 = global.BKProfile;
                return {
                    ok: true,
                    fallback: true,
                    studentId: student.id,
                    studentName: student.display_name,
                    isFounder: !!student.is_founder,
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
            ctx.state.inventory = data;
            host.textContent = '';
            var ownedBadges = Array.isArray(data.badges) ? data.badges.length : 0;
            var ownedFrames = Array.isArray(data.frames) ? data.frames.length : 0;
            var catalogTotal = countOr(data.catalogTotal);
            if (catalogTotal === null) catalogTotal = catalogMix(data.catalog).total;
            var line = h('div', 'bkf-inventory-line');
            line.appendChild(h('span', 'bkf-inventory-name', data.studentName));
            line.appendChild(h('span', 'bkf-tag', ownedBadges + ' / ' + catalogTotal + ' badge'));
            line.appendChild(h('span', 'bkf-tag', ownedFrames + ' khung'));
            if (data.equippedFrame && data.equippedFrame !== 'none') {
                line.appendChild(h('span', 'bkf-tag is-owned', 'Đang dùng: ' + data.equippedFrame));
            }
            if (data.isFounder) line.appendChild(h('span', 'bkf-tag is-founder', 'Người sáng lập'));
            if (data.fallback) line.appendChild(h('span', 'bkf-tag is-muted', 'máy chủ cũ'));
            host.appendChild(line);
            if (onDone) onDone(data);
        }).catch(function (err) {
            host.textContent = '';
            host.appendChild(kit.alertBox((err && err.message) || 'Không đọc được tồn kho.', 'error'));
        });
    }

    /* ---------------------------------------------------------------------
       Khu vực: trao một hoặc nhiều vật phẩm
       ------------------------------------------------------------------ */
    function sectionGrant(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var state = ctx.state;
        var api = ctx.api;

                var box = kit.card('Trao badge và khung avatar', null,
            'Chọn người nhận, chọn một hoặc nhiều vật phẩm rồi xác nhận. Từ 7.9.0, Founder trao được mọi badge/khung Founder cho học sinh; '
            + 'riêng Thiên Khải Sáng Thế vẫn chỉ dành cho hồ sơ Người sáng lập. Mọi điều kiện quyền hạn được kiểm tra lại ở máy chủ; '
            + 'máy chủ chống trao trùng theo từng vật phẩm và theo request_id.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var inventoryHost = h('div', 'bkf-inventory');
        var resultHost = h('div', 'bkf-result-host');

        var recipient = makeRecipient(ctx, {
            placeholder: 'Tìm người nhận: tên hoặc username…',
            onSelect: function (student) {
                state.student = student;
                state.inventory = null;
                state.selected = {};
                inventoryHost.textContent = '';
                resultHost.textContent = '';
                if (student) loadInventory(ctx, inventoryHost, student, function () { picker.reload(); });
                picker.load();
                syncConfirm();
            }
        });
        host.appendChild(recipient.root);
        host.appendChild(inventoryHost);

        var confirmBtn = kit.btn('Xác nhận trao tặng', 'bkc-btn-primary', doGrant, 'fa-gift');
        confirmBtn.disabled = true;

        var picker = makePicker(ctx, function () { syncConfirm(); });
        host.appendChild(picker.root);

        var reason = kit.input('text', 'Lý do trao (không bắt buộc, tối đa 200 ký tự)');
        reason.className = 'bkc-input bkf-reason';
        reason.setAttribute('aria-label', 'Lý do trao tặng');
        reason.maxLength = 200;
        host.appendChild(reason);
        host.appendChild(confirmBtn);
        host.appendChild(resultHost);

        function syncConfirm() {
            var count = Object.keys(state.selected).length;
            confirmBtn.disabled = state.busy || !state.student || !count;
            confirmBtn.textContent = '';
            confirmBtn.appendChild(kit.icon('fa-gift'));
            confirmBtn.appendChild(D.createTextNode(
                count ? ' Trao ' + count + ' vật phẩm đã chọn' : ' Xác nhận trao tặng'));
        }

        function doGrant() {
            if (state.busy) return;
            var student = state.student;
            var chosen = picker.selectedItems();
            if (!student || !chosen.length) {
                ctx.toast('Chọn người nhận và ít nhất một vật phẩm.', 'warn');
                return;
            }
            var rows = [
                ['Người nhận', student.display_name + (student.student_code ? ' · ' + student.student_code : '')],
                ['Số vật phẩm', String(chosen.length)],
                ['Danh sách', chosen.slice(0, 8).map(itemName).join(', ') +
                    (chosen.length > 8 ? '… (+' + (chosen.length - 8) + ')' : '')],
                ['Lý do', String(reason.value || '').trim() || '(không ghi lý do)']
            ];
            confirmDialog(h, 'Xác nhận trao vật phẩm', rows, 'Trao ' + chosen.length + ' vật phẩm').then(function (ok) {
                if (!ok) return;
                state.busy = true;
                syncConfirm();
                resultHost.textContent = '';
                kit.loading(resultHost, 'Đang trao ' + chosen.length + ' vật phẩm…');
                var reasonText = String(reason.value || '').trim();
                var granted = [];
                var owned = [];
                var errors = [];
                var chain = Promise.resolve();
                chosen.forEach(function (item) {
                    chain = chain.then(function () {
                        return api('founder.grantItem', {
                            id: student.id,
                            item_type: item.type,
                            item_id: item.id,
                            reason: reasonText,
                            request_id: newRequestId()
                        }).catch(function (err) {
                            if (!isUnknownAction(err)) throw err;
                            var badgeId = item.type === 'frame' ? badgeIdForFrame(item.id) : item.id;
                            if (!badgeId) {
                                errors.push({ id: item.id, name: itemName(item), message: 'Khung này không gắn badge nên không trao riêng được.' });
                                return null;
                            }
                            return api('badges.grant', {
                                id: student.id,
                                badge_id: badgeId,
                                reason: reasonText,
                                request_id: newRequestId()
                            });
                        }).then(function (data) {
                            data = data || {};
                            var status = data.status || '';
                            if (status === 'already_owned') owned.push(item);
                            else if (status === 'failed') {
                                errors.push({ id: item.id, name: itemName(item), message: data.message || 'máy chủ báo lỗi' });
                            } else if (countOr(data.granted_count) === 0) owned.push(item);
                            else granted.push(item);
                        }).catch(function (err) {
                            errors.push({ id: item.id, name: itemName(item), message: (err && err.message) || 'lỗi không rõ' });
                        });
                    });
                });

                chain.then(function () {
                    resultHost.textContent = '';
                    var report = h('div', 'bkf-report');
                    var okAll = !errors.length;
                    report.appendChild(resultBox(h, okAll,
                        'Đã cấp ' + granted.length + ' vật phẩm mới cho ' + student.display_name +
                        (owned.length ? ', ' + owned.length + ' đã sở hữu' : '') +
                        (errors.length ? ', ' + errors.length + ' lỗi' : '') + '.'));
                    var grid = h('div', 'bkf-report-grid');
                    grid.appendChild(h('span', 'bkf-tag', 'Yêu cầu: ' + chosen.length));
                    grid.appendChild(h('span', 'bkf-tag is-owned', 'Cấp mới: ' + granted.length));
                    grid.appendChild(h('span', 'bkf-tag', 'Đã sở hữu: ' + owned.length));
                    grid.appendChild(h('span', 'bkf-tag' + (errors.length ? ' is-exclusive' : ''), 'Lỗi: ' + errors.length));
                    report.appendChild(grid);
                    if (granted.length) {
                        var chips = h('div', 'bkf-chips');
                        granted.forEach(function (it) { chips.appendChild(h('span', 'bkf-tag is-owned', itemName(it))); });
                        report.appendChild(chips);
                    }
                    if (errors.length) {
                        var ul = h('ul', 'bkf-reasons');
                        errors.forEach(function (e) {
                            var li = h('li');
                            li.appendChild(h('b', null, e.name + ': '));
                            li.appendChild(h('span', null, e.message));
                            ul.appendChild(li);
                        });
                        report.appendChild(ul);
                    }
                    resultHost.appendChild(report);
                    ctx.toast(granted.length ? 'Đã cấp ' + granted.length + ' vật phẩm.' : 'Không có vật phẩm mới.', granted.length ? 'success' : 'info');
                    if (state.student && state.student.id === student.id) {
                        loadInventory(ctx, inventoryHost, student, function () { picker.reload(); });
                    }
                    reason.value = '';
                    state.selected = {};
                    picker.clearSelection();
                }).then(function () {
                    state.busy = false;
                    syncConfirm();
                });
            });
        }

        picker.load();
        syncConfirm();
    }

    /* ---------------------------------------------------------------------
       Bộ chọn vật phẩm nhiều lựa chọn
       ------------------------------------------------------------------ */
    function makePicker(ctx, onChange) {
        var h = ctx.h;
        var kit = ctx.kit;
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
            var b = kit.btn(pair[1], 'bkc-btn-ghost', function () {
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
        var filter = kit.input('search', 'Lọc theo tên hoặc mã…');
        filter.className = 'bkc-input bkf-input';
        filter.setAttribute('aria-label', 'Lọc vật phẩm');
        var onlyUnowned = h('label', 'bkf-check');
        var onlyBox = h('input');
        onlyBox.type = 'checkbox';
        onlyUnowned.appendChild(onlyBox);
        onlyUnowned.appendChild(h('span', null, 'Chỉ hiện món chưa sở hữu'));
        var selectAll = kit.btn('Chọn tất cả đang hiện', 'bkc-btn-ghost', function () {
            visibleItems().forEach(function (it) { if (it.grantable !== false) state.selected[keyOf(it)] = it; });
            paintGrid();
            if (onChange) onChange();
        }, 'fa-check-double');
        selectAll.classList.add('bkf-mini');
        var clearSel = kit.btn('Bỏ chọn', 'bkc-btn-ghost', function () {
            state.selected = {};
            paintGrid();
            if (onChange) onChange();
        }, 'fa-eraser');
        clearSel.classList.add('bkf-mini');
        tools.appendChild(filter);
        tools.appendChild(onlyUnowned);
        tools.appendChild(selectAll);
        tools.appendChild(clearSel);
        root.appendChild(tools);

        var summary = h('div', 'bkf-hint');
        root.appendChild(summary);
        var grid = h('div', 'bkf-grid');
        root.appendChild(grid);
        var preview = h('div', 'bkf-preview');
        root.appendChild(preview);

        function keyOf(it) { return it.type + ':' + it.id; }

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
                preview.appendChild(h('p', 'bkf-hint', 'Chọn một vật phẩm để xem trước (chọn nhiều bằng cách bấm tiếp).'));
                return;
            }
            var box = h('div', 'bkf-preview-inner');
            box.appendChild(artNode(h, item, true));
            var info = h('div', 'bkf-preview-info');
            info.appendChild(h('b', 'bkf-preview-name', itemName(item)));
            info.appendChild(h('span', 'bkf-preview-id', item.id));
            var tags = h('div', 'bkf-tags');
            if (item.exclusive) tags.appendChild(h('span', 'bkf-tag is-exclusive', 'Độc quyền'));
            if (item.owned) tags.appendChild(h('span', 'bkf-tag is-owned', 'Đã sở hữu'));
            else if (item.owned === false) tags.appendChild(h('span', 'bkf-tag', 'Chưa sở hữu'));
            if (item.type === 'frame' && item.grantable === false) tags.appendChild(h('span', 'bkf-tag is-muted', 'Không trao riêng'));
            info.appendChild(tags);
            var desc = item.type === 'frame'
                ? (frameMeta(item.id).desc || 'Khung avatar trang trí quanh ảnh đại diện.')
                : (badgeMeta(item.id).desc || '');
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
            var picked = Object.keys(state.selected).length;
            summary.textContent = items.length + ' / ' + state.items.length + ' vật phẩm · đã chọn ' + picked +
                (state.type === 'frame' ? ' · khung không gắn badge sẽ không trao được' : '') +
                (state.itemsFallback ? ' · danh mục cục bộ (máy chủ cũ)' : '');
            if (!items.length) {
                kit.emptyState(grid, 'fa-box-open', 'Không có vật phẩm phù hợp',
                    'Thử bỏ bộ lọc hoặc chọn nhóm vật phẩm khác.');
                return;
            }
            var frag = D.createDocumentFragment();
            items.forEach(function (it) {
                var key = keyOf(it);
                var on = !!state.selected[key];
                /* Thiên Khải Sáng Thế chỉ dành cho hồ sơ Người sáng lập. */
                var lockTop = it.type === 'badge' && it.id === 'founder' &&
                    state.student && !state.student.is_founder;
                var tile = h('button', 'bkf-item' + (on ? ' is-selected' : '') +
                    (it.owned ? ' is-owned' : ''));
                tile.type = 'button';
                tile.setAttribute('aria-pressed', on ? 'true' : 'false');
                tile.setAttribute('aria-label', (on ? 'Bỏ chọn ' : 'Chọn ') + itemName(it));
                if (it.grantable === false || lockTop) tile.classList.add('is-disabled');
                tile.appendChild(artNode(h, it, false));
                tile.appendChild(h('b', 'bkf-item-name', itemName(it)));
                tile.appendChild(h('span', 'bkf-item-id', it.id));
                var line = h('span', 'bkf-item-meta');
                if (it.exclusive) line.appendChild(h('span', 'bkf-tag is-exclusive', 'Độc quyền'));
                if (it.owned) line.appendChild(h('span', 'bkf-tag is-owned', 'Đã có'));
                else if (it.owned === false) line.appendChild(h('span', 'bkf-tag', 'Chưa có'));
                if (on) line.appendChild(h('span', 'bkf-tag is-picked', 'Đã chọn'));
                if (lockTop) line.appendChild(h('span', 'bkf-tag is-exclusive', 'Chỉ hồ sơ Founder'));
                tile.appendChild(line);
                tile.addEventListener('click', function () {
                    state.item = it;
                    if (it.grantable === false) {
                        ctx.toast('Khung này không gắn badge nên không trao riêng được.', 'warn');
                        paintPreview(it);
                        return;
                    }
                    if (lockTop) {
                        ctx.toast('Thiên Khải Sáng Thế chỉ trao cho hồ sơ Người sáng lập.', 'warn');
                        paintPreview(it);
                        return;
                    }
                    if (state.selected[key]) delete state.selected[key];
                    else state.selected[key] = it;
                    paintGrid();
                    paintPreview(it);
                    if (onChange) onChange();
                });
                frag.appendChild(tile);
            });
            grid.appendChild(frag);
        }

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
                        adminOnly: !!b.adminOnly, grantable: true,
                        owned: known ? !!owned[b.id] : null
                    };
                });
            }
            var seen = { none: true };
            var frames = [{
                id: 'none', type: 'frame', badgeId: '', exclusive: false,
                grantable: false, owned: known ? true : null
            }];
            catalog.forEach(function (b) {
                if (!b.frame || seen[b.frame]) return;
                seen[b.frame] = true;
                frames.push({
                    id: b.frame, type: 'frame', badgeId: b.id,
                    exclusive: !!b.exclusive, grantable: true,
                    owned: known ? (b.frame === 'leaf' ? true : !!owned[b.id]) : null
                });
            });
            return frames;
        }

        var type = 'badge';

        function load() {
            type = state.type === 'frame' || state.type === 'founder-frame' ? 'frame' : 'badge';
            var founderOnly = state.type === 'founder-badge' || state.type === 'founder-frame';
            grid.textContent = '';
            preview.textContent = '';
            state.item = null;
            kit.loading(grid, 'Đang tải danh mục vật phẩm…');
            var payload = { type: type };
            if (state.student) payload.id = state.student.id;

            function applyItems(data) {
                var items = (data.items || []).filter(function (it) {
                    if (founderOnly) return it.exclusive === true || it.founderOnly === true;
                    return !(it.exclusive === true || it.founderOnly === true);
                });
                if (type === 'frame') {
                    items = items.filter(function (it) { return it.id !== 'none'; });
                }
                state.items = items;
                state.itemsFallback = !!data.fallback;
                paintGrid();
                paintPreview(null);
            }

            ctx.api('admin.items.list', payload).then(applyItems).catch(function (err) {
                if (isUnknownAction(err)) {
                    applyItems({ ok: true, fallback: true, items: localItems() });
                    return;
                }
                grid.textContent = '';
                grid.appendChild(kit.alertBox((err && err.message) || 'Không tải được danh mục vật phẩm.', 'error'));
            });
        }

        filter.addEventListener('input', paintGrid);
        onlyBox.addEventListener('change', paintGrid);
        paintTabs();

        return {
            root: root,
            load: load,
            reload: function () { load(); },
            selected: function () { return state.item; },
            selectedItems: function () {
                return Object.keys(state.selected).map(function (k) { return state.selected[k]; });
            },
            clearSelection: function () {
                state.selected = {};
                paintGrid();
            }
        };
    }

    /* ---------------------------------------------------------------------
       Khu vực: trao toàn bộ badge đồng bộ
       ------------------------------------------------------------------ */
    function sectionBulk(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var state = ctx.state;
        var api = ctx.api;
        var toast = ctx.toast;

        var mix = catalogMix();
        var box = kit.card('Trao tặng toàn bộ badge', null,
            'Cấp mọi badge có thể trao cho một tài khoản, tự động trừ badge độc quyền. Có bản xem trước chỉ đọc trước khi xác nhận. ' +
            'Danh mục hiện có ' + mix.total + ' badge: ' + mixText(mix) + '.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var bulk = { student: null, preview: null, busy: false, reconciled: false };
        var recipient = makeRecipient(ctx, {
            placeholder: 'Tìm người nhận badge…',
            onSelect: function (student) {
                bulk.student = student;
                bulk.preview = null;
                bulk.reconciled = false;
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
            api('badges.grantAllPreview', { id: id }).catch(function (err) {
                if (!isUnknownAction(err)) throw err;
                return api('badges.list', { id: id }).then(function (res) {
                    var B = global.BK && global.BK.badges ? global.BK.badges : null;
                    var catalog = (B && B.CATALOG) ? B.CATALOG : [];
                    var owned = {};
                    ((res && res.badges) || []).forEach(function (r) { owned[String(r.badge_id)] = true; });
                    var grantable = catalog.filter(function (b) { return !b.exclusive; });
                    var toGrant = grantable.filter(function (b) { return !owned[b.id]; });
                    var already = grantable.filter(function (b) { return owned[b.id]; });
                    var excluded = catalog.filter(function (b) { return !!b.exclusive; });
                    return {
                        ok: true, dryRun: true, fallback: true,
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
                var toAdd = countOr(data.toAddCount);
                if (toAdd === null && Array.isArray(data.toGrant)) toAdd = data.toGrant.length;
                var grantableCount = countOr(data.totalGrantable);
                if (grantableCount === null && Array.isArray(data.toGrant)) grantableCount = data.toGrant.length;
                var alreadyCount = countOr(data.alreadyOwnedCount);
                if (alreadyCount === null && Array.isArray(data.alreadyOwned)) alreadyCount = data.alreadyOwned.length;
                var excludedCount = countOr(data.excludedCount);
                if (excludedCount === null && Array.isArray(data.excluded)) excludedCount = data.excluded.length;
                data.toAddCount = toAdd === null ? 0 : toAdd;
                data.totalGrantable = grantableCount === null ? 0 : grantableCount;
                data.alreadyOwnedCount = alreadyCount === null ? 0 : alreadyCount;
                data.excludedCount = excludedCount === null ? 0 : excludedCount;
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
                ['Loại trừ', preview.excludedCount + ' badge độc quyền (Founder/Developer/Administrator)'],
                ['Phạm vi', 'Chỉ tài khoản này; không ảnh hưởng học sinh khác']
            ];
            confirmDialog(h, 'Xác nhận cấp toàn bộ badge', rows, 'Cấp ' + preview.toAddCount + ' badge').then(function (ok) {
                if (!ok) return;
                bulk.busy = true;
                confirmBtn.disabled = true;
                reportHost.textContent = '';
                kit.loading(reportHost, 'Đang cấp badge…');
                api('badges.grantAll', { id: student.id, request_id: newRequestId() }).then(function (data) {
                    var rep = paintGrantReport(h, kit, reportHost, data || {}, student.display_name, {
                        onReconcile: function () { loadPreview(student.id); }
                    });
                    var grantedNew = rep && countOr(rep.granted) !== null ? rep.granted : null;
                    toast(grantedNew === null
                        ? 'Cần đối soát: máy chủ không trả về số badge đã cấp.'
                        : (grantedNew ? 'Đã cấp ' + grantedNew + ' badge.' : 'Không có badge mới nào.'),
                        grantedNew ? 'success' : 'info');
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
       Khu vực: tự động xét badge đủ điều kiện
       ------------------------------------------------------------------ */
    function sectionAuto(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var api = ctx.api;
        var toast = ctx.toast;

        var box = kit.card('Tự động xét badge đủ điều kiện', null,
            'Máy chủ tính lại chỉ số từ dữ liệu học tập rồi chỉ cấp badge tự động đủ điều kiện. ' +
            'Badge độc quyền và badge trao tay không bao giờ được cấp ở đây.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var auto = { student: null, busy: false };
        var recipient = makeRecipient(ctx, {
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
                wrap.appendChild(h('span', 'bkf-tag', typeof it === 'string' ? it : (it.name || it.id)));
            });
            return wrap;
        }

        function runAuto() {
            if (auto.busy || !auto.student) return;
            auto.busy = true;
            runBtn.disabled = true;
            reportHost.textContent = '';
            kit.loading(reportHost, 'Đang tính lại thành tích từ dữ liệu đã đồng bộ…');
            api('badges.autoGrant', { id: auto.student.id }).then(function (data) {
                data = data || {};
                reportHost.textContent = '';
                var report = h('div', 'bkf-report');
                report.appendChild(h('b', null, 'Báo cáo cho ' + (data.studentName || auto.student.display_name)));
                var earned = Array.isArray(data.earned) ? data.earned : [];
                var alreadyOwned = Array.isArray(data.alreadyOwned) ? data.alreadyOwned : [];
                var notEligible = Array.isArray(data.notEligible) ? data.notEligible : [];
                var excluded = Array.isArray(data.excluded) ? data.excluded : [];

                var grid = h('div', 'bkf-report-grid');
                grid.appendChild(h('span', 'bkf-tag is-owned', 'Mới cấp: ' + earned.length));
                grid.appendChild(h('span', 'bkf-tag', 'Đã sở hữu: ' + alreadyOwned.length));
                grid.appendChild(h('span', 'bkf-tag', 'Chưa đủ điều kiện: ' + notEligible.length));
                grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Bị loại trừ: ' + excluded.length));
                report.appendChild(grid);

                report.appendChild(h('p', 'bkf-hint', 'Badge mới được cấp'));
                report.appendChild(earned.length
                    ? chipList(earned)
                    : kit.alertBox('Không có badge mới — học sinh chưa đạt thêm điều kiện nào.', 'info'));

                if (excluded.length) {
                    report.appendChild(h('p', 'bkf-hint', 'Không xét tự động (kèm lý do)'));
                    var ex = h('ul', 'bkf-reasons');
                    excluded.forEach(function (it) {
                        var li = h('li');
                        li.appendChild(h('b', null, it.name + ': '));
                        li.appendChild(h('span', null, it.reason));
                        ex.appendChild(li);
                    });
                    report.appendChild(ex);
                }
                if (notEligible.length) {
                    var details = D.createElement('details');
                    details.className = 'bkf-details';
                    var sum = D.createElement('summary');
                    sum.textContent = 'Xem ' + notEligible.length + ' badge chưa đủ điều kiện';
                    details.appendChild(sum);
                    details.appendChild(chipList(notEligible));
                    report.appendChild(details);
                }
                reportHost.appendChild(report);
                toast('Đã cấp ' + earned.length + ' badge mới.', 'success');
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
       Khu vực: cấp trọn bộ danh mục (mọi badge + mọi khung)
       ------------------------------------------------------------------ */
    function sectionFull(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var api = ctx.api;
        var toast = ctx.toast;
        var B = global.BK && global.BK.badges ? global.BK.badges : null;
        var P = global.BKProfile;

        var mix = catalogMix();
        var badgeTotal = B && B.CATALOG ? B.CATALOG.length : mix.total;
        var frameTotal = frameCatalogSize(B, P);

        var box = kit.card('Cấp trọn bộ cho hồ sơ Founder', null,
            'Trao toàn bộ ' + badgeTotal + ' badge trong danh mục (' + mixText(mix) + ') và mở toàn bộ ' +
            frameTotal + ' khung avatar cho hồ sơ Người sáng lập. Thao tác idempotent: chạy lại không tạo bản ghi trùng, ' +
            'và cùng request_id thì máy chủ trả lại kết quả cũ thay vì trao lặp.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var full = { student: null, busy: false };
        var recipient = makeRecipient(ctx, {
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
                api('founder.grantAll', payload).then(function (data) {
                    data = data || {};
                    paintGrantReport(h, kit, reportHost, data, student ? student.display_name : 'hồ sơ Founder');
                    var mixDone = catalogMix(data.catalog);
                    var frameDone = countOr(data.frameCount);
                    if (frameDone === null && Array.isArray(data.frames)) frameDone = data.frames.length;
                    if (frameDone === null) frameDone = frameTotal;
                    var grid = h('div', 'bkf-report-grid');
                    grid.appendChild(h('span', 'bkf-tag', 'Danh mục: ' + mixDone.total + ' badge'));
                    grid.appendChild(h('span', 'bkf-tag', 'Tự động: ' + mixDone.auto));
                    grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Founder: ' + mixDone.founder));
                    grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Developer: ' + mixDone.dev));
                    grid.appendChild(h('span', 'bkf-tag is-exclusive', 'Administrator: ' + mixDone.admin));
                    grid.appendChild(h('span', 'bkf-tag', 'Khung: ' + countText(frameDone)));
                    if (data.equippedFrame) grid.appendChild(h('span', 'bkf-tag is-owned', 'Đang dùng: ' + data.equippedFrame));
                    reportHost.appendChild(grid);
                    toast('Đã xử lý cấp trọn bộ.', 'success');
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
       Khu vực: lịch sử cấp vật phẩm
       ------------------------------------------------------------------ */
    /* ---------------------------------------------------------------------
       8.3.8 — Trao Badge từ bộ sưu tập Gamification (achievement_defs)
       Tìm theo tên, lọc nhóm/độ hiếm, xem trạng thái sở hữu, trao nhiều badge
       trong một lần. Máy chủ chống trao trùng và kiểm tra quyền Founder.
       ------------------------------------------------------------------ */
    function sectionGamificationBadges(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var gam = ctx.kit.gamificationApi;
        var box = kit.card('Badge từ bộ sưu tập Gamification', null,
            'Đây là các thành tựu/badge của hệ thống Gamification. Chọn người nhận, lọc theo nhóm và độ hiếm, ' +
            'xem ai đã sở hữu rồi trao nhiều badge trong một lần. Máy chủ bỏ qua badge đã có.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var student = null;
        var catalog = [];
        var picked = {};
        var busy = false;

        if (typeof gam !== 'function') {
            host.appendChild(kit.alertBox(
                'Chưa tải được lớp Gamification. Hãy tải lại trang.', 'error'));
            return;
        }

        var recipient = makeRecipient(ctx, {
            placeholder: 'Tìm người nhận badge Gamification…',
            onSelect: function (s) {
                student = s;
                picked = {};
                loadCatalog();
            }
        });
        host.appendChild(recipient.root);

        var tools = h('div', 'bkf-tools');
        var search = kit.input('search', 'Tìm badge theo tên…');
        search.className = 'bkc-input bkf-input';
        search.setAttribute('aria-label', 'Tìm badge Gamification');
        var catSel = h('select', 'bkc-input');
        catSel.setAttribute('aria-label', 'Lọc badge theo nhóm');
        var raritySel = h('select', 'bkc-input');
        raritySel.setAttribute('aria-label', 'Lọc badge theo độ hiếm');
        var CATS = {
            learning: 'Học tập', quiz: 'Quiz', reading: 'Đọc hiểu', listening: 'Luyện nghe',
            revision: 'Ôn tập', consistency: 'Đều đặn', skill: 'Kỹ năng', boss: 'Boss',
            milestone: 'Cấp độ', event: 'Sự kiện', mission: 'Nhiệm vụ', activity: 'Hoạt động',
            discovery: 'Khám phá', gamification: 'Gamification', special: 'Đặc biệt', limited: 'Giới hạn'
        };
        var RAR = { common: 'Phổ biến', uncommon: 'Ít gặp', rare: 'Hiếm', epic: 'Cực hiếm', legendary: 'Huyền thoại' };
        function fillSelect(sel, allLabel, map) {
            sel.textContent = '';
            var o = h('option', null, allLabel);
            o.value = 'all';
            sel.appendChild(o);
            Object.keys(map).forEach(function (k) {
                var op = h('option', null, map[k]);
                op.value = k;
                sel.appendChild(op);
            });
        }
        fillSelect(catSel, 'Mọi nhóm', CATS);
        fillSelect(raritySel, 'Mọi độ hiếm', RAR);
        tools.appendChild(search);
        tools.appendChild(catSel);
        tools.appendChild(raritySel);
        host.appendChild(tools);

        var summary = h('div', 'bkf-hint', 'Chọn người nhận để xem trạng thái sở hữu.');
        host.appendChild(summary);
        var grid = h('div', 'bkf-grid');
        host.appendChild(grid);
        var resultHost = h('div', '');
        host.appendChild(resultHost);
        var confirmBtn = kit.btn('Xác nhận trao badge', 'bkc-btn-primary', grant, 'fa-medal');
        confirmBtn.disabled = true;
        host.appendChild(confirmBtn);

        function loadCatalog() {
            if (!student) {
                catalog = [];
                paint();
                return;
            }
            kit.loading(grid, 'Đang tải bộ sưu tập Gamification…');
            gam('admin.achievements.catalog', { student_id: student.id }).then(function (res) {
                catalog = (res && res.achievements) || [];
                paint();
            }).catch(function (err) {
                grid.textContent = '';
                grid.appendChild(kit.alertBox((err && err.message) || 'Không tải được bộ sưu tập.', 'error'));
            });
        }

        function visible() {
            var q = String(search.value || '').toLowerCase().trim();
            return catalog.filter(function (a) {
                if (catSel.value !== 'all' && a.category !== catSel.value) return false;
                if (raritySel.value !== 'all' && a.rarity !== raritySel.value) return false;
                if (q && String(a.name + ' ' + a.description).toLowerCase().indexOf(q) < 0) return false;
                return true;
            });
        }

        function paint() {
            grid.textContent = '';
            var list = visible();
            var owned = catalog.filter(function (a) {
                return Number(a.owned_stages || 0) >= Number(a.stages || 1);
            }).length;
            summary.textContent = student
                ? ('Người nhận: ' + student.display_name + ' · đã sở hữu ' + owned + '/' + catalog.length +
                    ' badge · đang chọn ' + Object.keys(picked).length)
                : 'Chọn người nhận để xem trạng thái sở hữu.';
            if (!list.length) {
                kit.emptyState(grid, 'fa-medal', 'Không có badge phù hợp',
                    student ? 'Thử bỏ bộ lọc.' : 'Chọn người nhận trước.');
            } else {
                list.forEach(function (a) {
                    var full = Number(a.owned_stages || 0) >= Number(a.stages || 1);
                    var on = !!picked[a.id];
                    var tile = h('button', 'bkf-item' + (on ? ' is-selected' : '') + (full ? ' is-owned is-disabled' : ''));
                    tile.type = 'button';
                    tile.setAttribute('aria-pressed', on ? 'true' : 'false');
                    if (full) tile.disabled = true;
                    var art = h('span', 'bkf-art');
                    art.appendChild(kit.icon(a.icon || 'fa-medal'));
                    tile.appendChild(art);
                    tile.appendChild(h('span', 'bkf-item-name', a.name));
                    var meta = h('span', 'bkf-item-meta');
                    meta.appendChild(h('span', 'bkf-sub', CATS[a.category] || a.category));
                    meta.appendChild(h('span', 'bkf-sub', RAR[a.rarity] || a.rarity));
                    tile.appendChild(meta);
                    tile.appendChild(h('span', 'bkf-item-id',
                        full ? 'Đã sở hữu' : ('Chưa sở hữu' + (a.stages > 1 ? ' · ' + a.owned_stages + '/' + a.stages + ' bậc' : ''))));
                    tile.addEventListener('click', function () {
                        if (picked[a.id]) delete picked[a.id]; else picked[a.id] = 1;
                        paint();
                    });
                    grid.appendChild(tile);
                });
            }
            confirmBtn.disabled = busy || !student || !Object.keys(picked).length;
            confirmBtn.textContent = '';
            confirmBtn.appendChild(kit.icon('fa-medal'));
            confirmBtn.appendChild(D.createTextNode(Object.keys(picked).length
                ? ' Trao ' + Object.keys(picked).length + ' badge'
                : ' Xác nhận trao badge'));
        }

        function grant() {
            if (busy || !student) return;
            var ids = Object.keys(picked);
            if (!ids.length) return;
            busy = true;
            paint();
            resultHost.textContent = '';
            kit.loading(resultHost, 'Đang trao ' + ids.length + ' badge…');
            gam('admin.achievements.grant', {
                student_id: student.id,
                ids: ids,
                reason: 'Founder trao badge Gamification'
            }).then(function (out) {
                var result = (out && out.result) || {};
                var granted = result.granted || [];
                var skipped = result.skipped || [];
                resultHost.textContent = '';
                resultHost.appendChild(kit.alertBox(
                    'Đã trao ' + granted.length + ' bậc badge cho ' + student.display_name +
                    (skipped.length ? ' · ' + skipped.length + ' mục đã sở hữu nên bỏ qua.' : '.'),
                    granted.length ? 'success' : 'info'));
                ctx.toast(granted.length ? 'Đã trao badge.' : 'Không có badge mới.', granted.length ? 'success' : 'info');
                picked = {};
                busy = false;
                loadCatalog();
            }).catch(function (err) {
                resultHost.textContent = '';
                resultHost.appendChild(kit.alertBox((err && err.message) || 'Không trao được badge.', 'error'));
                busy = false;
                paint();
            });
        }

        search.addEventListener('input', paint);
        catSel.addEventListener('change', paint);
        raritySel.addEventListener('change', paint);
        paint();
    }

    function sectionHistory(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var api = ctx.api;

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
            }
            api('admin.grantHistory', { limit: 30, offset: nextOffset }).then(function (data) {
                if (nextOffset === 0) listHost.textContent = '';
                var rows = (data && data.history) || [];
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
                        'Máy chủ chưa cập nhật action admin.grantHistory. Các lần trao vẫn được ghi vào nhật ký quản trị ' +
                        'và sẽ hiện ở đây sau khi deploy admin-actions 7.7.0.', 'info'));
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
            });
        }

        load(0);
    }

    /* ---------------------------------------------------------------------
       TAB 2 — DANH HIỆU (TITLE)
       ------------------------------------------------------------------ */
    function tabTitles(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var state = ctx.state;
        var api = ctx.api;
        var toast = ctx.toast;
        var B = global.BK && global.BK.badges ? global.BK.badges : null;

        var editing = null;   /* danh hiệu đang sửa, null = tạo mới */

        var box = kit.card('Danh mục danh hiệu', [kit.btn('Bổ sung danh hiệu mặc định', 'bkc-btn-ghost', seed, 'fa-wand-magic-sparkles')],
            'Danh hiệu độc lập với badge/khung/thành tích nhưng mặc định ánh xạ 1-1 từ badge nguồn để xác minh quyền sở hữu. ' +
            'Hai kiểu hiển thị: Bình thường (font thường, màu tĩnh) và Đặc biệt (font riêng + gradient chuyển động).');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var stats = h('div', 'bkf-report-grid');
        host.appendChild(stats);
        var msgHost = h('div', 'bkf-result-host');
        host.appendChild(msgHost);

        /* ---- Trao / thu hồi danh hiệu ---- */
        var grantCard = h('div', 'bkf-subcard');
        grantCard.appendChild(h('h4', null, 'Trao danh hiệu cho học sinh'));
        var recipient = makeRecipient(ctx, {
            placeholder: 'Tìm người nhận danh hiệu…',
            onSelect: function (student) {
                state.titleStudent = student;
                syncButtons();
            }
        });
        grantCard.appendChild(recipient.root);
        var pickRow = h('div', 'bkf-tools');
        var select = h('select', 'bkc-input bkf-input');
        select.setAttribute('aria-label', 'Chọn danh hiệu để trao');
        pickRow.appendChild(select);
        var grantBtn = kit.btn('Trao danh hiệu', 'bkc-btn-primary', grant, 'fa-medal');
        grantBtn.disabled = true;
        var revokeBtn = kit.btn('Gỡ danh hiệu đang dùng', 'bkc-btn-ghost', revoke, 'fa-eraser');
        revokeBtn.disabled = true;
        pickRow.appendChild(grantBtn);
        pickRow.appendChild(revokeBtn);
        grantCard.appendChild(pickRow);
        var grantResult = h('div', 'bkf-result-host');
        grantCard.appendChild(grantResult);
        host.appendChild(grantCard);

        /* ---- Danh sách ---- */
        var listCard = h('div', 'bkf-subcard');
        var listHead = h('div', 'bkf-tools');
        var filter = kit.input('search', 'Tìm danh hiệu theo tên, mã hoặc badge…');
        filter.className = 'bkc-input bkf-input';
        filter.setAttribute('aria-label', 'Tìm danh hiệu');
        var filterStyle = h('select', 'bkc-input bkf-input bkf-mini');
        [['', 'Tất cả kiểu'], ['plain', 'Bình thường'], ['special', 'Đặc biệt']].forEach(function (p) {
            var o = h('option', null, p[1]);
            o.value = p[0];
            filterStyle.appendChild(o);
        });
        filterStyle.setAttribute('aria-label', 'Lọc theo kiểu hiển thị');
        listHead.appendChild(filter);
        listHead.appendChild(filterStyle);
        listCard.appendChild(listHead);
        var listHost = h('div', 'bkf-titles');
        listCard.appendChild(listHost);
        host.appendChild(listCard);

        /* ---- Trình soạn danh hiệu ---- */
        var editorCard = h('div', 'bkf-subcard bkf-title-editor');
        editorCard.appendChild(h('h4', null, 'Tạo hoặc sửa danh hiệu'));
        var form = h('div', 'bkf-title-form');
        var fId = kit.input('text', 'Mã: hoc-gia (a-z, 0-9, dấu gạch nối)');
        var fName = kit.input('text', 'Tên hiển thị (tối đa 60 ký tự)');
        var fShort = kit.input('text', 'Nhãn ngắn trước tên, ví dụ HỌC GIẢ');
        var fColor = kit.input('text', 'Màu nhãn, ví dụ #93c5fd');
        var fIcon = kit.input('text', 'Icon Font Awesome, ví dụ fa-book-open');
        var fDesc = kit.input('text', 'Mô tả ngắn (tối đa 240 ký tự)');
        var fOrder = kit.input('number', 'Thứ tự (số nhỏ đứng trước)');
        fOrder.value = '100';
        var fStyle = h('select', 'bkc-input bkf-title-input');
        [['plain', 'Bình thường — font thường, màu tĩnh'], ['special', 'Đặc biệt — font riêng, gradient chuyển động']]
            .forEach(function (p) {
                var o = h('option', null, p[1]);
                o.value = p[0];
                fStyle.appendChild(o);
            });
        var fFont = h('select', 'bkc-input bkf-title-input');
        [['', 'Theo kiểu hiển thị'], ['sans', 'Sans (hiện đại)'], ['serif', 'Serif (cổ điển)'],
            ['display', 'Display (tiêu đề)'], ['mono', 'Mono (kỹ thuật)'],
            ['elegant', 'Elegant (thanh lịch)'], ['rounded', 'Rounded (mềm)']].forEach(function (p) {
                var o = h('option', null, p[1]);
                o.value = p[0];
                fFont.appendChild(o);
            });
        var fPalette = kit.input('text', 'Bảng màu gradient: #f5c451,#b45309,#facc15 (tối đa 4 màu)');
        var fEffect = h('select', 'bkc-input bkf-title-input');
        [['none', 'Không hiệu ứng'], ['flow', 'Flow — chảy màu'], ['shimmer', 'Shimmer — lấp lánh'],
            ['pulse', 'Pulse — nhịp sáng'], ['aurora', 'Aurora — cực quang']].forEach(function (p) {
                var o = h('option', null, p[1]);
                o.value = p[0];
                fEffect.appendChild(o);
            });
        var fBadge = h('select', 'bkc-input bkf-title-input');
        fBadge.setAttribute('aria-label', 'Badge nguồn');
        var fFounder = h('label', 'bkf-check');
        var founderBox = h('input');
        founderBox.type = 'checkbox';
        fFounder.appendChild(founderBox);
        fFounder.appendChild(h('span', null, 'Chỉ dành cho hồ sơ Founder (is_founder)'));
        var fActive = h('label', 'bkf-check');
        var activeBox = h('input');
        activeBox.type = 'checkbox';
        activeBox.checked = true;
        fActive.appendChild(activeBox);
        fActive.appendChild(h('span', null, 'Đang dùng (bỏ chọn = ngừng trao mới, người đang giữ vẫn giữ)'));

        [fId, fName, fShort, fColor, fIcon, fDesc, fOrder, fStyle, fFont, fPalette, fEffect, fBadge]
            .forEach(function (f) {
                f.classList.add('bkf-title-input');
                form.appendChild(f);
            });
        form.appendChild(fFounder);
        form.appendChild(fActive);

        var previewHost = h('div', 'bkf-title-preview-host');
        form.appendChild(h('p', 'bkf-hint', 'Xem trước'));
        form.appendChild(previewHost);
        var saveRow = h('div', 'bkf-tools');
        var saveBtn = kit.btn('Lưu danh hiệu', 'bkc-btn-primary', save, 'fa-floppy-disk');
        var resetBtn = kit.btn('Tạo danh hiệu mới', 'bkc-btn-ghost', function () { fillEditor(null); }, 'fa-plus');
        saveRow.appendChild(saveBtn);
        saveRow.appendChild(resetBtn);
        form.appendChild(saveRow);
        editorCard.appendChild(form);
        host.appendChild(editorCard);

        function draft() {
            return {
                id: String(fId.value || '').trim().toLowerCase(),
                name: String(fName.value || '').trim(),
                short: String(fShort.value || '').trim(),
                color: String(fColor.value || '').trim(),
                icon: String(fIcon.value || '').trim(),
                description: String(fDesc.value || '').trim(),
                sort_order: Number(fOrder.value || 100),
                style: fStyle.value,
                font: fFont.value,
                palette: String(fPalette.value || '').trim(),
                effect: fEffect.value,
                badge_id: fBadge.value,
                founder_only: !!founderBox.checked,
                active: !!activeBox.checked
            };
        }

        function refreshPreview() { titlePreview(h, previewHost, draft()); }
        [fName, fShort, fColor, fIcon, fStyle, fFont, fPalette, fEffect].forEach(function (f) {
            f.addEventListener('input', refreshPreview);
            f.addEventListener('change', refreshPreview);
        });

        function fillEditor(t) {
            editing = t || null;
            fId.value = t ? t.id : '';
            fId.disabled = !!t;
            fName.value = t ? t.name : '';
            fShort.value = t ? (t.short || '') : '';
            fColor.value = t ? (t.color || '') : '';
            fIcon.value = t ? (t.icon || '') : 'fa-medal';
            fDesc.value = t ? (t.description || '') : '';
            fOrder.value = String(t ? (t.sortOrder || 100) : 100);
            fStyle.value = t ? t.style : 'plain';
            fFont.value = t ? (t.font || '') : '';
            fPalette.value = t ? (t.palette || '') : '';
            fEffect.value = t ? (t.effect || 'none') : 'none';
            fFounder.checked = t ? t.founderOnly === true : false;
            activeBox.checked = t ? t.active !== false : true;
            fillBadgeOptions(t ? t.badgeId : '');
            refreshPreview();
        }

        function fillBadgeOptions(selectedId) {
            fBadge.textContent = '';
            var none = h('option', null, 'Không ánh xạ badge (danh hiệu tự tạo, trao tay)');
            none.value = '';
            fBadge.appendChild(none);
            var used = {};
            (state.titles || []).forEach(function (t) {
                if (t.badgeId && (!editing || t.id !== editing.id)) used[t.badgeId] = true;
            });
            var catalog = (B && B.CATALOG) ? B.CATALOG : [];
            catalog.forEach(function (b) {
                if (used[b.id] && b.id !== selectedId) return;
                var o = h('option', null, b.name + '  (' + b.id + ')');
                o.value = b.id;
                fBadge.appendChild(o);
            });
            fBadge.value = selectedId || '';
        }

        function syncButtons() {
            grantBtn.disabled = !state.titleStudent || !select.value;
            revokeBtn.disabled = !state.titleStudent;
        }

        function fillSelect() {
            select.textContent = '';
            (state.titles || []).filter(function (t) { return t.active !== false; }).forEach(function (t) {
                var opt = h('option', null, t.name + (t.style === 'special' ? ' •' : '') +
                    (t.badgeId ? '  [badge: ' + t.badgeId + ']' : '  [tự tạo]'));
                opt.value = t.id;
                select.appendChild(opt);
            });
            syncButtons();
        }

        function say(text, kind) {
            msgHost.textContent = '';
            if (!text) return;
            msgHost.appendChild(kit.alertBox(text, kind || 'info'));
        }

        function paintStats(data) {
            stats.textContent = '';
            var titles = (state.titles || []);
            var activeList = titles.filter(function (t) { return t.active !== false; });
            stats.appendChild(h('span', 'bkf-tag', 'Danh mục: ' + titles.length + ' danh hiệu'));
            stats.appendChild(h('span', 'bkf-tag is-owned', 'Đang dùng: ' + activeList.length));
            stats.appendChild(h('span', 'bkf-tag is-exclusive', 'Đặc biệt: ' + activeList.filter(function (t) { return t.style === 'special'; }).length));
            stats.appendChild(h('span', 'bkf-tag', 'Bình thường: ' + activeList.filter(function (t) { return t.style === 'plain'; }).length));
            stats.appendChild(h('span', 'bkf-tag', 'Ánh xạ badge: ' + activeList.filter(function (t) { return !!t.badgeId; }).length));
            stats.appendChild(h('span', 'bkf-tag is-muted', 'Mặc định: ' + (data && data.defaultTotal ? data.defaultTotal : 35)));
            if (data && data.serverVersion) {
                stats.appendChild(h('span', 'bkf-tag is-muted', 'Máy chủ ' + data.serverVersion));
            }
        }

        function filtered() {
            var q = String(filter.value || '').trim().toLowerCase();
            var style = filterStyle.value;
            return (state.titles || []).filter(function (t) {
                if (style && t.style !== style) return false;
                if (!q) return true;
                return (t.id + ' ' + t.name + ' ' + (t.short || '') + ' ' + (t.badgeId || '')).toLowerCase().indexOf(q) !== -1;
            });
        }

        function paintList() {
            listHost.textContent = '';
            var titles = filtered();
            if (!titles.length) {
                kit.emptyState(listHost, 'fa-signature', 'Không có danh hiệu phù hợp',
                    'Thử bỏ bộ lọc, hoặc bấm “Bổ sung danh hiệu mặc định” để tạo 35 danh hiệu ánh xạ badge.');
                return;
            }
            var built = kit.table(['Danh hiệu', 'Badge nguồn', 'Kiểu', 'Người giữ', 'Trạng thái', '']);
            listHost.appendChild(built.wrap);
            titles.forEach(function (t) {
                var tr = h('tr');
                var nameCell = h('td');
                var chipHost = h('div', 'bkf-title-cell');
                var chip = titleChip(h, t);
                if (chip) chipHost.appendChild(chip);
                nameCell.appendChild(chipHost);
                nameCell.appendChild(h('b', null, t.name));
                nameCell.appendChild(h('span', 'bkf-sub', ' ' + t.id));
                if (t.description) nameCell.appendChild(h('span', 'bkf-sub', ' · ' + t.description));
                tr.appendChild(nameCell);
                tr.appendChild(h('td', null, t.badgeId || '—'));
                var styleCell = h('td');
                styleCell.appendChild(h('span', 'bkf-tag' + (t.style === 'special' ? ' is-exclusive' : ''),
                    t.style === 'special' ? 'Đặc biệt' : 'Bình thường'));
                if (t.font) styleCell.appendChild(h('span', 'bkf-tag is-muted', t.font));
                if (t.effect && t.effect !== 'none') styleCell.appendChild(h('span', 'bkf-tag is-muted', t.effect));
                tr.appendChild(styleCell);
                tr.appendChild(h('td', null, String(t.holders || 0)));
                var stateCell = h('td');
                stateCell.appendChild(h('span', 'bkf-tag' + (t.active ? ' is-owned' : ' is-muted'),
                    t.active ? 'Đang dùng' : 'Ngừng dùng'));
                if (t.founderOnly) stateCell.appendChild(h('span', 'bkf-tag is-founder', 'Founder'));
                tr.appendChild(stateCell);
                var actions = h('td');
                var edit = kit.btn('Sửa', 'bkc-btn-ghost', function () { fillEditor(t); }, 'fa-pen');
                edit.classList.add('bkf-mini');
                actions.appendChild(edit);
                var holders = kit.btn('Người giữ', 'bkc-btn-ghost', function () { loadHolders(t, actions); }, 'fa-users');
                holders.classList.add('bkf-mini');
                actions.appendChild(holders);
                if (t.badgeId) {
                    var jump = kit.btn('Badge', 'bkc-btn-ghost', function () { toast('Badge nguồn: ' + t.badgeId, 'info'); }, 'fa-medal');
                    jump.classList.add('bkf-mini');
                    actions.appendChild(jump);
                }
                if (t.active) {
                    var off = kit.btn('Ngừng', 'bkc-btn-ghost', function () { deactivate(t); }, 'fa-ban');
                    off.classList.add('bkf-mini');
                    actions.appendChild(off);
                } else {
                    var on = kit.btn('Bật lại', 'bkc-btn-ghost', function () { reactivate(t); }, 'fa-toggle-on');
                    on.classList.add('bkf-mini');
                    actions.appendChild(on);
                }
                tr.appendChild(actions);
                built.tbody.appendChild(tr);
            });
        }

        function loadHolders(t, cell) {
            var old = listHost.querySelector('.bkf-holders');
            if (old) old.remove();
            var panel = h('div', 'bkf-holders');
            panel.textContent = 'Đang tải người giữ “' + t.name + '”…';
            listHost.appendChild(panel);
            api('titles.holders', { title_id: t.id }).then(function (data) {
                panel.textContent = '';
                var rows = (data && data.holders) || [];
                panel.appendChild(h('b', null, 'Người giữ “' + t.name + '”: ' + rows.length));
                if (!rows.length) {
                    panel.appendChild(h('p', 'bkf-hint', 'Chưa có ai dùng danh hiệu này.'));
                    return;
                }
                var ul = h('ul', 'bkf-reasons');
                rows.forEach(function (r) {
                    var li = h('li');
                    li.appendChild(h('b', null, r.name || String(r.studentId).slice(0, 8)));
                    var extra = [];
                    if (r.code) extra.push('Mã: ' + r.code);
                    if (r.assignedAt) extra.push(kit.fmt(r.assignedAt));
                    if (extra.length) li.appendChild(h('span', 'bkf-sub', ' · ' + extra.join(' · ')));
                    ul.appendChild(li);
                });
                panel.appendChild(ul);
            }).catch(function (err) {
                panel.textContent = '';
                panel.appendChild(kit.alertBox((err && err.message) || 'Không tải được người giữ.', 'error'));
            });
        }

        function load() {
            kit.loading(listHost, 'Đang tải danh mục danh hiệu…');
            api('titles.list', {}).then(function (data) {
                state.titles = (data && data.titles) || [];
                state.titlesLoaded = true;
                paintStats(data || {});
                fillSelect();
                paintList();
                fillBadgeOptions(editing ? editing.badgeId : '');
            }).catch(function (err) {
                listHost.textContent = '';
                state.titles = [];
                fillSelect();
                if (isUnknownAction(err)) {
                    say('Máy chủ admin-actions đang chạy bản cũ: chưa có action titles.* nên chưa tải được danh mục. ' +
                        'Deploy Edge Function admin-actions 7.7.0 rồi mở lại tab này.', 'error');
                    return;
                }
                say((err && err.message) || 'Không tải được danh sách danh hiệu.', 'error');
            });
        }

        function seed() {
            saveBtn.disabled = true;
            say('Đang bổ sung danh hiệu mặc định còn thiếu…');
            api('titles.seed', {}).then(function (data) {
                say((data && data.message) || 'Đã bổ sung danh hiệu mặc định.', 'success');
                toast('Đã đồng bộ danh hiệu mặc định.', 'success');
                load();
            }).catch(function (err) {
                say(isUnknownAction(err)
                    ? 'Máy chủ chưa có action titles.seed. Deploy admin-actions 7.7.0 rồi thử lại.'
                    : ((err && err.message) || 'Không bổ sung được danh hiệu.'), 'error');
            }).then(function () { saveBtn.disabled = false; });
        }

        function save() {
            var payload = draft();
            if (!payload.name) {
                say('Cần tên danh hiệu.', 'warn');
                return;
            }
            if (!editing && payload.id && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(payload.id)) {
                say('Mã danh hiệu chỉ gồm a-z, 0-9 và dấu gạch nối (2–40 ký tự).', 'warn');
                return;
            }
            if (payload.style === 'special' && !payload.palette && !payload.color) {
                say('Danh hiệu đặc biệt cần ít nhất một màu (màu nhãn hoặc bảng màu gradient).', 'warn');
                return;
            }
            saveBtn.disabled = true;
            say('Đang lưu danh hiệu…');
            api('titles.save', payload).then(function (data) {
                say((data && data.message) || 'Đã lưu danh hiệu.', 'success');
                toast('Đã lưu “' + payload.name + '”.', 'success');
                editing = null;
                fillEditor(null);
                load();
            }).catch(function (err) {
                say(isUnknownAction(err)
                    ? 'Máy chủ chưa có action titles.save. Deploy admin-actions 7.7.0 rồi thử lại.'
                    : ((err && err.message) || 'Không lưu được danh hiệu.'), 'error');
            }).then(function () { saveBtn.disabled = false; });
        }

        function setActive(t, active) {
            api('titles.save', {
                title_id: t.id, name: t.name, short: t.short, color: t.color, icon: t.icon,
                description: t.description, sort_order: t.sortOrder, style: t.style,
                font: t.font, palette: t.palette, effect: t.effect, badge_id: t.badgeId || '',
                founder_only: t.founderOnly, active: active
            }).then(function () {
                toast(active ? 'Đã bật lại “' + t.name + '”.' : 'Đã ngừng dùng “' + t.name + '”.', 'success');
                load();
            }).catch(function (err) {
                say((err && err.message) || 'Không đổi được trạng thái danh hiệu.', 'error');
            });
        }

        function deactivate(t) {
            confirmDialog(h, 'Ngừng dùng danh hiệu', [
                ['Danh hiệu', t.name + '  (' + t.id + ')'],
                ['Lưu ý', 'Học sinh đang giữ danh hiệu vẫn giữ nguyên, chỉ không trao mới được nữa.']
            ], 'Ngừng dùng').then(function (ok) {
                if (ok) setActive(t, false);
            });
        }

        function reactivate(t) {
            setActive(t, true);
        }

        function grant() {
            var student = state.titleStudent;
            var title = (state.titles || []).filter(function (t) { return t.id === select.value; })[0];
            if (!student || !title) {
                toast('Chọn người nhận và danh hiệu trước.', 'warn');
                return;
            }
            confirmDialog(h, 'Trao danh hiệu', [
                ['Người nhận', student.display_name + (student.student_code ? ' · ' + student.student_code : '')],
                ['Danh hiệu', title.name + '  (' + title.id + ')'],
                ['Hiển thị', 'Nhãn “' + (title.short || title.name) + '” đứng trước tên trong chat'],
                ['Điều kiện', title.badgeId
                    ? 'Học sinh phải sở hữu badge ' + title.badgeId + ' (máy chủ kiểm tra lại)'
                    : 'Danh hiệu tự tạo — máy chủ ghi quyền sử dụng cho học sinh này']
            ], 'Trao ngay').then(function (ok) {
                if (!ok) return;
                grantBtn.disabled = true;
                grantResult.textContent = '';
                kit.loading(grantResult, 'Đang trao danh hiệu…');
                api('titles.grant', { id: student.id, title_id: title.id }).then(function (data) {
                    grantResult.textContent = '';
                    grantResult.appendChild(resultBox(h, true,
                        'Đã trao danh hiệu “' + ((data && data.titleName) || title.name) + '” cho ' +
                        ((data && data.studentName) || student.display_name) + '.'));
                    toast('Đã cập nhật danh hiệu.', 'success');
                    load();
                }).catch(function (err) {
                    grantResult.textContent = '';
                    grantResult.appendChild(kit.alertBox(isUnknownAction(err)
                        ? 'Máy chủ chưa có action titles.grant. Deploy admin-actions 7.7.0 rồi thử lại.'
                        : ((err && err.message) || 'Không trao được danh hiệu.'), 'error'));
                }).then(syncButtons);
            });
        }

        function revoke() {
            var student = state.titleStudent;
            if (!student) {
                toast('Chọn người nhận trước.', 'warn');
                return;
            }
            confirmDialog(h, 'Gỡ danh hiệu', [
                ['Người nhận', student.display_name + (student.student_code ? ' · ' + student.student_code : '')],
                ['Kết quả', 'Tên hiển thị trong chat không còn nhãn danh hiệu']
            ], 'Gỡ danh hiệu').then(function (ok) {
                if (!ok) return;
                revokeBtn.disabled = true;
                api('titles.revoke', { id: student.id }).then(function (data) {
                    grantResult.textContent = '';
                    grantResult.appendChild(resultBox(h, true,
                        data && data.removed
                            ? 'Đã gỡ danh hiệu của ' + student.display_name + '.'
                            : student.display_name + ' chưa có danh hiệu nào để gỡ.'));
                    toast('Đã gỡ danh hiệu.', 'success');
                    load();
                }).catch(function (err) {
                    grantResult.textContent = '';
                    grantResult.appendChild(kit.alertBox((err && err.message) || 'Không gỡ được danh hiệu.', 'error'));
                }).then(syncButtons);
            });
        }

        filter.addEventListener('input', paintList);
        filterStyle.addEventListener('change', paintList);
        select.addEventListener('change', syncButtons);

        fillEditor(null);
        load();
    }

    /* ---------------------------------------------------------------------
       TAB 3 — FOUNDER (trạng thái hồ sơ, danh vị)
       ------------------------------------------------------------------ */
    function tabFounder(pane, ctx) {
        var h = ctx.h;
        var kit = ctx.kit;
        var api = ctx.api;
        var toast = ctx.toast;

        var box = kit.card('Hồ sơ Người sáng lập', null,
            'Khu vực này chỉ giữ các chức năng Founder thật sự: xác minh hồ sơ Founder và danh vị. ' +
            'Trao badge/khung/danh hiệu đã chuyển sang tab Thành tích và Danh hiệu.');
        pane.appendChild(box.root);
        var host = h('div', 'bkf-section');
        box.body.appendChild(host);

        var statusHost = h('div', 'bkf-inventory');
        host.appendChild(statusHost);

        var searchBtn = kit.btn('Kiểm tra hồ sơ Founder', 'bkc-btn-primary', check, 'fa-crown');
        host.appendChild(searchBtn);
        var reportHost = h('div', 'bkf-result-host');
        host.appendChild(reportHost);

        function check() {
            reportHost.textContent = '';
            kit.loading(statusHost, 'Đang đối chiếu hồ sơ Người sáng lập…');
            api('students.search', { q: 'Minh Trúc', limit: 5 }).catch(function (err) {
                if (!isUnknownAction(err)) throw err;
                return api('students.list', { q: 'Minh Trúc', limit: 5, status: 'active' });
            }).then(function (data) {
                var list = (data && data.students) || [];
                statusHost.textContent = '';
                var founder = list.filter(function (s) { return s.is_founder; })[0] || list[0];
                if (!founder) {
                    statusHost.appendChild(kit.alertBox(
                        'Không tìm thấy hồ sơ Minh Trúc. Hãy kiểm tra danh sách học sinh trước.', 'warn'));
                    return;
                }
                var line = h('div', 'bkf-inventory-line');
                line.appendChild(h('span', 'bkf-inventory-name', founder.display_name));
                line.appendChild(h('span', 'bkf-tag' + (founder.is_founder ? ' is-founder' : ''), founder.is_founder ? 'is_founder = true' : 'Chưa đặt cờ Founder'));
                if (founder.student_code) line.appendChild(h('span', 'bkf-tag', 'Mã: ' + founder.student_code));
                statusHost.appendChild(line);
                var invHost = h('div', 'bkf-inventory');
                statusHost.appendChild(invHost);
                loadInventory(ctx, invHost, founder);

                var roleRow = h('div', 'bkf-tools');
                var roleBtn = kit.btn('Đặt danh vị Người sáng lập', 'bkc-btn-ghost', function () {
                    roleBtn.disabled = true;
                    api('roles.set', { id: founder.id, role_key: 'founder', role_label: 'Người sáng lập' })
                        .then(function () {
                            toast('Đã đặt danh vị Người sáng lập.', 'success');
                            reportHost.textContent = '';
                            reportHost.appendChild(resultBox(h, true,
                                'Đã đặt danh vị “Người sáng lập” cho ' + founder.display_name + '.'));
                        })
                        .catch(function (err) {
                            reportHost.textContent = '';
                            reportHost.appendChild(kit.alertBox((err && err.message) || 'Không đặt được danh vị.', 'error'));
                        })
                        .then(function () { roleBtn.disabled = false; });
                }, 'fa-id-badge');
                roleRow.appendChild(roleBtn);
                statusHost.appendChild(roleRow);

                statusHost.appendChild(h('p', 'bkf-hint',
                    'Cấp trọn bộ badge và khung nằm ở tab Thành tích (mục “Cấp trọn bộ cho hồ sơ Founder”), ' +
                    'để mọi thao tác trao vật phẩm nằm cùng một nơi và dùng chung hợp đồng phản hồi.'));
            }).catch(function (err) {
                statusHost.textContent = '';
                statusHost.appendChild(kit.alertBox((err && err.message) || 'Không kiểm tra được hồ sơ Founder.', 'error'));
            });
        }

        check();
    }
})(typeof window !== 'undefined' ? window : this);
