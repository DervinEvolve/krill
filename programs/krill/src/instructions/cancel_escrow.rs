use anchor_lang::prelude::*;

use crate::{
    constants::{DAO_SEED, ESCROW_SEED, PROPOSAL_SEED},
    state::{Dao, Escrow, Proposal},
};

/// The council stops the work and the unpaid remainder goes back to the pool.
#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    pub council: Signer<'info>,
    #[account(
        mut,
        seeds = [DAO_SEED, dao.authority.as_ref(), dao.name.as_bytes()],
        bump = dao.bump,
        has_one = council
    )]
    pub dao: Account<'info, Dao>,
    #[account(
        mut,
        seeds = [PROPOSAL_SEED, dao.key().as_ref(), &proposal.index.to_le_bytes()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(
        mut,
        seeds = [ESCROW_SEED, proposal.key().as_ref()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, Escrow>,
}

/// `Active → Cancelled` and `Escrowed → Cancelled`; unreleased lamports
/// return to the treasury and become spendable again.
pub fn handle_cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
    let returned = ctx.accounts.escrow.cancel()?;
    ctx.accounts.proposal.cancel()?;

    let dao = &mut ctx.accounts.dao;
    // Both accounts belong to this program, so lamports move without a CPI.
    ctx.accounts.escrow.sub_lamports(returned)?;
    dao.add_lamports(returned)?;
    dao.return_to_pool(returned)
}
