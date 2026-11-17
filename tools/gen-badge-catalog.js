'use strict';
/**
 * Bá Khí — sinh danh mục badge phía máy chủ từ nguồn duy nhất.
 *
 * Nguồn sự thật duy nhất của danh mục badge là `assets/bakhi/bk-badges.js`.
 * Tệp này sinh ra hai artifact phía máy chủ:
 *   1. `supabase/functions/_shared/badge-catalog.ts` (student-profile).
 *   2. Khối `generated:badge-catalog` trong `admin-actions/index.ts`, để
 *      admin-actions vẫn là một tệp tự chứa khi upload qua Management API.
 * QA (`badges-smoke.js`, `founder-rework-smoke.js`) so lại ba bên.
 *
 * Cách dùng (jsdom cài ngoài repo, giống QA):
 *   npm install jsdom --prefix /tmp/bktest --no-save
 *   NODE_PATH=/tmp/bktest/node_modules node tools/gen-badge-catalog.js
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'supabase', 'functions', '_shared', 'badge-catalog.ts');
const ADMIN_ACTIONS = path.join(ROOT, 'supabase', 'functions', 'admin-actions', 'index.ts');
const EXPECTED_COUNT = 99;

function main() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://minhtruk.github.io/bakhi/',
    runScripts: 'outside-only'
  });
  const w = dom.window;
  w.BK = {
    ui: { toast() {} },
    signals: { bump() {}, get() { return {}; } },
    store: {
      get() {
        return {
          practice: [], review: [], notes: [], bookmarks: [], history: [],
          achievements: { counters: {} }, prefs: {}
        };
      }
    }
  };
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/bakhi/bk-badges.js'), 'utf8'));
  const catalog = w.BK.badges.CATALOG;
  /* 99 = 74 tự động + 25 badge chỉ trao tay (2 Administrator + 2 Developer
     + 11 Founder thế hệ 7.4 + 10 Founder Badge 7.5.0). */
  if (!Array.isArray(catalog) || catalog.length !== EXPECTED_COUNT) {
    throw new Error('Danh mục badge không đúng ' + EXPECTED_COUNT + ' mục: ' +
      (catalog && catalog.length));
  }
  const ids = catalog.map((x) => x.id);
  if (new Set(ids).size !== ids.length) throw new Error('Danh mục badge có id trùng.');

  const rows = catalog.map((x) => ({
    id: x.id,
    name: x.name,
    desc: x.desc,
    icon: x.icon,
    category: x.category,
    rarity: x.rarity,
    goal: x.goal,
    metric: x.key || null,
    frame: x.frame || null,
    admin_only: !!x.adminOnly,
    exclusive: x.exclusive || null
  }));

  const auto = rows.filter((r) => !r.admin_only).length;
  const adminOnly = rows.length - auto;

  const ts = `/* TỆP SINH TỰ ĐỘNG — đừng sửa tay.
   Nguồn: assets/bakhi/bk-badges.js (CATALOG).
   Sinh lại: node tools/gen-badge-catalog.js
   ${rows.length} badge: ${auto} tự động + ${adminOnly} chỉ Administrator trao. */

export interface BadgeDef {
    id: string;
    name: string;
    desc: string;
    icon: string;
    category: string;
    rarity: string;
    goal: number;
    metric: string | null;
    frame: string | null;
    admin_only: boolean;
    exclusive: string | null;
}

export const BADGE_CATALOG: BadgeDef[] = ${JSON.stringify(rows, null, 4)};

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(
    BADGE_CATALOG.map((b) => [b.id, b])
);

export const AUTO_BADGES = BADGE_CATALOG.filter((b) => !b.admin_only);
export const ADMIN_BADGES = BADGE_CATALOG.filter((b) => b.admin_only);
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, ts, 'utf8');

  /* Khối nhúng trong admin-actions (tệp tự chứa, không import). */
  const meta = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    rarity: r.rarity,
    frame: r.frame,
    admin_only: r.admin_only,
    exclusive: r.exclusive
  }));
  const startMark = '/* <generated:badge-catalog> */';
  const endMark = '/* </generated:badge-catalog> */';
  const adminSrc = fs.readFileSync(ADMIN_ACTIONS, 'utf8');
  const start = adminSrc.indexOf(startMark);
  const end = adminSrc.indexOf(endMark);
  if (start < 0 || end < start) {
    throw new Error('admin-actions/index.ts thiếu mốc generated:badge-catalog.');
  }
  const block = startMark + '\n' +
    'const BADGE_CATALOG: BadgeMeta[] = ' + JSON.stringify(meta, null, 4) + ';\n' +
    endMark;
  fs.writeFileSync(ADMIN_ACTIONS, adminSrc.slice(0, start) + block + adminSrc.slice(end + endMark.length), 'utf8');

  console.log('Đã ghi ' + path.relative(ROOT, OUT) + ' và khối nhúng trong admin-actions — ' +
    rows.length + ' badge (' + auto + ' tự động, ' + adminOnly + ' trao tay).');
}

main();
