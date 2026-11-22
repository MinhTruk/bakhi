// ===========================================================================
// Bá Khí — _shared/ai-providers.ts
// Lớp Provider Adapter thống nhất cho AI Tutor.
//
// Vì sao có lớp này: AI Tutor không được phụ thuộc vào cấu trúc response của
// một nhà cung cấp. Giao diện, hội thoại, lịch sử và ngữ cảnh học tập chỉ làm
// việc với ProviderResult — đổi provider không phải sửa frontend.
//
// Bảo mật:
//   * API key CHỈ đọc từ Deno.env (Supabase Edge Function Secrets).
//   * Không bao giờ trả key, header hay URL có key về phía client.
//   * Thông báo lỗi trả về là mã lỗi, không phải body thô của provider.
// ===========================================================================

export type ProviderId =
    | 'google' | 'openai' | 'groq' | 'openrouter' | 'mistral' | 'deepseek' | 'custom';

export const PROVIDER_IDS: ProviderId[] = [
    'google', 'openai', 'groq', 'openrouter', 'mistral', 'deepseek', 'custom'
];

export interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

export interface ProviderCall {
    provider: ProviderId;
    model: string;
    /** 'primary' đọc AI_TUTOR_* ; 'fallback' đọc AI_TUTOR_FALLBACK_*. */
    role: 'primary' | 'fallback';
    system: string;
    messages: ChatTurn[];
    maxTokens: number;
    temperature?: number;
    timeoutMs: number;
}

export interface Usage {
    input: number;
    output: number;
    total: number;
    /** Token do provider báo hay do ước lượng cục bộ. */
    estimated: boolean;
}

export interface ProviderResult {
    text: string;
    provider: ProviderId;
    model: string;
    usage: Usage;
    finishReason: string;
    /** true khi chạy provider giả lập (chỉ QA, không bao giờ là mặc định). */
    mock: boolean;
}

export type AiErrorCode =
    | 'AI_DISABLED' | 'NO_KEY' | 'AUTH' | 'MODEL_NOT_FOUND' | 'RATE_LIMIT'
    | 'QUOTA' | 'TIMEOUT' | 'PROVIDER_DOWN' | 'EMPTY_RESPONSE' | 'BAD_CONFIG'
    | 'UNKNOWN';

export class ProviderError extends Error {
    code: AiErrorCode;
    status: number;
    retryable: boolean;
    provider: string;
    /** Thông điệp đã lọc của provider — CHỈ dùng cho nhật ký chẩn đoán nội bộ,
        không bao giờ trả về client (xem ai_provider_diagnostics). */
    detail: string;

    constructor(code: AiErrorCode, message: string, status = 0, provider = '', detail = '') {
        super(message);
        this.name = 'ProviderError';
        this.code = code;
        this.status = status;
        /* Chỉ lỗi tạm thời mới đáng thử provider dự phòng. */
        this.retryable = code === 'TIMEOUT' || code === 'PROVIDER_DOWN' ||
            code === 'RATE_LIMIT' || code === 'EMPTY_RESPONSE';
        this.provider = provider;
        this.detail = detail;
    }
}

/** Lọc thông điệp provider trước khi ghi log: bỏ mọi chuỗi giống khoá API. */
export function sanitizeProviderDetail(text: string): string {
    return String(text ?? '')
        .replace(/AIza[0-9A-Za-z_-]{10,}/g, '***')
        .replace(/sk-[0-9A-Za-z_-]{10,}/g, '***')
        .replace(/AQ\.[0-9A-Za-z_-]{10,}/g, '***')
        .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '***')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 400);
}

const BASE_URLS: Record<Exclude<ProviderId, 'custom'>, string> = {
    google: 'https://generativelanguage.googleapis.com/v1beta',
    openai: 'https://api.openai.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    mistral: 'https://api.mistral.ai/v1',
    deepseek: 'https://api.deepseek.com/v1'
};

export function isProviderId(value: unknown): value is ProviderId {
    return PROVIDER_IDS.indexOf(String(value ?? '') as ProviderId) !== -1;
}

/** Ước lượng token khi provider không trả usage. ~4 ký tự/token. */
export function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(String(text ?? '').length / 4));
}

function secretFor(role: 'primary' | 'fallback'): { key: string; baseUrl: string } {
    const suffix = role === 'fallback' ? 'AI_TUTOR_FALLBACK_' : 'AI_TUTOR_';
    return {
        key: (Deno.env.get(suffix + 'API_KEY') ?? '').trim(),
        baseUrl: (Deno.env.get(suffix + 'BASE_URL') ?? '').trim().replace(/\/+$/, '')
    };
}

/** Provider giả lập: chỉ bật khi AI_TUTOR_MOCK = '1' (QA offline). */
export function mockEnabled(): boolean {
    return (Deno.env.get('AI_TUTOR_MOCK') ?? '') === '1';
}

