/* =========================================================================
   Bá Khí — bk-supabase.config.js
   CẤU HÌNH SUPABASE DÙNG CHUNG CHO TOÀN BỘ REPOSITORY.

   ĐÂY LÀ NƠI DUY NHẤT chứa thông tin kết nối Supabase.
   Không hardcode URL/key trong bất kỳ trang HTML hay tệp JS nào khác.
   Không tạo Supabase client thứ hai — mọi thứ đi qua assets/bakhi/bk-cloud.js.

   Chỉ dùng PUBLISHABLE KEY (khoá công khai, được bảo vệ bằng RLS).
   Tuyệt đối KHÔNG đặt ở đây:
     - service_role key / secret key
     - database password
     - Dev Code
     - bất kỳ secret xác thực học sinh nào
   Các secret phía server nằm trong Supabase Edge Function Secrets.
   ========================================================================= */
(function (global) {
    'use strict';

    /* ---------------------------------------------------------------------
       [KHU VỰC 1 – SUPABASE PROJECT URL]
       Thay bằng URL project của bạn: https://<project-ref>.supabase.co
       ------------------------------------------------------------------ */
    var SUPABASE_URL = 'https://wzvslyabhizsiggurwdq.supabase.co';

    /* ---------------------------------------------------------------------
       [KHU VỰC 2 – SUPABASE PUBLISHABLE KEY]
       Thay bằng publishable key (hoặc anon public key) của project.
       Khoá này được thiết kế để chạy trong trình duyệt; dữ liệu được bảo vệ
       bằng Row Level Security trong supabase/migrations/.
       ------------------------------------------------------------------ */
    var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KrPXBwMjRftx7yD_ZAaYYg_jLgu8h6S';

    /* ------------------------------------------------------------------
       Không cần sửa phần dưới.
       ------------------------------------------------------------------ */
    global.BK_SUPABASE = {
        url: String(SUPABASE_URL || '').trim().replace(/\/+$/, ''),
        key: String(SUPABASE_PUBLISHABLE_KEY || '').trim(),
        sdkUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
        /* Tên các Edge Function — đổi ở đây nếu bạn deploy với tên khác. */
        functions: {
            adminAuth: 'admin-auth',
            adminActions: 'admin-actions',
            devAuth: 'dev-auth',
            importStudents: 'import-students',
            searchStudents: 'search-students',
            bindSession: 'bind-student-session',
            syncProgress: 'sync-student-progress',
            studentProfile: 'student-profile',
            chat: 'chat-api',
            report: 'report-api',
            gamification: 'gamification-api'
        },
        /* Số mili giây chờ trước khi đẩy tiến trình học tập lên máy chủ. */
        syncDebounceMs: 2500,
        /* Khoảng thời gian hỏi lại thông báo khi Realtime không khả dụng. */
        pollMs: 60000
    };

    global.BK_SUPABASE.configured = function () {
        return !!(global.BK_SUPABASE.url && global.BK_SUPABASE.key &&
            /^https?:\/\//i.test(global.BK_SUPABASE.url) && !/<<<|>>>/.test(global.BK_SUPABASE.key));
    };
})(typeof window !== 'undefined' ? window : this);
