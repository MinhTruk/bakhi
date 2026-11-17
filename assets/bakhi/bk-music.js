/* =========================================================================
   Bá Khí — bk-music.js : Thư viện nhạc cá nhân (Bá Khí 7.0)
   -------------------------------------------------------------------------
   Thay đổi so với 6.x:
     - KHÔNG còn thư viện mặc định và KHÔNG còn file .mp3 trong repo.
     - Mỗi học sinh tự thêm liên kết YouTube / Spotify / SoundCloud chính thức.
     - Phát bằng iframe nhúng chính thức của nền tảng (không tải audio về máy).
     - Tên bài, nghệ sĩ và lời bài hát do người dùng nhập, sửa được.
     - Ảnh bìa sinh từ chữ cái đầu + màu theo tên bài (không cần file PNG).
     - Lưu cục bộ trước (bakhiMusic.v3) và đồng bộ bảng music_tracks theo
       học sinh đã nhận diện (RLS: mỗi người chỉ thấy hàng của mình).

   Nguyên tắc:
     - Không autoplay khi mở trang.
     - Không nhân bản iframe/player (một controller cho mỗi trang).
     - Lỗi mạng/đồng bộ không làm mất thư viện cục bộ.
   ========================================================================= */
(function (global) {
    'use strict';
    var D = global.document;
    var BK = global.BK;
    if (!D) return;

    function svg(d) {
        return '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
    }
    var ICONS = {
        music: svg('M12 3v10.55A4 4 0 1 0 14 17V7h4V3z'),
        close: svg('M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.89 18.3 9.17 12 2.89 5.71 4.3 4.29l6.29 6.3 6.3-6.3z'),
        shuffle: svg('M17 3h4v4h-2V6.41l-3.29 3.3-1.42-1.42L17.59 5H17zM3 5h4.5l3 3-1.42 1.42L6.79 7H3zm14 12.59 1.29 1.3 1.3-1.3V19h2v4h-4v-2h.41l-1.3-1.3zM3 19h4.5l10-10H21v2h-2.5l-10 10H3z'),
        prev: svg('M6 5h2v14H6zM20 5v14L9 12z'),
        next: svg('M16 5h2v14h-2zM4 5l11 7-11 7z'),
        play: svg('M8 5v14l11-7z'),
        pause: svg('M7 5h4v14H7zm6 0h4v14h-4z'),
        repeat: svg('M7 7h9V4l4 4-4 4V9H7a1 1 0 0 0-1 1v3H4V10a3 3 0 0 1 3-3zm10 10H8v3l-4-4 4-4v3h9a1 1 0 0 0 1-1v-3h2v3a3 3 0 0 1-3 3z'),
        repeat1: svg('M7 7h9V4l4 4-4 4V9H7a1 1 0 0 0-1 1v3H4V10a3 3 0 0 1 3-3zm10 10H8v3l-4-4 4-4v3h9a1 1 0 0 0 1-1v-3h2v3a3 3 0 0 1-3 3zM11 13V8.6l-1.4.8V8l1.6-1h1.1v6z'),
        min: svg('M5 11h14v2H5z'),
        expand: svg('M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM4 15h2v3h3v2H4zm14 0h2v5h-5v-2h3z'),
        plus: svg('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'),
        trash: svg('M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z'),
        edit: svg('M4 17.25V20h2.75L18.8 7.94l-2.75-2.75zM20.7 5.63a1 1 0 0 0 0-1.41l-1.92-1.92a1 1 0 0 0-1.41 0l-1.13 1.13 2.75 2.75z'),
        refresh: svg('M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z')
    };
    if (global.BKMusic) return;

    var el = (BK && BK.ui && BK.ui.el) ? BK.ui.el : function (tag, cls, text) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    };
    function basePath() { try { return (BK && BK.util && BK.util.basePath) ? BK.util.basePath() : ''; } catch (e) { return ''; } }
    var BP = basePath();
    function toast(msg, type) {
        try {
            if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast(msg, type || 'info');
        } catch (e) { }
    }
    function uid() {
        return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    function clean(s, max) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 200);
    }

    /* ======================= 1. LIÊN KẾT CHÍNH THỨC ======================= */
    var PROVIDERS = {
        youtube: { name: 'YouTube', host: 'youtube.com' },
        spotify: { name: 'Spotify', host: 'open.spotify.com' },
        soundcloud: { name: 'SoundCloud', host: 'soundcloud.com' }
    };
    function providerName(p) { return (PROVIDERS[p] && PROVIDERS[p].name) || 'Liên kết'; }

    /* Chỉ nhận host chính thức; trả về { provider, key, url, embed }. */
    function parseSource(raw) {
        var input = String(raw == null ? '' : raw).trim();
        if (!input) return { error: 'Hãy dán liên kết bài hát.' };
        if (!/^https?:\/\//i.test(input)) {
            if (/^(www\.)?(youtu\.be|youtube\.com|open\.spotify\.com|soundcloud\.com)\//i.test(input)) {
                input = 'https://' + input;
            } else {
                return { error: 'Liên kết phải bắt đầu bằng https://.' };
            }
        }
        var u;
        try { u = new global.URL(input); } catch (e) { return { error: 'Liên kết không hợp lệ.' }; }
        var host = String(u.hostname || '').replace(/^www\./i, '').toLowerCase();

        /* YouTube */
        if (host === 'youtu.be') {
            var shortId = u.pathname.split('/').filter(Boolean)[0] || '';
            if (!/^[\w-]{6,20}$/.test(shortId)) return { error: 'Không đọc được mã video YouTube.' };
            return youtubeByVideo(shortId);
        }
        if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
            var v = u.searchParams.get('v') || '';
            if (!v) {
                var parts = u.pathname.split('/').filter(Boolean);
                if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') v = parts[1] || '';
            }
            if (v && /^[\w-]{6,20}$/.test(v)) return youtubeByVideo(v);
            var list = u.searchParams.get('list') || '';
            if (list && /^[\w-]{10,60}$/.test(list)) {
                return {
                    provider: 'youtube', key: 'yl:' + list,
                    url: 'https://www.youtube.com/playlist?list=' + list,
                    embed: 'https://www.youtube-nocookie.com/embed/videoseries?list=' + encodeURIComponent(list) +
                        '&enablejsapi=1&rel=0'
                };
            }
            return { error: 'Liên kết YouTube cần có video (v=) hoặc danh sách phát (list=).' };
        }

        /* Spotify */
        if (host === 'open.spotify.com' || host === 'play.spotify.com') {
            var seg = u.pathname.split('/').filter(Boolean);
            /* Bỏ tiền tố locale /intl-xx/ nếu có. */
            if (seg[0] && /^intl-/i.test(seg[0])) seg.shift();
            var type = (seg[0] || '').toLowerCase();
            var id = seg[1] || '';
            var okTypes = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
            if (okTypes.indexOf(type) === -1 || !/^[A-Za-z0-9]{10,40}$/.test(id)) {
                return { error: 'Liên kết Spotify phải là track, album, playlist, episode, show hoặc artist.' };
            }
            return {
                provider: 'spotify', key: 'sp:' + type + ':' + id,
                url: 'https://open.spotify.com/' + type + '/' + id,
                embed: 'https://open.spotify.com/embed/' + type + '/' + id + '?utm_source=generator&theme=0'
            };
        }

        /* SoundCloud — nhận cả trang bài hát lẫn widget player. */
        if (host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'w.soundcloud.com') {
            var sourceUrl = input;
            if (host === 'w.soundcloud.com') {
                sourceUrl = u.searchParams.get('url') || '';
                if (!sourceUrl) return { error: 'Liên kết widget SoundCloud thiếu tham số url.' };
                try {
                    var inner = new global.URL(sourceUrl);
                    if (inner.hostname.replace(/^www\./i, '').toLowerCase() !== 'soundcloud.com') {
                        return { error: 'Widget SoundCloud phải trỏ tới một bài trên soundcloud.com.' };
                    }
                    sourceUrl = 'https://soundcloud.com' + inner.pathname;
                } catch (e) { return { error: 'Liên kết SoundCloud không hợp lệ.' }; }
            } else {
                sourceUrl = 'https://soundcloud.com' + u.pathname;
            }
            if (sourceUrl.replace(/\/+$/, '') === 'https://soundcloud.com') {
                return { error: 'Hãy dán liên kết tới một bài hát cụ thể trên SoundCloud.' };
            }
            return {
                provider: 'soundcloud', key: 'sc:' + sourceUrl,
                url: sourceUrl,
                embed: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(sourceUrl) +
                    '&color=%236366f1&auto_play=false&hide_related=true&show_comments=false&show_user=true'
            };
        }

        return { error: 'Chỉ hỗ trợ liên kết chính thức từ YouTube, Spotify hoặc SoundCloud.' };
    }
    function youtubeByVideo(id) {
        return {
            provider: 'youtube', key: 'y:' + id,
            url: 'https://www.youtube.com/watch?v=' + id,
            embed: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
                '?enablejsapi=1&rel=0&modestbranding=1'
        };
    }

    /* ======================= 2. KHO CỤC BỘ ======================= */
    var KEY = 'bakhiMusic.v3';
    var FAB_KEY = 'bakhiMusic.fab.v1';
    var PANEL_KEY = 'bakhiMusic.panel.v1';
    var MAX_TRACKS = 200;

    function normTrack(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var provider = String(raw.provider || '');
        if (!PROVIDERS[provider]) return null;
        var embed = String(raw.embed || raw.src || '');
        if (!/^https:\/\//i.test(embed)) {
            var parsed = parseSource(raw.sourceUrl || raw.source_url || '');
            if (parsed && !parsed.error) embed = parsed.embed;
        }
        if (!/^https:\/\//i.test(embed)) return null;
        return {
            id: String(raw.id || uid()).slice(0, 60),
            provider: provider,
            sourceUrl: clean(raw.sourceUrl || raw.source_url || '', 1000),
            sourceKey: clean(raw.sourceKey || raw.source_key || '', 200),
            title: clean(raw.title || '', 160) || providerName(provider) + ' · Bài hát',
            artist: clean(raw.artist || '', 120),
            artworkUrl: /^https?:\/\//i.test(String(raw.artworkUrl || raw.artwork_url || ''))
                ? String(raw.artworkUrl || raw.artwork_url).slice(0, 1000) : '',
            lyrics: String(raw.lyrics || '').slice(0, 20000),
            position: Number(raw.position) || 0,
            embed: embed,
            updatedAt: raw.updatedAt || raw.updated_at || 0,
            remoteId: raw.remoteId || null
        };
    }
    function loadLibrary() {
        var raw = null;
        try { raw = JSON.parse(global.localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
        if (!raw || typeof raw !== 'object') raw = {};
        var list = Array.isArray(raw.tracks) ? raw.tracks : [];
        var out = [];
        var seen = {};
        list.slice(0, MAX_TRACKS).forEach(function (item) {
            var t = normTrack(item);
            if (!t || seen[t.id]) return;
            seen[t.id] = true;
            t.position = out.length;
            out.push(t);
        });
        return {
            tracks: out,
            queue: Array.isArray(raw.queue) ? raw.queue.filter(function (i) {
                return typeof i === 'number' && i >= 0 && i < out.length;
            }) : out.map(function (_, i) { return i; }),
            qi: Math.max(0, Number(raw.qi) || 0),
            shuffle: !!raw.shuffle,
            repeat: [0, 1, 2].indexOf(raw.repeat) >= 0 ? raw.repeat : 0,
            playing: false,
            updatedAt: Number(raw.updatedAt) || 0
        };
    }
    var state = loadLibrary();
    if (state.qi >= state.queue.length) state.qi = 0;

    var listeners = [];
    function emit() {
        listeners.slice().forEach(function (fn) {
            try { fn(state); } catch (e) { }
        });
    }
    var saveTimer = null;
    function saveLocal(immediate) {
        clearTimeout(saveTimer);
        function write() {
            try {
                global.localStorage.setItem(KEY, JSON.stringify({
                    v: 3,
                    tracks: state.tracks.map(function (t) {
                        return {
                            id: t.id, provider: t.provider, sourceUrl: t.sourceUrl,
                            sourceKey: t.sourceKey, title: t.title, artist: t.artist,
                            artworkUrl: t.artworkUrl, lyrics: t.lyrics, position: t.position,
                            updatedAt: t.updatedAt
                        };
                    }),
                    queue: state.queue, qi: state.qi, shuffle: state.shuffle,
                    repeat: state.repeat, updatedAt: state.updatedAt
                }));
            } catch (e) { }
        }
        if (immediate) write();
        else saveTimer = setTimeout(write, 180);
        emit();
    }
    function touch() { state.updatedAt = Date.now(); saveLocal(); }

    /* ======================= 3. ĐỒNG BỘ MÁY CHỦ ======================= */
    /* Bảng music_tracks có RLS: chỉ hàng của học sinh đang nhận diện.
       Local-first: lỗi mạng/RLS chỉ hiện trạng thái, không mất dữ liệu. */
    var sync = { status: 'off', message: 'Chưa nhận diện học sinh', at: 0, busy: false };
    function syncAvailable() {
        return !!(global.BKCloud && global.BKCloud.identity && global.BKCloud.identity());
    }
    function syncClient() {
        if (!global.BKCloud || typeof global.BKCloud.chatClient !== 'function') {
            return Promise.reject(new Error('Chưa có lớp Supabase.'));
        }
        return global.BKCloud.chatClient();
    }
    function setSync(status, message) {
        sync.status = status;
        sync.message = message || '';
        sync.at = Date.now();
        paintSyncLine();
    }
    function remoteRow(t, studentId, position) {
        return {
            student_id: studentId,
            provider: t.provider,
            source_url: t.sourceUrl || t.embed,
            source_key: t.sourceKey || t.key || t.id,
            title: t.title,
            artist: t.artist || '',
            artwork_url: t.artworkUrl || '',
            lyrics: t.lyrics || '',
            position: position
        };
    }
    function pullLibrary() {
        if (!syncAvailable()) { setSync('off', 'Chưa nhận diện học sinh — thư viện chỉ lưu trên thiết bị.'); return Promise.resolve(false); }
        var student = global.BKCloud.identity();
        if (!student || !student.id) { setSync('off', 'Chưa nhận diện học sinh.'); return Promise.resolve(false); }
        setSync('busy', 'Đang tải thư viện từ máy chủ…');
        return syncClient().then(function (client) {
            return client.from('music_tracks')
                .select('id, provider, source_url, source_key, title, artist, artwork_url, lyrics, position, updated_at')
                .eq('student_id', student.id)
                .order('position', { ascending: true })
                .limit(MAX_TRACKS);
        }).then(function (res) {
            if (res && res.error) throw res.error;
            var rows = (res && res.data) || [];
            if (!rows.length) {
                /* Lần đầu trên thiết bị mới: đẩy thư viện cục bộ lên. */
                setSync('ok', 'Máy chủ chưa có bài nào — đang đồng bộ thư viện cục bộ.');
                return pushLibrary();
            }
            var localById = {};
            state.tracks.forEach(function (t) { localById[t.id] = t; });
            var localByKey = {};
            state.tracks.forEach(function (t) { localByKey[t.sourceKey] = t; });
            state.tracks = rows.map(function (r) {
                var parsed = parseSource(r.source_url || '');
                var existing = localByKey[r.source_key] || localById[r.id];
                var embed = (parsed && !parsed.error) ? parsed.embed : (existing && existing.embed) || '';
                return normTrack({
                    id: existing ? existing.id : String(r.id || uid()),
                    provider: r.provider,
                    sourceUrl: r.source_url,
                    sourceKey: r.source_key,
                    title: (existing && existing.title) || r.title,
                    artist: (existing && existing.artist) || r.artist,
                    artworkUrl: (existing && existing.artworkUrl) || r.artwork_url,
                    lyrics: (existing && existing.lyrics) || r.lyrics,
                    position: r.position,
                    embed: embed,
                    remoteId: r.id,
                    updatedAt: r.updated_at
                });
            }).filter(Boolean);
            state.queue = state.tracks.map(function (_, i) { return i; });
            if (state.qi >= state.queue.length) state.qi = 0;
            saveLocal(true);
            setSync('ok', 'Đã tải ' + state.tracks.length + ' bài từ máy chủ.');
            render();
            return true;
        }).catch(function (err) {
            setSync('error', 'Chỉ lưu trên thiết bị: ' + ((err && err.message) || 'không kết nối được máy chủ.'));
            return false;
        });
    }
    function pushLibrary() {
        if (!syncAvailable()) return Promise.resolve(false);
        if (sync.busy) return Promise.resolve(false);
        var student = global.BKCloud.identity();
        if (!student || !student.id) return Promise.resolve(false);
        if (state.tracks.length > MAX_TRACKS) state.tracks.length = MAX_TRACKS;
        var rows = state.tracks.map(function (t, i) { return remoteRow(t, student.id, i); });
        if (!rows.length) {
            /* Không xoá hàng trên máy chủ tự động khi thư viện cục bộ rỗng
               (tránh mất dữ liệu khi đăng nhập nhầm thiết bị). */
            setSync('ok', 'Thư viện trống.');
            return Promise.resolve(true);
        }
        sync.busy = true;
        setSync('busy', 'Đang đồng bộ thư viện…');
        return syncClient().then(function (client) {
            return client.from('music_tracks').upsert(rows, {
                onConflict: 'student_id,source_key'
            });
        }).then(function (res) {
            sync.busy = false;
            if (res && res.error) throw res.error;
            setSync('ok', 'Đã đồng bộ ' + rows.length + ' bài cho ' + (student.display_name || 'học sinh') + '.');
            return true;
        }).catch(function (err) {
            sync.busy = false;
            setSync('error', 'Chỉ lưu trên thiết bị: ' + ((err && err.message) || 'không đồng bộ được.'));
            return false;
        });
    }
    var pushTimer = null;
    function schedulePush() {
        clearTimeout(pushTimer);
        if (!syncAvailable()) { setSync('off', 'Chưa nhận diện học sinh — thư viện chỉ lưu trên thiết bị.'); return; }
        setSync('saving', 'Đang lưu thay đổi…');
        pushTimer = setTimeout(function () { pushLibrary(); }, 1200);
    }
    function removeRemote(track) {
        if (!syncAvailable() || !track) return;
        var student = global.BKCloud.identity();
        if (!student || !student.id) return;
        syncClient().then(function (client) {
            return client.from('music_tracks').delete()
                .eq('student_id', student.id)
                .eq('source_key', track.sourceKey);
        }).catch(function () { });
    }

    /* ======================= 4. TRẠNG THÁI PHÁT ======================= */
    var ui = {};
    var layout = {};
    function curTrack() {
        var idx = state.queue[state.qi];
        return state.tracks[idx] || null;
    }
    function initials(t) {
        var text = clean((t && (t.title || t.artist)) || 'BK', 40);
        var words = text.split(' ').filter(Boolean);
        var s = '';
        if (words.length >= 2) s = words[0].charAt(0) + words[1].charAt(0);
        else s = text.slice(0, 2);
        return s.toUpperCase();
    }
    function hueOf(text) {
        var h = 0;
        String(text || 'BK').split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 360; });
        return h;
    }
    function paintArtwork(node, t) {
        if (!node) return;
        node.textContent = '';
        if (t && /^https?:\/\//i.test(t.artworkUrl || '')) {
            var img = D.createElement('img');
            img.src = t.artworkUrl;
            img.alt = '';
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            node.appendChild(img);
            return;
        }
        node.textContent = t ? initials(t) : '♪';
        if (t) {
            var h = hueOf(t.title + t.artist);
            node.style.background = 'linear-gradient(135deg, hsl(' + h + ' 62% 42%), hsl(' +
                ((h + 48) % 360) + ' 66% 32%))';
        } else {
            node.style.background = '';
        }
    }
    function fmtClock(seconds) {
        var s = Math.max(0, Math.floor(Number(seconds) || 0));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    function postEmbed(command) {
        var t = curTrack();
        if (!t || !ui.embed || !ui.embed.contentWindow) return false;
        try {
            if (t.provider === 'youtube') {
                ui.embed.contentWindow.postMessage(JSON.stringify({
                    event: 'command', func: command === 'play' ? 'playVideo' : 'pauseVideo', args: []
                }), '*');
                return true;
            }
            if (t.provider === 'soundcloud') {
                ui.embed.contentWindow.postMessage(JSON.stringify({
                    method: command === 'play' ? 'play' : 'pause'
                }), '*');
                return true;
            }
        } catch (e) { }
        return false;
    }
    function mountEmbed(autoplay) {
        var t = curTrack();
        if (!ui.embedBox) return;
        ui.embedBox.textContent = '';
        ui.embed = null;
        if (!t) {
            ui.embedBox.appendChild(el('div', 'bkmusic-empty', 'Thêm một liên kết để bắt đầu nghe.'));
            return;
        }
        var frame = D.createElement('iframe');
        var src = t.embed;
        if (autoplay) src += (src.indexOf('?') === -1 ? '?' : '&') + (t.provider === 'youtube' ? 'autoplay=1' : 'auto_play=true');
        frame.src = src;
        frame.title = t.title;
        frame.loading = 'lazy';
        frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.className = 'bkmusic-frame';
        ui.embedBox.appendChild(frame);
        ui.embed = frame;
    }
    function playPause() {
        var t = curTrack();
        if (!t) { toast('Thư viện trống — hãy thêm một liên kết.', 'info'); return; }
        var playing = !state.playing;
        state.playing = playing;
        if (!playing) {
            postEmbed('pause');
        } else {
            if (!postEmbed('play')) {
                mountEmbed(true);
                toast(t.provider === 'spotify'
                    ? 'Spotify phát trong khung chính thức bên dưới.'
                    : 'Đang mở trình phát chính thức.', 'info');
            }
        }
        saveLocal(true);
        updateControlState();
    }
    function loadTrack(qi, autoplay) {
        if (qi < 0 || qi >= state.queue.length) return;
        state.qi = qi;
        state.playing = !!autoplay;
        saveLocal(true);
        render();
        if (autoplay) {
            mountEmbed(true);
            updateControlState();
        }
    }
    function shuffledIndex() {
        var n = state.queue.length;
        if (n <= 1) return state.qi;
        var pool = [];
        for (var i = 0; i < n; i++) if (i !== state.qi) pool.push(i);
        return pool[Math.floor(Math.random() * pool.length)];
    }
    function next(userInitiated) {
        if (!state.queue.length) return;
        if (state.shuffle) { loadTrack(shuffledIndex(), true); return; }
        var ni = state.qi + 1;
        if (ni >= state.queue.length) {
            if (state.repeat === 0 && !userInitiated) { state.playing = false; saveLocal(true); updateControlState(); return; }
            ni = 0;
        }
        loadTrack(ni, true);
    }
    function prev() {
        if (!state.queue.length) return;
        if (state.shuffle) { loadTrack(shuffledIndex(), true); return; }
        var pi = state.qi - 1;
        if (pi < 0) pi = state.queue.length - 1;
        loadTrack(pi, true);
    }
    function setRepeat(mode) {
        state.repeat = [0, 1, 2].indexOf(mode) >= 0 ? mode : 0;
        saveLocal(true);
        updateControlState();
    }
    function setShuffle(on) {
        state.shuffle = !!on;
        saveLocal(true);
        updateControlState();
        renderQueue();
    }

    /* ======================= 5. THAO TÁC THƯ VIỆN ======================= */
    function addTrackFromInput(rawUrl, title, artist) {
        if (state.tracks.length >= MAX_TRACKS) {
            toast('Thư viện đã đạt ' + MAX_TRACKS + ' bài.', 'error');
            return null;
        }
        var parsed = parseSource(rawUrl);
        if (!parsed || parsed.error) { toast((parsed && parsed.error) || 'Liên kết không hợp lệ.', 'error'); return null; }
        var duplicate = state.tracks.filter(function (t) { return t.sourceKey === parsed.key; })[0];
        if (duplicate) {
            toast('Bài này đã có trong thư viện.', 'info');
            focusLibraryItem(duplicate.id);
            return duplicate;
        }
        var label = clean(title, 160);
        if (!label) {
            var shortKey = parsed.key.split(':').pop() || '';
            label = providerName(parsed.provider) + ' · ' + shortKey.slice(0, 12);
        }
        var track = normTrack({
            id: uid(),
            provider: parsed.provider,
            sourceUrl: parsed.url,
            sourceKey: parsed.key,
            title: label,
            artist: clean(artist, 120),
            lyrics: '',
            position: state.tracks.length,
            embed: parsed.embed,
            updatedAt: Date.now()
        });
        state.tracks.push(track);
        var idx = state.tracks.length - 1;
        state.queue.push(idx);
        if (state.queue.length === 1) state.qi = 0;
        touch();
        schedulePush();
        render();
        toast('Đã thêm "' + track.title + '".', 'success');
        return track;
    }
    function removeTrack(idx) {
        var t = state.tracks[idx];
        if (!t) return;
        if (!global.confirm('Xoá "' + t.title + '" khỏi thư viện?')) return;
        var wasCurrent = state.queue[state.qi] === idx;
        state.tracks.splice(idx, 1);
        state.tracks.forEach(function (x, i) { x.position = i; });
        state.queue = state.queue.filter(function (i) { return i !== idx; }).map(function (i) {
            return i > idx ? i - 1 : i;
        });
        if (!state.queue.length) state.queue = state.tracks.map(function (_, i) { return i; });
        if (wasCurrent) state.playing = false;
        if (state.qi >= state.queue.length) state.qi = Math.max(0, state.queue.length - 1);
        removeRemote(t);
        touch();
        render();
        toast('Đã xoá khỏi thư viện.', 'success');
    }
    function editTrack(idx) {
        var t = state.tracks[idx];
        if (!t) return;
        var body = el('div', 'bkm-edit');
        var titleInput = el('input', 'bkm-input');
        titleInput.type = 'text';
        titleInput.maxLength = 160;
        titleInput.value = t.title;
        var artistInput = el('input', 'bkm-input');
        artistInput.type = 'text';
        artistInput.maxLength = 120;
        artistInput.value = t.artist || '';
        var lyricsInput = el('textarea', 'bkm-textarea');
        lyricsInput.rows = 7;
        lyricsInput.maxLength = 20000;
        lyricsInput.placeholder = 'Lời bài hát do bạn tự nhập (không bắt buộc).';
        lyricsInput.value = t.lyrics || '';
        body.appendChild(el('label', 'bkm-label', 'Tên bài'));
        body.appendChild(titleInput);
        body.appendChild(el('label', 'bkm-label', 'Nghệ sĩ'));
        body.appendChild(artistInput);
        body.appendChild(el('label', 'bkm-label', 'Lời bài hát'));
        body.appendChild(lyricsInput);
        body.appendChild(el('p', 'bkm-hint', 'Nguồn: ' + providerName(t.provider) + ' · ' + t.sourceUrl));

        var actions = [
            { label: 'Huỷ', variant: 'ghost', onClick: function (close) { close(); } },
            {
                label: 'Lưu', variant: 'primary', onClick: function (close) {
                    var title = clean(titleInput.value, 160);
                    if (!title) { toast('Tên bài không được để trống.', 'error'); return; }
                    t.title = title;
                    t.artist = clean(artistInput.value, 120);
                    t.lyrics = String(lyricsInput.value || '').slice(0, 20000);
                    t.updatedAt = Date.now();
                    touch();
                    schedulePush();
                    render();
                    if (global.BKMusic) { /* giữ tham chiếu ổn định */ }
                    close();
                    toast('Đã cập nhật bài hát.', 'success');
                }
            }
        ];
        if (global.BK && global.BK.ui && global.BK.ui.modal) {
            global.BK.ui.modal({ title: 'Sửa bài hát', body: body, actions: actions });
        }
    }
    function focusLibraryItem(id) {
        if (!ui.library) return;
        var node = ui.library.querySelector('[data-track="' + id + '"]');
        if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    }

    /* ======================= 6. RENDER ======================= */
    function render() {
        if (!ui.panel) return;
        renderAll();
        emit();
    }
    function renderAll() {
        renderNow();
        renderQueue();
        renderLibrary();
        renderLyrics();
    }
    function renderNow() {
        var t = curTrack();
        paintArtwork(ui.art, t);
        ui.title.textContent = t ? t.title : 'Chưa có bài hát';
        ui.artist.textContent = t ? (t.artist || providerName(t.provider)) : 'Thư viện của bạn đang trống';
        updateControlState();
    }
    function updateControlState() {
        if (!ui.play) return;
        ui.play.innerHTML = '<i class="bk-ic">' + (state.playing ? ICONS.pause : ICONS.play) + '</i>';
        ui.play.setAttribute('aria-label', state.playing ? 'Tạm dừng' : 'Phát');
        ui.play.classList.toggle('is-playing', !!state.playing);
        var sh = ui.shuffle;
        if (sh) {
            sh.classList.toggle('on', state.shuffle);
            sh.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');
        }
        var rp = ui.repeat;
        if (rp) {
            rp.classList.toggle('on', state.repeat !== 0);
            rp.innerHTML = '<i class="bk-ic">' + (state.repeat === 2 ? ICONS.repeat1 : ICONS.repeat) + '</i>';
            rp.setAttribute('aria-label', 'Lặp: ' + ['tắt', 'toàn bộ', 'một bài'][state.repeat]);
            rp.title = 'Repeat ' + ['off', 'all', 'one'][state.repeat];
        }
        if (ui.fab) ui.fab.classList.toggle('bkmusic-fab-playing', !!state.playing);
    }
    function trackRow(t, idx, opts) {
        opts = opts || {};
        var item = el('div', 'bkmusic-item' + (opts.active ? ' active' : ''));
        item.setAttribute('data-track', t.id);

        var art = el('div', 'bkmusic-art bkmusic-item-art');
        paintArtwork(art, t);
        item.appendChild(art);

        var info = el('div', 'bkmusic-info');
        var title = el('div', 'bkmusic-title', t.title);
        title.title = t.title;
        info.appendChild(title);
        var who = (t.artist ? t.artist + ' · ' : '') + providerName(t.provider);
        info.appendChild(el('div', 'bkmusic-artist', who));
        item.appendChild(info);

        var acts = el('div', 'bkm-act');
        var playBtn = el('button', 'bkmusic-mini', '');
        playBtn.type = 'button';
        playBtn.title = 'Phát';
        playBtn.setAttribute('aria-label', 'Phát ' + t.title);
        playBtn.innerHTML = '<i class="bk-ic">' + ICONS.play + '</i>';
        playBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var qi = state.queue.indexOf(idx);
            if (qi < 0) { state.queue.push(idx); qi = state.queue.length - 1; }
            loadTrack(qi, true);
        });
        acts.appendChild(playBtn);

        var editBtn = el('button', 'bkmusic-mini', '');
        editBtn.type = 'button';
        editBtn.title = 'Sửa tên, nghệ sĩ, lời';
        editBtn.setAttribute('aria-label', 'Sửa ' + t.title);
        editBtn.innerHTML = '<i class="bk-ic">' + ICONS.edit + '</i>';
        editBtn.addEventListener('click', function (e) { e.stopPropagation(); editTrack(idx); });
        acts.appendChild(editBtn);

        if (opts.queue) {
            var rm = el('button', 'bkmusic-mini rm', '×');
            rm.type = 'button';
            rm.title = 'Bỏ khỏi queue';
            rm.setAttribute('aria-label', 'Bỏ ' + t.title + ' khỏi queue');
            rm.addEventListener('click', function (e) {
                e.stopPropagation();
                removeFromQueue(opts.qi);
            });
            acts.appendChild(rm);
        } else {
            var del = el('button', 'bkmusic-mini rm', '');
            del.type = 'button';
            del.title = 'Xoá khỏi thư viện';
            del.setAttribute('aria-label', 'Xoá ' + t.title);
            del.innerHTML = '<i class="bk-ic">' + ICONS.trash + '</i>';
            del.addEventListener('click', function (e) { e.stopPropagation(); removeTrack(idx); });
            acts.appendChild(del);
        }
        item.appendChild(acts);

        item.addEventListener('click', function () {
            var qi = state.queue.indexOf(idx);
            if (qi < 0) { state.queue.push(idx); qi = state.queue.length - 1; }
            loadTrack(qi, true);
        });
        return item;
    }
    function renderQueue() {
        if (!ui.queue) return;
        ui.queue.textContent = '';
        if (!state.queue.length) {
            ui.queue.appendChild(el('div', 'bkmusic-empty',
                'Queue trống. Mở tab Thư viện để thêm liên kết YouTube, Spotify hoặc SoundCloud.'));
            return;
        }
        state.queue.forEach(function (idx, qi) {
            var t = state.tracks[idx];
            if (!t) return;
            ui.queue.appendChild(trackRow(t, idx, { queue: true, qi: qi, active: qi === state.qi }));
        });
    }
    function renderLibrary() {
        if (!ui.library) return;
        ui.library.textContent = '';
        if (!state.tracks.length) {
            var empty = el('div', 'bkmusic-empty');
            empty.appendChild(el('b', null, 'Thư viện trống'));
            empty.appendChild(el('span', null,
                'Dán liên kết YouTube, Spotify hoặc SoundCloud ở ô phía trên. ' +
                'Bá Khí phát bằng khung nhúng chính thức của nền tảng, không lưu tệp nhạc.'));
            ui.library.appendChild(empty);
            return;
        }
        state.tracks.forEach(function (t, idx) {
            ui.library.appendChild(trackRow(t, idx, { active: state.queue[state.qi] === idx }));
        });
    }
    function renderLyrics() {
        if (!ui.lyrics) return;
        ui.lyrics.textContent = '';
        var t = curTrack();
        if (!t) {
            ui.lyrics.appendChild(el('div', 'bkmusic-empty', 'Chọn một bài để xem lời.'));
            return;
        }
        if (!String(t.lyrics || '').trim()) {
            ui.lyrics.appendChild(el('div', 'bkmusic-empty',
                'Chưa có lời cho bài này. Bấm “Sửa lời” để nhập lời do bạn có quyền sử dụng.'));
            return;
        }
        var lines = String(t.lyrics).split(/\r?\n/);
        lines.forEach(function (line) {
            var m = /^\s*\[(\d{1,2}):(\d{2})\]\s?(.*)$/.exec(line);
            if (m) {
                var row = el('div', 'bkm-lyric-line');
                row.appendChild(el('span', 'bkm-lyric-time',
                    Number(m[1]) + ':' + String(Number(m[2])).padStart(2, '0')));
                row.appendChild(el('span', null, m[3]));
                ui.lyrics.appendChild(row);
            } else if (String(line).trim()) {
                ui.lyrics.appendChild(el('div', 'bkm-lyric-line', line));
            }
        });
    }
    function removeFromQueue(qi) {
        if (qi < 0 || qi >= state.queue.length) return;
        state.queue.splice(qi, 1);
        if (!state.queue.length) { state.playing = false; state.qi = 0; }
        else if (qi < state.qi) state.qi -= 1;
        else if (qi === state.qi) state.qi = Math.min(state.qi, state.queue.length - 1);
        saveLocal(true);
        render();
    }
    function clearQueue() {
        state.queue = [];
        state.qi = 0;
        state.playing = false;
        saveLocal(true);
        render();
        toast('Đã xoá queue. Bấm một bài trong Thư viện để nghe lại.', 'success');
    }
    function paintSyncLine() {
        if (!ui.sync) return;
        ui.sync.textContent = sync.message || '';
        ui.sync.className = 'bkm-sync is-' + sync.status;
        ui.sync.title = sync.at ? new Date(sync.at).toLocaleString('vi-VN') : '';
    }

    /* ======================= 7. UI ======================= */
    function buildUI() {
        if (ui.fab) return;
        if (!D.getElementById('bk-music-css')) {
            var link = D.createElement('link');
            link.id = 'bk-music-css';
            link.rel = 'stylesheet';
            link.href = BP + 'assets/bakhi/bk-music.css';
            (D.head || D.documentElement).appendChild(link);
        }

        var fab = el('button', 'bkmusic-btn');
        fab.type = 'button';
        fab.innerHTML = '<i class="bk-ic">' + ICONS.music + '</i>';
        fab.setAttribute('aria-label', 'Thư viện nhạc');
        fab.title = 'Thư viện nhạc';
        D.body.appendChild(fab);

        var panel = el('div', 'bkmusic-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Bá Khí Music — thư viện nhạc cá nhân');
        panel.innerHTML =
            '<div class="bkmusic-head" title="Kéo để di chuyển · nhấp đúp để đặt lại bố cục">' +
            '  <div class="bkmusic-art" aria-hidden="true">♪</div>' +
            '  <div class="bkmusic-info"><div class="bkmusic-title">—</div><div class="bkmusic-artist">—</div></div>' +
            '  <div class="bkmusic-headbtns">' +
            '    <button class="bkmusic-hbtn bkm-min" type="button" title="Thu nhỏ" aria-label="Thu nhỏ trình phát" aria-pressed="false"><i class="bk-ic">' + ICONS.min + '</i></button>' +
            '    <button class="bkmusic-hbtn bkm-max" type="button" title="Phóng to" aria-label="Phóng to trình phát" aria-pressed="false"><i class="bk-ic">' + ICONS.expand + '</i></button>' +
            '    <button class="bkmusic-hbtn bkmusic-x" type="button" title="Đóng" aria-label="Đóng trình phát"><i class="bk-ic">' + ICONS.close + '</i></button>' +
            '  </div>' +
            '</div>' +
            '<div class="bkmusic-controls">' +
            '  <button class="bkm-shuffle" type="button" title="Shuffle off" aria-label="Shuffle" aria-pressed="false"><i class="bk-ic">' + ICONS.shuffle + '</i></button>' +
            '  <button class="bkm-prev" type="button" aria-label="Bài trước"><i class="bk-ic">' + ICONS.prev + '</i></button>' +
            '  <button class="bkm-play primary" type="button" aria-label="Phát / tạm dừng"><i class="bk-ic">' + ICONS.play + '</i></button>' +
            '  <button class="bkm-next" type="button" aria-label="Bài kế"><i class="bk-ic">' + ICONS.next + '</i></button>' +
            '  <button class="bkm-repeat" type="button" title="Repeat off" aria-label="Repeat"><i class="bk-ic">' + ICONS.repeat + '</i></button>' +
            '</div>' +
            '<div class="bkmusic-embed" aria-label="Khung phát chính thức"></div>' +
            '<div class="bkmusic-tabs" role="tablist">' +
            '  <button data-tab="queue" class="on" type="button" role="tab" aria-selected="true" aria-controls="bkm-pane-queue">Queue</button>' +
            '  <button data-tab="library" type="button" role="tab" aria-selected="false" aria-controls="bkm-pane-library">Thư viện</button>' +
            '  <button data-tab="lyrics" type="button" role="tab" aria-selected="false" aria-controls="bkm-pane-lyrics">Lời bài hát</button>' +
            '</div>' +
            '<div class="bkmusic-body">' +
            '  <div id="bkm-pane-queue" class="bkm-queue bkmusic-list" role="tabpanel"></div>' +
            '  <div id="bkm-pane-library" class="bkm-library bkmusic-list" role="tabpanel" hidden>' +
            '    <div class="bkm-add">' +
            '      <div class="bkm-add-grid">' +
            '        <input class="bkm-url" type="url" inputmode="url" autocomplete="off" ' +
            '               placeholder="Dán liên kết YouTube, Spotify hoặc SoundCloud…" aria-label="Liên kết bài hát">' +
            '        <input class="bkm-new-title" type="text" maxlength="160" autocomplete="off" placeholder="Tên bài (không bắt buộc)" aria-label="Tên bài">' +
            '        <input class="bkm-new-artist" type="text" maxlength="120" autocomplete="off" placeholder="Nghệ sĩ (không bắt buộc)" aria-label="Nghệ sĩ">' +
            '        <button class="bkm-add-go" type="button" title="Thêm vào thư viện">Thêm</button>' +
            '      </div>' +
            '      <p class="bkm-hint">Chỉ nhận liên kết chính thức. Phát bằng khung nhúng của nền tảng; Bá Khí không tải hay lưu tệp nhạc.</p>' +
            '    </div>' +
            '  </div>' +
            '  <div class="bkm-lyrics bkmusic-lyrics" role="tabpanel" id="bkm-pane-lyrics" hidden></div>' +
            '  <div class="bkm-lyrics-edit" hidden>' +
            '    <textarea class="bkm-lyr-input" rows="7" maxlength="20000" ' +
            '      placeholder="Nhập lời bài hát do bạn có quyền sử dụng. Thêm [mm:ss] ở đầu dòng nếu muốn ghi mốc thời gian."></textarea>' +
            '    <div class="bkm-lyr-actions">' +
            '      <button class="bkm-lyr-save" type="button">Lưu lời</button>' +
            '      <button class="bkm-lyr-clear" type="button">Xoá lời</button>' +
            '    </div>' +
            '  </div>' +
            '</div>' +
            '<div class="bkmusic-hint" aria-hidden="true">Space: phát / tạm dừng · ← →: bài trước / kế · Esc: đóng · kéo thanh trên để di chuyển</div>' +
            '<div class="bkmusic-foot">' +
            '  <button class="bkm-lyr-toggle" type="button">Sửa lời</button>' +
            '  <button class="bkm-add-toggle" type="button">Thêm bài</button>' +
            '  <button class="bkm-sync-now" type="button">Đồng bộ</button>' +
            '  <button class="bkm-clear" type="button">Xoá queue</button>' +
            '</div>' +
            '<div class="bkm-sync" role="status" aria-live="polite"></div>' +
            '<div class="bkmusic-resize" aria-hidden="true" title="Kéo để đổi kích thước"></div>';
        D.body.appendChild(panel);
        panel.tabIndex = -1;
        var liveEl = el('div', 'bkmusic-live bkmusic-sr');
        liveEl.setAttribute('aria-live', 'polite');
        liveEl.setAttribute('aria-atomic', 'true');
        panel.appendChild(liveEl);

        function q(sel) { return panel.querySelector(sel); }
        ui.panel = panel;
        ui.fab = fab;
        ui.art = q('.bkmusic-art');
        ui.title = q('.bkmusic-title');
        ui.artist = q('.bkmusic-artist');
        ui.play = q('.bkm-play');
        ui.queue = q('.bkm-queue');
        ui.library = q('.bkm-library');
        ui.lyrics = q('.bkm-lyrics');
        ui.shuffle = q('.bkm-shuffle');
        ui.repeat = q('.bkm-repeat');
        ui.embedBox = q('.bkmusic-embed');
        ui.sync = q('.bkm-sync');

        /* ---------- Bố cục nổi: kéo, đổi kích thước, thu nhỏ, phóng to ---------- */
        var MIN_W = 300, MIN_H = 300;
        var head = q('.bkmusic-head');
        var resizeHandle = q('.bkmusic-resize');
        var geo = loadGeo();

        function loadGeo() {
            var g = null;
            try { g = JSON.parse(global.localStorage.getItem(PANEL_KEY) || 'null'); } catch (e) { g = null; }
            g = (g && typeof g === 'object') ? g : {};
            return {
                x: isFinite(g.x) ? Number(g.x) : null,
                y: isFinite(g.y) ? Number(g.y) : null,
                w: isFinite(g.w) ? Number(g.w) : null,
                h: isFinite(g.h) ? Number(g.h) : null,
                max: !!g.max,
                min: !!g.min
            };
        }
        function saveGeo(patch) {
            Object.keys(patch || {}).forEach(function (k) { geo[k] = patch[k]; });
            try { global.localStorage.setItem(PANEL_KEY, JSON.stringify(geo)); } catch (e) { }
        }
        function vw() { return global.innerWidth || 1024; }
        function vh() { return global.innerHeight || 768; }
        function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
        function boxClamp(x, y, w, h) {
            var W = vw(), H = vh();
            w = clampNum(w, MIN_W, Math.max(MIN_W, W - 16));
            h = clampNum(h, MIN_H, Math.max(MIN_H, H - 16));
            x = clampNum(x, 8, Math.max(8, W - w - 8));
            y = clampNum(y, 8, Math.max(8, H - h - 8));
            return { x: x, y: y, w: w, h: h };
        }
        function applyBox(b) {
            panel.style.setProperty('--bkm-x', b.x + 'px');
            panel.style.setProperty('--bkm-y', b.y + 'px');
            panel.style.setProperty('--bkm-w', b.w + 'px');
            panel.style.setProperty('--bkm-h', b.h + 'px');
            panel.classList.add('bkmusic-sized');
        }
        function syncLayoutBtns() {
            var maxB = q('.bkm-max'), minB = q('.bkm-min');
            if (maxB) {
                maxB.setAttribute('aria-pressed', geo.max ? 'true' : 'false');
                maxB.title = geo.max ? 'Thu về kích thước trước' : 'Phóng to';
            }
            if (minB) {
                minB.setAttribute('aria-pressed', geo.min ? 'true' : 'false');
                minB.title = geo.min ? 'Mở rộng' : 'Thu nhỏ';
            }
        }
        function applyGeo() {
            var mobile = vw() <= 640;
            panel.classList.toggle('bkmusic-mobile', mobile);
            panel.classList.toggle('bkmusic-max', !!geo.max);
            panel.classList.toggle('bkmusic-min', !!geo.min);
            if (mobile) {
                panel.classList.remove('bkmusic-sized');
                return;
            }
            var custom = !geo.max && geo.x != null && geo.y != null && geo.w && geo.h;
            if (geo.max) {
                applyBox(boxClamp(8, 8, vw() - 16, vh() - 16));
            } else if (custom) {
                applyBox(boxClamp(geo.x, geo.y, geo.w, geo.h));
            } else {
                panel.classList.remove('bkmusic-sized');
            }
            syncLayoutBtns();
        }
        function resetLayout() {
            geo.x = geo.y = geo.w = geo.h = null;
            geo.max = geo.min = false;
            saveGeo({});
            panel.classList.remove('bkmusic-sized', 'bkmusic-max', 'bkmusic-min');
            panel.style.cssText = '';
            syncLayoutBtns();
            applyGeo();
        }

        var drag = null;
        function onPanelDragMove(e) {
            if (!drag) return;
            e.preventDefault();
            var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
            var b = boxClamp(drag.x + dx, drag.y + dy, drag.w, drag.h);
            applyBox(b);
        }
        function endPanelDrag() {
            if (!drag) return;
            panel.classList.remove('bkmusic-dragging');
            document.removeEventListener('pointermove', onPanelDragMove);
            document.removeEventListener('pointerup', endPanelDrag);
            if (drag.moved) {
                var r = panel.getBoundingClientRect();
                geo.x = r.left; geo.y = r.top; geo.w = r.width; geo.h = r.height;
                saveGeo({ x: geo.x, y: geo.y, w: geo.w, h: geo.h });
            }
            drag = null;
        }
        head.addEventListener('pointerdown', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            if (vw() <= 640 || geo.max) return;
            var r = panel.getBoundingClientRect();
            drag = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, w: r.width, h: r.height, moved: false };
            panel.classList.add('bkmusic-dragging');
            document.addEventListener('pointermove', onPanelDragMove);
            document.addEventListener('pointerup', endPanelDrag);
        });
        head.addEventListener('dblclick', function (e) {
            if (e.target && e.target.closest && e.target.closest('button')) return;
            resetLayout();
        });

        var rz = null;
        function onPanelResizeMove(e) {
            if (!rz) return;
            e.preventDefault();
            var dx = e.clientX - rz.sx, dy = e.clientY - rz.sy;
            var b = boxClamp(rz.x, rz.y, rz.w + dx, rz.h + dy);
            applyBox(b);
        }
        function endPanelResize() {
            if (!rz) return;
            panel.classList.remove('bkmusic-resizing');
            document.removeEventListener('pointermove', onPanelResizeMove);
            document.removeEventListener('pointerup', endPanelResize);
            var r = panel.getBoundingClientRect();
            geo.x = r.left; geo.y = r.top; geo.w = r.width; geo.h = r.height;
            saveGeo({ x: geo.x, y: geo.y, w: geo.w, h: geo.h });
            rz = null;
        }
        if (resizeHandle) {
            resizeHandle.addEventListener('pointerdown', function (e) {
                if (vw() <= 640 || geo.max) return;
                e.preventDefault();
                var r = panel.getBoundingClientRect();
                rz = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, w: r.width, h: r.height };
                panel.classList.add('bkmusic-resizing');
                document.addEventListener('pointermove', onPanelResizeMove);
                document.addEventListener('pointerup', endPanelResize);
            });
        }

        layout.setMax = function (on) {
            geo.max = typeof on === 'boolean' ? on : !geo.max;
            geo.min = false;
            saveGeo({ max: geo.max, min: false });
            applyGeo();
        };
        layout.setMin = function (on) {
            geo.min = typeof on === 'boolean' ? on : !geo.min;
            saveGeo({ min: geo.min });
            panel.classList.toggle('bkmusic-min', !!geo.min);
            syncLayoutBtns();
        };
        layout.reset = resetLayout;

        function togglePanel(force) {
            var open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
            panel.classList.toggle('open', open);
            fab.classList.toggle('bkmusic-fab-open', open);
            if (open) {
                applyGeo();
                renderAll();
                paintSyncLine();
                try { panel.focus({ preventScroll: true }); } catch (e) { }
            }
        }
        layout.open = function () { togglePanel(true); };
        layout.close = function () { togglePanel(false); };

        /* ---------- FAB kéo thả ---------- */
        function clampFab(x, y) {
            var w = fab.offsetWidth || 48, h = fab.offsetHeight || 48, m = 6;
            var maxX = Math.max(m, vw() - w - m);
            var maxY = Math.max(m, vh() - h - m);
            return { x: clampNum(x, m, maxX), y: clampNum(y, m, maxY) };
        }
        function placeFab(x, y) {
            var p = clampFab(x, y);
            fab.style.left = p.x + 'px';
            fab.style.top = p.y + 'px';
            fab.style.right = 'auto';
            fab.style.bottom = 'auto';
            return p;
        }
        var savedPos = null;
        try { savedPos = JSON.parse(global.localStorage.getItem(FAB_KEY) || 'null'); } catch (e) { savedPos = null; }
        if (savedPos && isFinite(savedPos.x) && isFinite(savedPos.y)) placeFab(savedPos.x, savedPos.y);

        var moved = false, dragging = false, suppressClick = false, sx = 0, sy = 0, ox = 0, oy = 0;
        fab.addEventListener('pointerdown', function (e) {
            if (e.button != null && e.button !== 0) return;
            var r = fab.getBoundingClientRect();
            sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
            dragging = true; moved = false;
            fab.classList.add('bkmusic-fab-drag');
            try { fab.setPointerCapture(e.pointerId); } catch (err) { }
        });
        fab.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
            if (moved) {
                e.preventDefault();
                placeFab(ox + dx, oy + dy);
            }
        });
        function endDrag() {
            if (!dragging) return;
            dragging = false;
            fab.classList.remove('bkmusic-fab-drag');
            suppressClick = moved;
            if (moved) {
                var r = fab.getBoundingClientRect();
                var pos = placeFab(r.left, r.top);
                try { global.localStorage.setItem(FAB_KEY, JSON.stringify(pos)); } catch (e) { }
            }
        }
        fab.addEventListener('pointerup', endDrag);
        fab.addEventListener('pointercancel', endDrag);
        fab.addEventListener('click', function () {
            if (suppressClick) { suppressClick = false; return; }
            togglePanel();
        });

        /* ---------- Nút điều khiển ---------- */
        q('.bkm-play').addEventListener('click', playPause);
        q('.bkm-next').addEventListener('click', function () { next(true); });
        q('.bkm-prev').addEventListener('click', prev);
        q('.bkm-shuffle').addEventListener('click', function () { setShuffle(!state.shuffle); });
        q('.bkm-repeat').addEventListener('click', function () { setRepeat((state.repeat + 1) % 3); });
        q('.bkmusic-x').addEventListener('click', function () { togglePanel(false); });
        q('.bkm-min').addEventListener('click', function () { layout.setMin(); });
        q('.bkm-max').addEventListener('click', function () { layout.setMax(); });

        /* ---------- Tabs ---------- */
        var tabBtns = Array.prototype.slice.call(panel.querySelectorAll('.bkmusic-tabs button'));
        var panes = { queue: ui.queue, library: ui.library, lyrics: ui.lyrics };
        function showTab(id, skipSave) {
            if (!panes[id]) id = 'queue';
            tabBtns.forEach(function (b) {
                var on = b.dataset.tab === id;
                b.classList.toggle('on', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== id; });
            if (id !== 'lyrics') hideLyricsEdit();
            if (id === 'library') setTimeout(function () {
                var inp = panel.querySelector('.bkm-url');
                if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { } }
            }, 40);
            if (!skipSave) {
                try { global.localStorage.setItem(PANEL_KEY, JSON.stringify(Object.assign(geo, { tab: id }))); } catch (e) { }
            }
        }
        layout.showTab = showTab;
        tabBtns.forEach(function (b) {
            b.addEventListener('click', function () { showTab(b.dataset.tab); });
        });

        /* ---------- Thêm bài ---------- */
        var urlInput = q('.bkm-url');
        var newTitle = q('.bkm-new-title');
        var newArtist = q('.bkm-new-artist');
        function doAdd() {
            var track = addTrackFromInput(urlInput.value, newTitle.value, newArtist.value);
            if (track) {
                urlInput.value = '';
                newTitle.value = '';
                newArtist.value = '';
                showTab('library');
            }
        }
        q('.bkm-add-go').addEventListener('click', doAdd);
        [urlInput, newTitle, newArtist].forEach(function (inp) {
            inp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
            });
        });
        q('.bkm-add-toggle').addEventListener('click', function () {
            layout.open();
            showTab('library');
        });

        /* ---------- Lời bài hát ---------- */
        var editBox = q('.bkm-lyrics-edit');
        var lyrInput = q('.bkm-lyr-input');
        function showLyricsEdit(force) {
            var t = curTrack();
            if (!t) { toast('Chọn một bài trước.', 'info'); return; }
            var show = typeof force === 'boolean' ? force : editBox.hidden;
            editBox.hidden = !show;
            if (show) {
                showTab('lyrics');
                lyrInput.value = t.lyrics || '';
                try { lyrInput.focus(); } catch (e) { }
            }
        }
        function hideLyricsEdit() { if (editBox) editBox.hidden = true; }
        q('.bkm-lyr-toggle').addEventListener('click', function () {
            layout.open();
            showLyricsEdit();
        });
        q('.bkm-lyr-save').addEventListener('click', function () {
            var t = curTrack();
            if (!t) return;
            t.lyrics = String(lyrInput.value || '').slice(0, 20000);
            t.updatedAt = Date.now();
            touch();
            schedulePush();
            renderLyrics();
            hideLyricsEdit();
            toast('Đã lưu lời bài hát.', 'success');
        });
        q('.bkm-lyr-clear').addEventListener('click', function () {
            var t = curTrack();
            if (!t) return;
            if (!global.confirm('Xoá lời của bài "' + t.title + '"?')) return;
            t.lyrics = '';
            t.updatedAt = Date.now();
            lyrInput.value = '';
            touch();
            schedulePush();
            renderLyrics();
            hideLyricsEdit();
            toast('Đã xoá lời bài hát.', 'success');
        });

        /* ---------- Foot ---------- */
        q('.bkm-clear').addEventListener('click', clearQueue);
        q('.bkm-sync-now').addEventListener('click', function () {
            setSync('busy', 'Đang đồng bộ…');
            pullLibrary().then(function (ok) {
                if (!ok) pushLibrary();
            });
        });

        /* ---------- Bàn phím ---------- */
        document.addEventListener('keydown', onKey);
        function isEditable(node) {
            if (!node) return false;
            var tag = node.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
        }
        function onKey(e) {
            if (!panel.classList.contains('open')) return;
            if (isEditable(e.target)) return;
            var k = e.key;
            if (k === 'Escape') { e.preventDefault(); togglePanel(false); }
            else if (k === ' ' || k === 'Spacebar') { e.preventDefault(); playPause(); }
            else if (k === 'ArrowRight') { e.preventDefault(); next(true); }
            else if (k === 'ArrowLeft') { e.preventDefault(); prev(); }
        }

        applyGeo();
        var savedTab = null;
        try { savedTab = JSON.parse(global.localStorage.getItem(PANEL_KEY) || 'null'); } catch (e) { savedTab = null; }
        showTab((savedTab && savedTab.tab) || 'queue', true);
        renderAll();
        paintSyncLine();

        if (syncAvailable()) pullLibrary();
        else setSync('off', 'Chưa nhận diện học sinh — thư viện chỉ lưu trên thiết bị.');
    }

    /* ======================= 8. PUBLIC API ======================= */
    global.BKMusic = {
        get tracks() { return state.tracks; },
        get state() { return state; },
        buildUI: buildUI,
        open: function () { if (layout.open) layout.open(); else if (ui.panel) ui.panel.classList.add('open'); },
        close: function () { if (layout.close) layout.close(); },
        isOpen: function () { return !!(ui.panel && ui.panel.classList.contains('open')); },
        maximize: function (on) { if (layout.setMax) layout.setMax(on); },
        minimize: function (on) { if (layout.setMin) layout.setMin(on); },
        resetLayout: function () { if (layout.reset) layout.reset(); },
        showTab: function (id) { if (layout.showTab) layout.showTab(id); },
        on: function (fn) {
            if (typeof fn !== 'function') return function () { };
            listeners.push(fn);
            return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
        },
        playPause: playPause,
        play: function () { if (!state.playing) playPause(); },
        pause: function () { if (state.playing) playPause(); },
        next: function () { next(true); },
        prev: prev,
        loadTrack: loadTrack,
        addToQueue: function (idx) {
            if (typeof idx !== 'number' || idx < 0 || idx >= state.tracks.length) return;
            if (state.queue.indexOf(idx) === -1) state.queue.push(idx);
            saveLocal(true);
            render();
        },
        removeAt: removeFromQueue,
        clearQueue: clearQueue,
        moveInQueue: function (from, to) {
            if (from < 0 || from >= state.queue.length || to < 0 || to >= state.queue.length) return;
            var cur = state.queue[state.qi];
            var moved = state.queue.splice(from, 1)[0];
            state.queue.splice(to, 0, moved);
            state.qi = Math.max(0, state.queue.indexOf(cur));
            saveLocal(true);
            render();
        },
        setShuffle: setShuffle,
        setRepeat: setRepeat,
        setVolume: function () { /* Trình phát nhúng tự quản lý âm lượng. */ },
        reset: function () {
            state.queue = state.tracks.map(function (_, i) { return i; });
            state.qi = 0;
            state.playing = false;
            state.shuffle = false;
            state.repeat = 0;
            saveLocal(true);
            render();
        },
        current: function () { return curTrack(); },
        addSource: function (url, title, artist) { return addTrackFromInput(url, title, artist); },
        parseSource: parseSource,
        refresh: function () { return pullLibrary(); },
        syncStatus: function () { return { status: sync.status, message: sync.message, at: sync.at }; },
        audio: function () { return null; }
    };

    function init() {
        try { buildUI(); } catch (e) { console.warn('[BKMusic]', e); }
    }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})(typeof window !== 'undefined' ? window : this);
