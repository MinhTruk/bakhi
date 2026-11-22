/* =========================================================================
   Bá Khí — bk-founder-ai.js (8.5.4)
   Tab "AI Tutor" trong Founder Dashboard, chia 5 tab:
     1. Tổng quan   — trạng thái, model chính, số fallback, lượt gọi
     2. AI Models   — danh sách model có thứ tự, thêm/sửa/xoá/đổi thứ tự/kiểm tra
     3. System Prompt — soạn, lưu, hoàn tác, reset mặc định, khôi phục phiên bản
     4. Cấu hình    — token vào/ra, ngữ cảnh, timeout, số lần thử lại, streaming
     5. Logs        — lượt gọi, model đã dùng, thời gian, lỗi, lịch sử fallback

   Nguyên tắc:
   - KHÔNG hiển thị, không đọc, không ghi API key vào localStorage. Khoá được
     gửi thẳng tới Edge Function và chỉ trả về cờ "đã có khoá". Khoá cũng có thể
     nằm trong Supabase Secrets (AI_TUTOR_API_KEY, AI_TUTOR_FALLBACK_API_KEY,
     AI_TUTOR_KEY_3…).
   - Mọi thao tác qua `ai-tutor-api` (action admin.*); máy chủ kiểm tra scope
     Founder. Giao diện chỉ ẩn nút, không phải lớp bảo vệ.
   - Không cho nhập JSON thô: chỉ ô chọn, ô số, ô văn bản có nhãn.

   Công khai: window.BKFounderAI.render(host)
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKFounderAI) return;

    var TABS = [
        { id: 'overview', label: 'Tổng quan', icon: 'fa-gauge-high' },
        { id: 'models', label: 'AI Models', icon: 'fa-layer-group' },
        { id: 'prompt', label: 'System Prompt', icon: 'fa-scroll' },
        { id: 'config', label: 'Cấu hình', icon: 'fa-sliders' },
        { id: 'logs', label: 'Logs', icon: 'fa-list-check' }
    ];
    var RANGES = [
        { id: 'day', label: 'Hôm nay' },
        { id: 'week', label: '7 ngày' },
        { id: 'month', label: '30 ngày' }
    ];
    /* Chỉ dùng khi máy chủ chưa trả danh mục (bản Edge Function cũ hơn 8.5.4). */
    var PROVIDERS = [
        { id: 'groq', label: 'Groq' },
        { id: 'google', label: 'Google AI Studio (Gemini)' },
        { id: 'openai', label: 'OpenAI' },
        { id: 'cerebras', label: 'Cerebras' },
        { id: 'openrouter', label: 'OpenRouter' },
        { id: 'mistral', label: 'Mistral' },
        { id: 'deepseek', label: 'DeepSeek' },
        { id: 'custom', label: 'Tự cấu hình (OpenAI-compatible)' }
    ];
    var MODES = [
        { id: 'explain', label: 'Giải thích' }, { id: 'steps', label: 'Từng bước' },
        { id: 'hint', label: 'Gợi ý' }, { id: 'check', label: 'Kiểm tra bài làm' },
        { id: 'practice', label: 'Luyện tập' }, { id: 'mistakes', label: 'Phân tích lỗi' },
        { id: 'summary', label: 'Tóm tắt' }, { id: 'socratic', label: 'Hỏi dẫn dắt' }
    ];

    var S = {
        host: null, tab: 'overview', data: null, loading: false, error: '',
        notice: '', noticeKind: 'ok',
        routes: [], routesDirty: false, routesBusy: false, saving: false,
        verifying: {}, verified: {},
        prompt: '', savedPrompt: '', promptNote: '', promptDirty: false,
        promptBusy: false, versions: [], versionsBusy: false,
        defaultPrompt: '', guide: [], maxRoutes: 10,
        keySlots: [], modelSuggestions: {},
        testBusy: false, testResult: null,
        logs: null, logsBusy: false, logsRange: 'week'
    };

    /* ------------------------------------------------------------------ DOM */
    function el(tag, cls, text) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = String(text);
        return n;
    }
    function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
    function on(n, t, fn) { if (n) n.addEventListener(t, fn); }
    function icon(name) {
        var i = D.createElement('i');
        i.className = 'fa-solid ' + name;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function button(label, cls, iconName) {
        var b = el('button', 'bk-btn ' + (cls || ''));
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        if (label) b.appendChild(el('span', null, label));
        return b;
    }
    function iconBtn(name, label) {
        var b = button('', 'bk-btn-ghost bk-btn-icon', name);
        b.setAttribute('aria-label', label);
        b.title = label;
        return b;
    }
    function toast(msg, kind) {
        try { if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast(msg, kind || 'info'); } catch (e) { }
    }
    function confirmDialog(message, okLabel) {
        try {
            if (global.BK && global.BK.ui && global.BK.ui.confirm) {
                return global.BK.ui.confirm({ title: 'Xác nhận', message: message, confirmText: okLabel || 'Đồng ý' });
            }
        } catch (e) { }
        try { return Promise.resolve(global.confirm ? global.confirm(message) : true); }
        catch (e) { return Promise.resolve(false); }
    }
    function card(title, sub) {
        var c = el('section', 'bkc-card bkai-admin-card');
        if (title) {
            var h = el('div', 'bkc-card-head');
            h.appendChild(el('h3', null, title));
            if (sub) h.appendChild(el('p', 'bkc-card-sub', sub));
            c.appendChild(h);
        }
        var body = el('div', 'bkc-card-body');
        c.appendChild(body);
        c._body = body;
        return c;
    }
    function field(label, control, hint) {
        var f = el('label', 'bkc-field');
        f.appendChild(el('span', 'bkc-field-label', label));
        f.appendChild(control);
        if (hint) f.appendChild(el('span', 'bkc-field-hint', hint));
        return f;
    }
    function textInput(value, placeholder) {
        var i = D.createElement('input');
        i.type = 'text';
        i.className = 'bkc-input';
        i.value = value == null ? '' : String(value);
        if (placeholder) i.placeholder = placeholder;
        return i;
    }
    function numberInput(value, min, max, step) {
        var i = D.createElement('input');
        i.type = 'number';
        i.className = 'bkc-input';
        i.value = value == null ? '' : String(value);
        if (min != null) i.min = String(min);
        if (max != null) i.max = String(max);
        if (step) i.step = String(step);
        return i;
    }
    function selectInput(options, value) {
        var s = D.createElement('select');
        s.className = 'bkc-input';
        (options || []).forEach(function (o) {
            var op = D.createElement('option');
            op.value = String(o.id);
            op.textContent = String(o.label);
            s.appendChild(op);
        });
        if (value != null) s.value = String(value);
        return s;
    }
    function checkbox(label, checked, disabled) {
        var wrap = el('label', 'bkc-check bkai-admin-check');
        var box = D.createElement('input');
        box.type = 'checkbox';
        box.checked = !!checked;
        box.disabled = !!disabled;
        wrap.appendChild(box);
        wrap.appendChild(el('span', null, label));
        wrap._box = box;
        return wrap;
    }
    function pill(text, kind) {
        return el('span', 'bkai-pill' + (kind ? ' is-' + kind : ''), text);
    }
    function hint(text, cls) { return el('p', cls || 'bkc-hint', text); }
    function pre(text) {
        var p = el('pre', 'bkai-pre');
        p.textContent = String(text == null ? '' : text);
        return p;
    }
    function fmt(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        function p(n) { return String(n).padStart(2, '0'); }
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function fmtNum(n) {
        var v = Number(n);
        if (!isFinite(v)) return '—';
        return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    /* --------------------------------------------------------------- server */
    function call(action, payload) {
        var cfg = global.BK_SUPABASE;
        var token = global.BKCloud && global.BKCloud.adminToken ? global.BKCloud.adminToken() : null;
        if (!cfg || !cfg.url) return Promise.reject(new Error('Chưa cấu hình Supabase.'));
        if (!token) {
            return Promise.reject(new Error(
                'Phiên quản trị đã hết hạn. Vui lòng nhập lại mã quản trị.'));
        }
        var url = String(cfg.url).replace(/\/+$/, '') + '/functions/v1/' +
            ((cfg.functions && cfg.functions.aiTutor) || 'ai-tutor-api');
        return global.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: cfg.key,
                'x-admin-token': token
            },
            body: JSON.stringify(Object.assign({ action: action }, payload || {}))
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (data) {
                if (!res.ok || (data && data.ok === false)) {
                    var err = new Error((data && data.error && data.error.message) || ('Lỗi máy chủ (' + res.status + ')'));
                    err.code = (data && data.error && data.error.code) || 'HTTP_' + res.status;
                    err.status = res.status;
                    throw err;
                }
                return data.data || data;
            });
        });
    }

    /* Sửa lỗi 8.5.3 "load is not a function": khung chờ đặt tên `spinnerBox`,
       không dùng `var load` nữa — biến đó che (shadow) hàm load() trong cùng
       phạm vi hàm paint(), khiến mọi callback lưu cấu hình gọi một <div>. */
    function load() {
        S.loading = true;
        S.error = '';
        paint();
        return call('admin.status').then(function (data) {
            S.data = data;
            S.loading = false;
            S.defaultPrompt = String(data.defaultPrompt || '');
            S.guide = Array.isArray(data.guide) ? data.guide : [];
            S.maxRoutes = Number(data.maxRoutes) || 10;
            S.keySlots = Array.isArray(data.keySlots) ? data.keySlots : [];
            S.modelSuggestions = data.modelSuggestions || {};
            S.routes = normalizeRoutes(data.routes);
            S.routesDirty = false;
            if (!S.promptDirty) {
                S.prompt = String((data.settings && data.settings.systemPrompt) || '');
                S.savedPrompt = S.prompt;
            }
            paint();
            loadVersions();
            if (data.isFounder) loadLogs();
        }).catch(function (err) {
            S.loading = false;
            S.error = (err && err.message) || 'Không tải được trạng thái Trợ lý AI.';
            paint();
        });
    }

    function normalizeRoutes(list) {
        return (Array.isArray(list) ? list : []).map(function (r, i) {
            return {
                id: String(r.id || ''),
                label: String(r.label || ''),
                provider: String(r.provider || 'groq'),
                model: String(r.model || ''),
                enabled: r.enabled !== false,
                hasKey: !!r.hasKey,
                keyRef: String(r.keyRef || ''),
                lastStatus: String(r.lastStatus || ''),
                lastErrorCode: String(r.lastErrorCode || ''),
                lastLatencyMs: Number(r.lastLatencyMs) || 0,
                lastCheckedAt: r.lastCheckedAt || null,
                position: i
            };
        });
    }

    function loadVersions() {
        S.versionsBusy = true;
        return call('admin.prompt.versions').then(function (data) {
            S.versionsBusy = false;
            S.versions = Array.isArray(data.versions) ? data.versions : [];
            paint();
        }).catch(function () {
            S.versionsBusy = false;
            S.versions = [];
            paint();
        });
    }

    function loadLogs() {
        S.logsBusy = true;
        paint();
        return call('admin.logs', { range: S.logsRange }).then(function (data) {
            S.logsBusy = false;
            S.logs = data || {};
            paint();
        }).catch(function (err) {
            S.logsBusy = false;
            S.logs = { error: (err && err.message) || 'Không đọc được nhật ký.' };
            paint();
        });
    }

    /* ---------------------------------------------------------------- render */
    function render(host) {
        if (!host) return;
        S.host = host;
        host.classList.add('bkai-admin');
        paint();
        load();
    }

    function setTab(id) {
        if (S.tab === id) return;
        S.tab = id;
        paint();
        if (id === 'logs' && !S.logs) loadLogs();
    }

    function paint() {
        if (!S.host) return;
        clear(S.host);
        S.host.appendChild(tabBar());

        if (S.loading && !S.data) {
            var spinnerBox = el('div', 'bkc-empty');
            spinnerBox.appendChild(icon('fa-spinner'));
            spinnerBox.appendChild(el('p', null, 'Đang tải trạng thái Trợ lý AI…'));
            S.host.appendChild(spinnerBox);
            return;
        }
        if (S.error && !S.data) {
            var errBox = el('div', 'bkc-empty');
            errBox.appendChild(icon('fa-triangle-exclamation'));
            errBox.appendChild(el('p', null, S.error));
            var retry = button('Thử lại', 'bk-btn-ghost', 'fa-rotate-right');
            on(retry, 'click', load);
            errBox.appendChild(retry);
            S.host.appendChild(errBox);
            return;
        }

        var data = S.data || {};
        if (!data.isFounder) {
            var ro = el('div', 'bkc-alert is-warn');
            ro.appendChild(el('p', null,
                'Bạn đang đăng nhập với quyền Administrator: chỉ xem được trạng thái. ' +
                'Chỉ Founder được thay đổi cấu hình Trợ lý AI — máy chủ chặn mọi thao tác ghi.'));
            S.host.appendChild(ro);
        }
        if (S.notice) {
            var note = el('div', 'bkc-alert' + (S.noticeKind === 'error' ? ' is-warn' : ''));
            note.appendChild(el('p', null, S.notice));
            S.host.appendChild(note);
        }

        if (S.tab === 'overview') paintOverview();
        else if (S.tab === 'models') paintModels();
        else if (S.tab === 'prompt') paintPrompt();
        else if (S.tab === 'config') paintConfig();
        else paintLogs();
    }

    function tabBar() {
        var bar = el('div', 'bkai-admin-tabs');
        bar.setAttribute('role', 'tablist');
        TABS.forEach(function (t) {
            var b = button(t.label, 'bkai-admin-tab' + (S.tab === t.id ? ' is-active' : ''), t.icon);
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', S.tab === t.id ? 'true' : 'false');
            on(b, 'click', function () { setTab(t.id); });
            bar.appendChild(b);
        });
        return bar;
    }

    /* ------------------------------------------------------------- Tổng quan */
    function paintOverview() {
        var data = S.data || {};
        var settings = data.settings || {};
        var connection = data.connection || {};
        var usage = data.usage || {};
        var totals = data.totals || {};
        var routes = S.routes;
        var primary = routes[0] || null;
        var fallbacks = routes.slice(1).filter(function (r) { return r.enabled; });
        var usable = routes.filter(function (r) { return r.enabled && r.hasKey; });

        var overview = card('Tổng quan AI Tutor', 'Trạng thái dịch vụ, model đang dùng và mức sử dụng 24 giờ');
        var stats = el('div', 'bkc-stats');
        function stat(k, v, hintText, kind) {
            var box = el('div', 'bkc-stat' + (kind ? ' is-' + kind : ''));
            box.appendChild(el('div', 'bkc-stat-k', k));
            box.appendChild(el('div', 'bkc-stat-v', String(v)));
            if (hintText) box.appendChild(el('div', 'bkc-stat-hint', hintText));
            return box;
        }
        stats.appendChild(stat('Trạng thái', settings.enabled ? 'Đang bật' : 'Đang tắt',
            settings.enabled ? 'Học sinh mở được Trợ lý AI' : 'Học sinh thấy thông báo tạm tắt',
            settings.enabled ? 'ok' : 'warn'));
        stats.appendChild(stat('Primary Model',
            primary ? providerLabel(primary.provider) : 'Chưa cấu hình',
            primary ? (primary.model || '—') : 'Thêm ít nhất một model'));
        stats.appendChild(stat('Số fallback', fallbacks.length,
            fallbacks.length ? 'Tự chuyển khi Primary lỗi' : 'Chỉ có Primary'));
        stats.appendChild(stat('Model sẵn sàng', usable.length + '/' + routes.length,
            usable.length ? 'Đã có khoá và đang bật' : 'Chưa model nào có khoá',
            usable.length ? 'ok' : 'warn'));
        stats.appendChild(stat('Request (24h)', fmtNum(usage.requests)));
        stats.appendChild(stat('Lỗi (24h)', fmtNum(usage.failures), null, usage.failures ? 'warn' : ''));
        stats.appendChild(stat('Học sinh dùng (24h)', fmtNum(usage.students)));
        stats.appendChild(stat('Token (24h)', fmtNum(usage.tokens)));
        stats.appendChild(stat('Hội thoại', fmtNum(totals.conversations)));
        stats.appendChild(stat('Tin nhắn', fmtNum(totals.messages)));
        overview._body.appendChild(stats);

        var row = el('div', 'bkc-row');
        var testBtn = button(S.testBusy ? 'Đang kiểm tra…' : 'Kiểm tra toàn chuỗi model',
            'bk-btn-primary', 'fa-plug-circle-check');
        testBtn.disabled = S.testBusy || !data.isFounder;
        on(testBtn, 'click', runTest);
        row.appendChild(testBtn);
        if (connection.mock) row.appendChild(pill('AI_TUTOR_MOCK đang bật — câu trả lời giả lập', 'warn'));
        overview._body.appendChild(row);

        if (S.testResult) {
            var box = el('div', 'bkai-admin-testresult' + (S.testResult.ok ? ' is-ok' : ' is-bad'));
            box.appendChild(el('p', null, S.testResult.text));
            overview._body.appendChild(box);
        }

        var chainTitle = el('h4', 'bkai-admin-sub', 'Chuỗi model hiện tại');
        overview._body.appendChild(chainTitle);
        if (!routes.length) {
            overview._body.appendChild(hint(
                'Chưa có dòng model nào. Máy chủ đang dùng cấu hình cũ trong ai_settings — hãy sang tab AI Models để thêm.'));
        }
        routes.forEach(function (r, i) {
            var line = el('div', 'bkai-admin-version');
            line.appendChild(el('span', 'bkai-admin-version-n',
                (i === 0 ? 'Primary' : 'Fallback ' + i) + ' · ' + providerLabel(r.provider)));
            line.appendChild(el('span', 'bkai-admin-version-note', r.model || '—'));
            line.appendChild(pill(r.hasKey ? 'Có khoá' : 'Chưa có khoá', r.hasKey ? 'ok' : 'warn'));
            overview._body.appendChild(line);
        });

        var keyInfo = el('p', 'bkc-hint');
        keyInfo.textContent = 'API key KHÔNG hiển thị ở đây, không lưu trong database và không lưu ' +
            'trong trình duyệt. Khoá nằm trong Supabase → Edge Functions → Secrets ' +
            '(AI_TUTOR_API_KEY, AI_TUTOR_FALLBACK_API_KEY, AI_TUTOR_KEY_3…); Dashboard chỉ chọn tên secret.';
        overview._body.appendChild(keyInfo);
        S.host.appendChild(overview);

        if (data.isFounder && Array.isArray(data.recentErrors) && data.recentErrors.length) {
            var errCard = card('Lỗi nhà cung cấp gần đây',
                '20 lần gần nhất. Chi tiết đã lọc bỏ khoá và không bao giờ trả cho học sinh.');
            data.recentErrors.forEach(function (e) {
                var r = el('div', 'bkai-admin-version');
                r.appendChild(el('span', 'bkai-admin-version-n', String(e.provider || '—')));
                r.appendChild(el('span', 'bkai-admin-version-note',
                    String(e.model || '—') + ' · ' + String(e.role || 'primary') +
                    ' · HTTP ' + String(e.status || 0) + (e.detail ? ' · ' + String(e.detail) : '')));
                r.appendChild(el('span', 'bkai-admin-version-when', fmt(e.created_at)));
                errCard._body.appendChild(r);
            });
            S.host.appendChild(errCard);
        }
    }

    function runTest() {
        if (S.testBusy) return;
        S.testBusy = true;
        S.testResult = null;
        S.notice = '';
        paint();
        call('admin.test').then(function (data) {
            S.testBusy = false;
            S.testResult = {
                ok: true,
                text: 'Kết nối thành công: ' + providerLabel(data.provider) + ' · ' + data.model +
                    ' · ' + data.latencyMs + 'ms' + (data.fellBack ? ' (qua dự phòng)' : '') +
                    (data.mock ? ' — LƯU Ý: đây là câu trả lời giả lập.' : '')
            };
            paint();
            toast('Kết nối AI thành công.', 'success');
        }).catch(function (err) {
            S.testBusy = false;
            S.testResult = {
                ok: false,
                text: 'Kiểm tra thất bại: ' + ((err && err.message) || 'không rõ lý do')
            };
            paint();
            toast('Kiểm tra kết nối thất bại.', 'error');
        });
    }

    /* ------------------------------------------------------------- AI Models */
    function routeStatus(r) {
        if (!r.enabled) return { text: 'Đang tắt', kind: '' };
        if (r.lastStatus === 'error') return { text: 'Lỗi' + (r.lastErrorCode ? ' · ' + r.lastErrorCode : ''), kind: 'warn' };
        if (r.lastStatus === 'model_missing') return { text: 'Model không có trong danh sách', kind: 'warn' };
        if (!r.hasKey) return { text: 'Chưa có khoá trong Secrets', kind: 'warn' };
        if (r.lastStatus === 'ok') return { text: 'Đã kiểm tra · OK', kind: 'ok' };
        return { text: 'Đã cấu hình', kind: 'ok' };
    }

    function paintModels() {
        var data = S.data || {};
        var editable = !!data.isFounder;

        var guideCard = card('Thêm một AI Model — các bước cần làm',
            'Làm đúng thứ tự dưới đây; mỗi bước đều có nút tương ứng ngay trong tab này.');
        var steps = el('ol', 'bkai-admin-steps');
        (S.guide.length ? S.guide : [
            'Bấm “+ Thêm AI Model”.',
            'Chọn nhà cung cấp và nhập đúng tên model.',
            'Chọn secret chứa khoá API rồi bấm “Kiểm tra”.',
            'Đổi thứ tự ưu tiên nếu cần.',
            'Bấm “Lưu danh sách model”.'
        ]).forEach(function (t) { steps.appendChild(el('li', null, t)); });
        guideCard._body.appendChild(steps);
        guideCard._body.appendChild(hint(
            'Dòng đầu tiên luôn là Primary. Các dòng sau tự đánh số Fallback 1, 2, 3… ' +
            'Khi một model lỗi tạm thời (429, timeout, 5xx), máy chủ tự chuyển sang model kế tiếp — ' +
            'học sinh không phải làm gì.'));
        S.host.appendChild(guideCard);

        var listCard = card('Danh sách model theo thứ tự ưu tiên',
            'Tối đa ' + (S.maxRoutes || 10) + ' model. Mỗi dòng chỉ trỏ tới một secret; khoá API không nằm trong database.');
        var list = el('div', 'bkai-model-list');
        if (!S.routes.length) {
            list.appendChild(hint('Chưa có model nào. Bấm “+ Thêm AI Model” để bắt đầu.'));
        }
        S.routes.forEach(function (r, i) {
            list.appendChild(routeRow(r, i, editable));
        });
        listCard._body.appendChild(list);

        var actions = el('div', 'bkc-row bkai-model-actions');
        var add = button('+ Thêm AI Model', 'bk-btn-ghost', 'fa-plus');
        add.disabled = !editable || S.routes.length >= (S.maxRoutes || 10);
        on(add, 'click', function () {
            S.routes.push({
                id: '', label: '', provider: 'groq', model: '', enabled: true,
                hasKey: false, keyRef: '',
                lastStatus: '', lastErrorCode: '', lastLatencyMs: 0, lastCheckedAt: null
            });
            S.routesDirty = true;
            paint();
        });
        actions.appendChild(add);

        var save = button(S.saving ? 'Đang lưu…' : 'Lưu danh sách model', 'bk-btn-primary', 'fa-floppy-disk');
        save.disabled = !editable || S.saving || !S.routes.length;
        on(save, 'click', saveRoutes);
        actions.appendChild(save);

        var revert = button('Hoàn tác thay đổi', 'bk-btn-ghost', 'fa-rotate-left');
        revert.disabled = !editable || !S.routesDirty;
        on(revert, 'click', function () {
            S.routes = normalizeRoutes(S.data && S.data.routes);
            S.routesDirty = false;
            paint();
        });
        actions.appendChild(revert);
        actions.appendChild(pill(S.routesDirty ? 'Có thay đổi chưa lưu' : 'Đã đồng bộ với máy chủ',
            S.routesDirty ? 'warn' : 'ok'));
        listCard._body.appendChild(actions);
        S.host.appendChild(listCard);

        if (S.routesDirty) {
            var warn = el('div', 'bkc-alert is-warn');
            warn.appendChild(el('p', null,
                'Bạn có thay đổi chưa lưu. Học sinh vẫn đang dùng cấu hình cũ cho tới khi bấm “Lưu danh sách model”.'));
            S.host.appendChild(warn);
        }

        var slotCard = card('Khoá trong Supabase Secrets',
            'Cách thay thế khi không muốn lưu khoá trong database: đặt secret rồi chọn tên secret ở từng dòng.');
        var slots = Array.isArray(data.keySlots) ? data.keySlots : S.keySlots;
        if (!slots.length) {
            limitSlotsFallback(slotCard, data);
        } else {
            slots.forEach(function (s) {
                var row = el('div', 'bkai-admin-version');
                row.appendChild(el('span', 'bkai-admin-version-n', s.name));
                row.appendChild(pill(s.configured ? 'Đã đặt trong Secrets' : 'Chưa đặt', s.configured ? 'ok' : 'warn'));
                slotCard._body.appendChild(row);
            });
        }
        slotCard._body.appendChild(hint(
            'Tên secret phải viết hoa đúng như trên. Edge Function đọc khoá từ Deno.env, ' +
            'không bao giờ gửi giá trị khoá về trình duyệt.'));
        S.host.appendChild(slotCard);
    }

    function limitSlotsFallback(c, data) {
        var conn = data.connection || {};
        c._body.appendChild(hint('AI_TUTOR_API_KEY: ' + (conn.primaryKey ? 'đã có' : 'chưa có') +
            ' · AI_TUTOR_FALLBACK_API_KEY: ' + (conn.fallbackKey ? 'đã có' : 'chưa có')));
    }

    function routeRow(r, index, editable) {
        var wrap = el('div', 'bkai-model-row' + (r.enabled ? '' : ' is-off'));
        var head = el('div', 'bkai-model-head');
        head.appendChild(el('span', 'bkai-model-pos', index === 0 ? 'Primary' : 'Fallback ' + index));
        head.appendChild(el('span', 'bkai-model-name', r.label || r.model || 'Model mới'));
        var st = routeStatus(r);
        head.appendChild(pill(st.text, st.kind));
        var tools = el('div', 'bkai-model-tools');

        var up = iconBtn('fa-arrow-up', 'Đưa lên trước');
        up.disabled = !editable || index === 0;
        on(up, 'click', function () {
            var tmp = S.routes[index - 1];
            S.routes[index - 1] = S.routes[index];
            S.routes[index] = tmp;
            S.routesDirty = true;
            paint();
        });
        tools.appendChild(up);

        var down = iconBtn('fa-arrow-down', 'Đưa xuống sau');
        down.disabled = !editable || index === S.routes.length - 1;
        on(down, 'click', function () {
            var tmp = S.routes[index + 1];
            S.routes[index + 1] = S.routes[index];
            S.routes[index] = tmp;
            S.routesDirty = true;
            paint();
        });
        tools.appendChild(down);

        var del = iconBtn('fa-trash-can', 'Xoá model này');
        del.disabled = !editable;
        on(del, 'click', function () {
            var isPrimary = index === 0;
            confirmDialog(
                'Xoá ' + (isPrimary ? 'Primary Model' : 'Fallback ' + index) + ' (' +
                (r.label || r.model || 'chưa đặt tên') + ')? Các model còn lại sẽ được đánh số lại. ' +
                'Thay đổi chỉ có hiệu lực sau khi bấm “Lưu danh sách model”.', 'Xoá')
                .then(function (yes) {
                    if (!yes) return;
                    S.routes.splice(index, 1);
                    if (!S.routes.length) {
                        S.routes.push({
                            id: '', label: '', provider: 'groq', model: '', enabled: true,
                            hasKey: false, keyRef: '',
                            lastStatus: '', lastErrorCode: '', lastLatencyMs: 0, lastCheckedAt: null
                        });
                    }
                    S.routesDirty = true;
                    paint();
                });
        });
        tools.appendChild(del);
        head.appendChild(tools);
        wrap.appendChild(head);

        var grid = el('div', 'bkc-grid bkai-model-grid');

        var label = textInput(r.label, index === 0 ? 'Ví dụ: Groq chính' : 'Ví dụ: Dự phòng Gemini');
        label.disabled = !editable;
        on(label, 'input', function () { r.label = label.value; S.routesDirty = true; });
        grid.appendChild(field('Tên', label, 'Tên gợi nhớ — không ảnh hưởng tới model thật.'));

        var prov = selectInput(providerOptions(), r.provider);
        prov.disabled = !editable;
        on(prov, 'change', function () {
            r.provider = prov.value;
            S.routesDirty = true;
            paint();
        });
        grid.appendChild(field('Nhà cung cấp', prov));

        var listId = 'bkaiModelSuggest' + index;
        var dl = el('datalist');
        dl.id = listId;
        ((S.modelSuggestions || {})[r.provider] || []).forEach(function (m) {
            var op = D.createElement('option');
            op.value = m;
            dl.appendChild(op);
        });
        var model = textInput(r.model, 'ví dụ: openai/gpt-oss-20b');
        model.setAttribute('list', listId);
        model.disabled = !editable;
        on(model, 'input', function () { r.model = model.value.trim(); S.routesDirty = true; });
        grid.appendChild(field('Model', model, 'Phải đúng tên nhà cung cấp công bố.'));
        grid.appendChild(dl);

        var refOptions = [{
            id: '',
            label: index === 0
                ? 'Mặc định: AI_TUTOR_API_KEY'
                : 'Mặc định: AI_TUTOR_FALLBACK_API_KEY'
        }].concat(
            (S.keySlots || []).map(function (s) {
                return { id: s.name, label: s.name + (s.configured ? ' (đã đặt)' : ' (chưa đặt)') };
            }));
        var ref = selectInput(refOptions, r.keyRef);
        ref.disabled = !editable;
        on(ref, 'change', function () {
            r.keyRef = ref.value;
            var slot = (S.keySlots || []).filter(function (s) { return s.name === ref.value; })[0];
            r.hasKey = ref.value ? !!(slot && slot.configured) : r.hasKey;
            S.routesDirty = true;
        });
        grid.appendChild(field('API Key (Secret)', ref,
            'Khoá API không nhập ở đây. Đặt khoá trong Supabase → Edge Functions → Secrets ' +
            'rồi chọn đúng tên secret cho model này.'));

        var enabled = checkbox('Bật model này trong chuỗi', r.enabled);
        enabled._box.disabled = !editable;
        on(enabled._box, 'change', function () {
            r.enabled = enabled._box.checked;
            S.routesDirty = true;
        });
        grid.appendChild(field('Trạng thái', enabled));

        var verifyRow = el('div', 'bkai-model-verify');
        var verifyBtn = button(S.verifying[index] ? 'Đang kiểm tra…' : 'Kiểm tra kết nối',
            'bk-btn-ghost bk-btn-sm', 'fa-circle-check');
        verifyBtn.disabled = !editable || !!S.verifying[index];
        var out = el('span', 'bkc-hint');
        var done = S.verified[index];
        if (done) out.textContent = done.text;
        on(verifyBtn, 'click', function () { verifyRoute(r, index); });
        verifyRow.appendChild(verifyBtn);
        verifyRow.appendChild(out);
        if (r.lastCheckedAt) {
            verifyRow.appendChild(el('span', 'bkai-admin-version-when',
                'Lần cuối ' + fmt(r.lastCheckedAt) + (r.lastLatencyMs ? ' · ' + r.lastLatencyMs + 'ms' : '')));
        }
        grid.appendChild(verifyRow);
        wrap.appendChild(grid);
        return wrap;
    }

    function providerOptions() {
        var data = S.data || {};
        var list = Array.isArray(data.providerCatalog) ? data.providerCatalog : [];
        if (!list.length) return PROVIDERS;
        return list.map(function (p) { return { id: p.id, label: p.label || p.id }; });
    }
    function providerLabel(id) {
        var opts = providerOptions();
        for (var i = 0; i < opts.length; i++) if (opts[i].id === id) return opts[i].label;
        return id || '';
    }

    function verifyRoute(r, index) {
        if (S.verifying[index]) return;
        if (!r.model) { toast('Nhập tên model trước khi kiểm tra.', 'error'); return; }
        if (!r.hasKey) {
            toast('Chưa có khoá trong Supabase Secrets cho model này. Đặt secret trước rồi kiểm tra.', 'error');
            return;
        }
        S.verifying[index] = true;
        paint();
        call('admin.models.verify', {
            id: r.id || '',
            provider: r.provider,
            model: r.model,
            keyRef: r.keyRef || ''
        }).then(function (res) {
            S.verifying[index] = false;
            var text;
            if (res.listed && res.supported === false) {
                text = 'Model không có trong danh sách ' + res.modelCount + ' model của ' +
                    providerLabel(res.provider) + '. Kiểm tra lại tên model.';
                toast('Model không có trong danh sách nhà cung cấp.', 'error');
            } else if (res.listed) {
                text = 'OK · ' + res.modelCount + ' model · ' + res.latencyMs + 'ms';
                toast('Model hợp lệ.', 'success');
            } else {
                text = 'OK · gọi thử: ' + (res.reply || 'OK') + ' · ' + res.latencyMs + 'ms';
                toast('Gọi thử thành công.', 'success');
            }
            S.verified[index] = { ok: true, text: text };
            r.lastStatus = res.listed && res.supported === false ? 'model_missing' : 'ok';
            r.lastLatencyMs = res.latencyMs;
            r.lastCheckedAt = new Date().toISOString();
            paint();
        }).catch(function (err) {
            S.verifying[index] = false;
            S.verified[index] = { ok: false, text: (err && err.message) || 'Không kết nối được.' };
            r.lastStatus = 'error';
            r.lastErrorCode = (err && err.code) || '';
            paint();
            toast((err && err.message) || 'Kiểm tra thất bại.', 'error');
        });
    }

    function saveRoutes() {
        if (S.saving) return;
        var bad = -1;
        S.routes.forEach(function (r, i) {
            if (!r.model) bad = i;
        });
        if (bad >= 0) {
            toast('Dòng ' + (bad + 1) + ' chưa có tên model.', 'error');
            return;
        }
        S.saving = true;
        paint();
        call('admin.models.save', {
            routes: S.routes.map(function (r, i) {
                return {
                    id: r.id || undefined,
                    label: r.label || '',
                    provider: r.provider,
                    model: r.model,
                    keyRef: r.keyRef || '',
                    enabled: r.enabled !== false,
                    position: i
                };
            })
        }).then(function (data) {
            S.saving = false;
            S.routes = normalizeRoutes(data.routes);
            S.routesDirty = false;
            S.verified = {};
            S.notice = 'Đã lưu danh sách model AI.';
            S.noticeKind = 'ok';
            toast('Đã lưu danh sách model.', 'success');
            load();
        }).catch(function (err) {
            S.saving = false;
            S.notice = (err && err.message) || 'Không lưu được danh sách model.';
            S.noticeKind = 'error';
            paint();
            toast(S.notice, 'error');
        });
    }

    /* ----------------------------------------------------------- System Prompt */
    function paintPrompt() {
        var data = S.data || {};
        var editable = !!data.isFounder;
        var c = card('Hướng dẫn hệ thống (System Prompt)',
            'Quy tắc chung cho mọi câu trả lời. Học sinh không bao giờ ghi đè được phần này.');
        var head = el('div', 'bkai-prompt-head');
        head.appendChild(pill(S.promptDirty ? 'Chưa lưu' : 'Đã lưu', S.promptDirty ? 'warn' : 'ok'));
        head.appendChild(el('span', 'bkc-hint',
            String(S.prompt || '').length + ' ký tự · tối thiểu 40, tối đa 12.000'));
        c._body.appendChild(head);

        var area = el('textarea', 'bkc-textarea bkai-prompt-area');
        area.value = S.prompt;
        area.rows = 18;
        area.spellcheck = false;
        area.disabled = !editable;
        area.setAttribute('aria-label', 'Nội dung System Prompt');
        on(area, 'input', function () {
            S.prompt = area.value;
            var dirty = S.prompt !== S.savedPrompt;
            if (dirty !== S.promptDirty) {
                S.promptDirty = dirty;
                var badge = head.firstChild;
                if (badge) {
                    badge.textContent = dirty ? 'Chưa lưu' : 'Đã lưu';
                    badge.className = 'bkai-pill is-' + (dirty ? 'warn' : 'ok');
                }
            }
        });
        c._body.appendChild(area);

        var note = textInput(S.promptNote, 'Ghi chú cho phiên bản này (tuỳ chọn)');
        note.disabled = !editable;
        on(note, 'input', function () { S.promptNote = note.value; });
        c._body.appendChild(field('Ghi chú phiên bản', note));

        var row = el('div', 'bkc-row');
        var save = button(S.promptBusy ? 'Đang lưu…' : 'Lưu hướng dẫn', 'bk-btn-primary', 'fa-floppy-disk');
        save.disabled = !editable || S.promptBusy;
        on(save, 'click', savePrompt);
        row.appendChild(save);

        var revert = button('Hoàn tác về bản đã lưu', 'bk-btn-ghost', 'fa-rotate-left');
        revert.disabled = !editable || !S.promptDirty;
        on(revert, 'click', function () {
            S.prompt = S.savedPrompt;
            S.promptDirty = false;
            paint();
        });
        row.appendChild(revert);

        var reset = button('Reset về mặc định', 'bk-btn-ghost', 'fa-arrows-rotate');
        reset.disabled = !editable;
        on(reset, 'click', function () {
            confirmDialog(
                'Reset System Prompt về bản mặc định của Bá Khí? Phiên bản hiện tại vẫn được lưu ' +
                'trong danh sách phiên bản để khôi phục lại.', 'Reset')
                .then(function (yes) {
                    if (!yes) return;
                    S.promptBusy = true;
                    paint();
                    call('admin.prompt.reset').then(function (data) {
                        S.promptBusy = false;
                        S.prompt = String(data.content || '');
                        S.savedPrompt = S.prompt;
                        S.promptDirty = false;
                        S.notice = 'Đã reset System Prompt về mặc định (phiên bản ' + data.version + ').';
                        S.noticeKind = 'ok';
                        toast('Đã reset System Prompt.', 'success');
                        loadVersions();
                        paint();
                    }).catch(function (err) {
                        S.promptBusy = false;
                        S.notice = (err && err.message) || 'Không reset được System Prompt.';
                        S.noticeKind = 'error';
                        paint();
                        toast(S.notice, 'error');
                    });
                });
        });
        row.appendChild(reset);
        c._body.appendChild(row);

        if (S.promptDirty) {
            c._body.appendChild(hint(
                'Nội dung mới chưa được áp dụng. Bấm “Lưu hướng dẫn” — bạn vẫn giữ nguyên nội dung khi chuyển tab.',
                'bkc-hint is-warn'));
        }
        c._body.appendChild(hint(
            'Gợi ý: System Prompt nên nêu vai trò, trình độ học sinh, quy tắc không bịa kiến thức, ' +
            'cách trình bày công thức và yêu cầu trả lời bằng tiếng Việt khi học sinh dùng tiếng Việt. ' +
            'Phần “ngữ cảnh bài học” do máy chủ tự thêm, không cần chép vào đây.'));
        S.host.appendChild(c);

        var vc = card('Phiên bản trước', 'Khôi phục một phiên bản sẽ tạo phiên bản mới — không xoá lịch sử.');
        if (S.versionsBusy) vc._body.appendChild(hint('Đang tải danh sách phiên bản…'));
        else if (!S.versions.length) vc._body.appendChild(hint('Chưa có phiên bản nào được lưu.'));
        S.versions.forEach(function (v) {
            var r = el('div', 'bkai-admin-version');
            r.appendChild(el('span', 'bkai-admin-version-n', 'v' + v.version));
            r.appendChild(el('span', 'bkai-admin-version-note', v.note || ''));
            r.appendChild(el('span', 'bkai-admin-version-when', fmt(v.createdAt)));
            var b = button('Khôi phục', 'bk-btn-ghost bk-btn-sm', 'fa-clock-rotate-left');
            b.disabled = !editable;
            on(b, 'click', function () {
                confirmDialog('Khôi phục System Prompt từ phiên bản ' + v.version + '?', 'Khôi phục')
                    .then(function (yes) {
                        if (!yes) return;
                        call('admin.prompt.restore', { version: v.version }).then(function (data) {
                            S.prompt = String(data.content || '');
                            S.savedPrompt = S.prompt;
                            S.promptDirty = false;
                            S.notice = 'Đã khôi phục hướng dẫn từ phiên bản ' + v.version + '.';
                            S.noticeKind = 'ok';
                            toast(S.notice, 'success');
                            loadVersions();
                            paint();
                        }).catch(function (err) {
                            S.notice = (err && err.message) || 'Không khôi phục được.';
                            S.noticeKind = 'error';
                            paint();
                            toast(S.notice, 'error');
                        });
                    });
            });
            r.appendChild(b);
            vc._body.appendChild(r);
        });
        S.host.appendChild(vc);
    }

    function savePrompt() {
        if (S.promptBusy) return;
        var content = String(S.prompt || '').trim();
        if (content.length < 40) {
            toast('Hướng dẫn quá ngắn (tối thiểu 40 ký tự).', 'error');
            return;
        }
        S.promptBusy = true;
        paint();
        call('admin.prompt.save', { content: S.prompt, note: S.promptNote || '' }).then(function (data) {
            S.promptBusy = false;
            S.savedPrompt = S.prompt;
            S.promptDirty = false;
            S.promptNote = '';
            S.notice = 'Đã lưu System Prompt phiên bản ' + data.version + '.';
            S.noticeKind = 'ok';
            toast(S.notice, 'success');
            loadVersions();
            paint();
        }).catch(function (err) {
            S.promptBusy = false;
            S.notice = (err && err.message) || 'Không lưu được System Prompt.';
            S.noticeKind = 'error';
            paint();
            toast(S.notice, 'error');
        });
    }

    /* -------------------------------------------------------------- Cấu hình */
    function paintConfig() {
        var data = S.data || {};
        var settings = data.settings || {};
        var editable = !!data.isFounder;

        var c = card('Giới hạn token & hiệu suất',
            'Tách riêng token đầu vào và đầu ra. Giá trị mặc định đã tính theo System Prompt thực tế của Bá Khí.');
        var grid = el('div', 'bkc-grid');

        var maxOut = numberInput(settings.maxOutputTokens, 128, 8192, 64);
        grid.appendChild(field('Token đầu ra tối đa', maxOut,
            'Trần cho một câu trả lời. Chế độ Gợi ý 256 · Giải thích 512 · Từng bước 1024. ' +
            'Đặt quá thấp câu trả lời sẽ cụt; 1600–2048 là mức an toàn.'));

        var maxIn = numberInput(settings.maxInputTokens, 256, 200000, 100);
        grid.appendChild(field('Token đầu vào ước tính tối đa', maxIn,
            'Giới hạn ngữ cảnh gửi đi mỗi lượt. Hệ thống luôn cắt lịch sử trước khi gửi.'));

        var ctx = numberInput(settings.maxContextMessages, 2, 40);
        grid.appendChild(field('Số tin nhắn lịch sử', ctx,
            'Chỉ gửi N lượt gần nhất (mặc định 10–12). Không gửi toàn bộ hội thoại để tiết kiệm token.'));

        var timeout = numberInput(settings.timeoutMs, 5000, 120000, 1000);
        grid.appendChild(field('Thời gian chờ mỗi model (ms)', timeout,
            'Hết thời gian thì chuyển model kế tiếp. 30000–45000 phù hợp đa số nhà cung cấp.'));

        var retries = numberInput(settings.maxRetries == null ? 1 : settings.maxRetries, 0, 3, 1);
        grid.appendChild(field('Số lần thử lại', retries,
            'Chỉ áp dụng cho lỗi tạm thời (429, timeout, 5xx). 0 = không thử lại. Không bao giờ thử vô hạn.'));

        var dailyReq = numberInput(settings.dailyRequests, 0, 5000);
        grid.appendChild(field('Số câu hỏi / học sinh / 24 giờ', dailyReq, '0 = không giới hạn'));
        var dailyTok = numberInput(settings.dailyTokens, 0, 5000000, 1000);
        grid.appendChild(field('Token / học sinh / 24 giờ', dailyTok, '0 = không giới hạn'));

        var streaming = checkbox('Bật phản hồi dần (streaming)', !!settings.streaming, true);
        grid.appendChild(field('Streaming', streaming,
            'Máy chủ hiện trả toàn bộ câu trả lời trong một lần nên tuỳ chọn này chưa có tác dụng. ' +
            'Giữ tắt để giao diện không hứa điều hệ thống chưa làm.'));
        c._body.appendChild(grid);

        var lang = selectInput([
            { id: 'vi', label: 'Tiếng Việt' },
            { id: 'en', label: 'Tiếng Việt + chú thích tiếng Anh' }
        ], settings.language);
        c._body.appendChild(field('Ngôn ngữ', lang));

        var toggles = el('div', 'bkc-grid');
        var enabled = checkbox('Bật Trợ lý AI cho học sinh', settings.enabled);
        toggles.appendChild(field('Trạng thái', enabled));
        var saveHistory = checkbox('Lưu lịch sử hội thoại', settings.saveHistory);
        toggles.appendChild(field('Lịch sử', saveHistory));
        var lessonCtx = checkbox('Gửi ngữ cảnh bài học đang xem', settings.useLessonContext);
        toggles.appendChild(field('Ngữ cảnh', lessonCtx));
        c._body.appendChild(toggles);

        var modeWrap = el('div', 'bkai-admin-modes');
        var modeBoxes = {};
        MODES.forEach(function (m) {
            var active = (settings.allowedModes || []).indexOf(m.id) !== -1;
            var cb = checkbox(m.label, active);
            modeBoxes[m.id] = cb;
            modeWrap.appendChild(cb);
        });
        c._body.appendChild(field('Chế độ học tập được phép', modeWrap));

        var row = el('div', 'bkc-row');
        var saveBtn = button(S.saving ? 'Đang lưu…' : 'Lưu cấu hình', 'bk-btn-primary', 'fa-floppy-disk');
        saveBtn.disabled = !editable || S.saving;
        on(saveBtn, 'click', function () {
            S.saving = true;
            paint();
            call('admin.settings.save', {
                settings: {
                    enabled: enabled._box.checked,
                    maxInputTokens: Number(maxIn.value),
                    maxOutputTokens: Number(maxOut.value),
                    maxContextMessages: Number(ctx.value),
                    timeoutMs: Number(timeout.value),
                    maxRetries: Number(retries.value),
                    dailyRequests: Number(dailyReq.value),
                    dailyTokens: Number(dailyTok.value),
                    streaming: false,
                    saveHistory: saveHistory._box.checked,
                    useLessonContext: lessonCtx._box.checked,
                    language: lang.value,
                    allowedModes: Object.keys(modeBoxes).filter(function (k) { return modeBoxes[k]._box.checked; })
                }
            }).then(function () {
                S.saving = false;
                S.notice = 'Đã lưu cấu hình Trợ lý AI.';
                S.noticeKind = 'ok';
                toast('Đã lưu cấu hình.', 'success');
                load();
            }).catch(function (err) {
                S.saving = false;
                S.notice = (err && err.message) || 'Không lưu được cấu hình.';
                S.noticeKind = 'error';
                paint();
                toast(S.notice, 'error');
            });
        });
        row.appendChild(saveBtn);
        var reload = button('Tải lại', 'bk-btn-ghost', 'fa-rotate-right');
        on(reload, 'click', load);
        row.appendChild(reload);
        c._body.appendChild(row);
        S.host.appendChild(c);

        var sec = card('An toàn & quyền', 'Những điều giao diện này cố ý không cho làm');
        var ul = el('ul', 'bkai-admin-list');
        [
            'API key không hiển thị, không trả về trình duyệt và không lưu trong localStorage.',
            'Máy chủ kiểm tra quyền Founder (admin_sessions.scope) cho mọi thao tác ghi — ẩn nút không phải lớp bảo vệ.',
            'Học sinh chỉ đọc hội thoại của chính mình qua RLS; mọi thao tác ghi đi qua Edge Function.',
            'Bảng ai_model_routes và ai_model_attempts bật RLS và không có policy: chỉ service_role truy cập.',
            'Lỗi provider hiển thị cho học sinh đã lược bỏ khoá, header và raw response.'
        ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
        sec._body.appendChild(ul);
        S.host.appendChild(sec);
    }

    /* ------------------------------------------------------------------ Logs */
    function paintLogs() {
        var c = card('Nhật ký gần đây',
            'Lượt gọi, model đã dùng, thời gian phản hồi, lỗi và lịch sử fallback. Không chứa nội dung hội thoại.');
        var row = el('div', 'bkc-row');
        var range = selectInput(RANGES, S.logsRange);
        on(range, 'change', function () {
            S.logsRange = range.value;
            loadLogs();
        });
        row.appendChild(range);
        var reload = button('Tải lại', 'bk-btn-ghost', 'fa-rotate-right');
        on(reload, 'click', loadLogs);
        row.appendChild(reload);
        c._body.appendChild(row);

        if (S.logsBusy) {
            c._body.appendChild(hint('Đang tải nhật ký…'));
        } else if (!S.logs) {
            c._body.appendChild(hint('Chưa tải nhật ký.'));
        } else if (S.logs.error) {
            c._body.appendChild(hint('Không đọc được nhật ký: ' + S.logs.error));
        } else {
            var logs = Array.isArray(S.logs.logs) ? S.logs.logs : [];
            c._body.appendChild(el('h4', 'bkai-admin-sub', 'Lượt gọi (' + logs.length + ')'));
            if (!logs.length) c._body.appendChild(hint('Chưa có lượt gọi nào trong khoảng này.'));
            logs.forEach(function (l) {
                var r = el('div', 'bkai-admin-version');
                r.appendChild(el('span', 'bkai-admin-version-n',
                    providerLabel(l.provider) + ' · ' + (l.model || '—')));
                r.appendChild(el('span', 'bkai-admin-version-note',
                    (l.mode || '') + ' · vào ' + fmtNum(l.tokens_in) + ' / ra ' + fmtNum(l.tokens_out) +
                    ' token · ' + fmtNum(l.latency_ms) + 'ms' +
                    (l.fell_back ? ' · qua dự phòng' : '') +
                    (l.tokens_estimated ? ' · token ước lượng' : '')));
                r.appendChild(pill(l.ok ? 'Thành công' : ('Lỗi' + (l.error_code ? ' · ' + l.error_code : '')),
                    l.ok ? 'ok' : 'warn'));
                r.appendChild(el('span', 'bkai-admin-version-when', fmt(l.created_at)));
                c._body.appendChild(r);
            });

            var attempts = Array.isArray(S.logs.attempts) ? S.logs.attempts : [];
            c._body.appendChild(el('h4', 'bkai-admin-sub', 'Lịch sử fallback (' + attempts.length + ')'));
            if (!attempts.length) c._body.appendChild(hint('Chưa có lần thử model nào được ghi.'));
            attempts.forEach(function (a) {
                var r = el('div', 'bkai-admin-version');
                r.appendChild(el('span', 'bkai-admin-version-n',
                    (a.position === 0 ? 'Primary' : 'Fallback ' + a.position) + ' · ' +
                    providerLabel(a.provider)));
                r.appendChild(el('span', 'bkai-admin-version-note',
                    (a.model || '—') + ' · ' + fmtNum(a.latency_ms) + 'ms' +
                    (a.status ? ' · HTTP ' + a.status : '')));
                r.appendChild(pill(a.ok ? 'OK' : (a.error_code || 'Lỗi'), a.ok ? 'ok' : 'warn'));
                r.appendChild(el('span', 'bkai-admin-version-when', fmt(a.created_at)));
                c._body.appendChild(r);
            });

            var diag = Array.isArray(S.logs.diagnostics) ? S.logs.diagnostics : [];
            if (diag.length) {
                c._body.appendChild(el('h4', 'bkai-admin-sub', 'Chẩn đoán provider (' + diag.length + ')'));
                diag.forEach(function (d) {
                    var r = el('div', 'bkai-admin-version');
                    r.appendChild(el('span', 'bkai-admin-version-n', String(d.provider || '—')));
                    r.appendChild(el('span', 'bkai-admin-version-note',
                        String(d.model || '—') + ' · HTTP ' + String(d.status || 0) +
                        (d.detail ? ' · ' + String(d.detail) : '')));
                    r.appendChild(el('span', 'bkai-admin-version-when', fmt(d.created_at)));
                    c._body.appendChild(r);
                });
            }
        }
        S.host.appendChild(c);
    }

    global.BKFounderAI = {
        render: render,
        reload: load,
        _state: S,
        _tabs: TABS
    };
})(typeof window !== 'undefined' ? window : this);
