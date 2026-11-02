import { fileURLToPath } from "node:url";
import { LAMPORTS_PER_SOL } from "../../shared/constants";

/** Parameters of the arena's DAO and proposal (ARENA_SPEC §1, §4). */

export const DAO_NAME = "krill";
export const VOTING_PERIOD_SECONDS = 25n;
export const QUORUM_BPS = 1000;

export const PROPOSAL_TITLE = "Ship the Krill mobile client";
export const MILESTONES: readonly bigint[] = [10n, 10n, 10n].map((sol) => sol * LAMPORTS_PER_SOL);

/** The 1 SOL a krill deposits and the 100 SOL the whale deposits. */
export const KRILL_DEPOSIT = 1n * LAMPORTS_PER_SOL;
export const WHALE_DEPOSIT = 100n * LAMPORTS_PER_SOL;
export const SYBIL_WALLETS = 11;

/** Pause between steps so a person can follow the desk. */
export const DEFAULT_SPEED_MS = 1200;

const fromRepo = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));
export const PROGRAM_SO = fromRepo("target/deploy/krill.so");
export const PROGRAM_MANIFEST = fromRepo("programs/krill/Cargo.toml");
export const PROGRAM_BUILD_DIR = fromRepo("arena/.program");
export const LEDGER_DIR = fromRepo("arena/.ledger");
