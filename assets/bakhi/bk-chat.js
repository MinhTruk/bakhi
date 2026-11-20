/* =========================================================================
   Bá Khí — bk-chat.js (8.2.0)
   Chat dùng chung: phòng chung, tin nhắn riêng, nhóm ≤ 10, cảm xúc,
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

    var S = {
        root: null, booted: false, loading: false, error: null,
        me: null, rooms: [], active: null, messages: [], reactions: {},
        members: [], cards: {}, totalUnread: 0, maxGroup: 10,
        channel: null, client: null, filter: '', showArchived: false,
        replyTo: null, readTimer: null, readSeq: 0, readPending: false, lastReadSent: {},
        readGen: 0, readActiveRoom: null, readVisible: false, readAtBottom: false,
        readObserver: null, readPendingGen: null, readPendingThrough: null,
        readRetryCount: 0, destroyed: false,
        presenceTimer: null, searchTimer: null
    };

    /* Đúng 12 cảm xúc máy chủ chấp nhận (chat-api). Giữ khớp tuyệt đối để
       không gửi lên chuỗi bị từ chối. */
    var EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏', '🙏', '✅', '⭐', '💯'];

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

    function vn(ts) {
        try { if (global.BK && global.BK.util && global.BK.util.vnParts) return global.BK.util.vnParts(ts); } catch (e) { }
        var d = new Date(ts);
        if (isNaN(d.getTime())) return null;
        return {
            year: String(d.getFullYear()), month: String(d.getMonth() + 1).padStart(2, '0'),
            day: String(d.getDate()).padStart(2, '0'),
            hour: String(d.getHours()).padStart(2, '0'), minute: String(d.getMinutes()).padStart(2, '0')
        };
    }
    function fmtTime(iso) {
        var p = vn(iso);
        return p ? p.hour + ':' + p.minute : '';
    }
    function fmtDay(iso) {
        var p = vn(iso);
        if (!p) return '';
        var t = vn(Date.now());
        var y = vn(Date.now() - 86400000);
        if (p.year === t.year && p.month === t.month && p.day === t.day) return 'Hôm nay';
        if (p.year === y.year && p.month === y.month && p.day === y.day) return 'Hôm qua';
        return p.day + '/' + p.month + '/' + p.year;
    }
    function sameDay(a, b) {
        var x = vn(a), y = vn(b);
        return !!(x && y && x.year === y.year && x.month === y.month && x.day === y.day);
    }
    function shortTime(iso) {
        var p = vn(iso);
        if (!p) return '';
        var t = vn(Date.now());
        if (p.year === t.year && p.month === t.month && p.day === t.day) return fmtTime(iso);
        if (p.year === t.year) return p.day + '/' + p.month;
        return p.day + '/' + p.month + '/' + p.year.slice(2);
    }

    /* ---------------------------------------------------------------------
       Hồ sơ hiển thị
       ------------------------------------------------------------------ */
    function nameOf(card) {
        if (!card) return 'Học sinh';
        return card.nickname || card.display_name || 'Học sinh';
    }

    /* 7.6.0 — Danh hiệu (Title) là lớp riêng, độc lập badge/khung/thành tích.
       Danh hiệu luôn đứng TRƯỚC tên hiển thị ở mọi vị trí trong chat. */
    function titleOf(card) {
        var t = card && card.title;
        if (!t || typeof t !== 'object') return null;
        var name = String(t.name || '').trim();
        if (!name) return null;
        return {
            id: String(t.id || ''),
            name: name,
            short: String(t.short || name).trim() || name,
            color: String(t.color || ''),
            icon: String(t.icon || ''),
            /* 7.7.0: kiểu hiển thị đặc biệt (font + gradient). */
            style: String(t.style || 'plain') === 'special' ? 'special' : 'plain',
            font: String(t.font || ''),
            palette: String(t.palette || ''),
            effect: String(t.effect || 'none')
        };
    }

    function titleChip(card) {
        var t = titleOf(card);
        if (!t) return null;
        /* Một nguồn vẽ chip duy nhất cho Chat, Hồ sơ và Dashboard. */
        var shared = global.BK && global.BK.titles && typeof global.BK.titles.chip === 'function'
            ? global.BK.titles.chip(t, { className: 'bkchat-title' })
            : null;
        if (shared) return shared;
        var chip = el('span', 'bkchat-title');
        if (/^fa-[a-z0-9-]+$/.test(t.icon)) chip.appendChild(icon(t.icon, 'bkchat-title-icon'));
        chip.appendChild(D.createTextNode(t.short.toUpperCase()));
        chip.title = t.name;
        chip.setAttribute('aria-label', 'Danh hiệu: ' + t.name);
        if (/^#[0-9a-fA-F]{3,8}$/.test(t.color)) {
            chip.style.setProperty('--bkchat-title-color', t.color);
        }
        return chip;
    }

    /* Tên có danh hiệu đứng trước — dùng cho chỗ cần một nút/khối tên. */
    function nameInto(node, card, cls) {
        var chip = titleChip(card);
        if (chip) node.appendChild(chip);
        node.appendChild(el('span', cls || 'bkchat-name', nameOf(card)));
        return node;
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

    /* ---------------------------------------------------------------------
       Dựng giao diện
       ------------------------------------------------------------------ */
    function mount(root) {
        if (!root) return null;
        S.root = root;
        root.classList.add('bkchat');
        clear(root);

        var shell = el('div', 'bkchat-shell');
        S.shell = shell;
        var side = el('aside', 'bkchat-side');
        side.setAttribute('aria-label', 'Danh sách cuộc trò chuyện');

        var sideHead = el('div', 'bkchat-side-head');
        sideHead.appendChild(el('h1', 'bkchat-title', 'Đoạn chat'));
        var archiveBtn = btn('bkchat-icon-btn', '', 'fa-box-archive');
        archiveBtn.id = 'bkChatArchiveToggle';
        archiveBtn.setAttribute('aria-label', 'Xem hội thoại đã lưu trữ');
        archiveBtn.setAttribute('aria-pressed', 'false');
        archiveBtn.title = 'Hội thoại đã lưu trữ';
        sideHead.appendChild(archiveBtn);
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
        var meRow = el('button', 'bkchat-me');
        meRow.id = 'bkChatMe';
        meRow.type = 'button';
        meRow.setAttribute('aria-label', 'Hồ sơ của bạn');
        meRow.hidden = true;
        sideFoot.appendChild(meRow);
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

        var row = el('div', 'bkchat-composer-row');
        var input = D.createElement('textarea');
        input.id = 'bkChatInput';
        input.rows = 1;
        input.maxLength = 2000;
        input.placeholder = 'Viết tin nhắn…';
        input.setAttribute('aria-label', 'Nội dung tin nhắn');
        row.appendChild(input);

        var sendBtn = btn('bkchat-send', '', 'fa-paper-plane');
        sendBtn.type = 'submit';
        sendBtn.id = 'bkChatSend';
        sendBtn.setAttribute('aria-label', 'Gửi tin nhắn');
        row.appendChild(sendBtn);

        composer.appendChild(row);

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
        watchViewport();
        watchPresence();
        boot();
        return S;
    }

    /* Bàn phím ảo làm visualViewport nhỏ lại nhưng layout viewport (100dvh)
       trên iOS vẫn giữ nguyên. Đặt chiều cao theo vùng nhìn thấy để chỉ khung
       chat co lại, không đẩy cả trang và không làm trang bị cuộn. */
    function fitViewport() {
        var vv = global.visualViewport;
        var h = vv && vv.height ? vv.height : (global.innerHeight || 0);
        var top = 60;
        var bar = D.querySelector('.bk-topbar');
        if (bar && bar.getBoundingClientRect) {
            var measured = bar.getBoundingClientRect().height;
            if (measured > 0) top = measured;
        }
        var rootStyle = D.documentElement.style;
        rootStyle.setProperty('--bkchat-vh', Math.round(h) + 'px');
        rootStyle.setProperty('--bkchat-top', Math.round(top) + 'px');
        /* Trang Chat không có cuộn dọc; nếu iOS còn pan trang để lôi ô nhập
           vào tầm nhìn, đưa trang về đỉnh để header không bị đẩy khỏi màn hình. */
        try { if (global.scrollY) global.scrollTo(0, 0); } catch (e) { }
    }

    function watchViewport() {
        if (S.vvWatched) return;
        S.vvWatched = true;
        var schedule = function () {
            if (S.vvFrame) return;
            S.vvFrame = (global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(function () {
                S.vvFrame = 0;
                fitViewport();
            });
        };
        S.vvSchedule = schedule;
        if (global.visualViewport) {
            global.visualViewport.addEventListener('resize', schedule);
            global.visualViewport.addEventListener('scroll', schedule);
        }
        global.addEventListener('resize', schedule);
        global.addEventListener('orientationchange', schedule);
        D.addEventListener('focusin', function (e) {
            if (e.target && e.target.id === 'bkChatInput') setTimeout(fitViewport, 240);
        });
        D.addEventListener('focusout', function (e) {
            if (e.target && e.target.id === 'bkChatInput') setTimeout(fitViewport, 120);
        });
        fitViewport();
    }

    function bindEvents() {
        var root = S.root;
        on(D.getElementById('bkChatNewDm'), 'click', openDmDialog);
        on(D.getElementById('bkChatNewGroup'), 'click', openGroupDialog);
        on(D.getElementById('bkChatMe'), 'click', function () {
            if (S.me) showCard(S.me.student_id);
        });
        on(D.getElementById('bkChatArchiveToggle'), 'click', function () {
            S.showArchived = !S.showArchived;
            var toggle = D.getElementById('bkChatArchiveToggle');
            if (toggle) {
                toggle.classList.toggle('is-on', S.showArchived);
                toggle.setAttribute('aria-pressed', S.showArchived ? 'true' : 'false');
                toggle.title = S.showArchived ? 'Quay lại hội thoại đang hoạt động' : 'Hội thoại đã lưu trữ';
            }
            renderRooms();
        });
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
        on(D.getElementById('bkChatMessages'), 'click', onMessageClick);
        on(D.getElementById('bkChatHead'), 'click', function (e) {
            var hit = e.target.closest && e.target.closest('[data-profile]');
            if (hit) showCard(String(hit.getAttribute('data-profile')));
        });
        on(D.getElementById('bkChatMessages'), 'scroll', function () {
            if (!S.active || !S.readActiveRoom) return;
            nearBottom();
            if (S.readAtBottom) {
                var through = newestMessageAt();
                if (through) scheduleReadThrough(through);
            }
        });
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
            var menu = e.target.closest ? e.target.closest('[data-room-menu]') : null;
            if (menu) {
                e.stopPropagation();
                openConversationOptions(menu);
            }
        });
    }

    function autoGrow() {
        var input = D.getElementById('bkChatInput');
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = Math.min(140, input.scrollHeight) + 'px';
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
            renderMe();
            renderRooms();
            paintUnread();
            subscribe();
            var wanted = S.active && S.active.id;
            var room = wanted && findRoom(wanted);
            if (room && room.archived && !S.showArchived) room = null;
            if (!room) {
                room = S.rooms.filter(function (r) { return !r.archived && r.kind === 'global'; })[0]
                    || S.rooms.filter(function (r) { return !r.archived; })[0]
                    || null;
            }
            var mobile = !!(global.matchMedia && global.matchMedia('(max-width: 900px)').matches);
            /* Điện thoại mở danh sách trước; chọn một người mới mở khung chat. */
            if (room && !mobile) openRoom(room.id);
            else { S.active = null; renderHead(); renderThread(); renderRooms(); }
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
                if (S.root) (S.shell || S.root).classList.remove('is-thread');
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
        var rooms = S.rooms.filter(function (room) {
            return S.showArchived ? !!room.archived : !room.archived;
        }).sort(function (a, b) {
            var pinA = a.pinned ? 1 : 0;
            var pinB = b.pinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;
            if (pinA && pinB) {
                return String(b.pinned_at || '').localeCompare(String(a.pinned_at || ''));
            }
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
            var empty = S.showArchived
                ? 'Chưa lưu trữ hội thoại nào.'
                : (S.filter ? 'Không tìm thấy cuộc trò chuyện.' : 'Chưa có cuộc trò chuyện nào.');
            box.appendChild(el('div', 'bkchat-empty', empty));
            return;
        }
        rooms.forEach(function (room) {
            var row = el('button', 'bkchat-room' + (S.active && S.active.id === room.id ? ' is-active' : '') + (room.pinned ? ' is-pinned' : ''));
            row.type = 'button';
            row.setAttribute('data-room', room.id);
            row.setAttribute('role', 'listitem');

            var person = room.kind === 'dm' ? otherMember(room) : null;
            var avatar = room.kind === 'global'
                ? el('span', 'bkchat-room-icon', '💬')
                : room.kind === 'group'
                    ? el('span', 'bkchat-room-icon', '👥')
                    : avatarFor(person, 40);
            if (person && person.online) {
                avatar.appendChild(el('span', 'bkchat-presence'));
                avatar.setAttribute('title', 'Đang hoạt động');
            }
            row.appendChild(avatar);

            var body = el('span', 'bkchat-room-body');
            var top = el('span', 'bkchat-room-top');
            var name = el('span', 'bkchat-room-name');
            if (room.pinned) {
                var pin = icon('fa-thumbtack', 'bkchat-pin-mark');
                pin.setAttribute('aria-label', 'Đã ghim');
                name.appendChild(pin);
            }
            if (room.kind === 'dm') {
                var dmChip = titleChip(person);
                if (dmChip) name.appendChild(dmChip);
            }
            name.appendChild(D.createTextNode(roomTitle(room)));
            top.appendChild(name);
            if (room.last_message_at) top.appendChild(el('span', 'bkchat-room-time', shortTime(room.last_message_at)));
            body.appendChild(top);

            var preview = el('span', 'bkchat-room-preview');
            var last = room.last_message;
            if (last) {
                var senderTitle = titleOf(cardOf(String(last.student_id)));
                var whoName = (senderTitle ? senderTitle.short.toUpperCase() + ' ' : '') + last.sender_name;
                var who = last.student_id === (S.me && S.me.student_id) ? 'Bạn: ' : (room.kind === 'global' || room.kind === 'group' ? whoName + ': ' : '');
                preview.textContent = last.deleted ? 'Tin nhắn đã được xoá' : (last.body ? who + last.body : who + '📷 Ảnh');
            } else {
                preview.textContent = room.kind === 'global' ? 'Cả trường cùng trò chuyện' : 'Bắt đầu trò chuyện';
            }
            body.appendChild(preview);
            row.appendChild(body);

            if (room.unread) {
                /* Chỉ chấm báo có tin mới, không hiện số đếm. */
                var dot = el('span', 'bkchat-unread-dot');
                dot.setAttribute('role', 'img');
                dot.setAttribute('aria-label', 'Có tin nhắn chưa đọc');
                dot.title = 'Có tin nhắn chưa đọc';
                row.appendChild(dot);
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
        S.rooms.forEach(function (r) {
            if (!r.archived) total += Number(r.unread) || 0;
        });
        S.totalUnread = total;
        /* Chỉ đẩy trạng thái "còn tin chưa đọc" sang lớp Cloud cho chấm báo
           trong menu tài khoản. Không còn số đếm ở bất kỳ đâu. */
        try {
            if (global.BKCloud && global.BKCloud.setChatUnread) {
                global.BKCloud.setChatUnread(total);
            }
        } catch (e) { }
        try {
            D.title = 'Chat — Bá Khí';
        } catch (e) { }
    }

    /* Hàng "Hồ sơ của bạn" ở chân danh sách: mở thẻ hồ sơ của chính mình để
       sửa biệt danh, xem khung/ảnh bìa và danh vị lớp. */
    function renderMe() {
        var host = D.getElementById('bkChatMe');
        if (!host) return;
        clear(host);
        var me = S.me && S.me.student_id;
        if (!me) { host.hidden = true; return; }
        host.hidden = false;
        var card = localProfileCard(cardOf(me));
        host.appendChild(avatarFor(card, 30));
        var text = el('span', 'bkchat-me-text');
        text.appendChild(nameInto(el('span', 'bkchat-me-name'), card, 'bkchat-me-realname'));
        text.appendChild(el('span', 'bkchat-me-sub', 'Hồ sơ của bạn'));
        host.appendChild(text);
    }

    /* Mốc đã đọc do máy chủ lưu trong chat_members.last_read_at. So sánh theo
       thời điểm để biết tin của mình đã được người khác đọc hay chưa. */
    function memberRows() {
        if (S.members && S.members.length) return S.members;
        return (S.active && S.active.members) || [];
    }
    function readStateOf(message) {
        if (!message || !message.created_at) return null;
        var me = S.me && S.me.student_id;
        /* Chỉ tin của chính mình mới có dấu đã đọc: một gạch = đã gửi,
           hai gạch = có người nhận đã đọc. Tin của người khác không cần
           nhãn “Bạn đã đọc” vì chính việc đang xem đã là đã đọc. */
        if (!me || String(message.student_id) !== String(me)) return null;
        var at = Date.parse(message.created_at);
        if (!Number.isFinite(at)) return null;
        var newest = null;
        memberRows().forEach(function (m) {
            if (!m || String(m.student_id) === String(me)) return;
            var other = Date.parse(m.last_read_at || '');
            if (Number.isFinite(other) && (newest === null || other > newest)) newest = other;
        });
        if (newest === null) return { own: true, read: false, label: 'Đã gửi' };
        return newest >= at
            ? { own: true, read: true, label: 'Đã đọc' }
            : { own: true, read: false, label: 'Đã gửi' };
    }
    function updateMemberRead(roomId, studentId, lastReadAt) {
        if (!roomId || !studentId || !lastReadAt) return;
        var mine = S.me && String(studentId) === String(S.me.student_id);
        if (mine) {
            var room = findRoom(roomId);
            if (room) room.last_read_at = lastReadAt;
        }
        if (!S.active || S.active.id !== roomId) return;
        S.members.forEach(function (m) {
            if (String(m.student_id) === String(studentId)) m.last_read_at = lastReadAt;
        });
        if (!S.members.some(function (m) { return String(m.student_id) === String(studentId); })) {
            var known = cardOf(studentId);
            if (known && known.student_id) {
                S.members.push({
                    student_id: known.student_id, display_name: known.display_name,
                    avatar: known.avatar, role: known.role, last_read_at: lastReadAt
                });
            }
        }
        renderThread();
        if (mine) paintUnread();
    }

    /* Menu 3 chấm: đúng hai thao tác (ghim + lưu trữ) dưới dạng hai nút biểu
       tượng có nhãn, mở thành popup nhỏ ngay dưới nút thay vì hộp thoại lớn. */
    function openConversationOptions(anchor) {
        closePopovers();
        var room = S.active;
        if (!room) return;
        var pop = el('div', 'bkchat-pop bkchat-menu-pop');
        pop.id = 'bkChatConvMenu';
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', 'Tuỳ chọn hội thoại');

        function option(label, iconName, onClick) {
            var b = btn('bkchat-menu-item', '', iconName);
            b.setAttribute('role', 'menuitem');
            b.appendChild(el('span', 'bkchat-menu-label', label));
            b.addEventListener('click', function () {
                closePopovers();
                onClick();
            });
            pop.appendChild(b);
            return b;
        }

        option(
            room.pinned ? 'Bỏ ghim' : 'Ghim',
            'fa-thumbtack',
            function () { setConversationPref('pin', !room.pinned); }
        );
        option(
            room.archived ? 'Bỏ lưu trữ' : 'Lưu trữ',
            'fa-box-archive',
            function () { setConversationPref('archive', !room.archived); }
        );

        D.body.appendChild(pop);
        placePopover(pop, anchor, 184);
        if (anchor) anchor.setAttribute('aria-expanded', 'true');
        setTimeout(function () {
            global.addEventListener('click', function (e) {
                if (!pop.contains(e.target)) closePopovers();
            }, { once: true });
            global.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closePopovers();
            }, { once: true });
        }, 0);
        var first = pop.querySelector('button');
        if (first && first.focus) { try { first.focus({ preventScroll: true }); } catch (e) { } }
    }

    function placePopover(pop, anchor, width) {
        var vw = Math.max(240, global.innerWidth || 360);
        var vh = Math.max(320, global.innerHeight || 640);
        var w = Math.min(width || 190, vw - 16);
        var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { bottom: 56, right: vw - 8 };
        pop.style.width = w + 'px';
        pop.style.left = Math.min(Math.max(8, rect.right - w), vw - w - 8) + 'px';
        pop.style.top = Math.min(Math.max(8, rect.bottom + 6), Math.max(8, vh - 140)) + 'px';
    }

    function setConversationPref(kind, value) {
        var room = S.active;
        if (!room) return;
        var previous = {
            pinned: !!room.pinned, pinned_at: room.pinned_at || null,
            archived: !!room.archived, archived_at: room.archived_at || null
        };
        /* Cập nhật lạc quan trước, hoàn tác nếu máy chủ từ chối. */
        if (kind === 'pin') {
            room.pinned = value;
            room.pinned_at = value ? new Date().toISOString() : null;
        } else {
            room.archived = value;
            room.archived_at = value ? new Date().toISOString() : null;
        }
        if (kind === 'archive' && value) {
            S.active = null;
            if (S.root) (S.shell || S.root).classList.remove('is-thread');
        }
        renderRooms();
        renderHead();
        renderThread();
        paintUnread();

        api({
            action: kind === 'pin' ? 'conversation.pin' : 'conversation.archive',
            room_id: room.id,
            value: !!value
        }).then(function (data) {
            if (data && data.pref) {
                room.pinned = !!data.pref.pinned;
                room.pinned_at = data.pref.pinned_at || null;
                room.archived = !!data.pref.archived;
                room.archived_at = data.pref.archived_at || null;
            }
            renderRooms();
            paintUnread();
            toast(kind === 'pin'
                ? (value ? 'Đã ghim hội thoại.' : 'Đã bỏ ghim hội thoại.')
                : (value ? 'Đã lưu trữ hội thoại.' : 'Đã bỏ lưu trữ hội thoại.'));
        }).catch(function (err) {
            room.pinned = previous.pinned;
            room.pinned_at = previous.pinned_at;
            room.archived = previous.archived;
            room.archived_at = previous.archived_at;
            if (kind === 'archive' && value) S.active = room;
            renderRooms();
            renderHead();
            renderThread();
            paintUnread();
            toast(errorText(err), 'error');
        });
    }

    /* ---------------------------------------------------------------------
       Mở phòng & tin nhắn
       ------------------------------------------------------------------ */
    function openRoom(id) {
        var room = findRoom(id);
        if (!room) return;
        /* Dọn dẹp theo dõi phòng cũ trước khi chuyển phòng mới. */
        teardownReadTracking();
        S.readGen++;
        S.readActiveRoom = id;
        S.readVisible = chatVisible();
        S.readAtBottom = false;
        S.readPendingGen = null;
        S.readPendingThrough = null;
        S.readRetryCount = 0;

        S.active = room;
        if (S.root) {
            (S.shell || S.root).classList.add('is-thread');
            (S.shell || S.root).classList.remove('is-side-collapsed');
        }
        S.messages = [];
        S.reactions = {};
        S.replyTo = null;
        S.readPending = false;
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
            if (S.members.length) room.members = S.members;
            S.messages = Array.isArray(data.messages) ? data.messages : [];
            S.reactions = {};
            (data.reactions || []).forEach(function (r) {
                var key = String(r.message_id);
                (S.reactions[key] = S.reactions[key] || []).push(r);
            });
            rememberCards(S.messages.map(function (m) { return m.sender; }));
            /* Tính toán tin chưa đọc của phòng hiện tại từ dữ liệu local để UI
               phản ánh ngay lập tức khi mở phòng (bao gồm cả khi reload/F5),
               không cần đợi API read.mark hoàn tất. */
            var me = S.me && S.me.student_id;
            var myReadAt = 0;
            S.members.forEach(function (m) {
                if (m && String(m.student_id) === String(me)) {
                    var at = Date.parse(m.last_read_at || '');
                    if (Number.isFinite(at) && at > myReadAt) myReadAt = at;
                }
            });
            var unread = 0;
            (S.messages || []).forEach(function (m) {
                if (m && String(m.student_id) !== String(me)) {
                    var at = Date.parse(m && m.created_at);
                    if (Number.isFinite(at) && at > myReadAt) unread++;
                }
            });
            var curRoom = findRoom(id);
            if (curRoom) curRoom.unread = unread;
            renderHead();
            renderThread();
            renderRooms();
            paintUnread();
            /* Thiết lập theo dõi hiển thị tin nhắn sau khi DOM đã vẽ. */
            setupReadTracking(id);
            markRead();
            pingPresence();
        }).catch(function (err) {
            if (S.active && S.active.id === id) renderNotice(errorText(err));
        });
    }

    /* ---------------------------------------------------------------------
       Theo dõi hiển thị tin nhắn (IntersectionObserver).
       Phân biệt: đã tải → đã hiển thị trong viewport → người dùng đã xem.
       ------------------------------------------------------------------ */
    function setupReadTracking(roomId) {
        teardownReadTracking();
        var box = D.getElementById('bkChatMessages');
        if (!box || !global.IntersectionObserver) return;
        S.readObserver = new global.IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var target = entry.target;
                if (!target || !target.getAttribute) return;
                var msgId = target.getAttribute('data-message');
                if (!msgId) return;
                var m = S.messages.find(function (x) { return String(x.id) === String(msgId); });
                if (!m) return;
                /* Tin nhắn của người khác vừa hiện ra trong viewport → xem như đã đọc. */
                if (S.me && String(m.student_id) !== String(S.me.student_id)) {
                    scheduleReadThrough(m.created_at);
                }
            });
        }, { root: box, rootMargin: '0px 0px 100px 0px', threshold: 0.01 });
        /* Quan sát các tin nhắn đã render. */
        box.querySelectorAll('[data-message]').forEach(function (node) {
            S.readObserver.observe(node);
        });
    }

    function teardownReadTracking() {
        if (S.readObserver) {
            try { S.readObserver.disconnect(); } catch (e) { }
            S.readObserver = null;
        }
        clearTimeout(S.readTimer);
        S.readTimer = null;
        S.readPendingGen = null;
        S.readPendingThrough = null;
        S.readRetryCount = 0;
    }

    function scheduleReadThrough(through) {
        if (!S.active || !S.readActiveRoom) return;
        /* Không gửi trùng mốc cùng phòng. */
        if (S.readPendingThrough === through && S.readPendingGen === S.readGen) return;
        S.readPendingThrough = through;
        S.readPendingGen = S.readGen;
        clearTimeout(S.readTimer);
        S.readTimer = setTimeout(function () {
            if (S.readPendingGen !== S.readGen) return;
            markReadThrough(through, false);
        }, 300);
    }

    function cancelPendingRead() {
        clearTimeout(S.readTimer);
        S.readTimer = null;
        S.readPendingGen = null;
        S.readPendingThrough = null;
    }

    function newestMessageAt() {
        var newest = 0;
        var raw = '';
        (S.messages || []).forEach(function (m) {
            var at = Date.parse(m && m.created_at);
            /* Giữ nguyên chuỗi created_at gốc: PostgreSQL lưu microseconds,
               cắt về milliseconds sẽ khiến tin cuối vẫn bị tính là chưa đọc. */
            if (Number.isFinite(at) && (at > newest || (at === newest && m.created_at))) {
                newest = at;
                raw = m.created_at;
            }
        });
        return raw;
    }

    /* Chỉ đánh dấu đã đọc khi tab đang hiện, cửa sổ đang được chú ý, phòng
   này là phòng đang mở, và tin nhắn đã được tải xong. Cập nhật cờ
   S.readVisible để các hàm khác (scroll, IntersectionObserver) có thể dùng. */
