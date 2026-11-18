/* =========================================================================
   Bá Khí — bk-profile-ui.js
   Component hồ sơ dùng chung cho /profile/ và tab Hồ sơ trong /settings/.
   Một nguồn dữ liệu duy nhất: BKProfile. Không có hệ thống hồ sơ thứ hai.

   Công khai: window.BKProfileUI
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKProfileUI) return;

    function P() { return global.BKProfile; }
    function B() { return global.BK && global.BK.badges ? global.BK.badges : null; }

    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function icon(name) {
        var i = D.createElement('i');
        i.className = 'fa-solid ' + name;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function btn(label, iconName, cls, onClick) {
        var b = el('button', cls || 'bk-btn');
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        if (label) b.appendChild(el('span', null, label));
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    function toast(msg, type) {
        if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast(msg, type);
    }
    /* Nhãn trạng thái thật: chỉ ghi "đã đồng bộ" khi có phiên Supabase thật,
       tránh hiển thị sai khi website chạy hoàn toàn cục bộ. */
    function syncLabel(idc) {
        if (idc.anonymous) return 'Hồ sơ cục bộ trên thiết bị này';
        var st = null;
        try {
            st = global.BKCloud && global.BKCloud.state ? global.BKCloud.state() : null;
        } catch (e) { }
        var synced = !!(st && (st.session || st.bound));
        return synced ? 'Học sinh · đã đồng bộ' : 'Học sinh · lưu trên thiết bị';
    }
    function progressBar(pct) {
        var bar = el('div', 'bk-progress');
        var fill = el('i');
        fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        bar.appendChild(fill);
        return bar;
    }
    function rarityMeta(id) {
        var list = (B() && B().RARITIES) || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return { id: id, name: id, color: '#94a3b8' };
    }
    function categoryMeta(id) {
        var list = (B() && B().CATEGORIES) || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return { id: id, name: id, icon: 'fa-circle', color: '#94a3b8' };
    }

    /* ---------------------------------------------------------------------
       Thẻ hồ sơ (hero)
       ------------------------------------------------------------------ */
    function renderHero(container, opts) {
        opts = opts || {};
        var api = P();
        if (!api) return;
        container.textContent = '';
        var p = api.get();
        var idc = api.identity();

        var hero = el('div', 'bk-profile-hero');
        var banner = el('div', 'bk-profile-banner');
        if (p.banner) banner.style.backgroundImage = 'url("' + p.banner + '")';
        hero.appendChild(banner);

        var bar = el('div', 'bk-profile-bar');
        bar.appendChild(api.avatarNode({ size: 92 }));
        var meta = el('div', 'bk-profile-meta');
        var nameRow = el('div', 'bk-profile-name');
        nameRow.appendChild(el('span', null, idc.name || api.displayName(p)));
        if (p.nickname) nameRow.appendChild(el('span', 'bk-profile-nick', '@' + p.nickname));
        meta.appendChild(nameRow);

        var sub = el('p', 'bk-profile-sub');
        sub.style.cssText = 'font-size:.74rem;color:var(--bkl-muted);margin:.15rem 0 0';
        sub.textContent = syncLabel(idc);
        meta.appendChild(sub);

        if (p.bio) meta.appendChild(el('p', 'bk-profile-bio', p.bio));

        var links = el('div', 'bk-profile-links');
        (p.links || []).forEach(function (l) {
            if (!l.visible) return;
            var a = el('a', 'bk-chipx');
            a.href = l.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer nofollow';
            a.appendChild(icon('fa-link'));
            a.appendChild(el('span', null, l.label));
            links.appendChild(a);
        });
        if (links.children.length) meta.appendChild(links);
        if (p.updatedAt) {
            var upd = el('span', 'bk-profile-updated',
                'Cập nhật ' + (global.BK && global.BK.util && global.BK.util.fmtTime
                    ? global.BK.util.fmtTime(p.updatedAt) : new Date(p.updatedAt).toLocaleString('vi-VN')));
            meta.appendChild(upd);
        }
        bar.appendChild(meta);

        if (opts.actions !== false) {
            var actions = el('div', 'bk-row');
            actions.style.marginLeft = 'auto';
            actions.appendChild(btn('Chỉnh sửa', 'fa-pen', 'bk-btn', function () {
                global.location.href = apiBase() + 'settings/?tab=profile';
            }));
            bar.appendChild(actions);
        }
        hero.appendChild(bar);
        container.appendChild(hero);

        /* Tiến độ badge */
        var b = B();
        if (b) {
            var total = b.CATALOG.length;
            var have = b.unlockedCount();
            var card = el('div', 'bk-card');
            card.style.cssText = 'border:1px solid var(--bkl-line);border-radius:var(--bkl-radius);padding:.9rem 1rem;background:var(--bkl-surface)';
            var top = el('div');
            top.style.cssText = 'display:flex;justify-content:space-between;font-size:.8rem;font-weight:600;margin-bottom:.45rem';
            top.appendChild(el('span', null, 'Thành tích'));
            top.appendChild(el('span', null, have + '/' + total + ' badge'));
            card.appendChild(top);
            card.appendChild(progressBar(total ? (have / total) * 100 : 0));
            if (typeof b.summaryText === 'function') {
                var mix = el('p', null, b.summaryText());
                mix.style.cssText = 'margin:.45rem 0 0;color:var(--bkl-muted);font-size:.72rem';
                card.appendChild(mix);
            }
            container.appendChild(card);
        }
    }

    function apiBase() {
        return (global.BKShell && global.BKShell.basePath) ? global.BKShell.basePath() : './';
    }

    /* ---------------------------------------------------------------------
       Trình chỉnh sửa hồ sơ
       ------------------------------------------------------------------ */
    function renderEditor(container) {
        var api = P();
        if (!api) return;
        container.textContent = '';
        var p = api.get();

        function refreshAll() {
            renderEditor(container);
            if (global.BKShell && global.BKShell.refresh) global.BKShell.refresh();
            /* Đẩy ngay lên Supabase; listener 250ms chỉ là lưới an toàn. */
            try {
                if (global.BKCloud && global.BKCloud.syncStudent) global.BKCloud.syncStudent();
            } catch (e) { }
        }

        var grid = el('div', 'bk-form-grid');

        /* Ảnh đại diện + ảnh bìa */
        var media = el('div');
        media.style.cssText = 'display:flex;gap:.75rem;flex-wrap:wrap;align-items:center';
        var preview = el('div');
        preview.id = 'bkProfilePreview';
        preview.appendChild(api.avatarNode({ size: 64 }));
        media.appendChild(preview);

        var avatarBtn = btn('Đổi ảnh đại diện', 'fa-camera', 'bk-btn');
        var avatarInput = el('input');
        avatarInput.type = 'file';
        avatarInput.accept = 'image/png,image/jpeg,image/webp';
        avatarInput.hidden = true;
        avatarInput.addEventListener('change', function () {
            var file = avatarInput.files && avatarInput.files[0];
            if (!file) return;
            avatarBtn.disabled = true;
            api.setAvatar(file, function (err, next) {
                avatarBtn.disabled = false;
                avatarInput.value = '';
                if (err) return toast(err.message, 'error');
                refreshAll();
                toast('Đã cập nhật ảnh đại diện.', 'success');
            });
        });
        avatarBtn.addEventListener('click', function () { avatarInput.click(); });
        media.appendChild(avatarBtn);
        media.appendChild(avatarInput);

        if (p.avatar) {
            media.appendChild(btn('Xoá ảnh đại diện', 'fa-trash', 'bk-btn bk-btn-ghost', function () {
                api.save({ avatar: '' });
                refreshAll();
            }));
        }

        var bannerBtn = btn('Đổi ảnh bìa', 'fa-panorama', 'bk-btn bk-btn-ghost');
        var bannerInput = el('input');
        bannerInput.type = 'file';
        bannerInput.accept = 'image/png,image/jpeg,image/webp';
        bannerInput.hidden = true;
        bannerInput.addEventListener('change', function () {
            var file = bannerInput.files && bannerInput.files[0];
            if (!file) return;
            api.setBanner(file, function (err) {
                bannerInput.value = '';
                if (err) return toast(err.message, 'error');
                refreshAll();
                toast('Đã cập nhật ảnh bìa.', 'success');
            });
        });
        bannerBtn.addEventListener('click', function () { bannerInput.click(); });
        media.appendChild(bannerBtn);
        media.appendChild(bannerInput);
        if (p.banner) {
            media.appendChild(btn('Xoá ảnh bìa', 'fa-trash', 'bk-btn bk-btn-ghost', function () {
                api.save({ banner: '' });
                refreshAll();
            }));
        }
        grid.appendChild(media);

        /* Biệt danh */
        grid.appendChild(field('Biệt danh', 'Hiển thị cạnh tên học sinh. Không thay đổi danh tính gốc.', function (wrap) {
            var input = el('input', 'bk-input');
            input.type = 'text';
            input.maxLength = api.LIMITS.nickname;
            input.value = p.nickname || '';
            input.placeholder = 'Ví dụ: Minh';
            input.addEventListener('change', function () {
                api.save({ nickname: input.value });
                toast('Đã lưu biệt danh.', 'success');
                refreshAll();
            });
            wrap.appendChild(input);
        }));

        /* Giới thiệu */
        grid.appendChild(field('Giới thiệu', 'Văn bản thuần, tối đa ' + api.LIMITS.bio + ' ký tự. HTML và JavaScript bị loại bỏ.', function (wrap) {
            var ta = el('textarea', 'bk-textarea');
            ta.maxLength = api.LIMITS.bio;
            ta.value = p.bio || '';
            ta.placeholder = 'Vài dòng về bạn…';
            ta.addEventListener('change', function () {
                api.save({ bio: ta.value });
                toast('Đã lưu giới thiệu.', 'success');
                refreshAll();
            });
            wrap.appendChild(ta);
        }));

        /* Liên kết mạng xã hội */
        var linksWrap = el('div', 'bk-field');
        linksWrap.appendChild(el('label', null, 'Liên kết mạng xã hội'));
        linksWrap.appendChild(el('small', null, 'Chỉ nhận địa chỉ http/https. Tối đa ' + api.LIMITS.links + ' liên kết.'));
        var list = el('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:.4rem;margin-top:.35rem';
        (p.links || []).forEach(function (l, idx) {
            list.appendChild(linkRow(l, idx));
        });
        linksWrap.appendChild(list);

        if ((p.links || []).length < api.LIMITS.links) {
            linksWrap.appendChild(btn('Thêm liên kết', 'fa-plus', 'bk-btn bk-btn-ghost', function () {
                var links = (api.get().links || []).slice();
                links.push({ label: 'Liên kết', url: 'https://', visible: true });
                api.save({ links: links });
                refreshAll();
            }));
        }
        grid.appendChild(linksWrap);
        container.appendChild(grid);

        /* Khung avatar */
        var frameCard = el('div');
        frameCard.style.marginTop = '1.25rem';
        frameCard.appendChild(el('h3', null, 'Khung avatar'));
        var fsub = el('p', null, 'Khung đã mở khóa có thể trang bị. Khung hiếm đến từ badge.');
        fsub.style.cssText = 'font-size:.74rem;color:var(--bkl-muted);margin:.15rem 0 .55rem';
        frameCard.appendChild(fsub);
        frameCard.appendChild(renderFrames());
        frameCard.appendChild(renderAnimationToggle());
        container.appendChild(frameCard);

        function linkRow(l, idx) {
            var row = el('div');
            row.style.cssText = 'display:flex;gap:.35rem;align-items:center;flex-wrap:wrap';
            var label = el('input', 'bk-input');
            label.style.flex = '0 1 34%';
            label.value = l.label || '';
            label.maxLength = api.LIMITS.linkLabel;
            label.setAttribute('aria-label', 'Tên liên kết');
            var url = el('input', 'bk-input');
            url.style.flex = '1 1 40%';
            url.value = l.url || '';
            url.setAttribute('aria-label', 'Địa chỉ liên kết');
            var vis = el('button', 'bk-btn bk-btn-ghost');
            vis.type = 'button';
            vis.title = l.visible ? 'Đang hiển thị' : 'Đang ẩn';
            vis.setAttribute('aria-pressed', l.visible ? 'true' : 'false');
            vis.appendChild(icon(l.visible ? 'fa-eye' : 'fa-eye-slash'));
            vis.addEventListener('click', function () {
                var links = api.get().links.slice();
                links[idx] = { label: links[idx].label, url: links[idx].url, visible: !links[idx].visible };
                api.save({ links: links });
                refreshAll();
            });
            var del = el('button', 'bk-btn bk-btn-ghost');
            del.type = 'button';
            del.setAttribute('aria-label', 'Xoá liên kết');
            del.appendChild(icon('fa-xmark'));
            del.addEventListener('click', function () {
                var links = api.get().links.slice();
                links.splice(idx, 1);
                api.save({ links: links });
                refreshAll();
            });
            function commit() {
                var links = api.get().links.slice();
                var next = { label: label.value, url: url.value, visible: links[idx].visible !== false };
                links[idx] = next;
                var saved = api.save({ links: links });
                if (next.url && !saved.links.length) {
                    toast('Liên kết không hợp lệ — chỉ nhận http/https.', 'error');
                    refreshAll();
                }
            }
            label.addEventListener('change', commit);
            url.addEventListener('change', commit);
            row.appendChild(label);
            row.appendChild(url);
            row.appendChild(vis);
            row.appendChild(del);
            return row;
        }
    }

    function field(labelText, hint, build) {
        var wrap = el('div', 'bk-field');
        wrap.appendChild(el('label', null, labelText));
        if (hint) wrap.appendChild(el('small', null, hint));
        build(wrap);
        return wrap;
    }

    /* ---------------------------------------------------------------------
       Khung avatar
       ------------------------------------------------------------------ */
    function renderFrames() {
        var api = P();
        var grid = el('div', 'bk-frame-grid');
        var owned = api.ownedFrames();
        var current = api.get().frame;
        var b = B();
        var TIERS = [['normal', 'Bộ sưu tập'], ['dev', 'Độc quyền'], ['founder', 'Người sáng lập']];
        TIERS.forEach(function (t) {
            var list = api.framesByTier ? api.framesByTier(t[0]) : api.frames;
            if (!list.length) return;
            var heading = el('div', 'bk-frame-tier', t[1]);
            grid.appendChild(heading);
            list.forEach(function (f) {
                var isOwned = owned.indexOf(f.id) !== -1;
                var cell = el('button', 'bk-frame' + (isOwned ? '' : ' is-locked'));
                cell.type = 'button';
                cell.setAttribute('data-tier', f.tier || 'normal');
                cell.setAttribute('aria-pressed', current === f.id ? 'true' : 'false');
                cell.setAttribute('title', f.name + ' · ' + rarityMeta(f.rarity).name +
                    (isOwned ? ' · đã sở hữu' : ' · ấn để xem cách mở khoá'));
                var badge = b ? b.CATALOG.filter(function (x) { return x.frame === f.id; })[0] : null;
                var prev = api.avatarNode({ size: 46, showFrame: false });
                if (f.id !== 'none') {
                    prev.classList.add('bk-avatar-framed');
                    prev.setAttribute('data-tier', f.tier || 'normal');
                    prev.style.setProperty('--bk-avatar-ring', f.ring);
                    var art = api.frameOverlay(f.id);
                    if (art) prev.appendChild(art);
                }
                if (!isOwned) {
                    var lock = el('span', 'bk-frame-lock');
                    lock.appendChild(icon('fa-lock'));
                    lock.setAttribute('aria-hidden', 'true');
                    cell.appendChild(lock);
                }
                cell.appendChild(prev);
                cell.appendChild(el('span', 'bk-frame-label', f.name));
                cell.addEventListener('click', function () {
                    if (!isOwned) {
                        openFrameDetail(f, badge, false);
                        return;
                    }
                    var res = api.equipFrame(f.id);
                    if (!res.ok) return toast(res.error, 'error');
                    toast('Đã trang bị khung "' + f.name + '".', 'success');
                    if (global.BKShell) global.BKShell.refresh();
                    renderFramesInto(cell.parentNode);
                });
                grid.appendChild(cell);
            });
        });
        /* 7.7.0: Danh hiệu nằm ngay dưới bộ sưu tập khung — cùng nhóm trang trí
           danh tính, nhưng dữ liệu và quyền hoàn toàn tách biệt. */
        var wrap = el('div', 'bk-frames-wrap');
        wrap.appendChild(grid);
        if (global.BK && global.BK.titles && typeof global.BK.titles.card === 'function') {
            try { wrap.appendChild(global.BK.titles.card()); } catch (e) { }
        }
        return wrap;
    }
    function renderFramesInto(container) {
        var fresh = renderFrames();
        container.parentNode.replaceChild(fresh, container);
    }

    var FRAME_TIERS = { normal: 'Bộ sưu tập', dev: 'Độc quyền Developer', founder: 'Người sáng lập' };

    function framePreview(f, size) {
        var api = P();
        var prev = api.avatarNode({ size: size || 84, showFrame: false });
        if (f.id !== 'none') {
            prev.classList.add('bk-avatar-framed');
            prev.setAttribute('data-tier', f.tier || 'normal');
            prev.style.setProperty('--bk-avatar-ring', f.ring);
            var art = api.frameOverlay(f.id);
            if (art) prev.appendChild(art);
        }
        return prev;
    }

    function openFrameDetail(f, badge, owned) {
        if (!f) return;
        var api = P();
        var isOwned = owned === true || api.ownedFrames().indexOf(f.id) !== -1;
        var body = el('div', 'bk-frame-detail');
        var head = el('div', 'bk-frame-detail-head');
        var preview = el('div', 'bk-frame-detail-preview');
        preview.appendChild(framePreview(f, 92));
        head.appendChild(preview);
        var text = el('div', 'bk-frame-detail-text');
        text.appendChild(el('h3', null, f.name));
        var meta = el('div', 'bk-badge-detail-meta');
        meta.appendChild(el('span', null, rarityMeta(f.rarity).name));
        meta.appendChild(el('span', null, FRAME_TIERS[f.tier] || FRAME_TIERS.normal));
        meta.appendChild(el('span', null, isOwned ? 'Đã sở hữu' : 'Chưa sở hữu'));
        text.appendChild(meta);
        head.appendChild(text);
        body.appendChild(head);

        body.appendChild(el('p', 'bk-badge-detail-label', 'Mô tả'));
        body.appendChild(el('p', null, f.desc ||
            ('Khung avatar “' + f.name + '” thuộc ' + (FRAME_TIERS[f.tier] || FRAME_TIERS.normal) +
            ', độ hiếm ' + rarityMeta(f.rarity).name.toLowerCase() +
            '. Khung chỉ trang trí quanh ảnh đại diện, không thay đổi ảnh gốc hay dữ liệu học tập.' +
            (f.anim ? ' Khung có hiệu ứng chuyển động; có thể tắt trong Cài đặt.' : ''))));

        body.appendChild(el('p', 'bk-badge-detail-label', 'Cách mở khoá'));
        if (f.howTo) {
            body.appendChild(el('p', null, f.howTo + (badge && badge.desc ? ' ' + badge.desc : '')));
        } else if (badge) {
            body.appendChild(el('p', null, 'Mở khoá bằng thành tích “' + badge.name + '”. ' + (badge.desc || '')));
        } else {
            body.appendChild(el('p', null, 'Khung này mở khoá bằng thành tích hiếm hoặc do quản trị viên trao.'));
        }
        if (isOwned) {
            body.appendChild(el('p', 'bk-muted', 'Bạn đã sở hữu khung này và có thể trang bị ngay.'));
        }

        var actions = [{ label: 'Đóng', variant: 'ghost', onClick: function (close) { close(); } }];
        if (isOwned && api.get().frame !== f.id) {
            actions.unshift({
                label: 'Trang bị', variant: 'primary', onClick: function (close) {
                    var res = api.equipFrame(f.id);
                    if (!res.ok) { toast(res.error, 'error'); return; }
                    toast('Đã trang bị khung "' + f.name + '".', 'success');
                    if (global.BKShell) global.BKShell.refresh();
                    close();
                    refreshAll();
                }
            });
        }
        if (global.BK && global.BK.ui && global.BK.ui.modal) {
            global.BK.ui.modal({ title: 'Chi tiết khung avatar', body: body, actions: actions });
        }
    }

    function renderAnimationToggle() {
        var api = P();
        var enabled = !api.getPrefs || api.getPrefs().animateAvatarBorders !== false;
        var row = el('div', 'bk-set-toggle-row');
        var text = el('div', 'bk-set-toggle-text');
        text.appendChild(el('span', 'bk-set-toggle-label', 'Animate Avatar Borders'));
        text.appendChild(el('span', 'bk-set-toggle-desc',
            'Hiệu ứng chuyển động cho khung avatar có hoạ tiết động. Lưu theo tài khoản và đồng bộ khi đã nhận diện học sinh.'));
        row.appendChild(text);
        var sw = el('button', 'bk-switch');
        sw.type = 'button';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-checked', enabled ? 'true' : 'false');
        sw.setAttribute('aria-label', 'Bật hoặc tắt hiệu ứng chuyển động viền avatar');
        sw.classList.toggle('is-on', enabled);
        sw.appendChild(el('span', 'bk-switch-knob'));
        sw.addEventListener('click', function () {
            var next = !(api.getPrefs().animateAvatarBorders !== false);
            api.setPref('animateAvatarBorders', next);
            sw.classList.toggle('is-on', next);
            sw.setAttribute('aria-checked', next ? 'true' : 'false');
            toast(next ? 'Đã bật hiệu ứng viền avatar.' : 'Đã tắt hiệu ứng viền avatar.');
            if (global.BKShell) global.BKShell.refresh();
            refreshAll();
        });
        row.appendChild(sw);
        return row;
    }

    /* ---------------------------------------------------------------------
       Bảng badge
       ------------------------------------------------------------------ */
    var badgeState = { category: 'all', rarity: 'all', status: 'all', query: '' };
    var BOARD_OPEN_KEY = 'bakhiBadgesOpen.v1';

    function boardOpenKey() {
        try {
            var idc = P() && P().identity ? P().identity() : null;
            return (idc && idc.key) || 'local';
        } catch (e) { return 'local'; }
    }
    function boardExpanded() {
        try {
            var raw = global.localStorage.getItem(BOARD_OPEN_KEY);
            var data = raw ? JSON.parse(raw) : {};
            return !!(data && data[boardOpenKey()]);
        } catch (e) { return false; }
    }
    function setBoardExpanded(open) {
        try {
            var raw = global.localStorage.getItem(BOARD_OPEN_KEY);
            var data = raw ? JSON.parse(raw) : {};
            if (!data || typeof data !== 'object') data = {};
            data[boardOpenKey()] = !!open;
            global.localStorage.setItem(BOARD_OPEN_KEY, JSON.stringify(data));
        } catch (e) { }
    }

    function renderBadgeBoard(container) {
        var b = B();
        var api = P();
        container.textContent = '';
        if (!b) {
            container.appendChild(el('p', null, 'Hệ thống thành tích chưa sẵn sàng trên trang này.'));
            return;
        }

        var head = el('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:.5rem;flex-wrap:wrap';
        head.appendChild(el('h2', null, 'Thành tích'));
        var total = b.CATALOG.length;
        var have = b.unlockedCount();
        head.appendChild(el('span', null, have + '/' + total));
        container.appendChild(head);
        if (typeof b.summaryText === 'function') {
            var summary = el('p', null, b.summaryText());
            summary.style.cssText = 'margin:.15rem 0 0;color:var(--bkl-muted);font-size:.78rem';
            container.appendChild(summary);
        }
        var pbar = progressBar(total ? (have / total) * 100 : 0);
        pbar.style.margin = '.5rem 0 .6rem';
        container.appendChild(pbar);

        /* Mặc định thu gọn: chỉ hiện tổng quan + nút "Hiện badge". */
        var expanded = boardExpanded();
        var toggleRow = el('div', 'bk-row');
        toggleRow.style.margin = '.1rem 0 .9rem';
        var toggle = btn(expanded ? 'Ẩn badge' : 'Hiện badge', expanded ? 'fa-chevron-up' : 'fa-chevron-down', 'bk-btn bk-btn-ghost', function () {
            setBoardExpanded(!expanded);
            renderBadgeBoard(container);
        });
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggleRow.appendChild(toggle);
        toggleRow.appendChild(el('span', null, have + ' thành tích đã mở khóa'));
        container.appendChild(toggleRow);
        if (!expanded) return;

        /* Bộ lọc */
        var toolbar = el('div', 'bk-badges-toolbar');

        var search = el('input', 'bk-input');
        search.type = 'search';
        search.placeholder = 'Tìm badge…';
        search.style.maxWidth = '14rem';
        search.value = badgeState.query;
        search.addEventListener('input', function () {
            badgeState.query = search.value;
            paintGrid();
        });
        toolbar.appendChild(search);

        var catSel = el('select', 'bk-select');
        catSel.style.maxWidth = '12rem';
        catSel.setAttribute('aria-label', 'Lọc theo danh mục');
        var allOpt = el('option', null, 'Tất cả danh mục');
        allOpt.value = 'all';
        catSel.appendChild(allOpt);
        b.CATEGORIES.forEach(function (c) {
            var o = el('option', null, c.name);
            o.value = c.id;
            catSel.appendChild(o);
        });
        catSel.value = badgeState.category;
        catSel.addEventListener('change', function () { badgeState.category = catSel.value; paintGrid(); });
        toolbar.appendChild(catSel);

        var rarSel = el('select', 'bk-select');
        rarSel.style.maxWidth = '11rem';
        rarSel.setAttribute('aria-label', 'Lọc theo độ hiếm');
        var rAll = el('option', null, 'Mọi độ hiếm');
        rAll.value = 'all';
        rarSel.appendChild(rAll);
        b.RARITIES.forEach(function (r) {
            var o = el('option', null, r.name);
            o.value = r.id;
            rarSel.appendChild(o);
        });
        rarSel.value = badgeState.rarity;
        rarSel.addEventListener('change', function () { badgeState.rarity = rarSel.value; paintGrid(); });
        toolbar.appendChild(rarSel);

        var statusSel = el('select', 'bk-select');
        statusSel.style.maxWidth = '11rem';
        statusSel.setAttribute('aria-label', 'Lọc theo trạng thái');
        [['all', 'Tất cả'], ['done', 'Đã đạt'], ['todo', 'Chưa đạt']].forEach(function (pair) {
            var o = el('option', null, pair[1]);
            o.value = pair[0];
            statusSel.appendChild(o);
        });
        statusSel.value = badgeState.status;
        statusSel.addEventListener('change', function () { badgeState.status = statusSel.value; paintGrid(); });
        toolbar.appendChild(statusSel);
        container.appendChild(toolbar);

        var grid = el('div', 'bk-badge-grid');
        container.appendChild(grid);

        function paintGrid() {
            grid.textContent = '';
            var rows = b.progress();
            var q = String(badgeState.query || '').toLowerCase();
            var shown = 0;
            rows.forEach(function (row) {
                if (badgeState.category !== 'all' && row.category !== badgeState.category) return;
                if (badgeState.rarity !== 'all' && row.rarity !== badgeState.rarity) return;
                if (badgeState.status === 'done' && !row.unlockedAt) return;
                if (badgeState.status === 'todo' && row.unlockedAt) return;
                if (q && (row.name + ' ' + row.desc).toLowerCase().indexOf(q) === -1) return;
                shown++;
                grid.appendChild(badgeCard(row));
            });
            if (!shown) {
                var empty = el('p', null, 'Không có badge nào khớp bộ lọc.');
                empty.style.cssText = 'grid-column:1/-1;color:var(--bkl-muted);font-size:.8rem';
                grid.appendChild(empty);
            }
            if (api) { /* no-op, giữ tham chiếu dùng chung */ }
        }
        paintGrid();
        if (global.BKShell) global.BKShell.mark('badges.viewed');
    }

    function frameLabel(id) {
        try {
            var f = global.BKProfile && global.BKProfile.frameById ? global.BKProfile.frameById(id) : null;
            return f && f.name ? f.name : String(id || '');
        } catch (e) { return String(id || ''); }
    }

    function badgeHow(row) {
        if (row.adminOnly) {
            return row.exclusive === 'founder'
                ? 'Chỉ hồ sơ Người sáng lập đã xác minh mới nhận được. Founder có thể trao lại từ Founder Dashboard.'
                : row.exclusive === 'dev'
                    ? 'Ấn phẩm độc quyền của Bá Khí. Chỉ Founder trao từ Founder Dashboard.'
                    : 'Do quản trị viên trao tay từ Administrator Dashboard, không tự mở bằng tiến độ học tập.';
        }
        if (row.rarity === 'secret' && !row.unlockedAt) {
            return row.desc + ' Đây là badge bí mật: điều kiện thật đã hiện ở đây, không cần đoán.';
        }
        return row.desc + (row.goal > 1 ? ' Tiến độ được máy chủ xác minh từ dữ liệu học tập của bạn.' : '');
    }

    /* Hình tượng SVG của 10 Founder Badge 7.5.0. Markup là hằng số trong
       bk-badges.js (không chứa dữ liệu người dùng), nên chèn được an toàn. */
    function badgeArtNode(row) {
        var b = B();
        if (!row || !row.art || !b || typeof b.art !== 'function') return null;
        var svg = b.art(row.art);
        if (!svg) return null;
        var box = el('span', 'bk-badge-artwrap');
        box.innerHTML = svg;
        return box;
    }

    function paintBadgeIcon(host, row) {
        var art = badgeArtNode(row);
        if (art) { host.classList.add('is-art'); host.appendChild(art); return; }
        host.appendChild(icon(row.unlockedAt || !row.adminOnly ? row.icon : 'fa-lock'));
    }

    function openBadge(row) {
        if (!row) return;
        var body = el('div', 'bk-badge-detail');
        var head = el('div', 'bk-badge-detail-head');
        var iconBox = el('div', 'bk-badge-detail-icon' + (row.unlockedAt ? '' : ' is-locked'));
        paintBadgeIcon(iconBox, row);
        head.appendChild(iconBox);
        var title = el('div');
        title.appendChild(el('h3', null, row.name));
        var meta = el('div', 'bk-badge-detail-meta');
        meta.appendChild(el('span', null, rarityMeta(row.rarity).name));
        meta.appendChild(el('span', null, categoryMeta(row.category).name));
        meta.appendChild(el('span', null, row.unlockedAt ? 'Đã mở khóa' : 'Chưa mở khóa'));
        title.appendChild(meta);
        head.appendChild(title);
        body.appendChild(head);

        body.appendChild(el('p', 'bk-badge-detail-label', 'Mô tả'));
        body.appendChild(el('p', null, row.desc));

        body.appendChild(el('p', 'bk-badge-detail-label', 'Cách lấy'));
        body.appendChild(el('p', null, badgeHow(row)));

        if (!row.adminOnly) {
            body.appendChild(el('p', 'bk-badge-detail-label', 'Tiến độ'));
            var bar = el('div', 'bk-progress');
            var fill = el('span');
            fill.style.width = Math.max(0, Math.min(100, row.pct)) + '%';
            bar.appendChild(fill);
            body.appendChild(bar);
            body.appendChild(el('p', 'bk-badge-detail-num', row.current + ' / ' + row.goal +
                (row.unlockedAt ? ' · đã hoàn thành' : '')));
        }

        if (row.frame) {
            body.appendChild(el('p', 'bk-badge-detail-label', 'Phần thưởng'));
            body.appendChild(el('p', null, 'Mở khóa khung avatar “' + frameLabel(row.frame) + '” khi đạt badge này.'));
        }

        if (global.BK && global.BK.ui && global.BK.ui.modal) {
            global.BK.ui.modal({
                title: 'Chi tiết thành tích',
                body: body,
                actions: [{ label: 'Đóng', variant: 'ghost', onClick: function (close) { close(); } }]
            });
        }
    }

    function badgeCard(row) {
        var card = el('div', 'bk-badge bk-badge-tappable' + (row.unlockedAt ? '' : ' is-locked'));
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', row.name + ' — xem cách lấy');
        card.setAttribute('title', 'Ấn để xem mô tả và cách lấy');
        card.addEventListener('click', function () { openBadge(row); });
        card.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBadge(row); }
        });
        var ic = el('div', 'bk-badge-icon');
        paintBadgeIcon(ic, row);
        card.appendChild(ic);

        var body = el('div', 'bk-badge-body');
        body.appendChild(el('div', 'bk-badge-name', row.name));
        var desc = el('div', 'bk-badge-desc');
        if (row.rarity === 'secret' && !row.unlockedAt) desc.textContent = 'Bí mật — ấn để xem cách lấy.';
        else desc.textContent = row.desc;
        body.appendChild(desc);

        if (row.adminOnly) {
            var admin = el('div', 'bk-badge-prog');
            admin.textContent = row.unlockedAt ? 'Được trao tặng' : 'Quản trị viên trao';
            body.appendChild(admin);
        } else if (!row.unlockedAt) {
            var prog = el('div', 'bk-badge-prog');
            var small = el('div', 'bk-progress');
            var fill = el('i');
            fill.style.width = Math.max(0, Math.min(100, row.pct)) + '%';
            small.appendChild(fill);
            prog.appendChild(small);
            prog.appendChild(el('span', null, row.current + '/' + row.goal));
            body.appendChild(prog);
        }
        card.appendChild(body);
        card.appendChild(el('span', 'bk-badge-rarity', rarityMeta(row.rarity).name));
        return card;
    }

    global.BKProfileUI = {
        renderHero: renderHero,
        renderEditor: renderEditor,
        renderFrames: renderFrames,
        renderBadgeBoard: renderBadgeBoard,
        openBadge: openBadge,
        badgeState: badgeState,
        rarityMeta: rarityMeta,
        categoryMeta: categoryMeta
    };

    function repaintProfile() {
        try {
            var hero = D.getElementById('bkProfileHero');
            if (hero) renderHero(hero);
            var board = D.getElementById('bkBadges');
            if (board) renderBadgeBoard(board);
            var frames = D.getElementById('bkProfileFrames');
            if (frames) {
                frames.textContent = '';
                frames.appendChild(renderFrames());
            }
        } catch (e) { }
    }

    /* Đổi học sinh hoặc badge thay đổi ở tab/máy khác: vẽ lại ngay, không F5. */
    if (global.addEventListener) {
        global.addEventListener('bk:identity', repaintProfile);
        var badgeRepaint = null;
        D.addEventListener('bkbadges', function () {
            clearTimeout(badgeRepaint);
            badgeRepaint = setTimeout(repaintProfile, 120);
        });
    }
})(typeof window !== 'undefined' ? window : this);
