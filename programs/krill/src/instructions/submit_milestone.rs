use anchor_lang::prelude::*;

use crate::{constants::ESCROW_SEED, state::Escrow};

/// The contractor declares milestone `index` delivered.
#[derive(Accounts)]
pub struct SubmitMilestone<'info> {
    pub contractor: Signer<'info>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.proposal.as_ref()],
        bump = escrow.bump,
        has_one = contractor
    )]
    pub escrow: Account<'info, Escrow>,
}

/// `Pending → Submitted`, in milestone order.
pub fn handle_submit_milestone(ctx: Context<SubmitMilestone>, index: u8) -> Result<()> {
    ctx.accounts.escrow.submit(index)
}
