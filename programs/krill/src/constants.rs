//! Units, limits and PDA seeds. Everything a client needs to derive addresses
//! or convert lamports into voting power lives here and is exported in the IDL.

use anchor_lang::prelude::*;

/// Lamports that buy one voice credit (0.001 SOL). Coarse enough that credit
/// counts stay small and readable, fine enough that a 1 SOL member gets 1_000.
#[constant]
pub const LAMPORTS_PER_CREDIT: u64 = 1_000_000;

/// Votes are fixed-point with 9 decimals, so `1.5` votes is `1_500_000_000`.
#[constant]
pub const VOTE_SCALE: u128 = 1_000_000_000;

/// DAO names are a PDA seed, and a single seed may not exceed 32 bytes.
#[constant]
pub const MAX_NAME_LEN: u8 = 32;

/// Titles are stored inline in the proposal; 64 bytes fits a headline.
#[constant]
pub const MAX_TITLE_LEN: u8 = 64;

/// Upper bound on milestones per proposal; keeps escrow accounts fixed-size.
#[constant]
pub const MAX_MILESTONES: u8 = 8;

/// Basis points in 100%, the denominator for `quorum_bps`.
#[constant]
pub const BPS_DENOMINATOR: u64 = 10_000;

/// PDA seed prefixes, one per account type, so addresses never collide.
#[constant]
pub const DAO_SEED: &[u8] = b"dao";

#[constant]
pub const MEMBER_SEED: &[u8] = b"member";

#[constant]
pub const PROPOSAL_SEED: &[u8] = b"proposal";

#[constant]
pub const VOTE_SEED: &[u8] = b"vote";

#[constant]
pub const ESCROW_SEED: &[u8] = b"escrow";
