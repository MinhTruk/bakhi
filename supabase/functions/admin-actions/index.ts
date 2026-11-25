// admin-actions — mọi thao tác quản trị (đọc/ghi/xoá/xuất bản).
//
// Bắt buộc header: x-admin-token (lấy từ admin-auth).
// Không có thao tác nào tin dữ liệu phân quyền do client gửi.
//
// Tệp này tự chứa (self-contained) để Management API chỉ cần upload một tệp
// index.ts. Các hàm dưới đây giữ nguyên hành vi của supabase/functions/_shared.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
    return json({ ok: false, error: { code, message, ...extra } }, status);
}

function preflight(req: Request): Response | null {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Chỉ chấp nhận POST.');
    return null;
}

async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
    try {
        const data = await req.json();
        return (data && typeof data === 'object' ? data : {}) as T;
    } catch {
        return {} as T;
    }
}

async function sha256Hex(value: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* So sánh phiên bản theo từng đoạn số, giống RPC bakhi_version_cmp.
   Dùng để "phiên bản mới nhất" không phụ thuộc giờ published_at. */
function versionCmp(a: string, b: string): number {
    const pa = String(a || '').split(/[.+-]/);
    const pb = String(b || '').split(/[.+-]/);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] ?? '0';
        const y = pb[i] ?? '0';
        const nx = /^\d+$/.test(x) ? Number(x) : null;
        const ny = /^\d+$/.test(y) ? Number(y) : null;
        if (nx !== null && ny !== null) {
            if (nx !== ny) return nx > ny ? 1 : -1;
        } else if (x !== y) {
            return x > y ? 1 : -1;
        }
    }
    return 0;
}

function latestByVersion<T extends { version: string }>(rows: T[] | null | undefined): T | null {
    if (!rows || !rows.length) return null;
    return rows.slice().sort((a, b) => versionCmp(b.version, a.version))[0];
}

function adminClient(): SupabaseClient {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Secrets.');
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
}

