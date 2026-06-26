#!/usr/bin/env node
/**
 * Drive the Expo *web* build with Playwright and screenshot every screen, so an
 * agent can visually verify a UI change (not just run tests). Built for the
 * Claude Code remote environment, where Chromium + Playwright are pre-installed
 * (see PLAYWRIGHT_BROWSERS_PATH) — it auto-detects both rather than downloading.
 *
 * Usage:
 *   1. Start the web server:  npx expo start --web --port 8081
 *      (wait for "Waiting on http://localhost:8081" in its output)
 *   2. node ai-tooling/screenshot-web.js [outDir]
 *
 * Env:
 *   BASE_URL   dev-server URL        (default http://localhost:8081)
 *   OUT_DIR    screenshot directory  (default ./screenshots, or argv[2])
 *
 * The flow seeds a deck + cards through the UI, then captures the home, deck
 * detail, card form, and practice (front + flipped) screens. Web SQLite starts
 * empty per browser context, so the seeding runs every time. Adjust the steps
 * for whatever surface you're verifying.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Resolve Playwright whether it's a local dep or the environment's global install.
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright'));
  }
}

// Find the pre-installed Chromium so we never trigger a download. Returns
// undefined to let Playwright resolve it itself (e.g. a local browser install).
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs
      .readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .pop();
    if (dir) {
      const exe = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

const BASE = process.env.BASE_URL || 'http://localhost:8081';
const OUT = process.env.OUT_DIR || process.argv[2] || path.resolve('screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('shot', name);
  } catch (e) {
    console.log('shot-fail', name, e.message.slice(0, 80));
  }
}

// RN-web renders Pressables as divs; click by visible text, forced so an
// off-viewport-but-present control still registers.
async function clickText(page, text, exact = true) {
  try {
    const el = page.getByText(text, { exact });
    if (await el.count()) {
      await el.first().click({ force: true, timeout: 5000 });
      return true;
    }
  } catch (e) {
    console.log('click-fail', text, e.message.slice(0, 60));
  }
  return false;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('PAGE-ERR', m.text().slice(0, 160));
  });

  // First load triggers Metro bundling — allow a generous timeout.
  console.log('loading', BASE);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 180000 });
  await sleep(4000);

  // Seed a deck.
  try {
    await page.fill('input[placeholder="New deck name"]', 'Spanish Basics');
  } catch {
    /* placeholder may differ */
  }
  await sleep(300);
  await clickText(page, 'Add');
  await sleep(2000);
  await shot(page, '02-deck-detail-empty');

  // Seed a few cards.
  async function addCard(front, back) {
    await clickText(page, 'Add card');
    await sleep(1000);
    const flds = page.locator('textarea'); // multiline TextInput -> <textarea> on web
    try {
      if ((await flds.count()) >= 2) {
        await flds.nth(0).fill(front);
        await sleep(150);
        await flds.nth(1).fill(back);
        await sleep(150);
      }
    } catch (e) {
      console.log('fill-fail', e.message.slice(0, 60));
    }
    if (!(await clickText(page, 'Save & add another'))) await clickText(page, 'Save card');
    await sleep(1000);
  }
  await addCard('el gato', 'the cat');
  await shot(page, '03-card-form');
  await addCard('el perro', 'the dog');
  await addCard('la casa', 'the house');
  await page.goBack().catch(() => {});
  await sleep(1800);
  await shot(page, '02-deck-detail');

  // Home.
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(2500);
  await shot(page, '01-home');

  // Practice (front + flipped).
  await clickText(page, 'Practice', false);
  await sleep(3000);
  await shot(page, '04-practice-front');
  await page.mouse.click(206, 420); // tap card center to flip
  await sleep(1300);
  await shot(page, '05-practice-flipped');

  await browser.close();
  console.log('done →', OUT);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
