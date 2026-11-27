/* =========================================================================
   Bá Khí — bk-rebirth.js  ·  App Shell "Quiet Graphite"
   -------------------------------------------------------------------------
   Nạp sau bk-shell.js trên mọi trang. Chịu trách nhiệm:
   - Dựng lại khung điều hướng: rail (desktop), top bar, bottom tab (mobile),
     sheet "Thêm", footer dùng chung, skip link.
   - Di chuyển avatar + chuông hiện có vào top bar (không tạo chuông mới).
   - Một MotionEngine: một scroll listener passive + một rAF, reveal-once,
     thanh tiến độ đọc, parallax nhẹ cho khối chào Trang chủ.
   - Giảm chuyển động hai tầng: OS (matchMedia) + lựa chọn cục bộ
     `bk.ui.motion` (auto | reduced | full). Chỉ lưu client-side.

   Không thay đổi dữ liệu, Supabase, auth, route hay nội dung học tập.
   Công khai: window.BKRebirth
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKRebirth && global.BKRebirth.__ready) return;

    var MOTION_KEY = 'bk.ui.motion';
    var NAV_KEY = 'bk.ui.nav';
    var html = D.documentElement;

    var S = {
        base: './',
        page: 'home',
        nav: null,
        chrome: null,
        footer: null,
        tabbar: null,
        sheet: null,
        rail: null,
        progress: null,
        lastFocus: null,
        scrollRaf: 0,
        scrollY: 0,
        activeScrub: [],
        revealObserver: null,
        unreadTimer: 0
    };

    /* ---------------------------------------------------------------------
       Tiện ích
       ------------------------------------------------------------------ */
    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function icon(name, cls) {
        var i = D.createElement('i');
        i.className = 'fa-solid ' + name + (cls ? ' ' + cls : '');
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function ssGet(k) { try { return global.sessionStorage.getItem(k); } catch (e) { return null; } }
    function basePath() {
        var scripts = D.scripts || [];
        var mark = 'assets/bakhi/bk-rebirth.js';
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            var at = src.indexOf(mark);
            if (at >= 0) return src.slice(0, at) || './';
        }
        return './';
    }
    function pathKey() {
        var p = '';
        try { p = String(global.location.pathname || ''); } catch (e) { p = ''; }
        var base = S.base;
        if (base && base !== './' && p.indexOf(base) === 0) p = p.slice(base.length);
        p = p.replace(/^\/+/, '').replace(/index\.html?$/i, '');
        var seg = p.split('/')[0] || '';
        if (!seg) return 'home';
        if (seg === 'ktck1' || seg === 'ktck2' || seg === 'ktgk1' || seg === 'ktgk2' ||
            seg === 'kttx' || seg === 'kttx' || seg === 'images' || seg === 'ktck' || seg === 'ktgk') return 'learn';
        return seg;
    }

    /* ---------------------------------------------------------------------
       Chuyển động — áp dụng trước khi vẽ lại khung
       ------------------------------------------------------------------ */
    function motionPref() {
        var v = lsGet(MOTION_KEY);
        return v === 'reduced' || v === 'full' ? v : 'auto';
    }
    function applyMotion(pref) {
        var p = pref || motionPref();
        if (p === 'auto') html.removeAttribute('data-motion');
        else html.setAttribute('data-motion', p);
        var reduced = p === 'reduced' ||
            (p === 'auto' && global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        html.classList.toggle('bk-motion-reduced', !!reduced);
        return reduced;
    }
    function setMotion(pref) {
        var p = pref === 'reduced' || pref === 'full' ? pref : 'auto';
        lsSet(MOTION_KEY, p);
        applyMotion(p);
        paintMotionButtons();
        return p;
    }
    function isReduced() {
        if (html.getAttribute('data-motion') === 'reduced') return true;
        if (html.getAttribute('data-motion') === 'full') return false;
        return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /* ---------------------------------------------------------------------
       Điều hướng
       ------------------------------------------------------------------ */
    var PAGES = {
        home: { label: 'Trang chủ', icon: 'fa-house', href: '', group: 'Học' },
        gamification: { label: 'Tiến trình', icon: 'fa-chart-simple', href: 'gamification/', group: 'Học' },
        skills: { label: 'Kỹ năng', icon: 'fa-sitemap', href: 'skills/', group: 'Học' },
        'ai-tutor': { label: 'Trợ lý AI', icon: 'fa-wand-magic-sparkles', href: 'ai-tutor/', group: 'Công cụ' },
        chat: { label: 'Chat', icon: 'fa-comments', href: 'chat/', group: 'Công cụ' },
        studio: { label: 'Studio', icon: 'fa-pen-ruler', href: 'studio/', group: 'Công cụ' },
        profile: { label: 'Hồ sơ', icon: 'fa-id-card', href: 'profile/', group: 'Tài khoản' },
        settings: { label: 'Cài đặt', icon: 'fa-gear', href: 'settings/', group: 'Tài khoản' },
        founder: { label: 'Founder', icon: 'fa-crown', href: 'founder/', group: 'Quản trị' },
        admin: { label: 'Quản trị', icon: 'fa-shield-halved', href: 'admin/', group: 'Quản trị' },
        legal: { label: 'Pháp lý', icon: 'fa-scale-balanced', href: 'legal/', group: 'Tài khoản' }
    };

    function pageLabel() {
        if (S.page === 'learn') {
            var h = D.querySelector('main h1');
            return (h && h.textContent.trim()) || 'Học tập';
        }
        if (S.page === 'legal') {
            var lh = D.querySelector('main h1');
            return (lh && lh.textContent.trim()) || 'Pháp lý';
        }
        return (PAGES[S.page] && PAGES[S.page].label) || 'Bá Khí';
    }
    function adminAllowed() {
        if (S.page === 'founder' || S.page === 'admin') return true;
        try {
            var raw = ssGet('bakhiAdmin.v1');
            if (raw) {
                var s = JSON.parse(raw);
                if (s && s.token) return true;
            }
        } catch (e) { }
        return !!(lsGet('devToken') || lsGet('bkAdminAccess'));
    }
    function navGroups() {
        var groups = ['Học', 'Công cụ', 'Tài khoản'];
        var out = [];
        groups.forEach(function (g) {
            var items = [];
            Object.keys(PAGES).forEach(function (key) {
                var p = PAGES[key];
                if (p.group !== g) return;
                if (key === 'legal') return;
                items.push({ key: key, label: p.label, icon: p.icon, href: p.href });
            });
            if (items.length) out.push({ name: g, items: items });
        });
        if (adminAllowed()) {
            var admin = [];
            admin.push({ key: 'founder', label: 'Founder', icon: 'fa-crown', href: 'founder/' });
            admin.push({ key: 'admin', label: 'Quản trị', icon: 'fa-shield-halved', href: 'admin/' });
            out.push({ name: 'Quản trị', items: admin });
        }
        return out;
    }

    /* ---------------------------------------------------------------------
       Rail
       ------------------------------------------------------------------ */
    function buildRail() {
        var aside = el('aside', 'bk-rail');
        aside.setAttribute('aria-label', 'Điều hướng chính');
        aside.id = 'bkRail';

        var head = el('div', 'bk-rail-head');
        var brand = el('a', 'bk-rail-brand');
        brand.href = S.base;
        var mark = el('span', 'bk-rail-mark');
        mark.appendChild(icon('fa-folder-tree'));
        brand.appendChild(mark);
        brand.appendChild(el('span', 'bk-rail-word', 'Bá Khí'));
        head.appendChild(brand);

        var toggle = el('button', 'bk-rail-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Mở rộng điều hướng');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.appendChild(icon('fa-chevron-right'));
        toggle.addEventListener('click', function () { setRailExpanded(!isRailExpanded()); });
        head.appendChild(toggle);
        aside.appendChild(head);

        var nav = el('nav', 'bk-rail-nav');
        navGroups().forEach(function (group) {
            var box = el('div', 'bk-rail-group');
            box.appendChild(el('p', 'bk-rail-eyebrow', group.name));
            group.items.forEach(function (item) {
                box.appendChild(railLink(item));
            });
            nav.appendChild(box);
        });
        aside.appendChild(nav);

        var foot = el('div', 'bk-rail-foot');
        var legal = { key: 'legal', label: 'Pháp lý', icon: 'fa-scale-balanced', href: 'legal/' };
        foot.appendChild(railLink(legal));
        var themeBtn = el('button', 'bk-rail-link');
        themeBtn.type = 'button';
        themeBtn.appendChild(icon('fa-circle-half-stroke'));
        themeBtn.appendChild(el('span', null, 'Giao diện'));
        themeBtn.setAttribute('data-tip', 'Đổi giao diện sáng/tối');
        themeBtn.addEventListener('click', toggleTheme);
        foot.appendChild(themeBtn);
        aside.appendChild(foot);

        return aside;
    }
    function railLink(item) {
        var a = el('a', 'bk-rail-link');
        a.href = S.base + item.href;
        a.setAttribute('data-tip', item.label);
        a.appendChild(icon(item.icon));
        a.appendChild(el('span', null, item.label));
        if (item.key === S.page) a.setAttribute('aria-current', 'page');
        if (item.key === 'chat') {
            var badge = el('span', 'bk-rail-badge');
            badge.hidden = true;
            badge.setAttribute('aria-label', 'Tin nhắn chưa đọc');
            badge.id = 'bkRailChatBadge';
            a.appendChild(badge);
        }
        a.addEventListener('click', function () {
            try { lsSet(NAV_KEY, isRailExpanded() ? 'expanded' : 'rail'); } catch (e) { }
        });
        return a;
    }
    function isRailExpanded() {
        return !!S.rail && S.rail.classList.contains('is-expanded');
    }
    function setRailExpanded(on) {
        if (!S.rail) return;
        S.rail.classList.toggle('is-expanded', !!on);
        D.body.classList.toggle('bk-rail-expanded', !!on);
        lsSet(NAV_KEY, on ? 'expanded' : 'rail');
        var btn = S.rail.querySelector('.bk-rail-toggle');
        if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }

    /* ---------------------------------------------------------------------
       Top bar
       ------------------------------------------------------------------ */
    function buildChrome() {
        var bar = el('header', 'bk-chrome');
        bar.setAttribute('role', 'banner');

        var left = el('div', 'bk-chrome-left');
        var menuBtn = el('button', 'bk-chrome-btn bk-chrome-menu');
        menuBtn.type = 'button';
        menuBtn.setAttribute('aria-label', 'Mở menu điều hướng');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.appendChild(icon('fa-bars'));
        menuBtn.addEventListener('click', openSheet);
        left.appendChild(menuBtn);

        var crumbs = el('nav', 'bk-crumbs');
        crumbs.setAttribute('aria-label', 'Breadcrumb');
        var home = el('a', null, 'Bá Khí');
        home.href = S.base;
        crumbs.appendChild(home);
        crumbs.appendChild(el('span', 'sep', '/'));
        var current = el('span', null, pageLabel());
        current.setAttribute('aria-current', 'page');
        crumbs.appendChild(current);
        left.appendChild(crumbs);
        left.appendChild(el('span', 'bk-chrome-title', pageLabel()));
        bar.appendChild(left);

        var right = el('div', 'bk-chrome-right');
        if (global.BKLearn && typeof global.BKLearn.openPalette === 'function') {
            var search = el('button', 'bk-chrome-kbd');
            search.type = 'button';
            search.setAttribute('aria-label', 'Tìm kiếm toàn bộ (Ctrl K)');
            search.appendChild(icon('fa-magnifying-glass'));
            search.appendChild(el('span', null, 'Tìm kiếm'));
            search.appendChild(el('kbd', null, 'Ctrl K'));
            search.addEventListener('click', function () {
                try { global.BKLearn.openPalette(); } catch (e) { }
            });
            right.appendChild(search);
        }

        var bellSlot = el('div', 'bk-chrome-slot');
        bellSlot.setAttribute('data-slot', 'bell');
        right.appendChild(bellSlot);

        var userSlot = el('div', 'bk-chrome-slot');
        userSlot.setAttribute('data-slot', 'user');
        right.appendChild(userSlot);
        bar.appendChild(right);

        return bar;
    }

    function adoptChromeBits() {
        if (!S.chrome) return;
        var bellSlot = S.chrome.querySelector('[data-slot="bell"]');
        var userSlot = S.chrome.querySelector('[data-slot="user"]');
        var bell = D.getElementById('bkcBell');
        if (bell && bellSlot && bell.parentNode !== bellSlot) {
            bellSlot.appendChild(bell);
        }
        var user = D.querySelector('.bk-user-slot') || D.getElementById('bkUserBtn');
        if (user && userSlot) {
            var node = user.classList && user.classList.contains('bk-user-slot') ? user : (user.closest ? user.closest('.bk-user-slot') : null);
            if (node && node.parentNode !== userSlot) userSlot.appendChild(node);
        }
    }

    /* ---------------------------------------------------------------------
       Bottom tabs + sheet "Thêm"
       ------------------------------------------------------------------ */
    function tabLink(item) {
        var a = el('a', 'bk-tab');
        a.href = S.base + item.href;
        a.appendChild(icon(item.icon));
        a.appendChild(el('span', null, item.label));
        if (item.key === S.page) a.setAttribute('aria-current', 'page');
        return a;
    }
    function buildTabbar() {
        var nav = el('nav', 'bk-tabbar');
        nav.setAttribute('aria-label', 'Điều hướng nhanh');
        nav.appendChild(tabLink({ key: 'home', label: 'Trang chủ', icon: 'fa-house', href: '' }));
        nav.appendChild(tabLink({ key: 'gamification', label: 'Tiến trình', icon: 'fa-chart-simple', href: 'gamification/' }));
        nav.appendChild(tabLink({ key: 'chat', label: 'Chat', icon: 'fa-comments', href: 'chat/' }));
        nav.appendChild(tabLink({ key: 'ai-tutor', label: 'Trợ lý AI', icon: 'fa-wand-magic-sparkles', href: 'ai-tutor/' }));

        var more = el('button', 'bk-tab');
        more.type = 'button';
        more.setAttribute('aria-haspopup', 'dialog');
        more.setAttribute('aria-expanded', 'false');
        more.appendChild(icon('fa-ellipsis'));
        more.appendChild(el('span', null, 'Thêm'));
        more.addEventListener('click', openSheet);
        nav.appendChild(more);
        return nav;
    }
    function buildSheet() {
        var sheet = el('div', 'bk-sheet');
        sheet.id = 'bkMoreSheet';
        sheet.hidden = true;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-label', 'Thêm điều hướng');

        var back = el('div', 'bk-sheet-backdrop');
        back.addEventListener('click', closeSheet);
        sheet.appendChild(back);

        var panel = el('div', 'bk-sheet-panel');
        panel.appendChild(el('div', 'bk-sheet-grip'));
        panel.appendChild(el('p', 'bk-sheet-title', 'Điều hướng'));

        var grid = el('div', 'bk-sheet-grid');
        ['profile', 'skills', 'studio', 'settings'].forEach(function (key) {
            var p = PAGES[key];
            var a = el('a', 'bk-sheet-item');
            a.href = S.base + p.href;
            a.appendChild(icon(p.icon));
            a.appendChild(el('span', null, p.label));
            if (key === S.page) a.setAttribute('aria-current', 'page');
            grid.appendChild(a);
        });
        if (adminAllowed()) {
            ['founder', 'admin'].forEach(function (key) {
                var p = PAGES[key];
                var a = el('a', 'bk-sheet-item');
                a.href = S.base + p.href;
                a.appendChild(icon(p.icon));
                a.appendChild(el('span', null, p.label));
                grid.appendChild(a);
            });
        }
        panel.appendChild(grid);

        panel.appendChild(el('p', 'bk-sheet-title', 'Giao diện & chuyển động'));
        var motion = el('div', 'bk-motion-panel');
        motion.appendChild(el('h3', null, 'Giảm chuyển động'));
        motion.appendChild(el('p', null, 'Tự động theo hệ thống, bật hoặc tắt. Chỉ lưu trên thiết bị này.'));
        motion.appendChild(motionSeg());
        panel.appendChild(motion);

        panel.appendChild(el('p', 'bk-sheet-title', 'Pháp lý'));
        var legal = el('div', 'bk-sheet-grid');
        [['terms', 'Điều khoản dịch vụ', 'fa-file-contract'], ['privacy', 'Chính sách quyền riêng tư', 'fa-user-shield']].forEach(function (row) {
            var a = el('a', 'bk-sheet-item');
            a.href = S.base + 'legal/' + row[0] + '.html';
            a.appendChild(icon(row[2]));
            a.appendChild(el('span', null, row[1]));
            legal.appendChild(a);
        });
        panel.appendChild(legal);

        var close = el('button', 'bk-sheet-close', 'Đóng');
        close.type = 'button';
        close.addEventListener('click', closeSheet);
        panel.appendChild(close);
        sheet.appendChild(panel);
        return sheet;
    }
    function motionSeg() {
        var seg = el('div', 'bk-seg');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Mức chuyển động');
        [['auto', 'Tự động'], ['full', 'Đầy đủ'], ['reduced', 'Giảm']].forEach(function (row) {
            var b = el('button', null, row[1]);
            b.type = 'button';
            b.setAttribute('data-motion-pref', row[0]);
            b.setAttribute('aria-pressed', motionPref() === row[0] ? 'true' : 'false');
            b.addEventListener('click', function () { setMotion(row[0]); });
            seg.appendChild(b);
        });
        return seg;
    }
    function paintMotionButtons() {
        var pref = motionPref();
        var all = D.querySelectorAll('[data-motion-pref]');
        for (var i = 0; i < all.length; i++) {
            all[i].setAttribute('aria-pressed', all[i].getAttribute('data-motion-pref') === pref ? 'true' : 'false');
        }
    }
    function openSheet() {
        if (!S.sheet) return;
        S.lastFocus = D.activeElement;
        S.sheet.hidden = false;
        // Cho trình duyệt một nhịp để transition chạy.
        global.requestAnimationFrame(function () { S.sheet.classList.add('is-open'); });
        D.body.style.overflow = 'hidden';
        var menuBtn = S.chrome && S.chrome.querySelector('.bk-chrome-menu');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
        var tabMore = S.tabbar && S.tabbar.lastElementChild;
        if (tabMore) tabMore.setAttribute('aria-expanded', 'true');
        var first = S.sheet.querySelector('.bk-sheet-item, button');
        if (first && first.focus) { try { first.focus({ preventScroll: true }); } catch (e) { } }
        D.addEventListener('keydown', onSheetKey, true);
    }
    function closeSheet() {
        if (!S.sheet) return;
        S.sheet.classList.remove('is-open');
        D.body.style.overflow = '';
        var menuBtn = S.chrome && S.chrome.querySelector('.bk-chrome-menu');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
        var tabMore = S.tabbar && S.tabbar.lastElementChild;
        if (tabMore) tabMore.setAttribute('aria-expanded', 'false');
        D.removeEventListener('keydown', onSheetKey, true);
        var done = function () { if (S.sheet) S.sheet.hidden = true; };
        if (isReduced()) done(); else global.setTimeout(done, 240);
        if (S.lastFocus && S.lastFocus.focus) { try { S.lastFocus.focus({ preventScroll: true }); } catch (e) { } }
    }
    function onSheetKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
        if (e.key !== 'Tab' || !S.sheet) return;
        var nodes = S.sheet.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        var first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && D.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && D.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    /* ---------------------------------------------------------------------
       Footer dùng chung — nguồn duy nhất cho liên kết pháp lý
       ------------------------------------------------------------------ */
    function buildFooter() {
        var f = el('footer', 'bk-footer');
        f.setAttribute('role', 'contentinfo');
        var inner = el('div', 'bk-footer-inner');

        var brandCol = el('div');
        var brand = el('div', 'bk-footer-brand');
        var mark = el('span', 'bk-footer-mark');
        mark.appendChild(icon('fa-folder-tree'));
        brand.appendChild(mark);
        brand.appendChild(el('span', null, 'Bá Khí'));
        brandCol.appendChild(brand);
        brandCol.appendChild(el('p', null, 'Không gian học tập yên tĩnh: tài liệu ôn tập, tiến trình và trợ lý AI trong một hệ thống.'));
        var meta = el('p', 'bk-footer-version');
        var v = global.BAKHI_VERSION;
        if (v && v.label) {
            var code = el('code', 'bk-mono', v.label);
            meta.appendChild(code);
            meta.appendChild(D.createTextNode(' · ' + (v.school || 'Bá Khí')));
        } else {
            meta.appendChild(D.createTextNode('Bá Khí'));
        }
        brandCol.appendChild(meta);
        inner.appendChild(brandCol);

        inner.appendChild(footerCol('Sản phẩm', [
            ['Trang chủ', S.base],
            ['Tiến trình', S.base + 'gamification/'],
            ['Trợ lý AI', S.base + 'ai-tutor/'],
            ['Chat', S.base + 'chat/'],
            ['Studio', S.base + 'studio/']
        ]));
        inner.appendChild(footerCol('Pháp lý & tài khoản', [
            ['Điều khoản dịch vụ', S.base + 'legal/terms.html'],
            ['Chính sách quyền riêng tư', S.base + 'legal/privacy.html'],
            ['Hồ sơ', S.base + 'profile/'],
            ['Cài đặt', S.base + 'settings/'],
            ['CHANGELOG.md', S.base + 'CHANGELOG.md'],
            ['GitHub', 'https://github.com/MinhTruk/bakhi']
        ]));
        f.appendChild(inner);

        var bottom = el('div', 'bk-footer-meta');
        bottom.appendChild(el('span', null, '© ' + new Date().getFullYear() + ' Bá Khí · Học tập có trách nhiệm.'));
        var note = el('span');
        note.appendChild(el('span', null, 'Giao diện Quiet Graphite · '));
        var link = el('a', null, 'Báo lỗi');
        link.href = 'https://github.com/MinhTruk/bakhi/issues';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        note.appendChild(link);
        bottom.appendChild(note);
        f.appendChild(bottom);
        return f;
    }
    function footerCol(title, links) {
        var col = el('div');
        col.appendChild(el('h2', null, title));
        var ul = el('ul');
        links.forEach(function (row) {
            var li = el('li');
            var a = el('a', null, row[0]);
            a.href = row[1];
            if (/^https?:/.test(row[1])) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            li.appendChild(a);
            ul.appendChild(li);
        });
        col.appendChild(ul);
        return col;
    }

    /* ---------------------------------------------------------------------
       MotionEngine — một listener, một rAF
       ------------------------------------------------------------------ */
    function setupMotion() {
        // Reveal-once: chỉ gắn class sau khi JS sẵn sàng → không ẩn nội dung khi JS lỗi.
        var candidates = D.querySelectorAll('[data-reveal]');
        if (!candidates.length) return;
        if (!('IntersectionObserver' in global) || isReduced()) {
            for (var i = 0; i < candidates.length; i++) candidates[i].classList.add('is-visible');
            return;
        }
        S.revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                S.revealObserver.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        for (var j = 0; j < candidates.length; j++) {
            var node = candidates[j];
            node.classList.add('bk-reveal');
            var idx = Number(node.getAttribute('data-reveal'));
            if (idx > 0) node.style.setProperty('--rb-i', String(Math.min(idx, 5)));
            S.revealObserver.observe(node);
        }
    }

    function setupScroll() {
        var hero = D.querySelector('[data-bk-parallax]');
        var progressHost = D.querySelector('[data-bk-progress]');
        if (progressHost) {
            S.progress = el('div', 'bk-progress');
            S.progress.setAttribute('aria-hidden', 'true');
            D.body.appendChild(S.progress);
        }
        function frame() {
            S.scrollRaf = 0;
            var y = global.pageYOffset || html.scrollTop || 0;
            S.scrollY = y;
            D.body.classList.toggle('is-scrolled', y > 8);

            if (S.progress) {
                var doc = D.documentElement;
                var max = Math.max(1, doc.scrollHeight - global.innerHeight);
                var p = Math.min(1, Math.max(0, y / max));
                S.progress.style.transform = 'scaleX(' + p.toFixed(4) + ')';
            }
            if (hero && !isReduced()) {
                var vh = global.innerHeight || 720;
                if (y < vh * 1.2) {
                    var t = Math.min(1, y / (vh * 0.9));
                    hero.style.setProperty('--rb-t', t.toFixed(3));
                }
            }
        }
        function onScroll() {
            if (S.scrollRaf) return;
            S.scrollRaf = global.requestAnimationFrame(frame);
        }
        global.addEventListener('scroll', onScroll, { passive: true });
        global.addEventListener('resize', onScroll, { passive: true });
        frame();
    }

    /* ---------------------------------------------------------------------
       Chat unread → badge rail/tab
       ------------------------------------------------------------------ */
    function paintUnread() {
        var n = 0;
        try {
            var c = global.BKCloud && global.BKCloud.chatUnread;
            n = Number(typeof c === 'function' ? c() : c) || 0;
        } catch (e) { n = 0; }
        var rail = D.getElementById('bkRailChatBadge');
        if (rail) {
            rail.hidden = !n;
            rail.textContent = n > 9 ? '9+' : String(n || '');
        }
    }
    function startUnread() {
        paintUnread();
        S.unreadTimer = global.setInterval(function () {
            if (D.hidden) return;
            paintUnread();
        }, 20000);
        D.addEventListener('visibilitychange', function () { if (!D.hidden) paintUnread(); });
    }

    /* ---------------------------------------------------------------------
       Cài đặt: thêm nhóm "Chuyển động" (chỉ cục bộ)
       ------------------------------------------------------------------ */
    function mountMotionSetting() {
        if (S.page !== 'settings') return;
        var root = D.getElementById('bkSettingsPanels');
        if (!root) return;
        var tryMount = function () {
            if (D.getElementById('bkMotionSetting')) return true;
            if (!root.children.length) return false;
            var panel = el('section', 'bk-motion-panel');
            panel.id = 'bkMotionSetting';
            panel.appendChild(el('h3', null, 'Chuyển động'));
            panel.appendChild(el('p', null, 'Điều khiển hiệu ứng chuyển trang, reveal và parallax. Lựa chọn chỉ lưu trên thiết bị này, không ghi vào tài khoản.'));
            panel.appendChild(motionSeg());
            root.appendChild(panel);
            return true;
        };
        if (tryMount()) return;
        var obs = new MutationObserver(function () { if (tryMount()) obs.disconnect(); });
        obs.observe(root, { childList: true, subtree: true });
        global.setTimeout(function () { tryMount(); }, 2500);
    }

    /* ---------------------------------------------------------------------
       Gắn vào trang
       ------------------------------------------------------------------ */
    function toggleTheme() {
        try {
            if (global.BKShell && typeof global.BKShell.toggleTheme === 'function') global.BKShell.toggleTheme();
            else if (global.BKThemeBoot) {
                var next = global.BKThemeBoot.current() === 'dark' ? 'light' : 'dark';
                global.BKThemeBoot.apply(next, true);
            } else if (typeof global.toggleDarkMode === 'function') global.toggleDarkMode(null);
        } catch (e) { }
    }

    /* Ẩn chrome cũ (header/footer trang) nhưng không đụng header của modal,
       dialog, appbar Studio hay hero trang pháp lý. */
    function hideLegacyChrome() {
        var nodes = D.querySelectorAll('header, footer');
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.classList.contains('bk-chrome') ||
                n.classList.contains('bk-footer') ||
                n.classList.contains('appbar') ||
                n.classList.contains('bk-legal-hero') ||
                n.hasAttribute('data-bk-keep')) continue;
            if (n.closest && n.closest('main, dialog, [role="dialog"], .bk-sheet, [id*="modal"], [class*="modal"], [class*="bkc-"], .bkadm, .bkchat, .bkai')) continue;
            n.classList.add('bk-hide-legacy');
        }
    }

    /* Hình nền tùy chỉnh vẫn hoạt động: chỉ hiện khi #bgImage thực sự có ảnh. */
    function watchWallpaper() {
        var bg = D.getElementById('bgImage');
        if (!bg) return;
        var sync = function () {
            var v = bg.style.backgroundImage || '';
            var has = !!v && v !== 'none' && v.indexOf('url(') === 0;
            D.body.classList.toggle('bk-has-wallpaper', has);
        };
        sync();
        if ('MutationObserver' in global) {
            new MutationObserver(sync).observe(bg, { attributes: true, attributeFilter: ['style'] });
        }
        global.setTimeout(sync, 1200);
        global.setTimeout(sync, 3000);
    }

    /* ---------------------------------------------------------------------
       Nâng cấp tương tác trên nội dung có sẵn (không đổi logic gốc)
       ------------------------------------------------------------------ */
    function openFolder(id) {
        var folder = D.getElementById(id);
        if (!folder) return;
        var head = folder.previousElementSibling;
        if (head && head.classList.contains('folder-header') && !folder.classList.contains('open')) {
            head.click();
        }
        var top = folder.getBoundingClientRect().top + (global.pageYOffset || 0) - (S.chrome ? 76 : 16);
        try { global.scrollTo({ top: top, behavior: isReduced() ? 'auto' : 'smooth' }); }
        catch (e) { global.scrollTo(0, top); }
        if (head && head.focus) { try { head.focus({ preventScroll: true }); } catch (e) { } }
    }

    function enhancePage() {
        var v = global.BAKHI_VERSION && (global.BAKHI_VERSION.label || ('v' + global.BAKHI_VERSION.app));
        if (v) {
            var nodes = D.querySelectorAll('[data-bk-version]');
            for (var i = 0; i < nodes.length; i++) nodes[i].textContent = v;
        }
        D.addEventListener('click', function (e) {
            var t = e.target && e.target.closest ? e.target.closest('[data-bk-jump], [data-bk-action]') : null;
            if (!t) return;
            var jump = t.getAttribute('data-bk-jump');
            if (jump) { e.preventDefault(); openFolder(jump); return; }
            if (t.getAttribute('data-bk-action') === 'palette') {
                e.preventDefault();
                try {
                    if (global.BKLearn && typeof global.BKLearn.openPalette === 'function') global.BKLearn.openPalette();
                } catch (err) { }
            }
        });
    }

    function mount() {
        S.base = basePath();
        S.page = pathKey();
        D.body.classList.add('bk-rebirth');
        D.body.setAttribute('data-bk-page', S.page);
        html.classList.add('bk-rebirth-html');

        var main = D.querySelector('main');
        if (main && !main.id) main.id = 'bkMain';

        hideLegacyChrome();
        watchWallpaper();

        // Studio / Founder / Admin là bề mặt workspace có chrome riêng:
        // chỉ áp token + typography, không chèn rail/topbar/footer để không phá bố cục.
        var workspace = S.page === 'founder' || S.page === 'admin' || S.page === 'studio';

        var skip = el('a', 'bk-skip', 'Bỏ qua điều hướng');
        skip.href = '#' + ((main && main.id) || 'bkMain');
        D.body.insertBefore(skip, D.body.firstChild);

        if (!workspace) {
            S.rail = buildRail();
            D.body.appendChild(S.rail);
            var saved = lsGet(NAV_KEY);
            setRailExpanded(saved === 'expanded');

            S.chrome = buildChrome();
            D.body.insertBefore(S.chrome, skip.nextSibling);

            S.tabbar = buildTabbar();
            D.body.appendChild(S.tabbar);
            S.sheet = buildSheet();
            D.body.appendChild(S.sheet);

            adoptChromeBits();
            if ('MutationObserver' in global) {
                var mo = new MutationObserver(function () { adoptChromeBits(); });
                mo.observe(D.body, { childList: true, subtree: true });
                global.setTimeout(function () { mo.disconnect(); adoptChromeBits(); }, 6000);
            }
        }

        if (main && !workspace) {
            S.footer = buildFooter();
            if (main.parentNode) main.parentNode.insertBefore(S.footer, main.nextSibling);
            else D.body.appendChild(S.footer);
        }

        D.body.classList.add('bk-page-enter');
        setupMotion();
        setupScroll();
        mountMotionSetting();
        enhancePage();
        if (!workspace) startUnread();

        global.BKRebirth = {
            __ready: true,
            version: (global.BAKHI_VERSION && global.BAKHI_VERSION.app) || '',
            page: S.page,
            base: S.base,
            setMotion: setMotion,
            motion: motionPref,
            refreshChrome: adoptChromeBits,
            openSheet: openSheet,
            closeSheet: closeSheet
        };
    }

    // Áp dụng chuyển động ngay khi script chạy (trước DOMContentLoaded).
    applyMotion();

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();

    // OS đổi thiết lập reduced-motion khi trang đang mở.
    try {
        var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
        var onMq = function () { applyMotion(); };
        if (mq.addEventListener) mq.addEventListener('change', onMq);
        else if (mq.addListener) mq.addListener(onMq);
    } catch (e) { }
})(typeof window !== 'undefined' ? window : this);
