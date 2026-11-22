/* =========================================================================
   Bá Khí — bk-usage.js (8.4.4)
   Đếm lượt dùng ẨN DANH để biết nên đầu tư vào đâu: mỗi phiên, mỗi tính năng
   tăng đúng một lần qua RPC `bk_usage_ping`.

   Không gửi: tên học sinh, id, email, câu trả lời, nội dung học tập, IP (chỉ
   là kết nối HTTP bình thường), thông tin thiết bị.

   Công khai: window.BKUsage.ping(feature)
   ========================================================================= */
(function (global) {
    'use strict';

    if (global.BKUsage) return;

    var SESSION_KEY = 'bakhiUsage.v1';
    var FEATURE_RE = /^[a-z0-9_.:-]{2,40}$/;

    function sent() {
        try {
            var raw = global.sessionStorage.getItem(SESSION_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    }
    function remember(name) {
        var list = sent();
        if (list.indexOf(name) >= 0) return;
        list.push(name);
        if (list.length > 60) list = list.slice(-60);
        try { global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(list)); } catch (e) { }
    }

    function config() {
        var c = global.BK_SUPABASE;
        if (!c || typeof c.configured !== 'function' || !c.configured()) return null;
        return c;
    }

    /** Tăng bộ đếm cho một tính năng; bỏ qua lặng lẽ nếu chưa cấu hình Supabase. */
    function ping(feature) {
        var name = String(feature || '').toLowerCase();
        if (!FEATURE_RE.test(name)) return false;
        if (sent().indexOf(name) >= 0) return false;
        var c = config();
        if (!c) return false;
        remember(name);
        try {
            global.fetch(c.url + '/rest/v1/rpc/bk_usage_ping', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': c.key,
                    'Authorization': 'Bearer ' + c.key
                },
                body: JSON.stringify({ p_feature: name }),
                keepalive: true,
                credentials: 'omit'
            }).catch(function () { });
        } catch (e) { }
        return true;
    }

    global.BKUsage = { ping: ping, _sent: sent };
})(typeof window !== 'undefined' ? window : this);
