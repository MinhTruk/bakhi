// ===========================================================================
// Bá Khí — Rust backend · cache/mod.rs  (8.7.3 · Intelligent Caching)
//
// L1 — bộ nhớ đệm trong RAM dùng chung cho toàn tiến trình.
//
// Nguyên tắc thiết kế:
//   * Không thêm dependency: HashMap + BTreeMap (thứ tự LRU) + Mutex + atomic.
//     Không dùng DashMap/Moka vì quy mô dữ liệu cấu hình nhỏ (vài trăm entry)
//     và một mutex ngắn hạn còn rẻ hơn cả việc kéo thêm crate.
//   * Khoá chỉ giữ trong thao tác trên map, KHÔNG bao giờ giữ qua `.await` hay
//     gọi I/O — nhờ vậy cache không chặn Tokio worker thread.
//   * Bộ đếm metrics dùng atomic nằm ngoài mutex: ghi metrics không phải chờ
//     các request khác đang đọc cache.
//   * TTL theo từng entry, có jitter theo khoá để nhiều entry không hết hạn
//     cùng một thời điểm (tránh dồn request về nguồn dữ liệu).
//   * Giới hạn cả số entry lẫn số byte; vượt trần thì loại entry ít dùng nhất.
//     Entry lớn hơn toàn bộ hạn mức bị từ chối thay vì đẩy hết entry khác ra.
//   * `get_stale()` chỉ trả dữ liệu cũ trong khoảng `stale_ttl` cấu hình — dùng
//     làm phao khi nguồn dữ liệu lỗi, không phải nguồn dữ liệu chính thức.
//
// Cache KHÔNG phải cơ chế xác thực/phân quyền. Chỉ dữ liệu công khai hoặc cấu
// hình cấp hệ thống được đưa vào đây; dữ liệu cá nhân, token và nội dung AI
// theo yêu cầu cá nhân không được cache (xem docs/INTELLIGENT_CACHING_V873.md).
// ===========================================================================

pub mod singleflight;

pub use singleflight::SingleFlight;

use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::observability::metrics::Histogram;

/// Bucket thời gian tra cache (giây): từ dưới 1 µs tới 1 ms.
pub const LOOKUP_BUCKETS: [f64; 7] = [
    0.000_001, 0.000_005, 0.000_010, 0.000_050, 0.000_100, 0.000_500, 0.001_000,
];

/// Chi phí ước tính cố định cho khoá + metadata của một entry.
const ENTRY_OVERHEAD: usize = 96;

#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// Công tắc tổng. `false` ⇒ mọi thao tác là bypass, không lưu gì.
    pub enabled: bool,
    /// Tầng L1 (RAM). Tắt riêng tầng này để so sánh/rollback.
    pub l1_enabled: bool,
    pub max_entries: usize,
    pub max_bytes: usize,
    pub default_ttl: Duration,
    /// Khoảng cho phép phục vụ dữ liệu đã hết TTL khi nguồn dữ liệu lỗi.
    pub stale_ttl: Duration,
    /// Jitter TTL theo khoá, tính theo phần trăm (0 = tắt).
    pub jitter_percent: u8,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            l1_enabled: true,
            max_entries: 512,
            max_bytes: 8 * 1024 * 1024,
            default_ttl: Duration::from_secs(60),
            stale_ttl: Duration::from_secs(120),
            jitter_percent: 10,
        }
    }
}

/// Bộ đếm dùng chung giữa L1 và singleflight.
#[derive(Debug, Default)]
pub struct CacheCounters {
    pub hits: AtomicU64,
    pub misses: AtomicU64,
    pub lookups: AtomicU64,
    pub evictions: AtomicU64,
    pub expirations: AtomicU64,
    pub invalidations: AtomicU64,
    pub bypasses: AtomicU64,
    pub rejected: AtomicU64,
    pub stale_served: AtomicU64,
    pub dedup_joined: AtomicU64,
    pub dedup_leader: AtomicU64,
    pub dedup_errors: AtomicU64,
}

impl CacheCounters {
    fn bump(counter: &AtomicU64, amount: u64) {
        counter.fetch_add(amount, Ordering::Relaxed);
    }

    fn read(counter: &AtomicU64) -> u64 {
        counter.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Clone)]
struct Entry {
    value: Arc<Value>,
    namespace: String,
    tags: Vec<String>,
    expires_at: Instant,
    /// Hạn cuối được phép phục vụ dữ liệu cũ (expires_at + stale_ttl).
    stale_until: Instant,
    bytes: usize,
    tick: u64,
}

