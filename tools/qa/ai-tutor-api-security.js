'use strict';
/**
 * Bá Khí — QA bảo mật AI Tutor (8.5.0). Không cần mạng, không cần jsdom.
 *
 *   node tools/qa/ai-tutor-api-security.js
 *
 * Kiểm tra:
 *   1. Không có khoá API thật trong bất kỳ tệp nào của repo.
 *   2. Frontend không gọi thẳng nhà cung cấp AI và không dựng endpoint riêng.
 *   3. Edge Function chỉ đọc khoá từ Deno.env, không tin student_id của client.
 *   4. Migration: RLS bật cho mọi bảng AI, chỉ có policy SELECT.
 *   5. config.toml + bk-supabase.config.js khai báo ai-tutor-api đúng.
 *   6. Chỉ Founder được đổi cấu hình (máy chủ kiểm tra scope).
 *   7. Không dùng innerHTML cho dữ liệu người dùng (ngoài KaTeX).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'brain-toolkit', 'brain', 'artifacts'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ------------------------------------------------------- 1. Không lộ khoá */
const KEY_PATTERNS = [
  /AIza[0-9A-Za-z_-]{30,}/,          // Google API key
  /sk-[A-Za-z0-9_-]{24,}/,           // OpenAI-style
  /AQ\.[A-Za-z0-9_-]{20,}/,          // Google AI Studio key
  /sbp_[a-f0-9]{20,}/,               // Supabase personal access token
  /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/ // JWT dài
];
const leaks = [];
for (const file of walk(ROOT)) {
  if (!/\.(js|html|css|json|md|toml|yml|yaml|example)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  KEY_PATTERNS.forEach((re) => {
    if (re.test(text)) leaks.push(path.relative(ROOT, file).split(path.sep).join('/'));
  });
}
ok('không có chuỗi giống khoá API/token thật trong repo',
  leaks.length === 0, Array.from(new Set(leaks)).slice(0, 5).join(', '));

const assigned = [];
for (const file of walk(ROOT)) {
  if (!/\.(js|html|toml|md|example)$/.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/AI_TUTOR_(?:FALLBACK_)?API_KEY\s*=\s*([^\s<"]{16,})/);
  if (m) assigned.push(path.relative(ROOT, file).split(path.sep).join('/'));
}
ok('không có tệp nào gán giá trị thật cho AI_TUTOR_API_KEY',
  assigned.length === 0, assigned.join(', '));

/* ------------------------------------------- 2. Frontend không gọi provider */
const FE = ['assets/bakhi/bk-ai-tutor.js', 'assets/bakhi/bk-founder-ai.js', 'ai-tutor/index.html'];
const providerHosts = /generativelanguage\.googleapis\.com|api\.openai\.com|api\.groq\.com|openrouter\.ai|api\.mistral\.ai|api\.deepseek\.com/i;
const hostHits = FE.filter((f) => providerHosts.test(read(f)));
ok('frontend không chứa địa chỉ nhà cung cấp AI', hostHits.length === 0, hostHits.join(', '));

ok('frontend gọi đúng Edge Function ai-tutor-api',
  /ai-tutor-api/.test(read('assets/bakhi/bk-supabase.config.js')) &&
  /aiTutorApi/.test(read('assets/bakhi/bk-cloud.js')));

const aiClient = read('assets/bakhi/bk-ai-tutor.js');
ok('module AI dùng BKCloud để lấy phiên, không tự tạo client Supabase',
  /BKCloud\.chatClient/.test(aiClient) && !/createClient\s*\(/.test(aiClient));
ok('frontend không dùng eval', !/\beval\s*\(/.test(aiClient));
ok('frontend không dùng document.write', !/document\.write/.test(aiClient));

const innerHtmlUses = (aiClient.match(/\.innerHTML/g) || []).length;
ok('chỉ KaTeX dùng innerHTML (1 chỗ, công thức đã tách khỏi văn bản)',
  innerHtmlUses === 1, String(innerHtmlUses));
ok('KaTeX render với trust:false', /trust:\s*false/.test(aiClient));

/* ------------------------------------------- 3. Edge Function / máy chủ */
const fn = read('supabase/functions/ai-tutor-api/index.ts');
ok('máy chủ xác thực phiên thiết bị bằng callerUserId', /callerUserId\(req\)/.test(fn));
ok('máy chủ không đọc student_id từ body client',
  !/body\.student_id|body\[['"]student_id/.test(fn));
ok('máy chủ tra student_id qua student_devices', /from\('student_devices'\)/.test(fn));
ok('máy chủ kiểm tra học sinh còn hoạt động', /is_active/.test(fn));
ok('máy chủ giới hạn tần suất bằng bakhi_rate_limit', /bakhi_rate_limit/.test(fn));
ok('máy chủ có kiểm tra hạn mức ngày', /DAILY_LIMIT|DAILY_TOKEN_LIMIT/.test(fn));
ok('máy chủ chặn gửi chồng lặp', /BUSY|DUPLICATE/.test(fn));
ok('máy chủ chỉ Founder được đổi cấu hình', /FOUNDER_ONLY/.test(fn) && /admin_sessions/.test(fn));
ok('máy chủ ghi nhật ký quản trị khi đổi cấu hình', /logAction\(client, 'ai_tutor/.test(fn));
ok('máy chủ lưu câu hỏi trước khi gọi AI',
  fn.indexOf('Lưu câu hỏi TRƯỚC khi gọi AI') !== -1 &&
  fn.indexOf('Lưu câu hỏi TRƯỚC khi gọi AI') < fn.indexOf('turns: turns.concat('));
ok('máy chủ xoá mềm hội thoại, không hard delete',
  /deleted_at: new Date\(\)\.toISOString\(\)/.test(fn) && !/from\('ai_conversations'\)\.delete/.test(fn));

const providers = read('supabase/functions/_shared/ai-providers.ts');
ok('adapter đọc khoá từ Deno.env', /Deno\.env\.get\('AI_TUTOR_API_KEY'\)/.test(providers) ||
  /Deno\.env\.get\(suffix \+ 'API_KEY'\)/.test(providers));
ok('adapter không hardcode khoá', !/Bearer\s+[A-Za-z0-9._-]{20,}/.test(providers));
ok('adapter có xử lý timeout bằng AbortController', /AbortController/.test(providers));
ok('adapter phân loại lỗi provider', /RATE_LIMIT/.test(providers) && /QUOTA/.test(providers) && /TIMEOUT/.test(providers));
ok('adapter chặn model không hợp lệ', /Tên mô hình AI không hợp lệ/.test(providers));
ok('giả lập chỉ bật khi AI_TUTOR_MOCK=1', /AI_TUTOR_MOCK/.test(providers));

const prompts = read('supabase/functions/_shared/ai-prompts.ts');
ok('prompt tách system khỏi dữ liệu ngữ cảnh', /---BEGIN-CONTEXT---/.test(prompts));
ok('prompt có chống prompt injection', /KHÔNG PHẢI CHỈ DẪN/.test(prompts));
ok('prompt từ chối tiết lộ cấu hình', /tiết lộ hướng dẫn hệ thống/.test(prompts));

/* -------------------------------------------------- 4. Migration & RLS */
const MIG = 'supabase/migrations/20261218000000_bakhi_v850_ai_tutor.sql';
ok('có migration AI Tutor', exists(MIG));
const sql = read(MIG);
const tables = ['ai_conversations', 'ai_messages', 'ai_usage_logs', 'ai_settings', 'ai_prompt_versions'];
ok('tạo đủ bảng AI', tables.every((t) => sql.includes('create table if not exists public.' + t)));
ok('bật RLS cho mọi bảng AI',
  tables.every((t) => new RegExp('alter table public\\.' + t + '\\s+enable row level security').test(sql)));
const policies = (sql.match(/create policy/g) || []).length;
const selectPolicies = (sql.match(/for select to authenticated/g) || []).length;
ok('chỉ có policy SELECT', policies === selectPolicies && policies >= 3, policies + '/' + selectPolicies);
ok('không có policy ghi cho học sinh',
  !/for (insert|update|delete)[^;]*to authenticated/i.test(sql) && !/for all to authenticated/i.test(sql));
ok('policy dùng bakhi_current_student_id', (sql.match(/bakhi_current_student_id\(\)/g) || []).length >= 3);
ok('không có using (true) trong RLS', !/using\s*\(\s*true\s*\)/i.test(sql));
ok('không bảng AI nào có cột chứa khoá API',
  !/(api_key|apikey|secret|token)\s+(text|uuid)/i.test(sql));
ok('có ràng buộc duy nhất cho phiên bản prompt', /unique \(version\)/.test(sql));
ok('có chỉ mục theo học sinh', /ai_conversations_student_idx/.test(sql));
ok('có kiểm tra toàn vẹn sau migration', /raise exception 'ai_settings thiếu dòng/.test(sql));

/* --------------------------------------------- 5. Khai báo function */
const toml = read('supabase/config.toml');
ok('config.toml khai báo ai-tutor-api', /\[functions\.ai-tutor-api\]/.test(toml));
const block = (toml.split('[functions.ai-tutor-api]')[1] || '').split('[')[0];
ok('ai-tutor-api có verify_jwt = false', /verify_jwt\s*=\s*false/.test(block));

const cfg = read('assets/bakhi/bk-supabase.config.js');
ok('bk-supabase.config.js map aiTutor → ai-tutor-api', /aiTutor:\s*'ai-tutor-api'/.test(cfg));
ok('frontend chỉ dùng khoá publishable',
  /sb_publishable_/.test(cfg) && !/sb_secret_|eyJhbGciOi/.test(cfg));

/* ------------------------------------------------ 6. Tệp cấu hình mẫu */
ok('có .env.example', exists('.env.example'));
const envExample = exists('.env.example') ? read('.env.example') : '';
ok('.env.example chỉ chứa placeholder', !/AI_TUTOR_API_KEY\s*=\s*[A-Za-z0-9._-]{16,}/.test(envExample));
ok('.env.example nêu tên secret AI_TUTOR_API_KEY', /AI_TUTOR_API_KEY/.test(envExample));
ok('.env.example ghi rõ khoá nằm trong Supabase Secrets', /Supabase.*Secrets/i.test(envExample));

/* ------------------------------------------------ 7. Tài liệu hướng dẫn */
ok('có tài liệu cấu hình API key', exists('docs/AI_TUTOR_API_KEY_SETUP.md'));
ok('có tài liệu kiến trúc', exists('docs/AI_TUTOR_ARCHITECTURE.md'));
ok('có tài liệu bảo mật', exists('docs/AI_TUTOR_SECURITY.md'));

console.log('');
console.log(failures ? '=== ' + failures + ' FAILURE(S) ===' : '=== ALL CHECKS PASSED ===');
process.exitCode = failures ? 1 : 0;
