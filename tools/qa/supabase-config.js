'use strict';
/**
 * Bá Khí — QA cấu hình Supabase (không cần mạng, không cần jsdom).
 *
 *   node tools/qa/supabase-config.js
 *
 * 1. Mọi Edge Function có source trong `supabase/functions/` đều được khai báo
 *    trong `supabase/config.toml` và ngược lại (không còn khai báo mồ côi như
 *    `passkey-api` đã gỡ ở 7.8.0).
 * 2. Mỗi function khai báo `verify_jwt` tường minh và bằng `false` — tất cả
 *    function tự xác thực bên trong (Anonymous Auth / token quản trị / Dev Code),
 *    nên cổng JWT của Supabase phải mở.
 * 3. `project_id` trong config trùng project ref trong `bk-supabase.config.js`,
 *    và mọi tên function mà frontend gọi đều tồn tại.
 * 4. Không còn tham chiếu Passkey đã bị gỡ.
 * 5. Tên migration hợp lệ, không trùng version.
 * 6. Cú pháp TypeScript của toàn bộ Edge Function (cần `typescript`).
 *
 * Cài công cụ (ngoài repo):
 *   npm install typescript@5.6.3 --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/qa/supabase-config.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase', 'functions');
const CONFIG = path.join(ROOT, 'supabase', 'config.toml');
const CLIENT_CONFIG = path.join(ROOT, 'assets', 'bakhi', 'bk-supabase.config.js');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

let failures = 0;
function ok(name, cond, detail) {
  if (cond) console.log('  PASS ' + name);
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function skip(name, reason) { console.log('  SKIP ' + name + (reason ? ' — ' + reason : '')); }

/* ---------------------------------------------------------------- config.toml */
const toml = fs.readFileSync(CONFIG, 'utf8');
const declared = Object.create(null);
const blockRe = /^\[functions\.([A-Za-z0-9_-]+)\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/gm;
let m;
while ((m = blockRe.exec(toml))) {
  const name = m[1];
  const body = m[2] || '';
  const v = body.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/m);
  declared[name] = v ? v[1] === 'true' : null;
}
const projectId = (toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m) || [])[1] || '';

/* ------------------------------------------------------------- source thật */
const source = fs.readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .map((d) => d.name)
  .filter((name) => fs.existsSync(path.join(FUNCTIONS_DIR, name, 'index.ts')))
  .sort();

const declaredNames = Object.keys(declared).sort();

ok('có Edge Function trong source', source.length > 0, String(source.length));

/* 1. Đối chiếu hai chiều */
const missingConfig = source.filter((n) => !(n in declared));
ok('mọi function có source đều được khai báo trong config.toml',
  missingConfig.length === 0, missingConfig.join(', '));

const orphanConfig = declaredNames.filter((n) => source.indexOf(n) === -1);
ok('mọi khai báo trong config.toml đều có source',
  orphanConfig.length === 0, orphanConfig.join(', ') + ' (khai báo mồ côi)');

/* 2. verify_jwt */
const noFlag = declaredNames.filter((n) => declared[n] === null);
ok('mỗi function khai báo verify_jwt tường minh', noFlag.length === 0, noFlag.join(', '));

const jwtOn = declaredNames.filter((n) => declared[n] === true);
ok('verify_jwt = false cho mọi function (function tự xác thực bên trong)',
  jwtOn.length === 0, jwtOn.join(', ') + ' đang bật JWT ở cổng Supabase');

/* 3. project_id và tên function phía client */
const clientCfg = fs.readFileSync(CLIENT_CONFIG, 'utf8');
const clientUrl = (clientCfg.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1] || '';
const clientRef = (clientUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || '';
ok('project_id trong config.toml trùng project ref của frontend',
  !!projectId && projectId === clientRef, projectId + ' vs ' + clientRef);

const mapBlock = (clientCfg.match(/functions:\s*\{([\s\S]*?)\}/) || [])[1] || '';
const clientFunctions = [];
const mapRe = /([A-Za-z0-9_]+)\s*:\s*'([^']+)'/g;
let fm;
while ((fm = mapRe.exec(mapBlock))) clientFunctions.push(fm[2]);
const unknownClient = clientFunctions.filter((n) => source.indexOf(n) === -1);
ok('mọi function frontend gọi đều tồn tại trong source',
  unknownClient.length === 0, unknownClient.join(', '));
ok('frontend khai báo đủ danh sách function (' + clientFunctions.length + ')',
  clientFunctions.length >= source.length - 1, clientFunctions.join(', '));

/* 4. Không còn Passkey */
const textFiles = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    /* `tools/` tự nhắc tên hàm đã gỡ để kiểm tra nó không bị gọi lại. */
    if (d.name === '.git' || d.name === 'node_modules' || d.name === 'tools') return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    /* Tài liệu (.md) được phép nhắc lại việc gỡ Passkey; mã và cấu hình thì không. */
    else if (/\.(html|js|toml|yml)$/.test(d.name)) textFiles.push(p);
  });
})(ROOT);
const passkeyRefs = textFiles
  .filter((f) => /passkey-api|PASSKEY_RP_ID|PASSKEY_ORIGIN/.test(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
ok('không còn tham chiếu Passkey đã gỡ (7.8.0)', passkeyRefs.length === 0, passkeyRefs.slice(0, 4).join(', '));

/* 5. Migration */
const migrations = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const badNames = migrations.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f));
ok('tên migration đúng dạng <14 số>_<slug>.sql', badNames.length === 0, badNames.join(', '));
const versions = migrations.map((f) => f.slice(0, 14));
const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
ok('không có hai migration trùng version', dupes.length === 0, dupes.join(', '));
ok('có migration cho schema hiện tại (' + migrations.length + ' tệp)', migrations.length > 0);

/* 6. Cú pháp TypeScript của Edge Function */
let ts = null;
try { ts = require('typescript'); } catch (e) { ts = null; }
if (!ts) {
  skip('cú pháp TypeScript của Edge Function', 'chưa cài typescript (npm install typescript@5.6.3 --prefix /tmp/bktest --no-save)');
} else {
  const tsFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name.endsWith('.ts')) tsFiles.push(p);
    });
  })(FUNCTIONS_DIR);
  const broken = [];
  tsFiles.forEach((file) => {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true
    });
    const diags = (out.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
    if (diags.length) {
      const first = diags[0];
      broken.push(path.relative(ROOT, file).split(path.sep).join('/') + ': ' +
        ts.flattenDiagnosticMessageText(first.messageText, ' '));
    }
  });
  ok('cú pháp TypeScript của ' + tsFiles.length + ' tệp Edge Function', broken.length === 0,
    broken.slice(0, 3).join(' | '));
}

console.log('');
console.log('Function có source: ' + source.length + ' — khai báo trong config: ' + declaredNames.length + '.');
console.log(failures ? '=== ' + failures + ' FAILURE(S) ===' : '=== ALL CHECKS PASSED ===');
process.exitCode = failures ? 1 : 0;
