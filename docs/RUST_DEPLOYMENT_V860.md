# Triển khai Bá Khí backend (Rust) — v8.6.0

> **Trạng thái thực tế:** mã nguồn, Dockerfile, CI và tài liệu đã hoàn thiện; **chưa deploy**
> vì repository chưa có hosting dịch vụ cho tiến trình Rust và chưa cấu hình secret trên
> nền tảng. Website đang chạy bằng Supabase Edge Function như 8.5.6.
> Tài liệu này là các bước để người quản trị tự bật.

## 1. Yêu cầu môi trường

| Thành phần | Yêu cầu |
|---|---|
| Rust | 1.85+ (Cargo.lock có crate dùng manifest edition 2024; CI dùng `stable`, Docker builder ghim `rust:1.92-bookworm`) |
| Hệ điều hành | Linux x86_64/arm64 (Docker `debian:bookworm-slim`) |
| Bộ nhớ | ~30 MiB RSS khi rảnh; 7 MiB đo được trong benchmark |
| Cổng | Một cổng HTTP (mặc định 8080) sau reverse proxy có TLS |
| Supabase | Project hiện tại; cần `SUPABASE_SERVICE_ROLE_KEY` |
| AI | Khoá của provider đang dùng (mặc định Groq) |

> GitHub Pages **không** chạy được tiến trình Rust. Supabase Edge Functions hiện tại
> **không** chạy binary Rust tuỳ ý — vì vậy backend là **một service riêng**.

## 2. Cài Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustc --version
```

## 3. Chạy local

```bash
cd rust-backend

# 1. Cấu hình: sao chép mẫu rồi điền giá trị thật (không commit .env)
cp .env.example .env

# 2. Chạy thử không cần khoá AI (provider giả lập)
AI_TUTOR_MOCK=1 cargo run

# 3. Kiểm tra
curl -s http://127.0.0.1:8080/api/v1/health
curl -s http://127.0.0.1:8080/api/v1/ready
```

Biến môi trường được đọc trực tiếp từ tiến trình. Nếu bạn dùng `docker run`, truyền bằng
`--env-file .env` hoặc `-e`. Rust **không** tự đọc tệp `.env` — hãy export hoặc dùng
`--env-file`.

### Chạy với Supabase local

```bash
supabase start            # phục vụ http://127.0.0.1:54321
export SUPABASE_URL=http://127.0.0.1:54321
```

Backend chỉ chấp nhận `http://` khi host là loopback (`127.0.0.1`, `localhost`, `[::1]`);
mọi URL khác **buộc** phải `https://`.

## 4. Biến môi trường

Xem đầy đủ trong [`rust-backend/.env.example`](../rust-backend/.env.example).

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `SUPABASE_URL` | ✅ | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | ✅ | Khoá công khai, dùng cho `/auth/v1/user` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Chỉ ở máy chủ.** Đọc `ai_settings`, `ai_model_routes`, ghi `ai_usage_logs`/hội thoại AI |
| `AI_TUTOR_API_KEY` | ✅ (khi dùng AI thật) | Khoá provider chính |
| `AI_TUTOR_FALLBACK_API_KEY` | ➖ | Khoá provider dự phòng |
| `AI_TUTOR_KEY_3..6` | ➖ | Khoá cho `ai_model_routes.key_ref` |
| `AI_TUTOR_BASE_URL` | ➖ | Chỉ khi cần provider OpenAI-compatible tự cấu hình |
| `AI_TUTOR_MAX_RETRIES` | ➖ | 0–2, mặc định 1 |
| `AI_TUTOR_TIMEOUT` | ➖ | ms, mặc định 30000 |
| `AI_TUTOR_MOCK` | ➖ | `1` = provider giả lập. **Không bật ở production** |
| `AI_PERSIST_CONVERSATIONS` | ➖ | `true` (mặc định) ghi hội thoại như Edge Function |
| `CORS_ORIGINS` | ➖ | Mặc định `https://minhtruk.github.io`. Không dùng `*` |
| `RATE_LIMIT_PER_MIN` | ➖ | Mặc định 240 (theo IP) |
| `AI_RATE_LIMIT_PER_MIN` | ➖ | Mặc định 30 (theo người dùng) |
| `REQUEST_TIMEOUT_MS` | ➖ | Mặc định 45000 |
| `MAX_BODY_BYTES` | ➖ | Mặc định 262144 |
| `TRUST_PROXY` | ➖ | `true` khi chạy sau reverse proxy tin cậy |
| `HOST`, `PORT`, `RUST_LOG` | ➖ | Mặc định `0.0.0.0`, `8080`, `bakhi_backend=info` |

Không commit tệp chứa khoá thật. Trên nền tảng deploy, đặt chúng trong secret manager.

## 5. Build release

```bash
cd rust-backend
cargo build --release
# binary: target/release/bakhi-backend
```

## 6. Chạy bằng Docker

