import type { DaoView, EscrowView, MemberView, ProposalView, ReceiptView } from "./views";

/** The wire format between the arena's feed server and the desk. */

export type CastRole = "council" | "whale" | "krill" | "builder" | "sybil";

export interface CastEntry {
  name: string;
  role: CastRole;
  pubkey: string;
}

export interface ScenarioInfo {
  name: string;
  description: string;
}

export interface Manifest {
  programId: string;
  cluster: string;
  ws: string;
  dao: string | null;
  proposal: string | null;
  escrow: string | null;
  cast: CastEntry[];
  scenario: string | null;
  running: boolean;
}

/** Every account the desk draws, read in one RPC call after each step. Keys are wallet addresses. */
export interface ChainSnapshot {
  chainTime: number | null;
  dao: DaoView | null;
  proposal: ProposalView | null;
  escrow: EscrowView | null;
  members: Record<string, MemberView>;
  receipts: Record<string, ReceiptView>;
  balances: Record<string, bigint>;
}

/**
 * One line of the feed. `step` is an on-chain action (with its signature when
 * it landed), `note` is narration such as the countdown, `start` and `end`
 * bracket a scenario. `expected` marks a refusal the scenario provoked on purpose.
 */
export interface FeedEvent {
  t: number;
  kind: "step" | "note" | "start" | "end";
  actor: string;
  action: string;
  detail?: string;
  signature?: string;
  ok: boolean;
  expected?: boolean;
  reasoning?: string;
  snapshot?: ChainSnapshot;
}

/** JSON with bigints: they travel as `{ "$big": "123" }`. */
export const toJson = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? { $big: v.toString() } : v));

/** Parses feed JSON; the caller names the type it expects from that endpoint. */
export function fromJson<T>(text: string): T {
  return JSON.parse(text, (_k, v: unknown) => {
    if (v !== null && typeof v === "object" && "$big" in v && typeof v.$big === "string") return BigInt(v.$big);
    return v;
  }) as T;
}
