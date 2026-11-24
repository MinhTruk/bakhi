// ===========================================================================
// Bá Khí — Rust backend · observability/metrics.rs
//
// Registry metrics trong bộ nhớ (8.6.2): counter, gauge và histogram thật,
// xuất Prometheus text exposition tại `/metrics` và JSON tổng hợp cho Founder
// Dashboard. Không phụ thuộc Prometheus client, không gọi database cho từng
// metric, không chứa nhãn người dùng.
//
// Cardinality: method × route chuẩn hoá × status, provider × model × role ×
// status — tất cả hữu hạn. Trần `MAX_SERIES` bảo vệ bộ nhớ; vượt trần thì gộp
// vào nhãn `other` thay vì phình vô hạn.
//
// Chỉ số là "từ lúc tiến trình khởi động". Prometheus chịu trách nhiệm lưu
// chuỗi thời gian dài hạn; counter reset khi restart là hành vi đúng.
// ===========================================================================

use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Instant;

use serde_json::{json, Value};

use crate::observability::pricing::Pricing;
use crate::providers::circuit::CircuitState;
use crate::providers::{Provider, Usage};

/// Bucket HTTP (giây): từ request rất nhanh tới request dài (AI gateway).
pub const HTTP_BUCKETS: [f64; 15] = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0, 45.0, 60.0,
];

/// Bucket AI provider (giây): bao cả provider chậm và timeout của gateway.
pub const AI_BUCKETS: [f64; 14] = [
    0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 12.0, 20.0, 30.0, 45.0, 60.0,
];

const MAX_SERIES: usize = 2_000;
const MAX_MODEL_LABEL: usize = 80;

// ---------------------------------------------------------------------------
// Histogram
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Histogram {
    buckets: Vec<f64>,
    /// Số quan sát luỹ kế cho từng bucket (đúng định nghĩa Prometheus).
    counts: Vec<u64>,
    sum: f64,
    count: u64,
}

impl Histogram {
    pub fn new(buckets: &[f64]) -> Self {
        Self {
            buckets: buckets.to_vec(),
            counts: vec![0; buckets.len()],
            sum: 0.0,
            count: 0,
        }
    }

    pub fn observe(&mut self, value: f64) {
        if !value.is_finite() || value < 0.0 {
            return;
        }
        for (index, bound) in self.buckets.iter().enumerate() {
            if value <= *bound {
                self.counts[index] = self.counts[index].saturating_add(1);
            }
        }
        self.count = self.count.saturating_add(1);
        self.sum += value;
    }

    pub fn merge(&mut self, other: &Histogram) {
        if self.counts.len() != other.counts.len() {
            return;
        }
        for (target, value) in self.counts.iter_mut().zip(other.counts.iter()) {
            *target = target.saturating_add(*value);
        }
        self.count = self.count.saturating_add(other.count);
        self.sum += other.sum;
    }

    /// Quantile theo thuật toán `histogram_quantile` của Prometheus:
    /// nội suy tuyến tính trong bucket chứa hạng, không lấy trung bình các
    /// trung bình. `None` khi chưa có quan sát.
    pub fn quantile(&self, q: f64) -> Option<f64> {
        if self.count == 0 || !(0.0..=1.0).contains(&q) {
            return None;
        }
        let rank = q * self.count as f64;
        let mut previous_bound = 0.0_f64;
        let mut previous_count = 0_u64;
        for (index, bound) in self.buckets.iter().enumerate() {
            let cumulative = self.counts[index];
            if cumulative as f64 >= rank {
                let in_bucket = cumulative.saturating_sub(previous_count);
                if in_bucket == 0 {
                    return Some(*bound);
                }
                let fraction = (rank - previous_count as f64) / in_bucket as f64;
                return Some(previous_bound + fraction * (bound - previous_bound));
            }
            previous_bound = *bound;
            previous_count = cumulative;
        }
        // Mọi quan sát vượt bucket cuối (chỉ xảy ra nếu bucket bị đổi cấu hình).
        self.buckets.last().copied()
    }

    pub fn count(&self) -> u64 {
        self.count
    }

    pub fn sum(&self) -> f64 {
        self.sum
    }

