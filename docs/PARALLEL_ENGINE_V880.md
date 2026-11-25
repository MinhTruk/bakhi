# Bá Khí 8.8.0 — Parallel Execution Engine

Mục tiêu: dùng nhiều lõi CPU cho công việc **độc lập** mà không biến mọi request
thành parallel, không tạo thread vô hạn, không giữ việc trong hàng đợi vô hạn và
không che giấu lỗi.

## 1. Phân loại tác vụ trong Bá Khí

| Nhóm | Ví dụ trong repo | Cách chạy |
|---|---|---|
| **A. Async I/O-bound** | Supabase (PostgREST/Auth), provider AI, streaming SSE | `async/await` trên Tokio. **Không** đưa vào engine song song |
| **B. CPU-bound** | tổng hợp `learning-stats` với lô lớn, render Prometheus | `ParallelEngine::run_cpu` → `spawn_blocking` có trần |
| **C. Mixed** | một lượt chat: I/O (Supabase) → CPU (prompt/token) → I/O (provider) | tách stage: I/O song song bằng `tokio::join!`, CPU nặng sang engine, không chuyển qua lại nhiều lần |

Ranh giới rõ ràng: engine **không** dùng cho việc chỉ chờ mạng. Đưa I/O vào
blocking pool sẽ chiếm worker CPU mà chẳng nhanh hơn.

## 2. Kiến trúc engine (`rust-backend/src/parallel/mod.rs`)

```
run_cpu(closure)
   │
   ├─ 1. hàng đợi có hạn  (Semaphore = RUST_TASK_QUEUE_CAPACITY)
   │      hết RUST_TASK_WAIT_MS ⇒ QueueFull (route trả 429), không xếp vô hạn
   ├─ 2. permit CPU        (Semaphore = RUST_CPU_WORKERS; 0 = số CPU khả dụng)
   ├─ 3. spawn_blocking    (blocking pool của runtime DUY NHẤT)
   └─ 4. lifecycle: created → running → completed | failed | timeout | rejected
```

- **Không tạo thread mới**: dùng blocking pool sẵn có của Tokio, trần thật do
  semaphore quyết định.
- **Không block async runtime**: closure chạy ngoài worker thread.
- **Panic được bắt** (`catch_unwind`) ⇒ đếm `failed`, trả lỗi, permit được trả,
  tiến trình không chết.
- **Timeout**: `run_cpu` trả `TaskError::Timeout` sau `RUST_TASK_TIMEOUT_MS`.
  Một closure CPU đã chạy **không thể bị ngắt an toàn** bằng std, nên nó giữ
  permit tới khi thật sự xong. Nhờ vậy trần worker không bao giờ bị vượt; đổi
  lại, một tác vụ quá hạn vẫn chiếm chỗ cho tới khi kết thúc. Đây là lựa chọn có
  chủ đích, không phải thiếu sót.
- **Không orphan task**: task nào cũng có permit + gauge + kết thúc được ghi
  nhận. Không có vòng lặp nền tự phát.

## 3. Điểm dùng thật trong 8.8.0

1. **`learning-stats`** (`routes/data.rs`): lô ≥ 500 dòng chạy qua engine; lô
   nhỏ chạy inline. Lý do: overhead cố định của engine đo được **≈ 28 µs/tác vụ**
   (xem mục 4). Với lô vài dòng, 28 µs là chậm hơn trước; với lô vài nghìn dòng,
   việc rời worker thread của Tokio quan trọng hơn.
2. **Chuẩn bị request AI** (`services/ai_service.rs`): ba lượt đọc độc lập chạy
   song song bằng `tokio::join!` (I/O song song, không qua engine).
3. **Render `/metrics`** vẫn trên blocking pool như 8.7.x (đã đúng từ trước).

Không song song hoá: ghi hội thoại (phụ thuộc kết quả AI), ghi usage log (phụ
thuộc kết quả), retry/fallback (tuần tự theo thiết kế).

## 4. Đo lường thật

`cargo run --release --locked --example pipeline_bench` trên máy CI/agent
(2 worker Tokio, engine tự dò 2 worker):

| Tác vụ | Thời gian |
|---|---|
| `run_cpu` với closure rỗng | 28.389 ns/op |
| `run_cpu` cộng 20.000 số | 38.251 ns/op |
| Cộng 20.000 số (phần việc thật, xấp xỉ) | ≈ 9.862 ns |

Kết luận trung thực: engine thêm ~28 µs cố định. Chỉ đáng dùng khi công việc
lớn hơn khoảng đó đủ nhiều (lô lớn, serialization nặng, render metrics), nên
threshold 500 dòng là quyết định dựa trên số đo, không phải con số tuỳ ý.

**Chưa đo**: throughput ở 1/5/10/25/50/100 request đồng thời với provider thật.
Môi trường này không có khoá AI và không được chạy tải lên production. Muốn có
bảng BEFORE/AFTER đầy đủ phải benchmark trên môi trường staging có provider
thật; script `rust-backend/bench/run.mjs` là điểm bắt đầu.

## 5. Cấu hình

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `RUST_CPU_WORKERS` | `0` (tự dò) | Số tác vụ CPU đồng thời; trần 256 |
| `RUST_TASK_QUEUE_CAPACITY` | `256` | Số việc được chờ; 0/không hợp lệ bị từ chối lúc khởi động |
| `RUST_TASK_WAIT_MS` | `2000` | Chờ tối đa để vào hàng đợi; hết hạn ⇒ 429 |
| `RUST_TASK_TIMEOUT_MS` | `30000` | Trần thời gian một tác vụ; ≤ `REQUEST_TIMEOUT_MS` |

## 6. Metrics

Trong `/metrics` hiện có (không mở endpoint mới):

- `bakhi_parallel_tasks_total{state}` — created / completed / failed / rejected /
  timeout / cancelled
- `bakhi_parallel_tasks_active` — gauge đang chạy
- `bakhi_parallel_tasks_pending` — gauge đang chờ
- `bakhi_parallel_queue_wait_seconds` — histogram thời gian chờ
- `bakhi_parallel_task_duration_seconds` — histogram thời gian thực thi

Summary Founder có khối `parallel` với các sample/quantile tương ứng.

## 7. An toàn (race, lock, dữ liệu người dùng)

- Dữ liệu chia sẻ duy nhất là closure `Send + 'static` do caller truyền; engine
  không giữ trạng thái nghiệp vụ.
- Không giữ `Mutex` qua `.await` trong đường xử lý: metrics dùng mutex rất ngắn,
  chỉ trong thao tác map (đã có từ 8.6.2).
- Gauge `active` do RAII guard giữ, kể cả khi caller đã nhận timeout ⇒ số liệu
  phản ánh đúng việc closure còn chạy.
- Không có id người dùng trong nhãn metrics; hàng đợi không phân biệt người
  dùng nên không thể rò dữ liệu giữa các lượt.

## 8. Giới hạn

- Một tác vụ CPU quá hạn vẫn chạy tới khi xong (không thể huỷ an toàn). Muốn
  cắt thật phải chia nhỏ công việc thành các đơn vị kiểm tra được.
- Engine không phải cơ chế chống DoS thay cho rate limit và giới hạn đồng thời
  hiện có; nó bảo vệ **worker CPU**, không bảo vệ provider AI.
- `available_parallelism()` trong container có thể báo số CPU của host; đặt
  `RUST_CPU_WORKERS` khi triển khai bị giới hạn CPU cứng.
