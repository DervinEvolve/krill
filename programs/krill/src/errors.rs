//! Every way an instruction can be refused. Codes are `6000 + variant index`,
//! so the order of variants is part of the public interface: append only.

use anchor_lang::prelude::*;

#[error_code]
pub enum KrillError {
    #[msg("DAO name must be between 1 and 32 bytes")]
    NameTooLong,
    #[msg("Proposal title must be between 1 and 64 bytes")]
    TitleTooLong,
    #[msg("Voting period must be a positive number of seconds")]
    InvalidVotingPeriod,
    #[msg("Quorum must be between 0 and 10000 basis points")]
    InvalidQuorum,
    #[msg("Deposit at least 1_000_000 lamports (one voice credit)")]
    DepositTooSmall,
    #[msg("Provide 1 to 8 milestones, each with a non-zero lamport amount")]
    InvalidMilestones,
    #[msg("The treasury does not hold enough unallocated lamports for this amount")]
    InsufficientTreasury,
    #[msg("This action is not allowed in the account's current state")]
    InvalidState,
    #[msg("Voting on this proposal has ended; call finalize instead")]
    VotingClosed,
    #[msg("Voting is still open; wait until the voting period ends")]
    VotingStillOpen,
    #[msg("Vote with at least one credit and no more than you hold")]
    InsufficientCredits,
    #[msg("You already voted on the other side of this proposal")]
    CannotSwitchSides,
    #[msg("Milestones are delivered in order; the previous one must be released first")]
    MilestoneOutOfOrder,
    #[msg("Milestone index is past the last milestone of this escrow")]
    MilestoneIndexOutOfRange,
    #[msg("Arithmetic overflow; the amounts involved are unrealistically large")]
    Overflow,
}