struct Inner {
    entries: HashMap<String, Entry>,
    /// tick tăng đơn điệu → khoá; `pop_first()` là entry ít dùng nhất.
    order: BTreeMap<u64, String>,
    tick: u64,
    bytes: usize,
    lookup: Histogram,
}

impl Inner {
    fn remove(&mut self, key: &str) -> Option<Entry> {
        let entry = self.entries.remove(key)?;
        self.order.remove(&entry.tick);
        self.bytes = self.bytes.saturating_sub(entry.bytes);
        Some(entry)
    }

    /// Đánh dấu vừa dùng và trả giá trị (không clone payload, chỉ clone Arc).
    fn touch(&mut self, key: &str) -> Option<Arc<Value>> {
        let tick = self.tick.saturating_add(1);
        let entry = self.entries.get_mut(key)?;
        self.order.remove(&entry.tick);
        entry.tick = tick;
        self.tick = tick;
        let value = entry.value.clone();
        self.order.insert(tick, key.to_string());
        Some(value)
    }

    fn evict_until_within_limits(&mut self, max_entries: usize, max_bytes: usize) {
        while self.entries.len() > max_entries || self.bytes > max_bytes {
            let Some((_, key)) = self.order.pop_first() else {
                break;
            };
            if let Some(entry) = self.entries.remove(&key) {
                self.bytes = self.bytes.saturating_sub(entry.bytes);
            }
        }
    }
}

pub struct Cache {
    config: CacheConfig,
    counters: Arc<CacheCounters>,
    inner: Mutex<Inner>,
}

/// Ảnh chụp trạng thái cache cho dashboard/Prometheus. Không chứa payload,
/// khoá hay bất kỳ dữ liệu cá nhân nào.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub enabled: bool,
    pub l1_enabled: bool,
    pub entry_count: usize,
    pub size_bytes: usize,
    pub max_entries: usize,
    pub max_bytes: usize,
    pub hits: u64,
    pub misses: u64,
    pub lookups: u64,
    pub hit_rate: f64,
    pub evictions: u64,
    pub expirations: u64,
    pub invalidations: u64,
    pub bypasses: u64,
    pub rejected: u64,
    pub stale_served: u64,
    pub dedup_joined: u64,
    pub dedup_leader: u64,
    pub dedup_errors: u64,
    pub saved_requests: u64,
    pub lookup_p50_us: f64,
    pub lookup_p95_us: f64,
    pub lookup_avg_us: f64,
}

impl Default for Cache {
    fn default() -> Self {
        Self::new(CacheConfig::default(), Arc::new(CacheCounters::default()))
    }
}

impl Cache {
    pub fn new(config: CacheConfig, counters: Arc<CacheCounters>) -> Self {
        Self {
            config,
            counters,
            inner: Mutex::new(Inner {
                entries: HashMap::new(),
                order: BTreeMap::new(),
                tick: 0,
                bytes: 0,
                lookup: Histogram::new(&LOOKUP_BUCKETS),
            }),
        }
    }

    pub fn config(&self) -> &CacheConfig {
        &self.config
    }

