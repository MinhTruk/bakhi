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
        { id: 'dev', label: 'Nhà phát triển', icon: 'fa-code' },
        { id: 'founder', label: 'Founder', icon: 'fa-crown' }
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
            /* Trạng thái phiên Dev/Admin/Founder có thể đổi từ nơi khác → dựng lại khi mở tab. */
            if (id === 'dev') buildDev(S.panels[id]);
            if (id === 'founder') buildFounder(S.panels[id]);
            return;
        }
        S.mounted[id] = true;
        var panel = S.panels[id];
        if (id === 'profile') buildProfile(panel);
        else if (id === 'learning') buildLearning(panel);
        else if (id === 'display') buildDisplay(panel);
        else if (id === 'wallpaper') buildWallpaper(panel);
        else if (id === 'dev') buildDev(panel);
        else if (id === 'founder') buildFounder(panel);
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

        var codeSec = el('div');
        panel.appendChild(codeSec);
        buildCodeSection(codeSec);

        panel.__refresh = function () {
            ui.renderHero(hero, { actions: false });
            ui.renderEditor(editor);
            buildCodeSection(codeSec);
        };
    }

    /* ---------------------------------------------------------------------
       1b. Mật mã đăng nhập — thay passkey WebAuthn (7.8.0)

       Mật mã gắn với hồ sơ trên máy chủ (băm PBKDF2), nên đăng nhập được
       trên điện thoại và mọi trình duyệt, không phụ thuộc thiết bị đã tạo
       passkey như trước.
       ------------------------------------------------------------------ */
    function buildCodeSection(host) {
        host.textContent = '';
        host.className = 'bk-login-code';
        host.appendChild(el('h2', null, 'Mật mã đăng nhập'));
        host.appendChild(el('p', 'bk-set-lead',
            'Mật mã riêng (4–32 ký tự) thay cho passkey: lần đăng nhập sau bằng họ tên sẽ hiện thêm ô nhập mật mã. ' +
            'Mật mã lưu dạng băm trên máy chủ nên dùng được trên điện thoại, máy tính và mọi trình duyệt.'));

        var cloud = global.BKCloud;
        var bound = false;
        try { bound = !!(cloud && cloud.state && cloud.state().bound); } catch (e) { bound = false; }

        var status = el('p', 'bk-code-status');
        var form = el('div', 'bk-code-form');
        var msg = el('p', 'bk-auth-msg');
        msg.setAttribute('role', 'status');
        host.appendChild(status);
        host.appendChild(form);
        host.appendChild(msg);

        var hasCode = false;
        var currentInput = null;

        function say(text, kind) {
            msg.textContent = text || '';
            msg.className = 'bk-auth-msg' + (kind ? ' ' + kind : '');
        }

        function field(id, labelText, placeholder, autocomplete) {
            var wrap = el('label', 'bk-code-field');
            wrap.appendChild(el('span', null, labelText));
            var inp = el('input', 'bk-input');
            inp.id = id;
            inp.type = 'password';
            inp.maxLength = 32;
            inp.autocomplete = autocomplete || 'new-password';
            inp.placeholder = placeholder || '';
            wrap.appendChild(inp);
            return { wrap: wrap, input: inp };
        }

        function paintStatus(data) {
            if (!data || data.hasCode === false) {
                status.textContent = 'Chưa đặt mật mã — đăng nhập bằng họ tên như trước.';
                status.className = 'bk-code-status';
                return;
            }
            var when = '';
            try { when = data.updatedAt ? new Date(data.updatedAt).toLocaleDateString('vi-VN') : ''; } catch (e) { }
            status.textContent = 'Đã đặt mật mã' + (when ? ' · cập nhật ' + when : '') + '.';
            status.className = 'bk-code-status is-on';
        }

        function removeCode() {
            var current = currentInput ? currentInput.value : '';
            if (!current) {
                say('Nhập mật mã hiện tại để gỡ mật mã.', 'err');
                try { if (currentInput) currentInput.focus(); } catch (e) { }
                return;
            }
            if (global.confirm && !global.confirm('Gỡ mật mã? Lần đăng nhập sau chỉ cần họ tên.')) return;
            cloud.loginCodeRemove(current).then(function (data) {
                hasCode = false;
                renderFields();
                paintStatus(data);
                say('Đã gỡ mật mã đăng nhập.', 'ok');
                toast('Đã gỡ mật mã.', 'success');
            }).catch(function (err) {
                say((err && err.message) || 'Không gỡ được mật mã.', 'err');
            });
        }

        function renderFields() {
            form.textContent = '';
            currentInput = null;
            if (hasCode) {
                var current = field('bkCodeCurrent', 'Mật mã hiện tại', 'Nhập mật mã đang dùng', 'current-password');
                form.appendChild(current.wrap);
                currentInput = current.input;
            }
            var fresh = field('bkCodeNew', hasCode ? 'Mật mã mới' : 'Mật mã', '4–32 ký tự, không dấu cách');
            var again = field('bkCodeConfirm', 'Nhập lại mật mã', 'Gõ lại để chắc chắn');
            form.appendChild(fresh.wrap);
            form.appendChild(again.wrap);

            var row = el('div', 'bk-row');
            var save = el('button', 'bk-btn');
            save.type = 'button';
            save.appendChild(icon('fa-key'));
            save.appendChild(el('span', null, hasCode ? 'Đổi mật mã' : 'Đặt mật mã'));
            row.appendChild(save);
            if (hasCode) {
                var rm = el('button', 'bk-btn bk-btn-ghost', 'Gỡ mật mã');
                rm.type = 'button';
                rm.addEventListener('click', removeCode);
                row.appendChild(rm);
            }
            form.appendChild(row);

            save.addEventListener('click', function () {
                var value = String(fresh.input.value || '').trim();
                if (value.length < 4) {
                    say('Mật mã cần tối thiểu 4 ký tự.', 'err');
                    try { fresh.input.focus(); } catch (e) { }
                    return;
                }
                if (/\s/.test(value)) {
                    say('Mật mã không được chứa khoảng trắng.', 'err');
                    try { fresh.input.focus(); } catch (e) { }
                    return;
                }
                if (value !== String(again.input.value || '').trim()) {
                    say('Hai lần nhập mật mã chưa khớp nhau.', 'err');
                    try { again.input.focus(); } catch (e) { }
                    return;
                }
                if (hasCode && currentInput && !currentInput.value) {
                    say('Nhập mật mã hiện tại để đổi mật mã.', 'err');
                    try { currentInput.focus(); } catch (e) { }
                    return;
                }
                save.disabled = true;
                say('Đang lưu mật mã…', '');
                cloud.loginCodeSet(value, currentInput ? currentInput.value : '').then(function (data) {
                    hasCode = true;
                    renderFields();
                    paintStatus(data);
                    say('Đã lưu mật mã. Lần đăng nhập sau sẽ hỏi mật mã này — dùng được trên mọi thiết bị.', 'ok');
                    toast('Đã lưu mật mã đăng nhập.', 'success');
                }).catch(function (err) {
                    save.disabled = false;
                    say((err && err.message) || 'Không lưu được mật mã.', 'err');
                });
            });
        }

        if (!bound) {
            status.textContent = 'Hãy nhận diện học sinh trước khi đặt mật mã.';
            status.className = 'bk-code-status';
            var off = el('button', 'bk-btn');
            off.type = 'button';
            off.disabled = true;
            off.appendChild(icon('fa-lock'));
            off.appendChild(el('span', null, 'Đặt mật mã'));
            form.appendChild(off);
            return;
        }

        if (!cloud || typeof cloud.loginCodeStatus !== 'function') {
            status.textContent = 'Máy chủ chưa sẵn sàng. Hãy thử lại sau.';
            return;
        }

        cloud.loginCodeStatus().then(function (data) {
            hasCode = !!(data && data.hasCode);
            paintStatus(data);
            renderFields();
            if (data && data.lockedMinutes) {
                say('Mật mã đang tạm khoá ' + data.lockedMinutes + ' phút do nhập sai nhiều lần.', 'err');
            }
        }).catch(function (err) {
            status.textContent = 'Không đọc được trạng thái mật mã.';
            say((err && err.message) || 'Không đọc được trạng thái mật mã.', 'err');
        });
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
    function devHint(text) {
        var s = el('small', null, text);
        s.style.cssText = 'display:block;font-size:.72rem;line-height:1.55;color:var(--bkl-muted);margin:.15rem 0 .9rem';
        return s;
    }

    function buildDev(panel) {
        panel.textContent = '';
        var cloud = global.BKCloud;
        var configured = !!(cloud && cloud.configured && cloud.configured());
        var session = null;
        try { session = (cloud && cloud.devSession) ? cloud.devSession() : null; } catch (e) { session = null; }

        /* ------------------------- Dev Code ------------------------- */
        panel.appendChild(el('h2', null, 'Dev Code'));
        panel.appendChild(el('p', 'bk-set-lead',
            'Dev Code mở Developer Playground. Mã được gửi tới Edge Function dev-auth để xác minh; trình duyệt chỉ giữ token phiên trong sessionStorage của tab này, không lưu mã.'));
        panel.appendChild(devHint('Mã phía máy chủ: DEV_PLAYGROUND_CODE (Supabase → Edge Functions → Secrets).'));

        if (session) {
            var when = '';
            try {
                when = new Date(session.expiresAt).toLocaleString('vi-VN', {
                    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
                });
            } catch (e) { }
            var okMsg = el('p', 'bk-auth-msg ok',
                'Đã xác thực Dev Code' + (when ? ' — phiên hết hạn lúc ' + when : '') + '.');
            panel.appendChild(okMsg);

            var devRow = el('div', 'bk-auth-box');
            var openBtn = el('button', 'bk-btn');
            openBtn.type = 'button';
            openBtn.appendChild(icon('fa-screwdriver-wrench'));
            openBtn.appendChild(el('span', null, 'Mở Developer Playground'));
            openBtn.addEventListener('click', function () {
                if (global.BKShell && global.BKShell.openDev) global.BKShell.openDev();
                else if (global.BKDev && global.BKDev.open) global.BKDev.open();
                else toast('Không tải được Developer Playground.', 'error');
            });
            var outBtn = el('button', 'bk-btn bk-btn-ghost');
            outBtn.type = 'button';
            outBtn.appendChild(icon('fa-right-from-bracket'));
            outBtn.appendChild(el('span', null, 'Thoát Dev'));
            outBtn.addEventListener('click', function () {
                function done() {
                    try { if (global.BKCloud && global.BKCloud.devLogout) global.BKCloud.devLogout(); } catch (e) { }
                    toast('Đã thoát Developer Playground.', 'success');
                    buildDev(panel);
                }
                if (global.BK && global.BK.ui && global.BK.ui.confirm) {
                    global.BK.ui.confirm({
                        title: 'Thoát Developer Playground',
                        message: 'Phiên Dev trên tab này sẽ kết thúc và biểu tượng công cụ biến mất. Dữ liệu học tập không bị ảnh hưởng.',
                        ok: 'Thoát Dev',
                        danger: true
                    }).then(function (yes) { if (yes) done(); });
                } else done();
            });
            devRow.appendChild(openBtn);
            devRow.appendChild(outBtn);
            panel.appendChild(devRow);
            panel.appendChild(devHint('Biểu tượng Developer nằm ở góc dưới bên trái, ngay trên Music Player. Đóng tab cũng kết thúc phiên.'));
        } else {
            if (!configured) {
                panel.appendChild(el('p', 'bk-auth-msg err',
                    'Supabase chưa được cấu hình trên trang này, nên Dev Code không thể xác minh.'));
            }
            var box = el('div', 'bk-auth-box');
            var input = el('input', 'bk-input');
            input.type = 'password';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.placeholder = 'Dev Code…';
            input.setAttribute('aria-label', 'Dev Code');
            var submit = el('button', 'bk-btn');
            submit.type = 'button';
            submit.appendChild(icon('fa-code'));
            submit.appendChild(el('span', null, 'Xác thực Dev Code'));
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
                if (!code) return say('Nhập Dev Code.', 'err');
                if (!configured) return say('Supabase chưa được cấu hình trên trang này.', 'err');
                submit.disabled = true;
                say('Đang xác thực ở máy chủ…');
                cloud.devLogin(code).then(function () {
                    toast('Xác thực Dev Code thành công.', 'success');
                    buildDev(panel);
                }).catch(function (err) {
                    var codeName = (err && err.code) || '';
                    var m = (err && err.message) || '';
                    if (codeName === 'NO_DEV_PLAYGROUND_CODE' || /NO_DEV_PLAYGROUND_CODE/.test(m)) {
                        say('Máy chủ chưa đặt DEV_PLAYGROUND_CODE nên Dev Playground đang tắt.', 'err');
                    } else if (codeName === 'TOO_MANY_ATTEMPTS' || /429|rate|nhiều/i.test(m)) {
                        say('Quá nhiều lần thử. Vui lòng đợi vài phút.', 'err');
                    } else if (codeName === 'BAD_DEV_CODE' || /sai|không đúng|401/i.test(m)) {
                        say('Dev Code không đúng.', 'err');
                    } else {
                        say('Không xác thực được: ' + (m || 'lỗi mạng'), 'err');
                    }
                }).then(function () { submit.disabled = false; });
            }
            submit.addEventListener('click', submitCode);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); submitCode(); }
            });
        }

        /* ---------------------- Administrator Code ------------------ */
        panel.appendChild(el('h2', null, 'Administrator Code')).style.marginTop = '1.8rem';
        panel.appendChild(el('p', 'bk-set-lead',
            'Administrator Code mở Administrator Dashboard. Mã được gửi tới máy chủ để xác minh và không bao giờ được lưu trong trình duyệt — chỉ token phiên có thời hạn.'));
        panel.appendChild(devHint('Cần quyền Administrator. Phiên Admin không cấp quyền Dev và ngược lại.'));

        var hasAdmin = false;
        try { hasAdmin = !!(cloud && cloud.adminToken && cloud.adminToken()); } catch (e) { }

        if (hasAdmin) {
            panel.appendChild(el('p', 'bk-auth-msg ok', 'Đang có phiên Administrator trên tab này.'));
            var adminRow = el('div', 'bk-auth-box');
            var dash = el('a', 'bk-btn');
            dash.href = base() + 'admin/';
            dash.target = '_blank';
            dash.rel = 'noopener noreferrer';
            dash.appendChild(icon('fa-gauge-high'));
            dash.appendChild(el('span', null, 'Mở Administrator Dashboard'));
            /* Mở tab mới, tránh mở trùng khi bấm liên tục. Giữ nguyên tab Settings. */
            dash.addEventListener('click', function (e) {
                if (dash.getAttribute('data-opening') === '1') { e.preventDefault(); return; }
                dash.setAttribute('data-opening', '1');
                setTimeout(function () { dash.removeAttribute('data-opening'); }, 1500);
            });
            var adminOut = el('button', 'bk-btn bk-btn-ghost');
            adminOut.type = 'button';
            adminOut.appendChild(icon('fa-right-from-bracket'));
            adminOut.appendChild(el('span', null, 'Đăng xuất Administrator'));
            adminOut.addEventListener('click', function () {
                try { if (cloud.adminLogout) cloud.adminLogout(); } catch (e) { }
                toast('Đã đăng xuất Administrator.', 'success');
                buildDev(panel);
            });
            adminRow.appendChild(dash);
            adminRow.appendChild(adminOut);
            panel.appendChild(adminRow);
        } else {
            var aBox = el('div', 'bk-auth-box');
            var aInput = el('input', 'bk-input');
            aInput.type = 'password';
            aInput.autocomplete = 'off';
            aInput.spellcheck = false;
            aInput.placeholder = 'Administrator Code…';
            aInput.setAttribute('aria-label', 'Administrator Code');
            var aSubmit = el('button', 'bk-btn');
            aSubmit.type = 'button';
            aSubmit.appendChild(icon('fa-shield-halved'));
            aSubmit.appendChild(el('span', null, 'Xác thực'));
            aBox.appendChild(aInput);
            aBox.appendChild(aSubmit);
            panel.appendChild(aBox);

            var aMsg = el('p', 'bk-auth-msg');
            panel.appendChild(aMsg);

            function sayAdmin(text, kind) {
                aMsg.textContent = text;
                aMsg.className = 'bk-auth-msg' + (kind ? ' ' + kind : '');
            }

            function submitAdmin() {
                var code = aInput.value.trim();
                aInput.value = '';
                if (!code) return sayAdmin('Nhập Administrator Code.', 'err');
                if (!configured) return sayAdmin('Supabase chưa được cấu hình trên trang này.', 'err');
                aSubmit.disabled = true;
                sayAdmin('Đang xác thực…');
                cloud.adminLogin(code).then(function () {
                    /* Không tự chuyển trang: chỉ báo thành công và hiện nút mở tab mới. */
                    toast('Xác thực Administrator thành công.', 'success');
                    buildDev(panel);
                }).catch(function (err) {
                    var codeName = (err && err.code) || '';
                    var m = (err && err.message) || '';
                    if (codeName === 'TOO_MANY_ATTEMPTS' || /429|rate|nhiều/i.test(m)) {
                        sayAdmin('Quá nhiều lần thử. Vui lòng đợi vài phút.', 'err');
                    } else if (codeName === 'NO_DEV_CODE') {
                        sayAdmin('Máy chủ chưa đặt ADMIN_DEV_CODE nên Admin Dashboard đang tắt.', 'err');
                    } else if (codeName === 'BAD_DEV_CODE' || /INVALID|sai|không đúng|401/i.test(m)) {
                        sayAdmin('Administrator Code không đúng.', 'err');
                    } else {
                        sayAdmin('Không xác thực được: ' + (m || 'lỗi mạng'), 'err');
                    }
                }).then(function () { aSubmit.disabled = false; });
            }
            aSubmit.addEventListener('click', submitAdmin);
            aInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); submitAdmin(); }
            });
        }
    }

    /* ---------------------------------------------------------------------
       6. Founder Dashboard (mã riêng, xác thực phía máy chủ)
       ------------------------------------------------------------------ */
    function buildFounder(panel) {
        panel.textContent = '';
        var cloud = global.BKCloud;
        var configured = !!(cloud && cloud.configured && cloud.configured());
        var scope = null;
        try { scope = cloud && cloud.adminScope ? cloud.adminScope() : null; } catch (e) { scope = null; }
        var isFounder = scope === 'founder';

        panel.appendChild(el('h2', null, 'Founder Dashboard'));
        panel.appendChild(el('p', 'bk-set-lead',
            'Khu vực toàn quyền của Người sáng lập: đầy đủ 14 mô-đun quản trị, trao mọi badge (kể cả badge độc quyền), bảo trì, danh vị và cấp trọn bộ thành tích. Mã Founder được xác thực ở máy chủ và chỉ lưu dạng băm trong Supabase.'));
        panel.appendChild(devHint('Founder Code không nằm trong mã nguồn. Quản trị viên thường không mở được các mục dành riêng cho Founder.'));

        if (isFounder) {
            panel.appendChild(el('p', 'bk-auth-msg ok', 'Đang có phiên Founder trên tab này.'));
            var row = el('div', 'bk-auth-box');
            var open = el('a', 'bk-btn');
            open.href = base() + 'founder/';
            open.target = '_blank';
            open.rel = 'noopener noreferrer';
            open.appendChild(icon('fa-crown'));
            open.appendChild(el('span', null, 'Mở Founder Dashboard'));
            open.addEventListener('click', function (e) {
                if (open.getAttribute('data-opening') === '1') { e.preventDefault(); return; }
                open.setAttribute('data-opening', '1');
                setTimeout(function () { open.removeAttribute('data-opening'); }, 1500);
            });
            var out = el('button', 'bk-btn bk-btn-ghost');
            out.type = 'button';
            out.appendChild(icon('fa-right-from-bracket'));
            out.appendChild(el('span', null, 'Đăng xuất Founder'));
            out.addEventListener('click', function () {
                try { if (cloud.founderLogout) cloud.founderLogout(); } catch (e) { }
                toast('Đã đăng xuất Founder.', 'success');
                buildFounder(panel);
            });
            row.appendChild(open);
            row.appendChild(out);
            panel.appendChild(row);

            var grant = el('button', 'bk-btn');
            grant.type = 'button';
            grant.appendChild(icon('fa-gift'));
            grant.appendChild(el('span', null, 'Cấp toàn bộ badge & khung cho tôi'));
            grant.addEventListener('click', function () {
                grant.disabled = true;
                var label = grant.querySelector('span');
                if (label) label.textContent = 'Đang cấp…';
                cloud.adminAction('founder.grantAll', {}).then(function (data) {
                    /* 7.5.0 trả added/badgeTotal/studentId, không còn count/badges.
                       Đọc đúng trường để thông báo không hiện "undefined". */
                    var added = data && typeof data.added === 'number' ? data.added : 0;
                    var total = data && typeof data.badgeTotal === 'number' ? data.badgeTotal : 0;
                    var who = (data && data.studentName) || 'hồ sơ Founder';
                    toast('Đã cấp ' + added + ' badge' + (total ? ' trên ' + total : '') +
                        ' và toàn bộ khung cho ' + who + '.', 'success');
                    if (data && data.studentId) {
                        cloud.adminAction('students.inventory', { id: data.studentId }).then(function (inv) {
                            var B = global.BK && global.BK.badges;
                            if (!B || !Array.isArray(inv.badges)) return;
                            B.applyServer(inv.badges.map(function (b) {
                                return {
                                    badge_id: b.id,
                                    kind: b.source === 'auto' ? 'auto' : 'admin',
                                    awarded_at: b.awardedAt
                                };
                            }), { authoritative: true });
                        }).catch(function () { });
                    }
                }).catch(function (err) {
                    toast((err && err.message) || 'Không cấp được bộ thành tích.', 'error');
                }).then(function () {
                    grant.disabled = false;
                    if (label) label.textContent = 'Cấp toàn bộ badge & khung cho tôi';
                });
            });
            panel.appendChild(grant);
            panel.appendChild(devHint('Thao tác này chỉ áp dụng cho hồ sơ có is_founder = true; các hồ sơ khác không bị ảnh hưởng.'));
            return;
        }

        if (!configured) {
            panel.appendChild(el('p', 'bk-auth-msg err', 'Supabase chưa được cấu hình nên không thể xác thực Founder Code.'));
            return;
        }

        var box = el('div', 'bk-auth-box');
        var input = el('input', 'bk-input');
        input.type = 'password';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = 'Founder Code…';
        input.setAttribute('aria-label', 'Founder Code');
        var submit = el('button', 'bk-btn');
        submit.type = 'button';
        submit.appendChild(icon('fa-crown'));
        submit.appendChild(el('span', null, 'Xác thực Founder'));
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
            if (!code) return say('Nhập Founder Code.', 'err');
            submit.disabled = true;
            say('Đang xác thực ở máy chủ…');
            cloud.founderLogin(code).then(function () {
                toast('Xác thực Founder thành công.', 'success');
                buildFounder(panel);
            }).catch(function (err) {
                var codeName = (err && err.code) || '';
                var m = (err && err.message) || '';
                if (codeName === 'NO_FOUNDER_CODE') say('Máy chủ chưa có Founder Code trong bảng founder_config.', 'err');
                else if (codeName === 'TOO_MANY_ATTEMPTS' || /429|rate|nhiều/i.test(m)) say('Quá nhiều lần thử. Vui lòng đợi vài phút.', 'err');
                else if (codeName === 'BAD_FOUNDER_CODE' || /sai|không đúng|401/i.test(m)) say('Founder Code không đúng.', 'err');
                else say('Không xác thực được: ' + (m || 'lỗi mạng'), 'err');
            }).then(function () { submit.disabled = false; });
        }
        submit.addEventListener('click', submitCode);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); submitCode(); }
        });
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
