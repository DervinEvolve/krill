import { formatSol } from "../../../shared/math";
import { checkBuilderPaid, deliver, proposalRef, refusedSubmit } from "./phases";
import { check } from "./types";
import type { Scenario } from "./types";
import { DELIVERIES, passAndEscrow } from "./whale-vs-krill";

export const cancel: Scenario = {
  name: "cancel",
  description: "After the first milestone the council cancels; the unpaid 20 SOL returns to the treasury.",
  async *steps(ctx) {
    const builderStart = yield* passAndEscrow(ctx);
    const [m1] = DELIVERIES;
    yield* deliver(ctx, 0, m1);
    const ref = proposalRef(ctx);
    const [daoBefore, escrowBefore] = await Promise.all([ctx.client.fetchDao(ref.dao), ctx.client.fetchEscrow(ref.proposal)]);
    const unpaid = escrowBefore.milestones.reduce((sum, m) => sum + (m.status === "Released" ? 0n : m.amount), 0n);
    yield {
      actor: ctx.cast.council.name,
      action: "cancels the escrow",
      detail: `${formatSol(unpaid, 0)} SOL back to the treasury`,
      reasoning: "The roadmap changed after M1; the remaining milestones are no longer wanted.",
      run: () => ctx.client.cancelEscrow(ctx.cast.council.keypair, ref),
    };
    const [daoAfter, escrow, proposal] = await Promise.all([ctx.client.fetchDao(ref.dao), ctx.client.fetchEscrow(ref.proposal), ctx.client.fetchProposal(ref.proposal)]);
    check(daoAfter.pooledLamports - daoBefore.pooledLamports === unpaid, "the treasury did not get the unpaid milestones back");
    check(escrow.state === "Cancelled" && proposal.state === "Cancelled", "escrow and proposal should both be Cancelled");
    yield refusedSubmit(ctx, 1, "InvalidState", "after the escrow was cancelled");
    await checkBuilderPaid(ctx, builderStart, escrow.releasedLamports);
  },
};