    pub fn average(&self) -> f64 {
        if self.count == 0 {
            0.0
        } else {
            self.sum / self.count as f64
        }
    }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

type HttpKey = (String, String, u16); // method, route, status
type AiAttemptKey = (String, String, String, String); // role, provider, model, status
type AiSeriesKey = (String, String, String); // role, provider, model
type TokenKey = (String, String, String, String, bool); // role, provider, model, type, estimated

#[derive(Default)]
struct Inner {
    http_requests: BTreeMap<HttpKey, u64>,
    http_duration: BTreeMap<HttpKey, Histogram>,
    http_errors: BTreeMap<(String, String, String), u64>, // route, method, category
    ai_requests: BTreeMap<AiAttemptKey, u64>,
    ai_duration: BTreeMap<AiSeriesKey, Histogram>,
    ai_tokens: BTreeMap<TokenKey, u64>,
    ai_cost: BTreeMap<AiSeriesKey, f64>,
    ai_errors: BTreeMap<(String, String, String), u64>, // provider, model, code
    ai_retries: BTreeMap<(String, String), u64>,        // provider, model
    ai_fallback: BTreeMap<&'static str, u64>,           // attempted | success | failure | skipped
    ai_requests_total: u64,
    ai_fallback_requests: u64,
    ai_failed_requests: u64,
    unpriced_requests: u64,
}

pub struct Metrics {
    started: Instant,
    pricing: Pricing,
    inner: Mutex<Inner>,
    in_flight: AtomicI64,
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new(Pricing::default())
    }
}

