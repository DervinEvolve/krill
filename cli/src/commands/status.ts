import { formatCount, formatVotes } from "../../../shared/math";
import { escrowPda, memberPda, proposalPda } from "../../../shared/pdas";
import { decodeEscrow, decodeMember, decodeProposal } from "../../../shared/views";
import type { ProposalView } from "../../../shared/views";
import { chainTime, count, countdown, loadProposal, readOptional, sol } from "../chain";
import type { Context } from "../context";
import type { Report } from "../output";
import { parseInteger } from "../units";
import type { Command } from "./command";

/** How many of the latest proposals `krill status` lists. */
const RECENT_PROPOSALS = 10n;

async function daoStatus(ctx: Context): Promise<Report> {
  const address = ctx.dao();
  const dao = await ctx.client.fetchDao(address);
  const first = dao.proposalCount > RECENT_PROPOSALS ? dao.proposalCount - RECENT_PROPOSALS : 0n;
  const indexes = Array.from({ length: Number(dao.proposalCount - first) }, (_, i) => first + BigInt(i));
  const addresses = indexes.map((i) => proposalPda(address, i));
  const infos = addresses.length ? await ctx.connection.getMultipleAccountsInfo(addresses, "confirmed") : [];
  const proposals = infos.flatMap((info, i) => {
    const key = addresses[i];
    return info && key ? [decodeProposal(key.toBase58(), info.data)] : [];
  });
  return {
    line: `DAO "${dao.name}" · ${sol(dao.pooledLamports)} pooled · ${count(dao.memberCount, "member")} · ${count(dao.totalCredits, "credit")}`,
    rows: [
      ["treasury", `${sol(dao.pooledLamports)} pooled`],
      ["members", formatCount(dao.memberCount)],
      ["credits", `${formatCount(dao.totalCredits)} minted`],
      ...proposals.map((p): [string, string] => [`#${p.index}`, `${p.state} · "${p.title}" · ${sol(p.amount)}`]),
    ],
    data: { dao, proposals },
  };
}

function milestoneList(proposal: ProposalView, statuses: readonly string[] | null): string {
  return proposal.milestones.map((amount, i) => `${i}: ${sol(amount)}${statuses ? ` ${statuses[i] ?? ""}` : ""}`).join(" · ");
}

async function proposalStatus(ctx: Context, index: bigint): Promise<Report> {
  const { ref, proposal } = await loadProposal(ctx, index);
  const [escrow, now] = await Promise.all([readOptional(ctx.connection, escrowPda(ref.proposal), decodeEscrow), chainTime(ctx.connection)]);
  const secondsLeft = proposal.votingEndsAt - now;
  const quorumMet = proposal.creditsSpent >= proposal.quorumCredits;
  const voting = proposal.state === "Voting";
  return {
    line: `proposal #${index} "${proposal.title}" · ${proposal.state}${voting ? ` · voting ${countdown(secondsLeft)}` : ""}`,
    rows: [
      ["for", formatVotes(proposal.forVotes)],
      ["against", formatVotes(proposal.againstVotes)],
      ["quorum", `${formatCount(proposal.creditsSpent)} of ${formatCount(proposal.quorumCredits)} credits spent (${quorumMet ? "met" : "not met"})`],
      ["deadline", `${countdown(secondsLeft)} · ${new Date(Number(proposal.votingEndsAt) * 1000).toISOString()}`],
      ["amount", `${sol(proposal.amount)} to ${proposal.contractor}`],
      ["milestones", milestoneList(proposal, escrow ? escrow.milestones.map((m) => m.status) : null)],
      ["escrow", escrow ? `${escrow.state} · ${sol(escrow.releasedLamports)} released of ${sol(proposal.amount)}` : "not funded"],
    ],
    data: { proposal, escrow, chainTime: now, secondsLeft },
  };
}

export const status: Command = {
  path: ["status"],
  args: ["[index]"],
  summary: "the DAO and its proposals, or one proposal in full",
  run(ctx) {
    const index = ctx.arg(0);
    return index === undefined ? daoStatus(ctx) : proposalStatus(ctx, parseInteger(index, "proposal index"));
  },
};

export const whoami: Command = {
  path: ["whoami"],
  args: [],
  summary: "your wallet, its balance, and your membership in the DAO",
  async run(ctx) {
    const wallet = ctx.wallet().publicKey;
    const dao = ctx.daoIfSet();
    const [balance, member] = await Promise.all([
      ctx.connection.getBalance(wallet, "confirmed").then(BigInt),
      dao ? readOptional(ctx.connection, memberPda(dao, wallet), decodeMember) : Promise.resolve(null),
    ]);
    const membership = !dao ? "no DAO selected (--dao or KRILL_DAO)" : member ? `${formatCount(member.credits)} credits unspent · ${sol(member.deposited)} deposited` : "not a member";
    return {
      line: `${wallet.toBase58()} · ${sol(balance)}`,
      rows: [
        ["cluster", ctx.url],
        ["dao", dao?.toBase58() ?? "-"],
        ["member", membership],
      ],
      data: { wallet: wallet.toBase58(), balance, cluster: ctx.url, dao: dao?.toBase58() ?? null, member },
    };
  },
};
