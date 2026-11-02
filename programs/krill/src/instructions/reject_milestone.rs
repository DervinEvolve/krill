use anchor_lang::prelude::*;

use crate::{
    constants::{DAO_SEED, ESCROW_SEED},
    state::{Dao, Escrow},
};

/// The council sends a delivery back for rework.
#[derive(Accounts)]
pub struct RejectMilestone<'info> {
    pub council: Signer<'info>,
    #[account(
        seeds = [DAO_SEED, dao.authority.as_ref(), dao.name.as_bytes()],
        bump = dao.bump,
        has_one = council
    )]
    pub dao: Account<'info, Dao>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.proposal.as_ref()],
        bump = escrow.bump,
        has_one = dao
    )]
    pub escrow: Account<'info, Escrow>,
}

/// `Submitted → Pending`; the contractor may submit again.
pub fn handle_reject_milestone(ctx: Context<RejectMilestone>, index: u8) -> Result<()> {
    ctx.accounts.escrow.reject(index)
}
