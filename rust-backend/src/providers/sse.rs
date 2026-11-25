// ===========================================================================
// Bá Khí — Rust backend · providers/sse.rs  (8.7.4)
//
// Bộ đọc Server-Sent Events dùng chung cho mọi provider streaming.
//
// Vì sao cần buffer theo BYTE chứ không theo `String`:
//   * provider có thể cắt chunk ở giữa một ký tự UTF-8 (tiếng Việt là 2–3
//     byte/ký tự), nên chỉ giải mã khi đã có dòng hoàn chỉnh;
//   * một dòng `data:` có thể bị chia thành nhiều chunk TCP.
//
// Trần `MAX_LINE_BYTES` chặn provider gửi dữ liệu không có newline làm phình
// bộ nhớ tiến trình.
// ===========================================================================

const MAX_LINE_BYTES: usize = 1024 * 1024;

#[derive(Default)]
pub struct SseLines {
    buffer: Vec<u8>,
}

impl SseLines {
    pub fn new() -> Self {
        Self::default()
    }

    /// Nạp thêm byte và trả về các DÒNG hoàn chỉnh (đã bỏ `\n`/`\r`).
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(position) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let mut line: Vec<u8> = self.buffer.drain(..=position).collect();
            line.pop();
            let text = String::from_utf8_lossy(&line);
            lines.push(text.trim_end_matches('\r').to_string());
        }
        lines
    }

    /// Dữ liệu còn lại chưa có newline (dòng cuối bị cắt cụt khi stream đóng).
    pub fn flush(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }
        let line: Vec<u8> = std::mem::take(&mut self.buffer);
        let text = String::from_utf8_lossy(&line);
        let trimmed = text.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    /// Dòng hiện tại vượt trần an toàn ⇒ caller phải dừng stream.
    pub fn overflow(&self) -> bool {
        self.buffer.len() > MAX_LINE_BYTES
    }
}

/// Trả payload sau `data:` nếu dòng là một sự kiện dữ liệu.
///
/// Bỏ qua: dòng rỗng, comment (`:`), `event:`, `id:`, `retry:`.
pub fn data_of(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("data:")?;
    Some(rest.strip_prefix(' ').unwrap_or(rest))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reassembles_lines_split_across_chunks() {
        let mut sse = SseLines::new();
        assert!(sse.push(b"data: {\"a\"").is_empty());
        let lines = sse.push(b":1}\n\ndata: [DONE]\n");
        assert_eq!(
            lines,
            vec![
                "data: {\"a\":1}".to_string(),
                String::new(),
                "data: [DONE]".to_string()
            ]
        );
    }

    #[test]
    fn keeps_utf8_intact_when_split_mid_character() {
        let message = "data: Chào bạn\n";
        let bytes = message.as_bytes();
        // Cắt giữa ký tự "à" (2 byte).
        let split = message.find('à').unwrap() + 1;
        assert!(split < bytes.len());
        let mut sse = SseLines::new();
        assert!(sse.push(&bytes[..split]).is_empty());
        let lines = sse.push(&bytes[split..]);
        assert_eq!(lines, vec!["data: Chào bạn".to_string()]);
    }

    #[test]
    fn parses_data_prefix_and_ignores_other_fields() {
        assert_eq!(data_of("data: {\"x\":1}"), Some("{\"x\":1}"));
        assert_eq!(data_of("data:{\"x\":1}"), Some("{\"x\":1}"));
        assert_eq!(data_of(": keep-alive"), None);
        assert_eq!(data_of("event: delta"), None);
        assert_eq!(data_of(""), None);
    }

    #[test]
    fn flush_returns_trailing_line_without_newline() {
        let mut sse = SseLines::new();
        sse.push(b"data: [DONE]");
        assert_eq!(sse.flush().as_deref(), Some("data: [DONE]"));
        assert_eq!(sse.flush(), None);
    }
}
