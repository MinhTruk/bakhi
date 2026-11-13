/* =========================================================================
   Bá Khí — bk-page.js
   Cầu nối cho các trang bài học (không phải trang chủ).

   - Ghi lịch sử bài học đã mở.
   - Đánh dấu bài học / ghi chú nhanh / mở Trung tâm học tập.
   - Ghi nhận kết quả luyện tập khi trang có ngân hàng câu hỏi và cơ chế
     kiểm tra quen thuộc. Đây là cơ chế "best effort": trang nào có cấu trúc
     khác có thể gọi trực tiếp window.BK.practice({...}) để ghi chính xác.

   Không sửa nội dung câu hỏi, đáp án hay giải thích của trang.
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    var BK = global.BK;
    if (!D || !BK) return;
    if (global.BKPageLoaded) return;
    global.BKPageLoaded = true;

    var lastRecord = {};

    function readGlobal(name) {
        try {
            // eslint-disable-next-line no-new-func
            var v = new Function('try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : null; } catch (e) { return null; }')();
            return v;
        } catch (e) { return null; }
    }

    function text(v, max) { return String(v == null ? '' : v).slice(0, max || 3000); }

    /** Chuẩn hoá ngân hàng câu hỏi về một dạng thống nhất (chỉ đọc). */
    function collectBanks() {
        var byId = {};
        var list = [];
        var seen = {};

        function add(item) {
            if (!item || !item.question) return;
            var key = BK.util.hash(item.question);
            item.key = key;
            if (!byId[item.id]) byId[item.id] = item;
            if (seen[key]) return;
            seen[key] = 1;
            list.push(item);
        }

        function fromMcq(arr, topicFallback) {
            if (!Array.isArray(arr)) return;
            arr.forEach(function (q) {
                if (!q || typeof q !== 'object') return;
                var options = q.options || q.o || q.choices || q.answers || null;
                var answer = (q.correctAnswer != null) ? q.correctAnswer : (q.a != null ? q.a : (q.correct != null && typeof q.correct !== 'boolean' ? q.correct : null));
                add({
                    id: q.id != null ? String(q.id) : '',
                    question: text(q.question || q.q || q.text || q.stem, 3000),
                    options: Array.isArray(options) ? options.map(function (o) { return text(o, 800); }) : [],
                    answer: answer,
                    explanation: text(q.explanation || q.exp || q.solution || q.key, 3000),
                    topic: text(q.topic || q.section || topicFallback || '', 160),
                    difficulty: text(q.difficulty || q.level || '', 40)
                });
            });
        }

        function fromTF(arr, topicFallback) {
            if (!Array.isArray(arr)) return;
            arr.forEach(function (group) {
                if (!group || typeof group !== 'object') return;
                var items = group.items || group.statements || [];
                if (!Array.isArray(items)) return;
                items.forEach(function (s) {
                    if (!s || typeof s !== 'object') return;
                    add({
                        id: s.id != null ? String(s.id) : '',
                        question: text(s.text || s.statement || s.question, 3000),
                        options: ['Đúng', 'Sai'],
                        answer: typeof s.correct === 'boolean' ? (s.correct ? 0 : 1) : s.answer,
                        explanation: text(s.exp || s.explanation, 3000),
                        topic: text(group.title || topicFallback || '', 160),
                        difficulty: text(s.difficulty || '', 40)
                    });
                });
            });
        }

        var mcqNames = ['MCQ_BANK', 'rawMcqData', 'mcqData', 'quizData', 'QUESTIONS', 'questions', 'bank', 'QUESTION_BANK'];
        mcqNames.forEach(function (n) { fromMcq(readGlobal(n)); });
        var tfNames = ['TF_BANK', 'tfData', 'TF_DATA', 'trueFalseData'];
        tfNames.forEach(function (n) { fromTF(readGlobal(n)); });

        return { byId: byId, list: list };
    }

    var banks = null;
    function ensureBanks() {
        if (!banks) banks = collectBanks();
        return banks;
    }

    function extractId(nodeId) {
        if (!nodeId) return '';
        var m = /(?:feedback|result|answer)[-_]?([\w-]+)$/i.exec(nodeId);
        return m ? m[1] : '';
    }

    /** Quét phản hồi đúng/sai đã hiển thị và ghi nhận — không sửa DOM. */
    function scanFeedback() {
        var b = ensureBanks();
        if (!b.list.length) return;
        var nodes = D.querySelectorAll('[id*="feedback"], [class*="feedback"]');
        if (!nodes.length) return;
        var usedKeys = {};
        var order = 0;

        Array.prototype.forEach.call(nodes, function (node) {
            var cls = typeof node.className === 'string' ? node.className : '';
            if (/\bhidden\b/.test(cls) || node.offsetParent === null && !node.textContent.trim()) return;
            var isRight = /emerald|green|correct|is-right|right-answer/.test(cls);
            var isWrong = /rose|red|incorrect|is-wrong|wrong-answer/.test(cls);
            if (!isRight && !isWrong) return;

            var item = b.byId[extractId(node.id)] || b.list[order];
            order++;
            if (!item || usedKeys[item.key]) return;
            usedKeys[item.key] = 1;

            var correct = isRight;
            var stamp = Date.now();
            var prev = lastRecord[item.key];
            if (prev && stamp - prev.ts < 2500 && prev.correct === correct) return;
            lastRecord[item.key] = { ts: stamp, correct: correct };

            BK.practice({
                question: item.question,
                questionId: item.id || item.key,
                subject: BK.subjectOf(),
                topic: item.topic,
                difficulty: item.difficulty,
                correct: correct,
                options: item.options,
                answer: item.answer,
                explanation: item.explanation,
                source: location.pathname,
                lesson: D.title,
                silent: true
            });
        });
    }

    function scheduleScan() {
        setTimeout(scanFeedback, 220);
        setTimeout(scanFeedback, 700);
    }

    function hookChecks() {
        ['checkAllAnswers', 'checkAnswers', 'checkQuiz', 'submitQuiz', 'checkMCQ', 'showResult', 'chamBai', 'kiemTraDapAn', 'checkAll']
            .forEach(function (name) {
                var orig = global[name];
                if (typeof orig !== 'function' || orig.__bkHooked) return;
                var wrapped = function () {
                    var result = orig.apply(this, arguments);
                    scheduleScan();
                    return result;
                };
                wrapped.__bkHooked = true;
                try { global[name] = wrapped; } catch (e) { /* bỏ qua */ }
            });
    }

    D.addEventListener('click', function (e) {
        var target = e.target && e.target.closest ? e.target.closest('button,a,[role="button"],input[type="submit"]') : null;
        if (!target) return;
        var label = (target.textContent || target.value || '').toLowerCase();
        if (/kiểm tra|kiểm tra đáp án|chấm|nộp bài|check answer|check answers|xem đáp án/.test(label)) {
            scheduleScan();
        }
    }, true);

    /* ------------------------- Thanh công cụ nhỏ ------------------------- */
    function injectCss() {
        if (D.getElementById('bk-page-css')) return;
        var st = D.createElement('style');
        st.id = 'bk-page-css';
        st.textContent = [
            '#bkPageDock{position:fixed;right:1rem;bottom:1rem;z-index:65;display:flex;flex-direction:column;align-items:flex-end;gap:.4rem;font-family:Lexend,system-ui,sans-serif}',
            '#bkPageDock .bk-page-actions{display:flex;flex-direction:column;gap:.35rem;padding:.35rem;border-radius:999px;background:rgba(30,41,59,.9);border:1px solid rgba(148,163,184,.3);box-shadow:0 12px 30px -16px rgba(2,6,23,.8);opacity:0;transform:scale(.88) translateY(6px);pointer-events:none;transition:opacity .16s,transform .16s}',
            '#bkPageDock.open .bk-page-actions{opacity:1;transform:none;pointer-events:auto}',
            '#bkPageDock button{width:2.3rem;height:2.3rem;border-radius:50%;border:0;background:transparent;color:#e2e8f0;cursor:pointer;font-size:.8rem;display:grid;place-items:center;position:relative}',
            '#bkPageDock button:hover{background:rgba(99,102,241,.25);color:#c7d2fe}',
            '#bkPageDock .bk-page-toggle{width:2.8rem;height:2.8rem;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;box-shadow:0 10px 24px -10px rgba(99,102,241,.9);font-size:.95rem}',
            '#bkPageDock .bk-page-label{position:absolute;right:calc(100% + .5rem);white-space:nowrap;background:#0f172a;color:#f8fafc;font-size:.66rem;padding:.2rem .45rem;border-radius:.35rem;opacity:0;pointer-events:none;transition:opacity .15s}',
            '#bkPageDock button:hover .bk-page-label,#bkPageDock button:focus-visible .bk-page-label{opacity:1}',
            '@media(max-width:640px){#bkPageDock{right:.6rem;bottom:.6rem}}'
        ].join('');
        (D.head || D.documentElement).appendChild(st);
    }

    /** Một số trang không nạp Font Awesome — dùng emoji thay thế để nút vẫn rõ nghĩa. */
    function faAvailable() {
        try {
            var probe = D.createElement('i');
            probe.className = 'fa-solid fa-bookmark';
            probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:1px';
            D.body.appendChild(probe);
            var content = getComputedStyle(probe, '::before').content;
            var ff = getComputedStyle(probe).fontFamily || '';
            probe.remove();
            return /Font Awesome/i.test(ff) || (content && content !== 'none' && content !== '""');
        } catch (e) { return true; }
    }

    function buildDock() {
        injectCss();
        if (D.getElementById('bkPageDock')) return;
        var dock = D.createElement('div');
        dock.id = 'bkPageDock';
        var actions = D.createElement('div');
        actions.className = 'bk-page-actions';
        actions.setAttribute('role', 'toolbar');
        actions.setAttribute('aria-label', 'Công cụ học tập cho bài học này');
        var hasFA = faAvailable();

        function iconHtml(icon, emoji) {
            return hasFA
                ? '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>'
                : '<span aria-hidden="true" style="font-size:.95rem">' + emoji + '</span>';
        }

        function action(icon, emoji, label, run) {
            var b = D.createElement('button');
            b.type = 'button';
            b.setAttribute('aria-label', label);
            b.innerHTML = iconHtml(icon, emoji) + '<span class="bk-page-label">' + label + '</span>';
            b.addEventListener('click', run);
            actions.appendChild(b);
        }

        var lesson = BK.lessonOf();
        action('fa-bookmark', '🔖', 'Đánh dấu bài học', function () {
            var added = BK.addBookmark({
                type: 'lesson', title: D.title || lesson.title, url: location.pathname,
                subject: lesson.subject, folder: lesson.examName || 'Bài học'
            });
            BK.ui.toast(added ? 'Đã đánh dấu bài học này' : 'Bài học này đã được đánh dấu', added ? 'success' : 'info');
        });
        action('fa-pen-nib', '📝', 'Ghi chú cho bài học', function () {
            BK.lessonNote();
        });
        action('fa-chart-simple', '🎓', 'Mở Trung tâm học tập', function () {
            location.href = BK.util.basePath() + 'index.html?bk=hub';
        });
        action('fa-moon', '🌙', 'Chế độ tập trung', function () {
            var s = BK.store.get();
            var on = !s.prefs.focus;
            BK.store.update(function (st) { st.prefs.focus = on; return st.prefs; });
            D.documentElement.classList.toggle('bk-focus', on);
            BK.ui.toast(on ? 'Đã bật chế độ tập trung (Esc để thoát)' : 'Đã tắt chế độ tập trung', 'info');
        });

        var toggle = D.createElement('button');
        toggle.type = 'button';
        toggle.className = 'bk-page-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Mở công cụ học tập');
        toggle.innerHTML = iconHtml('fa-graduation-cap', '🎓');
        toggle.addEventListener('click', function () {
            var open = dock.classList.toggle('open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        dock.appendChild(actions);
        dock.appendChild(toggle);
        D.body.appendChild(dock);
    }

    /** Ghi chú nhanh gắn với bài học hiện tại (dùng UI kit của core). */
    BK.lessonNote = function () {
        var lesson = BK.lessonOf();
        var body = D.createElement('div');
        var title = D.createElement('input');
        title.className = 'bk-input';
        title.value = (D.title || lesson.title) + ' — ghi chú';
        var textarea = D.createElement('textarea');
        textarea.className = 'bk-textarea';
        textarea.placeholder = 'Nội dung ghi chú (hỗ trợ **in đậm**, *nghiêng*, danh sách "- ")';
        var f1 = D.createElement('label'); f1.className = 'bk-field';
        var s1 = D.createElement('span'); s1.textContent = 'Tiêu đề'; f1.appendChild(s1); f1.appendChild(title);
        var f2 = D.createElement('label'); f2.className = 'bk-field';
        var s2 = D.createElement('span'); s2.textContent = 'Nội dung'; f2.appendChild(s2); f2.appendChild(textarea);
        body.appendChild(f1); body.appendChild(f2);

        BK.ui.modal({
            title: 'Ghi chú bài học', body: body,
            actions: [
                { label: 'Huỷ', variant: 'ghost' },
                {
                    label: 'Lưu ghi chú', variant: 'primary', onClick: function (close) {
                        if (!textarea.value.trim() && !title.value.trim()) {
                            BK.ui.toast('Ghi chú đang trống', 'error');
                            return;
                        }
                        BK.addNote({
                            title: title.value.trim() || (D.title || 'Ghi chú bài học'),
                            body: textarea.value, subject: lesson.subject,
                            category: 'Bài học'
                        });
                        close();
                        BK.ui.toast('Đã lưu ghi chú', 'success');
                    }
                }
            ]
        });
    };

    function applyPrefs() {
        var s = BK.store.get();
        D.documentElement.classList.toggle('bk-focus', !!s.prefs.focus);
        D.documentElement.style.setProperty('--bkl-font-scale', String(BK.util.clamp(s.prefs.fontSize, 85, 160) / 100));
    }

    function init() {
        applyPrefs();
        var lesson = BK.lessonOf();
        BK.addHistory({
            kind: 'lesson', title: D.title || lesson.title,
            url: location.pathname, subject: lesson.subject, meta: lesson.examName || ''
        });
        buildDock();
        ensureBanks();
        hookChecks();
        // Trang có thể khai báo hàm kiểm tra sau khi tải xong.
        setTimeout(hookChecks, 800);
        setTimeout(hookChecks, 2000);
    }

    D.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && D.documentElement.classList.contains('bk-focus') && !D.querySelector('.bk-overlay')) {
            D.documentElement.classList.remove('bk-focus');
            BK.store.update(function (s) { s.prefs.focus = false; return s.prefs; });
        }
    });

    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
    else init();

    global.BKPage = { scan: scanFeedback, banks: function () { return ensureBanks(); }, note: BK.lessonNote };
})(typeof window !== 'undefined' ? window : this);
