//! Integer-only quadratic voting math.
//!
//! Floats are banned on-chain: results must be bit-identical on every
//! validator, and fixed-point integers make rounding explicit (always down,
//! never in the voter's favour).

use crate::constants::VOTE_SCALE;

/// Floor square root of a u128. Newton's method seeded from the bit length,
/// which is an upper bound on sqrt(n), so the sequence is monotonically
/// decreasing and terminates in at most ~7 iterations for u128 input.
///
/// Overflow: the seed is at most `2^64`, every later `x` is smaller, and
/// `n / x <= n / sqrt(n) < 2^64`, so `x + n / x <= 2^65` fits easily in u128.
pub fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let bits = 128 - n.leading_zeros(); // 1..=128 because n >= 2
    let mut x = 1u128 << bits.div_ceil(2); // 2^ceil(bits/2) >= sqrt(n); shift <= 64
    loop {
        let y = (x + n / x) / 2; // x >= 1 and sum <= 2^65 (see above)
        if y >= x {
            return x;
        }
        x = y;
    }
}

/// Votes bought by `credits`, as fixed-point with VOTE_SCALE decimals:
/// floor( sqrt(credits) * VOTE_SCALE ) == isqrt(credits * VOTE_SCALE²).
/// credits ≤ 2^64 and VOTE_SCALE² < 2^60, so the product is < 2^124: no overflow.
pub fn votes_for(credits: u64) -> u128 {
    isqrt(u128::from(credits) * VOTE_SCALE * VOTE_SCALE)
}

/// Inverse helper for UIs/tests: credits needed for `whole_votes` votes = votes².
pub fn credits_for_whole_votes(whole_votes: u64) -> Option<u64> {
    whole_votes.checked_mul(whole_votes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::{fs, path::Path};

    /// `r` is the floor square root of `n` iff `r² <= n < (r + 1)²`.
    fn is_floor_sqrt(n: u128, r: u128) -> bool {
        let below = r.checked_mul(r).is_some_and(|sq| sq <= n);
        let above = (r + 1).checked_mul(r + 1).is_none_or(|sq| sq > n);
        below && above
    }

    #[test]
    fn isqrt_is_exact_for_every_n_up_to_2_pow_20() {
        for n in 0..=(1u128 << 20) {
            assert!(is_floor_sqrt(n, isqrt(n)), "isqrt({n}) = {}", isqrt(n));
        }
    }

    #[test]
    fn isqrt_handles_edge_cases() {
        let fixed = [0, 1, 2, 3, 4, u128::from(u64::MAX), u128::MAX];
        let powers = (0..128).flat_map(|k| {
            let p = 1u128 << k;
            [p - 1, p, p + 1]
        });
        for n in fixed.into_iter().chain(powers) {
            assert!(is_floor_sqrt(n, isqrt(n)), "isqrt({n}) = {}", isqrt(n));
        }
        assert_eq!(isqrt(u128::MAX), u128::from(u64::MAX));
    }

    #[test]
    fn isqrt_is_exact_on_and_just_below_perfect_squares() {
        let samples = (0..64).map(|k| 1u64 << k).chain([
            3,
            7,
            10,
            999_983,
            4_294_967_291,
            u64::MAX / 3,
            u64::MAX - 1,
            u64::MAX,
        ]);
        for k in samples.map(u128::from) {
            assert_eq!(isqrt(k * k), k);
            assert_eq!(isqrt(k * k - 1), k - 1);
        }
    }

    #[test]
    fn votes_for_matches_known_square_roots() {
        let cases: [(u64, u128); 8] = [
            (0, 0),
            (1, 1_000_000_000),
            (2, 1_414_213_562),
            (4, 2_000_000_000),
            (100, 10_000_000_000),
            (1_000, 31_622_776_601),
            (100_000, 316_227_766_016),
            (u64::MAX, 4_294_967_295_999_999_999),
        ];
        for (credits, votes) in cases {
            assert_eq!(votes_for(credits), votes, "votes_for({credits})");
        }
    }

    #[test]
    fn credits_for_whole_votes_inverts_votes_for() {
        for votes in [0, 1, 2, 10, 31, 316, u64::from(u32::MAX)] {
            let credits = credits_for_whole_votes(votes);
            assert_eq!(credits.map(votes_for), Some(u128::from(votes) * VOTE_SCALE));
        }
        assert_eq!(credits_for_whole_votes(u64::from(u32::MAX) + 1), None);
    }

    proptest! {
        #[test]
        fn isqrt_bounds_hold_for_random_u128(n in any::<u128>()) {
            prop_assert!(is_floor_sqrt(n, isqrt(n)));
        }

        #[test]
        fn isqrt_is_exact_on_random_perfect_squares(k in 1..=u64::MAX) {
            let k = u128::from(k);
            prop_assert_eq!(isqrt(k * k), k);
            prop_assert_eq!(isqrt(k * k - 1), k - 1);
        }

        #[test]
        fn isqrt_is_monotonic(a in any::<u128>(), b in any::<u128>()) {
            let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
            prop_assert!(isqrt(lo) <= isqrt(hi));
        }

        /// Splitting a budget among more people never loses votes: this is
        /// the anti-whale property quadratic voting is built on.
        #[test]
        fn splitting_credits_never_loses_votes(a in 0..=u64::MAX / 2, b in 0..=u64::MAX / 2) {
            prop_assert!(votes_for(a) + votes_for(b) >= votes_for(a + b));
        }
    }

    /// Cheap, honest guard for the "no floating point" rule: scan every
    /// source file of the crate. The needles are assembled with `concat!` so
    /// this file does not trip its own check.
    #[test]
    fn program_source_contains_no_floating_point() {
        const FLOAT_TYPES: [&str; 2] = [concat!("f", "32"), concat!("f", "64")];
        let mut offenders = Vec::new();
        collect_float_uses(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("src"),
            &FLOAT_TYPES,
            &mut offenders,
        );
        assert!(offenders.is_empty(), "floating point found: {offenders:?}");
    }

    fn collect_float_uses(dir: &Path, needles: &[&str], offenders: &mut Vec<String>) {
        let entries = fs::read_dir(dir).expect("src directory is readable");
        for path in entries.map(|entry| entry.expect("directory entry").path()) {
            if path.is_dir() {
                collect_float_uses(&path, needles, offenders);
                continue;
            }
            let source = fs::read_to_string(&path).expect("source file is UTF-8");
            for (line_no, line) in source.lines().enumerate() {
                if needles.iter().any(|needle| line.contains(needle)) {
                    offenders.push(format!("{}:{}", path.display(), line_no + 1));
                }
            }
        }
    }
}
