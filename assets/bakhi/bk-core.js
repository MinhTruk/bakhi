/* =========================================================================
   Bá Khí — bk-core.js
   Lớp dữ liệu local-first + UI kit dùng chung.

   - Kho dữ liệu có phiên bản, validate, migrate, tự phục hồi khi hỏng.
   - Không sửa nội dung giáo dục; chỉ lưu hoạt động học tập của người dùng.
   - Không có bất kỳ bộ đếm thời gian / áp lực thi cử nào.

   Công khai: window.BK
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BK && global.BK.__loaded) return;

    var BK = global.BK = global.BK || {};
    BK.__loaded = true;
    BK.version = '2.0.0';

    var KEY = 'bakhiLearn.v1';
    var SCHEMA = 1;
    var LIMITS = { practice: 5000, history: 600, notes: 500, bookmarks: 500, review: 800 };

    /* ---------------------------------------------------------------------
       Tiện ích
       ------------------------------------------------------------------ */
    function uid(prefix) {
        return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    function now() { return Date.now(); }
    function clamp(n, a, b) { n = Number(n); return isFinite(n) ? Math.min(b, Math.max(a, n)) : a; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    /** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
    function norm(s) {
        return String(s == null ? '' : s).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
    }
    function debounce(fn, ms) {
        var t;
        return function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }
    /** Hash chuỗi 32-bit, ổn định — dùng làm khoá câu hỏi. */
    function hash(str) {
        var h = 5381, i = 0, s = String(str);
        for (; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
        return 'q' + h.toString(36);
    }
    function dayKey(ts) {
        var d = new Date(ts || now());
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function fmtDate(ts) {
        if (!ts) return '—';
        try { return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
        catch (e) { return '—'; }
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        try {
            return new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return '—'; }
    }
    function download(name, text, mime) {
        try {
            var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = D.createElement('a');
            a.href = url; a.download = name;
            D.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
            return true;
        } catch (e) { return false; }
    }
    function copy(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
        return Promise.reject(new Error('unsupported'));
    }
    function basePath() {
        var s = D.currentScript;
        if (!s && D.scripts) {
            for (var i = D.scripts.length - 1; i >= 0; i--) {
                if (/assets\/bakhi\/bk-core\.js/.test(D.scripts[i].src || '')) { s = D.scripts[i]; break; }
            }
        }
        var src = (s && s.src) || '';
        var i = src.indexOf('/assets/bakhi/');
        return i >= 0 ? src.slice(0, i + 1) : './';
    }

    /* ---------------------------------------------------------------------
       Môn học (chỉ là nhãn hiển thị, không phải nội dung giáo dục)
       ------------------------------------------------------------------ */
    var SUBJECTS = {
        ly: { name: 'Vật Lý', icon: 'fa-atom', color: '#a855f7' },
        su: { name: 'Lịch Sử', icon: 'fa-landmark', color: '#f59e0b' },
        tin: { name: 'Tin Học', icon: 'fa-laptop-code', color: '#0ea5e9' },
        toan: { name: 'Toán Học', icon: 'fa-calculator', color: '#3b82f6' },
        anh: { name: 'Tiếng Anh', icon: 'fa-language', color: '#6366f1' },
        van: { name: 'Ngữ Văn', icon: 'fa-book-open', color: '#f43f5e' },
        hoa: { name: 'Hóa Học', icon: 'fa-flask', color: '#10b981' },
        sinh: { name: 'Sinh Học', icon: 'fa-dna', color: '#14b8a6' },
        gdqp: { name: 'GDQP', icon: 'fa-shield-halved', color: '#22c55e' },
        gddp: { name: 'GDĐP', icon: 'fa-map-location-dot', color: '#f97316' }
    };
    var EXAMS = {
        'kttx/gk1': 'KTTX · Giữa kỳ 1', 'kttx/ck1': 'KTTX · Cuối kỳ 1',
        'kttx/gk2': 'KTTX · Giữa kỳ 2', 'kttx/ck2': 'KTTX · Cuối kỳ 2',
        ktgk1: 'KTGK · Giữa kỳ 1', ktck1: 'KTCK · Cuối kỳ 1',
        ktgk2: 'KTGK · Giữa kỳ 2', ktck2: 'KTCK · Cuối kỳ 2'
    };
    /** Đoán môn học từ đường dẫn trang (…/ktgk1/ly/ly1.html). */
    function subjectOf(pathname) {
        var parts = String(pathname || (global.location && location.pathname) || '').split('/').filter(Boolean);
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].toLowerCase();
            if (SUBJECTS[p]) return p;
        }
        return 'khac';
    }
    function subjectName(id) { return (SUBJECTS[id] && SUBJECTS[id].name) || 'Khác'; }
    function subjectColor(id) { return (SUBJECTS[id] && SUBJECTS[id].color) || '#64748b'; }
    function lessonOf(pathname) {
        var p = String(pathname || location.pathname || '');
        var parts = p.split('/').filter(Boolean);
        var file = parts.pop() || 'index.html';
        var sub = subjectOf(p);
        var examKey = '';
        for (var i = 0; i < parts.length; i++) {
            var two = parts.slice(i, i + 2).join('/');
            if (EXAMS[two]) { examKey = two; break; }
            if (EXAMS[parts[i]]) { examKey = parts[i]; break; }
        }
        var label = '';
        if (D.title) label = D.title.replace(/\s*[-|–]\s*Bá Khí.*$/i, '').trim();
        if (!label) label = file.replace(/\.html?$/i, '');
        return {
            subject: sub, subjectName: subjectName(sub), exam: examKey,
            examName: EXAMS[examKey] || '', file: file, path: p,
            title: label || file, url: p
        };
    }

    /* ---------------------------------------------------------------------
       Kho dữ liệu
       ------------------------------------------------------------------ */
    function emptyState() {
        return {
            v: SCHEMA, createdAt: now(), updatedAt: now(),
            practice: [], review: [], notes: [], bookmarks: [], history: [],
            achievements: { unlocked: {}, counters: {} },
            prefs: {
                focus: false, fontSize: 100, ambient: false,
                spaced: { again: 1, hard: 3, good: 7, easy: 14, max: 90 },
                ai: { endpoint: '', model: '' },
                cloud: { url: '', anonKey: '' }
            },
            meta: { version: '2.0.0' }
        };
    }

    function arr(v) { return Array.isArray(v) ? v : []; }
    function str(v, max) { return String(v == null ? '' : v).slice(0, max || 20000); }
    function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

    /** Chuẩn hoá & làm sạch dữ liệu đọc từ localStorage (không tin dữ liệu bên ngoài). */
    function sanitize(raw) {
        var s = emptyState();
        if (!raw || typeof raw !== 'object') return s;
        s.createdAt = num(raw.createdAt, s.createdAt);
        s.updatedAt = num(raw.updatedAt, now());

        s.practice = arr(raw.practice).filter(function (p) { return p && typeof p === 'object'; }).slice(-LIMITS.practice).map(function (p) {
            return {
                id: str(p.id, 64) || uid('pr'), ts: num(p.ts, now()),
                subject: str(p.subject, 24), questionId: str(p.questionId, 80),
                question: str(p.question, 4000), topic: str(p.topic, 200),
                difficulty: str(p.difficulty, 32), correct: !!p.correct,
                source: str(p.source, 300), lesson: str(p.lesson, 200)
            };
        });

        s.review = arr(raw.review).filter(function (r) { return r && typeof r === 'object'; }).slice(-LIMITS.review).map(function (r) {
            return {
                id: str(r.id, 64) || uid('rv'), key: str(r.key, 80) || hash(str(r.question)),
                subject: str(r.subject, 24), question: str(r.question, 4000),
                options: arr(r.options).slice(0, 8).map(function (o) { return str(o, 800); }),
                answer: (typeof r.answer === 'number' || typeof r.answer === 'string') ? r.answer : null,
                explanation: str(r.explanation, 4000),
                topic: str(r.topic, 200), difficulty: str(r.difficulty, 32),
                source: str(r.source, 300),
                wrong: num(r.wrong, 1), right: num(r.right, 0),
                mastered: !!r.mastered, createdAt: num(r.createdAt, now()),
                lastSeen: num(r.lastSeen, now()), nextReview: num(r.nextReview, now()),
                history: arr(r.history).slice(-30).map(function (h) {
                    return { ts: num(h && h.ts, now()), correct: !!(h && h.correct) };
                })
            };
        });

        s.notes = arr(raw.notes).filter(function (n) { return n && typeof n === 'object'; }).slice(-LIMITS.notes).map(function (n) {
            return {
                id: str(n.id, 64) || uid('nt'), title: str(n.title, 200) || 'Ghi chú',
                body: str(n.body, 40000), subject: str(n.subject, 24),
                questionId: str(n.questionId, 80), category: str(n.category, 60) || 'Chung',
                pinned: !!n.pinned, createdAt: num(n.createdAt, now()), updatedAt: num(n.updatedAt, now())
            };
        });

        s.bookmarks = arr(raw.bookmarks).filter(function (b) { return b && typeof b === 'object'; }).slice(-LIMITS.bookmarks).map(function (b) {
            return {
                id: str(b.id, 64) || uid('bm'),
                type: ['question', 'lesson', 'subject', 'resource'].indexOf(b.type) >= 0 ? b.type : 'lesson',
                ref: str(b.ref, 500), title: str(b.title, 300) || 'Đánh dấu',
                subject: str(b.subject, 24), folder: str(b.folder, 80) || 'Chung',
                url: str(b.url, 1000), createdAt: num(b.createdAt, now())
            };
        });

        s.history = arr(raw.history).filter(function (h) { return h && typeof h === 'object'; }).slice(-LIMITS.history).map(function (h) {
            return {
                id: str(h.id, 64) || uid('hs'), ts: num(h.ts, now()),
                kind: ['lesson', 'practice', 'review'].indexOf(h.kind) >= 0 ? h.kind : 'lesson',
                title: str(h.title, 300), url: str(h.url, 1000),
                subject: str(h.subject, 24), meta: str(h.meta, 500)
            };
        });

        s.achievements = { unlocked: {}, counters: {} };
        if (raw.achievements && typeof raw.achievements === 'object') {
            var u = raw.achievements.unlocked || {};
            Object.keys(u).slice(0, 100).forEach(function (k) { s.achievements.unlocked[str(k, 60)] = num(u[k], now()); });
            var c = raw.achievements.counters || {};
            Object.keys(c).slice(0, 100).forEach(function (k) { s.achievements.counters[str(k, 60)] = num(c[k], 0); });
        }

        if (raw.prefs && typeof raw.prefs === 'object') {
            var p = raw.prefs;
            s.prefs.focus = !!p.focus;
            s.prefs.fontSize = clamp(p.fontSize, 85, 160);
            s.prefs.ambient = !!p.ambient;
            if (p.spaced && typeof p.spaced === 'object') {
                ['again', 'hard', 'good', 'easy', 'max'].forEach(function (k) { s.prefs.spaced[k] = clamp(p.spaced[k], 1, 365); });
            }
            if (p.ai && typeof p.ai === 'object') {
                s.prefs.ai.endpoint = str(p.ai.endpoint, 500);
                s.prefs.ai.model = str(p.ai.model, 100);
            }
            if (p.cloud && typeof p.cloud === 'object') {
                s.prefs.cloud.url = str(p.cloud.url, 300);
                s.prefs.cloud.anonKey = str(p.cloud.anonKey, 500);
            }
        }

        // Migration hook cho các phiên bản sau.
        var from = num(raw.v, 0);
        if (from < SCHEMA) s.updatedAt = now();
        return s;
    }

    var listeners = {};
    function on(evt, fn) {
        (listeners[evt] = listeners[evt] || []).push(fn);
        return function () { off(evt, fn); };
    }
    function off(evt, fn) {
        var l = listeners[evt] || [];
        var i = l.indexOf(fn);
        if (i >= 0) l.splice(i, 1);
    }
    function emit(evt, payload) {
        (listeners[evt] || []).slice().forEach(function (fn) {
            try { fn(payload); } catch (e) { console.warn('[BK] listener error', e); }
        });
    }

    var cache = null;
    function load() {
        if (cache) return cache;
        var raw = null;
        try { raw = global.localStorage.getItem(KEY); } catch (e) { raw = null; }
        if (!raw) { cache = emptyState(); return cache; }
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        if (!parsed || typeof parsed !== 'object') {
            try {
                global.localStorage.setItem('bakhiLearn.corrupt.' + now(), raw.slice(0, 200000));
                global.localStorage.removeItem(KEY);
            } catch (e) { /* bỏ qua */ }
            cache = emptyState();
            cache.recovered = true;
            return cache;
        }
        cache = sanitize(parsed);
        return cache;
    }
    function save() {
        var s = load();
        s.updatedAt = now();
        s.v = SCHEMA;
        cap(s);
        try {
            global.localStorage.setItem(KEY, JSON.stringify(s));
            emit('save', s);
            return true;
        } catch (e) {
            console.warn('[BK] Không lưu được dữ liệu học tập', e);
            emit('error', e);
            return false;
        }
    }
    function cap(s) {
        if (s.practice.length > LIMITS.practice) s.practice = s.practice.slice(-LIMITS.practice);
        if (s.history.length > LIMITS.history) s.history = s.history.slice(-LIMITS.history);
        if (s.notes.length > LIMITS.notes) s.notes = s.notes.slice(-LIMITS.notes);
        if (s.bookmarks.length > LIMITS.bookmarks) s.bookmarks = s.bookmarks.slice(-LIMITS.bookmarks);
        if (s.review.length > LIMITS.review) s.review = s.review.slice(-LIMITS.review);
    }
    function update(fn) {
        var s = load();
        var out = fn(s);
        save();
        return out;
    }
    function reset() {
        cache = emptyState();
        save();
        emit('reset', cache);
    }

    /* ---------------------------------------------------------------------
       Ghi nhận hoạt động học tập
       ------------------------------------------------------------------ */
    function pushHistory(s, entry) {
        s.history.push(Object.assign({ id: uid('hs'), ts: now() }, entry));
    }

    function reviewKey(subject, question, questionId) {
        return hash(subject + '|' + (questionId || '') + '|' + String(question).slice(0, 300));
    }

    function nextInterval(prefs, performance, current) {
        var sp = prefs.spaced;
        var base = performance === 'again' ? sp.again : performance === 'hard' ? sp.hard : performance === 'easy' ? sp.easy : sp.good;
        var grow = current ? Math.min(sp.max, current * 2) : base;
        return Math.max(sp.again, Math.min(sp.max, performance === 'again' ? sp.again : grow));
    }

    /**
     * Ghi nhận một lần luyện tập.
     * payload: { question, questionId, subject, topic, difficulty, correct,
     *            options, answer, explanation, source, lesson, silent }
     * Không bao giờ sửa nội dung gốc: chỉ lưu bản sao văn bản để ôn tập.
     */
    function practice(payload) {
        payload = payload || {};
        var question = str(payload.question, 4000);
        if (!question) return null;
        var subject = str(payload.subject, 24) || subjectOf();
        var qid = str(payload.questionId, 80) || hash(question);
        var ts = now();

        return update(function (s) {
            s.practice.push({
                id: uid('pr'), ts: ts, subject: subject, questionId: qid,
                question: question, topic: str(payload.topic, 200),
                difficulty: str(payload.difficulty, 32), correct: !!payload.correct,
                source: str(payload.source, 300) || (global.location ? location.pathname : ''),
                lesson: str(payload.lesson, 200) || str(D.title, 200)
            });

            var key = reviewKey(subject, question, qid);
            var item = null;
            for (var i = 0; i < s.review.length; i++) {
                if (s.review[i].key === key) { item = s.review[i]; break; }
            }

            if (!payload.correct) {
                if (!item) {
                    item = {
                        id: uid('rv'), key: key, subject: subject, question: question,
                        options: arr(payload.options).slice(0, 8), answer: payload.answer == null ? null : payload.answer,
                        explanation: str(payload.explanation, 4000), topic: str(payload.topic, 200),
                        difficulty: str(payload.difficulty, 32), source: str(payload.source, 300),
                        wrong: 0, right: 0, mastered: false, createdAt: ts, lastSeen: ts,
                        nextReview: ts + 24 * 3600 * 1000, history: []
                    };
                    s.review.push(item);
                }
                item.wrong += 1;
                item.lastSeen = ts;
                item.mastered = false;
                item.history.push({ ts: ts, correct: false });
                var days = nextInterval(s.prefs, 'again', 0);
                item.nextReview = ts + days * 24 * 3600 * 1000;
            } else {
                s.achievements.counters.correct = num(s.achievements.counters.correct, 0) + 1;
                if (item && !item.options.length && arr(payload.options).length) {
                    item.options = arr(payload.options).slice(0, 8);
                    if (!item.explanation) item.explanation = str(payload.explanation, 4000);
                }
                if (item && !item.mastered) {
                    item.right += 1;
                    item.lastSeen = ts;
                    item.history.push({ ts: ts, correct: true });
                    if (item.right >= 2) {
                        item.mastered = true;
                        item.nextReview = ts + s.prefs.spaced.max * 24 * 3600 * 1000;
                    } else {
                        var d = nextInterval(s.prefs, 'good', item.wrong > 0 ? 1 : 0);
                        item.nextReview = ts + d * 24 * 3600 * 1000;
                    }
                }
            }

            s.achievements.counters.practiced = num(s.achievements.counters.practiced, 0) + 1;
            pushHistory(s, {
                kind: 'practice', title: str(payload.topic, 200) || question.slice(0, 120),
                url: (global.location && location.pathname) || '', subject: subject,
                meta: payload.correct ? 'correct' : 'incorrect'
            });
            return { correct: !!payload.correct, key: key, subject: subject };
        }) && (function () {
            if (!payload.silent) emit('practice', { subject: subject, correct: !!payload.correct });
            checkAchievements();
            return { subject: subject, correct: !!payload.correct, key: reviewKey(subject, question, qid) };
        })();
    }

    /** Đánh dấu ôn tập thủ công (không cần làm lại câu hỏi). */
    function markReview(key, performance) {
        return update(function (s) {
            var item = null;
            for (var i = 0; i < s.review.length; i++) if (s.review[i].key === key) { item = s.review[i]; break; }
            if (!item) return null;
            var ts = now();
            item.lastSeen = ts;
            if (performance === 'mastered') {
                item.mastered = true;
                item.right += 1;
                item.nextReview = ts + s.prefs.spaced.max * 24 * 3600 * 1000;
            } else {
                var cur = item.wrong > 0 ? Math.max(1, Math.round((item.nextReview - item.lastSeen) / 86400000)) : 0;
                var d = nextInterval(s.prefs, performance || 'good', cur);
                item.nextReview = ts + d * 24 * 3600 * 1000;
                if (performance === 'again') item.wrong += 1;
            }
            item.history.push({ ts: ts, correct: performance !== 'again' });
            pushHistory(s, {
                kind: 'review', title: item.question.slice(0, 120), url: item.source || '',
                subject: item.subject, meta: performance || 'good'
            });
            return item;
        });
    }

    function scheduleReview(key, dateStr) {
        var when = dateStr ? new Date(dateStr + 'T08:00:00').getTime() : NaN;
        if (!isFinite(when)) return null;
        return update(function (s) {
            for (var i = 0; i < s.review.length; i++) {
                if (s.review[i].key === key) { s.review[i].nextReview = when; return s.review[i]; }
            }
            return null;
        });
    }

    function addHistory(entry) {
        entry = entry || {};
        var saved = update(function (s) {
            var last = s.history[s.history.length - 1];
            // Tránh ghi trùng liên tiếp cùng một trang trong 10 phút.
            if (last && entry.kind === 'lesson' && last.kind === 'lesson' && last.url === str(entry.url, 1000) && now() - last.ts < 600000) return last;
            pushHistory(s, {
                kind: entry.kind || 'lesson', title: str(entry.title, 300),
                url: str(entry.url, 1000), subject: str(entry.subject, 24),
                meta: str(entry.meta, 500)
            });
            return s.history[s.history.length - 1];
        });
        checkAchievements();
        return saved;
    }

    function addNote(note) {
        note = note || {};
        var saved = update(function (s) {
            var n = {
                id: uid('nt'), title: str(note.title, 200) || 'Ghi chú',
                body: str(note.body, 40000), subject: str(note.subject, 24) || subjectOf(),
                questionId: str(note.questionId, 80), category: str(note.category, 60) || 'Chung',
                pinned: !!note.pinned, createdAt: now(), updatedAt: now()
            };
            s.notes.push(n);
            return n;
        });
        checkAchievements();
        return saved;
    }
    function updateNote(id, patch) {
        return update(function (s) {
            for (var i = 0; i < s.notes.length; i++) {
                if (s.notes[i].id === id) {
                    var n = s.notes[i];
                    if (patch.title != null) n.title = str(patch.title, 200) || n.title;
                    if (patch.body != null) n.body = str(patch.body, 40000);
                    if (patch.subject != null) n.subject = str(patch.subject, 24);
                    if (patch.category != null) n.category = str(patch.category, 60) || 'Chung';
                    if (patch.pinned != null) n.pinned = !!patch.pinned;
                    n.updatedAt = now();
                    return n;
                }
            }
            return null;
        });
    }
    function removeNote(id) {
        return update(function (s) {
            s.notes = s.notes.filter(function (n) { return n.id !== id; });
            return true;
        });
    }

    function addBookmark(bm) {
        bm = bm || {};
        var url = str(bm.url, 1000);
        var saved = update(function (s) {
            var exists = s.bookmarks.some(function (b) {
                return b.type === (bm.type || 'lesson') && b.url === url && b.ref === str(bm.ref, 500);
            });
            if (exists) return null;
            var b = {
                id: uid('bm'), type: ['question', 'lesson', 'subject', 'resource'].indexOf(bm.type) >= 0 ? bm.type : 'lesson',
                ref: str(bm.ref, 500), title: str(bm.title, 300) || 'Đánh dấu',
                subject: str(bm.subject, 24) || subjectOf(), folder: str(bm.folder, 80) || 'Chung',
                url: url, createdAt: now()
            };
            s.bookmarks.push(b);
            return b;
        });
        checkAchievements();
        return saved;
    }
    function removeBookmark(id) {
        return update(function (s) { s.bookmarks = s.bookmarks.filter(function (b) { return b.id !== id; }); return true; });
    }
    function hasBookmark(url) {
        var s = load();
        return s.bookmarks.some(function (b) { return b.url === url; });
    }

    /* ---------------------------------------------------------------------
       Tín hiệu dùng chung giữa các ứng dụng (Studio, Music, bảng lệnh…)
       Một key riêng, không lẫn vào dữ liệu học tập; chỉ đếm, không lưu nội dung.
       ------------------------------------------------------------------ */
    var SIGNALS_KEY = 'bakhiSignals.v1';
    var SIGNAL_CAP = 999999;
    function emptySignals() {
        return {
            v: 1, updatedAt: now(),
            studio: { docs: 0, drawings: 0, exports: 0, inserts: 0, words: 0 },
            music: { plays: 0 },
            ui: { palette: 0, searches: 0 },
            backup: { exports: 0 }
        };
    }
    function readSignals() {
        var out = emptySignals();
        var raw = null;
        try { raw = global.localStorage.getItem(SIGNALS_KEY); } catch (e) { raw = null; }
        if (!raw) return out;
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        if (!parsed || typeof parsed !== 'object') return out;
        Object.keys(out).forEach(function (k) {
            if (!out[k] || typeof out[k] !== 'object') return;
            var src = parsed[k];
            if (!src || typeof src !== 'object') return;
            Object.keys(out[k]).forEach(function (kk) {
                out[k][kk] = Math.max(0, Math.min(SIGNAL_CAP, num(src[kk], 0)));
            });
        });
        return out;
    }
    function writeSignals(sig) {
        sig.v = 1;
        sig.updatedAt = now();
        try { global.localStorage.setItem(SIGNALS_KEY, JSON.stringify(sig)); return true; }
        catch (e) { return false; }
    }
    function signalPath(path) {
        var parts = String(path || '').split('.');
        if (parts.length !== 2) return null;
        return parts;
    }
    /** Cộng thêm một tín hiệu, ví dụ bumpSignal('studio.docs'). */
    function bumpSignal(path, amount) {
        var p = signalPath(path);
        var sig = readSignals();
        if (!p || !sig[p[0]] || !(p[1] in sig[p[0]])) return sig;
        var add = amount == null ? 1 : num(amount, 0);
        sig[p[0]][p[1]] = Math.max(0, Math.min(SIGNAL_CAP, num(sig[p[0]][p[1]], 0) + add));
        writeSignals(sig);
        emit('signals', sig);
        return sig;
    }
    /** Ghi giá trị lớn nhất đã đạt (dùng cho số từ của một tài liệu Studio). */
    function setSignalMax(path, value) {
        var p = signalPath(path);
        var sig = readSignals();
        if (!p || !sig[p[0]] || !(p[1] in sig[p[0]])) return sig;
        var v = Math.max(0, Math.min(SIGNAL_CAP, num(value, 0)));
        if (v <= num(sig[p[0]][p[1]], 0)) return sig;
        sig[p[0]][p[1]] = v;
        writeSignals(sig);
        emit('signals', sig);
        return sig;
    }

    /* ---------------------------------------------------------------------
       Thành tích — chỉ dựa trên hoạt động học thật, không có streak/áp lực
       ------------------------------------------------------------------ */
    /* Chỉ giữ mốc có hành động rõ ràng trong giao diện và dữ liệu luôn được ghi lại:
       mở bài học (lịch sử), tạo ghi chú, đánh dấu, đánh dấu thành thạo ở tab Ôn tập.
       Đã loại các mốc phụ thuộc vào việc trang bài học có tự bắt được câu trả lời hay
       không (50/100 câu, độ chính xác 80%, ôn đúng 10 lần) — người học không có cách
       chủ động hoàn thành nếu trang đó không có ngân hàng câu hỏi được nhận diện. */
    function lessonHistory(s) {
        return s.history.filter(function (h) { return h.kind === 'lesson' && h.url; });
    }
    function lessonUrls(s) { return uniq(lessonHistory(s).map(function (h) { return h.url; })); }
    function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
    function masteredCount(s) { return s.review.filter(function (r) { return r.mastered; }).length; }

    var ACH_GROUPS = ['Học tập', 'Luyện tập', 'Sổ tay', 'Studio', 'Khám phá'];
    function ach(id, name, icon, desc, group, goal, value) {
        return {
            id: id, name: name, icon: icon, desc: desc, group: group, goal: goal,
            value: value,
            test: function (s) {
                try { return value(s, readSignals()) >= goal; } catch (e) { return false; }
            }
        };
    }

    /* 30 mốc, chia 5 nhóm. Mọi mốc đều gắn với một hành động người học tự làm được:
       mở bài, làm câu hỏi, tạo ghi chú/đánh dấu, ôn tập, dùng Studio, nghe nhạc,
       dùng bảng lệnh, xuất sao lưu. Không mốc nào phụ thuộc thời gian/chuỗi ngày. */
    var ACHIEVEMENTS = [
        ach('first-lesson', 'Bài học đầu tiên', 'fa-book-open', 'Mở bài học đầu tiên.', 'Học tập', 1, function (s) { return lessonHistory(s).length; }),
        ach('lessons-5', '5 bài học', 'fa-book', 'Mở 5 bài học khác nhau.', 'Học tập', 5, function (s) { return lessonUrls(s).length; }),
        ach('lessons-15', '15 bài học', 'fa-book-open-reader', 'Mở 15 bài học khác nhau.', 'Học tập', 15, function (s) { return lessonUrls(s).length; }),
        ach('lessons-30', '30 bài học', 'fa-graduation-cap', 'Mở 30 bài học khác nhau.', 'Học tập', 30, function (s) { return lessonUrls(s).length; }),
        ach('subjects-3', 'Khám phá 3 môn', 'fa-layer-group', 'Mở bài học ở 3 môn trở lên.', 'Học tập', 3, function (s) { return uniq(lessonHistory(s).map(function (h) { return h.subject; })).length; }),
        ach('subjects-5', 'Khám phá 5 môn', 'fa-shapes', 'Mở bài học ở 5 môn trở lên.', 'Học tập', 5, function (s) { return uniq(lessonHistory(s).map(function (h) { return h.subject; })).length; }),

        ach('first-question', 'Câu hỏi đầu tiên', 'fa-circle-question', 'Luyện câu hỏi đầu tiên.', 'Luyện tập', 1, function (s) { return s.practice.length; }),
        ach('practice-25', '25 lượt luyện', 'fa-dumbbell', 'Hoàn thành 25 lượt luyện tập.', 'Luyện tập', 25, function (s) { return s.practice.length; }),
        ach('practice-100', '100 lượt luyện', 'fa-fire', 'Hoàn thành 100 lượt luyện tập.', 'Luyện tập', 100, function (s) { return s.practice.length; }),
        ach('correct-15', '15 câu đúng', 'fa-circle-check', 'Trả lời đúng 15 câu hỏi.', 'Luyện tập', 15, function (s) { return num(s.achievements.counters.correct, 0); }),
        ach('first-review', 'Câu cần ôn đầu tiên', 'fa-rotate', 'Có câu hỏi đầu tiên trong danh sách ôn tập.', 'Luyện tập', 1, function (s) { return s.review.length; }),
        ach('review-queue-10', 'Danh sách ôn 10 câu', 'fa-list-check', 'Giữ 10 câu trong danh sách cần ôn.', 'Luyện tập', 10, function (s) { return s.review.length; }),
        ach('first-mastered', 'Làm chủ một câu', 'fa-check-double', 'Đánh dấu thành thạo một câu từng sai.', 'Luyện tập', 1, function (s) { return masteredCount(s); }),
        ach('mastered-3', 'Làm chủ 3 câu', 'fa-award', 'Đánh dấu thành thạo 3 câu từng làm sai.', 'Luyện tập', 3, function (s) { return masteredCount(s); }),
        ach('mastered-10', 'Làm chủ 10 câu', 'fa-medal', 'Đánh dấu thành thạo 10 câu từng làm sai.', 'Luyện tập', 10, function (s) { return masteredCount(s); }),

        ach('first-note', 'Ghi chú đầu tiên', 'fa-pen-nib', 'Tạo ghi chú đầu tiên.', 'Sổ tay', 1, function (s) { return s.notes.length; }),
        ach('notes-5', 'Sổ tay 5 ghi chú', 'fa-book', 'Tạo 5 ghi chú học tập.', 'Sổ tay', 5, function (s) { return s.notes.length; }),
        ach('notes-10', 'Sổ tay 10 ghi chú', 'fa-book-bookmark', 'Tạo 10 ghi chú học tập.', 'Sổ tay', 10, function (s) { return s.notes.length; }),
        ach('notes-25', 'Sổ tay 25 ghi chú', 'fa-book-open', 'Tạo 25 ghi chú học tập.', 'Sổ tay', 25, function (s) { return s.notes.length; }),
        ach('first-bookmark', 'Đánh dấu đầu tiên', 'fa-bookmark', 'Lưu đánh dấu đầu tiên.', 'Sổ tay', 1, function (s) { return s.bookmarks.length; }),
        ach('bookmarks-5', 'Bộ sưu tập 5 đánh dấu', 'fa-folder-open', 'Lưu 5 bài học/ghi chú vào đánh dấu.', 'Sổ tay', 5, function (s) { return s.bookmarks.length; }),

        ach('studio-doc', 'Trang giấy đầu tiên', 'fa-file-lines', 'Lưu tài liệu đầu tiên trong Bá Khí Studio.', 'Studio', 1, function (s, g) { return g.studio.docs; }),
        ach('studio-drawing', 'Nét vẽ đầu tiên', 'fa-paintbrush', 'Lưu một bản vẽ trong Bá Khí Studio.', 'Studio', 1, function (s, g) { return g.studio.drawings; }),
        ach('studio-insert', 'Minh hoạ tài liệu', 'fa-image', 'Chèn bản vẽ vào tài liệu Studio.', 'Studio', 1, function (s, g) { return g.studio.inserts; }),
        ach('studio-export', 'Chia sẻ tác phẩm', 'fa-file-export', 'Xuất tài liệu hoặc ảnh từ Studio.', 'Studio', 1, function (s, g) { return g.studio.exports; }),
        ach('studio-words-500', 'Cây bút 500 từ', 'fa-feather-pointed', 'Viết một tài liệu dài 500 từ trong Studio.', 'Studio', 500, function (s, g) { return g.studio.words; }),

        ach('music-first', 'Giai điệu đầu tiên', 'fa-music', 'Phát bài hát đầu tiên trong Music Player.', 'Khám phá', 1, function (s, g) { return g.music.plays; }),
        ach('music-10', 'Nghe nhạc khi học', 'fa-headphones', 'Phát 10 lượt nhạc trong Music Player.', 'Khám phá', 10, function (s, g) { return g.music.plays; }),
        ach('palette-user', 'Người dùng bảng lệnh', 'fa-terminal', 'Mở bảng lệnh nhanh (Ctrl/⌘ + K).', 'Khám phá', 1, function (s, g) { return g.ui.palette; }),
        ach('backup-export', 'Sao lưu dữ liệu', 'fa-download', 'Xuất một bản sao lưu dữ liệu học tập.', 'Khám phá', 1, function (s, g) { return g.backup.exports; })
    ];

    function accuracy(s) {
        s = s || load();
        var total = s.practice.length;
        var correct = s.practice.filter(function (p) { return p.correct; }).length;
        return { total: total, correct: correct, wrong: total - correct, pct: total ? Math.round((correct / total) * 100) : 0 };
    }

    var lastUnlocked = [];
    function checkAchievements() {
        var s = load();
        var fresh = [];
        ACHIEVEMENTS.forEach(function (a) {
            if (!s.achievements.unlocked[a.id]) {
                var ok = false;
                try { ok = !!a.test(s); } catch (e) { ok = false; }
                if (ok) { s.achievements.unlocked[a.id] = now(); fresh.push(a); }
            }
        });
        lastUnlocked = fresh.map(function (a) { return a.id; });
        if (fresh.length) {
            save();
            emit('achievements', s.achievements);
            /* Thông báo mở khoá: gộp khi nhiều mốc đến cùng lúc. */
            var names = fresh.slice(0, 3).map(function (a) { return a.name; }).join(', ');
            if (fresh.length > 3) names += ' và ' + (fresh.length - 3) + ' mốc khác';
            toast(fresh.length === 1 ? 'Mở khoá thành tích: ' + names : 'Mở khoá ' + fresh.length + ' thành tích: ' + names, 'success');
        }
        return s.achievements;
    }

    /** Tiến độ từng mốc cho giao diện: current/goal, đã đạt hay chưa, nhóm. */
    function achievementProgress() {
        var s = load();
        var sig = readSignals();
        return ACHIEVEMENTS.map(function (a) {
            var cur = 0;
            try { cur = Math.round(num(a.value(s, sig), 0)); } catch (e) { cur = 0; }
            cur = Math.max(0, Math.min(a.goal, cur));
            return {
                id: a.id, name: a.name, desc: a.desc, icon: a.icon, group: a.group,
                goal: a.goal, current: cur, pct: a.goal ? Math.round((cur / a.goal) * 100) : 0,
                unlockedAt: s.achievements.unlocked[a.id] || null
            };
        });
    }

    /** Ba mốc gần đạt nhất (chưa mở khoá), dùng cho phần Tổng quan. */
    function achievementNext(limit) {
        return achievementProgress()
            .filter(function (a) { return !a.unlockedAt && a.current > 0; })
            .sort(function (a, b) { return b.pct - a.pct || b.current - a.current; })
            .slice(0, limit || 3);
    }

    /* ---------------------------------------------------------------------
       UI kit
       ------------------------------------------------------------------ */
    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function $(sel, root) { return (root || D).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }

    function toast(message, type) {
        var host = D.getElementById('bkToastHost');
        if (!host) {
            host = el('div', 'bk-toast-host');
            host.id = 'bkToastHost';
            host.setAttribute('aria-live', 'polite');
            (D.body || D.documentElement).appendChild(host);
        }
        var t = el('div', 'bk-toast bk-toast-' + (type || 'info'));
        var icon = el('i', 'fa-solid ' + (type === 'error' ? 'fa-circle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info'));
        icon.setAttribute('aria-hidden', 'true');
        t.appendChild(icon);
        t.appendChild(el('span', null, message));
        host.appendChild(t);
        setTimeout(function () {
            t.classList.add('bk-toast-out');
            setTimeout(function () { t.remove(); }, 260);
        }, type === 'error' ? 4200 : 3000);
    }

    var modalStack = [];
    function modal(opts) {
        opts = opts || {};
        var overlay = el('div', 'bk-overlay');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        if (opts.labelledBy) overlay.setAttribute('aria-labelledby', opts.labelledBy);

        var panel = el('div', 'bk-modal' + (opts.wide ? ' bk-modal-wide' : '') + (opts.className ? ' ' + opts.className : ''));
        var head = el('div', 'bk-modal-head');
        var h = el('h2', 'bk-modal-title', opts.title || '');
        if (opts.labelledBy) h.id = opts.labelledBy;
        head.appendChild(h);
        var x = el('button', 'bk-icon-btn');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng');
        x.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        head.appendChild(x);
        panel.appendChild(head);

        if (opts.body) {
            if (typeof opts.body === 'string') {
                var b = el('div', 'bk-modal-body');
                b.innerHTML = opts.body;
                panel.appendChild(b);
            } else {
                opts.body.classList.add('bk-modal-body');
                panel.appendChild(opts.body);
            }
        }

        if (opts.actions && opts.actions.length) {
            var foot = el('div', 'bk-modal-foot');
            opts.actions.forEach(function (a) {
                var btn = el('button', 'bk-btn' + (a.variant ? ' bk-btn-' + a.variant : ''), a.label);
                btn.type = 'button';
                btn.addEventListener('click', function () { if (a.onClick) a.onClick(close); else close(); });
                foot.appendChild(btn);
            });
            panel.appendChild(foot);
        }

        overlay.appendChild(panel);
        (D.body || D.documentElement).appendChild(overlay);

        var lastFocus = D.activeElement;
        var closed = false;
        function close(value) {
            if (closed) return;
            closed = true;
            overlay.classList.add('bk-overlay-out');
            document.removeEventListener('keydown', onKey, true);
            setTimeout(function () {
                overlay.remove();
                modalStack = modalStack.filter(function (m) { return m !== close; });
                if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { } }
            }, 160);
            if (opts.onClose) opts.onClose(value);
        }
        function onKey(e) {
            if (e.key === 'Escape' && modalStack[modalStack.length - 1] === close) {
                e.preventDefault(); e.stopPropagation(); close();
            }
            if (e.key === 'Tab') trapFocus(e, panel);
        }
        modalStack.push(close);
        document.addEventListener('keydown', onKey, true);
        x.addEventListener('click', function () { close(); });
        overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && opts.dismissable !== false) close(); });

        var focusTarget = panel.querySelector('[autofocus],input,textarea,button');
        setTimeout(function () { if (focusTarget && focusTarget.focus) focusTarget.focus(); }, 30);
        return { close: close, panel: panel, overlay: overlay };
    }

    function trapFocus(e, root) {
        var f = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', root)
            .filter(function (n) { return n.offsetParent !== null || n === D.activeElement; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && D.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && D.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function confirm(opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var body = el('div');
            body.appendChild(el('p', 'bk-muted', opts.message || 'Bạn chắc chắn chứ?'));
            var m = modal({
                title: opts.title || 'Xác nhận',
                body: body,
                actions: [
                    { label: opts.cancel || 'Huỷ', variant: 'ghost', onClick: function (close) { close(); resolve(false); } },
                    { label: opts.ok || 'Đồng ý', variant: opts.danger ? 'danger' : 'primary', onClick: function (close) { close(); resolve(true); } }
                ],
                onClose: function () { resolve(false); }
            });
            setTimeout(function () { if (m) m.panel.querySelector('.bk-modal-foot .bk-btn:last-child').focus(); }, 30);
        });
    }

    /** Markdown an toàn: escape toàn bộ trước, sau đó chỉ bật một tập cú pháp nhỏ. */
    function markdown(src) {
        var text = esc(src);
        var lines = text.split(/\r?\n/);
        var html = [], inList = false, inCode = false, code = [];

        function inline(s) {
            return s
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
                .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        }
        function closeList() { if (inList) { html.push('</ul>'); inList = false; } }

        lines.forEach(function (line) {
            if (/^```/.test(line)) {
                if (!inCode) { inCode = true; code = []; closeList(); }
                else { html.push('<pre><code>' + code.join('\n') + '</code></pre>'); inCode = false; }
                return;
            }
            if (inCode) { code.push(line); return; }
            var m;
            if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
                closeList(); html.push('<h' + (m[1].length + 2) + '>' + inline(m[2]) + '</h' + (m[1].length + 2) + '>');
            } else if (/^\s*[-*]\s+/.test(line)) {
                if (!inList) { html.push('<ul>'); inList = true; }
                html.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>');
            } else if (/^\s*>\s?/.test(line)) {
                closeList(); html.push('<blockquote>' + inline(line.replace(/^\s*>\s?/, '')) + '</blockquote>');
            } else if (!line.trim()) {
                closeList();
            } else {
                closeList(); html.push('<p>' + inline(line) + '</p>');
            }
        });
        if (inCode && code.length) html.push('<pre><code>' + code.join('\n') + '</code></pre>');
        closeList();
        return html.join('');
    }

    /* Nạp CSS dùng chung một lần. */
    function ensureCss(name, file) {
        var id = 'bk-css-' + name;
        if (D.getElementById(id)) return;
        var link = D.createElement('link');
        link.id = id; link.rel = 'stylesheet'; link.href = basePath() + 'assets/bakhi/' + file;
        (D.head || D.documentElement).appendChild(link);
    }
    ensureCss('core', 'bk-core.css');

    /* ---------------------------------------------------------------------
       Tìm kiếm tổng hợp
       ------------------------------------------------------------------ */
    function lessonIndex() {
        var out = [], seen = {};
        $$('main a[href]').forEach(function (a) {
            var href = a.getAttribute('href') || '';
            if (!/\.html?($|[?#])/i.test(href)) return;
            if (/^(https?:)?\/\//.test(href)) return;
            var title = (a.querySelector('.truncate,.font-bold') || a).textContent.replace(/\s+/g, ' ').trim();
            if (!title || seen[href]) return;
            seen[href] = 1;
            var sub = subjectOf(href);
            out.push({ type: 'lesson', title: title, url: href, subject: sub, meta: subjectName(sub) });
        });
        return out;
    }

    function searchAll(query, opts) {
        opts = opts || {};
        var q = norm(query);
        if (!q) return [];
        var words = q.split(' ').filter(Boolean);
        var s = load();
        var results = [];
        var limit = opts.limit || 60;

        function score(title, extra) {
            var hay = norm(title + ' ' + (extra || ''));
            if (!words.every(function (w) { return hay.indexOf(w) >= 0; })) return 0;
            var t = norm(title);
            var sc = 1;
            if (t.indexOf(q) === 0) sc += 4;
            else if (t.indexOf(q) >= 0) sc += 2;
            return sc;
        }

        lessonIndex().forEach(function (l) {
            var sc = score(l.title, l.url + ' ' + l.meta);
            if (sc) results.push(Object.assign({ score: sc, snippet: l.url, category: 'Bài học' }, l));
        });

        var seenQ = {};
        s.practice.slice().reverse().forEach(function (p) {
            if (seenQ[p.question]) return;
            var sc = score(p.question, p.topic);
            if (sc) {
                seenQ[p.question] = 1;
                results.push({
                    type: 'question', score: sc + 1, title: p.question, category: 'Câu hỏi đã luyện',
                    subject: p.subject, meta: p.topic || subjectName(p.subject), url: p.source || ''
                });
            }
        });
        s.review.forEach(function (r) {
            if (seenQ[r.question]) return;
            var sc = score(r.question, r.topic);
            if (sc) {
                seenQ[r.question] = 1;
                results.push({
                    type: 'review', score: sc + 1, title: r.question, category: 'Cần ôn lại',
                    subject: r.subject, meta: r.topic || subjectName(r.subject), url: r.source || ''
                });
            }
        });
        s.notes.forEach(function (n) {
            var sc = score(n.title, n.body + ' ' + n.category);
            if (sc) results.push({
                type: 'note', score: sc + 2, title: n.title, category: 'Ghi chú',
                snippet: n.body.slice(0, 140), subject: n.subject, meta: n.category, id: n.id
            });
        });
        s.bookmarks.forEach(function (b) {
            var sc = score(b.title, b.folder + ' ' + b.url);
            if (sc) results.push({
                type: 'bookmark', score: sc, title: b.title, category: 'Đánh dấu',
                snippet: b.url, subject: b.subject, meta: b.folder, url: b.url
            });
        });

        results.sort(function (a, b) { return b.score - a.score; });
        var groups = {};
        results.slice(0, limit).forEach(function (r) {
            (groups[r.category] = groups[r.category] || []).push(r);
        });
        return { flat: results.slice(0, limit), groups: groups, total: results.length };
    }

    /** Tô sáng từ khoá trong văn bản đã escape. */
    function highlight(text, query) {
        var safe = esc(text);
        var q = String(query || '').trim();
        if (!q) return safe;
        var words = norm(q).split(' ').filter(Boolean);
        if (!words.length) return safe;
        // Tô sáng theo từng từ trên chuỗi đã escape (không chèn HTML từ dữ liệu người dùng).
        var out = safe;
        words.forEach(function (w) {
            if (w.length < 2) return;
            var re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
            out = out.replace(re, '<mark>$1</mark>');
        });
        return out;
    }

    /* ---------------------------------------------------------------------
       Adapter AI (tuỳ chọn) — không bao giờ tự sửa nội dung gốc
       ------------------------------------------------------------------ */
    var AI_LABEL = 'Nội dung do AI tạo — không phải nội dung gốc đã kiểm duyệt.';
    var ai = {
        label: AI_LABEL,
        configured: function () {
            var s = load();
            return !!s.prefs.ai.endpoint;
        },
        status: function () {
            var s = load();
            return { ok: !!s.prefs.ai.endpoint, endpoint: s.prefs.ai.endpoint, model: s.prefs.ai.model || 'mặc định' };
        },
        configure: function (cfg) {
            return update(function (s) {
                s.prefs.ai.endpoint = str((cfg || {}).endpoint, 500);
                s.prefs.ai.model = str((cfg || {}).model, 100);
                return s.prefs.ai;
            });
        },
        /**
         * Gọi endpoint proxy do người dùng cấu hình. Khoá API phải nằm ở server/proxy,
         * KHÔNG đặt trong trình duyệt. Trả về { ok, text, error }.
         */
        ask: function (prompt, context) {
            var cfg = ai.status();
            if (!cfg.ok) return Promise.resolve({ ok: false, error: 'Chưa cấu hình endpoint AI (Cài đặt → AI).' });
            var payload = {
                model: cfg.model,
                messages: [
                    { role: 'system', content: 'Bạn là trợ giảng. Trả lời bằng tiếng Việt, ngắn gọn. Không được thay đổi hay viết lại câu hỏi gốc.' },
                    { role: 'user', content: String(prompt) + (context ? '\n\nNgữ cảnh:\n' + String(context).slice(0, 4000) : '') }
                ]
            };
            return fetch(cfg.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(function (data) {
                var text = (data && (data.text || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content))) || '';
                return text ? { ok: true, text: text } : { ok: false, error: 'Phản hồi AI không có nội dung.' };
            }).catch(function (e) {
                return { ok: false, error: 'Không gọi được AI: ' + e.message };
            });
        }
    };

    /* ---------------------------------------------------------------------
       Adapter Supabase (tuỳ chọn) — chỉ dùng anon key, bật RLS
       ------------------------------------------------------------------ */
    var cloud = {
        TABLE: 'bakhi_learning',
        client: null,
        configured: function () {
            var s = load();
            return !!(s.prefs.cloud.url && s.prefs.cloud.anonKey && global.supabase && global.supabase.createClient);
        },
        status: function () {
            var s = load();
            return {
                ok: cloud.configured(),
                url: s.prefs.cloud.url,
                hasKey: !!s.prefs.cloud.anonKey,
                signedIn: !!(cloud.client && cloud.user),
                user: cloud.user ? { id: cloud.user.id, email: cloud.user.email } : null
            };
        },
        configure: function (cfg) {
            return update(function (s) {
                s.prefs.cloud.url = str((cfg || {}).url, 300).replace(/\/+$/, '');
                s.prefs.cloud.anonKey = str((cfg || {}).anonKey, 500);
                s.prefs.cloud.enabled = !!(cfg || {}).enabled;
                return s.prefs.cloud;
            });
        },
        init: function () {
            if (!cloud.configured()) return Promise.reject(new Error('Supabase chưa được cấu hình.'));
            if (cloud.client) return Promise.resolve(cloud.client);
            var p = load().prefs.cloud;
            cloud.client = global.supabase.createClient(p.url, p.anonKey);
            return cloud.client.auth.getSession().then(function (res) {
                cloud.user = res && res.data && res.data.session ? res.data.session.user : null;
                return cloud.client;
            });
        },
        signIn: function (email) {
            return cloud.init().then(function (c) {
                return c.auth.signInWithOtp({ email: String(email), options: { emailRedirectTo: location.href } });
            });
        },
        signOut: function () {
            if (!cloud.client) return Promise.resolve();
            return cloud.client.auth.signOut().then(function () { cloud.user = null; });
        },
        push: function () {
            return cloud.init().then(function (c) {
                if (!cloud.user) throw new Error('Cần đăng nhập để đồng bộ.');
                var s = load();
                return c.from(cloud.TABLE).upsert({
                    user_id: cloud.user.id,
                    payload: { practice: s.practice, review: s.review, notes: s.notes, bookmarks: s.bookmarks, history: s.history, achievements: s.achievements, prefs: s.prefs },
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
            });
        },
        pull: function () {
            return cloud.init().then(function (c) {
                if (!cloud.user) throw new Error('Cần đăng nhập để đồng bộ.');
                return c.from(cloud.TABLE).select('payload,updated_at').eq('user_id', cloud.user.id).maybeSingle();
            }).then(function (res) {
                if (res.error) throw res.error;
                return res.data && res.data.payload ? res.data.payload : null;
            });
        },
        /** Hợp nhất theo thời gian: bản ghi mới hơn thắng; ghi chú ưu tiên bản cập nhật muộn. */
        merge: function (remote) {
            if (!remote) return null;
            return update(function (s) {
                function mergeById(local, incoming) {
                    var map = {};
                    local.forEach(function (x) { map[x.id || x.key] = x; });
                    (incoming || []).forEach(function (x) {
                        var k = x.id || x.key;
                        var cur = map[k];
                        var xa = x.updatedAt || x.ts || x.lastSeen || 0;
                        var ca = cur ? (cur.updatedAt || cur.ts || cur.lastSeen || 0) : -1;
                        if (!cur || xa > ca) map[k] = x;
                    });
                    return Object.keys(map).map(function (k) { return map[k]; });
                }
                s.practice = mergeById(s.practice, remote.practice);
                s.review = mergeById(s.review, remote.review);
                s.notes = mergeById(s.notes, remote.notes);
                s.bookmarks = mergeById(s.bookmarks, remote.bookmarks);
                s.history = mergeById(s.history, remote.history).slice(-LIMITS.history);
                return { merged: true };
            });
        }
    };

    /* ---------------------------------------------------------------------
       Xuất / nhập dữ liệu
       ------------------------------------------------------------------ */
    function exportPayload(scope) {
        var s = load();
        var data = {
            app: 'bakhi', kind: 'learning-export', version: SCHEMA,
            exportedAt: new Date().toISOString(),
            data: {}
        };
        if (!scope || scope === 'all') {
            data.data = {
                practice: s.practice, review: s.review, notes: s.notes,
                bookmarks: s.bookmarks, history: s.history,
                achievements: s.achievements, prefs: s.prefs
            };
        } else if (scope === 'notes') {
            data.data = { notes: s.notes };
        } else if (scope === 'bookmarks') {
            data.data = { bookmarks: s.bookmarks };
        } else if (scope === 'stats') {
            data.data = { practice: s.practice, review: s.review, achievements: s.achievements };
        }
        return data;
    }

    function validateImport(raw) {
        var issues = [];
        if (!raw || typeof raw !== 'object') return { ok: false, issues: ['Tệp không phải JSON hợp lệ.'] };
        if (raw.app !== 'bakhi') issues.push('Không phải tệp xuất từ Bá Khí (thiếu "app": "bakhi").');
        if (raw.kind !== 'learning-export') issues.push('Loại tệp không phải learning-export.');
        var v = Number(raw.version);
        if (!isFinite(v)) issues.push('Thiếu phiên bản dữ liệu.');
        else if (v > SCHEMA) issues.push('Tệp được tạo bởi phiên bản mới hơn (' + v + ' > ' + SCHEMA + '). Chỉ phần tương thích sẽ được nhập.');
        var d = raw.data;
        if (!d || typeof d !== 'object') issues.push('Thiếu khối "data".');
        var counts = {};
        ['practice', 'review', 'notes', 'bookmarks', 'history'].forEach(function (k) {
            if (d && d[k] != null) {
                if (!Array.isArray(d[k])) issues.push('"' + k + '" phải là mảng.');
                else counts[k] = d[k].length;
            }
        });
        if (d && d.achievements != null && typeof d.achievements !== 'object') issues.push('"achievements" không hợp lệ.');
        return { ok: issues.length === 0, issues: issues, counts: counts, version: v };
    }

    function importPayload(raw, opts) {
        opts = opts || {};
        var check = validateImport(raw);
        if (!check.ok && !opts.force) return { ok: false, error: check.issues.join(' '), report: check };
        var d = (raw && raw.data) || {};
        update(function (s) {
            function mergeArrays(cur, incoming, idKey) {
                if (!Array.isArray(incoming)) return cur;
                var map = {};
                cur.forEach(function (x) { map[x[idKey] || x.key] = x; });
                incoming.forEach(function (x) {
                    if (!x || typeof x !== 'object') return;
                    var k = x[idKey] || x.key;
                    if (!k) return;
                    if (!map[k]) map[k] = x;
                });
                return Object.keys(map).map(function (k) { return map[k]; });
            }
            s.notes = mergeArrays(s.notes, d.notes, 'id');
            s.bookmarks = mergeArrays(s.bookmarks, d.bookmarks, 'id');
            s.practice = mergeArrays(s.practice, d.practice, 'id').slice(-LIMITS.practice);
            s.review = mergeArrays(s.review, d.review, 'id').slice(-LIMITS.review);
            s.history = mergeArrays(s.history, d.history, 'id').slice(-LIMITS.history);
            if (d.achievements && d.achievements.unlocked) {
                Object.keys(d.achievements.unlocked).forEach(function (k) {
                    if (!s.achievements.unlocked[k]) s.achievements.unlocked[k] = d.achievements.unlocked[k];
                });
            }
            // Không nhập prefs từ tệp lạ (tránh đổi endpoint AI/cloud ngoài ý muốn).
            return s;
        });
        emit('import', check);
        return { ok: true, report: check };
    }

    BK.util = {
        uid: uid, esc: esc, norm: norm, debounce: debounce, hash: hash,
        dayKey: dayKey, fmtDate: fmtDate, fmtTime: fmtTime, clamp: clamp,
        download: download, copy: copy, basePath: basePath, now: now
    };
    BK.subjects = SUBJECTS;
    BK.subjectOf = subjectOf;
    BK.subjectName = subjectName;
    BK.subjectColor = subjectColor;
    BK.lessonOf = lessonOf;
    BK.exams = EXAMS;

    BK.store = {
        KEY: KEY, SCHEMA: SCHEMA,
        get: load, save: save, update: update, reset: reset,
        on: on, off: off, emit: emit, empty: emptyState
    };
    BK.practice = practice;
    BK.markReview = markReview;
    BK.scheduleReview = scheduleReview;
    BK.addHistory = addHistory;
    BK.addNote = addNote;
    BK.updateNote = updateNote;
    BK.removeNote = removeNote;
    BK.addBookmark = addBookmark;
    BK.removeBookmark = removeBookmark;
    BK.hasBookmark = hasBookmark;
    BK.achievements = {
        list: ACHIEVEMENTS, groups: ACH_GROUPS, check: checkAchievements,
        unlocked: function () { return load().achievements.unlocked; },
        progress: achievementProgress, next: achievementNext,
        lastUnlocked: function () { return lastUnlocked.slice(); }
    };
    BK.signals = {
        KEY: SIGNALS_KEY, get: readSignals, bump: bumpSignal, setMax: setSignalMax,
        empty: emptySignals,
        reset: function () { var sig = emptySignals(); writeSignals(sig); emit('signals', sig); return sig; }
    };
    BK.stats = { accuracy: accuracy };
    BK.search = { all: searchAll, lessons: lessonIndex, highlight: highlight };
    BK.ui = {
        el: el, $: $, $$: $$, toast: toast, modal: modal, confirm: confirm,
        markdown: markdown, trapFocus: trapFocus
    };
    BK.io = { exportPayload: exportPayload, validateImport: validateImport, importPayload: importPayload };
    BK.ai = ai;
    BK.cloud = cloud;

    global.BKCoreLoaded = true;
})(typeof window !== 'undefined' ? window : this);

/* Music loader: nạp music player dùng chung */
(function () {
    try {
        if (window.BKMusicLoaded) return;
        window.BKMusicLoaded = true;
        if (document.querySelector('script[src*="bk-music.js"]')) return;
        var cur = document.currentScript;
        var src = 'assets/bakhi/bk-music.js';
        if (cur && cur.src) { try { src = new URL('bk-music.js', cur.src).href; } catch (e) {} }
        else if (window.BK && BK.util && BK.util.basePath) { src = BK.util.basePath() + 'assets/bakhi/bk-music.js'; }
        var s = document.createElement('script');
        s.src = src;
        s.async = false;
        (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
})();

/* BKT loader: nạp hiệu ứng bàn tay kéo dùng chung cho mọi trang con */
(function () {
    try {
        if (window.__bkt || document.querySelector('script[src*="bk-bkt.js"]')) return;
        var cur = document.currentScript;
        var src = 'assets/bakhi/bk-bkt.js';
        if (cur && cur.src) { try { src = new URL('bk-bkt.js', cur.src).href; } catch (e) {} }
        var s = document.createElement('script');
        s.src = src;
        s.async = false;
        (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
})();
