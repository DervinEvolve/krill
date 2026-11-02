/**
 * Numbers shared by the arena and the desk. The first two mirror
 * `programs/krill/src/constants.rs`; keep them in step with the program.
 */

/** One voice credit costs 0.001 SOL (`LAMPORTS_PER_CREDIT` in the program). */
export const LAMPORTS_PER_CREDIT = 1_000_000n;

/** Votes are fixed point with 9 decimals (`VOTE_SCALE` in the program). */
export const VOTE_SCALE = 1_000_000_000n;

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** The local validator the arena starts, and the feed server it runs beside it. */
export const RPC_URL = "http://127.0.0.1:8899";
export const WS_URL = "ws://127.0.0.1:8900";
export const FEED_PORT = 8787;
export const FEED_URL = `http://127.0.0.1:${FEED_PORT}`;
