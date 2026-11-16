/* =========================================================================
   Bá Khí — bk-profile.js
   Hồ sơ cá nhân local-first dùng chung cho header, trang Hồ sơ và Settings.

   - Một kho dữ liệu duy nhất: localStorage `bakhiProfile.v1`
   - Ảnh đại diện / ảnh bìa được thu nhỏ bằng canvas rồi lưu dạng data URL
   - Không bao giờ dùng innerHTML với dữ liệu người dùng
   - Không chứa bí mật, không gọi mạng

   Công khai: window.BKProfile
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKProfile) return;

    var KEY = 'bakhiProfile.v1';
    var SCHEMA = 1;

    var LIMITS = {
        nickname: 32,
        bio: 320,
        links: 6,
        linkLabel: 24,
        linkUrl: 300,
        avatarBytes: 380 * 1024,
        bannerBytes: 620 * 1024,
        uploadBytes: 8 * 1024 * 1024
    };

    /* ---------------------------------------------------------------------
       Khung avatar (trang trí, không thay ảnh gốc)
       ------------------------------------------------------------------ */
    var FRAMES = [
        { id: 'none', name: 'Mặc định', glyph: '', rarity: 'common', ring: '#94a3b8' },
        { id: 'leaf', name: 'Vòng lá', glyph: '🍃', rarity: 'common', ring: '#10b981' },
        { id: 'sakura', name: 'Hoa sakura', glyph: '🌸', rarity: 'uncommon', ring: '#f9a8d4' },
        { id: 'sunflower', name: 'Hoa hướng dương', glyph: '🌻', rarity: 'uncommon', ring: '#f59e0b' },
        { id: 'wreath', name: 'Vòng hoa', glyph: '🌿', rarity: 'uncommon', ring: '#22c55e' },
        { id: 'ear-cat', name: 'Tai mèo', glyph: '🐱', rarity: 'rare', ring: '#fb923c' },
        { id: 'ear-fox', name: 'Tai cáo', glyph: '🦊', rarity: 'rare', ring: '#f97316' },
        { id: 'ear-bunny', name: 'Tai thỏ', glyph: '🐰', rarity: 'rare', ring: '#e879f9' },
        { id: 'ear-wolf', name: 'Tai sói', glyph: '🐺', rarity: 'epic', ring: '#64748b' },
        { id: 'antler', name: 'Sừng hươu', glyph: '🦌', rarity: 'epic', ring: '#a16207' },
        { id: 'horn-dragon', name: 'Sừng giả tưởng', glyph: '🐲', rarity: 'legendary', ring: '#ef4444' },
        { id: 'crown', name: 'Vương miện', glyph: '👑', rarity: 'legendary', ring: '#eab308' },
        { id: 'star', name: 'Ngôi sao', glyph: '✨', rarity: 'secret', ring: '#8b5cf6' }
    ];

    function frameById(id) {
        for (var i = 0; i < FRAMES.length; i++) if (FRAMES[i].id === id) return FRAMES[i];
        return FRAMES[0];
    }

    /** Khung được sở hữu: khung cơ bản + phần thưởng từ badge đã mở. */
    function ownedFrames() {
        if (global.BK && global.BK.badges && global.BK.badges.ownedFrames) {
            try { return global.BK.badges.ownedFrames(); } catch (e) { }
        }
        return ['none', 'leaf'];
    }

    function canEquip(frameId) {
        return ownedFrames().indexOf(frameById(frameId).id) !== -1;
    }

    function equipFrame(frameId) {
        var id = frameById(frameId).id;
        if (!canEquip(id)) return { ok: false, error: 'Bạn chưa mở khóa khung này.' };
        save({ frame: id });
        return { ok: true, frame: id };
    }

    /* ---------------------------------------------------------------------
       Tiện ích
       ------------------------------------------------------------------ */
    function now() { return Date.now(); }
    function clampStr(v, max) {
        var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return s.slice(0, max);
    }
    function clampText(v, max) {
        return String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);
    }
    function lsGet(k) {
        try { return global.localStorage.getItem(k); } catch (e) { return null; }
    }
    function lsSet(k, v) {
        try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; }
    }
    function safeParse(raw) {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    /** Liên kết mạng xã hội: chỉ chấp nhận http/https, chặn javascript:. */
    function safeUrl(url) {
        var u = String(url == null ? '' : url).trim();
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
        try {
            var parsed = new URL(u);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            return parsed.href.slice(0, LIMITS.linkUrl);
        } catch (e) { return ''; }
    }

    /* ---------------------------------------------------------------------
       Danh tính học sinh (dùng chung với bk-cloud)
       ------------------------------------------------------------------ */
    function identity() {
        var saved = safeParse(lsGet('bakhiStudent.v1')) || {};
        var id = saved.studentId ? String(saved.studentId) : '';
        var name = saved.displayName ? String(saved.displayName) : '';
        return {
            key: id || 'local',
            studentId: id,
            name: name,
            anonymous: !id
        };
    }

    /* ---------------------------------------------------------------------
       Kho hồ sơ
       ------------------------------------------------------------------ */
    function emptyProfile() {
        return {
            nickname: '',
            bio: '',
            avatar: '',
            banner: '',
            frame: 'none',
            links: [],
            updatedAt: 0
        };
    }

    function sanitizeProfile(raw) {
        var p = emptyProfile();
        if (!raw || typeof raw !== 'object') return p;
        p.nickname = clampStr(raw.nickname, LIMITS.nickname);
        p.bio = clampText(raw.bio, LIMITS.bio);
        if (typeof raw.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(raw.avatar) && raw.avatar.length <= LIMITS.avatarBytes * 1.4) {
            p.avatar = raw.avatar;
        }
        if (typeof raw.banner === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(raw.banner) && raw.banner.length <= LIMITS.bannerBytes * 1.4) {
            p.banner = raw.banner;
        }
        p.frame = frameById(raw.frame).id;
        p.updatedAt = Number(raw.updatedAt) || 0;
        (Array.isArray(raw.links) ? raw.links : []).slice(0, LIMITS.links).forEach(function (l) {
            if (!l) return;
            var url = safeUrl(l.url);
            if (!url) return;
            p.links.push({
                label: clampStr(l.label, LIMITS.linkLabel) || 'Liên kết',
                url: url,
                visible: l.visible !== false
            });
        });
        return p;
    }

    function readAll() {
        var data = safeParse(lsGet(KEY));
        var out = { v: SCHEMA, profiles: {} };
        if (data && typeof data === 'object' && data.profiles && typeof data.profiles === 'object') {
            Object.keys(data.profiles).slice(0, 200).forEach(function (k) {
                out.profiles[k] = sanitizeProfile(data.profiles[k]);
            });
        }
        return out;
    }

    function writeAll(data) {
        var ok = lsSet(KEY, JSON.stringify(data));
        if (ok) emit('save');
        return ok;
    }

    function get(identityOverride) {
        var idc = identityOverride || identity();
        var all = readAll();
        return all.profiles[idc.key] || emptyProfile();
    }

    function save(patch) {
        var idc = identity();
        var all = readAll();
        var cur = all.profiles[idc.key] || emptyProfile();
        var next = sanitizeProfile(Object.assign({}, cur, patch || {}, { updatedAt: now() }));
        all.profiles[idc.key] = next;
        writeAll(all);
        return next;
    }

    function reset() {
        var idc = identity();
        var all = readAll();
        delete all.profiles[idc.key];
        writeAll(all);
        return emptyProfile();
    }

    /* ---------------------------------------------------------------------
       Sự kiện (đồng bộ giữa các tab và trong cùng trang)
       ------------------------------------------------------------------ */
    function emit(kind) {
        try {
            D.dispatchEvent(new CustomEvent('bkprofile', { detail: { kind: kind, profile: get() } }));
        } catch (e) { /* CustomEvent không có (rất cũ) */ }
    }

    function on(fn) {
        return listen(fn);
    }

    var listeners = [];
    function listen(fn) {
        if (typeof fn !== 'function') return function () { };
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    }

    D.addEventListener('bkprofile', function (e) {
        (listeners || []).slice().forEach(function (fn) {
            try { fn(e.detail); } catch (err) { /* bỏ qua lỗi người nghe */ }
        });
    });

    if (global.addEventListener) {
        global.addEventListener('storage', function (e) {
            if (e && e.key === KEY) emit('external');
        });
    }

    /* ---------------------------------------------------------------------
       Ảnh: thu nhỏ bằng canvas
       ------------------------------------------------------------------ */
    function processImage(file, opts, cb) {
        opts = opts || {};
        if (typeof cb !== 'function') return;
        if (!file) return cb(new Error('Chưa chọn tệp.'));
        if (!/^image\/(png|jpeg|webp)$/i.test(file.type || '')) {
            return cb(new Error('Chỉ nhận ảnh PNG, JPEG hoặc WebP.'));
        }
        if (file.size > LIMITS.uploadBytes) {
            return cb(new Error('Ảnh quá lớn (tối đa 8 MB).'));
        }
        var maxW = opts.width || 320;
        var maxH = opts.height || 320;
        var quality = opts.quality || 0.86;
        var url;
        try { url = URL.createObjectURL(file); } catch (e) { return cb(new Error('Trình duyệt không đọc được tệp.')); }
        var img = new global.Image();
        img.onerror = function () {
            URL.revokeObjectURL(url);
            cb(new Error('Không đọc được ảnh này.'));
        };
        img.onload = function () {
            try {
                var ratio = Math.min(1, maxW / img.width, maxH / img.height);
                var w = Math.max(1, Math.round(img.width * ratio));
                var h = Math.max(1, Math.round(img.height * ratio));
                var canvas = D.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext && canvas.getContext('2d');
                if (!ctx) throw new Error('no-canvas');
                ctx.drawImage(img, 0, 0, w, h);
                var data = canvas.toDataURL('image/jpeg', quality);
                URL.revokeObjectURL(url);
                cb(null, data);
            } catch (e) {
                URL.revokeObjectURL(url);
                cb(new Error('Trình duyệt không hỗ trợ xử lý ảnh.'));
            }
        };
        img.src = url;
    }

    function setAvatar(file, cb) {
        processImage(file, { width: 320, height: 320 }, function (err, data) {
            if (err) return cb && cb(err);
            cb && cb(null, save({ avatar: data }));
        });
    }

    function setBanner(file, cb) {
        processImage(file, { width: 1200, height: 420, quality: 0.82 }, function (err, data) {
            if (err) return cb && cb(err);
            cb && cb(null, save({ banner: data }));
        });
    }

    /* ---------------------------------------------------------------------
       Hiển thị
       ------------------------------------------------------------------ */
    function displayName(profile) {
        var idc = identity();
        var p = profile || get();
        return p.nickname || idc.name || 'Khách';
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'BK';
        var last = parts[parts.length - 1];
        var first = parts.length > 1 ? parts[0] : '';
        return (first ? first.charAt(0) : last.charAt(0)) + (parts.length > 1 ? last.charAt(0) : '');
    }

    /**
     * Tạo phần tử avatar có khung. Dùng chung cho header, hồ sơ và chat.
     * opts: { size, showFrame, className }
     */
    function avatarNode(opts) {
        opts = opts || {};
        var idc = identity();
        var p = get(idc);
        var size = opts.size || 36;
        var wrap = D.createElement('span');
        wrap.className = 'bk-avatar' + (opts.className ? ' ' + opts.className : '');
        wrap.style.width = size + 'px';
        wrap.style.height = size + 'px';

        var frame = frameById(opts.showFrame === false ? 'none' : p.frame);
        wrap.setAttribute('data-frame', frame.id);
        if (frame.id !== 'none') {
            wrap.style.setProperty('--bk-avatar-ring', frame.ring);
            wrap.classList.add('bk-avatar-framed');
            if (frame.glyph) {
                var orn = D.createElement('span');
                orn.className = 'bk-avatar-orn';
                orn.setAttribute('aria-hidden', 'true');
                orn.textContent = frame.glyph;
                wrap.appendChild(orn);
            }
        }

        if (p.avatar) {
            var img = D.createElement('img');
            img.className = 'bk-avatar-img';
            img.alt = '';
            img.src = p.avatar;
            wrap.appendChild(img);
        } else {
            var fb = D.createElement('span');
            fb.className = 'bk-avatar-fallback';
            fb.setAttribute('aria-hidden', 'true');
            fb.textContent = initials(displayName(p));
            wrap.appendChild(fb);
        }
        wrap.setAttribute('role', 'img');
        wrap.setAttribute('aria-label', 'Ảnh đại diện của ' + displayName(p));
        return wrap;
    }

    global.BKProfile = {
        KEY: KEY,
        LIMITS: LIMITS,
        frames: FRAMES,
        frameById: frameById,
        ownedFrames: ownedFrames,
        canEquip: canEquip,
        equipFrame: equipFrame,
        identity: identity,
        get: get,
        save: save,
        reset: reset,
        on: on,
        off: on, /* giữ chữ ký đối xứng: hàm trả về unsubscribe */
        displayName: displayName,
        initials: initials,
        avatarNode: avatarNode,
        setAvatar: setAvatar,
        setBanner: setBanner,
        safeUrl: safeUrl,
        processImage: processImage,
        /* Đọc hồ sơ của học sinh khác (dùng cho profile card trong chat sau này) */
        getFor: function (studentKey) { return get({ key: String(studentKey || 'local') }); }
    };
})(typeof window !== 'undefined' ? window : this);
