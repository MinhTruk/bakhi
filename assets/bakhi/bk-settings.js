/* =========================================================================
   Bá Khí — bk-settings.js
   Trang Cài đặt: Hồ sơ · Trung tâm học tập · Hiển thị & Trợ năng ·
   Hình nền · Nhà phát triển.
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKSettings && global.BKSettings.__ready) return;

    var TABS = [
        { id: 'profile', label: 'Hồ sơ', icon: 'fa-id-card' },
        { id: 'learning', label: 'Trung tâm học tập', icon: 'fa-graduation-cap' },
        { id: 'display', label: 'Hiển thị & Trợ năng', icon: 'fa-circle-half-stroke' },
        { id: 'wallpaper', label: 'Hình nền', icon: 'fa-image' },
        { id: 'dev', label: 'Nhà phát triển', icon: 'fa-code' }
    ];

    var S = { tab: 'profile', mounted: {}, nav: null, panels: {} };

    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function icon(name) {
        var i = D.createElement('i');
        i.className = 'fa-solid ' + name;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function toast(msg, type) {
        if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast(msg, type);
        else if (type === 'error') { try { global.console.warn(msg); } catch (e) { } }
    }
    function base() { return (global.BKShell && global.BKShell.basePath) ? global.BKShell.basePath() : './'; }

    /* ---------------------------------------------------------------------
       Tab
       ------------------------------------------------------------------ */
    function buildNav() {
        var nav = el('nav', 'bk-set-nav');
        nav.setAttribute('role', 'tablist');
        nav.setAttribute('aria-label', 'Mục cài đặt');
        TABS.forEach(function (t) {
            var b = el('button', 'bk-set-tab');
            b.type = 'button';
            b.id = 'bkSetTab-' + t.id;
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-controls', 'bkSetPanel-' + t.id);
            b.setAttribute('aria-selected', 'false');
            b.appendChild(icon(t.icon));
            b.appendChild(el('span', null, t.label));
            b.addEventListener('click', function () { switchTab(t.id, true); });
            b.addEventListener('keydown', function (e) {
                var ids = TABS.map(function (x) { return x.id; });
                var i = ids.indexOf(t.id), n = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % ids.length;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + ids.length) % ids.length;
                else if (e.key === 'Home') n = 0;
                else if (e.key === 'End') n = ids.length - 1;
                if (n == null) return;
                e.preventDefault();
                switchTab(ids[n], true);
                var next = D.getElementById('bkSetTab-' + ids[n]);
                if (next) next.focus();
            });
            nav.appendChild(b);
        });
        S.nav = nav;
        return nav;
    }

    function panelFor(id) {
        if (S.panels[id]) return S.panels[id];
        var p = el('section', 'bk-set-panel');
        p.id = 'bkSetPanel-' + id;
        p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', 'bkSetTab-' + id);
        p.hidden = true;
        S.panels[id] = p;
        return p;
    }

    function switchTab(id, push) {
        if (!S.panels[id] && !TABS.some(function (t) { return t.id === id; })) id = 'profile';
        S.tab = id;
        TABS.forEach(function (t) {
            var btn = D.getElementById('bkSetTab-' + t.id);
            var panel = S.panels[t.id];
            var on = t.id === id;
            if (btn) {
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
                btn.tabIndex = on ? 0 : -1;
            }
            if (panel) panel.hidden = !on;
        });
        mountPanel(id);
        if (push) {
            try {
                var url = global.location.pathname + '?tab=' + encodeURIComponent(id);
                global.history.replaceState({ tab: id }, '', url);
            } catch (e) { }
        }
    }

    function mountPanel(id) {
        if (S.mounted[id]) {
            if (id === 'profile' && global.BKProfileUI) {
                /* làm mới dữ liệu khi quay lại tab */
                var host = S.panels[id];
                if (host && host.__refresh) host.__refresh();
            }
            return;
        }
        S.mounted[id] = true;
        var panel = S.panels[id];
        if (id === 'profile') buildProfile(panel);
        else if (id === 'learning') buildLearning(panel);
        else if (id === 'display') buildDisplay(panel);
        else if (id === 'wallpaper') buildWallpaper(panel);
        else if (id === 'dev') buildDev(panel);
    }

    /* ---------------------------------------------------------------------
       1. Hồ sơ
       ------------------------------------------------------------------ */
    function buildProfile(panel) {
        var ui = global.BKProfileUI;
        panel.textContent = '';
        if (!ui) {
            panel.appendChild(el('p', null, 'Không tải được thành phần hồ sơ.'));
            return;
        }
        var lead = el('p', 'bk-set-lead', 'Thông tin này hiển thị trên header, trang hồ sơ và trong chat. Dữ liệu lưu trên thiết bị này.');
        panel.appendChild(lead);

        var hero = el('div');
        panel.appendChild(hero);
        ui.renderHero(hero, { actions: false });

        var openFull = el('a', 'bk-btn');
        openFull.href = base() + 'profile/';
        openFull.style.margin = '.9rem 0 .2rem';
        openFull.appendChild(icon('fa-arrow-up-right-from-square'));
        openFull.appendChild(el('span', null, 'Mở trang hồ sơ đầy đủ'));
        panel.appendChild(openFull);

        var editor = el('div');
        editor.style.marginTop = '1.1rem';
        panel.appendChild(editor);
        ui.renderEditor(editor);

        panel.__refresh = function () {
            ui.renderHero(hero, { actions: false });
            ui.renderEditor(editor);
        };
    }

    /* ---------------------------------------------------------------------
       2. Trung tâm học tập
       ------------------------------------------------------------------ */
    function buildLearning(panel) {
        panel.textContent = '';
        if (!global.BKLearn || typeof global.BKLearn.mountHub !== 'function') {
            panel.appendChild(el('p', 'bk-set-lead', 'Trung tâm học tập cần tệp bk-learn.js trên trang này.'));
            return;
        }
        var lead = el('p', 'bk-set-lead', 'Toàn bộ tab của Trung tâm học tập nằm ở đây — cùng dữ liệu với trang bài học, không có hệ thống thứ hai.');
        panel.appendChild(lead);
        var host = el('div');
        host.id = 'bkHubInline';
        panel.appendChild(host);
        try {
            global.BKLearn.mountHub(host, 'overview');
        } catch (e) {
            host.appendChild(el('p', null, 'Không mở được Trung tâm học tập: ' + (e && e.message ? e.message : 'lỗi không rõ')));
        }
    }

    /* ---------------------------------------------------------------------
       3. Hiển thị & Trợ năng
       ------------------------------------------------------------------ */
    function switchControl(checked, onChange, label) {
        var b = el('button', 'bk-switch');
        b.type = 'button';
        b.setAttribute('role', 'switch');
        b.setAttribute('aria-checked', checked ? 'true' : 'false');
        if (label) b.setAttribute('aria-label', label);
        b.addEventListener('click', function () {
            var next = b.getAttribute('aria-checked') !== 'true';
            b.setAttribute('aria-checked', next ? 'true' : 'false');
            onChange(next);
        });
        return b;
    }
    function settingRow(title, hint, control) {
        var row = el('div', 'bk-set-row');
        var text = el('div', 'bk-set-row-text');
        text.appendChild(el('b', null, title));
        if (hint) text.appendChild(el('small', null, hint));
        row.appendChild(text);
        row.appendChild(control);
        return row;
    }

    function buildDisplay(panel) {
        panel.textContent = '';
        panel.appendChild(el('h2', null, 'Giao diện'));
        panel.appendChild(el('p', 'bk-set-lead', 'Lựa chọn được lưu cho toàn website trên thiết bị này.'));

        var seg = el('div', 'bk-seg');
        var darkBtn = el('button', null, 'Tối');
        darkBtn.type = 'button';
        var lightBtn = el('button', null, 'Sáng');
        lightBtn.type = 'button';
        function paintSeg() {
            var dark = (global.BKShell ? global.BKShell.currentTheme() : 'dark') === 'dark';
            darkBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
            lightBtn.setAttribute('aria-pressed', dark ? 'false' : 'true');
        }
        darkBtn.addEventListener('click', function () {
            if (global.BKShell) global.BKShell.applyTheme('dark');
            paintSeg();
        });
        lightBtn.addEventListener('click', function () {
            if (global.BKShell) global.BKShell.applyTheme('light');
            paintSeg();
        });
        seg.appendChild(darkBtn);
        seg.appendChild(lightBtn);
        panel.appendChild(settingRow('Chế độ giao diện', 'Sáng hoặc tối, áp dụng ngay.', seg));
        paintSeg();

        panel.appendChild(el('h2', null, 'Trợ năng'));
        panel.appendChild(el('p', 'bk-set-lead', 'Điều chỉnh để đọc dễ hơn. Không ảnh hưởng nội dung học tập.'));

        var a = (global.BKShell ? global.BKShell.a11y() : { fontScale: 100 });

        var rangeRow = el('div', 'bk-range-row');
        var range = el('input');
        range.type = 'range';
        range.min = '90';
        range.max = '130';
        range.step = '5';
        range.value = String(a.fontScale);
        range.setAttribute('aria-label', 'Cỡ chữ toàn website');
        var out = el('output', null, a.fontScale + '%');
        range.addEventListener('input', function () {
            out.textContent = range.value + '%';
            if (global.BKShell) global.BKShell.setA11y({ fontScale: Number(range.value) });
        });
        rangeRow.appendChild(range);
        rangeRow.appendChild(out);
        panel.appendChild(settingRow('Cỡ chữ', 'Phóng to chữ trên toàn website (90%–130%).', rangeRow));

        panel.appendChild(settingRow('Tương phản cao', 'Tăng độ tương phản chữ và đường viền.', switchControl(a.contrast, function (v) {
            global.BKShell && global.BKShell.setA11y({ contrast: v });
        }, 'Tương phản cao')));

        panel.appendChild(settingRow('Giảm chuyển động', 'Tắt animation và hiệu ứng chuyển cảnh.', switchControl(a.reduceMotion, function (v) {
            global.BKShell && global.BKShell.setA11y({ reduceMotion: v });
        }, 'Giảm chuyển động')));

        panel.appendChild(settingRow('Viền focus rõ', 'Hiện viền đậm khi dùng bàn phím.', switchControl(a.strongFocus, function (v) {
            global.BKShell && global.BKShell.setA11y({ strongFocus: v });
        }, 'Viền focus rõ')));

        panel.appendChild(settingRow('Gạch chân liên kết', 'Dễ nhận ra liên kết trong trang.', switchControl(a.underlineLinks, function (v) {
            global.BKShell && global.BKShell.setA11y({ underlineLinks: v });
        }, 'Gạch chân liên kết')));
    }

    /* ---------------------------------------------------------------------
       4. Hình nền (cùng kho IndexedDB với trang chủ)
       ------------------------------------------------------------------ */
    function idb(mode, key, val) {
        return new Promise(function (resolve, reject) {
            if (!global.indexedDB) return reject(new Error('Trình duyệt không hỗ trợ IndexedDB.'));
            var q = global.indexedDB.open('bakhi', 1);
            q.onupgradeneeded = function () { q.result.createObjectStore('kv'); };
            q.onerror = function () { reject(q.error); };
            q.onsuccess = function () {
                var db = q.result;
                var tx = db.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite');
                var store = tx.objectStore('kv');
                var req = mode === 'get' ? store.get(key) : mode === 'set' ? store.put(val, key) : store.delete(key);
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function () { reject(req.error); };
            };
        });
    }

    var PRESETS = [
        { name: 'Đêm sao', a: '#1e1b4b', b: '#0e7490' },
        { name: 'Hồng đào', a: '#7c2d12', b: '#be185d' },
        { name: 'Rừng xanh', a: '#064e3b', b: '#3f6212' },
        { name: 'Hoàng hôn', a: '#7c2d12', b: '#a16207' }
    ];

    function gradientBlob(a, b) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>' +
            '</linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/></svg>';
        return new Blob([svg], { type: 'image/svg+xml' });
    }

    function buildWallpaper(panel) {
        panel.textContent = '';
        panel.appendChild(el('h2', null, 'Hình nền'));
        panel.appendChild(el('p', 'bk-set-lead', 'Hình nền được lưu trong IndexedDB của trình duyệt và áp dụng cho trang chủ. Ảnh không nằm trong bản xuất JSON.'));

        var preview = el('div', 'bk-wall-preview');
        var overlay = el('div', 'bk-wall-overlay');
        var label = el('span', null, 'Xem trước');
        preview.appendChild(overlay);
        preview.appendChild(label);
        panel.appendChild(preview);

        var url = null;
        function opacity() {
            var v = Number(global.localStorage.getItem('bgOpacity'));
            return isFinite(v) && v > 0 ? v : 0.88;
        }
        function paintPreview(blob) {
            if (url) { try { URL.revokeObjectURL(url); } catch (e) { } url = null; }
            if (blob) {
                url = URL.createObjectURL(blob);
                preview.style.backgroundImage = 'url("' + url + '")';
                label.textContent = 'Hình nền của bạn';
            } else {
                preview.style.backgroundImage = '';
            }
            overlay.style.background = 'rgba(15, 23, 42, ' + opacity() + ')';
        }

        /* Ảnh có sẵn */
        panel.appendChild(el('b', null, 'Chọn hình nền có sẵn'));
        var grid = el('div', 'bk-preset-grid');
        PRESETS.forEach(function (p) {
            var b = el('button', 'bk-preset');
            b.type = 'button';
            b.title = p.name;
            b.setAttribute('aria-label', 'Dùng hình nền ' + p.name);
            b.style.background = 'linear-gradient(135deg,' + p.a + ',' + p.b + ')';
            b.addEventListener('click', function () {
                var blob = gradientBlob(p.a, p.b);
                idb('set', 'bg', blob).then(function () {
                    global.localStorage.setItem('bgOpacity', String(opacity()));
                    paintPreview(blob);
                    toast('Đã đặt hình nền "' + p.name + '".', 'success');
                }).catch(function (e) { toast(e.message || 'Không lưu được hình nền.', 'error'); });
            });
            grid.appendChild(b);
        });
        panel.appendChild(grid);

        /* Tải ảnh cá nhân */
        var upload = el('button', 'bk-btn');
        upload.type = 'button';
        upload.appendChild(icon('fa-upload'));
        upload.appendChild(el('span', null, 'Tải ảnh của bạn'));
        var file = el('input');
        file.type = 'file';
        file.accept = 'image/png,image/jpeg,image/webp';
        file.hidden = true;
        file.addEventListener('change', function () {
            var f = file.files && file.files[0];
            file.value = '';
            if (!f) return;
            if (!/^image\/(png|jpeg|webp)$/i.test(f.type)) return toast('Chỉ nhận ảnh PNG, JPEG hoặc WebP.', 'error');
            if (f.size > 8 * 1024 * 1024) return toast('Ảnh quá lớn (tối đa 8 MB).', 'error');
            idb('set', 'bg', f).then(function () {
                paintPreview(f);
                toast('Đã lưu hình nền.', 'success');
            }).catch(function (e) { toast(e.message || 'Không lưu được hình nền.', 'error'); });
        });
        upload.addEventListener('click', function () { file.click(); });
        panel.appendChild(upload);
        panel.appendChild(file);

        /* Độ mờ lớp phủ */
        var rangeRow = el('div', 'bk-range-row');
        var range = el('input');
        range.type = 'range';
        range.min = '0.5';
        range.max = '0.98';
        range.step = '0.02';
        range.value = String(opacity());
        range.setAttribute('aria-label', 'Độ đậm lớp phủ hình nền');
        var out = el('output', null, Math.round(opacity() * 100) + '%');
        range.addEventListener('input', function () {
            var v = Number(range.value);
            out.textContent = Math.round(v * 100) + '%';
            global.localStorage.setItem('bgOpacity', String(v));
            overlay.style.background = 'rgba(15, 23, 42, ' + v + ')';
        });
        rangeRow.appendChild(range);
        rangeRow.appendChild(out);
        panel.appendChild(settingRow('Độ đậm lớp phủ', 'Càng cao càng dễ đọc chữ trên hình nền.', rangeRow));

        /* Khôi phục mặc định */
        var reset = el('button', 'bk-btn bk-btn-ghost');
        reset.type = 'button';
        reset.appendChild(icon('fa-rotate-left'));
        reset.appendChild(el('span', null, 'Khôi phục hình nền mặc định'));
        reset.addEventListener('click', function () {
            idb('del', 'bg').then(function () {
                try {
                    global.localStorage.removeItem('bgOpacity');
                    global.localStorage.removeItem('customBg');
                } catch (e) { }
                paintPreview(null);
                range.value = '0.88';
                out.textContent = '88%';
                toast('Đã khôi phục hình nền mặc định.', 'success');
            }).catch(function (e) { toast(e.message || 'Không xoá được hình nền.', 'error'); });
        });
        panel.appendChild(reset);

        idb('get', 'bg').then(function (blob) { paintPreview(blob || null); }).catch(function () { paintPreview(null); });
    }

    /* ---------------------------------------------------------------------
       5. Nhà phát triển
       ------------------------------------------------------------------ */
    function buildDev(panel) {
        panel.textContent = '';
        panel.appendChild(el('h2', null, 'Administrator Code'));
        panel.appendChild(el('p', 'bk-set-lead', 'Mã được gửi tới máy chủ để xác minh, không lưu trong trình duyệt, không ghi vào URL hay nhật ký. Phiên quản trị có thời hạn và chỉ lưu token.'));
        panel.appendChild(el('small', null, 'Cần quyền Administrator.')).style.cssText = 'display:block;font-size:.72rem;color:var(--bkl-muted);margin-top:-.6rem';

        var box = el('div', 'bk-auth-box');
        var input = el('input', 'bk-input');
        input.type = 'password';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = 'Administrator Code…';
        input.setAttribute('aria-label', 'Administrator Code');
        var submit = el('button', 'bk-btn');
        submit.type = 'button';
        submit.appendChild(icon('fa-shield-halved'));
        submit.appendChild(el('span', null, 'Xác thực'));
        box.appendChild(input);
        box.appendChild(submit);
        panel.appendChild(box);

        var msg = el('p', 'bk-auth-msg');
        panel.appendChild(msg);

        function say(text, kind) {
            msg.textContent = text;
            msg.className = 'bk-auth-msg' + (kind ? ' ' + kind : '');
        }

        function submitCode() {
            var code = input.value.trim();
            input.value = '';
            if (!code) return say('Nhập Administrator Code.', 'err');
            if (!global.BKCloud || !global.BKCloud.configured || !global.BKCloud.configured()) {
                return say('Supabase chưa được cấu hình trên trang này.', 'err');
            }
            submit.disabled = true;
            say('Đang xác thực…');
            global.BKCloud.adminLogin(code).then(function () {
                say('Xác thực thành công. Đang mở Administrator Dashboard…', 'ok');
                global.location.href = base() + 'admin/';
            }).catch(function (err) {
                var m = (err && err.message) || '';
                if (/429|rate|nhiều/i.test(m)) say('Quá nhiều lần thử. Vui lòng đợi vài phút.', 'err');
                else if (/INVALID|sai|không đúng|401/i.test(m)) say('Administrator Code không đúng.', 'err');
                else say('Không xác thực được: ' + (m || 'lỗi mạng'), 'err');
            }).then(function () { submit.disabled = false; });
        }
        submit.addEventListener('click', submitCode);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submitCode(); }
        });

        /* Dev Playground: trạng thái thực tế, không có nút giả. */
        panel.appendChild(el('h2', null, 'Dev Playground')).style.marginTop = '1.4rem';
        var status = el('p', 'bk-set-lead');
        var devRow = (global.BKDev && global.BKDev.authorized) ? (function () {
            try { return global.BKDev.authorized(); } catch (e) { return false; }
        })() : false;
        status.textContent = devRow
            ? 'Thiết bị này đang có quyền Developer. Biểu tượng Developer Playground nằm ở góc dưới bên trái, ngay trên Music Player.'
            : 'Developer Playground chỉ mở sau khi Dev Code được xác minh ở máy chủ. Máy chủ chưa cấu hình Dev Code nên khu vực này đang tắt; khi triển khai xong Edge Function, biểu tượng sẽ xuất hiện ở góc dưới bên trái.';
        panel.appendChild(status);

        if (devRow) {
            var out = el('button', 'bk-btn bk-btn-ghost');
            out.type = 'button';
            out.appendChild(icon('fa-right-from-bracket'));
            out.appendChild(el('span', null, 'Thu hồi quyền Developer trên thiết bị này'));
            out.addEventListener('click', function () {
                try {
                    global.localStorage.removeItem('devToken');
                    global.localStorage.removeItem('bakhiDev.v1');
                } catch (e) { }
                toast('Đã thu hồi quyền Developer trên thiết bị này.', 'success');
                global.setTimeout(function () { global.location.reload(); }, 600);
            });
            panel.appendChild(out);
        }
    }

    /* ---------------------------------------------------------------------
       Khởi động
       ------------------------------------------------------------------ */
    function init() {
        var root = D.getElementById('bkSettingsRoot');
        if (!root) return;
        var nav = buildNav();
        var host = D.getElementById('bkSettingsPanels');
        root.insertBefore(nav, host);
        TABS.forEach(function (t) {
            var p = panelFor(t.id);
            host.appendChild(p);
        });
        var initial = 'profile';
        try {
            var q = new URLSearchParams(global.location.search);
            var t = q.get('tab');
            if (t && TABS.some(function (x) { return x.id === t; })) initial = t;
        } catch (e) { }
        switchTab(initial, false);
    }

    global.BKSettings = {
        __ready: true,
        tabs: TABS,
        switchTab: switchTab
    };

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : this);
