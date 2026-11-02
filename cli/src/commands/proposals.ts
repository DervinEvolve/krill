import { formatCount, formatVotes } from "../../../shared/math";
import { proposalPda } from "../../../shared/pdas";
import type { ProposalView } from "../../../shared/views";
import { UsageError } from "../args";
import { chainTime, count, countdown, loadProposal, sol } from "../chain";
import type { Context } from "../context";
import { parseInteger, parsePubkey, parseSolList } from "../units";
import type { Command } from "./command";

const proposalIndex = (ctx: Context): bigint => parseInteger(ctx.arg(0), "proposal index");

const tallies = (p: ProposalView): string => `for ${formatVotes(p.forVotes)} · against ${formatVotes(p.againstVotes)}`;

export const propose: Command = {
  path: ["propose"],
  args: [],
  usage: "--title <s> --contractor <pubkey> --milestones <sol,sol,...>",
  accepts: ["title", "contractor", "milestones"],
  summary: "ask the treasury to pay a contractor in milestones",
  async run(ctx) {
    const title = ctx.options.required("title");
    const contractor = parsePubkey(ctx.options.required("contractor"), "--contractor");
    const milestones = parseSolList(ctx.options.required("milestones"), "milestone");
    const dao = ctx.dao();
    const { proposalCount: index } = await ctx.client.fetchDao(dao);
    const signature = await ctx.client.createProposal(ctx.wallet(), dao, index, title, contractor, milestones);
    const [proposal, now] = await Promise.all([ctx.client.fetchProposal(proposalPda(dao, index)), chainTime(ctx.connection)]);
    return {
      signature,
      line: `proposal #${index} "${title}" · ${sol(proposal.amount)} in ${count(milestones.length, "milestone")} · voting ${countdown(proposal.votingEndsAt - now)}`,
      data: { proposal },
    };
  },
};

export const vote: Command = {
  path: ["vote"],
  args: ["<proposal-index>", "<credits>"],
  usage: "--for | --against",
  accepts: ["for", "against"],
  summary: "spend credits; your votes are √ of your credits on it",
  async run(ctx) {
    const index = proposalIndex(ctx);
    const credits = parseInteger(ctx.arg(1), "credits", 1n);
    const [inFavour, against] = [ctx.options.flag("for"), ctx.options.flag("against")];
    if (inFavour === against) throw new UsageError("pass exactly one of --for or --against");
    const { ref } = await loadProposal(ctx, index);
    const voter = ctx.wallet();
    const signature = await ctx.client.castVote(voter, ref, credits, inFavour);
    const [receipt, proposal] = await Promise.all([ctx.client.fetchReceipt(ref.proposal, voter.publicKey), ctx.client.fetchProposal(ref.proposal)]);
    return {
      signature,
      line: `voted ${inFavour ? "FOR" : "AGAINST"} #${index} with ${formatCount(credits)} credits · you hold √${formatCount(receipt.credits)} = ${formatVotes(receipt.votes)} votes · ${tallies(proposal)}`,
      data: { receipt, proposal },
    };
  },
};

export const finalize: Command = {
  path: ["finalize"],
  args: ["<index>"],
  summary: "close the vote after its deadline: Passed or Rejected",
  async run(ctx) {
    const index = proposalIndex(ctx);
    const { ref } = await loadProposal(ctx, index);
    const signature = await ctx.client.finalize(ctx.wallet(), ref.proposal);
    const proposal = await ctx.client.fetchProposal(ref.proposal);
    return {
      signature,
      line: `proposal #${index} ${proposal.state} · ${tallies(proposal)} · ${formatCount(proposal.creditsSpent)} of ${formatCount(proposal.quorumCredits)} quorum credits`,
      data: { proposal },
    };
  },
};

export const execute: Command = {
  path: ["execute"],
  args: ["<index>"],
  summary: "move a passed proposal's SOL into its escrow",
  async run(ctx) {
    const index = proposalIndex(ctx);
    const { ref } = await loadProposal(ctx, index);
    const signature = await ctx.client.execute(ctx.wallet(), ref);
    const escrow = await ctx.client.fetchEscrow(ref.proposal);
    const locked = escrow.milestones.reduce((sum, m) => sum + m.amount, 0n);
    return {
      signature,
      line: `proposal #${index} Escrowed · ${sol(locked)} locked in ${count(escrow.milestones.length, "milestone")} for ${escrow.contractor}`,
      data: { escrow },
    };
  },
};

export const cancel: Command = {
  path: ["cancel"],
  args: ["<index>"],
  summary: "council: stop an escrow, unreleased SOL back to the treasury",
  async run(ctx) {
    const index = proposalIndex(ctx);
    const { ref } = await loadProposal(ctx, index);
    const signature = await ctx.client.cancelEscrow(ctx.wallet(), ref);
    const escrow = await ctx.client.fetchEscrow(ref.proposal);
    const returned = escrow.milestones.reduce((sum, m) => sum + m.amount, 0n) - escrow.releasedLamports;
    return {
      signature,
      line: `proposal #${index} Cancelled · ${sol(returned)} back to the treasury · ${sol(escrow.releasedLamports)} had been released`,
      data: { escrow, returned },
    };
  },
};
