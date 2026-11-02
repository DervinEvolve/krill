import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./program";

/**
 * PDA derivations, one per account, mirroring the seeds in SPEC §3 and the
 * `seeds = [...]` constraints in `programs/krill/src/instructions`.
 */
const find = (seeds: Uint8Array[]): PublicKey => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const text = (s: string): Uint8Array => new TextEncoder().encode(s);

export const daoPda = (authority: PublicKey, name: string): PublicKey =>
  find([text("dao"), authority.toBytes(), text(name)]);

export const memberPda = (dao: PublicKey, wallet: PublicKey): PublicKey =>
  find([text("member"), dao.toBytes(), wallet.toBytes()]);

export function proposalPda(dao: PublicKey, index: bigint): PublicKey {
  const le = new Uint8Array(8);
  new DataView(le.buffer).setBigUint64(0, index, true);
  return find([text("proposal"), dao.toBytes(), le]);
}

export const votePda = (proposal: PublicKey, voter: PublicKey): PublicKey =>
  find([text("vote"), proposal.toBytes(), voter.toBytes()]);

export const escrowPda = (proposal: PublicKey): PublicKey => find([text("escrow"), proposal.toBytes()]);
