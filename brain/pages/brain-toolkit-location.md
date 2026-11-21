---
id: brain-toolkit-location
title: "Brain toolkit lives in brain-toolkit/, not at the repo root"
category: decision
status: active
tags: [brain, tooling]
created: "2026-11-21T12:54:23"
updated: "2026-11-21T12:54:23"
---

<!-- compiled_truth -->
The brain.md installer (v0.3.0, `@mindmux/brain-md`) unpacks `LICENSE`, `README.md`, `package.json`, `bin/` and `skills/` into the project root. This repo has **no** root `package.json` and its `tools/*.js` are CommonJS scripts run with plain `node`.

A root `package.json` carrying `"type": "module"` would have re-parsed every `tools/*.js` as ESM and broken `require()` — i.e. it would have broken the integrity and QA gates the project depends on. `skills/` is also already a published site page (`/skills/`, the gamification skill tree).

Therefore the toolkit was installed into **`brain-toolkit/`** (self-contained: `bin/`, `skills/`, nested `package.json`, `LICENSE`, `README.md`). Only `BRAIN.md` and `brain/` sit at the repo root.

Invoke the CLI from the project root as:

```bash
node brain-toolkit/bin/brain.mjs <subcommand>
```


## Timeline

- time: 2026-11-21T12:54:23
  kind: decision
  summary: "Created this page: Brain toolkit lives in brain-toolkit/, not at the repo root"
  source: session 2026-11-21
  affects: [brain-toolkit-location]

- time: 2026-11-21T12:54:23
  kind: decision
  summary: Chose a nested toolkit directory to protect the CommonJS tools
  source: session 2026-11-21
  affects: [brain-toolkit-location]
