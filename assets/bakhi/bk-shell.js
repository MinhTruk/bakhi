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

    var VERSION = (global.BAKHI_VERSION && global.BAKHI_VERSION.app) || '3.3.0';
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
            p.textContent = 'Chọn thư mục bên dưới để mở bài học. Bấm vào ảnh đại diện ở góc trên phải để mở hồ sơ, tìm kiếm nhanh, đổi giao diện và cài đặt.';
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

    function hookSearch() {
        if (typeof global.debouncedSearch === 'function' && !global.debouncedSearch.__bkCounted) {
            var orig = global.debouncedSearch;
            global.debouncedSearch = function () {
                if (this && this.value && String(this.value).trim().length > 1) {
                    if (global.BK && global.BK.badges) { try { global.BK.badges.bumpCounter('search.used'); } catch (e) { } }
                }
                return orig.apply(this, arguments);
            };
            global.debouncedSearch.__bkCounted = true;
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
        btn.appendChild(avatarNode(34));
        var caret = D.createElement('i');
        caret.className = 'fa-solid fa-chevron-down bk-user-btn-caret';
        caret.setAttribute('aria-hidden', 'true');
        btn.appendChild(caret);
        var dot = el('span', 'bk-user-dot');
        btn.appendChild(dot);
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
        S.dot = dot;
        return slot;
    }

    function row(tag, iconName, label, opts) {
        opts = opts || {};
        var r = el(tag, 'bk-menu-row');
        if (tag === 'a') {
            r.href = opts.href || '#';
            if (opts.external) { r.target = '_blank'; r.rel = 'noopener'; }
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

        /* --- Tìm kiếm nhanh (chỉ trang có ô tìm kiếm) --- */
        if (typeof global.debouncedSearch === 'function') {
            var search = el('div', 'bk-menu-search');
            search.appendChild(icon('fa-magnifying-glass'));
            var input = D.createElement('input');
            input.type = 'search';
            input.id = 'bkMenuSearch';
            input.placeholder = 'Tìm môn, KTTX, GK1…';
            input.setAttribute('aria-label', 'Tìm kiếm nhanh');
            input.addEventListener('input', function () {
                if (typeof global.debouncedSearch === 'function') global.debouncedSearch(input.value);
            });
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    closeMenu();
                    var section = D.getElementById('searchResultsSection');
                    if (section && section.scrollIntoView) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            search.appendChild(input);
            menu.appendChild(search);
        }

        /* --- A (tiếp). Hồ sơ --- */
        menu.appendChild(row('a', 'fa-id-card', 'Hồ sơ cá nhân', {
            href: S.base + 'profile/', role: 'menuitem',
            onClick: function () { closeMenu(); }
        }));

        /* --- Chat: phòng chung, tin nhắn riêng, nhóm nhỏ --- */
        menu.appendChild(row('a', 'fa-comments', 'Chat', {
            href: S.base + 'chat/', role: 'menuitem',
            onClick: function () { closeMenu(); }
        }));

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

    function paintProfileBits() {
        if (!S.btn) return;
        var old = S.btn.querySelector('.bk-avatar');
        if (old) {
            var fresh = avatarNode(34);
            S.btn.replaceChild(fresh, old);
        }
        if (S.nameEl) S.nameEl.textContent = displayName();
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
        var width = 320;
        var left = Math.min(vw - width - 8, Math.max(8, r.right - width));
        S.menu.style.left = left + 'px';
        var top = r.bottom + 8;
        var estimated = S.menu.offsetHeight || 380;
        if (top + estimated > vh - 8) {
            top = Math.max(8, r.top - estimated - 8);
        }
        S.menu.style.top = top + 'px';
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
        var first = S.menu.querySelector('.bk-menu-row, .bk-menu-search input');
        if (first && first.focus) {
            try { first.focus({ preventScroll: true }); } catch (e) { }
        }
        D.addEventListener('keydown', onKey, true);
        D.addEventListener('click', onDocClick, true);
        global.addEventListener('resize', placeMenu);
        global.addEventListener('scroll', placeMenu, true);
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
        global.removeEventListener('scroll', placeMenu, true);
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
            ((global.BAKHI_VERSION && global.BAKHI_VERSION.app) || '3.7.0');
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
        hookSearch();
        paintProfileBits();
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
