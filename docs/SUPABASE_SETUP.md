# Đồng bộ Supabase (tuỳ chọn)

Bá Khí hoạt động đầy đủ **không cần** Supabase (local-first). Tài liệu này mô tả cách bật
đồng bộ tiến độ học tập giữa các thiết bị.

> ⚠️ Chỉ dùng **anon public key** trong trình duyệt, kèm Row Level Security.
> Tuyệt đối không đưa `service_role` key vào mã nguồn, tệp tĩnh hay chat.

## 1. Tạo project & bảng

Chạy trong SQL Editor của Supabase:

```sql
create table if not exists public.bakhi_learning (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bakhi_learning enable row level security;

create policy "own row select" on public.bakhi_learning
  for select using (auth.uid() = user_id);

create policy "own row insert" on public.bakhi_learning
  for insert with check (auth.uid() = user_id);

create policy "own row update" on public.bakhi_learning
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own row delete" on public.bakhi_learning
  for delete using (auth.uid() = user_id);
```

Bật Email auth (magic link) trong Authentication → Providers.

## 2. Nạp thư viện trên trang

Thêm vào `index.html` (trước các script của Bá Khí):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
```

Lớp nâng cấp tự phát hiện `window.supabase.createClient`. Nếu không nạp thư viện,
mục đồng bộ trong Cài đặt vẫn lưu cấu hình nhưng không thể kết nối.

## 3. Cấu hình trong ứng dụng

Mở Trung tâm học tập → **Cài đặt** → *Đồng bộ Supabase*:

1. Nhập **Project URL** (`https://xxxx.supabase.co`).
2. Nhập **anon public key**.
3. Bấm **Lưu cấu hình**.
4. Gọi `BK.cloud.signIn('email@example.com')` trong Console Pro để nhận magic link,
   hoặc thêm nút đăng nhập riêng nếu cần.
5. **Gửi dữ liệu** = push, **Hợp nhất dữ liệu** = pull + merge.

Cấu hình được lưu trong `localStorage` dưới `bakhiLearn.v1` → `prefs.cloud`.
Không có khoá bí mật nào trong dữ liệu này.

## 4. Hợp nhất xung đột

`BK.cloud.merge(remote)` hợp nhất theo `id` (ghi chú/đánh dấu/lịch sử) hoặc `key`
(câu cần ôn). Với mỗi bản ghi, bản có mốc thời gian mới hơn thắng
(`updatedAt` → `ts` → `lastSeen`). Mọi bản ghi chỉ thuộc về `user_id` hiện tại.

## 5. Dữ liệu được đồng bộ

`practice`, `review`, `notes`, `bookmarks`, `history`, `achievements`, `prefs`.
**Không** đồng bộ nội dung giáo dục (nội dung nằm trong repository, không bao giờ bị
thay đổi bởi đồng bộ).

## 6. Kiểm tra bảo mật

- [ ] RLS bật trên `bakhi_learning`.
- [ ] Chỉ anon key xuất hiện trong client.
- [ ] Đăng nhập một tài khoản khác → không đọc được dữ liệu tài khoản đầu.
- [ ] Gọi API từ origin khác bị từ chối (cấu hình CORS/allowed origins nếu cần).
- [ ] Service-role key chỉ nằm trong secret của server/proxy (nếu có).
