// chat-api — mọi thao tác ghi của Chat Bá Khí.
//
// Trình duyệt chỉ đọc dữ liệu qua RLS; các thao tác dưới đây chạy bằng service
// role sau khi máy chủ xác minh:
//   * thiết bị đã gắn với một học sinh đang hoạt động,
//   * người gọi là thành viên phòng (phòng chung thì mọi học sinh đã gắn),
//   * nội dung nằm trong giới hạn (2.000 ký tự, ảnh thuộc bucket chat-images),
//   * tần suất gửi nằm trong giới hạn.
//
// Không bao giờ tin `student_id` do client gửi lên.
import { json, fail, preflight, readJson } from '../_shared/http.ts';
import { adminClient, callerUserId } from '../_shared/supabase.ts';

const MAX_BODY = 2000;
const MAX_ROOMS = 60;
const HISTORY = 50;

/* Bộ emoji giới hạn để không lưu chuỗi lạ và giữ giao diện gọn. */
const EMOJI = new Set([
    '👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '🙏', '✅', '⭐', '💯'
]);

interface Ctx {
    client: ReturnType<typeof adminClient>;
    studentId: string;
    authUserId: string;
    ip: string;
}

function str(v: unknown, max: number): string {
    return String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function uuid(v: unknown): string {
    const s = str(v, 40);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : '';
}

function cleanBody(raw: unknown): string {
    return String(raw ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .trim()
        .slice(0, MAX_BODY);
}

async function limited(ctx: Ctx, key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const { data, error } = await ctx.client.rpc('bakhi_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds
    });
    if (error) throw new Error('RATE_LIMIT_ERROR');
    return !!data;
}

/** Phòng người gọi đọc được (phòng chung + phòng có dòng thành viên). */
async function readableRoom(ctx: Ctx, roomId: string) {
    const { data: room } = await ctx.client
        .from('chat_rooms')
        .select('id, kind, title, dm_key, created_by, created_at, last_message_at')
        .eq('id', roomId)
        .maybeSingle();
    if (!room) return null;
    if (room.kind === 'global') return room;
    const { data: member } = await ctx.client
        .from('chat_members')
        .select('role')
        .eq('room_id', roomId)
        .eq('student_id', ctx.studentId)
        .maybeSingle();
    return member ? room : null;
}

async function profilesByIds(ctx: Ctx, ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 60);
    if (!unique.length) return new Map<string, Record<string, unknown>>();
    const { data } = await ctx.client
        .from('chat_profiles')
        .select('student_id, display_name, nickname, bio, avatar_url, frame, badge_count, last_seen_at')
        .in('student_id', unique);
    const map = new Map<string, Record<string, unknown>>();
    for (const row of data ?? []) map.set(String(row.student_id), row);
    return map;
}

function card(map: Map<string, Record<string, unknown>>, id: string) {
    const row = map.get(id) || {};
    const seen = row.last_seen_at ? Date.parse(String(row.last_seen_at)) : 0;
    return {
        student_id: id,
        display_name: String(row.display_name || 'Học sinh'),
        nickname: String(row.nickname || ''),
        bio: String(row.bio || ''),
        avatar_url: String(row.avatar_url || ''),
        frame: String(row.frame || 'none'),
        badge_count: num(row.badge_count),
        last_seen_at: row.last_seen_at || null,
        /* Hoạt động nếu có tín hiệu trong 2 phút gần nhất. */
        online: !!seen && Date.now() - seen < 2 * 60 * 1000
    };
}

/** Ghim / lưu trữ của chính người gọi, theo phòng. */
async function prefsByRoom(ctx: Ctx): Promise<Map<string, Record<string, unknown>>> {
    const { data } = await ctx.client
        .from('chat_conversation_prefs')
        .select('room_id, pinned, pinned_at, archived, archived_at')
        .eq('student_id', ctx.studentId);
    const map = new Map<string, Record<string, unknown>>();
    for (const row of data ?? []) map.set(String(row.room_id), row);
    return map;
}

