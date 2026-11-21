/* =========================================================================
   Bá Khí — bk-shell.js
   Header dùng chung toàn website: avatar tài khoản + menu tài khoản,
   chuyển giao diện, trợ năng toàn site và các chỉnh sửa giao diện cũ.

   Chạy được cả trên trang không có bk-core.js (Studio) nên không phụ thuộc BK.

   Công khai: window.BKShell
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKShell && global.BKShell.__ready) return;

    var A11Y_KEY = 'bakhiA11y.v1';
    var S = { menu: null, btn: null, slot: null, open: false, base: './', version: '0.0.0' };

    var VERSION = (global.BAKHI_VERSION && global.BAKHI_VERSION.app) || '8.2.0';
    S.version = VERSION;

    /* ---------------------------------------------------------------------
       Tiện ích
       ------------------------------------------------------------------ */
    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function parse(raw, dflt) {
        if (!raw) return dflt;
        try { var v = JSON.parse(raw); return v == null ? dflt : v; } catch (e) { return dflt; }
    }
    function basePath() {
        var scripts = D.scripts || [];
        var mark = 'assets/bakhi/bk-shell.js';
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            var at = src.indexOf(mark);
            if (at < 0) continue;
            var prefix = src.slice(0, at);
            return prefix || './';
        }
        return './';
    }
    function ensureCss(name) {
        var id = 'bk-css-' + name;
        if (D.getElementById(id)) return;
        var link = D.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = S.base + 'assets/bakhi/' + name + '.css?v=' + VERSION;
        (D.head || D.documentElement).appendChild(link);
    }
    function icon(name) {
        var i = D.createElement('i');
        i.className = 'fa-solid ' + name;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    /* ---------------------------------------------------------------------
       Trợ năng (áp dụng trên mọi trang)
       ------------------------------------------------------------------ */
    function readA11y() {
        var raw = parse(lsGet(A11Y_KEY), {});
        return {
            fontScale: Math.max(90, Math.min(130, Number(raw.fontScale) || 100)),
            contrast: !!raw.contrast,
            reduceMotion: !!raw.reduceMotion,
            strongFocus: !!raw.strongFocus,
            underlineLinks: !!raw.underlineLinks
        };
    }
    function applyA11y() {
        var a = readA11y();
        var html = D.documentElement;
        html.style.setProperty('--bk-font-scale', String(a.fontScale / 100));
        html.classList.toggle('bk-a11y-contrast', a.contrast);
        html.classList.toggle('bk-a11y-reduce-motion', a.reduceMotion);
        html.classList.toggle('bk-a11y-strong-focus', a.strongFocus);
        html.classList.toggle('bk-a11y-links', a.underlineLinks);
        /* Tôn trọng thiết lập hệ điều hành khi người dùng chưa chọn. */
        if (rawReduceMotionUnset()) {
            try {
                if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    html.classList.add('bk-a11y-reduce-motion');
                }
            } catch (e) { }
        }
        return a;
    }
    function rawReduceMotionUnset() {
        var raw = parse(lsGet(A11Y_KEY), {});
        return raw.reduceMotion == null;
    }
    function setA11y(patch) {
        var a = readA11y();
        var next = Object.assign({}, a, patch || {});
        next.fontScale = Math.max(90, Math.min(130, Number(next.fontScale) || 100));
        lsSet(A11Y_KEY, JSON.stringify(next));
        applyA11y();
        return next;
    }

    /* ---------------------------------------------------------------------
       Giao diện sáng/tối (dùng khoá `theme` sẵn có)
       ------------------------------------------------------------------ */
    function currentTheme() {
        var t = lsGet('theme');
        return t === 'light' ? 'light' : 'dark';
    }
    /** Trang có giao diện theo chủ đề hay dùng bảng màu cố định (bài học, Studio). */
    function themeCapable() {
        return !!D.getElementById('themeIcon') ||
            !!(D.body && D.body.classList && D.body.classList.contains('bk-app'));
    }
    function applyTheme(theme) {
        var dark = theme !== 'light';
        if (themeCapable()) {
            D.documentElement.classList.toggle('dark', dark);
            D.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        }
        lsSet('theme', dark ? 'dark' : 'light');
        if (global.BK && global.BK.badges) {
            try { global.BK.badges.bumpCounter('theme.toggles'); } catch (e) { }
        }
        paintThemeRow();
        return dark ? 'dark' : 'light';
    }
    function toggleTheme() {
        return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    }
    /** Đồng bộ lại giao diện của lớp học tập (trang chủ có hàm riêng). */
    function syncLegacyTheme(dark) {
        var themeIcon = D.getElementById('themeIcon');
        var themeText = D.getElementById('themeText');
        if (themeIcon) themeIcon.className = 'fa-solid ' + (dark ? 'fa-moon text-indigo-500' : 'fa-sun text-amber-500');
        if (themeText) themeText.innerText = dark ? 'Đang tối' : 'Đang sáng';
    }

    /* ---------------------------------------------------------------------
       Chỉnh giao diện cũ trên trang chủ
       ------------------------------------------------------------------ */
    function cleanLegacyChrome() {
        /* Menu ba gạch: ẩn cả khối, giữ lại DOM cho script cũ. */
        var dd = D.getElementById('hamburgerDropdown');
        if (dd) {
            var wrap = dd.parentNode;
            if (wrap && wrap.classList) wrap.classList.add('bk-legacy-hidden');
        }
        /* Khối quản lý hình nền: chuyển sang trang Cài đặt. */
        var bgInput = D.getElementById('bgInput');
        if (bgInput) {
            var box = bgInput.closest ? bgInput.closest('.flex-col') : null;
            if (box) box.classList.add('bk-legacy-wallpaper');
        }
        refreshHomeCopy();
    }

    /** Câu hướng dẫn cũ nhắc "biểu tượng 3 gạch" — cập nhật theo giao diện mới. */
    function refreshHomeCopy() {
        if (!D.body) return;
        var nodes = D.querySelectorAll('p');
        for (var i = 0; i < nodes.length; i++) {
            var p = nodes[i];
            if (!/3\s*gạch/i.test(p.textContent || '')) continue;
            p.textContent = 'Chọn thư mục bên dưới để mở bài học. Bấm vào ảnh đại diện ở góc trên phải để mở hồ sơ, đổi giao diện và cài đặt.';
        }
    }

    /* ---------------------------------------------------------------------
       Chuẩn hoá tên trường trong phần giao diện (không đụng nội dung học tập)
       ------------------------------------------------------------------ */
    function normalizeSchoolName() {
        var NAME = 'THPT Huỳnh Ngọc Huệ';
        if (!D.body || !/THPT\s+FPT/i.test(D.body.textContent || '')) return;
        var roots = D.querySelectorAll('header, footer, main');
        if (!roots.length) return;
        var walker = D.createTreeWalker(roots[0], 4 /* NodeFilter.SHOW_TEXT */, null, false);
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (var r = 1; r < roots.length; r++) {
            var w = D.createTreeWalker(roots[r], 4, null, false);
            while (w.nextNode()) nodes.push(w.currentNode);
        }
        nodes.forEach(function (node) {
            var parent = node.parentNode;
            if (!parent) return;
            var tag = (parent.nodeName || '').toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
            if (/THPT\s+FPT/i.test(node.nodeValue)) {
                node.nodeValue = node.nodeValue.replace(/THPT\s+FPT/gi, NAME);
            }
        });
    }

    /* ---------------------------------------------------------------------
       Đếm tương tác sao băng (gộp lô, không ghi mỗi click)
       ------------------------------------------------------------------ */
    var meteorBuffer = 0, meteorTimer = 0;
    function flushMeteors() {
        if (!meteorBuffer) return;
        var n = meteorBuffer;
        meteorBuffer = 0;
        if (global.BK && global.BK.signals) {
            try { global.BK.signals.bump('interaction.meteors', n); } catch (e) { }
        }
    }
    function countMeteor() {
        meteorBuffer++;
        if (!meteorTimer) meteorTimer = setTimeout(function () { meteorTimer = 0; flushMeteors(); }, 4000);
        if (meteorBuffer >= 25) { clearTimeout(meteorTimer); meteorTimer = 0; flushMeteors(); }
        if (global.BK && global.BK.badges) {
            try { global.BK.badges.check({ silent: false }); } catch (e) { }
        }
    }
    function hookEffects() {
        var fx = global.__fx;
        if (fx && typeof fx.shot === 'function' && !fx.__bkCounted) {
            var orig = fx.shot;
            fx.shot = function () {
                try { countMeteor(); } catch (e) { }
                return orig.apply(this, arguments);
            };
            fx.__bkCounted = true;
        }
    }

    /* ---------------------------------------------------------------------
       Avatar + menu
       ------------------------------------------------------------------ */
    function profileApi() { return global.BKProfile || null; }
    function displayName() {
        var api = profileApi();
        if (api) return api.displayName();
        var saved = parse(lsGet('bakhiStudent.v1'), {});
        return saved.displayName || 'Khách';
    }
    /* Lời chào theo giờ Việt Nam. Chỉ chạy khi trang có #bkGreeting (trang chủ)
       và chỉ hiện sau khi đã biết tên hiển thị → không nhấp nháy nội dung. */
    function vnHour() {
        try {
            var parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hour12: false
            }).formatToParts(new Date());
            for (var i = 0; i < parts.length; i++) {
                if (parts[i].type === 'hour') return Number(parts[i].value) % 24;
            }
        } catch (e) { }
        return new Date().getHours();
    }

    function greetingText(hour) {
        if (hour >= 5 && hour < 11) return 'Chào buổi sáng';
        if (hour >= 11 && hour < 14) return 'Chào buổi trưa';
        if (hour >= 14 && hour < 18) return 'Chào buổi chiều';
        if (hour >= 18 && hour < 23) return 'Chào buổi tối';
        return 'Chào đêm khuya';
    }

    function vnDateText() {
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long',
                day: '2-digit', month: '2-digit', year: 'numeric'
            }).format(new Date());
        } catch (e) { return ''; }
    }

    function paintGreeting() {
        var box = D.getElementById('bkGreeting');
        if (!box) return;
        var name = '';
        try {
            var api = profileApi();
            name = api && api.displayName ? api.displayName() : displayName();
        } catch (e) { name = ''; }
        name = String(name || '').trim();
        if (!name || name === 'Khách') {
            /* Khách chưa nhận diện: ẩn hẳn thay vì hiện lời chào trống. */
            box.hidden = true;
            return;
        }
        var timeEl = box.querySelector('[data-bk-greet-time]');
        var nameEl = box.querySelector('[data-bk-greet-name]');
        var dateEl = box.querySelector('[data-bk-greet-date]');
        if (timeEl) timeEl.textContent = greetingText(vnHour());
        if (nameEl) nameEl.textContent = name;
        if (dateEl) dateEl.textContent = vnDateText();
        box.hidden = false;
    }

    function avatarNode(size) {
        var api = profileApi();
        if (api) return api.avatarNode({ size: size, className: 'bk-shell-avatar' });
        var span = el('span', 'bk-avatar');
        span.style.width = size + 'px';
        span.style.height = size + 'px';
        span.style.setProperty('--bk-avatar-size', size + 'px');
        var fb = el('span', 'bk-avatar-fallback', 'BK');
        span.appendChild(fb);
        return span;
    }

    function buildSlot() {
        if (S.slot) return S.slot;
        var cluster = null;
        var readme = D.getElementById('bkReadmeBtn');
        if (readme && readme.parentNode) cluster = readme.parentNode;
        if (!cluster) {
            var header = D.querySelector('header');
            if (header) {
                var inner = header.querySelector('.bk-topbar-inner, .bk-page-head');
                if (!inner) {
                    /* Hàng điều hướng dạng flex bên trong header (mọi trang nội dung,
                       Studio, word-paint). Ưu tiên hàng có justify-between. */
                    var rows = header.querySelectorAll('div, nav');
                    for (var i = 0; i < rows.length; i++) {
                        var cls = rows[i].className || '';
                        if (typeof cls !== 'string') continue;
                        if (!/\bflex\b/.test(cls)) continue;
                        if (!/items-center|justify-between/.test(cls)) continue;
                        if (rows[i].querySelector('button, a, h1, input')) { inner = rows[i]; break; }
                    }
                }
                cluster = inner || header;
            }
        }
        var slot = el('div', 'bk-user-slot');
        var btn = el('button', 'bk-user-btn');
        btn.type = 'button';
        btn.id = 'bkUserBtn';
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        var avatarWrap = el('span', 'bk-user-avatar-wrap');
        avatarWrap.appendChild(avatarNode(34));
        btn.appendChild(avatarWrap);
        var caret = D.createElement('i');
        caret.className = 'fa-solid fa-chevron-down bk-user-btn-caret';
        caret.setAttribute('aria-hidden', 'true');
        btn.appendChild(caret);
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleMenu();
        });
        slot.appendChild(btn);

        if (cluster && cluster.appendChild) {
            cluster.appendChild(slot);
        } else {
            slot.classList.add('bk-user-float');
            (D.body || D.documentElement).appendChild(slot);
        }
        S.slot = slot;
        S.btn = btn;
        return slot;
    }

    function row(tag, iconName, label, opts) {
        opts = opts || {};
        var r = el(tag, 'bk-menu-row');
        if (tag === 'a') {
            r.href = opts.href || '#';
            if (opts.external) { r.target = '_blank'; r.rel = 'noopener noreferrer'; }
        } else {
            r.type = 'button';
        }
        if (opts.role) r.setAttribute('role', opts.role);
        r.appendChild(icon(iconName));
        r.appendChild(el('span', null, label));
        if (opts.desc) r.appendChild(el('span', 'bk-menu-desc', opts.desc));
        if (opts.onClick) r.addEventListener('click', opts.onClick);
        return r;
    }

    function buildMenu() {
        if (S.menu) return S.menu;
        var menu = el('div', 'bk-user-menu');
        menu.id = 'bkUserMenu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Tài khoản');
        menu.hidden = true;

        /* --- A. Hồ sơ --- */
        var head = el('div', 'bk-menu-head');
        head.appendChild(avatarNode(42));
        var text = el('div', 'bk-menu-head-text');
        var nameEl = el('div', 'bk-menu-name', displayName());
        var roleEl = el('div', 'bk-menu-role');
        roleEl.id = 'bkMenuRole';
        roleEl.hidden = true;
        var nickEl = el('div', 'bk-menu-nick');
        var status = el('div', 'bk-menu-status', 'Học sinh');
        var switchBtn = el('button', 'bk-menu-switch', 'Đổi học sinh');
        switchBtn.type = 'button';
        switchBtn.addEventListener('click', function () {
            closeMenu();
            if (global.BKCloud && typeof global.BKCloud.changeStudent === 'function') global.BKCloud.changeStudent();
            else if (typeof global.changeStudent === 'function') global.changeStudent();
        });
        text.appendChild(nameEl);
        text.appendChild(roleEl);
        text.appendChild(nickEl);
        text.appendChild(status);
        text.appendChild(switchBtn);
        head.appendChild(text);
        head.style.cursor = 'pointer';
        head.addEventListener('click', function (e) {
            if (e.target === switchBtn || switchBtn.contains(e.target)) return;
            go('profile/');
        });
        menu.appendChild(head);

        /* --- A (tiếp). Hồ sơ --- */
        menu.appendChild(row('a', 'fa-id-card', 'Hồ sơ cá nhân', {
            href: S.base + 'profile/', role: 'menuitem',
            onClick: function () { closeMenu(); }
        }));

        /* 8.3.1: lối vào Tiến trình (XP, nhiệm vụ, thành tựu, Boss, kho đồ). */
        var progressRow = row('a', 'fa-gamepad', 'Tiến trình học tập', {
            href: S.base + 'gamification/', role: 'menuitem',
            desc: 'XP · cấp độ · nhiệm vụ',
            onClick: function () { closeMenu(); }
        });
        progressRow.setAttribute('data-bk-progress-link', '1');
        if (/\/gamification\/(index\.html)?$/i.test(global.location.pathname)) {
            progressRow.setAttribute('aria-current', 'page');
        }
        menu.appendChild(progressRow);

        /* --- Chat: phòng chung, tin nhắn riêng, nhóm nhỏ --- */
        var chatRow = row('a', 'fa-comments', 'Chat', {
            href: S.base + 'chat/', role: 'menuitem', external: true,
            onClick: function () { closeMenu(); }
        });
        var chatCount = el('span', 'bk-menu-count');
        chatCount.id = 'bkMenuChatCount';
        chatCount.hidden = true;
        chatRow.appendChild(chatCount);
        menu.appendChild(chatRow);

        menu.appendChild(el('hr', 'bk-menu-sep'));

        /* --- B. Giao diện (chỉ nơi giao diện thật sự đổi được sáng/tối) --- */
        var themeRow = null;
        if (themeCapable()) {
        themeRow = el('button', 'bk-menu-row');
        themeRow.type = 'button';
        themeRow.id = 'bkThemeRow';
        themeRow.setAttribute('role', 'menuitemcheckbox');
        themeRow.appendChild(icon('fa-moon'));
        themeRow.appendChild(el('span', null, 'Giao diện'));
        var themeCheck = el('span', 'bk-menu-check');
        themeRow.appendChild(themeCheck);
        themeRow.addEventListener('click', function () {
            var mode;
            if (typeof global.toggleDarkMode === 'function') {
                try { global.toggleDarkMode(null); } catch (e) { }
                mode = currentTheme();
                syncLegacyTheme(mode !== 'light');
            } else {
                mode = toggleTheme();
                syncLegacyTheme(mode !== 'light');
            }
            paintThemeRow();
            /* Giữ menu mở để người dùng thấy trạng thái vừa đổi. */
            if (global.BK && global.BK.badges) {
                try { global.BK.badges.check({ silent: true }); } catch (e) { }
            }
        });
        menu.appendChild(themeRow);
        }

        /* --- C. README.md --- */
        menu.appendChild(row('button', 'fa-book-open', 'README.md', {
            role: 'menuitem',
            onClick: function () {
                closeMenu();
                if (typeof global.openReadmeModal === 'function') global.openReadmeModal();
                else global.open(S.base + 'README.md', '_blank', 'noopener');
            }
        }));

        /* --- D. Bá Khí Studio --- */
        menu.appendChild(row('a', 'fa-wand-magic-sparkles', 'Bá Khí Studio', {
            href: S.base + 'studio/', role: 'menuitem',
            onClick: function () { closeMenu(); }
        }));

        /* --- F. Cài đặt --- */
        menu.appendChild(row('a', 'fa-gear', 'Cài đặt', {
            href: S.base + 'settings/', role: 'menuitem',
            onClick: function () { closeMenu(); }
        }));

        var foot = el('div', 'bk-menu-foot');
        foot.appendChild(el('span', null, 'Bá Khí v' + VERSION));
        var siteLink = el('a', null, 'Trang chủ');
        siteLink.href = S.base;
        foot.appendChild(siteLink);
        menu.appendChild(foot);

        (D.body || D.documentElement).appendChild(menu);
        S.menu = menu;
        S.nameEl = nameEl;
        S.nickEl = nickEl;
        paintThemeRow();
        return menu;
    }

    function paintThemeRow() {
        var r = D.getElementById('bkThemeRow');
        if (!r) return;
        var dark = currentTheme() === 'dark';
        var ic = r.querySelector('i');
        if (ic) ic.className = 'fa-solid ' + (dark ? 'fa-moon' : 'fa-sun');
        var check = r.querySelector('.bk-menu-check');
        if (check) check.textContent = dark ? 'Tối' : 'Sáng';
        r.setAttribute('aria-checked', dark ? 'true' : 'false');
    }

    function paintChatUnread() {
        if (!S.btn) return;
        var n = 0;
        try {
            n = Number(global.BKCloud && global.BKCloud.chatUnread ? global.BKCloud.chatUnread() : 0) || 0;
        } catch (e) { n = 0; }
        var count = D.getElementById('bkMenuChatCount');
        if (!count) return;
        /* Chỉ chấm báo, không hiện số tin chưa đọc. */
        count.textContent = '';
        count.hidden = !n;
        count.classList.toggle('is-dot', !!n);
        if (n) {
            count.setAttribute('role', 'status');
            count.setAttribute('aria-label', 'Có tin nhắn chưa đọc trong Chat');
            count.title = 'Có tin nhắn chưa đọc trong Chat';
        } else {
            count.removeAttribute('role');
            count.removeAttribute('aria-label');
            count.removeAttribute('title');
        }
    }

    function paintProfileBits() {
        paintGreeting();
        if (!S.btn) return;
        var old = S.btn.querySelector('.bk-avatar');
        if (old) {
            var fresh = avatarNode(34);
            (old.parentNode || S.btn).replaceChild(fresh, old);
        }
        if (S.nameEl) S.nameEl.textContent = displayName();
        var roleEl = D.getElementById('bkMenuRole');
        if (roleEl) {
            var idc = null;
            try { idc = profileApi() && profileApi().identity ? profileApi().identity() : null; } catch (e) { }
            var label = (idc && global.BKRoles) ? global.BKRoles.labelFor(idc.studentId) : '';
            roleEl.textContent = label;
            roleEl.hidden = !label;
        }
        if (S.nickEl) {
            var api = profileApi();
            var p = api ? api.get() : {};
            var base = parse(lsGet('bakhiStudent.v1'), {});
            var nick = p.nickname || '';
            var synced = false;
            try {
                var st = global.BKCloud && global.BKCloud.state ? global.BKCloud.state() : null;
                synced = !!(st && (st.session || st.bound));
            } catch (e) { }
            S.nickEl.textContent = nick ? '@' + nick : (base.displayName ? 'Học sinh · ' + (synced ? 'đã đồng bộ' : 'lưu trên thiết bị') : '');
        }
        paintChatUnread();
    }

    function placeMenu() {
        if (!S.menu || !S.btn) return;
        var r = S.btn.getBoundingClientRect();
        var vw = global.innerWidth || 1024;
        var vh = global.innerHeight || 768;
        if (vw <= 640) {
            S.menu.style.top = '';
            S.menu.style.left = '.5rem';
            S.menu.style.right = '.5rem';
            S.menu.style.bottom = '.5rem';
            return;
        }
        S.menu.style.bottom = '';
        S.menu.style.right = 'auto';
        var width = Math.min(352, vw - 16);
        var left = Math.min(vw - width - 8, Math.max(8, r.right - width));
        S.menu.style.left = left + 'px';
        var top = r.bottom + 8;
        var estimated = Math.min(S.menu.offsetHeight || 380, vh - 16);
        if (top + estimated > vh - 8) {
            top = Math.max(8, r.top - estimated - 8);
        }
        S.menu.style.top = top + 'px';
        S.menu.style.maxHeight = Math.max(180, vh - top - 8) + 'px';
    }

    function openMenu() {
        buildMenu();
        S.menu.hidden = false;
        placeMenu();
        /* Đo lại sau khi hiện để căn đúng chiều cao thật. */
        requestAnimationFrame(function () { placeMenu(); });
        S.menu.classList.add('open');
        S.open = true;
        if (S.btn) S.btn.setAttribute('aria-expanded', 'true');
        paintProfileBits();
        if (global.BKCloud && global.BKCloud.refreshChatUnread) {
            try { global.BKCloud.refreshChatUnread(); } catch (e) { }
        }
        var first = S.menu.querySelector('.bk-menu-row');
        if (first && first.focus) {
            try { first.focus({ preventScroll: true }); } catch (e) { }
        }
        D.addEventListener('keydown', onKey, true);
        D.addEventListener('click', onDocClick, true);
        global.addEventListener('resize', placeMenu);
        /* Cuộn trang (bên ngoài menu) thì đóng hẳn menu; cuộn bên trong menu
           vẫn giữ menu mở để đọc hết danh sách. */
        global.addEventListener('scroll', onScrollHide, true);
    }

    function closeMenu() {
        if (!S.menu || !S.open) return;
        S.menu.classList.remove('open');
        S.open = false;
        if (S.btn) {
            S.btn.setAttribute('aria-expanded', 'false');
            try { S.btn.focus({ preventScroll: true }); } catch (e) { }
        }
        setTimeout(function () {
            if (S.menu && !S.open) S.menu.hidden = true;
        }, 180);
        D.removeEventListener('keydown', onKey, true);
        D.removeEventListener('click', onDocClick, true);
        global.removeEventListener('resize', placeMenu);
        global.removeEventListener('scroll', onScrollHide, true);
    }

    function onScrollHide(e) {
        if (!S.open || !S.menu) return;
        var target = e && e.target;
        if (target && target !== D && S.menu.contains(target)) return;
        closeMenu();
    }

    function toggleMenu() { if (S.open) closeMenu(); else openMenu(); }

    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
        if (e.key !== 'Tab' || !S.menu) return;
        var items = S.menu.querySelectorAll('a[href], button:not([disabled]), input');
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && D.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && D.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function onDocClick(e) {
        if (!S.menu || !S.open) return;
        if (S.menu.contains(e.target) || (S.btn && S.btn.contains(e.target))) return;
        closeMenu();
    }

    function go(path) {
        closeMenu();
        global.location.href = S.base + path;
    }

    /* ---------------------------------------------------------------------
       Developer Playground: chỉ tải khi phiên Dev hợp lệ (server-verified)
       ------------------------------------------------------------------ */
    function devActive() {
        try {
            return !!(global.BKCloud && global.BKCloud.devToken && global.BKCloud.devToken());
        } catch (e) { return false; }
    }

    function ensureDevScript(cb) {
        if (global.BKDev) { if (cb) cb(); return; }
        if (!global.BK || !global.BK.ui) { if (cb) cb(); return; }
        var existing = D.getElementById('bkDevScript');
        if (existing) {
            existing.addEventListener('load', function () { if (cb) cb(); }, { once: true });
            return;
        }
        var s = D.createElement('script');
        s.id = 'bkDevScript';
        s.src = S.base + 'assets/bakhi/bk-dev.js?v=' +
            ((global.BAKHI_VERSION && global.BAKHI_VERSION.app) || '3.9.0');
        s.defer = true;
        s.onload = function () { if (cb) cb(); };
        (D.body || D.head).appendChild(s);
    }

    function openDev() {
        if (!devActive()) {
            if (global.BK && BK.ui && BK.ui.toast) {
                BK.ui.toast('Dev Code chưa được xác thực. Vào Cài đặt → Nhà phát triển.', 'error');
            }
            return false;
        }
        ensureDevScript(function () {
            if (global.BKDev && global.BKDev.open) global.BKDev.open();
        });
        return true;
    }

    /* ---------------------------------------------------------------------
       Khởi động
       ------------------------------------------------------------------ */
    /* ---------------------------------------------------------------------
       Bảo trì toàn website
       - Đọc public.maintenance từ Supabase; chỉ phiên Founder do máy chủ xác nhận
         (admin-actions → session.check) mới được bỏ qua màn hình bảo trì.
       - Không phá dữ liệu, không chặn trang quản trị.
       ------------------------------------------------------------------ */
    var MAINT_TIMER = null;
    var MAINT_LAST = null;

    /* ---------------------------------------------------------------------
       Phiên Founder — xác minh ở MÁY CHỦ. Không dựa vào localStorage, tên
       hiển thị hay biến JavaScript; Administrator thường không có quyền bỏ
       qua bảo trì toàn hệ thống.
       ------------------------------------------------------------------ */
    function founderTokenLocal() {
        try {
            var raw = global.sessionStorage.getItem('bakhiAdmin.v1');
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || !data.token) return null;
            if (data.scope !== 'founder') return null;
            if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) return null;
            return data.token;
        } catch (e) { return null; }
    }

    var FOUNDER = { token: null, verified: false, checking: null };

    function resetFounderCache() {
        FOUNDER.verified = false;
        FOUNDER.token = null;
        FOUNDER.checking = null;
    }

    /* Nạp mô-đun xác thực Founder dùng chung (một cơ chế cho toàn website). */
    function withFounderAuth(cb) {
        if (global.BKFounderAuth) { cb(global.BKFounderAuth); return; }
        var selector = 'script[data-bk-founder-auth]';
        var existing = D.querySelector(selector);
        var ready = function () { cb(global.BKFounderAuth || null); };
        if (existing) {
            existing.addEventListener('load', ready);
            existing.addEventListener('error', ready);
            return;
        }
        var tag = D.createElement('script');
        tag.src = S.base + 'assets/bakhi/bk-founder-auth.js?v=' + VERSION;
        tag.defer = true;
        tag.setAttribute('data-bk-founder-auth', '1');
        tag.onload = ready;
        tag.onerror = ready;
        (D.head || D.documentElement).appendChild(tag);
    }

    /* Gọi admin-actions 'session.check': máy chủ đọc lại token trong
       admin_sessions và trả scope. Chỉ scope founder mới gỡ màn hình bảo trì. */
    function verifyFounder(force) {
        var token = founderTokenLocal();
        if (!token) {
            FOUNDER.verified = false;
            FOUNDER.token = null;
            return Promise.resolve(false);
        }
        if (!force && FOUNDER.verified && FOUNDER.token === token) return Promise.resolve(true);
        if (FOUNDER.checking && FOUNDER.token === token) return FOUNDER.checking;
        FOUNDER.token = token;
        FOUNDER.verified = false;
        FOUNDER.checking = new Promise(function (resolve) {
            withFounderAuth(function (auth) {
                if (!auth || typeof auth.check !== 'function') { resolve(false); return; }
                auth.check().then(function (session) {
                    resolve(!!(session && session.scope === 'founder'));
                }).catch(function () { resolve(false); });
            });
        }).then(function (ok) {
            FOUNDER.verified = ok;
            FOUNDER.checking = null;
            if (ok) removeMaintenance();
            return ok;
        });
        return FOUNDER.checking;
    }

    function openFounderLogin() {
        withFounderAuth(function (auth) {
            if (!auth || typeof auth.openDialog !== 'function') {
                if (global.BK && BK.ui && BK.ui.toast) {
                    BK.ui.toast('Chưa tải được mô-đun đăng nhập Founder. Hãy tải lại trang.', 'error');
                }
                return;
            }
            auth.openDialog({
                host: D.getElementById('bkMaintenance') || D.body,
                onSuccess: function () {
                    removeMaintenance();
                    try { global.location.assign(S.base + 'founder/'); } catch (e) { }
                }
            });
        });
    }

    function fmtMaintenanceTime(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleString('vi-VN', {
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
            });
        } catch (e) { return ''; }
    }

    function removeMaintenance() {
        var node = D.getElementById('bkMaintenance');
        if (node && node.parentNode) node.parentNode.removeChild(node);
        if (D.body) D.body.classList.remove('bk-maintenance-on');
        lockPage(false);
    }

    /* ---------------- Khoá cứng toàn website khi bảo trì ---------------- */
    var LOCK = { on: false, y: 0 };

    function maintInside(node) {
        return !!(node && node.closest && node.closest('#bkMaintenance'));
    }

    /* Chặn mọi phím tắt toàn cục. Phím trong hộp thoại mở khoá vẫn hoạt động
       bình thường để nhập Administrator Code. */
    function maintKeyGuard(e) {
        if (!LOCK.on) return;
        if (maintInside(e.target)) return;
        var k = e.key;
        /* Vẫn cho phép tải lại trang và mở công cụ trình duyệt. */
        if (k === 'F5' || k === 'F12' ||
            ((e.ctrlKey || e.metaKey) && (k === 'r' || k === 'R'))) return;
        e.preventDefault();
        e.stopPropagation();
    }

    function maintScrollGuard(e) {
        if (!LOCK.on) return;
        if (maintInside(e.target)) return;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
    }

    function maintFocusGuard(e) {
        if (!LOCK.on) return;
        if (maintInside(e.target)) return;
        var host = D.getElementById('bkMaintenance');
        if (host && host.focus) { try { host.focus({ preventScroll: true }); } catch (err) { } }
    }

    function lockPage(on) {
        on = !!on;
        if (on === LOCK.on) return;
        if (on) {
            LOCK.on = true;
            try { LOCK.y = global.pageYOffset || 0; } catch (e) { LOCK.y = 0; }
            D.documentElement.classList.add('bk-maint-lock');
            D.addEventListener('keydown', maintKeyGuard, true);
            D.addEventListener('wheel', maintScrollGuard, { capture: true, passive: false });
            D.addEventListener('touchmove', maintScrollGuard, { capture: true, passive: false });
            D.addEventListener('focusin', maintFocusGuard, true);
            try {
                global.scrollTo(0, 0);
                if (D.body) D.body.style.top = '-' + LOCK.y + 'px';
            } catch (e) { }
        } else {
            LOCK.on = false;
            D.documentElement.classList.remove('bk-maint-lock');
            D.removeEventListener('keydown', maintKeyGuard, true);
            D.removeEventListener('wheel', maintScrollGuard, true);
            D.removeEventListener('touchmove', maintScrollGuard, true);
            D.removeEventListener('focusin', maintFocusGuard, true);
            try {
                if (D.body) D.body.style.top = '';
                global.scrollTo(0, LOCK.y || 0);
            } catch (e) { }
        }
    }

    function maintStartText(value) {
        var iso = value && (value.maintenance_started_at || value.cycleStartedAt || value.startAt);
        return iso ? fmtMaintenanceTime(iso) : '';
    }

    function paintMaintenance(value) {
        MAINT_LAST = value || {};
        if (!MAINT_LAST.enabled) { removeMaintenance(); return; }
        if (FOUNDER.verified && FOUNDER.token === founderTokenLocal()) { removeMaintenance(); return; }

        var host = D.getElementById('bkMaintenance');
        var signature = [MAINT_LAST.title, MAINT_LAST.message, MAINT_LAST.reason,
            MAINT_LAST.maintenance_started_at, MAINT_LAST.cycleStartedAt,
            MAINT_LAST.startAt, MAINT_LAST.endAt].join('|');
        if (host && host.getAttribute('data-signature') === signature) {
            lockPage(true);
            verifyFounder();
            return;
        }
        if (!host) {
            host = D.createElement('div');
            host.id = 'bkMaintenance';
            host.className = 'bk-maint';
            host.setAttribute('role', 'alertdialog');
            host.setAttribute('aria-modal', 'true');
            host.setAttribute('aria-label', 'Bảo trì toàn website');
            host.tabIndex = -1;
            (D.body || D.documentElement).appendChild(host);
        }
        host.setAttribute('data-signature', signature);
        host.textContent = '';

        var card = D.createElement('div');
        card.className = 'bk-maint-card';

        var title = D.createElement('h1');
        title.className = 'bk-maint-title';
        title.textContent = 'Bảo trì';
        card.appendChild(title);

        var reasonText = String(MAINT_LAST.reason || '').trim();
        var reason = D.createElement('p');
        reason.className = 'bk-maint-reason';
        reason.textContent = reasonText
            || String(MAINT_LAST.message || '').trim()
            || 'Hệ thống đang được nâng cấp. Dữ liệu học tập của bạn được giữ nguyên.';
        card.appendChild(reason);

        if (reasonText && String(MAINT_LAST.message || '').trim()) {
            var message = D.createElement('p');
            message.className = 'bk-maint-msg';
            message.textContent = MAINT_LAST.message;
            card.appendChild(message);
        }

        var started = maintStartText(MAINT_LAST);
        if (started) {
            var time = D.createElement('p');
            time.className = 'bk-maint-time';
            time.textContent = 'Thời gian bắt đầu: ' + started;
            card.appendChild(time);
        }

        /* Icon loading dạng vòng tròn xoay + trạng thái. */
        var mark = D.createElement('div');
        mark.className = 'bk-maint-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.appendChild(el('span', 'bk-maint-spinner'));
        card.appendChild(mark);

        var loading = D.createElement('p');
        loading.className = 'bk-maint-loading';
        loading.setAttribute('role', 'status');
        loading.setAttribute('aria-live', 'polite');
        loading.textContent = 'Đang bảo trì';
        card.appendChild(loading);

        /* Ngoại lệ tương tác duy nhất trên màn hình bảo trì: Đăng nhập Founder. */
        var actions = D.createElement('div');
        actions.className = 'bk-maint-actions';
        var login = D.createElement('button');
        login.type = 'button';
        login.className = 'bk-maint-btn';
        login.id = 'bkMaintFounderLogin';
        login.textContent = 'Đăng nhập Founder';
        login.addEventListener('click', openFounderLogin);
        actions.appendChild(login);
        card.appendChild(actions);

        host.appendChild(card);
        if (D.body) D.body.classList.add('bk-maintenance-on');
        lockPage(true);
        try { host.focus({ preventScroll: true }); } catch (err) { }
        verifyFounder();
    }

    function loadMaintenance(force) {
        if (/\/admin\//.test(global.location.pathname || '') ||
            /\/founder\//.test(global.location.pathname || '')) return;
        var cfg = global.BK_SUPABASE;
        if (!cfg || typeof cfg.configured !== 'function' || !cfg.configured()) {
            var isTestEnv = /jsdom/i.test(String((global.navigator && global.navigator.userAgent) || ''));
            if (!force && !isTestEnv && !MAINT_TIMER) {
                MAINT_TIMER = setTimeout(function () { MAINT_TIMER = null; loadMaintenance(); }, 900);
            }
            return;
        }
        try {
            global.fetch(cfg.url + '/rest/v1/app_settings?key=eq.public.maintenance&select=value', {
                headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
                cache: 'no-store'
            }).then(function (res) { return res.ok ? res.json() : null; })
                .then(function (rows) {
                    if (!Array.isArray(rows) || !rows.length) return;
                    paintMaintenance(rows[0] && rows[0].value);
                }).catch(function () { /* mất mạng: giữ nguyên trạng thái hiện tại */ });
        } catch (e) { }
    }

    function init() {
        S.base = basePath();
        ensureCss('bk-shell');
        ensureCss('bk-profile');
        applyA11y();
        /* Chỉ đổi lớp .dark ở nơi giao diện thật sự theo chủ đề (trang chủ có
           #themeIcon, trang mới dùng .bk-app). Trang bài học và Studio có bảng
           màu riêng nên giữ nguyên. */
        var themable = !!D.getElementById('themeIcon') ||
            !!(D.body && D.body.classList && D.body.classList.contains('bk-app'));
        if (themable) {
            D.documentElement.classList.toggle('dark', currentTheme() === 'dark');
        }
        cleanLegacyChrome();
        normalizeSchoolName();
        buildSlot();
        buildMenu();
        hookEffects();
        paintProfileBits();
        resetFounderCache();
        loadMaintenance();
        /* Không tạo timer định kỳ trong môi trường jsdom (QA) để tiến trình thoát.
           Trình duyệt thật vẫn kiểm tra lại mỗi 2 phút và khi quay lại tab. */
        var isJsdom = /jsdom/i.test(String((global.navigator && global.navigator.userAgent) || ''));
        if (!S.maintPoll && !isJsdom) {
            S.maintPoll = setInterval(function () {
                if (!D.hidden) loadMaintenance();
            }, 120000);
        }
        if (!S.greetPoll && !isJsdom && D.getElementById('bkGreeting')) {
            S.greetPoll = setInterval(paintGreeting, 60000);
        }
        global.addEventListener('focus', function () { loadMaintenance(); });
        global.addEventListener('bk:settings-changed', function () { loadMaintenance(true); });
        global.addEventListener('bk:identity', function () { paintProfileBits(); paintGreeting(); });
        if (global.BKRoles && global.BKRoles.onReady) global.BKRoles.onReady(paintProfileBits);
        global.addEventListener('bk:maintenance', function (e) {
            if (e && e.detail) paintMaintenance(e.detail);
        });
        if (devActive()) ensureDevScript();
        global.addEventListener('bk:dev', function (e) {
            if (e && e.detail && e.detail.active) ensureDevScript();
        });

        if (global.BKProfile && global.BKProfile.on) {
            global.BKProfile.on(function () { paintProfileBits(); });
        }
        global.addEventListener('storage', function (e) {
            if (!e) return;
            if (e.key === 'theme') {
                D.documentElement.classList.toggle('dark', currentTheme() === 'dark');
                paintThemeRow();
            }
            if (e.key === 'bakhiProfile.v1' || e.key === 'bakhiStudent.v1') paintProfileBits();
            if (e.key === A11Y_KEY) applyA11y();
        });

        /* bk-cloud nạp sau bk-shell: nối sự kiện chưa đọc khi nó sẵn sàng. */
        function hookChatUnread() {
            if (!global.BKCloud || !global.BKCloud.on || S.chatHooked) return;
            S.chatHooked = true;
            global.BKCloud.on(function (evt) {
                if (evt === 'chat-unread') paintChatUnread();
            });
            paintChatUnread();
        }
        setTimeout(hookChatUnread, 0);
        setTimeout(hookChatUnread, 700);
    }

    global.BKShell = {
        __ready: true,
        version: VERSION,
        basePath: function () { return S.base; },
        openMenu: openMenu,
        closeMenu: closeMenu,
        toggleTheme: toggleTheme,
        applyTheme: applyTheme,
        currentTheme: currentTheme,
        a11y: readA11y,
        setA11y: setA11y,
        applyA11y: applyA11y,
        refresh: paintProfileBits,
        openDev: openDev,
        devActive: devActive,
        maintenance: {
            reload: function () { loadMaintenance(true); },
            current: function () { return MAINT_LAST; }
        },
        /* Cho phép các trang đánh dấu đã xem badge / dùng tính năng. */
        mark: function (name) {
            if (global.BK && global.BK.badges) {
                try { global.BK.badges.bumpCounter(name); } catch (e) { }
            }
        }
    };

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : this);
