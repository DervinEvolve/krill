import { formatCount, formatSol, formatVotes } from "../../../shared/math";
import { scriptedDecision } from "./scripted";
import type { Brain, VoteContext, VoteDecision } from "./types";

/**
 * Provider-neutral model brain. It speaks the chat-completions wire format
 * that most hosted and local model servers accept, configured entirely by
 * environment:
 *
 *   KRILL_LLM_URL      base URL ending in `/v1` (hosted API or a local server)
 *   KRILL_LLM_MODEL    model name as that server knows it
 *   KRILL_LLM_API_KEY  bearer token, if the server wants one
 */
interface LlmConfig {
  url: string;
  model: string;
  apiKey: string | undefined;
}

function configFromEnv(): LlmConfig {
  const url = process.env.KRILL_LLM_URL;
  const model = process.env.KRILL_LLM_MODEL;
  if (!url || !model) throw new Error("set KRILL_LLM_URL and KRILL_LLM_MODEL to use the model brain");
  return { url: url.replace(/\/+$/, ""), model, apiKey: process.env.KRILL_LLM_API_KEY };
}

interface RawDecision {
  support: boolean;
  credits: number;
  reasoning: string;
}

function isRawDecision(v: unknown): v is RawDecision {
  if (v === null || typeof v !== "object") return false;
  return (
    "support" in v &&
    typeof v.support === "boolean" &&
    "credits" in v &&
    typeof v.credits === "number" &&
    "reasoning" in v &&
    typeof v.reasoning === "string"
  );
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
}

const SYSTEM_PROMPT = [
  "You are a member of a DAO that votes with quadratic voting: spending c voice credits buys sqrt(c) votes,",
  "and the square root applies to your cumulative credits on a proposal.",
  'Reply with one JSON object only: {"support": boolean, "credits": integer, "reasoning": string}.',
  "support is true to vote for the proposal and false to vote against; credits is how many voice credits",
  "to spend now; reasoning is one or two plain sentences.",
].join(" ");

function userPrompt({ proposal, me, persona }: VoteContext): string {
  return [
    `Who you are: ${persona}`,
    `Proposal: "${proposal.title}", asking ${formatSol(proposal.amount, 0)} SOL from the treasury in ${proposal.milestones.length} milestones.`,
    `Tally so far: ${formatVotes(proposal.forVotes, 3)} votes for, ${formatVotes(proposal.againstVotes, 3)} against.`,
    `You hold ${formatCount(me.credits)} unspent credits. Decide which side you vote on and how many credits to spend now (1 to ${me.credits}).`,
  ].join("\n");
}

async function askModel(config: LlmConfig, ctx: VoteContext): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(`${config.url}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(ctx) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`model server answered ${response.status}`);
  const body = (await response.json()) as ChatCompletion;
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("model answer had no content");
  return content;
}

/**
 * Asks a model for the vote as JSON. The answer is validated and `credits`
 * is clamped to what the member holds; on any failure the member falls back
 * to its scripted decision and says why on stderr.
 */
export function llmBrain(name: string): Brain {
  let config: LlmConfig | null = null;
  return {
    async decideVote(ctx: VoteContext): Promise<VoteDecision> {
      try {
        config ??= configFromEnv();
        const text = await askModel(config, ctx);
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