async function requireAdmin(req: Request, client: SupabaseClient) {
    const token = (req.headers.get('x-admin-token') ?? '').trim();
    if (!token || token.length < 20) return { error: fail(401, 'NO_DEV_SESSION', 'Thiếu phiên quản trị.') };
    const hash = await sha256Hex(token);
    const { data, error } = await client
        .from('admin_sessions')
        .select('id, expires_at, scope')
        .eq('token_hash', hash)
        .maybeSingle();
    if (error) return { error: fail(500, 'DB_ERROR', 'Không kiểm tra được phiên quản trị.') };
    if (!data) return { error: fail(401, 'BAD_DEV_SESSION', 'Phiên quản trị không hợp lệ.') };
    if (new Date(data.expires_at).getTime() < Date.now()) {
        return { error: fail(401, 'EXPIRED_DEV_SESSION', 'Phiên quản trị đã hết hạn. Vui lòng nhập lại Administrator Code.') };
    }
    await client.from('admin_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    const scope = (data as { scope?: string }).scope === 'founder' ? 'founder' : 'admin';
    return { sessionId: data.id as string, scope, expiresAt: data.expires_at as string };
}

async function logAction(
    client: SupabaseClient,
    action: string,
    targetType: string | null,
    targetId: string | null,
    detail: Record<string, unknown> = {}
): Promise<void> {
    await client.from('admin_activity_logs').insert({
        action,
        target_type: targetType,
        target_id: targetId,
        detail
    });
}

function normalizeName(input: unknown): string {
    return String(input ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanDisplayName(input: unknown): string {
    return String(input ?? '').replace(/\s+/g, ' ').trim();
}

const ANNOUNCEMENT_TYPES = ['general', 'announcement', 'update', 'important', 'maintenance'];
const PRIORITIES = ['low', 'normal', 'high', 'critical'];
const CATEGORIES = ['features', 'improvements', 'fixes', 'ui', 'performance', 'security', 'notice', 'other'];
/* ---------------------------------------------------------------------------
   Danh mục badge — SINH TỰ ĐỘNG từ assets/bakhi/bk-badges.js.

   Không sửa tay khối giữa hai mốc generated bên dưới; chạy:
       node tools/gen-badge-catalog.js
   để đồng bộ với _shared/badge-catalog.ts. Nhờ vậy máy chủ không còn giữ một
   danh sách badge thứ hai bị lệch với client (lỗi của 7.4.0).
   ------------------------------------------------------------------------ */
const BADGE_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
/* 7.6.0: mã danh hiệu (Title) — độc lập với badge/khung. */
const TITLE_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const FOUNDER_BADGE_ID = 'founder';

interface BadgeMeta {
    id: string;
    name: string;
    category: string;
    rarity: string;
    frame: string | null;
    admin_only: boolean;
    exclusive: string | null;
}

/* <generated:badge-catalog> */
const BADGE_CATALOG: BadgeMeta[] = [
    {
        "id": "learn-first-lesson",
        "name": "Tri Thức Nhập Môn",
        "category": "learning",
        "rarity": "common",
        "frame": "leaf",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-lessons-5",
        "name": "Ngũ Đường Khai Giác",
        "category": "learning",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-lessons-15",
        "name": "Thập Ngũ Kinh Hành",
        "category": "learning",
        "rarity": "uncommon",
        "frame": "celestial",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-lessons-30",
        "name": "Tam Thập Thông Tuệ",
        "category": "learning",
        "rarity": "rare",
        "frame": "wreath",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-subjects-3",
        "name": "Tam Môn Khai Kiến",
        "category": "learning",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-subjects-5",
        "name": "Ngũ Môn Tinh Thông",
        "category": "learning",
        "rarity": "rare",
        "frame": "divine",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-first-answer",
        "name": "Sơ Chung Khải Ngộ",
        "category": "learning",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-practice-25",
        "name": "Nhị Thập Ngũ Tâm Ấn",
        "category": "learning",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-practice-100",
        "name": "Bách Luyện Thành Tài",
        "category": "learning",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-practice-500",
        "name": "Ngũ Bách Tinh Anh",
        "category": "learning",
        "rarity": "epic",
        "frame": "royal",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-correct-15",
        "name": "Thập Ngũ Chính Niệm",
        "category": "learning",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-correct-100",
        "name": "Bách Phát Bách Trúng",
        "category": "learning",
        "rarity": "rare",
        "frame": "infernal",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-review-first",
        "name": "Hồi Quang Sơ Chiếu",
        "category": "learning",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "learn-mastered-10",
        "name": "Thập Câu Nhập Tâm",
        "category": "learning",
        "rarity": "rare",
        "frame": "legendary",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-pages-5",
        "name": "Sơ Tẩu Trần Gian",
        "category": "exploration",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-pages-20",
        "name": "Vạn Dặm Hành Vân",
        "category": "exploration",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-pages-50",
        "name": "Bá Khí Thiên Đồ",
        "category": "exploration",
        "rarity": "epic",
        "frame": "sakura",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-studio",
        "name": "Khai Môn Tạo Giới",
        "category": "exploration",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-settings",
        "name": "Tĩnh Thất Kiến Tâm",
        "category": "exploration",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-profile",
        "name": "Minh Kính Tự Chiếu",
        "category": "exploration",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-palette",
        "name": "Chỉ Quyết Thần Hành",
        "category": "exploration",
        "rarity": "uncommon",
        "frame": "ancient",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-search",
        "name": "Tầm Bảo Nhất Niệm",
        "category": "exploration",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-theme",
        "name": "Âm Dương Chuyển Hóa",
        "category": "exploration",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "explore-badges",
        "name": "Khải Huy Hiệu Tàng",
        "category": "exploration",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-days-2",
        "name": "Nhị Nhật Bất Thoái",
        "category": "consistency",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-days-3",
        "name": "Tam Nhật Trường Cửu",
        "category": "consistency",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-days-7",
        "name": "Thất Nhật Vô Han",
        "category": "consistency",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-days-14",
        "name": "Thập Tứ Nhật Định Tâm",
        "category": "consistency",
        "rarity": "rare",
        "frame": "eternal",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-days-30",
        "name": "Tam Thập Nhật Viên Mãn",
        "category": "consistency",
        "rarity": "epic",
        "frame": "sunflower",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-streak-3",
        "name": "Liên Tam Chi Mạch",
        "category": "consistency",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-streak-7",
        "name": "Thất Tinh Liên Châu",
        "category": "consistency",
        "rarity": "rare",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "consist-streak-30",
        "name": "Tam Thập Thiên Cương",
        "category": "consistency",
        "rarity": "legendary",
        "frame": "crown",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-first",
        "name": "Sơ Âm Khai Khiếu",
        "category": "music",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-10",
        "name": "Đồng Hành Hòa Khúc",
        "category": "music",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-50",
        "name": "Ngũ Thập Tình Khúc",
        "category": "music",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-200",
        "name": "Vô Tận Âm Trường",
        "category": "music",
        "rarity": "rare",
        "frame": "ear-cat",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-tracks-5",
        "name": "Ngũ Hành Giai Điệu",
        "category": "music",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-shuffle",
        "name": "Thiên Cơ Tùy Hứng",
        "category": "music",
        "rarity": "uncommon",
        "frame": "neon",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-repeat",
        "name": "Luân Hồi Tình Khúc",
        "category": "music",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-queue",
        "name": "Liệt Khúc Đãi Thời",
        "category": "music",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "music-same-20",
        "name": "Nhất Khúc Nhị Thập Hồi",
        "category": "music",
        "rarity": "legendary",
        "frame": "ear-fox",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-first-effect",
        "name": "Sơ Tinh Điểm Nhất",
        "category": "interaction",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-meteor-10",
        "name": "Thập Tinh Liên Châu",
        "category": "interaction",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-meteor-100",
        "name": "Bách Tinh Huyền Vũ",
        "category": "interaction",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-meteor-1000",
        "name": "Lưu Tinh Kiếm Vũ",
        "category": "interaction",
        "rarity": "epic",
        "frame": "star",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-meteor-10000",
        "name": "Thiên Thạch Loạn Vũ",
        "category": "interaction",
        "rarity": "legendary",
        "frame": "horn-dragon",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-music-fab",
        "name": "Chạm Khúc Thông Linh",
        "category": "interaction",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-focus",
        "name": "Định Cảnh Thiền Tâm",
        "category": "interaction",
        "rarity": "uncommon",
        "frame": "cyber",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "inter-dark-mode",
        "name": "Dạ Hành Tri Kỷ",
        "category": "interaction",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "social-nickname",
        "name": "Danh Tính Độc Tôn",
        "category": "social",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "social-avatar",
        "name": "Chân Dung Tự Tại",
        "category": "social",
        "rarity": "common",
        "frame": "leaf",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "social-banner",
        "name": "Hậu Cảnh Thiên Thu",
        "category": "social",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "social-bio",
        "name": "Tự Ngã Chi Ngôn",
        "category": "social",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "social-links-2",
        "name": "Song Liên Tâm Kiều",
        "category": "social",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "social-frame",
        "name": "Tiểu Quán Miện",
        "category": "social",
        "rarity": "rare",
        "frame": "ear-bunny",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-doc",
        "name": "Bạch Chỉ Khai Thiên",
        "category": "studio",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-drawing",
        "name": "Sơ Bút Khai Linh",
        "category": "studio",
        "rarity": "common",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-insert",
        "name": "Họa Thuyết Nhân Gian",
        "category": "studio",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-export",
        "name": "Tác Phẩm Khai Sinh",
        "category": "studio",
        "rarity": "common",
        "frame": "phoenix",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-words-500",
        "name": "Ngũ Bách Ngôn Phong",
        "category": "studio",
        "rarity": "rare",
        "frame": "crystal",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-docs-5",
        "name": "Ngũ Quyển Tàng Kinh",
        "category": "studio",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-drawings-5",
        "name": "Ngũ Họa Tàng Chân",
        "category": "studio",
        "rarity": "uncommon",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "studio-exports-10",
        "name": "Thập Độ Quang Huy",
        "category": "studio",
        "rarity": "rare",
        "frame": "antler",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-night-owl",
        "name": "Dạ Ưng Vô Ảnh",
        "category": "secret",
        "rarity": "secret",
        "frame": "star",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-early-bird",
        "name": "Tinh Khôi Thần Điểu",
        "category": "secret",
        "rarity": "secret",
        "frame": "frost",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-subjects-all",
        "name": "Bách Khoa Thông Giám",
        "category": "secret",
        "rarity": "legendary",
        "frame": "sakura",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-notes-100",
        "name": "Bách Diệp Tâm Kinh",
        "category": "secret",
        "rarity": "epic",
        "frame": "wreath",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-bookmarks-50",
        "name": "Thư Xã Tàng Ấn",
        "category": "secret",
        "rarity": "epic",
        "frame": "gothic",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-mastered-50",
        "name": "Ôn Cố Tri Tân",
        "category": "secret",
        "rarity": "legendary",
        "frame": "ear-wolf",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-one-subject-10",
        "name": "Nhất Môn Cửu Trọng",
        "category": "secret",
        "rarity": "rare",
        "frame": "galactic",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-collector-40",
        "name": "Tứ Thập Tinh Tập",
        "category": "secret",
        "rarity": "legendary",
        "frame": "sunflower",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-collector-60",
        "name": "Lục Thập Viên Mãn",
        "category": "secret",
        "rarity": "legendary",
        "frame": "horn-dragon",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "secret-completionist",
        "name": "Thất Thập Tam Quy Tông",
        "category": "secret",
        "rarity": "legendary",
        "frame": "crown",
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "ke-suu-tam",
        "name": "Kẻ sưu tầm",
        "category": "secret",
        "rarity": "legendary",
        "frame": null,
        "admin_only": false,
        "exclusive": null
    },
    {
        "id": "admin-chosen",
        "name": "Thiên Tuyển Chi Ấn",
        "category": "secret",
        "rarity": "legendary",
        "frame": "star",
        "admin_only": true,
        "exclusive": null
    },
    {
        "id": "admin-legend",
        "name": "Bá Khí Chí Tôn",
        "category": "secret",
        "rarity": "legendary",
        "frame": "crown",
        "admin_only": true,
        "exclusive": null
    },
    {
        "id": "dev-exclusive-aurora",
        "name": "Dao Quang Tuyệt Ảnh",
        "category": "secret",
        "rarity": "secret",
        "frame": "dev-aurora",
        "admin_only": true,
        "exclusive": "dev"
    },
    {
        "id": "dev-exclusive-void",
        "name": "Vô Cực Hư Không",
        "category": "secret",
        "rarity": "secret",
        "frame": "dev-void",
        "admin_only": true,
        "exclusive": "dev"
    },
    {
        "id": "founder",
        "name": "Thiên Khải Sáng Thế",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-yin-yang",
        "name": "Âm Dương Thái Cực",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-yin-yang",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-cyberpunk",
        "name": "Sát Thủ Tương Lai",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-cyberpunk",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-ancient",
        "name": "Cổ Khí Thần Ấn",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-ancient",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-samurai",
        "name": "Bushido",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-samurai",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-void-emperor",
        "name": "Vô Cực Hoàng Đế",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-void-emperor",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-celestial-dragon",
        "name": "Thiên Long",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-celestial-dragon",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-golden-ratio",
        "name": "Vàng Nguyên Tắc",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-golden-ratio",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-ember-core",
        "name": "Lòng Nôc",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-ember-core",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-crystal-mind",
        "name": "Tinh Thần Tinh Thạch",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-crystal-mind",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-neon-lotus",
        "name": "Sen Neon",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-neon-lotus",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-genesis",
        "name": "Genesis",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-genesis",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-architect",
        "name": "Architect",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-frost-emperor",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-eternal-flame",
        "name": "Eternal Flame",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-phoenix-rebirth",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-nexus",
        "name": "Nexus",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-nexus",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-celestial",
        "name": "Celestial",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-astral-observatory",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-chronos",
        "name": "Chronos",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-chrono-mechanical",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-void-sentinel",
        "name": "Void Sentinel",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-abyssal",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-prime-code",
        "name": "Prime Code",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-prime-code",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-legacy",
        "name": "Legacy",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-legacy",
        "admin_only": true,
        "exclusive": "founder"
    },
    {
        "id": "founder-ascendant",
        "name": "Ascendant",
        "category": "secret",
        "rarity": "secret",
        "frame": "founder-crystal-sovereign",
        "admin_only": true,
        "exclusive": "founder"
    }
];
/* </generated:badge-catalog> */

const BADGE_BY_ID = new Map<string, BadgeMeta>(BADGE_CATALOG.map((b) => [b.id, b]));
const ALL_BADGE_IDS: string[] = BADGE_CATALOG.map((b) => b.id);

/* Badge độc quyền = chỉ trao tay, không bao giờ tự động và không nằm trong
   "trao toàn bộ badge". Suy ra từ cờ `exclusive` của danh mục thay vì viết
   cứng 13 mã như 7.4.0 (danh mục đã tăng lên 23 mã ở 7.5.0). */
const EXCLUSIVE_BADGE_IDS: string[] = BADGE_CATALOG
    .filter((b) => !!b.exclusive).map((b) => b.id);
const DEV_BADGE_IDS: string[] = BADGE_CATALOG
    .filter((b) => b.exclusive === 'dev').map((b) => b.id);

/* ---------------------------------------------------------------------------
   Danh mục Danh hiệu (Title) mặc định — ánh xạ 1-1 từ badge nguồn.

   35 danh hiệu = 10 badge tự động tiêu biểu + 21 Founder + 2 Developer +
   2 Administrator. Không phải badge nào cũng có danh hiệu: 64 badge tự động
   còn lại chỉ là thành tích, đúng cấu hình đã chốt cho 7.7.0.

   `style = plain`  → font thường, màu tĩnh.
   `style = special`→ font đặc biệt, gradient và màu chuyển động.
   Sinh lại từ migration 20261203000000_bakhi_v770_titles_rework.sql.
   ------------------------------------------------------------------------ */
interface TitleDef {
    id: string;
    name: string;
    short: string;
    color: string;
    icon: string;
    description: string;
    sortOrder: number;
    founderOnly: boolean;
    badgeId: string | null;
    style: 'plain' | 'special';
    font: string;
    palette: string;
    effect: string;
}

function T(
    id: string, name: string, short: string, color: string, icon: string, description: string,
    sortOrder: number, founderOnly: boolean, style: 'plain' | 'special',
    font = '', palette = '', effect = 'none'
): TitleDef {
    return {
        id, name, short, color, icon, description, sortOrder, founderOnly,
        badgeId: BADGE_BY_ID.has(id) ? id : null, style, font, palette, effect
    };
}

const DEFAULT_TITLES: TitleDef[] = [
    T('founder', 'Nhà Sáng Lập', 'SÁNG LẬP', '#f5c451', 'fa-crown',
        'Người tạo nên Bá Khí và giữ ngọn lửa của cả cộng đồng.', 10, true, 'special', 'display', '#f5c451,#b45309,#facc15', 'flow'),
    T('learn-first-lesson', 'Tri Thức Nhập Môn', 'NHẬP MÔN', '#60a5fa', 'fa-book-open',
        'Mở bài học đầu tiên.', 10, false, 'plain'),
    T('learn-lessons-30', 'Tam Thập Thông Tuệ', 'THÔNG TUỆ', '#6366f1', 'fa-graduation-cap',
        'Mở 30 bài học khác nhau.', 11, false, 'plain'),
    T('learn-practice-500', 'Ngũ Bách Tinh Anh', 'TINH ANH', '#818cf8', 'fa-bolt',
        'Hoàn thành 500 lượt luyện tập.', 12, false, 'plain'),
    T('explore-pages-50', 'Bá Khí Thiên Đồ', 'THIÊN ĐỒ', '#0ea5e9', 'fa-map',
        'Ghé 50 trang khác nhau.', 13, false, 'plain'),
    T('consist-days-30', 'Tam Thập Nhật Viên Mãn', 'VIÊN MÃN', '#10b981', 'fa-calendar-plus',
        'Hoạt động trong 30 ngày khác nhau.', 14, false, 'plain'),
    T('music-200', 'Vô Tận Âm Trường', 'ÂM TRƯỜNG', '#a855f7', 'fa-record-vinyl',
        'Nghe trọn 200 lượt nhạc.', 15, false, 'plain'),
    T('inter-meteor-1000', 'Lưu Tinh Kiếm Vũ', 'KIẾM VŨ', '#f59e0b', 'fa-cloud-moon',
        'Bắn 1.000 sao băng.', 16, false, 'plain'),
    T('social-frame', 'Tiểu Quán Miện', 'TIỂU QUÁN', '#ec4899', 'fa-crown',
        'Trang bị một khung avatar.', 17, false, 'plain'),
    T('studio-words-500', 'Ngũ Bách Ngôn Phong', 'NGÔN PHONG', '#14b8a6', 'fa-feather-pointed',
        'Viết một tài liệu dài 500 từ.', 18, false, 'plain'),
    T('secret-completionist', 'Thất Thập Tam Quy Tông', 'QUY TÔNG', '#94a3b8', 'fa-diamond',
        'Mở khóa 73 badge tự động.', 19, false, 'plain'),
    T('founder-yin-yang', 'Âm Dương Thái Cực', 'ÂM DƯƠNG', '#e2e8f0', 'fa-yin-yang',
        'Khung Âm Dương Thái Cực độc bản, chỉ Founder có thể trao.', 30, true, 'special', 'elegant', '#e2e8f0,#94a3b8,#f5f5f4', 'flow'),
    T('founder-cyberpunk', 'Sát Thủ Tương Lai', 'CYBERPUNK', '#22d3ee', 'fa-robot',
        'Khung Sát Thủ Tương Lai độc bản, chỉ Founder có thể trao.', 31, true, 'special', 'mono', '#22d3ee,#d946ef,#f0abfc', 'shimmer'),
    T('founder-ancient', 'Cổ Khí Thần Ấn', 'CỔ KHÍ', '#d6d3d1', 'fa-scroll',
        'Khung Cổ Khí Thần Ấn độc bản, chỉ Founder có thể trao.', 32, true, 'special', 'serif', '#d6d3d1,#fbbf24,#92400e', 'flow'),
    T('founder-samurai', 'Bushido', 'BUSHIDO', '#ef4444', 'fa-sword',
        'Khung Bushido độc bản, chỉ Founder có thể trao.', 33, true, 'special', 'serif', '#ef4444,#f8fafc,#0c0a09', 'pulse'),
    T('founder-void-emperor', 'Vô Cực Hoàng Đế', 'VÔ CỰC', '#c084fc', 'fa-circle-notch',
        'Khung Vô Cực Hoàng Đế độc bản, chỉ Founder có thể trao.', 34, true, 'special', 'display', '#c084fc,#6d28d9,#0f172a', 'aurora'),
    T('founder-celestial-dragon', 'Thiên Long', 'THIÊN LONG', '#fbbf24', 'fa-dragon',
        'Khung Thiên Long độc bản, chỉ Founder có thể trao.', 35, true, 'special', 'display', '#fbbf24,#facc15,#a16207', 'flow'),
    T('founder-golden-ratio', 'Vàng Nguyên Tắc', 'NGUYÊN TẮC', '#f59e0b', 'fa-compass',
        'Khung Vàng Nguyên Tắc độc bản, chỉ Founder có thể trao.', 36, true, 'special', 'elegant', '#f59e0b,#fde68a,#b45309', 'shimmer'),
    T('founder-ember-core', 'Lòng Nõn', 'LÒNG NÕN', '#fb7185', 'fa-fire',
        'Khung Lòng Nõn độc bản, chỉ Founder có thể trao.', 37, true, 'special', 'display', '#fb7185,#fda4af,#881337', 'pulse'),
    T('founder-crystal-mind', 'Tinh Thần Tinh Thạch', 'TINH THẠCH', '#38bdf8', 'fa-gem',
        'Khung Tinh Thần Tinh Thạch độc bản, chỉ Founder có thể trao.', 38, true, 'special', 'elegant', '#38bdf8,#7dd3fc,#0c4a6e', 'shimmer'),
    T('founder-neon-lotus', 'Sen Neon', 'SEN NEON', '#e879f9', 'fa-lotus',
        'Khung Sen Neon độc bản, chỉ Founder có thể trao.', 39, true, 'special', 'display', '#e879f9,#f0abfc,#701a75', 'aurora'),
    T('founder-genesis', 'Genesis', 'GENESIS', '#5eead4', 'fa-circle-dot',
        'Khởi nguyên — lõi năng lượng đầu tiên và quỹ đạo hình thành nên Bá Khí.', 41, true, 'special', 'mono', '#5eead4,#99f6e4,#0f766e', 'aurora'),
    T('founder-architect', 'Architect', 'ARCHITECT', '#93c5fd', 'fa-compass-drafting',
        'Người kiến tạo — bản thiết kế hình học của toàn bộ hệ thống.', 42, true, 'special', 'mono', '#93c5fd,#e0f2fe,#1e3a8a', 'shimmer'),
    T('founder-eternal-flame', 'Eternal Flame', 'ETERNAL', '#fb7185', 'fa-fire-flame-curved',
        'Ngọn lửa vĩnh cửu — nhiệt huyết không tắt của người khai sáng.', 43, true, 'special', 'display', '#fb7185,#fbbf24,#7f1d1d', 'pulse'),
    T('founder-nexus', 'Nexus', 'NEXUS', '#a855f7', 'fa-diagram-project',
        'Trung tâm liên kết — nơi mọi luồng năng lượng và dữ liệu gặp nhau.', 44, true, 'special', 'mono', '#a855f7,#f0abfc,#6b21a8', 'aurora'),
    T('founder-celestial', 'Celestial', 'CELESTIAL', '#818cf8', 'fa-galaxy',
        'Thiên hà và tinh tú — tầm nhìn vượt khỏi đường chân trời.', 45, true, 'special', 'elegant', '#818cf8,#c7d2fe,#1e1b4b', 'shimmer'),
    T('founder-chronos', 'Chronos', 'CHRONOS', '#d97706', 'fa-clock',
        'Thời gian — đồng hồ cổ và cơ khí ghi dấu từng giai đoạn phát triển.', 46, true, 'special', 'serif', '#d97706,#fcd34d,#57534e', 'flow'),
    T('founder-void-sentinel', 'Void Sentinel', 'VOID', '#06b6d4', 'fa-shield',
        'Người canh giữ hư không — lá chắn đứng giữa khoảng trống vô tận.', 47, true, 'special', 'mono', '#06b6d4,#67e8f9,#0c4a6e', 'pulse'),
    T('founder-prime-code', 'Prime Code', 'PRIME', '#22d3ee', 'fa-code',
        'Công nghệ và dữ liệu — dòng mã nguồn gốc của nền tảng.', 48, true, 'special', 'mono', '#22d3ee,#67e8f9,#15803d', 'shimmer'),
    T('founder-legacy', 'Legacy', 'LEGACY', '#fbbf24', 'fa-crown',
        'Di sản — vương miện và nguyệt quế của những gì còn lại mãi.', 49, true, 'special', 'serif', '#fbbf24,#fde68a,#713f12', 'flow'),
    T('founder-ascendant', 'Ascendant', 'ASCENDANT', '#a78bfa', 'fa-gem',
        'Thăng hoa — pha lê và ánh sáng của bước tiến cuối cùng.', 50, true, 'special', 'display', '#a78bfa,#e9d5ff,#4c1d95', 'aurora'),
    T('dev-exclusive-aurora', 'Dao Quang Tuyệt Ảnh', 'AURORA', '#5eead4', 'fa-code',
        'Khung Dao quang độc bản, chỉ Founder có thể trao.', 60, true, 'special', 'mono', '#5eead4,#67e8f9,#a855f7', 'aurora'),
    T('dev-exclusive-void', 'Vô Cực Hư Không', 'HƯ KHÔNG', '#c084fc', 'fa-terminal',
        'Khung Hư không độc bản, chỉ Founder có thể trao.', 61, true, 'special', 'mono', '#c084fc,#e9d5ff,#6d28d9', 'pulse'),
    T('admin-chosen', 'Thiên Tuyển Chi Ấn', 'THIÊN TUYỂN', '#7dd3fc', 'fa-hand-holding-heart',
        'Badge đặc biệt do quản trị viên trao tặng.', 70, true, 'special', 'display', '#7dd3fc,#bae6fd,#0c4a6e', 'shimmer'),
    T('admin-legend', 'Bá Khí Chí Tôn', 'CHÍ TÔN', '#f5c451', 'fa-crown',
        'Badge cao nhất, chỉ Administrator trao tặng.', 71, true, 'special', 'display', '#f5c451,#fde68a,#b91c1c', 'flow')
];

const TITLE_BY_ID = new Map<string, TitleDef>(DEFAULT_TITLES.map((t) => [t.id, t]));
const SERVER_VERSION = '8.8.0';

/* Cơ cấu danh mục: 99 = 74 tự động + 21 Founder + 2 Developer + 2 Administrator.
   Trả kèm mọi phản hồi trao tặng để giao diện không phải tự đếm hay viết cứng. */
function badgeBreakdown() {
    const mix = { total: BADGE_CATALOG.length, auto: 0, founder: 0, dev: 0, admin: 0 };
    for (const b of BADGE_CATALOG) {
        if (b.exclusive === 'founder') mix.founder++;
        else if (b.exclusive === 'dev') mix.dev++;
        else if (b.admin_only) mix.admin++;
        else mix.auto++;
    }
    return mix;
}

/* Khung avatar -> badge sở hữu khung. Một khung chỉ được mở bằng đúng một
   badge; trao khung = trao badge đó, nên không cần bảng sở hữu khung riêng và
   không bao giờ ghi đè khung đang trang bị. */
const FRAME_OWNER_BADGE = new Map<string, string>();
for (const badge of BADGE_CATALOG) {
    if (badge.frame && !FRAME_OWNER_BADGE.has(badge.frame)) {
        FRAME_OWNER_BADGE.set(badge.frame, badge.id);
    }
}

function isFounderExclusive(badgeId: string): boolean {
    const def = BADGE_BY_ID.get(badgeId);
    return !!def && def.exclusive === 'founder';
}
function isFounderBadge(badgeId: string): boolean {
    return badgeId === FOUNDER_BADGE_ID || isFounderExclusive(badgeId);
}

function str(v: unknown, max: number): string {
    return String(v ?? '').trim().slice(0, max);
}
function oneOf(v: unknown, allowed: string[], fallback: string): string {
    const s = String(v ?? '').trim();
    return allowed.includes(s) ? s : fallback;
}

/** Chuẩn hoá nội dung changelog: [{ category, items: [...] }] */
function parseSections(raw: unknown) {
    const list = Array.isArray(raw) ? raw : [];
    return list.slice(0, 20).map((section) => {
        const s = (section ?? {}) as Record<string, unknown>;
        const items = Array.isArray(s.items) ? s.items : [];
        return {
            category: oneOf(s.category, CATEGORIES, 'other'),
            items: items.map((i) => str(i, 400)).filter(Boolean).slice(0, 60)
        };
    }).filter((s) => s.items.length > 0);
}

function csvCell(value: unknown): string {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRows(rows: unknown[][]): string {
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function validIsoDate(value: unknown): string | null {
    const s = str(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}


/* ---------------------------------------------------------------------------
   Trao vật phẩm (badge / khung avatar) — dùng chung cho mọi đường ghi.

   Nguyên tắc:
   * Mọi badge phải có trong danh mục; không nhận id lạ từ client.
   * Trao khung = trao badge sở hữu khung (FRAME_OWNER_BADGE). Không ghi vào
     student_profiles.frame, nên không bao giờ đổi khung đang trang bị.
   * Ghi qua RPC bakhi_grant_badges: một câu lệnh insert ... on conflict do
     nothing, nguyên tử theo lô và không ghi đè quyền sở hữu cũ.
   * Mỗi yêu cầu có request_id để chạy lại an toàn và chống gửi trùng.
   ------------------------------------------------------------------------ */

function newRequestId(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return 'req-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id hồ sơ hợp lệ; chuỗi rỗng khi thiếu hoặc không phải UUID (vd. "undefined"). */
function uuidOf(value: unknown): string {
    const s = str(value, 40);
    return UUID_RE.test(s) ? s : '';
}

/** Lỗi do cơ sở dữ liệu chưa chạy migration mới (thiếu cột/bảng/quan hệ). */
function isSchemaGap(error: unknown): boolean {
    const code = String((error as { code?: string } | null)?.code || '');
    const message = String((error as { message?: string } | null)?.message || '');
    if (code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205' || code === 'PGRST200') {
        return true;
    }
    return /column .* does not exist|could not find the table|could not find a relationship|schema cache/i.test(message);
}

function requestIdOf(value: unknown): string {
    const s = String(value ?? '').trim();
    if (/^[A-Za-z0-9_-]{8,64}$/.test(s)) return s;
    return newRequestId();
}

/** Badge mở khoá một khung; rỗng nếu khung không tồn tại hoặc không trao được. */
function badgeForFrame(frameId: string): string {
    if (!frameId || frameId === 'none') return '';
    return FRAME_OWNER_BADGE.get(frameId) || '';
}

interface GrantResult {
    added: string[];
    alreadyOwned: string[];
    failed?: string[];
}

/* ---------------------------------------------------------------------------
   7.7.0 — Hợp đồng phản hồi trao vật phẩm THỐNG NHẤT.

   Lỗi 7.6.1: mỗi action trả một hình dạng khác nhau (added | addedIds |
   badges | count), giao diện phải đoán và có lúc in "undefined badge". Từ
   7.7.0 mọi phản hồi trao tặng đều có đủ: success, status, requested_count,
   granted_count, already_owned_count, failed_count, granted_badges, errors,
   message. Các trường cũ được giữ lại để client/bản cũ không vỡ.
   ------------------------------------------------------------------------ */
interface GrantCounts {
    requestedIds: string[];
    grantedIds: string[];
    alreadyOwnedIds: string[];
    failedIds?: string[];
    errors?: Array<{ id: string; name: string; message: string }>;
}

function grantReport(input: GrantCounts) {
    const requested = Array.from(new Set(input.requestedIds));
    const granted = Array.from(new Set(input.grantedIds));
    const already = Array.from(new Set(input.alreadyOwnedIds));
    const failed = Array.from(new Set(input.failedIds ?? []));
    const errors = input.errors ?? [];
    const grantedBadges = granted.map((id) => ({
        id,
        name: (BADGE_BY_ID.get(id) || { name: id }).name
    }));
    let status: 'granted' | 'already_owned' | 'partial' | 'failed' | 'none';
    if (!requested.length) status = 'none';
    else if (granted.length && (failed.length || already.length)) status = 'partial';
    else if (granted.length) status = 'granted';
    else if (failed.length) status = 'failed';
    else status = 'already_owned';
    const message = status === 'granted'
        ? 'Đã cấp ' + granted.length + ' vật phẩm mới.'
        : status === 'already_owned'
            ? 'Không cấp mới: mọi vật phẩm đã có trong tồn kho (không tạo bản ghi trùng).'
            : status === 'partial'
                ? 'Cấp một phần: ' + granted.length + ' mới, ' + already.length + ' đã có, ' + failed.length + ' lỗi.'
                : status === 'failed'
                    ? 'Không cấp được vật phẩm nào (' + failed.length + ' lỗi).'
                    : 'Không có vật phẩm nào để cấp.';
    return {
        success: status === 'granted' || status === 'partial' || status === 'already_owned',
        status,
        requested_count: requested.length,
        granted_count: granted.length,
        already_owned_count: already.length,
        failed_count: failed.length,
        granted_badges: grantedBadges,
        granted_ids: granted,
        already_owned_ids: already,
        errors,
        message,
        /* Trường tương thích 7.4–7.6 */
        added: granted.length,
        addedIds: granted,
        alreadyOwned: already.length,
        failed,
        requested: requested.length
    };
}

/* Đọc lô cấp đã ghi để chống chạy lại (idempotent theo request_id). */
async function findGrantBatch(client: SupabaseClient, requestId: string) {
    const { data, error } = await client
        .from('admin_grant_batches')
        .select('request_id, item_type, target_student, requested, added, already_owned, failed, created_at')
        .eq('request_id', requestId)
        .maybeSingle();
    if (error) return null;
    return data || null;
}

/**
 * Chống trao lặp: cùng request_id + cùng người nhận thì trả lại đúng kết quả
 * đã ghi trong lịch sử, KHÔNG trao thêm và KHÔNG ghi lịch sử lần thứ hai.
 * Trả null khi đây là yêu cầu mới.
 */
async function replayGrant(client: SupabaseClient, requestId: string, studentId: string) {
    const batch = await findGrantBatch(client, requestId);
    if (!batch) return null;
    if (String(batch.target_student || '') !== studentId) return null;
    const { data: rows } = await client
        .from('admin_grant_history')
        .select('badge_id, item_id')
        .eq('request_id', requestId)
        .eq('target_student', studentId)
        .limit(200);
    const grantedIds = (rows ?? [])
        .map((r) => String(r.badge_id || r.item_id || ''))
        .filter(Boolean);
    return {
        ...grantReport({
            requestedIds: grantedIds.concat(
                Array.from({ length: Math.max(0, Number(batch.already_owned) || 0) })
                    .map((_, i) => '__owned_' + i)),
            grantedIds,
            alreadyOwnedIds: []
        }),
        status: 'replayed' as const,
        replayed: true,
        requestId,
        studentId,
        message: grantedIds.length
            ? 'Yêu cầu này đã được xử lý trước đó (' + grantedIds.length + ' vật phẩm). Không trao lặp; tồn kho và lịch sử được giữ nguyên.'
            : 'Yêu cầu này đã được xử lý trước đó nhưng không cấp thêm vật phẩm nào. Không trao lặp; hãy đối chiếu tồn kho trước khi chạy lại.',
        already_owned_count: Number(batch.already_owned) || 0
    };
}

class GrantError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function grantBadgeIds(
    client: SupabaseClient,
    studentId: string,
    badgeIds: string[],
    reason: string,
    actor: string
): Promise<GrantResult> {
    const unique = Array.from(new Set(badgeIds.filter((b) => !!BADGE_BY_ID.get(b))));
    const added: string[] = [];
    if (!unique.length) return { added, alreadyOwned: [] };

    for (let i = 0; i < unique.length; i += 100) {
        const chunk = unique.slice(i, i + 100);
        const { data, error } = await client.rpc('bakhi_grant_badges', {
            p_student: studentId,
            p_badges: chunk,
            p_reason: reason.slice(0, 200),
            p_actor: actor
        });
        if (error) {
            const code = String((error as { code?: string }).code || '');
            const message = String(error.message || '');
            if (code === '42883' || /does not exist|not find the function/i.test(message)) {
                throw new GrantError(500, 'MIGRATION_REQUIRED',
                    'Chưa áp dụng migration 7.5.0 (hàm bakhi_grant_badges). Hãy chạy migration trước khi trao vật phẩm.');
            }
            if (/STUDENT_INACTIVE/.test(message)) {
                throw new GrantError(400, 'INACTIVE', 'Học sinh đã ngừng hoạt động.');
            }
            if (/STUDENT_NOT_FOUND/.test(message)) {
                throw new GrantError(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
            }
            throw error;
        }
        for (const row of (data ?? []) as Array<{ badge_id: string; inserted: boolean }>) {
            if (row && row.inserted) added.push(String(row.badge_id));
        }
    }
    const addedSet = new Set(added);
    return { added, alreadyOwned: unique.filter((b) => !addedSet.has(b)) };
}

async function writeGrantHistory(
    client: SupabaseClient,
    requestId: string,
    actorScope: string,
    actorId: string,
    studentId: string,
    itemType: 'badge' | 'frame',
    badgeIds: string[],
    reason: string
): Promise<void> {
    if (!badgeIds.length) return;
    const rows = badgeIds.map((badgeId) => {
        const def = BADGE_BY_ID.get(badgeId);
        const frame = def && def.frame ? def.frame : null;
        return {
            request_id: requestId,
            actor_id: actorId,
            actor_scope: actorScope,
            target_student: studentId,
            item_type: itemType,
            item_id: itemType === 'frame' && frame ? frame : badgeId,
            badge_id: badgeId,
            item_name: def ? def.name : badgeId,
            reason
        };
    });
    const first = await client.from('admin_grant_history')
        .upsert(rows, { onConflict: 'request_id,target_student,item_id', ignoreDuplicates: true });
    if (!first.error) return;
    if (!isSchemaGap(first.error)) {
        console.error('admin_grant_history insert failed:', first.error.message);
        return;
    }
    /* Cơ sở dữ liệu chưa chạy migration 7.5.0 (thiếu request_id/badge_id và
       unique index). Ghi lại theo đúng các cột của 7.4.0 để lịch sử cấp không
       bị mất thay vì lỗi âm thầm. */
    const legacy = rows.map((row) => ({
        actor_id: row.actor_id,
        actor_scope: row.actor_scope,
        target_student: row.target_student,
        item_type: row.item_type,
        item_id: row.item_id,
        item_name: row.item_name,
        reason: row.reason
    }));
    const retry = await client.from('admin_grant_history').insert(legacy);
    if (retry.error) console.error('admin_grant_history legacy insert failed:', retry.error.message);
}

async function writeGrantBatch(
    client: SupabaseClient,
    row: Record<string, unknown>
): Promise<void> {
    const { error } = await client.from('admin_grant_batches')
        .upsert(row, { onConflict: 'request_id', ignoreDuplicates: true });
    /* Bảng lô cấp chỉ có từ 7.5.0; thiếu bảng thì bỏ qua, không làm hỏng thao tác
       trao vật phẩm (lịch sử chi tiết vẫn được ghi ở admin_grant_history). */
    if (error && !isSchemaGap(error)) {
        console.error('admin_grant_batches upsert failed:', error.message);
    }
}

/** Trao một vật phẩm cho một học sinh; trả về Response cho switch case. */
async function grantSingleItem(
    client: SupabaseClient,
    params: {
        sessionId: string;
        scope: string;
        studentId: string;
        itemType: 'badge' | 'frame';
        itemId: string;
        reason: string;
        requestId: string;
    }
): Promise<Response> {
    const studentId = uuidOf(params.studentId);
    if (!studentId) return fail(400, 'MISSING_ID', 'Thiếu hoặc sai id học sinh.');
    if (!params.itemId) return fail(400, 'MISSING_ITEM', 'Thiếu mã vật phẩm.');
    if (!BADGE_ID_RE.test(params.itemId)) {
        return fail(400, 'BAD_ITEM_ID', 'Mã vật phẩm không hợp lệ.');
    }

    const badgeId = params.itemType === 'frame'
        ? badgeForFrame(params.itemId)
        : params.itemId;
    if (!badgeId) {
        return fail(400, 'ITEM_NOT_GRANTABLE',
            'Khung này không gắn với badge nào nên không thể trao riêng.');
    }
    const def = BADGE_BY_ID.get(badgeId);
    if (!def) {
        return fail(400, 'UNKNOWN_ITEM', 'Vật phẩm không có trong danh mục chính thức.');
    }

    const { data: target } = await client
        .from('students')
        .select('id, display_name, is_active, is_founder')
        .eq('id', studentId)
        .maybeSingle();
    if (!target) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
    if (!target.is_active) return fail(400, 'INACTIVE', 'Học sinh đã ngừng hoạt động.');

    /* 7.9.0: khung/badge Founder (trừ badge tối cao Thiên Khải Sáng Thế) do
       Founder trao tay cho BẤT KỲ học sinh đang hoạt động. Riêng badge
       `founder` vẫn chỉ dành cho hồ sơ is_founder = true. */
    if (badgeId === FOUNDER_BADGE_ID && target.is_founder !== true) {
        return fail(403, 'FOUNDER_PROFILE_REQUIRED',
            'Badge Thiên Khải Sáng Thế chỉ cấp cho hồ sơ Người sáng lập (is_founder = true).');
    }
    if (def.exclusive === 'dev' && params.scope !== 'founder') {
        return fail(403, 'FOUNDER_ONLY', 'Badge Developer chỉ Founder mới được trao.');
    }

    let result: GrantResult;
    try {
        result = await grantBadgeIds(client, params.studentId, [badgeId],
            params.reason || 'Founder trao tặng', params.sessionId);
    } catch (err) {
        if (err instanceof GrantError) return fail(err.status, err.code, err.message);
        throw err;
    }

    const status = result.added.length ? 'granted' : 'already_owned';
    if (result.added.length) {
        await writeGrantHistory(client, params.requestId, params.scope, params.sessionId,
            studentId, params.itemType, [badgeId], params.reason);
    }
    await writeGrantBatch(client, {
        request_id: params.requestId,
        actor_scope: params.scope,
        actor_id: params.sessionId,
        target_student: studentId,
        item_type: params.itemType,
        requested: 1,
        added: result.added.length,
        already_owned: result.alreadyOwned.length,
        failed: 0
    });
    await logAction(client, 'founder.grantItem', 'student', studentId, {
        request_id: params.requestId,
        item_type: params.itemType,
        item_id: params.itemId,
        badge_id: badgeId,
        status
    });

    const report = grantReport({
        requestedIds: [badgeId],
        grantedIds: result.added,
        alreadyOwnedIds: result.alreadyOwned
    });
    return json({
        ok: true,
        serverVersion: SERVER_VERSION,
        status,
        requestId: params.requestId,
        studentId: studentId,
        studentName: target.display_name,
        item_type: params.itemType,
        item_id: params.itemId,
        badge_id: badgeId,
        item_name: def.name,
        added_ids: result.added,
        already_ids: result.alreadyOwned,
        ...report
    });
}

/* 7.7.0 — chuẩn hoá một dòng danh hiệu trả về cho dashboard và website. */
function titleRow(row: Record<string, unknown>, holders = 0) {
    const style = String(row.style || 'plain') === 'special' ? 'special' : 'plain';
    const def = TITLE_BY_ID.get(String(row.id));
    return {
        id: String(row.id || ''),
        name: String(row.name || ''),
        short: String(row.short || ''),
        color: String(row.color || ''),
        icon: String(row.icon || ''),
        description: String(row.description || ''),
        sortOrder: Number(row.sort_order) || 100,
        founderOnly: row.founder_only === true,
        active: row.active !== false,
        badgeId: row.badge_id == null ? null : String(row.badge_id),
        style,
        font: String(row.font || ''),
        palette: String(row.palette || ''),
        effect: String(row.effect || 'none'),
        /* Danh hiệu mặc định (ánh xạ badge) hay do Founder tự tạo. */
        source: row.badge_id ? 'badge' : 'custom',
        holders,
        badgeName: row.badge_id ? ((BADGE_BY_ID.get(String(row.badge_id)) || { name: '' }).name || '') : '',
        matchesDefault: !!def
    };
}

/* ---------------------------------------------------------------------------
   v8.0.0 — Report Issue

   Hai dashboard (Administrator và Founder) dùng CHUNG các action dưới đây và
   cùng đọc bảng public.reports; không có hệ thống báo cáo thứ hai.
   ------------------------------------------------------------------------ */
const REPORT_BUCKET = 'report-attachments';
const REPORT_STATUSES = ['new', 'pending', 'in_progress', 'waiting_student', 'resolved', 'closed'];
/* 8.5.6 — nhóm “cần xử lý”: mọi trạng thái chưa hoàn thành. Dùng cho bộ lọc
   `status = 'active'` của reports.list/export và cho khu vực thông báo ở tab
   Report. Không bao giờ tính báo cáo đã giải quyết/đã đóng. */
const REPORT_ACTIVE_STATUSES = ['new', 'pending', 'in_progress', 'waiting_student'];
/* 8.5.6 — chỉ báo cáo đã hoàn thành (terminal) mới được xoá. */
const REPORT_DELETABLE_STATUSES = ['resolved', 'closed'];
const REPORT_CATEGORIES = ['bug', 'ui', 'content', 'answer', 'account', 'performance',
    'feature', 'data', 'other'];
const REPORT_PRIORITIES = ['low', 'normal', 'high', 'critical'];
/* Chuyển trạng thái hợp lệ. Máy chủ từ chối bước nhảy tuỳ tiện. */
const REPORT_TRANSITIONS: Record<string, string[]> = {
    new: ['pending', 'in_progress', 'waiting_student', 'resolved', 'closed'],
    pending: ['in_progress', 'waiting_student', 'resolved', 'closed'],
    in_progress: ['pending', 'waiting_student', 'resolved', 'closed'],
    waiting_student: ['in_progress', 'pending', 'resolved', 'closed'],
    resolved: ['in_progress', 'closed'],
    closed: ['in_progress']
};

async function signedReportFiles(client: SupabaseClient, paths: unknown) {
    const list = (Array.isArray(paths) ? paths : []).map((p) => String(p)).filter(Boolean).slice(0, 6);
    const out: Array<Record<string, unknown>> = [];
    for (const path of list) {
        const { data } = await client.storage.from(REPORT_BUCKET).createSignedUrl(path, 3600);
        out.push({ path, name: path.split('/').pop() || 'tệp', url: data?.signedUrl || '' });
    }
    return out;
}

async function logReportActivity(
    client: SupabaseClient,
    reportId: string,
    actorKind: string,
    actorLabel: string,
    action: string,
    oldValue: string | null,
    newValue: string | null,
    metadata: Record<string, unknown> = {}
): Promise<void> {
    await client.from('report_activity_logs').insert({
        report_id: reportId,
        actor_kind: actorKind,
        actor_label: actorLabel,
        action,
        old_value: oldValue,
        new_value: newValue,
        metadata
    });
}

/** Thông báo riêng cho ĐÚNG học sinh đã tạo báo cáo. */
async function notifyReportStudent(
    client: SupabaseClient,
    report: Record<string, unknown>,
    kind: string,
    title: string,
    body: string
): Promise<void> {
    await client.from('report_notifications').insert({
        student_id: report.student_id,
        report_id: report.id,
        kind,
        title: String(title).slice(0, 160),
        body: String(body).slice(0, 600)
    });
}

/* CSV an toàn cho Excel: bọc ngoặc kép, nhân đôi ngoặc kép bên trong. */
function reportCsvCell(value: unknown): string {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

async function reportStudentNames(client: SupabaseClient, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
    const map = new Map<string, string>();
    if (!unique.length) return map;
    const { data } = await client
        .from('students')
        .select('id, display_name')
        .in('id', unique);
    for (const row of data ?? []) map.set(String(row.id), String(row.display_name || 'Học sinh'));
    return map;
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const client = adminClient();
    const auth = await requireAdmin(req, client);
    if ('error' in auth) return auth.error;
    const sessionId = auth.sessionId;
    const scope = auth.scope;

    const body = await readJson<Record<string, unknown>>(req);
    const action = str(body.action, 60);

    /* Các mô-đun tối mật chỉ Founder mở được; Administrator thường bị chặn
       ngay ở máy chủ, không phụ thuộc giao diện. */
    const founderOnly = new Set([
        'roles.set', 'founder.grantAll', 'founder.grantItem', 'avatar.grant',
        'students.inventory', 'admin.items.list', 'students.export', 'logs.export',
        'data.integrity', 'maintenance.history', 'admin.grantHistory',
        'titles.list', 'titles.holders', 'titles.save', 'titles.grant',
        'titles.revoke', 'titles.delete'
    ]);
    if (founderOnly.has(action) && scope !== 'founder') {
        return fail(403, 'FOUNDER_ONLY', 'Chức năng này chỉ dành cho Founder Dashboard.');
    }
    const founderSetting = action === 'settings.set'
        && ['public.maintenance', 'public.branding'].includes(str(body.key, 80));
    if (founderSetting && scope !== 'founder') {
        return fail(403, 'FOUNDER_ONLY', 'Bảo trì và tên dashboard chỉ Founder Dashboard được đổi.');
    }

    try {
        switch (action) {
            /* ------------------------- Phiên quản trị hiện tại ---------------------- */
            /* Dùng cho màn hình bảo trì và khu Founder Access: máy chủ đọc lại
               token trong admin_sessions rồi trả scope. Client không thể tự khai
               quyền Founder bằng biến JavaScript. */
            case 'session.check': {
                const { data: row } = await client
                    .from('app_settings').select('value, updated_at')
                    .eq('key', 'public.maintenance').maybeSingle();
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    scope,
                    sessionId,
                    expiresAt: auth.expiresAt,
                    maintenance: row?.value ?? null,
                    maintenanceUpdatedAt: row?.updated_at ?? null
                });
            }

            /* ------------------------------ Tổng quan ------------------------------ */
            case 'overview': {
                const [stu, active, ann, annPub, cl, logs] = await Promise.all([
                    client.from('students').select('*', { count: 'exact', head: true }),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
                    client.from('announcements').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', true),
                    client.from('changelog').select('*', { count: 'exact', head: true }),
                    client.from('admin_activity_logs').select('*', { count: 'exact', head: true })
                ]);
                const { data: latestRows } = await client
                    .from('changelog')
                    .select('version, title, published_at, created_at')
                    .limit(500);
                const latest = latestByVersion(latestRows);
                const { data: recent } = await client
                    .from('admin_activity_logs')
                    .select('id, action, target_type, target_id, created_at')
                    .order('created_at', { ascending: false })
                    .limit(10);
                const { data: review } = await client
                    .from('students')
                    .select('id, display_name, disambiguator')
                    .eq('needs_review', true)
                    .limit(20);
                return json({
                    ok: true,
                    counts: {
                        students: stu.count ?? 0,
                        studentsActive: active.count ?? 0,
                        announcements: ann.count ?? 0,
                        announcementsPublished: annPub.count ?? 0,
                        changelog: cl.count ?? 0,
                        activity: logs.count ?? 0
                    },
                    latestVersion: latest ?? null,
                    recentActivity: recent ?? [],
                    needsReview: review ?? []
                });
            }

            /* ------------------------------- Học sinh ------------------------------ */
            case 'students.list': {
                const q = normalizeName(body.q);
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 100));
                const offset = Math.max(0, Number(body.offset) || 0);
                let query = client.from('students')
                    .select('id, display_name, student_code, disambiguator, is_active, needs_review, created_at, updated_at',
                        { count: 'exact' })
                    .order('display_name', { ascending: true })
                    .range(offset, offset + limit - 1);
                if (q) query = query.ilike('normalized_name', `%${q}%`);
                if (body.status === 'active') query = query.eq('is_active', true);
                if (body.status === 'inactive') query = query.eq('is_active', false);
                if (body.review_only === true) query = query.eq('needs_review', true);
                const { data, error, count } = await query;
                if (error) throw error;
                const ids = (data ?? []).map((s) => s.id);
                const sync: Record<string, string> = {};
                if (ids.length) {
                    const { data: progress } = await client
                        .from('student_progress')
                        .select('student_id, updated_at')
                        .in('student_id', ids);
                    for (const row of progress ?? []) {
                        const prev = sync[row.student_id];
                        if (!prev || row.updated_at > prev) sync[row.student_id] = row.updated_at;
                    }
                }
                return json({
                    ok: true,
                    total: count ?? (data ?? []).length,
                    offset,
                    students: (data ?? []).map((s) => ({ ...s, last_sync_at: sync[s.id] ?? null }))
                });
            }

            /* Tìm học sinh nhẹ cho Founder chọn người nhận (gợi ý autocomplete). */
            case 'students.search': {
                /* Tìm theo tên đã chuẩn hoá (bỏ dấu, chữ thường) hoặc tên hiển thị.
                   Chỉ học sinh đang hoạt động, tối đa 20 dòng, không trả dữ liệu
                   nhạy cảm và không bao giờ tải cả bảng về trình duyệt. */
                const raw = str(body.q, 80);
                const q = normalizeName(raw)
                    .replace(/[^a-z0-9 ]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const limit = Math.min(20, Math.max(1, Number(body.limit) || 8));
                let query = client.from('students')
                    /* Không có cột avatar_url trên public.students (nằm ở
                       student_profiles). Chọn avatar_url ở đây làm PostgREST trả
                       42703 nên tìm kiếm người nhận luôn lỗi ở 7.5.0. */
                    .select('id, display_name, disambiguator, student_code, is_active, is_founder')
                    .eq('is_active', true)
                    .order('normalized_name', { ascending: true })
                    .limit(limit);
                if (q) {
                    query = query.or('normalized_name.ilike.%' + q + '%,display_name.ilike.%' + q + '%');
                }
                const { data, error } = await query;
                if (error) throw error;
                const rows = data ?? [];
                const avatars = new Map<string, string>();
                const ids = rows.map((s) => String(s.id));
                if (ids.length) {
                    const { data: profiles } = await client
                        .from('student_profiles')
                        .select('student_id, avatar_url')
                        .in('student_id', ids);
                    for (const p of profiles ?? []) {
                        avatars.set(String(p.student_id), String(p.avatar_url || ''));
                    }
                }
                const students = rows.map((s) => ({
                    id: s.id,
                    display_name: s.display_name,
                    disambiguator: s.disambiguator || '',
                    student_code: s.student_code || '',
                    avatar_url: avatars.get(String(s.id)) || '',
                    is_founder: !!s.is_founder
                }));
                return json({ ok: true, query: q, count: students.length, students });
            }

            /* Tồn kho vật phẩm của một học sinh — để dashboard biết món nào đã
               sở hữu trước khi trao. Chỉ đọc, chỉ Founder. */
            case 'students.inventory': {
                if (scope !== 'founder') {
                    return fail(403, 'FOUNDER_ONLY', 'Chỉ Founder xem được tồn kho vật phẩm.');
                }
                const id = uuidOf(body.id);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const { data: target } = await client
                    .from('students').select('id, display_name, is_founder, is_active')
                    .eq('id', id).maybeSingle();
                if (!target) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');

                const { data: rows, error } = await client
                    .from('student_badges')
                    .select('badge_id, kind, auto_earned, manual_granted, awarded_at')
                    .eq('student_id', id);
                if (error) throw error;
                const badges = (rows ?? [])
                    .filter((r) => !!BADGE_BY_ID.get(String(r.badge_id)))
                    .map((r) => ({
                        id: String(r.badge_id),
                        name: (BADGE_BY_ID.get(String(r.badge_id)) || { name: '' }).name,
                        source: r.manual_granted ? 'granted' : (r.auto_earned || r.kind === 'auto' ? 'auto' : 'granted'),
                        awardedAt: r.awarded_at || null
                    }));

                const { data: frameRows } = await client.rpc('bakhi_owned_frames', { p_student: id });
                const { data: profile } = await client.from('student_profiles')
                    .select('frame').eq('student_id', id).maybeSingle();

                return json({
                    ok: true,
                    studentId: id,
                    studentName: target.display_name,
                    isFounder: !!target.is_founder,
                    isActive: !!target.is_active,
                    badges,
                    frames: Array.isArray(frameRows) ? frameRows : ['none', 'leaf'],
                    equippedFrame: (profile && profile.frame) || 'none',
                    catalogTotal: ALL_BADGE_IDS.length,
                    catalog: badgeBreakdown()
                });
            }

            case 'students.detail': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const { data: student, error } = await client.from('students')
                    .select('id, display_name, normalized_name, student_code, disambiguator, is_active, needs_review, created_at, updated_at')
                    .eq('id', id).maybeSingle();
                if (error) throw error;
                if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                const [devices, progress, reads] = await Promise.all([
                    client.from('student_devices')
                        .select('id, created_at, last_seen_at')
                        .eq('student_id', id)
                        .order('last_seen_at', { ascending: false })
                        .limit(20),
                    client.from('student_progress')
                        .select('progress_key, progress_data, updated_at')
                        .eq('student_id', id)
                        .order('updated_at', { ascending: false }),
                    client.from('announcement_reads')
                        .select('id, announcement_id, read_at')
                        .eq('student_id', id)
                        .order('read_at', { ascending: false })
                        .limit(100)
                ]);
                const progressRows = (progress.data ?? []).map((row) => ({
                    progress_key: row.progress_key,
                    updated_at: row.updated_at,
                    bytes: (() => {
                        try { return new TextEncoder().encode(JSON.stringify(row.progress_data ?? {})).length; }
                        catch { return 0; }
                    })()
                }));
                return json({
                    ok: true,
                    student,
                    devices: devices.data ?? [],
                    progress: progressRows,
                    reads: reads.data ?? [],
                    totals: {
                        devices: (devices.data ?? []).length,
                        progressKeys: progressRows.length,
                        progressBytes: progressRows.reduce((n, p) => n + p.bytes, 0),
                        reads: (reads.data ?? []).length
                    }
                });
            }

            case 'students.export': {
                const pageSize = 1000;
                const rows: unknown[][] = [['Mã học sinh', 'Họ tên', 'Phân biệt', 'Hoạt động', 'Cần xem lại', 'Ngày tạo', 'Cập nhật cuối']];
                let from = 0;
                let total = 0;
                for (let page = 0; page < 5; page++) {
                    const { data, error } = await client.from('students')
                        .select('student_code, display_name, disambiguator, is_active, needs_review, created_at, updated_at')
                        .order('display_name', { ascending: true })
                        .range(from, from + pageSize - 1);
                    if (error) throw error;
                    const list = data ?? [];
                    total += list.length;
                    for (const s of list) {
                        rows.push([
                            s.student_code, s.display_name, s.disambiguator ?? '',
                            s.is_active ? 'Có' : 'Không', s.needs_review ? 'Có' : 'Không',
                            s.created_at, s.updated_at
                        ]);
                    }
                    if (list.length < pageSize) break;
                    from += pageSize;
                }
                await logAction(client, 'students.export', 'student', null, { rows: total });
                return json({
                    ok: true,
                    filename: 'bakhi-students-' + new Date().toISOString().slice(0, 10) + '.csv',
                    rows: total,
                    csv: csvRows(rows)
                });
            }

            case 'students.update': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const patch: Record<string, unknown> = {};
                if (body.display_name !== undefined) {
                    const display = cleanDisplayName(body.display_name).slice(0, 120);
                    if (!display) return fail(400, 'BAD_NAME', 'Họ tên không hợp lệ.');
                    patch.display_name = display;
                    patch.normalized_name = normalizeName(display);
                }
                if (body.disambiguator !== undefined) {
                    const d = cleanDisplayName(body.disambiguator).slice(0, 60);
                    patch.disambiguator = d || null;
                    if (d) patch.needs_review = false;
                }
                if (body.is_active !== undefined) patch.is_active = !!body.is_active;
                if (!Object.keys(patch).length) return fail(400, 'NOTHING_TO_UPDATE', 'Không có thay đổi.');
                const { data, error } = await client.from('students').update(patch).eq('id', id).select().maybeSingle();
                if (error) {
                    if ((error as { code?: string }).code === '23505') {
                        return fail(409, 'DUPLICATE_NAME', 'Đã có học sinh khác trùng họ tên. Hãy nhập thông tin phân biệt.');
                    }
                    throw error;
                }
                await logAction(client, 'students.update', 'student', id, patch);
                return json({ ok: true, student: data });
            }

            /* --------------------------- Hồ sơ & badge --------------------------- */
            case 'profiles.list': {
                const limit = Math.min(100, Math.max(1, Number(body.limit) || 40));
                const offset = Math.max(0, Number(body.offset) || 0);
                let query = client.from('students')
                    .select('id, display_name, disambiguator, is_active, needs_review', { count: 'exact' })
                    .order('display_name', { ascending: true })
                    .range(offset, offset + limit - 1);
                if (body.q) query = query.ilike('display_name', `%${str(body.q, 120)}%`);
                const { data: students, error, count } = await query;
                if (error) throw error;
                const ids = (students ?? []).map((s) => s.id);
                const profiles: Record<string, Record<string, unknown>> = {};
                const badgeCounts: Record<string, number> = {};
                const roleMap: Record<string, { role_key: string; role_label: string }> = {};
                if (ids.length) {
                    const { data: roleRows } = await client
                        .from('student_roles')
                        .select('student_id, role_key, role_label')
                        .in('student_id', ids);
                    for (const row of roleRows ?? []) {
                        roleMap[row.student_id] = { role_key: row.role_key, role_label: row.role_label };
                    }
                    const { data: rows } = await client
                        .from('student_profiles')
                        .select('student_id, nickname, avatar_url, frame, updated_at')
                        .in('student_id', ids);
                    for (const row of rows ?? []) profiles[row.student_id] = row;
                    const { data: badgeRows } = await client
                        .from('student_badges')
                        .select('student_id')
                        .in('student_id', ids);
                    for (const row of badgeRows ?? []) {
                        badgeCounts[row.student_id] = (badgeCounts[row.student_id] ?? 0) + 1;
                    }
                }
                return json({
                    ok: true,
                    total: count ?? (students ?? []).length,
                    offset,
                    profiles: (students ?? []).map((s) => ({
                        ...s,
                        profile: profiles[s.id] ?? null,
                        role: roleMap[s.id] ?? null,
                        badges: badgeCounts[s.id] ?? 0
                    }))
                });
            }

            case 'profiles.detail': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const { data: student } = await client.from('students').select('*').eq('id', id).maybeSingle();
                if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                const { data: profile } = await client
                    .from('student_profiles').select('*').eq('student_id', id).maybeSingle();
                const { data: badges } = await client
                    .from('student_badges')
                    .select('badge_id, kind, auto_earned, manual_granted, awarded_at, awarded_by, reason')
                    .eq('student_id', id)
                    .order('awarded_at', { ascending: false });
                const { data: role } = await client
                    .from('student_roles').select('role_key, role_label').eq('student_id', id).maybeSingle();
                return json({ ok: true, student, profile: profile ?? null, role: role ?? null, badges: badges ?? [] });
            }

            case 'badges.list': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const { data: badges, error } = await client
                    .from('student_badges')
                    .select('badge_id, kind, auto_earned, manual_granted, awarded_at, awarded_by, reason')
                    .eq('student_id', id)
                    .order('awarded_at', { ascending: false });
                if (error) throw error;
                return json({ ok: true, badges: badges ?? [] });
            }

            case 'badges.grant': {
                const id = str(body.id, 40);
                const badgeId = str(body.badge_id, 64);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                if (!BADGE_ID_RE.test(badgeId)) {
                    return fail(400, 'BAD_BADGE_ID', 'Mã badge không hợp lệ.');
                }
                const { data: student } = await client
                    .from('students').select('id, is_founder').eq('id', id).maybeSingle();
                if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                if (badgeId === FOUNDER_BADGE_ID && student.is_founder !== true) {
                    /* Thiên Khải Sáng Thế chỉ cấp cho hồ sơ đã có cờ is_founder.
                       Không tự đánh dấu Founder theo tên hiển thị hay tham số client. */
                    return fail(403, 'FOUNDER_PROFILE_REQUIRED',
                        'Badge Thiên Khải Sáng Thế chỉ cấp cho hồ sơ Người sáng lập (is_founder = true).');
                }
                const exclusive = badgeId === FOUNDER_BADGE_ID || DEV_BADGE_IDS.includes(badgeId);
                if (exclusive && scope !== 'founder') {
                    return fail(403, 'FOUNDER_ONLY',
                        'Badge độc quyền (Founder/Developer) chỉ Founder mới được trao.');
                }
                const reason = cleanDisplayName(body.reason).slice(0, 200);
                const { data: prior } = await client.from('student_badges')
                    .select('badge_id').eq('student_id', id).eq('badge_id', badgeId).maybeSingle();
                /* manual_granted là nguồn riêng: không ghi đè auto_earned.awarded_at
                   của kết quả tự động — chỉ đánh dấu trao tay và ghi người trao. */
                const { error } = await client.from('student_badges').upsert({
                    student_id: id,
                    badge_id: badgeId,
                    kind: 'admin',
                    manual_granted: true,
                    awarded_at: new Date().toISOString(),
                    awarded_by: sessionId,
                    reason
                }, { onConflict: 'student_id,badge_id' });
                if (error) throw error;
                await logAction(client, 'badges.grant', 'student', id, {
                    badge_id: badgeId, reason, exclusive: DEV_BADGE_IDS.includes(badgeId) || badgeId === FOUNDER_BADGE_ID
                });
                const { data: badges } = await client
                    .from('student_badges')
                    .select('badge_id, kind, auto_earned, manual_granted, awarded_at, awarded_by, reason')
                    .eq('student_id', id)
                    .order('awarded_at', { ascending: false });
                const report = grantReport({
                    requestedIds: [badgeId],
                    grantedIds: prior ? [] : [badgeId],
                    alreadyOwnedIds: prior ? [badgeId] : []
                });
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    studentName: student.display_name,
                    item_name: (BADGE_BY_ID.get(badgeId) || { name: badgeId }).name,
                    badges: badges ?? [],
                    ...report
                });
            }

            case 'badges.revoke': {
                const id = str(body.id, 40);
                const badgeId = str(body.badge_id, 64);
                if (!id || !badgeId) return fail(400, 'MISSING_ID', 'Thiếu id học sinh hoặc badge.');
                if (!BADGE_ID_RE.test(badgeId)) {
                    return fail(400, 'BAD_BADGE_ID', 'Mã badge không hợp lệ.');
                }
                /* Chỉ thu hồi phần trao tay. Badge tự động đạt vẫn được giữ. */
                const { data: row } = await client.from('student_badges')
                    .select('badge_id, auto_earned, manual_granted')
                    .eq('student_id', id).eq('badge_id', badgeId).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Học sinh chưa có badge này.');
                if (!row.manual_granted) {
                    return fail(400, 'NOT_MANUAL', 'Badge này do hệ thống tự đạt, không thu hồi thủ công.');
                }
                /* Badge độc quyền (Founder/Developer) chỉ Founder thu hồi được. */
                const exclusiveBadge = badgeId === FOUNDER_BADGE_ID || DEV_BADGE_IDS.includes(badgeId);
                if (exclusiveBadge && scope !== 'founder') {
                    return fail(403, 'FOUNDER_ONLY',
                        'Badge độc quyền (Founder/Developer) chỉ Founder mới được thu hồi.');
                }
                if (row.auto_earned) {
                    const { error } = await client.from('student_badges')
                        .update({ manual_granted: false, awarded_by: null, reason: '' })
                        .eq('student_id', id).eq('badge_id', badgeId);
                    if (error) throw error;
                } else {
                    const { error } = await client.from('student_badges')
                        .delete().eq('student_id', id).eq('badge_id', badgeId);
                    if (error) throw error;
                }
                await logAction(client, 'badges.revoke', 'student', id, {
                    badge_id: badgeId,
                    exclusive: exclusiveBadge,
                    auto_earned: !!row.auto_earned
                });
                return json({ ok: true });
            }

            /* ---------------------- Trao thành tích hàng loạt --------------------- */
            case 'badges.autoGrant': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const { data: target } = await client
                    .from('students').select('id, display_name, is_active').eq('id', id).maybeSingle();
                if (!target) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                if (!target.is_active) return fail(400, 'INACTIVE', 'Học sinh đã ngừng hoạt động.');

                /* Ảnh chụp trước khi xét, để báo cáo chính xác badge nào MỚI được cấp. */
                const { data: beforeRows } = await client
                    .from('student_badges').select('badge_id').eq('student_id', id);
                const before = new Set<string>((beforeRows ?? []).map((r) => String(r.badge_id)));

                /* Dùng lại toàn bộ quy tắc badge của student-profile thay vì sao
                   chép điều kiện. Chỉ service_role gọi được đường nội bộ này. */
                const url = Deno.env.get('SUPABASE_URL') ?? '';
                const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
                if (!url || !serviceKey) {
                    return fail(500, 'CONFIG_MISSING', 'Thiếu cấu hình máy chủ để tính thành tích.');
                }
                let payload: Record<string, unknown> | null = null;
                try {
                    const res = await fetch(url.replace(/\/+$/, '') + '/functions/v1/student-profile', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + serviceKey,
                            'apikey': serviceKey
                        },
                        body: JSON.stringify({ action: 'sync', student_id: id })
                    });
                    payload = await res.json().catch(() => null);
                    if (!res.ok || !payload || payload.ok !== true) {
                        return fail(502, 'AUTO_GRANT_FAILED',
                            'Không tính được thành tích tự động. Kiểm tra Edge Function student-profile.');
                    }
                } catch {
                    return fail(502, 'AUTO_GRANT_FAILED', 'Không kết nối được dịch vụ thành tích.');
                }

                const { data: afterRows } = await client
                    .from('student_badges').select('badge_id').eq('student_id', id);
                const after = new Set<string>((afterRows ?? []).map((r) => String(r.badge_id)));

                const autoBadges = BADGE_CATALOG.filter((b) => !b.admin_only);
                const autoIds = autoBadges.map((b) => b.id);
                const earned = autoIds.filter((b) => after.has(b) && !before.has(b));
                const alreadyOwned = autoIds.filter((b) => before.has(b));
                const notEligible = autoBadges
                    .filter((b) => !after.has(b))
                    .map((b) => ({ id: b.id, name: b.name, reason: 'Chưa đủ điều kiện theo dữ liệu học tập đã đồng bộ.' }));
                const excluded = BADGE_CATALOG
                    .filter((b) => b.admin_only)
                    .map((b) => ({
                        id: b.id,
                        name: b.name,
                        reason: b.exclusive === 'founder'
                            ? 'Badge Founder độc quyền — chỉ trao tay từ Founder Dashboard.'
                            : b.exclusive === 'dev'
                                ? 'Badge Developer độc quyền — chỉ Founder trao tay.'
                                : 'Badge chỉ nhận qua trao tặng của quản trị viên.'
                    }));

                await logAction(client, 'badges.autoGrant', 'student', id, {
                    earned: earned.length,
                    alreadyOwned: alreadyOwned.length,
                    notEligible: notEligible.length,
                    excluded: excluded.length
                });

                return json({
                    ok: true,
                    studentId: id,
                    studentName: target.display_name,
                    earned,
                    alreadyOwned,
                    notEligible,
                    excluded,
                    totalOwned: after.size,
                    autoTotal: autoIds.length,
                    frames: Array.isArray(payload.frames) ? payload.frames : []
                });
            }

            case 'badges.grantAllPreview': {
                /* CHỈ ĐỌC. 7.4.0 dùng chính badges.grantAll cho bản xem trước nên
                   chỉ mở xem đã cấp badge thật — lỗi này được tách hẳn ở đây. */
                const id = uuidOf(body.id);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu hoặc sai id học sinh.');
                const { data: target } = await client
                    .from('students').select('id, display_name, is_active').eq('id', id).maybeSingle();
                if (!target) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                if (!target.is_active) return fail(400, 'INACTIVE', 'Học sinh đã ngừng hoạt động.');

                const grantable = ALL_BADGE_IDS.filter((b) => !EXCLUSIVE_BADGE_IDS.includes(b));
                const { data: rows, error } = await client
                    .from('student_badges').select('badge_id').eq('student_id', id);
                if (error) throw error;
                const owned = new Set<string>((rows ?? []).map((r) => String(r.badge_id)));

                const toGrant = grantable.filter((b) => !owned.has(b));
                const already = grantable.filter((b) => owned.has(b));
                return json({
                    ok: true,
                    dryRun: true,
                    studentId: id,
                    studentName: target.display_name,
                    totalGrantable: grantable.length,
                    toGrant: toGrant.map((b) => ({
                        id: b, name: (BADGE_BY_ID.get(b) || { name: b }).name
                    })),
                    toAddCount: toGrant.length,
                    alreadyOwned: already,
                    alreadyOwnedCount: already.length,
                    excluded: EXCLUSIVE_BADGE_IDS,
                    excludedCount: EXCLUSIVE_BADGE_IDS.length,
                    catalog: badgeBreakdown()
                });
            }

            case 'badges.grantAll': {
                const id = uuidOf(body.id);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu hoặc sai id học sinh.');
                const requestId = requestIdOf(body.request_id);
                const { data: target } = await client
                    .from('students').select('id, display_name, is_active').eq('id', id).maybeSingle();
                if (!target) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                if (!target.is_active) return fail(400, 'INACTIVE', 'Học sinh đã ngừng hoạt động.');

                /* Badge độc quyền (Founder + Developer) KHÔNG bao giờ nằm trong
                   "cấp toàn bộ", kể cả khi gọi API trực tiếp. Danh sách suy ra từ
                   cờ `exclusive` của danh mục, không viết cứng số lượng. */
                const grantable = ALL_BADGE_IDS.filter((b) => !EXCLUSIVE_BADGE_IDS.includes(b));
                const reason = 'Cấp toàn bộ badge đồng bộ (trừ badge độc quyền)';

                const replay = await replayGrant(client, requestId, id);
                if (replay) {
                    return json({ ...replay, studentName: target.display_name, catalog: badgeBreakdown() });
                }

                let result: GrantResult;
                try {
                    result = await grantBadgeIds(client, id, grantable, reason, sessionId);
                } catch (err) {
                    if (err instanceof GrantError) return fail(err.status, err.code, err.message);
                    throw err;
                }

                await writeGrantHistory(client, requestId, scope, sessionId, id,
                    'badge', result.added, reason);
                await writeGrantBatch(client, {
                    request_id: requestId,
                    actor_scope: scope,
                    actor_id: sessionId,
                    target_student: id,
                    item_type: 'badge',
                    requested: grantable.length,
                    added: result.added.length,
                    already_owned: result.alreadyOwned.length,
                    failed: 0
                });
                await logAction(client, 'badges.grantAll', 'student', id, {
                    request_id: requestId,
                    added: result.added.length,
                    alreadyOwned: result.alreadyOwned.length,
                    excluded: EXCLUSIVE_BADGE_IDS.length
                });

                const report = grantReport({
                    requestedIds: grantable,
                    grantedIds: result.added,
                    alreadyOwnedIds: result.alreadyOwned,
                    failedIds: result.failed ?? []
                });
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    requestId,
                    studentId: id,
                    studentName: target.display_name,
                    ...report,
                    excluded: EXCLUSIVE_BADGE_IDS,
                    excludedCount: EXCLUSIVE_BADGE_IDS.length,
                    totalGrantable: grantable.length,
                    catalog: badgeBreakdown()
                });
            }

            /* ------------------------------ Danh vị học sinh ----------------------------- */
            case 'roles.list': {
                const { data, error } = await client
                    .from('student_roles')
                    .select('student_id, role_key, role_label, updated_at')
                    .order('updated_at', { ascending: false })
                    .limit(Math.min(500, Math.max(1, Number(body.limit) || 200)));
                if (error) throw error;
                return json({ ok: true, roles: data ?? [] });
            }

            case 'roles.set': {
                const id = str(body.id, 40);
                const roleKey = str(body.role_key, 40) || 'member';
                const roleLabel = str(body.role_label, 80);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                if (!/^[a-z0-9-]{2,40}$/.test(roleKey)) {
                    return fail(400, 'BAD_ROLE_KEY', 'Mã danh vị không hợp lệ.');
                }
                const { data: student } = await client.from('students').select('id').eq('id', id).maybeSingle();
                if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                const { error } = await client.from('student_roles').upsert({
                    student_id: id,
                    role_key: roleKey,
                    role_label: roleLabel,
                    updated_at: new Date().toISOString(),
                    updated_by: sessionId
                }, { onConflict: 'student_id' });
                if (error) throw error;
                await logAction(client, 'roles.set', 'student', id, { role_key: roleKey, role_label: roleLabel });
                return json({ ok: true });
            }

            /* ------------------------------ Chat kiểm duyệt ------------------------------ */
            case 'chat.rooms': {
                const limit = Math.min(60, Math.max(1, Number(body.limit) || 40));
                const { data: rooms, error } = await client
                    .from('chat_rooms')
                    .select('id, kind, title, dm_key, created_by, created_at, last_message_at')
                    .order('last_message_at', { ascending: false })
                    .limit(limit);
                if (error) throw error;
                const summaries = await Promise.all((rooms ?? []).map(async (room) => {
                    const [members, messages, last] = await Promise.all([
                        client.from('chat_members').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
                        client.from('chat_messages').select('*', { count: 'exact', head: true }).eq('room_id', room.id),
                        client.from('chat_messages')
                            .select('student_id, body, image_path, created_at, deleted_at')
                            .eq('room_id', room.id)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle()
                    ]);
                    return {
                        ...room,
                        member_count: members.count ?? 0,
                        message_count: messages.count ?? 0,
                        last_message: last.data ?? null
                    };
                }));
                return json({ ok: true, rooms: summaries });
            }

            case 'chat.messages': {
                const roomId = str(body.room_id, 40);
                if (!roomId) return fail(400, 'MISSING_ROOM', 'Thiếu phòng chat.');
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 100));
                const before = str(body.before, 40);
                const { data: room } = await client
                    .from('chat_rooms').select('id, kind, title, dm_key').eq('id', roomId).maybeSingle();
                if (!room) return fail(404, 'NOT_FOUND', 'Không tìm thấy phòng chat.');
                const { data: members } = await client
                    .from('chat_members')
                    .select('student_id, role, muted, joined_at, last_read_at')
                    .eq('room_id', roomId)
                    .order('joined_at', { ascending: true })
                    .limit(20);
                const ids = (members ?? []).map((m) => m.student_id);
                let query = client.from('chat_messages')
                    .select('id, room_id, student_id, body, image_path, created_at, deleted_at')
                    .eq('room_id', roomId)
                    .order('created_at', { ascending: false })
                    .limit(limit);
                if (before) query = query.lt('created_at', before);
                const { data: messages, error } = await query;
                if (error) throw error;
                const senderIds = [...new Set([...ids, ...(messages ?? []).map((m) => m.student_id)])];
                const names: Record<string, string> = {};
                if (senderIds.length) {
                    const { data: students } = await client
                        .from('students').select('id, display_name').in('id', senderIds);
                    for (const s of students ?? []) names[s.id] = s.display_name;
                }
                return json({
                    ok: true,
                    room,
                    members: (members ?? []).map((m) => ({
                        ...m,
                        display_name: names[m.student_id] || 'Học sinh'
                    })),
                    messages: (messages ?? []).reverse().map((m) => ({
                        ...m,
                        sender_name: names[m.student_id] || 'Học sinh'
                    }))
                });
            }

            case 'chat.delete': {
                const messageId = str(body.message_id, 40);
                if (!messageId) return fail(400, 'MISSING_MESSAGE', 'Thiếu tin nhắn.');
                const { data: message } = await client
                    .from('chat_messages')
                    .select('id, room_id, student_id, image_path, deleted_at')
                    .eq('id', messageId)
                    .maybeSingle();
                if (!message) return fail(404, 'NOT_FOUND', 'Không tìm thấy tin nhắn.');
                const { error } = await client.from('chat_messages')
                    .update({ body: '', image_path: null, deleted_at: new Date().toISOString() })
                    .eq('id', messageId);
                if (error) throw error;
                if (message.image_path) {
                    try {
                        await client.storage.from('chat-images').remove([message.image_path]);
                    } catch { /* ảnh có thể đã bị xoá trước đó */ }
                }
                await logAction(client, 'chat.delete', 'chat_message', messageId, {
                    room_id: message.room_id,
                    student_id: message.student_id
                });
                return json({ ok: true });
            }

            case 'chat.room.delete': {
                const roomId = str(body.room_id, 40);
                if (!roomId) return fail(400, 'MISSING_ROOM', 'Thiếu phòng chat.');
                const { data: room } = await client
                    .from('chat_rooms').select('id, kind, title').eq('id', roomId).maybeSingle();
                if (!room) return fail(404, 'NOT_FOUND', 'Không tìm thấy phòng chat.');
                if (room.kind === 'global') {
                    return fail(400, 'PROTECTED_ROOM', 'Không thể xoá phòng chung.');
                }
                const { error } = await client.from('chat_rooms').delete().eq('id', roomId);
                if (error) throw error;
                await logAction(client, 'chat.room.delete', 'chat_room', roomId, {
                    kind: room.kind, title: room.title
                });
                return json({ ok: true });
            }

            case 'chat.member.remove': {
                const roomId = str(body.room_id, 40);
                const studentId = str(body.student_id, 40);
                if (!roomId || !studentId) return fail(400, 'MISSING_ID', 'Thiếu phòng hoặc thành viên.');
                const { data: room } = await client
                    .from('chat_rooms').select('id, kind').eq('id', roomId).maybeSingle();
                if (!room) return fail(404, 'NOT_FOUND', 'Không tìm thấy phòng chat.');
                if (room.kind === 'global') {
                    return fail(400, 'PROTECTED_ROOM', 'Phòng chung không có danh sách thành viên để xoá.');
                }
                const { error } = await client.from('chat_members')
                    .delete().eq('room_id', roomId).eq('student_id', studentId);
                if (error) throw error;
                await logAction(client, 'chat.member.remove', 'student', studentId, { room_id: roomId });
                return json({ ok: true });
            }

            case 'chat.mute': {
                const roomId = str(body.room_id, 40);
                const studentId = str(body.student_id, 40);
                if (!roomId || !studentId) return fail(400, 'MISSING_ID', 'Thiếu phòng hoặc thành viên.');
                const muted = body.muted === true;
                const { data: rows, error } = await client.from('chat_members')
                    .update({ muted })
                    .eq('room_id', roomId)
                    .eq('student_id', studentId)
                    .select('room_id, student_id, muted');
                if (error) throw error;
                if (!rows || !rows.length) {
                    return fail(404, 'NOT_MEMBER', 'Học sinh không phải thành viên phòng này.');
                }
                await logAction(client, muted ? 'chat.mute' : 'chat.unmute', 'student', studentId, {
                    room_id: roomId
                });
                return json({ ok: true, muted });
            }

            /* ------------------------------ Thông báo ------------------------------ */
            case 'announcements.list': {
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 100));
                const offset = Math.max(0, Number(body.offset) || 0);
                let query = client.from('announcements').select('*', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                if (body.q) query = query.ilike('title', `%${str(body.q, 120)}%`);
                if (ANNOUNCEMENT_TYPES.includes(String(body.type))) query = query.eq('type', String(body.type));
                if (body.status === 'published') query = query.eq('is_published', true);
                if (body.status === 'draft') query = query.eq('is_published', false);
                const { data, error, count } = await query;
                if (error) throw error;
                return json({ ok: true, total: count ?? (data ?? []).length, offset, announcements: data ?? [] });
            }

            case 'announcements.stats': {
                const [all, published, draft, reads, linked, recent] = await Promise.all([
                    client.from('announcements').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', true),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', false),
                    client.from('announcement_reads').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).not('changelog_version', 'is', null),
                    client.from('announcements').select('id, title, type, priority, is_published, published_at, changelog_version')
                        .order('published_at', { ascending: false, nullsFirst: false }).limit(5)
                ]);
                const byType: Record<string, number> = {};
                const { data: typeRows } = await client.from('announcements').select('type').limit(1000);
                for (const row of typeRows ?? []) byType[row.type] = (byType[row.type] ?? 0) + 1;
                return json({
                    ok: true,
                    stats: {
                        total: all.count ?? 0,
                        published: published.count ?? 0,
                        draft: draft.count ?? 0,
                        reads: reads.count ?? 0,
                        linkedToChangelog: linked.count ?? 0,
                        byType
                    },
                    recent: recent.data ?? []
                });
            }

            case 'announcements.save': {
                const id = str(body.id, 40);
                const title = str(body.title, 160);
                const content = str(body.content, 20000);
                if (!title) return fail(400, 'MISSING_TITLE', 'Cần nhập tiêu đề.');
                if (!content) return fail(400, 'MISSING_CONTENT', 'Cần nhập nội dung.');
                const row = {
                    title,
                    content,
                    type: oneOf(body.type, ANNOUNCEMENT_TYPES, 'general'),
                    priority: oneOf(body.priority, PRIORITIES, 'normal'),
                    is_published: !!body.is_published
                };
                if (row.is_published) (row as Record<string, unknown>).published_at = new Date().toISOString();
                let result;
                if (id) {
                    result = await client.from('announcements').update(row).eq('id', id).select().maybeSingle();
                } else {
                    result = await client.from('announcements').insert(row).select().maybeSingle();
                }
                if (result.error) throw result.error;
                await logAction(client, row.is_published ? 'announcements.publish' : 'announcements.save',
                    'announcement', result.data?.id ?? null, { title: row.title, priority: row.priority });
                return json({ ok: true, announcement: result.data });
            }

            case 'announcements.publish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id thông báo.');
                const { data, error } = await client.from('announcements')
                    .update({ is_published: true, published_at: new Date().toISOString() })
                    .eq('id', id).select().maybeSingle();
                if (error) throw error;
                if (!data) return fail(404, 'NOT_FOUND', 'Không tìm thấy thông báo.');
                await logAction(client, 'announcements.publish', 'announcement', id, { title: data.title });
                return json({ ok: true, announcement: data });
            }

            case 'announcements.unpublish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id thông báo.');
                const { data, error } = await client.from('announcements')
                    .update({ is_published: false }).eq('id', id).select().maybeSingle();
                if (error) throw error;
                await logAction(client, 'announcements.unpublish', 'announcement', id, {});
                return json({ ok: true, announcement: data });
            }

            case 'announcements.delete': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id thông báo.');
                const { error } = await client.from('announcements').delete().eq('id', id);
                if (error) throw error;
                await logAction(client, 'announcements.delete', 'announcement', id, {});
                return json({ ok: true });
            }

            /* 8.5.6 — xoá nhiều thông báo trong MỘT lượt (Founder Dashboard).
               Chỉ xoá đúng các id máy chủ xác nhận là tồn tại; trả về danh sách
               đã xoá và danh sách thất bại để giao diện báo kết quả trung thực. */
            case 'announcements.bulkDelete': {
                const raw = Array.isArray(body.ids) ? body.ids : [];
                const ids = Array.from(new Set(raw.map((x) => str(x, 40)).filter(Boolean))).slice(0, 100);
                if (!ids.length) return fail(400, 'MISSING_IDS', 'Chưa chọn thông báo nào.');
                const { data: existing, error: readError } = await client.from('announcements')
                    .select('id, title').in('id', ids);
                if (readError) throw readError;
                const found = existing ?? [];
                const foundIds = found.map((row) => String(row.id));
                const missing = ids.filter((id) => !foundIds.includes(id));
                if (!foundIds.length) {
                    return json({ ok: true, deleted: 0, deletedIds: [], failed: missing });
                }
                const { error } = await client.from('announcements').delete().in('id', foundIds);
                if (error) throw error;
                await logAction(client, 'announcements.bulkDelete', 'announcement', null, {
                    count: foundIds.length,
                    titles: found.map((row) => str(row.title, 80)).slice(0, 20)
                });
                return json({ ok: true, deleted: foundIds.length, deletedIds: foundIds, failed: missing });
            }

            /* ------------------------------- Changelog ----------------------------- */
            case 'changelog.list': {
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 100));
                const offset = Math.max(0, Number(body.offset) || 0);
                /* Sắp xếp theo phiên bản ngữ nghĩa, không theo created_at/published_at.
                   Lấy tối đa 500 hàng đã lọc rồi mới cắt trang để thứ tự đúng trên
                   toàn bộ danh sách (changelog luôn nhỏ hơn ngưỡng này). */
                let query = client.from('changelog').select('*')
                    .order('created_at', { ascending: false })
                    .limit(500);
                const q = str(body.q, 60).replace(/[%,()"'\\]/g, '');
                if (q) query = query.or(`version.ilike.%${q}%,title.ilike.%${q}%`);
                if (CATEGORIES.includes(String(body.category))) query = query.eq('category', String(body.category));
                if (body.status === 'published') query = query.eq('is_published', true);
                if (body.status === 'draft') query = query.eq('is_published', false);
                if (body.source === 'admin' || body.source === 'github') query = query.eq('source', String(body.source));
                if (['draft', 'published', 'failed'].includes(String(body.sync_state))) {
                    query = query.eq('sync_state', String(body.sync_state));
                }
                const { data, error } = await query;
                if (error) throw error;
                const sorted = (data ?? []).slice()
                    .sort((a, b) => versionCmp(String(b.version), String(a.version)));
                return json({
                    ok: true,
                    total: sorted.length,
                    offset,
                    changelog: sorted.slice(offset, offset + limit)
                });
            }

            case 'changelog.save': {
                const id = str(body.id, 40);
                const version = str(body.version, 32);
                const title = str(body.title, 160);
                if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(version)) {
                    return fail(400, 'BAD_VERSION', 'Phiên bản chỉ gồm chữ, số và . + _ - (tối đa 32 ký tự).');
                }
                if (!title) return fail(400, 'MISSING_TITLE', 'Cần nhập tiêu đề.');
                const sections = parseSections(body.content);
                if (!sections.length) return fail(400, 'EMPTY_CONTENT', 'Cần ít nhất một mục thay đổi.');
                const summary = str(body.summary, 400) || null;
                const category = oneOf(body.category, CATEGORIES, 'other');
                const isPublished = !!body.is_published;

                const { data: existing } = await client.from('changelog')
                    .select('id').eq('version', version).maybeSingle();
                if (existing && existing.id !== id) {
                    return fail(409, 'DUPLICATE_VERSION', `Phiên bản ${version} đã tồn tại.`);
                }

                if (!isPublished) {
                    const row = {
                        version, title, summary, content: sections, category,
                        is_published: false, sync_state: 'draft', sync_error: null
                    };
                    const result = id
                        ? await client.from('changelog').update(row).eq('id', id).select().maybeSingle()
                        : await client.from('changelog').insert(row).select().maybeSingle();
                    if (result.error) throw result.error;
                    await logAction(client, 'changelog.save', 'changelog', result.data?.id ?? null, { version });
                    return json({ ok: true, entry: result.data, announcement_created: false });
                }

                /* Xuất bản qua RPC dùng chung với GitHub Actions: chỉ phiên bản
                   mới nhất mới sinh thông báo, chỉnh sửa không gửi lại. */
                const { data: published, error: publishError } = await client.rpc('bakhi_publish_changelog', {
                    p_version: version,
                    p_title: title,
                    p_summary: summary,
                    p_content: sections,
                    p_category: category,
                    p_source: 'admin',
                    p_content_hash: null,
                    p_published_at: new Date().toISOString()
                });
                if (publishError) {
                    if ((publishError as { code?: string }).code === '23505') {
                        return fail(409, 'DUPLICATE_VERSION', `Phiên bản ${version} đã tồn tại.`);
                    }
                    throw publishError;
                }
                const { data: entry } = await client.from('changelog')
                    .select('*').eq('version', version).maybeSingle();
                await logAction(client, 'changelog.publish', 'changelog', entry?.id ?? null, {
                    version, announcement_created: !!published?.announcement_created
                });
                return json({ ok: true, entry, publish: published });
            }

            case 'changelog.publish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { data: entry, error: findError } = await client.from('changelog')
                    .select('id, version, title, summary, content, category')
                    .eq('id', id).maybeSingle();
                if (findError) throw findError;
                if (!entry) return fail(404, 'NOT_FOUND', 'Không tìm thấy changelog.');
                const { data: published, error } = await client.rpc('bakhi_publish_changelog', {
                    p_version: entry.version,
                    p_title: entry.title,
                    p_summary: entry.summary,
                    p_content: entry.content,
                    p_category: entry.category,
                    p_source: 'admin',
                    p_content_hash: null,
                    p_published_at: new Date().toISOString()
                });
                if (error) throw error;
                const { data: fresh } = await client.from('changelog').select('*').eq('id', id).maybeSingle();
                await logAction(client, 'changelog.publish', 'changelog', id, {
                    version: entry.version, announcement_created: !!published?.announcement_created
                });
                return json({ ok: true, entry: fresh, publish: published });
            }

            case 'changelog.unpublish': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { data, error } = await client.from('changelog')
                    .update({ is_published: false, sync_state: 'draft' })
                    .eq('id', id).select().maybeSingle();
                if (error) throw error;
                await logAction(client, 'changelog.unpublish', 'changelog', id, {});
                return json({ ok: true, entry: data });
            }

            case 'changelog.delete': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id changelog.');
                const { error } = await client.from('changelog').delete().eq('id', id);
                if (error) throw error;
                await logAction(client, 'changelog.delete', 'changelog', id, {});
                return json({ ok: true });
            }

            /* ------------------------------ Nhật ký -------------------------------- */
            case 'logs.list': {
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 60));
                const offset = Math.max(0, Number(body.offset) || 0);
                const q = str(body.q, 120).replace(/[%,()"'\\]/g, '');
                const target = str(body.target, 40);
                const from = validIsoDate(body.from);
                const to = validIsoDate(body.to);
                let query = client.from('admin_activity_logs')
                    .select('id, action, target_type, target_id, detail, created_at', { count: 'exact' })
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                if (q) query = query.or(`action.ilike.%${q}%,target_type.ilike.%${q}%,target_id.ilike.%${q}%`);
                if (target) query = query.eq('target_type', target);
                if (from) query = query.gte('created_at', from + 'T00:00:00.000Z');
                if (to) query = query.lte('created_at', to + 'T23:59:59.999Z');
                const { data, error, count } = await query;
                if (error) throw error;
                return json({ ok: true, total: count ?? (data ?? []).length, offset, logs: data ?? [] });
            }

            case 'logs.export': {
                const q = str(body.q, 120).replace(/[%,()"'\\]/g, '');
                const target = str(body.target, 40);
                const from = validIsoDate(body.from);
                const to = validIsoDate(body.to);
                const rows: unknown[][] = [['Thời gian', 'Hành động', 'Đối tượng', 'ID đối tượng', 'Chi tiết']];
                const pageSize = 1000;
                let offset = 0;
                let total = 0;
                for (let page = 0; page < 5; page++) {
                    let query = client.from('admin_activity_logs')
                        .select('action, target_type, target_id, detail, created_at')
                        .order('created_at', { ascending: false })
                        .range(offset, offset + pageSize - 1);
                    if (q) query = query.or(`action.ilike.%${q}%,target_type.ilike.%${q}%,target_id.ilike.%${q}%`);
                    if (target) query = query.eq('target_type', target);
                    if (from) query = query.gte('created_at', from + 'T00:00:00.000Z');
                    if (to) query = query.lte('created_at', to + 'T23:59:59.999Z');
                    const { data, error } = await query;
                    if (error) throw error;
                    const list = data ?? [];
                    total += list.length;
                    for (const row of list) {
                        rows.push([row.created_at, row.action, row.target_type ?? '', row.target_id ?? '',
                            JSON.stringify(row.detail ?? {})]);
                    }
                    if (list.length < pageSize) break;
                    offset += pageSize;
                }
                await logAction(client, 'logs.export', 'session', null, { rows: total });
                return json({
                    ok: true,
                    filename: 'bakhi-activity-' + new Date().toISOString().slice(0, 10) + '.csv',
                    rows: total,
                    csv: csvRows(rows)
                });
            }

            /* ------------------------------- Cài đặt ------------------------------- */
            case 'settings.status': {
                const { count } = await client.from('students').select('*', { count: 'exact', head: true });
                return json({
                    ok: true,
                    status: {
                        adminDevCode: !!Deno.env.get('ADMIN_DEV_CODE'),
                        serviceRole: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
                        rosterSecret: !!Deno.env.get('STUDENT_ROSTER_SECRET'),
                        students: count ?? 0
                    }
                });
            }

            case 'settings.get': {
                const { data, error } = await client.from('app_settings')
                    .select('key, value, description, updated_at')
                    .order('key', { ascending: true });
                if (error) throw error;
                return json({ ok: true, settings: data ?? [] });
            }

            case 'maintenance.history': {
                const q = str(body.q, 80).replace(/[,()%*]/g, ' ').trim();
                const status = oneOf(body.status, ['all', 'active', 'completed'], 'all');
                const limit = Math.min(200, Math.max(1, Number(body.limit) || 60));
                let query = client.from('maintenance_history')
                    .select('id, started_at, ended_at, started_by, ended_by, reason, status, duration_seconds, completion_announcement_id, notified_at, created_at', { count: 'exact' })
                    .order('started_at', { ascending: false })
                    .limit(limit);
                if (status !== 'all') query = query.eq('status', status);
                if (q) {
                    query = query.or([
                        'reason.ilike.%' + q + '%',
                        'started_by.ilike.%' + q + '%',
                        'ended_by.ilike.%' + q + '%'
                    ].join(','));
                }
                const { data, error, count } = await query;
                if (error) throw error;
                return json({ ok: true, total: count ?? (data ?? []).length, history: data ?? [] });
            }

            case 'settings.set': {
                const key = str(body.key, 80);
                const allowed = ['public.whatsnew', 'public.maintenance', 'public.branding'];
                if (!allowed.includes(key)) {
                    return fail(400, 'BAD_SETTING_KEY', 'Chỉ được đổi các khoá: ' + allowed.join(', '));
                }

                const { data: currentRow } = await client.from('app_settings')
                    .select('value').eq('key', key).maybeSingle();
                const currentValue = (currentRow?.value && typeof currentRow.value === 'object')
                    ? currentRow.value as Record<string, unknown>
                    : {};

                let value: Record<string, unknown>;
                let description: string;
                const maintenance: Record<string, unknown> = {};

                if (key === 'public.whatsnew') {
                    value = { enabled: body.enabled !== false };
                    description = 'Hiển thị khối "Cập nhật gần đây" trên trang chủ';
                } else if (key === 'public.branding') {
                    const name = cleanDisplayName(body.adminDashboardName).slice(0, 40)
                        || 'Administrator Dashboard';
                    value = { ...currentValue, adminDashboardName: name };
                    description = 'Tên hiển thị của Administrator Dashboard. Không đổi đường dẫn /admin/.';
                } else {
                    const iso = (v: unknown) => {
                        const s = str(v, 40);
                        if (!s) return null;
                        const d = new Date(s);
                        return Number.isNaN(d.getTime()) ? null : d.toISOString();
                    };
                    const nowIso = new Date().toISOString();
                    const enabled = body.enabled === true;
                    const wasEnabled = currentValue.enabled === true;
                    const reason = str(body.reason, 400);
                    /* Người thực hiện do máy chủ xác định từ phạm vi phiên, không
                       lấy từ payload. */
                    const actor = scope === 'founder' ? 'Founder' : 'Administrator';
                    /* Mốc bắt đầu lấy từ chu kì trước hoặc từ DB khi bật; không nhận
                       thời gian do client gửi cho trường maintenance_started_at. */
                    const previousStart = (currentValue.maintenance_started_at as string)
                        ?? (currentValue.cycleStartedAt as string) ?? null;
                    const previousBy = (currentValue.maintenance_started_by as string) ?? null;

                    value = {
                        enabled,
                        title: str(body.title, 120) || 'Bá Khí đang bảo trì',
                        message: str(body.message, 1200),
                        reason,
                        startAt: iso(body.startAt),
                        endAt: iso(body.endAt),
                        updatedAt: nowIso,
                        historyId: currentValue.historyId ?? null,
                        cycleStartedAt: currentValue.cycleStartedAt ?? null,
                        /* Trường chuẩn 7.9.2 (snake_case) — nguồn đọc của màn hình
                           bảo trì; các khoá camelCase phía trên giữ để tương thích. */
                        maintenance_enabled: enabled,
                        maintenance_reason: reason,
                        maintenance_started_at: enabled ? (previousStart || nowIso) : previousStart,
                        maintenance_started_by: enabled ? (previousBy || actor) : previousBy,
                        maintenance_updated_at: nowIso
                    };
                    description = 'Bảo trì toàn website: bật/tắt, tiêu đề, nội dung, lý do, thời gian và chu kỳ bảo trì';

                    if (enabled && !wasEnabled) {
                        /* Bắt đầu một chu kỳ mới. Chỉ số duy nhất bảo đảm không
                           có hai chu kỳ active song song. */
                        const { data: inserted, error: insertError } = await client
                            .from('maintenance_history')
                            .insert({
                                started_at: nowIso,
                                started_by: actor,
                                reason,
                                status: 'active',
                                metadata: { title: value.title }
                            })
                            .select('id, started_at, started_by, reason, status')
                            .maybeSingle();
                        let active = inserted;
                        if (insertError) {
                            const { data: existingActive } = await client
                                .from('maintenance_history')
                                .select('id, started_at, started_by, reason, status')
                                .eq('status', 'active')
                                .maybeSingle();
                            active = existingActive ?? null;
                        }
                        if (active) {
                            value.historyId = active.id;
                            value.cycleStartedAt = active.started_at;
                            /* Thời gian bắt đầu lấy từ cột started_at của database. */
                            value.maintenance_started_at = active.started_at;
                            value.maintenance_started_by = active.started_by || actor;
                            maintenance.cycle = active;
                        }
                    } else if (!enabled && wasEnabled) {
                        /* Kết thúc chu kỳ đang active và chỉ tạo đúng một thông
                           báo hoàn tất cho chu kỳ đó. */
                        const { data: active } = await client
                            .from('maintenance_history')
                            .select('id, started_at, reason, status')
                            .eq('status', 'active')
                            .maybeSingle();
                        if (active) {
                            const durationSeconds = Math.max(0, Math.round(
                                (Date.parse(nowIso) - Date.parse(String(active.started_at))) / 1000
                            ));
                            const { data: closed, error: closeError } = await client
                                .from('maintenance_history')
                                .update({
                                    ended_at: nowIso,
                                    ended_by: actor,
                                    status: 'completed',
                                    duration_seconds: durationSeconds
                                })
                                .eq('id', active.id)
                                .eq('status', 'active')
                                .is('completion_announcement_id', null)
                                .select('id, started_at, ended_at, reason, duration_seconds')
                                .maybeSingle();
                            if (closeError) throw closeError;

                            if (closed) {
                                maintenance.completed = true;
                                maintenance.durationSeconds = durationSeconds;
                                const minutes = Math.max(1, Math.round(durationSeconds / 60));
                                const vnTime = new Intl.DateTimeFormat('vi-VN', {
                                    timeZone: 'Asia/Ho_Chi_Minh',
                                    dateStyle: 'short',
                                    timeStyle: 'short'
                                }).format(new Date(nowIso));
                                const cleanReason = String(closed.reason || reason || '').trim();
                                const { data: ann, error: annError } = await client
                                    .from('announcements')
                                    .insert({
                                        title: 'Bá Khí đã hoàn tất bảo trì',
                                        content: `Hệ thống đã hoạt động trở lại lúc ${vnTime} (giờ Việt Nam). `
                                            + `Thời gian bảo trì: ${minutes} phút.`
                                            + (cleanReason ? `\n\nLý do: ${cleanReason}` : ''),
                                        type: 'maintenance',
                                        priority: 'normal',
                                        is_published: true,
                                        published_at: nowIso
                                    })
                                    .select('id')
                                    .maybeSingle();
                                if (!annError && ann) {
                                    await client.from('maintenance_history').update({
                                        completion_announcement_id: ann.id,
                                        notified_at: new Date().toISOString()
                                    }).eq('id', closed.id);
                                    maintenance.notificationCreated = true;
                                } else {
                                    maintenance.notificationCreated = false;
                                    maintenance.notificationError = true;
                                }
                                await logAction(client, 'maintenance.completed', 'maintenance', String(closed.id), {
                                    duration_seconds: durationSeconds,
                                    notification: !!maintenance.notificationCreated
                                });
                            }
                        }
                        value.historyId = null;
                        value.cycleStartedAt = null;
                    }
                }

                const { data, error } = await client.from('app_settings')
                    .upsert({ key, value, description, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                    .select().maybeSingle();
                if (error) throw error;
                await logAction(client, 'settings.set', 'setting', key, { value });
                return json({ ok: true, setting: data, maintenance });
            }

            /* ------------------------------ Giám sát ------------------------------- */
            case 'system.health': {
                const started = Date.now();
                const [
                    stu, stuActive, devices, progress, ann, annPub, reads, cl, logs, sessions, settings
                ] = await Promise.all([
                    client.from('students').select('*', { count: 'exact', head: true }),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
                    client.from('student_devices').select('*', { count: 'exact', head: true }),
                    client.from('student_progress').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }),
                    client.from('announcements').select('*', { count: 'exact', head: true }).eq('is_published', true),
                    client.from('announcement_reads').select('*', { count: 'exact', head: true }),
                    client.from('changelog').select('*', { count: 'exact', head: true }),
                    client.from('admin_activity_logs').select('*', { count: 'exact', head: true }),
                    client.from('admin_sessions').select('*', { count: 'exact', head: true })
                        .gt('expires_at', new Date().toISOString()),
                    client.from('app_settings').select('key, value, updated_at').order('key', { ascending: true })
                ]);
                const latencyMs = Date.now() - started;
                const { data: latestRows } = await client.from('changelog')
                    .select('version, title, published_at, sync_state, synced_at, source')
                    .limit(500);
                const latest = latestByVersion(latestRows);
                const { data: failures } = await client.from('changelog')
                    .select('version, title, sync_error, synced_at, source')
                    .eq('sync_state', 'failed')
                    .order('synced_at', { ascending: false })
                    .limit(10);
                const { data: recentLogs } = await client.from('admin_activity_logs')
                    .select('id, action, target_type, target_id, created_at')
                    .order('created_at', { ascending: false }).limit(8);
                const errors = [stu, stuActive, devices, progress, ann, annPub, reads, cl, logs, sessions, settings]
                    .map((r) => r.error).filter(Boolean);
                return json({
                    ok: true,
                    checkedAt: new Date().toISOString(),
                    latencyMs,
                    dbOk: errors.length === 0,
                    counts: {
                        students: stu.count ?? 0,
                        studentsActive: stuActive.count ?? 0,
                        devices: devices.count ?? 0,
                        progressRows: progress.count ?? 0,
                        announcements: ann.count ?? 0,
                        announcementsPublished: annPub.count ?? 0,
                        reads: reads.count ?? 0,
                        changelog: cl.count ?? 0,
                        activity: logs.count ?? 0,
                        adminSessions: sessions.count ?? 0
                    },
                    latestVersion: latest ?? null,
                    syncFailures: failures ?? [],
                    recentActivity: recentLogs ?? [],
                    settings: settings.data ?? [],
                    secrets: {
                        adminDevCode: !!Deno.env.get('ADMIN_DEV_CODE'),
                        serviceRole: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
                        rosterSecret: !!Deno.env.get('STUDENT_ROSTER_SECRET')
                    }
                });
            }

            /* ------------------------------ Quyền hạn ------------------------------- */
            case 'permissions.get': {
                const [sessionRes, reportRes] = await Promise.all([
                    client.from('admin_sessions')
                        .select('id, created_at, expires_at, last_used_at')
                        .eq('id', auth.sessionId).maybeSingle(),
                    /* Catalog thật (hàm, bảng, policy). Nếu migration chưa chạy,
                       vẫn trả báo cáo năng lực và ghi rõ lỗi thay vì hỏng cả màn hình. */
                    client.rpc('bakhi_permissions_report')
                ]);
                const report = (reportRes.data ?? null) as Record<string, unknown> | null;
                const reportError = reportRes.error ? reportRes.error.message : null;
                return json({
                    ok: true,
                    mode: 'single-admin-code',
                    role: {
                        id: 'administrator',
                        label: 'Administrator',
                        description: 'Một Administrator Code dùng chung; mọi phiên quản trị có cùng quyền.'
                    },
                    session: sessionRes.data ?? null,
                    capabilities: {
                        overview: true,
                        students: true,
                        studentsWrite: true,
                        notifications: true,
                        changelog: true,
                        logs: true,
                        monitoring: true,
                        settings: true,
                        dataExport: true,
                        roles: false
                    },
                    limitations: [
                        'Chưa có mô hình nhiều quản trị viên hoặc phân quyền theo vai trò.',
                        'Không thể cấp/thu quyền riêng cho từng tài khoản khi chưa có danh tính quản trị.'
                    ],
                    functions: (report && report.functions) || [],
                    tables: (report && report.tables) || [],
                    policies: (report && report.policies) || [],
                    report_generated_at: (report && report.generated_at) || null,
                    report_error: reportError
                });
            }

            /* ----------------------- Founder: cấp trọn bộ ------------------------ */
            case 'founder.grantAll': {
                /* Cấp TOÀN BỘ danh mục badge (kể cả Founder/Developer) cho hồ sơ
                   Người sáng lập. Idempotent nhờ request_id + primary key của
                   student_badges, nên chạy lại không nhân đôi bản ghi. */
                const requestId = requestIdOf(body.request_id);
                let targetId = uuidOf(body.id);
                let targetName = '';

                if (targetId) {
                    const { data: target } = await client
                        .from('students').select('id, display_name, is_active, is_founder')
                        .eq('id', targetId).maybeSingle();
                    if (!target) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                    if (!target.is_active) return fail(400, 'INACTIVE', 'Học sinh đã ngừng hoạt động.');
                    if (target.is_founder !== true) {
                        return fail(403, 'FOUNDER_PROFILE_REQUIRED',
                            'Chỉ cấp trọn bộ cho hồ sơ có is_founder = true.');
                    }
                    targetName = target.display_name;
                } else {
                    const { data: founders } = await client
                        .from('students').select('id, display_name, is_founder')
                        .eq('is_founder', true).eq('is_active', true).limit(3);
                    if (!founders || founders.length === 0) {
                        return fail(404, 'FOUNDER_NOT_FOUND',
                            'Không có hồ sơ nào có is_founder = true. Hãy đặt cờ Founder cho đúng tài khoản trước.');
                    }
                    if (founders.length > 1) {
                        return fail(409, 'FOUNDER_AMBIGUOUS',
                            'Có nhiều hồ sơ Founder. Hãy chọn đúng người nhận trong danh sách.');
                    }
                    targetId = String(founders[0].id);
                    targetName = founders[0].display_name;
                }

                const replay = await replayGrant(client, requestId, targetId);
                if (replay) {
                    return json({
                        ...replay,
                        studentName: targetName,
                        target: ALL_BADGE_IDS.length,
                        badgeTotal: ALL_BADGE_IDS.length,
                        catalog: badgeBreakdown()
                    });
                }

                let result: GrantResult;
                try {
                    result = await grantBadgeIds(client, targetId, ALL_BADGE_IDS,
                        'Founder: cấp toàn bộ badge và khung', sessionId);
                } catch (err) {
                    if (err instanceof GrantError) return fail(err.status, err.code, err.message);
                    throw err;
                }

                /* Trang bị khung Founder mặc định chỉ khi hồ sơ chưa chọn khung. */
                let equippedFrame = 'none';
                const { data: profile } = await client
                    .from('student_profiles').select('frame').eq('student_id', targetId).maybeSingle();
                if (!profile) {
                    const { error: profileError } = await client.from('student_profiles')
                        .insert({ student_id: targetId, frame: 'founder' });
                    if (!profileError) equippedFrame = 'founder';
                } else if (!profile.frame || profile.frame === 'none') {
                    const { error: frameError } = await client.from('student_profiles')
                        .update({ frame: 'founder' }).eq('student_id', targetId);
                    if (!frameError) equippedFrame = 'founder';
                } else {
                    equippedFrame = profile.frame;
                }

                const { data: ownedFrames } = await client.rpc('bakhi_owned_frames', { p_student: targetId });
                const { data: roleCheck } = await client.from('student_roles')
                    .select('role_key').eq('student_id', targetId).eq('role_key', 'founder').maybeSingle();
                if (!roleCheck) {
                    /* student_roles có khoá chính student_id (một danh vị mỗi
                       người), nên chỉ thêm khi chưa có và dùng đúng tên cột. */
                    await client.from('student_roles').insert({
                        student_id: targetId,
                        role_key: 'founder',
                        role_label: 'Người sáng lập',
                        updated_by: 'founder-console'
                    });
                }

                const badgeTotal = ALL_BADGE_IDS.length;
                await writeGrantHistory(client, requestId, scope, sessionId, targetId,
                    'badge', result.added, 'Founder: cấp toàn bộ badge và khung');
                await writeGrantBatch(client, {
                    request_id: requestId,
                    actor_scope: scope,
                    actor_id: sessionId,
                    target_student: targetId,
                    item_type: 'badge',
                    requested: badgeTotal,
                    added: result.added.length,
                    already_owned: result.alreadyOwned.length,
                    failed: 0
                });
                await logAction(client, 'founder.grantAll', 'student', targetId, {
                    request_id: requestId,
                    added: result.added.length,
                    badgeTotal
                });

                const report = grantReport({
                    requestedIds: ALL_BADGE_IDS,
                    grantedIds: result.added,
                    alreadyOwnedIds: result.alreadyOwned,
                    failedIds: result.failed ?? []
                });
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    requestId,
                    studentId: targetId,
                    studentName: targetName,
                    target: badgeTotal,
                    badgeTotal,
                    catalog: badgeBreakdown(),
                    ...report,
                    frames: Array.isArray(ownedFrames) ? ownedFrames : [],
                    frameCount: Array.isArray(ownedFrames) ? ownedFrames.length : 0,
                    equippedFrame
                });
            }

            /* --------------------------- Toàn vẹn dữ liệu -------------------------- */
            case 'data.integrity': {
                const [
                    stu, stuActive, stuReview, inactive, inactiveCount, annMissing, clMissing,
                    annVersionOnly, annEntryOnly, syncFailed, sessionsExpired, settings
                ] = await Promise.all([
                    client.from('students').select('*', { count: 'exact', head: true }),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', true),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('needs_review', true),
                    client.from('students').select('id').eq('is_active', false).limit(200),
                    client.from('students').select('*', { count: 'exact', head: true }).eq('is_active', false),
                    client.from('announcements').select('*', { count: 'exact', head: true })
                        .eq('is_published', true).is('published_at', null),
                    client.from('changelog').select('*', { count: 'exact', head: true })
                        .eq('is_published', true).is('published_at', null),
                    client.from('announcements').select('*', { count: 'exact', head: true })
                        .not('changelog_version', 'is', null).is('changelog_entry_id', null),
                    client.from('announcements').select('*', { count: 'exact', head: true })
                        .not('changelog_entry_id', 'is', null).is('changelog_version', null),
                    client.from('changelog').select('version, sync_error, synced_at')
                        .eq('sync_state', 'failed').order('synced_at', { ascending: false }).limit(20),
                    client.from('admin_sessions').select('*', { count: 'exact', head: true })
                        .lt('expires_at', new Date().toISOString()),
                    client.from('app_settings').select('key, value, updated_at').order('key', { ascending: true })
                ]);
                const inactiveIds = (inactive.data ?? []).map((s) => s.id);
                let inactiveProgress = 0;
                if (inactiveIds.length) {
                    const { count } = await client.from('student_progress')
                        .select('*', { count: 'exact', head: true }).in('student_id', inactiveIds);
                    inactiveProgress = count ?? 0;
                }
                const checks = [
                    {
                        id: 'students', label: 'Hồ sơ học sinh',
                        status: (stu.count ?? 0) > 0 ? 'ok' : 'warn',
                        count: stu.count ?? 0,
                        detail: `${stuActive.count ?? 0} đang hoạt động · ${stuReview.count ?? 0} cần phân biệt`
                    },
                    {
                        id: 'announcements_published_at', label: 'Thông báo đã đăng thiếu thời điểm',
                        status: (annMissing.count ?? 0) ? 'error' : 'ok', count: annMissing.count ?? 0,
                        detail: 'Mọi thông báo published phải có published_at.'
                    },
                    {
                        id: 'changelog_published_at', label: 'Changelog đã đăng thiếu thời điểm',
                        status: (clMissing.count ?? 0) ? 'error' : 'ok', count: clMissing.count ?? 0,
                        detail: 'Mọi phiên bản published phải có published_at.'
                    },
                    {
                        id: 'announcement_link_version', label: 'Thông báo có version nhưng thiếu liên kết',
                        status: (annVersionOnly.count ?? 0) ? 'warn' : 'ok', count: annVersionOnly.count ?? 0,
                        detail: 'Liên kết changelog_entry_id nên được đặt cùng changelog_version.'
                    },
                    {
                        id: 'announcement_link_entry', label: 'Thông báo có liên kết nhưng thiếu version',
                        status: (annEntryOnly.count ?? 0) ? 'warn' : 'ok', count: annEntryOnly.count ?? 0,
                        detail: 'Liên kết changelog_version nên được đặt cùng changelog_entry_id.'
                    },
                    {
                        id: 'changelog_sync', label: 'Lỗi đồng bộ changelog từ GitHub',
                        status: (syncFailed.data ?? []).length ? 'error' : 'ok',
                        count: (syncFailed.data ?? []).length,
                        detail: (syncFailed.data ?? []).map((r) => r.version + ': ' + (r.sync_error || 'không rõ')).join(' · ') || 'Không có lỗi.'
                    },
                    {
                        id: 'inactive_progress', label: 'Tiến trình của hồ sơ đã ngưng',
                        status: inactiveProgress ? 'warn' : 'ok', count: inactiveProgress,
                        detail: 'Dữ liệu vẫn được giữ; chỉ nên xem lại khi hồ sơ bị ngưng nhầm.'
                    },
                    {
                        id: 'expired_sessions', label: 'Phiên quản trị đã hết hạn',
                        status: (sessionsExpired.count ?? 0) ? 'warn' : 'ok', count: sessionsExpired.count ?? 0,
                        detail: 'Có thể dọn định kỳ; dashboard không tự xoá dữ liệu.'
                    }
                ];
                return json({
                    ok: true,
                    checkedAt: new Date().toISOString(),
                    totals: {
                        students: stu.count ?? 0,
                        inactiveStudents: inactiveCount.count ?? 0,
                        settings: (settings.data ?? []).length
                    },
                    settings: settings.data ?? [],
                    checks,
                    issues: checks.filter((c) => c.status !== 'ok').length
                });
            }

            /* ------------------- Founder: trao một vật phẩm (badge/frame) -------- */
            case 'founder.grantItem': {
                return await grantSingleItem(client, {
                    sessionId,
                    scope,
                    studentId: str(body.id, 40),
                    itemType: str(body.item_type, 20) === 'frame' ? 'frame' : 'badge',
                    itemId: str(body.item_id, 64),
                    reason: cleanDisplayName(body.reason).slice(0, 200),
                    requestId: requestIdOf(body.request_id)
                });
            }

            /* ------------------- Founder: trao khung avatar (alias) -------------- */
            case 'avatar.grant': {
                /* Alias tương thích: trao khung = trao badge sở hữu khung. */
                return await grantSingleItem(client, {
                    sessionId,
                    scope,
                    studentId: str(body.student_id, 40) || str(body.id, 40),
                    itemType: 'frame',
                    itemId: str(body.frame_id, 64) || str(body.item_id, 64),
                    reason: cleanDisplayName(body.reason).slice(0, 200),
                    requestId: requestIdOf(body.request_id)
                });
            }

            /* ------------------- Xem lịch sử cấp vật phẩm ------------------------ */
            case 'admin.grantHistory': {
                const limit = Math.min(100, Math.max(1, Number(body.limit) || 50));
                const offset = Math.max(0, Number(body.offset) || 0);
                /* Đọc thẳng các cột rồi tra tên người nhận ở câu thứ hai.
                   Bản 7.5.0 nhúng `students:target_student(...)` nên chỉ cần FK
                   hoặc policy khác đi là PostgREST trả PGRST200 và cả bảng lịch
                   sử hỏng. Nếu cơ sở dữ liệu chưa chạy migration 7.5.0 thì
                   request_id/badge_id chưa có, đọc lại theo cột của 7.4.0. */
                const modernCols = 'id, request_id, actor_scope, target_student, item_type, item_id, badge_id, item_name, reason, created_at';
                const legacyCols = 'id, actor_scope, target_student, item_type, item_id, item_name, reason, created_at';
                let query = await client.from('admin_grant_history')
                    .select(modernCols)
                    .order('created_at', { ascending: false })
                    .range(offset, offset + limit - 1);
                if (query.error && isSchemaGap(query.error)) {
                    query = await client.from('admin_grant_history')
                        .select(legacyCols)
                        .order('created_at', { ascending: false })
                        .range(offset, offset + limit - 1);
                }
                if (query.error) throw query.error;
                const rows = (query.data ?? []) as Array<Record<string, unknown>>;
                const targetIds = Array.from(new Set(rows
                    .map((r) => String(r.target_student || ''))
                    .filter((id) => UUID_RE.test(id))));
                const people = new Map<string, { name: string; disambiguator: string }>();
                if (targetIds.length) {
                    const { data: students } = await client.from('students')
                        .select('id, display_name, disambiguator')
                        .in('id', targetIds);
                    for (const s of students ?? []) {
                        people.set(String(s.id), {
                            name: String(s.display_name || ''),
                            disambiguator: String(s.disambiguator || '')
                        });
                    }
                }
                const history = rows.map((row) => {
                    const target = String(row.target_student || '');
                    const person = people.get(target);
                    return {
                        id: row.id,
                        requestId: row.request_id || '',
                        actorScope: row.actor_scope,
                        targetStudent: row.target_student,
                        studentName: person ? person.name : '',
                        disambiguator: person ? person.disambiguator : '',
                        itemType: row.item_type,
                        itemId: row.item_id,
                        badgeId: row.badge_id || '',
                        itemName: row.item_name || row.item_id || '',
                        reason: row.reason || '',
                        createdAt: row.created_at
                    };
                });
                return json({ ok: true, offset, limit, history });
            }

            /* ------------------- Danh sách vật phẩm có thể trao ------------------ */
            case 'admin.items.list': {
                const type = str(body.type, 20) === 'frame' ? 'frame' : 'badge';
                const targetId = str(body.id, 40);

                let owned: Set<string> | null = null;
                if (targetId) {
                    const { data: rows, error } = await client
                        .from('student_badges').select('badge_id').eq('student_id', targetId);
                    if (error) throw error;
                    owned = new Set<string>((rows ?? []).map((r) => String(r.badge_id)));
                }

                if (type === 'badge') {
                    const items = BADGE_CATALOG.map((b) => ({
                        id: b.id,
                        type: 'badge',
                        name: b.name,
                        category: b.category,
                        rarity: b.rarity,
                        frame: b.frame,
                        exclusive: !!b.exclusive,
                        founderOnly: b.exclusive === 'founder',
                        devOnly: b.exclusive === 'dev',
                        adminOnly: b.admin_only,
                        grantable: true,
                        owned: owned ? owned.has(b.id) : null
                    }));
                    return json({ ok: true, type, total: items.length, items });
                }

                /* Khung avatar: dựng từ ánh xạ badge -> khung của danh mục. */
                const frames = new Map<string, { id: string; badgeId: string; founderOnly: boolean; devOnly: boolean }>();
                for (const b of BADGE_CATALOG) {
                    if (!b.frame || frames.has(b.frame)) continue;
                    frames.set(b.frame, {
                        id: b.frame,
                        badgeId: b.id,
                        founderOnly: b.exclusive === 'founder',
                        devOnly: b.exclusive === 'dev'
                    });
                }
                const items = [
                    { id: 'none', badgeId: '', founderOnly: false, devOnly: false },
                    ...Array.from(frames.values())
                ].map((f) => ({
                    id: f.id,
                    type: 'frame',
                    badgeId: f.badgeId,
                    founderOnly: f.founderOnly,
                    devOnly: f.devOnly,
                    exclusive: f.founderOnly || f.devOnly,
                    grantable: !!f.badgeId,
                    /* 'none' và 'leaf' luôn sở hữu (khớp bakhi_owned_frames). */
                    owned: owned
                        ? (f.id === 'none' || f.id === 'leaf' ? true : !!f.badgeId && owned.has(f.badgeId))
                        : null
                }));
                return json({ ok: true, type, total: items.length, items });
            }

            /* ------------------------------ Danh hiệu (7.6.0) ------------------------------ */
            case 'titles.list': {
                const targetId = uuidOf(body.id);
                const [{ data: catalog, error: catalogError }, { data: links }] = await Promise.all([
                    client.from('bakhi_titles')
                        .select('id, name, short, color, icon, description, sort_order, founder_only, active, badge_id, style, font, palette, effect')
                        .order('sort_order', { ascending: true })
                        .order('name', { ascending: true }),
                    client.from('student_titles').select('student_id, title_id')
                ]);
                if (catalogError) throw catalogError;
                const counts = new Map<string, number>();
                for (const row of links ?? []) {
                    const key = String(row.title_id);
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
                let eligible: string[] | null = null;
                if (targetId) {
                    const { data: rows } = await client.rpc('bakhi_title_eligible', { p_student: targetId });
                    eligible = (rows ?? []).map((r) => String((r as { title_id?: string }).title_id || r));
                }
                const titles = (catalog ?? []).map((t) =>
                    titleRow(t as Record<string, unknown>, counts.get(String(t.id)) || 0));
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    total: titles.length,
                    activeTotal: titles.filter((t) => t.active).length,
                    defaultTotal: DEFAULT_TITLES.length,
                    specialTotal: titles.filter((t) => t.style === 'special' && t.active).length,
                    plainTotal: titles.filter((t) => t.style === 'plain' && t.active).length,
                    eligible,
                    titles
                });
            }

            case 'titles.holders': {
                const titleId = str(body.title_id, 40);
                if (!TITLE_ID_RE.test(titleId)) {
                    return fail(400, 'BAD_TITLE_ID', 'Mã danh hiệu không hợp lệ.');
                }
                const { data: links, error } = await client
                    .from('student_titles')
                    .select('student_id, assigned_by, assigned_at')
                    .eq('title_id', titleId)
                    .order('assigned_at', { ascending: false })
                    .limit(200);
                if (error) throw error;
                const ids = (links ?? []).map((r) => String(r.student_id));
                const people = new Map<string, { name: string; code: string }>();
                if (ids.length) {
                    const { data: students } = await client
                        .from('students').select('id, display_name, student_code').in('id', ids);
                    for (const s of students ?? []) {
                        people.set(String(s.id), {
                            name: String(s.display_name || ''),
                            code: String(s.student_code || '')
                        });
                    }
                }
                return json({
                    ok: true,
                    holders: (links ?? []).map((r) => {
                        const info = people.get(String(r.student_id));
                        return {
                            studentId: String(r.student_id),
                            name: info ? info.name : '',
                            code: info ? info.code : '',
                            assignedBy: String(r.assigned_by || ''),
                            assignedAt: r.assigned_at || null
                        };
                    })
                });
            }

            case 'titles.save': {
                const rawId = str(body.title_id, 40).toLowerCase();
                const id = rawId || ('title-' + Math.random().toString(36).slice(2, 10));
                if (!TITLE_ID_RE.test(id)) {
                    return fail(400, 'BAD_TITLE_ID', 'Mã danh hiệu chỉ gồm a-z, 0-9 và dấu gạch nối (2–40 ký tự).');
                }
                const name = str(body.name, 60).trim();
                if (!name) return fail(400, 'BAD_TITLE_NAME', 'Thiếu tên danh hiệu.');
                const short = str(body.short, 24).trim().toUpperCase();
                const color = str(body.color, 24).trim();
                if (color && !/^#[0-9a-fA-F]{3,8}$/.test(color)) {
                    return fail(400, 'BAD_TITLE_COLOR', 'Màu danh hiệu phải ở dạng #rgb hoặc #rrggbb.');
                }
                const style = str(body.style, 12) === 'special' ? 'special' : 'plain';
                const font = str(body.font, 16).toLowerCase();
                if (!['', 'sans', 'serif', 'display', 'mono', 'elegant', 'rounded'].includes(font)) {
                    return fail(400, 'BAD_TITLE_FONT', 'Font không hợp lệ: sans, serif, display, mono, elegant, rounded.');
                }
                const effect = str(body.effect, 12).toLowerCase() || 'none';
                if (!['none', 'flow', 'shimmer', 'pulse', 'aurora'].includes(effect)) {
                    return fail(400, 'BAD_TITLE_EFFECT', 'Hiệu ứng không hợp lệ: none, flow, shimmer, pulse, aurora.');
                }
                const rawPalette = Array.isArray(body.palette)
                    ? (body.palette as unknown[]).map((c) => String(c)).join(',')
                    : str(body.palette, 96);
                const palette = rawPalette.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 4).join(',');
                if (palette && !palette.split(',').every((c) => /^#[0-9a-fA-F]{3,8}$/.test(c))) {
                    return fail(400, 'BAD_TITLE_PALETTE', 'Bảng màu phải là các mã #rgb/#rrggbb, cách nhau bởi dấu phẩy (tối đa 4 màu).');
                }
                const badgeId = str(body.badge_id, 64).trim();
                if (badgeId && !BADGE_BY_ID.has(badgeId)) {
                    return fail(400, 'BAD_BADGE_ID', 'Badge nguồn không tồn tại trong danh mục.');
                }
                if (badgeId) {
                    const { data: clash } = await client
                        .from('bakhi_titles').select('id').eq('badge_id', badgeId).neq('id', id).maybeSingle();
                    if (clash) {
                        return fail(409, 'BADGE_ALREADY_MAPPED',
                            'Badge này đã ánh xạ tới danh hiệu “' + String(clash.id) + '”. Mỗi badge chỉ có một danh hiệu.');
                    }
                }
                const rawOrder = Number(body.sort_order);
                const sortOrder = Number.isFinite(rawOrder)
                    ? Math.max(0, Math.min(9999, Math.round(rawOrder)))
                    : 100;
                const row = {
                    id,
                    name,
                    short,
                    color,
                    icon: str(body.icon, 40).trim(),
                    description: str(body.description, 240).trim(),
                    sort_order: sortOrder,
                    founder_only: body.founder_only === true,
                    active: body.active !== false,
                    badge_id: badgeId || null,
                    style,
                    font,
                    palette,
                    effect,
                    updated_by: sessionId
                };
                const { error } = await client.from('bakhi_titles').upsert(row, { onConflict: 'id' });
                if (error) throw error;
                await logAction(client, 'titles.save', 'title', id, {
                    name, short, style, font, effect, badge_id: row.badge_id, active: row.active
                });
                const { data: saved } = await client.from('bakhi_titles')
                    .select('id, name, short, color, icon, description, sort_order, founder_only, active, badge_id, style, font, palette, effect')
                    .eq('id', id).maybeSingle();
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    created: !rawId,
                    id,
                    title: titleRow((saved || row) as Record<string, unknown>),
                    message: 'Đã lưu danh hiệu “' + name + '”.'
                });
            }

            case 'titles.seed': {
                /* Bổ sung danh hiệu mặc định còn thiếu từ danh mục badge. Chỉ
                   THÊM, không sửa tên/màu Founder đã chỉnh, không xoá gì. */
                const { data: existing, error: existError } = await client
                    .from('bakhi_titles').select('id');
                if (existError) throw existError;
                const have = new Set<string>((existing ?? []).map((r) => String(r.id)));
                const missing = DEFAULT_TITLES.filter((t) => !have.has(t.id));
                if (missing.length) {
                    const rows = missing.map((t) => ({
                        id: t.id, name: t.name, short: t.short, color: t.color, icon: t.icon,
                        description: t.description, sort_order: t.sortOrder,
                        founder_only: t.founderOnly, active: true, badge_id: t.badgeId,
                        style: t.style, font: t.font, palette: t.palette, effect: t.effect,
                        created_by: sessionId, updated_by: sessionId
                    }));
                    const { error } = await client.from('bakhi_titles')
                        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
                    if (error) throw error;
                }
                await logAction(client, 'titles.seed', 'title', null, {
                    missing: missing.length, total: DEFAULT_TITLES.length
                });
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    added: missing.length,
                    total: DEFAULT_TITLES.length,
                    message: missing.length
                        ? 'Đã bổ sung ' + missing.length + ' danh hiệu mặc định còn thiếu.'
                        : 'Danh mục đã đủ ' + DEFAULT_TITLES.length + ' danh hiệu mặc định.'
                });
            }

            case 'titles.grant': {
                const id = str(body.id, 40);
                const titleId = str(body.title_id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                if (!TITLE_ID_RE.test(titleId)) {
                    return fail(400, 'BAD_TITLE_ID', 'Mã danh hiệu không hợp lệ.');
                }
                const [{ data: student }, { data: title }] = await Promise.all([
                    client.from('students').select('id, display_name, is_founder').eq('id', id).maybeSingle(),
                    client.from('bakhi_titles')
                        .select('id, name, founder_only, active, badge_id, style, font, palette, effect, color, short, icon')
                        .eq('id', titleId).maybeSingle()
                ]);
                if (!student) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                if (!title) return fail(404, 'TITLE_NOT_FOUND', 'Không tìm thấy danh hiệu.');
                if (title.active === false) {
                    return fail(409, 'TITLE_INACTIVE', 'Danh hiệu này đã ngừng dùng.');
                }
                /* 7.9.0: chỉ danh hiệu tối cao “Nhà Sáng Lập” (id founder) giữ
                   giới hạn hồ sơ Founder; các danh hiệu Founder khác do Founder
                   trao tay, kèm điều kiện sở hữu badge nguồn bên dưới. */
                if (titleId === FOUNDER_BADGE_ID && student.is_founder !== true) {
                    return fail(403, 'FOUNDER_ONLY', 'Danh hiệu Nhà Sáng Lập chỉ dành cho hồ sơ Founder.');
                }
                /* Danh hiệu ánh xạ badge: phải sở hữu badge nguồn. Danh hiệu tự
                   tạo: ghi bản ghi trao tay để học sinh được phép trang bị. */
                if (title.badge_id) {
                    const { data: owned } = await client.from('student_badges')
                        .select('badge_id').eq('student_id', id).eq('badge_id', String(title.badge_id))
                        .maybeSingle();
                    if (!owned) {
                        return fail(409, 'BADGE_REQUIRED',
                            'Học sinh chưa sở hữu badge “' + String(title.badge_id) + '” nên chưa dùng được danh hiệu này. Hãy trao badge trước.');
                    }
                } else {
                    const { error: grantError } = await client.from('bakhi_title_grants').upsert({
                        student_id: id,
                        title_id: titleId,
                        granted_by: sessionId,
                        granted_at: new Date().toISOString()
                    }, { onConflict: 'student_id,title_id', ignoreDuplicates: true });
                    if (grantError) {
                        if (isSchemaGap(grantError)) {
                            return fail(500, 'MIGRATION_REQUIRED',
                                'Chưa áp dụng migration 7.7.0 (bảng bakhi_title_grants). Hãy chạy migration trước khi trao danh hiệu tự tạo.');
                        }
                        throw grantError;
                    }
                }
                const { data: previous } = await client.from('student_titles')
                    .select('title_id').eq('student_id', id).maybeSingle();
                const { error } = await client.from('student_titles').upsert({
                    student_id: id,
                    title_id: titleId,
                    assigned_by: sessionId,
                    assigned_at: new Date().toISOString()
                }, { onConflict: 'student_id' });
                if (error) throw error;
                await logAction(client, 'titles.grant', 'student', id, {
                    title_id: titleId, title_name: String(title.name || ''),
                    previous: previous ? String(previous.title_id) : ''
                });
                return json({
                    ok: true,
                    status: previous && String(previous.title_id) === titleId ? 'already_owned' : 'granted',
                    studentName: student.display_name,
                    titleId,
                    titleName: String(title.name || ''),
                    previousTitleId: previous ? String(previous.title_id) : '',
                    title: titleRow(title as Record<string, unknown>)
                });
            }

            case 'titles.revoke': {
                const id = str(body.id, 40);
                if (!id) return fail(400, 'MISSING_ID', 'Thiếu id học sinh.');
                const { data: existing } = await client
                    .from('student_titles').select('title_id').eq('student_id', id).maybeSingle();
                const { error } = await client.from('student_titles').delete().eq('student_id', id);
                if (error) throw error;
                /* Danh hiệu tự tạo đã thu hồi thì cũng bỏ quyền sử dụng. */
                const titleId = str(body.title_id, 40);
                if (titleId) {
                    await client.from('bakhi_title_grants')
                        .delete().eq('student_id', id).eq('title_id', titleId);
                }
                await logAction(client, 'titles.revoke', 'student', id, {
                    title_id: existing ? String(existing.title_id) : '',
                    removed_grant: titleId || ''
                });
                return json({
                    ok: true,
                    removed: !!existing,
                    previousTitleId: existing ? String(existing.title_id) : '',
                    message: existing ? 'Đã gỡ danh hiệu.' : 'Học sinh chưa có danh hiệu nào.'
                });
            }

            case 'titles.delete': {
                const titleId = str(body.title_id, 40);
                if (!TITLE_ID_RE.test(titleId)) {
                    return fail(400, 'BAD_TITLE_ID', 'Mã danh hiệu không hợp lệ.');
                }
                /* Ngừng dùng thay vì xoá: học sinh đang giữ danh hiệu vẫn giữ
                   nguyên tên hiển thị, chỉ không trao mới được nữa. */
                const { error } = await client
                    .from('bakhi_titles').update({ active: false }).eq('id', titleId);
                if (error) throw error;
                await logAction(client, 'titles.delete', 'title', titleId, {});
                return json({ ok: true, id: titleId, active: false });
            }

            /* ---------------------------- Report Issue -----------------------------
               Administrator và Founder dùng chung. Quyền được kiểm tra ở đây,
               không dựa vào tab nào đang mở trên trình duyệt. */
            case 'reports.stats': {
                /* Đếm bằng head/count thay vì tải hàng nghìn dòng: PostgREST giới
                   hạn số dòng trả về nên cách cũ có thể đếm thiếu khi dữ liệu lớn. */
                const base = () => client.from('reports').select('*', { count: 'exact', head: true });
                const [total, nw, pend, prog, wait, res, clo, unread, attention] = await Promise.all([
                    base(),
                    base().eq('status', 'new'),
                    base().eq('status', 'pending'),
                    base().eq('status', 'in_progress'),
                    base().eq('status', 'waiting_student'),
                    base().eq('status', 'resolved'),
                    base().eq('status', 'closed'),
                    base().gt('staff_unread', 0),
                    base().in('status', ['new', 'pending', 'in_progress', 'waiting_student'])
                        .in('priority', ['high', 'critical'])
                ]);
                if (total.error) return fail(500, 'DB_ERROR', 'Không đọc được thống kê báo cáo.');
                const stats = {
                    total: total.count ?? 0,
                    new: nw.count ?? 0,
                    pending: pend.count ?? 0,
                    in_progress: prog.count ?? 0,
                    waiting_student: wait.count ?? 0,
                    resolved: res.count ?? 0,
                    closed: clo.count ?? 0,
                    unread: unread.count ?? 0,
                    attention: attention.count ?? 0
                };
                return json({ ok: true, stats, serverVersion: SERVER_VERSION });
            }

            case 'reports.list': {
                const page = Math.max(1, Number(body.page) || 1);
                const pageSize = Math.min(Math.max(Number(body.page_size) || 20, 5), 50);
                const from = (page - 1) * pageSize;
                const q = str(body.q, 80).replace(/[%,()]/g, ' ').trim();
                let query = client
                    .from('reports')
                    .select('*', { count: 'exact' })
                    .order('updated_at', { ascending: false })
                    .range(from, from + pageSize - 1);
                if (body.status && String(body.status) === 'active') {
                    query = query.in('status', REPORT_ACTIVE_STATUSES);
                } else if (body.status && String(body.status) !== 'all') {
                    query = query.eq('status', str(body.status, 20));
                }
                if (body.category && String(body.category) !== 'all') {
                    query = query.eq('category', str(body.category, 20));
                }
                if (body.priority && String(body.priority) !== 'all') {
                    query = query.eq('priority', str(body.priority, 20));
                }
                if (body.unread) query = query.gt('staff_unread', 0);
                if (body.from) query = query.gte('created_at', str(body.from, 40));
                if (body.to) query = query.lte('created_at', str(body.to, 40));
                if (q) query = query.or('title.ilike.%' + q + '%,code.ilike.%' + q + '%,description.ilike.%' + q + '%');
                const { data, count, error } = await query;
                if (error) return fail(500, 'DB_ERROR', 'Không tải được danh sách báo cáo.');
                const names = await reportStudentNames(client,
                    (data ?? []).map((r) => String(r.student_id)));
                /* Xem trước phản hồi gần nhất để danh sách có ngữ cảnh mà không
                   phải mở từng báo cáo. Một truy vấn cho cả trang. */
                const ids = (data ?? []).map((r) => String(r.id));
                const preview = new Map<string, string>();
                if (ids.length) {
                    const { data: msgs } = await client.from('report_messages')
                        .select('report_id, body, created_at')
                        .in('report_id', ids)
                        .order('created_at', { ascending: false })
                        .limit(200);
                    for (const m of msgs ?? []) {
                        const key = String(m.report_id);
                        if (!preview.has(key)) {
                            preview.set(key, String(m.body || '').replace(/\s+/g, ' ').slice(0, 120));
                        }
                    }
                }
                return json({
                    ok: true,
                    total: count || 0,
                    page,
                    pageSize,
                    reports: (data ?? []).map((row) => ({
                        id: row.id, code: row.code, title: row.title, category: row.category,
                        issue_type: row.issue_type, priority: row.priority, status: row.status,
                        student_id: row.student_id,
                        student_name: names.get(String(row.student_id)) || 'Học sinh',
                        created_at: row.created_at, updated_at: row.updated_at,
                        last_message_at: row.last_message_at,
                        last_message_by: row.last_message_by,
                        last_message_preview: preview.get(String(row.id)) || '',
                        staff_unread: Number(row.staff_unread || 0),
                        student_unread: Number(row.student_unread || 0),
                        assigned_to: row.assigned_to || ''
                    }))
                });
            }

            case 'reports.export': {
                const q = str(body.q, 80).replace(/[%,()]/g, ' ').trim();
                let query = client
                    .from('reports')
                    .select('code, title, description, category, priority, status, assigned_to, student_id, created_at, updated_at, resolution_note')
                    .order('updated_at', { ascending: false })
                    .limit(5000);
                if (body.status && String(body.status) === 'active') {
                    query = query.in('status', REPORT_ACTIVE_STATUSES);
                } else if (body.status && String(body.status) !== 'all') {
                    query = query.eq('status', str(body.status, 20));
                }
                if (body.category && String(body.category) !== 'all') {
                    query = query.eq('category', str(body.category, 20));
                }
                if (body.priority && String(body.priority) !== 'all') {
                    query = query.eq('priority', str(body.priority, 20));
                }
                if (body.unread) query = query.gt('staff_unread', 0);
                if (body.from) query = query.gte('created_at', str(body.from, 40));
                if (body.to) query = query.lte('created_at', str(body.to, 40));
                if (q) query = query.or('title.ilike.%' + q + '%,code.ilike.%' + q + '%,description.ilike.%' + q + '%');
                const { data, error } = await query;
                if (error) return fail(500, 'DB_ERROR', 'Không xuất được danh sách báo cáo.');
                const rows = data ?? [];
                const names = await reportStudentNames(client, rows.map((r) => String(r.student_id)));
                const lines: string[][] = [[
                    'Mã', 'Tiêu đề', 'Học sinh', 'Nhóm', 'Ưu tiên', 'Trạng thái',
                    'Người xử lý', 'Ngày gửi', 'Cập nhật cuối', 'Kết quả xử lý'
                ]];
                for (const row of rows) {
                    lines.push([
                        String(row.code || ''),
                        String(row.title || ''),
                        names.get(String(row.student_id)) || 'Học sinh',
                        String(row.category || ''),
                        String(row.priority || ''),
                        String(row.status || ''),
                        String(row.assigned_to || ''),
                        String(row.created_at || ''),
                        String(row.updated_at || ''),
                        String(row.resolution_note || '')
                    ]);
                }
                const csv = lines.map((line) => line.map(reportCsvCell).join(',')).join('\r\n');
                await logAction(client, 'reports.export', 'report', null, { rows: rows.length });
                return json({
                    ok: true,
                    rows: rows.length,
                    filename: 'bakhi-reports-' + new Date().toISOString().slice(0, 10) + '.csv',
                    csv
                });
            }

            case 'reports.detail': {
                const id = str(body.report_id, 40);
                if (!id) return fail(400, 'BAD_REPORT', 'Thiếu mã báo cáo.');
                const { data: row } = await client.from('reports').select('*').eq('id', id).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                const [{ data: messages }, { data: activity }, { data: student }] = await Promise.all([
                    client.from('report_messages').select('*')
                        .eq('report_id', id).order('created_at', { ascending: true }).limit(200),
                    client.from('report_activity_logs').select('*')
                        .eq('report_id', id).order('created_at', { ascending: false }).limit(50),
                    client.from('students').select('id, display_name, student_code')
                        .eq('id', row.student_id).maybeSingle()
                ]);
                /* Mở báo cáo = đã đọc phía quản trị. */
                if (Number(row.staff_unread || 0) > 0) {
                    await client.from('reports').update({ staff_unread: 0 }).eq('id', id);
                    await client.from('report_messages')
                        .update({ read_by_staff_at: new Date().toISOString() })
                        .eq('report_id', id)
                        .eq('sender_kind', 'student')
                        .is('read_by_staff_at', null);
                }
                return json({
                    ok: true,
                    report: {
                        id: row.id, code: row.code, title: row.title, description: row.description,
                        category: row.category, issue_type: row.issue_type, priority: row.priority,
                        status: row.status, page_url: row.page_url || '',
                        page_title: row.page_title || '', route: row.route || '',
                        subject: row.subject || '', context_data: row.context_data || {},
                        assigned_to: row.assigned_to || '', resolved_by: row.resolved_by || '',
                        resolution_note: row.resolution_note || '',
                        created_at: row.created_at, updated_at: row.updated_at,
                        resolved_at: row.resolved_at || null, closed_at: row.closed_at || null,
                        staff_unread: 0, student_unread: Number(row.student_unread || 0)
                    },
                    student: student || null,
                    attachments: await signedReportFiles(client, row.attachment_paths),
                    messages: await Promise.all((messages ?? []).map(async (m) => ({
                        id: m.id, sender_kind: m.sender_kind, sender_label: m.sender_label,
                        body: m.body, is_private: !!m.is_private, created_at: m.created_at,
                        read_by_student_at: m.read_by_student_at || null,
                        attachment_urls: await signedReportFiles(client, m.attachments)
                    }))),
                    activity: activity ?? []
                });
            }

            case 'reports.reply':
            case 'reports.privateMessage': {
                const id = str(body.report_id, 40);
                const text = String(body.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
                if (!id) return fail(400, 'BAD_REPORT', 'Thiếu mã báo cáo.');
                if (!text) return fail(400, 'EMPTY', 'Nội dung trả lời đang trống.');
                const { data: row } = await client.from('reports').select('*').eq('id', id).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                if (row.status === 'closed') {
                    return fail(409, 'REPORT_CLOSED', 'Báo cáo đã đóng. Hãy mở lại trước khi trả lời.');
                }
                const isPrivate = action === 'reports.privateMessage';
                const label = scope === 'founder' ? 'Founder' : 'Administrator';
                const { data: msg, error } = await client.from('report_messages').insert({
                    report_id: id,
                    sender_kind: 'staff',
                    sender_label: label,
                    body: text,
                    is_private: isPrivate
                }).select('*').maybeSingle();
                if (error || !msg) return fail(500, 'SEND_FAILED', 'Không gửi được phản hồi.');

                const nextStatus = ['new', 'pending'].includes(String(row.status))
                    ? 'in_progress' : String(row.status);
                await client.from('reports').update({
                    status: nextStatus,
                    last_message_at: new Date().toISOString(),
                    last_message_by: 'staff',
                    student_unread: Number(row.student_unread || 0) + 1,
                    staff_unread: 0,
                    assigned_to: row.assigned_to || scope
                }).eq('id', id);
                await logReportActivity(client, id, scope, label,
                    isPrivate ? 'message.private' : 'message.staff',
                    String(row.status), nextStatus, { length: text.length });
                await notifyReportStudent(client, row,
                    isPrivate ? 'notice' : 'reply',
                    (isPrivate ? 'Tin nhắn riêng về báo cáo ' : 'Phản hồi báo cáo ') + String(row.code),
                    text);
                await logAction(client, isPrivate ? 'reports.privateMessage' : 'reports.reply',
                    'report', id, { code: row.code });
                return json({ ok: true, status: nextStatus, message: {
                    id: msg.id, sender_kind: 'staff', sender_label: label, body: msg.body,
                    is_private: isPrivate, created_at: msg.created_at, attachment_urls: []
                } });
            }

            case 'reports.status': {
                const id = str(body.report_id, 40);
                const next = str(body.status, 20);
                if (!id || !REPORT_STATUSES.includes(next)) {
                    return fail(400, 'BAD_STATUS', 'Trạng thái không hợp lệ.');
                }
                const { data: row } = await client.from('reports').select('*').eq('id', id).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                const current = String(row.status);
                const allowed = REPORT_TRANSITIONS[current] || [];
                if (current !== next && !allowed.includes(next)) {
                    return fail(409, 'BAD_TRANSITION',
                        'Không thể chuyển từ ' + current + ' sang ' + next + '.');
                }
                const patch: Record<string, unknown> = { status: next };
                if (next === 'resolved') patch.resolved_at = new Date().toISOString();
                if (next === 'closed') patch.closed_at = new Date().toISOString();
                if (next === 'in_progress' || next === 'pending') {
                    patch.resolved_at = null;
                    patch.closed_at = null;
                }
                await client.from('reports').update(patch).eq('id', id);
                await logReportActivity(client, id, scope, scope === 'founder' ? 'Founder' : 'Administrator',
                    'status.changed', current, next, { note: str(body.note, 300) });
                await notifyReportStudent(client, row, 'status',
                    'Cập nhật báo cáo ' + String(row.code),
                    'Trạng thái mới: ' + next + (body.note ? ' — ' + str(body.note, 300) : ''));
                await logAction(client, 'reports.status', 'report', id, { from: current, to: next });
                return json({ ok: true, status: next });
            }

            case 'reports.complete': {
                const id = str(body.report_id, 40);
                const note = String(body.resolution_note ?? '').trim().slice(0, 2000);
                if (!id) return fail(400, 'BAD_REPORT', 'Thiếu mã báo cáo.');
                if (note.length < 3) {
                    return fail(400, 'BAD_NOTE', 'Hãy nhập ghi chú kết quả xử lý (ít nhất 3 ký tự).');
                }
                const { data: row } = await client.from('reports').select('*').eq('id', id).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                if (row.status === 'resolved') return fail(409, 'ALREADY_RESOLVED', 'Báo cáo đã hoàn thiện.');
                if (row.status === 'closed') return fail(409, 'REPORT_CLOSED', 'Báo cáo đã đóng.');
                const nowIso = new Date().toISOString();
                const label = scope === 'founder' ? 'Founder' : 'Administrator';
                await client.from('reports').update({
                    status: 'resolved',
                    resolved_by: label,
                    resolution_note: note,
                    resolved_at: nowIso,
                    last_message_at: nowIso,
                    last_message_by: 'staff',
                    staff_unread: 0
                }).eq('id', id);
                await client.from('report_messages').insert({
                    report_id: id,
                    sender_kind: 'staff',
                    sender_label: label,
                    body: 'Đã hoàn thiện báo cáo: ' + note,
                    is_private: false
                });
                await logReportActivity(client, id, scope, label, 'report.completed',
                    String(row.status), 'resolved', { note });
                await notifyReportStudent(client, row, 'resolved',
                    'Báo cáo ' + String(row.code) + ' đã được hoàn thiện', note);
                await logAction(client, 'reports.complete', 'report', id, { code: row.code });
                return json({ ok: true, status: 'resolved', resolved_at: nowIso, resolved_by: label });
            }

            case 'reports.reopen': {
                const id = str(body.report_id, 40);
                const reason = String(body.reason ?? '').trim().slice(0, 500);
                if (!id) return fail(400, 'BAD_REPORT', 'Thiếu mã báo cáo.');
                if (reason.length < 3) return fail(400, 'BAD_REASON', 'Hãy nhập lý do mở lại báo cáo.');
                const { data: row } = await client.from('reports').select('*').eq('id', id).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                if (!['resolved', 'closed'].includes(String(row.status))) {
                    return fail(409, 'NOT_CLOSED', 'Chỉ mở lại báo cáo đã hoàn thiện hoặc đã đóng.');
                }
                const label = scope === 'founder' ? 'Founder' : 'Administrator';
                await client.from('reports').update({
                    status: 'in_progress', resolved_at: null, closed_at: null,
                    resolution_note: null
                }).eq('id', id);
                await logReportActivity(client, id, scope, label, 'report.reopened',
                    String(row.status), 'in_progress', { reason });
                await notifyReportStudent(client, row, 'status',
                    'Báo cáo ' + String(row.code) + ' đã được mở lại', reason);
                await logAction(client, 'reports.reopen', 'report', id, { reason });
                return json({ ok: true, status: 'in_progress' });
            }

            case 'reports.assign': {
                const id = str(body.report_id, 40);
                const to = str(body.assigned_to, 20);
                if (!id) return fail(400, 'BAD_REPORT', 'Thiếu mã báo cáo.');
                if (to && !['admin', 'founder'].includes(to)) {
                    return fail(400, 'BAD_ASSIGNEE', 'Người xử lý không hợp lệ.');
                }
                const { data: row } = await client.from('reports').select('id, code, assigned_to')
                    .eq('id', id).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                await client.from('reports').update({ assigned_to: to || null }).eq('id', id);
                await logReportActivity(client, id, scope,
                    scope === 'founder' ? 'Founder' : 'Administrator',
                    'report.assigned', String(row.assigned_to || ''), to || '');
                await logAction(client, 'reports.assign', 'report', id, { to });
                return json({ ok: true, assigned_to: to || '' });
            }

            /* 8.5.6 — xoá báo cáo ĐÃ HOÀN THÀNH.
               · Trạng thái được kiểm tra ở MÁY CHỦ trên dữ liệu thật (không tin
                 nhãn hiển thị ở client).
               · report_messages / report_activity_logs / report_notifications có
                 FK ON DELETE CASCADE nên dữ liệu liên quan được dọn trong cùng
                 câu lệnh; không đụng tới báo cáo khác.
               · Nhật ký quản trị được ghi TRƯỚC khi xoá để vẫn có dấu vết. */
            case 'reports.delete': {
                const id = str(body.report_id, 40);
                if (!id) return fail(400, 'BAD_REPORT', 'Thiếu mã báo cáo.');
                const { data: row } = await client.from('reports')
                    .select('id, code, title, status, student_id').eq('id', id).maybeSingle();
                if (!row) return fail(404, 'NOT_FOUND', 'Không tìm thấy báo cáo.');
                if (!REPORT_DELETABLE_STATUSES.includes(String(row.status))) {
                    return fail(409, 'NOT_COMPLETED',
                        'Chỉ xoá được báo cáo đã hoàn thành (đã giải quyết hoặc đã đóng).');
                }
                await logAction(client, 'reports.delete', 'report', id, {
                    code: row.code, status: row.status, title: str(row.title, 80)
                });
                const { error } = await client.from('reports').delete().eq('id', id);
                if (error) throw error;
                return json({ ok: true, deleted: 1, code: row.code });
            }

            /* ---------------- Máy chủ đang chạy bản nào (chẩn đoán) -------------- */
            case 'version': {
                const { count } = await client
                    .from('bakhi_titles').select('*', { count: 'exact', head: true });
                return json({
                    ok: true,
                    serverVersion: SERVER_VERSION,
                    scope,
                    titles: {
                        available: count !== null,
                        total: count ?? 0,
                        actions: ['titles.list', 'titles.holders', 'titles.save', 'titles.seed',
                            'titles.grant', 'titles.revoke', 'titles.delete']
                    },
                    catalog: badgeBreakdown(),
                    defaultTitles: DEFAULT_TITLES.length
                });
            }

            default:
                return fail(400, 'UNKNOWN_ACTION', 'Hành động không hợp lệ: ' + action);
        }
    } catch (e) {
        /* PostgrestError là object thuần nên String(e) chỉ ra "[object Object]".
           Lấy message/code/details để chẩn đoán được lỗi thật. */
        let message: string;
        if (e instanceof Error) message = e.message;
        else if (e && typeof e === 'object') {
            const err = e as { message?: string; code?: string; details?: string; hint?: string };
            message = [err.message || 'lỗi không rõ', err.code, err.details, err.hint]
                .filter(Boolean).join(' · ');
        } else message = String(e);
        console.error('admin-actions ' + action + ' failed:', message);
        return fail(500, 'SERVER_ERROR', 'Lỗi máy chủ: ' + message);
    }
});