impl Metrics {
    pub fn new(pricing: Pricing) -> Self {
        Self {
            started: Instant::now(),
            pricing,
            inner: Mutex::new(Inner::default()),
            in_flight: AtomicI64::new(0),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // Một panic ở nơi khác không được làm metrics ngừng hoạt động.
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn enter(&self) {
        self.in_flight.fetch_add(1, Ordering::Relaxed);
    }

    pub fn leave(&self) {
        self.in_flight.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn in_flight(&self) -> i64 {
        self.in_flight.load(Ordering::Relaxed)
    }

    pub fn pricing(&self) -> &Pricing {
        &self.pricing
    }

    fn model_label(model: &str) -> String {
        let trimmed = model.trim();
        if trimmed.is_empty() {
            "unknown".to_string()
        } else {
            trimmed.chars().take(MAX_MODEL_LABEL).collect()
        }
    }

    /// Ghi một request HTTP đã hoàn tất. `/metrics` không đi qua đây.
    pub fn record_http(
        &self,
        method: &str,
        route: &str,
        status: u16,
        seconds: f64,
        category: &str,
    ) {
        let mut inner = self.lock();
        let route = if inner.http_requests.len() >= MAX_SERIES
            && !inner
                .http_requests
                .contains_key(&(method.to_string(), route.to_string(), status))
        {
            "other".to_string()
        } else {
            route.to_string()
        };
        let key = (method.to_string(), route.clone(), status);
        *inner.http_requests.entry(key.clone()).or_insert(0) += 1;
        inner
            .http_duration
            .entry(key)
            .or_insert_with(|| Histogram::new(&HTTP_BUCKETS))
            .observe(seconds);
        if status >= 400 {
            *inner
                .http_errors
                .entry((route, method.to_string(), category.to_string()))
                .or_insert(0) += 1;
        }
    }

    /// Một lượt chat của người dùng (không phải một attempt provider).
    ///
    /// `run_chain()` gọi hàm này đúng một lần cho mỗi lượt — kể cả khi chuỗi
    /// thất bại. Lượt đã chạm nhánh dự phòng mà vẫn thất bại vẫn mang
    /// `fell_back = true`, nên fallback rate không bị đếm thiếu.
    pub fn record_ai_request(&self, fell_back: bool, ok: bool) {
        let mut inner = self.lock();
        inner.ai_requests_total = inner.ai_requests_total.saturating_add(1);
        if fell_back {
            inner.ai_fallback_requests = inner.ai_fallback_requests.saturating_add(1);
        }
        if !ok {
            inner.ai_failed_requests = inner.ai_failed_requests.saturating_add(1);
        }
    }

    /// Một attempt provider (thành công hoặc thất bại), đo riêng thời gian.
    pub fn record_ai_attempt(
        &self,
        role: &str,
        provider: &str,
        model: &str,
        ok: bool,
        seconds: f64,
        code: Option<&str>,
    ) {
        let model = Self::model_label(model);
        let mut inner = self.lock();
        let status = if ok { "success" } else { "failure" };
        let attempt = (
            role.to_string(),
            provider.to_string(),
            model.clone(),
            status.to_string(),
        );
        *inner.ai_requests.entry(attempt).or_insert(0) += 1;
        inner
            .ai_duration
            .entry((role.to_string(), provider.to_string(), model.clone()))
            .or_insert_with(|| Histogram::new(&AI_BUCKETS))
            .observe(seconds);
        if let Some(code) = code {
            *inner
                .ai_errors
                .entry((provider.to_string(), model, code.to_string()))
                .or_insert(0) += 1;
        }
    }

    /// Token thực tế/ước tính + chi phí ước tính (nếu có bảng giá).
    pub fn record_ai_tokens(&self, role: &str, provider: &str, model: &str, usage: &Usage) {
        let model = Self::model_label(model);
        let mut inner = self.lock();
        for (kind, value) in [("input", usage.input), ("output", usage.output)] {
            if value == 0 {
                // Không ghi 0 như thể đã biết: thiếu dữ liệu là "unavailable".
                continue;
            }
            *inner
                .ai_tokens
                .entry((
                    role.to_string(),
                    provider.to_string(),
                    model.clone(),
                    kind.to_string(),
                    usage.estimated,
                ))
                .or_insert(0) += u64::from(value);
        }
        if usage.total == 0 && usage.input == 0 && usage.output == 0 {
            return;
        }
        match self
            .pricing
            .cost(provider, &model, usage.input, usage.output)
        {
            Some(cost) => {
                *inner
                    .ai_cost
                    .entry((role.to_string(), provider.to_string(), model))
                    .or_insert(0.0) += cost;
            }
            None => {
                inner.unpriced_requests = inner.unpriced_requests.saturating_add(1);
            }
        }
    }

    pub fn record_retry(&self, provider: &str, model: &str) {
        let model = Self::model_label(model);
        let mut inner = self.lock();
        *inner
            .ai_retries
            .entry((provider.to_string(), model))
            .or_insert(0) += 1;
    }

    /// `attempted` | `success` | `failure` | `skipped` (circuit OPEN).
    pub fn record_fallback(&self, outcome: &'static str) {
        let mut inner = self.lock();
        *inner.ai_fallback.entry(outcome).or_insert(0) += 1;
    }

    // -----------------------------------------------------------------------
    // Prometheus text exposition
    // -----------------------------------------------------------------------

    pub fn prometheus(&self, circuits: &[(Provider, CircuitState, u32)]) -> String {
        let inner = self.lock();
        let mut out = String::new();

        let _ = writeln!(
            out,
            "# HELP bakhi_http_requests_total Tổng số request HTTP đã hoàn tất (không tính /metrics).\n# TYPE bakhi_http_requests_total counter"
        );
        for ((method, route, status), count) in &inner.http_requests {
            let _ = writeln!(
                out,
                "bakhi_http_requests_total{{method=\"{}\",route=\"{}\",status=\"{}\"}} {}",
                escape(method),
                escape(route),
                status,
                count
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_http_request_duration_seconds Thời gian xử lý request HTTP.\n# TYPE bakhi_http_request_duration_seconds histogram"
        );
        for ((method, route, status), histogram) in &inner.http_duration {
            let labels = format!(
                "method=\"{}\",route=\"{}\",status=\"{}\"",
                escape(method),
                escape(route),
                status
            );
            render_histogram(
                &mut out,
                "bakhi_http_request_duration_seconds",
                &labels,
                histogram,
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_http_errors_total Request lỗi (>=400) theo nhóm nguyên nhân.\n# TYPE bakhi_http_errors_total counter"
        );
        for ((route, method, category), count) in &inner.http_errors {
            let _ = writeln!(
                out,
                "bakhi_http_errors_total{{method=\"{}\",route=\"{}\",category=\"{}\"}} {}",
                escape(method),
                escape(route),
                escape(category),
                count
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_http_in_flight_requests Số request đang xử lý.\n# TYPE bakhi_http_in_flight_requests gauge\nbakhi_http_in_flight_requests {}",
            self.in_flight()
        );

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_requests_total Số attempt provider theo vai trò và kết quả (một lượt chat có thể có nhiều attempt).\n# TYPE bakhi_ai_requests_total counter"
        );
        for ((role, provider, model, status), count) in &inner.ai_requests {
            let _ = writeln!(
                out,
                "bakhi_ai_requests_total{{role=\"{}\",provider=\"{}\",model=\"{}\",status=\"{}\"}} {}",
                escape(role),
                escape(provider),
                escape(model),
                escape(status),
                count
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_request_duration_seconds Thời gian một attempt provider (không gồm xử lý phía trình duyệt).\n# TYPE bakhi_ai_request_duration_seconds histogram"
        );
        for ((role, provider, model), histogram) in &inner.ai_duration {
            let labels = format!(
                "role=\"{}\",provider=\"{}\",model=\"{}\"",
                escape(role),
                escape(provider),
                escape(model)
            );
            render_histogram(
                &mut out,
                "bakhi_ai_request_duration_seconds",
                &labels,
                histogram,
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_tokens_total Token AI theo provider/model/vai trò; estimated=\"true\" là dữ liệu ước lượng.\n# TYPE bakhi_ai_tokens_total counter"
        );
        for ((role, provider, model, kind, estimated), count) in &inner.ai_tokens {
            let _ = writeln!(
                out,
                "bakhi_ai_tokens_total{{role=\"{}\",provider=\"{}\",model=\"{}\",type=\"{}\",estimated=\"{}\"}} {}",
                escape(role),
                escape(provider),
                escape(model),
                escape(kind),
                estimated,
                count
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_estimated_cost_usd_total Chi phí AI ước tính (USD) từ bảng giá cấu hình, không phải hoá đơn nhà cung cấp.\n# TYPE bakhi_ai_estimated_cost_usd_total counter"
        );
        for ((role, provider, model), cost) in &inner.ai_cost {
            let _ = writeln!(
                out,
                "bakhi_ai_estimated_cost_usd_total{{role=\"{}\",provider=\"{}\",model=\"{}\",currency=\"{}\"}} {:.6}",
                escape(role),
                escape(provider),
                escape(model),
                escape(&self.pricing.currency),
                cost
            );
        }
        let _ = writeln!(
            out,
            "# HELP bakhi_ai_unpriced_requests_total Số lượt có token nhưng model chưa có giá — KHÔNG tính là 0 USD.\n# TYPE bakhi_ai_unpriced_requests_total counter\nbakhi_ai_unpriced_requests_total {}",
            inner.unpriced_requests
        );

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_provider_errors_total Lỗi provider theo mã lỗi.\n# TYPE bakhi_ai_provider_errors_total counter"
        );
        for ((provider, model, code), count) in &inner.ai_errors {
            let _ = writeln!(
                out,
                "bakhi_ai_provider_errors_total{{provider=\"{}\",model=\"{}\",code=\"{}\"}} {}",
                escape(provider),
                escape(model),
                escape(code),
                count
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_retries_total Số lần thử lại provider.\n# TYPE bakhi_ai_retries_total counter"
        );
        for ((provider, model), count) in &inner.ai_retries {
            let _ = writeln!(
                out,
                "bakhi_ai_retries_total{{provider=\"{}\",model=\"{}\"}} {}",
                escape(provider),
                escape(model),
                count
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_fallback_total Số lượt chuyển dự phòng: attempted, success, failure, skipped (circuit mở).\n# TYPE bakhi_ai_fallback_total counter"
        );
        for (outcome, count) in &inner.ai_fallback {
            let _ = writeln!(
                out,
                "bakhi_ai_fallback_total{{outcome=\"{}\"}} {}",
                outcome, count
            );
        }

        let _ = writeln!(
            out,
            "# HELP bakhi_ai_user_requests_total Lượt chat của người dùng (một lượt dù nhiều attempt).\n# TYPE bakhi_ai_user_requests_total counter\nbakhi_ai_user_requests_total {}",
            inner.ai_requests_total
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_ai_user_fallback_total Số lượt chat có dùng provider dự phòng.\n# TYPE bakhi_ai_user_fallback_total counter\nbakhi_ai_user_fallback_total {}",
            inner.ai_fallback_requests
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_ai_user_failed_total Số lượt chat thất bại hoàn toàn.\n# TYPE bakhi_ai_user_failed_total counter\nbakhi_ai_user_failed_total {}",
            inner.ai_failed_requests
        );

        let _ = writeln!(
            out,
            "# HELP bakhi_process_uptime_seconds Thời gian tiến trình đã chạy.\n# TYPE bakhi_process_uptime_seconds gauge\nbakhi_process_uptime_seconds {:.3}",
            self.started.elapsed().as_secs_f64()
        );
        if let Some(bytes) = resident_memory_bytes() {
            let _ = writeln!(
                out,
                "# HELP bakhi_process_resident_memory_bytes Bộ nhớ thường trú (RSS) đọc từ /proc/self/statm.\n# TYPE bakhi_process_resident_memory_bytes gauge\nbakhi_process_resident_memory_bytes {}",
                bytes
            );
        }
        let _ = writeln!(
            out,
            "# HELP bakhi_build_info Phiên bản backend đang chạy.\n# TYPE bakhi_build_info gauge\nbakhi_build_info{{version=\"{}\",service=\"bakhi-backend\"}} 1",
            env!("CARGO_PKG_VERSION")
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_pricing_info Bảng giá AI đang dùng (version, số model).\n# TYPE bakhi_pricing_info gauge\nbakhi_pricing_info{{version=\"{}\",currency=\"{}\",models=\"{}\"}} 1",
            escape(&self.pricing.version),
            escape(&self.pricing.currency),
            self.pricing.model_count()
        );
        let _ = writeln!(
            out,
            "# HELP bakhi_circuit_state Trạng thái circuit breaker (0=closed, 1=half_open, 2=open).\n# TYPE bakhi_circuit_state gauge"
        );
        for (provider, state, _failures) in circuits {
            let value = match state {
                CircuitState::Closed => 0,
                CircuitState::HalfOpen => 1,
                CircuitState::Open => 2,
            };
            let _ = writeln!(
                out,
                "bakhi_circuit_state{{provider=\"{}\"}} {}",
                provider.as_str(),
                value
            );
        }

        out
    }

    // -----------------------------------------------------------------------
    // JSON tổng hợp cho Founder Dashboard
    // -----------------------------------------------------------------------

    pub fn summary(
        &self,
        circuits: &[(Provider, CircuitState, u32)],
        metrics_enabled: bool,
    ) -> Value {
        let inner = self.lock();

        // --- HTTP: gộp histogram theo endpoint (bỏ status khỏi khoá) --------
        let mut endpoints: BTreeMap<(String, String), (u64, u64, Histogram)> = BTreeMap::new();
        for ((method, route, status), count) in &inner.http_requests {
            let entry = endpoints
                .entry((method.clone(), route.clone()))
                .or_insert_with(|| (0, 0, Histogram::new(&HTTP_BUCKETS)));
            entry.0 = entry.0.saturating_add(*count);
            if *status >= 400 {
                entry.1 = entry.1.saturating_add(*count);
            }
        }
        for ((method, route, _status), histogram) in &inner.http_duration {
            if let Some(entry) = endpoints.get_mut(&(method.clone(), route.clone())) {
                entry.2.merge(histogram);
            }
        }

        let mut overall = Histogram::new(&HTTP_BUCKETS);
        let mut total_requests = 0_u64;
        let mut total_errors = 0_u64;
        let mut rows = Vec::new();
        for ((method, route), (requests, errors, histogram)) in &endpoints {
            overall.merge(histogram);
            total_requests = total_requests.saturating_add(*requests);
            total_errors = total_errors.saturating_add(*errors);
            rows.push(json!({
                "method": method,
                "route": route,
                "requests": requests,
                "errors": errors,
                "errorRate": percent(*errors, *requests),
                "avgMs": ms(histogram.average()),
                "p50Ms": histogram.quantile(0.50).map(ms),
                "p95Ms": histogram.quantile(0.95).map(ms),
                "p99Ms": histogram.quantile(0.99).map(ms),
            }));
        }
        // Nhiều request nhất trước — dashboard có thể sắp xếp lại.
        rows.sort_by(|a, b| {
            b["requests"]
                .as_u64()
                .unwrap_or(0)
                .cmp(&a["requests"].as_u64().unwrap_or(0))
        });

        // --- AI: từng provider/model/vai trò ---------------------------------
        let mut providers: BTreeMap<AiSeriesKey, (u64, u64)> = BTreeMap::new();
        for ((role, provider, model, status), count) in &inner.ai_requests {
            let entry = providers
                .entry((role.clone(), provider.clone(), model.clone()))
                .or_insert((0, 0));
            entry.0 = entry.0.saturating_add(*count);
            if status == "failure" {
                entry.1 = entry.1.saturating_add(*count);
            }
        }

        let mut ai_rows = Vec::new();
        let mut ai_requests = 0_u64;
        let mut ai_failures = 0_u64;
        let mut tokens_input = 0_u64;
        let mut tokens_output = 0_u64;
        let mut tokens_estimated = 0_u64;
        let mut total_cost = 0.0_f64;

        for ((role, provider, model), (requests, failures)) in &providers {
            ai_requests = ai_requests.saturating_add(*requests);
            ai_failures = ai_failures.saturating_add(*failures);
            let histogram = inner
                .ai_duration
                .get(&(role.clone(), provider.clone(), model.clone()))
                .cloned()
                .unwrap_or_else(|| Histogram::new(&AI_BUCKETS));

            let mut input = 0_u64;
            let mut output = 0_u64;
            let mut estimated = 0_u64;
            for ((r, p, m, kind, est), count) in &inner.ai_tokens {
                if r != role || p != provider || m != model {
                    continue;
                }
                match kind.as_str() {
                    "input" => input = input.saturating_add(*count),
                    "output" => output = output.saturating_add(*count),
                    _ => {}
                }
                if *est {
                    estimated = estimated.saturating_add(*count);
                }
            }
            tokens_input = tokens_input.saturating_add(input);
            tokens_output = tokens_output.saturating_add(output);
            tokens_estimated = tokens_estimated.saturating_add(estimated);

            let cost = inner
                .ai_cost
                .get(&(role.clone(), provider.clone(), model.clone()))
                .copied()
                .unwrap_or(0.0);
            total_cost += cost;

            let mut errors = serde_json::Map::new();
            for ((p, m, code), count) in &inner.ai_errors {
                if p == provider && m == model {
                    errors.insert(code.clone(), json!(count));
                }
            }

            ai_rows.push(json!({
                "role": role,
                "provider": provider,
                "model": model,
                "requests": requests,
                "success": requests.saturating_sub(*failures),
                "failure": failures,
                "successRate": percent(requests.saturating_sub(*failures), *requests),
                "avgMs": ms(histogram.average()),
                "p50Ms": histogram.quantile(0.50).map(ms),
                "p95Ms": histogram.quantile(0.95).map(ms),
                "p99Ms": histogram.quantile(0.99).map(ms),
                "tokens": {
                    "input": input,
                    "output": output,
                    "total": input.saturating_add(output),
                    "estimated": estimated,
                },
                "costUsd": cost,
                "priced": inner.ai_cost.contains_key(&(role.clone(), provider.clone(), model.clone())),
                "errors": errors,
            }));
        }

        let fallback_attempted = inner.ai_fallback.get("attempted").copied().unwrap_or(0);
        let fallback_success = inner.ai_fallback.get("success").copied().unwrap_or(0);
        let fallback_failure = inner.ai_fallback.get("failure").copied().unwrap_or(0);
        let fallback_skipped = inner.ai_fallback.get("skipped").copied().unwrap_or(0);
        let user_requests = inner.ai_requests_total;

        let circuit_rows: Vec<Value> = circuits
            .iter()
            .map(|(provider, state, failures)| {
                json!({
                    "provider": provider.as_str(),
                    "state": match state {
                        CircuitState::Closed => "closed",
                        CircuitState::HalfOpen => "half_open",
                        CircuitState::Open => "open",
                    },
                    "failures": failures,
                })
            })
            .collect();

        json!({
            "runtime": {
                "version": env!("CARGO_PKG_VERSION"),
                "startedAtUnixMs": unix_ms(self.started),
                "uptimeSeconds": self.started.elapsed().as_secs_f64(),
                "residentMemoryBytes": resident_memory_bytes(),
                "draining": Value::Null,
            },
            "metrics": {
                "enabled": metrics_enabled,
                "path": "/metrics",
            },
            "http": {
                "totalRequests": total_requests,
                "errors": total_errors,
                "errorRate": percent(total_errors, total_requests),
                "avgMs": ms(overall.average()),
                "p50Ms": overall.quantile(0.50).map(ms),
                "p95Ms": overall.quantile(0.95).map(ms),
                "p99Ms": overall.quantile(0.99).map(ms),
                "inFlight": self.in_flight(),
                "endpoints": rows,
            },
            "ai": {
                "requests": user_requests,
                "primaryOnly": user_requests.saturating_sub(inner.ai_fallback_requests),
                "fallbackRequests": inner.ai_fallback_requests,
                "fallbackAttempted": fallback_attempted,
                "fallbackSuccess": fallback_success,
                "fallbackFailure": fallback_failure,
                "fallbackSkipped": fallback_skipped,
                "failed": inner.ai_failed_requests,
                "fallbackRate": percent(inner.ai_fallback_requests, user_requests),
                "availability": percent(
                    user_requests.saturating_sub(inner.ai_failed_requests),
                    user_requests
                ),
                "attempts": ai_requests,
                "attemptFailures": ai_failures,
                "providers": ai_rows,
                "tokens": {
                    "input": tokens_input,
                    "output": tokens_output,
                    "total": tokens_input.saturating_add(tokens_output),
                    "estimated": tokens_estimated,
                },
                "cost": {
                    "usd": total_cost,
                    "currency": self.pricing.currency,
                    "pricingVersion": self.pricing.version,
                    "pricedModels": self.pricing.model_count(),
                    "unpricedRequests": inner.unpriced_requests,
                },
            },
            "circuits": circuit_rows,
        })
    }
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

fn render_histogram(out: &mut String, name: &str, labels: &str, histogram: &Histogram) {
    // `buckets` và `counts` cùng độ dài; in luỹ kế đúng chuẩn Prometheus.
    for (index, bound) in histogram.buckets.iter().enumerate() {
        let count = histogram.counts.get(index).copied().unwrap_or(0);
        let _ = writeln!(
            out,
            "{name}_bucket{{{labels},le=\"{}\"}} {count}",
            format_bound(*bound)
        );
    }
    let _ = writeln!(
        out,
        "{name}_bucket{{{labels},le=\"+Inf\"}} {}",
        histogram.count
    );
    let _ = writeln!(out, "{name}_sum{{{labels}}} {:.6}", histogram.sum);
    let _ = writeln!(out, "{name}_count{{{labels}}} {}", histogram.count);
}

/// Prometheus in bucket dạng `0.005`, `1`, `2.5` — bỏ số 0 thừa.
fn format_bound(bound: f64) -> String {
    if (bound.fract()).abs() < f64::EPSILON {
        format!("{}", bound as i64)
    } else {
        format!("{bound}")
    }
}

fn escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}

fn percent(part: u64, whole: u64) -> f64 {
    if whole == 0 {
        0.0
    } else {
        part as f64 / whole as f64 * 100.0
    }
}

fn ms(seconds: f64) -> f64 {
    (seconds * 1000.0 * 100.0).round() / 100.0
}

fn unix_ms(started: Instant) -> u64 {
    let elapsed = started.elapsed();
    let now = std::time::SystemTime::now();
    now.duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
        .saturating_sub(elapsed.as_millis() as u64)
}

/// RSS từ `/proc/self/statm` (Linux). Không có ⇒ bỏ metric thay vì bịa số.
fn resident_memory_bytes() -> Option<u64> {
    let statm = std::fs::read_to_string("/proc/self/statm").ok()?;
    let pages: u64 = statm.split_whitespace().nth(1)?.parse().ok()?;
    Some(pages.saturating_mul(4096))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn histogram_quantiles_use_bucket_interpolation() {
        let mut histogram = Histogram::new(&[0.1, 1.0, 10.0]);
        for _ in 0..50 {
            histogram.observe(0.05);
        }
        for _ in 0..49 {
            histogram.observe(0.5);
        }
        histogram.observe(5.0);
        let p50 = histogram.quantile(0.50).unwrap();
        let p95 = histogram.quantile(0.95).unwrap();
        let p99 = histogram.quantile(0.99).unwrap();
        assert!(p50 < 0.2, "p50={p50}");
        assert!(p95 > 0.4 && p95 <= 1.0, "p95={p95}");
        assert!(p99 > p95, "p99={p99} p95={p95}");
        assert_eq!(histogram.count(), 100);
    }

    #[test]
    fn empty_histogram_has_no_quantile() {
        let histogram = Histogram::new(&[1.0]);
        assert_eq!(histogram.quantile(0.5), None);
        assert_eq!(histogram.average(), 0.0);
    }

    #[test]
    fn http_series_carry_route_method_and_status() {
        let metrics = Metrics::default();
        metrics.record_http("GET", "/health", 200, 0.002, "ok");
        metrics.record_http("POST", "/ai/chat", 502, 2.5, "upstream_error");
        let text = metrics.prometheus(&[]);
        assert!(text.contains(
            "bakhi_http_requests_total{method=\"GET\",route=\"/health\",status=\"200\"} 1"
        ));
        assert!(text.contains(
            "bakhi_http_errors_total{method=\"POST\",route=\"/ai/chat\",category=\"upstream_error\"} 1"
        ));
        assert!(text.contains("bakhi_http_request_duration_seconds_bucket"));
        assert!(text.contains("le=\"+Inf\""));
        assert!(text.contains("bakhi_build_info"));
        assert!(text.contains("bakhi_process_uptime_seconds"));
    }

    #[test]
    fn ai_attempts_split_primary_and_fallback() {
        let metrics = Metrics::default();
        metrics.record_ai_attempt("primary", "groq", "m1", false, 1.0, Some("TIMEOUT"));
        metrics.record_ai_attempt("fallback", "google", "m2", true, 0.4, None);
        metrics.record_fallback("attempted");
        metrics.record_fallback("success");
        metrics.record_ai_request(true, true);
        let text = metrics.prometheus(&[]);
        assert!(text.contains(
            "bakhi_ai_requests_total{role=\"primary\",provider=\"groq\",model=\"m1\",status=\"failure\"} 1"
        ));
        assert!(text.contains(
            "bakhi_ai_requests_total{role=\"fallback\",provider=\"google\",model=\"m2\",status=\"success\"} 1"
        ));
        assert!(text.contains("bakhi_ai_fallback_total{outcome=\"attempted\"} 1"));
        assert!(text.contains(
            "bakhi_ai_provider_errors_total{provider=\"groq\",model=\"m1\",code=\"TIMEOUT\"} 1"
        ));
    }

    #[test]
    fn tokens_keep_estimated_separate_and_cost_never_faked() {
        let metrics = Metrics::default();
        metrics.record_ai_tokens(
            "primary",
            "groq",
            "m1",
            &Usage {
                input: 1000,
                output: 500,
                total: 1500,
                estimated: true,
            },
        );
        let text = metrics.prometheus(&[]);
        assert!(text.contains(
            "bakhi_ai_tokens_total{role=\"primary\",provider=\"groq\",model=\"m1\",type=\"input\",estimated=\"true\"} 1000"
        ));
        // Chưa có bảng giá ⇒ không có series chi phí, nhưng có bộ đếm "chưa có giá".
        assert!(!text.contains("bakhi_ai_estimated_cost_usd_total{"));
        assert!(text.contains("bakhi_ai_unpriced_requests_total 1"));
    }

    #[test]
    fn cost_is_recorded_when_pricing_exists() {
        let pricing = Pricing::parse(
            r#"[{"provider":"groq","model":"m1","input_per_million":1.0,"output_per_million":2.0}]"#,
            "test",
        );
        let metrics = Metrics::new(pricing);
        metrics.record_ai_tokens(
            "primary",
            "groq",
            "m1",
            &Usage {
                input: 1_000_000,
                output: 500_000,
                total: 1_500_000,
                estimated: false,
            },
        );
        let text = metrics.prometheus(&[]);
        assert!(text.contains("bakhi_ai_estimated_cost_usd_total{"));
        assert!(text.contains("} 2.000000"));
        assert!(text.contains("bakhi_ai_unpriced_requests_total 0"));
    }

    #[test]
    fn failed_fallback_request_still_counts_as_fallback() {
        let metrics = Metrics::default();
        metrics.record_ai_attempt("primary", "groq", "m1", false, 1.0, Some("PROVIDER_DOWN"));
        metrics.record_ai_attempt(
            "fallback",
            "google",
            "m2",
            false,
            0.8,
            Some("PROVIDER_DOWN"),
        );
        metrics.record_fallback("attempted");
        metrics.record_fallback("failure");
        // Một lượt người dùng thất bại nhưng ĐÃ đi qua dự phòng.
        metrics.record_ai_request(true, false);

        let summary = metrics.summary(&[], false);
        assert_eq!(summary["ai"]["requests"], 1);
        assert_eq!(summary["ai"]["fallbackRequests"], 1);
        assert_eq!(summary["ai"]["primaryOnly"], 0);
        assert_eq!(summary["ai"]["failed"], 1);
        assert_eq!(summary["ai"]["availability"], 0.0);
        assert_eq!(summary["ai"]["fallbackRate"], 100.0);

        let text = metrics.prometheus(&[]);
        assert!(text.contains("bakhi_ai_user_requests_total 1"));
        assert!(text.contains("bakhi_ai_user_fallback_total 1"));
        assert!(text.contains("bakhi_ai_user_failed_total 1"));
    }

    #[test]
    fn summary_aggregates_http_and_ai_without_user_labels() {
        let metrics = Metrics::default();
        metrics.record_http("GET", "/health", 200, 0.004, "ok");
        metrics.record_http("GET", "/health", 500, 0.03, "server_error");
        metrics.record_ai_attempt("primary", "groq", "m1", true, 0.5, None);
        metrics.record_ai_tokens(
            "primary",
            "groq",
            "m1",
            &Usage {
                input: 10,
                output: 5,
                total: 15,
                estimated: false,
            },
        );
        metrics.record_ai_request(false, true);
        let summary = metrics.summary(&[], true);
        assert_eq!(summary["http"]["totalRequests"], 2);
        assert_eq!(summary["http"]["errors"], 1);
        assert_eq!(summary["ai"]["requests"], 1);
        assert_eq!(summary["ai"]["tokens"]["total"], 15);
        assert_eq!(summary["ai"]["cost"]["unpricedRequests"], 1);
        assert!(summary["http"]["endpoints"].as_array().unwrap().len() == 1);
        let text = summary.to_string();
        assert!(!text.contains("student"));
        assert!(!text.contains("email"));
    }

    #[test]
    fn prometheus_lines_are_well_formed_and_escaped() {
        let metrics = Metrics::default();
        metrics.record_http("GET", "/quote\"path", 200, 0.001, "ok");
        let text = metrics.prometheus(&[]);
        for line in text.lines().filter(|line| !line.starts_with('#')) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            assert!(parts.len() >= 2, "dòng lỗi: {line}");
        }
        assert!(text.contains("route=\"/quote\\\"path\""));
    }
}
