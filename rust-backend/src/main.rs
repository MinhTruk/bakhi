// ===========================================================================
// Bá Khí — Rust backend · main.rs
//
// Trình tự khởi động (8.6.1):
//   1. Đọc + kiểm tra cấu hình (dừng ngay nếu sai, thông điệp không chứa khoá).
//   2. Dựng HTTP client dùng chung, Supabase client, provider registry,
//      circuit breaker, semaphore và metrics — MỘT LẦN.
//   3. Mở cổng, sau đó mới log "đã sẵn sàng".
//   4. Khi nhận SIGTERM/SIGINT: bật cờ draining (⇒ /ready trả 503), ngừng nhận
//      request mới, chờ request đang chạy tối đa SHUTDOWN_GRACE_MS rồi kết thúc.
//
// Không in bất kỳ khoá hay token nào ra log.
// ===========================================================================

use std::net::SocketAddr;
use std::time::Duration;

use bakhi_backend::{build_router, config::Settings, AppState, VERSION};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("bakhi_backend=info,tower_http=warn")),
        )
        .with_target(true)
        .compact()
        .init();

    let settings = match Settings::from_env() {
        Ok(settings) => settings,
        Err(error) => {
            // Thông điệp cấu hình không chứa giá trị bí mật.
            eprintln!("Không khởi động được Bá Khí backend: {error}");
            std::process::exit(1);
        }
    };

    let host = settings.host.clone();
    let port = settings.port;
    let shutdown_grace = settings.shutdown_grace;

    let state = match AppState::new(settings) {
        Ok(state) => state,
        Err(_) => {
            eprintln!("Không dựng được HTTP client.");
            std::process::exit(1);
        }
    };

    let lifecycle = state.lifecycle.clone();
    let app = build_router(state);
    let bind = format!("{host}:{port}");
    let listener = match TcpListener::bind(&bind).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("Không mở được cổng {bind}: {error}");
            std::process::exit(1);
        }
    };

    tracing::info!(
        target: "bakhi::startup",
        version = VERSION,
        bind = %bind,
        shutdown_grace_ms = shutdown_grace.as_millis() as u64,
        "Bá Khí backend đã sẵn sàng"
    );

    let server = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown({
        let lifecycle = lifecycle.clone();
        async move {
            shutdown_signal().await;
            // Bật draining trước khi Axum ngừng nhận kết nối mới.
            lifecycle.begin_shutdown();
            tracing::info!(
                target: "bakhi::shutdown",
                active_requests = lifecycle.active(),
                "bắt đầu dừng: ngừng nhận request mới"
            );
        }
    });

    match tokio::time::timeout(shutdown_grace, server).await {
        Ok(Ok(())) => {
            tracing::info!(
                target: "bakhi::shutdown",
                active_requests = lifecycle.active(),
                "đã dừng an toàn"
            );
        }
        Ok(Err(error)) => {
            tracing::error!(
                target: "bakhi::startup",
                error = %error,
                "máy chủ dừng bất thường"
            );
            std::process::exit(1);
        }
        Err(_) => {
            // Hết thời gian chờ: kết thúc tiến trình thay vì treo vô hạn.
            // Request chưa xong bị huỷ; không có dữ liệu nào được xác nhận thành
            // công trước đó bị mất (mọi ghi đã hoàn tất mới trả phản hồi).
            tracing::error!(
                target: "bakhi::shutdown",
                grace_ms = shutdown_grace.as_millis() as u64,
                active_requests = lifecycle.active(),
                "quá thời gian chờ shutdown; kết thúc tiến trình"
            );
        }
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        } else {
            std::future::pending::<()>().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!(target: "bakhi::shutdown", "nhận tín hiệu dừng từ hệ thống");
}

/// Giá trị mặc định dùng cho tài liệu/kiểm thử về hạn chờ shutdown.
pub const DEFAULT_SHUTDOWN_GRACE: Duration = Duration::from_secs(20);
