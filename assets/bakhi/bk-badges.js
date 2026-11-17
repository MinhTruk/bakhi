/* =========================================================================
   Bá Khí — bk-badges.js
   Hệ thống thành tích 99 badge (74 tự động + 25 chỉ được trao tay).
   25 badge trao tay = 2 Administrator + 2 Developer + 11 Founder cũ + 10
   Founder Badge 7.5.0 (có hình tượng SVG riêng qua BK.badges.art).

   - Dữ liệu badge là data-driven: mỗi badge có điều kiện đọc từ chỉ số cục bộ.
   - Tiến độ và badge đã đạt lưu ở `bakhiBadges.v1` (có phiên bản + validate).
   - Không mở khóa trùng: mỗi id chỉ ghi một lần.
   - Hai badge Administrator-only KHÔNG có điều kiện tự động; chỉ nhận từ
     danh sách server trả về (BK.badges.applyGrants).

   Công khai: window.BK.badges
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    var BK = global.BK;
    if (!BK || !BK.badges) { /* cho phép nạp lại khi BK chưa có? vẫn cần BK */ }
    if (!BK) return;
    if (BK.badges && BK.badges.__ready) return;

    var KEY = 'bakhiBadges.v1';
    var SCHEMA = 1;

    /* Mỗi tài khoản học sinh có kho thành tích riêng để không trộn dữ liệu
       khi đổi học sinh. Chưa nhận diện → dùng kho chung cũ. */
    function storageKey() {
        try {
            var raw = global.localStorage.getItem('bakhiStudent.v1');
            var data = raw ? JSON.parse(raw) : null;
            if (data && data.studentId) return KEY + '.' + String(data.studentId);
        } catch (e) { }
        return KEY;
    }

    var CATEGORIES = [
        { id: 'learning', name: 'Học tập', icon: 'fa-graduation-cap', color: '#6366f1' },
        { id: 'exploration', name: 'Khám phá', icon: 'fa-compass', color: '#0ea5e9' },
        { id: 'consistency', name: 'Đều đặn', icon: 'fa-calendar-check', color: '#10b981' },
        { id: 'music', name: 'Âm nhạc', icon: 'fa-music', color: '#a855f7' },
        { id: 'interaction', name: 'Tương tác', icon: 'fa-hand-pointer', color: '#f59e0b' },
        { id: 'social', name: 'Hồ sơ', icon: 'fa-user-group', color: '#ec4899' },
        { id: 'studio', name: 'Sáng tạo', icon: 'fa-palette', color: '#14b8a6' },
        { id: 'secret', name: 'Bí mật', icon: 'fa-eye-slash', color: '#64748b' }
    ];

    var RARITIES = [
        { id: 'common', name: 'Phổ biến', color: '#94a3b8', weight: 1 },
        { id: 'uncommon', name: 'Ít gặp', color: '#22c55e', weight: 2 },
        { id: 'rare', name: 'Hiếm', color: '#0ea5e9', weight: 3 },
        { id: 'epic', name: 'Cực hiếm', color: '#a855f7', weight: 4 },
        { id: 'legendary', name: 'Huyền thoại', color: '#f59e0b', weight: 5 },
        { id: 'secret', name: 'Bí mật', color: '#64748b', weight: 6 }
    ];

    /* ---------------------------------------------------------------------
       Kho theo dõi (chỉ số riêng của hệ badge)
       ------------------------------------------------------------------ */
    function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function today() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function dayKeyOf(ts) {
        var d = new Date(ts);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function daysBetween(a, b) {
        return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
    }

    function emptyTrack() {
        return {
            v: SCHEMA,
            unlocked: {},          /* id -> timestamp */
            pages: {},             /* path -> lần đầu */
            days: {},              /* yyyy-mm-dd -> số hoạt động */
            streak: 0,
            maxStreak: 0,
            lastDay: '',
            tracks: {},            /* id bài hát -> số lượt nghe trọn */
            sameTrack: {},         /* id -> số lượt nghe trọn */
            counters: {},          /* sự kiện rời rạc: theme.toggles, search.used ... */
            granted: {},           /* id -> { by, at, reason } (badge admin trao) */
            updatedAt: 0
        };
    }

    function sanitize(raw) {
        var t = emptyTrack();
        if (!raw || typeof raw !== 'object') return t;
        if (raw.unlocked && typeof raw.unlocked === 'object') {
            Object.keys(raw.unlocked).slice(0, 200).forEach(function (k) {
                var v = Number(raw.unlocked[k]);
                if (isFinite(v) && v > 0) t.unlocked[String(k).slice(0, 64)] = v;
            });
        }
        ['pages', 'days', 'tracks', 'sameTrack', 'counters'].forEach(function (field) {
            var src = raw[field];
            if (!src || typeof src !== 'object') return;
            Object.keys(src).slice(0, 400).forEach(function (k) {
                var v = Number(src[k]);
                if (isFinite(v) && v >= 0) t[field][String(k).slice(0, 80)] = v;
            });
        });
        if (raw.granted && typeof raw.granted === 'object') {
            Object.keys(raw.granted).slice(0, 10).forEach(function (k) {
                var g = raw.granted[k] || {};
                t.granted[String(k).slice(0, 64)] = {
                    by: String(g.by || 'admin').slice(0, 60),
                    at: Number(g.at) || Date.now(),
                    reason: String(g.reason || '').slice(0, 200)
                };
            });
        }
        t.streak = Math.max(0, Math.min(100000, Number(raw.streak) || 0));
        t.maxStreak = Math.max(t.streak, Math.min(100000, Number(raw.maxStreak) || 0));
        t.lastDay = /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDay || '') ? raw.lastDay : '';
        t.updatedAt = Number(raw.updatedAt) || 0;
        return t;
    }

    var cache = null;
    function load() {
        if (cache) return cache;
        var raw = null;
        try { raw = JSON.parse(lsGet(storageKey()) || 'null'); } catch (e) { raw = null; }
        cache = sanitize(raw);
        return cache;
    }
    function save() {
        var t = load();
        t.updatedAt = Date.now();
        lsSet(storageKey(), JSON.stringify(t));
    }

    /* ---------------------------------------------------------------------
       Chỉ số đầu vào
       ------------------------------------------------------------------ */
    function store() {
        try { return BK.store.get(); } catch (e) { return BK.store.empty(); }
    }
    function signals() {
        try { return BK.signals.get(); } catch (e) { return {}; }
    }
    function profile() {
        try { return global.BKProfile ? global.BKProfile.get() : {}; } catch (e) { return {}; }
    }
    function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
    function pick(obj, path, dflt) {
        var parts = String(path).split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null || typeof cur !== 'object') return dflt || 0;
            cur = cur[parts[i]];
        }
        return cur == null ? (dflt || 0) : cur;
    }
    function uniqueLessons(s) {
        var set = {};
        (s.history || []).forEach(function (h) { if (h && h.url) set[h.url] = 1; });
        return Object.keys(set).length;
    }
    function uniqueSubjects(s) {
        var set = {};
        (s.history || []).forEach(function (h) { if (h && h.subject) set[h.subject] = 1; });
        return Object.keys(set).length;
    }
    function mastered(s) {
        return (s.review || []).filter(function (r) { return r && (r.mastered || r.status === 'mastered' || r.interval >= 21); }).length;
    }
    function lessonsInSubject(s, subject) {
        var set = {};
        (s.history || []).forEach(function (h) { if (h && h.subject === subject && h.url) set[h.url] = 1; });
        return Object.keys(set).length;
    }
    function distinctPages() { return Object.keys(load().pages).length; }
    function activeDays() { return Object.keys(load().days).length; }
    function counter(name) { return num(load().counters[name]); }
    function visited(fragment) {
        var pages = load().pages;
        return Object.keys(pages).some(function (p) {
            return p.indexOf(fragment) !== -1 || (pages[p] && p.split('/').indexOf(fragment.replace(/^\//, '')) !== -1);
        }) ? 1 : 0;
    }

    function metrics() {
        var s = store();
        var sig = signals();
        var p = profile();
        var t = load();
        var tracks = Object.keys(t.tracks).length;
        var sameMax = 0;
        Object.keys(t.sameTrack).forEach(function (k) { sameMax = Math.max(sameMax, num(t.sameTrack[k])); });
        return {
            lessons: uniqueLessons(s),
            subjects: uniqueSubjects(s),
            lessonsOneSubject: Math.max(
                lessonsInSubject(s, 'toan'), lessonsInSubject(s, 'ly'), lessonsInSubject(s, 'hoa'),
                lessonsInSubject(s, 'sinh'), lessonsInSubject(s, 'van'), lessonsInSubject(s, 'anh'),
                lessonsInSubject(s, 'su'), lessonsInSubject(s, 'tin'), lessonsInSubject(s, 'gdqp')
            ),
            practice: (s.practice || []).length,
            correct: num(pick(s, 'achievements.counters.correct')),
            review: (s.review || []).length,
            mastered: mastered(s),
            notes: (s.notes || []).length,
            bookmarks: (s.bookmarks || []).length,
            pages: distinctPages(),
            days: activeDays(),
            streak: num(t.maxStreak),
            musicPlays: num(pick(sig, 'music.plays')),
            musicTracks: tracks,
            sameTrack: sameMax,
            meteors: num(pick(sig, 'interaction.meteors')),
            palette: num(pick(sig, 'ui.palette')),
            studioDocs: num(pick(sig, 'studio.docs')),
            studioDrawings: num(pick(sig, 'studio.drawings')),
            studioInserts: num(pick(sig, 'studio.inserts')),
            studioExports: num(pick(sig, 'studio.exports')),
            studioWords: num(pick(sig, 'studio.words')),
            themeToggles: counter('theme.toggles'),
            searchUsed: counter('search.used'),
            focusUsed: counter('focus.used'),
            shuffleUsed: num(pick(sig, 'music.shuffle')),
            repeatUsed: num(pick(sig, 'music.repeat')),
            queueUsed: num(pick(sig, 'music.queue')),
            musicOpened: num(pick(sig, 'music.opened')),
            nightOwl: num(pick(sig, 'time.night')),
            earlyBird: num(pick(sig, 'time.early')),
            profileAvatar: p.avatar ? 1 : 0,
            profileBanner: p.banner ? 1 : 0,
            profileBio: p.bio ? 1 : 0,
            profileNickname: p.nickname ? 1 : 0,
            profileLinks: (p.links || []).length,
            profileFrame: (p.frame && p.frame !== 'none') ? 1 : 0,
            studioVisited: visited('studio'),
            settingsVisited: visited('settings'),
            profileVisited: visited('profile'),
            badgesViewed: counter('badges.viewed'),
            unlockedCount: Object.keys(t.unlocked).length
        };
    }

    /* ---------------------------------------------------------------------
       Danh mục 75 badge
       ------------------------------------------------------------------ */
    /* b(id, name, desc, icon, category, rarity, goal, metricKey, frame?) */
    function b(id, name, desc, icon, category, rarity, goal, key, frame) {
        return { id: id, name: name, desc: desc, icon: icon, category: category, rarity: rarity, goal: goal, key: key, frame: frame || null, adminOnly: false };
    }
    function admin(id, name, desc, icon) {
        return { id: id, name: name, desc: desc, icon: icon, category: 'secret', rarity: 'legendary', goal: 1, key: null, frame: id === 'admin-legend' ? 'crown' : 'star', adminOnly: true };
    }

    var CATALOG = [
        /* --- Học tập (14) --- */
        b('learn-first-lesson', 'Tri Thức Nhập Môn', 'Mở bài học đầu tiên.', 'fa-book-open', 'learning', 'common', 1, 'lessons', 'leaf'),
        b('learn-lessons-5', 'Ngũ Đường Khai Giác', 'Mở 5 bài học khác nhau.', 'fa-book', 'learning', 'common', 5, 'lessons'),
        b('learn-lessons-15', 'Thập Ngũ Kinh Hành', 'Mở 15 bài học khác nhau.', 'fa-book-open-reader', 'learning', 'uncommon', 15, 'lessons', 'celestial'),
        b('learn-lessons-30', 'Tam Thập Thông Tuệ', 'Mở 30 bài học khác nhau.', 'fa-graduation-cap', 'learning', 'rare', 30, 'lessons', 'wreath'),
        b('learn-subjects-3', 'Tam Môn Khai Kiến', 'Mở bài học ở 3 môn trở lên.', 'fa-layer-group', 'learning', 'uncommon', 3, 'subjects'),
        b('learn-subjects-5', 'Ngũ Môn Tinh Thông', 'Mở bài học ở 5 môn trở lên.', 'fa-shapes', 'learning', 'rare', 5, 'subjects', 'divine'),
        b('learn-first-answer', 'Sơ Chung Khải Ngộ', 'Hoàn thành lượt luyện đầu tiên.', 'fa-circle-question', 'learning', 'common', 1, 'practice'),
        b('learn-practice-25', 'Nhị Thập Ngũ Tâm Ấn', 'Hoàn thành 25 lượt luyện tập.', 'fa-dumbbell', 'learning', 'common', 25, 'practice'),
        b('learn-practice-100', 'Bách Luyện Thành Tài', 'Hoàn thành 100 lượt luyện tập.', 'fa-fire', 'learning', 'uncommon', 100, 'practice'),
        b('learn-practice-500', 'Ngũ Bách Tinh Anh', 'Hoàn thành 500 lượt luyện tập.', 'fa-bolt', 'learning', 'epic', 500, 'practice', 'royal'),
        b('learn-correct-15', 'Thập Ngũ Chính Niệm', 'Trả lời đúng 15 câu hỏi.', 'fa-circle-check', 'learning', 'common', 15, 'correct'),
        b('learn-correct-100', 'Bách Phát Bách Trúng', 'Trả lời đúng 100 câu hỏi.', 'fa-award', 'learning', 'rare', 100, 'correct', 'infernal'),
        b('learn-review-first', 'Hồi Quang Sơ Chiếu', 'Có câu hỏi đầu tiên trong danh sách ôn.', 'fa-rotate', 'learning', 'common', 1, 'review'),
        b('learn-mastered-10', 'Thập Câu Nhập Tâm', 'Đánh dấu thành thạo 10 câu từng sai.', 'fa-check-double', 'learning', 'rare', 10, 'mastered', 'legendary'),

        /* --- Khám phá (10) --- */
        b('explore-pages-5', 'Sơ Tẩu Trần Gian', 'Ghé 5 trang khác nhau của Bá Khí.', 'fa-shoe-prints', 'exploration', 'common', 5, 'pages'),
        b('explore-pages-20', 'Vạn Dặm Hành Vân', 'Ghé 20 trang khác nhau.', 'fa-route', 'exploration', 'uncommon', 20, 'pages'),
        b('explore-pages-50', 'Bá Khí Thiên Đồ', 'Ghé 50 trang khác nhau.', 'fa-map', 'exploration', 'epic', 50, 'pages', 'sakura'),
        b('explore-studio', 'Khai Môn Tạo Giới', 'Mở Bá Khí Studio.', 'fa-wand-magic-sparkles', 'exploration', 'common', 1, 'studioVisited'),
        b('explore-settings', 'Tĩnh Thất Kiến Tâm', 'Mở trang Cài đặt.', 'fa-gear', 'exploration', 'common', 1, 'settingsVisited'),
        b('explore-profile', 'Minh Kính Tự Chiếu', 'Mở trang Hồ sơ cá nhân.', 'fa-id-card', 'exploration', 'common', 1, 'profileVisited'),
        b('explore-palette', 'Chỉ Quyết Thần Hành', 'Mở bảng lệnh (Ctrl/⌘ + K).', 'fa-terminal', 'exploration', 'uncommon', 1, 'palette', 'ancient'),
        b('explore-search', 'Tầm Bảo Nhất Niệm', 'Dùng tìm kiếm ít nhất một lần.', 'fa-magnifying-glass', 'exploration', 'common', 1, 'searchUsed'),
        b('explore-theme', 'Âm Dương Chuyển Hóa', 'Chuyển giao diện sáng/tối.', 'fa-circle-half-stroke', 'exploration', 'common', 1, 'themeToggles'),
        b('explore-badges', 'Khải Huy Hiệu Tàng', 'Mở danh sách badge trong hồ sơ.', 'fa-medal', 'exploration', 'uncommon', 1, 'badgesViewed'),

        /* --- Đều đặn (8) --- */
        b('consist-days-2', 'Nhị Nhật Bất Thoái', 'Hoạt động trong 2 ngày khác nhau.', 'fa-calendar-day', 'consistency', 'common', 2, 'days'),
        b('consist-days-3', 'Tam Nhật Trường Cửu', 'Hoạt động trong 3 ngày khác nhau.', 'fa-calendar-days', 'consistency', 'common', 3, 'days'),
        b('consist-days-7', 'Thất Nhật Vô Han', 'Hoạt động trong 7 ngày khác nhau.', 'fa-calendar-week', 'consistency', 'uncommon', 7, 'days'),
        b('consist-days-14', 'Thập Tứ Nhật Định Tâm', 'Hoạt động trong 14 ngày khác nhau.', 'fa-calendar', 'consistency', 'rare', 14, 'days', 'eternal'),
        b('consist-days-30', 'Tam Thập Nhật Viên Mãn', 'Hoạt động trong 30 ngày khác nhau.', 'fa-calendar-plus', 'consistency', 'epic', 30, 'days', 'sunflower'),
        b('consist-streak-3', 'Liên Tam Chi Mạch', 'Học liên tiếp 3 ngày.', 'fa-link', 'consistency', 'uncommon', 3, 'streak'),
        b('consist-streak-7', 'Thất Tinh Liên Châu', 'Học liên tiếp 7 ngày.', 'fa-fire-flame-curved', 'consistency', 'rare', 7, 'streak'),
        b('consist-streak-30', 'Tam Thập Thiên Cương', 'Học liên tiếp 30 ngày.', 'fa-infinity', 'consistency', 'legendary', 30, 'streak', 'crown'),

        /* --- Âm nhạc (9) --- */
        b('music-first', 'Sơ Âm Khai Khiếu', 'Phát bài hát đầu tiên.', 'fa-music', 'music', 'common', 1, 'musicPlays'),
        b('music-10', 'Đồng Hành Hòa Khúc', 'Nghe trọn 10 lượt nhạc.', 'fa-headphones', 'music', 'common', 10, 'musicPlays'),
        b('music-50', 'Ngũ Thập Tình Khúc', 'Nghe trọn 50 lượt nhạc.', 'fa-volume-high', 'music', 'uncommon', 50, 'musicPlays'),
        b('music-200', 'Vô Tận Âm Trường', 'Nghe trọn 200 lượt nhạc.', 'fa-record-vinyl', 'music', 'rare', 200, 'musicPlays', 'ear-cat'),
        b('music-tracks-5', 'Ngũ Hành Giai Điệu', 'Nghe trọn 5 bài khác nhau.', 'fa-list-music', 'music', 'common', 5, 'musicTracks'),
        b('music-shuffle', 'Thiên Cơ Tùy Hứng', 'Bật phát ngẫu nhiên.', 'fa-shuffle', 'music', 'uncommon', 1, 'shuffleUsed', 'neon'),
        b('music-repeat', 'Luân Hồi Tình Khúc', 'Bật chế độ lặp.', 'fa-repeat', 'music', 'uncommon', 1, 'repeatUsed'),
        b('music-queue', 'Liệt Khúc Đãi Thời', 'Thêm bài hát vào hàng đợi.', 'fa-layer-plus', 'music', 'uncommon', 1, 'queueUsed'),
        b('music-same-20', 'Nhất Khúc Nhị Thập Hồi', 'Nghe trọn cùng một bản nhạc 20 lần.', 'fa-repeat', 'music', 'legendary', 20, 'sameTrack', 'ear-fox'),

        /* --- Tương tác (8) --- */
        b('inter-first-effect', 'Sơ Tinh Điểm Nhất', 'Dùng hiệu ứng sao băng lần đầu.', 'fa-meteor', 'interaction', 'common', 1, 'meteors'),
        b('inter-meteor-10', 'Thập Tinh Liên Châu', 'Bắn 10 sao băng.', 'fa-star', 'interaction', 'common', 10, 'meteors'),
        b('inter-meteor-100', 'Bách Tinh Huyền Vũ', 'Bắn 100 sao băng.', 'fa-star-half-stroke', 'interaction', 'uncommon', 100, 'meteors'),
        b('inter-meteor-1000', 'Lưu Tinh Kiếm Vũ', 'Bắn 1.000 sao băng.', 'fa-cloud-moon', 'interaction', 'epic', 1000, 'meteors', 'star'),
        b('inter-meteor-10000', 'Thiên Thạch Loạn Vũ', 'Bắn 10.000 sao băng.', 'fa-meteor', 'interaction', 'legendary', 10000, 'meteors', 'horn-dragon'),
        b('inter-music-fab', 'Chạm Khúc Thông Linh', 'Mở bảng Music Player.', 'fa-compact-disc', 'interaction', 'common', 1, 'musicOpened'),
        b('inter-focus', 'Định Cảnh Thiền Tâm', 'Bật chế độ tập trung khi học.', 'fa-crosshairs', 'interaction', 'uncommon', 1, 'focusUsed', 'cyber'),
        b('inter-dark-mode', 'Dạ Hành Tri Kỷ', 'Bật giao diện tối.', 'fa-moon', 'interaction', 'common', 1, 'themeToggles'),

        /* --- Hồ sơ (6) --- */
        b('social-nickname', 'Danh Tính Độc Tôn', 'Đặt biệt danh cho hồ sơ.', 'fa-signature', 'social', 'common', 1, 'profileNickname'),
        b('social-avatar', 'Chân Dung Tự Tại', 'Tải ảnh đại diện lên.', 'fa-image-portrait', 'social', 'common', 1, 'profileAvatar', 'leaf'),
        b('social-banner', 'Hậu Cảnh Thiên Thu', 'Đặt ảnh bìa hồ sơ.', 'fa-panorama', 'social', 'uncommon', 1, 'profileBanner'),
        b('social-bio', 'Tự Ngã Chi Ngôn', 'Viết giới thiệu bản thân.', 'fa-quote-left', 'social', 'common', 1, 'profileBio'),
        b('social-links-2', 'Song Liên Tâm Kiều', 'Thêm ít nhất 2 liên kết mạng xã hội.', 'fa-link', 'social', 'uncommon', 2, 'profileLinks'),
        b('social-frame', 'Tiểu Quán Miện', 'Trang bị một khung avatar.', 'fa-crown', 'social', 'rare', 1, 'profileFrame', 'ear-bunny'),

        /* --- Sáng tạo / Studio (8) --- */
        b('studio-doc', 'Bạch Chỉ Khai Thiên', 'Lưu tài liệu đầu tiên trong Studio.', 'fa-file-lines', 'studio', 'common', 1, 'studioDocs'),
        b('studio-drawing', 'Sơ Bút Khai Linh', 'Lưu một bản vẽ trong Studio.', 'fa-paintbrush', 'studio', 'common', 1, 'studioDrawings'),
        b('studio-insert', 'Họa Thuyết Nhân Gian', 'Chèn bản vẽ vào tài liệu Studio.', 'fa-image', 'studio', 'uncommon', 1, 'studioInserts'),
        b('studio-export', 'Tác Phẩm Khai Sinh', 'Xuất tài liệu hoặc ảnh từ Studio.', 'fa-file-export', 'studio', 'common', 1, 'studioExports', 'phoenix'),
        b('studio-words-500', 'Ngũ Bách Ngôn Phong', 'Viết một tài liệu dài 500 từ.', 'fa-feather-pointed', 'studio', 'rare', 500, 'studioWords', 'crystal'),
        b('studio-docs-5', 'Ngũ Quyển Tàng Kinh', 'Lưu 5 tài liệu trong Studio.', 'fa-folder-open', 'studio', 'uncommon', 5, 'studioDocs'),
        b('studio-drawings-5', 'Ngũ Họa Tàng Chân', 'Lưu 5 bản vẽ trong Studio.', 'fa-palette', 'studio', 'uncommon', 5, 'studioDrawings'),
        b('studio-exports-10', 'Thập Độ Quang Huy', 'Xuất 10 tệp từ Studio.', 'fa-file-arrow-down', 'studio', 'rare', 10, 'studioExports', 'antler'),

        /* --- Bí mật / Hiếm (10) --- */
        b('secret-night-owl', 'Dạ Ưng Vô Ảnh', 'Học sau nửa đêm.', 'fa-moon', 'secret', 'secret', 1, 'nightOwl', 'star'),
        b('secret-early-bird', 'Tinh Khôi Thần Điểu', 'Học trước 6 giờ sáng.', 'fa-sun', 'secret', 'secret', 1, 'earlyBird', 'frost'),
        b('secret-subjects-all', 'Bách Khoa Thông Giám', 'Mở bài học ở cả 10 môn.', 'fa-atom', 'secret', 'legendary', 10, 'subjects', 'sakura'),
        b('secret-notes-100', 'Bách Diệp Tâm Kinh', 'Tạo 100 ghi chú học tập.', 'fa-book-bookmark', 'secret', 'epic', 100, 'notes', 'wreath'),
        b('secret-bookmarks-50', 'Thư Xã Tàng Ấn', 'Lưu 50 đánh dấu.', 'fa-bookmark', 'secret', 'epic', 50, 'bookmarks', 'gothic'),
        b('secret-mastered-50', 'Ôn Cố Tri Tân', 'Làm chủ 50 câu từng sai.', 'fa-gem', 'secret', 'legendary', 50, 'mastered', 'ear-wolf'),
        b('secret-one-subject-10', 'Nhất Môn Cửu Trọng', 'Mở 10 bài học trong cùng một môn.', 'fa-microscope', 'secret', 'rare', 10, 'lessonsOneSubject', 'galactic'),
        b('secret-collector-40', 'Tứ Thập Tinh Tập', 'Mở khóa 40 badge.', 'fa-trophy', 'secret', 'legendary', 40, 'unlockedCount', 'sunflower'),
        b('secret-collector-60', 'Lục Thập Viên Mãn', 'Mở khóa 60 badge.', 'fa-trophy-star', 'secret', 'legendary', 60, 'unlockedCount', 'horn-dragon'),
        b('secret-completionist', 'Thất Thập Tam Quy Tông', 'Mở khóa 73 badge tự động.', 'fa-diamond', 'secret', 'legendary', 73, 'unlockedCount', 'crown'),
        b('ke-suu-tam', 'Kẻ sưu tầm', 'Thu thập toàn bộ thành tích (ngoại trừ 11 badge Founder và 2 badge Developer).', 'fa-bag-shopping', 'secret', 'legendary', 75, 'unlockedCount', null),

        /* --- Chỉ Administrator trao (2) --- */
        admin('admin-chosen', 'Thiên Tuyển Chi Ấn', 'Badge đặc biệt do quản trị viên trao tặng.', 'fa-hand-holding-heart'),
        admin('admin-legend', 'Bá Khí Chí Tôn', 'Badge cao nhất, chỉ Administrator trao tặng.', 'fa-crown'),

        /* --- Độc quyền: Developer (2) + Founder (1) ---
           Chỉ Administrator trao; server kiểm tra quyền sở hữu khung tương ứng. */
        {
            id: 'dev-exclusive-aurora', name: 'Dao Quang Tuyệt Ảnh',
            desc: 'Khung Dao quang độc bản, chỉ Founder có thể trao.',
            icon: 'fa-code', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'dev-aurora', adminOnly: true, exclusive: 'dev'
        },
        {
            id: 'dev-exclusive-void', name: 'Vô Cực Hư Không',
            desc: 'Khung Hư không độc bản, chỉ Founder có thể trao.',
            icon: 'fa-terminal', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'dev-void', adminOnly: true, exclusive: 'dev'
        },
        {
            id: 'founder', name: 'Thiên Khải Sáng Thế',
            desc: 'Ấn ký tối cao của người khai sáng Bá Khí — Minh Trúc.',
            icon: 'fa-crown', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder', adminOnly: true, exclusive: 'founder'
        },
        /* 10 badge Founder độc quyền — mỗi badge kèm theo một khung avatar Founder.
            Chỉ Founder được trao tay, không tự động mở. */
        {
            id: 'founder-yin-yang', name: 'Âm Dương Thái Cực',
            desc: 'Khung Âm Dương Thái Cực độc bản, chỉ Founder có thể trao.',
            icon: 'fa-yin-yang', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-yin-yang', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-cyberpunk', name: 'Sát Thủ Tương Lai',
            desc: 'Khung Sát Thủ Tương Lai độc bản, chỉ Founder có thể trao.',
            icon: 'fa-robot', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-cyberpunk', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-ancient', name: 'Cổ Khí Thần Ấn',
            desc: 'Khung Cổ Khí Thần Ấn độc bản, chỉ Founder có thể trao.',
            icon: 'fa-scroll', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-ancient', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-samurai', name: 'Bushido',
            desc: 'Khung Bushido độc bản, chỉ Founder có thể trao.',
            icon: 'fa-sword', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-samurai', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-void-emperor', name: 'Vô Cực Hoàng Đế',
            desc: 'Khung Vô Cực Hoàng Đế độc bản, chỉ Founder có thể trao.',
            icon: 'fa-circle-notch', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-void-emperor', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-celestial-dragon', name: 'Thiên Long',
            desc: 'Khung Thiên Long độc bản, chỉ Founder có thể trao.',
            icon: 'fa-dragon', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-celestial-dragon', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-golden-ratio', name: 'Vàng Nguyên Tắc',
            desc: 'Khung Vàng Nguyên Tắc độc bản, chỉ Founder có thể trao.',
            icon: 'fa-compass', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-golden-ratio', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-ember-core', name: 'Lòng Nôc',
            desc: 'Khung Lòng Nôc độc bản, chỉ Founder có thể trao.',
            icon: 'fa-fire', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-ember-core', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-crystal-mind', name: 'Tinh Thần Tinh Thạch',
            desc: 'Khung Tinh Thần Tinh Thạch độc bản, chỉ Founder có thể trao.',
            icon: 'fa-gem', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-crystal-mind', adminOnly: true, exclusive: 'founder'
        },
        {
            id: 'founder-neon-lotus', name: 'Sen Neon',
            desc: 'Khung Sen Neon độc bản, chỉ Founder có thể trao.',
            icon: 'fa-lotus', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-neon-lotus', adminOnly: true, exclusive: 'founder'
        },

        /* --- 10 Founder Badge 7.5.0 — ấn phẩm độc quyền, có hình tượng riêng ---
           Mỗi badge dùng `art` (SVG dựng sẵn trong badgeArt) thay cho icon Font
           Awesome. Không badge nào trong nhóm này tự động mở hoặc nằm trong
           chức năng "trao toàn bộ badge". */
        {
            id: 'founder-genesis', name: 'Genesis',
            desc: 'Khởi nguyên — lõi năng lượng đầu tiên và quỹ đạo hình thành nên Bá Khí.',
            icon: 'fa-circle-dot', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: null, adminOnly: true, exclusive: 'founder', art: 'genesis'
        },
        {
            id: 'founder-architect', name: 'Architect',
            desc: 'Người kiến tạo — bản thiết kế hình học của toàn bộ hệ thống.',
            icon: 'fa-compass-drafting', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-frost-emperor', adminOnly: true, exclusive: 'founder', art: 'architect'
        },
        {
            id: 'founder-eternal-flame', name: 'Eternal Flame',
            desc: 'Ngọn lửa vĩnh cửu — nhiệt huyết không tắt của người khai sáng.',
            icon: 'fa-fire-flame-curved', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-phoenix-rebirth', adminOnly: true, exclusive: 'founder', art: 'eternal-flame'
        },
        {
            id: 'founder-nexus', name: 'Nexus',
            desc: 'Trung tâm liên kết — nơi mọi luồng năng lượng và dữ liệu gặp nhau.',
            icon: 'fa-diagram-project', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: null, adminOnly: true, exclusive: 'founder', art: 'nexus'
        },
        {
            id: 'founder-celestial', name: 'Celestial',
            desc: 'Thiên hà và tinh tú — tầm nhìn vượt khỏi đường chân trời.',
            icon: 'fa-galaxy', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-astral-observatory', adminOnly: true, exclusive: 'founder', art: 'celestial'
        },
        {
            id: 'founder-chronos', name: 'Chronos',
            desc: 'Thời gian — đồng hồ cổ và cơ khí ghi dấu từng giai đoạn phát triển.',
            icon: 'fa-clock', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-chrono-mechanical', adminOnly: true, exclusive: 'founder', art: 'chronos'
        },
        {
            id: 'founder-void-sentinel', name: 'Void Sentinel',
            desc: 'Người canh giữ hư không — lá chắn đứng giữa khoảng trống vô tận.',
            icon: 'fa-shield', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-abyssal', adminOnly: true, exclusive: 'founder', art: 'void-sentinel'
        },
        {
            id: 'founder-prime-code', name: 'Prime Code',
            desc: 'Công nghệ và dữ liệu — dòng mã nguồn gốc của nền tảng.',
            icon: 'fa-code', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: null, adminOnly: true, exclusive: 'founder', art: 'prime-code'
        },
        {
            id: 'founder-legacy', name: 'Legacy',
            desc: 'Di sản — vương miện và nguyệt quế của những gì còn lại mãi.',
            icon: 'fa-crown', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: null, adminOnly: true, exclusive: 'founder', art: 'legacy'
        },
        {
            id: 'founder-ascendant', name: 'Ascendant',
            desc: 'Thăng hoa — pha lê và ánh sáng của bước tiến cuối cùng.',
            icon: 'fa-gem', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder-crystal-sovereign', adminOnly: true, exclusive: 'founder', art: 'ascendant'
        }
    ];

    var BY_ID = {};
    CATALOG.forEach(function (x) { BY_ID[x.id] = x; });

    /* ---------------------------------------------------------------------
       Hình tượng SVG cho 10 Founder Badge 7.5.0.

       Đây là markup hằng số (không chứa dữ liệu người dùng), mỗi badge có
       hình tượng, silhouette và bảng màu riêng — không dùng chung template.
       Trả về chuỗi SVG để profile UI và dashboard cùng hiển thị một asset.
       ------------------------------------------------------------------ */
    var ART_NS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" role="img"';

    function artWraps(id, body) {
        return '<svg ' + ART_NS + ' data-badge-art="' + id + '" class="bk-badge-art">' + body + '</svg>';
    }

    var ART_PAINTERS = {
        /* Genesis — lõi năng lượng + hai quỹ đạo nghiêng, tia sáng ngắn. */
        genesis: function () {
            return '<defs><radialGradient id="bka-gen-core" cx=".5" cy=".5" r=".5">' +
                '<stop offset="0" stop-color="#f0fdfa"/><stop offset=".45" stop-color="#5eead4"/>' +
                '<stop offset="1" stop-color="#0f766e" stop-opacity="0"/></radialGradient>' +
                '<linearGradient id="bka-gen-ring" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#99f6e4"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs>' +
                '<circle cx="32" cy="32" r="17" fill="url(#bka-gen-core)" opacity=".9"/>' +
                '<circle cx="32" cy="32" r="7.4" fill="#ccfbf1"/>' +
                '<circle cx="32" cy="32" r="3.1" fill="#134e4a"/>' +
                '<g stroke="url(#bka-gen-ring)" stroke-width="1.5">' +
                '<ellipse cx="32" cy="32" rx="27" ry="10.5" transform="rotate(-24 32 32)"/>' +
                '<ellipse cx="32" cy="32" rx="27" ry="10.5" transform="rotate(38 32 32)" opacity=".65"/></g>' +
                '<g fill="#a7f3d0"><circle cx="8" cy="23" r="1.7"/><circle cx="54" cy="20" r="1.4"/>' +
                '<circle cx="47" cy="51" r="1.6"/></g>' +
                '<g stroke="#5eead4" stroke-width="1" opacity=".6">' +
                '<path d="M32 5v4M32 55v4M5 32h4M55 32h4"/></g>';
        },
        /* Architect — khối lập phương isometric + compa + thước chia độ. */
        architect: function () {
            return '<defs><linearGradient id="bka-arc-a" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs>' +
                '<g stroke="url(#bka-arc-a)" stroke-width="1.6" stroke-linejoin="round">' +
                '<path d="M32 8l19 11v26L32 56 13 45V19z"/>' +
                '<path d="M32 8v48M13 19l19 11 19-11M13 45l19-15 19 15"/></g>' +
                '<g stroke="#fcd34d" stroke-width=".9" opacity=".5">' +
                '<path d="M17 24l6 3M41 38l6 3M20 41l5-3M39 23l5-3"/></g>' +
                '<circle cx="32" cy="32" r="4.6" fill="#fef3c7"/>' +
                '<path d="M32 32l14-9" stroke="#7c2d12" stroke-width="1.6"/>' +
                '<circle cx="46" cy="23" r="1.9" fill="#7c2d12"/>' +
                '<g fill="#fbbf24" opacity=".9"><rect x="30" y="2" width="4" height="3" rx="1"/>' +
                '<rect x="30" y="59" width="4" height="3" rx="1"/></g>';
        },
        /* Eternal Flame — ba lớp lửa với lõi sáng, tàn lửa bay. */
        'eternal-flame': function () {
            return '<defs><linearGradient id="bka-fl-outer" x1=".5" y1="1" x2=".5" y2="0">' +
                '<stop offset="0" stop-color="#9a3412"/><stop offset=".55" stop-color="#f97316"/>' +
                '<stop offset="1" stop-color="#fde68a"/></linearGradient>' +
                '<linearGradient id="bka-fl-inner" x1=".5" y1="1" x2=".5" y2="0">' +
                '<stop offset="0" stop-color="#fdba74"/><stop offset="1" stop-color="#fffbeb"/></linearGradient></defs>' +
                '<path d="M32 4c8 11 2 15 8 22 5-2 6-7 6-11 6 9 7 20 2 28-4 6-10 9-16 9s-13-3-17-9c-5-9-3-20 4-28 0 5 1 9 5 11-1-8-1-12 8-22z" fill="url(#bka-fl-outer)"/>' +
                '<path d="M32 20c4 7 1 10 5 14 3-2 3-5 3-8 4 6 4 13 0 18-3 3-6 4-9 4s-7-1-9-4c-4-5-3-12 1-18 0 3 .5 6 3 8 0-5 1-9 6-14z" fill="url(#bka-fl-inner)" opacity=".95"/>' +
                '<ellipse cx="31" cy="44" rx="5" ry="9" fill="#fffbeb" opacity=".75"/>' +
                '<g fill="#fdba74"><circle cx="16" cy="16" r="1.6"/><circle cx="49" cy="13" r="1.2"/>' +
                '<circle cx="52" cy="30" r="1"/><circle cx="13" cy="33" r="1"/></g>' +
                '<path d="M20 58h24" stroke="#9a3412" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>';
        },
        /* Nexus — nút trung tâm nối 6 nhánh qua vòng lục giác. */
        nexus: function () {
            var spokes = '';
            for (var i = 0; i < 6; i++) {
                var a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                var x = 32 + Math.cos(a) * 23, y = 32 + Math.sin(a) * 23;
                spokes += '<path d="M32 32L' + x.toFixed(1) + ' ' + y.toFixed(1) + '"/>';
                spokes += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.6" fill="#f5d0fe"/>';
            }
            return '<defs><linearGradient id="bka-nx" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#f0abfc"/><stop offset="1" stop-color="#7e22ce"/></linearGradient></defs>' +
                '<g stroke="url(#bka-nx)" stroke-width="1.4" opacity=".85">' + spokes + '</g>' +
                '<path d="M32 9l19 11v22L32 55 13 44V20z" stroke="#a855f7" stroke-width="1" stroke-dasharray="3 4" opacity=".7"/>' +
                '<circle cx="32" cy="32" r="11" fill="#4c1d95" opacity=".55"/>' +
                '<circle cx="32" cy="32" r="7" fill="#e879f9"/>' +
                '<circle cx="32" cy="32" r="3" fill="#fdf4ff"/>' +
                '<path d="M32 25v-8M32 47v-8M25 32h-8M47 32h-8" stroke="#f5d0fe" stroke-width="1.2" opacity=".8"/>';
        },
        /* Celestial — xoắn ốc thiên hà + chòm sao + ngôi sao trung tâm. */
        celestial: function () {
            return '<defs><radialGradient id="bka-cel" cx=".5" cy=".5" r=".5">' +
                '<stop offset="0" stop-color="#e0e7ff"/><stop offset=".5" stop-color="#818cf8"/>' +
                '<stop offset="1" stop-color="#312e81" stop-opacity="0"/></radialGradient></defs>' +
                '<circle cx="32" cy="32" r="24" fill="url(#bka-cel)" opacity=".65"/>' +
                '<g stroke="#a5b4fc" stroke-width="1.3" stroke-linecap="round" opacity=".9">' +
                '<path d="M32 32c10-8 22-4 20 5s-17 12-25 5-4-18 6-19"/>' +
                '<path d="M32 32c-9 7-20 4-18-4s15-11 22-5"/></g>' +
                '<path d="M32 26l2.1 4.4 4.9.7-3.5 3.5.8 4.9-4.3-2.3-4.3 2.3.8-4.9-3.5-3.5 4.9-.7z" fill="#fef9c3"/>' +
                '<g fill="#c7d2fe"><circle cx="48" cy="15" r="1.5"/><circle cx="15" cy="22" r="1"/>' +
                '<circle cx="20" cy="47" r="1.4"/><circle cx="45" cy="50" r="1"/><circle cx="54" cy="35" r="1.2"/></g>' +
                '<path d="M42 12l2 3 3 1-3 1-2 3-1-3-3-1 3-1z" fill="#e0e7ff" opacity=".9"/>';
        },
        /* Chronos — mặt đồng hồ, vạch giờ, bánh răng sau lớp mặt. */
        chronos: function () {
            var ticks = '';
            for (var i = 0; i < 12; i++) {
                var a = (Math.PI * 2 * i) / 12;
                var r1 = i % 3 === 0 ? 17 : 19.5;
                ticks += '<path d="M' + (32 + Math.cos(a) * r1).toFixed(1) + ' ' + (32 + Math.sin(a) * r1).toFixed(1) +
                    'L' + (32 + Math.cos(a) * 22).toFixed(1) + ' ' + (32 + Math.sin(a) * 22).toFixed(1) + '"/>';
            }
            var teeth = '';
            for (var t = 0; t < 10; t++) {
                var at = (Math.PI * 2 * t) / 10;
                teeth += '<rect x="-2.2" y="-29" width="4.4" height="5" rx="1" transform="translate(32 32) rotate(' +
                    ((at * 180) / Math.PI).toFixed(1) + ')" fill="#a16207"/>';
            }
            return '<defs><linearGradient id="bka-ch" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#92400e"/></linearGradient></defs>' +
                teeth + '<circle cx="32" cy="32" r="23" fill="#1c1917"/>' +
                '<circle cx="32" cy="32" r="23" stroke="url(#bka-ch)" stroke-width="2.2"/>' +
                '<circle cx="32" cy="32" r="17" stroke="#78350f" stroke-width="1" opacity=".8"/>' +
                '<g stroke="#fbbf24" stroke-width="1.3" stroke-linecap="round">' + ticks + '</g>' +
                '<path d="M32 32V19M32 32l9 6" stroke="#fef3c7" stroke-width="2" stroke-linecap="round"/>' +
                '<circle cx="32" cy="32" r="2.4" fill="#fef3c7"/>';
        },
        /* Void Sentinel — obelisk + khiên hư không + một khe mắt bạc. */
        'void-sentinel': function () {
            return '<defs><linearGradient id="bka-vs" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#4c1d95"/></linearGradient>' +
                '<radialGradient id="bka-vs-core" cx=".5" cy=".5" r=".5">' +
                '<stop offset="0" stop-color="#a78bfa" stop-opacity=".9"/>' +
                '<stop offset="1" stop-color="#1e1b4b" stop-opacity="0"/></radialGradient></defs>' +
                '<circle cx="32" cy="30" r="26" fill="url(#bka-vs-core)" opacity=".7"/>' +
                '<path d="M32 5l16 9v20c0 10-7 18-16 25-9-7-16-15-16-25V14z" fill="#0c0a1d" stroke="url(#bka-vs)" stroke-width="1.8"/>' +
                '<path d="M32 13l9 5v15c0 6-4 11-9 16-5-5-9-10-9-16V18z" fill="#1e1b4b" stroke="#7c3aed" stroke-width=".9" opacity=".9"/>' +
                '<path d="M23 30c6-3 12-3 18 0-6 3-12 3-18 0z" fill="#e9d5ff"/>' +
                '<circle cx="32" cy="30" r="1.7" fill="#312e81"/>' +
                '<g stroke="#a78bfa" stroke-width=".9" opacity=".55"><path d="M14 22h6M44 22h6M14 40h5M45 40h5"/></g>' +
                '<path d="M32 3v4" stroke="#c4b5fd" stroke-width="1.4"/>';
        },
        /* Prime Code — ngoặc nhọn, lưới dữ liệu, mạch điện neon. */
        'prime-code': function () {
            var dots = '';
            for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
                dots += '<circle cx="' + (24 + x * 5.4).toFixed(1) + '" cy="' + (34 + y * 5.4).toFixed(1) + '" r="1.1" opacity="' + (0.35 + ((x + y) % 3) * 0.2).toFixed(2) + '"/>';
            }
            return '<defs><linearGradient id="bka-pc" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs>' +
                '<rect x="9" y="9" width="46" height="46" rx="7" stroke="#22d3ee" stroke-width="1.2" opacity=".55"/>' +
                '<path d="M24 18l-8 14 8 14M40 18l8 14-8 14" stroke="url(#bka-pc)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<g fill="#5eead4">' + dots + '</g>' +
                '<path d="M9 32h4M51 32h4M32 9v4M32 51v4" stroke="#22d3ee" stroke-width="1.2" opacity=".8"/>' +
                '<path d="M30 26l-4 6 4 6M34 26l4 6-4 6" stroke="#ecfeff" stroke-width="1.4" stroke-linecap="round"/>';
        },
        /* Legacy — vương miện trên nguyệt quế, dải băng dưới. */
        legacy: function () {
            var leaves = '';
            var pts = [[20, 46, -40], [15, 38, -60], [14, 30, -80], [17, 22, -105]];
            pts.forEach(function (p) {
                leaves += '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="3.4" ry="1.8" transform="rotate(' + p[2] + ' ' + p[0] + ' ' + p[1] + ')"/>';
                var mx = 64 - p[0];
                leaves += '<ellipse cx="' + mx + '" cy="' + p[1] + '" rx="3.4" ry="1.8" transform="rotate(' + (-p[2]) + ' ' + mx + ' ' + p[1] + ')"/>';
            });
            return '<defs><linearGradient id="bka-lg" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="#eab308"/>' +
                '<stop offset="1" stop-color="#a16207"/></linearGradient></defs>' +
                '<path d="M13 30l6 16 6-12 7 12 7-12 7 12 6-12 5 12 6-16-3 24H16z" fill="url(#bka-lg)" stroke="#713f12" stroke-width="1.1" stroke-linejoin="round" opacity=".35"/>' +
                '<path d="M18 20l5 16 5-11 4 11 5-11 4 11 5-11 4 11 5-16" fill="none" stroke="url(#bka-lg)" stroke-width="3" stroke-linejoin="round"/>' +
                '<g fill="#fde68a" stroke="#713f12" stroke-width=".5">' + leaves + '</g>' +
                '<path d="M22 42c4 10 16 14 22 12" stroke="#22c55e" stroke-width="1.2" fill="none" opacity=".7"/>' +
                '<path d="M24 48h16" stroke="#facc15" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>' +
                '<circle cx="32" cy="14" r="2.2" fill="#fef9c3"/>';
        },
        /* Ascendant — chùm tinh thể bay lên + tia sáng hội tụ. */
        ascendant: function () {
            return '<defs><linearGradient id="bka-as" x1="0" y1="1" x2="1" y2="0">' +
                '<stop offset="0" stop-color="#0891b2"/><stop offset=".55" stop-color="#bae6fd"/>' +
                '<stop offset="1" stop-color="#fffbeb"/></linearGradient>' +
                '<radialGradient id="bka-as-glow" cx=".5" cy=".5" r=".5">' +
                '<stop offset="0" stop-color="#fef9c3" stop-opacity=".95"/>' +
                '<stop offset="1" stop-color="#fef9c3" stop-opacity="0"/></radialGradient></defs>' +
                '<circle cx="32" cy="26" r="20" fill="url(#bka-as-glow)" opacity=".55"/>' +
                '<g stroke="#fef3c7" stroke-width="1" opacity=".55">' +
                '<path d="M32 3v9M12 8l6 7M52 8l-6 7M4 26h9M51 26h9"/></g>' +
                '<path d="M32 8l9 16-9 11-9-11z" fill="url(#bka-as)" stroke="#e0f2fe" stroke-width=".9"/>' +
                '<path d="M32 8l-4 16 4 11 4-11z" fill="#ecfeff" opacity=".55"/>' +
                '<path d="M18 30l6 10-6 7-6-7z" fill="#7dd3fc" stroke="#e0f2fe" stroke-width=".7" opacity=".9"/>' +
                '<path d="M46 30l6 10-6 7-6-7z" fill="#38bdf8" stroke="#e0f2fe" stroke-width=".7" opacity=".9"/>' +
                '<path d="M24 53h16" stroke="#bae6fd" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>' +
                '<circle cx="32" cy="1.8" r="1.6" fill="#fef9c3"/>';
        }
    };

    /** SVG của một Founder Badge 7.5.0 (chuỗi hằng số) hoặc chuỗi rỗng. */
    function badgeArt(key) {
        var painter = ART_PAINTERS[String(key || '')];
        return painter ? artWraps(key, painter()) : '';
    }

    function metricValue(key) {
        if (!key) return 0;
        var m = metrics();
        return num(m[key]);
    }

    /* ---------------------------------------------------------------------
       Theo dõi
       ------------------------------------------------------------------ */
    function markDay() {
        var t = load();
        var d = today();
        t.days[d] = num(t.days[d]) + 1;
        if (t.lastDay !== d) {
            if (t.lastDay && daysBetween(t.lastDay, d) === 1) t.streak = num(t.streak) + 1;
            else if (t.lastDay && daysBetween(t.lastDay, d) === 0) { /* cùng ngày */ }
            else t.streak = 1;
            t.lastDay = d;
            t.maxStreak = Math.max(num(t.maxStreak), num(t.streak));
        }
        save();
    }

    function trackPage(path) {
        var t = load();
        if (!path) return;
        if (!t.pages[path]) { t.pages[path] = Date.now(); save(); }
    }

    function bumpCounter(name, amount) {
        var t = load();
        t.counters[name] = num(t.counters[name]) + (Number(amount) || 1);
        save();
    }

    /** Ghi một lượt nghe trọn vẹn (không tính khi chỉ bấm Play). */
    function trackListen(trackId, completed) {
        if (!trackId) return;
        if (!completed) return;
        var t = load();
        t.tracks[trackId] = num(t.tracks[trackId]) + 1;
        t.sameTrack[trackId] = num(t.sameTrack[trackId]) + 1;
        save();
    }

    /* ---------------------------------------------------------------------
       Tiến độ + mở khóa
       ------------------------------------------------------------------ */
    function progress() {
        var t = load();
        var m = metrics();
        return CATALOG.map(function (x) {
            var cur = 0;
            if (!x.adminOnly) {
                cur = num(m[x.key]);
                if (x.key === 'unlockedCount') {
                    /* đếm chính xác badge đã mở, không tính hai badge admin */
                    cur = Object.keys(t.unlocked).filter(function (id) { return BY_ID[id] && !BY_ID[id].adminOnly; }).length;
                }
            } else {
                cur = t.unlocked[x.id] ? 1 : 0;
            }
            /* Badge được trao tay vẫn phải hiện đủ tiến độ, không phải 0/goal. */
            if (t.unlocked[x.id]) cur = x.goal;
            cur = Math.max(0, Math.min(x.goal, cur));
            return {
                id: x.id, name: x.name, desc: x.desc, icon: x.icon,
                category: x.category, rarity: x.rarity, goal: x.goal,
                current: cur, pct: x.goal ? Math.round((cur / x.goal) * 100) : 0,
                unlockedAt: t.unlocked[x.id] || null,
                adminOnly: x.adminOnly,
                exclusive: x.exclusive || null,
                art: x.art || null,
                frame: x.frame,
                server: t.granted[x.id] || null
            };
        });
    }

    /** Gợi ý cách lấy badge, kể cả badge bí mật và badge quản trị. */
    function howTo(row) {
        if (!row) return '';
        if (row.adminOnly) {
            if (row.exclusive === 'founder') return 'Chỉ hồ sơ Người sáng lập đã xác minh mới nhận được.';
            if (row.exclusive === 'dev') return 'Ấn phẩm độc bản của Bá Khí, chỉ Founder có quyền trao.';
            return 'Do quản trị viên trao tay từ Administrator Dashboard.';
        }
        return row.desc + (row.goal > 1 ? ' Máy chủ xác minh tiến độ từ dữ liệu học tập của bạn.' : '');
    }

    function unlockedCount() {
        var t = load();
        return Object.keys(t.unlocked).filter(function (id) { return !!BY_ID[id]; }).length;
    }

    function emit(kind, extra) {
        try {
            D.dispatchEvent(new CustomEvent('bkbadges', { detail: Object.assign({ kind: kind }, extra || {}) }));
        } catch (e) { }
    }

    /** Kiểm tra và mở khóa. Trả về danh sách badge vừa mở. */
    function check(opts) {
        opts = opts || {};
        var t = load();
        var m = metrics();
        var fresh = [];
        CATALOG.forEach(function (x) {
            if (x.adminOnly || t.unlocked[x.id]) return;
            var cur = num(m[x.key]);
            if (x.key === 'unlockedCount') {
                if (x.id === 'ke-suu-tam') {
                    cur = Object.keys(t.unlocked).filter(function (id) {
                        if (id === 'ke-suu-tam') return false;
                        var b = BY_ID[id];
                        if (!b) return false;
                        return b.exclusive !== 'founder' && b.exclusive !== 'dev';
                    }).length;
                } else {
                    cur = Object.keys(t.unlocked).filter(function (id) { return BY_ID[id] && !BY_ID[id].adminOnly; }).length;
                }
            }
            if (cur >= x.goal) {
                t.unlocked[x.id] = Date.now();
                fresh.push(x);
            }
        });
        if (fresh.length) {
            save();
            emit('unlock', { badges: fresh });
            if (!opts.silent && BK.ui && BK.ui.toast) {
                var names = fresh.slice(0, 2).map(function (x) { return x.name; }).join(', ');
                if (fresh.length > 2) names += ' và ' + (fresh.length - 2) + ' badge khác';
                BK.ui.toast(fresh.length === 1 ? 'Mở khóa badge: ' + names : 'Mở khóa ' + fresh.length + ' badge: ' + names, 'success');
            }
            /* Badge thưởng khung: thông báo thêm nếu có. */
            var framed = fresh.filter(function (x) { return x.frame; });
            if (framed.length && !opts.silent && BK.ui && BK.ui.toast) {
                BK.ui.toast('Phần thưởng: khung avatar "' + framed[0].frame + '" đã mở.', 'info');
            }
        }
        return fresh;
    }

    /* ---------------------------------------------------------------------
       Quà tặng từ server (2 badge Administrator + khung)
       ------------------------------------------------------------------ */
    function applyGrants(list) {
        if (!Array.isArray(list) || !list.length) return 0;
        var t = load();
        var added = 0;
        list.forEach(function (g) {
            var id = String((g && g.badge_id) || g || '').slice(0, 64);
            var def = BY_ID[id];
            if (!def) return;
            if (t.unlocked[id]) return;
            t.unlocked[id] = Number(g && g.awarded_at) || Date.now();
            t.granted[id] = {
                by: String((g && g.awarded_by) || 'admin').slice(0, 60),
                at: t.unlocked[id],
                reason: String((g && g.reason) || '').slice(0, 200)
            };
            added++;
        });
        if (added) { save(); emit('unlock', { badges: [] }); check({ silent: true }); }
        return added;
    }

    /* ---------------------------------------------------------------------
       Đồng bộ máy chủ: gửi ảnh chụp bộ đếm, nhận badge đã xác minh
       ------------------------------------------------------------------ */

    /** Ảnh chụp tối thiểu để máy chủ tính lại thành tích (không có badge đã mở). */
    function snapshot() {
        var t = load();
        return {
            pages: t.pages,
            days: t.days,
            tracks: t.tracks,
            sameTrack: t.sameTrack,
            counters: t.counters,
            maxStreak: t.maxStreak
        };
    }

    /**
     * Áp danh sách badge máy chủ đã xác minh. Chỉ nhận id có trong danh mục;
     * badge Administrator chỉ được ghi khi máy chủ trả kind='admin'. Hàm này
     * không bao giờ xoá badge cục bộ (giữ được tiến trình khi ngoại tuyến).
     */
    function applyServer(list, opts) {
        if (!Array.isArray(list)) return 0;
        var authoritative = !!(opts && opts.authoritative);
        if (!list.length && !authoritative) return 0;
        var t = load();
        var added = 0;
        var removed = 0;
        var present = {};
        list.forEach(function (row) {
            if (!row) return;
            var id = String(row.badge_id || row.id || '').slice(0, 64);
            var def = BY_ID[id];
            if (!def) return;
            /* Badge Administrator chỉ hợp lệ khi máy chủ ghi rõ kind='admin'. */
            if (def.adminOnly && row.kind !== 'admin') return;
            present[id] = true;
            var at = Date.parse(row.awarded_at);
            if (!isFinite(at) || at <= 0) at = Number(row.awarded_at) || Date.now();
            var already = !!t.unlocked[id];
            if (!already) { t.unlocked[id] = at; added++; }
            if (def.adminOnly || row.kind === 'admin') {
                /* Không để bản ghi thiếu người trao ghi đè bản ghi đầy đủ. */
                if (!t.granted[id] || row.awarded_by) {
                    t.granted[id] = {
                        by: String(row.awarded_by || 'admin').slice(0, 60),
                        at: at,
                        reason: String(row.reason || '').slice(0, 200)
                    };
                }
            }
        });
        /* Danh sách máy chủ là nguồn sự thật: thu hồi badge trao tay ở nơi khác
           phải biến mất ngay, nhưng KHÔNG bao giờ xoá badge tự động đã đạt. */
        if (authoritative) {
            Object.keys(t.unlocked).forEach(function (id) {
                if (present[id]) return;
                var def = BY_ID[id];
                if (def && def.adminOnly) {
                    delete t.unlocked[id];
                    delete t.granted[id];
                    removed++;
                }
            });
            Object.keys(t.granted).forEach(function (id) {
                if (!present[id]) { delete t.granted[id]; removed++; }
            });
        }
        if (added || removed) {
            save();
            emit('sync', { badges: [] });
            check({ silent: true });
        }
        return added;
    }

    /** Đọc lại kho cục bộ ngay (dùng sau khi tab khác hoặc máy chủ thay đổi). */
    function refresh() {
        cache = null;
        emit('sync', { badges: [] });
        check({ silent: true });
    }

    /* ---------------------------------------------------------------------
       Khung avatar: quyền sở hữu
       ------------------------------------------------------------------ */
    var BASE_FRAMES = ['none', 'leaf'];

    function ownedFrames() {
        var owned = {};
        BASE_FRAMES.forEach(function (id) { owned[id] = true; });
        progress().forEach(function (p) {
            if (p.unlockedAt && p.frame) owned[p.frame] = true;
        });
        return Object.keys(owned);
    }

    function canEquip(frameId) {
        return ownedFrames().indexOf(frameId) !== -1;
    }

    /* ---------------------------------------------------------------------
       Khởi động: đếm ngày, trang, khung giờ
       ------------------------------------------------------------------ */
    function boot() {
        /* Trang quản trị chỉ nạp danh mục badge để hiển thị tên; không đếm
           trang/ngày và không ghi bakhiBadges.v1 vào trình duyệt quản trị. */
        if (global.BK_ADMIN_ONLY) return;
        /* Đổi học sinh hoặc tab khác ghi badge → đọc lại ngay, không cần F5. */
        global.addEventListener('storage', function (e) {
            if (!e || !e.key || e.key.indexOf(KEY) !== 0) return;
            cache = null;
            emit('sync', { badges: [] });
        });
        global.addEventListener('bk:identity', function () {
            cache = null;
            emit('sync', { badges: [] });
        });
        markDay();
        try {
            var path = global.location.pathname.replace(/\/index\.html$/, '/').replace(/(\/[^/]+\/[^/]+)$/, '$1');
            trackPage(path);
        } catch (e) { }
        var h = new Date().getHours();
        try { if (global.BK && BK.util && BK.util.vnParts) h = Number(BK.util.vnParts(Date.now()).hour); } catch (e) { }
        if (h >= 0 && h < 4) BK.signals.bump('time.night');
        if (h >= 4 && h < 6) BK.signals.bump('time.early');
        check({ silent: true });
    }

    BK.badges = {
        __ready: true,
        KEY: KEY,
        CATALOG: CATALOG,
        CATEGORIES: CATEGORIES,
        RARITIES: RARITIES,
        byId: function (id) { return BY_ID[id] || null; },
        art: badgeArt,
        ART_KEYS: Object.keys(ART_PAINTERS),
        progress: progress,
        check: check,
        metrics: metrics,
        unlockedCount: unlockedCount,
        howTo: howTo,
        trackPage: trackPage,
        trackListen: trackListen,
        bumpCounter: bumpCounter,
        markDay: markDay,
        applyGrants: applyGrants,
        applyServer: applyServer,
        refresh: refresh,
        snapshot: snapshot,
        ownedFrames: ownedFrames,
        canEquip: canEquip,
        on: function (fn) {
            function h(e) { try { fn(e.detail); } catch (err) { } }
            D.addEventListener('bkbadges', h);
            return function () { D.removeEventListener('bkbadges', h); };
        },
        reset: function () {
            cache = emptyTrack();
            save();
            emit('reset');
        }
    };

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : this);
