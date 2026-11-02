//! Krill: pool SOL into a DAO, vote on spending with quadratic voting, and
//! pay the winning contractor through a milestone escrow.
//!
//! Each entry point below is a one-line delegation; the account constraints
//! live in `instructions/` and the rules live on the account types in `state/`.

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;

declare_id!("4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA");

// A security.txt embedded in the program bytes, so explorers and auditors
// who find the program on chain know where the source is and how to report
// a vulnerability. The full policy is SECURITY.md at the repo root.
#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Krill",
    project_url: "https://github.com/DervinEvolve/krill",
    contacts: "link:https://github.com/DervinEvolve/krill/security/advisories/new",
    policy: "https://github.com/DervinEvolve/krill/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/DervinEvolve/krill"
}

#[program]
pub mod krill {
    use super::*;

    /// Creates a DAO (and its treasury) with its governance parameters.
    pub fn initialize_dao(
        ctx: Context<InitializeDao>,
        name: String,
        council: Pubkey,
        voting_period: i64,
        quorum_bps: u16,
    ) -> Result<()> {
        initialize_dao::handle_initialize_dao(ctx, name, council, voting_period, quorum_bps)
    }

    /// Becomes a member with a first deposit of at least one credit.
    pub fn join(ctx: Context<Join>, deposit: u64) -> Result<()> {
        join::handle_join(ctx, deposit)
    }

    /// Adds lamports to the treasury in exchange for more voice credits.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit::handle_deposit(ctx, amount)
    }

    /// Opens a milestone-based spending proposal for voting.
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        contractor: Pubkey,
        milestones: Vec<u64>,
    ) -> Result<()> {
        create_proposal::handle_create_proposal(ctx, title, contractor, milestones)
    }

    /// Burns credits for quadratic votes for or against a proposal.
    pub fn cast_vote(ctx: Context<CastVote>, credits: u64, support: bool) -> Result<()> {
        cast_vote::handle_cast_vote(ctx, credits, support)
    }

    /// Closes voting after the deadline and records the outcome.
    pub fn finalize(ctx: Context<Finalize>) -> Result<()> {
        finalize::handle_finalize(ctx)
    }

    /// Locks a passed proposal's funds in its escrow.
    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        execute::handle_execute(ctx)
    }

    /// Contractor marks the next milestone as delivered.
    pub fn submit_milestone(ctx: Context<SubmitMilestone>, index: u8) -> Result<()> {
        submit_milestone::handle_submit_milestone(ctx, index)
    }

    /// Council accepts a delivery and pays the contractor.
    pub fn approve_milestone(ctx: Context<ApproveMilestone>, index: u8) -> Result<()> {
        approve_milestone::handle_approve_milestone(ctx, index)
    }

    /// Council sends a delivery back for rework.
    pub fn reject_milestone(ctx: Context<RejectMilestone>, index: u8) -> Result<()> {
        reject_milestone::handle_reject_milestone(ctx, index)
    }

    /// Council cancels the escrow and refunds the unpaid remainder to the pool.
    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        cancel_escrow::handle_cancel_escrow(ctx)
    }
}