```bash
cd rust-backend
docker build -t bakhi-backend:8.6.0 .

docker run -d --name bakhi-backend \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  bakhi-backend:8.6.0
```

Image đã có `HEALTHCHECK` gọi `/api/v1/health`, chạy bằng user không phải root (uid 10001),
và không chứa secret.

## 7. Deploy

Backend cần một nền tảng chạy được container HTTP lâu dài có TLS (ví dụ: một máy ảo với
Caddy/Nginx, Fly.io, Railway, Render, Cloud Run **có** cổng HTTP). Yêu cầu chung:

1. Build image từ `rust-backend/Dockerfile`, không cần build máy chủ.
2. Đặt toàn bộ biến ở mục 4 vào secret manager của nền tảng.
3. Giữ đúng **một** instance trước, theo dõi log 15 phút.
4. Bật TLS ở reverse proxy; đặt `TRUST_PROXY=true` **chỉ khi** proxy đó tin cậy.
5. Thêm domain backend vào `CORS_ORIGINS` (giữ nguyên `https://minhtruk.github.io`).

Sau khi backend trả `ok` cho `/api/v1/health` và `/api/v1/ready`, mới bật phía frontend:

```js
// assets/bakhi/bk-supabase.config.js
global.BK_BACKEND = {
    mode: 'rust',
    rustBaseUrl: 'https://bakhi-api.<domain-cua-ban>',
    timeoutMs: 45000,
    fallbackOnError: false
};
```

Sau đó chạy `node tools/bump-version.js --check` và bump phiên bản bản vá (ví dụ 8.6.1) để
trình duyệt tải lại tệp cấu hình mới, rồi kiểm tra Trợ lý AI trên một trang học sinh.

### Những gì **không** cần làm

- Không sửa `supabase/migrations/` (không có migration 8.6.0).
- Không deploy lại Edge Function nào.
- Không trỏ GitHub Pages sang backend: Pages chỉ phục vụ tệp tĩnh.

## 8. Kiểm tra sau khi deploy

```bash
curl -s https://<backend>/api/v1/health          # {"ok":true,...}
curl -s https://<backend>/api/v1/ready           # {"ok":true,...}

# CORS: origin lạ không được cấp quyền
curl -s -o /dev/null -D- -X OPTIONS https://<backend>/api/v1/health \
  -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: GET' | grep -i access-control

# Bảo vệ endpoint: không token ⇒ 401
curl -s -o - -w '\n%{http_code}\n' https://<backend>/api/v1/me
```

Trong trình duyệt: mở `/ai-tutor/`, hỏi một câu, kiểm tra Network thấy request tới
`<backend>/api/v1/ai/chat`, và `window.BKRust.enabled()` trả `true`.

## 9. CI/CD

`.github/workflows/rust-backend.yml` chạy khi `rust-backend/**` thay đổi:

1. `cargo fmt --all -- --check`
2. `cargo clippy --all-targets -- -D warnings`
3. `cargo test --all-targets`
4. `cargo build --release`
5. `docker build` + chạy container và gọi `/health`

Workflow frontend hiện tại (`quality-check.yml`, `changelog-sync.yml`, `music-library.yml`)
giữ nguyên. Workflow Rust **không** tự deploy production.

## 10. Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `thiếu biến môi trường bắt buộc: SUPABASE_URL` | Chưa export hoặc `.env` không được nạp | `export` hoặc `--env-file` |
| `giá trị không hợp lệ cho biến môi trường: SUPABASE_URL` | URL `http://` không phải loopback | Dùng `https://` (hoặc Supabase local trên 127.0.0.1) |
| Mọi request `/ai/chat` trả `NO_KEY` | Thiếu `AI_TUTOR_API_KEY` | Thêm khoá vào secret |
| `AUTH` | Khoá provider sai/bị thu hồi | Kiểm tra khoá; lỗi này không tự chuyển dự phòng |
| `MODEL_NOT_FOUND` | Model đã ngừng phục vụ | Đổi model trong Founder Dashboard (`ai_settings`/`ai_model_routes`) |
| `429 RATE_LIMIT` liên tục | `RATE_LIMIT_PER_MIN`/`AI_RATE_LIMIT_PER_MIN` quá thấp | Nâng ngưỡng hoặc kiểm tra `TRUST_PROXY` |
| CORS bị chặn trên domain thật | Thiếu origin trong `CORS_ORIGINS` | Thêm origin (không có dấu `/` cuối) |
| `/ready` trả 503 | Không gọi được `{SUPABASE_URL}/auth/v1/health` | Kiểm tra mạng/DNS/project ref |
| `Không lưu được tin nhắn` | Bảng AI chưa có hoặc service role thiếu quyền | Kiểm tra migration 8.5.0+ đã chạy và `SUPABASE_SERVICE_ROLE_KEY` |
| Chạy nhiều instance thấy giới hạn tần suất "lỏng" | Bộ đếm nằm trong bộ nhớ mỗi tiến trình | Chấp nhận, hoặc thay bằng Redis |
