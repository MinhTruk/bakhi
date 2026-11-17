'use strict';
/**
 * Bá Khí — sinh danh mục badge phía máy chủ từ nguồn duy nhất.
 *
 * Nguồn sự thật của 75 badge là `assets/bakhi/bk-badges.js`. Edge Function
 * `student-profile` cần cùng danh mục để xác minh phía máy chủ, nên tệp này
 * sinh ra `supabase/functions/_shared/badge-catalog.ts`. QA (`badges-smoke.js`)
 * so sánh lại hai bên để phát hiện lệch.
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
  /* 89 = 74 tự động + 15 chỉ Administrator trao (2 admin + 2 Developer + 11 Founder + 1 Kẻ sưu tầm). */
  if (!Array.isArray(catalog) || catalog.length !== 89) {
    throw new Error('Danh mục badge không đúng 89 mục: ' + (catalog && catalog.length));
  }

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
  console.log('Đã ghi ' + path.relative(ROOT, OUT) + ' — ' + rows.length +
    ' badge (' + auto + ' tự động, ' + adminOnly + ' admin).');
}

main();
