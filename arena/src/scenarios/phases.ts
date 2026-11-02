import type { PublicKey } from "@solana/web3.js";
import { LAMPORTS_PER_CREDIT } from "../../../shared/constants";
import { formatCount, formatSol, formatVotes, votesFor } from "../../../shared/math";
import { daoPda, escrowPda, proposalPda } from "../../../shared/pdas";
import type { ProposalStateName, ProposalView } from "../../../shared/views";
import { brainFor } from "../brains";
import { reviewMilestone } from "../brains/scripted";
import type { Brain } from "../brains/types";
import type { CastMember } from "../cast";
import type { ProposalRef } from "../client";
import { DAO_NAME, MILESTONES, PROPOSAL_TITLE, QUORUM_BPS, VOTING_PERIOD_SECONDS } from "../constants";
import { krillErrorName } from "../errors";
import { check } from "./types";
import type { ArenaContext, Step } from "./types";

/** Building blocks the four scenarios share, in lifecycle order. */

type Phase<R = void> = AsyncGenerator<Step, R>;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const sol = (lamports: bigint, decimals = 0): string => `${formatSol(lamports, decimals)} SOL`;

export function proposalRef(ctx: ArenaContext): ProposalRef {
  const { dao, proposal } = ctx.refs;
  check(dao !== null && proposal !== null, "no proposal has been created yet");
  return { dao, proposal };
}

function daoKey(ctx: ArenaContext): PublicKey {
  check(ctx.refs.dao !== null, "the DAO has not been opened yet");
  return ctx.refs.dao;
}

async function airdrop(ctx: ArenaContext, member: CastMember): Promise<void> {
  const { connection } = ctx.client;
  const signature = await connection.requestAirdrop(member.keypair.publicKey, Number(member.funding));
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
}

function fundingSummary(members: readonly CastMember[]): string {
  const groups = new Map<string, { count: number; each: bigint }>();
  for (const m of members) {
    const key = m.role === "krill" ? "krill" : m.name;
    const g = groups.get(key) ?? { count: 0, each: m.funding };
    groups.set(key, { count: g.count + 1, each: m.funding });
  }
  return [...groups].map(([name, g]) => (g.count > 1 ? `${g.count} ${name} x ${formatSol(g.each, 1)}` : `${name} ${formatSol(g.each, 1)}`)).join(" · ") + " SOL";
}

/** Faucet airdrops, the DAO, and every member's deposit. */
export async function* openDao(ctx: ArenaContext, members: readonly CastMember[] = ctx.cast.members): Phase {
  const { cast, client } = ctx;
  const funded = cast.all.filter((m) => m.funding > 0n);
  yield {
    actor: "faucet",
    action: "airdrops the cast",
    detail: fundingSummary(funded),
    run: async () => {
      await Promise.all(funded.map((m) => airdrop(ctx, m)));
      return null;
    },
  };

  const dao = daoPda(cast.council.keypair.publicKey, DAO_NAME);
  yield {
    actor: "council",
    action: "opens the DAO",
    detail: `"${DAO_NAME}" · ${VOTING_PERIOD_SECONDS} s voting · ${QUORUM_BPS / 100}% quorum`,
    run: async () => {
      const sig = await client.initializeDao(cast.council.keypair, DAO_NAME, cast.council.keypair.publicKey, VOTING_PERIOD_SECONDS, QUORUM_BPS);
      ctx.refs.dao = dao;
      return sig;
    },
  };

  yield* join(ctx, members);
}

/** Each member joins with its deposit; the treasury and credit supply must add up exactly. */
export async function* join(ctx: ArenaContext, members: readonly CastMember[]): Phase {
  const dao = daoKey(ctx);
  const before = await ctx.client.fetchDao(dao);
  let deposited = 0n;
  for (const m of members) {
    const deposit = m.deposit;
    if (deposit === null) continue;
    deposited += deposit;
    yield {
      actor: m.name,
      action: "joins",
      detail: `deposits ${sol(deposit, 2)} → ${formatCount(deposit / LAMPORTS_PER_CREDIT)} credits`,
      run: () => ctx.client.join(m.keypair, dao, deposit),
    };
  }
  const after = await ctx.client.fetchDao(dao);
  check(after.pooledLamports - before.pooledLamports === deposited, `treasury grew by ${after.pooledLamports - before.pooledLamports}, expected ${deposited}`);
  check(after.totalCredits - before.totalCredits === deposited / LAMPORTS_PER_CREDIT, "credits minted do not match the deposits");
}

