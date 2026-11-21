---
id: agent-session-protocol
title: "How an agent should work in this repo (startup + delivery protocol)"
category: project
status: active
tags: [agents, workflow]
created: "2026-11-21T12:54:23"
updated: "2026-11-21T12:54:23"
---

<!-- compiled_truth -->
This is the routine to follow on **every** session in this repo, future included.

**Startup**

1. Read `AGENTS.md` (project rules) and `BRAIN.md` (brain contract), then load this brain: `node brain-toolkit/bin/brain.mjs list-pages`, then `read-page` the ones a task touches. Do not design against a blank slate.
2. Confirm the working tree: `git status`, `git log --oneline -5`, current branch.
3. Before editing anything, run `node tools/content-integrity.js verify` so a pre-existing breakage is not blamed on the new change.

**While working**

- Content pages: only tool-inserted `<script>` tags. UI/chrome changes belong in `assets/bakhi/`.
- User data goes through `BK.store` (single key `bakhiLearn.v1`). Never delete legacy localStorage keys.
- New keyboard shortcuts must ignore `input/textarea/select/contenteditable`.
- Durable, non-obvious decisions get written to the brain immediately via the CLI — not batched, not hand-edited.

**Delivery**

1. `node tools/content-integrity.js verify` (again).
2. `node --check` on every JS file touched.
3. Run the smoke suites that cover the change (`tools/qa/*` via `NODE_PATH=/tmp/bktest/node_modules`, jsdom pinned to 31.0.1).
4. Add a `CHANGELOG.md` entry (Tính năng / Sửa lỗi / Cải tiến with date + version). Pushing `CHANGELOG.md` to `main` auto-syncs Supabase through `.github/workflows/changelog-sync.yml`.
5. Commit message in Vietnamese with diacritics, e.g. `feat(8.3.9): mô tả ngắn`.

**Traps**

- No root `package.json` — adding one with `"type": "module"` breaks the CommonJS `tools/*.js`.
- `/skills/` is a **site page** (gamification skill tree), not a skills folder; the brain toolkit lives in `brain-toolkit/`.
- Never commit `.env`, keys, `node_modules`; never force-push.


## Timeline

- time: 2026-11-21T12:54:23
  kind: decision
  summary: "Created this page: How an agent should work in this repo (startup + delivery protocol)"
  source: session 2026-11-21
  affects: [agent-session-protocol]

- time: 2026-11-21T12:54:23
  kind: decision
  summary: Wrote down the recurring startup and delivery routine
  source: session 2026-11-21
  affects: [agent-session-protocol]
