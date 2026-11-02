/**
 * End-to-end tests for the `krill` CLI against real local validators. Needs
 * the Agave CLI (solana-test-validator) and the SBPF v0 program copy the arena
 * builds into arena/.program (`npm run arena` once).
 *
 *   npm test -w cli
 *
 * 1. smoke: a fresh validator on ports of its own (RPC 18899) and the whole lifecycle
 *    through the CLI alone, checked through `status --json`.
 * 2. play along: the arena's whale-vs-krill run, with a person joining and
 *    voting from the CLI while the agents vote.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIN = join(ROOT, "cli", "bin", "krill.mjs");
const PROGRAM_SO = join(ROOT, "arena", ".program", "krill.so");
const PROGRAM_ID = new PublicKey(JSON.parse(readFileSync(join(ROOT, "idl", "krill.json"), "utf8")).address);
const FEED = "http://127.0.0.1:8787";
const ARENA_RPC = "http://127.0.0.1:8899";
const ENV = { ...process.env, PATH: `${join(homedir(), ".local", "share", "solana", "install", "bin")}${delimiter}${process.env.PATH ?? ""}` };
delete ENV.KRILL_DAO;

/** The arena's headline tallies (README) and what one more 1 SOL voter adds. */
const ARENA_FOR = 347_850_542_611n;
const ARENA_AGAINST = 316_227_766_016n;
const ONE_KRILL = 31_622_776_601n;

const sol = (n) => BigInt(Math.round(n * 1000)) * BigInt(LAMPORTS_PER_SOL / 1000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns a value other than undefined/false. */
async function until(what, check, timeoutMs, everyMs = 300) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined && value !== false) return value;
    if (Date.now() > end) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(everyMs);
  }
}

/** Runs the CLI; resolves with its exit code and output, never rejects. */
function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: ROOT, env: { ...ENV, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** A CLI bound to one cluster, DAO and keypair; `ok` expects success, `refused` a named program error. */
function cli(url, getDao) {
  const argsFor = (args, keypair) => [...args, "--url", url, "--json", ...(keypair ? ["--keypair", keypair] : []), ...(getDao() ? ["--dao", getDao()] : [])];
  return {
    async ok(args, keypair) {
      const r = await run(argsFor(args, keypair));
      assert.equal(r.code, 0, `krill ${args.join(" ")} failed: ${r.stderr}`);
      return JSON.parse(r.stdout);
    },
    async refused(args, keypair, name) {
      const r = await run(argsFor(args, keypair));
      assert.equal(r.code, 1, `krill ${args.join(" ")} should fail, exited ${r.code}: ${r.stdout}${r.stderr}`);
      const { error } = JSON.parse(r.stderr);
      assert.equal(error.name, name, r.stderr);
      return error;
    },
    text: (args, keypair) => run(argsFor(args, keypair).filter((a) => a !== "--json")),
  };
}

/** A funded keypair written as a Solana CLI keypair file. */
async function wallet(connection, dir, name, lamports) {
  const keypair = Keypair.generate();
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify([...keypair.secretKey]));
  if (lamports > 0n) {
    const signature = await connection.requestAirdrop(keypair.publicKey, Number(lamports));
    await connection.confirmTransaction({ signature, ...(await connection.getLatestBlockhash("confirmed")) }, "confirmed");
  }
  return { path, pubkey: keypair.publicKey.toBase58() };
}

