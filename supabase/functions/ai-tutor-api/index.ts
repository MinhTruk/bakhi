// ===========================================================================
// ai-tutor-api — Bá Khí AI Tutor (8.5.0)
//
// Kiến trúc:  GitHub Pages → Supabase Auth → Edge Function (hàm này) → AI Provider
//
// Mọi thao tác ghi đi qua đây bằng service_role sau khi xác minh:
//   * thiết bị đã gắn với học sinh đang hoạt động (Anonymous Auth), hoặc
//   * phiên quản trị hợp lệ (x-admin-token) cho các action `admin.*`.
//
// Không bao giờ tin `student_id` do client gửi lên.
// Không bao giờ trả API key về phía client.
// ===========================================================================
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId, requireAdmin, logAction } from '../_shared/supabase.ts';
import {
    callProvider, ProviderError, isProviderId,
    MODEL_SUGGESTIONS, type ProviderId, type ChatTurn
} from '../_shared/ai-providers.ts';
import {
    TUTOR_MODES, MODE_IDS, isMode, DEFAULT_SYSTEM_PROMPT,
    sanitizeContext, buildSystemPrompt, pickModel, trimHistory, type TutorMode
} from '../_shared/ai-prompts.ts';

const MAX_USER_MESSAGE = 4000;
const MAX_TITLE = 100;
const LIST_LIMIT = 40;
const MESSAGE_PAGE = 60;
const BURST_LIMIT = 10;          // request / 60 giây / học sinh
const CONCURRENT_TTL_MS = 120000;
const DEDUPE_WINDOW_MS = 12000;

/* Đang xử lý theo học sinh — chặn gửi chồng lặp trong cùng một isolate. */
const inFlight = new Map<string, number>();

interface Ctx {
    client: ReturnType<typeof adminClient>;
    studentId: string;
    authUserId: string;
}

const MODE_LABEL: Record<string, string> = Object.create(null);
TUTOR_MODES.forEach((m) => { MODE_LABEL[m.id] = m.label; });

