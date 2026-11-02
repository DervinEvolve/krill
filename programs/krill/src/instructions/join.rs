use anchor_lang::{prelude::*, system_program};

use crate::{
    constants::{DAO_SEED, MEMBER_SEED},
    errors::KrillError,
    state::{Dao, Member},
};

/// Creates a membership and makes the first deposit in one step, so no
/// member ever exists without voting power.
#[derive(Accounts)]
pub struct Join<'info> {
    /// The new member; pays the deposit and the membership rent.
    #[account(mut)]
    pub wallet: Signer<'info>,
    /// Receives the deposit: the DAO account is the treasury.
    #[account(
        mut,
        seeds = [DAO_SEED, dao.authority.as_ref(), dao.name.as_bytes()],
        bump = dao.bump
    )]
    pub dao: Account<'info, Dao>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Member::INIT_SPACE,
        seeds = [MEMBER_SEED, dao.key().as_ref(), wallet.key().as_ref()],
        bump
    )]
    pub member: Account<'info, Member>,
    pub system_program: Program<'info, System>,
}

/// Registers the member, books the deposit, then moves the lamports.
pub fn handle_join(ctx: Context<Join>, deposit: u64) -> Result<()> {
    let dao = &mut ctx.accounts.dao;
    let member = &mut ctx.accounts.member;
    member.dao = dao.key();
    member.wallet = ctx.accounts.wallet.key();
    member.bump = ctx.bumps.member;

    dao.member_count = dao
        .member_count
        .checked_add(1)
        .ok_or(KrillError::Overflow)?;
    dao.credit_deposit(member, deposit)?;

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.wallet.to_account_info(),
                to: dao.to_account_info(),
            },
        ),
        deposit,
    )
}
