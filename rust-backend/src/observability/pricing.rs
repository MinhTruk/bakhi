// ===========================================================================
// Bá Khí — Rust backend · observability/pricing.rs
//
// Bảng giá AI TÁCH KHỎI logic xử lý AI (8.6.2). Giá KHÔNG hardcode trong
// `ai_service.rs`; nạp từ `AI_PRICING_JSON` hoặc `AI_PRICING_FILE`.
//
// Nguyên tắc:
//   * Không suy đoán giá. Model không có trong bảng ⇒ `cost()` trả `None`
//     và metrics ghi nhận "chưa có giá", KHÔNG tính thành 0 USD.
//   * Cấu hình hỏng không làm tiến trình dừng: bảng rỗng + cảnh báo log.
//   * Đơn vị giá: USD trên 1.000.000 token (input/output riêng).
//
// Định dạng tệp hỗ trợ cả hai hình dạng:
//   { "version": "…", "currency": "USD", "models": [ … ] }
//   [ { "provider": "groq", "model": "…", … } ]
// ===========================================================================

use std::collections::HashMap;
use std::env;

use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct ModelPrice {
    pub provider: String,
    pub model: String,
    /// USD / 1.000.000 token đầu vào.
    pub input_per_million: f64,
    /// USD / 1.000.000 token đầu ra.
    pub output_per_million: f64,
}

#[derive(Debug, Clone)]
pub struct Pricing {
    pub version: String,
    pub currency: String,
    models: HashMap<String, ModelPrice>,
}

impl Default for Pricing {
    fn default() -> Self {
        Self {
            version: "unversioned".to_string(),
            currency: "USD".to_string(),
            models: HashMap::new(),
        }
    }
}

fn key(provider: &str, model: &str) -> String {
    format!(
        "{}/{}",
        provider.trim().to_lowercase(),
        model.trim().to_lowercase()
    )
}

impl Pricing {
    /// Nạp từ môi trường. `AI_PRICING_JSON` được ưu tiên hơn `AI_PRICING_FILE`.
    pub fn from_env() -> Self {
        if let Some(raw) = env::var("AI_PRICING_JSON")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
        {
            return Self::parse(&raw, "AI_PRICING_JSON");
        }
        if let Some(path) = env::var("AI_PRICING_FILE")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
        {
            return match std::fs::read_to_string(&path) {
                Ok(raw) => Self::parse(&raw, &path),
                Err(error) => {
                    tracing::warn!(
                        target: "bakhi::pricing",
                        error = %error,
                        "không đọc được AI_PRICING_FILE — chi phí AI sẽ là 'chưa xác định'"
                    );
                    Self::default()
                }
            };
        }
        Self::default()
    }

    /// Phân tích cấu hình. Bỏ qua từng dòng sai; không panic.
    pub fn parse(raw: &str, source: &str) -> Self {
        let parsed: Value = match serde_json::from_str(raw) {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(
                    target: "bakhi::pricing",
                    source,
                    error = %error,
                    "AI_PRICING JSON không hợp lệ — bảng giá rỗng"
                );
                return Self::default();
            }
        };

        let (version, currency, rows): (String, String, Vec<Value>) =
            if let Some(list) = parsed.as_array() {
                ("unversioned".to_string(), "USD".to_string(), list.clone())
            } else {
                let version = parsed
                    .get("version")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unversioned")
                    .trim()
                    .to_string();
                let currency = parsed
                    .get("currency")
                    .and_then(|v| v.as_str())
                    .unwrap_or("USD")
                    .trim()
                    .to_uppercase();
                let rows = parsed
                    .get("models")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                (version, currency, rows)
            };