function endpointFor(provider: ProviderId, baseUrl: string, model: string, google: boolean): string {
    const base = baseUrl || (provider === 'custom' ? '' : BASE_URLS[provider as Exclude<ProviderId, 'custom'>]);
    if (!base) throw new ProviderError('BAD_CONFIG', 'Chưa cấu hình địa chỉ API cho provider tuỳ chỉnh.', 0, provider);
    if (google) {
        return base.replace(/\/v1beta$/, '') + '/v1beta/models/' +
            encodeURIComponent(model) + ':generateContent';
    }
    return base + '/chat/completions';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, provider: string): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), Math.max(1000, timeoutMs));
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (err) {
        const aborted = String((err as Error)?.name || '') === 'AbortError' || ctrl.signal.aborted;
        throw new ProviderError(
            aborted ? 'TIMEOUT' : 'PROVIDER_DOWN',
            aborted ? 'AI phản hồi quá lâu.' : 'Không kết nối được dịch vụ AI.',
            0, provider
        );
    } finally {
        clearTimeout(timer);
    }
}

/** Đọc lỗi HTTP của provider thành mã nội bộ — không lộ body thô. */
async function mapHttpError(res: Response, provider: string): Promise<ProviderError> {
    let detail = '';
    try { detail = (await res.text()).slice(0, 2000); } catch { detail = ''; }
    const low = detail.toLowerCase();
    const status = res.status;
    /* Nhật ký nội bộ (ai_provider_diagnostics) — đã lọc khoá, không trả về client. */
    const hint = sanitizeProviderDetail(detail);
    if (status === 401 || status === 403) {
        return new ProviderError('AUTH', 'Khoá API của trợ lý AI không hợp lệ hoặc đã bị thu hồi.', status, provider, hint);
    }
    if (status === 404) {
        return new ProviderError('MODEL_NOT_FOUND', 'Mô hình AI đã chọn không tồn tại với nhà cung cấp này.', status, provider, hint);
    }
    if (status === 429) {
        const quota = /quota|billing|exceeded your current quota|insufficient/.test(low);
        return new ProviderError(
            quota ? 'QUOTA' : 'RATE_LIMIT',
            quota ? 'Đã hết hạn mức của nhà cung cấp AI.' : 'Nhà cung cấp AI đang giới hạn tần suất. Thử lại sau ít phút.',
            status, provider, hint
        );
    }
    if (status >= 500) {
        return new ProviderError('PROVIDER_DOWN', 'Dịch vụ AI tạm thời không phản hồi.', status, provider, hint);
    }
    return new ProviderError('UNKNOWN', 'Trợ lý AI trả về lỗi không xác định.', status, provider, hint);
}

function normalizeProvider(value: unknown): ProviderId {
    const id = String(value ?? '').trim().toLowerCase();
    return isProviderId(id) ? id : 'google';
}

/** Gọi một provider. Ném ProviderError đã phân loại. */
export async function callProvider(call: ProviderCall): Promise<ProviderResult> {
    const provider = normalizeProvider(call.provider);
    const model = String(call.model ?? '').trim();
    if (!model) {
        throw new ProviderError('BAD_CONFIG', 'Chưa chọn mô hình AI.', 0, provider);
    }
    if (!/^[A-Za-z0-9._:\/-]{1,80}$/.test(model)) {
        throw new ProviderError('BAD_CONFIG', 'Tên mô hình AI không hợp lệ.', 0, provider);
    }

    if (mockEnabled()) {
        const last = [...call.messages].reverse().find((m) => m.role === 'user');
        const text = '[MOCK] Trợ lý AI giả lập đang bật (AI_TUTOR_MOCK=1). ' +
            'Nội dung nhận được: "' + String(last?.content ?? '').slice(0, 200) + '".';
        return {
            text,
            provider: 'custom',
            model: 'mock',
            usage: { input: estimateTokens(call.system + JSON.stringify(call.messages)), output: estimateTokens(text), total: 0, estimated: true },
            finishReason: 'mock',
            mock: true
        };
    }

    const secret = secretFor(call.role);
    if (!secret.key) {
        throw new ProviderError(
            'NO_KEY',
            'Trợ lý AI chưa được cấu hình khoá API. Xem docs/AI_TUTOR_API_KEY_SETUP.md.',
            0, provider
        );
    }

    const google = provider === 'google';
    const url = endpointFor(provider, secret.baseUrl, model, google);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), Math.max(1000, call.timeoutMs));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, unknown>;

    if (google) {
        headers['x-goog-api-key'] = secret.key;
        body = {
            systemInstruction: { parts: [{ text: call.system }] },
            contents: call.messages.map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            })),
            generationConfig: {
                temperature: call.temperature ?? 0.4,
                maxOutputTokens: call.maxTokens
            },
            /* Không cho model tự bật công cụ: AI Tutor chỉ trả lời văn bản. */
            toolConfig: { functionCallingConfig: { mode: 'NONE' } }
        };
    } else {
        headers['Authorization'] = 'Bearer ' + secret.key;
        body = {
            model,
            messages: [{ role: 'system', content: call.system }].concat(
                call.messages.map((m) => ({ role: m.role, content: m.content }))
            ),
            max_tokens: call.maxTokens,
            temperature: call.temperature ?? 0.4,
            stream: false
        };
    }

    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (err) {
        const aborted = String((err as Error)?.name || '') === 'AbortError' || controller.signal.aborted;
        throw new ProviderError(
            aborted ? 'TIMEOUT' : 'PROVIDER_DOWN',
            aborted ? 'AI phản hồi quá lâu. Bạn thử lại giúp mình nhé.' : 'Không kết nối được dịch vụ AI.',
            0, provider
        );
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) throw await mapHttpError(res, provider);

    let raw: Record<string, unknown> = {};
    try {
        raw = await res.json() as Record<string, unknown>;
    } catch {
        throw new ProviderError('EMPTY_RESPONSE', 'AI trả về dữ liệu không đọc được.', res.status, provider);
    }

    return google ? parseGoogle(raw, provider, model) : parseOpenAi(raw, provider, model);
}

