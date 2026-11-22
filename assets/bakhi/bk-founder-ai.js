/* =========================================================================
   Bá Khí — bk-founder-ai.js (8.5.2)
   Tab "AI Tutor" trong Founder Dashboard: trạng thái, nhà cung cấp, mô hình,
   sức khoẻ provider, thống kê token, lỗi gần đây, giới hạn sử dụng và
   quản lý System Prompt.

   Nguyên tắc:
   - KHÔNG hiển thị, không đọc, không ghi API key. Khoá nằm trong Supabase
     Edge Function Secrets; giao diện chỉ cho biết "đã cấu hình" hay "chưa".
   - Mọi thao tác qua Edge Function `ai-tutor-api` (action admin.*), máy chủ
     kiểm tra scope Founder.
   - Không cho nhập JSON thô: chỉ ô chọn, ô số và vùng văn bản có nhãn.

   Công khai: window.BKFounderAI.render(host)
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKFounderAI) return;

    var S = {
        host: null, data: null, loading: false, error: '',
        prompt: '', promptNote: '', versions: [], saving: false, testing: false,
        notice: '',
        stats: null, statsBusy: false, statsRange: 'week',
        statsProvider: '', statsModel: '', statsHost: null
    };

    /* Danh mục dùng chung với máy chủ (PROVIDER_CATALOG trong ai-providers.ts).
       Thứ tự dưới đây chỉ là thứ tự hiển thị khi máy chủ chưa trả danh mục. */
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
    var RANGES = [
        { id: 'day', label: 'Hôm nay' },
        { id: 'week', label: '7 ngày' },
        { id: 'month', label: '30 ngày' },
        { id: 'all', label: 'Tất cả' }
    ];
    var MODES = [
        { id: 'explain', label: 'Giải thích' }, { id: 'steps', label: 'Từng bước' },
        { id: 'hint', label: 'Gợi ý' }, { id: 'check', label: 'Kiểm tra bài làm' },
        { id: 'practice', label: 'Luyện tập' }, { id: 'mistakes', label: 'Phân tích lỗi' },
        { id: 'summary', label: 'Tóm tắt' }, { id: 'socratic', label: 'Hỏi dẫn dắt' }
    ];

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
    function toast(msg, kind) {
        try { if (global.BK && global.BK.ui && global.BK.ui.toast) global.BK.ui.toast(msg, kind || 'info'); } catch (e) { }
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
    function textInput(value, placeholder, type) {
        var i = el('input', 'bkc-input');
        i.type = type || 'text';
        i.value = value == null ? '' : String(value);
        if (placeholder) i.placeholder = placeholder;
        return i;
    }
    function numberInput(value, min, max, step) {
        var i = textInput(value, '', 'number');
        i.min = String(min);
        i.max = String(max);
        if (step) i.step = String(step);
        return i;
    }
    function selectInput(options, value) {
        var s = el('select', 'bkc-select');
        options.forEach(function (o) {
            var op = el('option', null, o.label);
            op.value = o.id;
            s.appendChild(op);
        });
        s.value = value || '';
        return s;
    }
    function checkbox(label, checked) {
        var wrap = el('label', 'bkai-admin-check');
        var box = textInput('', '', 'checkbox');
        box.checked = !!checked;
        wrap.appendChild(box);
        wrap.appendChild(el('span', null, label));
        wrap._box = box;
        return wrap;
    }
    function pill(text, kind) {
        return el('span', 'bkc-pill' + (kind ? ' is-' + kind : ''), text);
    }

    /* ---------------------------------------------------------- gọi máy chủ */
    function call(action, payload) {
        var cfg = global.BK_SUPABASE;
        var token = global.BKCloud && global.BKCloud.adminToken ? global.BKCloud.adminToken() : null;
        if (!cfg || !cfg.url) return Promise.reject(new Error('Chưa cấu hình Supabase.'));
        if (!token) return Promise.reject(new Error('Phiên quản trị đã hết hạn. Vui lòng nhập lại mã quản trị.'));
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
                    throw err;
                }
                return data.data || data;
            });
        });
    }

    function load() {
        S.loading = true;
        S.error = '';
        paint();
        return call('admin.status').then(function (data) {
            S.data = data;
            S.prompt = String((data.settings && data.settings.systemPrompt) || '');
            S.loading = false;
            paint();
            loadVersions();
            if (data.isFounder) loadStats();
        }).catch(function (err) {
            S.loading = false;
            S.error = err && err.message || 'Không tải được trạng thái Trợ lý AI.';
            paint();
        });
    }

    function loadStats() {
        if (S.statsBusy) return;
        S.statsBusy = true;
        renderStats();
        call('admin.usage.stats', {
            range: S.statsRange,
            provider: S.statsProvider,
            model: S.statsModel
        }).then(function (data) {
            S.statsBusy = false;
            S.stats = data || null;
            renderStats();
        }).catch(function (err) {
            S.statsBusy = false;
            S.stats = { error: (err && err.message) || 'Không đọc được thống kê.' };
            renderStats();
        });
    }

    function loadVersions() {
        return call('admin.prompt.versions').then(function (data) {
            S.versions = Array.isArray(data.versions) ? data.versions : [];
            paintVersions();
        }).catch(function () { S.versions = []; paintVersions(); });
    }

    /* ---------------------------------------------------------------- render */
    function render(host) {
        if (!host) return;
        S.host = host;
        host.classList.add('bkai-admin');
        paint();
        load();
    }

    function paint() {
        if (!S.host) return;
        clear(S.host);
        if (S.loading && !S.data) {
            var load = el('div', 'bkc-empty');
            load.appendChild(icon('fa-spinner'));
            load.appendChild(el('p', null, 'Đang tải trạng thái Trợ lý AI…'));
            S.host.appendChild(load);
            return;
        }
        if (S.error && !S.data) {
            var err = el('div', 'bkc-empty');
            err.appendChild(icon('fa-triangle-exclamation'));
            err.appendChild(el('p', null, S.error));
            var retry = button('Thử lại', 'bk-btn-ghost', 'fa-rotate-right');
            on(retry, 'click', function () { load(); });
            err.appendChild(retry);
            S.host.appendChild(err);
            return;
        }

        var data = S.data || {};
        var settings = data.settings || {};
        var connection = data.connection || {};
        var usage = data.usage || {};
        var totals = data.totals || {};
        var found = !!data.isFounder;

        if (S.notice) {
            var note = el('div', 'bkc-alert');
            note.appendChild(el('p', null, S.notice));
            S.host.appendChild(note);
        }
        if (!found) {
            var ro = el('div', 'bkc-alert is-warn');
            ro.appendChild(el('p', null,
                'Bạn đang đăng nhập với quyền Administrator: chỉ xem được trạng thái. ' +
                'Chỉ Founder được thay đổi cấu hình Trợ lý AI.'));
            S.host.appendChild(ro);
        }

        /* --- Tổng quan --- */
        var overview = card('Tổng quan', 'Trạng thái dịch vụ và mức sử dụng trong 24 giờ');
        var stats = el('div', 'bkc-stats');
        function stat(k, v, hint) {
            var box = el('div', 'bkc-stat');
            box.appendChild(el('div', 'bkc-stat-k', k));
            box.appendChild(el('div', 'bkc-stat-v', String(v)));
            if (hint) box.appendChild(el('div', 'bkc-stat-hint', hint));
            return box;
        }
        stats.appendChild(stat('Trạng thái', settings.enabled ? 'Đang bật' : 'Đang tắt',
            settings.enabled ? 'Học sinh có thể mở Trợ lý AI' : 'Học sinh thấy thông báo tạm tắt'));
        stats.appendChild(stat('Nhà cung cấp', providerLabel(settings.provider) || '—'));
        stats.appendChild(stat('Mô hình', settings.model || '—'));
        stats.appendChild(stat('Kết nối', connectionStatus(connection, settings)));
        stats.appendChild(stat('Request (24h)', usage.requests || 0));
        stats.appendChild(stat('Lỗi (24h)', usage.failures || 0));
        stats.appendChild(stat('Học sinh dùng (24h)', usage.students || 0));
        stats.appendChild(stat('Token (24h)', usage.tokens || 0));
        stats.appendChild(stat('Hội thoại', totals.conversations || 0));
        stats.appendChild(stat('Tin nhắn', totals.messages || 0));
        overview._body.appendChild(stats);

        var connRow = el('div', 'bkc-row');
        var testBtn = button(S.testing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối', 'bk-btn-ghost', 'fa-plug-circle-check');
        testBtn.disabled = S.testing || !found;
        on(testBtn, 'click', runTest);
        connRow.appendChild(testBtn);
        if (connection.mock) {
            connRow.appendChild(pill('AI_TUTOR_MOCK đang bật — câu trả lời là giả lập', 'warn'));
        }
        if (!connection.primaryKey) {
            connRow.appendChild(pill('Chưa có AI_TUTOR_API_KEY trong Secrets', 'warn'));
        }
        overview._body.appendChild(connRow);
        var keyHint = el('p', 'bkc-hint');
        keyHint.textContent = 'API key KHÔNG nhập ở đây và không bao giờ hiển thị. ' +
            'Khoá được đặt trong Supabase → Edge Functions → Secrets với tên AI_TUTOR_API_KEY. ' +
            'Xem docs/AI_TUTOR_API_KEY_SETUP.md.';
        overview._body.appendChild(keyHint);
        S.host.appendChild(overview);
        void data;

        /* --- Nhà cung cấp & mô hình --- */
        var providerCard = card('Nhà cung cấp & mô hình',
            'Chọn nhà cung cấp chính, mô hình mặc định và nhà cung cấp dự phòng');
        var grid = el('div', 'bkc-grid');

        var providerSel = selectInput(providerOptions(data), settings.provider);
        grid.appendChild(field('Nhà cung cấp chính', providerSel,
            'Mặc định: Groq. Đổi nhà cung cấp chỉ cần đổi khoá trong Supabase Secrets, không sửa mã.'));

        var modelList = el('datalist');
        modelList.id = 'bkaiModelList';
        var modelInput = textInput(settings.model, 'ví dụ: openai/gpt-oss-20b');
        modelInput.setAttribute('list', 'bkaiModelList');
        function fillModelList(provider) {
            clear(modelList);
            var list = (data.modelSuggestions || {})[provider] || [];
            list.forEach(function (m) {
                var op = D.createElement('option');
                op.value = m;
                modelList.appendChild(op);
            });
        }
        fillModelList(settings.provider);

        var modelField = field('Mô hình mặc định', modelInput,
            'Chỉ dùng mô hình đã kiểm tra hoạt động với khoá hiện tại.');
        var verifyOut = el('p', 'bkc-hint');
        var verifyBtn = button('Kiểm tra model', 'bk-btn-ghost bk-btn-sm', 'fa-circle-check');
        verifyBtn.disabled = !found;
        on(verifyBtn, 'click', function () {
            var model = modelInput.value.trim();
            if (!model) { toast('Nhập tên mô hình trước khi kiểm tra.', 'error'); return; }
            verifyBtn.disabled = true;
            verifyOut.textContent = 'Đang kiểm tra ' + model + '…';
            call('admin.provider.verify', { provider: providerSel.value, model: model })
                .then(function (res) {
                    verifyBtn.disabled = false;
                    if (res.listed && res.supported === false) {
                        verifyOut.textContent = 'Mô hình "' + model + '" KHÔNG có trong danh sách ' +
                            res.modelCount + ' mô hình của ' + providerLabel(res.provider) +
                            '. Có thể vẫn chạy nếu nhà cung cấp dùng tên khác — hãy thử Lưu rồi bấm "Kiểm tra kết nối".';
                        toast('Mô hình không có trong danh sách của nhà cung cấp.', 'error');
                    } else if (res.listed) {
                        verifyOut.textContent = 'Đã xác nhận: ' + providerLabel(res.provider) + ' đang phục vụ "' +
                            model + '" (' + res.modelCount + ' mô hình, ' + res.latencyMs + 'ms).';
                        toast('Mô hình hợp lệ.', 'success');
                    } else {
                        verifyOut.textContent = 'Đã gọi thử ' + providerLabel(res.provider) + ' · ' + res.model +
                            ': ' + (res.reply || 'OK') + ' (' + res.latencyMs + 'ms).';
                        toast('Gọi thử thành công.', 'success');
                    }
                }).catch(function (err) {
                    verifyBtn.disabled = false;
                    verifyOut.textContent = 'Kiểm tra thất bại: ' + ((err && err.message) || 'không rõ lý do');
                    toast('Kiểm tra model thất bại.', 'error');
                });
        });
        grid.appendChild(modelField);
        grid.appendChild(verifyBtn);
        grid.appendChild(verifyOut);
        grid.appendChild(modelList);
        on(providerSel, 'change', function () { fillModelList(providerSel.value); });

        var fallbackSel = selectInput([{ id: '', label: '— Không dùng dự phòng —' }].concat(providerOptions(data)), settings.fallbackProvider);
        grid.appendChild(field('Nhà cung cấp dự phòng', fallbackSel,
            'Chỉ chạy khi AI_TUTOR_FALLBACK_API_KEY đã được đặt trong Secrets.'));
        var fallbackModel = textInput(settings.fallbackModel, 'ví dụ: gemini-3.8-flash');
        grid.appendChild(field('Mô hình dự phòng', fallbackModel));

        var fbState = data.fallback || {};
        var fallbackEnabled = checkbox('Tự chuyển sang nhà cung cấp dự phòng khi nhà cung cấp chính lỗi',
            fbState.enabledInSettings !== false);
        grid.appendChild(field('Dự phòng tự động', fallbackEnabled,
            fbState.keyPresent
                ? 'Khoá dự phòng đã có trong Secrets.'
                : 'Chưa có AI_TUTOR_FALLBACK_API_KEY — bật công tắc này cũng chưa có tác dụng.'));

        var routing = checkbox('Bật định tuyến mô hình theo loại câu hỏi', settings.routing);
        grid.appendChild(field('Định tuyến model', routing));
        var modelSimple = textInput(settings.modelSimple, 'câu hỏi đơn giản');
        grid.appendChild(field('Mô hình cho câu đơn giản', modelSimple));
        var modelComplex = textInput(settings.modelComplex, 'câu hỏi phức tạp');
        grid.appendChild(field('Mô hình cho câu phức tạp', modelComplex));
        var modelPractice = textInput(settings.modelPractice, 'tạo bài luyện tập');
        grid.appendChild(field('Mô hình cho luyện tập', modelPractice));
        providerCard._body.appendChild(grid);
        S.host.appendChild(providerCard);

        /* --- Sức khoẻ nhà cung cấp --- */
        var healthCard = card('Sức khoẻ nhà cung cấp AI',
            'Khoá, giới hạn ngữ cảnh, token đầu ra tối đa và thời gian chờ của từng nhà cung cấp');
        var providers = Array.isArray(data.providers) ? data.providers : [];
        if (!providers.length) {
            healthCard._body.appendChild(el('p', 'bkc-hint',
                'Máy chủ chưa trả danh mục nhà cung cấp — Edge Function đang chạy bản cũ hơn 8.5.2.'));
        }
        providers.forEach(function (p) {
            var row = el('div', 'bkai-admin-version');
            row.appendChild(el('span', 'bkai-admin-version-n', p.label || p.id));
            row.appendChild(el('span', 'bkai-admin-version-note',
                (p.protocol === 'google' ? 'Google protocol' : 'OpenAI-compatible') +
                ' · ctx ' + fmtNum(p.contextLimit) + ' · out ' + fmtNum(p.maxOutput) +
                ' · ' + (p.timeoutMs || '—') + 'ms'));
            if (p.active) row.appendChild(pill('Đang dùng', 'ok'));
            if (p.fallbackActive) row.appendChild(pill('Dự phòng', 'ok'));
            /* Khoá được xét theo đúng vai trò: provider dự phòng dùng khoá dự phòng,
               không phải khoá chính. Nhãn "Thiếu khoá" chỉ hiện khi vai trò đó thật
               sự chưa có khoá trong Secrets. */
            if (p.role === 'primary' && !p.primaryKeyConfigured) {
                row.appendChild(pill('Thiếu khoá chính', 'warn'));
            } else if (p.role === 'fallback' && !p.fallbackKeyConfigured) {
                row.appendChild(pill('Thiếu khoá dự phòng', 'warn'));
            } else if (!p.active && !p.fallbackActive &&
                !p.primaryKeyConfigured && !p.fallbackKeyConfigured) {
                row.appendChild(pill('Thiếu khoá', 'warn'));
            }
            row.appendChild(el('span', 'bkai-admin-version-note',
                'khoá chính: ' + (p.primaryKeyConfigured ? 'có' : 'chưa') +
                ' · khoá dự phòng: ' + (p.fallbackKeyConfigured ? 'có' : 'chưa')));
            if (p.cooldownMsLeft > 0) {
                row.appendChild(pill('Tạm nghỉ ' + Math.ceil(p.cooldownMsLeft / 1000) + 's', 'warn'));
            }
            var out = el('span', 'bkc-hint');
            var probe = button('Kiểm tra', 'bk-btn-ghost bk-btn-sm', 'fa-circle-check');
            probe.disabled = !found;
            on(probe, 'click', function () {
                probe.disabled = true;
                out.textContent = 'Đang đọc danh sách model…';
                /* Kiểm tra bằng đúng khoá của vai trò provider đang giữ. */
                var probeRole = p.active ? 'primary'
                    : (p.fallbackActive || (p.fallbackKeyConfigured && !p.primaryKeyConfigured))
                        ? 'fallback' : 'primary';
                call('admin.provider.verify', { provider: p.id, role: probeRole })
                    .then(function (res) {
                        probe.disabled = false;
                        out.textContent = res.listed
                            ? ('OK · ' + res.modelCount + ' model · ' + res.latencyMs + 'ms')
                            : ('OK · gọi thử ' + (res.reply || 'OK'));
                        toast('Nhà cung cấp ' + (p.label || p.id) + ' phản hồi tốt.', 'success');
                    }).catch(function (err) {
                        probe.disabled = false;
                        out.textContent = (err && err.message) || 'Không kết nối được.';
                    });
            });
            row.appendChild(probe);
            row.appendChild(out);
            healthCard._body.appendChild(row);
        });
        var fb = data.fallback || {};
        healthCard._body.appendChild(el('p', 'bkc-hint',
            'Dự phòng: ' + (fb.configured ? 'bật' : 'tắt') +
            ' · ' + (fb.provider ? providerLabel(fb.provider) : 'chưa chọn nhà cung cấp') +
            (fb.model ? ' · ' + fb.model : '') +
            ' · khoá dự phòng: ' + (fb.keyPresent ? 'đã có trong Secrets' : 'chưa có') +
            ' · số lần thử lại: ' + (data.retry != null ? data.retry : 1)));
        S.host.appendChild(healthCard);

        /* --- Thống kê token & lượt gọi --- */
        var statsCard = card('Thống kê token & lượt gọi',
            'Token thật do nhà cung cấp trả về; lượt dùng token ước lượng được đếm riêng.');
        var filterGrid = el('div', 'bkc-grid');
        var rangeSel = selectInput(RANGES, S.statsRange);
        var provFilter = selectInput(
            [{ id: '', label: 'Tất cả nhà cung cấp' }].concat(providerOptions(data)), S.statsProvider);
        var modelFilter = textInput(S.statsModel, 'lọc theo tên model (tuỳ chọn)');
        filterGrid.appendChild(field('Khoảng thời gian', rangeSel));
        filterGrid.appendChild(field('Nhà cung cấp', provFilter));
        filterGrid.appendChild(field('Model', modelFilter));
        statsCard._body.appendChild(filterGrid);
        var applyStats = button('Xem thống kê', 'bk-btn-ghost', 'fa-chart-simple');
        on(applyStats, 'click', function () {
            S.statsRange = rangeSel.value;
            S.statsProvider = provFilter.value;
            S.statsModel = modelFilter.value.trim();
            loadStats();
        });
        statsCard._body.appendChild(applyStats);
        S.statsHost = el('div', 'bkai-admin-versions');
        statsCard._body.appendChild(S.statsHost);
        S.host.appendChild(statsCard);
        renderStats();

        /* --- Giới hạn & chi phí --- */
        var limitsCard = card('Giới hạn sử dụng & chi phí',
            'Áp dụng cho từng học sinh trong cửa sổ 24 giờ');
        var lgrid = el('div', 'bkc-grid');
        var dailyRequests = numberInput(settings.dailyRequests, 0, 5000);
        lgrid.appendChild(field('Số câu hỏi / 24 giờ', dailyRequests, '0 = không giới hạn số câu'));
        var dailyTokens = numberInput(settings.dailyTokens, 0, 5000000, 1000);
        lgrid.appendChild(field('Token / 24 giờ', dailyTokens, '0 = không giới hạn token'));
        var maxOut = numberInput(settings.maxOutputTokens, 128, 8192, 64);
        lgrid.appendChild(field('Token tối đa mỗi câu trả lời', maxOut));
        var timeout = numberInput(settings.timeoutMs, 5000, 120000, 1000);
        lgrid.appendChild(field('Thời gian chờ (ms)', timeout));
        var ctxWindow = numberInput(settings.maxContextMessages, 2, 40);
        lgrid.appendChild(field('Số tin nhắn ngữ cảnh', ctxWindow,
            'Chỉ gửi N lượt gần nhất, không gửi toàn bộ lịch sử.'));
        var language = selectInput([{ id: 'vi', label: 'Tiếng Việt' }, { id: 'en', label: 'Tiếng Việt + chú thích tiếng Anh' }], settings.language);
        lgrid.appendChild(field('Ngôn ngữ', language));
        limitsCard._body.appendChild(lgrid);

        var toggles = el('div', 'bkc-grid');
        var enabledBox = checkbox('Bật Trợ lý AI cho học sinh', settings.enabled);
        toggles.appendChild(field('Trạng thái', enabledBox));
        var saveHistory = checkbox('Lưu lịch sử hội thoại', settings.saveHistory);
        toggles.appendChild(field('Lịch sử', saveHistory));
        var lessonCtx = checkbox('Tự gửi ngữ cảnh bài học đang xem', settings.useLessonContext);
        toggles.appendChild(field('Ngữ cảnh', lessonCtx));
        limitsCard._body.appendChild(toggles);

        var modeWrap = el('div', 'bkai-admin-modes');
        var modeBoxes = {};
        MODES.forEach(function (m) {
            var active = (settings.allowedModes || []).indexOf(m.id) !== -1;
            var cb = checkbox(m.label, active);
            modeBoxes[m.id] = cb;
            modeWrap.appendChild(cb);
        });
        limitsCard._body.appendChild(field('Chế độ học tập được phép', modeWrap));
        S.host.appendChild(limitsCard);

        /* --- Lưu --- */
        var actions = el('div', 'bkc-row');
        var saveBtn = button(S.saving ? 'Đang lưu…' : 'Lưu cấu hình', 'bk-btn-primary', 'fa-floppy-disk');
        saveBtn.disabled = S.saving || !found;
        on(saveBtn, 'click', function () {
            S.saving = true;
            paint();
            call('admin.settings.save', {
                settings: {
                    enabled: enabledBox._box.checked,
                    provider: providerSel.value,
                    model: modelInput.value.trim(),
                    fallbackProvider: fallbackSel.value,
                    fallbackModel: fallbackModel.value.trim(),
                    fallbackEnabled: fallbackEnabled._box.checked,
                    routing: routing._box.checked,
                    modelSimple: modelSimple.value.trim(),
                    modelComplex: modelComplex.value.trim(),
                    modelPractice: modelPractice.value.trim(),
                    maxContextMessages: Number(ctxWindow.value),
                    maxOutputTokens: Number(maxOut.value),
                    timeoutMs: Number(timeout.value),
                    dailyRequests: Number(dailyRequests.value),
                    dailyTokens: Number(dailyTokens.value),
                    saveHistory: saveHistory._box.checked,
                    useLessonContext: lessonCtx._box.checked,
                    language: language.value,
                    allowedModes: Object.keys(modeBoxes).filter(function (k) { return modeBoxes[k]._box.checked; })
                }
            }).then(function () {
                S.saving = false;
                S.notice = 'Đã lưu cấu hình Trợ lý AI.';
                toast('Đã lưu cấu hình Trợ lý AI.', 'success');
                load();
            }).catch(function (err) {
                S.saving = false;
                S.notice = err && err.message || 'Không lưu được cấu hình.';
                paint();
                toast(S.notice, 'error');
            });
        });
        actions.appendChild(saveBtn);
        var reloadBtn = button('Tải lại', 'bk-btn-ghost', 'fa-rotate-right');
        on(reloadBtn, 'click', function () { S.notice = ''; load(); });
        actions.appendChild(reloadBtn);
        S.host.appendChild(actions);

        /* --- System prompt --- */
        var promptCard = card('Hướng dẫn hệ thống (System Prompt)',
            'Quy tắc chung cho mọi câu trả lời. Nội dung học sinh gửi không bao giờ ghi đè phần này.');
        var promptArea = el('textarea', 'bkc-textarea');
        promptArea.value = S.prompt;
        promptArea.rows = 14;
        promptArea.spellcheck = false;
        on(promptArea, 'input', function () { S.prompt = promptArea.value; });
        promptCard._body.appendChild(promptArea);

        var noteInput = textInput(S.promptNote, 'Ghi chú cho phiên bản này (tuỳ chọn)');
        on(noteInput, 'input', function () { S.promptNote = noteInput.value; });
        promptCard._body.appendChild(field('Ghi chú phiên bản', noteInput));

        var promptRow = el('div', 'bkc-row');
        var savePrompt = button('Lưu hướng dẫn mới', 'bk-btn-primary', 'fa-floppy-disk');
        savePrompt.disabled = !found;
        on(savePrompt, 'click', function () {
            if (String(S.prompt).trim().length < 40) {
                toast('Hướng dẫn quá ngắn (tối thiểu 40 ký tự).', 'error');
                return;
            }
            call('admin.prompt.save', { content: S.prompt, note: S.promptNote }).then(function (data) {
                toast('Đã lưu hướng dẫn phiên bản ' + data.version + '.', 'success');
                S.promptNote = '';
                load();
            }).catch(function (err) { toast(err && err.message || 'Không lưu được hướng dẫn.', 'error'); });
        });
        promptRow.appendChild(savePrompt);
        var previewBtn = button('Xem trước', 'bk-btn-ghost', 'fa-eye');
        on(previewBtn, 'click', function () {
            try { global.alert('Hướng dẫn hiện tại:\n\n' + String(S.prompt || '').slice(0, 4000)); } catch (e) { }
        });
        promptRow.appendChild(previewBtn);
        promptCard._body.appendChild(promptRow);

        var versionsHost = el('div', 'bkai-admin-versions');
        versionsHost.id = 'bkaiPromptVersions';
        promptCard._body.appendChild(versionsHost);
        S.versionsHost = versionsHost;
        S.host.appendChild(promptCard);
        paintVersions();

        var security = card('An toàn & quyền',
            'Những điều giao diện này cố ý không cho làm');
        var ul = el('ul', 'bkai-admin-list');
        [
            'Không hiển thị, không trả về và không lưu API key trong trình duyệt.',
            'Khoá AI chỉ đọc từ Supabase Edge Function Secrets (AI_TUTOR_API_KEY cho nhà cung cấp chính, AI_TUTOR_FALLBACK_API_KEY cho dự phòng).',
            'Chỉ Founder được đổi cấu hình, system prompt và chạy kiểm tra kết nối.',
            'Học sinh chỉ đọc được hội thoại của chính mình (RLS); mọi thao tác ghi đi qua máy chủ.',
            'Mỗi thay đổi cấu hình quan trọng đều ghi vào nhật ký quản trị.'
        ].forEach(function (t) {
            ul.appendChild(el('li', null, t));
        });
        security._body.appendChild(ul);
        S.host.appendChild(security);

        /* --- Lỗi provider gần đây (chỉ Founder) --- */
        if (found) {
            var errCard = card('Lỗi nhà cung cấp gần đây',
                '20 lần gần nhất. Chi tiết đã được lọc bỏ khoá và không bao giờ trả cho học sinh.');
            var errors = Array.isArray(data.recentErrors) ? data.recentErrors : [];
            if (!errors.length) {
                errCard._body.appendChild(el('p', 'bkc-hint', 'Chưa ghi nhận lỗi nhà cung cấp nào.'));
            }
            errors.forEach(function (e) {
                var row = el('div', 'bkai-admin-version');
                row.appendChild(el('span', 'bkai-admin-version-n', String(e.provider || '—')));
                row.appendChild(el('span', 'bkai-admin-version-note',
                    String(e.model || '—') + ' · ' + String(e.role || 'primary') +
                    ' · HTTP ' + String(e.status || 0) + (e.detail ? ' · ' + String(e.detail) : '')));
                row.appendChild(el('span', 'bkai-admin-version-when', fmt(e.created_at)));
                errCard._body.appendChild(row);
            });
            S.host.appendChild(errCard);
        }
        void saveBtn;
    }

    function paintVersions() {
        var host = S.versionsHost || D.getElementById('bkaiPromptVersions');
        if (!host) return;
        clear(host);
        if (!S.versions.length) {
            host.appendChild(el('p', 'bkc-hint', 'Chưa có phiên bản nào được lưu.'));
            return;
        }
        host.appendChild(el('h4', 'bkai-admin-sub', 'Phiên bản trước'));
        S.versions.forEach(function (v) {
            var row = el('div', 'bkai-admin-version');
            row.appendChild(el('span', 'bkai-admin-version-n', 'v' + v.version));
            row.appendChild(el('span', 'bkai-admin-version-note', v.note || ''));
            var when = el('span', 'bkai-admin-version-when', fmt(v.createdAt));
            row.appendChild(when);
            var restore = button('Khôi phục', 'bk-btn-ghost bk-btn-sm', 'fa-clock-rotate-left');
            on(restore, 'click', function () {
                call('admin.prompt.restore', { version: v.version }).then(function (data) {
                    S.prompt = data.content || '';
                    toast('Đã khôi phục hướng dẫn từ phiên bản ' + v.version + '.', 'success');
                    load();
                }).catch(function (err) { toast(err && err.message || 'Không khôi phục được.', 'error'); });
            });
            row.appendChild(restore);
            host.appendChild(row);
        });
    }

    function fmt(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') +
            ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function providerLabel(id) {
        for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i].label;
        return id || '';
    }

    /* Danh mục lấy từ máy chủ khi có (một nguồn sự thật), nếu không dùng danh sách tĩnh. */
    function providerOptions(data) {
        var list = data && Array.isArray(data.providerCatalog) ? data.providerCatalog : [];
        if (!list.length) return PROVIDERS;
        return list.map(function (p) { return { id: p.id, label: p.label || p.id }; });
    }

    function fmtNum(n) {
        var v = Number(n);
        if (!isFinite(v)) return '—';
        return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function renderStats() {
        var host = S.statsHost;
        if (!host) return;
        clear(host);
        if (S.statsBusy) { host.appendChild(el('p', 'bkc-hint', 'Đang tải thống kê…')); return; }
        var d = S.stats;
        if (!d) { host.appendChild(el('p', 'bkc-hint', 'Chưa tải thống kê.')); return; }
        if (d.error) {
            host.appendChild(el('p', 'bkc-hint', 'Không đọc được thống kê: ' + d.error));
            return;
        }
        var t = d.totals || {};
        var tokensIn = Number(t.tokens_in) || 0;
        var tokensOut = Number(t.tokens_out) || 0;
        var grid = el('div', 'bkc-stats');
        [
            ['Lượt gọi', fmtNum(t.requests)],
            ['Thành công', fmtNum(t.succeeded)],
            ['Lỗi', fmtNum(t.failed)],
            ['Token vào', fmtNum(tokensIn)],
            ['Token ra', fmtNum(tokensOut)],
            ['Tổng token', fmtNum(tokensIn + tokensOut)],
            ['Qua dự phòng', fmtNum(t.fallbacks)],
            ['Token ước lượng', fmtNum(t.estimated_requests)],
            ['Thời gian TB', (Number(t.avg_latency_ms) || 0) + 'ms']
        ].forEach(function (pair) {
            var box = el('div', 'bkc-stat');
            box.appendChild(el('div', 'bkc-stat-k', pair[0]));
            box.appendChild(el('div', 'bkc-stat-v', pair[1]));
            grid.appendChild(box);
        });
        host.appendChild(grid);

        var byModel = Array.isArray(d.byModel) ? d.byModel : [];
        if (byModel.length) {
            host.appendChild(el('h4', 'bkai-admin-sub', 'Theo model'));
            byModel.forEach(function (m) {
                var row = el('div', 'bkai-admin-version');
                row.appendChild(el('span', 'bkai-admin-version-n', (m.model || '—')));
                row.appendChild(el('span', 'bkai-admin-version-note',
                    providerLabel(m.provider) + ' · ' + fmtNum(m.requests) + ' lượt · ' +
                    (m.failed ? fmtNum(m.failed) + ' lỗi · ' : '') +
                    fmtNum(m.tokens) + ' token'));
                host.appendChild(row);
            });
        }

        var byDay = Array.isArray(d.byDay) ? d.byDay : [];
        if (byDay.length) {
            host.appendChild(el('h4', 'bkai-admin-sub', 'Theo ngày'));
            byDay.slice(0, 14).forEach(function (day) {
                var row = el('div', 'bkai-admin-version');
                row.appendChild(el('span', 'bkai-admin-version-n', day.day || ''));
                row.appendChild(el('span', 'bkai-admin-version-note',
                    fmtNum(day.requests) + ' lượt · ' + fmtNum(day.tokens) + ' token' +
                    (day.failed ? ' · ' + fmtNum(day.failed) + ' lỗi' : '')));
                host.appendChild(row);
            });
        }
    }

    function connectionStatus(connection, settings) {
        if (connection.mock) return 'Giả lập (QA)';
        if (!settings.enabled) return 'Đang tắt';
        if (!connection.primaryKey) return 'Chưa có khoá API';
        return 'Đã cấu hình khoá';
    }

    function runTest() {
        if (S.testing) return;
        S.testing = true;
        S.notice = '';
        paint();
        call('admin.test').then(function (data) {
            S.testing = false;
            S.notice = 'Kết nối thành công: ' + providerLabel(data.provider) + ' · ' + data.model +
                ' · ' + data.latencyMs + 'ms' + (data.fellBack ? ' (qua dự phòng)' : '') +
                (data.mock ? ' — LƯU Ý: đây là câu trả lời giả lập.' : '');
            paint();
            toast('Kết nối AI thành công.', 'success');
        }).catch(function (err) {
            S.testing = false;
            S.notice = 'Kiểm tra kết nối thất bại: ' + (err && err.message || 'không rõ lý do');
            paint();
            toast(S.notice, 'error');
        });
    }

    global.BKFounderAI = { render: render, reload: load, _state: S };
})(typeof window !== 'undefined' ? window : this);
