/* =========================================================================
   Bá Khí — bk-observability.js  (8.6.2 · Observability)

   Tab "Vận hành" trong Founder Dashboard. CHỈ là lớp hiển thị:
   - Backend Rust /metrics chạy độc lập; Prometheus scrape được dù dashboard
     không bao giờ mở.
   - Số liệu lấy từ POST /api/v1/observability/summary bằng CHÍNH phiên Founder
     hiện có (header x-admin-token). Không có token metrics nào trong trình duyệt.
   - Không hiển thị dữ liệu mẫu. Trạng thái rỗng/lỗi nói rõ lý do.

   Công khai: window.BKObservability.render(host)
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKObservability) return;

    var REFRESH_MS = 30000;
    var REQUEST_TIMEOUT_MS = 12000;

    /* ------------------------------ Tiện ích ------------------------------ */

    function el(tag, cls, text) {
        var node = D.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = String(text);
        return node;
    }
    function isNum(value) {
        return typeof value === 'number' && isFinite(value);
    }
    function fmtInt(value) {
        if (!isNum(value)) return '—';
        try { return Number(value).toLocaleString('vi-VN'); } catch (e) { return String(value); }
    }
    function fmtMs(value) {
        if (!isNum(value)) return '—';
        if (value < 1) return '<1 ms';
        if (value < 10) return value.toFixed(1) + ' ms';
        if (value < 1000) return Math.round(value) + ' ms';
        return (value / 1000).toFixed(2) + ' s';
    }
    function fmtPct(value) {
        if (!isNum(value)) return '—';
        return value.toFixed(value >= 10 ? 1 : 2) + '%';
    }
    function fmtTokens(value) {
        if (!isNum(value)) return '—';
        if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
        if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
        return String(value);
    }
    function fmtUsd(value) {
        if (!isNum(value)) return '—';
        if (value === 0) return '$0';
        if (value < 0.01) return '$' + value.toFixed(6);
        return '$' + value.toFixed(4);
    }
    function fmtUptime(seconds) {
        if (!isNum(seconds) || seconds < 0) return '—';
        var total = Math.floor(seconds);
        var days = Math.floor(total / 86400);
        var hours = Math.floor((total % 86400) / 3600);
        var minutes = Math.floor((total % 3600) / 60);
        if (days > 0) return days + ' ngày ' + hours + ' giờ';
        if (hours > 0) return hours + ' giờ ' + minutes + ' phút';
        return minutes + ' phút';
    }
    function fmtMemory(bytes) {
        if (!isNum(bytes)) return '—';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    function roleLabel(role) {
        return role === 'fallback' ? 'Fallback' : 'Primary';
    }

    function backendBase() {
        var cfg = global.BK_BACKEND || {};
        var base = String(cfg.rustBaseUrl || '').trim().replace(/\/+$/, '');
        return /^https:\/\//i.test(base) ? base : '';
    }
    function founderToken() {
        try {
            if (global.BKCloud && typeof global.BKCloud.founderToken === 'function') {
                return global.BKCloud.founderToken() || '';
            }
        } catch (e) { /* phiên hỏng ⇒ coi như chưa đăng nhập */ }
        return '';
    }

    function failure(code, message) {
        var error = new Error(message || code);
        error.code = code;
        return error;
    }

    function loadSummary() {
        var base = backendBase();
        if (!base) {
            return Promise.reject(failure('NOT_CONFIGURED',
                'Chưa cấu hình backend Rust (BK_BACKEND.rustBaseUrl).'));
        }
        var token = founderToken();
        if (!token) {
            return Promise.reject(failure('NO_SESSION',
                'Phiên Founder không còn hiệu lực. Hãy đăng nhập lại.'));
        }

        var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
        var timer = controller ? global.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;

        return global.fetch(base + '/api/v1/observability/summary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-token': token
            },
            body: '{}',
            cache: 'no-store',
            signal: controller ? controller.signal : undefined
        }).then(function (response) {
            if (timer) global.clearTimeout(timer);
            return response.json().catch(function () { return null; }).then(function (body) {
                if (response.ok && body && body.ok && body.data) return body.data;
                var code = body && body.error && body.error.code ? body.error.code : 'HTTP_' + response.status;
                var message = body && body.error && body.error.message
                    ? body.error.message
                    : 'Máy chủ trả về HTTP ' + response.status + '.';
                throw failure(code, message);
            });
        }).catch(function (error) {
            if (timer) global.clearTimeout(timer);
            if (error && error.name === 'AbortError') {
                throw failure('TIMEOUT', 'Máy chủ không phản hồi trong thời gian cho phép.');
            }
            if (error && error.code) throw error;
            throw failure('NETWORK', 'Không kết nối được backend. Kiểm tra rustBaseUrl và CORS.');
        });
    }

    /* ------------------------------- Render ------------------------------- */

    function render(host) {
        if (!host) return;
        host.textContent = '';

        var state = {
            data: null,
            loading: false,
            error: null,
            updatedAt: null,
            sort: { key: 'requests', dir: -1 }
        };

        var wrap = el('div', 'bko-wrap');
        host.appendChild(wrap);

        var bar = el('div', 'bko-bar');
        var status = el('span', 'bko-pill is-idle', 'Chưa tải');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        var stamp = el('span', 'bko-stamp', '');
        var refreshBtn = el('button', 'bko-btn');
        refreshBtn.type = 'button';
        refreshBtn.appendChild(el('i', 'fa-solid fa-rotate'));
        refreshBtn.appendChild(el('span', null, 'Làm mới'));
        refreshBtn.addEventListener('click', function () { refresh(true); });
        bar.appendChild(status);
        bar.appendChild(stamp);
        bar.appendChild(refreshBtn);
        wrap.appendChild(bar);

        var note = el('p', 'bko-note',
            'Số liệu runtime kể từ lúc backend khởi động — không phải dữ liệu lịch sử. ' +
            'Prometheus giữ chuỗi thời gian dài hạn; chi phí AI là ước tính từ bảng giá cấu hình, ' +
            'không phải hoá đơn của nhà cung cấp.');
        wrap.appendChild(note);

        var body = el('div', 'bko-body');
        wrap.appendChild(body);

        function setStatus(kind, text) {
            status.className = 'bko-pill is-' + kind;
            status.textContent = text;
        }

        function refresh(manual) {
            if (state.loading) return;
            state.loading = true;
            setStatus('loading', 'Đang tải…');
            refreshBtn.disabled = true;
            if (manual) stamp.textContent = 'Đang làm mới…';
            body.textContent = '';
            var loading = el('div', 'bko-empty');
            loading.appendChild(el('i', 'fa-solid fa-circle-notch fa-spin'));
            loading.appendChild(el('span', null, 'Đang đọc metrics từ backend…'));
            body.appendChild(loading);

            loadSummary().then(function (data) {
                state.data = data;
                state.error = null;
                state.updatedAt = new Date();
                renderData();
            }).catch(function (error) {
                state.error = error;
                renderError(error);
            }).then(function () {
                state.loading = false;
                refreshBtn.disabled = false;
            });
        }

        function statCard(label, value, hint, tone) {
            var card = el('div', 'bko-stat' + (tone ? ' is-' + tone : ''));
            card.appendChild(el('span', 'bko-stat-label', label));
            card.appendChild(el('strong', 'bko-stat-value', value));
            if (hint) card.appendChild(el('span', 'bko-stat-hint', hint));
            return card;
        }

        function section(title, subtitle) {
            var box = el('section', 'bko-card');
            var head = el('div', 'bko-card-head');
            head.appendChild(el('h3', null, title));
            if (subtitle) head.appendChild(el('p', null, subtitle));
            box.appendChild(head);
            return box;
        }

        function tableHead(columns) {
            var thead = el('thead');
            var row = el('tr');
            columns.forEach(function (col) {
                var th = el('th', col.sort ? 'is-sortable' : '', col.label);
                if (col.sort) {
                    th.setAttribute('scope', 'col');
                    th.setAttribute('aria-sort',
                        state.sort.key === col.sort
                            ? (state.sort.dir === 1 ? 'ascending' : 'descending')
                            : 'none');
                    th.addEventListener('click', function () {
                        if (state.sort.key === col.sort) state.sort.dir = -state.sort.dir;
                        else state.sort = { key: col.sort, dir: -1 };
                        renderData();
                    });
                } else {
                    th.setAttribute('scope', 'col');
                }
                row.appendChild(th);
            });
            thead.appendChild(row);
            return thead;
        }

        function renderData() {
            var data = state.data;
            body.textContent = '';
            setStatus('ok', 'Đang hoạt động');
            stamp.textContent = 'Cập nhật ' + (state.updatedAt
                ? state.updatedAt.toLocaleTimeString('vi-VN')
                : '—');

            var http = data.http || {};
            var ai = data.ai || {};
            var runtime = data.runtime || {};
            var metrics = data.metrics || {};
            var cost = ai.cost || {};
            var tokens = ai.tokens || {};

            /* 1. Overview ------------------------------------------------- */
            var grid = el('div', 'bko-grid');
            grid.appendChild(statCard('Tổng request', fmtInt(http.totalRequests),
                'Không tính lần scrape /metrics'));
            grid.appendChild(statCard('Tỷ lệ lỗi', fmtPct(http.errorRate),
                fmtInt(http.errors) + ' request lỗi', http.errorRate >= 5 ? 'warn' : null));
            grid.appendChild(statCard('Latency trung bình', fmtMs(http.avgMs), 'Toàn bộ endpoint'));
            grid.appendChild(statCard('p50', fmtMs(http.p50Ms), 'Trung vị'));
            grid.appendChild(statCard('p95', fmtMs(http.p95Ms), 'Ngưỡng đuôi'));
            grid.appendChild(statCard('p99', fmtMs(http.p99Ms), 'Ngưỡng đuôi xa'));
            grid.appendChild(statCard('Lượt AI', fmtInt(ai.requests),
                fmtInt(ai.primaryOnly) + ' chỉ Primary'));
            grid.appendChild(statCard('Tỷ lệ Fallback', fmtPct(ai.fallbackRate),
                fmtInt(ai.fallbackRequests) + ' lượt chuyển dự phòng'));
            grid.appendChild(statCard('Token AI', fmtTokens(tokens.total),
                fmtTokens(tokens.estimated) + ' token ước tính'));
            grid.appendChild(statCard('Chi phí ước tính',
                cost.unpricedRequests > 0 && !cost.usd ? 'Chưa xác định' : fmtUsd(cost.usd),
                cost.unpricedRequests > 0
                    ? fmtInt(cost.unpricedRequests) + ' lượt chưa có giá'
                    : 'Bảng giá ' + (cost.pricingVersion || 'chưa cấu hình')));
            body.appendChild(grid);

            /* 2. API performance ------------------------------------------ */
            var apiCard = section('Hiệu năng API',
                'Theo endpoint đã chuẩn hoá · p50/p95/p99 tính từ histogram');
            var endpoints = (http.endpoints || []).slice();
            if (!endpoints.length) {
                apiCard.appendChild(emptyBlock('Chưa có request nào kể từ lúc backend khởi động.'));
            } else {
                var key = state.sort.key;
                endpoints.sort(function (a, b) {
                    var av = a[key], bv = b[key];
                    if (typeof av === 'string' || typeof bv === 'string') {
                        return String(av).localeCompare(String(bv)) * state.sort.dir;
                    }
                    return ((av || 0) - (bv || 0)) * state.sort.dir;
                });
                var table = el('table', 'bko-table');
                table.appendChild(tableHead([
                    { label: 'Endpoint' },
                    { label: 'Requests', sort: 'requests' },
                    { label: 'Lỗi', sort: 'errors' },
                    { label: 'Tỷ lệ lỗi', sort: 'errorRate' },
                    { label: 'p50', sort: 'p50Ms' },
                    { label: 'p95', sort: 'p95Ms' },
                    { label: 'p99', sort: 'p99Ms' }
                ]));
                var tbody = el('tbody');
                endpoints.forEach(function (row) {
                    var tr = el('tr');
                    var cell = el('td', 'bko-route');
                    cell.appendChild(el('span', 'bko-method', row.method || '—'));
                    cell.appendChild(el('code', null, row.route || '—'));
                    tr.appendChild(cell);
                    tr.appendChild(el('td', 'is-num', fmtInt(row.requests)));
                    tr.appendChild(el('td', 'is-num', fmtInt(row.errors)));
                    var rate = el('td', 'is-num', fmtPct(row.errorRate));
                    if (isNum(row.errorRate) && row.errorRate >= 5) rate.className += ' is-bad';
                    tr.appendChild(rate);
                    tr.appendChild(el('td', 'is-num', fmtMs(row.p50Ms)));
                    tr.appendChild(el('td', 'is-num', fmtMs(row.p95Ms)));
                    tr.appendChild(el('td', 'is-num', fmtMs(row.p99Ms)));
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                var scroller = el('div', 'bko-scroll');
                scroller.appendChild(table);
                apiCard.appendChild(scroller);
            }
            body.appendChild(apiCard);

            /* 3. AI Provider monitor --------------------------------------- */
            var aiCard = section('Nhà cung cấp AI',
                'Primary và Fallback tách riêng · latency đo tại máy chủ, không gồm trình duyệt');
            var providers = ai.providers || [];
            if (!providers.length) {
                aiCard.appendChild(emptyBlock('Chưa có lượt gọi provider nào kể từ lúc backend khởi động.'));
            } else {
                var aiTable = el('table', 'bko-table');
                aiTable.appendChild(tableHead([
                    { label: 'Provider' },
                    { label: 'Vai trò' },
                    { label: 'Requests' },
                    { label: 'Tỷ lệ thành công' },
                    { label: 'p95' },
                    { label: 'Token' },
                    { label: 'Chi phí' }
                ]));
                var aiBody = el('tbody');
                providers.forEach(function (row) {
                    var tr = el('tr');
                    var name = el('td', 'bko-route');
                    name.appendChild(el('strong', null, row.provider || '—'));
                    name.appendChild(el('code', null, row.model || '—'));
                    tr.appendChild(name);

                    var roleCell = el('td');
                    var badge = el('span', 'bko-role is-' + (row.role === 'fallback' ? 'fallback' : 'primary'),
                        roleLabel(row.role));
                    roleCell.appendChild(badge);
                    tr.appendChild(roleCell);

                    tr.appendChild(el('td', 'is-num', fmtInt(row.requests)));
                    var success = el('td', 'is-num', fmtPct(row.successRate));
                    if (isNum(row.successRate) && row.successRate < 95) success.className += ' is-bad';
                    tr.appendChild(success);
                    tr.appendChild(el('td', 'is-num', fmtMs(row.p95Ms)));
                    tr.appendChild(el('td', 'is-num',
                        fmtTokens(row.tokens ? row.tokens.total : null)));

                    var costCell = el('td', 'is-num');
                    if (row.priced) costCell.textContent = fmtUsd(row.costUsd);
                    else {
                        costCell.textContent = 'Chưa xác định';
                        costCell.className += ' is-muted';
                        costCell.title = 'Model chưa có trong bảng giá — không tính là 0 USD.';
                    }
                    tr.appendChild(costCell);
                    aiBody.appendChild(tr);

                    var errorKeys = row.errors ? Object.keys(row.errors) : [];
                    if (errorKeys.length) {
                        var errRow = el('tr', 'bko-subrow');
                        var errCell = el('td', null, '');
                        errCell.colSpan = 7;
                        errCell.appendChild(el('span', 'bko-hint', 'Lỗi: ' +
                            errorKeys.map(function (code) {
                                return code + ' ×' + row.errors[code];
                            }).join(' · ')));
                        errRow.appendChild(errCell);
                        aiBody.appendChild(errRow);
                    }
                });
                aiTable.appendChild(aiBody);
                var aiScroller = el('div', 'bko-scroll');
                aiScroller.appendChild(aiTable);
                aiCard.appendChild(aiScroller);

                var fallbackLine = el('p', 'bko-hint',
                    'Fallback: ' + fmtInt(ai.fallbackAttempted) + ' lần kích hoạt · ' +
                    fmtInt(ai.fallbackSuccess) + ' thành công · ' +
                    fmtInt(ai.fallbackFailure) + ' thất bại · ' +
                    fmtInt(ai.fallbackSkipped) + ' bỏ qua (circuit mở). ' +
                    'Độ sẵn sàng AI: ' + fmtPct(ai.availability) + '.');
                aiCard.appendChild(fallbackLine);
            }
            body.appendChild(aiCard);

            /* 4. AI usage -------------------------------------------------- */
            var usage = section('Sử dụng AI', 'Token lấy từ usage metadata của provider; ước tính được ghi riêng');
            var usageGrid = el('div', 'bko-grid is-compact');
            usageGrid.appendChild(statCard('Input', fmtInt(tokens.input), 'token vào'));
            usageGrid.appendChild(statCard('Output', fmtInt(tokens.output), 'token ra'));
            usageGrid.appendChild(statCard('Tổng', fmtInt(tokens.total), 'input + output'));
            usageGrid.appendChild(statCard('Ước tính', fmtInt(tokens.estimated),
                tokens.estimated > 0 ? 'provider thiếu usage' : 'không có token ước tính'));
            usageGrid.appendChild(statCard('Chi phí', fmtUsd(cost.usd),
                (cost.currency || 'USD') + ' · ước tính'));
            usageGrid.appendChild(statCard('Model có giá', fmtInt(cost.pricedModels),
                'bảng giá ' + (cost.pricingVersion || 'chưa cấu hình')));
            usage.appendChild(usageGrid);
            if (cost.unpricedRequests > 0) {
                usage.appendChild(el('p', 'bko-warn',
                    fmtInt(cost.unpricedRequests) + ' lượt có token nhưng chưa có giá cho model — ' +
                    'các lượt này KHÔNG được tính là 0 USD. Thêm model vào AI_PRICING_JSON/AI_PRICING_FILE.'));
            }
            body.appendChild(usage);

            /* 5. System ---------------------------------------------------- */
            var system = section('Trạng thái hệ thống', 'Backend Rust · metrics trong bộ nhớ');
            var sysGrid = el('div', 'bko-grid is-compact');
            sysGrid.appendChild(statCard('Backend', 'Hoạt động',
                'phiên bản ' + (runtime.version || '—'), 'ok'));
            sysGrid.appendChild(statCard('Uptime', fmtUptime(runtime.uptimeSeconds),
                runtime.draining ? 'đang shutdown' : 'không draining',
                runtime.draining ? 'warn' : null));
            sysGrid.appendChild(statCard('Bộ nhớ (RSS)', fmtMemory(runtime.residentMemoryBytes),
                'đọc từ /proc/self/statm'));
            sysGrid.appendChild(statCard('Metrics endpoint',
                metrics.enabled ? 'Đã bật' : 'Đang tắt',
                metrics.enabled ? 'yêu cầu Bearer token' : 'bật bằng METRICS_ENABLED=1',
                metrics.enabled ? 'ok' : 'warn'));
            sysGrid.appendChild(statCard('Request đang xử lý', fmtInt(http.inFlight), 'in-flight'));
            sysGrid.appendChild(statCard('Lượt AI thất bại', fmtInt(ai.failed),
                'toàn bộ chuỗi thất bại', ai.failed > 0 ? 'warn' : null));
            system.appendChild(sysGrid);

            var circuits = data.circuits || [];
            if (circuits.length) {
                var labels = { closed: 'Đóng (bình thường)', half_open: 'Thử nghiệm', open: 'Mở (tạm nghỉ)' };
                var circuitLine = el('p', 'bko-hint', 'Circuit breaker: ' + circuits.map(function (c) {
                    return (c.provider || '—') + ' — ' + (labels[c.state] || c.state || '—');
                }).join(' · '));
                system.appendChild(circuitLine);
            }
            body.appendChild(system);
        }

        function emptyBlock(text) {
            var box = el('div', 'bko-empty');
            box.appendChild(el('i', 'fa-regular fa-chart-bar'));
            box.appendChild(el('span', null, text));
            return box;
        }

        function renderError(error) {
            body.textContent = '';
            var code = error && error.code ? error.code : 'ERROR';
            var card = el('div', 'bko-state is-error');

            if (code === 'NOT_CONFIGURED') {
                setStatus('idle', 'Chưa cấu hình');
                card.className = 'bko-state is-idle';
                card.appendChild(el('h3', null, 'Backend chưa được cấu hình'));
                card.appendChild(el('p', null,
                    'Đặt BK_BACKEND.rustBaseUrl (https) trong assets/bakhi/bk-supabase.config.js ' +
                    'sau khi backend Rust đã chạy. Trang này không tự bật backend.'));
            } else if (code === 'NO_SESSION' || code === 'UNAUTHORIZED') {
                setStatus('warn', 'Phiên hết hạn');
                card.appendChild(el('h3', null, 'Phiên Founder không hợp lệ'));
                card.appendChild(el('p', null, error.message));
            } else if (code === 'FORBIDDEN' || code === 'FOUNDER_ONLY') {
                setStatus('warn', 'Không đủ quyền');
                card.appendChild(el('h3', null, 'Chỉ Founder xem được dữ liệu vận hành'));
                card.appendChild(el('p', null, error.message));
            } else {
                setStatus('error', 'Mất kết nối');
                card.appendChild(el('h3', null, 'Không đọc được metrics'));
                card.appendChild(el('p', null, error.message ||
                    'Backend không phản hồi. Kiểm tra /health và CORS_ORIGINS.'));
            }

            var retry = el('button', 'bko-btn', 'Thử lại');
            retry.type = 'button';
            retry.addEventListener('click', function () { refresh(true); });
            card.appendChild(retry);
            body.appendChild(card);
        }

        refresh(false);

        /* Tự làm mới khi tab còn hiển thị; dừng khi pane bị gỡ. */
        var timer = global.setInterval(function () {
            if (!D.body || !D.body.contains(host)) {
                global.clearInterval(timer);
                return;
            }
            if (D.hidden || state.loading) return;
            refresh(false);
        }, REFRESH_MS);
    }

    global.BKObservability = {
        render: render,
        version: '8.6.2'
    };
})(typeof window !== 'undefined' ? window : this);
