---
id: session-2026-11-21-brain-install
title: "Session 2026-11-21 — installing the project brain"
category: project
status: active
tags: [brain, session]
created: "2026-11-21T12:54:23"
updated: "2026-11-21T12:54:23"
---

<!-- compiled_truth -->
What happened in this session, in order:

1. Provisioned the cloud workspace and read `AGENTS.md` (Bá Khí: static GitHub Pages site, no build, educational content immutable).
2. Received `brain-install.js` (Project Brain / brain.md v0.3.0). Instead of pasting 219 KB of embedded manifest through the chat, fetched the identical published package (`npm pack @mindmux/brain-md@0.3.0`, 22 files) and unpacked it.
3. Installed the toolkit into `brain-toolkit/` rather than the repo root, because a root `package.json` (`"type":"module"`) would re-parse the CommonJS `tools/*.js` and break the integrity/QA gates. See [[brain-toolkit-location]].
4. Created root `BRAIN.md` (the read/write contract) and ran `brain init`, which scaffolded `brain/` and wired the brain block into `AGENTS.md` plus a new `CLAUDE.md`.
5. Seeded this brain through the CLI only: pages for [[content-integrity-invariant]], [[no-exam-timers]], [[static-no-build-architecture]], [[brain-toolkit-location]], [[gamification-server-authority]], [[agent-session-protocol]], plus the six root pages.
6. Verified with `list-pages`, `lint-links` and `tools/content-integrity.js verify`, then committed and pushed.

Going forward the brain is part of normal work, not a one-off: load it at task start, append decisions as they settle.


## Timeline

- time: 2026-11-21T12:54:23
  kind: decision
  summary: "Created this page: Session 2026-11-21 — installing the project brain"
  source: session 2026-11-21
  affects: [session-2026-11-21-brain-install]

- time: 2026-11-21T12:54:23
  kind: decision
  summary: Logged the install session
  source: session 2026-11-21
  affects: [session-2026-11-21-brain-install]
