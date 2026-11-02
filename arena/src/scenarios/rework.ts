import { checkBuilderPaid, deliver, refusedSubmit } from "./phases";
import { check } from "./types";
import type { Scenario } from "./types";
import { DELIVERIES, passAndEscrow } from "./whale-vs-krill";

export const rework: Scenario = {
  name: "rework",
  description: "A rushed milestone is sent back, an out-of-order submit is refused, then the work finishes in order.",
  async *steps(ctx) {
    const builderStart = yield* passAndEscrow(ctx);
    const [m1, m2, m3] = DELIVERIES;
    const released = yield* deliver(ctx, 0, `${m1} [rushed]`);
    check(!released, "a [rushed] delivery must be rejected");
    yield* deliver(ctx, 0, `${m1}, fixed after review`);
    yield refusedSubmit(ctx, 2, "MilestoneOutOfOrder", "skips ahead before M2 is released");
    yield* deliver(ctx, 1, m2);
    yield* deliver(ctx, 2, m3);
    const ref = ctx.refs.proposal;
    check(ref !== null, "no proposal");
    const proposal = await ctx.client.fetchProposal(ref);
    check(proposal.state === "Completed", `proposal is ${proposal.state}, expected Completed`);
    await checkBuilderPaid(ctx, builderStart, proposal.amount);
  },
};
