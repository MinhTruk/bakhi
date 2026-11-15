// Chuẩn hoá và so khớp họ tên học sinh (tiếng Việt có dấu / không dấu).

/** Bỏ dấu, hạ chữ thường, gộp khoảng trắng. */
export function normalizeName(input: unknown): string {
    return String(input ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** Chuẩn hoá khoảng trắng nhưng giữ nguyên dấu và chữ hoa để hiển thị. */
export function cleanDisplayName(input: unknown): string {
    return String(input ?? '').replace(/\s+/g, ' ').trim();
}

export function tokensOf(normalized: string): string[] {
    return normalized.split(' ').filter(Boolean);
}

export interface RosterEntry {
    display_name: string;
    normalized_name: string;
}

export interface ParsedRoster {
    entries: RosterEntry[];
    skipped: number;
    duplicates: string[];
    tooLong: number;
}

/**
 * Phân tích nội dung students.txt: mỗi dòng là một họ tên đầy đủ.
 * Bỏ dòng trống, dòng bắt đầu bằng '#', chuẩn hoá khoảng trắng, phát hiện trùng.
 */
export function parseRoster(text: unknown): ParsedRoster {
    const raw = String(text ?? '').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    const seen = new Map<string, string>();
    const entries: RosterEntry[] = [];
    const duplicates: string[] = [];
    let skipped = 0;
    let tooLong = 0;

    for (const line of lines) {
        const display = cleanDisplayName(line);
        if (!display) { skipped++; continue; }
        if (display.startsWith('#')) { skipped++; continue; }
        if (display.length > 120) { tooLong++; continue; }
        const normalized = normalizeName(display);
        if (!normalized) { skipped++; continue; }
        if (seen.has(normalized)) {
            duplicates.push(display);
            continue;
        }
        seen.set(normalized, display);
        entries.push({ display_name: display, normalized_name: normalized });
    }
    return { entries, skipped, duplicates, tooLong };
}

/** Điểm khớp: càng cao càng phù hợp. 0 nghĩa là không khớp. */
export function matchScore(normalizedQuery: string, candidate: string): number {
    if (!normalizedQuery) return 0;
    if (normalizedQuery === candidate) return 100;

    const qTokens = tokensOf(normalizedQuery);
    const cTokens = tokensOf(candidate);
    if (!qTokens.length) return 0;

    // Mọi từ khoá phải xuất hiện (không phụ thuộc thứ tự).
    const matched = qTokens.filter((qt) => cTokens.some((ct) => ct.startsWith(qt)));
    if (matched.length !== qTokens.length) return 0;

    let score = 40 + matched.length * 5;
    if (candidate.startsWith(normalizedQuery)) score += 25;
    if (candidate.split(' ').some((t) => t.startsWith(qTokens[qTokens.length - 1]))) score += 8;
    // Ưu tiên tên ngắn gọn hơn khi điểm bằng nhau.
    score -= Math.max(0, cTokens.length - qTokens.length);
    return score;
}
