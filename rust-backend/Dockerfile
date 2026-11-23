# ===========================================================================
# Bá Khí — Rust backend · Dockerfile
#
# Build nhiều tầng: biên dịch với toolchain đầy đủ, chạy bằng image gọn.
# Không chứa secret: mọi khoá truyền vào bằng biến môi trường lúc chạy.
# ===========================================================================

FROM rust:1.83-bookworm AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
# Tạo build "rỗng" để cache lớp phụ thuộc trước khi copy mã nguồn.
RUN mkdir -p src && echo "fn main() {}" > src/main.rs \
    && echo "" > src/lib.rs \
    && cargo build --release \
    && rm -rf src

COPY src ./src
COPY tests ./tests
RUN touch src/main.rs src/lib.rs && cargo build --release

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --create-home bakhi

WORKDIR /app
COPY --from=builder /build/target/release/bakhi-backend /usr/local/bin/bakhi-backend

USER bakhi
ENV HOST=0.0.0.0 \
    PORT=8080 \
    RUST_LOG=bakhi_backend=info,tower_http=warn

EXPOSE 8080

# Orchestration gửi SIGTERM trước khi kill: server bật draining, ngừng nhận request
# mới và chờ request đang chạy tối đa SHUTDOWN_GRACE_MS rồi mới kết thúc.
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/v1/health" || exit 1

ENTRYPOINT ["/usr/local/bin/bakhi-backend"]
