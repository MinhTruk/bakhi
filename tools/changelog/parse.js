/* =========================================================================
   Bá Khí — tools/changelog/parse.js
   Phân tích CHANGELOG.md (Keep a Changelog, tiếng Việt) thành payload cho
   Edge Function `changelog-sync`.

   - Nhận diện: `## [3.2.1] — 2026-11-15`
   - Nhóm: `### Bảo mật`, `### Cải tiến`, ...
   - Bullet nhiều dòng: dòng tiếp nối bắt đầu bằng khoảng trắng vẫn thuộc
     bullet trước đó (không bị cắt thành mục riêng).
   - Giữ nguyên Markdown nội tuyến (bold, italic, code, link) để frontend
     render an toàn bằng text node.
   - Bỏ qua tiêu đề không có ngày hoặc `[Unreleased]`.

   Dùng:
     node tools/changelog/parse.js CHANGELOG.md
     node tools/changelog/parse.js CHANGELOG.md > payload.json
     node tools/changelog/parse.js CHANGELOG.md --check
   ========================================================================= */
'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var CATEGORY_MAP = [
    ['tính năng mới', 'features'],
    ['tính năng', 'features'],
    ['cải tiến', 'improvements'],
    ['cải thiện', 'improvements'],
    ['sửa lỗi', 'fixes'],
    ['giao diện', 'ui'],
    ['hiệu năng', 'performance'],
    ['bảo mật', 'security'],
    ['thông báo', 'notice'],
    ['khác', 'other']
];

function categoryOf(heading) {
    var key = String(heading || '').trim().toLowerCase();
    for (var i = 0; i < CATEGORY_MAP.length; i++) {
        if (key === CATEGORY_MAP[i][0]) return CATEGORY_MAP[i][1];
    }
    for (var j = 0; j < CATEGORY_MAP.length; j++) {
        if (key.indexOf(CATEGORY_MAP[j][0]) === 0) return CATEGORY_MAP[j][1];
    }
    return 'other';
}

