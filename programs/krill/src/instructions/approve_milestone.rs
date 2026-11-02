use anchor_lang::prelude::*;

use crate::{
    constants::{DAO_SEED, ESCROW_SEED, PROPOSAL_SEED},
    events::MilestoneReleased,
    state::{Dao, Escrow, EscrowState, Proposal},
};

/// The council accepts a delivery and the contractor is paid on the spot.
#[derive(Accounts)]
pub struct ApproveMilestone<'info> {
    pub council: Signer<'info>,
    #[account(
        seeds = [DAO_SEED, dao.authority.as_ref(), dao.name.as_bytes()],
        bump = dao.bump,
        has_one = council
    )]
    pub dao: Account<'info, Dao>,
    /// Mutable because releasing the last milestone completes the proposal.
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, dao.key().as_ref(), &proposal.index.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, proposal.key().as_ref()],
        bump = escrow.bump,
        has_one = contractor
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub contractor: SystemAccount<'info>,
}

/// `Submitted → Released`: pays the milestone and, if it was the last one,
/// completes both the escrow and the proposal.
pub fn handle_approve_milestone(ctx: Context<ApproveMilestone>, index: u8) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let amount = escrow.approve(index)?;
    if escrow.state == EscrowState::Completed {
        ctx.accounts.proposal.complete()?;
    }

    // The escrow is program-owned, so lamports move without a CPI.
    escrow.sub_lamports(amount)?;
    ctx.accounts.contractor.add_lamports(amount)?;

    emit!(MilestoneReleased {
        escrow: escrow.key(),
        index,
        amount,
    });
    Ok(())
}
