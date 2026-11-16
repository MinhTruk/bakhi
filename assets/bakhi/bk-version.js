/* =========================================================================
   Bá Khí — bk-version.js
   Nguồn phiên bản DUY NHẤT cho toàn website.

   Mọi nơi cần hiển thị phiên bản (header, footer, Settings, README, dashboard,
   changelog) đọc từ window.BAKHI_VERSION / BK.versionInfo thay vì viết cứng.

   Chỉ tăng số phiên bản khi CHANGELOG.md thực sự có mục phát hành tương ứng.
   ========================================================================= */
(function (global) {
    'use strict';

    var V = {
        /* Phiên bản phát hành (khớp mục mới nhất trong CHANGELOG.md). */
        app: '6.1.1',
        channel: 'stable',
        releasedAt: '2026-11-16',
        /* Thông tin thương hiệu dùng chung cho header/footer/profile. */
        brand: 'Bá Khí',
        school: 'THPT Huỳnh Ngọc Huệ',
        repo: 'https://github.com/MinhTruk/bakhi',
        site: 'https://minhtruk.github.io/bakhi/'
    };

    V.label = 'v' + V.app;
    V.full = V.brand + ' ' + V.label;
    V.dataVersion = '6.1.1';   /* phiên bản bộ dữ liệu cục bộ (không phải bản phát hành) */

    global.BAKHI_VERSION = V;

    if (global.BK) {
        global.BK.versionInfo = V;
        /* BK.version giữ nguyên nghĩa "phiên bản thư viện core" để không phá
           các chỗ đang so sánh, nhưng thêm bản phát hành sản phẩm. */
        global.BK.release = V.app;
    }
})(typeof window !== 'undefined' ? window : this);
