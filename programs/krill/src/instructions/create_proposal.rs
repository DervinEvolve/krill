use anchor_lang::prelude::*;

use crate::{
    constants::{DAO_SEED, MAX_MILESTONES, MAX_TITLE_LEN, MEMBER_SEED, PROPOSAL_SEED},
    errors::KrillError,
    events::ProposalCreated,
    state::{Dao, Member, Proposal, ProposalState},
};

/// Opens a spending proposal for voting. Only members may propose, which the
/// `member` PDA proves without any extra check.
#[derive(Accounts)]
pub struct CreateProposal<'info> {
    /// Pays the proposal rent.
    #[account(mut)]
    pub proposer: Signer<'info>,
    /// Mutable because it hands out the proposal index.
    #[account(
        mut,
        seeds = [DAO_SEED, dao.authority.as_ref(), dao.name.as_bytes()],
        bump = dao.bump
    )]
    pub dao: Account<'info, Dao>,
    #[account(
        seeds = [MEMBER_SEED, dao.key().as_ref(), proposer.key().as_ref()],
        bump = member.bump
    )]
    pub member: Account<'info, Member>,
    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [PROPOSAL_SEED, dao.key().as_ref(), &dao.proposal_count.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

/// Validates the request against the treasury, snapshots quorum and starts
/// the voting clock.
pub fn handle_create_proposal(
    ctx: Context<CreateProposal>,
    title: String,
    contractor: Pubkey,
    milestones: Vec<u64>,
) -> Result<()> {
    require!(
        !title.is_empty() && title.len() <= usize::from(MAX_TITLE_LEN),
        KrillError::TitleTooLong
    );
    require!(
        (1..=usize::from(MAX_MILESTONES)).contains(&milestones.len())
            && milestones.iter().all(|&m| m > 0),
        KrillError::InvalidMilestones
    );
    let amount = milestones
        .iter()
        .try_fold(0u64, |sum, &m| sum.checked_add(m))
        .ok_or(KrillError::Overflow)?;

    let dao = &mut ctx.accounts.dao;
    require!(
        amount <= dao.pooled_lamports,
        KrillError::InsufficientTreasury
    );
    let voting_ends_at = Clock::get()?
        .unix_timestamp
        .checked_add(dao.voting_period)
        .ok_or(KrillError::Overflow)?;

    let proposal = &mut ctx.accounts.proposal;
    proposal.set_inner(Proposal {
        dao: dao.key(),
        proposer: ctx.accounts.proposer.key(),
        contractor,
        index: dao.next_proposal_index()?,
        title,
        amount,
        milestones,
        voting_ends_at,
        quorum_credits: dao.quorum_credits(),
        credits_spent: 0,
        for_votes: 0,
        against_votes: 0,
        state: ProposalState::Voting,
        bump: ctx.bumps.proposal,
    });

    emit!(ProposalCreated {
        proposal: proposal.key(),
        index: proposal.index,
        amount,
    });
    Ok(())
}