function chatVisible() {
    var vis = D.visibilityState === 'visible';
    var focus = true;
    try {
        if (typeof D.hasFocus === 'function') focus = D.hasFocus();
    } catch (e) { focus = true; }
    S.readVisible = vis && focus && !!S.active && !!S.readActiveRoom;
    return S.readVisible;
}

/* Cập nhật cờ S.readAtBottom dựa trên vị trí cuộn khung tin nhắn. */
function nearBottom() {
    var box = D.getElementById('bkChatMessages');
    if (!box) { S.readAtBottom = true; return true; }
    if (!box.clientHeight) { S.readAtBottom = true; return true; }
    var at = (box.scrollHeight - box.scrollTop - box.clientHeight) <= 80;
    S.readAtBottom = at;
    return at;
}

/* Gọi API đánh dấu đã đọc lên mốc `through` (chuỗi created_at gốc).
   immediate = bấm nút thủ công, bypass kiểm tra vị trí cuộn.
   notify = hiện toast sau khi thành công.
   Có retry an toàn (tối đa 3 lần) nếu mạng lỗi. */
function markReadThrough(through, immediate, notify) {
    if (!S.active || !S.readActiveRoom) return;
    if (!through) return;
    var roomId = S.active.id;
    var gen = S.readGen;
    /* Generation token: hủy nếu đã chuyển phòng khác. */
    if (gen !== S.readPendingGen && S.readPendingGen !== null) return;
    if (!immediate) {
        if (!chatVisible()) return;
        if (!nearBottom()) return; /* Chờ sự kiện scroll lần sau. */
    }
    /* Idempotent: không gửi lại mốc đã gửi thành công. */
    if (!immediate && S.lastReadSent[roomId] === through) return;
    var previous = S.active.last_read_at || null;
    var attempt = 0;
    var maxAttempts = 3;
    var send = function () {
        if (S.readGen !== gen) return;
        api({ action: 'read.mark', room_id: roomId, through: through }).then(function (data) {
            if (S.readGen !== gen) return;
            var room = findRoom(roomId);
            if (!room) return;
            room.unread = 0;
            room.last_read_at = (data && data.last_read_at) || through;
            S.lastReadSent[roomId] = through;
            S.readRetryCount = 0;
            updateMemberRead(roomId, S.me && S.me.student_id, room.last_read_at);
            renderRooms();
            paintUnread();
            updateMarkReadButton();
            if (notify) toast('Đã đánh dấu đã đọc.', 'success');
        }).catch(function (err) {
            if (S.readGen !== gen) return;
            attempt++;
            if (attempt < maxAttempts) {
                var delay = Math.min(10000, 500 * Math.pow(2, attempt - 1));
                S.readRetryCount = attempt;
                setTimeout(send, delay);
                return;
            }
            S.readRetryCount = 0;
            var room = findRoom(roomId);
            if (room) room.last_read_at = previous;
            if (notify) toast('Không đánh dấu được đã đọc. Thử lại sau.', 'error');
        });
    };
    if (immediate) send();
    else {
        clearTimeout(S.readTimer);
        S.readTimer = setTimeout(send, 200);
    }
}