/** Ghi một phần tuỳ chọn, giữ nguyên phần còn lại. */
async function setPref(
    ctx: Ctx,
    roomId: string,
    patch: { pinned?: boolean; archived?: boolean }
): Promise<Record<string, unknown> | null> {
    const { data: existing } = await ctx.client
        .from('chat_conversation_prefs')
        .select('pinned, pinned_at, archived, archived_at')
        .eq('student_id', ctx.studentId)
        .eq('room_id', roomId)
        .maybeSingle();
    const now = new Date().toISOString();
    const pinned = patch.pinned ?? !!existing?.pinned;
    const archived = patch.archived ?? !!existing?.archived;
    const row = {
        student_id: ctx.studentId,
        room_id: roomId,
        pinned,
        pinned_at: pinned ? (existing?.pinned_at || now) : null,
        archived,
        archived_at: archived ? (existing?.archived_at || now) : null,
        updated_at: now
    };
    const { error } = await ctx.client
        .from('chat_conversation_prefs')
        .upsert(row, { onConflict: 'student_id,room_id' });
    if (error) return null;
    return row;
}

async function roomSummary(
    ctx: Ctx,
    room: Record<string, unknown>,
    unread: number,
    pref?: Record<string, unknown>
) {
    const id = String(room.id);
    const [{ data: members }, { data: last }] = await Promise.all([
        ctx.client.from('chat_members').select('student_id, role').eq('room_id', id).limit(12),
        ctx.client.from('chat_messages')
            .select('id, student_id, body, image_path, created_at, deleted_at')
            .eq('room_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
    ]);
    const memberIds = (members ?? []).map((m) => String(m.student_id));
    if (room.kind === 'global' && !memberIds.includes(ctx.studentId)) memberIds.push(ctx.studentId);
    const map = await profilesByIds(ctx, memberIds.concat(last ? [String(last.student_id)] : []));
    return {
        id,
        kind: room.kind,
        title: String(room.title || ''),
        dm_key: room.dm_key || null,
        created_by: room.created_by || null,
        created_at: room.created_at,
        last_message_at: room.last_message_at,
        member_count: (members ?? []).length,
        members: memberIds.slice(0, 12).map((sid) => card(map, sid)),
        unread,
        pinned: !!pref?.pinned,
        pinned_at: pref?.pinned_at || null,
        archived: !!pref?.archived,
        archived_at: pref?.archived_at || null,
        last_message: last ? {
            id: last.id,
            student_id: last.student_id,
            body: last.deleted_at ? '' : String(last.body || ''),
            image_path: last.deleted_at ? null : last.image_path,
            created_at: last.created_at,
            deleted: !!last.deleted_at,
            sender_name: card(map, String(last.student_id)).display_name
        } : null
    };
}

/** Bảo đảm phòng chung có dòng thành viên để lưu mốc đã đọc. */
async function ensureGlobalMember(ctx: Ctx): Promise<string> {
    const { data: room } = await ctx.client
        .from('chat_rooms').select('id').eq('kind', 'global').maybeSingle();
    if (!room) return '';
    await ctx.client.from('chat_members').upsert({
        room_id: room.id,
        student_id: ctx.studentId,
        role: 'member'
    }, { onConflict: 'room_id,student_id', ignoreDuplicates: true });
    return String(room.id);
}

async function unreadByRoom(ctx: Ctx, rooms: Array<Record<string, unknown>>): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!rooms.length) return out;
    const ids = rooms.map((r) => String(r.id));
    const { data: mine } = await ctx.client
        .from('chat_members')
        .select('room_id, last_read_at')
        .eq('student_id', ctx.studentId)
        .in('room_id', ids);
    const marks = new Map<string, number>();
    for (const row of mine ?? []) marks.set(String(row.room_id), Date.parse(row.last_read_at) || 0);
    if (!marks.size) return out;
    const earliest = Math.min(...[...marks.values()]);
    const { data: messages } = await ctx.client
        .from('chat_messages')
        .select('room_id, student_id, created_at')
        .in('room_id', ids)
        .gt('created_at', new Date(earliest - 1000).toISOString())
        .neq('student_id', ctx.studentId)
        .order('created_at', { ascending: false })
        .limit(1500);
    for (const row of messages ?? []) {
        const roomId = String(row.room_id);
        const at = Date.parse(row.created_at) || 0;
        const mark = marks.get(roomId) || 0;
        if (at > mark) out.set(roomId, (out.get(roomId) || 0) + 1);
    }
    return out;
}

