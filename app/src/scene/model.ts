import { LAMPORTS_PER_SOL } from "../../../shared/constants";
import type { CastEntry, ChainSnapshot, Manifest } from "../../../shared/feed";
import type { EscrowStateName, MilestoneStatusName, ProposalStateName } from "../../../shared/views";

/**
 * What the desk draws, reduced from the manifest and a chain snapshot. The
 * scene animates from one model to the next and then rests on the latest.
 */

export interface FigureModel {
  id: string;
  label: string;
  /** Cast names drawn by this figurine (the whale also stands for its sybil wallets). */
  names: string[];
  credits: number;
  /** Credits already burned on the proposal. */
  spent: number;
  votes: bigint;
  side: boolean | null;
}

export interface ProposalModel {
  title: string;
  amountSol: number;
  milestones: number;
  state: ProposalStateName;
  endsAt: number;
  period: number;
}

export interface VaultModel {
  milestones: { sol: number; status: MilestoneStatusName }[];
  state: EscrowStateName;
}

export interface SceneModel {
  figures: Record<string, FigureModel>;
  treasury: number;
  forVotes: bigint;
  againstVotes: bigint;
  quorum: { spent: number; required: number; minted: number } | null;
  proposal: ProposalModel | null;
  vault: VaultModel | null;
  tray: number;
}

export const KRILL_IDS = Array.from({ length: 11 }, (_, i) => `K-${String(i + 1).padStart(2, "0")}`);
export const WHALE_ID = "WHALE";

/** Which figurine draws a cast member, or null for people and machines. */
export function figureOf(name: string): string | null {
  const krill = /^krill-(\d\d)$/.exec(name)?.[1];
  if (krill) return `K-${krill}`;
  return name === "whale" || name.startsWith("sybil-") ? WHALE_ID : null;
}

const sol = (lamports: bigint): number => Number(lamports / LAMPORTS_PER_SOL);

export function emptyModel(): SceneModel {
  const figures: Record<string, FigureModel> = {};
  for (const id of [...KRILL_IDS, WHALE_ID]) figures[id] = { id, label: id, names: [], credits: 0, spent: 0, votes: 0n, side: null };
  return { figures, treasury: 0, forVotes: 0n, againstVotes: 0n, quorum: null, proposal: null, vault: null, tray: 0 };
}

function addMember(model: SceneModel, entry: CastEntry, snap: ChainSnapshot): void {
  const id = figureOf(entry.name);
  const fig = id ? model.figures[id] : undefined;
  if (!fig) return;
  fig.names.push(entry.name);
  const member = snap.members[entry.pubkey];
  const receipt = snap.receipts[entry.pubkey];
  fig.credits += member ? Number(member.credits) : 0;
  if (receipt) {
    fig.spent += Number(receipt.credits);
    fig.votes += receipt.votes;
    fig.side = receipt.support;
  }
}

export function deriveModel(manifest: Manifest | null, snap: ChainSnapshot | null): SceneModel {
  const model = emptyModel();
  if (!manifest || !snap) return model;
  for (const entry of manifest.cast) addMember(model, entry, snap);
  const whale = model.figures[WHALE_ID];
  if (whale && whale.names.length > 1) whale.label = `WHALE x${whale.names.length - 1}`;
  if (snap.dao) {
    model.treasury = sol(snap.dao.pooledLamports);
    model.quorum = { spent: 0, required: 0, minted: Number(snap.dao.totalCredits) };
  }
  const p = snap.proposal;
  if (p && snap.dao) {
    model.forVotes = p.forVotes;
    model.againstVotes = p.againstVotes;
    model.quorum = { spent: Number(p.creditsSpent), required: Number(p.quorumCredits), minted: Number(snap.dao.totalCredits) };
    model.proposal = {
      title: p.title,
      amountSol: sol(p.amount),
      milestones: p.milestones.length,
      state: p.state,
      endsAt: Number(p.votingEndsAt),
      period: Number(snap.dao.votingPeriod),
    };
  }
  if (snap.escrow) {
    model.vault = { milestones: snap.escrow.milestones.map((m) => ({ sol: sol(m.amount), status: m.status })), state: snap.escrow.state };
    model.tray = sol(snap.escrow.releasedLamports);
  }
  return model;
}