/** Bỏ ký hiệu Markdown để lấy tiêu đề/tóm tắt thuần chữ. */
function plain(text) {
    return String(text || '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '\u0001$1\u0002')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/(^|[\s(])\*([^*]+)\*/g, '$1$2')
        .replace(/(^|[\s(])_([^_]+)_/g, '$1$2')
        .replace(/[\u0001\u0002]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Tiêu đề ngắn: ưu tiên cụm in đậm đầu bullet, nếu không lấy câu đầu. */
function titleFromItem(item) {
    var bold = /^\*\*(.+?)\*\*/.exec(String(item || '').trim());
    var text = bold ? bold[1] : String(item || '').split(/[.:]\s|\s—\s/)[0];
    return clip(plain(text), 160);
}

function clip(text, max) {
    var s = String(text || '');
    return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
}

/** Tách một bullet thành các dòng đã gộp (dòng tiếp nối nối bằng dấu cách). */
function flushBullet(state, out) {
    if (!state.current) return;
    var text = state.current.join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
    state.current = null;
}

function normalizeDate(raw) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw || '').trim());
    if (!m) return null;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (isNaN(d.getTime())) return null;
    return m[1] + '-' + m[2] + '-' + m[3];
}

function hashEntry(entry) {
    var canonical = {
        version: entry.version,
        date: entry.date,
        sections: entry.sections
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function parseChangelog(markdown) {
    var lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    var entries = [];
    var current = null;
    var section = null;
    var intro = [];
    var bullet = { current: null };

    function closeEntry() {
        if (!current) return;
        flushBullet(bullet, section ? section.items : []);
        if (section && section.items.length) current.sections.push(section);
        section = null;

        /* Tiêu đề: đoạn văn ngay dưới heading phiên bản, nếu có. */
        var firstText = '';
        if (intro.length) firstText = plain(intro.join(' '));
        if (!firstText) {
            outer:
            for (var i = 0; i < current.sections.length; i++) {
                for (var j = 0; j < current.sections[i].items.length; j++) {
                    firstText = String(current.sections[i].items[j] || '');
                    if (firstText) break outer;
                }
            }
        }
        current.title = intro.length
            ? clip(firstText, 160)
            : (firstText ? titleFromItem(firstText) : ('Cập nhật phiên bản ' + current.version));

        /* Tóm tắt: đoạn mở đầu, nếu không có thì bullet đầu tiên. */
        var summary = intro.length ? plain(intro.join(' ')) : '';
        if (!summary && current.sections.length && current.sections[0].items.length) {
            summary = plain(current.sections[0].items[0]);
        }
        current.summary = clip(summary, 400);

        current.content_hash = hashEntry(current);
        entries.push(current);
        current = null;
        intro = [];
    }

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var vh = /^##\s+\[([^\]]+)\]\s*(?:—|–|-|:)\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(line);
        if (vh) {
            closeEntry();
            var version = String(vh[1]).trim();
            var date = normalizeDate(vh[2]);
            if (!date || !/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(version)) continue;
            current = {
                version: version,
                date: date,
                published_at: date + 'T00:00:00.000+07:00',
                title: '',
                summary: '',
                category: 'other',
                sections: []
            };
            continue;
        }
        if (!current) continue;

        var sh = /^###\s+(.+?)\s*$/.exec(line);
        if (sh) {
            flushBullet(bullet, section ? section.items : []);
            if (section && section.items.length) current.sections.push(section);
            section = { category: categoryOf(sh[1]), items: [] };
            continue;
        }

        var bh = /^##\s+/.exec(line);
        if (bh) { closeEntry(); continue; }

        if (/^\s*-\s+/.test(line)) {
            if (!section) section = { category: 'other', items: [] };
            flushBullet(bullet, section.items);
            bullet.current = [line.replace(/^\s*-\s+/, '')];
            continue;
        }

        if (bullet.current) {
            if (!line.trim()) continue;               /* dòng trống không kết thúc bullet */
            if (/^\s+/.test(line)) {                  /* dòng tiếp nối của bullet */
                bullet.current.push(line.trim());
                continue;
            }
            /* Dòng không thụt lề: kết thúc bullet; có thể là đoạn văn mở đầu. */
            flushBullet(bullet, section ? section.items : []);
            if (line.trim()) intro.push(line.trim());
            continue;
        }

        if (line.trim()) intro.push(line.trim());
    }
    closeEntry();

    return entries;
}

/** Kiểm tra trùng phiên bản và thứ tự ngày (mới nhất ở trên). */
function checkEntries(entries) {
    var problems = [];
    var seen = {};
    entries.forEach(function (e) {
        var key = e.version.toLowerCase();
        if (seen[key]) problems.push('Phiên bản trùng: ' + e.version);
        seen[key] = true;
    });
    for (var i = 1; i < entries.length; i++) {
        if (entries[i].date > entries[i - 1].date) {
            problems.push('Ngày không giảm dần: ' + entries[i - 1].version + ' → ' + entries[i].version);
        }
    }
    return problems;
}

function buildPayload(markdown, meta) {
    var entries = parseChangelog(markdown);
    return Object.assign({
        source: 'github',
        generator: 'bakhi-changelog-parser',
        entries: entries
    }, meta || {});
}

module.exports = {
    parseChangelog: parseChangelog,
    checkEntries: checkEntries,
    buildPayload: buildPayload,
    categoryOf: categoryOf,
    plain: plain
};

if (require.main === module) {
    var file = process.argv[2] || 'CHANGELOG.md';
    var check = process.argv.indexOf('--check') >= 0;
    var markdown;
    try {
        markdown = fs.readFileSync(path.resolve(file), 'utf8');
    } catch (e) {
        console.error('Không đọc được ' + file + ': ' + e.message);
        process.exit(2);
    }
    var entries = parseChangelog(markdown);
    var problems = checkEntries(entries);
    if (check) {
        if (!entries.length) {
            console.error('Không tìm thấy phiên bản nào trong ' + file);
            process.exit(1);
        }
        if (problems.length) {
            problems.forEach(function (p) { console.error('LỖI: ' + p); });
            process.exit(1);
        }
        console.log('OK: ' + entries.length + ' phiên bản — mới nhất ' + entries[0].version);
        process.exit(0);
    }
    if (problems.length) {
        problems.forEach(function (p) { console.error('CẢNH BÁO: ' + p); });
    }
    process.stdout.write(JSON.stringify(buildPayload(markdown), null, 2) + '\n');
}
