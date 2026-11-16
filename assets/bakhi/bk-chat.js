/* =========================================================================
   Bá Khí — bk-chat.js
   Chat dùng chung: phòng chung, tin nhắn riêng, nhóm ≤ 10, ảnh, cảm xúc,
   realtime, bộ đếm chưa đọc và Profile Card.

   Nguyên tắc:
   - Dữ liệu đọc trực tiếp qua Supabase (RLS chỉ cho phòng mình tham gia);
     mọi thao tác ghi đi qua Edge Function `chat-api`.
   - Chỉ ảnh (png/jpeg/webp/gif ≤ 3 MB) qua bucket `chat-images`; không tệp khác.
   - Toàn bộ nội dung render bằng textContent, không innerHTML dữ liệu người dùng.
   - Không có đồng hồ đếm ngược, không giới hạn thời gian.

   Công khai: window.BKChat
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D || global.BKChatLoaded) return;
    global.BKChatLoaded = true;

    var EMOJI_GROUPS = [
        { id: 'faces', name: 'Mặt', list: ['😀', '😄', '😁', '😂', '😊', '😍', '😘', '😎', '🤩', '🥳', '😮', '😢', '😭', '😡', '🤔', '😴'] },
        { id: 'hands', name: 'Cử chỉ', list: ['👍', '👎', '👏', '🙏', '👌', '✌️', '🤝', '💪', '🫶', '🙌'] },
        { id: 'hearts', name: 'Cảm xúc', list: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💖', '💯'] },
        { id: 'study', name: 'Học tập', list: ['📚', '📖', '✏️', '📝', '🎓', '🧠', '💡', '🔬', '🧮', '📐'] },
        { id: 'symbols', name: 'Biểu tượng', list: ['🔥', '⭐', '✨', '🎉', '🎯', '✅', '❌', '⚡', '🌟', '🏆', '🚀', '🌈'] }
    ];
    var EMOJI = [];
    EMOJI_GROUPS.forEach(function (g) { EMOJI = EMOJI.concat(g.list); });
    var IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    var MAX_IMAGE = 3 * 1024 * 1024;

    var S = {
        root: null, booted: false, loading: false, error: null,
        me: null, rooms: [], active: null, messages: [], reactions: {},
        members: [], cards: {}, totalUnread: 0, maxGroup: 10,
        channel: null, client: null, filter: '', pendingImage: null,
        replyTo: null, readTimer: null, searchTimer: null, destroyed: false
    };

    /* ---------------------------------------------------------------------
       Tiện ích DOM
       ------------------------------------------------------------------ */
    function el(tag, cls, text) {
        var node = D.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = String(text);
        return node;
    }
    function icon(name, cls) {
        var i = D.createElement('i');
        i.className = 'fa-solid ' + name + (cls ? ' ' + cls : '');
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    function btn(cls, label, iconName) {
        var b = el('button', cls);
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        if (label) b.appendChild(el('span', null, label));
        return b;
    }
    function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
    function on(node, type, fn) { if (node) node.addEventListener(type, fn); }

    function toast(msg, kind) {
        try {
            if (global.BK && global.BK.ui && global.BK.ui.toast) {
                global.BK.ui.toast(msg, kind || 'info');
                return;
            }
        } catch (e) { }
    }

    function confirmBox(message, okLabel) {
        if (global.BK && global.BK.ui && global.BK.ui.confirm) {
            try { return global.BK.ui.confirm({ title: 'Xác nhận', message: message, confirmText: okLabel || 'Đồng ý' }); } catch (e) { }
        }
        return Promise.resolve(true);
    }

    function fmtTime(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    function fmtDay(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var today = new Date();
        var yst = new Date(today.getTime() - 86400000);
        if (d.toDateString() === today.toDateString()) return 'Hôm nay';
        if (d.toDateString() === yst.toDateString()) return 'Hôm qua';
        return d.toLocaleDateString('vi-VN');
    }
    function sameDay(a, b) {
        var x = new Date(a), y = new Date(b);
        return x.toDateString() === y.toDateString();
    }
    function shortTime(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var today = new Date();
        if (d.toDateString() === today.toDateString()) return fmtTime(iso);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    }

    /* ---------------------------------------------------------------------
       Hồ sơ hiển thị
       ------------------------------------------------------------------ */
    function nameOf(card) {
        if (!card) return 'Học sinh';
        return card.nickname || card.display_name || 'Học sinh';
    }
    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'BK';
        var last = parts[parts.length - 1];
        var first = parts.length > 1 ? parts[0] : '';
        return (first ? first.charAt(0) : last.charAt(0)).toUpperCase() +
            (parts.length > 1 ? last.charAt(0).toUpperCase() : '');
    }
    function avatarFor(card, size, clickable) {
        var wrap = el(clickable ? 'button' : 'span', 'bkchat-avatar');
        if (clickable) {
            wrap.type = 'button';
            wrap.setAttribute('data-profile', String(card && card.student_id || ''));
            wrap.setAttribute('aria-label', 'Xem hồ sơ ' + nameOf(card));
        }
        wrap.style.width = size + 'px';
        wrap.style.height = size + 'px';
        var img = null;
        if (card && card.avatar_url) {
            img = D.createElement('img');
            img.src = card.avatar_url;
            img.alt = '';
            img.loading = 'lazy';
            img.addEventListener('error', function () {
                img.remove();
                wrap.appendChild(el('span', 'bkchat-avatar-fallback', initials(nameOf(card))));
            });
            wrap.appendChild(img);
        } else {
            wrap.appendChild(el('span', 'bkchat-avatar-fallback', initials(nameOf(card))));
        }
        var frame = null;
        try {
            if (global.BKProfile && global.BKProfile.frameById) frame = global.BKProfile.frameById(card && card.frame);
        } catch (e) { }
        if (frame && frame.id !== 'none' && global.BKProfile && global.BKProfile.frameOverlay) {
            var art = global.BKProfile.frameOverlay(frame.id);
            if (art) {
                art.classList.add('bkchat-avatar-frame-svg');
                wrap.appendChild(art);
            }
        }
        return wrap;
    }

    function rememberCards(list) {
        (list || []).forEach(function (card) {
            if (card && card.student_id) S.cards[card.student_id] = card;
        });
    }
    function cardOf(id) { return S.cards[id] || { student_id: id, display_name: 'Học sinh' }; }

    /* ---------------------------------------------------------------------
       Gọi máy chủ
       ------------------------------------------------------------------ */
    function api(body) {
        if (!global.BKCloud || !global.BKCloud.chatApi) {
            return Promise.reject(new Error('Chat chưa sẵn sàng.'));
        }
        return global.BKCloud.chatApi(body);
    }

    function cloudReady() {
        return !!(global.BKCloud && global.BKCloud.configured && global.BKCloud.configured());
    }

    /* Bảng emoji có tìm kiếm + danh mục; không chiếm toàn màn hình điện thoại. */
    function buildEmojiTray(tray) {
        tray.textContent = '';
        var head = el('div', 'bkchat-emoji-head');
        var search = el('input', 'bkchat-emoji-search');
        search.type = 'search';
        search.placeholder = 'Tìm emoji…';
        search.setAttribute('aria-label', 'Tìm emoji');
        search.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') e.preventDefault();
        });
        head.appendChild(search);
        tray.appendChild(head);

        var cats = el('div', 'bkchat-emoji-cats');
        var grid = el('div', 'bkchat-emoji-grid');
        var active = 'all';

        function paint() {
            grid.textContent = '';
            var q = String(search.value || '').trim().toLowerCase();
            var shown = 0;
            EMOJI_GROUPS.forEach(function (g) {
                if (active !== 'all' && active !== g.id) return;
                var list = g.list.filter(function (emoji) {
                    return !q || emoji.indexOf(q) !== -1 || g.name.toLowerCase().indexOf(q) !== -1;
                });
                if (!list.length) return;
                grid.appendChild(el('div', 'bkchat-emoji-catname', g.name));
                var row = el('div', 'bkchat-emoji-row');
                list.forEach(function (emoji) {
                    var b = el('button', 'bkchat-emoji', emoji);
                    b.type = 'button';
                    b.setAttribute('data-insert-emoji', emoji);
                    b.setAttribute('aria-label', 'Chèn ' + emoji);
                    row.appendChild(b);
                    shown++;
                });
                grid.appendChild(row);
            });
            if (!shown) grid.appendChild(el('p', 'bkchat-emoji-empty', 'Không có emoji phù hợp.'));
        }

        function chip(id, label) {
            var b = el('button', 'bkchat-emoji-cat' + (active === id ? ' is-active' : ''), label);
            b.type = 'button';
            b.setAttribute('data-emoji-cat', id);
            b.setAttribute('aria-pressed', active === id ? 'true' : 'false');
            b.addEventListener('click', function () {
                active = id;
                Array.prototype.forEach.call(cats.querySelectorAll('[data-emoji-cat]'), function (n) {
                    var on = n.getAttribute('data-emoji-cat') === id;
                    n.classList.toggle('is-active', on);
                    n.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                paint();
            });
            cats.appendChild(b);
        }
        chip('all', 'Tất cả');
        EMOJI_GROUPS.forEach(function (g) { chip(g.id, g.name); });

        search.addEventListener('input', paint);
        tray.appendChild(cats);
        tray.appendChild(grid);
        paint();
    }

    /* ---------------------------------------------------------------------
       Dựng giao diện
       ------------------------------------------------------------------ */
    function mount(root) {
        if (!root) return null;
        S.root = root;
        root.classList.add('bkchat');
        clear(root);

        var shell = el('div', 'bkchat-shell');
        var side = el('aside', 'bkchat-side');
        side.setAttribute('aria-label', 'Danh sách cuộc trò chuyện');

        var sideHead = el('div', 'bkchat-side-head');
        sideHead.appendChild(el('h1', 'bkchat-title', 'Chat'));
        var groupBtn = btn('bkchat-icon-btn', '', 'fa-users');
        groupBtn.id = 'bkChatNewGroup';
        groupBtn.setAttribute('aria-label', 'Tạo nhóm chat');
        groupBtn.title = 'Tạo nhóm (tối đa 10 người)';
        sideHead.appendChild(groupBtn);
        side.appendChild(sideHead);

        var searchWrap = el('div', 'bkchat-search');
        var search = D.createElement('input');
        search.type = 'search';
        search.id = 'bkChatSearch';
        search.placeholder = 'Tìm cuộc trò chuyện…';
        search.setAttribute('aria-label', 'Tìm cuộc trò chuyện');
        searchWrap.appendChild(icon('fa-magnifying-glass'));
        searchWrap.appendChild(search);
        side.appendChild(searchWrap);

        var rooms = el('div', 'bkchat-rooms');
        rooms.id = 'bkChatRooms';
        rooms.setAttribute('role', 'list');
        side.appendChild(rooms);

        var sideFoot = el('div', 'bkchat-side-foot');
        var dmBtn = btn('bkchat-primary', 'Nhắn riêng', 'fa-pen-to-square');
        dmBtn.id = 'bkChatNewDm';
        sideFoot.appendChild(dmBtn);
        side.appendChild(sideFoot);

        var main = el('section', 'bkchat-main');
        var head = el('header', 'bkchat-head');
        head.id = 'bkChatHead';
        main.appendChild(head);

        var messages = el('div', 'bkchat-messages');
        messages.id = 'bkChatMessages';
        messages.setAttribute('role', 'log');
        messages.setAttribute('aria-live', 'polite');
        messages.tabIndex = 0;
        main.appendChild(messages);

        var composer = el('form', 'bkchat-composer');
        composer.id = 'bkChatComposer';
        composer.noValidate = true;

        var reply = el('div', 'bkchat-reply');
        reply.id = 'bkChatReply';
        reply.hidden = true;
        composer.appendChild(reply);

        var pending = el('div', 'bkchat-pending');
        pending.id = 'bkChatPending';
        pending.hidden = true;
        composer.appendChild(pending);

        var row = el('div', 'bkchat-composer-row');
        var input = D.createElement('textarea');
        input.id = 'bkChatInput';
        input.rows = 1;
        input.maxLength = 2000;
        input.placeholder = 'Viết tin nhắn…';
        input.setAttribute('aria-label', 'Nội dung tin nhắn');
        row.appendChild(input);

        var emojiBtn = btn('bkchat-icon-btn', '', 'fa-face-smile');
        emojiBtn.id = 'bkChatEmoji';
        emojiBtn.setAttribute('aria-label', 'Chèn biểu tượng cảm xúc');
        row.appendChild(emojiBtn);

        var attachBtn = btn('bkchat-icon-btn', '', 'fa-image');
        attachBtn.id = 'bkChatAttach';
        attachBtn.setAttribute('aria-label', 'Gửi ảnh');
        row.appendChild(attachBtn);

        var file = D.createElement('input');
        file.type = 'file';
        file.accept = 'image/png,image/jpeg,image/webp,image/gif';
        file.id = 'bkChatFile';
        file.hidden = true;
        row.appendChild(file);

        var sendBtn = btn('bkchat-send', '', 'fa-paper-plane');
        sendBtn.type = 'submit';
        sendBtn.id = 'bkChatSend';
        sendBtn.setAttribute('aria-label', 'Gửi tin nhắn');
        row.appendChild(sendBtn);

        composer.appendChild(row);

        var emojiTray = el('div', 'bkchat-emoji-tray');
        emojiTray.id = 'bkChatEmojiTray';
        emojiTray.hidden = true;
        emojiTray.setAttribute('role', 'dialog');
        emojiTray.setAttribute('aria-label', 'Chọn biểu tượng cảm xúc');
        buildEmojiTray(emojiTray);
        composer.appendChild(emojiTray);

        main.appendChild(composer);

        var aside = el('aside', 'bkchat-card');
        aside.id = 'bkChatCard';
        aside.hidden = true;
        aside.setAttribute('aria-label', 'Hồ sơ học sinh');

        shell.appendChild(side);
        shell.appendChild(main);
        shell.appendChild(aside);
        root.appendChild(shell);

        bindEvents();
        boot();
        return S;
    }

    function bindEvents() {
        var root = S.root;
        on(D.getElementById('bkChatNewDm'), 'click', openDmDialog);
        on(D.getElementById('bkChatNewGroup'), 'click', openGroupDialog);
        on(D.getElementById('bkChatSearch'), 'input', function (e) {
            S.filter = String(e.target.value || '').trim().toLowerCase();
            renderRooms();
        });
        on(D.getElementById('bkChatComposer'), 'submit', function (e) {
            e.preventDefault();
            send();
        });
        on(D.getElementById('bkChatInput'), 'keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                send();
            }
        });
        on(D.getElementById('bkChatInput'), 'input', autoGrow);
        on(D.getElementById('bkChatEmoji'), 'click', function () {
            var tray = D.getElementById('bkChatEmojiTray');
            if (tray) tray.hidden = !tray.hidden;
        });
        on(D.getElementById('bkChatEmojiTray'), 'click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-insert-emoji]') : null;
            if (!b) return;
            insertAtCursor(String(b.getAttribute('data-insert-emoji') || ''));
        });
        on(D.getElementById('bkChatAttach'), 'click', function () {
            var f = D.getElementById('bkChatFile');
            if (f) f.click();
        });
        on(D.getElementById('bkChatFile'), 'change', function (e) {
            var file = e.target.files && e.target.files[0];
            if (file) pickImage(file);
            e.target.value = '';
        });
        on(D.getElementById('bkChatMessages'), 'click', onMessageClick);
        on(D.getElementById('bkChatRooms'), 'click', function (e) {
            var row = e.target.closest ? e.target.closest('[data-room]') : null;
            if (!row) return;
            openRoom(String(row.getAttribute('data-room')));
        });
        on(D.getElementById('bkChatCard'), 'click', function (e) {
            var dm = e.target.closest ? e.target.closest('[data-dm]') : null;
            if (dm) openDm(dm.getAttribute('data-dm'));
            if (e.target.closest && e.target.closest('[data-close-card]')) closeCard();
        });
        on(D.getElementById('bkChatHead'), 'click', function (e) {
            var info = e.target.closest ? e.target.closest('[data-room-info]') : null;
            if (info) openGroupInfo();
        });
    }

    function autoGrow() {
        var input = D.getElementById('bkChatInput');
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = Math.min(140, input.scrollHeight) + 'px';
    }

    function insertAtCursor(text) {
        var input = D.getElementById('bkChatInput');
        if (!input) return;
        var start = input.selectionStart == null ? input.value.length : input.selectionStart;
        var end = input.selectionEnd == null ? input.value.length : input.selectionEnd;
        input.value = input.value.slice(0, start) + text + input.value.slice(end);
        input.selectionStart = input.selectionEnd = start + text.length;
        input.focus();
        autoGrow();
    }

    /* ---------------------------------------------------------------------
       Khởi động & phòng
       ------------------------------------------------------------------ */
    function boot() {
        if (!cloudReady()) {
            renderNotice('Chat cần kết nối Supabase. Hãy cấu hình máy chủ để dùng phòng chung, tin nhắn riêng và nhóm.');
            return;
        }
        if (S.loading) return;
        S.loading = true;
        renderNotice('Đang mở Chat…');
        api({ action: 'bootstrap' }).then(function (data) {
            S.loading = false;
            S.error = null;
            S.booted = true;
            S.me = data.me || null;
            S.rooms = Array.isArray(data.rooms) ? data.rooms : [];
            S.maxGroup = Number(data.maxGroup) || 10;
            S.totalUnread = Number(data.totalUnread) || 0;
            rememberCards([S.me].concat(collectCards(S.rooms)));
            renderRooms();
            paintUnread();
            subscribe();
            var wanted = S.active && S.active.id;
            var room = wanted && findRoom(wanted);
            if (!room) room = S.rooms.filter(function (r) { return r.kind === 'global'; })[0] || S.rooms[0] || null;
            if (room) openRoom(room.id, true);
            else renderThread();
        }).catch(function (err) {
            S.loading = false;
            S.error = err;
            renderNotice(errorText(err));
        });
    }

    function collectCards(rooms) {
        var out = [];
        (rooms || []).forEach(function (room) {
            (room.members || []).forEach(function (m) { out.push(m); });
            if (room.last_message) out.push({ student_id: room.last_message.student_id, display_name: room.last_message.sender_name });
        });
        return out;
    }

    function errorText(err) {
        var msg = err && err.message ? err.message : 'Không tải được Chat.';
        if (/404|failed to send|failed to fetch|networkerror|load failed|not found|fetch/i.test(msg)) {
            return 'Máy chủ Chat chưa được triển khai. Chạy migration 20261120000000 và deploy Edge Function chat-api để bật Chat.';
        }
        return msg;
    }

    function findRoom(id) {
        for (var i = 0; i < S.rooms.length; i++) if (S.rooms[i].id === id) return S.rooms[i];
        return null;
    }

    function roomTitle(room) {
        if (!room) return 'Chat';
        if (room.kind === 'global') return room.title || 'Phòng chung';
        if (room.kind === 'group') return room.title || 'Nhóm';
        var others = (room.members || []).filter(function (m) { return m.student_id !== (S.me && S.me.student_id); });
        var names = others.map(nameOf);
        return names.length ? names.join(', ') : 'Tin nhắn riêng';
    }

    function renderNotice(text) {
        var box = D.getElementById('bkChatMessages');
        if (!box) return;
        clear(box);
        box.appendChild(el('div', 'bkchat-notice', text));
        var head = D.getElementById('bkChatHead');
        if (head) {
            clear(head);
            var back = btn('bkchat-icon-btn bkchat-back', '', 'fa-arrow-left');
            back.addEventListener('click', function () {
                S.active = null;
                if (S.root) S.root.classList.remove('is-thread');
                renderThread();
                renderRooms();
            });
            head.appendChild(back);
            head.appendChild(el('div', 'bkchat-head-title', 'Chat'));
        }
    }

    function renderRooms() {
        var box = D.getElementById('bkChatRooms');
        if (!box) return;
        clear(box);
        var rooms = S.rooms.slice().sort(function (a, b) {
            return String(b.last_message_at || '').localeCompare(String(a.last_message_at || ''));
        });
        if (S.filter) {
            rooms = rooms.filter(function (room) {
                var hay = roomTitle(room).toLowerCase();
                (room.members || []).forEach(function (m) { hay += ' ' + nameOf(m).toLowerCase(); });
                return hay.indexOf(S.filter) !== -1;
            });
        }
        if (!rooms.length) {
            box.appendChild(el('div', 'bkchat-empty', S.filter ? 'Không tìm thấy cuộc trò chuyện.' : 'Chưa có cuộc trò chuyện nào.'));
            return;
        }
        rooms.forEach(function (room) {
            var row = el('button', 'bkchat-room' + (S.active && S.active.id === room.id ? ' is-active' : ''));
            row.type = 'button';
            row.setAttribute('data-room', room.id);
            row.setAttribute('role', 'listitem');

            var avatar = room.kind === 'global'
                ? el('span', 'bkchat-room-icon', '💬')
                : room.kind === 'group'
                    ? el('span', 'bkchat-room-icon', '👥')
                    : avatarFor(otherMember(room), 40);
            row.appendChild(avatar);

            var body = el('span', 'bkchat-room-body');
            var top = el('span', 'bkchat-room-top');
            top.appendChild(el('span', 'bkchat-room-name', roomTitle(room)));
            if (room.last_message_at) top.appendChild(el('span', 'bkchat-room-time', shortTime(room.last_message_at)));
            body.appendChild(top);

            var preview = el('span', 'bkchat-room-preview');
            var last = room.last_message;
            if (last) {
                var who = last.student_id === (S.me && S.me.student_id) ? 'Bạn: ' : (room.kind === 'global' || room.kind === 'group' ? last.sender_name + ': ' : '');
                preview.textContent = last.deleted ? 'Tin nhắn đã được xoá' : (last.body ? who + last.body : who + '📷 Ảnh');
            } else {
                preview.textContent = room.kind === 'global' ? 'Cả trường cùng trò chuyện' : 'Bắt đầu trò chuyện';
            }
            body.appendChild(preview);
            row.appendChild(body);

            if (room.unread) {
                var badge = el('span', 'bkchat-unread', room.unread > 99 ? '99+' : String(room.unread));
                badge.setAttribute('aria-label', room.unread + ' tin chưa đọc');
                row.appendChild(badge);
            }
            box.appendChild(row);
        });
    }

    function otherMember(room) {
        if (!room) return null;
        var me = S.me && S.me.student_id;
        var others = (room.members || []).filter(function (m) { return m.student_id !== me; });
        return others[0] || room.members && room.members[0] || null;
    }

    function paintUnread() {
        var total = 0;
        S.rooms.forEach(function (r) { total += Number(r.unread) || 0; });
        S.totalUnread = total;
        try {
            var base = 'Chat — Bá Khí';
            D.title = total ? '(' + total + ') ' + base : base;
        } catch (e) { }
    }

    /* ---------------------------------------------------------------------
       Mở phòng & tin nhắn
       ------------------------------------------------------------------ */
    function openRoom(id, silent) {
        var room = findRoom(id);
        if (!room) return;
        S.active = room;
        if (S.root) S.root.classList.add('is-thread');
        S.messages = [];
        S.reactions = {};
        S.replyTo = null;
        renderHead();
        renderRooms();
        var box = D.getElementById('bkChatMessages');
        if (box) {
            clear(box);
            box.appendChild(el('div', 'bkchat-notice', 'Đang tải tin nhắn…'));
        }
        api({ action: 'messages.list', room_id: id }).then(function (data) {
            if (!S.active || S.active.id !== id) return;
            if (data.room) {
                room.kind = data.room.kind || room.kind;
                room.title = data.room.title == null ? room.title : data.room.title;
                room.created_by = data.room.created_by || room.created_by;
            }
            S.members = Array.isArray(data.members) ? data.members : [];
            S.messages = Array.isArray(data.messages) ? data.messages : [];
            S.reactions = {};
            (data.reactions || []).forEach(function (r) {
                var key = String(r.message_id);
                (S.reactions[key] = S.reactions[key] || []).push(r);
            });
            rememberCards(S.messages.map(function (m) { return m.sender; }));
            renderHead();
            renderThread();
            markRead();
        }).catch(function (err) {
            if (S.active && S.active.id === id) renderNotice(errorText(err));
        });
        if (!silent) {
            var input = D.getElementById('bkChatInput');
            if (input) setTimeout(function () { input.focus(); }, 0);
        }
    }

    function markRead() {
        if (!S.active) return;
        var roomId = S.active.id;
        clearTimeout(S.readTimer);
        S.readTimer = setTimeout(function () {
            api({ action: 'read.mark', room_id: roomId }).catch(function () { });
        }, 900);
        var room = findRoom(roomId);
        if (room && room.unread) {
            room.unread = 0;
            renderRooms();
            paintUnread();
        }
    }

    function renderHead() {
        var head = D.getElementById('bkChatHead');
        if (!head) return;
        clear(head);
        var back = btn('bkchat-icon-btn bkchat-back', '', 'fa-arrow-left');
        back.addEventListener('click', function () {
            S.active = null;
            if (S.root) S.root.classList.remove('is-thread');
            renderThread();
            renderRooms();
        });
        head.appendChild(back);
        if (!S.active) {
            head.appendChild(el('div', 'bkchat-head-title', 'Chọn một cuộc trò chuyện'));
            return;
        }
        var room = S.active;
        var avatar = room.kind === 'dm'
            ? avatarFor(otherMember(room), 38, true)
            : el('span', 'bkchat-head-icon', room.kind === 'global' ? '💬' : '👥');
        head.appendChild(avatar);

        var info = el('div', 'bkchat-head-text');
        info.appendChild(el('div', 'bkchat-head-title', roomTitle(room)));
        var sub = '';
        if (room.kind === 'global') sub = 'Phòng chung — cả trường';
        else if (room.kind === 'group') sub = (room.member_count || (room.members || []).length) + '/' + S.maxGroup + ' thành viên';
        else sub = 'Tin nhắn riêng';
        info.appendChild(el('div', 'bkchat-head-sub', sub));
        head.appendChild(info);

        if (room.kind === 'group' && room.created_by === (S.me && S.me.student_id)) {
            var settings = btn('bkchat-icon-btn', '', 'fa-gear');
            settings.setAttribute('data-room-info', '1');
            settings.setAttribute('aria-label', 'Quản lý nhóm');
            head.appendChild(settings);
        }
    }

    function renderThread() {
        var box = D.getElementById('bkChatMessages');
        if (!box) return;
        clear(box);
        if (!S.active) {
            box.appendChild(el('div', 'bkchat-notice', 'Chọn một cuộc trò chuyện ở cột bên trái.'));
            return;
        }
        if (!S.messages.length) {
            box.appendChild(el('div', 'bkchat-notice', 'Chưa có tin nhắn. Hãy gửi lời chào đầu tiên!'));
            return;
        }
        var lastDay = '';
        var me = S.me && S.me.student_id;
        S.messages.forEach(function (m, index) {
            if (!lastDay || !sameDay(lastDay, m.created_at)) {
                lastDay = m.created_at;
                var day = el('div', 'bkchat-day', fmtDay(m.created_at));
                box.appendChild(day);
            }
            box.appendChild(messageNode(m, index > 0 ? S.messages[index - 1] : null, me));
        });
        scrollBottom();
    }

    function messageNode(m, prev, me) {
        var own = m.student_id === me;
        var sameSender = prev && prev.student_id === m.student_id && sameDay(prev.created_at, m.created_at) &&
            (new Date(m.created_at) - new Date(prev.created_at)) < 5 * 60000;
        var wrap = el('article', 'bkchat-msg' + (own ? ' is-own' : '') + (sameSender ? ' is-continuation' : ''));
        wrap.setAttribute('data-message', m.id);

        /* Hàng chính: avatar + bong bóng. Avatar căn theo đáy BONG BÓNG, không
           theo reaction/meta (những thứ đó nằm ở hàng riêng bên dưới). */
        var mainRow = el('div', 'bkchat-msg-main');
        if (!own) {
            if (sameSender) mainRow.appendChild(el('span', 'bkchat-msg-avatar-space'));
            else mainRow.appendChild(avatarFor(m.sender, 34, true));
        }

        var bubbleWrap = el('div', 'bkchat-msg-body');
        if (!own && !sameSender) {
            var nameRow = el('button', 'bkchat-msg-name');
            nameRow.type = 'button';
            nameRow.setAttribute('data-profile', m.student_id);
            nameRow.textContent = nameOf(m.sender);
            var roleLabel = (global.BKRoles && global.BKRoles.labelFor) ? global.BKRoles.labelFor(m.student_id) : '';
            if (roleLabel) {
                nameRow.appendChild(el('span', 'bkchat-role', roleLabel));
            }
            bubbleWrap.appendChild(nameRow);
        }

        var bubble = el('div', 'bkchat-bubble');
        if (m.deleted) {
            bubble.classList.add('is-deleted');
            bubble.appendChild(el('span', 'bkchat-deleted', 'Tin nhắn đã được xoá'));
        } else {
            if (m.image_path) {
                var link = D.createElement('a');
                link.href = imageUrl(m.image_path);
                link.target = '_blank';
                link.rel = 'noopener';
                link.className = 'bkchat-image-link';
                var img = D.createElement('img');
                img.src = link.href;
                img.alt = 'Ảnh trong chat';
                img.loading = 'lazy';
                link.appendChild(img);
                bubble.appendChild(link);
            }
            if (m.body) {
                var text = el('span', 'bkchat-text');
                text.textContent = m.body;
                bubble.appendChild(text);
            }
        }
        bubbleWrap.appendChild(bubble);
        mainRow.appendChild(bubbleWrap);
        wrap.appendChild(mainRow);

        /* Hàng phụ: reaction và thời gian, thụt lề bằng avatar để thẳng bong bóng. */
        var extra = el('div', 'bkchat-msg-extra');

        var reactionRows = S.reactions[m.id] || [];
        if (reactionRows.length) {
            var chips = el('div', 'bkchat-reactions');
            chips.appendChild(chipGroup(m, reactionRows, me));
            extra.appendChild(chips);
        }

        var meta = el('div', 'bkchat-meta');
        meta.appendChild(el('span', 'bkchat-time', fmtTime(m.created_at)));
        if (!m.deleted) {
            var reactBtn = btn('bkchat-msg-action', 'Thả cảm xúc', 'fa-face-smile');
            reactBtn.setAttribute('data-react', m.id);
            reactBtn.setAttribute('aria-label', 'Thả cảm xúc cho tin nhắn');
            meta.appendChild(reactBtn);
        }
        if (own && !m.deleted) {
            var del = btn('bkchat-msg-action', 'Xoá', 'fa-trash-can');
            del.setAttribute('data-delete', m.id);
            del.setAttribute('aria-label', 'Xoá tin nhắn');
            meta.appendChild(del);
        }
        extra.appendChild(meta);
        wrap.appendChild(extra);
        return wrap;
    }

    function chipGroup(message, rows, me) {
        var frag = D.createDocumentFragment();
        var grouped = {};
        rows.forEach(function (r) {
            var emoji = String(r.emoji || '');
            if (!emoji) return;
            grouped[emoji] = grouped[emoji] || { count: 0, mine: false };
            grouped[emoji].count++;
            if (r.student_id === me) grouped[emoji].mine = true;
        });
        Object.keys(grouped).forEach(function (emoji) {
            var chip = el('button', 'bkchat-reaction' + (grouped[emoji].mine ? ' is-mine' : ''));
            chip.type = 'button';
            chip.setAttribute('data-emoji', emoji);
            chip.setAttribute('data-message', message.id);
            chip.textContent = emoji + ' ' + grouped[emoji].count;
            var label = emoji + ', ' + grouped[emoji].count + ' người thả';
            chip.setAttribute('aria-label', label);
            frag.appendChild(chip);
        });
        return frag;
    }

    function imageUrl(path) {
        if (!path) return '';
        try {
            if (global.BKCloud && global.BKCloud.storagePublicUrl) {
                return global.BKCloud.storagePublicUrl('chat-images', path);
            }
        } catch (e) { }
        return '';
    }

    function scrollBottom() {
        var box = D.getElementById('bkChatMessages');
        if (box) box.scrollTop = box.scrollHeight;
    }

    /* ---------------------------------------------------------------------
       Gửi tin nhắn, ảnh, cảm xúc
       ------------------------------------------------------------------ */
    function send() {
        if (!S.active || S.loadingSend) return;
        var input = D.getElementById('bkChatInput');
        var text = input ? String(input.value || '').trim() : '';
        var image = S.pendingImage && S.pendingImage.path;
        if (!text && !image) return;
        S.loadingSend = true;
        var sendBtn = D.getElementById('bkChatSend');
        if (sendBtn) sendBtn.disabled = true;
        api({
            action: 'messages.send',
            room_id: S.active.id,
            content: text,
            image_path: image || ''
        }).then(function (data) {
            S.loadingSend = false;
            if (sendBtn) sendBtn.disabled = false;
            if (input) { input.value = ''; autoGrow(); }
            clearPendingImage();
            if (data && data.message) {
                appendMessage(data.message);
                touchRoom(S.active.id, data.message);
            }
        }).catch(function (err) {
            S.loadingSend = false;
            if (sendBtn) sendBtn.disabled = false;
            toast(errorText(err), 'error');
        });
    }

    function appendMessage(message) {
        if (!message || !S.active) return;
        if (message.room_id !== S.active.id) return;
        if (S.messages.some(function (m) { return m.id === message.id; })) return;
        var prev = S.messages[S.messages.length - 1] || null;
        S.messages.push(message);
        rememberCards([message.sender]);
        var box = D.getElementById('bkChatMessages');
        if (!box) return;
        var notice = box.querySelector('.bkchat-notice');
        if (notice) clear(box);
        if (!prev || !sameDay(prev.created_at, message.created_at)) {
            var day = el('div', 'bkchat-day', fmtDay(message.created_at));
            day.setAttribute('data-day', message.created_at);
            box.appendChild(day);
        }
        box.appendChild(messageNode(message, prev, S.me && S.me.student_id));
        scrollBottom();
    }

    function touchRoom(roomId, message) {
        var room = findRoom(roomId);
        if (!room) { boot(); return; }
        room.last_message_at = message.created_at || new Date().toISOString();
        room.last_message = {
            id: message.id, student_id: message.student_id, body: message.body,
            image_path: message.image_path, created_at: message.created_at,
            sender_name: nameOf(message.sender)
        };
        if (!S.active || S.active.id !== roomId) {
            room.unread = (Number(room.unread) || 0) + 1;
        }
        renderRooms();
        paintUnread();
    }

    function pickImage(file) {
        if (IMAGE_TYPES.indexOf(file.type) === -1) {
            toast('Chỉ gửi được ảnh PNG, JPEG, WEBP hoặc GIF.', 'error');
            return;
        }
        if (file.size > MAX_IMAGE) {
            toast('Ảnh tối đa 3 MB.', 'error');
            return;
        }
        if (!S.me || !S.me.student_id) {
            toast('Chưa xác định được học sinh.', 'error');
            return;
        }
        var box = D.getElementById('bkChatPending');
        if (!box) return;
        box.hidden = false;
        clear(box);
        box.appendChild(el('span', 'bkchat-pending-name', file.name));
        box.appendChild(el('span', 'bkchat-pending-state', 'Đang tải ảnh…'));
        var ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
        var id = makeId();
        var path = S.me.student_id + '/' + id + '.' + ext;
        global.BKCloud.chatClient().then(function (client) {
            return client.storage.from('chat-images').upload(path, file, {
                contentType: file.type, upsert: false
            });
        }).then(function (res) {
            if (res && res.error) throw new Error(res.error.message || 'Tải ảnh thất bại.');
            S.pendingImage = { path: path, name: file.name };
            clear(box);
            box.hidden = false;
            box.appendChild(el('span', 'bkchat-pending-name', file.name));
            var remove = btn('bkchat-icon-btn', '', 'fa-xmark');
            remove.setAttribute('aria-label', 'Bỏ ảnh đã chọn');
            remove.addEventListener('click', clearPendingImage);
            box.appendChild(remove);
        }).catch(function (err) {
            clear(box);
            box.hidden = true;
            toast(err && err.message ? err.message : 'Không tải được ảnh.', 'error');
        });
    }

    function clearPendingImage() {
        S.pendingImage = null;
        var box = D.getElementById('bkChatPending');
        if (box) { clear(box); box.hidden = true; }
    }

    function makeId() {
        try {
            if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
        } catch (e) { }
        var s = '';
        for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
        return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
    }

    function onMessageClick(e) {
        var target = e.target;
        var profileId = target.closest && target.closest('[data-profile]');
        if (profileId) {
            showCard(String(profileId.getAttribute('data-profile')));
            return;
        }
        var react = target.closest && target.closest('[data-react]');
        if (react) {
            openReactionPicker(react, String(react.getAttribute('data-react')));
            return;
        }
        var chip = target.closest && target.closest('[data-emoji]');
        if (chip) {
            toggleReaction(String(chip.getAttribute('data-message')), String(chip.getAttribute('data-emoji')));
            return;
        }
        var del = target.closest && target.closest('[data-delete]');
        if (del) {
            deleteMessage(String(del.getAttribute('data-delete')));
        }
    }

    function toggleReaction(messageId, emoji) {
        api({ action: 'reactions.toggle', message_id: messageId, emoji: emoji }).then(function (data) {
            S.reactions[messageId] = Array.isArray(data.reactions) ? data.reactions : [];
            renderThread();
        }).catch(function (err) { toast(errorText(err), 'error'); });
    }

    function deleteMessage(messageId) {
        confirmBox('Xoá tin nhắn này? Nội dung sẽ được thay bằng "Tin nhắn đã được xoá".', 'Xoá').then(function (ok) {
            if (!ok) return;
            return api({ action: 'messages.delete', message_id: messageId }).then(function () {
                var m = S.messages.filter(function (x) { return x.id === messageId; })[0];
                if (m) {
                    m.deleted = true;
                    m.body = '';
                    m.image_path = null;
                    renderThread();
                }
            });
        }).catch(function (err) { toast(errorText(err), 'error'); });
    }

    function openReactionPicker(anchor, messageId) {
        closePopovers();
        var pop = el('div', 'bkchat-pop');
        pop.setAttribute('role', 'menu');
        EMOJI.forEach(function (emoji) {
            var b = el('button', 'bkchat-emoji', emoji);
            b.type = 'button';
            b.setAttribute('role', 'menuitem');
            b.addEventListener('click', function () {
                closePopovers();
                toggleReaction(messageId, emoji);
            });
            pop.appendChild(b);
        });
        var host = D.getElementById('bkChatMessages');
        host.appendChild(pop);
        var rect = anchor.getBoundingClientRect();
        var hostRect = host.getBoundingClientRect();
        pop.style.top = Math.max(4, rect.top - hostRect.top + host.scrollTop - 46) + 'px';
        pop.style.left = Math.max(4, Math.min(rect.left - hostRect.left, hostRect.width - 300)) + 'px';
        setTimeout(function () {
            global.addEventListener('click', closePopovers, { once: true });
        }, 0);
    }

    function closePopovers() {
        var host = D.getElementById('bkChatMessages');
        if (!host) return;
        Array.prototype.slice.call(host.querySelectorAll('.bkchat-pop')).forEach(function (n) { n.remove(); });
    }

    /* ---------------------------------------------------------------------
       Profile Card
       ------------------------------------------------------------------ */
    function showCard(studentId) {
        var card = S.cards[studentId];
        if (!card) {
            api({ action: 'profiles.cards', ids: [studentId] }).then(function (data) {
                var list = data && data.profiles;
                if (list && list.length) {
                    rememberCards(list);
                    showCard(studentId);
                }
            }).catch(function () { });
            return;
        }
        var aside = D.getElementById('bkChatCard');
        if (!aside) return;
        clear(aside);
        aside.hidden = false;
        var close = btn('bkchat-icon-btn bkchat-card-close', '', 'fa-xmark');
        close.setAttribute('data-close-card', '1');
        close.setAttribute('aria-label', 'Đóng hồ sơ');
        aside.appendChild(close);

        var hero = el('div', 'bkchat-card-hero');
        hero.appendChild(avatarFor(card, 96));
        hero.appendChild(el('h2', 'bkchat-card-name', nameOf(card)));
        if (card.nickname && card.display_name && card.nickname !== card.display_name) {
            hero.appendChild(el('div', 'bkchat-card-sub', card.display_name));
        }
        aside.appendChild(hero);

        if (card.bio) aside.appendChild(el('p', 'bkchat-card-bio', card.bio));
        var stats = el('div', 'bkchat-card-stats');
        stats.appendChild(el('span', 'bkchat-chip', (Number(card.badge_count) || 0) + ' thành tích'));
        stats.appendChild(el('span', 'bkchat-chip', 'Khung ' + frameName(card.frame)));
        aside.appendChild(stats);

        if (studentId !== (S.me && S.me.student_id)) {
            var dm = btn('bkchat-primary bkchat-block', 'Nhắn riêng', 'fa-paper-plane');
            dm.setAttribute('data-dm', studentId);
            aside.appendChild(dm);
        }
    }

    function frameName(id) {
        try {
            if (global.BKProfile && global.BKProfile.frameById) {
                var f = global.BKProfile.frameById(id);
                return f && f.name ? f.name : 'Mặc định';
            }
        } catch (e) { }
        return 'Mặc định';
    }

    function closeCard() {
        var aside = D.getElementById('bkChatCard');
        if (aside) { aside.hidden = true; clear(aside); }
    }

    /* ---------------------------------------------------------------------
       Realtime
       ------------------------------------------------------------------ */
    function subscribe() {
        if (S.channel || !global.BKCloud || !global.BKCloud.chatClient) return;
        global.BKCloud.chatClient().then(function (client) {
            if (S.destroyed) return;
            S.client = client;
            S.channel = client.channel('bakhi-chat')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function (payload) {
                    var row = payload && payload.new;
                    if (!row || !row.id) return;
                    if (S.me && row.student_id === S.me.student_id) {
                        /* Bản của chính mình: đã thêm khi gửi thành công. */
                        if (S.messages.some(function (m) { return m.id === row.id; })) return;
                    }
                    if (S.active && row.room_id === S.active.id) {
                        ensureSender(row).then(function (message) {
                            if (!message) return;
                            appendMessage(message);
                            markRead();
                        });
                    } else {
                        touchRoom(row.room_id, {
                            id: row.id, student_id: row.student_id, body: row.body,
                            image_path: row.image_path, created_at: row.created_at, sender: cardOf(row.student_id)
                        });
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, function (payload) {
                    var row = payload && payload.new;
                    if (!row || !row.id) return;
                    var m = S.messages.filter(function (x) { return x.id === row.id; })[0];
                    if (!m) return;
                    m.deleted = !!row.deleted_at;
                    m.body = row.deleted_at ? '' : String(row.body || '');
                    m.image_path = row.deleted_at ? null : row.image_path;
                    renderThread();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, function (payload) {
                    var row = payload && (payload.new || payload.old);
                    if (!row || !row.message_id) return;
                    refreshReactions(String(row.message_id));
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_rooms' }, function (payload) {
                    var row = payload && payload.new;
                    if (!row || !row.id) return;
                    var room = findRoom(row.id);
                    if (!room) { boot(); return; }
                    room.title = row.title == null ? room.title : row.title;
                    room.last_message_at = row.last_message_at || room.last_message_at;
                    renderRooms();
                    if (S.active && S.active.id === room.id) renderHead();
                })
                .subscribe();
        }).catch(function () { });
    }

    function ensureSender(row) {
        var card = S.cards[row.student_id];
        var message = {
            id: row.id, room_id: row.room_id, student_id: row.student_id,
            body: row.body, image_path: row.image_path, reply_to: row.reply_to,
            created_at: row.created_at, deleted: !!row.deleted_at,
            sender: card || { student_id: row.student_id, display_name: 'Học sinh' }
        };
        if (card) return Promise.resolve(message);
        return api({ action: 'profiles.cards', ids: [row.student_id] }).then(function (data) {
            if (data && data.profiles) rememberCards(data.profiles);
            message.sender = cardOf(row.student_id);
            return message;
        }).catch(function () { return message; });
    }

    function refreshReactions(messageId) {
        if (!S.messages.some(function (m) { return m.id === messageId; })) return;
        api({ action: 'messages.list', room_id: S.active && S.active.id }).then(function (data) {
            if (!S.active) return;
            S.reactions = {};
            (data.reactions || []).forEach(function (r) {
                var key = String(r.message_id);
                (S.reactions[key] = S.reactions[key] || []).push(r);
            });
            renderThread();
        }).catch(function () { });
    }

    /* ---------------------------------------------------------------------
       Dialog: nhắn riêng, tạo nhóm, quản lý nhóm
       ------------------------------------------------------------------ */
    function dialog(title, buildBody, actions) {
        closeDialog();
        var overlay = el('div', 'bkchat-overlay');
        overlay.id = 'bkChatDialog';
        var modal = el('div', 'bkchat-dialog');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', title);
        var head = el('div', 'bkchat-dialog-head');
        head.appendChild(el('h2', null, title));
        var close = btn('bkchat-icon-btn', '', 'fa-xmark');
        close.setAttribute('aria-label', 'Đóng');
        close.addEventListener('click', closeDialog);
        head.appendChild(close);
        modal.appendChild(head);
        var body = el('div', 'bkchat-dialog-body');
        buildBody(body);
        modal.appendChild(body);
        if (actions && actions.length) {
            var foot = el('div', 'bkchat-dialog-foot');
            actions.forEach(function (a) {
                var b = btn(a.cls || 'bkchat-primary', a.label, a.icon);
                b.addEventListener('click', function () { a.onClick(closeDialog); });
                foot.appendChild(b);
            });
            modal.appendChild(foot);
        }
        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDialog(); });
        D.body.appendChild(overlay);
        var first = modal.querySelector('input, textarea, button');
        if (first) setTimeout(function () { first.focus(); }, 0);
        return { overlay: overlay, modal: modal, body: body };
    }

    function closeDialog() {
        var d = D.getElementById('bkChatDialog');
        if (d) d.remove();
    }

    function openDmDialog() {
        var selected = null;
        dialog('Nhắn riêng', function (body) {
            var search = D.createElement('input');
            search.type = 'search';
            search.placeholder = 'Tìm học sinh theo tên…';
            search.className = 'bkchat-input';
            search.setAttribute('aria-label', 'Tìm học sinh');
            body.appendChild(search);
            var list = el('div', 'bkchat-picker');
            body.appendChild(list);
            list.appendChild(el('div', 'bkchat-empty', 'Gõ tên để tìm học sinh.'));
            var timer = null;
            on(search, 'input', function () {
                clearTimeout(timer);
                var q = String(search.value || '').trim();
                timer = setTimeout(function () {
                    api({ action: 'students.search', q: q }).then(function (data) {
                        clear(list);
                        var students = data.students || [];
                        if (!students.length) {
                            list.appendChild(el('div', 'bkchat-empty', 'Không tìm thấy học sinh.'));
                            return;
                        }
                        rememberCards(students);
                        students.forEach(function (card) {
                            var row = el('button', 'bkchat-pick');
                            row.type = 'button';
                            row.appendChild(avatarFor(card, 34));
                            var txt = el('span', 'bkchat-pick-text');
                            txt.appendChild(el('span', 'bkchat-pick-name', nameOf(card)));
                            if (card.nickname && card.display_name) txt.appendChild(el('span', 'bkchat-pick-sub', card.display_name));
                            row.appendChild(txt);
                            row.addEventListener('click', function () { selected = card; openDm(card.student_id); closeDialog(); });
                            list.appendChild(row);
                        });
                    }).catch(function (err) {
                        clear(list);
                        list.appendChild(el('div', 'bkchat-empty', errorText(err)));
                    });
                }, 280);
            });
        });
    }

    function openDm(studentId) {
        if (!studentId) return;
        api({ action: 'dm.open', student_id: studentId }).then(function (data) {
            var existing = findRoom(data.room_id);
            if (existing) {
                openRoom(existing.id);
                return;
            }
            return api({ action: 'bootstrap' }).then(function (fresh) {
                S.rooms = fresh.rooms || S.rooms;
                rememberCards(collectCards(S.rooms));
                renderRooms();
                openRoom(data.room_id);
            });
        }).catch(function (err) { toast(errorText(err), 'error'); });
    }

    function openGroupDialog() {
        var chosen = {};
        dialog('Tạo nhóm', function (body) {
            var title = D.createElement('input');
            title.type = 'text';
            title.className = 'bkchat-input';
            title.maxLength = 80;
            title.placeholder = 'Tên nhóm';
            title.setAttribute('aria-label', 'Tên nhóm');
            body.appendChild(title);
            var hint = el('p', 'bkchat-hint', 'Tối đa ' + S.maxGroup + ' người, kể cả bạn.');
            body.appendChild(hint);
            var search = D.createElement('input');
            search.type = 'search';
            search.className = 'bkchat-input';
            search.placeholder = 'Tìm học sinh để thêm…';
            search.setAttribute('aria-label', 'Tìm học sinh để thêm vào nhóm');
            body.appendChild(search);
            var counter = el('div', 'bkchat-hint', 'Đã chọn: 0');
            body.appendChild(counter);
            var list = el('div', 'bkchat-picker');
            body.appendChild(list);
            var timer = null;
            function runSearch() {
                var q = String(search.value || '').trim();
                api({ action: 'students.search', q: q }).then(function (data) {
                    clear(list);
                    rememberCards(data.students || []);
                    (data.students || []).forEach(function (card) {
                        var row = el('button', 'bkchat-pick' + (chosen[card.student_id] ? ' is-chosen' : ''));
                        row.type = 'button';
                        row.appendChild(avatarFor(card, 32));
                        var txt = el('span', 'bkchat-pick-text');
                        txt.appendChild(el('span', 'bkchat-pick-name', nameOf(card)));
                        row.appendChild(txt);
                        var mark = el('span', 'bkchat-check', chosen[card.student_id] ? '✓' : '');
                        row.appendChild(mark);
                        row.addEventListener('click', function () {
                            if (chosen[card.student_id]) delete chosen[card.student_id];
                            else if (Object.keys(chosen).length >= S.maxGroup - 1) {
                                toast('Nhóm tối đa ' + S.maxGroup + ' người.', 'error');
                                return;
                            } else chosen[card.student_id] = true;
                            row.classList.toggle('is-chosen', !!chosen[card.student_id]);
                            mark.textContent = chosen[card.student_id] ? '✓' : '';
                            counter.textContent = 'Đã chọn: ' + Object.keys(chosen).length;
                        });
                        list.appendChild(row);
                    });
                }).catch(function (err) {
                    clear(list);
                    list.appendChild(el('div', 'bkchat-empty', errorText(err)));
                });
            }
            runSearch();
            on(search, 'input', function () {
                clearTimeout(timer);
                timer = setTimeout(runSearch, 280);
            });
            body._readTitle = function () { return String(title.value || '').trim(); };
            body._readMembers = function () { return Object.keys(chosen); };
        }, [
            {
                label: 'Tạo nhóm', icon: 'fa-check',
                onClick: function (close) {
                    var modal = D.getElementById('bkChatDialog');
                    var body = modal && modal.querySelector('.bkchat-dialog-body');
                    var name = body && body._readTitle ? body._readTitle() : '';
                    var members = body && body._readMembers ? body._readMembers() : [];
                    if (!name) { toast('Hãy đặt tên nhóm.', 'error'); return; }
                    if (!members.length) { toast('Chọn ít nhất một người.', 'error'); return; }
                    api({ action: 'group.create', title: name, member_ids: members }).then(function (data) {
                        close();
                        return api({ action: 'bootstrap' }).then(function (fresh) {
                            S.rooms = fresh.rooms || S.rooms;
                            rememberCards(collectCards(S.rooms));
                            renderRooms();
                            openRoom(data.room_id);
                        });
                    }).catch(function (err) { toast(errorText(err), 'error'); });
                }
            }
        ]);
    }

    function openGroupInfo() {
        if (!S.active || S.active.kind !== 'group') return;
        var room = S.active;
        dialog('Quản lý nhóm', function (body) {
            var nameRow = el('label', 'bkchat-field');
            nameRow.appendChild(el('span', null, 'Tên nhóm'));
            var title = D.createElement('input');
            title.type = 'text';
            title.className = 'bkchat-input';
            title.maxLength = 80;
            title.value = room.title || '';
            nameRow.appendChild(title);
            body.appendChild(nameRow);

            body.appendChild(el('h3', 'bkchat-section-title', 'Thành viên'));
            var list = el('div', 'bkchat-picker');
            body.appendChild(list);
            api({ action: 'messages.list', room_id: room.id }).then(function (data) {
                var ids = (data.members || []).map(function (m) { return m.student_id; });
                return api({ action: 'profiles.cards', ids: ids }).then(function (res) {
                    rememberCards(res.profiles || []);
                    return data;
                }).catch(function () { return data; });
            }).then(function (data) {
                clear(list);
                (data.members || []).forEach(function (m) {
                    var card = cardOf(m.student_id);
                    var row = el('div', 'bkchat-pick');
                    row.appendChild(avatarFor(card, 32));
                    var txt = el('span', 'bkchat-pick-text');
                    txt.appendChild(el('span', 'bkchat-pick-name', nameOf(card)));
                    if (m.role !== 'member') txt.appendChild(el('span', 'bkchat-pick-sub', m.role === 'owner' ? 'Trưởng nhóm' : 'Quản trị'));
                    row.appendChild(txt);
                    if (m.student_id !== (S.me && S.me.student_id)) {
                        var rm = btn('bkchat-icon-btn', '', 'fa-user-minus');
                        rm.setAttribute('aria-label', 'Xoá ' + nameOf(card) + ' khỏi nhóm');
                        rm.addEventListener('click', function () {
                            api({ action: 'group.remove', room_id: room.id, student_id: m.student_id })
                                .then(function () { row.remove(); })
                                .catch(function (err) { toast(errorText(err), 'error'); });
                        });
                        row.appendChild(rm);
                    }
                    list.appendChild(row);
                });
            }).catch(function () { });

            body._rename = function () {
                var value = String(title.value || '').trim();
                if (!value || value === room.title) return Promise.resolve();
                return api({ action: 'group.rename', room_id: room.id, title: value }).then(function () {
                    room.title = value;
                    renderHead();
                    renderRooms();
                });
            };
            body._leave = function () {
                return api({ action: 'group.leave', room_id: room.id }).then(function () {
                    var i = S.rooms.indexOf(room);
                    if (i >= 0) S.rooms.splice(i, 1);
                    S.active = null;
                    renderRooms();
                    renderThread();
                    if (S.root) S.root.classList.remove('is-thread');
                });
            };
        }, [
            {
                label: 'Lưu tên', icon: 'fa-floppy-disk',
                onClick: function (close) {
                    var modal = D.getElementById('bkChatDialog');
                    var body = modal && modal.querySelector('.bkchat-dialog-body');
                    Promise.resolve(body && body._rename ? body._rename() : null)
                        .then(function () { close(); })
                        .catch(function (err) { toast(errorText(err), 'error'); });
                }
            },
            {
                label: 'Rời nhóm', icon: 'fa-right-from-bracket', cls: 'bkchat-danger',
                onClick: function (close) {
                    confirmBox('Rời nhóm này?', 'Rời nhóm').then(function (ok) {
                        if (!ok) return;
                        var modal = D.getElementById('bkChatDialog');
                        var body = modal && modal.querySelector('.bkchat-dialog-body');
                        return body && body._leave ? body._leave() : null;
                    }).then(function () { close(); })
                        .catch(function (err) { toast(errorText(err), 'error'); });
                }
            }
        ]);
    }

    /* ---------------------------------------------------------------------
       Công khai
       ------------------------------------------------------------------ */
    global.BKChat = {
        __ready: true,
        mount: mount,
        refresh: boot,
        openRoom: openRoom,
        state: function () {
            return {
                booted: S.booted, loading: S.loading, me: S.me,
                rooms: S.rooms.length, active: S.active && S.active.id,
                messages: S.messages.length, totalUnread: S.totalUnread,
                error: S.error ? (S.error.message || String(S.error)) : null,
                channel: !!S.channel
            };
        },
        destroy: function () {
            S.destroyed = true;
            clearTimeout(S.readTimer);
            clearTimeout(S.searchTimer);
            if (S.channel && S.channel.unsubscribe) {
                try { S.channel.unsubscribe(); } catch (e) { }
            }
            S.channel = null;
            if (S.root) { clear(S.root); S.root.classList.remove('bkchat'); }
        }
    };
})(typeof window !== 'undefined' ? window : this);
