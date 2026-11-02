import { Keypair } from "@solana/web3.js";
import { LAMPORTS_PER_SOL } from "../../shared/constants";
import type { CastEntry, CastRole } from "../../shared/feed";
import { KRILL_DEPOSIT, WHALE_DEPOSIT } from "./constants";

/** One agent: its own keypair, its funding, and how it behaves (ARENA_SPEC §1). */
export interface CastMember {
  name: string;
  role: CastRole;
  keypair: Keypair;
  /** Lamports airdropped before the run. */
  funding: bigint;
  /** Lamports deposited on joining, or null for non-members. */
  deposit: bigint | null;
  /** How many transactions it splits its vote into. */
  voteRounds: number;
  persona: string;
}

export interface Cast {
  council: CastMember;
  whale: CastMember;
  krill: CastMember[];
  builder: CastMember;
  /** The proposer: krill-01 doubles as one. */
  proposer: CastMember;
  members: CastMember[];
  all: CastMember[];
}

const sol = (n: number): bigint => (BigInt(Math.round(n * 1000)) * LAMPORTS_PER_SOL) / 1000n;

function member(name: string, role: CastRole, funding: bigint, deposit: bigint | null, persona: string, voteRounds = 1): CastMember {
  return { name, role, keypair: Keypair.generate(), funding, deposit, voteRounds, persona };
}

const KRILL_PERSONA =
  "A small member who deposited 1 SOL. Wants the mobile client shipped and knows that many small voters, " +
  "under quadratic voting, can outweigh one large holder.";

/** A fresh cast with new keypairs: nothing is reused between runs and nothing is written to disk. */
export function createCast(): Cast {
  const council = member("council", "council", sol(2), null, "Reviews milestone deliveries for the DAO.");
  const whale = member(
    "whale",
    "whale",
    sol(101),
    WHALE_DEPOSIT,
    "A large holder who deposited 100 SOL and thinks the 30 SOL mobile client is a waste of treasury money.",
  );
  const krill = Array.from({ length: 11 }, (_, i) => {
    const name = `krill-${String(i + 1).padStart(2, "0")}`;
    return name === "krill-07"
      ? member(name, "krill", sol(1.2), KRILL_DEPOSIT, `${KRILL_PERSONA} Votes in two top-ups to test the cumulative square root.`, 2)
      : member(name, "krill", sol(1.2), KRILL_DEPOSIT, KRILL_PERSONA);
  });
  const builder = member("builder", "builder", sol(0.5), null, "The contractor who builds the mobile client.");
  const proposer = krill[0];
  if (!proposer) throw new Error("the cast needs at least one krill");
  const members = [...krill, whale];
  return { council, whale, krill, builder, proposer, members, all: [council, whale, ...krill, builder] };
}

/** Wallets the whale controls in the sybil scenario; funded by the whale, not the faucet. */
export const createSybils = (count: number, deposit: bigint): CastMember[] =>
  Array.from({ length: count }, (_, i) =>
    member(
      `sybil-${String(i + 1).padStart(2, "0")}`,
      "sybil",
      0n,
      deposit,
      "One of eleven wallets the whale opened to split its 100 SOL; votes against.",
    ),
  );

export const castEntries = (members: readonly CastMember[]): CastEntry[] =>
  members.map((m) => ({ name: m.name, role: m.role, pubkey: m.keypair.publicKey.toBase58() }));
