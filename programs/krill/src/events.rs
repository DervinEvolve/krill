//! Events let indexers rebuild every tally and payout from logs alone,
//! without polling accounts.

use anchor_lang::prelude::*;

/// A new proposal opened for voting.
#[event]
pub struct ProposalCreated {
    pub proposal: Pubkey,
    pub index: u64,
    pub amount: u64,
}

/// One per `cast_vote`. `credits` are the credits burned by this transaction
/// and `votes` the voting power it added, so summing `votes` per side
/// reproduces the on-chain tally exactly.
#[event]
pub struct VoteCast {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub credits: u64,
    pub votes: u128,
    pub support: bool,
}

/// Voting closed; `passed` is the outcome, with the final tallies.
#[event]
pub struct ProposalFinalized {
    pub proposal: Pubkey,
    pub passed: bool,
    pub for_votes: u128,
    pub against_votes: u128,
}

/// The council approved a milestone and `amount` lamports reached the contractor.
#[event]
pub struct MilestoneReleased {
    pub escrow: Pubkey,
    pub index: u8,
    pub amount: u64,
}
