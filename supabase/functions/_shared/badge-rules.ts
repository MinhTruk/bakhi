// Bá Khí — tính chỉ số thành tích ở phía máy chủ.
//
// Client gửi ảnh chụp dữ liệu học tập (đã đồng bộ qua sync-student-progress)
// cùng các bộ đếm tín hiệu. Máy chủ KHÔNG tin danh sách badge client gửi lên:
// nó tính lại chỉ số, so với danh mục badge rồi chỉ ghi những badge đủ điều kiện.
// Nhờ vậy không thể tự trao badge Administrator từ trình duyệt.
import type { BadgeDef } from './badge-catalog.ts';

export interface StudentSnapshot {
    practice?: unknown[];
    review?: unknown[];
    notes?: unknown[];
    bookmarks?: unknown[];
    history?: unknown[];
    achievements?: { counters?: Record<string, unknown> } | null;
    signals?: Record<string, unknown> | null;
    badges?: {
        pages?: Record<string, unknown>;
        days?: Record<string, unknown>;
        tracks?: Record<string, unknown>;
        sameTrack?: Record<string, unknown>;
        counters?: Record<string, unknown>;
        maxStreak?: unknown;
    } | null;
    profile?: {
        nickname?: unknown;
        bio?: unknown;
        avatar?: unknown;
        banner?: unknown;
        links?: unknown;
        frame?: unknown;
    } | null;
}

const MAX_ITEMS = 5000;
const MAX_KEYS = 400;

function arr(v: unknown): unknown[] {
    return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
}

function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function obj(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function str(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function pathOf(item: unknown): string {
    const o = obj(item);
    return str(o.url || o.path || o.href);
}

function subjectOf(item: unknown): string {
    const o = obj(item);
    if (str(o.subject)) return str(o.subject);
    const parts = pathOf(item).split('/').filter(Boolean);
    // https://.../ktgk1/ly/ly1.html → 'ly'
    const i = parts.findIndex((p) => p === 'ktgk1' || p === 'ktgk2' || p === 'ktck1'
        || p === 'ktck2' || p === 'kttx');
    return i >= 0 && parts[i + 1] ? parts[i + 1] : '';
}

const SUBJECTS = ['toan', 'ly', 'hoa', 'sinh', 'van', 'anh', 'su', 'tin', 'gdqp'];

export function computeMetrics(snapshot: StudentSnapshot): Record<string, number> {
    const practice = arr(snapshot.practice);
    const review = arr(snapshot.review);
    const notes = arr(snapshot.notes);
    const bookmarks = arr(snapshot.bookmarks);
    const history = arr(snapshot.history);
    const signals = obj(snapshot.signals);
    const track = obj(snapshot.badges);
    const profile = obj(snapshot.profile);
    const pages = obj(track.pages);
    const days = obj(track.days);
    const tracks = obj(track.tracks);
    const sameTrack = obj(track.sameTrack);
    const counters = obj(track.counters);

    const lessonSet: Record<string, boolean> = {};
    const subjectSet: Record<string, boolean> = {};
    const perSubject: Record<string, Record<string, boolean>> = {};
    for (const h of history) {
        const url = pathOf(h);
        if (!url) continue;
        lessonSet[url] = true;
        const sub = subjectOf(h);
        if (sub) {
            subjectSet[sub] = true;
            (perSubject[sub] ||= {})[url] = true;
        }
    }

    const mastered = review.filter((r) => {
        const o = obj(r);
        return !!(o.mastered || o.status === 'mastered' || num(o.interval) >= 21);
    }).length;

    let sameMax = 0;
    for (const k of Object.keys(sameTrack).slice(0, MAX_KEYS)) {
        sameMax = Math.max(sameMax, num(sameTrack[k]));
    }

    const visited = (fragment: string) => Object.keys(pages).slice(0, MAX_KEYS).some((p) =>
        p.includes(fragment) || p.split('/').includes(fragment.replace(/^\//, ''))) ? 1 : 0;

    const sig = (group: string, key: string) => num(obj(signals[group])[key]);
    const counter = (key: string) => num(counters[key]);

    return {
        lessons: Object.keys(lessonSet).length,
        subjects: Object.keys(subjectSet).length,
        lessonsOneSubject: Math.max(...SUBJECTS.map((s) => Object.keys(perSubject[s] || {}).length)),
        practice: practice.length,
        correct: num(obj(obj(snapshot.achievements).counters).correct),
        review: review.length,
        mastered,
        notes: notes.length,
        bookmarks: bookmarks.length,
        pages: Object.keys(pages).length,
        days: Object.keys(days).length,
        streak: num(track.maxStreak),
        musicPlays: sig('music', 'plays'),
        musicTracks: Object.keys(tracks).length,
        sameTrack: sameMax,
        meteors: sig('interaction', 'meteors'),
        palette: sig('ui', 'palette'),
        studioDocs: sig('studio', 'docs'),
        studioDrawings: sig('studio', 'drawings'),
        studioInserts: sig('studio', 'inserts'),
        studioExports: sig('studio', 'exports'),
        studioWords: sig('studio', 'words'),
        themeToggles: counter('theme.toggles'),
        searchUsed: counter('search.used'),
        focusUsed: counter('focus.used'),
        shuffleUsed: sig('music', 'shuffle'),
        repeatUsed: sig('music', 'repeat'),
        queueUsed: sig('music', 'queue'),
        musicOpened: sig('music', 'opened'),
        nightOwl: sig('time', 'night'),
        earlyBird: sig('time', 'early'),
        profileAvatar: str(profile.avatar) ? 1 : 0,
        profileBanner: str(profile.banner) ? 1 : 0,
        profileBio: str(profile.bio) ? 1 : 0,
        profileNickname: str(profile.nickname) ? 1 : 0,
        profileLinks: arr(profile.links).length,
        profileFrame: str(profile.frame) && str(profile.frame) !== 'none' ? 1 : 0,
        studioVisited: visited('studio'),
        settingsVisited: visited('settings'),
        profileVisited: visited('profile'),
        badgesViewed: counter('badges.viewed'),
        unlockedCount: 0 // tính trong badgesEarned vì tăng dần theo thứ tự danh mục
    };
}

/**
 * Danh sách badge tự động đủ điều kiện, theo đúng thứ tự danh mục như client
 * (để badge "Bộ sưu tập" đếm đúng số badge đã mở trước đó).
 */
export function badgesEarned(
    catalog: BadgeDef[],
    metrics: Record<string, number>,
    already: Set<string>
): BadgeDef[] {
    const unlocked = new Set(already);
    const out: BadgeDef[] = [];
    for (const badge of catalog) {
        if (badge.admin_only || !badge.metric) continue;
        if (unlocked.has(badge.id)) continue;
        const current = badge.metric === 'unlockedCount'
            ? [...unlocked].filter((id) => {
                const def = catalog.find((b) => b.id === id);
                return def && !def.admin_only;
            }).length
            : num(metrics[badge.metric]);
        if (current >= badge.goal) {
            unlocked.add(badge.id);
            out.push(badge);
        }
    }
    return out;
}

export function framesFromBadges(badges: Array<{ badge_id: string }>, catalog: BadgeDef[]): string[] {
    const owned = new Set(['none', 'leaf']);
    const byId = new Map(catalog.map((b) => [b.id, b]));
    for (const row of badges) {
        const def = byId.get(row.badge_id);
        if (def && def.frame) owned.add(def.frame);
    }
    return [...owned];
}
