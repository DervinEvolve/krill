use anchor_lang::prelude::*;

use crate::{
    constants::{DAO_SEED, ESCROW_SEED, PROPOSAL_SEED},
    state::{Dao, Escrow, EscrowState, Milestone, MilestoneStatus, Proposal},
};

/// Moves a passed proposal's funds from the treasury into its own escrow.
/// Permissionless: whoever pays the escrow rent may trigger it.
#[derive(Accounts)]
pub struct Execute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [DAO_SEED, dao.authority.as_ref(), dao.name.as_bytes()],
        bump = dao.bump
    )]
    pub dao: Account<'info, Dao>,
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, dao.key().as_ref(), &proposal.index.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    /// `init` also makes a second execute impossible.
    #[account(
        init,
        payer = payer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [ESCROW_SEED, proposal.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

/// `Passed → Escrowed`: locks `amount` lamports with every milestone pending.
pub fn handle_execute(ctx: Context<Execute>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    proposal.begin_escrow()?;
    let dao = &mut ctx.accounts.dao;
    dao.withdraw_from_pool(proposal.amount)?;

    let escrow = &mut ctx.accounts.escrow;
    escrow.set_inner(Escrow {
        proposal: proposal.key(),
        contractor: proposal.contractor,
        dao: dao.key(),
        milestones: proposal
            .milestones
            .iter()
            .map(|&amount| Milestone {
                amount,
                status: MilestoneStatus::Pending,
            })
            .collect(),
        released_lamports: 0,
        state: EscrowState::Active,
        bump: ctx.bumps.escrow,
    });

    // Both accounts belong to this program, so lamports move without a CPI.
    dao.sub_lamports(proposal.amount)?;
    escrow.add_lamports(proposal.amount)?;
    Ok(())
}
