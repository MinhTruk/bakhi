/* =========================================================================
   Bá Khí — bk-readme.js
   Một trình xem README/CHANGELOG dùng chung cho MỌI trang.

   - Không điều hướng: nội dung được fetch và render trong hộp thoại tại chỗ,
     URL hiện tại không đổi.
   - Tải marked từ CDN như bản cũ; nếu CDN lỗi thì hiện văn bản thô trong
     khung cuộn thay vì mở tệp .md.
   - Đóng bằng nút ×, Escape hoặc bấm nền; khoá cuộn trang nền; trả focus.
   - Khoá cuộn được gỡ khi đóng, khi trang bị ẩn hoặc rời trang.

   Công khai: window.BKReadme
             window.openReadmeModal, openMarkdownModal,
             openChangelogMd, closeReadmeModal
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || !D.documentElement) return;
    if (global.BKReadme && global.BKReadme.__ready) return;

    var S = {
        modal: null, panel: null, title: null, body: null,
        closeBtn: null, lastFocus: null, open: false, req: 0,
        hideTimer: 0, prevOverflow: '', markedPromise: null
    };

    function basePath() {
        var scripts = D.scripts || [];
        var mark = 'assets/bakhi/bk-readme.js';
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || '';
            var at = src.indexOf(mark);
            if (at < 0) continue;
            return src.slice(0, at) || './';
        }
        return './';
    }
    var BASE = basePath();

    function el(tag, cls, text) {
        var n = D.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = String(text);
        return n;
    }

    function build() {
        if (S.modal) return;

        var modal = el('div');
        modal.id = 'bkReadmeModal';
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'bkReadmeTitle');

        var panel = el('div', 'bkr-panel');
        var head = el('div', 'bkr-head');
        var title = el('h2', 'bkr-title');
        title.id = 'bkReadmeTitle';
        title.appendChild(el('span', 'bkr-md', 'MD'));
        S.title = el('span', null, 'README.md');
        title.appendChild(S.title);

        var close = el('button', 'bkr-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Đóng');
        close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

        head.appendChild(title);
        head.appendChild(close);

        var body = el('div', 'bkr-body');
        body.tabIndex = -1;

        panel.appendChild(head);
        panel.appendChild(body);
        modal.appendChild(panel);
        (D.body || D.documentElement).appendChild(modal);

        S.modal = modal;
        S.panel = panel;
        S.body = body;
        S.closeBtn = close;

        close.addEventListener('click', closeModal);
        modal.addEventListener('pointerdown', function (e) {
            if (e.target === modal) closeModal();
        });
        D.addEventListener('keydown', onKey, true);
    }

    function lock() {
        S.prevOverflow = D.body ? D.body.style.overflow : '';
        D.documentElement.classList.add('bk-readme-open');
        if (D.body) D.body.style.overflow = 'hidden';
    }
    function unlock() {
        D.documentElement.classList.remove('bk-readme-open');
        if (D.body) D.body.style.overflow = S.prevOverflow || '';
        S.prevOverflow = '';
    }

    function loading(title) {
        S.body.textContent = '';
        var box = el('div', 'bkr-state');
        box.appendChild(el('span', 'bkr-spin'));
        box.appendChild(el('span', null, 'Đang tải ' + title + '…'));
        S.body.appendChild(box);
    }

    function fail(title, raw) {
        S.body.textContent = '';
        if (raw) {
            var pre = el('pre', 'bkr-raw', raw);
            S.body.appendChild(pre);
            return;
        }
        var box = el('div', 'bkr-state is-error', 'Không thể đọc tệp ' + title + '. Hãy tải lại trang và thử lại.');
        S.body.appendChild(box);
    }

    function sanitize(html) {
        var t = D.createElement('template');
        t.innerHTML = html;
        t.content.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach(function (n) { n.remove(); });
        t.content.querySelectorAll('*').forEach(function (n) {
            Array.prototype.slice.call(n.attributes).forEach(function (a) {
                var name = a.name.toLowerCase();
                var value = a.value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
                if (name.indexOf('on') === 0 || name === 'srcdoc' ||
                    (['href', 'src', 'xlink:href', 'action', 'formaction'].indexOf(name) >= 0 &&
                        /^(javascript|data|vbscript):/.test(value))) {
                    n.removeAttribute(a.name);
                }
            });
            if (n.tagName === 'A' && n.target === '_blank') n.rel = 'noopener noreferrer';
        });
        return t.innerHTML;
    }

    function loadMarked() {
        if (global.marked) return Promise.resolve(global.marked);
        if (S.markedPromise) return S.markedPromise;
        S.markedPromise = new Promise(function (resolve, reject) {
            var s = D.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
            s.onload = function () { resolve(global.marked); };
            s.onerror = function () { S.markedPromise = null; reject(new Error('marked')); };
            (D.head || D.documentElement).appendChild(s);
        });
        return S.markedPromise;
    }

    function render(title, md) {
        var m = global.marked;
        if (m && typeof m.parse === 'function') {
            try {
                S.body.innerHTML = sanitize(m.parse(md));
                return;
            } catch (e) { /* rơi xuống văn bản thô */ }
        }
        fail(title, md);
    }

    function open(file, title) {
        build();
        var label = title || file;
        S.open = true;
        S.req++;
        var req = S.req;
        S.lastFocus = D.activeElement;
        S.title.textContent = label;
        global.clearTimeout(S.hideTimer);
        S.modal.hidden = false;
        S.body.scrollTop = 0;
        loading(label);
        lock();
        global.requestAnimationFrame(function () { if (S.modal) S.modal.classList.add('is-open'); });
        try { S.closeBtn.focus({ preventScroll: true }); } catch (e) { try { S.closeBtn.focus(); } catch (x) { } }

        loadMarked().catch(function () { return null; }).then(function () {
            return global.fetch(BASE + file, { credentials: 'same-origin', cache: 'no-cache' });
        }).then(function (res) {
            if (!res || !res.ok) throw new Error('http');
            return res.text();
        }).then(function (md) {
            if (!S.open || req !== S.req) return;
            render(label, md);
        }).catch(function () {
            if (!S.open || req !== S.req) return;
            fail(label);
        });

        return true;
    }

    function closeModal() {
        if (!S.modal || !S.open) return;
        S.open = false;
        S.req++;
        S.modal.classList.remove('is-open');
        unlock();
        var target = S.lastFocus;
        S.lastFocus = null;
        if (target && target.focus && target.isConnected) {
            try { target.focus({ preventScroll: true }); } catch (e) { }
        }
        S.hideTimer = global.setTimeout(function () {
            if (!S.open && S.modal) S.modal.hidden = true;
        }, 190);
    }

    function onKey(e) {
        if (!S.open) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
            return;
        }
        if (e.key !== 'Tab' || !S.panel) return;
        var items = S.panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && D.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && D.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    /* Đóng lớp khoá nếu tab bị ẩn hoặc trang điều hướng. */
    D.addEventListener('visibilitychange', function () {
        if (D.hidden) unlock();
        else if (S.open) lock();
    });
    global.addEventListener('pagehide', unlock);

    global.BKReadme = {
        __ready: true,
        open: open,
        close: closeModal,
        base: BASE
    };
    global.openMarkdownModal = function (file, title) { return open(file || 'README.md', title || file || 'README.md'); };
    global.openReadmeModal = function () { return open('README.md', 'README.md'); };
    global.openChangelogMd = function () { return open('CHANGELOG.md', 'CHANGELOG.md'); };
    global.closeReadmeModal = closeModal;
})(typeof window !== 'undefined' ? window : this);
