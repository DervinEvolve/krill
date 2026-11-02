use anchor_lang::prelude::*;

use crate::{errors::KrillError, math::votes_for};

/// One voter's cumulative stake in one proposal.
/// Seeds: `["vote", proposal, voter]`.
///
/// The receipt exists so that the square root is always taken over the
/// voter's *total* credits. Without it, voting 1 credit a thousand times
/// would buy 1_000 votes instead of the ~31.6 that 1_000 credits are worth.
#[account]
#[derive(InitSpace)]
pub struct VoteReceipt {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    /// Side chosen on the first vote; fixed for the receipt's lifetime.
    pub support: bool,
    /// Credits this voter has burned on this proposal so far.
    pub credits: u64,
    /// `votes_for(credits)`: the voter's current weight in the tally.
    pub votes: u128,
    pub bump: u8,
}

impl VoteReceipt {
    /// A receipt created by `init_if_needed` is all zeroes; every real vote
    /// burns at least one credit, so zero credits means "never voted".
    pub fn is_fresh(&self) -> bool {
        self.credits == 0
    }

    /// Adds `credits` on `support`'s side and returns the votes this adds to
    /// the tally: `votes_for(total_after) - votes_for(total_before)`.
    pub fn top_up(&mut self, support: bool, credits: u64) -> Result<u128> {
        require!(
            self.is_fresh() || self.support == support,
            KrillError::CannotSwitchSides
        );
        let total = self
            .credits
            .checked_add(credits)
            .ok_or(KrillError::Overflow)?;
        let votes = votes_for(total);
        let added = votes - self.votes; // votes_for is monotonic and total > self.credits

        self.support = support;
        self.credits = total;
        self.votes = votes;
        Ok(added)
    }
}
