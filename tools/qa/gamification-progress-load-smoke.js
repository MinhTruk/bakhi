#!/usr/bin/env node
/**
 * gamification-progress-load-smoke.js — cổng hồi quy cho Progress Loader 8.3.1.
 *
 * Kiểm tra đúng nguyên nhân đã làm hỏng production ở 8.3.0:
 *   - Loader phải gọi lớp máy chủ THẬT (window.BKCloud), không phải adapter
 *     localStorage BK.cloud của bk-core.js.
 *   - Mỗi trạng thái lỗi có thông báo + mã riêng.
 *   - Retry có giới hạn, không lặp vô hạn, không gửi trùng request.
 *   - Phản hồi cũ không ghi đè dữ liệu mới.
 *   - Giữ dữ liệu đã tải khi lần làm mới sau thất bại.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-progress-load-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-gamification.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function stateAt(xp) {
    return {
        total_xp: xp, level: 3, level_xp: xp - 280, level_span: 300, next_level_xp: 580,
        xp_remaining: 580 - xp, progress_pct: 20,
        branches: [], nodes: [], achievements: [], missions: [], mission_history: [],
        inventory: [], catalog: [], transactions: [], activity: {},
        challenges: [], attempts: [], level_logs: [], updated_at: '2026-11-21T00:00:00Z'
    };
}

function makeDom(opts) {
    opts = opts || {};
    const dom = new JSDOM('<!doctype html><html><body><div id="bkGamificationRoot"></div></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/gamification/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const w = dom.window;
    const calls = [];
    if (opts.student !== false) {
        w.localStorage.setItem('bakhiStudent.v1', JSON.stringify({ studentId: 'student-qa', displayName: 'QA' }));
    }
    if (opts.cache) {
        w.localStorage.setItem('bakhiGamification.v1.student-qa',
            JSON.stringify({ v: 1, state: stateAt(opts.cache), cachedAt: Date.now() }));
    }
    w.BK = {
        ui: { el(tag, cls) { const n = w.document.createElement(tag); if (cls) n.className = cls; return n; }, toast() { }, modal() { } },
        /* Đúng hình dạng production: adapter localStorage không có API máy chủ. */
        cloud: {}
    };
    if (!opts.noCloud) w.BKCloud = {
        identity: opts.student === false ? null : () => ({ id: 'student-qa', display_name: 'QA' }),
        gamificationApi(body) {
            calls.push(body.action);
            if (typeof opts.handler === 'function') return opts.handler(body, calls.length);
            return Promise.resolve({ ok: true, state: stateAt(320), config: {} });
        }
    };
    w.addEventListener('error', (e) => { throw new Error('jsdom error: ' + e.message); });
    w.eval(SRC);
    return { w, calls };
}

function err(status, code, message) {
    const e = new Error(message || 'lỗi giả lập');
    e.status = status;
    e.code = code;
    return e;
}

