/* =========================================================================
   Bá Khí — bk-ai-tutor.js (8.5.0)
   Gia sư AI: hội thoại, 8 chế độ học tập, ngữ cảnh học tập, lịch sử.

   Nguyên tắc:
   - KHÔNG gọi trực tiếp nhà cung cấp AI. Mọi request đi qua Edge Function
     `ai-tutor-api`; khoá API chỉ nằm trong Supabase Secrets.
   - Toàn bộ nội dung render bằng DOM/textContent. Markdown được dựng thành
     phần tử, không dùng innerHTML cho dữ liệu người dùng. KaTeX (nếu có) chỉ
     nhận công thức đã tách khỏi văn bản với trust = false.
   - Dừng câu trả lời = huỷ request thật (AbortController).
   - Không có đồng hồ đếm ngược, không bài thi, không xếp hạng.

   Công khai: window.BKAITutor
     .mount(root)            gắn giao diện đầy đủ (trang /ai-tutor/)
     .open({mode,context})   mở bảng nổi
     .close()
     .explain(context)       hỏi nhanh về nội dung đang xem
     .analyzeMistake(entry)  mở chế độ phân tích lỗi với dữ liệu sổ tay câu sai
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKAITutor) return;

    var MODE_FALLBACK = [
        { id: 'explain', label: 'Giải thích', hint: 'Hiểu một khái niệm, công thức, bài học' },
        { id: 'steps', label: 'Từng bước', hint: 'Giải bài tập theo từng bước có lý do' },
        { id: 'hint', label: 'Gợi ý', hint: 'Chỉ gợi ý, không đưa đáp án ngay' },
        { id: 'check', label: 'Kiểm tra bài làm', hint: 'Soát bài làm và chỉ chỗ cần sửa' },
        { id: 'practice', label: 'Luyện tập', hint: 'Tạo câu hỏi luyện tập kèm lời giải' },
        { id: 'mistakes', label: 'Phân tích lỗi', hint: 'Vì sao sai và cần học lại phần nào' },
        { id: 'summary', label: 'Tóm tắt', hint: 'Ý chính, bảng so sánh, checklist ôn' },
        { id: 'socratic', label: 'Hỏi dẫn dắt', hint: 'Học qua câu hỏi, tự tìm ra lời giải' }
    ];

    var S = {
        layout: 'page', root: null, dock: null, fab: null, launcher: null,
        booted: false, loading: false, config: null,
        conversations: [], active: null, messages: [],
        mode: 'explain', filter: '', showArchived: false,
        sending: false, error: null, errorCode: '', errorDetail: null, controller: null,
        pending: '', usage: null, context: null, notice: '',
        nearBottom: true, bootError: null
    };

    /* ---------------------------------------------------------------------
       Tiện ích
       ------------------------------------------------------------------ */
    function el(tag, cls, text) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = String(text);
        return n;
    }
    function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
    function on(n, t, fn) { if (n) n.addEventListener(t, fn); }
    function icon(name, cls) {
        var i = D.createElement('i');
        i.className = 'fa-solid ' + name + (cls ? ' ' + cls : '');
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function btn(label, cls, iconName) {
        var b = el('button', cls || 'bk-btn bk-btn-sm');
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        if (label) b.appendChild(el('span', null, label));
        return b;
    }
    function toast(msg, kind) {
        try { if (global.BK && global.BK.ui && global.BK.ui.toast) { global.BK.ui.toast(msg, kind || 'info'); return; } } catch (e) { }
    }
    function confirmBox(message, okLabel) {
        try {
            if (global.BK && global.BK.ui && global.BK.ui.confirm) {
                return global.BK.ui.confirm({ title: 'Xác nhận', message: message, confirmText: okLabel || 'Đồng ý' });
            }
        } catch (e) { }
        return Promise.resolve(true);
    }
    function apiReady() {
        return !!(global.BKCloud && global.BKCloud.configured && global.BKCloud.configured());
    }
    function cfgOf(id) {
        var list = (S.config && S.config.modes) || MODE_FALLBACK;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    /* Gọi Edge Function với AbortController để "Dừng" là huỷ request thật. */
    function post(body, signal) {
        var cfg = global.BK_SUPABASE;
        if (!apiReady() || !cfg || !cfg.url) {
            return Promise.reject(new Error('Trợ lý AI cần kết nối máy chủ.'));
        }
        return global.BKCloud.chatClient().then(function (client) {
            return client.auth.getSession().then(function (res) {
                var session = res && res.data && res.data.session;
                var token = session && session.access_token;
                if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Hãy tải lại trang chủ để nhận diện lại.');
                var url = String(cfg.url).replace(/\/+$/, '') + '/functions/v1/' +
                    ((cfg.functions && cfg.functions.aiTutor) || 'ai-tutor-api');
                return global.fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: cfg.key,
                        Authorization: 'Bearer ' + token
                    },
                    body: JSON.stringify(body || {}),
                    signal: signal
                });
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
                return data.data || data;
            });
        });
    }

    function abortError() {
        var e = new Error('Đã dừng câu trả lời.');
        e.code = 'ABORTED';
        return e;
    }

    /* ---------------------------------------------------------------------
       Markdown an toàn → DOM (không dùng innerHTML cho dữ liệu người dùng)
       ------------------------------------------------------------------ */
    function mathNode(expr, display) {
        var span = el('span', 'bkai-math' + (display ? ' is-block' : ''));
        if (global.katex && typeof global.katex.renderToString === 'function') {
            try {
                span.innerHTML = global.katex.renderToString(expr, {
                    displayMode: !!display, throwOnError: false, trust: false, strict: false
                });
                return span;
            } catch (e) { /* rơi về hiển thị văn bản */ }
        }
        span.appendChild(el('code', null, expr));
        return span;
    }

    /* Regex nghiêng dùng lookbehind — trình duyệt cũ không hỗ trợ. Dựng trong
       try/catch để module không chết ở cú pháp, và rơi về bộ đơn giản hơn. */
    var INLINE = [];
    try {
        INLINE = [
            { re: new RegExp('(?<![\\w*])\\*([^*\\n]+)\\*(?![\\w*])', 'g'), kind: 'em' },
            { re: new RegExp('(?<![\\w_])_([^_\\n]+)_(?![\\w_])', 'g'), kind: 'em' }
        ];
    } catch (e) {
        INLINE = [];
    }
    INLINE = [
        { re: /`([^`]+)`/g, kind: 'code' }
    ].concat([
        { re: /\*\*([^*]+)\*\*/g, kind: 'strong' },
        { re: /__([^_]+)__/g, kind: 'strong' }
    ], INLINE, [
        { re: /~~([^~]+)~~/g, kind: 'del' }
    ]);

    function safeHref(raw) {
        var url = String(raw || '').trim();
        if (!/^(https?:\/\/|mailto:|\/|\.\.?\/|#)/i.test(url)) return '';
        if (/^javascript:/i.test(url)) return '';
        return url;
    }

    /* Duyệt chuỗi và dựng node: code > math > link > nhấn mạnh. */
    function inlineNodes(text, into) {
        var src = String(text || '');
        var i = 0;
        var buffer = '';
        function flush() {
            if (buffer) { into.appendChild(D.createTextNode(buffer)); buffer = ''; }
        }
        while (i < src.length) {
            /* công thức $...$ / $$...$$ */
            if (src.charAt(i) === '$') {
                var display = src.charAt(i + 1) === '$';
                var fence = display ? '$$' : '$';
                var end = src.indexOf(fence, i + fence.length);
                if (end > i + fence.length) {
                    var expr = src.slice(i + fence.length, end);
                    if (expr.indexOf('\n') === -1 || display) {
                        flush();
                        into.appendChild(mathNode(expr, display));
                        i = end + fence.length;
                        continue;
                    }
                }
            }
            /* `code` */
            if (src.charAt(i) === '`') {
                var cEnd = src.indexOf('`', i + 1);
                if (cEnd > i + 1) {
                    flush();
                    into.appendChild(el('code', 'bkai-inline-code', src.slice(i + 1, cEnd)));
                    i = cEnd + 1;
                    continue;
                }
            }
            /* [label](url) */
            if (src.charAt(i) === '[') {
                var close = src.indexOf(']', i + 1);
                if (close > i && src.charAt(close + 1) === '(') {
                    var paren = src.indexOf(')', close + 2);
                    if (paren > close) {
                        var href = safeHref(src.slice(close + 2, paren));
                        var label = src.slice(i + 1, close);
                        if (href) {
                            flush();
                            var a = el('a', 'bkai-link');
                            a.href = href;
                            if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                            inlineNodes(label, a);
                            into.appendChild(a);
                            i = paren + 1;
                            continue;
                        }
                    }
                }
            }
            /* **đậm** *nghiêng* ~~gạch~~ */
            var matched = false;
            for (var k = 0; k < INLINE.length; k++) {
                var rule = INLINE[k];
                rule.re.lastIndex = i;
                var m = rule.re.exec(src);
                if (m && m.index === i) {
                    flush();
                    var tag = rule.kind === 'strong' ? 'strong'
                        : rule.kind === 'em' ? 'em'
                            : rule.kind === 'del' ? 'del' : 'code';
                    var node = el(tag);
                    if (rule.kind === 'code') node.className = 'bkai-inline-code';
                    /* Nội dung bên trong ** ** không đệ quy để tránh vòng lặp. */
                    node.textContent = m[1];
                    into.appendChild(node);
                    i += m[0].length;
                    matched = true;
                    break;
                }
            }
            if (matched) continue;
            buffer += src.charAt(i);
            i++;
        }
        flush();
    }

    function inlineP(text) {
        var p = el('p');
        inlineNodes(text, p);
        return p;
    }

    function splitRow(line) {
        var cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
        return cells.map(function (c) { return c.trim(); });
    }
    function isTableSep(line) {
        return /^\s*\|?[\s:-]*-[\s|:-]*$/.test(line) && line.indexOf('|') !== -1;
    }

    function renderMarkdown(text) {
        var frag = D.createDocumentFragment();
        var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
        var i = 0;
        var para = [];

        function flushPara() {
            if (!para.length) return;
            frag.appendChild(inlineP(para.join(' ')));
            para = [];
        }

        while (i < lines.length) {
            var line = lines[i];

            /* khối code ``` */
            var fence = line.match(/^\s*```([A-Za-z0-9#+._-]*)\s*$/);
            if (fence) {
                flushPara();
                var lang = fence[1] || '';
                var buf = [];
                i++;
                while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
                i++;
                var wrap = el('div', 'bkai-code');
                var head = el('div', 'bkai-code-head');
                head.appendChild(el('span', null, lang || 'code'));
                var copyBtn = btn('Sao chép', 'bkai-code-copy', 'fa-copy');
                var codeText = buf.join('\n');
                copyBtn.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    copyText(codeText).then(function () { toast('Đã sao chép đoạn mã.', 'success'); });
                });
                head.appendChild(copyBtn);
                wrap.appendChild(head);
                var pre = D.createElement('pre');
                var code = D.createElement('code');
                code.textContent = codeText;
                pre.appendChild(code);
                wrap.appendChild(pre);
                frag.appendChild(wrap);
                continue;
            }

            /* $$ khối công thức nhiều dòng $$ */
            if (/^\s*\$\$\s*$/.test(line)) {
                flushPara();
                var eq = [];
                i++;
                while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) { eq.push(lines[i]); i++; }
                i++;
                var block = el('div', 'bkai-math-block');
                block.appendChild(mathNode(eq.join('\n'), true));
                frag.appendChild(block);
                continue;
            }

            /* tiêu đề */
            var h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) {
                flushPara();
                var level = Math.min(6, h[1].length + 1);
                var hd = el('h' + String(level), 'bkai-h');
                inlineNodes(h[2], hd);
                frag.appendChild(hd);
                i++;
                continue;
            }

            /* đường kẻ */
            if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                flushPara();
                frag.appendChild(el('hr', 'bkai-hr'));
                i++;
                continue;
            }

            /* trích dẫn */
            if (/^\s*>\s?/.test(line)) {
                flushPara();
                var quote = el('blockquote', 'bkai-quote');
                var qLines = [];
                while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                    qLines.push(lines[i].replace(/^\s*>\s?/, ''));
                    i++;
                }
                var qp = el('p');
                inlineNodes(qLines.join(' '), qp);
                quote.appendChild(qp);
                frag.appendChild(quote);
                continue;
            }

            /* bảng */
            if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
                flushPara();
                var headCells = splitRow(line);
                i += 2;
                var table = D.createElement('table');
                table.className = 'bkai-table';
                var thead = D.createElement('thead');
                var htr = D.createElement('tr');
                headCells.forEach(function (c) {
                    var th = D.createElement('th');
                    inlineNodes(c, th);
                    htr.appendChild(th);
                });
                thead.appendChild(htr);
                table.appendChild(thead);
                var tbody = D.createElement('tbody');
                while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim() !== '') {
                    var tr = D.createElement('tr');
                    splitRow(lines[i]).forEach(function (c) {
                        var td = D.createElement('td');
                        inlineNodes(c, td);
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                    i++;
                }
                table.appendChild(tbody);
                var tw = el('div', 'bkai-table-wrap');
                tw.appendChild(table);
                frag.appendChild(tw);
                continue;
            }

            /* danh sách */
            var ul = line.match(/^\s*([-*+])\s+(.*)$/);
            var ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
            if (ul || ol) {
                flushPara();
                var ordered = !!ol;
                var list = D.createElement(ordered ? 'ol' : 'ul');
                list.className = 'bkai-list';
                while (i < lines.length) {
                    var mu = lines[i].match(/^\s*[-*+]\s+(.*)$/);
                    var mo = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
                    if (ordered && !mo) break;
                    if (!ordered && !mu) break;
                    var li = D.createElement('li');
                    inlineNodes((ordered ? mo[1] : mu[1]), li);
                    list.appendChild(li);
                    i++;
                }
                frag.appendChild(list);
                continue;
            }

            if (/^\s*$/.test(line)) { flushPara(); i++; continue; }
            para.push(line.trim());
            i++;
        }
        flushPara();
        return frag;
    }

    function copyText(text) {
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(String(text)).catch(function () { return legacyCopy(text); });
        }
        return legacyCopy(text);
    }
    function legacyCopy(text) {
        return new Promise(function (resolve, reject) {
            try {
                var ta = D.createElement('textarea');
                ta.value = String(text);
                ta.setAttribute('readonly', 'readonly');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                D.body.appendChild(ta);
                ta.select();
                var ok = D.execCommand && D.execCommand('copy');
                D.body.removeChild(ta);
                ok ? resolve() : reject(new Error('Không sao chép được.'));
            } catch (e) { reject(e); }
        });
    }

    /* ---------------------------------------------------------------------
       Ngữ cảnh học tập tự nhận biết
       ------------------------------------------------------------------ */
    var SUBJECT_BY_DIR = {
        ktgk1: 'Kiểm tra giữa kỳ 1', ktgk2: 'Kiểm tra giữa kỳ 2',
        ktck1: 'Kiểm tra cuối kỳ 1', ktck2: 'Kiểm tra cuối kỳ 2',
        kttx: 'Kiểm tra thường xuyên'
    };
    function pageContext() {
        var path = String(global.location && global.location.pathname || '/');
        var seg = path.split('/').filter(Boolean);
        var ctx = { page: 'Trang Bá Khí' };
        var first = seg[0] || '';
        if (SUBJECT_BY_DIR[first]) ctx.subject = SUBJECT_BY_DIR[first];
        var h1 = D.querySelector('h1');
        var title = (h1 && h1.textContent) || D.title || '';
        if (title) ctx.lesson = String(title).replace(/\s+/g, ' ').trim().slice(0, 200);
        ctx.page = path.slice(0, 120);
        ctx.source_url = String(global.location && global.location.href || '').slice(0, 300);
        return ctx;
    }

    /* ---------------------------------------------------------------------
       Giao diện
       ------------------------------------------------------------------ */
    function modeChip(id, current) {
        var meta = cfgOf(id) || { id: id, label: id, hint: '' };
        var b = btn(meta.label, 'bkai-mode' + (current === id ? ' is-active' : ''), null);
        b.setAttribute('data-mode', id);
        b.title = meta.hint || meta.label;
        b.setAttribute('aria-pressed', current === id ? 'true' : 'false');
        return b;
    }

    function renderModes(host) {
        if (!host) return;
        clear(host);
        var allowed = (S.config && S.config.modes) || MODE_FALLBACK;
        allowed.forEach(function (m) {
            host.appendChild(modeChip(m.id, S.mode));
        });
    }

    function changeMode(id, host) {
        S.mode = id;
        if (S.active) {
            /* Đổi chế độ trong hội thoại hiện tại: chỉ đổi cách trả lời tiếp theo. */
            S.active.mode = id;
        }
        renderModes(host || D.getElementById('bkaiModes'));
        var meta = cfgOf(id);
        S.notice = meta ? ('Chế độ ' + meta.label + ': ' + meta.hint + '.') : '';
        renderNotice();
    }

    function renderNotice() {
        var host = D.getElementById('bkaiNotice');
        if (!host) return;
        clear(host);
        if (S.notice) host.appendChild(el('span', null, S.notice));
        var ctx = S.context;
        if (ctx && (ctx.subject || ctx.lesson)) {
            var chip = el('span', 'bkai-ctx');
            chip.appendChild(icon('fa-book-open'));
            var bits = [];
            if (ctx.subject) bits.push(ctx.subject);
            if (ctx.lesson) bits.push(ctx.lesson);
            chip.appendChild(el('span', null, 'Đang hỏi về: ' + bits.join(' · ')));
            host.appendChild(chip);
        }
        host.hidden = !host.childNodes.length;
    }

    function usageLine() {
        var wrap = el('div', 'bkai-usage');
        var u = S.usage || {};
        var limits = (S.config && S.config.limits) || {};
        var used = Number(u.requests) || 0;
        var limit = Number(limits.dailyRequests) || 0;
        wrap.appendChild(el('span', null,
            limit > 0
                ? ('Hôm nay: ' + used + '/' + limit + ' câu hỏi')
                : ('Hôm nay: ' + used + ' câu hỏi')));
        wrap.title = 'Hạn mức được tính lại sau 24 giờ. Hết hạn mức AI không ảnh hưởng việc học bình thường.';
        return wrap;
    }

    function buildShell(root, layout) {
        S.layout = layout;
        S.root = root;
        root.classList.add('bkai', layout === 'page' ? 'bkai-page' : 'bkai-dock');
        clear(root);

        var shell = el('div', 'bkai-shell');
        S.shell = shell;

        /* --- danh sách hội thoại --- */
        var side = el('aside', 'bkai-side');
        side.id = 'bkaiSide';
        side.setAttribute('aria-label', 'Danh sách hội thoại');
        S.side = side;
        var sideHead = el('div', 'bkai-side-head');
        sideHead.appendChild(el('h2', 'bkai-side-title', 'Trợ lý AI'));
        side.appendChild(sideHead);

        var newBtn = btn('Hội thoại mới', 'bkai-new', 'fa-plus');
        S.newBtn = newBtn;
        on(newBtn, 'click', function () { startNew(); });
        side.appendChild(newBtn);

        var searchWrap = el('div', 'bkai-search');
        searchWrap.appendChild(icon('fa-magnifying-glass'));
        var search = D.createElement('input');
        search.type = 'search';
        search.id = 'bkaiSearch';
        search.placeholder = 'Tìm hội thoại…';
        search.setAttribute('aria-label', 'Tìm hội thoại');
        on(search, 'input', function () {
            S.filter = String(search.value || '').trim().toLowerCase();
            renderConversations();
        });
        searchWrap.appendChild(search);
        side.appendChild(searchWrap);

        var list = el('div', 'bkai-convs');
        list.id = 'bkaiConvs';
        list.setAttribute('role', 'list');
        side.appendChild(list);

        var sideFoot = el('div', 'bkai-side-foot');
        sideFoot.appendChild(usageLine());
        var settingsLink = el('a', 'bkai-side-link', 'Cài đặt tài khoản');
        settingsLink.href = baseHref() + 'settings/';
        sideFoot.appendChild(settingsLink);
        side.appendChild(sideFoot);

        /* --- khung hội thoại --- */
        var main = el('section', 'bkai-main');
        var head = el('header', 'bkai-head');
        head.id = 'bkaiHead';
        main.appendChild(head);

        var notice = el('div', 'bkai-notice');
        notice.id = 'bkaiNotice';
        notice.hidden = true;
        main.appendChild(notice);

        var modes = el('div', 'bkai-modes');
        modes.id = 'bkaiModes';
        modes.setAttribute('role', 'toolbar');
        modes.setAttribute('aria-label', 'Chọn chế độ học tập');
        /* Uỷ quyền sự kiện: renderModes() dựng lại các chip, nên gắn listener
           trên khung chứ không gắn lên từng chip. */
        on(modes, 'click', function (e) {
            var hit = e.target && e.target.closest ? e.target.closest('[data-mode]') : null;
            if (!hit) return;
            changeMode(hit.getAttribute('data-mode'));
        });
        main.appendChild(modes);

        var thread = el('div', 'bkai-thread');
        thread.id = 'bkaiThread';
        thread.setAttribute('role', 'log');
        thread.setAttribute('aria-live', 'polite');
        on(thread, 'scroll', function () {
            var box = D.getElementById('bkaiThread');
            if (!box) return;
            S.nearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) <= 120;
            paintJump();
        });
        main.appendChild(thread);

        var jump = btn('Xuống cuối', 'bkai-jump', 'fa-arrow-down');
        jump.id = 'bkaiJump';
        jump.hidden = true;
        on(jump, 'click', function () { scrollToEnd(true); });
        main.appendChild(jump);

        var composer = el('form', 'bkai-composer');
        composer.id = 'bkaiComposer';
        composer.noValidate = true;
        var row = el('div', 'bkai-composer-row');
        var input = D.createElement('textarea');
        input.id = 'bkaiInput';
        input.rows = 1;
        input.maxLength = 4000;
        input.placeholder = 'Hỏi bất cứ điều gì về bài đang học…';
        input.setAttribute('aria-label', 'Câu hỏi cho trợ lý AI');
        on(input, 'keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                send();
            }
        });
        on(input, 'input', function () {
            input.style.height = 'auto';
            input.style.height = Math.min(150, input.scrollHeight) + 'px';
            paintComposer();
        });
        row.appendChild(input);

        var stopBtn = btn('Dừng', 'bkai-send bkai-stop', 'fa-stop');
        stopBtn.id = 'bkaiStop';
        stopBtn.hidden = true;
        on(stopBtn, 'click', function () { stop(); });
        row.appendChild(stopBtn);

        var sendBtn = btn('Gửi', 'bkai-send', 'fa-paper-plane');
        sendBtn.id = 'bkaiSend';
        sendBtn.type = 'submit';
        row.appendChild(sendBtn);
        composer.appendChild(row);

        var foot = el('div', 'bkai-composer-foot');
        foot.appendChild(el('span', null,
            'Trợ lý AI có thể trả lời chưa chính xác. Hãy đối chiếu với bài học. Enter để gửi, Shift+Enter để xuống dòng.'));
        composer.appendChild(foot);

        on(composer, 'submit', function (e) { e.preventDefault(); send(); });
        main.appendChild(composer);

        shell.appendChild(side);
        shell.appendChild(main);
        root.appendChild(shell);

        /* Trang đầy đủ: lớp phủ đóng sidebar trên điện thoại (không có ở bảng nổi). */
        if (layout === 'page') {
            var scrim = el('div', 'bkai-side-scrim');
            scrim.setAttribute('aria-hidden', 'true');
            on(scrim, 'click', function () { setSidebar(false); });
            root.insertBefore(scrim, shell);
            S.sideScrim = scrim;
            if (!S.sideKeys) {
                S.sideKeys = true;
                D.addEventListener('keydown', function (e) {
                    if (e.key === 'Escape' && S.sideOpen) { e.preventDefault(); setSidebar(false); }
                });
            }
        }

        renderModes(modes);
        renderHead();
        renderNotice();
        renderConversations();
        renderThread();
        paintComposer();
        return shell;
    }

    /* Tiền tố tương đối tới gốc website, suy ra từ đường dẫn CSS dùng chung
       (hoạt động cả trên GitHub Pages /bakhi/ và khi chạy ở máy cục bộ). */
    function baseHref() {
        var link = D.querySelector('link[href*="assets/bakhi/"]');
        if (link) {
            var href = String(link.getAttribute('href') || '');
            var idx = href.indexOf('assets/bakhi/');
            if (idx >= 0) return href.slice(0, idx);
        }
        return '';
    }

    function renderHead() {
        var head = D.getElementById('bkaiHead');
        if (!head) return;
        clear(head);
        /* Điện thoại: nút mở lịch sử trò chuyện ở góc trên bên trái (kiểu ChatGPT). */
        if (S.layout === 'page') {
            var menu = btn('', 'bkai-icon-btn bkai-menu-btn', 'fa-bars');
            menu.id = 'bkaiMenuBtn';
            menu.setAttribute('aria-label', 'Mở lịch sử trò chuyện');
            menu.setAttribute('aria-controls', 'bkaiSide');
            menu.setAttribute('aria-expanded', S.sideOpen ? 'true' : 'false');
            menu.title = 'Lịch sử trò chuyện';
            on(menu, 'click', function () { setSidebar(!S.sideOpen); });
            head.appendChild(menu);
        }
        var title = S.active ? String(S.active.title || 'Hội thoại') : 'Trợ lý AI';
        head.appendChild(el('div', 'bkai-head-title', title));
        var sub = el('div', 'bkai-head-sub');
        if (S.active) {
            var meta = cfgOf(S.active.mode);
            sub.appendChild(el('span', null, meta ? meta.label : 'Học tập'));
            if (S.active.message_count) sub.appendChild(el('span', null, ' · ' + S.active.message_count + ' tin nhắn'));
            if (S.active.model) sub.appendChild(el('span', null, ' · ' + S.active.model));
        } else {
            sub.appendChild(el('span', null, 'Chọn một chế độ rồi đặt câu hỏi để bắt đầu.'));
        }
        var actions = el('div', 'bkai-head-actions');
        if (S.active) {
            var rename = btn('', 'bkai-icon-btn', 'fa-pen');
            rename.setAttribute('aria-label', 'Đổi tên hội thoại');
            rename.title = 'Đổi tên';
            on(rename, 'click', renameActive);
            actions.appendChild(rename);
            var del = btn('', 'bkai-icon-btn', 'fa-trash-can');
            del.setAttribute('aria-label', 'Xoá hội thoại');
            del.title = 'Xoá hội thoại';
            on(del, 'click', deleteActive);
            actions.appendChild(del);
        }
        /* Nút X CHỈ nằm trong cửa sổ trợ lý AI (bảng nổi), không nằm cạnh nút
           "Hỏi AI". Đóng cửa sổ không xoá hội thoại: S.messages vẫn giữ nguyên. */
        if (S.layout === 'dock') {
            var closeWin = btn('', 'bkai-icon-btn bkai-close', 'fa-xmark');
            closeWin.setAttribute('aria-label', 'Đóng cửa sổ trợ lý AI');
            closeWin.title = 'Đóng cửa sổ';
            on(closeWin, 'click', function () { close(); });
            actions.appendChild(closeWin);
        }
        if (actions.childNodes.length) head.appendChild(actions);
        /* Dòng phụ nằm dưới cùng hàng tiêu đề (CSS order 4). */
        head.appendChild(sub);
    }

    /* Sidebar lịch sử kiểu ChatGPT trên điện thoại (8.5.5).
       Chỉ có tác dụng ở trang đầy đủ; desktop vẫn hiện sidebar như cũ vì
       CSS chỉ biến nó thành off-canvas dưới 860px. */
    function setSidebar(open) {
        if (S.layout !== 'page' || !S.root) return;
        S.sideOpen = !!open;
        S.root.classList.toggle('is-side-open', S.sideOpen);
        if (D.documentElement && D.documentElement.classList) {
            D.documentElement.classList.toggle('bkai-side-lock', S.sideOpen);
        }
        var menu = D.getElementById('bkaiMenuBtn');
        if (menu) menu.setAttribute('aria-expanded', S.sideOpen ? 'true' : 'false');
        if (!S.sideOpen && menu && S.side && D.activeElement &&
            S.side.contains(D.activeElement)) {
            menu.focus();
        }
    }

    function renderConversations() {
        var box = D.getElementById('bkaiConvs');
        if (!box) return;
        clear(box);
        var list = S.conversations.slice();
        if (S.filter) {
            list = list.filter(function (c) {
                return String(c.title || '').toLowerCase().indexOf(S.filter) !== -1;
            });
        }
        if (!list.length) {
            box.appendChild(el('div', 'bkai-empty-small',
                S.filter ? 'Không tìm thấy hội thoại.' : 'Chưa có hội thoại. Đặt câu hỏi đầu tiên nhé.'));
            return;
        }
        list.forEach(function (c) {
            var row = el('button', 'bkai-conv' + (S.active && S.active.id === c.id ? ' is-active' : ''));
            row.type = 'button';
            row.setAttribute('role', 'listitem');
            row.setAttribute('data-conv', c.id);
            var top = el('span', 'bkai-conv-top');
            top.appendChild(el('span', 'bkai-conv-title', c.title || 'Hội thoại'));
            top.appendChild(el('span', 'bkai-conv-mode', (cfgOf(c.mode) || {}).label || ''));
            row.appendChild(top);
            row.appendChild(el('span', 'bkai-conv-time', shortTime(c.last_message_at)));
            on(row, 'click', function () { openConversation(c.id); });
            box.appendChild(row);
        });
    }

    function shortTime(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var now = new Date();
        var same = d.toDateString() === now.toDateString();
        var hh = String(d.getHours()).padStart(2, '0');
        var mm = String(d.getMinutes()).padStart(2, '0');
        if (same) return hh + ':' + mm;
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    }

    function renderThread() {
        var box = D.getElementById('bkaiThread');
        if (!box) return;
        clear(box);

        if (S.bootError) {
            box.appendChild(bootNotice(S.bootError));
            return;
        }
        if (!S.messages.length && !S.sending) {
            box.appendChild(welcomeBlock());
            return;
        }
        S.messages.forEach(function (m) {
            box.appendChild(messageBlock(m));
        });
        if (S.sending) {
            var thinking = el('div', 'bkai-msg is-assistant is-thinking');
            thinking.appendChild(el('div', 'bkai-msg-role', 'Trợ lý AI'));
            var dots = el('div', 'bkai-dots');
            dots.appendChild(el('span'));
            dots.appendChild(el('span'));
            dots.appendChild(el('span'));
            thinking.appendChild(dots);
            thinking.appendChild(el('div', 'bkai-thinking-text',
                S.pending ? 'Đang xem lại câu hỏi của bạn…' : 'Đang suy nghĩ…'));
            box.appendChild(thinking);
        }
        if (S.error) {
            var err = el('div', 'bkai-error');
            err.appendChild(icon('fa-triangle-exclamation'));
            var body = el('div', 'bkai-error-body');
            body.appendChild(el('p', null, S.error));
            if (S.errorCode === 'NO_KEY' || S.errorCode === 'MODEL_NOT_FOUND' || S.errorCode === 'BAD_CONFIG') {
                body.appendChild(el('p', 'bkai-error-hint',
                    'Phần này do ban quản trị cấu hình. Việc học ở các trang bài học vẫn hoạt động bình thường.'));
            }
            var row = el('div', 'bkai-error-actions');
            var retry = btn('Thử lại', 'bkai-retry', 'fa-rotate-right');
            on(retry, 'click', function () { retryLast(); });
            row.appendChild(retry);
            if (S.errorDetail) {
                var more = btn('Xem chi tiết', 'bkai-retry bkai-error-more', 'fa-circle-info');
                on(more, 'click', function () { openErrorDetail(); });
                row.appendChild(more);
            }
            body.appendChild(row);
            err.appendChild(body);
            box.appendChild(err);
        }
        scrollToEnd(false);
    }

    /* ---------------------------------------------------------------------
       Chi tiết lỗi nhà cung cấp (8.5.4) — cửa sổ riêng, có nút X
       Chỉ hiển thị dữ liệu máy chủ đã lọc: provider, model, mã HTTP, loại lỗi,
       thời điểm, trạng thái dự phòng và các model đã thử. KHÔNG BAO GIỜ có
       API key, Authorization header hay raw response.
       ------------------------------------------------------------------ */
    function fmtClock(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        function p(n) { return String(n).padStart(2, '0'); }
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
            ' · ' + p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    function errorDetailDialog() {
        var existing = D.getElementById('bkaiErrDlg');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        var d = S.errorDetail;
        if (!d) return null;
        var wrap = el('div', 'bkai-dlg-wrap');
        wrap.id = 'bkaiErrDlg';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-label', 'Chi tiết lỗi nhà cung cấp AI');
        var scrim = el('div', 'bkai-dlg-scrim');
        on(scrim, 'click', closeErrorDetail);
        wrap.appendChild(scrim);

        var box = el('div', 'bkai-dlg');
        var head = el('div', 'bkai-dlg-head');
        head.appendChild(el('h3', null, 'Chi tiết lỗi nhà cung cấp'));
        var x = btn('', 'bkai-icon-btn bkai-close', 'fa-xmark');
        x.setAttribute('aria-label', 'Đóng chi tiết lỗi');
        x.title = 'Đóng';
        on(x, 'click', closeErrorDetail);
        head.appendChild(x);
        box.appendChild(head);

        var body = el('div', 'bkai-dlg-body');
        var rows = [
            ['Nhà cung cấp', d.provider || '—'],
            ['Model', d.model || '—'],
            ['Mã lỗi HTTP', d.status ? String(d.status) : 'Không có'],
            ['Loại lỗi', d.type || '—'],
            ['Thời điểm', fmtClock(d.at)],
            ['Đã chuyển dự phòng', d.fellBack ? 'Có' : 'Không'],
            ['Model tiếp theo', d.nextModel || '—']
        ];
        var table = el('dl', 'bkai-dlg-list');
        rows.forEach(function (pair) {
            table.appendChild(el('dt', null, pair[0]));
            table.appendChild(el('dd', null, pair[1]));
        });
        body.appendChild(table);

        if (Array.isArray(d.attempts) && d.attempts.length) {
            body.appendChild(el('h4', 'bkai-dlg-sub', 'Các model đã thử'));
            var list = el('ul', 'bkai-dlg-attempts');
            d.attempts.forEach(function (a) {
                var li = el('li');
                li.appendChild(el('span', 'bkai-dlg-att-name', (a.provider || '—') + ' · ' + (a.model || '—')));
                li.appendChild(el('span', 'bkai-dlg-att-state' + (a.ok ? ' is-ok' : ' is-bad'),
                    (a.ok ? 'Thành công' : (a.code || 'Lỗi')) +
                    (a.latencyMs ? ' · ' + a.latencyMs + 'ms' : '')));
                list.appendChild(li);
            });
            body.appendChild(list);
        }
        body.appendChild(el('p', 'bkai-dlg-note',
            'Thông tin này không chứa khoá API hay dữ liệu nội bộ. Nếu lỗi lặp lại, bạn thử lại sau hoặc báo Ban quản trị.'));
        box.appendChild(body);
        wrap.appendChild(box);
        (D.body || D.documentElement).appendChild(wrap);
        if (x.focus) x.focus();
        return wrap;
    }

    function openErrorDetail() {
        var dlg = errorDetailDialog();
        if (!dlg) return;
        D.addEventListener('keydown', errDlgKey);
    }

    function errDlgKey(e) {
        if (e && e.key === 'Escape') closeErrorDetail();
    }

    function closeErrorDetail() {
        var dlg = D.getElementById('bkaiErrDlg');
        if (dlg && dlg.parentNode) dlg.parentNode.removeChild(dlg);
        D.removeEventListener('keydown', errDlgKey);
    }

    function bootNotice(text) {
        var box = el('div', 'bkai-boot');
        box.appendChild(icon('fa-robot'));
        box.appendChild(el('p', null, text));
        var reload = btn('Tải lại', 'bkai-retry', 'fa-rotate-right');
        on(reload, 'click', function () { boot(true); });
        box.appendChild(reload);
        return box;
    }

    function welcomeBlock() {
        var wrap = el('div', 'bkai-welcome');
        wrap.appendChild(el('h2', null, 'Học cùng trợ lý AI'));
        wrap.appendChild(el('p', null,
            'Chọn một chế độ bên dưới rồi đặt câu hỏi. Trợ lý AI giải thích theo cách bạn cần, ' +
            'có thể gợi ý trước thay vì đưa đáp án ngay.'));
        var grid = el('div', 'bkai-suggest');
        var ideas = [
            { mode: 'explain', text: 'Giải thích công thức này bằng ví dụ dễ hiểu' },
            { mode: 'steps', text: 'Giải bài tập này từng bước, nói rõ vì sao' },
            { mode: 'hint', text: 'Chỉ gợi ý hướng làm, đừng cho đáp án' },
            { mode: 'check', text: 'Kiểm tra bài làm của mình và chỉ chỗ sai' },
            { mode: 'practice', text: 'Tạo 5 câu luyện tập kèm lời giải' },
            { mode: 'socratic', text: 'Hỏi mình từng câu để mình tự tìm ra cách giải' }
        ];
        ideas.forEach(function (idea) {
            var b = btn(idea.text, 'bkai-suggest-btn', null);
            on(b, 'click', function () {
                changeMode(idea.mode);
                var input = D.getElementById('bkaiInput');
                if (input) { input.value = idea.text; input.focus(); paintComposer(); }
            });
            grid.appendChild(b);
        });
        wrap.appendChild(grid);
        if (S.config && !S.config.connected) {
            var warn = el('div', 'bkai-warn');
            warn.appendChild(icon('fa-key'));
            warn.appendChild(el('span', null,
                S.config.mock
                    ? 'Máy chủ đang chạy chế độ giả lập (AI_TUTOR_MOCK). Câu trả lời KHÔNG phải từ AI thật.'
                    : 'Trợ lý AI chưa có khoá API. Ban quản trị cần thêm khoá trong Supabase Secrets.'));
            wrap.appendChild(warn);
        }
        if (S.config && S.config.mock) {
            var mock = el('div', 'bkai-warn is-mock');
            mock.appendChild(el('span', null, 'Chế độ giả lập đang bật — chỉ dùng để kiểm thử kết nối.'));
            wrap.appendChild(mock);
        }
        return wrap;
    }

    function messageBlock(m) {
        var isUser = m.role === 'user';
        var wrap = el('div', 'bkai-msg' + (isUser ? ' is-user' : ' is-assistant'));
        var role = el('div', 'bkai-msg-role');
        role.appendChild(el('span', null, isUser ? 'Bạn' : 'Trợ lý AI'));
        if (!isUser && m.model) role.appendChild(el('span', 'bkai-msg-model', String(m.model)));
        wrap.appendChild(role);

        var body = el('div', 'bkai-msg-body');
        body.appendChild(renderMarkdown(m.content));
        wrap.appendChild(body);

        if (!isUser) {
            var actions = el('div', 'bkai-msg-actions');
            var copy = btn('', 'bkai-icon-btn', 'fa-copy');
            copy.setAttribute('aria-label', 'Sao chép câu trả lời');
            copy.title = 'Sao chép';
            on(copy, 'click', function () {
                copyText(m.content).then(function () { toast('Đã sao chép câu trả lời.', 'success'); });
            });
            actions.appendChild(copy);
            wrap.appendChild(actions);
        }
        return wrap;
    }

    function paintComposer() {
        var input = D.getElementById('bkaiInput');
        var sendBtn = D.getElementById('bkaiSend');
        var stopBtn = D.getElementById('bkaiStop');
        if (sendBtn) sendBtn.hidden = S.sending;
        if (stopBtn) stopBtn.hidden = !S.sending;
        if (sendBtn) sendBtn.disabled = S.sending || !String(input && input.value || '').trim();
    }

    function paintJump() {
        var jump = D.getElementById('bkaiJump');
        if (!jump) return;
        jump.hidden = S.nearBottom;
    }

    function scrollToEnd(force) {
        var box = D.getElementById('bkaiThread');
        if (!box) return;
        if (!force && !S.nearBottom) { paintJump(); return; }
        box.scrollTop = box.scrollHeight;
        S.nearBottom = true;
        paintJump();
    }

    /* ---------------------------------------------------------------------
       Nạp dữ liệu
       ------------------------------------------------------------------ */
    function boot(force) {
        if (!apiReady()) {
            S.bootError = 'Trợ lý AI cần kết nối máy chủ Supabase. Việc học ở các trang bài học vẫn hoạt động bình thường.';
            renderThread();
            return Promise.resolve();
        }
        if (S.loading && !force) return Promise.resolve();
        S.loading = true;
        if (!S.booted) renderThread();
        return post({ action: 'bootstrap' }).then(function (data) {
            S.loading = false;
            S.booted = true;
            S.bootError = null;
            S.config = data.config || null;
            S.usage = (data.config && data.config.usage) || null;
            S.conversations = Array.isArray(data.conversations) ? data.conversations : [];
            if (S.config && S.config.modes && S.config.modes.length) {
                var allowed = S.config.modes.map(function (m) { return m.id; });
                if (allowed.indexOf(S.mode) === -1) S.mode = allowed[0];
            }
            renderModes();
            renderConversations();
            renderHead();
            renderThread();
            refreshUsageLine();
            return data;
        }).catch(function (err) {
            S.loading = false;
            S.bootError = friendlyError(err);
            renderThread();
        });
    }

    function refreshUsageLine() {
        var host = D.querySelector('.bkai-usage');
        if (host && host.parentNode) {
            var next = usageLine();
            host.parentNode.replaceChild(next, host);
        }
    }

    function friendlyError(err) {
        var code = err && err.code;
        if (code === 'NOT_BOUND') {
            return 'Thiết bị chưa được nhận diện học sinh. Hãy mở trang chủ, chọn họ tên của bạn rồi quay lại.';
        }
        if (code === 'AI_DISABLED') return 'Trợ lý AI đang tạm tắt.';
        if (/failed to send|failed to fetch|networkerror|load failed|fetch/i.test(String(err && err.message))) {
            return 'Không kết nối được máy chủ trợ lý AI. Kiểm tra mạng rồi thử lại.';
        }
        return String(err && err.message || 'Không tải được trợ lý AI.');
    }

    function openConversation(id) {
        if (S.sending) return;
        /* Chọn hội thoại → đóng sidebar trên điện thoại, giữ nguyên dữ liệu. */
        if (S.sideOpen) setSidebar(false);
        S.active = null;
        S.messages = [];
        S.error = null;
        renderThread();
        post({ action: 'messages.list', conversation_id: id }).then(function (data) {
            S.active = data.conversation || null;
            S.messages = Array.isArray(data.messages) ? data.messages : [];
            if (S.active && S.active.mode) S.mode = S.active.mode;
            renderModes();
            renderConversations();
            renderHead();
            renderThread();
            if (S.layout !== 'page') {
                var input = D.getElementById('bkaiInput');
                if (input) input.focus();
            }
        }).catch(function (err) {
            S.error = friendlyError(err);
            S.errorCode = err && err.code || '';
            renderThread();
        });
    }

    function startNew() {
        if (S.sending) return;
        if (S.sideOpen) setSidebar(false);
        S.active = null;
        S.messages = [];
        S.error = null;
        S.notice = '';
        S.context = S.context || null;
        renderConversations();
        renderHead();
        renderNotice();
        renderThread();
        var input = D.getElementById('bkaiInput');
        if (input) { input.value = ''; input.focus(); paintComposer(); }
    }

    function renameActive() {
        if (!S.active) return;
        var current = String(S.active.title || '');
        var next = global.prompt ? global.prompt('Tên hội thoại mới:', current) : null;
        if (next == null) return;
        var title = String(next).trim().slice(0, 100);
        if (!title) { toast('Tên hội thoại không được để trống.', 'error'); return; }
        post({ action: 'conversation.rename', conversation_id: S.active.id, title: title })
            .then(function () {
                S.active.title = title;
                S.conversations.forEach(function (c) { if (c.id === S.active.id) c.title = title; });
                renderHead();
                renderConversations();
                toast('Đã đổi tên hội thoại.', 'success');
            })
            .catch(function (err) { toast(friendlyError(err), 'error'); });
    }

    function deleteActive() {
        if (!S.active) return;
        confirmBox('Xoá hội thoại "' + String(S.active.title || '') + '"? Nội dung sẽ không hiển thị lại nữa.', 'Xoá')
            .then(function (yes) {
                if (!yes) return;
                var id = S.active.id;
                post({ action: 'conversation.delete', conversation_id: id }).then(function () {
                    S.conversations = S.conversations.filter(function (c) { return c.id !== id; });
                    startNew();
                    toast('Đã xoá hội thoại.', 'success');
                }).catch(function (err) { toast(friendlyError(err), 'error'); });
            });
    }

    /* ---------------------------------------------------------------------
       Gửi / dừng / thử lại
       ------------------------------------------------------------------ */
    function send(preset, isRetry) {
        if (S.sending) return;
        var input = D.getElementById('bkaiInput');
        var text = String(preset != null ? preset : (input && input.value) || '').trim();
        if (!text) return;
        /* Thử lại: câu hỏi đã nằm trong hội thoại (máy chủ đã lưu), không thêm
           bong bóng thứ hai và không tạo dòng tin nhắn trùng. */
        isRetry = isRetry === true;
        if (text.length > 4000) {
            S.error = 'Câu hỏi quá dài (tối đa 4.000 ký tự). Bạn chia nhỏ giúp mình nhé.';
            S.errorCode = 'MESSAGE_TOO_LONG';
            renderThread();
            return;
        }

        S.error = null;
        S.errorCode = '';
        S.errorDetail = null;
        S.notice = '';
        S.lastAttempt = text;
        S.pending = text;
        S.sending = true;
        S.nearBottom = true;

        var optimistic = {
            id: 'local-' + Date.now(), role: 'user', content: text,
            mode: S.mode, created_at: new Date().toISOString()
        };
        if (!isRetry) S.messages.push(optimistic);
        if (input) { input.value = ''; input.style.height = 'auto'; }
        renderThread();
        paintComposer();
        renderNotice();

        S.controller = global.AbortController ? new global.AbortController() : null;
        var signal = S.controller ? S.controller.signal : undefined;
        var ctx = S.context || {};

        post({
            action: 'chat',
            conversation_id: S.active ? S.active.id : '',
            mode: S.mode,
            message: text,
            retry: isRetry || undefined,
            context: ctx
        }, signal).then(function (data) {
            S.sending = false;
            S.controller = null;
            S.pending = '';
            if (data.conversation) {
                S.active = Object.assign({}, S.active || {}, data.conversation);
                mergeConversation(data.conversation);
            }
            /* Thay tin nhắn tạm bằng bản máy chủ trả về. */
            S.messages = S.messages.filter(function (m) { return m.id !== optimistic.id; });
            if (data.user_message && !hasMessage(data.user_message.id)) S.messages.push(data.user_message);
            if (data.message) S.messages.push(data.message);
            if (data.meta) {
                S.usage = data.meta.usage || S.usage;
                S.lastMeta = data.meta;
                if (data.meta.fellBack) S.notice = 'Nhà cung cấp chính bận nên câu trả lời do nhà cung cấp dự phòng xử lý.';
                else if (data.meta.mock) S.notice = 'Chế độ giả lập đang bật — câu trả lời không phải từ AI thật.';
            }
            renderHead();
            renderConversations();
            renderThread();
            renderNotice();
            refreshUsageLine();
            paintComposer();
        }).catch(function (err) {
            S.sending = false;
            S.controller = null;
            paintComposer();
            if (err && err.code === 'ABORTED') {
                S.error = '';
                S.pending = '';
                S.messages = S.messages.filter(function (m) { return m.id !== optimistic.id; });
                renderThread();
                toast('Đã dừng câu trả lời.');
                return;
            }
            S.errorCode = err && err.code || '';
            S.error = friendlyError(err);
            /* Câu hỏi đã được lưu ở máy chủ nếu lỗi đến từ provider. */
            var payload = err && err.data && err.data.error;
            S.errorDetail = (payload && payload.detail) || null;
            /* Giữ nguyên nội dung người học đã nhập để họ gửi lại, không phải gõ lại. */
            var inputEl = D.getElementById('bkaiInput');
            if (inputEl && !inputEl.value) {
                inputEl.value = text;
                inputEl.style.height = 'auto';
                inputEl.style.height = Math.min(150, inputEl.scrollHeight) + 'px';
                paintComposer();
            }
            if (payload && payload.user_message) {
                S.messages = S.messages.filter(function (m) { return m.id !== optimistic.id; });
                if (!hasMessage(payload.user_message.id)) S.messages.push(payload.user_message);
                if (payload.conversation) {
                    S.active = Object.assign({}, S.active || {}, payload.conversation);
                    mergeConversation(payload.conversation);
                }
            }
            renderHead();
            renderConversations();
            renderThread();
        });
    }

    function stop() {
        if (!S.sending) return;
        try { if (S.controller) S.controller.abort(); } catch (e) { }
        S.sending = false;
        S.controller = null;
        paintComposer();
        renderThread();
        toast('Đã dừng câu trả lời.');
    }

    function retryLast() {
        var lastUser = null;
        for (var i = S.messages.length - 1; i >= 0; i--) {
            if (S.messages[i].role === 'user') { lastUser = S.messages[i]; break; }
        }
        var text = S.pending || (lastUser && lastUser.content) || '';
        if (!text) return;
        S.error = null;
        S.errorCode = '';
        send(String(text), true);
    }

    function hasMessage(id) {
        if (!id) return true;
        for (var i = 0; i < S.messages.length; i++) {
            if (S.messages[i] && S.messages[i].id === id) return true;
        }
        return false;
    }

    function mergeConversation(conv) {
        if (!conv || !conv.id) return;
        var found = false;
        S.conversations.forEach(function (c) {
            if (c.id === conv.id) {
                found = true;
                Object.assign(c, conv);
            }
        });
        if (!found) S.conversations.unshift(conv);
        S.conversations.sort(function (a, b) {
            return String(b.last_message_at || '').localeCompare(String(a.last_message_at || ''));
        });
    }

    /* ---------------------------------------------------------------------
       Bảng nổi (dock) — dùng từ mọi trang học tập
       ------------------------------------------------------------------ */
    var HIDE_DOCK = function () { close(); };

    function ensureDock() {
        if (S.dock) return S.dock;
        var dock = el('div', 'bkai-dock-wrap');
        dock.id = 'bkaiDock';
        dock.hidden = true;
        dock.setAttribute('role', 'dialog');
        dock.setAttribute('aria-modal', 'false');
        dock.setAttribute('aria-label', 'Trợ lý AI');
        var scrim = el('div', 'bkai-scrim');
        on(scrim, 'click', function () { close(); });
        dock.appendChild(scrim);
        var host = el('div', 'bkai-dock-host');
        dock.appendChild(host);
        (D.body || D.documentElement).appendChild(dock);
        S.dock = dock;
        S.dockHost = host;
        return dock;
    }

    function openDetail(opts) {
        var dock = ensureDock();
        if (!S.dockHost) return;
        if (!S.dockBuilt) {
            buildShell(S.dockHost, 'dock');
            S.dockBuilt = true;
        }
        dock.hidden = false;
        D.body.classList.add('bkai-dock-open');
        fitViewport();
        var o = opts || {};
        if (o.context) S.context = o.context;
        if (o.mode) changeMode(o.mode);
        if (o.prompt) {
            var input = D.getElementById('bkaiInput');
            if (input) { input.value = o.prompt; input.focus(); paintComposer(); }
        }
        /* Mở lại: dựng lại đúng hội thoại đang giữ trong phiên (8.5.4). */
        renderHead();
        renderConversations();
        renderThread();
        renderNotice();
        if (!S.booted) boot();
        else {
            var focusInput = D.getElementById('bkaiInput');
            if (focusInput) focusInput.focus();
        }
        return dock;
    }

    function close() {
        closeErrorDetail();
        if (!S.dock) return;
        S.dock.hidden = true;
        D.body.classList.remove('bkai-dock-open');
        /* Lịch sử hội thoại nằm trong S.messages/S.active, không bị xoá khi đóng.
           Mở lại sẽ thấy đúng cuộc trò chuyện trước đó. */
    }

    /* Bàn phím ảo và thanh địa chỉ di động: cửa sổ cao đúng phần nhìn thấy được,
       không tràn ra ngoài màn hình và không bị bàn phím che mất ô soạn. */
    function fitViewport() {
        if (!S.dock) return;
        var vv = global.visualViewport;
        var h = vv ? vv.height : global.innerHeight;
        if (h > 0) S.dock.style.setProperty('--bkai-vh', Math.round(h) + 'px');
        if (vv && typeof vv.offsetTop === 'number') {
            S.dock.style.setProperty('--bkai-vv-top', Math.round(vv.offsetTop) + 'px');
        }
    }

    if (global.visualViewport) {
        global.visualViewport.addEventListener('resize', fitViewport);
        global.visualViewport.addEventListener('scroll', fitViewport);
    }

    /* Người dùng đã ẩn nút "Hỏi AI" trên thiết bị này (8.5.3). Nút chỉ là lối tắt;
       lối vào chính vẫn là menu tài khoản → Trợ lý AI và trang /ai-tutor/. */
    var FAB_HIDDEN_KEY = 'bakhiAiFabHidden.v1';
    function storageGet(key) {
        try { return global.localStorage ? global.localStorage.getItem(key) : null; }
        catch (e) { return null; }
    }
    function storageSet(key, value) {
        try { if (global.localStorage) global.localStorage.setItem(key, value); }
        catch (e) { /* chế độ riêng tư: chỉ ẩn trong phiên này */ }
    }

    function ensureFab() {
        if (S.fab) return S.launcher || S.fab;
        /* Chỉ MỘT nút "Hỏi AI". Không có nút đóng nào cạnh nút nổi (8.5.4 bỏ nút ×
           của 8.5.3): nút đóng duy nhất nằm trong cửa sổ trợ lý AI. */
        var wrap = el('div', 'bkai-launcher');
        var b = el('button', 'bkai-fab');
        b.type = 'button';
        b.id = 'bkaiFab';
        b.setAttribute('aria-label', 'Mở trợ lý AI');
        b.title = 'Hỏi trợ lý AI';
        b.appendChild(icon('fa-wand-magic-sparkles'));
        b.appendChild(el('span', 'bkai-fab-label', 'Hỏi AI'));
        on(b, 'click', function () { openDetail({ context: pageContext() }); });

        wrap.appendChild(b);
        (D.body || D.documentElement).appendChild(wrap);
        S.fab = b;
        S.launcher = wrap;
        placeFab();
        return wrap;
    }

    /* 8.5.3 cho phép ẩn nút nổi; 8.5.4 bỏ cơ chế đó nên cờ cũ được xoá để nút
       trở lại trên các máy đã từng bấm ×. Không xoá key lịch sử khác. */
    function clearLegacyFabFlag() {
        if (storageGet(FAB_HIDDEN_KEY) === null) return;
        storageSet(FAB_HIDDEN_KEY, '');
    }

    function showFab() {
        clearLegacyFabFlag();
        var wrap = ensureFab();
        if (wrap) wrap.hidden = false;
        placeFab();
        return API;
    }

    /* Không đè lên nút Báo cáo: đo vị trí thật của nút đó rồi đặt mình phía trên.
       Đo bằng getBoundingClientRect (không dùng toạ độ cứng) — cùng cách bk-report
       neo vào chuông thông báo. */
    function placeFab() {
        var target = S.launcher || S.fab;
        if (!target) return;
        var other = D.getElementById('bkrepFab') || D.querySelector('.bkrep-fab');
        if (other && other.getBoundingClientRect) {
            var rect = other.getBoundingClientRect();
            if (rect && rect.top > 0 && rect.height > 0) {
                var gap = Math.max(120, Math.round(global.innerHeight - rect.top) + 10);
                target.style.bottom = gap + 'px';
                return;
            }
        }
        target.style.bottom = '';
    }

    /* ---------------------------------------------------------------------
       Công khai
       ------------------------------------------------------------------ */
    var API = {
        version: '8.5.6',
        MODES: MODE_FALLBACK,

        /* Gắn giao diện đầy đủ vào một phần tử (trang /ai-tutor/). */
        mount: function (root, options) {
            if (!root) return null;
            var o = options || {};
            if (o.context) S.context = o.context;
            buildShell(root, 'page');
            boot();
            return API;
        },

        /* Mở bảng nổi với ngữ cảnh tuỳ chọn. */
        open: function (opts) { openDetail(opts); return API; },
        close: close,

        /* Mở lại cửa sổ trợ lý AI với hội thoại đang giữ trong phiên. */
        reopen: function () { openDetail({}); return API; },

        /* Mở chi tiết lỗi gần nhất (dùng cho kiểm thử/giao diện khác). */
        showErrorDetail: openErrorDetail,

        /* Hỏi nhanh về nội dung đang xem (bài học, câu hỏi, lỗi sai). */
        explain: function (context, mode) {
            openDetail({ context: context || pageContext(), mode: mode || 'explain' });
            return API;
        },

        /* Mở chế độ phân tích lỗi với một mục trong sổ tay câu sai. */
        analyzeMistake: function (entry) {
            var e = entry || {};
            var ctx = {
                subject: e.subject || '', topic: e.topic || '', lesson: e.lesson || '',
                question: e.question || e.prompt || '',
                user_answer: e.userAnswer || e.chosen || '',
                correct_answer: e.correctAnswer || e.answer || '',
                explanation: e.explanation || '',
                mistake_note: e.note || ''
            };
            if (Array.isArray(e.options)) ctx.options = e.options.map(String);
            var prompt = 'Phân tích lỗi sai của mình ở câu này và chỉ phần kiến thức cần học lại.';
            openDetail({ context: ctx, mode: 'mistakes', prompt: prompt });
            return API;
        },

        /* Nút nổi "Hỏi AI" luôn hiện (8.5.4 bỏ cơ chế ẩn). showFab() giữ lại để
           tương thích với mã cũ và menu tài khoản. */
        showFab: showFab,

        /* Ngữ cảnh tự nhận biết của trang hiện tại (dùng cho module khác). */
        pageContext: pageContext,

        /* Dùng nội bộ cho kiểm thử. */
        _state: S
    };

    global.BKAITutor = API;

    /* Tự gắn nút nổi trên mọi trang có nạp module (trừ trang AI Tutor). */
    function autoMount() {
        if (D.body && D.body.getAttribute && D.body.getAttribute('data-bk-ai-fab') === '0') return;
        if (D.getElementById('bkai')) return;   /* trang AI Tutor đầy đủ */
        if (!apiReady()) return;
        clearLegacyFabFlag();
        ensureFab();
        /* Thanh địa chỉ di động đổi chiều cao → căn lại nút nổi. */
        global.addEventListener('resize', function () {
            if (S.fab) placeFab();
        });
    }
    if (D.readyState === 'loading') {
        D.addEventListener('DOMContentLoaded', function () { setTimeout(autoMount, 600); });
    } else {
        setTimeout(autoMount, 600);
    }
})(typeof window !== 'undefined' ? window : this);
