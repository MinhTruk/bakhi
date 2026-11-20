/* =========================================================================
   Bá Khí — bk-founder-auth.js  (8.0.0)

   MỘT cơ chế xác thực Founder duy nhất cho toàn hệ sinh thái:
     - Cùng nguồn mã: bảng founder_config (chỉ lưu SHA-256) đọc bởi Edge
       Function admin-auth với scope = 'founder'.
     - Cùng phiên: bảng admin_sessions, token lưu trong sessionStorage của tab
       hiện tại (khoá bakhiAdmin.v1) — đúng khoá mà /founder/ và dashboard dùng.
     - Cùng cách kiểm tra: gọi admin-actions action 'session.check'; máy chủ
       đọc lại token trong admin_sessions và trả về scope. Không tin biến
       JavaScript, localStorage hay tham số do client gửi.

   Không có mã Founder nào trong tệp này. Mã chỉ đi từ ô nhập tới máy chủ.

   Công khai: window.BKFounderAuth
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKFounderAuth) return;

    var KEY = 'bakhiAdmin.v1';
    var VERSION = (global.BAKHI_VERSION && global.BAKHI_VERSION.app) || '8.0.0';
    var CSS_ID = 'bk-founder-auth-css';

    /* ---------------------------------------------------------------------
       Cấu hình + HTTP
       ------------------------------------------------------------------ */
    function cfg() { return global.BK_SUPABASE; }
    function configured() {
        var c = cfg();
        return !!(c && typeof c.configured === 'function' && c.configured() && c.functions);
    }
    function functionUrl(name) {
        var c = cfg();
        return String(c.url).replace(/\/+$/, '') + '/functions/v1/' + name;
    }

    function httpError(code, message, status, retryAfter) {
        var e = new Error(message);
        e.code = code;
        e.status = status || 0;
        if (retryAfter) e.retryAfter = retryAfter;
        return e;
    }

    function post(name, body, headers) {
        if (!configured()) {
            return Promise.reject(httpError('NO_CONFIG', 'Trang này chưa cấu hình Supabase nên không thể xác thực Founder.'));
        }
        var c = cfg();
        var merged = {
            'Content-Type': 'application/json',
            apikey: c.key,
            Authorization: 'Bearer ' + c.key
        };
        if (headers) {
            for (var k in headers) if (Object.prototype.hasOwnProperty.call(headers, k)) merged[k] = headers[k];
        }
        return global.fetch(functionUrl(name), {
            method: 'POST',
            headers: merged,
            body: JSON.stringify(body || {}),
            cache: 'no-store'
        }).then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                if (res.ok && data && data.ok === true) return data;
                var info = (data && data.error) || {};
                var message = info.message;
                if (!message) {
                    if (res.status === 429) message = 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút.';
                    else if (res.status === 503) message = 'Máy chủ xác thực đang bảo trì. Hãy thử lại sau.';
                    else message = 'Không xác thực được với máy chủ. Hãy thử lại.';
                }
                throw httpError(info.code || 'HTTP_' + res.status, message, res.status, info.retryAfter);
            });
        }).catch(function (err) {
            if (err && err.code) throw err;
            throw httpError('NETWORK', 'Không kết nối được máy chủ xác thực. Kiểm tra mạng rồi thử lại.');
        });
    }

    /* ---------------------------------------------------------------------
       Phiên Founder (cùng khoá với BKCloud và /founder/)
       ------------------------------------------------------------------ */
    function readSession() {
        var saved = null;
        try { saved = JSON.parse(global.sessionStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
        if (!saved || !saved.token) return null;
        var exp = new Date(saved.expiresAt).getTime();
        if (isFinite(exp) && exp < Date.now()) {
            try { global.sessionStorage.removeItem(KEY); } catch (e) { }
            return null;
        }
        return {
            token: saved.token,
            expiresAt: saved.expiresAt || null,
            scope: saved.scope === 'founder' ? 'founder' : 'admin'
        };
    }

    function writeSession(data) {
        if (!data || !data.token) throw httpError('NO_TOKEN', 'Máy chủ không cấp được phiên Founder.');
        var session = {
            token: data.token,
            expiresAt: data.expiresAt || null,
            scope: data.scope === 'founder' ? 'founder' : 'founder'
        };
        try { global.sessionStorage.setItem(KEY, JSON.stringify(session)); } catch (e) { }
        return session;
    }

    function clearSession() {
        try { global.sessionStorage.removeItem(KEY); } catch (e) { }
    }

    /* ---------------------------------------------------------------------
       Đăng nhập / xác minh
       ------------------------------------------------------------------ */
    function login(code) {
        var value = String(code == null ? '' : code).trim();
        if (!value) return Promise.reject(httpError('EMPTY_CODE', 'Hãy nhập mã Founder.'));
        /* BKCloud (nếu có) gọi đúng endpoint admin-auth với scope founder và
           ghi cùng một khoá phiên; dùng lại để không có hai đường đăng nhập. */
        if (global.BKCloud && typeof global.BKCloud.founderLogin === 'function') {
            return global.BKCloud.founderLogin(value).then(function (data) {
                return { token: data.token, expiresAt: data.expiresAt, scope: 'founder' };
            });
        }
        return post(cfg().functions.adminAuth || 'admin-auth', { code: value, scope: 'founder' })
            .then(function (data) {
                if (data.scope && data.scope !== 'founder') {
                    throw httpError('WRONG_SCOPE', 'Máy chủ không cấp phiên Founder.');
                }
                return writeSession(data);
            });
    }

    /* Xác minh lại với máy chủ. Đây là bằng chứng duy nhất được chấp nhận;
       biến JavaScript hay việc modal biến mất không chứng minh quyền. */
    function check() {
        var session = readSession();
        if (!session || !session.token) {
            return Promise.reject(httpError('NO_SESSION', 'Chưa có phiên Founder.'));
        }
        return post(cfg().functions.adminActions || 'admin-actions',
            { action: 'session.check' },
            { 'x-admin-token': session.token }
        ).then(function (data) {
            var scope = data.scope === 'founder' ? 'founder' : 'admin';
            if (scope !== 'founder') {
                clearSession();
                throw httpError('NOT_FOUNDER', 'Phiên hiện tại không phải phiên Founder.');
            }
            var merged = {
                token: session.token,
                expiresAt: data.expiresAt || session.expiresAt,
                scope: 'founder'
            };
            try { global.sessionStorage.setItem(KEY, JSON.stringify(merged)); } catch (e) { }
            return {
                scope: 'founder',
                expiresAt: merged.expiresAt,
                serverVersion: data.serverVersion || null,
                maintenance: data.maintenance || null
            };
        }).catch(function (err) {
            if (err && (err.status === 401 || err.code === 'NOT_FOUNDER' || err.code === 'BAD_DEV_SESSION' || err.code === 'EXPIRED_DEV_SESSION')) {
                clearSession();
            }
            throw err;
        });
    }

    /* ---------------------------------------------------------------------
       Giao diện nhập mã Founder (dùng trên màn hình bảo trì và nơi khác)
       ------------------------------------------------------------------ */
    function injectCss() {
        if (D.getElementById(CSS_ID)) return;
        var s = D.createElement('style');
        s.id = CSS_ID;
        s.textContent =
            '.bkfa-layer{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;' +
            'justify-content:center;padding:1.1rem;background:rgba(0,0,0,.86);' +
            '-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}' +
            '.bkfa-card{width:min(420px,100%);box-sizing:border-box;padding:clamp(1.1rem,4vw,1.6rem);' +
            'border:1px solid #1f2937;border-radius:18px;background:#050505;color:#e5e7eb;' +
            'box-shadow:0 24px 70px rgba(0,0,0,.75);text-align:left}' +
            '.bkfa-eyebrow{display:block;margin-bottom:.35rem;font-size:.66rem;font-weight:700;' +
            'letter-spacing:.18em;text-transform:uppercase;color:#fbbf24}' +
            '.bkfa-title{margin:0 0 .4rem;font-size:1.22rem;line-height:1.3;color:#f9fafb}' +
            '.bkfa-desc{margin:0 0 1rem;font-size:.84rem;line-height:1.55;color:#9ca3af}' +
            '.bkfa-label{display:block;margin-bottom:.35rem;font-size:.76rem;font-weight:600;color:#d1d5db}' +
            '.bkfa-wrap{position:relative;display:flex;align-items:center}' +
            '.bkfa-input{width:100%;box-sizing:border-box;padding:.62rem 2.6rem .62rem .7rem;border-radius:.6rem;' +
            'border:1px solid #374151;background:#0b0b0b;color:#f9fafb;font:inherit}' +
            '.bkfa-input:focus{outline:2px solid #fbbf24;outline-offset:1px;border-color:#fbbf24}' +
            '.bkfa-reveal{position:absolute;right:.25rem;display:inline-flex;align-items:center;justify-content:center;' +
            'width:2rem;height:2rem;border:0;border-radius:.45rem;background:transparent;color:#9ca3af;cursor:pointer}' +
            '.bkfa-reveal:hover,.bkfa-reveal:focus-visible{background:#1f2937;color:#f9fafb}' +
            '.bkfa-error{margin:.55rem 0 0;font-size:.79rem;line-height:1.5;color:#fca5a5;min-height:1.1rem}' +
            '.bkfa-error.is-warn{color:#fcd34d}' +
            '.bkfa-actions{display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap;margin-top:.9rem}' +
            '.bkfa-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.55rem 1rem;border-radius:999px;' +
            'border:0;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#111827;font:inherit;font-weight:700;' +
            'cursor:pointer;transition:filter .15s ease,transform .15s ease}' +
            '.bkfa-btn:hover{filter:brightness(1.08)}' +
            '.bkfa-btn:active{transform:translateY(1px)}' +
            '.bkfa-btn:focus-visible{outline:2px solid #fde68a;outline-offset:2px}' +
            '.bkfa-btn:disabled{opacity:.6;cursor:progress}' +
            '.bkfa-btn-alt{background:transparent;border:1px solid #374151;color:#e5e7eb}' +
            '.bkfa-btn-alt:hover{background:#111827;filter:none}' +
            '.bkfa-note{margin:.75rem 0 0;font-size:.7rem;line-height:1.5;color:#6b7280}';
        (D.head || D.documentElement).appendChild(s);
    }

    function openDialog(opts) {
        opts = opts || {};
        injectCss();
        if (D.getElementById('bkFounderAuthLayer')) {
            var first = D.getElementById('bkFounderAuthCode');
            if (first) try { first.focus(); } catch (e) { }
            return null;
        }

        var layer = D.createElement('div');
        layer.className = 'bkfa-layer';
        layer.id = 'bkFounderAuthLayer';

        var card = D.createElement('form');
        card.className = 'bkfa-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'bkFounderAuthTitle');
        card.setAttribute('autocomplete', 'off');
        card.noValidate = true;

        var eyebrow = D.createElement('span');
        eyebrow.className = 'bkfa-eyebrow';
        eyebrow.textContent = 'FOUNDER AUTHENTICATION';
        card.appendChild(eyebrow);

        var title = D.createElement('h2');
        title.className = 'bkfa-title';
        title.id = 'bkFounderAuthTitle';
        title.textContent = 'Đăng nhập Founder';
        card.appendChild(title);

        var desc = D.createElement('p');
        desc.className = 'bkfa-desc';
        desc.textContent = 'Nhập mã Founder để truy cập hệ thống quản trị.';
        card.appendChild(desc);

        var label = D.createElement('label');
        label.className = 'bkfa-label';
        label.setAttribute('for', 'bkFounderAuthCode');
        label.textContent = 'Mã Founder';
        card.appendChild(label);

        var wrap = D.createElement('div');
        wrap.className = 'bkfa-wrap';
        var input = D.createElement('input');
        input.className = 'bkfa-input';
        input.id = 'bkFounderAuthCode';
        input.type = 'password';
        input.autocomplete = 'new-password';
        input.spellcheck = false;
        input.placeholder = 'Nhập mã Founder…';
        input.setAttribute('aria-describedby', 'bkFounderAuthError');
        wrap.appendChild(input);
        var reveal = D.createElement('button');
        reveal.className = 'bkfa-reveal';
        reveal.type = 'button';
        reveal.setAttribute('aria-label', 'Hiện mã Founder');
        reveal.title = 'Hiện / ẩn mã';
        reveal.textContent = '👁';
        wrap.appendChild(reveal);
        card.appendChild(wrap);

        var error = D.createElement('p');
        error.className = 'bkfa-error';
        error.id = 'bkFounderAuthError';
        error.setAttribute('role', 'alert');
        error.setAttribute('aria-live', 'assertive');
        card.appendChild(error);

        var actions = D.createElement('div');
        actions.className = 'bkfa-actions';
        var back = D.createElement('button');
        back.className = 'bkfa-btn bkfa-btn-alt';
        back.type = 'button';
        back.textContent = 'Quay lại';
        actions.appendChild(back);
        var submit = D.createElement('button');
        submit.className = 'bkfa-btn';
        submit.type = 'submit';
        submit.textContent = 'Xác nhận đăng nhập';
        actions.appendChild(submit);
        card.appendChild(actions);

        var note = D.createElement('p');
        note.className = 'bkfa-note';
        note.textContent = 'Mã chỉ được kiểm tra ở máy chủ. Phiên Founder lưu trong tab này và tự hết hạn.';
        card.appendChild(note);

        layer.appendChild(card);

        var busy = false;
        var closed = false;

        function close() {
            if (closed) return;
            closed = true;
            if (layer.parentNode) layer.parentNode.removeChild(layer);
            if (typeof opts.onClose === 'function') opts.onClose();
        }
        function say(text, warn) {
            error.textContent = text || '';
            error.className = 'bkfa-error' + (warn ? ' is-warn' : '');
        }
        function setBusy(state) {
            busy = state;
            submit.disabled = state;
            input.disabled = state;
            back.disabled = state;
            submit.textContent = state ? 'Đang xác thực…' : 'Xác nhận đăng nhập';
        }

        reveal.addEventListener('click', function () {
            var show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            reveal.setAttribute('aria-label', show ? 'Ẩn mã Founder' : 'Hiện mã Founder');
            input.focus();
        });

        back.addEventListener('click', close);

        layer.addEventListener('click', function (e) {
            if (e.target === layer) close();
        });
        layer.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (!busy) close();
            }
        });

        card.addEventListener('submit', function (e) {
            if (e) e.preventDefault();
            if (busy) return;
            var code = String(input.value || '').trim();
            if (!code) {
                say('Hãy nhập mã Founder.', true);
                input.focus();
                return;
            }
            setBusy(true);
            say('Đang xác thực ở máy chủ…', true);
            login(code).then(function () {
                return check();
            }).then(function (session) {
                setBusy(false);
                input.value = '';
                if (typeof opts.onSuccess === 'function') {
                    opts.onSuccess(session);
                }
                close();
            }).catch(function (err) {
                setBusy(false);
                input.value = '';
                var text = (err && err.message) || 'Mã Founder không hợp lệ.';
                if (err && err.code === 'BAD_FOUNDER_CODE') text = 'Mã Founder không hợp lệ.';
                if (err && err.code === 'TOO_MANY_ATTEMPTS') {
                    text = err.retryAfter
                        ? 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ' + Math.ceil(Number(err.retryAfter) / 60) + ' phút.'
                        : 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.';
                }
                say(text, false);
                if (input && !closed) {
                    try { input.focus(); } catch (e) { }
                }
            });
        });

        (opts.host || D.body || D.documentElement).appendChild(layer);
        setTimeout(function () { try { input.focus(); } catch (e) { } }, 30);
        return { close: close };
    }

    global.BKFounderAuth = {
        version: VERSION,
        configured: configured,
        session: readSession,
        token: function () { var s = readSession(); return s ? s.token : null; },
        scope: function () { var s = readSession(); return s ? s.scope : null; },
        login: login,
        check: check,
        logout: clearSession,
        openDialog: openDialog
    };
})(typeof window !== 'undefined' ? window : this);