/* Giữ tên gọi cũ cho nút bấm thủ công: đánh dấu hết tin trong phòng hiện tại. */
function markRead(immediate, notify) {
    if (!S.active || !S.readActiveRoom) return;
    var through = newestMessageAt();
    if (!through) return;
    markReadThrough(through, immediate !== false, notify);
}

    /* Nút đánh dấu đã đọc ở đầu hội thoại chỉ là biểu tượng ✓✓; khi phòng
       không còn tin chưa đọc thì chuyển sang màu xanh và đổi nhãn trợ năng. */
    function updateMarkReadButton() {
        var markBtn = D.querySelector('#bkChatHead .bkchat-mark-read');
        if (!markBtn) return;
        var done = !(S.active && S.active.unread);
        markBtn.classList.toggle('is-read-done', done);
        markBtn.title = done ? 'Đã đọc hết tin nhắn' : 'Đánh dấu đã đọc';
        markBtn.setAttribute('aria-label', 'Đánh dấu đã đọc');
    }

    function presenceLabel(person) {
        if (!person) return '';
        if (person.online) return 'Đang hoạt động';
        var at = Date.parse(person.last_seen_at || '');
        if (!Number.isFinite(at)) return 'Chưa hoạt động';
        var mins = Math.max(0, Math.floor((Date.now() - at) / 60000));
        if (mins < 1) return 'Vừa hoạt động';
        if (mins < 60) return 'Hoạt động ' + mins + ' phút trước';
        var hours = Math.floor(mins / 60);
        if (hours < 24) return 'Hoạt động ' + hours + ' giờ trước';
        return 'Hoạt động ' + Math.floor(hours / 24) + ' ngày trước';
    }

    function applyPresence(rows) {
        var list = Array.isArray(rows) ? rows : [];
        if (!list.length) return;
        var byId = {};
        list.forEach(function (p) { if (p && p.student_id) byId[String(p.student_id)] = p; });
        function merge(person) {
            var p = person && byId[String(person.student_id)];
            if (!p) return;
            person.online = !!p.online;
            person.last_seen_at = p.last_seen_at || person.last_seen_at || null;
        }
        merge(S.me);
        (S.rooms || []).forEach(function (room) { (room.members || []).forEach(merge); });
        merge((S.active && S.active.members || []).filter(function (m) {
            return S.me && m.student_id === S.me.student_id;
        })[0]);
        (S.members || []).forEach(merge);
    }

    function pingPresence() {
        if (!S.active || D.visibilityState === 'hidden') return;
        var roomId = S.active.id;
        api({ action: 'presence.ping', room_id: roomId }).then(function (data) {
            if (!S.active || S.active.id !== roomId) return;
            applyPresence(data && data.online);
            renderHead();
            renderRooms();
        }).catch(function () { });
    }

    function watchPresence() {
        if (S.presenceTimer) return;
        var tick = function () {
            pingPresence();
            S.presenceTimer = setTimeout(tick, 60000);
        };
        S.presenceTimer = setTimeout(tick, 60000);
        D.addEventListener('visibilitychange', function () {
            if (D.visibilityState === 'visible') {
                chatVisible();
                if (S.active && S.readActiveRoom) {
                    pingPresence();
                    var through = newestMessageAt();
                    if (through) markReadThrough(through, false);
                }
            } else {
                S.readVisible = false;
            }
        });
        /* Quay lại cửa sổ sau khi xem tab khác: đánh dấu đã đọc nếu đủ điều kiện. */
        global.addEventListener('focus', function () {
            chatVisible();
            if (S.active && S.readActiveRoom) {
                var through = newestMessageAt();
                if (through) markReadThrough(through, false);
            }
        });
    }

    function renderHead() {
        var head = D.getElementById('bkChatHead');
        if (!head) return;
        clear(head);
        var collapsed = !!(S.root && (S.shell || S.root).classList.contains('is-side-collapsed'));
        var back = btn('bkchat-icon-btn bkchat-back', '', collapsed ? 'fa-comments' : 'fa-bars');
        back.type = 'button';
        back.setAttribute('aria-label', collapsed ? 'Mở danh sách trò chuyện' : 'Thu gọn danh sách trò chuyện');
        back.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        back.title = collapsed ? 'Mở danh sách trò chuyện' : 'Danh sách trò chuyện';
        back.addEventListener('click', function () {
            var mobile = !!(global.matchMedia && global.matchMedia('(max-width: 900px)').matches);
            if (mobile) {
                S.active = null;
                if (S.root) (S.shell || S.root).classList.remove('is-thread');
                renderHead();
                renderThread();
                renderRooms();
            } else if (S.root) {
                (S.shell || S.root).classList.toggle('is-side-collapsed');
                renderHead();
            }
        });
        head.appendChild(back);
        if (!S.active) {
            head.appendChild(el('div', 'bkchat-head-title', 'Chọn một cuộc trò chuyện để bắt đầu'));
            return;
        }
        var room = S.active;
        var other = room.kind === 'dm' ? otherMember(room) : null;
        var avatar = room.kind === 'dm'
            ? avatarFor(other, 38, true)
            : el('span', 'bkchat-head-icon', room.kind === 'global' ? '💬' : '👥');
        head.appendChild(avatar);

        var info = el('div', 'bkchat-head-text');
        if (other) {
            /* Tên ở đầu cuộc nhắn riêng cũng mở được hồ sơ, như bấm avatar. */
            var titleBtn = el('button', 'bkchat-head-title bkchat-head-link');
            titleBtn.type = 'button';
            titleBtn.setAttribute('data-profile', other.student_id);
            titleBtn.setAttribute('aria-label', 'Xem hồ sơ ' + nameOf(other));
            var headChip = titleChip(other);
            if (headChip) titleBtn.appendChild(headChip);
            titleBtn.appendChild(D.createTextNode(roomTitle(room)));
            info.appendChild(titleBtn);
        } else {
            info.appendChild(el('div', 'bkchat-head-title', roomTitle(room)));
        }
        var sub = '';
        if (room.kind === 'global') sub = 'Phòng chung — cả trường';
        else if (room.kind === 'group') {
            var groupMembers = room.members || [];
            var onlineCount = groupMembers.filter(function (m) { return m.online; }).length;
            sub = (room.member_count || groupMembers.length) + '/' + S.maxGroup + ' thành viên';
            if (onlineCount) sub += ' · ' + onlineCount + ' đang hoạt động';
        } else {
            sub = presenceLabel(other) || 'Tin nhắn riêng';
        }
        info.appendChild(el('div', 'bkchat-head-sub', sub));
        head.appendChild(info);

        var markBtn = btn('bkchat-icon-btn bkchat-mark-read', '', 'fa-check-double');
        markBtn.type = 'button';
        markBtn.title = room.unread ? 'Đánh dấu đã đọc' : 'Đã đọc hết tin nhắn';
        markBtn.setAttribute('aria-label', 'Đánh dấu đã đọc');
        markBtn.classList.toggle('is-read-done', !room.unread);
        markBtn.addEventListener('click', function () { markRead(true, true); });
        head.appendChild(markBtn);

        var options = btn('bkchat-icon-btn', '', 'fa-ellipsis-vertical');
        options.setAttribute('data-room-menu', '1');
        options.setAttribute('aria-label', 'Tuỳ chọn hội thoại');
        options.setAttribute('aria-haspopup', 'menu');
        options.setAttribute('aria-expanded', 'false');
        options.title = 'Ghim hoặc lưu trữ hội thoại';
        head.appendChild(options);

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
            box.appendChild(el('div', 'bkchat-notice', 'Chọn một cuộc trò chuyện để bắt đầu.'));
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
            var senderChip = titleChip(m.sender);
            if (senderChip) nameRow.appendChild(senderChip);
            nameRow.appendChild(D.createTextNode(nameOf(m.sender)));
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

        var readState = readStateOf(m);
        var meta = el('div', 'bkchat-meta');
        meta.appendChild(el('span', 'bkchat-time', fmtTime(m.created_at)));
        if (readState) {
            /* Chỉ biểu tượng, không nhãn chữ: ✓ đã gửi, ✓✓ đã đọc. */
            var readRow = el('span', 'bkchat-read-row' + (readState.read ? ' is-read' : ''));
            readRow.setAttribute('role', 'img');
            readRow.setAttribute('aria-label', readState.label);
            readRow.title = readState.read
                ? 'Người nhận đã đọc tin nhắn này'
                : 'Đã gửi tới máy chủ, chưa có người nhận đọc';
            readRow.appendChild(icon(readState.read ? 'fa-check-double' : 'fa-check', 'bkchat-read-ic'));
            meta.appendChild(readRow);
        }
        if (!m.deleted) {
            /* Nút thả cảm xúc gọn: chỉ biểu tượng, hiện khi rê chuột/focus. */
            var reactBtn = btn('bkchat-msg-action bkchat-react-btn', '', 'fa-face-smile');
            reactBtn.setAttribute('data-react', m.id);
            reactBtn.setAttribute('aria-label', 'Thả cảm xúc');
            reactBtn.setAttribute('aria-haspopup', 'menu');
            reactBtn.setAttribute('aria-expanded', 'false');
            reactBtn.title = 'Thả cảm xúc';
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
        var order = [];
        rows.forEach(function (r) {
            var emoji = String(r.emoji || '');
            if (!emoji) return;
            if (!grouped[emoji]) {
                grouped[emoji] = { count: 0, mine: false, names: [] };
                order.push(emoji);
            }
            grouped[emoji].count++;
            if (String(r.student_id) === String(me)) grouped[emoji].mine = true;
            grouped[emoji].names.push(nameOf(cardOf(String(r.student_id))));
        });
        order.forEach(function (emoji) {
            var g = grouped[emoji];
            var chip = el('button', 'bkchat-reaction' + (g.mine ? ' is-mine' : ''));
            chip.type = 'button';
            chip.setAttribute('data-emoji', emoji);
            chip.setAttribute('data-message', message.id);
            chip.setAttribute('aria-pressed', g.mine ? 'true' : 'false');
            chip.appendChild(el('span', 'bkchat-reaction-emoji', emoji));
            chip.appendChild(el('span', 'bkchat-reaction-count', String(g.count)));
            var names = g.names.slice(0, 4).join(', ');
            if (g.names.length > 4) names += '…';
            var label = emoji + ' ' + g.count + ' người: ' + names;
            chip.setAttribute('aria-label', label);
            chip.title = label;
            frag.appendChild(chip);
        });
        /* Chip "+" nhỏ cuối hàng để thêm cảm xúc khác. */
        var add = el('button', 'bkchat-reaction-add');
        add.type = 'button';
        add.setAttribute('data-react', message.id);
        add.setAttribute('aria-label', 'Thêm cảm xúc');
        add.title = 'Thêm cảm xúc';
        add.appendChild(icon('fa-plus'));
        frag.appendChild(add);
        return frag;
    }

    /* Vẽ lại đúng một tin nhắn khi thả/bỏ cảm xúc, giữ nguyên vị trí cuộn
       thay vì dựng lại cả khung. */
    function renderMessageNode(messageId) {
        var box = D.getElementById('bkChatMessages');
        if (!box) return;
        var old = box.querySelector('[data-message="' + messageId + '"]');
        if (!old) return;
        var index = -1;
        for (var i = 0; i < S.messages.length; i++) {
            if (String(S.messages[i].id) === String(messageId)) { index = i; break; }
        }
        if (index < 0) return;
        var me = S.me && S.me.student_id;
        var next = messageNode(S.messages[index], index > 0 ? S.messages[index - 1] : null, me);
        old.parentNode.replaceChild(next, old);
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
       Gửi tin nhắn và cảm xúc
       ------------------------------------------------------------------ */
    function send() {
        if (!S.active || S.loadingSend) return;
        var input = D.getElementById('bkChatInput');
        var text = input ? String(input.value || '').trim() : '';
        if (!text) return;
        S.loadingSend = true;
        var sendBtn = D.getElementById('bkChatSend');
        if (sendBtn) sendBtn.disabled = true;
        api({
            action: 'messages.send',
            room_id: S.active.id,
            content: text
        }).then(function (data) {
            S.loadingSend = false;
            if (sendBtn) sendBtn.disabled = false;
            if (input) { input.value = ''; autoGrow(); }
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
        if (S.readObserver) S.readObserver.observe(box.lastElementChild);
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
        if ((!S.active || S.active.id !== roomId) && !room.archived) {
            /* Tin của chính mình (gửi từ tab/thiết bị khác) không bao giờ là
               tin chưa đọc của mình. */
            var own = S.me && String(message.student_id) === String(S.me.student_id);
            if (!own) room.unread = (Number(room.unread) || 0) + 1;
        }
        renderRooms();
        paintUnread();
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
        var me = S.me && S.me.student_id;
        var before = (S.reactions[messageId] || []).slice();
        var mine = before.some(function (r) {
            return String(r.student_id) === String(me) && String(r.emoji) === emoji;
        });
        /* Cập nhật lạc quan: thả/bỏ ngay trên giao diện, hoàn tác nếu lỗi. */
        var optimistic = before.filter(function (r) {
            return !(mine && String(r.student_id) === String(me) && String(r.emoji) === emoji);
        });
        if (!mine) {
            optimistic.push({
                message_id: messageId,
                student_id: me,
                emoji: emoji,
                created_at: new Date().toISOString(),
                pending: true
            });
        }
        S.reactions[messageId] = optimistic;
        renderMessageNode(messageId);

        api({ action: 'reactions.toggle', message_id: messageId, emoji: emoji }).then(function (data) {
            S.reactions[messageId] = Array.isArray(data.reactions) ? data.reactions : [];
            renderMessageNode(messageId);
        }).catch(function (err) {
            S.reactions[messageId] = before;
            renderMessageNode(messageId);
            toast(errorText(err), 'error');
        });
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

    /* Bảng cảm xúc: 12 biểu tượng máy chủ chấp nhận, mở thành popover cố định
       để không bị cắt bởi khung tin nhắn. Chọn lại biểu tượng đang có = bỏ. */
    function openReactionPicker(anchor, messageId) {
        closePopovers();
        var me = S.me && S.me.student_id;
        var mine = {};
        (S.reactions[messageId] || []).forEach(function (r) {
            if (me && String(r.student_id) === String(me)) mine[String(r.emoji)] = true;
        });
        var pop = el('div', 'bkchat-pop bkchat-react-picker');
        pop.id = 'bkChatReactPicker';
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', 'Chọn cảm xúc cho tin nhắn');
        EMOJI.forEach(function (emoji) {
            var b = el('button', 'bkchat-react-choice' + (mine[emoji] ? ' is-mine' : ''), emoji);
            b.type = 'button';
            b.setAttribute('role', 'menuitemcheckbox');
            b.setAttribute('aria-checked', mine[emoji] ? 'true' : 'false');
            b.setAttribute('aria-label', (mine[emoji] ? 'Bỏ cảm xúc ' : 'Thả cảm xúc ') + emoji);
            b.addEventListener('click', function () {
                closePopovers();
                toggleReaction(messageId, emoji);
            });
            pop.appendChild(b);
        });
        D.body.appendChild(pop);
        placeReactionPicker(pop, anchor);
        if (anchor) {
            anchor.setAttribute('aria-expanded', 'true');
            anchor.setAttribute('aria-haspopup', 'menu');
        }
        setTimeout(function () {
            global.addEventListener('click', function (e) {
                if (!pop.contains(e.target)) closePopovers();
            }, { once: true });
            global.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') closePopovers();
            }, { once: true });
        }, 0);
    }

    function placeReactionPicker(pop, anchor) {
        var vw = Math.max(260, global.innerWidth || 360);
        var vh = Math.max(320, global.innerHeight || 640);
        var width = Math.min(300, vw - 16);
        var height = 100;
        var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        var left = 8;
        var top = 8;
        if (rect) {
            left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), vw - width - 8);
            top = rect.top - height - 8;
            if (top < 8) top = Math.min(rect.bottom + 8, vh - height - 8);
        }
        pop.style.width = width + 'px';
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
    }

    function closePopovers() {
        Array.prototype.slice.call(D.querySelectorAll('.bkchat-pop')).forEach(function (n) { n.remove(); });
        var menuBtn = D.querySelector('#bkChatHead [data-room-menu]');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
    }

    /* ---------------------------------------------------------------------
       Profile Card
       ------------------------------------------------------------------ */
    /* Hồ sơ của chính mình: ưu tiên bản lưu cục bộ (vừa sửa biệt danh/ảnh)
       để thẻ hồ sơ và tên trong chat đổi ngay, không chờ máy chủ. */
    function localProfileCard(card) {
        var me = S.me && S.me.student_id;
        if (!card || !me || String(card.student_id) !== String(me)) return card;
        var p = null;
        try { p = global.BKProfile && global.BKProfile.get ? global.BKProfile.get() : null; } catch (e) { p = null; }
        if (!p) return card;
        return Object.assign({}, card, {
            nickname: p.nickname || card.nickname || '',
            bio: p.bio || card.bio || '',
            avatar_url: p.avatar || card.avatar_url || '',
            banner_url: p.banner || card.banner_url || '',
            frame: p.frame || card.frame || 'none',
            links: (p.links && p.links.length) ? p.links : (card.links || [])
        });
    }

    function roleLabelsFor(card, studentId) {
        var out = [];
        function push(value) {
            var label = String(value == null ? '' : value).trim().slice(0, 40);
            if (label && out.indexOf(label) < 0) out.push(label);
        }
        (Array.isArray(card && card.roles) ? card.roles : []).forEach(function (r) {
            if (!r) return;
            if (typeof r === 'string') push(r);
            else push(r.label || r.role_label || r.key || r.role_key);
        });
        push(card && card.role_label);
        if (!out.length) {
            try {
                if (global.BKRoles && global.BKRoles.labelFor) push(global.BKRoles.labelFor(studentId));
            } catch (e) { }
        }
        return out;
    }

    function cardLinksOf(card) {
        return (Array.isArray(card && card.links) ? card.links : []).map(function (l) {
            if (!l || typeof l !== 'object') return null;
            var url = '';
            try {
                url = (global.BKProfile && global.BKProfile.safeUrl)
                    ? global.BKProfile.safeUrl(l.url)
                    : String(l.url || '').trim();
            } catch (e) { url = ''; }
            if (!/^(https?:\/\/|mailto:)/i.test(url)) return null;
            return {
                label: String(l.label || '').trim().slice(0, 24) || 'Liên kết',
                url: url
            };
        }).filter(Boolean).slice(0, 6);
    }

    function showCard(studentId) {
        studentId = String(studentId || '');
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
        card = localProfileCard(card);
        S.cardStudent = studentId;
        var self = studentId === String(S.me && S.me.student_id);
        var aside = D.getElementById('bkChatCard');
        if (!aside) return;
        clear(aside);
        aside.hidden = false;
        aside.classList.toggle('has-banner', !!card.banner_url);

        if (card.banner_url) {
            var banner = el('div', 'bkchat-card-banner');
            var bimg = D.createElement('img');
            bimg.src = card.banner_url;
            bimg.alt = '';
            bimg.loading = 'lazy';
            bimg.addEventListener('error', function () { banner.remove(); aside.classList.remove('has-banner'); });
            banner.appendChild(bimg);
            aside.appendChild(banner);
        }

        var close = btn('bkchat-icon-btn bkchat-card-close', '', 'fa-xmark');
        close.setAttribute('data-close-card', '1');
        close.setAttribute('aria-label', 'Đóng hồ sơ');
        aside.appendChild(close);

        var hero = el('div', 'bkchat-card-hero' + (card.banner_url ? ' has-banner' : ''));
        hero.appendChild(avatarFor(card, 96));

        var nameRow = el('div', 'bkchat-card-name-row');
        var cardChip = titleChip(card);
        if (cardChip) nameRow.appendChild(cardChip);
        nameRow.appendChild(el('h2', 'bkchat-card-name', nameOf(card)));
        if (self) {
            var edit = btn('bkchat-card-edit', '', 'fa-pen');
            edit.setAttribute('aria-label', 'Sửa biệt danh');
            edit.title = 'Sửa biệt danh';
            edit.addEventListener('click', openNicknameDialog);
            nameRow.appendChild(edit);
        }
        hero.appendChild(nameRow);

        if (card.nickname && card.display_name && card.nickname !== card.display_name) {
            hero.appendChild(el('div', 'bkchat-card-sub', card.display_name));
        }
        var roles = roleLabelsFor(card, studentId);
        if (roles.length) {
            var roleRow = el('div', 'bkchat-card-roles');
            roles.forEach(function (label) {
                roleRow.appendChild(el('span', 'bkchat-chip bkchat-chip-role', label));
            });
            hero.appendChild(roleRow);
        }
        aside.appendChild(hero);

        if (card.bio) aside.appendChild(el('p', 'bkchat-card-bio', card.bio));

        var links = cardLinksOf(card);
        if (links.length) {
            aside.appendChild(el('h3', 'bkchat-card-section', 'Liên kết'));
            var linkList = el('div', 'bkchat-card-links');
            links.forEach(function (l) {
                var a = D.createElement('a');
                a.className = 'bkchat-card-link';
                a.href = l.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.appendChild(icon('fa-link'));
                a.appendChild(el('span', null, l.label));
                linkList.appendChild(a);
            });
            aside.appendChild(linkList);
        }

        var stats = el('div', 'bkchat-card-stats');
        stats.appendChild(el('span', 'bkchat-chip', (Number(card.badge_count) || 0) + ' thành tích'));
        stats.appendChild(el('span', 'bkchat-chip', 'Khung ' + frameName(card.frame)));
        aside.appendChild(stats);

        if (!self) {
            var dm = btn('bkchat-primary bkchat-block', 'Nhắn riêng', 'fa-paper-plane');
            dm.setAttribute('data-dm', studentId);
            aside.appendChild(dm);
        }
    }

    /* Sửa biệt danh của chính mình: lưu ngay vào hồ sơ cục bộ (BKProfile) và
       để BKCloud đẩy lên máy chủ; chat cập nhật tên mà không cần tải lại. */
    function openNicknameDialog() {
        var me = S.me && S.me.student_id;
        if (!me) return;
        var current = '';
        try {
            if (global.BKProfile && global.BKProfile.get) current = global.BKProfile.get().nickname || '';
        } catch (e) { current = ''; }
        if (!current) current = (S.cards[me] && S.cards[me].nickname) || '';
        dialog('Sửa biệt danh', function (body) {
            var label = el('label', 'bkchat-field');
            label.appendChild(el('span', null, 'Biệt danh'));
            var input = D.createElement('input');
            input.type = 'text';
            input.className = 'bkchat-input';
            input.maxLength = 32;
            input.value = current;
            input.placeholder = 'Ví dụ: Minh Anh';
            input.setAttribute('aria-label', 'Biệt danh hiển thị trong Chat');
            label.appendChild(input);
            body.appendChild(label);
            body.appendChild(el('p', 'bkchat-hint',
                'Biệt danh hiển thị trong Chat và Hồ sơ, tối đa 32 ký tự. Để trống nếu muốn dùng tên thật.'));
        }, [{
            label: 'Lưu biệt danh', icon: 'fa-check',
            onClick: function (close) { saveNickname(close); }
        }]);
    }

    function saveNickname(close) {
        var me = S.me && S.me.student_id;
        var input = D.querySelector('#bkChatDialog input');
        var value = String(input && input.value || '').replace(/\s+/g, ' ').trim().slice(0, 32);
        var nickname = value;
        try {
            if (global.BKProfile && global.BKProfile.save) {
                var saved = global.BKProfile.save({ nickname: value });
                if (saved) nickname = saved.nickname || '';
            }
        } catch (e) { }
        if (S.me) S.me.nickname = nickname;
        if (me) {
            var selfCard = S.cards[me] || (S.cards[me] = { student_id: me, display_name: nameOf(S.me) });
            selfCard.nickname = nickname;
        }
        if (close) close();
        renderMe();
        renderRooms();
        renderHead();
        if (S.active) renderThread();
        if (me) showCard(me);
        toast(nickname ? 'Đã lưu biệt danh.' : 'Đã xoá biệt danh.', 'success');
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
                            /* Chỉ đánh dấu đã đọc nếu người dùng đang xem và ở đáy. */
                            var through = newestMessageAt();
                            if (through) scheduleReadThrough(through);
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
                .on('postgres_changes', { event: '*', schema: 'public', table: 'student_titles' }, function (payload) {
                    /* 7.6.0: Founder trao/thu hồi danh hiệu → cập nhật ngay tên
                       ở danh sách phòng, đầu hội thoại và bong bóng tin nhắn. */
                    var row = payload && (payload.new || payload.old);
                    var sid = row && row.student_id ? String(row.student_id) : '';
                    if (!sid) return;
                    api({ action: 'profiles.cards', ids: [sid] }).then(function (data) {
                        var list = (data && data.profiles) || [];
                        if (list.length) rememberCards(list);
                        else if (S.cards[sid]) S.cards[sid].title = null;
                        renderRooms();
                        renderHead();
                        renderThread();
                        if (S.cardStudent === sid) showCard(sid);
                    }).catch(function () { });
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' }, function (payload) {
                    var row = payload && (payload.new || payload.old);
                    if (!row || !row.message_id) return;
                    refreshReactions(String(row.message_id));
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, function (payload) {
                    /* Mốc đã đọc đổi ở tab/thiết bị khác → cập nhật ngay nhãn
                       “Đã đọc / Bạn đã đọc” mà không cần tải lại trang.
                       Bỏ qua sự kiện cũ hơn mốc đã biết (tránh ghi đè trạng thái mới hơn). */
                    var row = payload && payload.new;
                    if (!row || !row.room_id || !row.student_id || !row.last_read_at) return;
                    var key = String(row.room_id) + '|' + String(row.student_id);
                    var at = Date.parse(row.last_read_at) || 0;
                    var prev = S.readMarks && S.readMarks[key];
                    if (prev !== undefined && at <= prev) return;
                    if (!S.readMarks) S.readMarks = {};
                    S.readMarks[key] = at;
                    updateMemberRead(String(row.room_id), String(row.student_id), row.last_read_at);
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
        dialog('Nhắn riêng', function (body) {
            var search = D.createElement('input');
            search.type = 'search';
            search.placeholder = 'Tìm học sinh theo tên…';
            search.className = 'bkchat-input';
            search.setAttribute('aria-label', 'Tìm học sinh');
            body.appendChild(search);
            var status = el('div', 'bkchat-search-state', 'Đang tải danh sách…');
            status.setAttribute('role', 'status');
            body.appendChild(status);
            var list = el('div', 'bkchat-picker');
            list.setAttribute('aria-live', 'polite');
            body.appendChild(list);

            var seq = 0;
            var timer = null;
            function runSearch(q) {
                var mine = ++seq;
                status.hidden = false;
                status.textContent = q ? 'Đang tìm “' + q + '”…' : 'Đang tải danh sách…';
                api({ action: 'students.search', q: q }).then(function (data) {
                    if (mine !== seq) return;
                    clear(list);
                    var students = data.students || [];
                    rememberCards(students);
                    status.hidden = true;
                    if (!students.length) {
                        list.appendChild(el('div', 'bkchat-empty', q ? 'Không tìm thấy học sinh phù hợp.' : 'Chưa có học sinh khác.'));
                        return;
                    }
                    students.forEach(function (card) {
                        var row = el('button', 'bkchat-pick');
                        row.type = 'button';
                        var av = avatarFor(card, 34);
                        if (card.online) {
                            av.appendChild(el('span', 'bkchat-presence'));
                            av.setAttribute('title', 'Đang hoạt động');
                        }
                        row.appendChild(av);
                        var txt = el('span', 'bkchat-pick-text');
                        txt.appendChild(nameInto(el('span', 'bkchat-pick-name'), card, 'bkchat-pick-realname'));
                        var sub = card.nickname && card.display_name ? card.display_name : '';
                        var presence = presenceLabel(card);
                        if (presence) sub = sub ? sub + ' · ' + presence : presence;
                        txt.appendChild(el('span', 'bkchat-pick-sub' + (card.online ? ' is-online' : ''), sub || 'Học sinh'));
                        row.appendChild(txt);
                        row.addEventListener('click', function () { openDm(card.student_id); closeDialog(); });
                        list.appendChild(row);
                    });
                }).catch(function (err) {
                    if (mine !== seq) return;
                    clear(list);
                    status.hidden = false;
                    status.textContent = errorText(err);
                    var retry = btn('bkchat-retry', 'Thử lại', 'fa-rotate-right');
                    retry.addEventListener('click', function () {
                        runSearch(String(search.value || '').trim());
                    });
                    list.appendChild(retry);
                });
            }
            on(search, 'input', function () {
                clearTimeout(timer);
                var q = String(search.value || '').trim();
                timer = setTimeout(function () { runSearch(q); }, 280);
            });
            runSearch('');
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
                        txt.appendChild(nameInto(el('span', 'bkchat-pick-name'), card, 'bkchat-pick-realname'));
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
                    if (S.root) (S.shell || S.root).classList.remove('is-thread');
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
            teardownReadTracking();
            clearTimeout(S.searchTimer);
            if (S.channel && S.channel.unsubscribe) {
                try { S.channel.unsubscribe(); } catch (e) { }
            }
            S.channel = null;
            if (S.root) { clear(S.root); (S.shell || S.root).classList.remove('bkchat'); }
        }
    };
})(typeof window !== 'undefined' ? window : this);
