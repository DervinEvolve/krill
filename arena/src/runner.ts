import type { Connection } from "@solana/web3.js";
import { KrillClient } from "../../shared/client";
import { RPC_URL, WS_URL } from "../../shared/constants";
import { describeError, krillErrorName } from "../../shared/errors";
import type { ChainSnapshot, FeedEvent, Manifest } from "../../shared/feed";
import { escrowPda } from "../../shared/pdas";
import { PROGRAM_ID } from "../../shared/program";
import { readSnapshot } from "../../shared/snapshot";
import { castEntries, createCast } from "./cast";
import type { CastMember } from "./cast";
import type { FeedServer } from "./feed";
import { InvariantError } from "./scenarios/types";
import type { ArenaContext, RunRefs, Scenario, Step } from "./scenarios/types";
import type { Transcript } from "./transcript";

export interface RunOptions {
  connection: Connection;
  feed: FeedServer;
  transcript: Transcript;
  speedMs: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function emptyManifest(): Manifest {
  return { programId: PROGRAM_ID.toBase58(), cluster: RPC_URL, ws: WS_URL, dao: null, proposal: null, escrow: null, cast: [], scenario: null, running: false };
}

/**
 * Plays one scenario: sends each step, records it (terminal + feed, with the
 * chain snapshot after it), paces the run, and checks the scenario's
 * invariants. Resolves to false if any invariant broke.
 */
export async function runScenario(scenario: Scenario, opts: RunOptions): Promise<boolean> {
  const { feed, transcript } = opts;
  const client = new KrillClient(opts.connection);
  const cast = createCast();
  const roster: CastMember[] = [...cast.all];
  const refs: RunRefs = { dao: null, proposal: null };
  const signatures = new Map<string, string[]>();
  const baseline = new Map<string, bigint>();
  const startedAt = Date.now();
  let refusals = 0;

  const manifestPatch = (): Partial<Manifest> => ({
    dao: refs.dao?.toBase58() ?? null,
    proposal: refs.proposal?.toBase58() ?? null,
    escrow: refs.proposal ? escrowPda(refs.proposal).toBase58() : null,
    cast: castEntries(roster),
  });
  const snapshot = (): Promise<ChainSnapshot> =>
    readSnapshot(opts.connection, {
      dao: refs.dao?.toBase58() ?? null,
      proposal: refs.proposal?.toBase58() ?? null,
      wallets: roster.map((m) => m.keypair.publicKey.toBase58()),
    });
  const emit = (event: FeedEvent): void => {
    transcript.event(event, startedAt);
    feed.push(event);
  };

  const ctx: ArenaContext = {
    client,
    cast,
    refs,
    speedMs: opts.speedMs,
    enlist: (members) => {
      roster.push(...members);
      feed.updateManifest(manifestPatch());
    },
    note: (actor, action) => emit({ t: Date.now(), kind: "note", actor, action, ok: true }),
    signaturesOf: (actor) => signatures.get(actor) ?? [],
  };

  feed.beginRun({ ...emptyManifest(), ...manifestPatch(), scenario: scenario.name, running: true });
  emit({ t: startedAt, kind: "start", actor: "arena", action: `starts ${scenario.name}`, detail: scenario.description, ok: true });

  let ok = true;
  try {
    for await (const step of scenario.steps(ctx)) {
      const event = await play(step);
      refusals += step.expect ? 1 : 0;
      const snap = await snapshot();
      for (const [key, lamports] of Object.entries(snap.balances)) if (!baseline.has(key) && lamports > 0n) baseline.set(key, lamports);
      feed.updateManifest(manifestPatch());
      emit({ ...event, snapshot: snap });
      await sleep(step.pauseMs ?? opts.speedMs);
    }
  } catch (err) {
    ok = false;
    transcript.failure(err instanceof InvariantError ? "invariant failed" : "run failed", err instanceof InvariantError ? err.message : describeError(err));
    emit({ t: Date.now(), kind: "note", actor: "arena", action: "run failed", detail: describeError(err), ok: false });
  }

  const final = await snapshot();
  transcript.summary(scenario.name, final, roster, baseline, ok ? `all invariants held${refusals ? `, ${refusals} refusal${refusals > 1 ? "s" : ""} as expected` : ""}` : "FAILED");
  emit({ t: Date.now(), kind: "end", actor: "arena", action: ok ? `finished ${scenario.name}` : `stopped ${scenario.name}`, ok, snapshot: final });
  feed.updateManifest({ running: false });
  return ok;

  async function play(step: Step): Promise<FeedEvent> {
    const base = { t: 0, kind: "step" as const, actor: step.actor, action: step.action, ...(step.detail ? { detail: step.detail } : {}), ...(step.reasoning ? { reasoning: step.reasoning } : {}) };
    try {
      const signature = await step.run();
      if (step.expect) throw new InvariantError(`${step.actor} ${step.action} should have been refused with ${step.expect}`);
      if (signature) signatures.set(step.actor, [...(signatures.get(step.actor) ?? []), signature]);
      return { ...base, t: Date.now(), ok: true, ...(signature ? { signature } : {}) };
    } catch (err) {
      if (err instanceof InvariantError || !step.expect) throw err;
      const name = krillErrorName(err);
      if (name !== step.expect) throw new InvariantError(`${step.actor} ${step.action} failed with ${name ?? describeError(err)}, expected ${step.expect}`);
      return { ...base, t: Date.now(), ok: false, expected: true, detail: `${name} (${step.detail ?? "as expected"})` };
    }
  }
}
