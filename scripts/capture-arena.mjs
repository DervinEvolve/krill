#!/usr/bin/env node
/**
 * Records the README captures of the Krill desk:
 *   docs/images/arena-votes.png      mid-vote, the whale's chips in flight
 *   docs/images/arena-passed.png     after finalize: PASSED, beam tilted to FOR
 *   docs/images/arena-completed.png  escrow COMPLETED: drawers open, the builder's tray full
 *   docs/images/arena-run.gif        the whole run (12 fps, 1280 wide)
 *   docs/arena-transcript.txt        the arena's terminal transcript
 *
 * It starts the arena (`--serve --speed 600`) and the Vite dev server, opens
 * the desk in headless Chromium, presses Run ▸ whale vs krill, and waits on the
 * page's own state for each moment. The GIF is built from lossless screencast
 * frames (a lossy video would make every GIF frame differ), with the quiet
 * countdown between the last vote and finalize played at 4x.
 * Needs Playwright, ffmpeg and the Solana CLI.
 *
 *   node scripts/capture-arena.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = join(ROOT, "docs", "images");
const FRAMES = join(ROOT, "arena", ".capture");
const APP_URL = "http://127.0.0.1:5173/";
const VIEW = { width: 1280, height: 800 };
const GIF_LIMIT = 8 * 1024 * 1024;

const children = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");

/** Starts a long-running npm script in its own process group and collects its output. */
function start(args, cwd = ROOT) {
  const child = spawn("npm", ["run", "--silent", ...args], { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const proc = { child, out: "" };
  child.stdout.on("data", (d) => (proc.out += d.toString()));
  child.stderr.on("data", (d) => (proc.out += d.toString()));
  children.push(child);
  return proc;
}

function stopAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

async function until(what, test, timeoutMs, everyMs = 100) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await test()) return;
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function urlUp(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** The desk and its notepad: the page layout with a small margin, in CSS pixels. */
const layoutRect = (page) =>
  page.evaluate(() => {
    const r = document.querySelector(".layout").getBoundingClientRect();
    const x = Math.max(0, Math.floor(r.left - 12));
    const y = Math.max(0, Math.floor(r.top - 8));
    return { x, y, width: Math.ceil(Math.min(innerWidth - x, r.width + 24)), height: Math.ceil(Math.min(innerHeight - y, r.height + 16)) };
  });

async function shot(page, name) {
  await page.screenshot({ path: join(IMAGES, name), clip: await layoutRect(page) });
  console.log(`  ${name}`);
}

/** Collects lossless screencast frames with their timestamps (seconds). */
async function screencast(page) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = join(FRAMES, `${String(frames.length).padStart(5, "0")}.png`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "png", maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
  return { frames, stop: () => cdp.send("Page.stopScreencast") };
}

const frame = (page, fn) => page.evaluate(fn);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file) {
  const head = readFileSync(file).subarray(16, 24);
  return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) };
}

/**
 * Writes an ffmpeg concat list: each frame shown until the next, the quiet
 * stretch [fastFrom, fastTo) at 4x. The screencast sends a few downscaled
 * frames while a screenshot is taken; those are left out.
 */
function frameList(all, fastFrom, fastTo, end) {
  const frames = all.filter((fr) => {
    const { width, height } = pngSize(fr.file);
    return width === VIEW.width && height === VIEW.height;
  });
  const lines = frames.map((fr, i) => {
    const next = frames[i + 1]?.t ?? end;
    const quiet = fr.t >= fastFrom && fr.t < fastTo;
    return `file '${fr.file}'\nduration ${Math.max(0.001, (next - fr.t) / (quiet ? 4 : 1)).toFixed(3)}`;
  });
  const last = frames[frames.length - 1];
  const list = join(FRAMES, "frames.txt");
  writeFileSync(list, `${lines.join("\n")}\nfile '${last.file}'\n`);
  return list;
}

function toGif(list, crop, out) {
  for (const colors of [128, 96, 64]) {
    const filter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},fps=12,scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
    const res = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", filter, "-loop", "0", out], { stdio: "inherit" });
    if (res.status !== 0) throw new Error("ffmpeg failed");
    const size = statSync(out).size;
    console.log(`  arena-run.gif ${(size / 1048576).toFixed(1)} MB (${colors} colours)`);
    if (size <= GIF_LIMIT) return;
  }
  throw new Error("arena-run.gif is over 8 MB even at 64 colours");
}

async function main() {
  mkdirSync(IMAGES, { recursive: true });
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const arena = start(["arena", "--", "--serve", "--speed", "600"]);
  start(["app"]);
  await until("the arena feed", () => urlUp("http://127.0.0.1:8787/manifest"), 900_000);
  await until("the Vite dev server", () => urlUp(APP_URL), 60_000);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`page error: ${e.message}`));
  await page.goto(APP_URL);
  await until("the feed to connect", () => frame(page, () => document.querySelector(".dot.live") !== null), 20_000);
  await sleep(1200);
  const crop = await layoutRect(page);
  const cast = await screencast(page);
  const now = () => cast.frames[cast.frames.length - 1]?.t ?? 0;

  console.log("running whale-vs-krill");
  await page.click("text=Run ▸");
  await page.click('.chip:has-text("whale vs krill")');

  await until("the whale's chips in flight", () => frame(page, () => window.__st.frame.flyers.some((f) => f.kind === "block" && f.at[1] < 192)), 120_000, 30);
  await shot(page, "arena-votes.png");
  await until("the whale's tokens on the pan", () => frame(page, () => window.__st.frame.model.againstVotes > 0n), 30_000);
  const quietFrom = now() + 1;
  await until("PASSED", () => frame(page, () => window.__st.frame.model.proposal?.state === "Passed"), 120_000);
  const quietTo = now() - 1;
  await sleep(450);
  await shot(page, "arena-passed.png");
  await until("COMPLETED", () => frame(page, () => window.__st.frame.model.proposal?.state === "Completed" && window.__st.frame.flyers.length === 0), 120_000);
  await sleep(1500);
  await shot(page, "arena-completed.png");
  await until("the end of the run", () => arena.out.includes("finished whale-vs-krill"), 60_000);
  await sleep(2500);
  await cast.stop();
  const end = now() + 2;
  await context.close();
  await browser.close();
  if (cast.frames.length < 2) throw new Error("no screencast frames were recorded");
  toGif(frameList(cast.frames, quietFrom, quietTo, end), crop, join(IMAGES, "arena-run.gif"));

  const transcript = stripAnsi(arena.out).split("\n").filter((l) => !l.startsWith("serving;")).join("\n").trim();
  writeFileSync(join(ROOT, "docs", "arena-transcript.txt"), `${transcript}\n`);
  console.log("  arena-transcript.txt");
  rmSync(FRAMES, { recursive: true, force: true });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(stopAll);
