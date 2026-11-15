/* =========================================================================
   Bá Khí — bk-cloud.js
   Lớp Supabase dùng chung: một client duy nhất, Anonymous Auth bền vững,
   nhận diện học sinh bằng họ tên, trung tâm thông báo, changelog và đồng bộ
   tiến trình học tập.

   Nguyên tắc:
   - Chỉ dùng publishable key (xem bk-supabase.config.js). Không có secret.
   - student_id luôn do backend xác định; localStorage chỉ là gợi ý hiển thị.
   - Mọi nội dung từ máy chủ được render bằng textContent (chống XSS).

   Công khai: window.BKCloud
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKCloudLoaded) return;
    global.BKCloudLoaded = true;

    var CFG = global.BK_SUPABASE || {};
    var IDENTITY_KEY = 'bakhiStudent.v1';
    var ADMIN_KEY = 'bakhiAdmin.v1';
    var OFFLINE_MSG = 'Không kết nối được máy chủ. Dữ liệu học tập vẫn được lưu trên thiết bị này.';

    var S = {
        sdk: null, client: null, booting: null, session: null, ready: false,
        configOk: false, error: null, fatal: null,
        student: null, bound: false,
        announcements: [], reads: {}, changelog: [], co: {}, lastSeenVersion: null,
        syncTimer: null, retrying: null, syncing: false, applyingRemote: false,
        lastSyncAt: 0, syncError: null, listeners: [], channel: null,
        gate: null, bell: null, badge: null, changeBtn: null, panel: null, panelOpen: false,
        article: null, pollTimer: null, searchSeq: 0, publicLoaded: false, lastAnnFetch: 0,
        binding: false, fitTimer: null
    };

    function now() { return Date.now(); }
    /** Bỏ dấu, hạ chữ thường, gộp khoảng trắng — dùng để đối chiếu tên đã nhập. */
    function normName(value) {
        return String(value == null ? '' : value).toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
    }
    function el(tag, cls, text) {
        var e = D.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }
    function toast(msg, type) {
        if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast(msg, type);
        else console.log('[BKCloud]', msg);
    }
    function lsGet(key) {
        try { return JSON.parse(global.localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    }
    function lsSet(key, value) {
        try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
    }
    function lsDel(key) {
        try { global.localStorage.removeItem(key); } catch (e) { }
    }
    function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var p = function (n) { return n < 10 ? '0' + n : String(n); };
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function relTime(iso) {
        var t = new Date(iso || 0).getTime();
        if (!t) return '';
        var diff = Math.floor((now() - t) / 1000);
        if (diff < 60) return 'vừa xong';
        if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
        if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
        if (diff < 604800) return Math.floor(diff / 86400) + ' ngày trước';
        return fmtDate(iso).split(' ')[0];
    }
    function emit(evt, payload) {
        S.listeners.slice().forEach(function (fn) {
            try { fn(evt, payload); } catch (e) { console.warn('[BKCloud] listener', e); }
        });
    }
    function basePath() {
        try { if (global.BK && global.BK.util && global.BK.util.basePath) return global.BK.util.basePath(); } catch (e) { }
        var s = D.currentScript;
        var src = (s && s.src) || '';
        var i = src.indexOf('/assets/bakhi/');
        return i >= 0 ? src.slice(0, i + 1) : './';
    }

    /* ---------------------------------------------------------------------
       Trạng thái đồng bộ: nhãn nhỏ trong header
       ------------------------------------------------------------------ */
    function setSyncState(kind, text) {
        S.syncState = { kind: kind, text: text };
        var node = D.getElementById('bkcSyncState');
        if (!node) return;
        node.textContent = text;
        node.className = 'bkc-sync-state is-' + kind;
    }

    /* ---------------------------------------------------------------------
       Bảng cảnh báo cấu hình
       ------------------------------------------------------------------ */
    function configWarning() {
        if (D.getElementById('bkcCfgWarn')) return;
        var bar = el('div', 'bkc-cfg-warn');
        bar.id = 'bkcCfgWarn';
        bar.setAttribute('role', 'status');
        var icon = el('i', 'fa-solid fa-triangle-exclamation');
        icon.setAttribute('aria-hidden', 'true');
        bar.appendChild(icon);
        var text = el('div', 'bkc-cfg-text');
        text.appendChild(el('b', null, 'Cấu hình Supabase chưa hoàn tất'));
        text.appendChild(el('span', null,
            'Mở assets/bakhi/bk-supabase.config.js và điền SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY ' +
            '(KHU VỰC 1 và KHU VỰC 2). Website vẫn hoạt động ở chế độ local-first.'));
        bar.appendChild(text);
        var x = el('button', 'bkc-cfg-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng cảnh báo cấu hình');
        x.addEventListener('click', function () { bar.remove(); });
        bar.appendChild(x);
        (D.body || D.documentElement).appendChild(bar);
    }

    function fatalNotice(message) {
        if (D.getElementById('bkcFatal')) return;
        var box = el('div', 'bkc-fatal');
        box.id = 'bkcFatal';
        box.setAttribute('role', 'alert');
        box.appendChild(el('b', null, 'Chưa kết nối được Supabase'));
        box.appendChild(el('p', null, message));
        box.appendChild(el('p', 'bkc-fatal-hint',
            'Kiểm tra: đã chạy SQL migration, đã bật Anonymous Sign-ins, đã deploy Edge Functions. ' +
            'Xem docs/SUPABASE_SETUP.md.'));
        var x = el('button', 'bkc-cfg-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng thông báo');
        x.addEventListener('click', function () { box.remove(); });
        box.appendChild(x);
        (D.body || D.documentElement).appendChild(box);
    }

    /* ---------------------------------------------------------------------
       Supabase client (duy nhất)
       ------------------------------------------------------------------ */
    function ensureSdk() {
        if (global.supabase && global.supabase.createClient) return Promise.resolve();
        if (S.sdk) return S.sdk;
        S.sdk = new Promise(function (resolve, reject) {
            var script = D.createElement('script');
            script.src = CFG.sdkUrl || 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
            script.async = true;
            script.onload = function () {
                if (global.supabase && global.supabase.createClient) resolve();
                else reject(new Error('Thư viện Supabase tải về nhưng không khởi tạo được.'));
            };
            script.onerror = function () {
                S.sdk = null;
                reject(new Error('Không tải được thư viện Supabase (kiểm tra kết nối mạng).'));
            };
            (D.head || D.documentElement).appendChild(script);
        });
        return S.sdk;
    }

    function client() {
        if (S.client) return S.client;
        S.client = global.supabase.createClient(CFG.url, CFG.key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false,
                storageKey: 'bakhi.auth.v1'
            },
            global: { headers: { 'x-client-info': 'bakhi-web/3.0.0' } }
        });
        return S.client;
    }

    function ensureSession() {
        return client().auth.getSession().then(function (res) {
            var session = res && res.data && res.data.session;
            if (session) return session;
            return client().auth.signInAnonymously().then(function (r) {
                if (r.error) throw new Error(r.error.message || 'Không tạo được phiên ẩn danh.');
                return r.data.session;
            });
        }).then(function (session) {
            if (!session) throw new Error('Không có phiên đăng nhập.');
            S.session = session;
            return session;
        });
    }

    function ensureReady() {
        if (S.ready) return Promise.resolve();
        if (S.booting) return S.booting;
        S.booting = ensureSdk()
            .then(ensureSession)
            .then(function () {
                S.ready = true;
                S.error = null;
                return true;
            })
            .catch(function (e) {
                S.booting = null;
                S.error = e;
                throw e;
            });
        return S.booting;
    }

    /** Gọi Edge Function với Authorization của phiên thiết bị. */
    function api(name, body, extraHeaders) {
        return ensureReady().then(function () {
            return client().auth.getSession();
        }).then(function (res) {
            var token = (res && res.data && res.data.session && res.data.session.access_token) || '';
            if (!token) throw new Error('Phiên đăng nhập đã hết hạn.');
            var headers = {
                'Content-Type': 'application/json',
                apikey: CFG.key,
                Authorization: 'Bearer ' + token
            };
            if (extraHeaders) {
                Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
            }
            return global.fetch(CFG.url + '/functions/v1/' + name, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body || {})
            });
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok || (data && data.ok === false)) {
                    var err = new Error((data && data.error && data.error.message) || ('Lỗi máy chủ (' + res.status + ')'));
                    err.code = (data && data.error && data.error.code) || 'HTTP_' + res.status;
                    err.status = res.status;
                    err.data = data;
                    throw err;
                }
                return data;
            });
        });
    }

    /* ---------------------------------------------------------------------
       Nhận diện học sinh
       ------------------------------------------------------------------ */
    function cachedIdentity() { return lsGet(IDENTITY_KEY); }

    function setIdentity(student) {
        S.student = student ? {
            id: student.id,
            display_name: student.display_name,
            disambiguator: student.disambiguator || null,
            student_code: student.student_code || null
        } : null;
        S.bound = !!student;
        if (student) lsSet(IDENTITY_KEY, { studentId: student.id, displayName: student.display_name });
        else lsDel(IDENTITY_KEY);
        paintIdentityChip();
        emit('identity', S.student);
    }

    function paintIdentityChip() {
        var chip = D.getElementById('bkcIdentityChip');
        if (!chip) return;
        chip.textContent = '';
        if (!S.student) {
            chip.hidden = true;
            if (S.changeBtn) S.changeBtn.hidden = true;
            return;
        }
        chip.hidden = false;
        var icon = el('i', 'fa-solid fa-user-graduate');
        icon.setAttribute('aria-hidden', 'true');
        chip.appendChild(icon);
        chip.appendChild(el('span', 'bkc-chip-name', S.student.display_name));
        chip.title = S.student.display_name;
        if (S.changeBtn) S.changeBtn.hidden = false;
    }

    /* --------------------------- Màn hình nhập tên ---------------------- */
    function buildGate() {
        if (S.gate) return S.gate;
        var wrap = el('div', 'bkc-gate');
        wrap.id = 'bkIdentityGate';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'bkcGateTitle');

        var card = el('div', 'bkc-gate-card');
        card.appendChild(el('div', 'bkc-gate-brand', 'BÁ KHÍ'));

        var h = el('h2', 'bkc-gate-title', 'CHÀO MỪNG BẠN ĐẾN VỚI BÁ KHÍ');
        h.id = 'bkcGateTitle';
        card.appendChild(h);
        card.appendChild(el('p', 'bkc-gate-sub', 'Vui lòng nhập họ và tên đầy đủ để tiếp tục.'));

        var field = el('div', 'bkc-field');
        var inputId = 'bkcNameInput';
        var label = el('label', 'bkc-label', 'Họ và tên');
        label.setAttribute('for', inputId);
        field.appendChild(label);

        var box = el('div', 'bkc-combo');
        var input = el('input', 'bkc-input');
        input.id = inputId;
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', 'bkcSugList');
        input.placeholder = 'Ví dụ: Nguyễn Minh Anh';
        box.appendChild(input);

        var spin = el('span', 'bkc-spin');
        spin.hidden = true;
        box.appendChild(spin);

        var list = el('ul', 'bkc-sug');
        list.id = 'bkcSugList';
        list.setAttribute('role', 'listbox');
        list.hidden = true;
        /* Nằm trong .bkc-combo để danh sách bám sát ngay dưới ô nhập. */
        box.appendChild(list);
        field.appendChild(box);

        var msg = el('p', 'bkc-gate-msg');
        msg.id = 'bkcGateMsg';
        msg.setAttribute('role', 'status');
        field.appendChild(msg);
        card.appendChild(field);

        var confirm = el('button', 'bkc-btn bkc-btn-primary bkc-gate-confirm', 'Xác nhận');
        confirm.type = 'button';
        confirm.disabled = true;
        card.appendChild(confirm);

        var foot = el('p', 'bkc-gate-foot');
        foot.appendChild(el('span', null,
            'Danh sách học sinh do giáo viên quản lý. Tên chỉ dùng để nhận diện, ' +
            'không phải mật khẩu — đừng chia sẻ tên của người khác.'));
        card.appendChild(foot);

        wrap.appendChild(card);
        (D.body || D.documentElement).appendChild(wrap);
        D.documentElement.classList.add('bkc-lock');

        S.gate = {
            wrap: wrap, input: input, list: list, msg: msg, confirm: confirm,
            spin: spin, selected: null, items: [], activeIndex: -1
        };
        bindGateEvents();
        return S.gate;
    }

    function gateSetMsg(text, kind) {
        if (!S.gate) return;
        S.gate.msg.textContent = text || '';
        S.gate.msg.className = 'bkc-gate-msg' + (kind ? ' is-' + kind : '');
    }

    function gateSelect(item) {
        if (!S.gate) return;
        S.gate.selected = item;
        S.gate.input.value = item.display_name;
        S.gate.confirm.disabled = false;
        S.gate.list.hidden = true;
        S.gate.input.setAttribute('aria-expanded', 'false');
        S.gate.activeIndex = -1;
        gateSetMsg(item.disambiguator ? ('Hồ sơ: ' + item.disambiguator) : '', '');
    }

    function renderSuggestions(items, query) {
        var gate = S.gate;
        if (!gate) return;
        gate.items = items;
        gate.activeIndex = -1;
        gate.list.textContent = '';
        if (!items.length) {
            gate.list.hidden = true;
            gate.input.setAttribute('aria-expanded', 'false');
            if (gate.lockMsg) return;                /* giữ thông điệp lỗi đang hiện */
            if (query && query.trim().length >= 2) gateSetMsg('Không tìm thấy học sinh phù hợp.', 'warn');
            else gateSetMsg('', '');
            return;
        }
        items.forEach(function (item, index) {
            var li = el('li', 'bkc-sug-li');
            li.setAttribute('role', 'option');
            li.id = 'bkcSug' + index;
            li.setAttribute('aria-selected', 'false');
            var btn = el('button', 'bkc-sug-item');
            btn.type = 'button';
            btn.tabIndex = -1;
            btn.appendChild(highlightName(item.display_name, query));
            if (item.disambiguator) btn.appendChild(el('span', 'bkc-sug-tag', item.disambiguator));
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
            /* Chọn ngay khi chạm/giữ chuột: trên điện thoại sự kiện click có thể
               bị huỷ khi danh sách vừa ẩn, khiến trước đây không chọn được tên. */
            btn.addEventListener('pointerdown', function (e) { e.preventDefault(); gateSelect(item); });
            btn.addEventListener('click', function () { gateSelect(item); });
            li.appendChild(btn);
            gate.list.appendChild(li);
        });
        gate.list.hidden = false;
        gate.input.setAttribute('aria-expanded', 'true');
        if (!gate.lockMsg) gateSetMsg('', '');
    }

    /** Highlight phần trùng khớp, bỏ qua dấu tiếng Việt. */
    function highlightName(display, query) {
        var host = el('span', 'bkc-sug-name');
        var q = String(query || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
            .replace(/\s+/g, ' ').trim();
        if (!q) { host.textContent = display; return host; }
        var norm = '', map = [];
        for (var i = 0; i < display.length; i++) {
            var n = display.charAt(i).normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
            for (var k = 0; k < n.length; k++) { norm += n.charAt(k); map.push(i); }
        }
        var marks = {};
        q.split(' ').filter(Boolean).forEach(function (token) {
            var from = 0, at;
            while ((at = norm.indexOf(token, from)) !== -1) {
                for (var m = at; m < at + token.length; m++) marks[map[m]] = true;
                from = at + token.length;
            }
        });
        var buffer = '', strong = false;
        function flush() {
            if (!buffer) return;
            if (strong) { var b = el('b', 'bkc-hl'); b.textContent = buffer; host.appendChild(b); }
            else host.appendChild(D.createTextNode(buffer));
            buffer = '';
        }
        for (var j = 0; j < display.length; j++) {
            var isMatch = !!marks[j];
            if (isMatch !== strong) { flush(); strong = isMatch; }
            buffer += display.charAt(j);
        }
        flush();
        return host;
    }

    function moveActive(delta) {
        var gate = S.gate;
        if (!gate || !gate.items.length) return;
        var count = gate.items.length;
        var next = gate.activeIndex + delta;
        if (next < 0) next = count - 1;
        if (next >= count) next = 0;
        gate.activeIndex = next;
        Array.prototype.forEach.call(gate.list.children, function (li, i) {
            li.setAttribute('aria-selected', i === next ? 'true' : 'false');
            li.classList.toggle('is-active', i === next);
        });
        var active = gate.list.children[next];
        if (active) {
            var btn = active.querySelector('button');
            if (btn) gate.input.setAttribute('aria-activedescendant', active.id);
            active.scrollIntoView({ block: 'nearest' });
        }
    }

    function bindGateEvents() {
        var gate = S.gate;
        var timer = null;

        gate.input.addEventListener('input', function () {
            var value = gate.input.value;
            if (gate.selected && normName(gate.selected.display_name) !== normName(value)) gate.selected = null;
            gate.confirm.disabled = normName(value).length < 2;
            gate.lockMsg = false;
            gateSetMsg('', '');
            clearTimeout(timer);
            if (value.trim().length < 2) {
                renderSuggestions([], '');
                return;
            }
            timer = setTimeout(function () { runSearch(value); }, 200);
        });

        gate.input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') {
                if (gate.list.hidden && gate.items.length) renderSuggestions(gate.items, gate.input.value);
                else moveActive(1);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                moveActive(-1);
                e.preventDefault();
            } else if (e.key === 'Escape') {
                gate.list.hidden = true;
                gate.input.setAttribute('aria-expanded', 'false');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (gate.activeIndex >= 0 && gate.items[gate.activeIndex]) {
                    gateSelect(gate.items[gate.activeIndex]);
                }
                submitIdentity();
            }
        });

        gate.input.addEventListener('blur', function () {
            setTimeout(function () {
                if (!S.gate) return;
                var active = D.activeElement;
                if (S.gate.list.contains(active)) return;
                if (active === S.gate.input) return;
                S.gate.list.hidden = true;
                S.gate.input.setAttribute('aria-expanded', 'false');
            }, 260);
        });

        gate.confirm.addEventListener('click', submitIdentity);

        D.addEventListener('click', function (e) {
            if (!S.panelOpen) return;
            if (S.panel && (S.panel.contains(e.target) || (S.bell && S.bell.contains(e.target)))) return;
            /* Nút mở panel trong What's New không được tính là "bấm ra ngoài". */
            if (e.target && e.target.closest && e.target.closest('#bkcWhatsNew')) return;
            closePanel();
        });
    }

    function runSearch(value) {
        var gate = S.gate;
        if (!gate) return;
        var seq = ++S.searchSeq;
        if (gate.spin) gate.spin.hidden = false;
        api(CFG.functions.searchStudents, { q: value }).then(function (data) {
            if (seq !== S.searchSeq) return;
            gate.spin.hidden = true;
            renderSuggestions((data && data.students) || [], value);
        }).catch(function (err) {
            if (seq !== S.searchSeq) return;
            gate.spin.hidden = true;
            gateSetMsg(err.message || OFFLINE_MSG, 'error');
        });
    }

    /* --------------------- Xác nhận danh tính (làm lại) ------------------- */

    /* Bấm Xác nhận: nếu đã chọn đúng một gợi ý thì xác nhận hồ sơ đó, nếu không
       thì để máy chủ tự tra đúng họ tên đã nhập — gõ đúng tên là vào được. */
    function submitIdentity() {
        var gate = S.gate;
        if (!gate || S.binding) return;
        var typed = String(gate.input.value || '').replace(/\s+/g, ' ').trim();
        if (normName(typed).length < 2) {
            gateSetMsg('Hãy nhập đầy đủ họ và tên của bạn.', 'warn');
            try { gate.input.focus(); } catch (e) { }
            return;
        }
        if (gate.selected && normName(gate.selected.display_name) === normName(typed)) {
            bindIdentity(gate.selected);
            return;
        }
        resolveByName(typed);
    }

    /* Tra đúng họ tên ở máy chủ rồi gắn phiên — không cần chọn gợi ý. */
    function resolveByName(typed) {
        var gate = S.gate;
        if (!gate || S.binding) return;
        S.binding = true;
        gate.selected = null;
        S.searchSeq++;                      /* huỷ kết quả gợi ý đang bay về */
        if (gate.spin) gate.spin.hidden = false;
        gateSetMsg('Đang đối chiếu họ tên…', '');
        api(CFG.functions.bindSession, { display_name: typed }).then(function (data) {
            S.binding = false;
            if (gate.spin) gate.spin.hidden = true;
            handleBindSuccess(data);
        }).catch(function (err) {
            S.binding = false;
            if (gate.spin) gate.spin.hidden = true;
            handleBindError(err, typed);
        });
    }

    function handleBindSuccess(data) {
        var gate = S.gate;
        if (gate) { if (gate.spin) gate.spin.hidden = true; gateSetMsg('', ''); }
        if (!data || !data.bound) {
            gateSetMsg('Máy chủ không xác nhận được danh tính. Thử lại.', 'error');
            return;
        }
        applyBinding(data);
        closeGate();
        toast('Xin chào ' + data.student.display_name + '!', 'success');
    }

    function handleBindError(err, typed) {
        var gate = S.gate;
        if (!gate) return;
        var code = err && err.code;
        var detail = (err && err.data && err.data.error) || {};
        if (code === 'AMBIGUOUS' && Array.isArray(detail.candidates) && detail.candidates.length) {
            gateSetMsg('Có nhiều hồ sơ cùng họ tên — hãy chọn đúng hồ sơ của bạn.', 'warn');
            showCandidates(detail.candidates);
            return;
        }
        if (code === 'NAME_NOT_FOUND') {
            gate.lockMsg = true;
            gateSetMsg('Không có ai tên "' + typed + '". Kiểm tra lại họ tên hoặc chọn trong danh sách gợi ý.', 'error');
            runSearch(typed);
            return;
        }
        if (code === 'NEEDS_REVIEW') {
            gateSetMsg('Hồ sơ này đang chờ giáo viên phân biệt trùng họ tên. Hãy báo giáo viên.', 'error');
            return;
        }
        if (code === 'TOO_MANY_BINDS') {
            gateSetMsg('Bạn đã thử quá nhiều lần. Chờ vài phút rồi bấm Xác nhận lại.', 'error');
            return;
        }
        if (code === 'INACTIVE') {
            gateSetMsg('Hồ sơ này đã bị vô hiệu hoá. Hãy liên hệ giáo viên.', 'error');
            return;
        }
        if (code === 'NAME_MISMATCH') {
            gateSetMsg('Tên không khớp hồ sơ. Hãy nhập lại đúng họ tên.', 'error');
            return;
        }
        gateSetMsg((err && err.message) || 'Không xác nhận được danh tính. Thử lại sau.', 'error');
    }

    /* Nhiều hồ sơ trùng họ tên: bắt buộc chọn đúng một hồ sơ. */
    function showCandidates(list) {
        var gate = S.gate;
        var box = el('div', 'bkc-candidates');
        box.appendChild(el('p', 'bkc-confirm-label', 'Chọn hồ sơ của bạn:'));
        var mod = null;
        list.forEach(function (item) {
            var btn = el('button', 'bkc-candidate');
            btn.type = 'button';
            btn.appendChild(el('span', 'bkc-candidate-name', item.display_name));
            if (item.disambiguator) btn.appendChild(el('span', 'bkc-sug-tag', item.disambiguator));
            btn.addEventListener('click', function () {
                if (mod && mod.close) mod.close();
                if (S.gate) { S.gate.input.value = item.display_name; S.gate.selected = item; }
                bindIdentity(item);
            });
            box.appendChild(btn);
        });
        if (global.BK && global.BK.ui && global.BK.ui.modal) {
            mod = global.BK.ui.modal({
                title: 'NHIỀU HỒ SƠ TRÙNG HỌ TÊN',
                body: box,
                actions: [{ label: 'Đóng', variant: 'ghost', onClick: function (close) { close(); } }]
            });
        }
        if (!mod && gate) {
            var old = gate.wrap.querySelector('.bkc-candidates');
            if (old) old.remove();
            box.className = 'bkc-candidates bkc-candidates-inline';
            var card = gate.wrap.querySelector('.bkc-gate-card');
            if (card) card.appendChild(box);
        }
    }

    function bindIdentity(item) {
        var gate = S.gate;
        if (S.binding) return;
        S.binding = true;
        if (gate) { if (gate.spin) gate.spin.hidden = false; gateSetMsg('Đang xác nhận…', ''); }
        api(CFG.functions.bindSession, {
            student_id: item.id,
            display_name: item.display_name
        }).then(function (data) {
            S.binding = false;
            if (gate && gate.spin) gate.spin.hidden = true;
            handleBindSuccess(data);
        }).catch(function (err) {
            S.binding = false;
            if (gate && gate.spin) gate.spin.hidden = true;
            handleBindError(err, item.display_name);
        });
    }

    function applyBinding(data) {
        var student = data.student;
        var remote = data.progress || {};
        var hasRemote = Object.keys(remote).some(function (k) {
            var v = remote[k];
            return v && (!Array.isArray(v) || v.length) && (typeof v !== 'object' || Object.keys(v).length);
        });
        if (hasRemote) backupLocal();
        setIdentity(student);
        mountIdentityUi();
        loadAnnouncements(true);
        loadChangelog();
        S.publicLoaded = true;
        if (hasRemote) {
            S.applyingRemote = true;
            try { if (global.BK && BK.cloud && BK.cloud.merge) BK.cloud.merge(remote); } catch (e) { console.warn(e); }
            S.applyingRemote = false;
        }
        var remoteSync = Object.keys(data.updated || {}).map(function (k) { return data.updated[k]; }).sort().pop();
        S.lastSyncAt = remoteSync ? new Date(remoteSync).getTime() : 0;
        setSyncState('ok', 'Đã đồng bộ');
        emit('bound', student);
    }

    function backupLocal() {
        try {
            var raw = global.localStorage.getItem('bakhiLearn.v1');
            if (!raw) return;
            global.localStorage.setItem('bakhiLearn.preBind.' + now(), raw.slice(0, 400000));
        } catch (e) { }
    }

    function openGate() {
        ensureReady().then(function () {
            var gate = buildGate();
            gate.wrap.hidden = false;
            D.documentElement.classList.add('bkc-lock');
            gate.input.value = '';
            gate.selected = null;
            gate.confirm.disabled = true;
            gate.items = [];
            gate.list.hidden = true;
            gateSetMsg('Nhập đúng họ tên rồi bấm Xác nhận — hoặc chọn trong danh sách gợi ý.', '');
            setTimeout(function () { try { gate.input.focus(); } catch (e) { } }, 40);
        }).catch(function (err) {
            buildFatalGate(err);
        });
    }

    function buildFatalGate(err) {
        var wrap = el('div', 'bkc-gate');
        wrap.id = 'bkIdentityGate';
        wrap.setAttribute('role', 'alertdialog');
        var card = el('div', 'bkc-gate-card');
        card.appendChild(el('div', 'bkc-gate-brand', 'BÁ KHÍ'));
        card.appendChild(el('h2', 'bkc-gate-title', 'Chưa kết nối được máy chủ'));
        card.appendChild(el('p', 'bkc-gate-sub', err.message || OFFLINE_MSG));
        card.appendChild(el('p', 'bkc-gate-foot',
            'Website cần Supabase để nhận diện học sinh. Xem docs/SUPABASE_SETUP.md để hoàn tất cấu hình.'));
        var retry = el('button', 'bkc-btn bkc-btn-primary', 'Thử lại');
        retry.type = 'button';
        retry.addEventListener('click', function () {
            wrap.remove();
            S.booting = null; S.ready = false;
            boot();
        });
        card.appendChild(retry);
        wrap.appendChild(card);
        (D.body || D.documentElement).appendChild(wrap);
    }

    function closeGate() {
        if (S.gate) S.gate.wrap.remove();
        S.gate = null;
        D.documentElement.classList.remove('bkc-lock');
    }

    /* ------------------------- Đổi / thoát học sinh --------------------- */
    function changeStudent() {
        var body = el('div');
        body.appendChild(el('p', 'bkc-muted',
            S.student ? ('Bạn đang học với tên ' + S.student.display_name + '.') : 'Chưa chọn học sinh.'));
        body.appendChild(el('p', 'bkc-muted',
            'Khi đổi học sinh, tiến trình trên máy chủ của người trước vẫn được giữ nguyên. ' +
            'Hãy chắc chắn bạn chọn đúng tên của mình.'));
        global.BK.ui.modal({
            title: 'Đổi học sinh',
            body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost', onClick: function (c) { c(); } },
                {
                    label: 'Đổi học sinh', variant: 'primary', onClick: function (c) {
                        c();
                        api(CFG.functions.bindSession, { unbind: true }).then(function () {
                            setIdentity(null);
                            closeGate();
                            openGate();
                        }).catch(function (err) {
                            toast(err.message || 'Không thoát được phiên học sinh.', 'error');
                        });
                    }
                }
            ]
        });
    }

    function mountIdentityUi() {
        if (!S.bound) return;
        var host = D.querySelector('#hamburgerDropdown .space-y-1\\.5');
        if (host && !D.getElementById('bkcChangeStudentBtn')) {
            var btn = el('button', 'bkc-menu-btn');
            btn.id = 'bkcChangeStudentBtn';
            btn.type = 'button';
            var icon = el('i', 'fa-solid fa-user-pen');
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);
            btn.appendChild(el('span', null, 'Đổi học sinh'));
            btn.addEventListener('click', function () {
                var dd = D.getElementById('hamburgerDropdown');
                if (dd) dd.classList.add('hidden');
                changeStudent();
            });
            host.appendChild(btn);
        }
        paintIdentityChip();
    }

    /* ---------------------------------------------------------------------
       Trạng thái đã đọc + thông báo
       ------------------------------------------------------------------ */
    function readAnnouncementIds() {
        if (!S.bound || !S.student) return Promise.resolve({});
        return client().from('announcement_reads')
            .select('announcement_id, read_at')
            .eq('student_id', S.student.id)
            .then(function (res) {
                var map = {};
                (res.data || []).forEach(function (r) { map[r.announcement_id] = r.read_at; });
                return map;
            });
    }

    function loadAnnouncements(force) {
        if (!S.ready) return Promise.resolve([]);
        var stamp = now();
        if (!force && S.announcements.length && stamp - S.lastAnnFetch < 5000) {
            return Promise.resolve(S.announcements);
        }
        S.lastAnnFetch = stamp;
        return client().from('announcements')
            .select('id, title, content, type, priority, published_at')
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(50)
            .then(function (res) {
                if (res.error) throw res.error;
                S.announcements = res.data || [];
                return readAnnouncementIds().catch(function () { return {}; });
            }).then(function (reads) {
                S.reads = reads || {};
                paintBell();
                if (S.panelOpen) renderPanel();
                emit('announcements', S.announcements);
                return S.announcements;
            }).catch(function (err) {
                console.warn('[BKCloud] announcements', err);
                return [];
            });
    }

    function unreadCount() {
        return S.announcements.filter(function (a) { return !S.reads[a.id]; }).length;
    }

    function typeLabel(type) {
        return {
            general: 'Chung', announcement: 'Thông báo', update: 'Cập nhật',
            important: 'Quan trọng', maintenance: 'Bảo trì'
        }[type] || 'Chung';
    }
    function priorityLabel(p) {
        return { low: 'Thấp', normal: 'Bình thường', high: 'Cao', critical: 'Khẩn' }[p] || 'Bình thường';
    }

    function buildBell() {
        if (S.bell) return;
        var bell = el('button', 'bkc-bell');
        bell.type = 'button';
        bell.id = 'bkcBell';
        bell.setAttribute('aria-haspopup', 'dialog');
        bell.setAttribute('aria-expanded', 'false');
        bell.setAttribute('aria-label', 'Trung tâm thông báo');
        bell.title = 'Trung tâm thông báo';
        bell.innerHTML = '<i class="fa-solid fa-bell" aria-hidden="true"></i>';
        var badge = el('span', 'bkc-badge', '0');
        badge.hidden = true;
        badge.setAttribute('aria-hidden', 'true');
        bell.appendChild(badge);
        bell.addEventListener('click', function (e) { e.stopPropagation(); togglePanel(); });

        var chip = el('button', 'bkc-identity-chip');
        chip.type = 'button';
        chip.id = 'bkcIdentityChip';
        chip.title = 'Học sinh đang đăng nhập';
        chip.hidden = true;
        chip.addEventListener('click', changeStudent);

        var changeBtn = el('button', 'bkc-bell bkc-change-btn');
        changeBtn.type = 'button';
        changeBtn.id = 'bkcChangeStudentIcon';
        changeBtn.setAttribute('aria-label', 'Đổi học sinh');
        changeBtn.title = 'Đổi học sinh';
        changeBtn.hidden = true;
        changeBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>';
        changeBtn.addEventListener('click', changeStudent);

        var anchor = D.querySelector('button[onclick*="openReadmeModal"]');
        var host = anchor && anchor.parentNode;
        if (host) {
            host.insertBefore(chip, anchor);
            host.insertBefore(changeBtn, anchor);
            host.insertBefore(bell, anchor);
        } else {
            var header = D.querySelector('header');
            var target = header ? (header.lastElementChild || header) : (D.body || D.documentElement);
            bell.classList.add('bkc-bell-float');
            if (!header) (D.body || D.documentElement).appendChild(bell);
            else target.appendChild(bell);
        }
        S.bell = bell;
        S.badge = badge;
        S.changeBtn = changeBtn;

        /* Chỉ giữ MỘT chuông: gỡ chuông CHANGELOG.md cũ (bk-notify) để không hiện 2 mục thông báo. */
        var legacyBell = D.querySelector('.bknt-bell');
        if (legacyBell && legacyBell.parentNode) legacyBell.parentNode.removeChild(legacyBell);
        var legacyPanel = D.getElementById('bkntPanel');
        if (legacyPanel) legacyPanel.remove();
    }

    function paintBell() {
        if (!S.badge) return;
        var n = S.bound ? unreadCount() : 0;
        S.badge.hidden = n === 0;
        S.badge.textContent = n > 99 ? '99+' : String(n);
        if (S.bell) {
            S.bell.classList.toggle('has-unread', n > 0);
            S.bell.setAttribute('aria-label', n ? ('Trung tâm thông báo: ' + n + ' chưa đọc') : 'Trung tâm thông báo');
        }
        paintIdentityChip();
    }

    function buildPanel() {
        if (S.panel) return;
        var panel = el('div', 'bkc-panel');
        panel.id = 'bkcPanel';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Trung tâm thông báo');

        var head = el('div', 'bkc-panel-head');
        var titles = el('div');
        titles.appendChild(el('b', 'bkc-panel-title', 'Thông báo'));
        titles.appendChild(el('span', 'bkc-panel-sub', 'Cập nhật tức thời từ giáo viên'));
        head.appendChild(titles);
        var close = el('button', 'bkc-x', '×');
        close.type = 'button';
        close.id = 'bkcPanelClose';
        close.setAttribute('aria-label', 'Đóng thông báo');
        close.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();          /* không để click ngoài/bell mở lại panel */
            closePanel();
        });
        head.appendChild(close);
        panel.appendChild(head);

        var actions = el('div', 'bkc-panel-actions');
        var markAll = el('button', 'bkc-link-btn', 'Đánh dấu tất cả đã đọc');
        markAll.type = 'button';
        markAll.addEventListener('click', markAllRead);
        actions.appendChild(markAll);
        panel.appendChild(actions);

        var list = el('div', 'bkc-panel-list');
        panel.appendChild(list);
        S.list = list;

        (D.body || D.documentElement).appendChild(panel);
        S.panel = panel;

        global.addEventListener('resize', placePanel);
        global.addEventListener('scroll', placePanel, true);
    }

    function placePanel() {
        if (!S.panel || !S.bell || S.panel.hidden) return;
        var r = S.bell.getBoundingClientRect();
        var vw = global.innerWidth || 360;
        var vh = global.innerHeight || 640;
        var width = Math.min(368, vw - 16);
        var right = Math.max(8, Math.min(vw - r.right, vw - width - 8));
        var top = Math.min(Math.max(8, r.bottom + 8), Math.max(8, vh - 180));
        S.panel.style.width = width + 'px';
        S.panel.style.right = right + 'px';
        S.panel.style.top = top + 'px';
        S.panel.style.maxHeight = Math.max(160, vh - top - 12) + 'px';
    }

    function togglePanel() { if (S.panelOpen) closePanel(); else openPanel(); }

    function openPanel() {
        if (!S.bound) {
            toast('Hãy chọn học sinh trước khi xem thông báo.', 'info');
            return;
        }
        buildPanel();
        S.panelOpen = true;
        S.panel.hidden = false;
        if (S.bell) S.bell.setAttribute('aria-expanded', 'true');
        renderPanel();
        placePanel();
        loadAnnouncements(true);
    }

    function closePanel() {
        if (!S.panel) return;
        S.panelOpen = false;
        S.panel.hidden = true;
        if (S.bell) { S.bell.setAttribute('aria-expanded', 'false'); S.bell.focus(); }
    }

    /** So sánh số phiên bản kiểu 3.1.10 > 3.1.9 (không so sánh chuỗi). */
    function compareVersion(a, b) {
        var pa = String(a || '').split(/[.+-]/), pb = String(b || '').split(/[.+-]/);
        var len = Math.max(pa.length, pb.length);
        for (var i = 0; i < len; i++) {
            var na = parseInt(pa[i], 10), nb = parseInt(pb[i], 10);
            if (isNaN(na) && isNaN(nb)) continue;
            if (isNaN(na)) return 1;
            if (isNaN(nb)) return -1;
            if (na !== nb) return na - nb;
        }
        return 0;
    }

    function panelGroup(title) {
        var head = el('div', 'bkc-group-title', title);
        return head;
    }

    function renderPanel() {
        if (!S.list) return;
        S.list.textContent = '';
        var hasAny = S.announcements.length || S.changelog.length;
        if (!hasAny) {
            var empty = el('div', 'bkc-empty');
            empty.appendChild(el('i', 'fa-regular fa-bell-slash'));
            empty.appendChild(el('p', null, 'Chưa có thông báo nào.'));
            S.list.appendChild(empty);
            return;
        }

        if (S.announcements.length) {
            S.list.appendChild(panelGroup('Thông báo từ giáo viên'));
            S.announcements.forEach(function (a) {
                var unread = !S.reads[a.id];
                var item = el('button', 'bkc-item' + (unread ? ' is-unread' : ''));
                item.type = 'button';
                item.setAttribute('data-priority', a.priority);

                var top = el('div', 'bkc-item-top');
                top.appendChild(el('span', 'bkc-tag bkc-tag-' + a.type, typeLabel(a.type)));
                if (a.priority === 'high' || a.priority === 'critical') {
                    top.appendChild(el('span', 'bkc-tag bkc-tag-pri', priorityLabel(a.priority)));
                }
                top.appendChild(el('span', 'bkc-item-time', relTime(a.published_at)));
                item.appendChild(top);

                item.appendChild(el('b', 'bkc-item-title', a.title));
                item.appendChild(el('span', 'bkc-item-sum', clip(a.content, 120)));
                item.addEventListener('click', function () { openArticle(a.id); });
                S.list.appendChild(item);
            });
        }

        if (S.changelog.length) {
            S.list.appendChild(panelGroup('Cập nhật phiên bản'));
            /* Xếp theo SỐ phiên bản tăng dần: 3.0.0 → 3.1.0 → 3.1.1 → 3.2.0. */
            S.changelog.slice().sort(function (a, b) {
                return compareVersion(a.version, b.version);
            }).forEach(function (entry) {
                var item = el('button', 'bkc-item bkc-item-version');
                item.type = 'button';
                var top = el('div', 'bkc-item-top');
                top.appendChild(el('span', 'bkc-tag bkc-tag-update', 'Phiên bản ' + entry.version));
                top.appendChild(el('span', 'bkc-item-time', relTime(entry.published_at)));
                item.appendChild(top);
                item.appendChild(el('b', 'bkc-item-title', entry.title));
                if (entry.summary) item.appendChild(el('span', 'bkc-item-sum', clip(entry.summary, 120)));
                item.addEventListener('click', function () { openChangelogEntry(entry); });
                S.list.appendChild(item);
            });
        }

        var foot = el('div', 'bkc-panel-foot');
        foot.appendChild(changelogMdLink('Xem CHANGELOG.md'));
        S.list.appendChild(foot);
    }

    /* Mở nội dung đầy đủ của một phiên bản trong trung tâm thông báo. */
    function openChangelogEntry(entry) {
        var wrap = el('div', 'bkc-modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var sheet = el('div', 'bkc-sheet bkc-sheet-wide');
        var head = el('div', 'bkc-sheet-head');
        var titles = el('div', 'bkc-sheet-titles');
        titles.appendChild(el('h2', 'bkc-sheet-title', entry.title));
        var line = el('div', 'bkc-sheet-line');
        line.appendChild(el('span', 'bkc-tag bkc-tag-update', 'Phiên bản ' + entry.version));
        if (entry.published_at) line.appendChild(el('span', 'bkc-tag', fmtDate(entry.published_at)));
        titles.appendChild(line);
        head.appendChild(titles);
        var x = el('button', 'bkc-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng bản cập nhật');
        head.appendChild(x);
        sheet.appendChild(head);

        var body = el('div', 'bkc-sheet-body');
        if (entry.summary) body.appendChild(el('p', 'bkc-wn-sum', entry.summary));
        body.appendChild(sectionBlock(entry));
        var foot = el('div', 'bkc-sheet-foot');
        foot.appendChild(changelogMdLink('Xem CHANGELOG.md đầy đủ'));
        body.appendChild(foot);
        sheet.appendChild(body);
        wrap.appendChild(sheet);

        var close = function () {
            wrap.remove();
            D.documentElement.classList.remove('bkc-lock');
            D.removeEventListener('keydown', onKey);
        };
        var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        x.addEventListener('click', function (e) { e.stopPropagation(); close(); });
        wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
        (D.body || D.documentElement).appendChild(wrap);
        D.documentElement.classList.add('bkc-lock');
        D.addEventListener('keydown', onKey);
        x.focus();
    }

    function clip(text, max) {
        var s = String(text || '').replace(/\s+/g, ' ').trim();
        return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
    }

    function markRead(id) {
        if (!S.bound || !S.student || S.reads[id]) return Promise.resolve();
        S.reads[id] = new Date().toISOString();
        paintBell();
        return client().from('announcement_reads').upsert({
            student_id: S.student.id,
            announcement_id: id,
            read_at: S.reads[id]
        }, { onConflict: 'student_id,announcement_id' }).then(function (res) {
            if (res.error) console.warn('[BKCloud] markRead', res.error.message);
        });
    }

    function markAllRead() {
        if (!S.bound || !S.student) return;
        var unread = S.announcements.filter(function (a) { return !S.reads[a.id]; });
        if (!unread.length) { toast('Bạn đã đọc tất cả thông báo.', 'info'); return; }
        var stamp = new Date().toISOString();
        var rows = unread.map(function (a) {
            S.reads[a.id] = stamp;
            return { student_id: S.student.id, announcement_id: a.id, read_at: stamp };
        });
        paintBell();
        renderPanel();
        client().from('announcement_reads')
            .upsert(rows, { onConflict: 'student_id,announcement_id' })
            .then(function (res) {
                if (res.error) toast('Không lưu được trạng thái đã đọc: ' + res.error.message, 'error');
                else toast('Đã đánh dấu tất cả thông báo là đã đọc', 'success');
            });
    }

    /* ------------------------- Đọc đầy đủ thông báo --------------------- */
    function closeArticle() {
        if (!S.article) return;
        S.article.remove();
        S.article = null;
        D.documentElement.classList.remove('bkc-lock');
        D.removeEventListener('keydown', onArticleKey);
    }
    function onArticleKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeArticle(); }
        else if (e.key === 'Tab' && S.article && global.BK && global.BK.ui && global.BK.ui.trapFocus) {
            global.BK.ui.trapFocus(e, S.article.querySelector('.bkc-sheet'));
        }
    }

    function openArticle(id) {
        var item = S.announcements.filter(function (a) { return a.id === id; })[0];
        if (!item) return;
        markRead(item.id);
        closeArticle();

        var wrap = el('div', 'bkc-modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var sheet = el('div', 'bkc-sheet');
        var head = el('div', 'bkc-sheet-head');
        var titles = el('div', 'bkc-sheet-titles');
        var line = el('div', 'bkc-sheet-line');
        line.appendChild(el('span', 'bkc-tag bkc-tag-' + item.type, typeLabel(item.type)));
        line.appendChild(el('span', 'bkc-tag', priorityLabel(item.priority)));
        if (item.published_at) line.appendChild(el('span', 'bkc-tag', fmtDate(item.published_at)));
        titles.appendChild(line);
        titles.appendChild(el('h2', 'bkc-sheet-title', item.title));
        head.appendChild(titles);
        var x = el('button', 'bkc-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng thông báo');
        x.addEventListener('click', closeArticle);
        head.appendChild(x);
        sheet.appendChild(head);

        var body = el('div', 'bkc-sheet-body');
        String(item.content || '').split(/\n{2,}/).forEach(function (par) {
            if (!par.trim()) return;
            var p = el('p');
            p.textContent = par.trim();
            body.appendChild(p);
        });
        sheet.appendChild(body);

        var foot = el('div', 'bkc-sheet-foot');
        var btn = el('button', 'bkc-btn', 'Đóng');
        btn.type = 'button';
        btn.addEventListener('click', closeArticle);
        foot.appendChild(btn);
        sheet.appendChild(foot);

        wrap.appendChild(sheet);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closeArticle(); });
        (D.body || D.documentElement).appendChild(wrap);
        S.article = wrap;
        D.documentElement.classList.add('bkc-lock');
        D.addEventListener('keydown', onArticleKey);
        x.focus();
    }

    /* ---------------------------------------------------------------------
       Changelog — khu vực "What's New" + xem toàn bộ lịch sử
       ------------------------------------------------------------------ */
    var CAT_LABEL = {
        features: 'Tính năng mới', improvements: 'Cải tiến', fixes: 'Sửa lỗi',
        ui: 'Giao diện', performance: 'Hiệu năng', other: 'Khác'
    };

    function loadChangelog() {
        if (!S.ready) return Promise.resolve([]);
        return client().from('changelog')
            .select('id, version, title, summary, content, category, published_at')
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(40)
            .then(function (res) {
                if (res.error) throw res.error;
                S.changelog = res.data || [];
                renderWhatsNew();
                renderPanel();
                emit('changelog', S.changelog);
                return S.changelog;
            }).catch(function (err) {
                console.warn('[BKCloud] changelog', err);
                return [];
            });
    }

    function sectionBlock(entry) {
        var frag = D.createDocumentFragment();
        var sections = Array.isArray(entry.content) ? entry.content : [];
        sections.forEach(function (section) {
            var group = el('div', 'bkc-cat');
            group.appendChild(el('div', 'bkc-cat-title', CAT_LABEL[section.category] || 'Khác'));
            var ul = el('ul', 'bkc-cat-list');
            (section.items || []).forEach(function (text) {
                var li = el('li');
                li.textContent = text;
                ul.appendChild(li);
            });
            group.appendChild(ul);
            frag.appendChild(group);
        });
        return frag;
    }

    /* Đường dẫn tới CHANGELOG.md đầy đủ — trình xem markdown của trang xử lý. */
    function changelogMdLink(label) {
        var link = el('button', 'bkc-btn bkc-btn-ghost bkc-md-link', label || 'CHANGELOG.md');
        link.type = 'button';
        link.title = 'Xem toàn bộ lịch sử phiên bản trong CHANGELOG.md';
        link.addEventListener('click', openChangelogFile);
        return link;
    }

    function openChangelogFile() {
        if (typeof global.openChangelogMd === 'function') { global.openChangelogMd(); return; }
        if (global.open) global.open('CHANGELOG.md', '_blank', 'noopener');
    }

    /* Phiên bản mới nhất theo SỐ phiên bản (không theo ngày đăng). */
    function latestChangelog() {
        if (!S.changelog.length) return null;
        return S.changelog.slice().sort(function (a, b) {
            return compareVersion(b.version, a.version);
        })[0];
    }

    /* Cập nhật gần nhất — hiển thị trên trang chính (trở lại từ 3.1.3). */
    function renderWhatsNew() {
        var main = D.querySelector('main');
        if (!main) return;
        var host = D.getElementById('bkcWhatsNew');
        if (!host) {
            host = el('section', 'bkc-whatsnew');
            host.id = 'bkcWhatsNew';
            var anchor = main.children[1] || main.firstElementChild;
            if (anchor && anchor.nextSibling) main.insertBefore(host, anchor.nextSibling);
            else main.appendChild(host);
        }
        host.textContent = '';
        var entry = latestChangelog();
        if (!entry) { host.hidden = true; return; }
        host.hidden = false;

        var head = el('div', 'bkc-wn-head');
        var left = el('div');
        var line = el('div', 'bkc-wn-line');
        line.appendChild(el('span', 'bkc-tag bkc-tag-update', 'Phiên bản ' + entry.version));
        if (entry.published_at) line.appendChild(el('span', 'bkc-tag', fmtDate(entry.published_at)));
        left.appendChild(line);
        left.appendChild(el('h2', 'bkc-wn-title', entry.title));
        if (entry.summary) left.appendChild(el('p', 'bkc-wn-sum', entry.summary));
        head.appendChild(left);

        var actions = el('div', 'bkc-wn-actions');
        var all = el('button', 'bkc-btn bkc-btn-ghost', 'Xem tất cả cập nhật');
        all.type = 'button';
        all.addEventListener('click', function (e) { e.stopPropagation(); openPanel(); });
        actions.appendChild(all);
        actions.appendChild(changelogMdLink());
        head.appendChild(actions);
        host.appendChild(head);

        var body = el('div', 'bkc-wn-body');
        body.appendChild(sectionBlock(entry));
        host.appendChild(body);
    }

    function entryCard(entry) {
        var card = el('article', 'bkc-cl-card');
        var line = el('div', 'bkc-sheet-line');
        line.appendChild(el('span', 'bkc-tag bkc-tag-update', 'v' + entry.version));
        line.appendChild(el('span', 'bkc-tag', CAT_LABEL[entry.category] || 'Khác'));
        if (entry.published_at) line.appendChild(el('span', 'bkc-tag', fmtDate(entry.published_at)));
        card.appendChild(line);
        card.appendChild(el('h3', 'bkc-cl-title', entry.title));
        if (entry.summary) card.appendChild(el('p', 'bkc-wn-sum', entry.summary));
        card.appendChild(sectionBlock(entry));
        return card;
    }

    function openChangelogHistory() {
        var wrap = el('div', 'bkc-modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        var sheet = el('div', 'bkc-sheet bkc-sheet-wide');
        var head = el('div', 'bkc-sheet-head');
        var titles = el('div', 'bkc-sheet-titles');
        titles.appendChild(el('h2', 'bkc-sheet-title', 'Lịch sử cập nhật Bá Khí'));
        head.appendChild(titles);
        var x = el('button', 'bkc-x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Đóng lịch sử cập nhật');
        head.appendChild(x);
        sheet.appendChild(head);

        var body = el('div', 'bkc-sheet-body');
        if (!S.changelog.length) {
            body.appendChild(el('p', 'bkc-muted', 'Chưa có bản cập nhật nào được xuất bản.'));
        } else {
            S.changelog.forEach(function (entry) { body.appendChild(entryCard(entry)); });
        }
        sheet.appendChild(body);
        var foot = el('div', 'bkc-sheet-foot');
        foot.appendChild(changelogMdLink('Xem CHANGELOG.md đầy đủ'));
        sheet.appendChild(foot);
        wrap.appendChild(sheet);
        var close = function () {
            wrap.remove();
            D.documentElement.classList.remove('bkc-lock');
            D.removeEventListener('keydown', onKey);
        };
        var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        x.addEventListener('click', close);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
        (D.body || D.documentElement).appendChild(wrap);
        D.documentElement.classList.add('bkc-lock');
        D.addEventListener('keydown', onKey);
        x.focus();
    }

    /* ---------------------------------------------------------------------
       Đồng bộ tiến trình học tập
       ------------------------------------------------------------------ */
    function snapshot() {
        if (!global.BK || !BK.store) return null;
        var s = BK.store.get();
        var prefs = {};
        Object.keys(s.prefs || {}).forEach(function (k) {
            if (k !== 'cloud') prefs[k] = s.prefs[k];
        });
        return {
            practice: s.practice, review: s.review, notes: s.notes,
            bookmarks: s.bookmarks, history: s.history,
            achievements: s.achievements, prefs: prefs
        };
    }

    function scheduleSync() {
        if (!S.bound || S.applyingRemote) return;
        clearTimeout(S.syncTimer);
        setSyncState('pending', 'Đang lưu…');
        S.syncTimer = setTimeout(function () { doSync(false); }, CFG.syncDebounceMs || 2500);
    }

    function doSync(isRetry) {
        if (!S.bound || S.syncing) return Promise.resolve();
        var payload = snapshot();
        if (!payload) return Promise.resolve();
        S.syncing = true;
        return api(CFG.functions.syncProgress, {
            payload: payload,
            updated_at: new Date().toISOString()
        }).then(function (data) {
            S.syncing = false;
            S.syncError = null;
            S.lastSyncAt = now();
            setSyncState('ok', 'Đã đồng bộ');
            if (data && data.progress) {
                S.applyingRemote = true;
                try { if (global.BK && BK.cloud && BK.cloud.merge) BK.cloud.merge(data.progress); } catch (e) { }
                S.applyingRemote = false;
            }
            emit('synced', data);
            return data;
        }).catch(function (err) {
            S.syncing = false;
            S.syncError = err;
            setSyncState('error', 'Chưa đồng bộ được');
            if (!isRetry) scheduleRetry(1);
            return null;
        });
    }

    function scheduleRetry(attempt) {
        clearTimeout(S.retrying);
        var delay = Math.min(120000, 5000 * Math.pow(3, Math.max(0, attempt - 1)));
        S.retrying = setTimeout(function () {
            doSync(true).then(function (res) {
                if (!res && attempt < 5) scheduleRetry(attempt + 1);
                if (res) setSyncState('ok', 'Đã đồng bộ');
            });
        }, delay);
    }

    /* ---------------------------------------------------------------------
       Khởi động
       ------------------------------------------------------------------ */
    function injectCss() {
        if (D.querySelector('link[data-bk-cloud]')) return;
        var link = D.createElement('link');
        link.rel = 'stylesheet';
        link.href = basePath() + 'assets/bakhi/bk-cloud.css?v=3.1.3.1';
        link.setAttribute('data-bk-cloud', '1');
        (D.head || D.documentElement).appendChild(link);
    }

    function subscribeRealtime() {
        if (!S.ready || S.channel) return;
        try {
            S.channel = client().channel('bakhi-public')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, function () {
                    /* force = true: bỏ qua cache 5 giây, nếu không thông báo mới sẽ
                       không hiện ngay khi vừa mở panel hoặc vừa poll xong. */
                    loadAnnouncements(true);
                    toast('Có thông báo mới', 'info');
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'changelog' }, function () {
                    loadChangelog();
                })
                .subscribe();
        } catch (e) { console.warn('[BKCloud] realtime', e); }

        clearInterval(S.pollTimer);
        S.pollTimer = setInterval(function () {
            if (D.hidden) return;
            loadAnnouncements();
        }, CFG.pollMs || 60000);
    }

    /* Khi header không đủ chỗ, ẩn bớt nút phụ để không bị tràn (thay bằng
       mục tương ứng trong menu 3 gạch). */
    function fitHeader() {
        var header = D.querySelector('header');
        if (!header) return;
        var inner = header.firstElementChild || header;
        D.documentElement.classList.remove('bk-hdr-tight');
        var overflow = inner.scrollWidth - inner.clientWidth > 1;
        if (!overflow) {
            /* Thử lại khi cửa sổ hẹp: nếu vẫn tràn thì bật chế độ gọn. */
            overflow = header.scrollWidth - header.clientWidth > 1;
        }
        if (overflow) D.documentElement.classList.add('bk-hdr-tight');
    }

    function scheduleFitHeader() {
        clearTimeout(S.fitTimer);
        S.fitTimer = setTimeout(fitHeader, 120);
    }

    function mountHeaderFit() {
        fitHeader();
        global.addEventListener('resize', scheduleFitHeader);
        global.addEventListener('orientationchange', scheduleFitHeader);
        if (global.ResizeObserver) {
            try { new global.ResizeObserver(scheduleFitHeader).observe(D.querySelector('header')); } catch (e) { }
        }
    }

    function mountSyncIndicator() {
        if (D.getElementById('bkcSyncState')) return;
        var node = el('span', 'bkc-sync-state', '');
        node.id = 'bkcSyncState';
        node.hidden = true;
        var anchor = D.getElementById('bkcBell');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
    }

    function unlockBoot() {
        try { D.documentElement.classList.remove('bk-boot-lock'); } catch (e) { }
        var splash = D.getElementById('bkBootSplash');
        if (splash) splash.parentNode && splash.parentNode.removeChild(splash);
    }

    function boot() {
        injectCss();
        /* Trang Administrator Dashboard không cần nhận diện học sinh. */
        if (global.BK_ADMIN_ONLY) { unlockBoot(); return; }
        if (typeof CFG.configured === 'function' && !CFG.configured()) {
            configWarning();
            unlockBoot();
            return;
        }
        buildBell();
        mountSyncIndicator();
        mountHeaderFit();
        ensureReady().then(function () {
            setSyncState('pending', 'Đang kết nối…');
            return api(CFG.functions.bindSession, {});
        }).then(function (data) {
            if (data && data.bound) {
                applyBinding(data);
                setSyncState('ok', 'Đã đồng bộ');
            } else {
                setIdentity(null);
                openGate();
                setSyncState('idle', 'Chưa chọn học sinh');
            }
            unlockBoot();
            subscribeRealtime();
            if (!S.publicLoaded) {
                loadAnnouncements(true);
                loadChangelog();
            }
            if (global.BK && BK.store && BK.store.on) {
                BK.store.on('save', scheduleSync);
            }
            global.addEventListener('online', function () {
                if (S.bound) doSync(true);
                loadAnnouncements(true);
            });
            emit('ready', { bound: S.bound });
        }).catch(function (err) {
            S.fatal = err;
            setSyncState('error', 'Mất kết nối');
            fatalNotice(err.message || OFFLINE_MSG);
            buildFatalGate(err);
            unlockBoot();
        });
    }

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
    else boot();

    /* ---------------------------------------------------------------------
       API công khai
       ------------------------------------------------------------------ */
    global.BKCloud = {
        configured: function () { return !!(typeof CFG.configured === 'function' && CFG.configured()); },
        ready: ensureReady,
        state: function () {
            return {
                ready: S.ready, bound: S.bound, student: S.student,
                lastSyncAt: S.lastSyncAt, syncError: S.syncError ? S.syncError.message : null,
                announcements: S.announcements.length, changelog: S.changelog.length
            };
        },
        identity: function () { return S.student; },
        changeStudent: changeStudent,
        syncNow: function () { return doSync(true); },
        openNotifications: openPanel,
        openChangelogHistory: openChangelogHistory,
        refresh: function () { return Promise.all([loadAnnouncements(), loadChangelog()]); },
        on: function (fn) { S.listeners.push(fn); return function () { S.listeners = S.listeners.filter(function (f) { return f !== fn; }); }; },

        /* Dùng cho Dev Dashboard (bk-devboard.js). */
        adminLogin: function (code) {
            return api(CFG.functions.adminAuth, { code: code }).then(function (data) {
                try {
                    global.sessionStorage.setItem(ADMIN_KEY, JSON.stringify({
                        token: data.token, expiresAt: data.expiresAt
                    }));
                } catch (e) { }
                return data;
            });
        },
        adminToken: function () {
            var saved = null;
            try { saved = JSON.parse(global.sessionStorage.getItem(ADMIN_KEY) || 'null'); } catch (e) { }
            if (!saved || !saved.token) return null;
            if (new Date(saved.expiresAt).getTime() < now()) {
                try { global.sessionStorage.removeItem(ADMIN_KEY); } catch (e) { }
                return null;
            }
            return saved.token;
        },
        adminLogout: function () {
            try { global.sessionStorage.removeItem(ADMIN_KEY); } catch (e) { }
        },
        adminAction: function (action, payload) {
            var token = global.BKCloud.adminToken();
            if (!token) return Promise.reject(new Error('Phiên quản trị đã hết hạn. Vui lòng nhập lại Dev Code.'));
            return api(CFG.functions.adminActions, Object.assign({ action: action }, payload || {}), {
                'x-admin-token': token
            });
        },
        importStudents: function (text) {
            var token = global.BKCloud.adminToken();
            if (!token) return Promise.reject(new Error('Phiên quản trị đã hết hạn.'));
            return api(CFG.functions.importStudents, { text: text }, { 'x-admin-token': token });
        }
    };
})(typeof window !== 'undefined' ? window : this);
