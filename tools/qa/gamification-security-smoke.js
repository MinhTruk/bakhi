#!/usr/bin/env node
/**
 * gamification-security-smoke.js — kiểm tra bảo mật tĩnh của Gamification 2.0.
 *
 * Không thay thế kiểm tra RLS thật (xem tools/qa/gamification-db-check.js) mà
 * bắt các lỗi cấu hình dễ tái phát: policy ghi, lộ đáp án Boss, service-role
 * key trong trình duyệt, thiếu kiểm tra Founder ở máy chủ, thiếu idempotency.
 *
 * Dùng: node tools/qa/gamification-security-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SQL = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261209000000_bakhi_v830_gamification.sql'), 'utf8');
const FN = fs.readFileSync(path.join(ROOT, 'supabase/functions/gamification-api/index.ts'), 'utf8');
const CLIENT = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-gamification.js'), 'utf8');
const ADMIN_UI = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-devboard-gamification.js'), 'utf8');
const CONFIG = fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-supabase.config.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(n, d) { pass++; console.log('  ✓ ' + n + (d ? ' — ' + d : '')); }
function bad(n, d) { fail++; console.log('  ✗ ' + n + (d ? ' — ' + d : '')); }
function assert(c, n, d) { c ? ok(n, d) : bad(n, d); }

console.log('Gamification 2.0 — kiểm tra bảo mật\n');

/* 1. Không có policy ghi nào cho học sinh trên bảng tiến trình */
const writePolicies = (SQL.match(/create policy[\s\S]*?for (insert|update|delete|all)/gi) || []);
assert(writePolicies.length === 0, 'migration không tạo policy INSERT/UPDATE/DELETE', writePolicies.join(' | ').slice(0, 120));
assert((SQL.match(/create policy/g) || []).length >= 10, 'có policy SELECT cho dữ liệu của chính học sinh');
assert(/using \(student_id = public\.bakhi_current_student_id\(\)\)/.test(SQL), 'policy đọc giới hạn theo bakhi_current_student_id()');

/* 2. Bảng câu hỏi Boss không lộ */
assert(/revoke all on public\.boss_questions from anon, authenticated;/.test(SQL), 'boss_questions bị thu hồi quyền đọc');
assert(!/grant select on public\.boss_questions/.test(SQL), 'không cấp SELECT cho boss_questions');
const startFn = SQL.slice(SQL.indexOf('function public.bk_gam_boss_start'), SQL.indexOf('function public.bk_gam_boss_submit'));
assert(startFn.length > 0 && !/correct_index/.test(startFn), 'bk_gam_boss_start không trả về đáp án');
assert(/bk_gam_boss_start[\s\S]*?questions/.test(SQL), 'bk_gam_boss_start trả câu hỏi cho bài làm');

/* 3. Không tin dữ liệu client */
assert(/on conflict \(student_id, idempotency_key\) do nothing/.test(SQL), 'sổ XP chống trùng bằng idempotency');
assert(/daily_cap/.test(SQL) && /v_today >= v_cap/.test(SQL), 'máy chủ áp giới hạn XP theo ngày');
assert(/bk_gam_award\(p_student, 'boss_passed'/.test(SQL), 'XP Boss do máy chủ cấp sau khi chấm');
const eventCase = FN.slice(FN.indexOf("case 'event'"), FN.indexOf("case 'mission.claim'"));
assert(eventCase.length > 0 && !/body\.amount/.test(eventCase), 'Edge Function không nhận số XP cho hoạt động thường từ client');
assert(/ACTIVITIES\.indexOf\(activity\) < 0/.test(FN), 'chỉ chấp nhận danh sách hoạt động cố định');
const bossStartCase = FN.slice(FN.indexOf("case 'boss.start'"), FN.indexOf("case 'boss.submit'"));
assert(bossStartCase.length > 0 && !/correct_index/.test(bossStartCase), 'phản hồi boss.start không chứa correct_index');
assert(/correct_index/.test(FN.slice(FN.indexOf("case 'admin.challenge.save'"))), 'quản trị vẫn kiểm tra correct_index khi lưu câu hỏi');

/* 4. Phân quyền quản trị */
assert(/adminScope\(client, req\)/.test(FN), 'mọi hành động admin đều kiểm tra phiên quản trị');
assert(/scope !== 'founder'/.test(FN), 'điều chỉnh XP giới hạn cho Founder ở máy chủ');
assert(/requireAdmin|adminScope/.test(FN), 'có xác thực admin token');
assert(/admin_sessions/.test(FN) && /token_hash/.test(FN), 'tra phiên quản trị bằng hash token');
assert(/audit\(client/.test(FN), 'thao tác quản trị được ghi audit');

/* 5. Không có secret trong mã trình duyệt */
const clients = [CLIENT, ADMIN_UI, CONFIG];
assert(clients.every((src) => !/['"]service_role['"]/.test(src)), 'không dùng role service_role trong trình duyệt');
assert(clients.every((src) => !/SUPABASE_SERVICE_ROLE_KEY/.test(src)), 'không đọc SUPABASE_SERVICE_ROLE_KEY ở trình duyệt');
assert(clients.every((src) => !/createClient\([^)]*service/.test(src)), 'không tạo client service-role ở trình duyệt');
assert(!/eyJhbGciOi/.test(CONFIG), 'config trình duyệt không chứa JWT bí mật');
assert(/sb_publishable_/.test(CONFIG), 'config chỉ dùng publishable key');

/* 6. Hàng đợi và idempotency ở client */
assert(/idempotency_key: item\.key/.test(CLIENT), 'client gửi kèm idempotency_key');
assert(/markSent\(item\.key\)/.test(CLIENT), 'client ghi nhớ sự kiện đã gửi');
assert(/status >= 400 && status < 500/.test(CLIENT), 'client phân biệt lỗi 4xx/5xx khi gửi lại hàng đợi');
assert(!/\.from\(/.test(CLIENT), 'client không ghi trực tiếp bảng Supabase');

/* 7. Không lộ nội dung nhạy cảm trong log */
assert(!/console\.log\(.*total_xp/.test(CLIENT), 'không log dữ liệu tiến trình ra console');

/* 8. Rate limit */
assert(/limited\(client, 'gamification:'/.test(FN), 'Edge Function giới hạn tốc độ theo học sinh');

console.log('\nKết quả: ' + pass + ' đạt, ' + fail + ' lỗi.');
if (fail) process.exit(1);
