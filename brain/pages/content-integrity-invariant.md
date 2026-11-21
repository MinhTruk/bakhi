---
id: content-integrity-invariant
title: "Educational content is immutable; integrity tool is the gate"
category: decision
status: active
tags: [integrity, qa, content]
created: "2026-11-21T12:54:22"
updated: "2026-11-21T12:54:23"
---

<!-- compiled_truth -->
Educational content is the one thing this repo must never change: questions, options, answers, explanations, formulas, numbers, subject structure and the folder names of exam rounds. UI work is allowed; content work is not.

Consequences for every change:

- Run `node tools/content-integrity.js verify` **before and after** editing, and before pushing.
- If no baseline exists yet, run `node tools/content-integrity.js baseline` **before** touching anything.
- Hashing normalises CRLF to LF, so Windows checkouts do not produce false alarms while real content edits are still caught.
- When a page that holds **no** educational content (home page, `studio/`) is deliberately rewritten, refresh only that file with `node tools/content-integrity-refresh.js <files…>`. Never run `baseline` to blanket-overwrite all 122 files because a few UI pages changed.
- Tooling may only insert `<script>` tags into content pages (`tools/integrate-pages.js`, `tools/inject-favicon.js`).

Renaming or merging subject/exam folders is equally forbidden — those are public GitHub Pages URLs.


## Timeline

- time: 2026-11-21T12:54:22
  kind: decision
  summary: "Created this page: Educational content is immutable; integrity tool is the gate"
  source: "AGENTS.md §1, §5"
  affects: [content-integrity-invariant]

- time: 2026-11-21T12:54:23
  kind: decision
  summary: "Seeded from AGENTS.md: educational content is a hard invariant"
  source: AGENTS.md
  affects: [content-integrity-invariant]