    pub fn counters(&self) -> Arc<CacheCounters> {
        self.counters.clone()
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // Một panic ở nơi khác không được làm cache ngừng hoạt động.
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn usable(&self) -> bool {
        self.config.enabled && self.config.l1_enabled
    }

    /// Đọc entry còn hạn. Không bao giờ trả dữ liệu đã hết TTL.
    pub fn get(&self, key: &str) -> Option<Arc<Value>> {
        self.lookup(key, false)
    }

    /// Đọc entry đã hết TTL nhưng còn trong khoảng `stale_ttl`.
    /// Chỉ dùng làm phao khi nguồn dữ liệu gốc lỗi.
    pub fn get_stale(&self, key: &str) -> Option<Arc<Value>> {
        self.lookup(key, true)
    }

    fn lookup(&self, key: &str, allow_stale: bool) -> Option<Arc<Value>> {
        if !self.usable() {
            CacheCounters::bump(&self.counters.bypasses, 1);
            return None;
        }

        let started = Instant::now();
        let mut inner = self.lock();
        let now = Instant::now();

        let expired = match inner.entries.get(key) {
            Some(entry) => entry.expires_at <= now,
            None => false,
        };
        if expired {
            let stale_ok = inner
                .entries
                .get(key)
                .map(|entry| allow_stale && entry.stale_until > now)
                .unwrap_or(false);
            if stale_ok {
                inner.lookup.observe(started.elapsed().as_secs_f64());
                let value = inner.touch(key)?;
                CacheCounters::bump(&self.counters.lookups, 1);
                CacheCounters::bump(&self.counters.stale_served, 1);
                return Some(value);
            }
            let _ = inner.remove(key);
            CacheCounters::bump(&self.counters.expirations, 1);
        }

        let value = inner.touch(key);
        inner.lookup.observe(started.elapsed().as_secs_f64());
        CacheCounters::bump(&self.counters.lookups, 1);
        match value {
            Some(value) => {
                CacheCounters::bump(&self.counters.hits, 1);
                Some(value)
            }
            None => {
                CacheCounters::bump(&self.counters.misses, 1);
                None
            }
        }
    }

    /// Ghi đè entry. `ttl` bằng 0 nghĩa là "không cache".
    /// Trả `true` khi entry thực sự được lưu.
    pub fn insert(&self, key: &str, value: Value, ttl: Option<Duration>, tags: &[&str]) -> bool {
        if !self.usable() {
            CacheCounters::bump(&self.counters.bypasses, 1);
            return false;
        }
        let ttl = ttl.unwrap_or(self.config.default_ttl);
        if ttl.is_zero() {
            return false;
        }

        let bytes = key
            .len()
            .saturating_add(ENTRY_OVERHEAD)
            .saturating_add(value_bytes(&value));
        if bytes > self.config.max_bytes {
            // Một payload lớn hơn cả hạn mức không được phép đẩy hết cache ra.
            CacheCounters::bump(&self.counters.rejected, 1);
            return false;
        }

        let now = Instant::now();
        let expires_at = now + jittered(ttl, key, self.config.jitter_percent);
        let entry = Entry {
            value: Arc::new(value),
            namespace: namespace_of(key),
            tags: tags.iter().map(|tag| (*tag).to_string()).collect(),
            expires_at,
            stale_until: expires_at + self.config.stale_ttl,
            bytes,
            tick: 0,
        };

        let mut inner = self.lock();
        let _ = inner.remove(key);
        let tick = inner.tick.saturating_add(1);
        inner.tick = tick;
        inner.bytes = inner.bytes.saturating_add(bytes);
        inner
            .entries
            .insert(key.to_string(), Entry { tick, ..entry });
        inner.order.insert(tick, key.to_string());

        let before = inner.entries.len();
        inner.evict_until_within_limits(self.config.max_entries, self.config.max_bytes);
        let evicted = before.saturating_sub(inner.entries.len()) as u64;
        drop(inner);
        if evicted > 0 {
            CacheCounters::bump(&self.counters.evictions, evicted);
        }
        true
    }

    /// Xoá một khoá. `true` khi có entry bị xoá.
    pub fn invalidate(&self, key: &str) -> bool {
        let mut inner = self.lock();
        let removed = inner.remove(key).is_some();
        drop(inner);
        if removed {
            CacheCounters::bump(&self.counters.invalidations, 1);
        }
        removed
    }

    /// Xoá toàn bộ một namespace (phần trước dấu `:` đầu tiên của khoá).
    pub fn invalidate_namespace(&self, namespace: &str) -> usize {
        let mut inner = self.lock();
        let keys: Vec<String> = inner
            .entries
            .iter()
            .filter(|(_, entry)| entry.namespace == namespace)
            .map(|(key, _)| key.clone())
            .collect();
        let removed = keys.len();
        for key in keys {
            let _ = inner.remove(&key);
        }
        drop(inner);
        CacheCounters::bump(&self.counters.invalidations, removed as u64);
        removed
    }

    /// Xoá mọi entry mang một tag.
    pub fn invalidate_tag(&self, tag: &str) -> usize {
        let mut inner = self.lock();
        let keys: Vec<String> = inner
            .entries
            .iter()
            .filter(|(_, entry)| entry.tags.iter().any(|item| item == tag))
            .map(|(key, _)| key.clone())
            .collect();
        let removed = keys.len();
        for key in keys {
            let _ = inner.remove(&key);
        }
        drop(inner);
        CacheCounters::bump(&self.counters.invalidations, removed as u64);
        removed
    }

    /// Xoá toàn bộ cache (dùng khi rollback hoặc đổi cấu hình).
    pub fn clear(&self) {
        let mut inner = self.lock();
        let removed = inner.entries.len();
        inner.entries.clear();
        inner.order.clear();
        inner.bytes = 0;
        drop(inner);
        CacheCounters::bump(&self.counters.invalidations, removed as u64);
    }

    /// Dọn các entry đã quá hạn cứng (kể cả khoảng stale).
    pub fn sweep(&self) -> usize {
        let now = Instant::now();
        let mut inner = self.lock();
        let keys: Vec<String> = inner
            .entries
            .iter()
            .filter(|(_, entry)| entry.stale_until <= now)
            .map(|(key, _)| key.clone())
            .collect();
        let removed = keys.len();
        for key in keys {
            let _ = inner.remove(&key);
        }
        drop(inner);
        CacheCounters::bump(&self.counters.expirations, removed as u64);
        removed
    }

    pub fn len(&self) -> usize {
        self.lock().entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn stats(&self) -> CacheStats {
        let inner = self.lock();
        let entry_count = inner.entries.len();
        let size_bytes = inner.bytes;
        let lookup_p50_us = inner.lookup.quantile(0.50).unwrap_or(0.0) * 1_000_000.0;
        let lookup_p95_us = inner.lookup.quantile(0.95).unwrap_or(0.0) * 1_000_000.0;
        let lookup_avg_us = inner.lookup.average() * 1_000_000.0;
        drop(inner);

        let hits = CacheCounters::read(&self.counters.hits);
        let misses = CacheCounters::read(&self.counters.misses);
        let lookups = CacheCounters::read(&self.counters.lookups);
        let dedup_joined = CacheCounters::read(&self.counters.dedup_joined);

        CacheStats {
            enabled: self.config.enabled,
            l1_enabled: self.config.l1_enabled,
            entry_count,
            size_bytes,
            max_entries: self.config.max_entries,
            max_bytes: self.config.max_bytes,
            hits,
            misses,
            lookups,
            hit_rate: if lookups == 0 {
                0.0
            } else {
                (hits as f64 / lookups as f64 * 1000.0).round() / 10.0
            },
            evictions: CacheCounters::read(&self.counters.evictions),
            expirations: CacheCounters::read(&self.counters.expirations),
            invalidations: CacheCounters::read(&self.counters.invalidations),
            bypasses: CacheCounters::read(&self.counters.bypasses),
            rejected: CacheCounters::read(&self.counters.rejected),
            stale_served: CacheCounters::read(&self.counters.stale_served),
            dedup_joined,
            dedup_leader: CacheCounters::read(&self.counters.dedup_leader),
            dedup_errors: CacheCounters::read(&self.counters.dedup_errors),
            saved_requests: hits.saturating_add(dedup_joined),
            lookup_p50_us: round3(lookup_p50_us),
            lookup_p95_us: round3(lookup_p95_us),
            lookup_avg_us: round3(lookup_avg_us),
        }
    }

    /// Dòng Prometheus cho cache. Tên metric theo quy ước `bakhi_cache_*`.
    pub fn prometheus(&self) -> String {
        use std::fmt::Write as _;

        let stats = self.stats();
        let mut out = String::new();
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_hit_total Số lần đọc cache có dữ liệu còn hạn.\n# TYPE bakhi_cache_hit_total counter\nbakhi_cache_hit_total {}",
            stats.hits
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_miss_total Số lần đọc cache không có dữ liệu còn hạn.\n# TYPE bakhi_cache_miss_total counter\nbakhi_cache_miss_total {}",
            stats.misses
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_hit_rate Tỷ lệ hit (%), tính từ lúc tiến trình khởi động.\n# TYPE bakhi_cache_hit_rate gauge\nbakhi_cache_hit_rate {:.1}",
            stats.hit_rate
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_eviction_total Số entry bị loại vì vượt giới hạn.\n# TYPE bakhi_cache_eviction_total counter\nbakhi_cache_eviction_total {}",
            stats.evictions
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_expiration_total Số entry hết TTL.\n# TYPE bakhi_cache_expiration_total counter\nbakhi_cache_expiration_total {}",
            stats.expirations
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_invalidation_total Số entry bị xoá chủ động.\n# TYPE bakhi_cache_invalidation_total counter\nbakhi_cache_invalidation_total {}",
            stats.invalidations
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_size_bytes Dung lượng ước tính của cache L1.\n# TYPE bakhi_cache_size_bytes gauge\nbakhi_cache_size_bytes {}",
            stats.size_bytes
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_entry_count Số entry đang giữ trong L1.\n# TYPE bakhi_cache_entry_count gauge\nbakhi_cache_entry_count {}",
            stats.entry_count
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_dedup_total Số request được gộp vào một request đang chạy.\n# TYPE bakhi_cache_dedup_total counter\nbakhi_cache_dedup_total {}",
            stats.dedup_joined
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_saved_requests Số request nguồn được giảm (hit + dedup).\n# TYPE bakhi_cache_saved_requests counter\nbakhi_cache_saved_requests {}",
            stats.saved_requests
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_cache_bypass_total Số lần bỏ qua cache (tắt cache hoặc TTL 0).\n# TYPE bakhi_cache_bypass_total counter\nbakhi_cache_bypass_total {}",
            stats.bypasses
        );
        out
    }
}

fn namespace_of(key: &str) -> String {
    key.split(':')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("default")
        .to_string()
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

/// TTL jitter tất định theo khoá: các khoá khác nhau hết hạn ở thời điểm khác
/// nhau nhưng cùng một khoá luôn có cùng TTL (dễ suy luận, dễ kiểm thử).
fn jittered(ttl: Duration, key: &str, percent: u8) -> Duration {
    if percent == 0 {
        return ttl;
    }
    let span_ms = (ttl.as_millis() as u64).saturating_mul(u64::from(percent.min(50))) / 100;
    if span_ms == 0 {
        return ttl;
    }
    let offset = key_hash(key) % (span_ms.saturating_mul(2).saturating_add(1));
    ttl.saturating_sub(Duration::from_millis(span_ms)) + Duration::from_millis(offset)
}

/// FNV-1a 64-bit: chỉ dùng để rải TTL, không phải bảo mật và không phụ thuộc
/// `DefaultHasher` (giá trị của nó có thể đổi giữa các phiên bản Rust).
fn key_hash(key: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in key.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

/// Ước lượng dung lượng của một giá trị JSON mà KHÔNG serialize lại.
fn value_bytes(value: &Value) -> usize {
    match value {
        Value::Null | Value::Bool(_) => 8,
        Value::Number(_) => 16,
        Value::String(text) => text.len().saturating_add(24),
        Value::Array(items) => items.iter().fold(24usize, |total, item| {
            total.saturating_add(value_bytes(item))
        }),
        Value::Object(map) => map.iter().fold(24usize, |total, (key, item)| {
            total
                .saturating_add(key.len())
                .saturating_add(24)
                .saturating_add(value_bytes(item))
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cache(entries: usize, bytes: usize) -> Cache {
        Cache::new(
            CacheConfig {
                enabled: true,
                l1_enabled: true,
                max_entries: entries,
                max_bytes: bytes,
                default_ttl: Duration::from_secs(30),
                stale_ttl: Duration::from_secs(30),
                jitter_percent: 0,
            },
            Arc::new(CacheCounters::default()),
        )
    }

    #[test]
    fn stores_and_reports_hit_then_miss() {
        let cache = cache(8, 64 * 1024);
        assert!(cache.get("ai:settings").is_none());
        assert!(cache.insert(
            "ai:settings",
            serde_json::json!({ "enabled": true }),
            None,
            &[]
        ));
        let value = cache.get("ai:settings").unwrap();
        assert_eq!(value["enabled"], true);
        let stats = cache.stats();
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 1);
        assert_eq!(stats.entry_count, 1);
    }

    #[tokio::test]
    async fn expired_entry_is_not_served_by_get_but_is_available_as_stale() {
        let cache = cache(8, 64 * 1024);
        cache.insert(
            "ai:routes",
            serde_json::json!([1, 2]),
            Some(Duration::from_millis(20)),
            &[],
        );
        tokio::time::sleep(Duration::from_millis(40)).await;
        let stale = cache.get_stale("ai:routes").expect("stale còn hạn dùng");
        assert_eq!(stale.as_array().map(Vec::len), Some(2));
        assert!(
            cache.get("ai:routes").is_none(),
            "get() không trả dữ liệu hết hạn"
        );
        let stats = cache.stats();
        assert_eq!(stats.stale_served, 1);
        assert_eq!(stats.expirations, 1);
        assert_eq!(stats.entry_count, 0);
    }

    #[test]
    fn lru_evicts_least_recently_used_entry() {
        let cache = cache(2, 64 * 1024);
        cache.insert("ns:a", serde_json::json!(1), None, &[]);
        cache.insert("ns:b", serde_json::json!(2), None, &[]);
        // a vừa được dùng ⇒ b là entry ít dùng nhất.
        cache.get("ns:a");
        cache.insert("ns:c", serde_json::json!(3), None, &[]);
        assert!(cache.get("ns:b").is_none(), "b phải bị loại");
        assert!(cache.get("ns:a").is_some());
        assert!(cache.get("ns:c").is_some());
        assert_eq!(cache.stats().evictions, 1);
    }

    #[test]
    fn oversized_entry_is_rejected_without_dropping_the_cache() {
        let cache = cache(8, 512);
        assert!(cache.insert("big:one", serde_json::json!("x".repeat(100)), None, &[]));
        assert_eq!(cache.stats().entry_count, 1);
        assert!(!cache.insert("big:two", serde_json::json!("y".repeat(4096)), None, &[]));
        assert_eq!(cache.stats().rejected, 1);
        assert!(cache.get("big:one").is_some(), "entry cũ phải còn nguyên");
    }

    #[test]
    fn byte_limit_evicts_oldest_entries() {
        let cache = cache(64, 900);
        for index in 0..6 {
            cache.insert(
                &format!("ns:{index}"),
                serde_json::json!("z".repeat(200)),
                None,
                &[],
            );
        }
        let stats = cache.stats();
        assert!(
            stats.size_bytes <= 900,
            "vượt hạn mức byte: {}",
            stats.size_bytes
        );
        assert!(stats.entry_count < 6);
        assert!(stats.evictions > 0);
    }

    #[test]
    fn invalidation_by_key_namespace_and_tag() {
        let cache = cache(32, 64 * 1024);
        cache.insert("ai:settings", serde_json::json!(1), None, &["ai-config"]);
        cache.insert("ai:routes", serde_json::json!(2), None, &["ai-config"]);
        cache.insert("pub:flags", serde_json::json!(3), None, &["public"]);

        assert!(cache.invalidate("ai:settings"));
        assert!(cache.get("ai:settings").is_none());

        assert_eq!(cache.invalidate_namespace("ai"), 1);
        assert!(cache.get("ai:routes").is_none());
        assert!(cache.get("pub:flags").is_some());

        assert_eq!(cache.invalidate_tag("public"), 1);
        assert!(cache.get("pub:flags").is_none());
        assert_eq!(cache.stats().invalidations, 3);
    }

    #[test]
    fn disabled_cache_bypasses_and_stores_nothing() {
        let cache = Cache::new(
            CacheConfig {
                enabled: false,
                ..CacheConfig::default()
            },
            Arc::new(CacheCounters::default()),
        );
        assert!(!cache.insert("ai:settings", serde_json::json!(1), None, &[]));
        assert!(cache.get("ai:settings").is_none());
        assert_eq!(cache.stats().entry_count, 0);
        assert!(cache.stats().bypasses > 0);
    }

    #[test]
    fn zero_ttl_does_not_cache() {
        let cache = cache(8, 64 * 1024);
        assert!(!cache.insert(
            "ai:settings",
            serde_json::json!(1),
            Some(Duration::ZERO),
            &[]
        ));
        assert_eq!(cache.stats().entry_count, 0);
    }

    #[tokio::test]
    async fn concurrent_access_is_safe_and_bounded() {
        let cache = Arc::new(cache(16, 64 * 1024));
        let mut tasks = Vec::new();
        for worker in 0..8 {
            let cache = cache.clone();
            tasks.push(tokio::spawn(async move {
                for index in 0..50 {
                    let key = format!("ns:{}", index % 4);
                    cache.insert(&key, serde_json::json!(worker + index), None, &[]);
                    cache.get(&key);
                }
            }));
        }
        for task in tasks {
            task.await.expect("không panic khi truy cập đồng thời");
        }
        let stats = cache.stats();
        assert!(stats.entry_count <= 16);
        assert!(stats.size_bytes <= 64 * 1024);
        assert_eq!(stats.lookups, 400);
    }

    #[test]
    fn reports_namespace_scoped_metrics_without_payload_data() {
        let cache = cache(8, 64 * 1024);
        cache.insert(
            "ai:settings",
            serde_json::json!({ "model": "x" }),
            None,
            &[],
        );
        cache.get("ai:settings");
        let json = serde_json::to_string(&cache.stats()).unwrap();
        assert!(json.contains("\"hitRate\""));
        assert!(!json.contains("\"model\""), "stats không được lộ payload");
    }
}