/** The proposer asks for 30 SOL in three 10 SOL milestones, paid to the builder. */
export async function* propose(ctx: ArenaContext): Phase {
  const dao = daoKey(ctx);
  const { proposer, builder } = ctx.cast;
  const { proposalCount } = await ctx.client.fetchDao(dao);
  const proposal = proposalPda(dao, proposalCount);
  const amount = MILESTONES.reduce((a, b) => a + b, 0n);
  yield {
    actor: proposer.name,
    action: "proposes",
    detail: `"${PROPOSAL_TITLE}" · ${sol(amount)} in ${MILESTONES.length} milestones · paid to builder`,
    run: async () => {
      const sig = await ctx.client.createProposal(proposer.keypair, dao, proposalCount, PROPOSAL_TITLE, builder.keypair.publicKey, MILESTONES);
      ctx.refs.proposal = proposal;
      return sig;
    },
  };
  const view = await ctx.client.fetchProposal(proposal);
  check(view.state === "Voting" && view.amount === amount, "the new proposal is not open for voting with the requested amount");
}

/**
 * Every voter asks its brain, then votes on-chain. The pause between votes
 * shrinks when needed so all of them land inside the voting window.
 */
export async function* vote(ctx: ArenaContext, voters: readonly CastMember[]): Phase {
  const ref = proposalRef(ctx);
  const brains = new Map<string, Brain>(voters.map((v) => [v.name, brainFor(v.name)]));
  let left = voters.reduce((n, v) => n + v.voteRounds, 0);
  for (const voter of voters) {
    for (let round = 0; round < voter.voteRounds; round++, left--) {
      const [proposal, me] = await Promise.all([ctx.client.fetchProposal(ref.proposal), ctx.client.fetchMember(ref.dao, voter.keypair.publicKey)]);
      if (me.credits === 0n) continue;
      const brain = brains.get(voter.name);
      check(brain !== undefined, `no brain for ${voter.name}`);
      const decision = await brain.decideVote({ proposal, me, persona: voter.persona });
      const total = me.deposited / LAMPORTS_PER_CREDIT - me.credits + decision.credits;
      yield {
        actor: voter.name,
        action: `votes ${decision.support ? "FOR" : "AGAINST"}`,
        detail: `${formatCount(decision.credits)} credits · √${formatCount(total)} = ${formatVotes(votesFor(total), 3)} votes`,
        reasoning: decision.reasoning,
        pauseMs: votePause(ctx.speedMs, proposal.votingEndsAt, left),
        run: () => ctx.client.castVote(voter.keypair, ref, decision.credits, decision.support),
      };
    }
  }
}

function votePause(speedMs: number, votingEndsAt: bigint, votesLeft: number): number {
  const msLeft = Number(votingEndsAt) * 1000 - Date.now() - 3000;
  const perVote = msLeft / Math.max(1, votesLeft) - 700;
  return Math.max(100, Math.min(speedMs, perVote));
}

async function chainTime(ctx: ArenaContext): Promise<number> {
  const { connection } = ctx.client;
  const time = await connection.getBlockTime(await connection.getSlot("confirmed"));
  return time ?? Math.floor(Date.now() / 1000);
}

/** Waits for the deadline by the chain's clock, then `finalizer` closes the vote. */
export async function* closeVoting(ctx: ArenaContext, finalizer: CastMember, expected: ProposalStateName): Phase<ProposalView> {
  const ref = proposalRef(ctx);
  const { votingEndsAt } = await ctx.client.fetchProposal(ref.proposal);
  yield {
    actor: "clock",
    action: "waits out the voting period",
    run: async () => {
      let lastNote = Number.POSITIVE_INFINITY;
      for (;;) {
        const left = Number(votingEndsAt) - (await chainTime(ctx));
        if (left <= 0) return null;
        if (left <= lastNote - 5 || lastNote === Number.POSITIVE_INFINITY) {
          ctx.note("clock", `voting closes in ${left} s`);
          lastNote = left;
        }
        await sleep(1000);
      }
    },
  };
  yield {
    actor: finalizer.name,
    action: "finalizes the vote",
    run: async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await ctx.client.finalize(finalizer.keypair, ref.proposal);
        } catch (err) {
          if (krillErrorName(err) !== "VotingStillOpen" || attempt >= 15) throw err;
          await sleep(1000);
        }
      }
    },
  };
  const proposal = await ctx.client.fetchProposal(ref.proposal);
  check(proposal.state === expected, `proposal is ${proposal.state}, expected ${expected}`);
  check(proposal.creditsSpent >= proposal.quorumCredits, "quorum was not met");
  return proposal;
}

