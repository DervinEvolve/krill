import type { BN, IdlAccounts } from "@anchor-lang/core";
import type { Buffer } from "buffer";
import type { PublicKey } from "@solana/web3.js";
import type { Krill } from "../idl/krill";
import { krillCoder } from "./program";

/** Plain, serialisable readings of the program's accounts: base58 addresses, bigint amounts. */

export const PROPOSAL_STATES = ["Voting", "Passed", "Rejected", "Escrowed", "Completed", "Cancelled"] as const;
export const ESCROW_STATES = ["Active", "Completed", "Cancelled"] as const;
export const MILESTONE_STATUSES = ["Pending", "Submitted", "Released"] as const;
export type ProposalStateName = (typeof PROPOSAL_STATES)[number];
export type EscrowStateName = (typeof ESCROW_STATES)[number];
export type MilestoneStatusName = (typeof MILESTONE_STATUSES)[number];

export interface DaoView {
  address: string;
  authority: string;
  council: string;
  name: string;
  votingPeriod: bigint;
  quorumBps: number;
  pooledLamports: bigint;
  totalCredits: bigint;
  memberCount: bigint;
  proposalCount: bigint;
}

export interface MemberView {
  address: string;
  wallet: string;
  credits: bigint;
  deposited: bigint;
}

export interface ProposalView {
  address: string;
  proposer: string;
  contractor: string;
  index: bigint;
  title: string;
  amount: bigint;
  milestones: bigint[];
  votingEndsAt: bigint;
  quorumCredits: bigint;
  creditsSpent: bigint;
  forVotes: bigint;
  againstVotes: bigint;
  state: ProposalStateName;
}

export interface ReceiptView {
  address: string;
  voter: string;
  support: boolean;
  credits: bigint;
  votes: bigint;
}

export interface MilestoneView {
  amount: bigint;
  status: MilestoneStatusName;
}

export interface EscrowView {
  address: string;
  contractor: string;
  milestones: MilestoneView[];
  releasedLamports: bigint;
  state: EscrowStateName;
}

type Accounts = IdlAccounts<Krill>;

const big = (n: BN): bigint => BigInt(n.toString());
const b58 = (k: PublicKey): string => k.toBase58();

/** Anchor decodes a unit enum as `{ variantName: {} }`; map it back to the Rust variant name. */
function variant<T extends string>(value: object, names: readonly T[]): T {
  const key = Object.keys(value)[0] ?? "";
  const name = names.find((n) => n.toLowerCase() === key.toLowerCase());
  if (!name) throw new Error(`unknown enum variant ${key}`);
  return name;
}

export function decodeDao(address: string, data: Buffer): DaoView {
  const a = krillCoder.accounts.decode<Accounts["dao"]>("dao", data);
  return {
    address,
    authority: b58(a.authority),
    council: b58(a.council),
    name: a.name,
    votingPeriod: big(a.votingPeriod),
    quorumBps: a.quorumBps,
    pooledLamports: big(a.pooledLamports),
    totalCredits: big(a.totalCredits),
    memberCount: big(a.memberCount),
    proposalCount: big(a.proposalCount),
  };
}

export function decodeMember(address: string, data: Buffer): MemberView {
  const a = krillCoder.accounts.decode<Accounts["member"]>("member", data);
  return { address, wallet: b58(a.wallet), credits: big(a.credits), deposited: big(a.deposited) };
}

export function decodeProposal(address: string, data: Buffer): ProposalView {
  const a = krillCoder.accounts.decode<Accounts["proposal"]>("proposal", data);
  return {
    address,
    proposer: b58(a.proposer),
    contractor: b58(a.contractor),
    index: big(a.index),
    title: a.title,
    amount: big(a.amount),
    milestones: a.milestones.map(big),
    votingEndsAt: big(a.votingEndsAt),
    quorumCredits: big(a.quorumCredits),
    creditsSpent: big(a.creditsSpent),
    forVotes: big(a.forVotes),
    againstVotes: big(a.againstVotes),
    state: variant(a.state, PROPOSAL_STATES),
  };
}

export function decodeReceipt(address: string, data: Buffer): ReceiptView {
  const a = krillCoder.accounts.decode<Accounts["voteReceipt"]>("voteReceipt", data);
  return { address, voter: b58(a.voter), support: a.support, credits: big(a.credits), votes: big(a.votes) };
}

export function decodeEscrow(address: string, data: Buffer): EscrowView {
  const a = krillCoder.accounts.decode<Accounts["escrow"]>("escrow", data);
  return {
    address,
    contractor: b58(a.contractor),
    milestones: a.milestones.map((m) => ({ amount: big(m.amount), status: variant(m.status, MILESTONE_STATUSES) })),
    releasedLamports: big(a.releasedLamports),
    state: variant(a.state, ESCROW_STATES),
  };
}
