/* =========================================================================
   Bá Khí — bk-gamification.js (8.3.5)
   Lớp tiến trình thống nhất: XP, cấp độ, cây kỹ năng, thành tựu, nhiệm vụ,
   thử thách Boss và kho vật phẩm.

   Nguyên tắc:
   - Supabase là nguồn sự thật: mọi con số hiển thị đến từ Edge Function
     gamification-api (Reward Engine chạy trong Postgres). Bộ nhớ cục bộ chỉ
     là cache + hàng đợi sự kiện khi mất mạng.
   - Không tự cộng XP. `track()` chỉ gửi một sự kiện học tập đã xảy ra thật,
     kèm khoá idempotency; máy chủ quyết định phần thưởng.
   - Công thức cấp độ ở đây là BẢN SAO để hiển thị offline; bản chuẩn nằm ở
     public.bk_gam_level (migration 20261209000000). QA đối chiếu hai bên.

   Công khai: window.BK.gamification
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BK && global.BK.gamification) return;

    var BK = global.BK || null;

    var CACHE_KEY = 'bakhiGamification.v1';
    var QUEUE_KEY = 'bakhiGamificationQueue.v1';
    var SENT_KEY = 'bakhiGamificationSent.v1';
    var PREFS_KEY = 'bakhiGamificationPrefs.v1';
    var SCHEMA = 1;
    var MAX_QUEUE = 40;
    var MAX_SENT = 400;

    var ACTIVITIES = {
        quiz_completed: 'Hoàn thành bài quiz',
        lesson_study: 'Học một bài',
        listening_completed: 'Luyện nghe',
        revision_session: 'Phiên ôn tập',
        mistake_mastered: 'Xử lý câu sai',
        goal_completed: 'Hoàn thành mục tiêu'
    };

    var BRANCHES = [
        { id: 'knowledge', name: 'Kiến thức', icon: 'fa-book-open', desc: 'Bài học, chủ đề và các cột mốc kiến thức.' },
        { id: 'practice', name: 'Luyện tập', icon: 'fa-dumbbell', desc: 'Bài luyện, độ chính xác và số ngày hoạt động.' },
        { id: 'memory', name: 'Ghi nhớ', icon: 'fa-brain', desc: 'Phiên ôn tập và câu hỏi trong Sổ tay câu sai.' },
        { id: 'consistency', name: 'Đều đặn', icon: 'fa-calendar-check', desc: 'Chuỗi ngày học và nhịp học ổn định.' },
        { id: 'mastery', name: 'Tinh thông', icon: 'fa-dragon', desc: 'Thử thách Boss và thành tựu đã đạt.' }
    ];

    var ACTIVITY_LABELS = ACTIVITIES;
    var STATUS_LABELS = {
        locked: 'Chưa mở',
        available: 'Sẵn sàng',
        in_progress: 'Đang thực hiện',
        completed: 'Hoàn thành',
        claimed: 'Đã nhận thưởng',
        expired: 'Quá hạn'
    };
    var RARITY_LABELS = {
        common: 'Phổ biến', uncommon: 'Ít gặp', rare: 'Hiếm', epic: 'Cực hiếm', legendary: 'Huyền thoại'
    };

    /* ---------------------------------------------------------------------
       Tiện ích DOM + lưu trữ
       ------------------------------------------------------------------ */
    function el(tag, cls, text) {
        var node = D.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }
    function icon(name, cls) {
        var i = el('i', 'fa-solid ' + (name || 'fa-circle') + (cls ? ' ' + cls : ''));
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function lsGet(key) { try { return global.localStorage.getItem(key); } catch (e) { return null; } }
    function lsSet(key, val) { try { global.localStorage.setItem(key, val); return true; } catch (e) { return false; } }
    function readJson(key, fallback) {
        var raw = lsGet(key);
        if (!raw) return fallback;
        try { var v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
    }
    function writeJson(key, value) { return lsSet(key, JSON.stringify(value)); }
    function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function dayKey(d) {
        d = d || new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }
    function fmtTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fmtRelative(iso) {
        if (!iso) return '—';
        var t = new Date(iso).getTime();
        if (isNaN(t)) return '—';
        var diff = Math.floor((Date.now() - t) / 60000);
        if (diff < 1) return 'vừa xong';
        if (diff < 60) return diff + ' phút trước';
        if (diff < 1440) return Math.floor(diff / 60) + ' giờ trước';
        if (diff < 10080) return Math.floor(diff / 1440) + ' ngày trước';
        return fmtDate(iso);
    }
    function hash(str) {
        var h = 5381;
        str = String(str || '');
        for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }
    function uuid() {
        try {
            if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
        } catch (e) { }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    /* BKCloud (bk-cloud.js) là lớp máy chủ; BK.cloud trong bk-core.js chỉ là
       adapter localStorage cũ và KHÔNG có gamificationApi. Luôn hỏi BKCloud trước. */
    function cloudApi() {
        if (global.BKCloud && typeof global.BKCloud.gamificationApi === 'function') return global.BKCloud;
        if (BK && BK.cloud && typeof BK.cloud.gamificationApi === 'function') return BK.cloud;
        return null;
    }
    function cloudIdentity() {
        var c = cloudApi();
        try {
            if (c && typeof c.identity === 'function') {
                var ident = c.identity();
                if (ident && ident.id) return ident;
            }
        } catch (e) { }
        return null;
    }
    function studentId() {
        var ident = cloudIdentity();
        if (ident && ident.id) return String(ident.id);
        var raw = readJson('bakhiStudent.v1', null);
        if (raw && raw.studentId) return String(raw.studentId);
        return '';
    }
    function keyFor(base) {
        var sid = studentId();
        return sid ? base + '.' + sid : base;
    }
    function prefs() {
        var p = readJson(PREFS_KEY, {}) || {};
        return {
            animations: p.animations !== false,
            notify: p.notify !== false
        };
    }
    function savePrefs(patch) {
        var p = prefs();
        Object.keys(patch || {}).forEach(function (k) { p[k] = patch[k]; });
        writeJson(PREFS_KEY, p);
        return p;
    }
    function reduceMotion() {
        if (!prefs().animations) return true;
        try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (e) { return false; }
    }

    /* ---------------------------------------------------------------------
       Công thức cấp độ (bản sao của public.bk_gam_level)
       ------------------------------------------------------------------ */
    function xpToNext(level) {
        var k = Math.max(0, Number(level) - 1);
        return 100 + 60 * k + 20 * k * k;
    }
    var floorCache = { 1: 0 };
    function levelFloor(level) {
        level = Math.max(1, Math.floor(Number(level) || 1));
        if (floorCache[level] !== undefined) return floorCache[level];
        var total = 0;
        for (var l = 1; l < level; l++) total += xpToNext(l);
        floorCache[level] = total;
        return total;
    }
    function levelFromXp(total) {
        var xp = Math.max(0, Math.floor(Number(total) || 0));
        var level = 1;
        while (level < 1000 && xp >= levelFloor(level + 1)) level++;
        return level;
    }
    function progressOf(total) {
        var xp = Math.max(0, Math.floor(Number(total) || 0));
        var level = levelFromXp(xp);
        var floor = levelFloor(level);
        var next = levelFloor(level + 1);
        var span = Math.max(1, next - floor);
        return {
            level: level,
            levelXp: xp - floor,
            span: span,
            nextLevelXp: next,
            remaining: Math.max(0, next - xp),
            pct: Math.max(0, Math.min(100, Math.floor(100 * (xp - floor) / span)))
        };
    }

    /* ---------------------------------------------------------------------
       Hàng đợi sự kiện (offline-safe, idempotent)
       ------------------------------------------------------------------ */
    function readQueue() {
        var q = readJson(keyFor(QUEUE_KEY), []);
        return Array.isArray(q) ? q.filter(function (e) {
            return e && typeof e === 'object' && e.activity && e.key;
        }).slice(-MAX_QUEUE) : [];
    }
    function writeQueue(q) { writeJson(keyFor(QUEUE_KEY), q.slice(-MAX_QUEUE)); }
    function readSent() {
        var s = readJson(keyFor(SENT_KEY), []);
        return Array.isArray(s) ? s.slice(-MAX_SENT) : [];
    }
    function markSent(key) {
        var s = readSent();
        s.push(key);
        writeJson(keyFor(SENT_KEY), s.slice(-MAX_SENT));
    }

    /**
     * Ghi nhận một hoạt động học tập thật.
     * @param {string} activity  loại hoạt động trong danh sách máy chủ chấp nhận
     * @param {string} sourceId  định danh nguồn (đường dẫn, id bài, id câu…)
     * @param {object} opts      { dayScoped:true, meta:{} }
     */
    function track(activity, sourceId, opts) {
        if (!ACTIVITIES[activity]) return null;
        opts = opts || {};
        var sid = studentId();
        if (!sid) return null;               /* chưa nhận diện → không ghi gì */
        var day = dayKey();
        var source = String(sourceId || '').slice(0, 160);
        /* Khoá idempotency: một hoạt động cho mỗi nguồn mỗi ngày (hoặc một lần). */
        var key = 'evt:' + activity + ':' + (hash(source) || 'x') + (opts.dayScoped === false ? '' : ':' + day);
        var sent = readSent();
        if (sent.indexOf(key) >= 0) return null;
        var queue = readQueue();
        if (queue.some(function (e) { return e.key === key; })) return null;
        queue.push({
            activity: activity,
            source_id: source,
            key: key,
            ts: Date.now(),
            meta: opts.meta || {}
        });
        writeQueue(queue);
        flush();
        return key;
    }

    var flushing = false;
    function flush() {
        if (flushing) return Promise.resolve(false);
        var sid = studentId();
        if (!sid) return Promise.resolve(false);
        var queue = readQueue();
        if (!queue.length) return Promise.resolve(false);
        if (!api()) return Promise.resolve(false);

        flushing = true;
        var item = queue[0];
        var eventSeq = ++SEQ;
        return api()({ action: 'event', activity: item.activity, source_id: item.source_id, idempotency_key: item.key })
            .then(function (res) {
                var rest = readQueue().filter(function (e) { return e.key !== item.key; });
                writeQueue(rest);
                markSent(item.key);
                if (res && res.state) applyState(res.state, true, eventSeq);
                if (res && res.award && res.award.awarded) {
                    smallToast('+' + res.award.amount + ' XP · ' + (ACTIVITY_LABELS[item.activity] || 'Hoạt động học tập'));
                }
                celebrate(res && res.evaluation);
                flushing = false;
                if (readQueue().length) setTimeout(flush, 900);
                return true;
            })
            .catch(function (err) {
                flushing = false;
                /* Lỗi mạng/5xx: giữ hàng đợi để gửi lại. Lỗi 4xx: bỏ sự kiện hỏng. */
                var status = err && err.status ? err.status : 0;
                if (status >= 400 && status < 500) {
                    var rest = readQueue().filter(function (e) { return e.key !== item.key; });
                    writeQueue(rest);
                    markSent(item.key);
                }
                return false;
            });
    }

    /* ---------------------------------------------------------------------
       Gọi Edge Function
       ------------------------------------------------------------------ */
    function api() {
        var c = cloudApi();
        return c ? c.gamificationApi : null;
    }
    var CALL_TIMEOUT = 15000;
    function call(body) {
        var fn = api();
        if (!fn) {
            var noCloud = new Error('Chưa tải được lớp kết nối Supabase (BKCloud).');
            noCloud.code = 'NO_CLOUD';
            return Promise.reject(noCloud);
        }
        var timer = null;
        var timeout = new Promise(function (_, reject) {
            timer = setTimeout(function () {
                var err = new Error('Máy chủ không phản hồi sau ' + Math.round(CALL_TIMEOUT / 1000) + ' giây.');
                err.code = 'TIMEOUT';
                err.timeout = true;
                reject(err);
            }, CALL_TIMEOUT);
        });
        var request;
        try {
            request = fn(body);
        } catch (e) {
            clearTimeout(timer);
            return Promise.reject(e);
        }
        return Promise.race([request, timeout]).then(function (res) {
            clearTimeout(timer);
            return res;
        }, function (err) {
            clearTimeout(timer);
            throw err;
        });
    }

    var S = {
        state: null,
        config: null,
        loading: false,
        errorCode: null,
        status: 'idle',
        lastError: null,
        retries: 0,
        host: null,
        historyOffset: 0,
        boss: null,
        booted: false
    };

    var STATUS = {
        idle: 'idle', restoring: 'restoring', loading: 'loading', ready: 'ready',
        noSession: 'no_session', unauthorized: 'unauthorized', notBound: 'not_bound',
        forbidden: 'forbidden', rateLimited: 'rate_limited', offline: 'offline',
        server: 'server', error: 'error'
    };

    /* Mỗi trạng thái có thông báo và mã lỗi riêng — không dùng chung một câu. */
    var ERROR_UI = {
        no_session: {
            icon: 'fa-user-shield', title: 'Cần nhận diện học sinh', code: 'E_NO_SESSION',
            text: 'Tiến trình được gắn với hồ sơ học sinh trên máy chủ. Hãy nhận diện ở trang chủ rồi quay lại trang này.'
        },
        unauthorized: {
            icon: 'fa-key', title: 'Phiên đăng nhập không còn hợp lệ', code: 'E_UNAUTHORIZED',
            text: 'Phiên trên thiết bị đã hết hạn. Nhận diện lại để tiếp tục xem tiến trình.'
        },
        not_bound: {
            icon: 'fa-link-slash', title: 'Thiết bị chưa gắn học sinh', code: 'E_NOT_BOUND',
            text: 'Thiết bị này chưa được gắn với hồ sơ nào. Hãy nhận diện ở trang chủ.'
        },
        forbidden: {
            icon: 'fa-lock', title: 'Không đủ quyền xem tiến trình', code: 'E_FORBIDDEN',
            text: 'Tài khoản hiện tại không có quyền đọc dữ liệu tiến trình này.'
        },
        rate_limited: {
            icon: 'fa-hourglass-half', title: 'Thao tác hơi nhanh', code: 'E_RATE_LIMITED',
            text: 'Máy chủ tạm giới hạn tốc độ. Chờ khoảng một phút rồi thử lại.'
        },
        offline: {
            icon: 'fa-wifi', title: 'Không thể kết nối máy chủ', code: 'E_NETWORK',
            text: 'Kiểm tra kết nối mạng rồi thử lại. Tiến trình đã tải trước đó vẫn được giữ trên thiết bị.'
        },
        server: {
            icon: 'fa-server', title: 'Máy chủ đang gặp sự cố', code: 'E_SERVER',
            text: 'Máy chủ Bá Khí chưa phản hồi đúng. Thử lại sau ít phút.'
        },
        error: {
            icon: 'fa-triangle-exclamation', title: 'Chưa tải được tiến trình', code: 'E_UNKNOWN',
            text: 'Đã xảy ra lỗi khi tải dữ liệu tiến trình.'
        }
    };

    function classify(err) {
        if (!err) return 'error';
        var code = String(err.code || '');
        var status = Number(err.status || 0);
        if (code === 'NO_SESSION' || status === 401) return 'unauthorized';
        if (code === 'NOT_BOUND' || status === 409) return 'not_bound';
        if (code === 'RATE_LIMITED' || status === 429) return 'rate_limited';
        if (code === 'NO_CLOUD' || code === 'BAD_PAYLOAD') return 'error';
        if (status === 403) return 'forbidden';
        if (status >= 500) return 'server';
        if (err.timeout || !status) return 'offline';
        return 'error';
    }

    function readCache() { return readJson(keyFor(CACHE_KEY), null); }
    function writeCache(state) {
        if (!state) return;
        writeJson(keyFor(CACHE_KEY), { v: SCHEMA, state: state, cachedAt: Date.now() });
    }

    /* Thứ tự phản hồi: request gửi sau luôn thắng. Chặn trường hợp phản hồi
       `state` chậm hơn `event` ghi đè XP vừa cộng. */
    var SEQ = 0;
    var APPLIED = 0;

    function applyState(state, notify, seq) {
        if (!state) return;
        var order = seq == null ? ++APPLIED : seq;
        if (order < APPLIED) return;
        APPLIED = order;
        var prev = S.state || (readCache() || {}).state || null;
        S.state = state;
        writeCache(state);
        registerInventoryFrames(state);
        if (notify && prev) announce(prev, state);
        if (S.host) renderAll();
        try {
            global.dispatchEvent(new global.CustomEvent('bk:gamification', { detail: state }));
        } catch (e) { }
    }

    function announce(prev, next) {
        if (!prefs().notify) return;
        if (num(next.level, 1) > num(prev.level, 1)) {
            levelUpModal(num(prev.level, 1), num(next.level, 1));
            return;
        }
        var prevIds = {};
        (prev.achievements || []).forEach(function (a) { if (a.unlocked_at) prevIds[a.id] = 1; });
        var unlocked = (next.achievements || []).filter(function (a) { return a.unlocked_at && !prevIds[a.id]; });
        if (unlocked.length) {
            smallToast('Mở khoá thành tựu: ' + unlocked[0].name + (unlocked.length > 1 ? ' (+' + (unlocked.length - 1) + ')' : ''));
        }
        var prevNodes = {};
        (prev.nodes || []).forEach(function (n) { if (n.status === 'completed') prevNodes[n.id] = 1; });
        var nodes = (next.nodes || []).filter(function (n) { return n.status === 'completed' && !prevNodes[n.id]; });
        if (nodes.length) smallToast('Hoàn thành kỹ năng: ' + nodes[0].name);
    }

    function celebrate(evaluation) {
        if (!evaluation || !prefs().notify) return;
        var ach = evaluation.achievements || [];
        var nodes = evaluation.nodes || [];
        if (ach.length) smallToast('Thành tựu mới: ' + ach.map(function (a) { return a.name; }).join(', '));
        else if (nodes.length) smallToast('Kỹ năng hoàn thành: ' + nodes.map(function (n) { return n.name; }).join(', '));
        var items = evaluation.items || [];
        if (items.length) smallToast('Nhận vật phẩm mới trong kho đồ.');
        if (evaluation.award && evaluation.award.leveled_up) {
            /* bk_gam_claim trả award lồng trong claim; sự kiện thường đã bắt ở applyState */
        }
    }

    /* ---------------------------------------------------------------------
       Thông báo nhẹ (không chặn thao tác học tập)
       ------------------------------------------------------------------ */
    var toastHost = null;
    function ensureToastHost() {
        if (toastHost && toastHost.isConnected) return toastHost;
        toastHost = el('div', 'bkg-toasts');
        toastHost.setAttribute('role', 'status');
        toastHost.setAttribute('aria-live', 'polite');
        (D.body || D.documentElement).appendChild(toastHost);
        return toastHost;
    }
    function smallToast(message, kind) {
        if (!prefs().notify) return;
        var host = ensureToastHost();
        var item = el('div', 'bkg-toast' + (kind ? ' is-' + kind : ''));
        item.appendChild(icon(kind === 'error' ? 'fa-circle-exclamation' : 'fa-sparkles'));
        item.appendChild(el('span', null, message));
        host.appendChild(item);
        if (!reduceMotion()) item.classList.add('is-in');
        else item.classList.add('is-in', 'is-static');
        setTimeout(function () {
            item.classList.remove('is-in');
            setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, reduceMotion() ? 0 : 240);
        }, 4200);
        while (host.children.length > 3) host.removeChild(host.firstChild);
    }

    function levelUpModal(from, to) {
        if (BK && BK.ui && typeof BK.ui.modal === 'function') {
            var body = el('div', 'bkg-levelup');
            var ring = el('div', 'bkg-levelup-ring');
            ring.appendChild(el('span', 'bkg-levelup-num', String(to)));
            ring.appendChild(el('span', 'bkg-levelup-cap', 'Cấp'));
            body.appendChild(ring);
            body.appendChild(el('p', 'bkg-levelup-title', 'Chúc mừng! Bạn vừa lên cấp ' + to + '.'));
            body.appendChild(el('p', 'bk-small bk-muted',
                'Cấp trước: ' + from + '. Tiến trình của bạn được lưu trên máy chủ nên không mất khi đổi thiết bị.'));
            BK.ui.modal({
                title: 'Lên cấp',
                body: body,
                actions: [{ label: 'Tiếp tục học', variant: 'primary', onClick: function (close) { close(); } }]
            });
            return;
        }
        smallToast('Lên cấp ' + to + '!');
    }

    /* ---------------------------------------------------------------------
       Tải dữ liệu
       ------------------------------------------------------------------ */
    var GEN = 0;
    var RETRY_LIMIT = 2;

    function refresh(force) {
        if (S.loading) return S.loading;
        var sid = studentId();
        if (!sid) {
            S.state = null;
            S.errorCode = 'no_session';
            S.status = STATUS.noSession;
            S.loading = false;
            if (S.host) renderAll();
            return Promise.resolve(null);
        }

        if (!force) {
            var cached = readCache();
            if (cached && cached.state && !S.state) {
                S.state = cached.state;
                S.status = STATUS.ready;
                if (S.host) renderAll();
            }
        }

        var gen = ++GEN;
        var attempt = 0;
        S.status = S.state ? STATUS.ready : STATUS.loading;
        S.errorCode = null;

        function run() {
            var stateSeq = ++SEQ;
            return call({ action: 'state' }).then(function (res) {
                if (gen !== GEN) return null;   /* phản hồi cũ: bỏ, không ghi đè */
                if (!res || !res.state) {
                    var bad = new Error('Máy chủ trả dữ liệu tiến trình không đúng cấu trúc.');
                    bad.code = 'BAD_PAYLOAD';
                    throw bad;
                }
                S.config = res.config || S.config;
                S.retries = 0;
                S.errorCode = null;
                S.lastError = null;
                S.status = STATUS.ready;
                applyState(res.state, !!S.state, stateSeq);
                S.loading = false;
                if (S.host) renderAll();
                return S.state;
            }).catch(function (err) {
                if (gen !== GEN) return null;
                var kind = classify(err);
                attempt++;
                S.lastError = {
                    code: kind,
                    status: Number(err && err.status) || 0,
                    message: String((err && err.message) || '')
                };
                /* Chỉ tự thử lại lỗi tạm thời, tối đa RETRY_LIMIT lần. */
                if (attempt <= RETRY_LIMIT && (kind === 'offline' || kind === 'server')) {
                    S.retries = attempt;
                    S.errorCode = kind;
                    S.status = S.state ? STATUS.ready : STATUS.loading;
                    if (S.host) renderAll();
                    return new Promise(function (resolve) { setTimeout(resolve, 900 * attempt); }).then(run);
                }
                S.loading = false;
                S.errorCode = kind;
                S.status = S.state ? STATUS.ready : kind;
                try {
                    if (global.console && console.warn) {
                        console.warn('[BKGamification] không tải được tiến trình:',
                            kind, Number(err && err.status) || 0, String((err && err.message) || ''));
                    }
                } catch (e) { }
                if (S.host) renderAll();
                return null;
            });
        }

        S.loading = run().then(function (v) {
            S.loading = false;
            return v;
        });
        return S.loading;
    }

    function retry() {
        if (S.loading) return S.loading;
        S.errorCode = null;
        S.state = S.state || null;
        S.status = S.state ? STATUS.ready : STATUS.loading;
        if (S.host) renderAll();
        return refresh(true);
    }

    /* ---------------------------------------------------------------------
       Khối dùng chung
       ------------------------------------------------------------------ */
    function progressBar(pct, cls, label) {
        var wrap = el('div', 'bkg-bar' + (cls ? ' ' + cls : ''));
        wrap.setAttribute('role', 'progressbar');
        wrap.setAttribute('aria-valuemin', '0');
        wrap.setAttribute('aria-valuemax', '100');
        wrap.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, Math.round(pct)))));
        if (label) wrap.setAttribute('aria-label', label);
        var fill = el('span', 'bkg-bar-fill');
        fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        wrap.appendChild(fill);
        return wrap;
    }

    function pill(text, tone) {
        return el('span', 'bkg-pill' + (tone ? ' is-' + tone : ''), text);
    }

    function statusTone(status) {
        if (status === 'completed') return 'ok';
        if (status === 'in_progress') return 'info';
        if (status === 'claimed') return 'muted';
        if (status === 'expired') return 'muted';
        if (status === 'available') return 'warn';
        return 'muted';
    }

    function sectionHead(title, sub, right) {
        var head = el('div', 'bkg-sec-head');
        var left = el('div');
        left.appendChild(el('h2', 'bkg-sec-title', title));
        if (sub) left.appendChild(el('p', 'bkg-sec-sub', sub));
        head.appendChild(left);
        if (right) head.appendChild(right);
        return head;
    }

    function emptyState(text, iconName) {
        var box = el('div', 'bkg-empty');
        box.appendChild(icon(iconName || 'fa-circle-info'));
        box.appendChild(el('p', null, text));
        return box;
    }

    var state = function () { return S.state; };
    var config = function () { return S.config; };

    /* ---------------------------------------------------------------------
       Hero — tổng quan
       ------------------------------------------------------------------ */
    function renderHero(host) {
        var st = S.state;
        var hero = el('section', 'bkg-hero');
        hero.setAttribute('aria-label', 'Tổng quan tiến trình');

        var ident = cloudIdentity();
        var name = (ident && ident.display_name) || 'Học sinh Bá Khí';
        var initial = String(name).trim().charAt(0).toUpperCase() || 'B';

        var top = el('div', 'bkg-hero-top');
        top.appendChild(heroAvatar(initial));

        var info = el('div', 'bkg-hero-info');
        var nameRow = el('div', 'bkg-hero-name');
        nameRow.appendChild(el('h1', null, name));
        var equippedTitle = (st.inventory || []).filter(function (i) { return i.is_equipped && i.kind === 'title'; })[0];
        if (equippedTitle) nameRow.appendChild(pill(equippedTitle.name, 'accent'));
        var equippedDeco = (st.inventory || []).filter(function (i) { return i.is_equipped && i.kind === 'decoration'; })[0];
        if (equippedDeco) nameRow.appendChild(icon(equippedDeco.icon || 'fa-feather', 'bkg-deco'));
        info.appendChild(nameRow);
        info.appendChild(el('p', 'bkg-hero-sub',
            'Cấp ' + st.level + ' · ' + Number(st.total_xp).toLocaleString('vi-VN') + ' XP tổng cộng'));
        top.appendChild(info);

        var levelBadge = el('div', 'bkg-level-badge');
        levelBadge.appendChild(el('b', null, String(st.level)));
        levelBadge.appendChild(el('span', null, 'CẤP'));
        top.appendChild(levelBadge);
        hero.appendChild(top);

        var barRow = el('div', 'bkg-hero-bar');
        barRow.appendChild(progressBar(st.progress_pct, 'is-hero', 'Tiến trình cấp ' + st.level));
        var meta = el('div', 'bkg-hero-meta');
        meta.appendChild(el('span', null, st.level_xp + ' / ' + st.level_span + ' XP cấp này'));
        meta.appendChild(el('span', null, 'Còn ' + st.xp_remaining + ' XP đến cấp ' + (st.level + 1)));
        barRow.appendChild(meta);
        hero.appendChild(barRow);

        /* 8.3.6: buff XP do Founder đặt — học sinh thấy rõ vì sao XP tăng nhanh. */
        var buffs = (st.buffs || []).filter(function (b) { return b && Number(b.multiplier) > 1; });
        if (buffs.length) {
            var buffBar = el('div', 'bkg-buff-bar');
            buffBar.setAttribute('role', 'status');
            buffBar.appendChild(icon('fa-bolt'));
            var best = buffs.reduce(function (m, b) { return Math.max(m, Number(b.multiplier) || 1); }, 1);
            var label = el('span', null, 'Đang nhân x' + best + ' XP');
            if (buffs[0].label) label.textContent += ' · ' + buffs[0].label;
            buffBar.appendChild(label);
            var until = buffs[0].ends_at ? new Date(buffs[0].ends_at) : null;
            if (until && !isNaN(until.getTime())) {
                buffBar.appendChild(el('span', 'bkg-buff-until',
                    'đến ' + until.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })));
            }
            hero.appendChild(buffBar);
        }

        var grid = el('div', 'bkg-hero-grid');
        var featured = (st.achievements || []).filter(function (a) { return a.unlocked_at; })
            .sort(function (a, b) { return new Date(b.unlocked_at) - new Date(a.unlocked_at); })[0];
        grid.appendChild(miniCard('fa-medal', 'Thành tựu nổi bật',
            featured ? featured.name : 'Chưa có — hãy hoàn thành bài học đầu tiên',
            featured ? RARITY_LABELS[featured.rarity] || '' : ''));
        grid.appendChild(miniCard('fa-list-check', 'Nhiệm vụ đang mở',
            String((st.missions || []).filter(function (m) { return m.status !== 'claimed'; }).length) + ' nhiệm vụ',
            (st.missions || []).filter(function (m) { return m.status === 'completed'; }).length + ' chờ nhận thưởng'));
        var branchDone = (st.branches || []).reduce(function (n, b) { return n + num(b.completed, 0); }, 0);
        var branchAll = (st.branches || []).reduce(function (n, b) { return n + num(b.nodes, 0); }, 0);
        grid.appendChild(miniCard('fa-circle-nodes', 'Cây kỹ năng',
            branchDone + ' / ' + branchAll + ' node', 'Tiến trình kỹ năng tích luỹ'));
        grid.appendChild(miniCard('fa-dragon', 'Thử thách Boss',
            String((st.attempts || []).filter(function (a) { return a.passed; }).length) + ' đã vượt',
            (st.challenges || []).length + ' thử thách đang mở'));
        hero.appendChild(grid);

        var actions = el('div', 'bkg-hero-actions');
        actions.appendChild(linkButton('Nhiệm vụ hôm nay', 'fa-list-check', '#bkg-missions'));
        actions.appendChild(linkButton('Bộ sưu tập', 'fa-layer-group', '#bkg-collection'));
        actions.appendChild(linkButton('Cây kỹ năng', 'fa-circle-nodes', '#bkg-skills'));
        actions.appendChild(linkButton('Lịch sử XP', 'fa-clock-rotate-left', '#bkg-history'));
        hero.appendChild(actions);

        host.appendChild(hero);
    }

    /* 8.3.5 — Avatar và khung dùng CHUNG BKProfile với navbar/hồ sơ/chat.
       Trước đây hero chỉ vẽ chữ cái đầu nên Gamification không bao giờ khớp
       với ảnh đại diện thật của người học. */
    function heroAvatar(initial) {
        var P = global.BKProfile;
        if (P && typeof P.avatarNode === 'function') {
            try { return P.avatarNode({ size: 58, className: 'bkg-hero-avatar' }); } catch (e) { }
        }
        var fallback = el('div', 'bkg-avatar');
        fallback.appendChild(el('span', null, initial));
        return fallback;
    }

    function profileFrameId() {
        var P = global.BKProfile;
        try {
            if (P && typeof P.get === 'function') return String(P.get().frame || 'none');
        } catch (e) { }
        return 'none';
    }

    var lastProfileSig = '';
    function profileSignature() {
        var P = global.BKProfile;
        try {
            if (P && typeof P.get === 'function') {
                var p = P.get();
                var avatar = String(p.avatar || '');
                /* Phần đuôi + độ dài: đổi ảnh cùng kích thước vẫn phát hiện được. */
                return avatar.length + ':' + avatar.slice(-32) + ':' + String(p.frame || 'none');
            }
        } catch (e) { }
        return '';
    }

    /** Khung hồ sơ mà một vật phẩm kho tương ứng (metadata.profile_frame). */
    function itemProfileFrame(item) {
        var meta = item && item.metadata;
        if (meta && typeof meta === 'object' && meta.profile_frame) return String(meta.profile_frame);
        return String((item && item.item_id) || '');
    }

    /* 8.3.5: báo cho BKProfile biết các khung nhận qua Reward Engine để bộ chọn
       khung ở hồ sơ có thể trang bị; máy chủ vẫn là nơi kiểm tra quyền. */
    function registerInventoryFrames(state) {
        var P = global.BKProfile;
        if (!P || typeof P.setOwnedFrames !== 'function' || !state) return;
        var ids = [];
        (state.inventory || []).forEach(function (i) {
            if (i && i.kind === 'frame') ids.push(itemProfileFrame(i));
        });
        try { P.setOwnedFrames(ids); } catch (e) { }
    }

    function miniCard(iconName, label, value, sub) {
        var card = el('div', 'bkg-mini');
        var ic = el('span', 'bkg-mini-icon');
        ic.appendChild(icon(iconName));
        card.appendChild(ic);
        var body = el('div');
        body.appendChild(el('span', 'bkg-mini-label', label));
        body.appendChild(el('b', 'bkg-mini-value', value));
        if (sub) body.appendChild(el('span', 'bkg-mini-sub', sub));
        card.appendChild(body);
        return card;
    }
    function linkButton(label, iconName, href) {
        var a = el('a', 'bkg-link-btn');
        a.href = href;
        a.appendChild(icon(iconName));
        a.appendChild(el('span', null, label));
        return a;
    }

    /* ---------------------------------------------------------------------
       Nhiệm vụ
       ------------------------------------------------------------------ */
    function renderMissions(host) {
        var st = S.state;
        var wrap = el('section', 'bkg-section');
        wrap.id = 'bkg-missions';
        wrap.appendChild(sectionHead('Nhiệm vụ', 'Chu kỳ ngày và tuần theo UTC, hiển thị theo giờ máy của bạn.'));

        var daily = (st.missions || []).filter(function (m) { return m.cadence === 'daily'; });
        var weekly = (st.missions || []).filter(function (m) { return m.cadence === 'weekly'; });

        wrap.appendChild(missionGroup('Hằng ngày', daily, 'fa-sun'));
        wrap.appendChild(missionGroup('Hằng tuần', weekly, 'fa-calendar-week'));

        var history = st.mission_history || [];
        if (history.length) {
            var historyBox = el('div', 'bkg-history-box');
            historyBox.appendChild(el('h3', 'bkg-sub-title', 'Lịch sử nhiệm vụ'));
            var list = el('ul', 'bkg-history-list');
            history.slice(0, 8).forEach(function (m) {
                var li = el('li');
                li.appendChild(el('span', null, m.name + ' · ' + m.period_key));
                li.appendChild(pill(STATUS_LABELS[m.status] || m.status,
                    m.status === 'claimed' ? 'ok' : 'muted'));
                list.appendChild(li);
            });
            historyBox.appendChild(list);
            wrap.appendChild(historyBox);
        }

        host.appendChild(wrap);
    }

    function missionGroup(title, items, iconName) {
        var box = el('div', 'bkg-group');
        var head = el('h3', 'bkg-sub-title');
        head.appendChild(icon(iconName));
        head.appendChild(document.createTextNode(' ' + title));
        box.appendChild(head);
        if (!items.length) {
            box.appendChild(emptyState('Chưa có nhiệm vụ ' + title.toLowerCase() + '. Nhiệm vụ sẽ xuất hiện khi bạn đủ điều kiện.', 'fa-hourglass-half'));
            return box;
        }
        var grid = el('div', 'bkg-cards');
        items.forEach(function (m) { grid.appendChild(missionCard(m)); });
        box.appendChild(grid);
        return box;
    }

    function missionCard(m) {
        var card = el('article', 'bkg-card is-mission');
        var head = el('div', 'bkg-card-head');
        head.appendChild(el('h4', null, m.name));
        head.appendChild(pill(STATUS_LABELS[m.status] || m.status, statusTone(m.status)));
        card.appendChild(head);
        if (m.description) card.appendChild(el('p', 'bkg-card-desc', m.description));
        var pct = m.target ? Math.min(100, Math.floor(100 * num(m.progress, 0) / num(m.target, 1))) : 0;
        card.appendChild(progressBar(pct, '', m.name + ': ' + m.progress + '/' + m.target));
        var foot = el('div', 'bkg-card-foot');
        foot.appendChild(el('span', 'bkg-muted', m.progress + ' / ' + m.target));
        var rewardXp = m.reward && m.reward.xp ? '+ ' + m.reward.xp + ' XP' : '';
        if (rewardXp) foot.appendChild(pill(rewardXp, 'xp'));
        if (m.status === 'completed') {
            var claim = el('button', 'bkg-btn is-primary');
            claim.type = 'button';
            claim.appendChild(icon('fa-gift'));
            claim.appendChild(el('span', null, 'Nhận thưởng'));
            claim.addEventListener('click', function () { claimMission(m, claim); });
            foot.appendChild(claim);
        } else if (m.status === 'claimed') {
            foot.appendChild(el('span', 'bkg-muted', 'Đã nhận ' + fmtDate(m.claimed_at)));
        } else if (m.expires_at) {
            foot.appendChild(el('span', 'bkg-muted', 'Hạn ' + fmtDate(m.expires_at) + ' ' + fmtTime(m.expires_at)));
        }
        card.appendChild(foot);
        return card;
    }

    function claimMission(m, button) {
        if (button.disabled) return;
        button.disabled = true;
        button.classList.add('is-busy');
        call({ action: 'mission.claim', user_mission_id: m.user_mission_id })
            .then(function (res) {
                if (res.state) applyState(res.state, true);
                var award = res.claim && res.claim.award;
                smallToast(award && award.awarded ? 'Nhận ' + award.amount + ' XP từ nhiệm vụ.' : 'Đã nhận thưởng nhiệm vụ.');
                if (res.claim && res.claim.evaluation) celebrate(res.claim.evaluation);
            })
            .catch(function (err) { smallToast((err && err.message) || 'Không nhận được thưởng.', 'error'); })
            .then(function () {
                button.disabled = false;
                button.classList.remove('is-busy');
            });
    }

    /* ---------------------------------------------------------------------
       Bộ sưu tập + kho vật phẩm
       ------------------------------------------------------------------ */
    function renderCollection(host) {
        var st = S.state;
        var wrap = el('section', 'bkg-section');
        wrap.id = 'bkg-collection';
        var unlocked = (st.achievements || []).filter(function (a) { return a.unlocked_at; }).length;
        var visible = (st.achievements || []).filter(function (a) { return a.visible !== false; }).length;
        wrap.appendChild(sectionHead('Bộ sưu tập thành tựu',
            unlocked + ' / ' + visible + ' thành tựu đã mở khoá · Vật phẩm đã nhận nằm trong kho đồ bên dưới.'));

        var filters = el('div', 'bkg-filters');
        filters.setAttribute('role', 'group');
        filters.setAttribute('aria-label', 'Lọc thành tựu');
        var select = el('select', 'bkg-select');
        select.setAttribute('aria-label', 'Lọc thành tựu theo nhóm');
        [['all', 'Tất cả'], ['unlocked', 'Đã mở khoá'], ['locked', 'Chưa mở khoá']].forEach(function (opt) {
            var o = el('option', null, opt[1]);
            o.value = opt[0];
            select.appendChild(o);
        });
        filters.appendChild(select);
        var search = el('input', 'bkg-input');
        search.type = 'search';
        search.placeholder = 'Tìm thành tựu…';
        search.setAttribute('aria-label', 'Tìm thành tựu theo tên');
        filters.appendChild(search);
        wrap.appendChild(filters);

        var grid = el('div', 'bkg-achievements');
        wrap.appendChild(grid);

        function paint() {
            grid.textContent = '';
            var mode = select.value;
            var q = String(search.value || '').toLowerCase().trim();
            var list = (st.achievements || []).filter(function (a) { return a.visible !== false; });
            if (mode === 'unlocked') list = list.filter(function (a) { return a.unlocked_at; });
            if (mode === 'locked') list = list.filter(function (a) { return !a.unlocked_at; });
            if (q) list = list.filter(function (a) { return String(a.name + ' ' + a.description).toLowerCase().indexOf(q) >= 0; });
            if (!list.length) {
                grid.appendChild(emptyState('Không có thành tựu phù hợp bộ lọc.', 'fa-filter-circle-xmark'));
                return;
            }
            list.forEach(function (a) { grid.appendChild(achievementCard(a)); });
        }
        select.addEventListener('change', paint);
        search.addEventListener('input', paint);
        paint();

        wrap.appendChild(renderInventory(st));
        host.appendChild(wrap);
    }

    function achievementCard(a) {
        var card = el('article', 'bkg-ach is-' + (a.unlocked_at ? 'unlocked' : 'locked') + ' rarity-' + a.rarity);
        var top = el('div', 'bkg-ach-top');
        var badge = el('span', 'bkg-ach-icon');
        badge.appendChild(icon(a.unlocked_at ? (a.icon || 'fa-medal') : 'fa-lock'));
        top.appendChild(badge);
        var meta = el('div', 'bkg-ach-meta');
        meta.appendChild(el('h4', null, a.name));
        meta.appendChild(el('span', 'bkg-ach-rarity', RARITY_LABELS[a.rarity] || a.rarity));
        top.appendChild(meta);
        card.appendChild(top);
        if (a.description) card.appendChild(el('p', 'bkg-card-desc', a.description));
        card.appendChild(progressBar(num(a.progress, 0), '', a.name + ': ' + num(a.progress, 0) + '%'));
        var foot = el('div', 'bkg-card-foot');
        foot.appendChild(el('span', 'bkg-muted', a.unlocked_at ? 'Mở khoá ' + fmtDate(a.unlocked_at) : num(a.progress, 0) + '%'));
        if (a.stages > 1) foot.appendChild(pill('Bậc ' + a.stage + '/' + a.stages, 'muted'));
        card.appendChild(foot);
        return card;
    }

    function renderInventory(st) {
        var box = el('div', 'bkg-group');
        var head = el('h3', 'bkg-sub-title');
        head.appendChild(icon('fa-box-open'));
        head.appendChild(document.createTextNode(' Kho vật phẩm'));
        box.appendChild(head);
        var catalog = st.catalog || [];
        if (!catalog.length) {
            box.appendChild(emptyState('Chưa có vật phẩm nào trong danh mục.', 'fa-gift'));
            return box;
        }
        var grid = el('div', 'bkg-cards');
        catalog.forEach(function (item) {
            grid.appendChild(inventoryCard(item, st));
        });
        box.appendChild(grid);
        return box;
    }

    function inventoryCard(item, st) {
        var owned = (st.inventory || []).filter(function (i) { return i.item_id === item.item_id; })[0];
        var card = el('article', 'bkg-card is-item' + (item.owned ? '' : ' is-locked'));
        var top = el('div', 'bkg-card-head');
        var ic = el('span', 'bkg-item-icon');
        ic.appendChild(icon(item.icon || 'fa-gift'));
        top.appendChild(ic);
        var info = el('div');
        info.appendChild(el('h4', null, item.name));
        info.appendChild(el('span', 'bkg-ach-rarity', (RARITY_LABELS[item.rarity] || item.rarity) + ' · ' + item.kind));
        top.appendChild(info);
        card.appendChild(top);
        if (item.description) card.appendChild(el('p', 'bkg-card-desc', item.description));
        var foot = el('div', 'bkg-card-foot');
        if (!item.owned) {
            foot.appendChild(pill('Chưa sở hữu', 'muted'));
            card.appendChild(foot);
            return card;
        }
        /* 8.3.5: khung đang dùng đọc từ HỒ SƠ (nguồn sự thật), không chỉ từ
           is_equipped của kho — nhờ vậy trang bị ở Hồ sơ cũng hiện đúng ở đây. */
        var inUse = !!(owned && owned.is_equipped) ||
            (item.kind === 'frame' && itemProfileFrame(item) === profileFrameId());
        foot.appendChild(pill(inUse ? 'Đang dùng' : 'Đã sở hữu', inUse ? 'ok' : 'muted'));
        var btn = el('button', 'bkg-btn');
        btn.type = 'button';
        btn.appendChild(icon(inUse ? 'fa-xmark' : 'fa-check'));
        btn.appendChild(el('span', null, inUse ? 'Bỏ dùng' : 'Dùng'));
        btn.addEventListener('click', function () {
            btn.disabled = true;
            call({ action: 'equip', item_id: item.item_id, equipped: !inUse })
                .then(function (res) {
                    if (res && res.kind === 'frame' && global.BKProfile &&
                        typeof global.BKProfile.applyServerFrame === 'function') {
                        global.BKProfile.applyServerFrame(res.frame || 'none');
                    }
                    if (res && res.state) applyState(res.state, false);
                    if (global.BKShell && typeof global.BKShell.refresh === 'function') {
                        try { global.BKShell.refresh(); } catch (e) { }
                    }
                })
                .catch(function (err) { smallToast((err && err.message) || 'Không đổi được vật phẩm.', 'error'); })
                .then(function () { btn.disabled = false; });
        });
        foot.appendChild(btn);
        card.appendChild(foot);
        return card;
    }

    /* ---------------------------------------------------------------------
       Cây kỹ năng
       ------------------------------------------------------------------ */
    function renderSkills(host) {
        var st = S.state;
        var wrap = el('section', 'bkg-section');
        wrap.id = 'bkg-skills';
        wrap.appendChild(sectionHead('Cây kỹ năng',
            'Mỗi nhánh phản ánh một năng lực học tập. Node chỉ mở khi đủ điều kiện và node trước đã hoàn thành.'));

        var branches = el('div', 'bkg-branches');
        BRANCHES.forEach(function (branch) {
            var summary = (st.branches || []).filter(function (b) { return b.id === branch.id; })[0] || { completed: 0, nodes: 0, progress: 0 };
            var col = el('div', 'bkg-branch');
            var head = el('div', 'bkg-branch-head');
            var ic = el('span', 'bkg-branch-icon');
            ic.appendChild(icon(branch.icon));
            head.appendChild(ic);
            var text = el('div');
            text.appendChild(el('h3', null, branch.name));
            text.appendChild(el('p', 'bkg-muted', branch.desc));
            head.appendChild(text);
            col.appendChild(head);
            col.appendChild(progressBar(num(summary.progress, 0), '', branch.name + ': ' + summary.completed + '/' + summary.nodes));
            col.appendChild(el('span', 'bkg-muted bkg-branch-count', summary.completed + ' / ' + summary.nodes + ' node hoàn thành'));

            var nodes = (st.nodes || []).filter(function (n) { return n.branch === branch.id; })
                .sort(function (a, b) { return num(a.sort_order, 0) - num(b.sort_order, 0); });
            var list = el('ul', 'bkg-nodes');
            nodes.forEach(function (n) { list.appendChild(nodeItem(n, st)); });
            col.appendChild(list);
            branches.appendChild(col);
        });
        wrap.appendChild(branches);
        host.appendChild(wrap);
    }

    function nodeItem(n, st) {
        var li = el('li', 'bkg-node is-' + n.status);
        var head = el('div', 'bkg-node-head');
        var ic = el('span', 'bkg-node-icon');
        ic.appendChild(icon(n.status === 'completed' ? 'fa-check' : (n.status === 'locked' ? 'fa-lock' : (n.icon || 'fa-circle-nodes'))));
        head.appendChild(ic);
        var info = el('div', 'bkg-node-info');
        info.appendChild(el('b', null, n.name));
        info.appendChild(el('span', 'bkg-muted', n.description));
        head.appendChild(info);
        head.appendChild(pill(STATUS_LABELS[n.status] || n.status, statusTone(n.status)));
        li.appendChild(head);
        li.appendChild(progressBar(num(n.progress, 0), 'is-sm', n.name + ': ' + num(n.progress, 0) + '%'));

        var note = el('p', 'bkg-node-note');
        if (n.status === 'locked') {
            var missing = (n.requires || []).filter(function (req) {
                var prev = (st.nodes || []).filter(function (x) { return x.id === req; })[0];
                return !prev || prev.status !== 'completed';
            });
            note.textContent = missing.length
                ? 'Cần hoàn thành: ' + missing.map(function (id) {
                    var prev = (st.nodes || []).filter(function (x) { return x.id === id; })[0];
                    return prev ? prev.name : id;
                }).join(', ') + '.'
                : 'Chưa đủ điều kiện mở node này.';
        } else if (n.status !== 'completed') {
            note.textContent = 'Tiến độ: ' + num(n.metric_value, 0) + ' / ' + num(n.target, 1) +
                ' (' + (ACTIVITY_LABELS[n.metric] || n.metric) + ').';
        } else {
            note.textContent = 'Đã hoàn thành' + (n.completed_at ? ' ngày ' + fmtDate(n.completed_at) : '') + '.';
        }
        li.appendChild(note);
        return li;
    }

    /* ---------------------------------------------------------------------
       Boss Challenge
       ------------------------------------------------------------------ */
    function renderBoss(host) {
        var st = S.state;
        var wrap = el('section', 'bkg-section');
        wrap.id = 'bkg-boss';
        wrap.appendChild(sectionHead('Thử thách Boss',
            'Câu hỏi do quản trị viên biên soạn, chấm điểm tại máy chủ. Đáp án chỉ hiện sau khi nộp bài.'));

        var challenges = st.challenges || [];
        if (!challenges.length) {
            wrap.appendChild(emptyState('Hiện chưa có thử thách nào đang mở. Thử thách mới sẽ xuất hiện ở đây khi được phát hành.', 'fa-dragon'));
        } else {
            var grid = el('div', 'bkg-cards');
            challenges.forEach(function (c) { grid.appendChild(challengeCard(c)); });
            wrap.appendChild(grid);
        }

        var attempts = st.attempts || [];
        if (attempts.length) {
            var box = el('div', 'bkg-history-box');
            box.appendChild(el('h3', 'bkg-sub-title', 'Kết quả gần đây'));
            var table = el('table', 'bkg-table');
            var thead = el('thead');
            var hr = el('tr');
            ['Thử thách', 'Điểm', 'Đúng', 'Kết quả', 'Thời điểm'].forEach(function (h) {
                var th = el('th', null, h);
                th.scope = 'col';
                hr.appendChild(th);
            });
            thead.appendChild(hr);
            table.appendChild(thead);
            var tbody = el('tbody');
            attempts.forEach(function (a) {
                var tr = el('tr');
                tr.appendChild(el('td', null, a.name));
                tr.appendChild(el('td', null, a.score + '%'));
                tr.appendChild(el('td', null, a.correct + '/' + a.total));
                var td = el('td');
                td.appendChild(pill(a.passed ? 'Vượt qua' : 'Chưa đạt', a.passed ? 'ok' : 'muted'));
                tr.appendChild(td);
                tr.appendChild(el('td', null, fmtRelative(a.created_at)));
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            box.appendChild(table);
            wrap.appendChild(box);
        }
        host.appendChild(wrap);
    }

    function challengeCard(c) {
        var card = el('article', 'bkg-card is-boss');
        var head = el('div', 'bkg-card-head');
        head.appendChild(el('h4', null, c.name));
        head.appendChild(pill(c.passed ? 'Đã vượt' : (c.difficulty === 'hard' ? 'Khó' : c.difficulty === 'easy' ? 'Dễ' : 'Vừa'),
            c.passed ? 'ok' : 'info'));
        card.appendChild(head);
        if (c.description) card.appendChild(el('p', 'bkg-card-desc', c.description));
        var meta = el('div', 'bkg-boss-meta');
        meta.appendChild(el('span', null, c.question_count + ' câu'));
        meta.appendChild(el('span', null, 'Điểm đạt: ' + c.pass_score + '%'));
        meta.appendChild(el('span', null, 'Lượt đã dùng: ' + c.attempts_used + '/' + (c.attempts_used + Math.max(0, 3))));
        if (c.best_score != null) meta.appendChild(el('span', null, 'Điểm cao nhất: ' + c.best_score + '%'));
        card.appendChild(meta);
        var foot = el('div', 'bkg-card-foot');
        if (c.closes_at) foot.appendChild(el('span', 'bkg-muted', 'Đóng ' + fmtDate(c.closes_at)));
        var btn = el('button', 'bkg-btn is-primary');
        btn.type = 'button';
        btn.appendChild(icon('fa-play'));
        btn.appendChild(el('span', null, 'Bắt đầu'));
        btn.addEventListener('click', function () { startBoss(c, btn, card); });
        foot.appendChild(btn);
        card.appendChild(foot);
        return card;
    }

    function startBoss(challenge, button, card) {
        button.disabled = true;
        call({ action: 'boss.start', slug: challenge.slug })
            .then(function (res) {
                S.boss = { challenge: res.challenge, questions: res.questions, answers: {}, key: 'boss-' + uuid() };
                renderBossRunner(card);
                button.disabled = false;
            })
            .catch(function (err) {
                smallToast((err && err.message) || 'Không mở được thử thách.', 'error');
                button.disabled = false;
            });
    }

    function renderBossRunner(card) {
        var run = S.boss;
        if (!run) return;
        card.textContent = '';
        var head = el('div', 'bkg-card-head');
        head.appendChild(el('h4', null, run.challenge.name));
        head.appendChild(pill(run.questions.length + ' câu', 'info'));
        card.appendChild(head);

        var form = el('form', 'bkg-boss-form');
        form.setAttribute('novalidate', 'novalidate');
        run.questions.forEach(function (q, index) {
            var fs = el('fieldset', 'bkg-question');
            var legend = el('legend');
            legend.textContent = 'Câu ' + (index + 1) + '. ' + q.prompt;
            fs.appendChild(legend);
            (q.options || []).forEach(function (opt, oi) {
                var label = el('label', 'bkg-option');
                var input = el('input');
                input.type = 'radio';
                input.name = 'q-' + q.id;
                input.value = String(oi);
                input.addEventListener('change', function () { run.answers[q.id] = oi; });
                label.appendChild(input);
                label.appendChild(el('span', null, opt));
                fs.appendChild(label);
            });
            form.appendChild(fs);
        });

        var foot = el('div', 'bkg-card-foot');
        var submit = el('button', 'bkg-btn is-primary');
        submit.type = 'submit';
        submit.appendChild(icon('fa-paper-plane'));
        submit.appendChild(el('span', null, 'Nộp bài'));
        foot.appendChild(submit);
        var cancel = el('button', 'bkg-btn');
        cancel.type = 'button';
        cancel.appendChild(el('span', null, 'Đóng'));
        cancel.addEventListener('click', function () {
            S.boss = null;
            if (S.host) renderAll();
        });
        foot.appendChild(cancel);
        form.appendChild(foot);

        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var answers = run.questions.map(function (q) {
                return { question_id: q.id, choice: run.answers[q.id] };
            }).filter(function (a) { return typeof a.choice === 'number'; });
            if (answers.length < run.questions.length) {
                smallToast('Hãy trả lời đủ ' + run.questions.length + ' câu trước khi nộp.', 'error');
                return;
            }
            submit.disabled = true;
            submit.classList.add('is-busy');
            call({
                action: 'boss.submit',
                slug: run.challenge.slug,
                answers: answers,
                idempotency_key: run.key
            }).then(function (res) {
                var result = res.result;
                if (res.state) applyState(res.state, false);
                S.boss = null;
                renderBossResult(card, result);
            }).catch(function (err) {
                smallToast((err && err.message) || 'Không nộp được thử thách.', 'error');
                submit.disabled = false;
                submit.classList.remove('is-busy');
            });
        });
        card.appendChild(form);
    }

    function renderBossResult(card, result) {
        card.textContent = '';
        var head = el('div', 'bkg-card-head');
        head.appendChild(el('h4', null, 'Kết quả thử thách'));
        head.appendChild(pill(result.passed ? 'Vượt qua' : 'Chưa đạt', result.passed ? 'ok' : 'warn'));
        card.appendChild(head);
        card.appendChild(el('p', 'bkg-score-line',
            result.correct + ' / ' + result.total + ' câu đúng · ' + result.score + '%'));
        card.appendChild(progressBar(result.score, result.passed ? 'is-ok' : 'is-warn', 'Điểm thử thách'));

        var list = el('ul', 'bkg-result-list');
        (result.details || []).forEach(function (d, index) {
            var li = el('li', d.is_correct ? 'is-ok' : 'is-warn');
            li.appendChild(icon(d.is_correct ? 'fa-circle-check' : 'fa-circle-xmark'));
            var body = el('div');
            body.appendChild(el('b', null, 'Câu ' + (index + 1) + (d.is_correct ? ' — đúng' : ' — chưa đúng')));
            if (d.explanation) body.appendChild(el('span', 'bkg-muted', d.explanation));
            li.appendChild(body);
            list.appendChild(li);
        });
        card.appendChild(list);
        if (result.award && result.award.awarded) {
            card.appendChild(el('p', 'bkg-muted', 'Nhận ' + result.award.amount + ' XP cho lần vượt thử thách này.'));
        }
        var foot = el('div', 'bkg-card-foot');
        var back = el('button', 'bkg-btn');
        back.type = 'button';
        back.appendChild(el('span', null, 'Danh sách thử thách'));
        back.addEventListener('click', function () { if (S.host) renderAll(); });
        foot.appendChild(back);
        card.appendChild(foot);
    }

    /* ---------------------------------------------------------------------
       Lịch sử XP
       ------------------------------------------------------------------ */
    function renderHistory(host) {
        var st = S.state;
        var wrap = el('section', 'bkg-section');
        wrap.id = 'bkg-history';
        wrap.appendChild(sectionHead('Lịch sử XP',
            'Mỗi dòng là một giao dịch do máy chủ ghi nhận; không thể sửa từ trình duyệt.'));

        var rows = st.transactions || [];
        if (!rows.length) {
            wrap.appendChild(emptyState('Chưa có giao dịch XP nào. Hoàn thành một bài học để bắt đầu.', 'fa-coins'));
        } else {
            var table = el('table', 'bkg-table');
            var thead = el('thead');
            var hr = el('tr');
            ['Hoạt động', 'XP', 'Nguồn', 'Thời điểm'].forEach(function (h) {
                var th = el('th', null, h);
                th.scope = 'col';
                hr.appendChild(th);
            });
            thead.appendChild(hr);
            table.appendChild(thead);
            var tbody = el('tbody');
            var hostRows = tbody;
            rows.forEach(function (t) {
                var tr = el('tr');
                tr.appendChild(el('td', null, ACTIVITY_LABELS[t.activity] || t.activity));
                var amount = el('td', 'bkg-xp-amount', (t.amount > 0 ? '+' : '') + t.amount);
                tr.appendChild(amount);
                tr.appendChild(el('td', 'bkg-muted', shortenSource(t.source)));
                tr.appendChild(el('td', 'bkg-muted', fmtDate(t.created_at) + ' ' + fmtTime(t.created_at)));
                hostRows.appendChild(tr);
            });
            table.appendChild(tbody);
            wrap.appendChild(table);

            var more = el('button', 'bkg-btn');
            more.type = 'button';
            more.appendChild(icon('fa-download'));
            more.appendChild(el('span', null, 'Tải thêm'));
            more.addEventListener('click', function () {
                more.disabled = true;
                call({ action: 'history', limit: 20, offset: num(S.historyOffset, 0) + rows.length })
                    .then(function (res) {
                        S.historyOffset = num(S.historyOffset, 0) + rows.length;
                        (res.rows || []).forEach(function (t) {
                            var tr = el('tr');
                            tr.appendChild(el('td', null, ACTIVITY_LABELS[t.activity] || t.activity));
                            tr.appendChild(el('td', 'bkg-xp-amount', (t.amount > 0 ? '+' : '') + t.amount));
                            tr.appendChild(el('td', 'bkg-muted', shortenSource(t.source)));
                            tr.appendChild(el('td', 'bkg-muted', fmtDate(t.created_at) + ' ' + fmtTime(t.created_at)));
                            tbody.appendChild(tr);
                        });
                        if (!(res.rows || []).length) {
                            more.remove();
                            wrap.appendChild(el('p', 'bkg-muted', 'Đã hiển thị toàn bộ lịch sử.'));
                        }
                    })
                    .catch(function () { smallToast('Không tải thêm được lịch sử.', 'error'); })
                    .then(function () { more.disabled = false; });
            });
            wrap.appendChild(more);
        }

        var levelLogs = st.level_logs || [];
        if (levelLogs.length) {
            var box = el('div', 'bkg-history-box');
            box.appendChild(el('h3', 'bkg-sub-title', 'Lịch sử lên cấp'));
            var list = el('ul', 'bkg-history-list');
            levelLogs.forEach(function (l) {
                var li = el('li');
                var d = l.detail || {};
                li.appendChild(el('span', null, 'Cấp ' + (d.from || '?') + ' → ' + (d.to || '?') +
                    (d.total_xp != null ? ' · ' + d.total_xp + ' XP' : '')));
                li.appendChild(el('span', 'bkg-muted', fmtDate(l.created_at) + ' ' + fmtTime(l.created_at)));
                list.appendChild(li);
            });
            box.appendChild(list);
            wrap.appendChild(box);
        }

        wrap.appendChild(renderSettings());
        host.appendChild(wrap);
    }

    function shortenSource(src) {
        if (!src) return '—';
        var s = String(src);
        try {
            if (/^https?:/i.test(s)) {
                var u = new global.URL(s);
                return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.pathname);
            }
        } catch (e) { }
        return s.length > 46 ? s.slice(0, 43) + '…' : s;
    }

    function renderSettings() {
        var box = el('div', 'bkg-history-box');
        box.appendChild(el('h3', 'bkg-sub-title', 'Tuỳ chọn hiển thị'));
        var p = prefs();
        var row = el('div', 'bkg-toggle-row');
        var label = el('label', 'bkg-toggle');
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!p.animations;
        cb.addEventListener('change', function () {
            savePrefs({ animations: cb.checked });
            smallToast(cb.checked ? 'Đã bật hiệu ứng.' : 'Đã giảm hiệu ứng chuyển động.');
        });
        label.appendChild(cb);
        label.appendChild(el('span', null, 'Hiệu ứng chuyển động'));
        row.appendChild(label);

        var label2 = el('label', 'bkg-toggle');
        var cb2 = el('input');
        cb2.type = 'checkbox';
        cb2.checked = !!p.notify;
        cb2.addEventListener('change', function () {
            savePrefs({ notify: cb2.checked });
        });
        label2.appendChild(cb2);
        label2.appendChild(el('span', null, 'Thông báo lên cấp / thành tựu'));
        row.appendChild(label2);
        box.appendChild(row);
        box.appendChild(el('p', 'bkg-muted bkg-small',
            'Tiến trình được lưu trên máy chủ Supabase và đồng bộ giữa các thiết bị. Khi mất mạng, sự kiện học tập được xếp hàng và gửi lại sau.'));
        return box;
    }

    /* ---------------------------------------------------------------------
       Dựng toàn bộ trang
       ------------------------------------------------------------------ */
    function renderGate(info, action) {
        var box = el('div', 'bkg-gate');
        box.appendChild(icon(info.icon || 'fa-circle-info'));
        box.appendChild(el('h2', null, info.title));
        box.appendChild(el('p', null, info.text));
        box.appendChild(el('p', 'bkg-error-code', info.code));
        if (action === 'home') {
            var a = el('a', 'bkg-btn is-primary');
            a.href = '../';
            a.appendChild(el('span', null, 'Về trang chủ để nhận diện'));
            box.appendChild(a);
        } else if (action === 'retry') {
            var btn = el('button', 'bkg-btn is-primary');
            btn.type = 'button';
            btn.appendChild(el('span', null, 'Thử lại'));
            btn.addEventListener('click', function () { retry(); });
            box.appendChild(btn);
        }
        return box;
    }

    function renderPartialNotice() {
        var info = ERROR_UI[S.errorCode] || ERROR_UI.error;
        var bar = el('div', 'bkg-notice');
        bar.setAttribute('role', 'status');
        bar.appendChild(icon(info.icon));
        bar.appendChild(el('p', null, 'Một số dữ liệu chưa tải được (' + info.code + '). Đang hiển thị bản đã lưu trên thiết bị.'));
        var again = el('button', 'bkg-btn is-ghost');
        again.type = 'button';
        again.appendChild(el('span', null, 'Làm mới'));
        again.addEventListener('click', function () { retry(); });
        bar.appendChild(again);
        return bar;
    }

    function renderAll() {
        var host = S.host;
        if (!host) return;
        host.textContent = '';

        if (!studentId()) {
            host.appendChild(renderGate(ERROR_UI.no_session, 'home'));
            return;
        }

        if (!S.state) {
            if (S.status === STATUS.loading || S.status === STATUS.restoring ||
                S.status === STATUS.idle) {
                var loading = el('div', 'bkg-gate');
                loading.appendChild(el('div', 'bkg-spinner'));
                loading.appendChild(el('p', null, S.retries
                    ? 'Đang kết nối lại máy chủ… (lần ' + S.retries + '/' + RETRY_LIMIT + ')'
                    : 'Đang tải tiến trình…'));
                host.appendChild(loading);
                /* Không tự gọi refresh ở đây: việc tải do mount/retry/sự kiện
                   danh tính điều phối, tránh chồng request khi đang thử lại. */
                return;
            }
            host.appendChild(renderGate(ERROR_UI[S.errorCode] || ERROR_UI.error, 'retry'));
            return;
        }

        /* Đã có dữ liệu nhưng lần tải mới nhất lỗi: giữ nội dung, báo nhẹ ở trên. */
        if (S.errorCode) host.appendChild(renderPartialNotice());

        renderHero(host);
        renderMissions(host);
        renderCollection(host);
        renderSkills(host);
        renderBoss(host);
        renderHistory(host);
    }

    function mount(host) {
        if (typeof host === 'string') host = D.getElementById(host);
        if (!host) return;
        S.host = host;
        host.classList.add('bkg');
        if (!studentId() && cloudApi()) {
            S.status = STATUS.restoring;
            setTimeout(function () {
                if (S.status === STATUS.restoring && !studentId()) {
                    S.status = STATUS.noSession;
                    S.errorCode = 'no_session';
                    if (S.host) renderAll();
                }
            }, 1200);
        }
        renderAll();
        if (!S.booted) {
            S.booted = true;
            refresh(false);
            global.addEventListener('online', function () { flush(); refresh(true); });
            global.addEventListener('bk:identity', function () {
                S.state = null;
                S.historyOffset = 0;
                lastProfileSig = '';
                renderAll();
                refresh(true);
                flush();
            });
            /* 8.3.5: đổi avatar/khung ở Hồ sơ (kể cả tab khác) thì hero vẽ lại. */
            if (global.BKProfile && typeof global.BKProfile.on === 'function') {
                global.BKProfile.on(function () {
                    var sig = profileSignature();
                    if (sig === lastProfileSig) return;
                    lastProfileSig = sig;
                    if (S.host) renderAll();
                });
            }
            lastProfileSig = profileSignature();
        }
    }

    /* ---------------------------------------------------------------------
       Theo dõi hoạt động học tập có thật trên trang bài học
       ------------------------------------------------------------------ */
    function bootPageTracking() {
        if (!studentId()) return;
        var path = global.location.pathname;
        if (/\/(admin|founder|gamification|settings|profile|studio)\//.test(path)) return;
        var isContent = !!D.querySelector('#quiz-container, .question, .quiz, [data-question], main article') ||
            /\/kt(gk|ck|tx)\d?\//i.test(path);
        if (!isContent) return;
        var title = String(D.title || '');
        var listening = /nghe|listening|audio/i.test(title + ' ' + path);
        /* Một lượt học/đọc cho mỗi bài mỗi ngày; máy chủ giới hạn thêm. */
        setTimeout(function () {
            track('lesson_study', path, { dayScoped: true });
            if (listening) track('listening_completed', path, { dayScoped: true });
        }, 2500);
    }

    function init() {
        flush();
        /* Hàng đợi được gửi lại ngay khi lớp Supabase nhận diện xong thiết bị,
           khi có mạng trở lại, và một lần sau khi trang ổn định. */
        global.addEventListener('bk:identity', function () { flush(); });
        global.addEventListener('online', function () { flush(); });
        setTimeout(flush, 5000);
        bootPageTracking();
        if (D.getElementById('bkGamificationRoot')) mount('bkGamificationRoot');
    }

    var apiPublic = {
        track: track,
        event: track,
        flush: flush,
        refresh: refresh,
        retry: retry,
        status: function () { return S.status; },
        lastError: function () { return S.lastError; },
        mount: mount,
        state: state,
        config: config,
        prefs: prefs,
        setPrefs: savePrefs,
        levelFromXp: levelFromXp,
        levelFloor: levelFloor,
        xpToNext: xpToNext,
        progressOf: progressOf,
        branches: BRANCHES,
        activities: ACTIVITY_LABELS,
        __ready: true
    };

    if (BK) BK.gamification = apiPublic;

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : this);
