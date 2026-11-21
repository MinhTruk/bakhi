---
id: v840-themes-and-founder-badges
title: "v8.4.0: theme engine, BKUserName, Founder badges (and what was deferred)"
category: decision
status: active
tags: [v840, themes, decorations, founder]
created: "2026-11-21T13:24:15"
updated: "2026-11-21T14:06:36"
---

<!-- compiled_truth -->
v8.4.0 shipped three vertical slices; the rest of the brief was deliberately deferred and is listed in `CHANGELOG.md`.

**Shipped**

- `assets/bakhi/bk-themes.js|css` — one module for themes **and** name decorations (`BKThemes`, `BKUserName`). Ten themes; Halloween = carved-face glowing pumpkins (inline SVG) + bats; Christmas = 28 snowflakes + tree. Scope: `page` (home, full-viewport layer + contrast veil), `head` (subject pages, header only), `accent` (profile/gamification/settings), `none` (admin).
- Ownership/selection stay server-side (`user_inventory`, kind `theme`); `localStorage.bakhiTheme.v1` is cache only, refreshed by `BKThemes.syncFromState(state)` inside `applyState`. `setTheme` refuses unowned themes.
- Settings → Hình nền hosts `BKThemes.renderPicker()`.
- `BKUserName` replaces ad-hoc name icons in shell menu, profile hero, gamification hero.
- Founder: "Give Special Badges" card (4 hand-granted achievements) reusing `admin.achievements.grant`; skills-tree card renamed "Give Full Skills Tree".

**Hard-won constraint (do not regress)**

`tools/content-integrity.js` strips every *line* containing `assets/bakhi/`. Injecting a `<link>`/`<script>` mid-line therefore deletes neighbouring markup from the normalized text and reports a content regression. The injector must append both tags as standalone lines at EOF (with a trailing newline) — see [[content-integrity-invariant]].

**Deferred, with reasons**

- Subject-page unification (114 pages → shared components, `hoc.html`/`kiemtra.html`): too large and content-structural to do safely in one pass.
- Founder skill-tree **revoke**: provenance columns/table are in the pending migration, but the revoke function/API was not written because it cannot be tested against the live Supabase project from this environment.


## Timeline

- time: 2026-11-21T13:24:15
  kind: decision
  summary: "Created this page: v8.4.0: theme engine, BKUserName, Founder badges (and what was deferred)"
  source: session 2026-11-21
  affects: [v840-themes-and-founder-badges]

- time: 2026-11-21T13:24:15
  kind: decision
  summary: Recorded the 8.4.0 scope and its constraints
  source: session 2026-11-21
  affects: [v840-themes-and-founder-badges]

- time: 2026-11-21T14:06:36
  kind: decision
  summary: "8.4.1: Founder Dashboard có thẻ Give Themes (BKFounderGrants.renderThemes) trao giao diện qua admin.items.catalog|preview|grant, không action mới; migration 20261214000000 cấp toàn bộ vật phẩm cho hồ sơ Founder."
  affects: [v840-themes-and-founder-badges]
