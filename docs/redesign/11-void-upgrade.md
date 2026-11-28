# Void / Katana upgrade — audit, plan, report

Branch: `redesign/bakhi-complete-rebirth` (feature branch, not deployed).
Date: 27/11/2026.

## 1. Audit findings

### Stack
- Static HTML/CSS/JS, **no build step, no bundler, no package.json at root**. ES5-ish
  IIFEs, `window.BK*` globals. Deploy = GitHub Pages.
- Styling: plain CSS + Tailwind Play CDN on lesson pages; the redesign layer
  (`bk-rebirth.css`) re-skins via tokens and `body.bk-rebirth` overrides.
- Tokens: `bk-rebirth.css` `:root` (`--rb-*`, mapped to `--bk-*` / `--bkl-*`) and
  `bk-tokens.css` (`--bk-*` fallback before rebirth loads). One source per layer.
- No client router. Every route is a full document load; “transitions” are a 400 ms
  `rbPageIn` CSS animation (`body.bk-page-enter main`) plus the legacy “bàn tay kéo”
  overlay (`bk-bkt.js`, `#bkt`).
- Shell: `bk-rebirth.js` builds rail, top bar, bottom tab bar, “Thêm” sheet, footer.
  Legacy chrome is kept in the DOM and hidden with `.bk-hide-legacy`.

### Cursor
- No JS cursor. Identity is a **CSS `cursor: url(...)`** on `(pointer: fine) and
  (hover: hover)` in `bk-rebirth.css:2468-2485`: 22 px ring, `#ffd0d8` stroke,
  `#ffb6c1` dot; hover variant r 8.4.
- Consequences: no lag/spring, no hover expansion beyond two static images, no
  scroll response, no pressed/text/hidden states, no listener leaks (there are none).
- Must preserve the visual identity (22 px, pink ring + dot) when moving to DOM.

### Intro
- `bk-intro.js|css` (index.html only, injected by `tools/integrate-pages.js`).
  Circle → morph to “b” → BAKHI → “nền tảng học tập”, one WAAPI clock, 2150 ms.
  Play once per session (`sessionStorage bakhiIntroSeen.v1`), `?intro=1|0`,
  reduced-motion static variant, skip on key/tap, 1.4 s boot-lock wait.
- Assets: inline SVG + Lexend (Google Fonts, loaded on index). No katana assets.
- Hand-off: overlay fades, then removes itself; page is already mounted beneath.

### Theme
- “Quiet Graphite”: near-black `#0b0b0e`, warm white text `#f2efec`, pink accent
  `#ffb6c1`. Light mode exists (`html.light`, warm paper) and is reachable from the
  account menu / settings → keep it as a coherent counterpart, do not delete.
- Hardcoded colours outside tokens: lesson-page Tailwind CDN markup (covered by the
  rebirth override layer), legacy inline styles in lesson `<style>` blocks, boot
  splash in `index.html`, `manifest.webmanifest`, `meta[name=theme-color]`,
  `bk-tokens.css` fallback palette, `bk-intro.css` own vars, `bk-bkt.js` overlay.
- Pages/components on the old palette: **all** pages that load `bk-rebirth.css`
  share `--rb-*`; changing tokens re-skins them in one place. Studio/Founder/Admin
  also load it (chrome differs, tokens same). Third-party widgets (KaTeX, Tailwind
  lesson blocks) inherit through the override layer.

### Transitions
- `rbPageIn` (enter only) + `bk-bkt.js` hand overlay (exit + enter). Two competing
  systems. `bk-bkt` registers a capture-phase click listener in `<head>`, so the new
  system disables it with the existing `window.__bktOff` switch (dev playground
  `__bkt.test()` still works).
- No View Transitions API usage, no animation library installed.

### Header / avatar
- Avatar button (`bk-shell.js`, `.bk-user-slot`) opens the account menu. It is
  adopted into `.bk-chrome-slot[data-slot=user]` by `bk-rebirth.js`.
- Two hamburgers exist: (a) `.bk-chrome-menu` (fa-bars) in the top bar, mobile only,
  opens the same sheet as the bottom tab “Thêm”; (b) legacy `#hamburgerDropdown`
  in `index.html`, already hidden by `.bk-legacy-hidden`. Both are redundant.
- Actions reachable only through the legacy dropdown: “Đổi học sinh” (also in the
  account menu head), Administrator reveal (route `/admin/` + Settings → Developer),
  Dev panel (Settings), README (header button + account menu), theme toggle (account
  menu + rail). No action is lost. `bk-devboard.js` and `bk-cloud.js` guard the
  missing nodes (`if (!section) return;`).

### Reusable
- `--rb-dur-*`, `--rb-ease-*`, `--rb-z-*`, `--rb-k` (reduced-motion), `BKRebirth.icon`,
  `BKRebirth.logo`, `hideLegacyChrome`, `setupScroll` rAF loop.

## 2. Plan (as executed)

Order: shared motion module → cursor → transition/void layer → katana intro →
void tokens → hamburger cleanup → injection → QA.

Create:
- `assets/bakhi/bk-motion.js` — durations, easings, spring, z-index, reduced check.
- `assets/bakhi/bk-cursor.js|css` — dot + ring, delegated hover, spring, scroll
  impulse, pressed/text/hidden, fine-pointer only, destroy().
- `assets/bakhi/bk-transition.js|css` — `#bkVoid` star/nebula layer, `#bkVT` exit /
  enter overlay, link interception, bfcache handling, focus restore.
- `tools/qa/void-upgrade.js` — static invariants.

Change:
- `bk-intro.js|css` — replace sequence with O → slash → B → BAKHI → pull-out →
  full-screen split. One WAAPI clock, skip, timeout, reduced fallback.
- `bk-rebirth.css` — void tokens, void body background, remove CSS `cursor: url`,
  replace `rbPageIn` with the void enter, hide `.bk-chrome-menu`.
- `bk-rebirth.js` — drop the top-bar hamburger.
- `index.html` — remove `#hamburgerDropdown` + handlers/CSS, guard legacy lookups,
  update theme-color / boot splash.
- `bk-shell.js` — drop the hamburger hide block.
- `tools/integrate-pages.js` — inject motion/cursor/transition on every page.
- `manifest.webmanifest`, `bk-tokens.css`, `bk-theme-boot.js` (nav flag only).

Do not touch: Supabase schema/functions, routes, lesson content, CHANGELOG/version
(branch convention keeps `8.8.0`; documented risk).

## 3. Decisions

- **Intro replay:** once per session on `index.html` only; skipped when the page is
  entered through the void transition; `?intro=1` forces, `?intro=0` disables.
- **Light mode:** kept as a coherent “pink dawn” counterpart (tokens), not removed.
- **Transitions across full page loads:** rail/header are rebuilt by the browser, so
  they are covered by the overlay; visually identical chrome makes the hand-off
  seamless. Documented limitation, not an SPA rewrite.
- **No new dependency.** WAAPI + CSS only.
- **Pink text:** `--rb-text` moves to a pink-tinted near-white; contrast verified by
  `tools/qa/rebirth-contrast.js` (AA, 4.5:1).

## 4. Known limitations

- Cross-document transitions cannot keep the outgoing page alive; exit is an overlay.
- Studio/lesson inline Tailwind colours are re-skinned by the override layer, not
  rewritten file by file (125 content files, integrity baseline).
- `?v=8.8.0` cache key unchanged (branch convention).
