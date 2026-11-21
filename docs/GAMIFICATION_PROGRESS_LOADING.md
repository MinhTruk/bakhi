# PROGRESS LOADER — thiết kế và hợp đồng (8.3.1)

Một nguồn duy nhất: `assets/bakhi/bk-gamification.js` → `refresh()` → `call()` →
`BKCloud.gamificationApi()` → Edge Function `gamification-api` (`action: "state"`) →
`bk_gam_state` + `bk_gam_sync_missions` + `gamification_config`.

## 1. Đường đi dữ liệu

```
mount(host)
  └─ renderAll()                     hiển thị đúng trạng thái hiện có
  └─ refresh(force)
       ├─ studentId()                BKCloud.identity() → cache bakhiStudent.v1
       ├─ cache bakhiGamification.v1.<studentId>   (hiển thị ngay, không chặn)
       ├─ call({action:'state'})     timeout 15 s
       ├─ applyState(state, notify, seq)   bỏ phản hồi cũ (SEQ)
       └─ renderAll()
```

Không có loader thứ hai. `bk-page.js`/`bk-learning.js` chỉ gọi `BK.gamification.track()`.

## 2. Trạng thái

| Trạng thái | Điều kiện | Giao diện |
|---|---|---|
| `restoring` | Có `BKCloud` nhưng chưa có danh tính, tối đa 1,2 s | “Đang tải tiến trình…” |
| `loading` | Có danh tính, chưa có dữ liệu | spinner |
| retry | Lỗi mạng/5xx, lần 1–2 | “Đang kết nối lại máy chủ… (lần n/2)” |
| `ready` | Có `state` | dashboard |
| `ready` + `errorCode` | Có dữ liệu cũ, lần tải mới lỗi | băng “Một số dữ liệu chưa tải được (mã)” + nút Làm mới |
| `no_session` | Không có danh tính sau khi chờ | “Cần nhận diện học sinh” `E_NO_SESSION` |
| `unauthorized` | HTTP 401 / `NO_SESSION` | “Phiên đăng nhập không còn hợp lệ” `E_UNAUTHORIZED` |
| `not_bound` | HTTP 409 / `NOT_BOUND` | “Thiết bị chưa gắn học sinh” `E_NOT_BOUND` |
| `forbidden` | HTTP 403 | `E_FORBIDDEN` |
| `rate_limited` | HTTP 429 / `RATE_LIMITED` | `E_RATE_LIMITED` |
| `offline` | không có HTTP status hoặc timeout | “Không thể kết nối máy chủ” `E_NETWORK` |
| `server` | HTTP ≥ 500 | “Máy chủ đang gặp sự cố” `E_SERVER` |
| `error` | payload sai, thiếu `BKCloud`, lỗi khác | “Chưa tải được tiến trình” `E_UNKNOWN` |

## 3. Quy tắc

1. Chỉ một request `state` tại một thời điểm (`S.loading`).
2. Retry tối đa 2 lần, chỉ lỗi tạm thời; không retry 4xx.
3. Mọi request có timeout 15 s; timeout được phân loại là `offline`.
4. `SEQ` bảo đảm phản hồi gửi sau thắng; `event` không bị `state` cũ ghi đè.
5. Dữ liệu đã tải không bị xoá khi lần làm mới thất bại; cache theo `studentId`.
6. Đổi học sinh (`bk:identity`) → xoá state trong RAM, tải lại, không lộ dữ liệu người trước.
7. Không có tác dụng phụ: tải dữ liệu **không** cộng XP, không cấp thưởng, không gửi sự kiện.

## 4. Gỡ lỗi

`BK.gamification.status()` trả trạng thái hiện tại; `BK.gamification.lastError()` trả
`{ code, status, message }` gần nhất. Console chỉ ghi `warn` với mã + HTTP status,
không ghi token, không ghi payload.