/** Nếu nhóm không còn trưởng nhóm, chuyển người vào sớm nhất làm trưởng. */
async function promoteOwner(ctx: Ctx, roomId: string) {
    const { data: leaders } = await ctx.client
        .from('chat_members')
        .select('student_id')
        .eq('room_id', roomId)
        .in('role', ['owner', 'admin'])
        .limit(1);
    if (leaders && leaders.length) return;
    const { data: next } = await ctx.client
        .from('chat_members')
        .select('student_id')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (!next) return;
    await ctx.client.from('chat_members')
        .update({ role: 'owner' })
        .eq('room_id', roomId)
        .eq('student_id', next.student_id);
}

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;

    const caller = await callerUserId(req);
    if (caller instanceof Response) return caller;

    const client = adminClient();

    const { data: device } = await client
        .from('student_devices')
        .select('student_id')
        .eq('auth_user_id', caller.userId)
        .maybeSingle();
    if (!device) return fail(409, 'NOT_BOUND', 'Thiết bị chưa được gắn với học sinh nào.');

    const { data: student } = await client
        .from('students')
        .select('id, display_name, is_active')
        .eq('id', device.student_id)
        .maybeSingle();
    if (!student || !student.is_active) {
        return fail(403, 'INACTIVE', 'Hồ sơ học sinh không còn hoạt động.');
    }

    const ctx: Ctx = { client, studentId: String(student.id), authUserId: caller.userId, ip: '' };
    const body = await readJson<Record<string, unknown>>(req);
    const action = str(body.action, 40);

    /* Mỗi thao tác chat là một nhịp hoạt động. */
    await client.from('student_devices')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('auth_user_id', ctx.authUserId);

    try {
        if (!(await limited(ctx, 'chat:' + ctx.studentId, 300, 3600))) {
            return fail(429, 'TOO_MANY_ATTEMPTS', 'Bạn thao tác quá nhanh. Vui lòng đợi vài phút.');
        }

        switch (action) {
            /* ------------------------------ Khởi động ------------------------------ */
            case 'bootstrap': {
                await ensureGlobalMember(ctx);
                const { data: memberships } = await client
                    .from('chat_members')
                    .select('room_id')
                    .eq('student_id', ctx.studentId);
                const ids = (memberships ?? []).map((r) => String(r.room_id));
                const scope = ids.length
                    ? 'kind.eq.global,id.in.(' + ids.map((id) => '"' + id + '"').join(',') + ')'
                    : 'kind.eq.global';
                const { data: rooms } = await client
                    .from('chat_rooms')
                    .select('id, kind, title, dm_key, created_by, created_at, last_message_at')
                    .or(scope)
                    .order('last_message_at', { ascending: false })
                    .limit(MAX_ROOMS);
                const unread = await unreadByRoom(ctx, rooms ?? []);
                const prefs = await prefsByRoom(ctx);
                const summaries: Array<Record<string, unknown>> = [];
                for (const room of rooms ?? []) {
                    const id = String(room.id);
                    summaries.push(await roomSummary(ctx, room, unread.get(id) || 0, prefs.get(id)));
                }
                const meMap = await profilesByIds(ctx, [ctx.studentId]);
                let total = 0;
                unread.forEach((v, roomId) => {
                    /* Phòng đã lưu trữ không đếm vào huy hiệu chưa đọc. */
                    if (!prefs.get(roomId)?.archived) total += v;
                });
                return json({
                    ok: true,
                    me: card(meMap, ctx.studentId),
                    rooms: summaries,
                    totalUnread: total,
                    maxGroup: 10
                });
            }

            /* ------------------------------- Tin nhắn ------------------------------- */
            case 'messages.list': {
                const roomId = uuid(body.room_id);
                if (!roomId) return fail(400, 'BAD_ROOM', 'Thiếu phòng chat.');
                const room = await readableRoom(ctx, roomId);
                if (!room) return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                const { data: pref } = await client
                    .from('chat_conversation_prefs')
                    .select('pinned, pinned_at, archived, archived_at')
                    .eq('student_id', ctx.studentId)
                    .eq('room_id', roomId)
                    .maybeSingle();
                let query = client.from('chat_messages')
                    .select('id, room_id, student_id, body, image_path, reply_to, created_at, deleted_at')
                    .eq('room_id', roomId)
                    .order('created_at', { ascending: false })
                    .limit(HISTORY);
                if (body.before) query = query.lt('created_at', str(body.before, 40));
                const { data: rows } = await query;
                const messages = (rows ?? []).reverse();
                const ids = messages.map((m) => String(m.id));
                let reactions: Array<Record<string, unknown>> = [];
                if (ids.length) {
                    const { data: reactionsData } = await client
                        .from('chat_reactions')
                        .select('message_id, student_id, emoji, created_at')
                        .in('message_id', ids);
                    reactions = reactionsData ?? [];
                }
                const { data: memberRows } = await client
                    .from('chat_members')
                    .select('student_id, role, last_read_at')
                    .eq('room_id', roomId)
                    .limit(12);
                const memberIds = (memberRows ?? []).map((m) => String(m.student_id));
                const map = await profilesByIds(ctx, messages.map((m) => String(m.student_id)).concat(memberIds));
                return json({
                    ok: true,
                    room: {
                        id: room.id, kind: room.kind, title: room.title,
                        dm_key: room.dm_key, created_by: room.created_by
                    },
                    pref: {
                        pinned: !!pref?.pinned,
                        pinned_at: pref?.pinned_at || null,
                        archived: !!pref?.archived,
                        archived_at: pref?.archived_at || null
                    },
                    members: (memberRows ?? []).map((m) => Object.assign(card(map, String(m.student_id)), {
                        role: m.role, last_read_at: m.last_read_at
                    })),
                    messages: messages.map((m) => ({
                        id: m.id,
                        room_id: m.room_id,
                        student_id: m.student_id,
                        body: m.deleted_at ? '' : String(m.body || ''),
                        image_path: m.deleted_at ? null : m.image_path,
                        reply_to: m.reply_to,
                        created_at: m.created_at,
                        deleted: !!m.deleted_at,
                        sender: card(map, String(m.student_id))
                    })),
                    reactions
                });
            }

            case 'messages.send': {
                const roomId = uuid(body.room_id);
                if (!roomId) return fail(400, 'BAD_ROOM', 'Thiếu phòng chat.');
                const room = await readableRoom(ctx, roomId);
                if (!room) return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                const { data: membership } = await client
                    .from('chat_members')
                    .select('muted')
                    .eq('room_id', roomId)
                    .eq('student_id', ctx.studentId)
                    .maybeSingle();
                if (membership && membership.muted) {
                    return fail(403, 'MUTED', 'Bạn đang bị tạm khoá gửi tin trong phòng này.');
                }
                const text = cleanBody(body.content ?? body.body);
                /* 6.0.0: Chat chỉ nhận văn bản. Ảnh cũ vẫn được đọc/hiển thị
                   nhưng client không thể gửi ảnh mới, kể cả khi gọi API trực tiếp. */
                if (body.image_path) {
                    return fail(400, 'IMAGES_DISABLED', 'Chat 6.0 chỉ gửi được văn bản.');
                }
                if (!text) return fail(400, 'EMPTY', 'Tin nhắn trống.');
                if (!(await limited(ctx, 'chat-send:' + ctx.studentId, 20, 60))) {
                    return fail(429, 'TOO_MANY_MESSAGES', 'Bạn gửi hơi nhanh. Chờ một chút nhé.');
                }
                const replyTo = body.reply_to ? uuid(body.reply_to) : null;
                const { data: row, error } = await client
                    .from('chat_messages')
                    .insert({
                        room_id: roomId,
                        student_id: ctx.studentId,
                        body: text,
                        image_path: null,
                        reply_to: replyTo
                    })
                    .select('id, room_id, student_id, body, image_path, reply_to, created_at, deleted_at')
                    .maybeSingle();
                if (error || !row) return fail(500, 'SEND_FAILED', 'Không gửi được tin nhắn.');
                const map = await profilesByIds(ctx, [ctx.studentId]);
                return json({
                    ok: true,
                    message: {
                        id: row.id, room_id: row.room_id, student_id: row.student_id,
                        body: row.body, image_path: row.image_path, reply_to: row.reply_to,
                        created_at: row.created_at, deleted: false,
                        sender: card(map, ctx.studentId)
                    }
                });
            }

            case 'messages.delete': {
                const id = uuid(body.message_id);
                if (!id) return fail(400, 'BAD_MESSAGE', 'Thiếu tin nhắn.');
                const { data: message } = await client
                    .from('chat_messages')
                    .select('id, room_id, student_id')
                    .eq('id', id)
                    .maybeSingle();
                if (!message) return fail(404, 'NOT_FOUND', 'Không tìm thấy tin nhắn.');
                const room = await readableRoom(ctx, String(message.room_id));
                if (!room) return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                let allowed = String(message.student_id) === ctx.studentId;
                if (!allowed && room.kind === 'group') {
                    const { data: member } = await client
                        .from('chat_members')
                        .select('role')
                        .eq('room_id', room.id)
                        .eq('student_id', ctx.studentId)
                        .maybeSingle();
                    allowed = !!member && (member.role === 'owner' || member.role === 'admin');
                }
                if (!allowed) return fail(403, 'NOT_ALLOWED', 'Bạn không xoá được tin nhắn này.');
                const { error } = await client
                    .from('chat_messages')
                    .update({ body: '', image_path: null, deleted_at: new Date().toISOString() })
                    .eq('id', id);
                if (error) return fail(500, 'DELETE_FAILED', 'Không xoá được tin nhắn.');
                return json({ ok: true });
            }

            case 'reactions.toggle': {
                const messageId = uuid(body.message_id);
                const emoji = str(body.emoji, 8);
                if (!messageId || !EMOJI.has(emoji)) return fail(400, 'BAD_REACTION', 'Cảm xúc không hợp lệ.');
                const { data: message } = await client
                    .from('chat_messages')
                    .select('id, room_id')
                    .eq('id', messageId)
                    .maybeSingle();
                if (!message || !(await readableRoom(ctx, String(message.room_id)))) {
                    return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                }
                if (!(await limited(ctx, 'chat-react:' + ctx.studentId, 120, 60))) {
                    return fail(429, 'TOO_MANY_REACTIONS', 'Bạn thả cảm xúc hơi nhanh.');
                }
                const { data: existing } = await client
                    .from('chat_reactions')
                    .select('emoji')
                    .eq('message_id', messageId)
                    .eq('student_id', ctx.studentId)
                    .eq('emoji', emoji)
                    .maybeSingle();
                if (existing) {
                    await client.from('chat_reactions').delete()
                        .eq('message_id', messageId)
                        .eq('student_id', ctx.studentId)
                        .eq('emoji', emoji);
                } else {
                    const { error } = await client.from('chat_reactions').insert({
                        message_id: messageId, student_id: ctx.studentId, emoji
                    });
                    if (error && !String(error.code || '').includes('23505')) {
                        return fail(500, 'REACTION_FAILED', 'Không lưu được cảm xúc.');
                    }
                }
                const { data: all } = await client
                    .from('chat_reactions')
                    .select('message_id, student_id, emoji, created_at')
                    .eq('message_id', messageId);
                return json({ ok: true, reactions: all ?? [] });
            }

            case 'conversation.pin':
            case 'conversation.archive': {
                const roomId = uuid(body.room_id);
                if (!roomId) return fail(400, 'BAD_ROOM', 'Thiếu phòng chat.');
                if (!(await readableRoom(ctx, roomId))) {
                    return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                }
                const pinAction = action === 'conversation.pin';
                const row = await setPref(
                    ctx,
                    roomId,
                    pinAction ? { pinned: body.value === true } : { archived: body.value === true }
                );
                if (!row) return fail(500, 'PREF_FAILED', 'Không lưu được tuỳ chọn hội thoại.');
                return json({
                    ok: true,
                    pref: {
                        pinned: !!row.pinned,
                        pinned_at: row.pinned_at || null,
                        archived: !!row.archived,
                        archived_at: row.archived_at || null
                    }
                });
            }

            case 'read.mark': {
                const roomId = uuid(body.room_id);
                if (!roomId) return fail(400, 'BAD_ROOM', 'Thiếu phòng chat.');
                const room = await readableRoom(ctx, roomId);
                if (!room) return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                /* Client gửi mốc created_at của tin cuối đã thấy. Không dùng giờ
                   server, vì tin đến trong lúc gọi API sẽ bị đánh dấu đã đọc oan.
                   Giữ nguyên chuỗi gốc (PostgreSQL có microseconds) để lần so
                   sánh `created_at > last_read_at` kế tiếp không lệch mốc. */
                const rawThrough = str(body.through, 40);
                const requestedAt = Date.parse(rawThrough);
                const nowAt = Date.now();
                const isIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(rawThrough);
                const through = Number.isFinite(requestedAt) && isIso && requestedAt <= nowAt
                    ? rawThrough
                    : new Date(nowAt).toISOString();
                const { data: current } = await client
                    .from('chat_members')
                    .select('last_read_at')
                    .eq('room_id', roomId)
                    .eq('student_id', ctx.studentId)
                    .maybeSingle();
                const currentRaw = current && current.last_read_at ? String(current.last_read_at) : '';
                const currentAt = currentRaw ? Date.parse(currentRaw) : 0;
                const requestedMs = Date.parse(through);
                /* Chỉ tiến, không lùi: mốc đã đọc là mốc lớn nhất từng thấy. */
                const lastReadAt = requestedMs > (currentAt || 0) ||
                    (requestedMs === (currentAt || 0) && through > currentRaw)
                    ? through
                    : (currentRaw || through);
                await client.from('chat_members').upsert({
                    room_id: roomId,
                    student_id: ctx.studentId,
                    last_read_at: lastReadAt
                }, { onConflict: 'room_id,student_id' });
                return json({ ok: true, last_read_at: lastReadAt });
            }

            case 'presence.ping': {
                const roomId = uuid(body.room_id);
                if (!roomId) return json({ ok: true, online: [] });
                const room = await readableRoom(ctx, roomId);
                if (!room) return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                const { data: members } = await client
                    .from('chat_members')
                    .select('student_id')
                    .eq('room_id', roomId)
                    .limit(50);
                const ids = (members ?? []).map((m) => String(m.student_id));
                if (room.kind === 'global' && !ids.includes(ctx.studentId)) ids.push(ctx.studentId);
                const map = await profilesByIds(ctx, ids);
                return json({
                    ok: true,
                    online: ids.map((id) => {
                        const c = card(map, id);
                        return { student_id: id, online: c.online, last_seen_at: c.last_seen_at };
                    })
                });
            }

            /* -------------------------------- Phòng -------------------------------- */
            case 'dm.open': {
                const target = uuid(body.student_id);
                if (!target || target === ctx.studentId) {
                    return fail(400, 'BAD_TARGET', 'Chọn một học sinh khác.');
                }
                const { data: other } = await client
                    .from('students').select('id, is_active').eq('id', target).maybeSingle();
                if (!other || !other.is_active) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                const key = [ctx.studentId, target].sort().join(':');
                let { data: room } = await client
                    .from('chat_rooms').select('id').eq('dm_key', key).maybeSingle();
                if (!room) {
                    const created = await client.from('chat_rooms').insert({
                        kind: 'dm', title: '', dm_key: key, created_by: ctx.studentId
                    }).select('id').maybeSingle();
                    if (created.error) {
                        const again = await client.from('chat_rooms').select('id').eq('dm_key', key).maybeSingle();
                        room = again.data;
                    } else {
                        room = created.data;
                    }
                }
                if (!room) return fail(500, 'ROOM_FAILED', 'Không mở được cuộc trò chuyện.');
                await client.from('chat_members').upsert([
                    { room_id: room.id, student_id: ctx.studentId, role: 'member' },
                    { room_id: room.id, student_id: target, role: 'member' }
                ], { onConflict: 'room_id,student_id', ignoreDuplicates: true });
                return json({ ok: true, room_id: room.id });
            }

            case 'group.create': {
                const title = str(body.title, 80) || 'Nhóm mới';
                const members: string[] = Array.isArray(body.member_ids)
                    ? [...new Set(body.member_ids.map((id) => uuid(id)).filter(Boolean))].slice(0, 9)
                    : [];
                const all = [ctx.studentId, ...members.filter((id) => id !== ctx.studentId)];
                if (all.length < 2) return fail(400, 'TOO_FEW', 'Nhóm cần ít nhất 2 thành viên.');
                if (all.length > 10) return fail(400, 'TOO_MANY', 'Nhóm tối đa 10 thành viên.');
                const { data: valid } = await client
                    .from('students').select('id').in('id', all).eq('is_active', true);
                if ((valid ?? []).length !== all.length) {
                    return fail(400, 'BAD_MEMBER', 'Có thành viên không hợp lệ.');
                }
                const { data: room, error } = await client.from('chat_rooms').insert({
                    kind: 'group', title, dm_key: null, created_by: ctx.studentId
                }).select('id').maybeSingle();
                if (error || !room) return fail(500, 'ROOM_FAILED', 'Không tạo được nhóm.');
                await client.from('chat_members').insert(all.map((id) => ({
                    room_id: room.id,
                    student_id: id,
                    role: id === ctx.studentId ? 'owner' : 'member'
                })));
                return json({ ok: true, room_id: room.id });
            }

            case 'group.add': {
                const roomId = uuid(body.room_id);
                const target = uuid(body.student_id);
                if (!roomId || !target) return fail(400, 'BAD_REQUEST', 'Thiếu phòng hoặc thành viên.');
                const room = await readableRoom(ctx, roomId);
                if (!room || room.kind !== 'group') return fail(403, 'NO_ACCESS', 'Không phải nhóm của bạn.');
                const { data: me } = await client.from('chat_members')
                    .select('role').eq('room_id', roomId).eq('student_id', ctx.studentId).maybeSingle();
                if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
                    return fail(403, 'NOT_ALLOWED', 'Chỉ trưởng nhóm thêm được thành viên.');
                }
                const { data: other } = await client
                    .from('students').select('id, is_active').eq('id', target).maybeSingle();
                if (!other || !other.is_active) return fail(404, 'NOT_FOUND', 'Không tìm thấy học sinh.');
                const { error } = await client.from('chat_members').insert({
                    room_id: roomId, student_id: target, role: 'member'
                });
                if (error) {
                    if (String(error.message || '').includes('GROUP_FULL')) {
                        return fail(400, 'GROUP_FULL', 'Nhóm đã đủ 10 thành viên.');
                    }
                    if (String(error.code || '') === '23505') return json({ ok: true });
                    return fail(500, 'ADD_FAILED', 'Không thêm được thành viên.');
                }
                return json({ ok: true });
            }

            case 'group.remove': {
                const roomId = uuid(body.room_id);
                const target = uuid(body.student_id);
                if (!roomId || !target) return fail(400, 'BAD_REQUEST', 'Thiếu phòng hoặc thành viên.');
                const room = await readableRoom(ctx, roomId);
                if (!room || room.kind !== 'group') return fail(403, 'NO_ACCESS', 'Không phải nhóm của bạn.');
                const { data: me } = await client.from('chat_members')
                    .select('role').eq('room_id', roomId).eq('student_id', ctx.studentId).maybeSingle();
                if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
                    return fail(403, 'NOT_ALLOWED', 'Chỉ trưởng nhóm xoá được thành viên.');
                }
                await client.from('chat_members').delete()
                    .eq('room_id', roomId).eq('student_id', target);
                await promoteOwner(ctx, roomId);
                return json({ ok: true });
            }

            case 'group.leave': {
                const roomId = uuid(body.room_id);
                if (!roomId) return fail(400, 'BAD_ROOM', 'Thiếu phòng chat.');
                const room = await readableRoom(ctx, roomId);
                if (!room || room.kind !== 'group') return fail(403, 'NO_ACCESS', 'Không phải nhóm của bạn.');
                await client.from('chat_members').delete()
                    .eq('room_id', roomId).eq('student_id', ctx.studentId);
                const { data: left } = await client
                    .from('chat_members').select('student_id').eq('room_id', roomId).limit(1);
                if (!left || !left.length) {
                    await client.from('chat_rooms').delete().eq('id', roomId);
                } else {
                    await promoteOwner(ctx, roomId);
                }
                return json({ ok: true });
            }

            case 'group.rename': {
                const roomId = uuid(body.room_id);
                const title = str(body.title, 80);
                if (!roomId || !title) return fail(400, 'BAD_REQUEST', 'Thiếu tên nhóm.');
                const room = await readableRoom(ctx, roomId);
                if (!room || room.kind !== 'group') return fail(403, 'NO_ACCESS', 'Không phải nhóm của bạn.');
                const { data: me } = await client.from('chat_members')
                    .select('role').eq('room_id', roomId).eq('student_id', ctx.studentId).maybeSingle();
                if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
                    return fail(403, 'NOT_ALLOWED', 'Chỉ trưởng nhóm đổi được tên.');
                }
                await client.from('chat_rooms').update({ title }).eq('id', roomId);
                return json({ ok: true, title });
            }

            /* ------------------------------ Danh bạ ------------------------------ */
            case 'students.search': {
                const q = str(body.q, 60);
                let query = client.from('students')
                    .select('id, display_name')
                    .eq('is_active', true)
                    .neq('id', ctx.studentId)
                    .order('display_name', { ascending: true })
                    .limit(15);
                if (q) query = query.ilike('display_name', '%' + q + '%');
                const { data: rows } = await query;
                const map = await profilesByIds(ctx, (rows ?? []).map((r) => String(r.id)));
                return json({
                    ok: true,
                    students: (rows ?? []).map((r) => card(map, String(r.id)))
                });
            }

            case 'profiles.cards': {
                const ids = Array.isArray(body.ids) ? body.ids.map((id) => uuid(id)).filter(Boolean).slice(0, 50) : [];
                if (!ids.length) return json({ ok: true, profiles: [] });
                const map = await profilesByIds(ctx, ids);
                return json({
                    ok: true,
                    profiles: ids.filter((id) => map.has(id)).map((id) => card(map, id))
                });
            }

            /* ------------------------------ Dọn dẹp ------------------------------ */
            case 'messages.purge_own': {
                /* Cho phép người dùng xoá toàn bộ tin nhắn của mình trong một phòng. */
                const roomId = uuid(body.room_id);
                if (!roomId) return fail(400, 'BAD_ROOM', 'Thiếu phòng chat.');
                if (!(await readableRoom(ctx, roomId))) {
                    return fail(403, 'NO_ACCESS', 'Bạn không ở trong phòng này.');
                }
                await client.from('chat_messages')
                    .update({ body: '', image_path: null, deleted_at: new Date().toISOString() })
                    .eq('room_id', roomId)
                    .eq('student_id', ctx.studentId)
                    .is('deleted_at', null);
                return json({ ok: true });
            }

            default:
                return fail(400, 'UNKNOWN_ACTION', 'Thao tác không hợp lệ.');
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Lỗi máy chủ.';
        if (message === 'RATE_LIMIT_ERROR') {
            return fail(500, 'RATE_LIMIT_ERROR', 'Không kiểm tra được giới hạn truy cập.');
        }
        return fail(500, 'SERVER_ERROR', message.slice(0, 200));
    }
});
