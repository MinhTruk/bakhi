/* =========================================================================
   Bá Khí — bk-legal.js
   NGUỒN NỘI DUNG DUY NHẤT cho Điều khoản dịch vụ và Chính sách quyền riêng tư.
   Trang legal/terms.html và legal/privacy.html chỉ gọi BKLegal.mount().

   Nội dung dựa trên Data-flow inventory ở docs/redesign/audit.md:
   - Supabase: Postgres, Auth, Storage (chat-images, report-attachments), Realtime.
   - AI: Groq (chính) + Google AI Studio (dự phòng), khoá nằm phía máy chủ.
   - localStorage/sessionStorage trên thiết bị người học.
   Không hứa hẹn tính năng backend chưa có. Chỗ cần xác nhận ghi rõ
   [CẦN QUẢN TRỊ XÁC NHẬN: …].
   ========================================================================= */
(function (global) {
    'use strict';

    var UPDATED = '26/11/2026';

    var NEED = function (text) {
        return '<span class="bk-need-confirm">[CẦN QUẢN TRỊ XÁC NHẬN: ' + text + ']</span>';
    };

    var TERMS = {
        title: 'Điều khoản dịch vụ',
        eyebrow: 'Pháp lý',
        description: 'Quy định khi sử dụng Bá Khí — không gian học tập gồm tài liệu ôn tập, tiến trình, trợ lý AI, chat và Studio.',
        updated: UPDATED,
        intro: 'Bằng việc truy cập hoặc sử dụng Bá Khí, bạn đồng ý với các điều khoản dưới đây. Nếu bạn là học sinh chưa đủ tuổi tự đồng ý theo quy định, cần có sự đồng ý hoặc giám sát của cha mẹ/người giám hộ hợp pháp.',
        sections: [
            {
                id: 'pham-vi', title: '1. Phạm vi và đơn vị vận hành',
                html: '<p>Bá Khí là website học tập do <strong>MinhTruk/bakhi</strong> phát triển và vận hành trên hạ tầng tĩnh (GitHub Pages), sử dụng Supabase cho dữ liệu và xác thực. ' + NEED('tên pháp nhân/đơn vị chịu trách nhiệm chính thức, địa chỉ và người đại diện') + '</p>' +
                    '<p>Tài liệu này áp dụng cho mọi trang thuộc tên miền triển khai của Bá Khí, gồm trang chủ, tài liệu ôn tập, Trợ lý AI, Chat, Hồ sơ, Tiến trình, Kỹ năng, Studio, Cài đặt và khu quản trị.</p>'
            },
            {
                id: 'tai-khoan', title: '2. Tài khoản học sinh và phiên đăng nhập',
                html: '<p>Một số chức năng cần nhận diện học sinh. Bá Khí dùng mã đăng nhập do quản trị viên cấp và phiên được lưu trên thiết bị/phiên trình duyệt. Bạn có trách nhiệm giữ kín mã đăng nhập, không chia sẻ tài khoản cho người khác và báo cho quản trị viên khi nghi ngờ lộ mã.</p>' +
                    '<p>Khu vực Founder/Admin có kiểm soát riêng ở phía máy chủ. Việc nhìn thấy liên kết trên giao diện không đồng nghĩa với quyền truy cập dữ liệu quản trị.</p>'
            },
            {
                id: 'su-dung', title: '3. Sử dụng được phép và không được phép',
                html: '<p>Bạn được phép dùng Bá Khí cho mục đích học tập cá nhân, ôn tập và trao đổi trong phạm vi lớp/học sinh được cấp quyền.</p>' +
                    '<p>Không được: (a) tấn công, dò quét, phá hoại hoặc gây quá tải hệ thống; (b) truy cập dữ liệu của người khác khi không được phép; (c) đăng nội dung xúc phạm, quấy rối, vi phạm pháp luật hoặc xâm phạm quyền của người khác; (d) tải lên mã độc hoặc tệp không đúng định dạng; (e) sao chép, bán lại hoặc khai thác thương mại nội dung khi chưa có sự đồng ý.</p>'
            },
            {
                id: 'noi-dung', title: '4. Nội dung học tập và quyền sở hữu',
                html: '<p>Tài liệu ôn tập, đề luyện, lời giải và văn bản do giáo viên/quản trị viên cung cấp thuộc quyền của tác giả hoặc đơn vị cung cấp tương ứng. Bá Khí chỉ hiển thị và tổ chức nội dung, không tuyên bố sở hữu thay tác giả.</p>' +
                    '<p>Bạn giữ quyền đối với nội dung do bạn tạo (tin nhắn, ghi chú, bản vẽ, tài liệu Studio). Bạn cấp cho Bá Khí quyền cần thiết để lưu trữ, đồng bộ và hiển thị nội dung đó trong phạm vi vận hành dịch vụ.</p>'
            },
            {
                id: 'tro-ly-ai', title: '5. Trợ lý AI',
                html: '<p>Trợ lý AI tạo câu trả lời tự động từ mô hình ngôn ngữ. Câu trả lời <strong>có thể sai, thiếu hoặc lỗi thời</strong>; không thay thế giáo viên, sách giáo khoa hay đánh giá chính thức. Hãy kiểm chứng thông tin quan trọng.</p>' +
                    '<p>Bá Khí giữ nguyên nhà cung cấp AI, mô hình và thứ tự dự phòng theo cấu hình máy chủ. Khoá API không được gửi xuống trình duyệt. Nội dung bạn gửi trong phiên trò chuyện AI được xử lý để tạo câu trả lời; xem Chính sách quyền riêng tư.</p>'
            },
            {
                id: 'chat', title: '6. Chat và nội dung do người dùng tạo',
                html: '<p>Chat gồm phòng chung, tin nhắn trực tiếp và nhóm nhỏ. Bạn chịu trách nhiệm về nội dung mình gửi, gồm văn bản và ảnh (chỉ png/jpeg/webp/gif, tối đa 3 MB). Không đăng thông tin nhạy cảm của người khác khi chưa được phép.</p>' +
                    '<p>Quản trị viên có thể xem, ẩn hoặc xoá nội dung vi phạm theo quy định vận hành. Tin nhắn đã xoá có thể vẫn còn bản ghi kỹ thuật trong khoảng thời gian cần thiết để vận hành và bảo vệ hệ thống.</p>'
            },
            {
                id: 'gamification', title: '7. Tiến trình, XP và phần thưởng',
                html: '<p>XP, cấp độ, huy hiệu, danh hiệu, khung avatar, nhiệm vụ và phần thưởng được tính từ hoạt động học tập thật và do máy chủ xác thực. Các giá trị này <strong>không có giá trị quy đổi thành tiền</strong>, không chuyển nhượng và có thể được điều chỉnh khi phát hiện gian lận hoặc lỗi dữ liệu.</p>' +
                    '<p>Quyết định trao/thu hồi vật phẩm của Founder/Admin theo logic hiện hành là quyết định vận hành cuối cùng trong phạm vi dịch vụ.</p>'
            },
            {
                id: 'studio', title: '8. Studio và dữ liệu trên thiết bị',
                html: '<p>Studio (Word &amp; Paint) lưu tài liệu và bản vẽ chủ yếu trong trình duyệt trên thiết bị của bạn. Xoá dữ liệu trình duyệt hoặc dùng chế độ riêng tư có thể làm mất dữ liệu chưa xuất. Hãy xuất bản sao nếu nội dung quan trọng.</p>' +
                    '<p>Một số tuỳ chọn giao diện, trợ năng và chuyển động chỉ lưu cục bộ (localStorage), không gắn với tài khoản trên máy chủ.</p>'
            },
            {
                id: 'kha-dung', title: '9. Khả dụng, bảo trì và thay đổi',
                html: '<p>Bá Khí có thể tạm ngừng một phần hoặc toàn bộ để bảo trì, nâng cấp hoặc xử lý sự cố. Chúng tôi cố gắng thông báo khi có thay đổi lớn nhưng không cam kết dịch vụ luôn sẵn sàng liên tục.</p>' +
                    '<p>Tính năng có thể được thêm, sửa hoặc gỡ bỏ. Nội dung học tập hiện có không bị sửa nguyên văn ngoài ý muốn; thay đổi trình bày giao diện không làm thay đổi dữ liệu gốc.</p>'
            },
            {
                id: 'cham-dut', title: '10. Tạm ngừng và chấm dứt',
                html: '<p>Chúng tôi có thể tạm ngừng hoặc chấm dứt quyền truy cập khi phát hiện vi phạm điều khoản, hành vi gây hại hoặc theo yêu cầu của đơn vị quản lý giáo dục. Bạn có thể ngừng sử dụng bất kỳ lúc nào.</p>' +
                    '<p>Việc xoá tài khoản và dữ liệu liên quan cần thực hiện qua quản trị viên ' + NEED('quy trình và thời hạn xử lý yêu cầu xoá tài khoản') + '</p>'
            },
            {
                id: 'trach-nhiem', title: '11. Giới hạn trách nhiệm',
                html: '<p>Trong phạm vi pháp luật cho phép, Bá Khí không chịu trách nhiệm cho thiệt hại gián tiếp phát sinh từ việc dùng hoặc không dùng được dịch vụ, từ câu trả lời AI, từ nội dung do người dùng khác đăng, hoặc từ việc mất dữ liệu cục bộ trên thiết bị.</p>' +
                    '<p>Điều khoản này không loại trừ trách nhiệm không thể loại trừ theo quy định bắt buộc.</p>'
            },
            {
                id: 'luat', title: '12. Luật áp dụng và liên hệ',
                html: '<p>Các điều khoản được hiểu theo pháp luật Việt Nam. ' + NEED('cơ quan có thẩm quyền giải quyết tranh chấp và địa điểm') + '</p>' +
                    '<p>Liên hệ: ' + NEED('email/đầu mối liên hệ chính thức') + '</p>'
            },
            {
                id: 'cap-nhat', title: '13. Cập nhật điều khoản',
                html: '<p>Ngày cập nhật gần nhất: <strong>' + UPDATED + '</strong>. Khi có thay đổi quan trọng, chúng tôi sẽ cập nhật trang này và có thể thông báo trong ứng dụng. Việc tiếp tục sử dụng sau ngày cập nhật được hiểu là chấp nhận phiên bản mới.</p>'
            }
        ]
    };

    var PRIVACY = {
        title: 'Chính sách quyền riêng tư',
        eyebrow: 'Pháp lý',
        description: 'Bá Khí thu thập dữ liệu gì, lưu ở đâu, gửi tới dịch vụ nào và bạn có những quyền gì.',
        updated: UPDATED,
        intro: 'Chính sách này mô tả dữ liệu thực tế mà mã nguồn Bá Khí đang xử lý. Chỗ nào cần quyết định của quản trị (thời hạn lưu, đầu mối liên hệ, cơ chế đồng ý cho học sinh chưa thành niên) được đánh dấu rõ để không tạo cam kết không có thật.',
        sections: [
            {
                id: 'pham-vi', title: '1. Phạm vi và vai trò',
                html: '<p>Chính sách áp dụng cho website Bá Khí và các trang con. Đơn vị vận hành là bên kiểm soát dữ liệu; Supabase và nhà cung cấp AI là bên xử lý theo cấu hình kỹ thuật. ' + NEED('tên pháp nhân/đơn vị kiểm soát dữ liệu và đầu mối liên hệ') + '</p>'
            },
            {
                id: 'du-lieu', title: '2. Dữ liệu được thu thập',
                html: '<p><strong>Thông tin tài khoản/học sinh:</strong> tên hiển thị, biệt danh, mã học sinh, lớp/khối nếu quản trị viên nhập, ảnh đại diện và khung/danh hiệu đã chọn.</p>' +
                    '<p><strong>Hoạt động học tập:</strong> lượt luyện, câu trả lời đúng/sai, điểm, tiến trình chủ đề, câu sai trong sổ tay, ghi chú, bookmark, lịch sử đọc, kế hoạch ôn và mục tiêu.</p>' +
                    '<p><strong>Trò chuyện:</strong> tin nhắn chat (văn bản, ảnh tải lên, reaction, trạng thái đã đọc) và nội dung bạn gửi cho Trợ lý AI cùng câu trả lời.</p>' +
                    '<p><strong>Tuỳ chọn trên thiết bị:</strong> giao diện sáng/tối, cỡ chữ, tương phản, giảm chuyển động, nhạc nền, hình nền, bố cục panel và các cờ giao diện.</p>' +
                    '<p><strong>Dữ liệu kỹ thuật:</strong> mã phiên, thời điểm đồng bộ, mã lỗi và nhật ký vận hành tối thiểu để bảo vệ hệ thống. Không dùng dữ liệu này để quảng cáo.</p>'
            },
            {
                id: 'noi-luu', title: '3. Nơi lưu dữ liệu',
                html: '<ul>' +
                    '<li><strong>Supabase</strong> (Postgres, Auth, Storage, Realtime) — tài khoản, tiến trình, chat, thông báo và các bản ghi liên quan. Dự án đang dùng: <code class="bk-mono">wzvslyabhizsiggurwdq.supabase.co</code>.</li>' +
                    '<li><strong>Supabase Storage</strong> — ảnh chat trong bucket <code class="bk-mono">chat-images</code>; tệp báo cáo trong bucket riêng theo RLS.</li>' +
                    '<li><strong>localStorage/sessionStorage trên thiết bị</strong> — tuỳ chọn giao diện, dữ liệu Studio, bản nháp và phiên quản trị. Những mục này không tự đồng bộ lên máy chủ trừ khi tính năng tương ứng gửi đi.</li>' +
                    '<li><strong>GitHub Pages</strong> — chỉ phục vụ tệp tĩnh của website, không lưu dữ liệu học sinh.</li>' +
                    '</ul>'
            },
            {
                id: 'ben-xu-ly', title: '4. Bên xử lý và chia sẻ',
                html: '<p>Dữ liệu chỉ được gửi tới các bên cần thiết để vận hành:</p>' +
                    '<ul>' +
                    '<li><strong>Supabase</strong> — lưu trữ, xác thực, realtime và storage.</li>' +
                    '<li><strong>Groq</strong> (nhà cung cấp AI chính) và <strong>Google AI Studio</strong> (dự phòng) — chỉ nhận nội dung bạn gửi trong phiên Trợ lý AI để tạo câu trả lời. Khoá API nằm phía máy chủ.</li>' +
                    '<li><strong>GitHub</strong> — lưu mã nguồn và phục vụ trang tĩnh.</li>' +
                    '</ul>' +
                    '<p>Chúng tôi không bán dữ liệu cá nhân và không dùng dữ liệu học tập để chạy quảng cáo.</p>'
            },
            {
                id: 'muc-dich', title: '5. Mục đích sử dụng',
                html: '<ul>' +
                    '<li>Hiển thị tài liệu, tổ chức thư mục môn/đợt kiểm tra và ghi nhận tiến trình học.</li>' +
                    '<li>Tính XP, cấp độ, huy hiệu, nhiệm vụ và phần thưởng theo logic máy chủ.</li>' +
                    '<li>Cung cấp Trợ lý AI, chat và thông báo cập nhật.</li>' +
                    '<li>Bảo mật hệ thống, chống lạm dụng và khắc phục sự cố.</li>' +
                    '</ul>'
            },
            {
                id: 'co-so', title: '6. Cơ sở pháp lý và sự đồng ý',
                html: '<p>Dữ liệu được xử lý để cung cấp dịch vụ học tập mà bạn hoặc đơn vị quản lý giáo dục yêu cầu, và để bảo vệ hệ thống. ' + NEED('cơ chế đồng ý cụ thể cho học sinh chưa thành niên, vai trò của phụ huynh/người giám hộ và đơn vị trường học') + '</p>'
            },
            {
                id: 'luu-tru', title: '7. Thời gian lưu trữ',
                html: '<p>Dữ liệu được giữ trong thời gian cần thiết để cung cấp dịch vụ và tuân thủ nghĩa vụ vận hành. ' + NEED('thời hạn lưu cụ thể cho từng loại dữ liệu: tiến trình, tin nhắn, ảnh chat, nhật ký, bản sao lưu') + '</p>' +
                    '<p>Dữ liệu cục bộ trong trình duyệt tồn tại cho tới khi bạn xoá dữ liệu trang hoặc gỡ cài đặt PWA.</p>'
            },
            {
                id: 'bao-mat', title: '8. Bảo mật',
                html: '<p>Bá Khí dùng Row Level Security trên Supabase, xác thực phiên, khoá API phía máy chủ và phân quyền Founder/Admin riêng. Tuy vậy, không hệ thống nào an toàn tuyệt đối; bạn nên dùng mã đăng nhập riêng và không chia sẻ.</p>'
            },
            {
                id: 'quyen', title: '9. Quyền của bạn',
                html: '<p>Bạn có thể xem và chỉnh sửa nhiều thông tin hồ sơ trong ứng dụng, xuất dữ liệu học tập cục bộ ở nơi tính năng hỗ trợ, và yêu cầu quản trị viên hỗ trợ truy cập, chỉnh sửa hoặc xoá dữ liệu. ' + NEED('quy trình tiếp nhận và thời hạn phản hồi yêu cầu truy cập/xoá dữ liệu') + '</p>' +
                    '<p>Một số dữ liệu có thể cần giữ lại để bảo vệ hệ thống hoặc theo yêu cầu của đơn vị giáo dục.</p>'
            },
            {
                id: 'tre-em', title: '10. Học sinh chưa thành niên',
                html: '<p>Bá Khí phục vụ học sinh trung học và có thể có người dùng chưa đủ tuổi tự đồng ý. ' + NEED('độ tuổi tối thiểu, cơ chế đồng ý của cha mẹ/người giám hộ và quy trình khi phát hiện tài khoản chưa đủ điều kiện') + '</p>'
            },
            {
                id: 'cookie', title: '11. Cookie và bộ nhớ trình duyệt',
                html: '<p>Bá Khí không dùng cookie quảng cáo. Website dùng localStorage/sessionStorage để giữ giao diện, tuỳ chọn trợ năng, dữ liệu Studio và phiên đăng nhập. Bạn có thể xoá các mục này trong cài đặt trình duyệt, nhưng một số tuỳ chọn sẽ trở về mặc định.</p>'
            },
            {
                id: 'thay-doi', title: '12. Thay đổi chính sách',
                html: '<p>Ngày cập nhật gần nhất: <strong>' + UPDATED + '</strong>. Khi chính sách thay đổi, trang này được cập nhật và có thể có thông báo trong ứng dụng.</p>'
            },
            {
                id: 'lien-he', title: '13. Liên hệ',
                html: '<p>Đầu mối về quyền riêng tư: ' + NEED('email/đầu mối liên hệ chính thức và thời gian phản hồi') + '</p>' +
                    '<p>Khuyến nghị quản trị viên tham vấn pháp lý trước khi công bố chính thức, đặc biệt về dữ liệu học sinh chưa thành niên và thời hạn lưu trữ.</p>'
            }
        ]
    };

    var DOCS = { terms: TERMS, privacy: PRIVACY };

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = String(text);
        return e;
    }

    function mount(root, kind) {
        var doc = DOCS[kind];
        if (!root || !doc) return;
        root.textContent = '';
        root.className = 'bk-legal-page';

        var hero = el('header', 'bk-legal-hero');
        hero.appendChild(el('p', 'bk-eyebrow', doc.eyebrow));
        var h1 = el('h1', null, doc.title);
        hero.appendChild(h1);
        hero.appendChild(el('p', null, doc.description));
        var updated = el('p', 'bk-legal-updated');
        updated.appendChild(document.createTextNode('Cập nhật: '));
        var time = el('strong', null, doc.updated);
        updated.appendChild(time);
        hero.appendChild(updated);
        root.appendChild(hero);

        var layout = el('div', 'bk-legal-layout');
        var toc = el('nav', 'bk-legal-toc');
        toc.setAttribute('aria-label', 'Mục lục');
        toc.appendChild(el('h2', null, 'Mục lục'));
        var ol = el('ol');
        doc.sections.forEach(function (sec) {
            var li = el('li');
            var a = el('a', null, sec.title);
            a.href = '#' + sec.id;
            li.appendChild(a);
            ol.appendChild(li);
        });
        toc.appendChild(ol);
        layout.appendChild(toc);

        var body = el('article', 'bk-legal-body');
        var intro = el('p');
        intro.innerHTML = doc.intro;
        body.appendChild(intro);
        doc.sections.forEach(function (sec) {
            var h2 = el('h2', null, sec.title);
            h2.id = sec.id;
            body.appendChild(h2);
            var wrap = el('div');
            wrap.innerHTML = sec.html;
            body.appendChild(wrap);
        });
        layout.appendChild(body);
        root.appendChild(layout);

        // Scroll spy cho mục lục.
        if ('IntersectionObserver' in global) {
            var links = {};
            doc.sections.forEach(function (sec) {
                links[sec.id] = toc.querySelector('a[href="#' + sec.id + '"]');
            });
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    Object.keys(links).forEach(function (id) { if (links[id]) links[id].removeAttribute('aria-current'); });
                    var link = links[entry.target.id];
                    if (link) link.setAttribute('aria-current', 'true');
                });
            }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
            doc.sections.forEach(function (sec) {
                var node = document.getElementById(sec.id);
                if (node) io.observe(node);
            });
        }
    }

    global.BKLegal = {
        docs: DOCS,
        mount: mount,
        updated: UPDATED
    };
})(typeof window !== 'undefined' ? window : this);
