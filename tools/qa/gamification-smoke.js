#!/usr/bin/env node
/**
 * gamification-smoke.js — kiểm tra lớp giao diện Gamification 2.0 (8.3.0).
 *
 * Chạy trong jsdom, không gọi mạng: Edge Function được thay bằng stub để kiểm
 * tra hợp đồng dữ liệu, hàng đợi idempotent và việc dựng dashboard.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/gamification-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-gamification.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-gamification.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function fakeState(overrides = {}) {
    return Object.assign({
        total_xp: 320,
        level: 3,
        level_xp: 40,
        level_span: 300,
        next_level_xp: 380,
        xp_remaining: 60,
        progress_pct: 13,
        branches: [{ id: 'knowledge', nodes: 3, completed: 1, progress: 33 }],
        nodes: [
            { id: 'knowledge-1', branch: 'knowledge', name: 'Nền tảng', description: 'Học 3 lượt', icon: 'fa-book-open', metric: 'lesson_study', target: 3, requires: [], reward: {}, progress: 100, status: 'completed', completed_at: '2026-11-20T02:00:00Z', metric_value: 4 },
            { id: 'knowledge-2', branch: 'knowledge', name: 'Ôn luyện', description: 'Quiz 5 bài', icon: 'fa-clipboard-check', metric: 'quiz_completed', target: 5, requires: ['knowledge-1'], reward: {}, progress: 40, status: 'in_progress', metric_value: 2 }
        ],
        achievements: [
            { id: 'ach-first-quiz', name: 'Câu hỏi đầu tiên', description: 'Quiz đầu tiên', icon: 'fa-flag-checkered', rarity: 'common', category: 'quiz', reward: {}, is_hidden: false, stages: 1, progress: 100, stage: 1, unlocked_at: '2026-11-20T02:00:00Z', visible: true },
            { id: 'ach-quiz-10', name: 'Mười lần luyện', description: '10 quiz', icon: 'fa-clipboard-list', rarity: 'uncommon', category: 'quiz', reward: {}, is_hidden: false, stages: 1, progress: 20, stage: 1, unlocked_at: null, visible: true }
        ],
        missions: [
            { user_mission_id: 'um-1', id: 'mission-daily-quiz-1', name: 'Một bài quiz hôm nay', description: 'Hoàn thành 1 bài quiz', category: 'practice', difficulty: 'easy', cadence: 'daily', metric: 'quiz_completed', target: 1, progress: 1, status: 'completed', reward: { xp: 40 }, expires_at: '2026-11-22T00:00:00Z' },
            { user_mission_id: 'um-2', id: 'mission-weekly-quiz-5', name: 'Năm bài trong tuần', description: '5 quiz', category: 'practice', difficulty: 'normal', cadence: 'weekly', metric: 'quiz_completed', target: 5, progress: 2, status: 'in_progress', reward: { xp: 120 }, expires_at: '2026-11-24T00:00:00Z' }
        ],
        mission_history: [{ user_mission_id: 'um-0', id: 'mission-daily-read', name: 'Học một bài', status: 'claimed', period_key: '2026-11-20', claimed_at: '2026-11-20T09:00:00Z' }],
        inventory: [{ item_id: 'frame-laurel', acquired_at: '2026-11-20T02:00:00Z', source: 'achievement', is_equipped: true, kind: 'frame', name: 'Khung Nguyệt Quế', description: '', icon: 'fa-crown', rarity: 'rare', metadata: {} }],
        catalog: [{ item_id: 'frame-laurel', kind: 'frame', name: 'Khung Nguyệt Quế', description: '', icon: 'fa-crown', rarity: 'rare', metadata: {}, owned: true },
            { item_id: 'theme-dawn', kind: 'theme', name: 'Giao diện Bình Minh', description: '', icon: 'fa-sun', rarity: 'uncommon', metadata: {}, owned: false }],
        transactions: [{ id: 'tx-1', activity: 'quiz_completed', source: '/ktgk1/toan/x.html', amount: 20, status: 'awarded', created_at: '2026-11-20T03:00:00Z' }],
        activity: { quiz_completed: 2, lesson_study: 4 },
        challenges: [{ id: 'ch-1', slug: 'qa-boss', name: 'Thử thách QA', description: 'Mô tả', kind: 'knowledge', subject: 'toan', chapter: '', difficulty: 'normal', pass_score: 70, reward: {}, closes_at: null, question_count: 2, attempts_used: 1, best_score: 50, passed: false }],
        attempts: [{ id: 'at-1', challenge: 'qa-boss', name: 'Thử thách QA', score: 50, correct: 1, total: 2, passed: false, created_at: '2026-11-20T04:00:00Z' }],
        level_logs: [{ detail: { from: 2, to: 3, total_xp: 280 }, created_at: '2026-11-20T02:00:00Z' }],
        updated_at: '2026-11-21T00:00:00Z'
    }, overrides);
}

async function main() {
    console.log('Gamification 2.0 — smoke giao diện\n');

    const dom = new JSDOM('<!doctype html><html class="dark"><body><div id="bkGamificationRoot"></div></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/gamification/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const w = dom.window;
    const calls = [];
    let stateToReturn = fakeState();
    w.localStorage.setItem('bakhiStudent.v1', JSON.stringify({ studentId: 'student-qa', displayName: 'Học sinh QA' }));

    w.BK = {
        ui: {
            el(tag, cls) { const n = w.document.createElement(tag); if (cls) n.className = cls; return n; },
            toast() { },
            modal() { }
        },
        cloud: {
            identity: () => ({ id: 'student-qa', display_name: 'Học sinh QA' }),
            gamificationApi(body) {
                calls.push(body);
                if (body.action === 'state') {
                    return Promise.resolve({ ok: true, state: stateToReturn, config: { feature_flags: { xp: true } } });
                }
                if (body.action === 'event') {
                    const st = fakeState({ total_xp: 340, level_xp: 60, xp_remaining: 40, progress_pct: 20 });
                    stateToReturn = st;
                    return Promise.resolve({
                        ok: true,
                        award: { awarded: true, amount: 20, total_xp: 340, level: 3, previous_level: 3, leveled_up: false },
                        evaluation: { achievements: [], nodes: [], items: [], missions_completed: [] },
                        state: st
                    });
                }
                if (body.action === 'mission.claim') {
                    return Promise.resolve({ ok: true, claim: { ok: true, award: { awarded: true, amount: 40 } }, state: fakeState() });
                }
                if (body.action === 'boss.start') {
                    return Promise.resolve({
                        ok: true,
                        challenge: { slug: 'qa-boss', name: 'Thử thách QA', pass_score: 70, max_attempts: 3 },
                        questions: [
                            { id: 'q-1', prompt: 'Câu một?', options: ['A', 'B'] },
                            { id: 'q-2', prompt: 'Câu hai?', options: ['A', 'B'] }
                        ]
                    });
                }
                return Promise.resolve({ ok: true, state: fakeState() });
            }
        }
    };

    const errors = [];
    w.addEventListener('error', (e) => errors.push(String(e.message || e)));
    try {
        w.eval(SRC);
    } catch (e) {
        bad('nạp mô-đun', e.message);
        console.log('\nKết quả: ' + pass + ' đạt, ' + (fail + 1) + ' lỗi.');
        process.exit(1);
    }
    const g = w.BK.gamification;
    assert(g && g.__ready, 'mô-đun nạp được và công bố BK.gamification');
    assert(g.CSS === undefined && CSS.includes('.bkg-hero'), 'CSS dashboard tồn tại');

    /* Công thức cấp độ */
    assert(g.levelFromXp(0) === 1, 'XP 0 → cấp 1');
    assert(g.levelFromXp(99) === 1, 'XP 99 → cấp 1');
    assert(g.levelFromXp(100) === 2, 'XP 100 → cấp 2');
    assert(g.levelFromXp(279) === 2, 'XP 279 → cấp 2');
    assert(g.levelFromXp(280) === 3, 'XP 280 → cấp 3');
    assert(g.levelFromXp(580) === 4, 'XP 580 → cấp 4');
    const p = g.progressOf(340);
    assert(p.level === 3 && p.remaining === 240, 'progressOf tính đúng phần còn lại', JSON.stringify(p));

    /* Hàng đợi + idempotency */
    const key1 = g.track('quiz_completed', '/ktgk1/toan/bai1.html');
    assert(!!key1, 'track tạo khoá idempotency');
    await sleep(60);
    assert(calls.some((c) => c.action === 'event' && c.activity === 'quiz_completed'),
        'sự kiện hợp lệ được gửi tới gamification-api');
    const sent = calls.filter((c) => c.action === 'event').length;
    const key2 = g.track('quiz_completed', '/ktgk1/toan/bai1.html');
    await sleep(60);
    assert(key2 === null, 'cùng hoạt động/nguồn/ngày không gửi lại');
    assert(calls.filter((c) => c.action === 'event').length === sent, 'không phát sinh request trùng');

    /* Hoạt động không hợp lệ bị chặn tại client */
    assert(g.track('chat_message', '/chat/') === null, 'hoạt động không có trong danh sách bị bỏ');

    /* Dashboard dựng từ dữ liệu máy chủ */
    g.mount(w.document.getElementById('bkGamificationRoot'));
    await sleep(120);
    const root = w.document.getElementById('bkGamificationRoot');
    const text = root.textContent;
    assert(root.querySelector('.bkg-hero'), 'dựng khối tổng quan');
    assert(/Cấp 3/.test(text), 'hiển thị cấp độ từ máy chủ');
    assert(/340 XP tổng cộng/.test(text), 'hiển thị tổng XP mới nhất từ máy chủ');
    assert(text.includes('Một bài quiz hôm nay'), 'hiển thị nhiệm vụ');
    assert(text.includes('Câu hỏi đầu tiên'), 'hiển thị thành tựu');
    assert(text.includes('Khung Nguyệt Quế'), 'hiển thị kho vật phẩm');
    assert(text.includes('Thử thách QA'), 'hiển thị thử thách Boss');
    assert(text.includes('Lịch sử XP'), 'hiển thị lịch sử XP');
    assert(text.includes('Nền tảng'), 'hiển thị cây kỹ năng');

    /* Nhận thưởng nhiệm vụ gọi đúng hành động */
    const claimBtn = Array.prototype.slice.call(root.querySelectorAll('button'))
        .filter((b) => /Nhận thưởng/.test(b.textContent))[0];
    assert(!!claimBtn, 'có nút nhận thưởng cho nhiệm vụ đã hoàn thành');
    if (claimBtn) {
        claimBtn.click();
        await sleep(80);
        assert(calls.some((c) => c.action === 'mission.claim' && c.user_mission_id === 'um-1'),
            'nút nhận thưởng gọi mission.claim đúng nhiệm vụ');
    }

    /* Boss: câu hỏi không kèm đáp án, nộp bài gửi lựa chọn */
    const bossBtn = Array.prototype.slice.call(root.querySelectorAll('button'))
        .filter((b) => /Bắt đầu/.test(b.textContent))[0];
    assert(!!bossBtn, 'có nút bắt đầu thử thách');
    if (bossBtn) {
        bossBtn.click();
        await sleep(80);
        const radios = root.querySelectorAll('input[type="radio"]');
        assert(radios.length >= 4, 'hiển thị phương án câu hỏi Boss', String(radios.length));
        assert(!/correct_index/.test(root.textContent), 'không lộ đáp án trong giao diện');
    }

    assert(errors.length === 0, 'không có lỗi runtime trong jsdom', errors.join('; '));

    /* Không có học sinh → không gọi mạng, chỉ hiện cổng nhận diện */
    const dom2 = new JSDOM('<!doctype html><html><body><div id="bkGamificationRoot"></div></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/gamification/',
        runScripts: 'outside-only'
    });
    const w2 = dom2.window;
    let calls2 = 0;
    w2.BK = { cloud: { gamificationApi() { calls2++; return Promise.resolve({ ok: true, state: fakeState() }); } } };
    w2.eval(SRC);
    w2.BK.gamification.track('quiz_completed', '/x/');
    w2.BK.gamification.mount(w2.document.getElementById('bkGamificationRoot'));
    await sleep(50);
    assert(calls2 === 0, 'chưa nhận diện học sinh thì không gọi máy chủ');
    assert(/Cần nhận diện học sinh/.test(w2.document.body.textContent), 'hiện hướng dẫn nhận diện');

    console.log('\nKết quả: ' + pass + ' đạt, ' + fail + ' lỗi.');
    if (fail) process.exit(1);
}

main().catch((e) => {
    console.error('Lỗi không xử lý được:', e && e.message ? e.message : e);
    process.exit(1);
});
