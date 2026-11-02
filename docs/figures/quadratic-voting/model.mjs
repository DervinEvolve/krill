// Quadratic voting, exactly as the Krill program computes it.
// Mirrors programs/krill/src/math.rs and constants.rs: integer Newton square
// root on BigInt, votes as fixed-point with 9 decimals, always rounded down.
// Pure and dependency-free, so the build and the page run the same code.

export const LAMPORTS_PER_CREDIT = 1_000_000n; // 0.001 SOL buys one voice credit
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const VOTE_SCALE = 1_000_000_000n; // 9 decimals

export const KRILL_CREDITS = 1_000n; // one member, 1 SOL
export const WHALE_CREDITS = 100_000n; // one member, 100 SOL
export const KRILL_COUNT = 11;

// Floor square root. Newton's method seeded from the bit length, which is an
// upper bound on sqrt(n), so the sequence falls monotonically to the floor.
export function isqrt(n) {
  if (n < 2n) return n;
  const bits = BigInt(n.toString(2).length);
  let x = 1n << ((bits + 1n) / 2n);
  for (;;) {
    const y = (x + n / x) / 2n;
    if (y >= x) return x;
    x = y;
  }
}

// floor(sqrt(credits) * 1e9) == isqrt(credits * 1e18), taken on a voter's
// cumulative credits, never per transaction.
export const votesFor = (credits) => isqrt(BigInt(credits) * VOTE_SCALE * VOTE_SCALE);

// n whole votes cost n² credits; the n-th one costs 2n − 1 more.
export const creditsForVotes = (n) => BigInt(n) * BigInt(n);
export const nthVoteCost = (n) => 2n * BigInt(n) - 1n;

export const creditsFromLamports = (lamports) => BigInt(lamports) / LAMPORTS_PER_CREDIT;

// Fixed-point votes to a decimal string with all 9 places: 31.622776601.
export function votesText(votes) {
  const v = BigInt(votes);
  const sign = v < 0n ? "-" : "";
  const a = v < 0n ? -v : v;
  return `${sign}${groups(a / VOTE_SCALE)}.${(a % VOTE_SCALE).toString().padStart(9, "0")}`;
}

export const groups = (n) => BigInt(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const solText = (credits) => {
  const lamports = BigInt(credits) * LAMPORTS_PER_CREDIT;
  const whole = lamports / LAMPORTS_PER_SOL;
  const rest = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return rest ? `${groups(whole)}.${rest}` : groups(whole);
};

// The two sides of the bench: k krill of 1,000 credits each against one whale.
// Votes are summed per side, each voter's square root taken on their own credits.
export function tally(k) {
  const krillEach = votesFor(KRILL_CREDITS);
  const krill = BigInt(k) * krillEach;
  const whale = votesFor(WHALE_CREDITS);
  return {
    k,
    krillCredits: BigInt(k) * KRILL_CREDITS,
    whaleCredits: WHALE_CREDITS,
    krillEach,
    krill,
    whale,
    lead: krill - whale,
    winner: krill > whale ? "krill" : krill < whale ? "whale" : "tie",
  };
}
