import { formatVotes } from "../../../shared/math";
import { brainKind } from "../brains";
import { checkBuilderPaid, closeVoting, deliver, fundEscrow, openDao, propose, proposalRef, vote } from "./phases";
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

/**
 * The votes on the cast's own receipts. A person voting alongside the agents
 * (`krill vote`, see "Play along" in the README) adds to the proposal's
 * tallies but not to these, so the README's numbers still hold.
 */
async function castTally(ctx: ArenaContext): Promise<{ forVotes: bigint; againstVotes: bigint }> {
  const { proposal } = proposalRef(ctx);
  const receipts = await Promise.all(ctx.cast.members.map((m) => ctx.client.fetchReceipt(proposal, m.keypair.publicKey)));
  const sum = (support: boolean): bigint => receipts.filter((r) => r.support === support).reduce((total, r) => total + r.votes, 0n);
  return { forVotes: sum(true), againstVotes: sum(false) };
}

/** Opening shared by the first three scenarios: everyone joins, krill vote, the whale votes last, the vote passes, escrow is funded. */
export async function* passAndEscrow(ctx: ArenaContext): AsyncGenerator<Step, bigint> {
  const { cast, client } = ctx;
  yield* openDao(ctx);
  yield* propose(ctx);
  yield* vote(ctx, [...cast.krill, cast.whale]);
  yield* closeVoting(ctx, cast.krill[1] ?? cast.proposer, "Passed");
  if (brainKind() === "scripted") {
    const tally = await castTally(ctx);
    check(tally.forVotes === README_FOR, `the cast's for = ${formatVotes(tally.forVotes)}, expected ${formatVotes(README_FOR)}`);
    check(tally.againstVotes === README_AGAINST, `the cast's against = ${formatVotes(tally.againstVotes)}, expected ${formatVotes(README_AGAINST)}`);
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
