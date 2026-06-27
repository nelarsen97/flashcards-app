#!/usr/bin/env node
/**
 * Generate the app's chalkboard background — a dark green board smudged with
 * freshly-erased chalk — as a PNG, procedurally (no image-gen API needed).
 *
 *   node ai-tooling/generate-chalkboard.js
 *   → writes assets/images/chalkboard.png
 *
 * The look: a slate-green base gradient, soft elliptical eraser clouds and wide
 * horizontal eraser smears in chalk white, a touch of grain, and an edge
 * vignette. Deterministic (seeded), so re-running reproduces the same board.
 * Tune the constants below and re-run to iterate.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Kept modest: the texture is soft, so this scales up cleanly under `cover`,
// and a smaller image keeps the committed PNG small.
const W = 720;
const H = 1280;
const OUT = path.resolve(__dirname, '..', 'assets', 'images', 'chalkboard.png');

// Base board gradient (top → bottom), kept near theme `chalkboard` (#36443C).
const TOP = [56, 69, 57];
const BOTTOM = [48, 60, 52];
// Chalk color the smudges blend toward.
const CHALK = [236, 239, 229];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xc4a1b00a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Soft elliptical eraser "dabs".
const clouds = Array.from({ length: 24 }, () => ({
  cx: rng() * W,
  cy: rng() * H,
  rx: 90 + rng() * 240,
  ry: 50 + rng() * 150,
  k: 0.05 + rng() * 0.14,
}));

// Wide horizontal eraser smears (the freshly-wiped streaks), with a gentle
// sinusoidal fade across x so they look swept, not uniform.
const smears = Array.from({ length: 11 }, () => ({
  cy: rng() * H,
  ry: 40 + rng() * 130,
  k: 0.05 + rng() * 0.12,
  freq: 0.002 + rng() * 0.004,
  phase: rng() * Math.PI * 2,
}));

const png = new PNG({ width: W, height: H });

for (let y = 0; y < H; y++) {
  const ty = y / H;
  for (let x = 0; x < W; x++) {
    let r = lerp(TOP[0], BOTTOM[0], ty);
    let g = lerp(TOP[1], BOTTOM[1], ty);
    let b = lerp(TOP[2], BOTTOM[2], ty);

    // Accumulate chalk-white coverage from clouds + smears.
    let w = 0;
    for (const c of clouds) {
      const dx = (x - c.cx) / c.rx;
      const dy = (y - c.cy) / c.ry;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        const f = 1 - d2;
        w += c.k * f * f;
      }
    }
    for (const s of smears) {
      const dy = (y - s.cy) / s.ry;
      const d2 = dy * dy;
      if (d2 < 1) {
        const f = 1 - d2;
        const xm = 0.55 + 0.45 * Math.sin(x * s.freq + s.phase);
        w += s.k * f * f * xm;
      }
    }
    if (w > 0) {
      if (w > 0.85) w = 0.85;
      r = lerp(r, CHALK[0], w);
      g = lerp(g, CHALK[1], w);
      b = lerp(b, CHALK[2], w);
    }

    // Fine grain.
    const n = (rng() - 0.5) * 6;
    r += n;
    g += n;
    b += n;

    // Edge vignette.
    const vdx = (x - W / 2) / (W / 2);
    const vdy = (y - H / 2) / (H / 2);
    const vd = Math.sqrt(vdx * vdx + vdy * vdy);
    const vig = Math.max(0, vd - 0.55) * 34;
    r -= vig;
    g -= vig;
    b -= vig;

    const i = (y * W + x) << 2;
    png.data[i] = clamp(r);
    png.data[i + 1] = clamp(g);
    png.data[i + 2] = clamp(b);
    png.data[i + 3] = 255;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
png.pack().pipe(fs.createWriteStream(OUT)).on('finish', () => {
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`wrote ${OUT} (${W}x${H}, ${kb} KB)`);
});
