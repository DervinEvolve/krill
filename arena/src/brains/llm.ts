import Anthropic from "@anthropic-ai/sdk";
import { formatCount, formatSol, formatVotes } from "../../../shared/math";
import { scriptedDecision } from "./scripted";
import type { Brain, VoteContext, VoteDecision } from "./types";

const DEFAULT_MODEL = "claude-opus-5-5";

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    support: { type: "boolean", description: "true to vote for the proposal, false to vote against" },
    credits: { type: "integer", description: "voice credits to spend now" },
    reasoning: { type: "string", description: "one or two plain sentences explaining the choice" },
  },
  required: ["support", "credits", "reasoning"],
  additionalProperties: false,
} as const;

interface RawDecision {
  support: boolean;
  credits: number;
  reasoning: string;
}

function isRawDecision(v: unknown): v is RawDecision {
  if (v === null || typeof v !== "object") return false;
  return "support" in v && typeof v.support === "boolean" && "credits" in v && typeof v.credits === "number" && "reasoning" in v && typeof v.reasoning === "string";
}

function prompt({ proposal, me, persona }: VoteContext): string {
  return [
    `You are a member of a DAO that votes with quadratic voting: spending c voice credits buys sqrt(c) votes, and the square root applies to your cumulative credits on a proposal.`,
    `Who you are: ${persona}`,
    `Proposal: "${proposal.title}", asking ${formatSol(proposal.amount, 0)} SOL from the treasury in ${proposal.milestones.length} milestones.`,
    `Tally so far: ${formatVotes(proposal.forVotes, 3)} votes for, ${formatVotes(proposal.againstVotes, 3)} against.`,
    `You hold ${formatCount(me.credits)} unspent credits. Decide which side you vote on and how many credits to spend now (1 to ${me.credits}).`,
  ].join("\n");
}

/**
 * Asks a model for the vote as structured JSON. The answer is validated and
 * `credits` is clamped to what the member holds; on any failure the member
 * falls back to its scripted decision and says why on stderr.
 */
export function llmBrain(name: string): Brain {
  const model = process.env.KRILL_LLM_MODEL ?? DEFAULT_MODEL;
  let client: Anthropic | null = null;
  return {
    async decideVote(ctx: VoteContext): Promise<VoteDecision> {
      try {
        client ??= new Anthropic();
        const response = await client.beta.messages.create({
          model,
          max_tokens: 2000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: { type: "json_schema", schema: DECISION_SCHEMA } },
          messages: [{ role: "user", content: prompt(ctx) }],
        });
        if (response.stop_reason === "refusal") throw new Error("the model declined to answer");
        const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        const parsed: unknown = JSON.parse(text);
        if (!isRawDecision(parsed)) throw new Error(`unexpected decision shape: ${text}`);
        const wanted = BigInt(Math.trunc(parsed.credits));
        const credits = wanted < 1n ? 1n : wanted > ctx.me.credits ? ctx.me.credits : wanted;
        return { support: parsed.support, credits, reasoning: parsed.reasoning.trim() };
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[${name}] model decision failed (${why}); using the scripted decision\n`);
        return scriptedDecision(name, ctx);
      }
    },
  };
}
