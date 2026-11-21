---
id: gamification-server-authority
title: "Gamification: server is the source of truth"
category: concept
status: active
tags: [gamification, supabase, security]
created: "2026-11-21T12:54:23"
updated: "2026-11-21T12:54:23"
---

<!-- compiled_truth -->
Since 8.3.0 Supabase is the single source of truth for XP, levels, achievements, missions and items. The client only sends learning events plus an idempotency key to `gamification-api`; it never adds XP itself.

- User tables have **SELECT-only** policies. Any change goes through a `bk_gam_*` function in a new migration.
- Level formula exists only in `bk_gam_level_floor` (server) with one display copy in `bk-gamification.js`.
- The server layer is **`window.BKCloud`**, not `BK.cloud` (the latter is `bk-core.js`'s localStorage adapter). Using `BK.cloud.gamificationApi` silently produces the "Chưa kết nối máy chủ" bug of 8.3.0.
- `student_profiles.frame` is the only truth for the equipped avatar frame; `bk_gam_equip` writes both it and `user_inventory.is_equipped` in one transaction.
- Every avatar render goes through `BKProfile.avatarNode()`.
- Only `bk_gam_evaluate` may complete a skill-tree node, and only when `bk_gam_node_blockers()` is empty. Level/XP writes must call it in the same transaction.
- Admin student lookup uses `admin.students.search`; `students.search` belongs to the student branch and returns `UNKNOWN_ACTION`.


## Timeline

- time: 2026-11-21T12:54:23
  kind: decision
  summary: "Created this page: Gamification: server is the source of truth"
  source: "AGENTS.md §6"
  affects: [gamification-server-authority]

- time: 2026-11-21T12:54:23
  kind: decision
  summary: Recorded the gamification authority rules
  source: "AGENTS.md §6"
  affects: [gamification-server-authority]