async function main() {
    console.log('Gamification 8.3.1 — Progress Loader\n');

    /* 1. Chưa nhận diện: không gọi máy chủ, hiện đúng trạng thái */
    {
        const { w, calls } = makeDom({ student: false });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(1400);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(calls.length === 0, 'chưa nhận diện → không gọi máy chủ', String(calls.length));
        assert(/Cần nhận diện học sinh/.test(text), 'hiện trạng thái no_session');
        assert(/E_NO_SESSION/.test(text), 'hiện mã lỗi E_NO_SESSION');
        assert(w.BK.gamification.status() === 'no_session', 'status() = no_session');
    }

    /* 2. Thành công: đúng một request, hiển thị dữ liệu máy chủ */
    {
        const { w, calls } = makeDom({});
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(80);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(calls.filter((c) => c === 'state').length === 1, 'chỉ một request state khi khởi tạo', String(calls.length));
        assert(/320 XP tổng cộng/.test(text), 'hiển thị XP từ máy chủ');
        assert(w.BK.gamification.status() === 'ready', 'status() = ready');
    }

    /* 3. BK.cloud (adapter core) không được dùng làm API máy chủ */
    {
        const { w, calls } = makeDom({});
        w.BK.cloud.gamificationApi = () => { throw new Error('BK.cloud không phải lớp máy chủ'); };
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(80);
        assert(calls.length === 1 && w.BK.gamification.status() === 'ready',
            'loader dùng BKCloud, bỏ qua BK.cloud của bk-core');
    }

    /* 4. 401 → phiên hết hạn */
    {
        const { w } = makeDom({ handler: () => Promise.reject(err(401, 'NO_SESSION', 'Thiếu phiên')) });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(120);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(/Phiên đăng nhập không còn hợp lệ/.test(text), 'hiện thông báo phiên hết hạn');
        assert(/E_UNAUTHORIZED/.test(text), 'hiện mã E_UNAUTHORIZED');
        assert(!/Chưa kết nối máy chủ Bá Khí/.test(text), 'không còn thông báo chung của 8.3.0');
    }

    /* 5. 409 NOT_BOUND → thiết bị chưa gắn học sinh */
    {
        const { w } = makeDom({ handler: () => Promise.reject(err(409, 'NOT_BOUND', 'Chưa gắn')) });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(120);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(/Thiết bị chưa gắn học sinh/.test(text), 'hiện thông báo not_bound');
        assert(/E_NOT_BOUND/.test(text), 'hiện mã E_NOT_BOUND');
    }

    /* 6. Mất mạng: retry giới hạn rồi báo E_NETWORK */
    {
        let tries = 0;
        const { w } = makeDom({ handler: () => { tries++; return Promise.reject(err(0, '', 'Failed to fetch')); } });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(4200);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(tries === 3, 'mất mạng thử đúng 1 + 2 lần', String(tries));
        assert(/Không thể kết nối máy chủ/.test(text), 'hiện thông báo mất mạng');
        assert(/E_NETWORK/.test(text), 'hiện mã E_NETWORK');
        await sleep(1200);
        assert(tries === 3, 'không retry vô hạn sau khi đã báo lỗi', String(tries));
    }

    /* 7. 500 → máy chủ gặp sự cố, cũng có retry giới hạn */
    {
        let tries = 0;
        const { w } = makeDom({ handler: () => { tries++; return Promise.reject(err(500, 'STATE_ERROR', 'boom')); } });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(4200);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(tries === 3, 'lỗi 5xx thử đúng 1 + 2 lần', String(tries));
        assert(/Máy chủ đang gặp sự cố/.test(text), 'hiện thông báo lỗi máy chủ');
        assert(/E_SERVER/.test(text), 'hiện mã E_SERVER');
    }

    /* 8. Có cache + lần tải mới lỗi: giữ nội dung và báo một phần */
    {
        const { w } = makeDom({
            cache: 280,
            handler: () => Promise.reject(err(503, 'STATE_ERROR', 'unavailable'))
        });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(4200);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(/280 XP tổng cộng/.test(text), 'giữ dữ liệu đã lưu khi máy chủ lỗi');
        assert(/Một số dữ liệu chưa tải được/.test(text), 'hiện băng báo lỗi một phần');
        assert(/Làm mới/.test(text), 'có nút làm mới');
    }

    /* 9. Nút "Thử lại" gửi thêm đúng một request và phục hồi */
    {
        let calls = 0;
        const { w } = makeDom({
            handler: () => {
                calls++;
                if (calls === 1) return Promise.reject(err(401, 'NO_SESSION', 'hết hạn'));
                return Promise.resolve({ ok: true, state: stateAt(410), config: {} });
            }
        });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(150);
        const btn = Array.prototype.slice.call(w.document.querySelectorAll('button'))
            .filter((b) => /Thử lại/.test(b.textContent))[0];
        assert(!!btn, 'có nút Thử lại ở trạng thái lỗi');
        if (btn) {
            btn.click();
            await sleep(150);
            const text = w.document.getElementById('bkGamificationRoot').textContent;
            assert(calls === 2, 'Thử lại gửi đúng một request', String(calls));
            assert(/410 XP tổng cộng/.test(text), 'phục hồi và hiển thị dữ liệu sau khi thử lại');
        }
    }

    /* 10. Phản hồi cũ không ghi đè dữ liệu mới (state chậm hơn event) */
    {
        let releaseState = null;
        const { w } = makeDom({
            handler: (body) => {
                if (body.action === 'state') {
                    return new Promise((resolve) => {
                        releaseState = () => resolve({ ok: true, state: stateAt(300), config: {} });
                    });
                }
                if (body.action === 'event') {
                    return Promise.resolve({
                        ok: true, award: { awarded: true, amount: 20 },
                        evaluation: {}, state: stateAt(320)
                    });
                }
                return Promise.resolve({ ok: true, state: stateAt(300), config: {} });
            }
        });
        const g = w.BK.gamification;
        g.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(30);
        g.track('quiz_completed', '/ktgk1/toan/bai1.html');
        await sleep(80);
        if (releaseState) releaseState();
        await sleep(80);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(/320 XP tổng cộng/.test(text), 'phản hồi state cũ không ghi đè XP vừa cộng', text.slice(0, 80));
    }

    /* 11. Không có BKCloud: báo lỗi cấu hình, không treo spinner */
    {
        const { w } = makeDom({ noCloud: true });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(120);
        const text = w.document.getElementById('bkGamificationRoot').textContent;
        assert(!/Đang tải tiến trình…/.test(text), 'không treo ở trạng thái đang tải');
        assert(/Chưa tải được tiến trình|E_UNKNOWN/.test(text), 'báo lỗi khi thiếu lớp kết nối');
    }

    console.log('\nKết quả: ' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) process.exit(1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
