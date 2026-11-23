// ===========================================================================
// Bá Khí — Rust backend · main.rs
//
// Khởi động: đọc cấu hình, dựng AppState, chạy Axum trên HOST:PORT.
// Không in bất kỳ khoá hay token nào ra log.
// ===========================================================================

use std::net::SocketAddr;

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

    let state = match AppState::new(settings.clone()) {
        Ok(state) => state,
        Err(_) => {
            eprintln!("Không dựng được HTTP client.");
            std::process::exit(1);
        }
    };

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
        ai_mock = settings.ai_mock,
        persist = settings.persist_conversations,
        "Bá Khí backend đã sẵn sàng"
    );

    let server = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal());

    if let Err(error) = server.await {
        tracing::error!(target: "bakhi::startup", error = %error, "máy chủ dừng bất thường");
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
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!(target: "bakhi::startup", "đang dừng theo tín hiệu hệ thống");
}
