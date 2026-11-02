import { LAMPORTS_PER_SOL, VOTE_SCALE } from "./constants";

/**
 * Floor square root, the same Newton iteration as `isqrt` in
 * `programs/krill/src/math.rs`: start at a power of two that is at least
 * sqrt(n) and step down until the sequence stops decreasing.
 */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (;;) {
    const y = (x + n / x) / 2n;
    if (y >= x) return x;
    x = y;
  }
}

/** Votes bought by `credits`: floor(sqrt(credits) * VOTE_SCALE), as the program computes it. */
export const votesFor = (credits: bigint): bigint => isqrt(credits * VOTE_SCALE * VOTE_SCALE);

/** Fixed-point votes as a float. For drawing only; compare and print with bigints. */
export const votesToNumber = (votes: bigint): number => Number(votes) / Number(VOTE_SCALE);

/** Exact decimal rendering of fixed-point votes, truncated to `decimals` places. */
export function formatVotes(votes: bigint, decimals = 9): string {
  const whole = votes / VOTE_SCALE;
  const frac = (votes % VOTE_SCALE).toString().padStart(9, "0").slice(0, decimals);
  return decimals > 0 ? `${whole}.${frac}` : whole.toString();
}

/** Lamports as SOL with a fixed number of decimals, keeping the sign. */
export function formatSol(lamports: bigint, decimals = 3): string {
  const sign = lamports < 0n ? "-" : "";
  const abs = lamports < 0n ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const frac = (abs % LAMPORTS_PER_SOL).toString().padStart(9, "0").slice(0, decimals);
  return `${sign}${whole}${decimals > 0 ? `.${frac}` : ""}`;
}

/** Thousands separators for credit counts. */
export const formatCount = (n: bigint): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
