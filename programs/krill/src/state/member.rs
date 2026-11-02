use anchor_lang::prelude::*;

use crate::errors::KrillError;

/// A wallet's stake in one DAO. Seeds: `["member", dao, wallet]`.
#[account]
#[derive(InitSpace)]
pub struct Member {
    pub dao: Pubkey,
    /// The only signer allowed to deposit or vote with this membership.
    pub wallet: Pubkey,
    /// Unspent voice credits. Voting burns them; they never come back.
    pub credits: u64,
    /// Lifetime lamports deposited, for display and audits.
    pub deposited: u64,
    pub bump: u8,
}

impl Member {
    /// Burns `credits` from this member's balance. Credits are never refunded,
    /// which is what makes quadratic pricing bite: votes cost something real.
    pub fn spend_credits(&mut self, credits: u64) -> Result<()> {
        require!(
            credits > 0 && credits <= self.credits,
            KrillError::InsufficientCredits
        );
        self.credits -= credits; // credits <= self.credits checked above
        Ok(())
    }
}