        let mut models = HashMap::new();
        for row in &rows {
            let provider = row
                .get("provider")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let model = row
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let input = row.get("input_per_million").and_then(|v| v.as_f64());
            let output = row.get("output_per_million").and_then(|v| v.as_f64());
            let (Some(input), Some(output)) = (input, output) else {
                tracing::warn!(
                    target: "bakhi::pricing",
                    provider,
                    model,
                    "bỏ qua dòng giá thiếu input_per_million/output_per_million"
                );
                continue;
            };
            if provider.is_empty() || model.is_empty() || !input.is_finite() || !output.is_finite()
            {
                continue;
            }
            if input < 0.0 || output < 0.0 {
                tracing::warn!(
                    target: "bakhi::pricing",
                    provider,
                    model,
                    "bỏ qua dòng giá âm"
                );
                continue;
            }
            models.insert(
                key(provider, model),
                ModelPrice {
                    provider: provider.to_string(),
                    model: model.to_string(),
                    input_per_million: input,
                    output_per_million: output,
                },
            );
        }

        Self {
            version,
            currency,
            models,
        }
    }

    pub fn model_count(&self) -> usize {
        self.models.len()
    }

    pub fn is_empty(&self) -> bool {
        self.models.is_empty()
    }

    /// Chi phí ước tính cho một lượt (USD). `None` = chưa có bảng giá cho model.
    pub fn cost(&self, provider: &str, model: &str, input: u32, output: u32) -> Option<f64> {
        let price = self.models.get(&key(provider, model))?;
        let input_cost = f64::from(input) / 1_000_000.0 * price.input_per_million;
        let output_cost = f64::from(output) / 1_000_000.0 * price.output_per_million;
        let total = input_cost + output_cost;
        if total.is_finite() {
            Some(total)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "version": "2026-11-01",
        "currency": "USD",
        "models": [
            {"provider": "groq", "model": "test-model", "input_per_million": 1.0, "output_per_million": 2.0},
            {"provider": "google", "model": "gemini-test", "input_per_million": 0.5, "output_per_million": 1.5},
            {"provider": "groq", "model": "broken"}
        ]
    }"#;

    #[test]
    fn parses_prices_and_skips_incomplete_rows() {
        let pricing = Pricing::parse(SAMPLE, "test");
        assert_eq!(pricing.version, "2026-11-01");
        assert_eq!(pricing.currency, "USD");
        assert_eq!(pricing.model_count(), 2);
    }

    #[test]
    fn cost_uses_input_and_output_prices_separately() {
        let pricing = Pricing::parse(SAMPLE, "test");
        // 500.000 input × 1 USD/1M = 0.5; 250.000 output × 2 USD/1M = 0.5.
        let cost = pricing
            .cost("groq", "test-model", 500_000, 250_000)
            .expect("phải có giá");
        assert!((cost - 1.0).abs() < 1e-9);
    }

    #[test]
    fn missing_model_never_becomes_zero_cost() {
        let pricing = Pricing::parse(SAMPLE, "test");
        assert_eq!(pricing.cost("groq", "unknown-model", 100, 100), None);
        assert_eq!(pricing.cost("unknown", "test-model", 100, 100), None);
        // Provider phân biệt: cùng tên model khác provider không dùng chung giá.
        assert_eq!(pricing.cost("openai", "test-model", 100, 100), None);
    }

    #[test]
    fn provider_and_model_keys_are_case_insensitive() {
        let pricing = Pricing::parse(SAMPLE, "test");
        assert!(pricing.cost("GROQ", "TEST-MODEL", 1, 1).is_some());
    }

    #[test]
    fn invalid_json_and_negative_prices_are_tolerated() {
        assert!(Pricing::parse("not json", "test").is_empty());
        let negative =
            r#"[{"provider":"x","model":"y","input_per_million":-1,"output_per_million":1}]"#;
        assert!(Pricing::parse(negative, "test").is_empty());
    }

    #[test]
    fn array_form_is_supported() {
        let pricing = Pricing::parse(
            r#"[{"provider":"p","model":"m","input_per_million":3,"output_per_million":4}]"#,
            "test",
        );
        assert_eq!(pricing.currency, "USD");
        assert_eq!(pricing.model_count(), 1);
        assert!(pricing.cost("p", "m", 1_000_000, 0).unwrap() - 3.0 < 1e-9);
    }
}
