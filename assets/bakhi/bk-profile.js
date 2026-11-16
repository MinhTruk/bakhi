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
    /* 30 khung avatar thật (SVG vẽ bằng path, phần trung tâm trong suốt):
       27 khung thường + 2 khung Developer + 1 khung Founder. */
    var FRAMES = [
        { id: 'none', name: 'Mặc định', tier: 'normal', rarity: 'common', ring: '#94a3b8', orn: [] },
        { id: 'leaf', name: 'Vòng lá', tier: 'normal', rarity: 'common', ring: '#10b981', pc: '#34d399', sc: '#065f46', orn: ['ring', 'laurel'] },
        { id: 'sakura', name: 'Hoa sakura', tier: 'normal', rarity: 'uncommon', ring: '#f9a8d4', pc: '#f472b6', sc: '#9d174d', orn: ['petals', 'ring'] },
        { id: 'sunflower', name: 'Hoa hướng dương', tier: 'normal', rarity: 'uncommon', ring: '#f59e0b', pc: '#fbbf24', sc: '#92400e', orn: ['rays', 'petals'] },
        { id: 'wreath', name: 'Vòng hoa', tier: 'normal', rarity: 'uncommon', ring: '#22c55e', pc: '#86efac', sc: '#166534', orn: ['laurel', 'gem'] },
        { id: 'ear-cat', name: 'Tai mèo', tier: 'normal', rarity: 'rare', ring: '#fb923c', pc: '#fb923c', sc: '#7c2d12', orn: ['earsCat'] },
        { id: 'ear-fox', name: 'Tai cáo', tier: 'normal', rarity: 'rare', ring: '#f97316', pc: '#f97316', sc: '#7c2d12', orn: ['earsFox'] },
        { id: 'ear-bunny', name: 'Tai thỏ', tier: 'normal', rarity: 'rare', ring: '#e879f9', pc: '#e879f9', sc: '#701a75', orn: ['earsBunny'] },
        { id: 'ear-wolf', name: 'Tai sói', tier: 'normal', rarity: 'epic', ring: '#64748b', pc: '#94a3b8', sc: '#1e293b', orn: ['earsWolf'] },
        { id: 'antler', name: 'Sừng hươu', tier: 'normal', rarity: 'epic', ring: '#a16207', pc: '#d97706', sc: '#451a03', orn: ['antlers'] },
        { id: 'horn-dragon', name: 'Sừng rồng', tier: 'normal', rarity: 'legendary', ring: '#ef4444', pc: '#f87171', sc: '#7f1d1d', orn: ['horns', 'spikes'] },
        { id: 'crown', name: 'Vương miện', tier: 'normal', rarity: 'legendary', ring: '#eab308', pc: '#facc15', sc: '#a16207', orn: ['crown', 'gem'] },
        { id: 'star', name: 'Ngôi sao', tier: 'normal', rarity: 'secret', ring: '#8b5cf6', pc: '#a78bfa', sc: '#4c1d95', orn: ['stars', 'halo'] },
        { id: 'royal', name: 'Hoàng gia', tier: 'normal', rarity: 'legendary', ring: '#f43f5e', pc: '#facc15', sc: '#9f1239', orn: ['crown', 'wings', 'gem'] },
        { id: 'celestial', name: 'Thiên giới', tier: 'normal', rarity: 'epic', ring: '#38bdf8', pc: '#7dd3fc', sc: '#0c4a6e', orn: ['halo', 'stars', 'orbit'] },
        { id: 'cyber', name: 'Cyber', tier: 'normal', rarity: 'rare', ring: '#22d3ee', pc: '#22d3ee', sc: '#155e75', orn: ['hex', 'circuit'] },
        { id: 'gothic', name: 'Gothic', tier: 'normal', rarity: 'epic', ring: '#a855f7', pc: '#c084fc', sc: '#3b0764', orn: ['batwings', 'thorns'] },
        { id: 'crystal', name: 'Pha lê', tier: 'normal', rarity: 'rare', ring: '#67e8f9', pc: '#a5f3fc', sc: '#164e63', orn: ['crystal', 'gem'] },
        { id: 'infernal', name: 'Hoả ngục', tier: 'normal', rarity: 'legendary', ring: '#f97316', pc: '#fb923c', sc: '#7c2d12', orn: ['flames', 'horns'] },
        { id: 'divine', name: 'Thần thánh', tier: 'normal', rarity: 'legendary', ring: '#fde68a', pc: '#fef3c7', sc: '#b45309', orn: ['rays', 'halo', 'wings'] },
        { id: 'galactic', name: 'Thiên hà', tier: 'normal', rarity: 'epic', ring: '#818cf8', pc: '#a5b4fc', sc: '#312e81', orn: ['orbit', 'stars'] },
        { id: 'ancient', name: 'Cổ đại', tier: 'normal', rarity: 'epic', ring: '#d6d3d1', pc: '#e7e5e4', sc: '#44403c', orn: ['runes', 'ring', 'sigil'] },
        { id: 'legendary', name: 'Huyền thoại', tier: 'normal', rarity: 'legendary', ring: '#fbbf24', pc: '#fcd34d', sc: '#92400e', orn: ['wings', 'crown', 'gem', 'stars'] },
        { id: 'neon', name: 'Neon', tier: 'normal', rarity: 'rare', ring: '#4ade80', pc: '#4ade80', sc: '#14532d', orn: ['ring', 'circuit', 'spikes'] },
        { id: 'eternal', name: 'Vĩnh cửu', tier: 'normal', rarity: 'legendary', ring: '#e879f9', pc: '#f0abfc', sc: '#701a75', orn: ['infinity', 'orbit', 'stars'] },
        { id: 'frost', name: 'Băng giá', tier: 'normal', rarity: 'rare', ring: '#93c5fd', pc: '#bfdbfe', sc: '#1e3a8a', orn: ['snow', 'crystal'] },
        { id: 'phoenix', name: 'Phượng hoàng', tier: 'normal', rarity: 'legendary', ring: '#fb7185', pc: '#fda4af', sc: '#881337', orn: ['feathers', 'flames'] },
        { id: 'dev-aurora', name: 'Cực quang · Developer', tier: 'dev', rarity: 'secret', ring: '#5eead4', pc: '#67e8f9', sc: '#a855f7', orn: ['aurora', 'stars', 'sigil'], anim: true },
        { id: 'dev-void', name: 'Hư không · Developer', tier: 'dev', rarity: 'secret', ring: '#c084fc', pc: '#e9d5ff', sc: '#6d28d9', orn: ['void', 'spikes', 'runes'], anim: true },
        { id: 'founder', name: 'Người sáng lập', tier: 'founder', rarity: 'secret', ring: '#fbbf24', pc: '#fde68a', sc: '#b91c1c', orn: ['founderCrown', 'wings', 'laurel', 'gem', 'sigil'], anim: true }
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
        }
        return '';
    }

    /** Trả về phần tử SVG khung hoặc null cho khung mặc định. */
    function frameOverlay(frameId) {
        var f = frameById(frameId);
        if (!f || !f.orn || !f.orn.length) return null;
        var NS = 'http://www.w3.org/2000/svg';
        var svg = D.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('class', 'bk-avatar-frame-svg' + (f.anim ? ' is-animated' : ''));
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('data-frame', f.id);
        var P = safeColor(f.pc, safeColor(f.ring, '#eab308'));
        var S = safeColor(f.sc, '#7f1d1d');
        var inner = '';
        f.orn.forEach(function (n) { inner += prim(n, P, S); });
        svg.innerHTML = inner;
        return svg;
    }

    /** Khung được sở hữu: khung cơ bản + phần thưởng từ badge đã mở. */
    function ownedFrames() {
        if (global.BK && global.BK.badges && global.BK.badges.ownedFrames) {
            try { return global.BK.badges.ownedFrames(); } catch (e) { }
        }
        return ['none', 'leaf'];
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

    /**
     * Áp hồ sơ từ máy chủ (đồng bộ thiết bị khác). Chỉ ghi khi bản máy chủ mới
     * hơn bản cục bộ; không đổi `updatedAt` và không phát sự kiện 'save' để
     * tránh vòng lặp đẩy ngược lên máy chủ.
     */
    function applyRemote(raw) {
        if (!raw || typeof raw !== 'object') return false;
        var idc = identity();
        var all = readAll();
        var cur = all.profiles[idc.key] || emptyProfile();
        var incoming = sanitizeProfile(raw);
        if (!incoming.updatedAt || incoming.updatedAt <= cur.updatedAt) return false;
        if (!canEquip(incoming.frame)) incoming.frame = 'none';
        all.profiles[idc.key] = incoming;
        writeAll(all);
        emit('remote');
        return true;
    }

    function reset() {
        var idc = identity();
        var all = readAll();
        delete all.profiles[idc.key];
        writeAll(all);
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
            if (e && e.key === KEY) emit('external');
        });
    }

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
        canEquip: canEquip,
        equipFrame: equipFrame,
        identity: identity,
        get: get,
        save: save,
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
