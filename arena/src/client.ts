import { AnchorProvider, Program } from "@anchor-lang/core";
import type { Wallet } from "@anchor-lang/core";
import { Connection, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { Keypair } from "@solana/web3.js";
import BN from "bn.js";
import type { Krill } from "../../idl/krill";
import { daoPda, escrowPda, memberPda, proposalPda, votePda } from "../../shared/pdas";
import { KRILL_IDL } from "../../shared/program";
import { decodeDao, decodeEscrow, decodeMember, decodeProposal } from "../../shared/views";
import type { DaoView, EscrowView, MemberView, ProposalView } from "../../shared/views";

export { votesToNumber } from "../../shared/math";

/** Addresses a proposal's instructions need. */
export interface ProposalRef {
  dao: PublicKey;
  proposal: PublicKey;
}

const bn = (n: bigint): BN => new BN(n.toString());

/** Signs as one agent's keypair; that agent is also the fee payer. */
class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }

  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    else tx.partialSign(this.payer);
    return Promise.resolve(tx);
  }

  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
}
const CONFIRMED = { commitment: "confirmed", preflightCommitment: "confirmed" } as const;

/**
 * A thin typed wrapper over `Program<Krill>`: one method per instruction, each
 * signed and paid for by the agent that acts, returning the signature. All
 * PDAs are passed explicitly from `shared/pdas.ts` (SPEC §3 seeds).
 */
export class KrillClient {
  private readonly programs = new Map<string, Program<Krill>>();

  constructor(readonly connection: Connection) {}

  /** A program handle whose provider wallet (fee payer and signer) is `signer`. */
  private as(signer: Keypair): Program<Krill> {
    const key = signer.publicKey.toBase58();
    let program = this.programs.get(key);
    if (!program) {
      program = new Program<Krill>(KRILL_IDL, new AnchorProvider(this.connection, new KeypairWallet(signer), CONFIRMED));
      this.programs.set(key, program);
    }
    return program;
  }

  initializeDao(authority: Keypair, name: string, council: PublicKey, votingPeriod: bigint, quorumBps: number): Promise<string> {
    return this.as(authority)
      .methods.initializeDao(name, council, bn(votingPeriod), quorumBps)
      .accountsPartial({ authority: authority.publicKey, dao: daoPda(authority.publicKey, name) })
      .rpc();
  }

  join(wallet: Keypair, dao: PublicKey, deposit: bigint): Promise<string> {
    return this.as(wallet)
      .methods.join(bn(deposit))
      .accountsPartial({ wallet: wallet.publicKey, dao, member: memberPda(dao, wallet.publicKey) })
      .rpc();
  }

  deposit(wallet: Keypair, dao: PublicKey, amount: bigint): Promise<string> {
    return this.as(wallet)
      .methods.deposit(bn(amount))
      .accountsPartial({ wallet: wallet.publicKey, dao, member: memberPda(dao, wallet.publicKey) })
      .rpc();
  }

  createProposal(proposer: Keypair, dao: PublicKey, index: bigint, title: string, contractor: PublicKey, milestones: readonly bigint[]): Promise<string> {
    return this.as(proposer)
      .methods.createProposal(title, contractor, milestones.map(bn))
      .accountsPartial({
        proposer: proposer.publicKey,
        dao,
        member: memberPda(dao, proposer.publicKey),
        proposal: proposalPda(dao, index),
      })
      .rpc();
  }

  castVote(voter: Keypair, ref: ProposalRef, credits: bigint, support: boolean): Promise<string> {
    return this.as(voter)
      .methods.castVote(bn(credits), support)
      .accountsPartial({
        voter: voter.publicKey,
        member: memberPda(ref.dao, voter.publicKey),
        proposal: ref.proposal,
        receipt: votePda(ref.proposal, voter.publicKey),
      })
      .rpc();
  }

  finalize(caller: Keypair, proposal: PublicKey): Promise<string> {
    return this.as(caller).methods.finalize().accountsPartial({ proposal }).rpc();
  }

  execute(payer: Keypair, ref: ProposalRef): Promise<string> {
    return this.as(payer)
      .methods.execute()
      .accountsPartial({ payer: payer.publicKey, dao: ref.dao, proposal: ref.proposal, escrow: escrowPda(ref.proposal) })
      .rpc();
  }

  submitMilestone(contractor: Keypair, proposal: PublicKey, index: number): Promise<string> {
    return this.as(contractor)
      .methods.submitMilestone(index)
      .accountsPartial({ contractor: contractor.publicKey, escrow: escrowPda(proposal) })
      .rpc();
  }

  approveMilestone(council: Keypair, ref: ProposalRef, contractor: PublicKey, index: number): Promise<string> {
    return this.as(council)
      .methods.approveMilestone(index)
      .accountsPartial({ council: council.publicKey, dao: ref.dao, proposal: ref.proposal, escrow: escrowPda(ref.proposal), contractor })
      .rpc();
  }

  rejectMilestone(council: Keypair, ref: ProposalRef, index: number): Promise<string> {
    return this.as(council)
      .methods.rejectMilestone(index)
      .accountsPartial({ council: council.publicKey, dao: ref.dao, escrow: escrowPda(ref.proposal) })
      .rpc();
  }

  cancelEscrow(council: Keypair, ref: ProposalRef): Promise<string> {
    return this.as(council)
      .methods.cancelEscrow()
      .accountsPartial({ council: council.publicKey, dao: ref.dao, proposal: ref.proposal, escrow: escrowPda(ref.proposal) })
      .rpc();
  }

  /** A plain system transfer (the whale funding its sybil wallets). */
  transfer(from: Keypair, to: PublicKey, lamports: bigint): Promise<string> {
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }));
    return sendAndConfirmTransaction(this.connection, tx, [from], CONFIRMED);
  }

  private async data(address: PublicKey): Promise<Buffer> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    if (!info) throw new Error(`account ${address.toBase58()} does not exist`);
    return info.data;
  }

  async fetchDao(address: PublicKey): Promise<DaoView> {
    return decodeDao(address.toBase58(), await this.data(address));
  }

  async fetchMember(dao: PublicKey, wallet: PublicKey): Promise<MemberView> {
    const address = memberPda(dao, wallet);
    return decodeMember(address.toBase58(), await this.data(address));
  }

  async fetchProposal(address: PublicKey): Promise<ProposalView> {
    return decodeProposal(address.toBase58(), await this.data(address));
  }

  async fetchEscrow(proposal: PublicKey): Promise<EscrowView> {
    const address = escrowPda(proposal);
    return decodeEscrow(address.toBase58(), await this.data(address));
  }

  /** Lamports paid as fee by a landed transaction. */
  async feeOf(signature: string): Promise<bigint> {
    const tx = await this.connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    return BigInt(tx?.meta?.fee ?? 0);
  }
}