/** The passed proposal's amount moves from the treasury into its escrow, rent untouched. */
export async function* fundEscrow(ctx: ArenaContext, payer: CastMember): Phase {
  const ref = proposalRef(ctx);
  const { client } = ctx;
  const [daoBefore, proposal] = await Promise.all([client.fetchDao(ref.dao), client.fetchProposal(ref.proposal)]);
  yield {
    actor: payer.name,
    action: "executes the proposal",
    detail: `${sol(proposal.amount)} from the treasury into escrow`,
    run: () => client.execute(payer.keypair, ref),
  };
  const escrow = escrowPda(ref.proposal);
  const info = await client.connection.getAccountInfo(escrow, "confirmed");
  check(info !== null, "the escrow account was not created");
  const rent = BigInt(await client.connection.getMinimumBalanceForRentExemption(info.data.length));
  const daoAfter = await client.fetchDao(ref.dao);
  check(BigInt(info.lamports) - rent === proposal.amount, `escrow holds ${BigInt(info.lamports) - rent} lamports above rent, expected ${proposal.amount}`);
  check(daoBefore.pooledLamports - daoAfter.pooledLamports === proposal.amount, "the treasury did not shrink by the escrowed amount");
}

/** The builder submits milestone `index` with a delivery note; the council reviews it. Returns whether it was released. */
export async function* deliver(ctx: ArenaContext, index: number, note: string): Phase<boolean> {
  const ref = proposalRef(ctx);
  const { builder, council } = ctx.cast;
  yield {
    actor: builder.name,
    action: `submits M${index + 1}`,
    detail: note,
    run: () => ctx.client.submitMilestone(builder.keypair, ref.proposal, index),
  };
  const review = reviewMilestone(note);
  const amount = MILESTONES[index] ?? 0n;
  yield {
    actor: council.name,
    action: review.approve ? `approves M${index + 1}` : `rejects M${index + 1}`,
    detail: review.approve ? `${sol(amount)} to builder` : "back to Pending",
    reasoning: review.reasoning,
    run: () =>
      review.approve
        ? ctx.client.approveMilestone(council.keypair, ref, builder.keypair.publicKey, index)
        : ctx.client.rejectMilestone(council.keypair, ref, index),
  };
  const escrow = await ctx.client.fetchEscrow(ref.proposal);
  const status = escrow.milestones[index]?.status;
  check(status === (review.approve ? "Released" : "Pending"), `M${index + 1} is ${status ?? "missing"} after review`);
  return review.approve;
}

/** A submission the program must refuse; shown as a red line, not a crash. */
export function refusedSubmit(ctx: ArenaContext, index: number, expect: string, detail: string): Step {
  const ref = proposalRef(ctx);
  return {
    actor: ctx.cast.builder.name,
    action: `submits M${index + 1}`,
    detail,
    expect,
    run: () => ctx.client.submitMilestone(ctx.cast.builder.keypair, ref.proposal, index),
  };
}

/** The builder's balance grew by exactly what the escrow released, minus the fees it paid. */
export async function checkBuilderPaid(ctx: ArenaContext, startBalance: bigint, released: bigint): Promise<void> {
  const fees = (await Promise.all(ctx.signaturesOf(ctx.cast.builder.name).map((s) => ctx.client.feeOf(s)))).reduce((a, b) => a + b, 0n);
  const now = BigInt(await ctx.client.connection.getBalance(ctx.cast.builder.keypair.publicKey, "confirmed"));
  check(now - startBalance === released - fees, `builder gained ${now - startBalance} lamports, expected ${released} minus ${fees} in fees`);
}
