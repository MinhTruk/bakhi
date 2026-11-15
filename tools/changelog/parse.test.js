'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseChangelog, checkEntries, categoryOf } = require('./parse');

const FIXTURE = `# Changelog

Mọi thay đổi đáng chú ý.

## [3.3.0] — 2026-12-01

### Tính năng mới

- **Đồng bộ changelog**: đọc file CHANGELOG.md và tự phát hành
  khi push lên nhánh chính, kể cả dòng tiếp nối
  vẫn thuộc cùng một bullet.
- **Liên kết** [trang chủ](https://example.com) vẫn giữ Markdown.

### Bảo mật

- Chặn gọi hàm \`bakhi_rate_limit()\` từ \`anon\`.

### Thông báo

- Thông báo mới có liên kết tới phiên bản.

## [3.2.1] — 2026-11-15

### Sửa lỗi

- Sửa lỗi nhỏ.

## [Unreleased]

- Không được xuất bản.
`;

test('phân tích phiên bản, ngày và thứ tự', () => {
    const entries = parseChangelog(FIXTURE);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].version, '3.3.0');
    assert.equal(entries[0].date, '2026-12-01');
    assert.equal(entries[0].published_at, '2026-12-01T00:00:00.000Z');
    assert.equal(entries[1].version, '3.2.1');
});

test('dòng tiếp nối nằm trong cùng bullet', () => {
    const [entry] = parseChangelog(FIXTURE);
    const features = entry.sections.find((s) => s.category === 'features');
    assert.equal(features.items.length, 2);
    assert.match(features.items[0], /khi push lên nhánh chính/);
    assert.match(features.items[0], /vẫn thuộc cùng một bullet/);
});

test('giữ Markdown nội tuyến và tiêu đề thuần chữ', () => {
    const [entry] = parseChangelog(FIXTURE);
    const features = entry.sections.find((s) => s.category === 'features');
    assert.match(features.items[1], /\[trang chủ\]\(https:\/\/example\.com\)/);
    assert.equal(entry.title, 'Đồng bộ changelog');
});

test('nhận diện nhóm Bảo mật và Thông báo', () => {
    const [entry] = parseChangelog(FIXTURE);
    const cats = entry.sections.map((s) => s.category);
    assert.deepEqual(cats, ['features', 'security', 'notice']);
    assert.equal(categoryOf('Bảo mật'), 'security');
    assert.equal(categoryOf('Thông báo'), 'notice');
    assert.equal(categoryOf('Không rõ'), 'other');
});

test('bỏ qua heading không có ngày và [Unreleased]', () => {
    const entries = parseChangelog(FIXTURE);
    assert.ok(entries.every((e) => e.version !== 'Unreleased'));
});

test('content_hash ổn định và checkEntries phát hiện trùng', () => {
    const a = parseChangelog(FIXTURE);
    const b = parseChangelog(FIXTURE.replace(/\n/g, '\r\n'));
    assert.equal(a[0].content_hash, b[0].content_hash);

    const dup = JSON.parse(JSON.stringify(a));
    dup[1].version = '3.3.0';
    assert.ok(checkEntries(dup).some((p) => /trùng/.test(p)));
});
