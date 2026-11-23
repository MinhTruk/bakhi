// ===========================================================================
// Bá Khí — Rust backend · services/data_service.rs
//
// Xử lý dữ liệu học tập (ưu tiên 3): tổng hợp kết quả, độ chính xác theo môn,
// chủ đề yếu nhất, chuỗi ngày học và nhịp học theo tuần.
//
// Hàm thuần (pure): cùng đầu vào ⇒ cùng đầu ra, không I/O, không database.
// Nhờ vậy nó kiểm thử được đầy đủ và benchmark được so với bản JavaScript.
// ===========================================================================

use serde::Deserialize;
use serde_json::{json, Map, Value};

const MAX_ROWS: usize = 20_000;
const MIN_TOPIC_SAMPLE: u32 = 3;

#[derive(Debug, Clone, Deserialize)]
pub struct ProgressRow {
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub topic: String,
    #[serde(default)]
    pub correct: u32,
    #[serde(default)]
    pub total: u32,
    #[serde(default)]
    pub last_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReviewRow {
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub topic: String,
    #[serde(default)]
    pub wrong: u32,
    #[serde(default)]
    pub last_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionRow {
    #[serde(default)]
    pub started_at: String,
    #[serde(default)]
    pub minutes: u32,
    #[serde(default)]
    pub questions: u32,
    #[serde(default)]
    pub correct: u32,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LearningStatsRequest {
    #[serde(default)]
    pub progress: Vec<ProgressRow>,
    #[serde(default)]
    pub review: Vec<ReviewRow>,
    #[serde(default)]
    pub sessions: Vec<SessionRow>,
}

#[derive(Debug, Clone, Default)]
struct Bucket {
    questions: u32,
    correct: u32,
}

impl Bucket {
    fn add(&mut self, correct: u32, total: u32) {
        self.questions = self.questions.saturating_add(total);
        self.correct = self.correct.saturating_add(correct.min(total));
    }

    fn accuracy(&self) -> f64 {
        if self.questions == 0 {
            0.0
        } else {
            (self.correct as f64 / self.questions as f64 * 1000.0).round() / 10.0
        }
    }
}

/// Giới hạn kích thước đầu vào: bỏ dòng vượt trần, không lỗi.
fn cap<T>(rows: Vec<T>) -> Vec<T> {
    rows.into_iter().take(MAX_ROWS).collect()
}

pub fn learning_stats(request: LearningStatsRequest) -> Value {
    let progress = cap(request.progress);
    let review = cap(request.review);
    let sessions = cap(request.sessions);

    let mut total = Bucket::default();
    let mut subjects: Map<String, Value> = Map::new();
    let mut subject_bucket: std::collections::HashMap<String, Bucket> =
        std::collections::HashMap::new();
    let mut topics: std::collections::HashMap<(String, String), Bucket> =
        std::collections::HashMap::new();

    for row in &progress {
        let subject = normalized(&row.subject, "khác");
        let topic = normalized(&row.topic, "chung");
        total.add(row.correct, row.total);
        subject_bucket
            .entry(subject.clone())
            .or_default()
            .add(row.correct, row.total);
        topics
            .entry((subject, topic))
            .or_default()
            .add(row.correct, row.total);
    }

    let mut subject_rows: Vec<(String, Bucket)> = subject_bucket.into_iter().collect();
    subject_rows.sort_by(|a, b| b.1.questions.cmp(&a.1.questions).then(a.0.cmp(&b.0)));
    for (subject, bucket) in &subject_rows {
        subjects.insert(
            subject.clone(),
            json!({
                "subject": subject,
                "questions": bucket.questions,
                "correct": bucket.correct,
                "accuracy": bucket.accuracy()
            }),
        );
    }

    let mut ranked: Vec<((String, String), Bucket)> = topics.into_iter().collect();
    ranked.sort_by(|a, b| {
        a.1.accuracy()
            .partial_cmp(&b.1.accuracy())
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(b.1.questions.cmp(&a.1.questions))
            .then(a.0.cmp(&b.0))
    });
    let weakest: Vec<Value> = ranked
        .iter()
        .filter(|(_, bucket)| bucket.questions >= MIN_TOPIC_SAMPLE)
        .take(5)
        .map(|((subject, topic), bucket)| {
            json!({
                "subject": subject,
                "topic": topic,
                "questions": bucket.questions,
                "accuracy": bucket.accuracy()
            })
        })
        .collect();

    let mut review_by_subject: std::collections::HashMap<String, u32> =
        std::collections::HashMap::new();
    let mut review_total: u32 = 0;
    for row in &review {
        let subject = normalized(&row.subject, "khác");
        review_total = review_total.saturating_add(row.wrong);
        let entry = review_by_subject.entry(subject).or_insert(0);
        *entry = entry.saturating_add(row.wrong);
    }

    // ---- Phiên học ----
    let mut session_minutes: u64 = 0;
    let mut session_questions: u32 = 0;
    let mut session_correct: u32 = 0;
    let mut active_days: std::collections::BTreeSet<i64> = std::collections::BTreeSet::new();
    let mut weeks: std::collections::BTreeMap<String, (u32, u32)> =
        std::collections::BTreeMap::new();

    for session in &sessions {
        session_minutes += session.minutes as u64;
        session_questions = session_questions.saturating_add(session.questions);
        session_correct = session_correct.saturating_add(session.correct.min(session.questions));
        if let Some(day) = day_index(&session.started_at) {
            active_days.insert(day);
            let key = week_key(day);
            let entry = weeks.entry(key).or_insert((0, 0));
            entry.0 = entry.0.saturating_add(session.questions);
            entry.1 = entry
                .1
                .saturating_add(session.correct.min(session.questions));
        }
    }

    let mut weekly: Vec<Value> = weeks
        .into_iter()
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|(week, (questions, correct))| {
            json!({
                "week": week,
                "questions": questions,
                "correct": correct,
                "accuracy": if questions == 0 { 0.0 } else {
                    ((correct as f64 / questions as f64) * 1000.0).round() / 10.0
                }
            })
        })
        .collect();
    weekly.sort_by(|a, b| {
        a.get("week")
            .and_then(|v| v.as_str())
            .cmp(&b.get("week").and_then(|v| v.as_str()))
    });

    json!({
        "totals": {
            "questions": total.questions,
            "correct": total.correct,
            "accuracy": total.accuracy(),
            "subjects": subject_rows.len(),
            "review_backlog": review_total
        },
        "subjects": subject_rows.iter().map(|(subject, bucket)| json!({
            "subject": subject,
            "questions": bucket.questions,
            "correct": bucket.correct,
            "accuracy": bucket.accuracy()
        })).collect::<Vec<_>>(),
        "weakest_topics": weakest,
        "review": {
            "total": review_total,
            "by_subject": review_by_subject.into_iter().map(|(subject, wrong)| json!({
                "subject": subject,
                "wrong": wrong
            })).collect::<Vec<_>>()
        },
        "sessions": {
            "count": sessions.len(),
            "minutes": session_minutes,
            "questions": session_questions,
            "correct": session_correct,
            "accuracy": if session_questions == 0 { 0.0 } else {
                ((session_correct as f64 / session_questions as f64) * 1000.0).round() / 10.0
            },
            "streak_days": streak(&active_days),
            "active_days": active_days.len(),
            "weekly": weekly
        }
    })
}

fn normalized(raw: &str, fallback: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

/// Số ngày kể từ 1970-01-01 của chuỗi ISO "YYYY-MM-DD…".
fn day_index(raw: &str) -> Option<i64> {
    if raw.len() < 10 {
        return None;
    }
    let year: i64 = raw.get(0..4)?.parse().ok()?;
    let month: u32 = raw.get(5..7)?.parse().ok()?;
    let day: u32 = raw.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    Some(days_from_civil(year, month, day))
}

fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u64;
    let mp = if month > 2 { month - 3 } else { month + 9 } as u64;
    let doy = (153 * mp + 2) / 5 + day as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

/// Tuần ISO-8601 (thứ Hai là ngày đầu tuần).
fn week_key(day_index: i64) -> String {
    // 1970-01-01 là thứ Năm ⇒ ISO weekday = 4.
    let weekday = (day_index + 3).rem_euclid(7) + 1;
    let thursday = day_index - (weekday - 4);
    let (year, _month, _day) = civil_from_days(thursday);
    let first_thursday = {
        let jan1 = days_from_civil(year, 1, 1);
        let wd = (jan1 + 3).rem_euclid(7) + 1;
        jan1 - (wd - 4)
    };
    let week = (thursday - first_thursday) / 7 + 1;
    format!("{year:04}-W{week:02}")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { y + 1 } else { y }, month, day)
}

/// Chuỗi ngày học liên tiếp, tính tới hôm nay (hoặc hôm qua nếu hôm nay chưa học).
fn streak(days: &std::collections::BTreeSet<i64>) -> u32 {
    if days.is_empty() {
        return 0;
    }
    let today = today_index();
    let mut cursor = match days.iter().next_back().copied() {
        Some(last) if last >= today - 1 => last,
        _ => return 0,
    };
    let mut count = 0;
    while days.contains(&cursor) {
        count += 1;
        cursor -= 1;
    }
    count
}

fn today_index() -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    now.div_euclid(86_400)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn progress(subject: &str, topic: &str, correct: u32, total: u32) -> ProgressRow {
        ProgressRow {
            subject: subject.to_string(),
            topic: topic.to_string(),
            correct,
            total,
            last_at: "2026-11-20T10:00:00Z".to_string(),
        }
    }

    #[test]
    fn aggregates_totals_and_subject_accuracy() {
        let stats = learning_stats(LearningStatsRequest {
            progress: vec![
                progress("toan", "dao-ham", 8, 10),
                progress("toan", "tich-phan", 2, 10),
                progress("ly", "dien", 5, 5),
            ],
            ..Default::default()
        });
        assert_eq!(stats["totals"]["questions"], 25);
        assert_eq!(stats["totals"]["correct"], 15);
        assert_eq!(stats["totals"]["accuracy"], 60.0);
        assert_eq!(stats["subjects"][0]["subject"], "toan");
        assert_eq!(stats["subjects"][1]["accuracy"], 100.0);
    }

    #[test]
    fn weakest_topics_need_minimum_sample() {
        let stats = learning_stats(LearningStatsRequest {
            progress: vec![
                progress("toan", "yeu", 1, 10),
                progress("toan", "it-du-lieu", 0, 2),
            ],
            ..Default::default()
        });
        let weakest = stats["weakest_topics"].as_array().unwrap();
        assert_eq!(weakest.len(), 1);
        assert_eq!(weakest[0]["topic"], "yeu");
    }

    #[test]
    fn review_backlog_sums_wrong_answers() {
        let stats = learning_stats(LearningStatsRequest {
            review: vec![
                ReviewRow {
                    subject: "toan".into(),
                    topic: "a".into(),
                    wrong: 3,
                    last_at: String::new(),
                },
                ReviewRow {
                    subject: "toan".into(),
                    topic: "b".into(),
                    wrong: 2,
                    last_at: String::new(),
                },
                ReviewRow {
                    subject: "ly".into(),
                    topic: "c".into(),
                    wrong: 1,
                    last_at: String::new(),
                },
            ],
            ..Default::default()
        });
        assert_eq!(stats["totals"]["review_backlog"], 6);
        let by_subject = stats["review"]["by_subject"].as_array().unwrap();
        assert_eq!(by_subject.len(), 2);
    }

    #[test]
    fn weekly_buckets_are_iso_weeks() {
        let stats = learning_stats(LearningStatsRequest {
            sessions: vec![
                SessionRow {
                    started_at: "2026-11-16T09:00:00Z".into(),
                    minutes: 30,
                    questions: 10,
                    correct: 7,
                },
                SessionRow {
                    started_at: "2026-11-17T09:00:00Z".into(),
                    minutes: 20,
                    questions: 10,
                    correct: 9,
                },
            ],
            ..Default::default()
        });
        let weekly = stats["sessions"]["weekly"].as_array().unwrap();
        assert_eq!(weekly.len(), 1);
        assert_eq!(weekly[0]["week"], "2026-W47");
        assert_eq!(weekly[0]["questions"], 20);
        assert_eq!(weekly[0]["accuracy"], 80.0);
        assert_eq!(stats["sessions"]["minutes"], 50);
    }

    #[test]
    fn streak_counts_consecutive_days_ending_today() {
        let today = today_index();
        let days: std::collections::BTreeSet<i64> = [today, today - 1, today - 2, today - 5]
            .into_iter()
            .collect();
        assert_eq!(streak(&days), 3);
        let stale: std::collections::BTreeSet<i64> = [today - 10, today - 11].into_iter().collect();
        assert_eq!(streak(&stale), 0);
        assert_eq!(streak(&std::collections::BTreeSet::new()), 0);
    }

    #[test]
    fn empty_input_gives_zeroed_but_complete_shape() {
        let stats = learning_stats(LearningStatsRequest::default());
        assert_eq!(stats["totals"]["questions"], 0);
        assert_eq!(stats["totals"]["accuracy"], 0.0);
        assert!(stats["weakest_topics"].as_array().unwrap().is_empty());
        assert_eq!(stats["sessions"]["streak_days"], 0);
    }

    #[test]
    fn invalid_dates_are_ignored_not_fatal() {
        let stats = learning_stats(LearningStatsRequest {
            sessions: vec![SessionRow {
                started_at: "not-a-date".into(),
                minutes: 5,
                questions: 1,
                correct: 1,
            }],
            ..Default::default()
        });
        assert_eq!(stats["sessions"]["minutes"], 5);
        assert_eq!(stats["sessions"]["active_days"], 0);
    }
}
