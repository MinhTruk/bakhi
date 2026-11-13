/* =========================================================================
   Bá Khí — bk-music.js : Music Player dùng chung toàn website
   -------------------------------------------------------------------------
   Kiến trúc (một controller duy nhất cho mỗi trang):
     - MUSIC LIBRARY  : mảng TRACKS (10 bài EREN)
     - QUEUE MANAGER  : baseQueue (thứ tự gốc người dùng) + queue (thứ tự phát)
     - CONTROLLER     : 1 HTMLAudioElement duy nhất, shuffle / repeat / volume
     - STATE          : lưu localStorage (bakhiMusic.v1) — khôi phục sau reload
     - UI             : panel nổi + 3 tab (Queue / Thư viện / Lyrics)

   Nguyên tắc:
     - Không autoplay khi mở trang.
     - Không tạo nhiều audio instance (audio nằm trong closure, BKMusic guard).
     - Lỗi file/lyrics không làm hỏng player.
   ========================================================================= */
(function (global) {
    'use strict';
    var D = global.document;
    var BK = global.BK;
    if (!D) return;
    if (global.BKMusic) return;

    var el = (BK && BK.ui && BK.ui.el) ? BK.ui.el : function (tag, cls, text) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    };
    function basePath() { try { return (BK && BK.util && BK.util.basePath) ? BK.util.basePath() : ''; } catch (e) { return ''; } }
    var BP = basePath();

    /* ======================= 1. MUSIC LIBRARY ======================= */
    /* Nguồn: EREN — https://www.youtube.com/channel/UCDjOM0vpsdykW3pWbBIvRDA
       Các file .wav hiện có là âm thanh placeholder tự tạo (không phải bản thu
       gốc) để player chạy được ngay. Thay `src` bằng file có giấy phép. */
    var TRACKS = [
        { id: 'eren-kiss-me', title: 'KISS ME (ft. Bbynascar, VCC Left Hand)', artist: 'EREN', src: BP + 'music/eren-kiss-me.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-ben-anh', title: 'BEN ANH (ft. Lil Liem)', artist: 'EREN', src: BP + 'music/eren-ben-anh.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-see-u', title: 'SEE U (ft. SIXTYUPTOWN)', artist: 'EREN', src: BP + 'music/eren-see-u.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-sai-lam', title: 'SAI LAM (ft. Bbynascar, Taki, Kidsai)', artist: 'EREN', src: BP + 'music/eren-sai-lam.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-quay-ve', title: 'QUAY VE (ft. Bbynascar, Taki)', artist: 'EREN', src: BP + 'music/eren-quay-ve.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-mua-dong', title: 'Mua Dong Em Ve (ft. Bbynascar, Taki)', artist: 'EREN', src: BP + 'music/eren-mua-dong-em-ve.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-lie', title: 'LIE', artist: 'EREN', src: BP + 'music/eren-lie.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-12h', title: '12H (ft. prettyXIX)', artist: 'EREN', src: BP + 'music/eren-12h.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-gioi-han', title: 'GIOI HAN (ft. Bbynascar)', artist: 'EREN', src: BP + 'music/eren-gioi-han.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' },
        { id: 'eren-le-loi', title: 'LE LOI', artist: 'EREN', src: BP + 'music/eren-le-loi.wav', cover: '', lyrics: [], copyright: 'EREN — placeholder audio, thay bằng file được cấp phép.' }
    ];
    var ALL = TRACKS.map(function (_, i) { return i; });

    /* ======================= 2. STATE ======================= */
    var KEY = 'bakhiMusic.v1';
    function defaults() {
        return {
            base: ALL.slice(),            // thứ tự gốc của queue
            queue: ALL.slice(),           // thứ tự phát hiện tại
            qi: 0,
            shuffle: false,
            repeat: 0,                    // 0 off · 1 all · 2 one
            volume: 0.6,
            muted: false,
            playing: false,
            time: 0
        };
    }
    function sanitize(s) {
        var d = defaults();
        if (!s || typeof s !== 'object') return d;
        function validList(a) {
            if (!Array.isArray(a)) return null;
            var out = a.filter(function (i) { return typeof i === 'number' && i >= 0 && i < TRACKS.length; });
            return out.length ? out : null;
        }
        var base = validList(s.base) || d.base;
        var queue = validList(s.queue) || base.slice();
        return {
            base: base,
            queue: queue,
            qi: Math.max(0, Math.min(queue.length - 1, Number(s.qi) || 0)),
            shuffle: !!s.shuffle,
            repeat: [0, 1, 2].indexOf(s.repeat) >= 0 ? s.repeat : 0,
            volume: (typeof s.volume === 'number' && isFinite(s.volume)) ? Math.max(0, Math.min(1, s.volume)) : d.volume,
            muted: !!s.muted,
            playing: false,               // không bao giờ autoplay sau reload
            time: Math.max(0, Number(s.time) || 0)
        };
    }
    function readState() {
        try { return sanitize(JSON.parse(localStorage.getItem(KEY))); }
        catch (e) { return defaults(); }
    }
    function writeState() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
    }

    var state = readState();

    /* ======================= 3. CONTROLLER ======================= */
    var audio = null;
    try { audio = new Audio(); } catch (e) { audio = null; }
    if (audio) {
        audio.preload = 'none';
        audio.volume = state.volume;
        audio.muted = state.muted;
    }

    function curIndex() { return state.queue[state.qi]; }
    function curTrack() { return TRACKS[curIndex()] || TRACKS[0]; }
    function fmt(t) {
        if (!isFinite(t) || t < 0) return '0:00';
        return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    }
    function toast(msg, type) {
        try { if (BK && BK.ui && BK.ui.toast) BK.ui.toast(msg, type || 'info'); }
        catch (e) { }
    }
    function shuffled(list, keepFirst) {
        var arr = list.slice();
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        if (keepFirst != null) {
            var k = arr.indexOf(keepFirst);
            if (k > 0) { arr.splice(k, 1); arr.unshift(keepFirst); }
        }
        return arr;
    }

    var ui = {};          // tham chiếu DOM
    var resumeHintPending = state.time > 1;   // có phiên nghe dở từ trang trước

    function loadTrack(qi, autoplay) {
        if (!audio) return;
        if (!state.queue.length) { state.queue = ALL.slice(); state.base = ALL.slice(); qi = 0; }
        state.qi = Math.max(0, Math.min(state.queue.length - 1, qi));
        var t = curTrack();
        audio.src = t.src;
        state.time = 0;
        state.playing = !!autoplay;
        writeState();
        syncMeta();
        renderQueue();
        renderLyrics();
        renderLibrary();
        if (autoplay) playAudio();
        else updatePlayBtn();
    }

    function playAudio() {
        if (!audio) return;
        var p = audio.play();
        if (p && p.catch) p.catch(function () {
            state.playing = false;
            updatePlayBtn();
            toast('Trình duyệt chặn tự phát — nhấn ▶ để phát', 'info');
        });
    }

    function playPause() {
        if (!audio) return;
        if (!audio.src) { loadTrack(state.qi, true); return; }
        if (audio.paused) { state.playing = true; playAudio(); }
        else { audio.pause(); }
        updatePlayBtn();
        writeState();
    }

    function next(userInitiated) {
        if (!state.queue.length) return;
        if (!userInitiated && state.repeat === 2) {
            try { audio.currentTime = 0; playAudio(); } catch (e) { }
            return;
        }
        var ni = state.qi + 1;
        if (ni >= state.queue.length) {
            if (state.repeat === 1 || userInitiated) ni = 0;
            else { state.playing = false; updatePlayBtn(); writeState(); return; }
        }
        loadTrack(ni, state.playing);
    }
    function prev() {
        if (!state.queue.length) return;
        if (audio && audio.currentTime > 3) { try { audio.currentTime = 0; } catch (e) { } return; }
        var pi = state.qi - 1;
        if (pi < 0) pi = (state.repeat === 1) ? state.queue.length - 1 : 0;
        loadTrack(pi, state.playing);
    }

    function setRepeat(mode) {
        state.repeat = [0, 1, 2].indexOf(mode) >= 0 ? mode : 0;
        writeState();
        var b = ui.repeat;
        if (!b) return;
        b.classList.toggle('on', state.repeat !== 0);
        b.firstElementChild.className = 'fa-solid ' + (state.repeat === 2 ? 'fa-1' : 'fa-repeat');
        b.title = ['Repeat off', 'Repeat all', 'Repeat one'][state.repeat];
        b.setAttribute('aria-label', b.title);
    }

    /* --- Shuffle: giữ nguyên queue gốc, chỉ đổi thứ tự phát --- */
    function setShuffle(on) {
        on = !!on;
        if (on === state.shuffle) return;
        area_shuffle(on);
        writeState();
        renderQueue();
        var b = ui.shuffle;
        if (b) { b.classList.toggle('on', on); b.title = on ? 'Shuffle on' : 'Shuffle off'; }
    }
    function area_shuffle(on) {
        var cur = curIndex();
        state.shuffle = on;
        if (on) {
            state.queue = shuffled(state.base.filter(function (i) { return i !== cur; }), null);
            state.queue.unshift(cur);
            state.qi = 0;
        } else {
            state.queue = state.base.slice();
            var k = state.queue.indexOf(cur);
            state.qi = k < 0 ? 0 : k;
        }
    }

    /* --- Queue operations --- */
    function addToQueue(ti) {
        state.base.push(ti);
        if (state.shuffle) state.queue.push(ti);
        else {
            // queue bình thường bám theo base
            var cur = curIndex();
            state.queue = state.base.slice();
            var k = state.queue.indexOf(cur);
            state.qi = k < 0 ? 0 : k;
        }
        writeState();
        renderQueue(); renderLibrary();
        toast('Đã thêm vào queue', 'success');
    }
    function playNext(ti) {
        state.queue.splice(state.qi + 1, 0, ti);
        var bi = state.base.indexOf(curIndex());
        state.base.splice(bi + 1, 0, ti);
        writeState();
        renderQueue(); renderLibrary();
        toast('Phát tiếp theo: ' + TRACKS[ti].title, 'success');
    }
    function removeAt(qi) {
        if (state.queue.length <= 1) { toast('Queue cần ít nhất 1 bài', 'info'); return; }
        var removed = state.queue[qi];
        var wasCurrent = qi === state.qi;
        state.queue.splice(qi, 1);
        var bi = state.base.indexOf(removed);
        if (bi >= 0) state.base.splice(bi, 1);
        if (qi < state.qi) state.qi--;
        else if (wasCurrent) {
            if (state.qi >= state.queue.length) state.qi = 0;
            loadTrack(state.qi, state.playing);
            return;
        }
        writeState();
        renderQueue(); renderLibrary();
    }
    function clearQueue() {
        var cur = curIndex();
        state.queue = [cur];
        state.base = [cur];
        state.qi = 0;
        writeState();
        renderQueue(); renderLibrary();
    }
    function moveInQueue(from, to) {
        if (from === to || from < 0 || to < 0) return;
        var cur = curIndex();
        var moved = state.queue.splice(from, 1)[0];
        state.queue.splice(to, 0, moved);
        var k = state.queue.indexOf(cur);
        if (k >= 0) state.qi = k;
        writeState();
        renderQueue();
    }

    function addAll() {
        state.base = ALL.slice();
        if (state.shuffle) {
            var cur = curIndex();
            state.queue = shuffled(ALL.filter(function (i) { return i !== cur; }), null);
            state.queue.unshift(cur);
            state.qi = 0;
        } else {
            var c = curIndex();
            state.queue = ALL.slice();
            var k = state.queue.indexOf(c);
            state.qi = k < 0 ? 0 : k;
        }
        writeState();
        renderQueue(); renderLibrary();
    }

    /* ======================= 4. RENDER ======================= */
    function syncMeta() {
        var t = curTrack();
        if (!ui.title) return;
        ui.title.textContent = t.title;
        ui.artist.textContent = t.artist;
        if (ui.art) {
            ui.art.textContent = '♪';
            if (t.cover) {
                var img = D.createElement('img');
                img.src = t.cover; img.alt = ''; img.loading = 'lazy';
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
                ui.art.textContent = '';
                ui.art.appendChild(img);
            }
        }
        if (ui.dur) ui.dur.textContent = '0:00';
        if (ui.seek) ui.seek.value = 0;
        if (ui.cur) ui.cur.textContent = '0:00';
        if (ui.panel) ui.panel.title = t.title + ' · ' + t.artist;
    }

    function updatePlayBtn() {
        var playing = !!(audio && !audio.paused);
        if (ui.play) ui.play.firstElementChild.className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play');
        if (ui.panel) ui.panel.classList.toggle('playing', playing);
        if (ui.fab) ui.fab.classList.toggle('bkmusic-fab-playing', playing);
    }

    function renderQueue() {
        if (!ui.queue) return;
        ui.queue.innerHTML = '';
        if (!state.queue.length) { ui.queue.appendChild(el('div', 'bkmusic-empty', 'Queue rỗng')); return; }
        state.queue.forEach(function (ti, qi) {
            var t = TRACKS[ti];
            var item = el('div', 'bkmusic-item' + (qi === state.qi ? ' active' : ''));
            item.draggable = true;
            item.dataset.qi = String(qi);
            item.appendChild(el('span', 'drag', '⋮⋮'));
            var info = el('div', 'bkmusic-info');
            info.appendChild(el('div', 'bkmusic-title', t.title));
            info.appendChild(el('div', 'bkmusic-artist', t.artist));
            item.appendChild(info);
            if (qi === state.qi) item.appendChild(el('span', 'bkmusic-now', '♪'));
            var rm = el('button', 'rm', '×');
            rm.type = 'button';
            rm.title = 'Xoá khỏi queue';
            rm.addEventListener('click', function (e) { e.stopPropagation(); removeAt(qi); });
            item.appendChild(rm);
            item.addEventListener('click', function () { loadTrack(qi, true); });
            item.addEventListener('dragstart', function (e) {
                item.classList.add('dragging');
                if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(qi)); } catch (err) { } }
                dragFrom = qi;
            });
            item.addEventListener('dragend', function () { item.classList.remove('dragging'); dragFrom = -1; });
            item.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; });
            item.addEventListener('drop', function (e) {
                e.preventDefault();
                var from = dragFrom;
                if (from < 0) { try { from = Number(e.dataTransfer.getData('text/plain')); } catch (err) { from = -1; } }
                if (from >= 0) moveInQueue(from, qi);
                dragFrom = -1;
            });
            ui.queue.appendChild(item);
        });
    }
    var dragFrom = -1;

    function renderLibrary() {
        if (!ui.library) return;
        ui.library.innerHTML = '';
        TRACKS.forEach(function (t, i) {
            var item = el('div', 'bkmusic-item');
            var info = el('div', 'bkmusic-info');
            info.appendChild(el('div', 'bkmusic-title', t.title));
            info.appendChild(el('div', 'bkmusic-artist', t.artist + ' · ' + t.src.split('/').pop()));
            item.appendChild(info);
            var play = el('button', 'bkmusic-mini', '▶');
            play.type = 'button';
            play.title = 'Phát ngay';
            play.addEventListener('click', function (e) {
                e.stopPropagation();
                var qi = state.queue.indexOf(i);
                if (qi < 0) { addToQueue(i); qi = state.queue.indexOf(i); }
                loadTrack(qi, true);
            });
            var add = el('button', 'bkmusic-mini', '+');
            add.type = 'button';
            add.title = 'Thêm vào cuối queue';
            add.addEventListener('click', function (e) { e.stopPropagation(); addToQueue(i); });
            var nx = el('button', 'bkmusic-mini', '⇥');
            nx.type = 'button';
            nx.title = 'Phát ngay sau bài hiện tại';
            nx.addEventListener('click', function (e) { e.stopPropagation(); playNext(i); });
            item.appendChild(play); item.appendChild(add); item.appendChild(nx);
            ui.library.appendChild(item);
        });
    }

    /* Lyrics người dùng tự bổ sung (nội dung hợp pháp của chính họ), lưu cục bộ. */
    var LYRICS_KEY = 'bakhiMusic.lyrics.v1';
    function userLyrics(id) {
        try {
            var all = JSON.parse(localStorage.getItem(LYRICS_KEY) || '{}');
            var v = all && all[id];
            return typeof v === 'string' && v.trim() ? v : '';
        } catch (e) { return ''; }
    }
    function saveUserLyrics(id, text) {
        try {
            var all = JSON.parse(localStorage.getItem(LYRICS_KEY) || '{}') || {};
            if (text && text.trim()) all[id] = text;
            else delete all[id];
            localStorage.setItem(LYRICS_KEY, JSON.stringify(all));
            return true;
        } catch (e) { return false; }
    }
    /** Chuyển text thành mảng dòng; hỗ trợ timestamp [mm:ss] ở đầu dòng. */
    function parseLyrics(text) {
        if (!text) return [];
        return String(text).split(/\r?\n/).map(function (line) {
            var m = /^\s*\[(\d{1,2}):(\d{2})\]\s?(.*)$/.exec(line);
            if (m) return { time: Number(m[1]) * 60 + Number(m[2]), text: m[3] };
            return line;
        });
    }
    function lyricsOf(t) {
        var own = userLyrics(t.id);
        return own ? parseLyrics(own) : (t.lyrics || []);
    }

    function renderLyrics() {
        if (!ui.lyrics) return;
        var t = curTrack();
        var lines = lyricsOf(t);
        ui.lyrics.innerHTML = '';
        if (!lines.length) {
            ui.lyrics.appendChild(el('div', 'bkmusic-empty', 'Bài này chưa có lời. Có thể bổ sung lyrics hợp pháp trong mảng TRACKS (bk-music.js).'));
            return;
        }
        lines.forEach(function (line) {
            var text = typeof line === 'string' ? line : (line.text || '');
            var div = el('div', null, text);
            if (line && typeof line === 'object' && line.time != null) div.dataset.time = String(line.time);
            ui.lyrics.appendChild(div);
        });
        syncLyrics();
    }

    function syncLyrics() {
        if (!ui.lyrics || !audio) return;
        var lines = ui.lyrics.children;
        var cur = audio.currentTime;
        for (var i = 0; i < lines.length; i++) {
            var tm = lines[i].dataset ? lines[i].dataset.time : null;
            if (tm == null) continue;
            var nextTm = (i + 1 < lines.length && lines[i + 1].dataset.time != null) ? Number(lines[i + 1].dataset.time) : Infinity;
            lines[i].classList.toggle('cur', Number(tm) <= cur && cur < nextTm);
        }
    }

    /* ======================= 5. UI ======================= */
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
        fab.innerHTML = '<i class="fa-solid fa-music"></i>';
        fab.setAttribute('aria-label', 'Music Player');
        fab.title = 'Music Player';
        D.body.appendChild(fab);

        var panel = el('div', 'bkmusic-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Bá Khí Music Player');
        panel.innerHTML =
            '<div class="bkmusic-head">' +
            '  <div class="bkmusic-art">♪</div>' +
            '  <div class="bkmusic-info"><div class="bkmusic-title">—</div><div class="bkmusic-artist">—</div></div>' +
            '  <button class="bkmusic-x" type="button" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="bkmusic-controls">' +
            '  <button class="bkm-shuffle" type="button" title="Shuffle off" aria-label="Shuffle"><i class="fa-solid fa-shuffle"></i></button>' +
            '  <button class="bkm-prev" type="button" aria-label="Bài trước"><i class="fa-solid fa-backward-step"></i></button>' +
            '  <button class="bkm-play primary" type="button" aria-label="Phát / tạm dừng"><i class="fa-solid fa-play"></i></button>' +
            '  <button class="bkm-next" type="button" aria-label="Bài kế"><i class="fa-solid fa-forward-step"></i></button>' +
            '  <button class="bkm-repeat" type="button" title="Repeat off" aria-label="Repeat"><i class="fa-solid fa-repeat"></i></button>' +
            '</div>' +
            '<div class="bkmusic-progress">' +
            '  <input class="bkm-seek" type="range" min="0" max="1000" value="0" aria-label="Tiến trình bài hát">' +
            '  <div class="bkmusic-times"><span class="bkm-cur">0:00</span><span class="bkm-dur">0:00</span></div>' +
            '</div>' +
            '<div class="bkmusic-volume">' +
            '  <button class="bkm-mute" type="button" aria-label="Tắt / bật tiếng"><i class="fa-solid fa-volume-high"></i></button>' +
            '  <input class="bkm-vol" type="range" min="0" max="100" value="60" aria-label="Âm lượng">' +
            '</div>' +
            '<div class="bkmusic-tabs" role="tablist">' +
            '  <button data-tab="queue" class="on" type="button" role="tab">Queue</button>' +
            '  <button data-tab="library" type="button" role="tab">Thư viện</button>' +
            '  <button data-tab="lyrics" type="button" role="tab">Lyrics</button>' +
            '</div>' +
            '<div class="bkmusic-body">' +
            '  <div class="bkm-queue bkmusic-list"></div>' +
            '  <div class="bkm-library bkmusic-list" hidden></div>' +
            '  <div class="bkm-lyrics bkmusic-lyrics" hidden></div>' +
            '  <div class="bkm-lyrics-edit" hidden>' +
            '    <textarea class="bkm-lyr-input" rows="6" placeholder="Dán lời do bạn có quyền sử dụng. Mỗi dòng một câu; thêm [mm:ss] ở đầu dòng để đồng bộ theo thời gian."></textarea>' +
            '    <div class="bkm-lyr-actions">' +
            '      <button class="bkm-lyr-save" type="button">Lưu lời</button>' +
            '      <button class="bkm-lyr-clear" type="button">Xoá lời</button>' +
            '    </div>' +
            '  </div>' +
            '</div>' +
            '<div class="bkmusic-foot">' +
            '  <button class="bkm-lyr-toggle" type="button">Sửa lời</button>' +
            '  <button class="bkm-addall" type="button">Nạp đủ 10 bài</button>' +
            '  <button class="bkm-clear" type="button">Xoá queue</button>' +
            '  <button class="bkm-reset" type="button">Reset</button>' +
            '</div>';
        D.body.appendChild(panel);

        function q(sel) { return panel.querySelector(sel); }
        ui.panel = panel;
        ui.fab = fab;
        ui.art = q('.bkmusic-art');
        ui.title = q('.bkmusic-title');
        ui.artist = q('.bkmusic-artist');
        ui.play = q('.bkm-play');
        ui.seek = q('.bkm-seek');
        ui.cur = q('.bkm-cur');
        ui.dur = q('.bkm-dur');
        ui.queue = q('.bkm-queue');
        ui.library = q('.bkm-library');
        ui.lyrics = q('.bkm-lyrics');
        ui.shuffle = q('.bkm-shuffle');
        ui.repeat = q('.bkm-repeat');

        fab.addEventListener('click', function () {
            var open = panel.classList.toggle('open');
            fab.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        q('.bkmusic-x').addEventListener('click', function () { panel.classList.remove('open'); fab.setAttribute('aria-expanded', 'false'); });
        ui.play.addEventListener('click', playPause);
        q('.bkm-prev').addEventListener('click', prev);
        q('.bkm-next').addEventListener('click', function () { next(true); });
        ui.shuffle.addEventListener('click', function () { setShuffle(!state.shuffle); });
        ui.repeat.addEventListener('click', function () { setRepeat((state.repeat + 1) % 3); });
        q('.bkm-mute').addEventListener('click', function () {
            state.muted = !state.muted;
            if (audio) audio.muted = state.muted;
            writeState();
            updateMute();
        });
        q('.bkm-vol').addEventListener('input', function () {
            state.volume = Number(this.value) / 100;
            if (audio) { audio.volume = state.volume; if (state.muted && state.volume > 0) { state.muted = false; audio.muted = false; updateMute(); } }
            writeState();
        });
        var seeking = false;
        ui.seek.addEventListener('pointerdown', function () { seeking = true; });
        ui.seek.addEventListener('change', function () { seeking = false; });
        ui.seek.addEventListener('pointerup', function () { seeking = false; });
        ui.seek.addEventListener('input', function () {
            if (!audio || !audio.duration) return;
            try { audio.currentTime = Number(ui.seek.value) / 1000 * audio.duration; } catch (e) { }
            ui.cur.textContent = fmt(audio.currentTime);
        });
        ui.panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') panel.classList.remove('open'); });
        q('.bkm-clear').addEventListener('click', clearQueue);
        q('.bkm-addall').addEventListener('click', addAll);
        q('.bkm-reset').addEventListener('click', reset);

        var editBox = q('.bkm-lyrics-edit');
        var lyrInput = q('.bkm-lyr-input');
        q('.bkm-lyr-toggle').addEventListener('click', function () {
            var show = editBox.hidden;
            editBox.hidden = !show;
            ui.lyrics.hidden = !show ? true : false;
            if (show) {
                lyrInput.value = userLyrics(curTrack().id);
                lyrInput.focus();
            }
        });
        q('.bkm-lyr-save').addEventListener('click', function () {
            if (saveUserLyrics(curTrack().id, lyrInput.value)) {
                renderLyrics();
                toast('Đã lưu lời cho bài này (chỉ trong trình duyệt của bạn)', 'success');
            } else toast('Không lưu được lời (localStorage bị chặn)', 'error');
        });
        q('.bkm-lyr-clear').addEventListener('click', function () {
            saveUserLyrics(curTrack().id, '');
            lyrInput.value = '';
            renderLyrics();
            toast('Đã xoá lời tự thêm', 'info');
        });

        Array.prototype.forEach.call(panel.querySelectorAll('.bkmusic-tabs button'), function (b) {
            b.addEventListener('click', function () {
                Array.prototype.forEach.call(panel.querySelectorAll('.bkmusic-tabs button'), function (x) {
                    var on = x === b;
                    x.classList.toggle('on', on);
                    x.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                var tab = b.dataset.tab;
                ui.queue.hidden = tab !== 'queue';
                ui.library.hidden = tab !== 'library';
                ui.lyrics.hidden = tab !== 'lyrics';
                var eb = panel.querySelector('.bkm-lyrics-edit');
                if (eb) eb.hidden = true;
                if (tab !== 'lyrics') ui.lyrics.hidden = true;
            });
        });

        q('.bkm-vol').value = String(Math.round(state.volume * 100));
        updateMute();
        setRepeat(state.repeat);
        setShuffle(state.shuffle);
        if (ui.shuffle) ui.shuffle.classList.toggle('on', state.shuffle);
        syncMeta();
        renderQueue(); renderLibrary(); renderLyrics();
        updatePlayBtn();

        // Khôi phục bài + vị trí của phiên trước, nhưng KHÔNG autoplay.
        var t = curTrack();
        if (audio && state.queue.length) {
            audio.src = t.src;
            restoreTime = state.time;
        }
        if (resumeHintPending) {
            var resume = el('button', 'bkmusic-resume', '▶ Tiếp tục: ' + t.title);
            resume.type = 'button';
            resume.addEventListener('click', function () {
                resume.remove();
                state.playing = true;
                playAudio();
            });
            panel.appendChild(resume);
        }
    }

    function updateMute() {
        var b = ui.panel && ui.panel.querySelector('.bkm-mute');
        if (!b) return;
        b.firstElementChild.className = 'fa-solid ' + (state.muted ? 'fa-volume-xmark' : 'fa-volume-high');
        b.classList.toggle('on', state.muted);
    }

    var restoreTime = 0;

    function reset() {
        state = defaults();
        if (audio) { try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) { } }
        writeState();
        restoreTime = 0;
        if (ui.panel) {
            ui.panel.classList.remove('playing');
            var r = ui.panel.querySelector('.bkmusic-resume');
            if (r) r.remove();
        }
        if (ui.fab) ui.fab.classList.remove('bkmusic-fab-playing');
        syncMeta(); renderQueue(); renderLibrary(); renderLyrics(); updatePlayBtn();
        setRepeat(0); setShuffle(false);
        if (ui.shuffle) ui.shuffle.classList.remove('on');
        updateMute();
        toast('Đã reset Music Player', 'success');
    }

    /* ======================= 6. AUDIO EVENTS ======================= */
    if (audio) {
        var saveTimer = null;
        audio.addEventListener('timeupdate', function () {
            if (!ui.seek) return;
            if (audio.duration) ui.seek.value = String(audio.currentTime / audio.duration * 1000);
            if (ui.cur) ui.cur.textContent = fmt(audio.currentTime);
            syncLyrics();
            state.time = audio.currentTime;
            if (!saveTimer) saveTimer = setTimeout(function () { saveTimer = null; writeState(); }, 1000);
        });
        audio.addEventListener('loadedmetadata', function () {
            if (ui.dur) ui.dur.textContent = fmt(audio.duration);
            if (restoreTime > 0 && restoreTime < (audio.duration || 0) - 1) {
                try { audio.currentTime = restoreTime; } catch (e) { }
                if (ui.seek) ui.seek.value = String(restoreTime / audio.duration * 1000);
                if (ui.cur) ui.cur.textContent = fmt(restoreTime);
            }
            restoreTime = 0;
            state.time = audio.currentTime || state.time;
        });
        audio.addEventListener('ended', function () { state.time = 0; next(false); });
        audio.addEventListener('play', function () { state.playing = true; updatePlayBtn(); writeState(); });
        audio.addEventListener('pause', function () { state.playing = false; updatePlayBtn(); writeState(); });
        audio.addEventListener('error', function () {
            if (!audio.src) return;
            toast('Không phát được "' + curTrack().title + '" (thiếu hoặc lỗi file)', 'error');
            updatePlayBtn();
        });
        // Tab ẩn: không cần làm gì đặc biệt, audio tiếp tục phát (hành vi trình duyệt).
    }

    global.addEventListener('pagehide', function () {
        if (audio) state.time = audio.currentTime || state.time;
        state.playing = !!(audio && !audio.paused);
        writeState();
    });

    /* ======================= 7. PUBLIC API ======================= */
    global.BKMusic = {
        tracks: TRACKS,
        get state() { return state; },
        buildUI: buildUI,
        open: function () { if (ui.panel) { ui.panel.classList.add('open'); if (ui.fab) ui.fab.setAttribute('aria-expanded', 'true'); } },
        close: function () { if (ui.panel) ui.panel.classList.remove('open'); },
        playPause: playPause,
        play: function () { if (audio && audio.paused) playPause(); },
        pause: function () { if (audio && !audio.paused) audio.pause(); },
        next: function () { next(true); },
        prev: prev,
        loadTrack: loadTrack,
        addToQueue: addToQueue,
        playNext: playNext,
        removeAt: removeAt,
        clearQueue: clearQueue,
        moveInQueue: moveInQueue,
        setShuffle: setShuffle,
        setRepeat: setRepeat,
        setVolume: function (v) {
            state.volume = Math.max(0, Math.min(1, Number(v) || 0));
            if (audio) audio.volume = state.volume;
            writeState();
            if (ui.panel) { var s = ui.panel.querySelector('.bkm-vol'); if (s) s.value = String(Math.round(state.volume * 100)); }
        },
        reset: reset,
        current: function () { return curTrack(); },
        audio: function () { return audio; }
    };

    function init() {
        try {
            buildUI();
            // Đồng bộ tiến trình đã lưu khi metadata sẵn sàng (preload = none → chỉ khi phát).
        } catch (e) { console.warn('[BKMusic]', e); }
    }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})(typeof window !== 'undefined' ? window : this);
