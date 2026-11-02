import type { PublicKey } from "@solana/web3.js";
import type { Cast, CastMember } from "../cast";
import type { KrillClient } from "../client";

/**
 * One narrated on-chain action. `run` sends it and returns the signature (null
 * for steps that are not a single transaction, like airdrops or the clock).
 * `expect` names the program error the step is meant to provoke; the runner
 * then treats that refusal as success and anything else as a failed invariant.
 */
export interface Step {
  actor: string;
  action: string;
  detail?: string;
  reasoning?: string;
  expect?: string;
  /** Pause after this step in ms, overriding `--speed` (votes shorten it to fit the voting window). */
  pauseMs?: number;
  run: () => Promise<string | null>;
}

/** Addresses the run has created so far. */
export interface RunRefs {
  dao: PublicKey | null;
  proposal: PublicKey | null;
}

export interface ArenaContext {
  client: KrillClient;
  cast: Cast;
  refs: RunRefs;
  speedMs: number;
  /** Adds wallets that appear mid-run (the sybils) so the desk and the summary track them. */
  enlist(members: readonly CastMember[]): void;
  note(actor: string, text: string): void;
  /** Signatures of landed transactions paid for by `actor`. */
  signaturesOf(actor: string): readonly string[];
}

export interface Scenario {
  name: string;
  description: string;
  steps(ctx: ArenaContext): AsyncIterable<Step>;
}

/** A broken expectation; the runner prints it and exits non-zero. */
export class InvariantError extends Error {
  override name = "InvariantError";
}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}
