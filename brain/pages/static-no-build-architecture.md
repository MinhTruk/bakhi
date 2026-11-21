---
id: static-no-build-architecture
title: "Static, no-build site with a shared upgrade layer"
category: concept
status: active
tags: [architecture, pages]
created: "2026-11-21T12:54:23"
updated: "2026-11-21T12:54:23"
---

<!-- compiled_truth -->
The site is plain HTML/CSS/JS deployed to **GitHub Pages with no build step**: 119 HTML files (1 home, 1 admin, 116 subject/lesson/Studio pages, 1 empty).

Every educational page owns its own content. Behaviour is added by a shared upgrade layer in `assets/bakhi/` that is injected as `<script>` tags — pages are never rewritten by tooling beyond that.

Hard rules that follow from "no build":

- No framework, no bundler, **no new runtime dependency**.
- ES5-ish + raw DOM (`BK.ui.el`, `textContent`); never `innerHTML` with unescaped user data.
- New CSS lives in `assets/bakhi/*.css` prefixed `.bk-` (learning) or `.bkdev-` (playground).
- ~12 separate `bk-*.js` modules each own one concern (shell, profile, badges, gamification, learning, learn, dev, music, cloud, report, devboard, admin). Do not create a second engine for a concern that already has a module.
- `bk-cloud.js` has two modes: full (home page) and notify-only (`data-bk-notify-only="1"`, used by lesson/Studio pages). Load it exactly once per page, config before cloud.


## Timeline

- time: 2026-11-21T12:54:23
  kind: decision
  summary: "Created this page: Static, no-build site with a shared upgrade layer"
  source: "AGENTS.md §0, §2"
  affects: [static-no-build-architecture]

- time: 2026-11-21T12:54:23
  kind: decision
  summary: Architecture concept recorded
  source: docs/ARCHITECTURE.md
  affects: [static-no-build-architecture]
