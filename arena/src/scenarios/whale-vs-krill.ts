import { formatVotes } from "../../../shared/math";
import { brainKind } from "../brains";
import { checkBuilderPaid, closeVoting, deliver, fundEscrow, openDao, propose, vote } from "./phases";
import { check } from "./types";
import type { ArenaContext, Scenario, Step } from "./types";

/** The README's headline numbers: 11 × √1,000 for, √100,000 against. */
const README_FOR = 347_850_542_611n;
const README_AGAINST = 316_227_766_016n;

export const DELIVERIES = [
  "M1: wallet connect and login screens",
  "M2: proposal list and voting flow",
  "M3: store release and crash reporting",
] as const;

/** Opening shared by the first three scenarios: everyone joins, krill vote, the whale votes last, the vote passes, escrow is funded. */
export async function* passAndEscrow(ctx: ArenaContext): AsyncGenerator<Step, bigint> {
  const { cast, client } = ctx;
  yield* openDao(ctx);
  yield* propose(ctx);
  yield* vote(ctx, [...cast.krill, cast.whale]);
  const proposal = yield* closeVoting(ctx, cast.krill[1] ?? cast.proposer, "Passed");
  if (brainKind() === "scripted") {
    check(proposal.forVotes === README_FOR, `for = ${formatVotes(proposal.forVotes)}, expected ${formatVotes(README_FOR)}`);
    check(proposal.againstVotes === README_AGAINST, `against = ${formatVotes(proposal.againstVotes)}, expected ${formatVotes(README_AGAINST)}`);
  }
  const builderStart = BigInt(await client.connection.getBalance(cast.builder.keypair.publicKey, "confirmed"));
  yield* fundEscrow(ctx, cast.krill[2] ?? cast.proposer);
  return builderStart;
}

export const whaleVsKrill: Scenario = {
  name: "whale-vs-krill",
  description: "Eleven krill outvote one whale holding 9x their money; the builder is paid in three milestones.",
  async *steps(ctx) {
    const builderStart = yield* passAndEscrow(ctx);
    for (const [i, note] of DELIVERIES.entries()) yield* deliver(ctx, i, note);
    const ref = ctx.refs.proposal;
    check(ref !== null, "no proposal");
    const [proposal, escrow] = await Promise.all([ctx.client.fetchProposal(ref), ctx.client.fetchEscrow(ref)]);
    check(proposal.state === "Completed" && escrow.state === "Completed", "escrow and proposal should both be Completed");
    await checkBuilderPaid(ctx, builderStart, proposal.amount);
  },
};
