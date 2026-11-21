/* =========================================================================
   Bá Khí — bk-profile.js
   Hồ sơ cá nhân local-first dùng chung cho header, trang Hồ sơ và Settings.

   - Một kho dữ liệu duy nhất: localStorage `bakhiProfile.v1`
   - Ảnh đại diện / ảnh bìa được thu nhỏ bằng canvas rồi lưu dạng data URL
   - Không bao giờ dùng innerHTML với dữ liệu người dùng
   - Không chứa bí mật, không gọi mạng

   Công khai: window.BKProfile
   ========================================================================= */
(function (global) {
    'use strict';

    var D = global.document;
    if (!D) return;
    if (global.BKProfile) return;

    var KEY = 'bakhiProfile.v1';
    var FRAMES_KEY = 'bakhiOwnedFrames.v1';
    var SCHEMA = 1;

    var LIMITS = {
        nickname: 32,
        bio: 320,
        links: 6,
        linkLabel: 24,
        linkUrl: 300,
        avatarBytes: 380 * 1024,
        bannerBytes: 620 * 1024,
        uploadBytes: 8 * 1024 * 1024
    };

    /* ---------------------------------------------------------------------
       Khung avatar (trang trí, không thay ảnh gốc)
       ------------------------------------------------------------------ */
    /* 50 khung avatar thật (SVG vẽ bằng path, phần trung tâm trong suốt):
       27 khung thường + 2 khung Developer + 21 khung Founder.

       7.5.3: mỗi badge Founder có đúng một khung độc quyền riêng — 21 badge
       Founder ↔ 21 khung Founder (thêm Genesis, Nexus, Prime Code, Legacy;
       6 khung thế hệ 7.3.0 được vẽ lại bằng bộ hình tượng riêng thay vì ghép
       primitive dùng chung). Mỗi khung Founder có `desc` (mô tả) và `howTo`
       (cách lấy) để hiển thị trong hộp chi tiết khung. */
    var FRAMES = [
        { id: 'none', name: 'Mặc định', tier: 'normal', rarity: 'common', ring: '#94a3b8', orn: [] },
        { id: 'leaf', name: 'Bồ Đề Sơ Diệp', tier: 'normal', rarity: 'common', ring: '#10b981', pc: '#34d399', sc: '#065f46', orn: ['ring', 'laurel'] },
        { id: 'sakura', name: 'Anh Hoa Vũ', tier: 'normal', rarity: 'uncommon', ring: '#f9a8d4', pc: '#f472b6', sc: '#9d174d', orn: ['petals', 'ring'] },
        { id: 'sunflower', name: 'Hướng Dương Tâm', tier: 'normal', rarity: 'uncommon', ring: '#f59e0b', pc: '#fbbf24', sc: '#92400e', orn: ['rays', 'petals'] },
        { id: 'wreath', name: 'Nguyệt Quế Chi Vương', tier: 'normal', rarity: 'uncommon', ring: '#22c55e', pc: '#86efac', sc: '#166534', orn: ['laurel', 'gem'] },
        { id: 'ear-cat', name: 'Miêu Linh Nhĩ', tier: 'normal', rarity: 'rare', ring: '#fb923c', pc: '#fb923c', sc: '#7c2d12', orn: ['earsCat'] },
        { id: 'ear-fox', name: 'Hồ Ly Huyễn Nhĩ', tier: 'normal', rarity: 'rare', ring: '#f97316', pc: '#f97316', sc: '#7c2d12', orn: ['earsFox'] },
        { id: 'ear-bunny', name: 'Ngọc Thố Huyền Nhĩ', tier: 'normal', rarity: 'rare', ring: '#e879f9', pc: '#e879f9', sc: '#701a75', orn: ['earsBunny'] },
        { id: 'ear-wolf', name: 'Thiên Lang Dạ Nhĩ', tier: 'normal', rarity: 'epic', ring: '#64748b', pc: '#94a3b8', sc: '#1e293b', orn: ['earsWolf'] },
        { id: 'antler', name: 'Lộc Giác Tiên Tung', tier: 'normal', rarity: 'epic', ring: '#a16207', pc: '#d97706', sc: '#451a03', orn: ['antlers'] },
        { id: 'horn-dragon', name: 'Long Giác Thiên Uy', tier: 'normal', rarity: 'legendary', ring: '#ef4444', pc: '#f87171', sc: '#7f1d1d', orn: ['horns', 'spikes'] },
        { id: 'crown', name: 'Cửu Trùng Miện', tier: 'normal', rarity: 'legendary', ring: '#eab308', pc: '#facc15', sc: '#a16207', orn: ['crown', 'gem'] },
        { id: 'star', name: 'Tinh Hà Chi Tâm', tier: 'normal', rarity: 'secret', ring: '#8b5cf6', pc: '#a78bfa', sc: '#4c1d95', orn: ['stars', 'halo'] },
        { id: 'royal', name: 'Đế Vương Miện', tier: 'normal', rarity: 'legendary', ring: '#f43f5e', pc: '#facc15', sc: '#9f1239', orn: ['crown', 'wings', 'gem'] },
        { id: 'celestial', name: 'Thiên Giới Huyền Quang', tier: 'normal', rarity: 'epic', ring: '#38bdf8', pc: '#7dd3fc', sc: '#0c4a6e', orn: ['halo', 'stars', 'orbit'] },
        { id: 'cyber', name: 'Lôi Vân Điện Ảnh', tier: 'normal', rarity: 'rare', ring: '#22d3ee', pc: '#22d3ee', sc: '#155e75', orn: ['hex', 'circuit'] },
        { id: 'gothic', name: 'Huyết Dạ Biên Ảnh', tier: 'normal', rarity: 'epic', ring: '#a855f7', pc: '#c084fc', sc: '#3b0764', orn: ['batwings', 'thorns'] },
        { id: 'crystal', name: 'Lưu Ly Tịnh Giới', tier: 'normal', rarity: 'rare', ring: '#67e8f9', pc: '#a5f3fc', sc: '#164e63', orn: ['crystal', 'gem'] },
        { id: 'infernal', name: 'Diệm Ngục Hồng Liên', tier: 'normal', rarity: 'legendary', ring: '#f97316', pc: '#fb923c', sc: '#7c2d12', orn: ['flames', 'horns'] },
        { id: 'divine', name: 'Thần Quang Thánh Vũ', tier: 'normal', rarity: 'legendary', ring: '#fde68a', pc: '#fef3c7', sc: '#b45309', orn: ['rays', 'halo', 'wings'] },
        { id: 'galactic', name: 'Ngân Hà Tinh Đồ', tier: 'normal', rarity: 'epic', ring: '#818cf8', pc: '#a5b4fc', sc: '#312e81', orn: ['orbit', 'stars'] },
        { id: 'ancient', name: 'Cổ Văn Thần Ấn', tier: 'normal', rarity: 'epic', ring: '#d6d3d1', pc: '#e7e5e4', sc: '#44403c', orn: ['runes', 'ring', 'sigil'] },
        { id: 'legendary', name: 'Bất Diệt Huyền Hoàng', tier: 'normal', rarity: 'legendary', ring: '#fbbf24', pc: '#fcd34d', sc: '#92400e', orn: ['wings', 'crown', 'gem', 'stars'] },
        { id: 'neon', name: 'Nghê Hồng Quang Ảnh', tier: 'normal', rarity: 'rare', ring: '#4ade80', pc: '#4ade80', sc: '#14532d', orn: ['ring', 'circuit', 'spikes'] },
        { id: 'eternal', name: 'Vĩnh Hằng Tinh Tú', tier: 'normal', rarity: 'legendary', ring: '#e879f9', pc: '#f0abfc', sc: '#701a75', orn: ['infinity', 'orbit', 'stars'] },
        { id: 'frost', name: 'Băng Phách Tuyết Ảnh', tier: 'normal', rarity: 'rare', ring: '#93c5fd', pc: '#bfdbfe', sc: '#1e3a8a', orn: ['snow', 'crystal'] },
        { id: 'phoenix', name: 'Phượng Hoàng Niết Bàn', tier: 'normal', rarity: 'legendary', ring: '#fb7185', pc: '#fda4af', sc: '#881337', orn: ['feathers', 'flames'] },
        { id: 'dev-aurora', name: 'Dao Quang Tuyệt Ảnh', tier: 'dev', rarity: 'secret', ring: '#5eead4', pc: '#67e8f9', sc: '#a855f7', orn: ['aurora', 'stars', 'sigil'], anim: true },
        { id: 'dev-void', name: 'Vô Cực Hư Không', tier: 'dev', rarity: 'secret', ring: '#c084fc', pc: '#e9d5ff', sc: '#6d28d9', orn: ['void', 'spikes', 'runes'], anim: true },
        { id: 'founder', name: 'Thiên Khải Sáng Thế', tier: 'founder', rarity: 'secret', ring: '#fbbf24', pc: '#fde68a', sc: '#b91c1c', orn: ['ring'], art: 'thien-khai', anim: true,
            desc: 'Vương miện ánh sáng, vòng nguyệt quế và mười sáu tia sáng — ấn ký tối cao của người khai sáng Bá Khí.',
            howTo: 'Cách lấy: mở khoá badge “Thiên Khải Sáng Thế”; chỉ hồ sơ Founder (is_founder = true) nhận được từ Founder Dashboard.' },
        /* ------------------------------------------------------------------
           10 khung Founder độc quyền — THIẾT KẾ LẠI ở 7.5.0.

           Mỗi khung dùng một bộ vẽ riêng trong FOUNDER_FRAME_ART (nhiều lớp,
           silhouette riêng, phần giữa trong suốt để không che avatar). Các
           khung cũ có hình tượng trùng concept được giữ nguyên id để dữ liệu
           sở hữu không bị mất; 6 khung cũ còn lại chuyển sang `legacy` và vẫn
           trang bị được nhưng không còn nằm trong danh mục trao mới.
           ------------------------------------------------------------------ */
        { id: 'founder-yin-yang', name: 'Âm Dương Thái Cực', tier: 'founder', rarity: 'secret', ring: '#fbbf24', pc: '#fde68a', sc: '#141414', orn: ['ring', 'sigil'], art: 'yin-yang', anim: true, desc: 'Âm dương, thái cực và vòng năng lượng xoắn — ánh kim vàng nhạt trên nền đen trắng.', howTo: 'Cách lấy: mở khoá badge “Âm Dương Thái Cực” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-cyberpunk', name: 'Cyberpunk Overdrive', tier: 'founder', rarity: 'secret', ring: '#22d3ee', pc: '#22d3ee', sc: '#d946ef', orn: ['ring', 'spikes'], art: 'cyberpunk', anim: true, desc: 'Holographic nhiều lớp, mạch điện tử, neon cyan — electric blue — magenta và glitch dữ liệu.', howTo: 'Cách lấy: mở khoá badge “Sát Thủ Tương Lai” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-ancient', name: 'Đế Chế Cổ Đại', tier: 'founder', rarity: 'secret', ring: '#d6d3d1', pc: '#fbbf24', sc: '#7c2d12', orn: ['ring', 'runes'], art: 'ancient-empire', anim: true, desc: 'Đồng cổ và vàng cổ, họa tiết chạm khắc, đền đài, đá quý và ký hiệu cổ.', howTo: 'Cách lấy: mở khoá badge “Cổ Khí Thần Ấn” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-samurai', name: 'Bushido — Kiếm Sĩ', tier: 'founder', rarity: 'secret', ring: '#ef4444', pc: '#f87171', sc: '#0c0a09', orn: ['ring', 'spikes'], art: 'samurai', anim: true, desc: 'Giáp samurai sơn mài đen, đỏ thẫm và vàng, gia huy Nhật Bản và dây buộc giáp.', howTo: 'Cách lấy: mở khoá badge “Bushido” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-astral-observatory', name: 'Thiên Văn Đài', tier: 'founder', rarity: 'secret', ring: '#818cf8', pc: '#c7d2fe', sc: '#1e1b4b', orn: ['ring'], art: 'astral-observatory', anim: true, desc: 'Quỹ đạo thiên thể, chòm sao, xanh đêm — tím vũ trụ — bạc và ngôi sao trung tâm.', howTo: 'Cách lấy: mở khoá badge “Celestial” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-abyssal', name: 'Vực Thẳm', tier: 'founder', rarity: 'secret', ring: '#06b6d4', pc: '#67e8f9', sc: '#0c4a6e', orn: ['ring'], art: 'abyssal', anim: true, desc: 'Đại dương sâu, san hô, pha lê biển và ánh sáng sinh học xanh cyan.', howTo: 'Cách lấy: mở khoá badge “Void Sentinel” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-phoenix-rebirth', name: 'Phượng Hoàng Tái Sinh', tier: 'founder', rarity: 'secret', ring: '#fb7185', pc: '#fbbf24', sc: '#7f1d1d', orn: ['ring'], art: 'phoenix-rebirth', anim: true, desc: 'Lông vũ phượng hoàng, ngọn lửa đỏ — cam — vàng kim, dáng vươn lên từ tro tàn.', howTo: 'Cách lấy: mở khoá badge “Eternal Flame” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-crystal-sovereign', name: 'Pha Lê Đế Vương', tier: 'founder', rarity: 'secret', ring: '#a78bfa', pc: '#e9d5ff', sc: '#4c1d95', orn: ['ring'], art: 'crystal-sovereign', anim: true, desc: 'Pha lê nhiều mặt, tím amethyst và xanh sapphire, khúc xạ ánh sáng.', howTo: 'Cách lấy: mở khoá badge “Ascendant” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-chrono-mechanical', name: 'Cỗ Máy Thời Gian', tier: 'founder', rarity: 'secret', ring: '#d97706', pc: '#fcd34d', sc: '#57534e', orn: ['ring'], art: 'chrono-mechanical', anim: true, desc: 'Bánh răng, đồng hồ, kim loại đồng và bạc với chi tiết cơ khí nhiều lớp.', howTo: 'Cách lấy: mở khoá badge “Chronos” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-frost-emperor', name: 'Băng Đế', tier: 'founder', rarity: 'secret', ring: '#93c5fd', pc: '#e0f2fe', sc: '#1e3a8a', orn: ['ring'], art: 'frost-emperor', anim: true, desc: 'Băng giá, tinh thể tuyết, xanh băng và bạc với hiệu ứng khúc xạ lạnh.', howTo: 'Cách lấy: mở khoá badge “Architect” — badge Founder độc quyền, chỉ Founder trao tay.' },

        /* Khung Founder thế hệ 7.3.0 — giữ nguyên để không mất quyền sở hữu. */
        /* 6 khung thế hệ 7.3.0 — viết lại 7.5.3 bằng bộ vẽ riêng (giữ id để
           không mất quyền sở hữu), kèm mô tả và cách lấy. */
        { id: 'founder-void-emperor', name: 'Vô Cực Hoàng Đế', tier: 'founder', rarity: 'secret', ring: '#0f172a', pc: '#c084fc', sc: '#6d28d9', orn: ['ring'], art: 'void-emperor', anim: true, legacy: true,
            desc: 'Hố đen ở tâm, vòng bồi tụ tím và mười hai mũi hư không — quyền lực của khoảng không tuyệt đối.',
            howTo: 'Cách lấy: mở khoá badge “Vô Cực Hoàng Đế” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-celestial-dragon', name: 'Thiên Long', tier: 'founder', rarity: 'secret', ring: '#fbbf24', pc: '#facc15', sc: '#a16207', orn: ['ring'], art: 'celestial-dragon', anim: true, legacy: true,
            desc: 'Sừng rồng, vảy vàng và ngọc rồng ở tâm — long khí của trời đất.',
            howTo: 'Cách lấy: mở khoá badge “Thiên Long” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-golden-ratio', name: 'Vàng Nguyên Tắc', tier: 'founder', rarity: 'secret', ring: '#f59e0b', pc: '#fbbf24', sc: '#92400e', orn: ['ring'], art: 'golden-ratio', anim: true, legacy: true,
            desc: 'Đường xoắn ốc vàng, các cung tỉ lệ và điểm sao theo tỉ lệ vàng 1,618.',
            howTo: 'Cách lấy: mở khoá badge “Vàng Nguyên Tắc” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-ember-core', name: 'Lòng Nõn', tier: 'founder', rarity: 'secret', ring: '#fb7185', pc: '#fda4af', sc: '#881337', orn: ['ring'], art: 'ember-core', anim: true, legacy: true,
            desc: 'Lõi nham thạch, vành than hồng và tàn lửa bay — sức nóng không bao giờ nguội.',
            howTo: 'Cách lấy: mở khoá badge “Lòng Nõn” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-crystal-mind', name: 'Tinh Thần Tinh Thạch', tier: 'founder', rarity: 'secret', ring: '#38bdf8', pc: '#7dd3fc', sc: '#0c4a6e', orn: ['ring'], art: 'crystal-mind', anim: true, legacy: true,
            desc: 'Vành pha lê nhiều mặt, mảnh tinh thể và đường nơ-ron — trí tuệ kết tinh.',
            howTo: 'Cách lấy: mở khoá badge “Tinh Thần Tinh Thạch” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-neon-lotus', name: 'Sen Neon', tier: 'founder', rarity: 'secret', ring: '#e879f9', pc: '#f0abfc', sc: '#701a75', orn: ['ring'], art: 'neon-lotus', anim: true, legacy: true,
            desc: 'Cánh sen neon hồng tím, viền sáng và hạt sương phát quang.',
            howTo: 'Cách lấy: mở khoá badge “Sen Neon” — badge Founder độc quyền, chỉ Founder trao tay.' },

        /* 4 khung Founder 7.5.3 — bổ sung để 21 badge Founder có đủ 21 khung
           độc quyền (Genesis → Ascendant), mỗi khung một hình tượng riêng. */
        { id: 'founder-genesis', name: 'Khởi Nguyên', tier: 'founder', rarity: 'secret', ring: '#5eead4', pc: '#99f6e4', sc: '#0f766e', orn: ['ring'], art: 'genesis', anim: true,
            desc: 'Lõi năng lượng đầu tiên, hai quỹ đạo nghiêng và chùm tia khởi tạo — điểm bắt đầu của Bá Khí.',
            howTo: 'Cách lấy: mở khoá badge “Genesis” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-nexus', name: 'Liên Kết', tier: 'founder', rarity: 'secret', ring: '#a855f7', pc: '#f0abfc', sc: '#6b21a8', orn: ['ring'], art: 'nexus', anim: true,
            desc: 'Lục giác trung tâm nối sáu nút năng lượng — nơi mọi luồng dữ liệu gặp nhau.',
            howTo: 'Cách lấy: mở khoá badge “Nexus” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-prime-code', name: 'Mã Nguồn Gốc', tier: 'founder', rarity: 'secret', ring: '#22d3ee', pc: '#67e8f9', sc: '#15803d', orn: ['ring'], art: 'prime-code', anim: true,
            desc: 'Ngoặc nhọn, lưới dữ liệu và mạch neon — dòng mã nguồn gốc của nền tảng.',
            howTo: 'Cách lấy: mở khoá badge “Prime Code” — badge Founder độc quyền, chỉ Founder trao tay.' },
        { id: 'founder-legacy', name: 'Di Sản', tier: 'founder', rarity: 'secret', ring: '#fbbf24', pc: '#fde68a', sc: '#713f12', orn: ['ring'], art: 'legacy', anim: true,
            desc: 'Vương miện vàng trên vòng nguyệt quế, dải băng dưới — di sản còn mãi.',
            howTo: 'Cách lấy: mở khoá badge “Legacy” — badge Founder độc quyền, chỉ Founder trao tay.' }
    ];

    function frameById(id) {
        for (var i = 0; i < FRAMES.length; i++) if (FRAMES[i].id === id) return FRAMES[i];
        return FRAMES[0];
    }

    function framesByTier(tier) {
        return FRAMES.filter(function (f) { return f.tier === (tier || 'normal'); });
    }

    /* ---------------------------------------------------------------------
       Vẽ khung bằng SVG. Mọi mảnh đều là hằng số tin cậy, không dùng dữ liệu
       người dùng; màu được chuẩn hoá trước khi chèn vào markup.
       ------------------------------------------------------------------ */
    function safeColor(c, fallback) {
        return /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? String(c) : fallback;
    }
    function leaves(P) {
        var pts = [[34, 20, -35], [25, 30, -55], [20, 42, -80], [19, 56, -95], [23, 70, -115], [31, 82, -135]];
        return pts.map(function (p) {
            var a = p[2];
            return '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="6.2" ry="3.1" transform="rotate(' + a + ' ' + p[0] + ' ' + p[1] + ')"/>';
        }).join('') + pts.map(function (p) {
            var x = 100 - p[0];
            var a = -p[2];
            return '<ellipse cx="' + x + '" cy="' + p[1] + '" rx="6.2" ry="3.1" transform="rotate(' + a + ' ' + x + ' ' + p[1] + ')"/>';
        }).join('');
    }
    function ringGroup(P, inner) {
        return '<g fill="none" stroke="' + P + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + inner + '</g>';
    }
    function prim(name, P, S) {
        var i;
        switch (name) {
            case 'ring':
                return ringGroup(P, '<circle cx="50" cy="50" r="47"/><circle cx="50" cy="50" r="43" stroke="' + S + '" stroke-width="1.2" stroke-dasharray="2 5"/>');
            case 'laurel':
                return ringGroup(P, '<path d="M50 6C31 11 19 29 18 50"/><path d="M50 94C69 89 81 71 82 50"/>') +
                    '<g fill="' + P + '" stroke="' + S + '" stroke-width=".6">' + leaves(P) + '</g>';
            case 'gem':
                return '<path d="M50 84l7 7-7 7-7-7z" fill="' + P + '" stroke="' + S + '" stroke-width="1.2"/>' +
                    '<path d="M50 86l3 5-3 5-3-5z" fill="#fff" opacity=".55"/>';
            case 'crown':
                return '<path d="M28 18l4 17 8-13 10 14 10-14 8 13 4-17 3 22H25z" fill="' + P + '" stroke="' + S + '" stroke-width="1.3"/>' +
                    '<g fill="' + S + '"><circle cx="34" cy="27" r="1.6"/><circle cx="50" cy="29" r="1.6"/><circle cx="66" cy="27" r="1.6"/></g>';
            case 'founderCrown':
                return '<path d="M22 14l5 21 9-16 14 17 14-17 9 16 5-21 3 27H19z" fill="' + P + '" stroke="' + S + '" stroke-width="1.5"/>' +
                    '<path d="M25 36h50" stroke="' + S + '" stroke-width="2"/>' +
                    '<g fill="' + S + '"><circle cx="30" cy="17" r="2.1"/><circle cx="40" cy="30" r="1.7"/><circle cx="50" cy="16" r="2.1"/><circle cx="60" cy="30" r="1.7"/><circle cx="70" cy="17" r="2.1"/></g>';
            case 'wings':
                return ringGroup(P, '<path d="M50 42C36 33 23 29 8 35c8 4 12 10 14 16 6-2 12-1 18 3 4 2 8 5 10 9"/>' +
                    '<path d="M50 58C36 67 23 71 8 65c8-4 12-10 14-16 6 2 12 1 18-3 4-2 8-5 10-9"/>') +
                    '<g transform="translate(100,0) scale(-1,1)">' + ringGroup(P, '<path d="M50 42C36 33 23 29 8 35c8 4 12 10 14 16 6-2 12-1 18 3 4 2 8 5 10 9"/>' +
                    '<path d="M50 58C36 67 23 71 8 65c8-4 12-10 14-16 6 2 12 1 18-3 4-2 8-5 10-9"/>') + '</g>';
            case 'batwings':
                return ringGroup(P, '<path d="M50 40C38 30 24 28 10 34l9 5-6 4 9 3-5 5 10 2 9 6 8 7"/>' +
                    '<path d="M50 60C38 70 24 72 10 66l9-5-6-4 9-3-5-5 10-2 9-6 8-7"/>') +
                    '<g transform="translate(100,0) scale(-1,1)">' + ringGroup(P, '<path d="M50 40C38 30 24 28 10 34l9 5-6 4 9 3-5 5 10 2 9 6 8 7"/>' +
                    '<path d="M50 60C38 70 24 72 10 66l9-5-6-4 9-3-5-5 10-2 9-6 8-7"/>') + '</g>';
            case 'halo':
                return ringGroup(P, '<ellipse cx="50" cy="9" rx="18" ry="4.2"/><ellipse cx="50" cy="9" rx="24" ry="6" stroke="' + S + '" stroke-width="1" opacity=".7"/>');
            case 'horns':
                return ringGroup(P, '<path d="M34 32C25 21 24 9 29 1c7 5 11 12 12 21"/><path d="M66 32C75 21 76 9 71 1c-7 5-11 12-12 21"/>');
            case 'antlers':
                return ringGroup(P, '<path d="M36 33C28 24 25 13 28 3"/><path d="M30 18l-8-4"/><path d="M33 27l-9 1"/><path d="M64 33C72 24 75 13 72 3"/><path d="M70 18l8-4"/><path d="M67 27l9 1"/>');
            case 'spikes':
                var sp = '';
                for (i = 0; i < 16; i++) {
                    var a = (Math.PI * 2 * i) / 16;
                    var x1 = 50 + Math.cos(a) * 43, y1 = 50 + Math.sin(a) * 43;
                    var x2 = 50 + Math.cos(a - 0.09) * 52, y2 = 50 + Math.sin(a - 0.09) * 52;
                    var x3 = 50 + Math.cos(a + 0.09) * 52, y3 = 50 + Math.sin(a + 0.09) * 52;
                    sp += '<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + 'L' + x3.toFixed(1) + ' ' + y3.toFixed(1) + 'z" fill="' + P + '" stroke="none"/>';
                }
                return sp;
            case 'rays':
                var ry = '';
                for (i = 0; i < 24; i++) {
                    var ar = (Math.PI * 2 * i) / 24;
                    var sx = 50 + Math.cos(ar) * 43, sy = 50 + Math.sin(ar) * 43;
                    var ex = 50 + Math.cos(ar) * (i % 2 ? 50 : 56), ey = 50 + Math.sin(ar) * (i % 2 ? 50 : 56);
                    ry += '<path d="M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + ey.toFixed(1) + '"/>';
                }
                return ringGroup(P, ry);
            case 'hex':
                var hx = '';
                var hy = '';
                for (i = 0; i < 6; i++) {
                    var ah = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                    hx += (i ? 'L' : 'M') + (50 + Math.cos(ah) * 48).toFixed(1) + ' ' + (50 + Math.sin(ah) * 48).toFixed(1);
                    hy += (i ? 'L' : 'M') + (50 + Math.cos(ah) * 39).toFixed(1) + ' ' + (50 + Math.sin(ah) * 39).toFixed(1);
                }
                return ringGroup(P, hx + 'Z') + ringGroup(S, hy + 'Z' + '<circle cx="50" cy="2" r="2"/>');
            case 'circuit':
                return ringGroup(P, '<path d="M6 50h9l4-4h7M94 50h-9l-4 4h-7M50 6v9l-4 4v7M50 94v-9l4-4v-7"/>') +
                    '<g fill="' + S + '"><circle cx="15" cy="46" r="2"/><circle cx="85" cy="54" r="2"/><circle cx="46" cy="15" r="2"/><circle cx="54" cy="85" r="2"/></g>';
            case 'crystal':
                var cr = '';
                for (i = 0; i < 8; i++) {
                    var ac = (Math.PI * 2 * i) / 8;
                    var cx = 50 + Math.cos(ac) * 49, cy = 50 + Math.sin(ac) * 49;
                    var cx2 = 50 + Math.cos(ac) * 40, cy2 = 50 + Math.sin(ac) * 40;
                    cr += '<path d="M' + cx2.toFixed(1) + ' ' + cy2.toFixed(1) + 'L' + cx.toFixed(1) + ' ' + cy.toFixed(1) + '" stroke-width="4" opacity=".55"/>';
                    cr += '<path d="M' + cx.toFixed(1) + ' ' + (cy - 1).toFixed(1) + 'l3 4-3 4-3-4z" fill="' + P + '" stroke="none"/>';
                }
                return ringGroup(P, cr);
            case 'flames':
                return '<path d="M25 78c-4-8 2-13 2-19 4 4 5 7 5 10 1-6 4-11 9-15 0 7 3 11 6 15 2-4 1-8 1-11 5 6 8 13 6 20-2 7-12 11-15 11s-12-3-14-11z" fill="' + P + '" stroke="' + S + '" stroke-width="1.2"/>' +
                    '<path d="M44 92c-2-4 1-7 1-10 2 2 3 4 3 6 1-3 2-6 5-8 0 4 2 6 3 8 1-2 1-4 1-6 3 3 4 7 3 10-1 3-6 5-8 5s-6-2-8-5z" fill="' + S + '" opacity=".8"/>';
            case 'orbit':
                return ringGroup(P, '<ellipse cx="50" cy="50" rx="52" ry="24" transform="rotate(-28 50 50)"/><ellipse cx="50" cy="50" rx="52" ry="24" transform="rotate(28 50 50)" opacity=".55"/>') +
                    '<g fill="' + P + '"><circle cx="14" cy="30" r="3"/><circle cx="86" cy="70" r="2.4"/><circle cx="50" cy="9" r="2"/></g>';
            case 'petals':
                var pt = '';
                for (i = 0; i < 10; i++) {
                    var ap = (Math.PI * 2 * i) / 10;
                    var px = 50 + Math.cos(ap) * 47, py = 50 + Math.sin(ap) * 47;
                    var rot = (ap * 180) / Math.PI + 90;
                    pt += '<ellipse cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" rx="6" ry="3" transform="rotate(' + rot.toFixed(1) + ' ' + px.toFixed(1) + ' ' + py.toFixed(1) + ')" fill="' + P + '" stroke="' + S + '" stroke-width=".7"/>';
                }
                return pt;
            case 'stars':
                var st = '';
                for (i = 0; i < 6; i++) {
                    var as = (Math.PI * 2 * i) / 6 + 0.4;
                    var stx = 50 + Math.cos(as) * 49, sty = 50 + Math.sin(as) * 49;
                    st += '<path d="M' + stx.toFixed(1) + ' ' + (sty - 4).toFixed(1) + 'l1.4 2.6 2.6 1.4-2.6 1.4-1.4 2.6-1.4-2.6-2.6-1.4 2.6-1.4z" fill="' + P + '" stroke="none"/>';
                }
                return st;
            case 'runes':
                var rn = '';
                for (i = 0; i < 12; i++) {
                    var an = (Math.PI * 2 * i) / 12;
                    var rx = 50 + Math.cos(an) * 46, ry = 50 + Math.sin(an) * 46;
                    rn += '<path d="M' + (rx - 2).toFixed(1) + ' ' + (ry - 2).toFixed(1) + 'l4 4M' + (rx + 2).toFixed(1) + ' ' + (ry - 2).toFixed(1) + 'l-4 4"/>';
                }
                return ringGroup(P, '<circle cx="50" cy="50" r="41" stroke="' + S + '" stroke-width="1" stroke-dasharray="1 6"/>' + rn);
            case 'sigil':
                return ringGroup(P, '<circle cx="50" cy="50" r="37" stroke-width="1.2" opacity=".7"/><path d="M50 18l27 47H23z" stroke-width="1.1" opacity=".65"/><path d="M50 82l-27-47h54z" stroke-width="1.1" opacity=".4"/>');
            case 'infinity':
                return ringGroup(P, '<path d="M38 50c-4-6-12-6-15 0s3 10 9 7c5-2 9-8 12-12 3-4 7-10 12-12 6-3 12 1 9 7s-11 10-17 8c-5-2-7-4-10 2z" stroke-width="2.8"/>');
            case 'snow':
                var sn = '';
                for (i = 0; i < 6; i++) {
                    var asn = (Math.PI * 2 * i) / 6;
                    var snx = 50 + Math.cos(asn) * 48, sny = 50 + Math.sin(asn) * 48;
                    sn += '<g transform="translate(' + snx.toFixed(1) + ',' + sny.toFixed(1) + ')"><path d="M0-4V4M-3.5-2L3.5 2M-3.5 2L3.5-2"/></g>';
                }
                return ringGroup(P, sn);
            case 'feathers':
                var fe = '';
                for (i = 0; i < 5; i++) {
                    var af = -0.4 - i * 0.28;
                    var fx = 50 + Math.cos(af) * 50, fy = 50 + Math.sin(af) * 50;
                    fe += '<path d="M50 50Q' + (50 + Math.cos(af) * 30).toFixed(1) + ' ' + (50 + Math.sin(af) * 30).toFixed(1) + ' ' + fx.toFixed(1) + ' ' + fy.toFixed(1) + '" stroke-width="2"/>';
                    fe += '<path d="M' + fx.toFixed(1) + ' ' + fy.toFixed(1) + 'l-5-2M' + fx.toFixed(1) + ' ' + fy.toFixed(1) + 'l-4-4" stroke-width="1.4"/>';
                }
                return ringGroup(P, fe) + '<g transform="translate(100,0) scale(-1,1)">' + ringGroup(P, fe) + '</g>';
            case 'thorns':
                return ringGroup(S, '<path d="M28 6C14 20 10 38 14 52c3 10 10 18 20 24"/><path d="M72 94c14-14 18-32 14-46-3-10-10-18-20-24"/>') +
                    '<g fill="' + P + '"><path d="M15 26l-7 3 7-9z"/><path d="M11 44l-7 2 6-10z"/><path d="M19 62l-7 1 6-10z"/><path d="M85 74l7-3-7 9z"/><path d="M89 56l7-2-6 10z"/><path d="M81 38l7-1-6 10z"/></g>';
            case 'aurora':
                return '<g fill="none" stroke-linecap="round">' +
                    '<path d="M8 38C24 16 40 52 58 30s26 6 34-8" stroke="' + P + '" stroke-width="6" opacity=".42"/>' +
                    '<path d="M8 56C26 34 40 70 60 48s24 4 32-10" stroke="' + S + '" stroke-width="4" opacity=".55"/>' +
                    '<path d="M14 74C30 56 44 86 62 66s22 2 28-8" stroke="' + P + '" stroke-width="2.2" opacity=".7"/></g>';
            case 'void':
                return '<circle cx="50" cy="50" r="47" fill="#0b0616" opacity=".55"/>' +
                    '<g fill="none" stroke="' + P + '" stroke-linecap="round">' +
                    '<path d="M50 6a44 44 0 0 1 0 88" stroke-width="3.4" opacity=".9"/>' +
                    '<path d="M50 94a44 44 0 0 1 0-88" stroke-width="1.4" opacity=".5"/>' +
                    '<path d="M22 22a44 44 0 0 1 12-9" stroke-width="2"/>' +
                    '<path d="M78 78a44 44 0 0 1-12 9" stroke-width="2"/></g>' +
                    '<g fill="' + S + '"><circle cx="16" cy="34" r="1.7"/><circle cx="84" cy="66" r="1.7"/><circle cx="66" cy="12" r="1.3"/><circle cx="34" cy="88" r="1.3"/></g>';
            case 'earsCat':
                return '<path d="M26 30L22 6l20 16zM74 30l4-24-20 16z" fill="' + P + '" stroke="' + S + '" stroke-width="1.4"/>' +
                    '<path d="M29 25l-2-11 9 8zM71 25l2-11-9 8z" fill="' + S + '" opacity=".55"/>';
            case 'earsFox':
                return '<path d="M24 32L18 2l24 22zM76 32l6-30-24 22z" fill="' + P + '" stroke="' + S + '" stroke-width="1.4"/>' +
                    '<path d="M28 26l-3-14 11 12zM72 26l3-14-11 12z" fill="#fff" opacity=".5"/>';
            case 'earsBunny':
                return '<g fill="' + P + '" stroke="' + S + '" stroke-width="1.4">' +
                    '<ellipse cx="36" cy="12" rx="7" ry="18" transform="rotate(-12 36 12)"/>' +
                    '<ellipse cx="64" cy="12" rx="7" ry="18" transform="rotate(12 64 12)"/></g>' +
                    '<g fill="#fff" opacity=".55"><ellipse cx="36" cy="13" rx="3" ry="12" transform="rotate(-12 36 13)"/><ellipse cx="64" cy="13" rx="3" ry="12" transform="rotate(12 64 13)"/></g>';
            case 'earsWolf':
                return '<path d="M22 34L20 4l26 18zM78 34l2-30-26 18z" fill="' + P + '" stroke="' + S + '" stroke-width="1.5"/>' +
                    '<path d="M30 30l-3-13 12 9zM70 30l3-13-12 9z" fill="' + S + '"/>';
            /* Yin-yang: vòng tròn chia đôi đen trắng với hai mắt nhỏ. */
            case 'yinyang':
                return '<g fill="' + S + '"><circle cx="50" cy="50" r="20"/></g>' +
                    '<g fill="' + P + '"><circle cx="50" cy="50" r="18"/><circle cx="50" cy="32" r="4" fill="' + S + '"/><circle cx="50" cy="68" r="4" fill="' + S + '"/></g>' +
                    '<circle cx="50" cy="32" r="1.5" fill="' + P + '"/><circle cx="50" cy="68" r="1.5" fill="' + P + '"/>';
            /* Cyberpunk: đường mạch neon, port, kết nối tương lai. */
            case 'cyber':
                var cy = '';
                for (i = 0; i < 8; i++) {
                    var ac = (Math.PI * 2 * i) / 8;
                    var cx1 = 50 + Math.cos(ac) * 30, cy1 = 50 + Math.sin(ac) * 30;
                    var cx2 = 50 + Math.cos(ac) * 45, cy2 = 50 + Math.sin(ac) * 45;
                    cy += '<line x1="' + cx1.toFixed(1) + '" y1="' + cy1.toFixed(1) + '" x2="' + cx2.toFixed(1) + '" y2="' + cy2.toFixed(1) + '" stroke="' + P + '" stroke-width="2" stroke-linecap="round"/>';
                }
                return '<g fill="none" stroke="' + P + '" stroke-width="1.5">' +
                    '<rect x="20" y="20" width="60" height="60" rx="4"/>' +
                    '<circle cx="50" cy="50" r="2"/>' +
                    cy +
                    '</g>' +
                    '<g fill="' + S + '"><circle cx="30" cy="30" r="1.5"/><circle cx="70" cy="30" r="1.5"/><circle cx="30" cy="70" r="1.5"/><circle cx="70" cy="70" r="1.5"/></g>';
            /* Sword: hình kiếm thẳng đứng (samurai). */
            case 'sword':
                return '<g fill="none" stroke="' + P + '" stroke-width="2.5" stroke-linecap="round">' +
                    '<line x1="50" y1="14" x2="50" y2="86"/>' +
                    '<path d="M42 18 L50 12 L58 18 M42 82 L50 88 L58 82"/>' +
                    '</g>' +
                    '<g fill="' + S + '"><circle cx="50" cy="16" r="2"/><circle cx="50" cy="84" r="2"/></g>';
            /* Ancient-rune: phù lục cổ thời xưa. */
            case 'ancient-rune':
                var ar = '';
                for (i = 0; i < 12; i++) {
                    var aa = (Math.PI * 2 * i) / 12;
                    var arx = 50 + Math.cos(aa) * 38, ary = 50 + Math.sin(aa) * 38;
                    ar += '<path d="M' + (arx - 1.5).toFixed(1) + ' ' + (ary - 1.5).toFixed(1) + 'l3 3M' + (arx + 1.5).toFixed(1) + ' ' + (ary - 1.5).toFixed(1) + 'l-3 3"/>';
                }
                return '<g fill="none" stroke="' + P + '" stroke-width="1.5"><circle cx="50" cy="50" r="40"/></g>' +
                    '<g fill="' + S + '">' + ar + '<circle cx="50" cy="50" r="3"/></g>';
            /* Ember-core: ngọn lửa πυρί ở trung tâm. */
            case 'ember-core':
                return '<g fill="' + P + '" opacity=".9"><path d="M50 20 Q40 30 50 40 Q60 30 50 20 Z"/><path d="M50 28 Q42 40 50 50 Q58 40 50 28 Z"/></g>' +
                    '<g fill="' + S + '" opacity=".6"><circle cx="50" cy="35" r="3"/><circle cx="50" cy="35" r="6" opacity=".3"/></g>';
            /* Neon-lotus: hoa sen bằng ánh neon. */
            case 'neon-lotus':
                var nl = '';
                for (i = 0; i < 8; i++) {
                    var na = (Math.PI * 2 * i) / 8;
                    var nlx = 50 + Math.cos(na) * 34, nly = 50 + Math.sin(na) * 34;
                    nl += '<path d="M50 50 Q' + nlx.toFixed(1) + ' ' + nly.toFixed(1) + ' 50 50" stroke="' + P + '" stroke-width="3" fill="none"/>';
                }
                return nl + '<circle cx="50" cy="50" r="4" fill="' + S + '"/>';
        }
        return '';
    }

    /* ---------------------------------------------------------------------
       Hình tượng riêng cho 10 khung Founder 7.5.0.

       Mỗi concept là một bộ vẽ độc lập (nhiều lớp, silhouette riêng) chứ không
       phải một template tô lại màu. Mọi hình đều nằm ngoài bán kính 36 để
       không che ảnh đại diện ở giữa khung.
       ------------------------------------------------------------------ */
    function pol(r, deg) {
        var a = (deg * Math.PI) / 180;
        return (50 + Math.cos(a) * r).toFixed(1) + ' ' + (50 + Math.sin(a) * r).toFixed(1);
    }
    function eachAround(count, fn) {
        var out = '';
        for (var i = 0; i < count; i++) out += fn((360 * i) / count, i);
        return out;
    }

    var FOUNDER_FRAME_ART = {
        /* 01 Âm Dương — vòng chia đôi đen/trắng, thái cực đỉnh, hai luồng xoắn. */
        'yin-yang': function (P, S, gid) {
            var swirl = '';
            for (var i = 0; i < 3; i++) {
                swirl += '<path d="M' + pol(45, 200 + i * 8) + 'A45 45 0 0 1 ' + pol(45, 250 + i * 8) + '" stroke-width="' + (2.4 - i * 0.6) + '" opacity="' + (0.8 - i * 0.2) + '"/>';
            }
            return '<defs><linearGradient id="' + gid + '-yy" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#f8fafc"/><stop offset=".5" stop-color="' + P + '"/>' +
                '<stop offset="1" stop-color="#111"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="49" fill="none" stroke="url(#' + gid + '-yy)" stroke-width="2.6"/>' +
                '<path d="M50 1a49 49 0 0 1 0 98a24.5 24.5 0 0 1 0-49a24.5 24.5 0 0 0 0-49z" fill="#0b0b0b" opacity=".92"/>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round">' + swirl + '</g>' +
                '<g transform="translate(50 9)"><circle r="7.4" fill="#0b0b0b" stroke="' + P + '" stroke-width="1"/>' +
                '<path d="M0-7.4a7.4 7.4 0 0 1 0 14.8a3.7 3.7 0 0 1 0-7.4a3.7 3.7 0 0 0 0-7.4z" fill="' + P + '"/>' +
                '<circle cy="-3.7" r="1.5" fill="#0b0b0b"/><circle cy="3.7" r="1.5" fill="' + P + '"/></g>' +
                '<g fill="' + P + '" opacity=".85"><circle cx="50" cy="95" r="1.8"/><circle cx="9" cy="50" r="1.5"/><circle cx="91" cy="50" r="1.5"/></g>';
        },
        /* 02 Cyberpunk — panel holographic, mạch neon, glitch, module cơ khí. */
        'cyberpunk': function (P, S, gid) {
            var circuits = eachAround(8, function (a) {
                return '<path d="M' + pol(36, a) + 'L' + pol(43, a) + 'l3-3" stroke-width="1.2" opacity=".9"/>';
            });
            var glitch = '';
            [12, 26, 40, 58].forEach(function (deg, i) {
                glitch += '<rect x="' + (i % 2 ? 78 : 4) + '" y="' + (14 + i * 6) + '" width="' + (9 + i) + '" height="2" fill="' + (i % 2 ? S : P) + '" opacity="' + (0.5 + i * 0.1) + '"/>';
            });
            return '<defs><linearGradient id="' + gid + '-cp" x1="0" y1="0" x2="1" y2="0">' +
                '<stop offset="0" stop-color="' + P + '"/><stop offset=".5" stop-color="' + S + '"/>' +
                '<stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>' +
                '<g fill="none" stroke="url(#' + gid + '-cp)">' +
                '<rect x="4" y="4" width="92" height="92" rx="12" stroke-width="1.6"/>' +
                '<rect x="8" y="8" width="84" height="84" rx="9" stroke-width=".7" stroke-dasharray="4 6" opacity=".7"/>' + circuits + '</g>' +
                '<g stroke="' + P + '" stroke-width="1.4" fill="none">' +
                '<path d="M50 2v8l-6 3M50 98v-8l6-3"/>' +
                '<path d="M2 50h8l3-6M98 50h-8l-3 6"/></g>' +
                glitch +
                '<g fill="' + S + '"><rect x="41" y="1" width="5" height="5" rx="1"/><rect x="54" y="1" width="5" height="5" rx="1"/>' +
                '<rect x="41" y="94" width="5" height="5" rx="1"/><rect x="54" y="94" width="5" height="5" rx="1"/></g>' +
                '<g fill="#67e8f9"><circle cx="50" cy="6" r="1.5"/><circle cx="94" cy="50" r="1.5"/><circle cx="6" cy="50" r="1.5"/></g>';
        },
        /* 03 Đế chế cổ đại — đền đài, cột, họa tiết meander, đá quý. */
        'ancient-empire': function (P, S, gid) {
            var meander = eachAround(24, function (a, i) {
                return i % 2 === 0
                    ? '<path d="M' + pol(44, a) + 'L' + pol(48, a) + '" stroke-width="1.4"/>'
                    : '<path d="M' + pol(44, a) + 'l1.6 2.6h2.2" stroke-width="1.1"/>';
            });
            return '<defs><linearGradient id="' + gid + '-ae" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="' + P + '"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs>' +
                '<g fill="none" stroke="url(#' + gid + '-ae)" stroke-width="1.6">' +
                '<circle cx="50" cy="50" r="49"/>' + meander + '</g>' +
                /* đền đài phía trên: tam giác + 4 cột */
                '<path d="M30 15L50 3l20 12z" fill="' + P + '" stroke="' + S + '" stroke-width="1"/>' +
                '<path d="M33 16h34v3H33z" fill="' + S + '"/>' +
                '<g fill="' + P + '" opacity=".95"><rect x="35" y="19" width="3" height="11"/><rect x="43" y="19" width="3" height="11"/>' +
                '<rect x="54" y="19" width="3" height="11"/><rect x="62" y="19" width="3" height="11"/></g>' +
                '<g fill="' + S + '"><circle cx="32" cy="60" r="2.6"/><circle cx="68" cy="60" r="2.6"/>' +
                '<circle cx="50" cy="82" r="3"/></g>' +
                '<g stroke="' + P + '" stroke-width=".9" opacity=".65"><path d="M20 40l4 4M76 40l4 4M20 66l4-4M76 66l4-4"/></g>' +
                '<path d="M34 92h32" stroke="' + P + '" stroke-width="2" opacity=".8"/>';
        },
        /* 04 Samurai — kabuto và maedate trên đỉnh, sode hai bên, dây buộc giáp. */
        'samurai': function (P, S, gid) {
            var lacing = '';
            for (var i = 0; i < 5; i++) {
                var x = 14 + i * 2.2;
                lacing += '<path d="M' + x + ' 52l5 4M' + x + ' 60l5 4" stroke-width="1"/>';
                lacing += '<path d="M' + (86 - i * 2.2) + ' 52l-5 4M' + (86 - i * 2.2) + ' 60l-5 4" stroke-width="1"/>';
            }
            return '<defs><linearGradient id="' + gid + '-sm" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="' + P + '"/><stop offset="1" stop-color="#7f1d1d"/></linearGradient></defs>' +
                '<g fill="none" stroke="url(#' + gid + '-sm)" stroke-width="1.5">' +
                '<circle cx="50" cy="50" r="48.4"/><circle cx="50" cy="50" r="41" stroke-dasharray="2 7"/></g>' +
                /* kabuto */
                '<path d="M26 22c0-11 11-18 24-18s24 7 24 18c-7-4-15-6-24-6s-17 2-24 6z" fill="#111" stroke="' + P + '" stroke-width="1.4"/>' +
                '<path d="M28 21c4-6 12-9 22-9s18 3 22 9" stroke="' + P + '" stroke-width="1.1" fill="none"/>' +
                '<path d="M50 4c-4 6-6 13-5 20M50 4c4 6 6 13 5 20" stroke="' + P + '" stroke-width="1.6" fill="none"/>' +
                '<circle cx="50" cy="30" r="4.6" fill="' + P + '" stroke="' + S + '" stroke-width="1"/>' +
                '<path d="M45.4 30h9.2M50 25.4v9.2" stroke="#7f1d1d" stroke-width=".9"/>' +
                /* sode (giáp vai) */
                '<path d="M8 40l10-5 3 17-10 4zM92 40l-10-5-3 17 10 4z" fill="#1c1917" stroke="' + P + '" stroke-width="1.2"/>' +
                '<g stroke="' + P + '" opacity=".8">' + lacing + '</g>' +
                '<path d="M36 88h28" stroke="' + P + '" stroke-width="2"/>' +
                '<path d="M40 84l10 8 10-8" stroke="' + P + '" stroke-width="1.2" fill="none"/>';
        },
        /* 05 Thiên văn đài — mái vòm + kính viễn vọng, quỹ đạo, chòm sao. */
        'astral-observatory': function (P, S, gid) {
            var stars = '';
            var pts = [[14, 20], [22, 12], [78, 16], [88, 28], [20, 78], [76, 82], [90, 62], [10, 44]];
            pts.forEach(function (p, i) {
                stars += '<path d="M' + p[0] + ' ' + (p[1] - 2.4) + 'l1 1.8 1.8 1-1.8 1-1 1.8-1-1.8-1.8-1 1.8-1z" opacity="' + (0.6 + (i % 3) * 0.2) + '"/>';
            });
            return '<defs><linearGradient id="' + gid + '-ao" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#c7d2fe"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="49" fill="none" stroke="url(#' + gid + '-ao)" stroke-width="1.5"/>' +
                '<g fill="none" stroke="' + P + '" stroke-width="1.1" opacity=".8">' +
                '<ellipse cx="50" cy="50" rx="48" ry="17" transform="rotate(-22 50 50)"/>' +
                '<ellipse cx="50" cy="50" rx="48" ry="17" transform="rotate(28 50 50)" opacity=".6"/></g>' +
                /* mái vòm + kính */
                '<path d="M28 24a22 22 0 0 1 44 0z" fill="#1e1b4b" stroke="' + P + '" stroke-width="1.4"/>' +
                '<path d="M35 24a15 15 0 0 1 30 0" stroke="' + P + '" stroke-width=".9" fill="none" opacity=".85"/>' +
                '<path d="M50 24l17-13" stroke="' + P + '" stroke-width="2.6" stroke-linecap="round"/>' +
                '<circle cx="68" cy="10" r="3.4" fill="' + P + '"/>' +
                '<rect x="44" y="12" width="3.4" height=".9" fill="' + P + '"/>' +
                '<g fill="' + P + '">' + stars + '</g>' +
                '<circle cx="50" cy="50" r="4" fill="none" stroke="' + P + '" stroke-width="1.2"/>' +
                '<circle cx="50" cy="50" r="1.4" fill="' + P + '"/>';
        },
        /* 06 Vực thẳm — san hô, sóng sâu, pha lê biển, sinh quang. */
        'abyssal': function (P, S, gid) {
            var coral = '';
            [18, 26, 34].forEach(function (x, i) {
                coral += '<path d="M' + x + ' 96c0-' + (8 + i * 3) + ' ' + (i % 2 ? -4 : 4) + '-' + (10 + i * 2) + ' ' + (i % 2 ? -2 : 2) + '-' + (16 + i * 3) + '" stroke-width="2"/>';
                coral += '<path d="M' + x + ' ' + (80 - i * 4) + 'l' + (i % 2 ? -4 : 4) + '-5" stroke-width="1.4"/>';
                coral += '<path d="M' + (100 - x) + ' 96c0-' + (8 + i * 3) + ' ' + (i % 2 ? 4 : -4) + '-' + (10 + i * 2) + ' ' + (i % 2 ? 2 : -2) + '-' + (16 + i * 3) + '" stroke-width="2"/>';
            });
            return '<defs><radialGradient id="' + gid + '-ab" cx=".5" cy=".5" r=".5">' +
                '<stop offset=".55" stop-color="#06b6d4" stop-opacity="0"/>' +
                '<stop offset="1" stop-color="#06b6d4" stop-opacity=".38"/></radialGradient></defs>' +
                '<circle cx="50" cy="50" r="49" fill="url(#' + gid + '-ab)"/>' +
                '<circle cx="50" cy="50" r="48" fill="none" stroke="' + P + '" stroke-width="1.4" opacity=".9"/>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round">' + coral + '</g>' +
                '<g fill="none" stroke="' + P + '" opacity=".55">' +
                '<path d="M6 62q12-7 24 0t24 0 24 0" stroke-width="1.3"/>' +
                '<path d="M6 72q12-7 24 0t24 0 24 0" stroke-width=".9"/>' +
                '<path d="M6 82q12-7 24 0t24 0 24 0" stroke-width=".7"/></g>' +
                '<g fill="' + P + '" opacity=".85">' +
                '<path d="M50 2l4 8-4 5-4-5z"/><circle cx="18" cy="40" r="1.7"/><circle cx="82" cy="40" r="1.7"/>' +
                '<circle cx="30" cy="30" r="1.1"/><circle cx="70" cy="30" r="1.1"/><circle cx="50" cy="20" r="1.4"/></g>' +
                '<circle cx="50" cy="50" r="3" fill="none" stroke="' + P + '" stroke-width="1" opacity=".7"/>';
        },
        /* 07 Phượng hoàng — cánh lửa hai bên, mào đỉnh, lông đuôi dưới. */
        'phoenix-rebirth': function (P, S, gid) {
            var feathers = '';
            [0, 1, 2, 3, 4].forEach(function (i) {
                feathers += '<path d="M50 52Q' + (50 - 12 - i * 6) + ' ' + (40 - i * 2) + ' ' + (14 + i * 2) + ' ' + (36 + i * 7) + '" stroke-width="' + (2.6 - i * 0.35) + '" opacity="' + (0.95 - i * 0.12) + '"/>';
                feathers += '<path d="M50 52Q' + (50 + 12 + i * 6) + ' ' + (40 - i * 2) + ' ' + (86 - i * 2) + ' ' + (36 + i * 7) + '" stroke-width="' + (2.6 - i * 0.35) + '" opacity="' + (0.95 - i * 0.12) + '"/>';
            });
            return '<defs><linearGradient id="' + gid + '-px" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="#fbbf24"/><stop offset=".55" stop-color="#f97316"/>' +
                '<stop offset="1" stop-color="#7f1d1d"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="48.6" fill="none" stroke="url(#' + gid + '-px)" stroke-width="1.8"/>' +
                '<g fill="none" stroke="url(#' + gid + '-px)" stroke-linecap="round">' + feathers + '</g>' +
                /* mào lửa */
                '<path d="M50 4c3 5 1 7 4 10 2-1 2-4 2-6 3 4 3 9 0 13-2 3-4 4-6 4s-5-1-6-4c-3-4-2-9 1-13 0 2 0 5 2 6 2-3 1-5 3-10z" fill="url(#' + gid + '-px)"/>' +
                /* đuôi */
                '<g stroke="' + P + '" stroke-linecap="round" fill="none">' +
                '<path d="M44 88q-6 8-2 10" stroke-width="2.2"/><path d="M50 90v10" stroke-width="2.2"/>' +
                '<path d="M56 88q6 8 2 10" stroke-width="2.2"/></g>' +
                '<circle cx="50" cy="46" r="3.4" fill="' + P + '"/>' +
                '<g fill="#fde68a" opacity=".9"><circle cx="20" cy="22" r="1.6"/><circle cx="80" cy="22" r="1.6"/>' +
                '<circle cx="12" cy="54" r="1.2"/><circle cx="88" cy="54" r="1.2"/></g>';
        },
        /* 08 Pha lê đế vương — vành đa giác khúc xạ, vương miện pha lê. */
        'crystal-sovereign': function (P, S, gid) {
            var facets = eachAround(12, function (a, i) {
                var r1 = i % 2 ? 38 : 36;
                return '<path d="M' + pol(r1, a) + 'L' + pol(49, a + 5) + 'L' + pol(44, a + 15) + 'L' + pol(r1, a + 30) + 'z" fill="' + (i % 3 ? P : '#7dd3fc') + '" opacity="' + (i % 2 ? 0.34 : 0.5) + '" stroke="' + P + '" stroke-width=".5"/>';
            });
            return '<defs><linearGradient id="' + gid + '-cs" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#f5f3ff"/><stop offset=".45" stop-color="#a78bfa"/>' +
                '<stop offset="1" stop-color="#1e40af"/></linearGradient></defs>' +
                '<g>' + facets + '</g>' +
                '<circle cx="50" cy="50" r="48.4" fill="none" stroke="url(#' + gid + '-cs)" stroke-width="1.6"/>' +
                /* vương miện pha lê */
                '<path d="M32 18l6-13 6 10 6-14 6 14 6-10 6 13z" fill="url(#' + gid + '-cs)" stroke="#ede9fe" stroke-width=".8" opacity=".95"/>' +
                '<path d="M32 18h36" stroke="#c4b5fd" stroke-width="1.4"/>' +
                '<g stroke="#f5f3ff" stroke-width=".7" opacity=".7"><path d="M50 18v-9M38 18v-5M62 18v-5"/></g>' +
                '<g fill="#e9d5ff"><circle cx="38" cy="5" r="1.4"/><circle cx="50" cy="1.6" r="1.6"/><circle cx="62" cy="5" r="1.4"/></g>' +
                '<g stroke="#bfdbfe" stroke-width=".8" opacity=".6"><path d="M20 78l14-6M80 78l-14-6M14 44l10 3M86 44l-10 3"/></g>';
        },
        /* 09 Cỗ máy thời gian — vành bánh răng, vạch số, đĩa cơ khí. */
        'chrono-mechanical': function (P, S, gid) {
            var teeth = eachAround(24, function (a, i) {
                return '<path d="M' + pol(45, a) + 'L' + pol(51, a) + '" stroke="' + (i % 2 ? P : S) + '" stroke-width="' + (i % 2 ? 2.4 : 1.4) + '"/>' +
                    '<path d="M' + pol(51, a) + 'l2.6 ' + (i % 2 ? 1.6 : -1.6) + '" stroke="' + P + '" stroke-width="1"/>';
            });
            var ticks = eachAround(12, function (a, i) {
                return '<path d="M' + pol(i % 3 ? 41 : 39, a) + 'L' + pol(44, a) + '" stroke-width="' + (i % 3 ? 0.8 : 1.6) + '"/>';
            });
            return '<defs><linearGradient id="' + gid + '-cm" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fcd34d"/><stop offset=".5" stop-color="#d97706"/>' +
                '<stop offset="1" stop-color="#78716c"/></linearGradient></defs>' +
                '<g stroke="url(#' + gid + '-cm)" stroke-linecap="round">' + teeth + '</g>' +
                '<circle cx="50" cy="50" r="45" fill="none" stroke="url(#' + gid + '-cm)" stroke-width="2.6"/>' +
                '<circle cx="50" cy="50" r="37.5" fill="none" stroke="' + S + '" stroke-width="1" opacity=".8"/>' +
                '<g stroke="' + P + '" stroke-linecap="round">' + ticks + '</g>' +
                /* bánh răng nhỏ góc trên */
                '<g transform="translate(50 5)"><circle r="8" fill="none" stroke="' + P + '" stroke-width="1.6"/>' +
                '<circle r="3" fill="' + P + '" opacity=".8"/>' +
                '<g stroke="' + P + '" stroke-width="1.6">' + eachAround(8, function (a) { var r = a * Math.PI / 180; return '<path d="M' + (Math.cos(r) * 8).toFixed(1) + ' ' + (Math.sin(r) * 8).toFixed(1) + 'L' + (Math.cos(r) * 11).toFixed(1) + ' ' + (Math.sin(r) * 11).toFixed(1) + '"/>'; }) + '</g></g>' +
                '<g fill="' + P + '" opacity=".9"><circle cx="20" cy="86" r="2.2"/><circle cx="80" cy="86" r="2.2"/></g>' +
                '<path d="M32 92h36" stroke="' + P + '" stroke-width="1.6" opacity=".7"/>';
        },
        /* 10 Băng đế — vương miện băng, tinh thể tuyết, khúc xạ lạnh. */
        'frost-emperor': function (P, S, gid) {
            var flakes = '';
            [[15, 30], [85, 30], [22, 78], [78, 78]].forEach(function (p, k) {
                var s = k % 2 ? 0.9 : 1.2;
                flakes += '<g transform="translate(' + p[0] + ' ' + p[1] + ') scale(' + s + ')" stroke="' + P + '" stroke-width="1.1">' +
                    eachAround(3, function (a) {
                        var r = (a * Math.PI) / 180;
                        return '<path d="M0 0L' + (Math.cos(r) * 6).toFixed(1) + ' ' + (Math.sin(r) * 6).toFixed(1) + '"/>';
                    }) + '</g>';
            });
            return '<defs><linearGradient id="' + gid + '-fe" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#f8fafc"/><stop offset=".5" stop-color="#93c5fd"/>' +
                '<stop offset="1" stop-color="#1e3a8a"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="48.4" fill="none" stroke="url(#' + gid + '-fe)" stroke-width="1.8"/>' +
                '<circle cx="50" cy="50" r="44" fill="none" stroke="' + P + '" stroke-width=".6" stroke-dasharray="1 6" opacity=".85"/>' +
                /* vương miện băng */
                '<path d="M30 22l5-16 6 11 9-15 9 15 6-11 5 16z" fill="url(#' + gid + '-fe)" stroke="#e0f2fe" stroke-width=".8" opacity=".95"/>' +
                '<path d="M30 22h40" stroke="#bfdbfe" stroke-width="1.3"/>' +
                '<g fill="#f0f9ff" opacity=".9"><path d="M50 2l2 5-2 4-2-4z"/><circle cx="35" cy="6" r="1.2"/><circle cx="65" cy="6" r="1.2"/></g>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round">' + flakes + '</g>' +
                '<g stroke="#bfdbfe" stroke-width=".9" opacity=".55"><path d="M8 56q14-8 26-2M92 56q-14-8-26-2"/></g>' +
                '<path d="M38 92h24" stroke="' + P + '" stroke-width="1.7" opacity=".75"/>';
        },

        /* ------------------------------------------------------------------
           7.5.3 — bộ vẽ riêng cho 11 khung Founder còn lại.
           Mỗi khung một silhouette riêng; mọi chi tiết nằm ngoài bán kính 36
           để không che ảnh đại diện.
           ------------------------------------------------------------------ */

        /* Thiên Khải — vương miện ánh sáng, 16 tia và vòng nguyệt quế. */
        'thien-khai': function (P, S, gid) {
            var rays = eachAround(16, function (a, i) {
                return '<path d="M' + pol(i % 2 ? 44 : 46, a) + 'L' + pol(i % 2 ? 49 : 51.5, a) +
                    '" stroke-width="' + (i % 2 ? 1 : 2) + '" opacity="' + (i % 2 ? '.55' : '.95') + '"/>';
            });
            var laurel = eachAround(14, function (a, i) {
                var d = 40 + (i % 2) * 3;
                return '<ellipse cx="' + (50 + Math.cos((a * Math.PI) / 180) * d).toFixed(1) +
                    '" cy="' + (50 + Math.sin((a * Math.PI) / 180) * d).toFixed(1) +
                    '" rx="2.6" ry="1.3" transform="rotate(' + a + ' ' +
                    (50 + Math.cos((a * Math.PI) / 180) * d).toFixed(1) + ' ' +
                    (50 + Math.sin((a * Math.PI) / 180) * d).toFixed(1) + ')"/>';
            });
            return '<defs><radialGradient id="' + gid + '-tk" cx=".5" cy=".5" r=".5">' +
                '<stop offset=".5" stop-color="' + P + '" stop-opacity="0"/>' +
                '<stop offset="1" stop-color="' + P + '" stop-opacity=".34"/></radialGradient>' +
                '<linearGradient id="' + gid + '-tk2" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="#fffbeb"/><stop offset="1" stop-color="' + S + '"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="48" fill="url(#' + gid + '-tk)"/>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round">' + rays + '</g>' +
                '<g fill="' + P + '" opacity=".8">' + laurel + '</g>' +
                '<path d="M30 20l5-14 7 10 8-13 8 13 7-10 5 14z" fill="url(#' + gid + '-tk2)" stroke="#fffbeb" stroke-width=".8"/>' +
                '<path d="M30 20h40" stroke="#fef3c7" stroke-width="1.3"/>' +
                '<g fill="#fffbeb"><circle cx="50" cy="2.6" r="2"/><circle cx="31" cy="6" r="1.3"/>' +
                '<circle cx="69" cy="6" r="1.3"/></g>' +
                '<g fill="' + P + '"><circle cx="14" cy="50" r="1.6"/><circle cx="86" cy="50" r="1.6"/>' +
                '<circle cx="50" cy="94" r="1.8"/></g>';
        },

        /* Vô Cực Hoàng Đế — hố đen, vòng bồi tụ tím, mũi hư không. */
        'void-emperor': function (P, S, gid) {
            var spikes = eachAround(12, function (a, i) {
                return '<path d="M' + pol(44, a) + 'L' + pol(i % 2 ? 53 : 49.5, a) +
                    '" stroke-width="' + (i % 2 ? 1.2 : 2.2) + '" opacity="' + (i % 2 ? '.55' : '.9') + '"/>';
            });
            return '<defs><radialGradient id="' + gid + '-ve" cx=".5" cy=".5" r=".5">' +
                '<stop offset=".3" stop-color="#0b0614"/><stop offset=".78" stop-color="#3b0764" stop-opacity=".55"/>' +
                '<stop offset="1" stop-color="' + P + '" stop-opacity=".26"/></radialGradient>' +
                '<linearGradient id="' + gid + '-ve2" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="' + P + '"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="49" fill="url(#' + gid + '-ve)"/>' +
                '<g fill="none" stroke="url(#' + gid + '-ve2)" stroke-linecap="round">' + spikes + '</g>' +
                '<g fill="none" stroke="' + P + '" opacity=".85">' +
                '<ellipse cx="50" cy="50" rx="48" ry="16" transform="rotate(-24 50 50)" stroke-width="1.6"/>' +
                '<ellipse cx="50" cy="50" rx="48" ry="16" transform="rotate(24 50 50)" stroke-width="1.1" opacity=".7"/></g>' +
                '<circle cx="50" cy="50" r="38" fill="none" stroke="#0b0614" stroke-width="8" opacity=".9"/>' +
                '<circle cx="50" cy="50" r="44.5" fill="none" stroke="' + P + '" stroke-width="1" stroke-dasharray="1 9" opacity=".85"/>' +
                '<g fill="#e9d5ff"><circle cx="14" cy="26" r="1.4"/><circle cx="86" cy="30" r="1.2"/>' +
                '<circle cx="20" cy="78" r="1.3"/><circle cx="80" cy="74" r="1.5"/><circle cx="50" cy="4" r="1.6"/></g>';
        },

        /* Thiên Long — sừng rồng, vảy, ngọc rồng. */
        'celestial-dragon': function (P, S, gid) {
            var scales = eachAround(28, function (a, i) {
                return i % 2 ? '<path d="M' + pol(44, a) + 'a4.4 4.4 0 0 1 3.6-3.6" stroke-width=".9" opacity=".7"/>' : '';
            });
            var whiskers = '<path d="M22 40c-10 3-15 11-14 21"/><path d="M78 40c10 3 15 11 14 21"/>';
            return '<defs><linearGradient id="' + gid + '-cd" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="' + P + '"/>' +
                '<stop offset="1" stop-color="#a16207"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="48.6" fill="none" stroke="url(#' + gid + '-cd)" stroke-width="2"/>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round">' + scales + '</g>' +
                '<g fill="none" stroke="url(#' + gid + '-cd)" stroke-width="2.6" stroke-linecap="round">' +
                '<path d="M40 22C33 14 32 7 35 1"/><path d="M60 22c7-8 8-15 5-21"/></g>' +
                '<g fill="' + P + '"><path d="M35 1l2 6-4 1z"/><path d="M65 1l-2 6 4 1z"/></g>' +
                '<g fill="none" stroke="' + P + '" stroke-width="1.1" opacity=".75" stroke-linecap="round">' + whiskers + '</g>' +
                '<circle cx="50" cy="50" r="6.4" fill="#fef9c3" stroke="' + S + '" stroke-width="1"/>' +
                '<circle cx="50" cy="50" r="2.6" fill="#fbbf24"/>' +
                '<g fill="#fde68a"><circle cx="18" cy="30" r="1.3"/><circle cx="82" cy="62" r="1.4"/><circle cx="30" cy="86" r="1.2"/></g>';
        },

        /* Vàng Nguyên Tắc — xoắn ốc vàng, cung tỉ lệ, điểm sao. */
        'golden-ratio': function (P, S, gid) {
            var spiral = '';
            for (var i = 0; i < 6; i++) {
                var r = 9 + i * 6.4;
                spiral += '<path d="M' + pol(r, i * 90) + 'A' + r + ' ' + r + ' 0 0 1 ' + pol(r, i * 90 + 90) +
                    '" stroke-width="' + (2.4 - i * 0.26).toFixed(2) + '" opacity="' + (0.95 - i * 0.1).toFixed(2) + '"/>';
            }
            var nodes = eachAround(5, function (a) {
                return '<circle cx="' + (50 + Math.cos((a * Math.PI) / 180) * 45).toFixed(1) + '" cy="' +
                    (50 + Math.sin((a * Math.PI) / 180) * 45).toFixed(1) + '" r="2.2"/>';
            });
            return '<defs><linearGradient id="' + gid + '-gr" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fef3c7"/><stop offset=".5" stop-color="' + P + '"/>' +
                '<stop offset="1" stop-color="#92400e"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="48.8" fill="none" stroke="url(#' + gid + '-gr)" stroke-width="1.7"/>' +
                '<g fill="none" stroke="url(#' + gid + '-gr)" stroke-linecap="round">' + spiral + '</g>' +
                '<g fill="' + P + '">' + nodes + '</g>' +
                '<g stroke="' + P + '" stroke-width=".9" opacity=".6">' +
                '<path d="M5 50h6M89 50h6M50 5v6M50 89v6"/></g>' +
                '<path d="M50 8l1.8 3.7 4.2.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6z" fill="#fef9c3"/>';
        },

        /* Lòng Nõn — lõi nham thạch, vành than hồng, tàn lửa. */
        'ember-core': function (P, S, gid) {
            var embers = eachAround(13, function (a, i) {
                var r = 40 + (i % 3) * 4;
                return '<circle cx="' + (50 + Math.cos((a * Math.PI) / 180) * r).toFixed(1) + '" cy="' +
                    (50 + Math.sin((a * Math.PI) / 180) * r).toFixed(1) + '" r="' + (1 + (i % 3) * 0.5).toFixed(1) +
                    '" opacity="' + (0.45 + (i % 3) * 0.2).toFixed(2) + '"/>';
            });
            var tongues = eachAround(8, function (a, i) {
                var p1 = pol(45, a), p2 = pol(52, a + 4), p3 = pol(45, a + 8);
                return '<path d="M' + p1 + 'Q' + pol(i % 2 ? 52 : 49, a + 4) + ' ' + p3 + '" stroke-width="1.8"/>';
            });
            return '<defs><radialGradient id="' + gid + '-ec" cx=".5" cy=".5" r=".5">' +
                '<stop offset=".45" stop-color="#7f1d1d" stop-opacity=".55"/>' +
                '<stop offset=".8" stop-color="#f97316" stop-opacity=".5"/>' +
                '<stop offset="1" stop-color="#fde68a" stop-opacity=".25"/></radialGradient>' +
                '<linearGradient id="' + gid + '-ec2" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="#fde68a"/><stop offset=".55" stop-color="#f97316"/>' +
                '<stop offset="1" stop-color="#7f1d1d"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="49" fill="url(#' + gid + '-ec)"/>' +
                '<circle cx="50" cy="50" r="48.2" fill="none" stroke="url(#' + gid + '-ec2)" stroke-width="2.2"/>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round" opacity=".85">' + tongues + '</g>' +
                '<g fill="' + P + '">' + embers + '</g>' +
                '<path d="M50 4c4 6 1 8 5 12 2-2 2-5 2-7 4 5 3 11 0 15-2 3-4 4-7 4s-5-1-7-4c-3-4-4-10 0-15 0 2 0 5 2 7 4-4 1-6 5-12z" fill="url(#' + gid + '-ec2)"/>';
        },

        /* Tinh Thần Tinh Thạch — vành pha lê, mảnh tinh thể, nơ-ron. */
        'crystal-mind': function (P, S, gid) {
            var shards = eachAround(9, function (a, i) {
                var len = i % 2 ? 8 : 12;
                return '<path d="M' + pol(43, a) + 'L' + pol(43 + len, a) + 'L' + pol(46, a + 5) + 'z" opacity="' +
                    (i % 2 ? '.5' : '.85') + '" fill="' + (i % 3 ? P : '#e0f2fe') + '" stroke="' + P + '" stroke-width=".5"/>';
            });
            var neurons = eachAround(6, function (a) {
                return '<path d="M' + pol(37, a) + 'L' + pol(45, a + 6) + 'M' + pol(45, a + 6) + 'l4 3" stroke-width=".9" opacity=".7"/>';
            });
            return '<defs><linearGradient id="' + gid + '-cm" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#ecfeff"/><stop offset=".45" stop-color="' + P + '"/>' +
                '<stop offset="1" stop-color="#0c4a6e"/></linearGradient></defs>' +
                '<g>' + shards + '</g>' +
                '<circle cx="50" cy="50" r="48.2" fill="none" stroke="url(#' + gid + '-cm)" stroke-width="1.8"/>' +
                '<circle cx="50" cy="50" r="44" fill="none" stroke="' + P + '" stroke-width=".6" stroke-dasharray="1 5" opacity=".8"/>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round">' + neurons + '</g>' +
                '<g fill="#e0f2fe" opacity=".9"><circle cx="50" cy="4" r="1.8"/><circle cx="12" cy="34" r="1.3"/>' +
                '<circle cx="88" cy="34" r="1.3"/><circle cx="26" cy="84" r="1.4"/><circle cx="74" cy="84" r="1.4"/></g>';
        },

        /* Sen Neon — cánh sen neon, viền sáng, sương phát quang. */
        'neon-lotus': function (P, S, gid) {
            var petals = '';
            for (var i = 0; i < 8; i++) {
                var a = i * 45;
                petals += '<path d="M50 50Q' + pol(56, a - 13) + ' ' + pol(49, a) + 'Q' + pol(56, a + 13) + ' 50 50z" fill="' + P +
                    '" opacity="' + (i % 2 ? '.34' : '.6') + '" stroke="' + P + '" stroke-width=".7"/>';
            }
            var dew = eachAround(10, function (a, i) {
                var r = 42 + (i % 4) * 2.5;
                return '<circle cx="' + (50 + Math.cos((a * Math.PI) / 180) * r).toFixed(1) + '" cy="' +
                    (50 + Math.sin((a * Math.PI) / 180) * r).toFixed(1) + '" r="' + (1 + (i % 3) * 0.4).toFixed(1) + '"/>';
            });
            return '<defs><radialGradient id="' + gid + '-nl" cx=".5" cy=".5" r=".5">' +
                '<stop offset=".55" stop-color="' + P + '" stop-opacity="0"/>' +
                '<stop offset="1" stop-color="' + P + '" stop-opacity=".3"/></radialGradient></defs>' +
                '<circle cx="50" cy="50" r="49" fill="url(#' + gid + '-nl)"/>' +
                '<g>' + petals + '</g>' +
                '<circle cx="50" cy="50" r="48.4" fill="none" stroke="' + P + '" stroke-width="1.6" opacity=".9"/>' +
                '<circle cx="50" cy="50" r="44" fill="none" stroke="' + P + '" stroke-width=".8" stroke-dasharray="2 6" opacity=".7"/>' +
                '<g fill="#fce7f3">' + dew + '</g>' +
                '<g stroke="' + P + '" stroke-width=".9" opacity=".55"><path d="M50 3v6M50 91v6M3 50h6M91 50h6"/></g>';
        },

        /* Khởi Nguyên — lõi năng lượng, hai quỹ đạo, tia khởi tạo. */
        'genesis': function (P, S, gid) {
            var rays = eachAround(12, function (a, i) {
                return '<path d="M' + pol(i % 2 ? 46 : 48, a) + 'L' + pol(i % 2 ? 50 : 52, a) +
                    '" stroke-width="' + (i % 2 ? 1 : 1.8) + '" opacity=".85"/>';
            });
            return '<defs><radialGradient id="' + gid + '-ge" cx=".5" cy=".5" r=".5">' +
                '<stop offset="0" stop-color="#f0fdfa"/><stop offset=".45" stop-color="' + P + '"/>' +
                '<stop offset="1" stop-color="#0f766e" stop-opacity="0"/></radialGradient>' +
                '<linearGradient id="' + gid + '-ge2" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#99f6e4"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="46" fill="url(#' + gid + '-ge)" opacity=".85"/>' +
                '<g fill="none" stroke="url(#' + gid + '-ge2)" stroke-linecap="round">' +
                '<circle cx="50" cy="50" r="47" stroke-width="2"/>' + rays +
                '<ellipse cx="50" cy="50" rx="47" ry="17" transform="rotate(-24 50 50)" stroke-width="1.5"/>' +
                '<ellipse cx="50" cy="50" rx="47" ry="17" transform="rotate(38 50 50)" stroke-width="1" opacity=".65"/></g>' +
                '<circle cx="50" cy="50" r="34" fill="none" stroke="#ccfbf1" stroke-width="1" opacity=".5"/>' +
                '<g fill="#a7f3d0"><circle cx="8" cy="23" r="1.7"/><circle cx="54" cy="3" r="1.4"/>' +
                '<circle cx="90" cy="66" r="1.6"/><circle cx="24" cy="88" r="1.3"/></g>';
        },

        /* Liên Kết — lục giác nối sáu nút, tâm phát sáng. */
        'nexus': function (P, S, gid) {
            var spokes = '';
            for (var i = 0; i < 6; i++) {
                var a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                var x = 50 + Math.cos(a) * 38, y = 50 + Math.sin(a) * 38;
                spokes += '<path d="M50 50L' + x.toFixed(1) + ' ' + y.toFixed(1) + '" stroke-width="1.3"/>';
                spokes += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="' + P + '" stroke="#fdf4ff" stroke-width=".8"/>';
                spokes += '<circle cx="' + (50 + Math.cos(a) * 48).toFixed(1) + '" cy="' + (50 + Math.sin(a) * 48).toFixed(1) + '" r="1.5" fill="#f0abfc"/>';
            }
            return '<defs><linearGradient id="' + gid + '-nx" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#f0abfc"/><stop offset="1" stop-color="#7e22ce"/></linearGradient></defs>' +
                '<g fill="none" stroke="url(#' + gid + '-nx)" stroke-linecap="round">' + spokes + '</g>' +
                '<path d="M50 9l18 10.5v21L50 51 32 40.5v-21z" fill="none" stroke="#a855f7" stroke-width="1" stroke-dasharray="3 4" opacity=".7"/>' +
                '<circle cx="50" cy="50" r="11" fill="#4c1d95" opacity=".5"/>' +
                '<circle cx="50" cy="50" r="6" fill="' + P + '"/>' +
                '<circle cx="50" cy="50" r="2.4" fill="#fdf4ff"/>' +
                '<g stroke="#f5d0fe" stroke-width="1.1" opacity=".8"><path d="M50 30v-6M50 70v-6M30 50h-6M70 50h-6"/></g>';
        },

        /* Mã Nguồn Gốc — ngoặc nhọn, lưới dữ liệu, mạch neon. */
        'prime-code': function (P, S, gid) {
            var dots = '';
            for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
                dots += '<circle cx="' + (35 + x * 6).toFixed(1) + '" cy="' + (68 + y * 4.4).toFixed(1) + '" r=".9" opacity="' +
                    (0.3 + ((x + y) % 3) * 0.2).toFixed(2) + '"/>';
            }
            var traces = eachAround(8, function (a, i) {
                return '<path d="M' + pol(45, a) + 'h3v3" stroke-width="1.1" opacity="' + (i % 2 ? '.55' : '.9') + '"/>';
            });
            return '<defs><linearGradient id="' + gid + '-pc" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#15803d"/></linearGradient></defs>' +
                '<rect x="6" y="6" width="88" height="88" rx="12" fill="none" stroke="#22d3ee" stroke-width="1.1" opacity=".5"/>' +
                '<path d="M42 26L32 50l10 24M58 26l10 24-10 24" fill="none" stroke="url(#' + gid + '-pc)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<g fill="#5eead4">' + dots + '</g>' +
                '<g fill="none" stroke="' + P + '" stroke-linecap="round">' + traces + '</g>' +
                '<g stroke="#22d3ee" stroke-width="1.1" opacity=".8"><path d="M6 50h5M89 50h5M50 6v5M50 89v5"/></g>' +
                '<g fill="#67e8f9"><circle cx="50" cy="50" r="1.4"/><circle cx="14" cy="14" r="1.2"/><circle cx="86" cy="86" r="1.2"/></g>';
        },

        /* Di Sản — vương miện, vòng nguyệt quế, dải băng. */
        'legacy': function (P, S, gid) {
            var leaves = '';
            var pts = [[30, 34, -40], [23, 42, -62], [20, 52, -84], [22, 62, -104], [28, 71, -124]];
            pts.forEach(function (p) {
                leaves += '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="3.6" ry="1.9" transform="rotate(' + p[2] + ' ' + p[0] + ' ' + p[1] + ')"/>';
                var mx = 100 - p[0];
                leaves += '<ellipse cx="' + mx + '" cy="' + p[1] + '" rx="3.6" ry="1.9" transform="rotate(' + (-p[2]) + ' ' + mx + ' ' + p[1] + ')"/>';
            });
            return '<defs><linearGradient id="' + gid + '-lg" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#fef08a"/><stop offset=".5" stop-color="' + P + '"/>' +
                '<stop offset="1" stop-color="#a16207"/></linearGradient></defs>' +
                '<circle cx="50" cy="50" r="48.6" fill="none" stroke="url(#' + gid + '-lg)" stroke-width="1.8"/>' +
                '<g fill="url(#' + gid + '-lg)" stroke="' + S + '" stroke-width=".5">' + leaves + '</g>' +
                '<g fill="none" stroke="url(#' + gid + '-lg)" stroke-width="1.6" stroke-linecap="round">' +
                '<path d="M36 30c-7 8-9 18-5 28"/><path d="M64 30c7 8 9 18 5 28"/></g>' +
                '<path d="M34 18l4 12 6-9 6 11 6-11 6 9 4-12 2 14H32z" fill="url(#' + gid + '-lg)" stroke="#fef9c3" stroke-width=".7"/>' +
                '<path d="M32 32h36" stroke="#fde68a" stroke-width="1.2"/>' +
                '<g fill="#fef9c3"><circle cx="38" cy="13" r="1.5"/><circle cx="50" cy="10" r="1.8"/><circle cx="62" cy="13" r="1.5"/></g>' +
                '<path d="M34 84h32l-4 8H38z" fill="url(#' + gid + '-lg)" stroke="' + S + '" stroke-width=".6"/>' +
                '<path d="M42 86h16" stroke="#713f12" stroke-width="1"/>';
        }
    };

    /** Trả về phần tử SVG khung hoặc null cho khung mặc định. */
    function frameOverlay(frameId) {
        var f = frameById(frameId);
        if (!f || !f.orn || !f.orn.length) return null;
        var NS = 'http://www.w3.org/2000/svg';
        var svg = D.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('class', 'bk-avatar-frame-svg bk-frame-premium' + (f.anim ? ' is-animated' : ''));
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('data-frame', f.id);
        svg.setAttribute('data-rarity', f.rarity || 'common');
        var P = safeColor(f.pc, safeColor(f.ring, '#eab308'));
        var S = safeColor(f.sc, '#7f1d1d');
        var gid = 'bkfg-' + String(f.id).replace(/[^a-z0-9-]/g, '');
        var seed = 0;
        String(f.id).split('').forEach(function (ch) { seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; });
        function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

        var inner = '';
        /* Gradient + vòng kép: lớp nền dùng chung cho cả 30 khung. */
        inner += '<defs>' +
            '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + P + '"/>' +
            '<stop offset=".46" stop-color="#ffffff" stop-opacity=".95"/>' +
            '<stop offset=".62" stop-color="' + P + '"/>' +
            '<stop offset="1" stop-color="' + S + '"/>' +
            '</linearGradient>' +
            '<radialGradient id="' + gid + '-r" cx=".5" cy=".5" r=".5">' +
            '<stop offset=".62" stop-color="' + P + '" stop-opacity="0"/>' +
            '<stop offset="1" stop-color="' + P + '" stop-opacity=".3"/>' +
            '</radialGradient>' +
            '</defs>';
        inner += '<circle cx="50" cy="50" r="48.6" fill="none" stroke="url(#' + gid + ')" stroke-width="1.7" opacity=".95"/>';
        inner += '<circle cx="50" cy="50" r="50.4" fill="none" stroke="' + P + '" stroke-width=".45" opacity=".58"/>';
        /* 7.5.3 — lớp hoàn thiện dùng chung cho MỌI khung: viền trong, ánh phản
           chiếu chéo và quầng sáng ngoài, giúp cả khung cũ trông sâu và sạch hơn. */
        inner += '<circle cx="50" cy="50" r="47.1" fill="none" stroke="' + S + '" stroke-width="1.2" opacity=".45"/>';
        inner += '<path d="M21 21a41 41 0 0 1 58 0" fill="none" stroke="#ffffff" stroke-width="1.8" opacity=".42" stroke-linecap="round"/>';
        inner += '<path d="M79 79a41 41 0 0 1-58 0" fill="none" stroke="#ffffff" stroke-width="1" opacity=".2" stroke-linecap="round"/>';
        inner += '<circle cx="50" cy="50" r="49.8" fill="none" stroke="' + P + '" stroke-width="3.2" opacity=".16"/>';
        inner += '<g class="bk-frame-orbit" fill="none" stroke="' + P + '" stroke-linecap="round">' +
            '<circle cx="50" cy="50" r="45.4" stroke-width=".8" stroke-dasharray="1.5 6" opacity=".8"/>' +
            '<circle cx="50" cy="50" r="51.2" stroke-width=".7" stroke-dasharray="10 26" opacity=".55"/>';
        /* 12 vạch sáng nhỏ, xoay chậm như vòng cơ khí. */
        for (var t = 0; t < 12; t++) {
            var at = (Math.PI * 2 * t) / 12;
            var ax = 50 + Math.cos(at) * 45.4, ay = 50 + Math.sin(at) * 45.4;
            inner += '<path d="M' + ax.toFixed(2) + ' ' + ay.toFixed(2) +
                'L' + (50 + Math.cos(at) * 48.4).toFixed(2) + ' ' + (50 + Math.sin(at) * 48.4).toFixed(2) +
                '" stroke-width=".9" opacity="' + (t % 3 ? '.35' : '.75') + '"/>';
        }
        inner += '</g>';

        /* Hoạ tiết riêng của từng khung. Khung Founder 7.5.0 dùng bộ vẽ riêng
           (nhiều lớp) thay cho các primitive dùng chung. */
        inner += '<g class="bk-frame-art">';
        var bespoke = f.art && FOUNDER_FRAME_ART[f.art];
        if (bespoke) inner += bespoke(P, S, gid);
        else f.orn.forEach(function (n) { inner += prim(n, P, S); });
        inner += '</g>';

        /* Tia sáng / hạt lấp lánh phân bố tất định theo id khung. */
        inner += '<g class="bk-frame-spark" fill="' + P + '">';
        for (var k = 0; k < 9; k++) {
            var a = rnd() * Math.PI * 2;
            var r = 43 + rnd() * 8;
            var x = 50 + Math.cos(a) * r, y = 50 + Math.sin(a) * r;
            var sz = 0.55 + rnd() * 0.9;
            inner += '<path d="M' + x.toFixed(2) + ' ' + (y - sz * 2.6).toFixed(2) +
                'l' + (sz * 0.75).toFixed(2) + ' ' + (sz * 1.7).toFixed(2) +
                ' ' + (sz * 1.7).toFixed(2) + ' ' + (sz * 0.75).toFixed(2) +
                ' ' + (-sz * 1.7).toFixed(2) + ' ' + (sz * 1.7).toFixed(2) +
                ' ' + (-sz * 1.7).toFixed(2) + ' ' + (-sz * 0.75).toFixed(2) +
                ' ' + (-sz * 1.7).toFixed(2) + ' ' + (-sz * 1.7).toFixed(2) +
                ' ' + (-sz * 0.75).toFixed(2) + ' ' + (-sz * 1.7).toFixed(2) +
                'z" opacity="' + (0.45 + rnd() * 0.5).toFixed(2) + '"/>';
        }
        inner += '</g>';

        /* Developer/Founder: thêm quỹ đạo phát sáng để khác biệt rõ. */
        if (f.tier === 'dev' || f.tier === 'founder') {
            inner += '<g class="bk-frame-aura" fill="none" stroke="' + P + '" stroke-linecap="round">' +
                '<ellipse cx="50" cy="50" rx="53" ry="25" transform="rotate(-26 50 50)" stroke-width="1.1" opacity=".75"/>' +
                '<ellipse cx="50" cy="50" rx="53" ry="25" transform="rotate(26 50 50)" stroke-width="1.1" opacity=".55"/>' +
                '<circle cx="50" cy="50" r="47" stroke="' + S + '" stroke-width="2.4" stroke-dasharray="1 12" opacity=".8"/>' +
                '</g>';
            /* Khung Founder 7.5.0 đã có vương miện/hình tượng riêng trong bộ vẽ
               bespoke — không chồng thêm vương miện dùng chung. */
            if (f.tier === 'founder' && !(f.art && FOUNDER_FRAME_ART[f.art])) {
                inner += '<g class="bk-frame-crown" fill="' + P + '" stroke="' + S + '" stroke-width="1">' +
                    '<path d="M31 12l4 12 7-10 8 12 8-12 7 10 4-12 2 15H29z"/>' +
                    '<circle cx="50" cy="9" r="2.4"/></g>';
            }
        }

        svg.style.setProperty('--bk-frame-glow', P);
        svg.innerHTML = inner;
        return svg;
    }

    /** Khung được sở hữu: khung cơ bản + phần thưởng từ badge đã mở + khung
     *  nhận qua kho vật phẩm Gamification (đăng ký bởi bk-gamification.js). */
    function ownedFrames() {
        var base = ['none', 'leaf'];
        if (global.BK && global.BK.badges && global.BK.badges.ownedFrames) {
            try { base = global.BK.badges.ownedFrames() || base; } catch (e) { }
        }
        var extra = readFrameCache();
        for (var i = 0; i < extra.length; i++) {
            if (base.indexOf(extra[i]) === -1) base.push(extra[i]);
        }
        return base;
    }

    /* 8.3.5: Gamification trao khung qua reward_catalog (ví dụ frame-laurel →
       khung hồ sơ “wreath”). Danh sách này là cache hiển thị; máy chủ vẫn là
       nơi quyết định quyền trang bị (bakhi_owned_frames + trigger). */
    function frameCacheKey() {
        return FRAMES_KEY + '.' + identity().key;
    }
    function readFrameCache() {
        var raw = safeParse(lsGet(frameCacheKey()));
        if (!Array.isArray(raw)) return [];
        return raw.map(function (id) { return frameById(id).id; })
            .filter(function (id, i, arr) { return id !== 'none' && arr.indexOf(id) === i; });
    }
    /* 8.3.6: hợp nhất thay vì ghi đè. Danh sách khung đến từ hai nguồn độc lập
       (máy chủ trả khung badge; kho vật phẩm trả khung thưởng) nên nguồn này
       không được xoá nguồn kia. Quyền trang bị vẫn do máy chủ quyết định. */
    function setOwnedFrames(list) {
        var clean = (Array.isArray(list) ? list : [])
            .map(function (id) { return frameById(id).id; })
            .filter(function (id, i, arr) { return id !== 'none' && arr.indexOf(id) === i; });
        var cur = readFrameCache();
        clean.forEach(function (id) { if (cur.indexOf(id) === -1) cur.push(id); });
        lsSet(frameCacheKey(), JSON.stringify(cur));
        return cur;
    }

    function canEquip(frameId) {
        return ownedFrames().indexOf(frameById(frameId).id) !== -1;
    }

    function equipFrame(frameId) {
        var id = frameById(frameId).id;
        if (!canEquip(id)) return { ok: false, error: 'Bạn chưa mở khóa khung này.' };
        save({ frame: id });
        return { ok: true, frame: id };
    }

    /* ---------------------------------------------------------------------
       Tiện ích
       ------------------------------------------------------------------ */
    function now() { return Date.now(); }
    function clampStr(v, max) {
        var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return s.slice(0, max);
    }
    function clampText(v, max) {
        return String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max);
    }
    function lsGet(k) {
        try { return global.localStorage.getItem(k); } catch (e) { return null; }
    }
    function lsSet(k, v) {
        try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; }
    }
    function safeParse(raw) {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    /** Liên kết mạng xã hội: chỉ chấp nhận http/https, chặn javascript:. */
    function safeUrl(url) {
        var u = String(url == null ? '' : url).trim();
        if (!u) return '';
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
        try {
            var parsed = new URL(u);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            return parsed.href.slice(0, LIMITS.linkUrl);
        } catch (e) { return ''; }
    }

    /* ---------------------------------------------------------------------
       Danh tính học sinh (dùng chung với bk-cloud)
       ------------------------------------------------------------------ */
    function identity() {
        var saved = safeParse(lsGet('bakhiStudent.v1')) || {};
        var id = saved.studentId ? String(saved.studentId) : '';
        var name = saved.displayName ? String(saved.displayName) : '';
        return {
            key: id || 'local',
            studentId: id,
            name: name,
            anonymous: !id
        };
    }

    /* ---------------------------------------------------------------------
       Kho hồ sơ
       ------------------------------------------------------------------ */
    function emptyProfile() {
        return {
            nickname: '',
            bio: '',
            avatar: '',
            banner: '',
            frame: 'none',
            links: [],
            prefs: { animateAvatarBorders: true },
            updatedAt: 0
        };
    }

    function sanitizeProfile(raw) {
        var p = emptyProfile();
        if (!raw || typeof raw !== 'object') return p;
        p.nickname = clampStr(raw.nickname, LIMITS.nickname);
        p.bio = clampText(raw.bio, LIMITS.bio);
        if (typeof raw.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(raw.avatar) && raw.avatar.length <= LIMITS.avatarBytes * 1.4) {
            p.avatar = raw.avatar;
        }
        if (typeof raw.banner === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(raw.banner) && raw.banner.length <= LIMITS.bannerBytes * 1.4) {
            p.banner = raw.banner;
        }
        p.frame = frameById(raw.frame).id;
        p.updatedAt = Number(raw.updatedAt) || 0;
        p.prefs = { animateAvatarBorders: true };
        if (raw.prefs && typeof raw.prefs === 'object' &&
            raw.prefs.animateAvatarBorders === false) {
            p.prefs.animateAvatarBorders = false;
        }
        (Array.isArray(raw.links) ? raw.links : []).slice(0, LIMITS.links).forEach(function (l) {
            if (!l) return;
            var url = safeUrl(l.url);
            if (!url) return;
            p.links.push({
                label: clampStr(l.label, LIMITS.linkLabel) || 'Liên kết',
                url: url,
                visible: l.visible !== false
            });
        });
        return p;
    }

    function readAll() {
        var data = safeParse(lsGet(KEY));
        var out = { v: SCHEMA, profiles: {} };
        if (data && typeof data === 'object' && data.profiles && typeof data.profiles === 'object') {
            Object.keys(data.profiles).slice(0, 200).forEach(function (k) {
                out.profiles[k] = sanitizeProfile(data.profiles[k]);
            });
        }
        return out;
    }

    function writeAll(data) {
        var ok = lsSet(KEY, JSON.stringify(data));
        if (ok) emit('save');
        return ok;
    }

    function get(identityOverride) {
        var idc = identityOverride || identity();
        var all = readAll();
        return all.profiles[idc.key] || emptyProfile();
    }

    function save(patch) {
        var idc = identity();
        var all = readAll();
        var cur = all.profiles[idc.key] || emptyProfile();
        var next = sanitizeProfile(Object.assign({}, cur, patch || {}, { updatedAt: now() }));
        all.profiles[idc.key] = next;
        writeAll(all);
        return next;
    }

    function getPrefs() {
        var p = get();
        return p.prefs || { animateAvatarBorders: true };
    }

    /** Đổi một cờ giao diện; tăng updatedAt để BKCloud đẩy lên máy chủ. */
    function setPref(name, value) {
        if (name !== 'animateAvatarBorders') return getPrefs();
        var prefs = Object.assign({}, getPrefs(), { animateAvatarBorders: value !== false });
        save({ prefs: prefs });
        applyFrameMotion();
        emit('pref');
        return prefs;
    }

    /* Công tắc "Animate Avatar Borders" áp cho toàn trang: thêm lớp lên <html>
       để mọi khung avatar (kể cả của người khác trong Chat) đứng yên ngay,
       không phải chờ từng avatar tự quyết định. */
    function applyFrameMotion() {
        var root = D && D.documentElement;
        if (!root) return;
        var animate = getPrefs().animateAvatarBorders !== false;
        root.classList.toggle('bk-frames-still', !animate);
    }

    /**
     * Áp hồ sơ từ máy chủ (đồng bộ thiết bị khác). Chỉ ghi khi bản máy chủ mới
     * hơn bản cục bộ; không đổi `updatedAt` và không phát sự kiện 'save' để
     * tránh vòng lặp đẩy ngược lên máy chủ.
     */
    function applyRemote(raw, opts) {
        if (!raw || typeof raw !== 'object') return false;
        var idc = identity();
        var all = readAll();
        var cur = all.profiles[idc.key] || emptyProfile();
        var incoming = sanitizeProfile(raw);
        var force = !!(opts && opts.force);
        if (!force && (!incoming.updatedAt || incoming.updatedAt <= cur.updatedAt)) return false;
        /* 8.3.5: khung do máy chủ trả về đã được bakhi_owned_frames + trigger
           kiểm tra, nên KHÔNG tự hạ về 'none' nếu danh sách cache badge chưa
           biết khung đó (khung thưởng Gamification). Chỉ cần là khung có thật. */
        all.profiles[idc.key] = incoming;
        writeAll(all);
        applyFrameMotion();
        emit('remote');
        return true;
    }

    /**
     * Áp khung do MÁY CHỦ trả về sau khi trang bị ở Gamification.
     * Không đổi updatedAt và không đẩy ngược lên máy chủ (máy chủ đã ghi),
     * nhưng phát 'bkprofile' để navbar/hồ sơ/chat vẽ lại ngay.
     */
    function applyServerFrame(frameId) {
        var idc = identity();
        var all = readAll();
        var cur = all.profiles[idc.key] || emptyProfile();
        var next = sanitizeProfile(Object.assign({}, cur, { frame: frameId }));
        if (next.frame === cur.frame) return cur;
        next.updatedAt = cur.updatedAt;
        all.profiles[idc.key] = next;
        writeAll(all);
        emit('remote');
        return next;
    }

    function reset() {
        var idc = identity();
        var all = readAll();
        delete all.profiles[idc.key];
        writeAll(all);
        applyFrameMotion();
        return emptyProfile();
    }

    /* ---------------------------------------------------------------------
       Sự kiện (đồng bộ giữa các tab và trong cùng trang)
       ------------------------------------------------------------------ */
    function emit(kind) {
        try {
            D.dispatchEvent(new CustomEvent('bkprofile', { detail: { kind: kind, profile: get() } }));
        } catch (e) { /* CustomEvent không có (rất cũ) */ }
    }

    function on(fn) {
        return listen(fn);
    }

    var listeners = [];
    function listen(fn) {
        if (typeof fn !== 'function') return function () { };
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    }

    D.addEventListener('bkprofile', function (e) {
        (listeners || []).slice().forEach(function (fn) {
            try { fn(e.detail); } catch (err) { /* bỏ qua lỗi người nghe */ }
        });
    });

    if (global.addEventListener) {
        global.addEventListener('storage', function (e) {
            if (e && e.key === KEY) {
                applyFrameMotion();
                emit('external');
            }
        });
    }

    /* Áp ngay khi nạp trang để khung không chạy một nhịp rồi mới đứng yên. */
    applyFrameMotion();

    /* ---------------------------------------------------------------------
       Ảnh: thu nhỏ bằng canvas
       ------------------------------------------------------------------ */
    function processImage(file, opts, cb) {
        opts = opts || {};
        if (typeof cb !== 'function') return;
        if (!file) return cb(new Error('Chưa chọn tệp.'));
        if (!/^image\/(png|jpeg|webp)$/i.test(file.type || '')) {
            return cb(new Error('Chỉ nhận ảnh PNG, JPEG hoặc WebP.'));
        }
        if (file.size > LIMITS.uploadBytes) {
            return cb(new Error('Ảnh quá lớn (tối đa 8 MB).'));
        }
        var maxW = opts.width || 320;
        var maxH = opts.height || 320;
        var quality = opts.quality || 0.86;
        var url;
        try { url = URL.createObjectURL(file); } catch (e) { return cb(new Error('Trình duyệt không đọc được tệp.')); }
        var img = new global.Image();
        img.onerror = function () {
            URL.revokeObjectURL(url);
            cb(new Error('Không đọc được ảnh này.'));
        };
        img.onload = function () {
            try {
                var ratio = Math.min(1, maxW / img.width, maxH / img.height);
                var w = Math.max(1, Math.round(img.width * ratio));
                var h = Math.max(1, Math.round(img.height * ratio));
                var canvas = D.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext && canvas.getContext('2d');
                if (!ctx) throw new Error('no-canvas');
                ctx.drawImage(img, 0, 0, w, h);
                var data = canvas.toDataURL('image/jpeg', quality);
                URL.revokeObjectURL(url);
                cb(null, data);
            } catch (e) {
                URL.revokeObjectURL(url);
                cb(new Error('Trình duyệt không hỗ trợ xử lý ảnh.'));
            }
        };
        img.src = url;
    }

    function setAvatar(file, cb) {
        processImage(file, { width: 320, height: 320 }, function (err, data) {
            if (err) return cb && cb(err);
            cb && cb(null, save({ avatar: data }));
        });
    }

    function setBanner(file, cb) {
        processImage(file, { width: 1200, height: 420, quality: 0.82 }, function (err, data) {
            if (err) return cb && cb(err);
            cb && cb(null, save({ banner: data }));
        });
    }

    /* ---------------------------------------------------------------------
       Hiển thị
       ------------------------------------------------------------------ */
    function displayName(profile) {
        var idc = identity();
        var p = profile || get();
        return p.nickname || idc.name || 'Khách';
    }

    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'BK';
        var last = parts[parts.length - 1];
        var first = parts.length > 1 ? parts[0] : '';
        return (first ? first.charAt(0) : last.charAt(0)) + (parts.length > 1 ? last.charAt(0) : '');
    }

    /**
     * Tạo phần tử avatar có khung. Dùng chung cho header, hồ sơ và chat.
     * opts: { size, showFrame, className }
     */
    function avatarNode(opts) {
        opts = opts || {};
        var idc = identity();
        var p = get(idc);
        var size = opts.size || 36;
        var wrap = D.createElement('span');
        wrap.className = 'bk-avatar' + (opts.className ? ' ' + opts.className : '');
        wrap.style.width = size + 'px';
        wrap.style.height = size + 'px';

        var frame = frameById(opts.showFrame === false ? 'none' : p.frame);
        wrap.setAttribute('data-frame', frame.id);
        wrap.setAttribute('data-tier', frame.tier || 'normal');
        if (p.prefs && p.prefs.animateAvatarBorders === false) {
            wrap.classList.add('bk-frame-static');
        }
        if (frame.id !== 'none') {
            wrap.style.setProperty('--bk-avatar-ring', frame.ring);
            wrap.classList.add('bk-avatar-framed');
            var art = frameOverlay(frame.id);
            if (art) wrap.appendChild(art);
        }

        if (p.avatar) {
            var img = D.createElement('img');
            img.className = 'bk-avatar-img';
            img.alt = '';
            img.src = p.avatar;
            wrap.appendChild(img);
        } else {
            var fb = D.createElement('span');
            fb.className = 'bk-avatar-fallback';
            fb.setAttribute('aria-hidden', 'true');
            fb.textContent = initials(displayName(p));
            wrap.appendChild(fb);
        }
        wrap.setAttribute('role', 'img');
        wrap.setAttribute('aria-label', 'Ảnh đại diện của ' + displayName(p));
        return wrap;
    }

    global.BKProfile = {
        KEY: KEY,
        LIMITS: LIMITS,
        frames: FRAMES,
        framesByTier: framesByTier,
        frameById: frameById,
        frameOverlay: frameOverlay,
        ownedFrames: ownedFrames,
        setOwnedFrames: setOwnedFrames,
        canEquip: canEquip,
        equipFrame: equipFrame,
        applyServerFrame: applyServerFrame,
        identity: identity,
        get: get,
        save: save,
        getPrefs: getPrefs,
        setPref: setPref,
        applyFrameMotion: applyFrameMotion,
        applyRemote: applyRemote,
        reset: reset,
        on: on,
        off: on, /* giữ chữ ký đối xứng: hàm trả về unsubscribe */
        displayName: displayName,
        initials: initials,
        avatarNode: avatarNode,
        setAvatar: setAvatar,
        setBanner: setBanner,
        safeUrl: safeUrl,
        processImage: processImage,
        /* Đọc hồ sơ của học sinh khác (dùng cho profile card trong chat sau này) */
        getFor: function (studentKey) { return get({ key: String(studentKey || 'local') }); }
    };
})(typeof window !== 'undefined' ? window : this);