function parseGoogle(raw: Record<string, unknown>, provider: ProviderId, model: string): ProviderResult {
    const candidates = (raw.candidates ?? []) as Array<Record<string, unknown>>;
    const first = candidates[0] ?? {};
    const content = (first.content ?? {}) as { parts?: Array<{ text?: string }> };
    const text = (content.parts ?? []).map((p) => String(p?.text ?? '')).join('').trim();
    if (!text) {
        const block = String((raw.promptFeedback as Record<string, unknown> | undefined)?.blockReason ?? '');
        throw new ProviderError(
            'EMPTY_RESPONSE',
            block
                ? 'Nội dung bị bộ lọc an toàn của nhà cung cấp từ chối. Bạn thử diễn đạt lại câu hỏi nhé.'
                : 'AI không trả về nội dung. Bạn thử lại giúp mình nhé.',
            200, provider
        );
    }
    const meta = (raw.usageMetadata ?? {}) as Record<string, unknown>;
    const input = Number(meta.promptTokenCount ?? 0) || estimateTokens(JSON.stringify(raw));
    const output = Number(meta.candidatesTokenCount ?? 0) || estimateTokens(text);
    return {
        text,
        provider,
        model,
        usage: {
            input,
            output,
            total: Number(meta.totalTokenCount ?? input + output) || input + output,
            estimated: !meta.promptTokenCount
        },
        finishReason: String(first.finishReason ?? 'STOP'),
        mock: false
    };
}

function parseOpenAi(raw: Record<string, unknown>, provider: ProviderId, model: string): ProviderResult {
    const choices = (raw.choices ?? []) as Array<Record<string, unknown>>;
    const first = choices[0] ?? {};
    const message = (first.message ?? {}) as { content?: unknown };
    let text = '';
    if (typeof message.content === 'string') text = message.content;
    else if (Array.isArray(message.content)) {
        text = (message.content as Array<Record<string, unknown>>)
            .map((part) => String(part?.text ?? ''))
            .join('');
    }
    text = text.trim();
    if (!text) {
        throw new ProviderError('EMPTY_RESPONSE', 'AI không trả về nội dung. Bạn thử lại giúp mình nhé.', 200, provider);
    }
    const usage = (raw.usage ?? {}) as Record<string, unknown>;
    const input = Number(usage.prompt_tokens ?? 0) || estimateTokens(JSON.stringify(raw));
    const output = Number(usage.completion_tokens ?? 0) || estimateTokens(text);
    return {
        text,
        provider,
        model: String(raw.model ?? model),
        usage: {
            input,
            output,
            total: Number(usage.total_tokens ?? input + output) || input + output,
            estimated: !usage.prompt_tokens
        },
        finishReason: String(first.finish_reason ?? 'stop'),
        mock: false
    };
}

/** Danh sách model gợi ý để Founder chọn — KHÔNG hardcode là "đúng nhất". */
export const MODEL_SUGGESTIONS: Record<string, string[]> = {
    /* Google đã ngừng cấp gemini-2.5-* cho người dùng mới (404). Chỉ còn 3.8-flash
       là dùng được với khoá mới — kiểm tra 2026-11-22, xem docs/AI_TUTOR_PROVIDER_SETUP.md. */
    google: ['gemini-3.8-flash'],
    openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    openrouter: ['google/gemini-3.8-flash', 'anthropic/claude-3.5-sonnet'],
    mistral: ['mistral-small-latest', 'mistral-large-latest'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    custom: []
};
