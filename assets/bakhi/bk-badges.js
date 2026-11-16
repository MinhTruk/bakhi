/* =========================================================================
   Bá Khí — bk-badges.js
   Hệ thống thành tích 75 badge (73 tự động + 2 chỉ Administrator trao).

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
        b('learn-first-lesson', 'Trang đầu tiên', 'Mở bài học đầu tiên.', 'fa-book-open', 'learning', 'common', 1, 'lessons', 'leaf'),
        b('learn-lessons-5', 'Năm bài học', 'Mở 5 bài học khác nhau.', 'fa-book', 'learning', 'common', 5, 'lessons'),
        b('learn-lessons-15', 'Mười lăm bài học', 'Mở 15 bài học khác nhau.', 'fa-book-open-reader', 'learning', 'uncommon', 15, 'lessons', 'celestial'),
        b('learn-lessons-30', 'Ba mươi bài học', 'Mở 30 bài học khác nhau.', 'fa-graduation-cap', 'learning', 'rare', 30, 'lessons', 'wreath'),
        b('learn-subjects-3', 'Ba môn học', 'Mở bài học ở 3 môn trở lên.', 'fa-layer-group', 'learning', 'uncommon', 3, 'subjects'),
        b('learn-subjects-5', 'Năm môn học', 'Mở bài học ở 5 môn trở lên.', 'fa-shapes', 'learning', 'rare', 5, 'subjects', 'divine'),
        b('learn-first-answer', 'Câu trả lời đầu tiên', 'Hoàn thành lượt luyện đầu tiên.', 'fa-circle-question', 'learning', 'common', 1, 'practice'),
        b('learn-practice-25', 'Hai lăm lượt luyện', 'Hoàn thành 25 lượt luyện tập.', 'fa-dumbbell', 'learning', 'common', 25, 'practice'),
        b('learn-practice-100', 'Trăm lượt luyện', 'Hoàn thành 100 lượt luyện tập.', 'fa-fire', 'learning', 'uncommon', 100, 'practice'),
        b('learn-practice-500', 'Năm trăm lượt luyện', 'Hoàn thành 500 lượt luyện tập.', 'fa-bolt', 'learning', 'epic', 500, 'practice', 'royal'),
        b('learn-correct-15', 'Mười lăm câu đúng', 'Trả lời đúng 15 câu hỏi.', 'fa-circle-check', 'learning', 'common', 15, 'correct'),
        b('learn-correct-100', 'Trăm câu đúng', 'Trả lời đúng 100 câu hỏi.', 'fa-award', 'learning', 'rare', 100, 'correct', 'infernal'),
        b('learn-review-first', 'Câu cần ôn đầu tiên', 'Có câu hỏi đầu tiên trong danh sách ôn.', 'fa-rotate', 'learning', 'common', 1, 'review'),
        b('learn-mastered-10', 'Làm chủ mười câu', 'Đánh dấu thành thạo 10 câu từng sai.', 'fa-check-double', 'learning', 'rare', 10, 'mastered', 'legendary'),

        /* --- Khám phá (10) --- */
        b('explore-pages-5', 'Năm trang', 'Ghé 5 trang khác nhau của Bá Khí.', 'fa-shoe-prints', 'exploration', 'common', 5, 'pages'),
        b('explore-pages-20', 'Hai mươi trang', 'Ghé 20 trang khác nhau.', 'fa-route', 'exploration', 'uncommon', 20, 'pages'),
        b('explore-pages-50', 'Năm mươi trang', 'Ghé 50 trang khác nhau.', 'fa-map', 'exploration', 'epic', 50, 'pages', 'sakura'),
        b('explore-studio', 'Bước vào xưởng vẽ', 'Mở Bá Khí Studio.', 'fa-wand-magic-sparkles', 'exploration', 'common', 1, 'studioVisited'),
        b('explore-settings', 'Sắp xếp góc học', 'Mở trang Cài đặt.', 'fa-gear', 'exploration', 'common', 1, 'settingsVisited'),
        b('explore-profile', 'Xem hồ sơ', 'Mở trang Hồ sơ cá nhân.', 'fa-id-card', 'exploration', 'common', 1, 'profileVisited'),
        b('explore-palette', 'Bảng lệnh nhanh', 'Mở bảng lệnh (Ctrl/⌘ + K).', 'fa-terminal', 'exploration', 'uncommon', 1, 'palette', 'ancient'),
        b('explore-search', 'Người tìm kiếm', 'Dùng tìm kiếm ít nhất một lần.', 'fa-magnifying-glass', 'exploration', 'common', 1, 'searchUsed'),
        b('explore-theme', 'Đổi ánh sáng', 'Chuyển giao diện sáng/tối.', 'fa-circle-half-stroke', 'exploration', 'common', 1, 'themeToggles'),
        b('explore-badges', 'Ngắm thành tích', 'Mở danh sách badge trong hồ sơ.', 'fa-medal', 'exploration', 'uncommon', 1, 'badgesViewed'),

        /* --- Đều đặn (8) --- */
        b('consist-days-2', 'Ngày thứ hai', 'Hoạt động trong 2 ngày khác nhau.', 'fa-calendar-day', 'consistency', 'common', 2, 'days'),
        b('consist-days-3', 'Ba ngày học', 'Hoạt động trong 3 ngày khác nhau.', 'fa-calendar-days', 'consistency', 'common', 3, 'days'),
        b('consist-days-7', 'Một tuần học', 'Hoạt động trong 7 ngày khác nhau.', 'fa-calendar-week', 'consistency', 'uncommon', 7, 'days'),
        b('consist-days-14', 'Hai tuần bền bỉ', 'Hoạt động trong 14 ngày khác nhau.', 'fa-calendar', 'consistency', 'rare', 14, 'days', 'eternal'),
        b('consist-days-30', 'Một tháng học', 'Hoạt động trong 30 ngày khác nhau.', 'fa-calendar-plus', 'consistency', 'epic', 30, 'days', 'sunflower'),
        b('consist-streak-3', 'Chuỗi 3 ngày', 'Học liên tiếp 3 ngày.', 'fa-link', 'consistency', 'uncommon', 3, 'streak'),
        b('consist-streak-7', 'Chuỗi 7 ngày', 'Học liên tiếp 7 ngày.', 'fa-fire-flame-curved', 'consistency', 'rare', 7, 'streak'),
        b('consist-streak-30', 'Chuỗi 30 ngày', 'Học liên tiếp 30 ngày.', 'fa-infinity', 'consistency', 'legendary', 30, 'streak', 'crown'),

        /* --- Âm nhạc (9) --- */
        b('music-first', 'Giai điệu đầu tiên', 'Phát bài hát đầu tiên.', 'fa-music', 'music', 'common', 1, 'musicPlays'),
        b('music-10', 'Nghe nhạc khi học', 'Nghe trọn 10 lượt nhạc.', 'fa-headphones', 'music', 'common', 10, 'musicPlays'),
        b('music-50', 'Năm mươi lượt nghe', 'Nghe trọn 50 lượt nhạc.', 'fa-volume-high', 'music', 'uncommon', 50, 'musicPlays'),
        b('music-200', 'Hai trăm lượt nghe', 'Nghe trọn 200 lượt nhạc.', 'fa-record-vinyl', 'music', 'rare', 200, 'musicPlays', 'ear-cat'),
        b('music-tracks-5', 'Năm bản nhạc', 'Nghe trọn 5 bài khác nhau.', 'fa-list-music', 'music', 'common', 5, 'musicTracks'),
        b('music-shuffle', 'Ngẫu hứng', 'Bật phát ngẫu nhiên.', 'fa-shuffle', 'music', 'uncommon', 1, 'shuffleUsed', 'neon'),
        b('music-repeat', 'Lặp lại', 'Bật chế độ lặp.', 'fa-repeat', 'music', 'uncommon', 1, 'repeatUsed'),
        b('music-queue', 'Xếp hàng chờ', 'Thêm bài hát vào hàng đợi.', 'fa-layer-plus', 'music', 'uncommon', 1, 'queueUsed'),
        b('music-same-20', 'Một bài, hai mươi lần', 'Nghe trọn cùng một bản nhạc 20 lần.', 'fa-repeat', 'music', 'legendary', 20, 'sameTrack', 'ear-fox'),

        /* --- Tương tác (8) --- */
        b('inter-first-effect', 'Bắn sao băng', 'Dùng hiệu ứng sao băng lần đầu.', 'fa-meteor', 'interaction', 'common', 1, 'meteors'),
        b('inter-meteor-10', 'Mười vì sao', 'Bắn 10 sao băng.', 'fa-star', 'interaction', 'common', 10, 'meteors'),
        b('inter-meteor-100', 'Trăm vì sao', 'Bắn 100 sao băng.', 'fa-star-half-stroke', 'interaction', 'uncommon', 100, 'meteors'),
        b('inter-meteor-1000', 'Mưa sao', 'Bắn 1.000 sao băng.', 'fa-cloud-moon', 'interaction', 'epic', 1000, 'meteors', 'star'),
        b('inter-meteor-10000', 'Bão sao băng', 'Bắn 10.000 sao băng.', 'fa-meteor', 'interaction', 'legendary', 10000, 'meteors', 'horn-dragon'),
        b('inter-music-fab', 'Mở trình phát nhạc', 'Mở bảng Music Player.', 'fa-compact-disc', 'interaction', 'common', 1, 'musicOpened'),
        b('inter-focus', 'Chế độ tập trung', 'Bật chế độ tập trung khi học.', 'fa-crosshairs', 'interaction', 'uncommon', 1, 'focusUsed', 'cyber'),
        b('inter-dark-mode', 'Học trong đêm', 'Bật giao diện tối.', 'fa-moon', 'interaction', 'common', 1, 'themeToggles'),

        /* --- Hồ sơ (6) --- */
        b('social-nickname', 'Có biệt danh', 'Đặt biệt danh cho hồ sơ.', 'fa-signature', 'social', 'common', 1, 'profileNickname'),
        b('social-avatar', 'Ảnh đại diện', 'Tải ảnh đại diện lên.', 'fa-image-portrait', 'social', 'common', 1, 'profileAvatar', 'leaf'),
        b('social-banner', 'Ảnh bìa', 'Đặt ảnh bìa hồ sơ.', 'fa-panorama', 'social', 'uncommon', 1, 'profileBanner'),
        b('social-bio', 'Vài dòng giới thiệu', 'Viết giới thiệu bản thân.', 'fa-quote-left', 'social', 'common', 1, 'profileBio'),
        b('social-links-2', 'Kết nối hai liên kết', 'Thêm ít nhất 2 liên kết mạng xã hội.', 'fa-link', 'social', 'uncommon', 2, 'profileLinks'),
        b('social-frame', 'Khung avatar', 'Trang bị một khung avatar.', 'fa-crown', 'social', 'rare', 1, 'profileFrame', 'ear-bunny'),

        /* --- Sáng tạo / Studio (8) --- */
        b('studio-doc', 'Trang giấy đầu tiên', 'Lưu tài liệu đầu tiên trong Studio.', 'fa-file-lines', 'studio', 'common', 1, 'studioDocs'),
        b('studio-drawing', 'Nét vẽ đầu tiên', 'Lưu một bản vẽ trong Studio.', 'fa-paintbrush', 'studio', 'common', 1, 'studioDrawings'),
        b('studio-insert', 'Minh hoạ tài liệu', 'Chèn bản vẽ vào tài liệu Studio.', 'fa-image', 'studio', 'uncommon', 1, 'studioInserts'),
        b('studio-export', 'Chia sẻ tác phẩm', 'Xuất tài liệu hoặc ảnh từ Studio.', 'fa-file-export', 'studio', 'common', 1, 'studioExports', 'phoenix'),
        b('studio-words-500', 'Cây bút 500 từ', 'Viết một tài liệu dài 500 từ.', 'fa-feather-pointed', 'studio', 'rare', 500, 'studioWords', 'crystal'),
        b('studio-docs-5', 'Năm tài liệu', 'Lưu 5 tài liệu trong Studio.', 'fa-folder-open', 'studio', 'uncommon', 5, 'studioDocs'),
        b('studio-drawings-5', 'Năm bản vẽ', 'Lưu 5 bản vẽ trong Studio.', 'fa-palette', 'studio', 'uncommon', 5, 'studioDrawings'),
        b('studio-exports-10', 'Mười lần xuất bản', 'Xuất 10 tệp từ Studio.', 'fa-file-arrow-down', 'studio', 'rare', 10, 'studioExports', 'antler'),

        /* --- Bí mật / Hiếm (10) --- */
        b('secret-night-owl', 'Cú đêm', 'Học sau nửa đêm.', 'fa-moon', 'secret', 'secret', 1, 'nightOwl', 'star'),
        b('secret-early-bird', 'Chim sớm', 'Học trước 6 giờ sáng.', 'fa-sun', 'secret', 'secret', 1, 'earlyBird', 'frost'),
        b('secret-subjects-all', 'Mười môn', 'Mở bài học ở cả 10 môn.', 'fa-atom', 'secret', 'legendary', 10, 'subjects', 'sakura'),
        b('secret-notes-100', 'Sổ tay trăm trang', 'Tạo 100 ghi chú học tập.', 'fa-book-bookmark', 'secret', 'epic', 100, 'notes', 'wreath'),
        b('secret-bookmarks-50', 'Nhà sưu tầm', 'Lưu 50 đánh dấu.', 'fa-bookmark', 'secret', 'epic', 50, 'bookmarks', 'gothic'),
        b('secret-mastered-50', 'Bậc thầy ôn tập', 'Làm chủ 50 câu từng sai.', 'fa-gem', 'secret', 'legendary', 50, 'mastered', 'ear-wolf'),
        b('secret-one-subject-10', 'Chuyên sâu một môn', 'Mở 10 bài học trong cùng một môn.', 'fa-microscope', 'secret', 'rare', 10, 'lessonsOneSubject', 'galactic'),
        b('secret-collector-40', 'Bộ sưu tập 40', 'Mở khóa 40 badge.', 'fa-trophy', 'secret', 'legendary', 40, 'unlockedCount', 'sunflower'),
        b('secret-collector-60', 'Bộ sưu tập 60', 'Mở khóa 60 badge.', 'fa-trophy-star', 'secret', 'legendary', 60, 'unlockedCount', 'horn-dragon'),
        b('secret-completionist', 'Người sưu tầm trọn vẹn', 'Mở khóa 73 badge tự động.', 'fa-diamond', 'secret', 'legendary', 73, 'unlockedCount', 'crown'),

        /* --- Chỉ Administrator trao (2) --- */
        admin('admin-chosen', 'Được chọn', 'Badge đặc biệt do giáo viên trao tặng.', 'fa-hand-holding-heart'),
        admin('admin-legend', 'Huyền thoại Bá Khí', 'Badge cao nhất, chỉ Administrator trao tặng.', 'fa-crown'),

        /* --- Độc quyền: Developer (2) + Founder (1) ---
           Chỉ Administrator trao; server kiểm tra quyền sở hữu khung tương ứng. */
        {
            id: 'dev-exclusive-aurora', name: 'Developer · Cực quang',
            desc: 'Khung Cực quang dành riêng cho Developer của Bá Khí.',
            icon: 'fa-code', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'dev-aurora', adminOnly: true, exclusive: 'dev'
        },
        {
            id: 'dev-exclusive-void', name: 'Developer · Hư không',
            desc: 'Khung Hư không dành riêng cho Developer của Bá Khí.',
            icon: 'fa-terminal', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'dev-void', adminOnly: true, exclusive: 'dev'
        },
        {
            id: 'founder', name: 'Người sáng lập',
            desc: 'Danh hiệu tối cao dành cho người sáng lập Bá Khí — Minh Trúc.',
            icon: 'fa-crown', category: 'secret', rarity: 'secret', goal: 1, key: null,
            frame: 'founder', adminOnly: true, exclusive: 'founder'
        }
    ];

    var BY_ID = {};
    CATALOG.forEach(function (x) { BY_ID[x.id] = x; });

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
            if (x.key === 'unlockedCount' && !x.adminOnly) {
                /* goal 40/60/73 dùng đếm badge thường */
            }
            cur = Math.max(0, Math.min(x.goal, cur));
            return {
                id: x.id, name: x.name, desc: x.desc, icon: x.icon,
                category: x.category, rarity: x.rarity, goal: x.goal,
                current: cur, pct: x.goal ? Math.round((cur / x.goal) * 100) : 0,
                unlockedAt: t.unlocked[x.id] || null,
                adminOnly: x.adminOnly,
                frame: x.frame,
                server: t.granted[x.id] || null
            };
        });
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
                cur = Object.keys(t.unlocked).filter(function (id) { return BY_ID[id] && !BY_ID[id].adminOnly; }).length;
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
    function applyServer(list) {
        if (!Array.isArray(list) || !list.length) return 0;
        var t = load();
        var added = 0;
        list.forEach(function (row) {
            if (!row) return;
            var id = String(row.badge_id || row.id || '').slice(0, 64);
            var def = BY_ID[id];
            if (!def) return;
            /* Badge Administrator chỉ hợp lệ khi máy chủ ghi rõ kind='admin'. */
            if (def.adminOnly && row.kind !== 'admin') return;
            if (t.unlocked[id]) return;
            var at = Date.parse(row.awarded_at);
            if (!isFinite(at) || at <= 0) at = Number(row.awarded_at) || Date.now();
            t.unlocked[id] = at;
            if (def.adminOnly || row.kind === 'admin') {
                t.granted[id] = {
                    by: String(row.awarded_by || 'admin').slice(0, 60),
                    at: at,
                    reason: String(row.reason || '').slice(0, 200)
                };
            }
            added++;
        });
        if (added) {
            save();
            emit('sync', { badges: [] });
            check({ silent: true });
        }
        return added;
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
        markDay();
        try {
            var path = global.location.pathname.replace(/\/index\.html$/, '/').replace(/(\/[^/]+\/[^/]+)$/, '$1');
            trackPage(path);
        } catch (e) { }
        var h = new Date().getHours();
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
        progress: progress,
        check: check,
        metrics: metrics,
        unlockedCount: unlockedCount,
        trackPage: trackPage,
        trackListen: trackListen,
        bumpCounter: bumpCounter,
        markDay: markDay,
        applyGrants: applyGrants,
        applyServer: applyServer,
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
