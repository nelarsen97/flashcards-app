# ai-tooling

Small scripts for AI agents (and humans) working on this repo. These are
developer utilities — not shipped with the app and not imported by it.

## screenshot-web.js

Drives the Expo **web** build with Playwright and screenshots each screen, for
visually verifying a UI change (tests alone don't show layout/styling).

Built for the Claude Code remote environment, where Chromium and Playwright are
pre-installed; the script auto-detects both (no `playwright install` needed).

```sh
# 1. Start the web dev server and wait for "Waiting on http://localhost:8081"
npx expo start --web --port 8081

# 2. In another shell, capture screenshots into ./screenshots
node ai-tooling/screenshot-web.js
```

Env overrides: `BASE_URL` (default `http://localhost:8081`), `OUT_DIR`
(default `./screenshots`, also accepted as the first CLI arg).

The flow seeds a deck + cards through the UI (web SQLite is empty per browser
context), then shots home, deck detail, the card form, and practice
(front + flipped). Edit the steps at the bottom of the script to target a
different surface. `screenshots/` is gitignored — these are throwaway artifacts.

## generate-chalkboard.js

Procedurally generates the app's chalkboard background — a dark green board
smudged with freshly-erased chalk — and writes `assets/images/chalkboard.png`
(committed; `src/components/Screen.tsx` renders it). Pure Node + `pngjs`, no
image-gen API. Deterministic; tweak the constants at the top and re-run to
iterate on the look.

```sh
node ai-tooling/generate-chalkboard.js
```