/** Starts a process in its own group and keeps its output for error messages. */
function startProcess(command, args) {
  const child = spawn(command, args, { cwd: ROOT, env: ENV, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const proc = { child, output: "", exited: new Promise((resolve) => child.once("exit", resolve)) };
  child.stdout.on("data", (d) => (proc.output += d));
  child.stderr.on("data", (d) => (proc.output += d));
  return proc;
}

async function stopProcess(proc) {
  if (!proc || proc.child.exitCode !== null) return;
  process.kill(-proc.child.pid, "SIGTERM");
  await proc.exited;
}

/** Resolves once the program is executable on `connection`, failing early if the process dies. */
async function programReady(connection, proc, timeoutMs) {
  let dead = false;
  proc.exited.then(() => (dead = true));
  await until(
    "the Krill program on the validator",
    async () => {
      if (dead) throw new Error(`process exited:\n${proc.output}`);
      const info = await connection.getAccountInfo(PROGRAM_ID, "confirmed").catch(() => null);
      return info?.executable === true;
    },
    timeoutMs,
    500,
  );
}

async function feed(path, init) {
  try {
    const res = await fetch(`${FEED}${path}`, init);
    return { status: res.status, body: await res.json() };
  } catch {
    return null;
  }
}

/** Lamports paid in fees by the transactions behind `signatures`. */
async function fees(connection, signatures) {
  const txs = await Promise.all(signatures.map((s) => connection.getTransaction(s, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })));
  return txs.reduce((sum, tx) => sum + BigInt(tx?.meta?.fee ?? 0), 0n);
}

before(() => {
  assert.ok(existsSync(PROGRAM_SO), `${PROGRAM_SO} is missing: run \`npm run arena\` once to build the validator's copy of the program`);
});

describe("smoke: the whole lifecycle through the CLI", { timeout: 240_000 }, () => {
  const url = "http://127.0.0.1:18899";
  const connection = new Connection(url, "confirmed");
  const dir = mkdtempSync(join(tmpdir(), "krill-cli-smoke-"));
  let validator;
  let dao = null;
  const krill = cli(url, () => dao);

  before(async () => {
    // The arena's flags, on ports of its own so it never collides with an arena or another local validator.
    validator = startProcess("solana-test-validator", [
      "--reset", "--quiet", "--bind-address", "127.0.0.1", "--ledger", join(dir, "ledger"),
      "--rpc-port", "18899", "--faucet-port", "19900", "--gossip-port", "28000", "--dynamic-port-range", "28001-28100",
      "--bpf-program", PROGRAM_ID.toBase58(), PROGRAM_SO,
    ]);
    await programReady(connection, validator, 90_000);
  });

  after(async () => {
    await stopProcess(validator);
    rmSync(dir, { recursive: true, force: true });
  });

  test("create, join, vote, finalize, execute and pay out two milestones", async () => {
    const [alice, bob, council, builder] = await Promise.all([
      wallet(connection, dir, "alice", sol(20)),
      wallet(connection, dir, "bob", sol(5)),
      wallet(connection, dir, "council", sol(1)),
      wallet(connection, dir, "builder", sol(1)),
    ]);

    const created = await krill.ok(["dao", "init", "--name", "smoke", "--council", council.pubkey, "--voting-period", "6", "--quorum-bps", "500"], alice.path);
    dao = created.dao;
    assert.match(created.signature, /^\w{80,90}$/);

    await krill.ok(["join", "10"], alice.path);
    await krill.ok(["join", "2"], bob.path);
    const deposited = await krill.ok(["deposit", "1"], bob.path);
    assert.equal(deposited.member.credits, "3000");
    const pool = await krill.ok(["status"]);
    assert.equal(pool.dao.pooledLamports, String(sol(13)));
    assert.equal(pool.dao.memberCount, "2");
    assert.equal(pool.dao.totalCredits, "13000");

    const proposed = await krill.ok(["propose", "--title", "Smoke test", "--contractor", builder.pubkey, "--milestones", "1,0.5"], alice.path);
    assert.equal(proposed.proposal.index, "0");
    assert.equal(proposed.proposal.amount, String(sol(1.5)));

    // Everything inside the 6 s window runs as one concurrent round.
    const [, , early] = await Promise.all([
      krill.ok(["vote", "0", "900", "--for"], alice.path),
      krill.ok(["vote", "0", "100", "--against"], bob.path),
      krill.refused(["finalize", "0"], bob.path, "VotingStillOpen"),
    ]);
    assert.equal(early.message, "Voting is still open; wait until the voting period ends");

    const open = await krill.ok(["status", "0"]);
    assert.equal(open.proposal.state, "Voting");
    assert.equal(open.proposal.forVotes, "30000000000", "√900 = 30.000000000 votes");
    assert.equal(open.proposal.againstVotes, "10000000000", "√100 = 10.000000000 votes");
    assert.equal(open.proposal.creditsSpent, "1000");
    assert.equal(open.proposal.quorumCredits, "650");

    await until("the voting window to close by the chain's clock", async () => BigInt((await krill.ok(["status", "0"])).secondsLeft) <= 0n, 30_000, 500);
    await krill.refused(["vote", "0", "1", "--for"], alice.path, "VotingClosed");
    const finalized = await until(
      "finalize to land",
      async () => {
        const r = await run(["finalize", "0", "--url", url, "--dao", dao, "--keypair", bob.path, "--json"]);
        if (r.code === 0) return JSON.parse(r.stdout);
        assert.equal(JSON.parse(r.stderr).error.name, "VotingStillOpen", r.stderr);
        return undefined;
      },
      15_000,
      500,
    );
    assert.equal(finalized.proposal.state, "Passed");

    const executed = await krill.ok(["execute", "0"], bob.path);
    assert.equal(executed.escrow.state, "Active");
    assert.equal((await krill.ok(["status"])).dao.pooledLamports, String(sol(11.5)));

    const builderStart = BigInt(await connection.getBalance(new PublicKey(builder.pubkey), "confirmed"));
    const builderSigs = [];
    const submit = async (m) => builderSigs.push((await krill.ok(["milestone", "submit", "0", m], builder.path)).signature);
    await krill.refused(["milestone", "submit", "0", "1"], builder.path, "MilestoneOutOfOrder");
    await submit("0");
    await krill.ok(["milestone", "approve", "0", "0"], council.path);
    await submit("1");
    const rejected = await krill.ok(["milestone", "reject", "0", "1"], council.path);
    assert.equal(rejected.escrow.milestones[1].status, "Pending");
    await submit("1");
    const approved = await krill.ok(["milestone", "approve", "0", "1"], council.path);
    assert.equal(approved.escrow.state, "Completed");

    const done = await krill.ok(["status", "0"]);
    assert.equal(done.proposal.state, "Completed");
    assert.equal(done.escrow.releasedLamports, String(sol(1.5)));
    assert.deepEqual(done.escrow.milestones.map((m) => m.status), ["Released", "Released"]);
    const builderNow = BigInt(await connection.getBalance(new PublicKey(builder.pubkey), "confirmed"));
    assert.equal(builderNow - builderStart, sol(1.5) - (await fees(connection, builderSigs)), "the builder gained exactly the milestones minus its own fees");

    const me = await krill.ok(["whoami"], alice.path);
    assert.equal(me.member.credits, "9100");
    assert.equal(me.member.deposited, String(sol(10)));

    const human = await krill.text(["status", "0"]);
    assert.equal(human.code, 0, human.stderr);
    assert.match(human.stdout, /^~< proposal #0 "Smoke test" · Completed$/m, "piped output uses the plain mark");
    assert.match(human.stdout, /for\s+30\.000000000$/m);
    const refusal = await krill.text(["vote", "0", "1", "--against"], alice.path);
    assert.equal(refusal.code, 1);
    assert.equal(refusal.stderr.trim(), "error: InvalidState (6007): This action is not allowed in the account's current state");
  });
});

describe("play along: a person votes with the agents", { timeout: 600_000 }, () => {
  const connection = new Connection(ARENA_RPC, "confirmed");
  const dir = mkdtempSync(join(tmpdir(), "krill-cli-play-"));
  let arena;
  let dao = null;
  const krill = cli(ARENA_RPC, () => dao);

  before(async () => {
    assert.equal(await feed("/manifest"), null, `something already answers at ${FEED}; stop the other arena first`);
    arena = startProcess("npm", ["run", "--silent", "arena", "--", "--serve"]);
    let dead = false;
    arena.exited.then(() => (dead = true));
    await until(
      "the arena's feed",
      async () => {
        if (dead) throw new Error(`the arena exited:\n${arena.output}`);
        return (await feed("/manifest")) !== null;
      },
      420_000,
      500,
    );
  });

  after(async () => {
    await stopProcess(arena);
    rmSync(dir, { recursive: true, force: true });
  });

  test("joins with 1 SOL and votes for with 1,000 credits during whale-vs-krill", async () => {
    const human = await wallet(connection, dir, "human", sol(2));
    const started = await feed("/run/whale-vs-krill", { method: "POST" });
    assert.equal(started?.status, 202, JSON.stringify(started));

    const manifest = await until("the arena's proposal", async () => {
      const m = (await feed("/manifest"))?.body;
      return m?.dao && m.proposal ? m : undefined;
    }, 120_000);
    dao = manifest.dao;
    const listed = (await krill.ok(["status"])).proposals.find((p) => p.address === manifest.proposal);
    assert.ok(listed, "the arena's proposal is listed by krill status");
    assert.equal(listed.state, "Voting");

    const joined = await krill.ok(["join", "1"], human.path);
    assert.equal(joined.member.credits, "1000");
    const voted = await krill.ok(["vote", listed.index, "1000", "--for"], human.path);
    assert.equal(voted.receipt.votes, String(ONE_KRILL));

    const final = await until("the arena to finalize", async () => {
      const s = await krill.ok(["status", listed.index]);
      return s.proposal.state === "Voting" ? undefined : s;
    }, 90_000, 1000);
    assert.equal(final.proposal.state, "Passed");
    assert.equal(final.proposal.forVotes, String(ARENA_FOR + ONE_KRILL), "for = 347.850542611 + 31.622776601");
    assert.equal(final.proposal.againstVotes, String(ARENA_AGAINST));
    const printed = await krill.text(["status", listed.index]);
    assert.match(printed.stdout, /^\s+for\s+379\.473319212$/m, "the text report prints the same tally to nine decimals");

    await until("the arena run to finish", async () => (await feed("/manifest"))?.body.running === false, 180_000, 1000);
    assert.match(arena.output, /checks\s+all invariants held/, `the arena's own checks failed:\n${arena.output}`);
  });
});
