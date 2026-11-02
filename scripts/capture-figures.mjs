#!/usr/bin/env node
/**
 * Records the README GIFs of the two Anatomy figures, each one full turn of
 * the figure's own idle tour, cut so the GIF loops without a seam:
 *   docs/images/fig-quadratic-voting.gif  opens on 11 krill, empties, adds them back one at a time
 *   docs/images/fig-milestone-escrow.gif  execute, M1, M2 rejected and resubmitted, M3, M4, Completed;
 *                                         then a second pass that ends in a cancel
 *
 * Each built page (the light variant) is opened in headless Chromium with its
 * card (.iso-plate) at 880 CSS px and a device scale of 2. Nothing touches the
 * page: the tour runs on its own. The page's clock (Date, performance.now,
 * requestAnimationFrame, timers) is Playwright's fake clock, paused and stepped
 * one frame interval at a time with a 2x screenshot of the card after each
 * step, so every frame lands exactly on the time grid. (A CDP screencast, as
 * in capture-arena.mjs, delivers frames at 1x in headless Chromium whatever
 * the device scale.) A MutationObserver stamps each change of the card's
 * readout, and the tour's cycle is measured on it rather than assumed,
 * because the escrow tour waits for each animation to settle:
 *
 *   quadratic voting  the readout drops to "0 krill" once per cycle (17 s); the
 *                     GIF runs from 2 s before one drop to 2 s before the next,
 *                     so both cuts fall in the still stretch on 11 krill.
 *   milestone escrow  the readout turns to "executing" once per pass, two
 *                     passes per cycle; the GIF runs from 0.8 s before the
 *                     first execute to 0.8 s before the third, so both cuts
 *                     fall in the still stretch before the escrow is funded.
 *
 * The frames become a palette-optimised GIF with ffmpeg (the recipe of
 * capture-arena.mjs). A GIF over 6 MB is retried with fewer colours, then at
 * 10 fps, then at 1x. Needs Playwright and ffmpeg.
 *
 *   node scripts/capture-figures.mjs [quadratic-voting|milestone-escrow]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = join(ROOT, "docs", "images");
const CARD = 880; // CSS px, the card's width
const SCALE = 2; // device scale factor of the recording
const MARGIN = 6; // CSS px of page around the card, so its hairline frame shows
const VIEW = { width: CARD + 64, height: 780 };
const EPOCH = Date.parse("2026-01-01T00:00:00Z"); // the page's clock when it opens, paused
const GIF_LIMIT = 6 * 1024 * 1024;
// tried in order until the GIF fits
const LADDER = [
  { fps: 12, scale: 1, colors: 128 },
  { fps: 12, scale: 1, colors: 96 },
  { fps: 12, scale: 1, colors: 64 },
  { fps: 10, scale: 1, colors: 96 },
  { fps: 10, scale: 1, colors: 64 },
  { fps: 12, scale: 0.5, colors: 128 },
  { fps: 10, scale: 0.5, colors: 96 },
];

const FIGURES = [
  {
    name: "quadratic-voting",
    page: "docs/figures/quadratic-voting/quadratic-voting-light.html",
    mark: (text) => text.startsWith("0 krill"),
    marksPerCycle: 1,
    lead: 2.0,
    // the first turn opens on the page's first paint of 11 krill, which Chromium
    // rasterises a hair differently from the same scene repainted after the
    // refill; the second turn starts and ends on the repainted one
    skipCycles: 1,
    maxSeconds: 80,
  },
  {
    name: "milestone-escrow",
    page: "docs/figures/milestone-escrow/milestone-escrow-light.html",
    mark: (text) => text.startsWith("executing"),
    marksPerCycle: 2,
    lead: 0.8,
    skipCycles: 0,
    maxSeconds: 180,
  },
];

/** Runs in the page before its scripts: widens the card and stamps readout changes (page ms). */
function instrument(card) {
  window.__readout = [];
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = `.iso-page{width:${card}px!important}`;
    document.head.appendChild(style);
    const el = document.querySelector("[data-readout]");
    let prev = el.textContent;
    window.__readout.push({ t: Date.now(), text: prev });
    new MutationObserver(() => {
      const text = el.textContent;
      if (text === prev) return;
      prev = text;
      window.__readout.push({ t: Date.now(), text });
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

/** Seconds after the clock started at which the readout entered the marked state. */
function marksOf(log, mark) {
  const out = [];
  for (let i = 1; i < log.length; i++) if (mark(log[i].text) && !mark(log[i - 1].text)) out.push((log[i].t - EPOCH) / 1000);
  return out;
}

/**
 * Steps the figure's clock 1/fps s at a time from when it opens, a 2x
 * screenshot of the card after each step, until one cycle is covered.
 * Returns the frames of that cycle, in order.
 */
async function record(browser, fig, fps, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, reducedMotion: "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`page error: ${e.message}`));
  await page.clock.install({ time: EPOCH - 1000 });
  await page.clock.pauseAt(EPOCH);
  await context.addInitScript(instrument, CARD);
  await page.goto(pathToFileURL(join(ROOT, fig.page)).href);
  await page.waitForTimeout(500); // real time: lets the IntersectionObserver start the tour
  const box = await page.evaluate(() => {
    const r = document.querySelector(".iso-plate").getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  if (Math.round(box.width) !== CARD) throw new Error(`${fig.name}: the card is ${box.width} px wide, not ${CARD}`);
  if (box.y + box.height + MARGIN > VIEW.height) throw new Error(`${fig.name}: the card does not fit the ${VIEW.height} px viewport`);
  const clip = { x: box.x - MARGIN, y: box.y - MARGIN, width: box.width + 2 * MARGIN, height: box.height + 2 * MARGIN };

  const files = [];
  const from = fig.skipCycles * fig.marksPerCycle; // the mark that opens the recorded turn
  const need = from + fig.marksPerCycle + 1;
  let at = 0; // ms after EPOCH
  let cut = null;
  for (let i = 0; ; i++) {
    const next = Math.round((i * 1000) / fps);
    if (next > at) await page.clock.runFor(next - at);
    at = next;
    const file = join(dir, `${String(i).padStart(5, "0")}.png`);
    await page.screenshot({ path: file, clip });
    files.push(file);
    if (!cut) {
      const m = marksOf(await page.evaluate(() => window.__readout), fig.mark);
      if (m.length >= need) {
        const first = Math.ceil((m[from] - fig.lead) * fps);
        if (first < 1) throw new Error(`${fig.name}: the first cut falls before the page settled`);
        const cycle = m[from + fig.marksPerCycle] - m[from];
        cut = { first, count: Math.round(cycle * fps), cycle };
      }
    }
    if (cut && i >= cut.first + cut.count) break; // one frame past the cycle, for the seam check
    if (at / 1000 > fig.maxSeconds) throw new Error(`${fig.name}: no full tour within ${fig.maxSeconds} s`);
  }
  await context.close();
  const width = Math.round(clip.width * SCALE);
  console.log(`${fig.name}: tour cycle ${cut.cycle.toFixed(3)} s; ${cut.count} frames at ${fps} fps from ${(cut.first / fps).toFixed(2)} s`);
  return { files: files.slice(cut.first, cut.first + cut.count), width };
}

function toGif(files, fps, width, scale, colors, dir, out) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  files.forEach((file, i) => symlinkSync(file, join(dir, `${String(i).padStart(5, "0")}.png`)));
  const size = scale === 1 ? "" : `scale=${Math.round(width * scale)}:-1:flags=lanczos,`;
  const filter = `${size}split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const res = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dir, "%05d.png"), "-vf", filter, "-loop", "0", out], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("ffmpeg failed");
  return statSync(out).size;
}

async function main() {
  const only = process.argv[2];
  const figs = FIGURES.filter((f) => !only || f.name === only);
  if (!figs.length) throw new Error(`unknown figure ${only}; one of ${FIGURES.map((f) => f.name).join(", ")}`);
  mkdirSync(IMAGES, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "krill-figures-"));
  const browser = await chromium.launch();
  try {
    for (const fig of figs) {
      const out = join(IMAGES, `fig-${fig.name}.gif`);
      let take = null;
      let fits = false;
      for (const { fps, scale, colors } of LADDER) {
        if (take?.fps !== fps) take = { fps, ...(await record(browser, fig, fps, join(work, `${fig.name}-${fps}`))) };
        const bytes = toGif(take.files, fps, take.width, scale, colors, join(work, `${fig.name}-seq`), out);
        const w = Math.round(take.width * scale);
        console.log(`  fig-${fig.name}.gif ${w} px wide, ${take.files.length} frames at ${fps} fps (${(take.files.length / fps).toFixed(2)} s), ${colors} colours: ${(bytes / 1048576).toFixed(2)} MB`);
        if (bytes <= GIF_LIMIT) {
          fits = true;
          break;
        }
      }
      if (!fits) throw new Error(`fig-${fig.name}.gif is over 6 MB at every setting`);
    }
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
