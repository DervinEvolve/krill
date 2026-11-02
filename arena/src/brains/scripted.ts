import { LAMPORTS_PER_CREDIT } from "../../../shared/constants";
import { formatCount, formatVotes, votesFor } from "../../../shared/math";
import type { Brain, VoteContext, VoteDecision } from "./types";

/**
 * The deterministic cast (ARENA_SPEC §1) as pure functions. Every reasoning
 * string is computed from the numbers it quotes, so it is true by construction.
 */

const votes = (credits: bigint): string => formatVotes(votesFor(credits), 2);

function krill({ me }: VoteContext): VoteDecision {
  return {
    support: true,
    credits: me.credits,
    reasoning: `${formatCount(me.credits)} credits for: √${formatCount(me.credits)} = ${votes(me.credits)} votes. Eleven of us outweigh one whale.`,
  };
}

/** krill-07 votes 400 then the rest, to show the root applies to the running total. */
function splitter({ me }: VoteContext): VoteDecision {
  const first = 400n;
  const untouched = me.credits * LAMPORTS_PER_CREDIT === me.deposited;
  if (untouched && me.credits > first) {
    const rest = me.credits - first;
    return {
      support: true,
      credits: first,
      reasoning: `First top-up of ${first}. Splitting ${formatCount(me.credits)} as ${first} + ${rest} would give ${votes(first)} + ${votes(rest)} if each part were rooted; the program roots my total instead.`,
    };
  }
  return {
    support: true,
    credits: me.credits,
    reasoning: `Second top-up of ${me.credits}. My receipt now holds ${formatCount(me.credits + first)} credits, worth ${votes(me.credits + first)} votes in total, the same as voting once.`,
  };
}

function whale({ me }: VoteContext): VoteDecision {
  const krillCredits = 1_000n;
  const ratio = formatVotes((votesFor(me.credits) * 1_000_000_000n) / votesFor(krillCredits), 0);
  return {
    support: false,
    credits: me.credits,
    reasoning: `Whale: ${formatCount(me.credits)} credits against. Linear voting would give me ${me.credits / krillCredits}× a krill's weight; here it is ${ratio}×.`,
  };
}

function sybil({ me }: VoteContext): VoteDecision {
  return {
    support: false,
    credits: me.credits,
    reasoning: `One of eleven whale wallets: ${formatCount(me.credits)} credits against = ${votes(me.credits)} votes. Split eleven ways, the same 100 SOL is worth ${votes(me.credits)} × 11.`,
  };
}

/** Picks the behaviour for a cast member by name. */
export function scriptedDecision(name: string, ctx: VoteContext): VoteDecision {
  if (name === "whale") return whale(ctx);
  if (name === "krill-07") return splitter(ctx);
  if (name.startsWith("sybil-")) return sybil(ctx);
  return krill(ctx);
}

export const scriptedBrain = (name: string): Brain => ({
  decideVote: (ctx) => Promise.resolve(scriptedDecision(name, ctx)),
});

/** The council's review rule: a submission tagged `[rushed]` goes back for rework. */
export function reviewMilestone(note: string): { approve: boolean; reasoning: string } {
  return note.includes("[rushed]")
    ? { approve: false, reasoning: "The delivery note is tagged [rushed]; sending it back for rework." }
    : { approve: true, reasoning: "Delivery note is complete and untagged; releasing the milestone." };
}
