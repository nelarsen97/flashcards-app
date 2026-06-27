#!/usr/bin/env node
/**
 * Generate the app's chalkboard background — a dark sage board streaked with
 * freshly-erased chalk — as a PNG, procedurally (no image-gen API needed).
 *
 *   node ai-tooling/generate-chalkboard.js
 *   → writes assets/images/chalkboard.png
 *
 * The look (modelled on a real eraser-smudged blackboard): a sage-green base
 * gradient, soft lighting clouds, and lots of directional chalk streaks —
 * elongated soft strokes at many angles, both broad swipes and fine wisps —
 * with a touch of grain and a mild edge vignette. Deterministic (seeded), so
 * re-running reproduces the same board. Tune the constants and re-run to iterate.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Soft texture, so a modest size scales up cleanly under `cover` and keeps the
// committed PNG small.
const W = 720;
const H = 1280;
const OUT = path.resolve(__dirname, '..', 'assets', 'images', 'chalkboard.png');

// Base board gradient (top → bottom), a muted sage green.
const TOP = [70, 85, 77];
const BOTTOM = [58, 72, 64];
// Chalk the light streaks blend toward; a darker green for the few dark streaks.
const CHALK = [223, 229, 220];
const DARK = [44, 56, 50];

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

const rng = mulberry32(0x57ea4c0a);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// A directional streak: an elongated, rotated, soft-edged stroke. `dark` ones
// darken the board instead of chalking it.
function makeStreaks(count, lenMin, lenMax, widMin, widMax, kMin, kMax, dark) {
  return Array.from({ length: count }, () => {
    const ang = rng() * Math.PI;
    const halfLen = lenMin + rng() * (lenMax - lenMin);
    return {
      cx: rng() * W,
      cy: rng() * H,
      cos: Math.cos(ang),
      sin: Math.sin(ang),
      halfLen,
      halfWid: widMin + rng() * (widMax - widMin),
      reach2: halfLen * halfLen,
      k: kMin + rng() * (kMax - kMin),
      dark: !!dark,
    };
  });
}

// Soft round-ish lighting clouds for an uneven base.
const clouds = Array.from({ length: 16 }, () => ({
  cx: rng() * W,
  cy: rng() * H,
  rx: 120 + rng() * 260,
  ry: 90 + rng() * 200,
  k: 0.02 + rng() * 0.06,
}));

const streaks = [
  ...makeStreaks(16, 220, 470, 14, 40, 0.025, 0.05, false), // broad swipes
  ...makeStreaks(140, 60, 210, 3, 8, 0.025, 0.07, false), // fine wisps
  ...makeStreaks(14, 120, 320, 10, 26, 0.025, 0.05, true), // dark drags
];

const png = new PNG({ width: W, height: H });

for (let y = 0; y < H; y++) {
  const ty = y / H;
  for (let x = 0; x < W; x++) {
    let r = lerp(TOP[0], BOTTOM[0], ty);
    let g = lerp(TOP[1], BOTTOM[1], ty);
    let b = lerp(TOP[2], BOTTOM[2], ty);

    let light = 0;
    let dark = 0;

    for (const c of clouds) {
      const dx = (x - c.cx) / c.rx;
      const dy = (y - c.cy) / c.ry;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        const f = 1 - d2;
        light += c.k * f * f;
      }
    }

    for (const s of streaks) {
      const px = x - s.cx;
      const py = y - s.cy;
      if (px * px + py * py > s.reach2) continue; // bounding-circle early-out
      const u = (px * s.cos + py * s.sin) / s.halfLen;
      const v = (-px * s.sin + py * s.cos) / s.halfWid;
      const d2 = u * u + v * v;
      if (d2 < 1) {
        const f = 1 - d2;
        const amt = s.k * f * f;
        if (s.dark) dark += amt;
        else light += amt;
      }
    }

    if (light > 0.8) light = 0.8;
    if (dark > 0.5) dark = 0.5;
    if (light > 0) {
      r = lerp(r, CHALK[0], light);
      g = lerp(g, CHALK[1], light);
      b = lerp(b, CHALK[2], light);
    }
    if (dark > 0) {
      r = lerp(r, DARK[0], dark);
      g = lerp(g, DARK[1], dark);
      b = lerp(b, DARK[2], dark);
    }

    // Fine grain.
    const n = (rng() - 0.5) * 5;
    r += n;
    g += n;
    b += n;

    // Mild edge vignette.
    const vdx = (x - W / 2) / (W / 2);
    const vdy = (y - H / 2) / (H / 2);
    const vd = Math.sqrt(vdx * vdx + vdy * vdy);
    const vig = Math.max(0, vd - 0.6) * 26;
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
