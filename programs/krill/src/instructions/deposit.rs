use anchor_lang::{prelude::*, system_program};

use crate::{
    constants::{DAO_SEED, MEMBER_SEED},
    state::{Dao, Member},
};

/// Adds lamports to the treasury and voice credits to an existing member.
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        mut,
        seeds = [DAO_SEED, dao.authority.as_ref(), dao.name.as_bytes()],
        bump = dao.bump
    )]
    pub dao: Account<'info, Dao>,
    /// Seeds tie the membership to both this DAO and the signing wallet.
    #[account(
        mut,
        seeds = [MEMBER_SEED, dao.key().as_ref(), wallet.key().as_ref()],
        bump = member.bump
    )]
    pub member: Account<'info, Member>,
    pub system_program: Program<'info, System>,
}

/// Books the deposit with the same rules as `join`, then moves the lamports.
pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let dao = &mut ctx.accounts.dao;
    dao.credit_deposit(&mut ctx.accounts.member, amount)?;

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.wallet.to_account_info(),
                to: dao.to_account_info(),
            },
        ),
        amount,
    )
}
