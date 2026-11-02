import type { MemberView, ProposalView } from "../../../shared/views";

/** What an agent knows when it decides how to vote. */
export interface VoteContext {
  proposal: ProposalView;
  me: MemberView;
  persona: string;
}

export interface VoteDecision {
  support: boolean;
  credits: bigint;
  reasoning: string;
}

export interface Brain {
  decideVote(ctx: VoteContext): Promise<VoteDecision>;
}
