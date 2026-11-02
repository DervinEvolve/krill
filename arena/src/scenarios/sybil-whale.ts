import { LAMPORTS_PER_CREDIT, LAMPORTS_PER_SOL } from "../../../shared/constants";
import { formatSol, formatVotes, votesFor } from "../../../shared/math";
import { brainKind } from "../brains";
import { createSybils } from "../cast";
import { SYBIL_WALLETS, WHALE_DEPOSIT } from "../constants";
import { closeVoting, join, openDao, propose, vote } from "./phases";
import { check } from "./types";
import type { Scenario } from "./types";

/** Each wallet deposits an eleventh of 100 SOL, rounded down to whole credits. */
const SYBIL_DEPOSIT = (WHALE_DEPOSIT / BigInt(SYBIL_WALLETS) / LAMPORTS_PER_CREDIT) * LAMPORTS_PER_CREDIT;
/** Rent for the member and receipt accounts plus fees. */
const SYBIL_GAS = LAMPORTS_PER_SOL / 100n;

const SYBIL_CAVEAT =
  "Quadratic voting needs one identity per voter. Pair it with identity or stake-lock mechanisms in production.";

export const sybilWhale: Scenario = {
  name: "sybil-whale",
  description: "The whale splits 100 SOL across 11 fresh wallets and wins: the known limit of quadratic voting.",
  async *steps(ctx) {
    const { cast, client } = ctx;
    yield* openDao(ctx, cast.krill);
    const sybils = createSybils(SYBIL_WALLETS, SYBIL_DEPOSIT);
    ctx.enlist(sybils);
    for (const s of sybils) {
      yield {
        actor: cast.whale.name,
        action: `funds ${s.name}`,
        detail: `${formatSol(SYBIL_DEPOSIT + SYBIL_GAS, 2)} SOL to a fresh wallet`,
        pauseMs: Math.min(ctx.speedMs, 250),
        run: () => client.transfer(cast.whale.keypair, s.keypair.publicKey, SYBIL_DEPOSIT + SYBIL_GAS),
      };
    }
    yield* join(ctx, sybils);
    yield* propose(ctx);
    yield* vote(ctx, [...cast.krill, ...sybils]);
    const proposal = yield* closeVoting(ctx, cast.krill[1] ?? cast.proposer, "Rejected");
    if (brainKind() === "scripted") {
      const expected = votesFor(SYBIL_DEPOSIT / LAMPORTS_PER_CREDIT) * BigInt(SYBIL_WALLETS);
      check(proposal.againstVotes === expected, `against = ${formatVotes(proposal.againstVotes)}, expected ${formatVotes(expected)}`);
    }
    ctx.note("arena", SYBIL_CAVEAT);
  },
};
