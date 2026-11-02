use anchor_lang::prelude::*;

use crate::{
    constants::{MEMBER_SEED, PROPOSAL_SEED, VOTE_SEED},
    events::VoteCast,
    state::{Member, Proposal, VoteReceipt},
};

/// Burns voice credits for votes on one side of a proposal.
#[derive(Accounts)]
pub struct CastVote<'info> {
    /// Pays the receipt rent on a first vote.
    #[account(mut)]
    pub voter: Signer<'info>,
    /// Seeds prove the voter is a member of the proposal's DAO.
    #[account(
        mut,
        seeds = [MEMBER_SEED, proposal.dao.as_ref(), voter.key().as_ref()],
        bump = member.bump
    )]
    pub member: Account<'info, Member>,
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, proposal.dao.as_ref(), &proposal.index.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    /// Created on the first vote and topped up on later ones, so the square
    /// root always applies to the voter's cumulative credits.
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + VoteReceipt::INIT_SPACE,
        seeds = [VOTE_SEED, proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub receipt: Account<'info, VoteReceipt>,
    pub system_program: Program<'info, System>,
}

/// Checks the window, burns the credits and adds the quadratic vote delta to
/// the tally.
pub fn handle_cast_vote(ctx: Context<CastVote>, credits: u64, support: bool) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    proposal.require_voting_open(Clock::get()?.unix_timestamp)?;
    ctx.accounts.member.spend_credits(credits)?;

    let receipt = &mut ctx.accounts.receipt;
    if receipt.is_fresh() {
        receipt.proposal = proposal.key();
        receipt.voter = ctx.accounts.voter.key();
        receipt.bump = ctx.bumps.receipt;
    }
    let votes = receipt.top_up(support, credits)?;
    proposal.tally(support, credits, votes)?;

    emit!(VoteCast {
        proposal: proposal.key(),
        voter: receipt.voter,
        credits,
        votes,
        support,
    });
    Ok(())
}
