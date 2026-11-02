use anchor_lang::prelude::*;

use crate::{constants::PROPOSAL_SEED, events::ProposalFinalized, state::Proposal};

/// Closes voting once the deadline has passed. Permissionless: the outcome is
/// fully determined by on-chain data, so anyone may crank it.
#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, proposal.dao.as_ref(), &proposal.index.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
}

/// Records `Passed` or `Rejected` and publishes the final tally.
pub fn handle_finalize(ctx: Context<Finalize>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let passed = proposal.finalize(Clock::get()?.unix_timestamp)?;

    emit!(ProposalFinalized {
        proposal: proposal.key(),
        passed,
        for_votes: proposal.for_votes,
        against_votes: proposal.against_votes,
    });
    Ok(())
}
