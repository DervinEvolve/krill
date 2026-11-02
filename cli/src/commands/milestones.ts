import { PublicKey } from "@solana/web3.js";
import type { ProposalRef } from "../../../shared/client";
import { loadProposal, sol } from "../chain";
import type { Context } from "../context";
import { parseInteger, parseMilestone } from "../units";
import type { Command } from "./command";

/** `milestone submit|approve|reject <index> <milestone>`: milestones are numbered from 0, as on chain. */

interface Target {
  index: bigint;
  milestone: number;
  ref: ProposalRef;
}

async function target(ctx: Context): Promise<Target> {
  const index = parseInteger(ctx.arg(0), "proposal index");
  const milestone = parseMilestone(ctx.arg(1));
  const { ref } = await loadProposal(ctx, index);
  return { index, milestone, ref };
}

const ARGS = ["<index>", "<milestone>"] as const;

export const submitMilestone: Command = {
  path: ["milestone", "submit"],
  args: ARGS,
  summary: "contractor: hand in a milestone for review",
  async run(ctx) {
    const { index, milestone, ref } = await target(ctx);
    const signature = await ctx.client.submitMilestone(ctx.wallet(), ref.proposal, milestone);
    const escrow = await ctx.client.fetchEscrow(ref.proposal);
    return {
      signature,
      line: `milestone ${milestone} of #${index} Submitted · ${sol(escrow.milestones[milestone]?.amount ?? 0n)} awaits the council`,
      data: { escrow },
    };
  },
};

export const approveMilestone: Command = {
  path: ["milestone", "approve"],
  args: ARGS,
  summary: "council: release a submitted milestone to the contractor",
  async run(ctx) {
    const { index, milestone, ref } = await target(ctx);
    const before = await ctx.client.fetchEscrow(ref.proposal);
    const signature = await ctx.client.approveMilestone(ctx.wallet(), ref, new PublicKey(before.contractor), milestone);
    const escrow = await ctx.client.fetchEscrow(ref.proposal);
    return {
      signature,
      line: `milestone ${milestone} of #${index} Released · ${sol(escrow.milestones[milestone]?.amount ?? 0n)} to ${escrow.contractor} · escrow ${escrow.state}`,
      data: { escrow },
    };
  },
};

export const rejectMilestone: Command = {
  path: ["milestone", "reject"],
  args: ARGS,
  summary: "council: send a submitted milestone back for rework",
  async run(ctx) {
    const { index, milestone, ref } = await target(ctx);
    const signature = await ctx.client.rejectMilestone(ctx.wallet(), ref, milestone);
    const escrow = await ctx.client.fetchEscrow(ref.proposal);
    return {
      signature,
      line: `milestone ${milestone} of #${index} back to Pending · nothing moved`,
      data: { escrow },
    };
  },
};
