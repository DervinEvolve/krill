#!/usr/bin/env node
/**
 * Records arena runs for the desk's replay mode (and the hosted demo):
 *   app/public/runs/<scenario>.json  { manifest, events }: the feed's full
 *                                    history, each step with its reasoning,
 *                                    signature and the chain snapshot after it
 *   app/public/runs/index.json       the recorded runs the desk can pick from
 *
 * It starts the arena (`--serve`, a fresh local validator), runs each scenario
 * in turn through the feed, and saves the history the feed replays. With no
 * names it records every scenario. Needs the Solana CLI.
 *
 *   npm run record
 *   npm run record -- whale-vs-krill
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = join(ROOT, "app", "public", "runs");
const INDEX = join(RUNS, "index.json");
const FEED = "http://127.0.0.1:8787";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(what, test, timeoutMs, everyMs = 250) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await test()) return;
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function getJson(path) {
  try {
    const res = await fetch(`${FEED}${path}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Reads the feed's `/events` stream until the run's `end` event. Bigints stay
 * in their wire form (`{ "$big": "..." }`), which is what the desk parses.
 */
async function history() {
  const res = await fetch(`${FEED}/events`);
  const decoder = new TextDecoder();
  const events = [];
  let manifest = null;
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const name = /^event: (.+)$/m.exec(frame)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (!data) continue;
      if (name === "manifest") manifest = JSON.parse(data);
      else events.push(JSON.parse(data));
    }
    // Leaving the loop cancels the stream.
    if (events.at(-1)?.kind === "end") return { manifest, events };
  }
  throw new Error("the feed closed before the run ended");
}

async function record(name) {
  const res = await fetch(`${FEED}/run/${name}`, { method: "POST" });
  if (res.status !== 202) throw new Error(`could not start ${name}: HTTP ${res.status}`);
  await until(`${name} to finish`, async () => (await getJson("/manifest"))?.running === false, 600_000);
  const run = await history();
  const end = run.events.at(-1);
  if (!run.manifest || !end?.ok) throw new Error(`${name} did not finish cleanly: ${end?.detail ?? end?.action ?? "no end event"}`);
  const file = join(RUNS, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(run)}\n`);
  const kb = (Buffer.byteLength(JSON.stringify(run)) / 1024).toFixed(0);
  console.log(`  ${name}.json  ${run.events.length} events, ${kb} KB`);
  return { name, recordedAt: run.events[0].t };
}

async function main() {
  mkdirSync(RUNS, { recursive: true });
  const arena = spawn("npm", ["run", "--silent", "arena", "--", "--serve"], { cwd: ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  arena.stdout.on("data", (d) => (out += d.toString()));
  arena.stderr.on("data", (d) => (out += d.toString()));
  const exited = new Promise((_, reject) => arena.once("exit", (code) => reject(new Error(`the arena exited (${code}):\n${out.trim()}`))));
  exited.catch(() => undefined);
  try {
    await Promise.race([until("the arena feed", async () => (await getJson("/manifest")) !== null, 900_000), exited]);
    const scenarios = await getJson("/scenarios");
    const wanted = process.argv.slice(2);
    const unknown = wanted.filter((n) => !scenarios.some((s) => s.name === n));
    if (unknown.length) throw new Error(`unknown scenario ${unknown.join(", ")}; known: ${scenarios.map((s) => s.name).join(", ")}`);

    const recorded = [];
    for (const s of scenarios.filter((s) => !wanted.length || wanted.includes(s.name))) {
      console.log(`recording ${s.name}`);
      recorded.push({ ...s, ...(await Promise.race([record(s.name), exited])) });
    }

    const previous = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : [];
    const index = scenarios
      .map((s) => recorded.find((r) => r.name === s.name) ?? previous.find((r) => r.name === s.name))
      .filter((entry) => entry && existsSync(join(RUNS, `${entry.name}.json`)));
    writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
    console.log(`  index.json  ${index.map((r) => r.name).join(", ")}`);
  } finally {
    if (arena.exitCode === null) process.kill(-arena.pid, "SIGTERM");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
