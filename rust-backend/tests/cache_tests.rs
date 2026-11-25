// ===========================================================================
// Bá Khí — Rust backend · tests/cache_tests.rs  (8.7.3)
//
// Kiểm tra NỐI DÂY của Cache Engine trong AppState và cấu hình qua biến môi
// trường. Thuật toán TTL/LRU/invalidation/singleflight có unit test riêng
// trong src/cache/. Không gọi mạng, không cần Supabase.
// ===========================================================================

use bakhi_backend::cache::{Cache, CacheConfig, CacheCounters};
use bakhi_backend::config::{ConfigError, Settings};
use bakhi_backend::AppState;

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;

#[test]
fn app_state_dung_chung_mot_cache() {
    let state = AppState::new(Settings::for_tests()).expect("dựng được AppState");
    let clone = state.clone();

    assert!(state.cache.insert(
        "ai:settings:v1",
        json!({ "enabled": true, "model": "openai/gpt-oss-20b" }),
        Some(Duration::from_secs(30)),
        &["ai-config"],
    ));

    let hit = clone
        .cache
        .get("ai:settings:v1")
        .expect("bản sao thấy cùng cache");
    assert_eq!(hit["model"], "openai/gpt-oss-20b");

    let stats = state.cache.stats();
    assert!(stats.enabled);
    assert_eq!(stats.entry_count, 1);
    assert_eq!(stats.hits, 1);
    assert_eq!(stats.saved_requests, 1);
}

#[test]
fn metrics_summary_co_khoi_cache_va_khong_lo_du_lieu() {
    let state = AppState::new(Settings::for_tests()).expect("dựng được AppState");
    state.cache.insert(
        "ai:settings:v1",
        json!({ "model": "secret-model-name" }),
        None,
        &[],
    );
    let stats = serde_json::to_value(state.cache.stats()).expect("stats serialize được");
    assert!(stats.get("hitRate").is_some());
    assert!(stats.get("entryCount").is_some());
    let text = stats.to_string();
    assert!(
        !text.contains("secret-model-name"),
        "metrics không được lộ payload"
    );
}

#[test]
fn prometheus_cache_metrics_du_ten_va_co_gia_tri() {
    let cache = Cache::new(CacheConfig::default(), Arc::new(CacheCounters::default()));
    cache.insert("ai:routes:v1", json!([]), None, &["ai-config"]);
    cache.get("ai:routes:v1");
    cache.invalidate("ai:routes:v1");
    let body = cache.prometheus();
    for name in [
        "bakhi_cache_hit_total",
        "bakhi_cache_miss_total",
        "bakhi_cache_hit_rate",
        "bakhi_cache_eviction_total",
        "bakhi_cache_expiration_total",
        "bakhi_cache_invalidation_total",
        "bakhi_cache_size_bytes",
        "bakhi_cache_entry_count",
        "bakhi_cache_dedup_total",
        "bakhi_cache_saved_requests",
        "bakhi_cache_bypass_total",
    ] {
        assert!(body.contains(name), "thiếu metric {name}");
    }
    assert!(body.contains("bakhi_cache_hit_total 1"));
    assert!(body.contains("bakhi_cache_invalidation_total 1"));
}

#[test]
fn cache_tat_thi_khong_luu_gi() {
    let mut settings = Settings::for_tests();
    settings.cache_enabled = false;
    let state = AppState::new(settings).expect("dựng được AppState");
    let stored = state
        .cache
        .insert("ai:settings:v1", json!({ "enabled": true }), None, &[]);
    assert!(!stored);
    assert!(state.cache.get("ai:settings:v1").is_none());
    assert_eq!(state.cache.stats().entry_count, 0);
    assert!(state.cache.stats().bypasses > 0);
}

#[test]
fn gioi_han_cache_duoc_kiem_tra_khi_khoi_dong() {
    let mut settings = Settings::for_tests();
    settings.cache_max_entries = 1;
    assert!(matches!(
        settings.validate(),
        Err(ConfigError::Invalid("CACHE_MAX_ENTRIES"))
    ));

    let mut settings = Settings::for_tests();
    settings.cache_max_memory_bytes = 1024;
    assert!(matches!(
        settings.validate(),
        Err(ConfigError::Invalid("CACHE_MAX_MEMORY_BYTES"))
    ));

    let mut settings = Settings::for_tests();
    settings.cache_config_ttl = Duration::from_secs(7_200);
    assert!(matches!(
        settings.validate(),
        Err(ConfigError::Invalid("CACHE_TTL_AI_CONFIG"))
    ));
}

#[test]
fn mac_dinh_an_toan_va_bat_cache() {
    let settings = Settings::for_tests();
    assert!(settings.cache_enabled);
    assert!(settings.cache_l1_enabled);
    assert!(settings.cache_dedup_enabled);
    assert!(settings.cache_max_entries <= 100_000);
    assert!(settings.cache_max_memory_bytes <= 512 * 1024 * 1024);
    assert_eq!(settings.cache_config_ttl, Duration::from_secs(30));

    // Debug không được chứa khoá bí mật (cache không thêm trường bí mật nào).
    let text = format!("{settings:?}");
    assert!(!text.contains("test-provider-key"));
}
