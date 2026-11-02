use anchor_lang::prelude::*;

use crate::{
    constants::{BPS_DENOMINATOR, LAMPORTS_PER_CREDIT, MAX_NAME_LEN},
    errors::KrillError,
    state::Member,
};

/// A DAO and its treasury in one account: pooled lamports sit on this PDA, so
/// there is no separate vault to secure. Seeds: `["dao", authority, name]`.
#[account]
#[derive(InitSpace)]
pub struct Dao {
    /// Created the DAO. Part of the address, but holds no special powers.
    pub authority: Pubkey,
    /// Reviews milestone deliveries and may cancel an escrow.
    pub council: Pubkey,
    /// Human-readable name, also a PDA seed so one authority can run many DAOs.
    #[max_len(MAX_NAME_LEN)]
    pub name: String,

    /// Seconds a proposal stays open for voting.
    pub voting_period: i64,
    /// Share of all credits ever minted that a proposal must burn to be valid.
    pub quorum_bps: u16,

    /// Spendable treasury. Tracked apart from the account balance so the
    /// rent-exempt reserve can never be voted away.
    pub pooled_lamports: u64,
    /// Credits ever minted; the base for quorum snapshots.
    pub total_credits: u64,
    /// Members who have joined; informational, never used for voting power.
    pub member_count: u64,
    /// Index of the next proposal, also its PDA seed.
    pub proposal_count: u64,
    pub bump: u8,
}

impl Dao {
    /// Books a deposit that has already been, or is about to be, transferred
    /// onto this account: the lamports join the pool and the member receives
    /// one credit per `LAMPORTS_PER_CREDIT`. Sub-credit dust still joins the
    /// pool. Shared by `join` and `deposit` so the two can never drift apart.
    pub fn credit_deposit(&mut self, member: &mut Member, lamports: u64) -> Result<()> {
        require!(lamports >= LAMPORTS_PER_CREDIT, KrillError::DepositTooSmall);
        let credits = lamports / LAMPORTS_PER_CREDIT; // divisor is a non-zero constant

        self.pooled_lamports = self
            .pooled_lamports
            .checked_add(lamports)
            .ok_or(KrillError::Overflow)?;
        self.total_credits = self
            .total_credits
            .checked_add(credits)
            .ok_or(KrillError::Overflow)?;
        member.credits = member
            .credits
            .checked_add(credits)
            .ok_or(KrillError::Overflow)?;
        member.deposited = member
            .deposited
            .checked_add(lamports)
            .ok_or(KrillError::Overflow)?;
        Ok(())
    }

    /// Credits a proposal must collect, frozen at creation so later deposits
    /// cannot move the goalposts mid-vote.
    pub fn quorum_credits(&self) -> u64 {
        // total_credits < 2^64 and quorum_bps <= 10_000 < 2^14, so the product
        // fits in u128, and dividing by 10_000 brings it back to at most
        // total_credits, so the fallback is unreachable.
        let quorum = u128::from(self.total_credits) * u128::from(self.quorum_bps)
            / u128::from(BPS_DENOMINATOR);
        u64::try_from(quorum).unwrap_or(self.total_credits)
    }

    /// Hands out the next proposal index (its PDA seed) and advances the counter.
    pub fn next_proposal_index(&mut self) -> Result<u64> {
        let index = self.proposal_count;
        self.proposal_count = index.checked_add(1).ok_or(KrillError::Overflow)?;
        Ok(index)
    }

    /// Takes `lamports` out of the spendable pool before they leave the account.
    pub fn withdraw_from_pool(&mut self, lamports: u64) -> Result<()> {
        self.pooled_lamports = self
            .pooled_lamports
            .checked_sub(lamports)
            .ok_or(KrillError::InsufficientTreasury)?;
        Ok(())
    }

    /// Puts lamports that came back onto the account into the spendable pool.
    pub fn return_to_pool(&mut self, lamports: u64) -> Result<()> {
        self.pooled_lamports = self
            .pooled_lamports
            .checked_add(lamports)
            .ok_or(KrillError::Overflow)?;
        Ok(())
    }
}
