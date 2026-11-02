// Anchor 1.2.2 expands `#[instruction(name: String)]` into a type-check fn
// taking `&String`; the lint fires on generated code, not on ours.
#![allow(clippy::ptr_arg)]

use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_DENOMINATOR, DAO_SEED, MAX_NAME_LEN},
    errors::KrillError,
    state::Dao,
};

/// Creates a DAO whose account doubles as its treasury.
#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeDao<'info> {
    /// Pays rent and becomes part of the DAO's address.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Dao::INIT_SPACE,
        seeds = [DAO_SEED, authority.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub dao: Account<'info, Dao>,
    pub system_program: Program<'info, System>,
}

/// Validates the governance parameters and writes an empty DAO.
pub fn handle_initialize_dao(
    ctx: Context<InitializeDao>,
    name: String,
    council: Pubkey,
    voting_period: i64,
    quorum_bps: u16,
) -> Result<()> {
    require!(
        !name.is_empty() && name.len() <= usize::from(MAX_NAME_LEN),
        KrillError::NameTooLong
    );
    require!(voting_period > 0, KrillError::InvalidVotingPeriod);
    require!(
        u64::from(quorum_bps) <= BPS_DENOMINATOR,
        KrillError::InvalidQuorum
    );

    ctx.accounts.dao.set_inner(Dao {
        authority: ctx.accounts.authority.key(),
        council,
        name,
        voting_period,
        quorum_bps,
        pooled_lamports: 0,
        total_credits: 0,
        member_count: 0,
        proposal_count: 0,
        bump: ctx.bumps.dao,
    });
    Ok(())
}
