import { PublicKey } from "@solana/web3.js";
import type { Buffer } from "buffer";
import type { Connection } from "@solana/web3.js";
import type { ChainSnapshot } from "./feed";
import { escrowPda, memberPda, votePda } from "./pdas";
import { decodeDao, decodeEscrow, decodeMember, decodeProposal, decodeReceipt } from "./views";

/** What to read: the run's main accounts and the cast's wallets (base58). */
export interface SnapshotRefs {
  dao: string | null;
  proposal: string | null;
  wallets: readonly string[];
}

/** Reads every account the desk draws in a single `getMultipleAccountsInfo` call. */
export async function readSnapshot(connection: Connection, refs: SnapshotRefs): Promise<ChainSnapshot> {
  const dao = refs.dao ? new PublicKey(refs.dao) : null;
  const proposal = refs.proposal ? new PublicKey(refs.proposal) : null;
  const escrow = proposal ? escrowPda(proposal) : null;
  const wallets = refs.wallets.map((w) => new PublicKey(w));
  const members = dao ? wallets.map((w) => memberPda(dao, w)) : [];
  const receipts = proposal ? wallets.map((w) => votePda(proposal, w)) : [];
  const keys = [dao, proposal, escrow, ...members, ...receipts, ...wallets].filter((k): k is PublicKey => k !== null);

  const [infos, slot] = await Promise.all([
    connection.getMultipleAccountsInfo(keys, "confirmed"),
    connection.getSlot("confirmed"),
  ]);
  const byKey = new Map(keys.map((k, i) => [k.toBase58(), infos[i] ?? null]));
  const read = <T>(key: PublicKey | null, decode: (address: string, data: Buffer) => T): T | null => {
    const info = key ? byKey.get(key.toBase58()) : null;
    return key && info ? decode(key.toBase58(), info.data) : null;
  };

  const snap: ChainSnapshot = {
    chainTime: await connection.getBlockTime(slot).catch(() => null),
    dao: read(dao, decodeDao),
    proposal: read(proposal, decodeProposal),
    escrow: read(escrow, decodeEscrow),
    members: {},
    receipts: {},
    balances: {},
  };
  wallets.forEach((w, i) => {
    const key = w.toBase58();
    const member = read(members[i] ?? null, decodeMember);
    const receipt = read(receipts[i] ?? null, decodeReceipt);
    if (member) snap.members[key] = member;
    if (receipt) snap.receipts[key] = receipt;
    snap.balances[key] = BigInt(byKey.get(key)?.lamports ?? 0);
  });
  return snap;
}
