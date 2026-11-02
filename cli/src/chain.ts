import type { Connection, PublicKey } from "@solana/web3.js";
import type { Buffer } from "buffer";
import type { ProposalRef } from "../../shared/client";
import { formatCount, formatSol } from "../../shared/math";
import { proposalPda } from "../../shared/pdas";
import type { ProposalView } from "../../shared/views";
import { decodeProposal } from "../../shared/views";
import type { Context } from "./context";

/** Reads shared by the commands: the chain's clock, accounts that may not exist yet, and proposals by index. */

/** The cluster's clock, the one `voting_ends_at` is compared against. */
export async function chainTime(connection: Connection): Promise<bigint> {
  const time = await connection.getBlockTime(await connection.getSlot("confirmed")).catch(() => null);
  return BigInt(time ?? Math.floor(Date.now() / 1000));
}

/** An account decoded with `decode`, or null if it does not exist. */
export async function readOptional<T>(connection: Connection, address: PublicKey, decode: (address: string, data: Buffer) => T): Promise<T | null> {
  const info = await connection.getAccountInfo(address, "confirmed");
  return info ? decode(address.toBase58(), info.data) : null;
}

/** Proposal `index` of the context's DAO; a missing one is reported by index, not by address. */
export async function loadProposal(ctx: Context, index: bigint): Promise<{ ref: ProposalRef; proposal: ProposalView }> {
  const dao = ctx.dao();
  const address = proposalPda(dao, index);
  const proposal = await readOptional(ctx.connection, address, decodeProposal);
  if (!proposal) throw new Error(`proposal #${index} does not exist in DAO ${dao.toBase58()}`);
  return { ref: { dao, proposal: address }, proposal };
}

export const sol = (lamports: bigint): string => `${formatSol(lamports, 3)} SOL`;

/** "1 member", "12 members", "1,000 credits". */
export const count = (n: bigint | number, noun: string): string => `${formatCount(BigInt(n))} ${noun}${n === 1 || n === 1n ? "" : "s"}`;

/** "4 s", "2 min 5 s", "1 h 3 min". */
export function duration(seconds: bigint): string {
  const s = Number(seconds);
  if (s < 120) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

/** "closes in 4 s" while voting is open, "closed 12 s ago" after. */
export const countdown = (secondsLeft: bigint): string => (secondsLeft > 0n ? `closes in ${duration(secondsLeft)}` : `closed ${duration(-secondsLeft)} ago`);