function str(v: unknown, max: number): string {
    return String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function uuid(v: unknown): string {
    const s = str(v, 40);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : '';
}

function cleanMessage(raw: unknown): string {
    return String(raw ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .trim()
        .slice(0, MAX_USER_MESSAGE);
}

/** Thông báo tiếng Việt theo mã lỗi — không bao giờ lộ chi tiết kỹ thuật. */
function messageFor(code: string): string {
    switch (code) {
        case 'NO_KEY': return 'Trợ lý AI chưa được cấu hình khoá API. Ban quản trị cần thêm khoá trong Supabase Secrets.';
        case 'AUTH': return 'Khoá API của trợ lý AI không hợp lệ hoặc đã bị thu hồi.';
        case 'MODEL_NOT_FOUND': return 'Mô hình AI đang cấu hình không còn khả dụng. Ban quản trị cần chọn mô hình khác.';
        case 'RATE_LIMIT': return 'Trợ lý AI đang nhận quá nhiều yêu cầu. Bạn thử lại sau ít phút nhé.';
        case 'QUOTA': return 'Trợ lý AI đã hết hạn mức sử dụng của nhà cung cấp. Bạn thử lại sau nhé.';
        case 'TIMEOUT': return 'Trợ lý AI phản hồi quá lâu. Bạn thử lại giúp mình nhé.';
        case 'PROVIDER_DOWN': return 'Dịch vụ AI tạm thời không phản hồi. Bạn vẫn học bình thường được ở các trang bài học.';
        case 'EMPTY_RESPONSE': return 'Trợ lý AI không trả về nội dung. Bạn thử diễn đạt lại câu hỏi nhé.';
        case 'BAD_CONFIG': return 'Cấu hình trợ lý AI chưa đúng. Ban quản trị kiểm tra lại nhà cung cấp và mô hình.';
        case 'AI_DISABLED': return 'Trợ lý AI đang tạm tắt. Bạn vẫn học bình thường được ở các trang bài học.';
        default: return 'Trợ lý AI đang gặp sự cố. Bạn thử lại giúp mình nhé.';
    }
}

function publicConfig(options: {
    settings: Record<string, unknown>;
    usage: { requests: number; tokens: number; failed: number };
    connected: boolean;
    fallbackConnected: boolean;
}) {
    const s = options.settings;
    const allowed = Array.isArray(s.allowed_modes) ? s.allowed_modes.map(String) : MODE_IDS;
    return {
        enabled: !!s.enabled,
        connected: options.connected,
        fallbackConnected: options.fallbackConnected,
        mock: (Deno.env.get('AI_TUTOR_MOCK') ?? '') === '1',
        provider: String(s.provider || ''),
        model: String(s.model || ''),
        fallbackProvider: String(s.fallback_provider || ''),
        fallbackModel: String(s.fallback_model || ''),
        routing: !!s.routing_enabled,
        models: {
            simple: String(s.model_simple || ''),
            complex: String(s.model_complex || ''),
            practice: String(s.model_practice || '')
        },
        language: String(s.language || 'vi'),
        saveHistory: !!s.save_history,
        useLessonContext: !!s.use_lesson_context,
        modes: TUTOR_MODES.filter((m) => allowed.indexOf(m.id) !== -1),
        contextWindow: Number(s.max_context_messages) || 12,
        limits: {
            dailyRequests: Number(s.daily_requests) || 0,
            dailyTokens: Number(s.daily_tokens) || 0,
            maxOutputTokens: Number(s.max_output_tokens) || 1600
        },
        usage: options.usage
    };
}

function keysPresent() {
    const primary = (Deno.env.get('AI_TUTOR_API_KEY') ?? '').trim();
    const fallback = (Deno.env.get('AI_TUTOR_FALLBACK_API_KEY') ?? '').trim();
    return { primary: !!primary, fallback: !!fallback };
}

async function loadSettings(client: Ctx['client']): Promise<Record<string, unknown>> {
    const { data } = await client.from('ai_settings').select('*').eq('id', 1).maybeSingle();
    if (data) return data as Record<string, unknown>;
    /* Dòng cấu hình mất thì dùng giá trị an toàn, không ném lỗi cho học sinh. */
    return {
        enabled: true, provider: 'google', model: 'gemini-2.5-flash',
        fallback_provider: '', fallback_model: '', routing_enabled: true,
        model_simple: '', model_complex: '', model_practice: '',
        max_context_messages: 12, max_output_tokens: 1600, timeout_ms: 45000,
        daily_requests: 120, daily_tokens: 120000, save_history: true,
        use_lesson_context: true, language: 'vi', allowed_modes: MODE_IDS,
        system_prompt: DEFAULT_SYSTEM_PROMPT, system_prompt_version: 1
    };
}

async function usageToday(client: Ctx['client'], studentId: string) {
    const { data } = await client.rpc('bakhi_ai_usage', { p_student: studentId });
    const row = (data || {}) as Record<string, unknown>;
    return {
        requests: Number(row.requests ?? 0) || 0,
        tokens: Number(row.tokens ?? 0) || 0,
        failed: Number(row.failed ?? 0) || 0
    };
}

async function limited(ctx: Ctx, key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const { data, error } = await ctx.client.rpc('bakhi_rate_limit', {
        p_key: key, p_limit: limit, p_window_seconds: windowSeconds
    });
    if (error) return true; // cơ chế giới hạn lỗi thì không chặn học sinh
    return !!data;
}

async function logUsage(
    client: Ctx['client'],
    row: {
        studentId: string | null; action: string; provider?: string; model?: string;
        mode?: string; tokensIn?: number; tokensOut?: number; latencyMs?: number;
        ok: boolean; errorCode?: string;
    }
) {
    await client.from('ai_usage_logs').insert({
        student_id: row.studentId,
        action: row.action,
        provider: str(row.provider, 40),
        model: str(row.model, 80),
        mode: str(row.mode, 20),
        tokens_in: Math.max(0, Math.round(row.tokensIn || 0)),
        tokens_out: Math.max(0, Math.round(row.tokensOut || 0)),
        latency_ms: Math.max(0, Math.round(row.latencyMs || 0)),
        ok: !!row.ok,
        error_code: str(row.errorCode, 40)
    });
}

function conversationRow(row: Record<string, unknown>) {
    return {
        id: row.id,
        title: row.title,
        mode: row.mode,
        subject: row.subject || '',
        topic: row.topic || '',
        provider: row.last_provider || '',
        model: row.last_model || '',
        message_count: Number(row.message_count) || 0,
        is_archived: !!row.is_archived,
        last_message_at: row.last_message_at,
        created_at: row.created_at
    };
}

function messageRow(row: Record<string, unknown>) {
    return {
        id: row.id,
        role: row.role,
        content: row.content,
        mode: row.mode || 'explain',
        provider: row.provider || '',
        model: row.model || '',
        context_ref: row.context_ref || {},
        error_code: row.error_code || '',
        created_at: row.created_at
    };
}

/** Tạo tiêu đề từ câu hỏi đầu tiên — không tốn thêm lượt gọi AI. */
function autoTitle(text: string, mode: TutorMode): string {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    if (!flat) return 'Hội thoại ' + (MODE_LABEL[mode] || 'Học tập');
    return flat.length > 64 ? flat.slice(0, 61).trim() + '…' : flat;
}

async function ownedConversation(ctx: Ctx, id: string) {
    if (!id) return null;
    const { data } = await ctx.client
        .from('ai_conversations')
        .select('*')
        .eq('id', id)
        .eq('student_id', ctx.studentId)
        .is('deleted_at', null)
        .maybeSingle();
    return data || null;
}

/** Gọi provider đã cấu hình, tự chuyển sang provider dự phòng khi đáng thử. */
async function runProvider(options: {
    settings: Record<string, unknown>;
    system: string;
    turns: ChatTurn[];
    model: string;
}) {
    const s = options.settings;
    const provider = (isProviderId(s.provider) ? s.provider : 'google') as ProviderId;
    const timeoutMs = Number(s.timeout_ms) || 45000;
    const maxTokens = Number(s.max_output_tokens) || 1600;
    const started = Date.now();
    let lastError: ProviderError;

    try {
        const result = await callProvider({
            provider, model: options.model, role: 'primary',
            system: options.system, messages: options.turns,
            maxTokens, timeoutMs
        });
        return { result, latencyMs: Date.now() - started, fellBack: false };
    } catch (err) {
        lastError = err instanceof ProviderError ? err : new ProviderError('UNKNOWN', 'Lỗi không xác định.', 0, provider);
        if (!lastError.retryable) throw lastError;
    }

    const fallbackProvider = String(s.fallback_provider || '');
    const fallbackModel = String(s.fallback_model || '');
    const fallbackKey = (Deno.env.get('AI_TUTOR_FALLBACK_API_KEY') ?? '').trim();
    if (!fallbackProvider || !fallbackModel || !fallbackKey || !isProviderId(fallbackProvider)) {
        throw lastError;
    }
    try {
        const result = await callProvider({
            provider: fallbackProvider as ProviderId, model: fallbackModel, role: 'fallback',
            system: options.system, messages: options.turns,
            maxTokens, timeoutMs
        });
        return { result, latencyMs: Date.now() - started, fellBack: true };
    } catch (err) {
        const second = err instanceof ProviderError ? err : lastError;
        throw second;
    }
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const client = adminClient();
    const body = await readJson<Record<string, unknown>>(req);
    const action = str(body.action, 60) || 'bootstrap';

    /* ------------------------------------------------------------------
       Nhánh quản trị — Founder/Administrator (x-admin-token)
       ------------------------------------------------------------------ */
    if (action.startsWith('admin.')) {
        const admin = await requireAdmin(req, client);
        if ('error' in admin) return admin.error as Response;

        /* Phiên quản trị mang scope (admin | founder). Chỉ Founder được đổi cấu
           hình, system prompt và chạy kiểm tra kết nối (tốn lượt gọi AI). */
        const { data: sessionRow } = await client
            .from('admin_sessions')
            .select('scope')
            .eq('id', admin.sessionId)
            .maybeSingle();
        const isFounder = String(sessionRow?.scope || '') === 'founder';
        const FOUNDER_ONLY = ['admin.settings.save', 'admin.prompt.save', 'admin.prompt.restore', 'admin.test'];
        if (!isFounder && FOUNDER_ONLY.indexOf(action) !== -1) {
            return fail(403, 'FOUNDER_ONLY',
                'Chỉ Founder được thay đổi cấu hình Trợ lý AI. Bạn vẫn xem được trạng thái.');
        }

        try {
            switch (action) {
                case 'admin.status': {
                    const settings = await loadSettings(client);
                    const keys = keysPresent();
                    const since = new Date(Date.now() - 86400000).toISOString();
                    const [{ count: requests }, { count: failures }, usageAll] = await Promise.all([
                        client.from('ai_usage_logs').select('id', { count: 'exact', head: true }).gte('created_at', since),
                        client.from('ai_usage_logs').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('ok', false),
                        client.from('ai_usage_logs').select('student_id, tokens_in, tokens_out').gte('created_at', since).limit(20000)
                    ]);
                    const students = new Set<string>();
                    let tokens = 0;
                    for (const row of usageAll?.data ?? []) {
                        if (row.student_id) students.add(String(row.student_id));
                        tokens += (Number(row.tokens_in) || 0) + (Number(row.tokens_out) || 0);
                    }
                    const { count: conversations } = await client
                        .from('ai_conversations').select('id', { count: 'exact', head: true }).is('deleted_at', null);
                    const { count: messages } = await client
                        .from('ai_messages').select('id', { count: 'exact', head: true });
                    return json({
                        ok: true,
                        data: {
                            isFounder,
                            settings: {
                                enabled: !!settings.enabled,
                                provider: settings.provider,
                                model: settings.model,
                                fallbackProvider: settings.fallback_provider || '',
                                fallbackModel: settings.fallback_model || '',
                                routing: !!settings.routing_enabled,
                                modelSimple: settings.model_simple || '',
                                modelComplex: settings.model_complex || '',
                                modelPractice: settings.model_practice || '',
                                maxContextMessages: settings.max_context_messages,
                                maxOutputTokens: settings.max_output_tokens,
                                timeoutMs: settings.timeout_ms,
                                dailyRequests: settings.daily_requests,
                                dailyTokens: settings.daily_tokens,
                                saveHistory: !!settings.save_history,
                                useLessonContext: !!settings.use_lesson_context,
                                language: settings.language,
                                allowedModes: settings.allowed_modes,
                                systemPrompt: settings.system_prompt || DEFAULT_SYSTEM_PROMPT,
                                systemPromptVersion: settings.system_prompt_version
                            },
                            connection: {
                                primaryKey: keys.primary,
                                fallbackKey: keys.fallback,
                                mock: (Deno.env.get('AI_TUTOR_MOCK') ?? '') === '1'
                            },
                            usage: {
                                window: '24h',
                                requests: Number(requests ?? 0) || 0,
                                failures: Number(failures ?? 0) || 0,
                                students: students.size,
                                tokens
                            },
                            totals: {
                                conversations: Number(conversations ?? 0) || 0,
                                messages: Number(messages ?? 0) || 0
                            },
                            modelSuggestions: MODEL_SUGGESTIONS,
                            modes: TUTOR_MODES
                        }
                    });
                }

                case 'admin.settings.save': {
                    const patch: Record<string, unknown> = {};
                    const s = body.settings && typeof body.settings === 'object'
                        ? body.settings as Record<string, unknown> : body;
                    const clampInt = (v: unknown, min: number, max: number, def: number) => {
                        const n = Math.round(Number(v));
                        if (!Number.isFinite(n)) return def;
                        return Math.min(max, Math.max(min, n));
                    };
                    if (s.enabled != null) patch.enabled = !!s.enabled;
                    if (s.provider != null) {
                        if (!isProviderId(s.provider)) return fail(400, 'BAD_PROVIDER', 'Nhà cung cấp AI không hợp lệ.');
                        patch.provider = String(s.provider);
                    }
                    if (s.model != null) {
                        const model = str(s.model, 80);
                        if (!/^[A-Za-z0-9._:\/-]{1,80}$/.test(model)) {
                            return fail(400, 'BAD_MODEL', 'Tên mô hình không hợp lệ.');
                        }
                        patch.model = model;
                    }
                    if (s.fallbackProvider != null) {
                        const fp = str(s.fallbackProvider, 40);
                        if (fp && !isProviderId(fp)) return fail(400, 'BAD_PROVIDER', 'Nhà cung cấp dự phòng không hợp lệ.');
                        patch.fallback_provider = fp;
                    }
                    if (s.fallbackModel != null) patch.fallback_model = str(s.fallbackModel, 80);
                    if (s.routing != null) patch.routing_enabled = !!s.routing;
                    if (s.modelSimple != null) patch.model_simple = str(s.modelSimple, 80);
                    if (s.modelComplex != null) patch.model_complex = str(s.modelComplex, 80);
                    if (s.modelPractice != null) patch.model_practice = str(s.modelPractice, 80);
                    if (s.maxContextMessages != null) patch.max_context_messages = clampInt(s.maxContextMessages, 2, 40, 12);
                    if (s.maxOutputTokens != null) patch.max_output_tokens = clampInt(s.maxOutputTokens, 128, 8192, 1600);
                    if (s.timeoutMs != null) patch.timeout_ms = clampInt(s.timeoutMs, 5000, 120000, 45000);
                    if (s.dailyRequests != null) patch.daily_requests = clampInt(s.dailyRequests, 0, 5000, 120);
                    if (s.dailyTokens != null) patch.daily_tokens = clampInt(s.dailyTokens, 0, 5000000, 120000);
                    if (s.saveHistory != null) patch.save_history = !!s.saveHistory;
                    if (s.useLessonContext != null) patch.use_lesson_context = !!s.useLessonContext;
                    if (s.language != null) patch.language = s.language === 'en' ? 'en' : 'vi';
                    if (Array.isArray(s.allowedModes)) {
                        const modes = (s.allowedModes as unknown[])
                            .map(String)
                            .filter((m) => MODE_IDS.indexOf(m as TutorMode) !== -1);
                        patch.allowed_modes = modes.length ? modes : MODE_IDS;
                    }
                    if (!Object.keys(patch).length) {
                        return fail(400, 'NOTHING_TO_SAVE', 'Không có thay đổi nào để lưu.');
                    }
                    const { error } = await client.from('ai_settings').update(patch).eq('id', 1);
                    if (error) return fail(500, 'DB_ERROR', 'Không lưu được cấu hình AI Tutor.');
                    await logAction(client, 'ai_tutor.settings.save', 'ai_settings', '1', { fields: Object.keys(patch) });
                    return json({ ok: true, data: { saved: Object.keys(patch) } });
                }

                case 'admin.prompt.save': {
                    const content = String(body.content ?? '').trim();
                    if (content.length < 40) return fail(400, 'PROMPT_TOO_SHORT', 'Hướng dẫn quá ngắn (tối thiểu 40 ký tự).');
                    if (content.length > 12000) return fail(400, 'PROMPT_TOO_LONG', 'Hướng dẫn quá dài (tối đa 12.000 ký tự).');
                    const settings = await loadSettings(client);
                    const nextVersion = (Number(settings.system_prompt_version) || 1) + 1;
                    const { error: insErr } = await client.from('ai_prompt_versions').insert({
                        version: nextVersion,
                        content,
                        note: str(body.note, 200) || 'Cập nhật từ Founder Dashboard',
                        saved_by: 'founder'
                    });
                    if (insErr) return fail(500, 'DB_ERROR', 'Không lưu được phiên bản hướng dẫn.');
                    const { error } = await client.from('ai_settings').update({
                        system_prompt: content,
                        system_prompt_version: nextVersion
                    }).eq('id', 1);
                    if (error) return fail(500, 'DB_ERROR', 'Không áp dụng được hướng dẫn mới.');
                    await logAction(client, 'ai_tutor.prompt.save', 'ai_settings', '1', { version: nextVersion });
                    return json({ ok: true, data: { version: nextVersion } });
                }

                case 'admin.prompt.versions': {
                    const { data } = await client
                        .from('ai_prompt_versions')
                        .select('id, version, note, saved_by, created_at, content')
                        .order('version', { ascending: false })
                        .limit(20);
                    return json({
                        ok: true,
                        data: {
                            versions: (data ?? []).map((r) => ({
                                id: r.id, version: r.version, note: r.note,
                                savedBy: r.saved_by, createdAt: r.created_at,
                                preview: String(r.content || '').slice(0, 400)
                            }))
                        }
                    });
                }

                case 'admin.prompt.restore': {
                    const version = Math.round(Number(body.version));
                    if (!Number.isFinite(version)) return fail(400, 'BAD_VERSION', 'Phiên bản không hợp lệ.');
                    const { data: row } = await client
                        .from('ai_prompt_versions').select('version, content').eq('version', version).maybeSingle();
                    if (!row) return fail(404, 'VERSION_NOT_FOUND', 'Không tìm thấy phiên bản này.');
                    const settings = await loadSettings(client);
                    const nextVersion = (Number(settings.system_prompt_version) || 1) + 1;
                    await client.from('ai_prompt_versions').insert({
                        version: nextVersion, content: row.content,
                        note: 'Khôi phục từ phiên bản ' + version, saved_by: 'founder'
                    });
                    const { error } = await client.from('ai_settings').update({
                        system_prompt: row.content, system_prompt_version: nextVersion
                    }).eq('id', 1);
                    if (error) return fail(500, 'DB_ERROR', 'Không khôi phục được hướng dẫn.');
                    await logAction(client, 'ai_tutor.prompt.restore', 'ai_settings', '1', { from: version, to: nextVersion });
                    return json({ ok: true, data: { version: nextVersion, content: row.content } });
                }

                /* Kiểm tra kết nối: một lượt gọi rất nhỏ, không lưu hội thoại. */
                case 'admin.test': {
                    const settings = await loadSettings(client);
                    const started = Date.now();
                    try {
                        const out = await runProvider({
                            settings,
                            system: 'Bạn là trợ lý kiểm tra kết nối. Trả lời đúng một từ: OK',
                            turns: [{ role: 'user', content: 'Kiểm tra kết nối.' }],
                            model: String(settings.model_simple || settings.model || '')
                        });
                        await logUsage(client, {
                            studentId: null, action: 'admin.test',
                            provider: out.result.provider, model: out.result.model,
                            tokensIn: out.result.usage.input, tokensOut: out.result.usage.output,
                            latencyMs: out.latencyMs, ok: true
                        });
                        return json({
                            ok: true,
                            data: {
                                connected: true,
                                provider: out.result.provider,
                                model: out.result.model,
                                latencyMs: out.latencyMs,
                                reply: out.result.text.slice(0, 120),
                                mock: out.result.mock,
                                fellBack: out.fellBack
                            }
                        });
                    } catch (err) {
                        const e = err instanceof ProviderError
                            ? err : new ProviderError('UNKNOWN', 'Lỗi không xác định.');
                        await logUsage(client, {
                            studentId: null, action: 'admin.test', provider: e.provider,
                            ok: false, errorCode: e.code, latencyMs: Date.now() - started
                        });
                        return fail(502, e.code, messageFor(e.code), { connected: false });
                    }
                }

                default:
                    return fail(400, 'UNKNOWN_ACTION', 'Hành động không hợp lệ.');
            }
        } catch (err) {
            if (err instanceof ProviderError) return fail(502, err.code, messageFor(err.code));
            return fail(500, 'SERVER_ERROR', 'Máy chủ không xử lý được yêu cầu.');
        }
    }

    /* ------------------------------------------------------------------
       Nhánh học sinh — cần thiết bị đã gắn học sinh đang hoạt động
       ------------------------------------------------------------------ */
    const caller = await callerUserId(req);
    if (caller instanceof Response) return caller;

    const { data: device } = await client
        .from('student_devices')
        .select('student_id')
        .eq('auth_user_id', caller.userId)
        .maybeSingle();
    if (!device) {
        return fail(409, 'NOT_BOUND',
            'Thiết bị chưa được gắn với học sinh nào. Hãy chọn họ tên ở trang chủ rồi mở lại Trợ lý AI.');
    }

    const { data: student } = await client
        .from('students')
        .select('id, display_name, is_active')
        .eq('id', device.student_id)
        .maybeSingle();
    if (!student || !student.is_active) {
        return fail(403, 'INACTIVE', 'Hồ sơ học sinh không còn hoạt động.');
    }

    const ctx: Ctx = { client, studentId: String(student.id), authUserId: caller.userId };
    await client.from('student_devices')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('auth_user_id', ctx.authUserId);

    try {
        switch (action) {
            case 'bootstrap': {
                const settings = await loadSettings(client);
                const keys = keysPresent();
                const [usage, list] = await Promise.all([
                    usageToday(client, ctx.studentId),
                    client.from('ai_conversations')
                        .select('*')
                        .eq('student_id', ctx.studentId)
                        .is('deleted_at', null)
                        .order('last_message_at', { ascending: false })
                        .limit(LIST_LIMIT)
                ]);
                return json({
                    ok: true,
                    data: {
                        config: publicConfig({
                            settings, usage,
                            connected: keys.primary,
                            fallbackConnected: keys.fallback
                        }),
                        conversations: (list.data ?? []).map(conversationRow)
                    }
                });
            }

            case 'conversations.list': {
                const q = str(body.q, 80).toLowerCase();
                let query = client.from('ai_conversations')
                    .select('*')
                    .eq('student_id', ctx.studentId)
                    .is('deleted_at', null)
                    .order('last_message_at', { ascending: false })
                    .limit(LIST_LIMIT);
                if (q) query = query.ilike('title', '%' + q.replace(/[%_]/g, '') + '%');
                const { data } = await query;
                return json({ ok: true, data: { conversations: (data ?? []).map(conversationRow) } });
            }

            case 'conversation.create': {
                const mode: TutorMode = isMode(body.mode) ? body.mode : 'explain';
                const settings = await loadSettings(client);
                const allowed = Array.isArray(settings.allowed_modes) ? settings.allowed_modes.map(String) : MODE_IDS;
                if (allowed.indexOf(mode) === -1) {
                    return fail(400, 'MODE_DISABLED', 'Chế độ học tập này đang tắt.');
                }
                const { count } = await client.from('ai_conversations')
                    .select('id', { count: 'exact', head: true })
                    .eq('student_id', ctx.studentId)
                    .is('deleted_at', null);
                if ((Number(count) || 0) >= 200) {
                    return fail(429, 'TOO_MANY_CONVERSATIONS',
                        'Bạn đã có nhiều hội thoại. Hãy xoá bớt hội thoại cũ trước khi tạo mới.');
                }
                const ctxSafe = sanitizeContext(body.context);
                const { data, error } = await client.from('ai_conversations').insert({
                    student_id: ctx.studentId,
                    title: str(body.title, MAX_TITLE) || 'Hội thoại mới',
                    mode,
                    subject: ctxSafe.subject || '',
                    topic: ctxSafe.topic || ''
                }).select('*').single();
                if (error || !data) return fail(500, 'DB_ERROR', 'Không tạo được hội thoại mới.');
                return json({ ok: true, data: { conversation: conversationRow(data) } });
            }

            case 'conversation.rename': {
                const id = uuid(body.conversation_id);
                const title = str(body.title, MAX_TITLE);
                if (!id) return fail(400, 'BAD_ID', 'Hội thoại không hợp lệ.');
                if (!title) return fail(400, 'BAD_TITLE', 'Tên hội thoại không được để trống.');
                const conv = await ownedConversation(ctx, id);
                if (!conv) return fail(404, 'NOT_FOUND', 'Không tìm thấy hội thoại.');
                const { error } = await client.from('ai_conversations')
                    .update({ title }).eq('id', id).eq('student_id', ctx.studentId);
                if (error) return fail(500, 'DB_ERROR', 'Không đổi được tên hội thoại.');
                return json({ ok: true, data: { conversation_id: id, title } });
            }

            /* Xoá mềm: dữ liệu vẫn còn trong bảng để Founder có thể kiểm tra,
               nhưng học sinh không thấy và không mở lại được. */
            case 'conversation.delete': {
                const id = uuid(body.conversation_id);
                if (!id) return fail(400, 'BAD_ID', 'Hội thoại không hợp lệ.');
                const conv = await ownedConversation(ctx, id);
                if (!conv) return fail(404, 'NOT_FOUND', 'Không tìm thấy hội thoại.');
                const { error } = await client.from('ai_conversations')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', id).eq('student_id', ctx.studentId);
                if (error) return fail(500, 'DB_ERROR', 'Không xoá được hội thoại.');
                return json({ ok: true, data: { deleted: id } });
            }

            case 'messages.list': {
                const id = uuid(body.conversation_id);
                if (!id) return fail(400, 'BAD_ID', 'Hội thoại không hợp lệ.');
                const conv = await ownedConversation(ctx, id);
                if (!conv) return fail(404, 'NOT_FOUND', 'Không tìm thấy hội thoại.');
                const { data } = await client.from('ai_messages')
                    .select('*')
                    .eq('conversation_id', id)
                    .eq('student_id', ctx.studentId)
                    .order('created_at', { ascending: true })
                    .limit(MESSAGE_PAGE);
                return json({
                    ok: true,
                    data: {
                        conversation: conversationRow(conv),
                        messages: (data ?? []).map(messageRow)
                    }
                });
            }

            case 'usage': {
                const [usage, settings] = await Promise.all([
                    usageToday(client, ctx.studentId),
                    loadSettings(client)
                ]);
                return json({
                    ok: true,
                    data: {
                        usage,
                        limits: {
                            dailyRequests: Number(settings.daily_requests) || 0,
                            dailyTokens: Number(settings.daily_tokens) || 0
                        }
                    }
                });
            }

            /* ------------------------------ Chat ------------------------------ */
            case 'chat': {
                const settings = await loadSettings(client);
                if (!settings.enabled) {
                    return fail(503, 'AI_DISABLED', messageFor('AI_DISABLED'));
                }

                const mode: TutorMode = isMode(body.mode)
                    ? body.mode
                    : (isMode(body.conversation_mode) ? (body.conversation_mode as TutorMode) : 'explain');
                const allowed = Array.isArray(settings.allowed_modes) ? settings.allowed_modes.map(String) : MODE_IDS;
                if (allowed.indexOf(mode) === -1) {
                    return fail(400, 'MODE_DISABLED', 'Chế độ học tập này đang tắt.');
                }

                const message = cleanMessage(body.message);
                if (!message) return fail(400, 'EMPTY_MESSAGE', 'Bạn chưa nhập câu hỏi.');
                if (String(body.message ?? '').length > MAX_USER_MESSAGE) {
                    return fail(400, 'MESSAGE_TOO_LONG', 'Câu hỏi quá dài (tối đa ' + MAX_USER_MESSAGE + ' ký tự).');
                }

                /* Chặn gửi chồng lặp trong cùng isolate. */
                const now = Date.now();
                const busyUntil = inFlight.get(ctx.studentId) || 0;
                if (busyUntil > now) {
                    return fail(429, 'BUSY', 'Trợ lý AI đang trả lời câu trước. Bạn chờ một chút nhé.');
                }
                inFlight.set(ctx.studentId, now + CONCURRENT_TTL_MS);

                try {
                    /* Giới hạn tần suất + hạn mức ngày (kiểm soát chi phí). */
                    if (!(await limited(ctx, 'ai:burst:' + ctx.studentId, BURST_LIMIT, 60))) {
                        return fail(429, 'RATE_LIMIT', 'Bạn đang gửi quá nhanh. Chờ khoảng một phút rồi thử lại nhé.');
                    }
                    const dailyRequests = Number(settings.daily_requests) || 0;
                    const dailyTokens = Number(settings.daily_tokens) || 0;
                    const usage = await usageToday(client, ctx.studentId);
                    if (dailyRequests > 0 && usage.requests >= dailyRequests) {
                        return fail(429, 'DAILY_LIMIT',
                            'Bạn đã dùng hết ' + dailyRequests + ' câu hỏi AI hôm nay. Hạn mức sẽ được tính lại sau 24 giờ.');
                    }
                    if (dailyTokens > 0 && usage.tokens >= dailyTokens) {
                        return fail(429, 'DAILY_TOKEN_LIMIT',
                            'Bạn đã chạm hạn mức dung lượng AI hôm nay. Hạn mức sẽ được tính lại sau 24 giờ.');
                    }

                    /* Hội thoại: dùng lại nếu có, tạo mới nếu chưa. */
                    let conversation = await ownedConversation(ctx, uuid(body.conversation_id));
                    const contextSafe = sanitizeContext(body.context);
                    if (!conversation) {
                        const { data, error } = await client.from('ai_conversations').insert({
                            student_id: ctx.studentId,
                            title: autoTitle(message, mode),
                            mode,
                            subject: contextSafe.subject || '',
                            topic: contextSafe.topic || ''
                        }).select('*').single();
                        if (error || !data) return fail(500, 'DB_ERROR', 'Không tạo được hội thoại.');
                        conversation = data;
                    }

                    /* Chống gửi trùng: cùng nội dung trong 12 giây. */
                    const { data: lastUser } = await client.from('ai_messages')
                        .select('id, content, created_at')
                        .eq('conversation_id', conversation.id)
                        .eq('role', 'user')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (lastUser && String(lastUser.content) === message &&
                        now - Date.parse(lastUser.created_at) < DEDUPE_WINDOW_MS) {
                        return fail(409, 'DUPLICATE', 'Câu hỏi này vừa được gửi. Bạn chờ câu trả lời nhé.');
                    }

                    /* Lịch sử trong cửa sổ ngữ cảnh (không gửi toàn bộ). */
                    const { data: history } = await client.from('ai_messages')
                        .select('role, content, created_at')
                        .eq('conversation_id', conversation.id)
                        .in('role', ['user', 'assistant'])
                        .order('created_at', { ascending: false })
                        .limit(Math.max(2, Number(settings.max_context_messages) || 12) * 2);
                    const turns = trimHistory(
                        (history ?? [])
                            .slice()
                            .reverse()
                            .map((r) => ({
                                role: (r.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
                                content: String(r.content || '')
                            }))
                            .filter((r) => r.content),
                        Math.max(2, Number(settings.max_context_messages) || 12)
                    );

                    const system = buildSystemPrompt({
                        mode,
                        basePrompt: String(settings.system_prompt || '') || DEFAULT_SYSTEM_PROMPT,
                        language: settings.language === 'en' ? 'en' : 'vi',
                        context: contextSafe,
                        useLessonContext: !!settings.use_lesson_context
                    });

                    const pick = pickModel({
                        model: String(settings.model || ''),
                        routing_enabled: !!settings.routing_enabled,
                        model_simple: String(settings.model_simple || ''),
                        model_complex: String(settings.model_complex || ''),
                        model_practice: String(settings.model_practice || '')
                    }, mode, message);

                    /* Lưu câu hỏi TRƯỚC khi gọi AI: lỗi mạng không làm mất nội dung. */
                    const { data: userRow, error: userErr } = await client.from('ai_messages').insert({
                        conversation_id: conversation.id,
                        student_id: ctx.studentId,
                        role: 'user',
                        content: message,
                        mode,
                        context_ref: contextSafe
                    }).select('*').single();
                    if (userErr || !userRow) return fail(500, 'DB_ERROR', 'Không lưu được câu hỏi.');

                    let out;
                    try {
                        out = await runProvider({
                            settings,
                            system,
                            turns: turns.concat([{ role: 'user', content: message }]),
                            model: pick.model
                        });
                    } catch (err) {
                        const e = err instanceof ProviderError
                            ? err : new ProviderError('UNKNOWN', 'Lỗi không xác định.');
                        await logUsage(client, {
                            studentId: ctx.studentId, action: 'chat', provider: e.provider,
                            model: pick.model, mode, ok: false, errorCode: e.code
                        });
                        return fail(502, e.code, messageFor(e.code), {
                            conversation: conversationRow(conversation),
                            user_message: messageRow(userRow),
                            retryable: e.retryable
                        });
                    }

                    /* Lưu câu trả lời (nếu bật lưu lịch sử). */
                    let assistantRow = null;
                    if (settings.save_history) {
                        const { data } = await client.from('ai_messages').insert({
                            conversation_id: conversation.id,
                            student_id: ctx.studentId,
                            role: 'assistant',
                            content: out.result.text.slice(0, 24000),
                            mode,
                            provider: out.result.provider,
                            model: out.result.model,
                            tokens_in: out.result.usage.input,
                            tokens_out: out.result.usage.output
                        }).select('*').single();
                        assistantRow = data;
                    }

                    const { data: fresh } = await client.from('ai_conversations')
                        .select('message_count, title')
                        .eq('id', conversation.id).maybeSingle();
                    await client.from('ai_conversations').update({
                        message_count: (Number(fresh?.message_count) || 0) + (settings.save_history ? 2 : 1),
                        last_message_at: new Date().toISOString(),
                        last_provider: out.result.provider,
                        last_model: out.result.model,
                        mode,
                        title: (fresh?.title && fresh.title !== 'Hội thoại mới')
                            ? fresh.title : autoTitle(message, mode)
                    }).eq('id', conversation.id).eq('student_id', ctx.studentId);

                    await logUsage(client, {
                        studentId: ctx.studentId, action: 'chat',
                        provider: out.result.provider, model: out.result.model, mode,
                        tokensIn: out.result.usage.input, tokensOut: out.result.usage.output,
                        latencyMs: out.latencyMs, ok: true
                    });

                    const after = await usageToday(client, ctx.studentId);
                    return json({
                        ok: true,
                        data: {
                            conversation: Object.assign(conversationRow(conversation), {
                                last_provider: out.result.provider,
                                last_model: out.result.model,
                                mode
                            }),
                            user_message: messageRow(userRow),
                            message: assistantRow
                                ? messageRow(assistantRow)
                                : {
                                    id: 'ephemeral-' + Date.now(),
                                    role: 'assistant',
                                    content: out.result.text,
                                    mode,
                                    provider: out.result.provider,
                                    model: out.result.model,
                                    context_ref: {},
                                    error_code: '',
                                    created_at: new Date().toISOString()
                                },
                            meta: {
                                provider: out.result.provider,
                                model: out.result.model,
                                mode,
                                routing: pick.reason,
                                fellBack: out.fellBack,
                                mock: out.result.mock,
                                tokens: out.result.usage,
                                latencyMs: out.latencyMs,
                                usage: after,
                                limits: { dailyRequests, dailyTokens }
                            }
                        }
                    });
                } finally {
                    inFlight.delete(ctx.studentId);
                }
            }

            default:
                return fail(400, 'UNKNOWN_ACTION', 'Hành động không hợp lệ.');
        }
    } catch (err) {
        if (err instanceof ProviderError) return fail(502, err.code, messageFor(err.code));
        return fail(500, 'SERVER_ERROR', 'Máy chủ không xử lý được yêu cầu.');
    }
});
