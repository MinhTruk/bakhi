#!/usr/bin/env node
/**
 * avatar-sync-smoke.js — đồng bộ avatar & khung avatar (8.3.5).
 *
 * Nguyên nhân gốc đã sửa:
 *   · Gamification chỉ vẽ chữ cái đầu thay vì ảnh đại diện thật.
 *   · Khung được lưu ở hai nơi: student_profiles.frame (toàn site) và
 *     user_inventory.is_equipped (Gamification) → trang bị ở Gamification
 *     không đổi navbar/hồ sơ.
 *
 * Kiểm tra ở đây (không cần máy chủ):
 *  1. Hero Gamification dùng chung BKProfile → có ảnh + khung như navbar.
 *  2. Đổi avatar trong hồ sơ → Gamification vẽ lại ảnh mới (không cần F5).
 *  3. Trang bị khung ở Gamification → hồ sơ/navbar nhận khung trong cùng nhịp.
 *  4. Bỏ khung → về 'none', KHÔNG mất avatar, không mất vật phẩm.
 *  5. Khung máy chủ trả về không bị hạ về 'none' khi cache badge chưa biết.
 *  6. Đổi tài khoản → không dùng hồ sơ/khung của tài khoản trước.
 *
 * Dùng: NODE_PATH=/tmp/bktest/node_modules node tools/qa/avatar-sync-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-profile.js'), 'utf8');
const GAM = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-gamification.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, detail) { pass++; console.log('  ✓ ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function assert(cond, name, detail) { cond ? ok(name, detail) : bad(name, detail); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const AVATAR_A = 'data:image/png;base64,AAAA';
const AVATAR_B = 'data:image/png;base64,BBBB';

function stateWith(frameItem) {
    return {
        total_xp: 120, level: 2, level_xp: 20, level_span: 100, next_level_xp: 200,
        xp_remaining: 80, progress_pct: 20,
        branches: [], nodes: [], achievements: [], missions: [], mission_history: [],
        inventory: frameItem ? [frameItem] : [],
        catalog: frameItem ? [Object.assign({ owned: true }, frameItem)] : [],
        transactions: [], activity: {}, challenges: [], attempts: [], level_logs: [],
        updated_at: '2026-11-21T00:00:00Z'
    };
}

function makeWorld(opts) {
    opts = opts || {};
    const dom = new JSDOM('<!doctype html><html><body><div id="bkGamificationRoot"></div></body></html>', {
        url: 'https://minhtruk.github.io/bakhi/gamification/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const w = dom.window;
    const calls = [];
    let currentState = stateWith({
        item_id: 'frame-laurel', kind: 'frame', name: 'Khung Nguyệt Quế',
        icon: 'fa-crown', rarity: 'rare', is_equipped: false,
        metadata: { profile_frame: 'wreath' }
    });

    w.localStorage.setItem('bakhiStudent.v1', JSON.stringify({ studentId: 'st-a', displayName: 'An' }));
    w.BK = { ui: { el() { }, toast() { }, modal() { } }, cloud: {} };
    w.BKCloud = {
        identity: () => ({ id: w.localStorage.getItem('bakhiStudent.v1') ? JSON.parse(w.localStorage.getItem('bakhiStudent.v1')).studentId : '', display_name: 'An' }),
        gamificationApi(body) {
            calls.push(body.action);
            if (body.action === 'state') return Promise.resolve({ ok: true, state: currentState, config: {} });
            if (body.action === 'equip') {
                const equipped = body.equipped !== false;
                currentState = stateWith({
                    item_id: 'frame-laurel', kind: 'frame', name: 'Khung Nguyệt Quế',
                    icon: 'fa-crown', rarity: 'rare', is_equipped: equipped,
                    metadata: { profile_frame: 'wreath' }
                });
                return Promise.resolve({
                    ok: true, kind: 'frame', frame: equipped ? 'wreath' : 'none', state: currentState
                });
            }
            return Promise.resolve({ ok: true, state: currentState, config: {} });
        }
    };

    w.eval(PROFILE);
    w.eval(GAM);
    return { w, calls };
}

async function main() {
    console.log('Bá Khí 8.3.5 — Đồng bộ Avatar & Khung\n');

    /* 1 + 2. Hero dùng chung BKProfile, cập nhật khi hồ sơ đổi */
    {
        const { w } = makeWorld();
        const P = w.BKProfile;
        P.save({ nickname: 'An', avatar: AVATAR_A, frame: 'leaf' });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(80);
        const root = w.document.getElementById('bkGamificationRoot');
        const heroImg = root.querySelector('.bkg-hero img.bk-avatar-img');
        assert(!!heroImg, 'hero Gamification hiển thị ảnh đại diện thật');
        assert(heroImg && heroImg.src === AVATAR_A, 'ảnh hero khớp hồ sơ');
        assert(!!root.querySelector('.bkg-hero [data-frame="leaf"]'), 'khung hero khớp hồ sơ');

        P.save({ avatar: AVATAR_B });
        await sleep(30);
        const after = root.querySelector('.bkg-hero img.bk-avatar-img');
        assert(after && after.src === AVATAR_B, 'đổi avatar ở hồ sơ → hero vẽ lại ngay');
    }

    /* 3. Trang bị khung trong Gamification → hồ sơ nhận khung */
    {
        const { w } = makeWorld();
        const P = w.BKProfile;
        P.save({ nickname: 'An', avatar: AVATAR_A, frame: 'none' });
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(80);
        const root = w.document.getElementById('bkGamificationRoot');
        const useBtn = Array.from(root.querySelectorAll('button.bkg-btn'))
            .find((b) => /Dùng/.test(b.textContent || ''));
        assert(!!useBtn, 'kho vật phẩm có nút trang bị khung');
        if (useBtn) {
            useBtn.click();
            await sleep(60);
            assert(P.get().frame === 'wreath', 'hồ sơ nhận khung vừa trang bị', P.get().frame);
            assert(P.get().avatar === AVATAR_A, 'trang bị khung không làm mất avatar');
            assert(!!w.document.querySelector('[data-frame="wreath"]') ||
                !!root.querySelector('[data-frame="wreath"]'), 'avatar toàn trang vẽ khung mới');
        }
    }

    /* 4. Bỏ khung: về none, giữ avatar */
    {
        const { w } = makeWorld();
        const P = w.BKProfile;
        P.save({ avatar: AVATAR_A, frame: 'none' });
        P.applyServerFrame('wreath');
        assert(P.get().frame === 'wreath', 'áp khung máy chủ vào cache hồ sơ');
        w.BK.gamification.mount(w.document.getElementById('bkGamificationRoot'));
        await sleep(80);
        const root = w.document.getElementById('bkGamificationRoot');
        const offBtn = Array.from(root.querySelectorAll('button.bkg-btn'))
            .find((b) => /Bỏ dùng/.test(b.textContent || ''));
        assert(!!offBtn, 'vật phẩm đang dùng hiện nút “Bỏ dùng”');
        if (offBtn) {
            offBtn.click();
            await sleep(60);
            assert(P.get().frame === 'none', 'bỏ khung → hồ sơ về Mặc định');
            assert(P.get().avatar === AVATAR_A, 'bỏ khung giữ nguyên ảnh đại diện');
        }
    }

    /* 5. Khung máy chủ không bị hạ khi cache badge chưa biết */
    {
        const { w } = makeWorld();
        const P = w.BKProfile;
        const applied = P.applyRemote({
            nickname: 'An', avatar: AVATAR_A, frame: 'phoenix', updatedAt: Date.now() + 1000
        }, { force: true });
        assert(applied === true, 'áp hồ sơ máy chủ có khung ngoài danh sách badge');
        assert(P.get().frame === 'phoenix', 'không tự hạ khung máy chủ về none', P.get().frame);
    }

    /* 6. Đổi tài khoản: không dùng nhầm cache */
    {
        const { w } = makeWorld();
        const P = w.BKProfile;
        P.save({ nickname: 'An', avatar: AVATAR_A, frame: 'leaf' });
        w.localStorage.setItem('bakhiStudent.v1', JSON.stringify({ studentId: 'st-b', displayName: 'Bình' }));
        const other = P.get();
        assert(other.nickname === '' && other.avatar === '' && other.frame === 'none',
            'tài khoản khác không thấy avatar/khung của tài khoản trước', JSON.stringify(other));
    }

    /* 7. Đăng ký khung từ kho vật phẩm cho bộ chọn hồ sơ */
    {
        const { w } = makeWorld();
        const P = w.BKProfile;
        P.setOwnedFrames(['wreath', 'crown']);
        assert(P.ownedFrames().indexOf('wreath') !== -1 && P.canEquip('wreath'),
            'khung thưởng Gamification trang bị được từ hồ sơ');
    }

    console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
    process.exit(fail ? 1 : 0);
}

main().catch((err) => {
    console.error('Lỗi kiểm thử:', err && err.message);
    process.exit(1);
});
