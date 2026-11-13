/* Bá Khí — chuyển trang của môn đang khóa sang trang Coming soon.
   Cách dùng: <script src="..." data-soon="../indexhoa.html" defer></script>
   Nếu không có data-soon thì không làm gì. */
(function () {
    'use strict';
    var el = document.currentScript;
    var target = el && el.getAttribute('data-soon');
    if (!target) return;
    try {
        location.replace(new URL(target, location.href).href);
    } catch (e) {
        location.replace(target);
    }
})();
