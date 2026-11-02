use anchor_lang::prelude::*;

use crate::{
    constants::{MAX_MILESTONES, MAX_TITLE_LEN},
    errors::KrillError,
};

/// Lifecycle of a proposal. See the state machine in the README: every arrow
/// is one method on [`Proposal`], so each transition is checked in one place.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ProposalState {
    Voting,
    Passed,
    Rejected,
    Escrowed,
    Completed,
    Cancelled,
}

/// A request to pay `contractor` from the treasury, in milestones, if the
/// members vote for it. Seeds: `["proposal", dao, index.to_le_bytes()]`.
#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub dao: Pubkey,
    pub proposer: Pubkey,
    /// Receives the milestone payouts once the proposal is executed.
    pub contractor: Pubkey,
    pub index: u64,
    #[max_len(MAX_TITLE_LEN)]
    pub title: String,

    /// Lamports requested; always equal to the sum of `milestones`.
    pub amount: u64,
    /// Lamports paid per milestone, in delivery order.
    #[max_len(MAX_MILESTONES)]
    pub milestones: Vec<u64>,

    /// Unix timestamp at which voting closes and `finalize` becomes possible.
    pub voting_ends_at: i64,
    /// Credits that must be burned for the result to count, frozen at creation.
    pub quorum_credits: u64,
    /// Every credit burned on this proposal, on either side.
    pub credits_spent: u64,
    /// Tallies in `VOTE_SCALE` fixed point.
    pub for_votes: u128,
    pub against_votes: u128,

    pub state: ProposalState,
    pub bump: u8,
}

impl Proposal {
    /// Votes are accepted only while the proposal is `Voting` and its
    /// deadline has not passed.
    pub fn require_voting_open(&self, now: i64) -> Result<()> {
        require!(
            self.state == ProposalState::Voting,
            KrillError::InvalidState
        );
        require!(now < self.voting_ends_at, KrillError::VotingClosed);
        Ok(())
    }

    /// Adds a vote's burned credits and the voting power they bought to the
    /// tally. `votes` is the delta computed by the voter's receipt.
    pub fn tally(&mut self, support: bool, credits: u64, votes: u128) -> Result<()> {
        self.credits_spent = self
            .credits_spent
            .checked_add(credits)
            .ok_or(KrillError::Overflow)?;
        let side = if support {
            &mut self.for_votes
        } else {
            &mut self.against_votes
        };
        *side = side.checked_add(votes).ok_or(KrillError::Overflow)?;
        Ok(())
    }

    /// `Voting → Passed | Rejected` once the deadline has passed. A proposal
    /// passes only with quorum and a strict majority of votes; a tie fails.
    /// Returns whether it passed.
    pub fn finalize(&mut self, now: i64) -> Result<bool> {
        require!(
            self.state == ProposalState::Voting,
            KrillError::InvalidState
        );
        require!(now >= self.voting_ends_at, KrillError::VotingStillOpen);
        let passed =
            self.credits_spent >= self.quorum_credits && self.for_votes > self.against_votes;
        self.state = if passed {
            ProposalState::Passed
        } else {
            ProposalState::Rejected
        };
        Ok(passed)
    }

    /// `Passed → Escrowed`, when `execute` locks the funds.
    pub fn begin_escrow(&mut self) -> Result<()> {
        self.transition(ProposalState::Passed, ProposalState::Escrowed)
    }

    /// `Escrowed → Completed`, when the last milestone is released.
    pub fn complete(&mut self) -> Result<()> {
        self.transition(ProposalState::Escrowed, ProposalState::Completed)
    }

    /// `Escrowed → Cancelled`, when the council cancels the escrow.
    pub fn cancel(&mut self) -> Result<()> {
        self.transition(ProposalState::Escrowed, ProposalState::Cancelled)
    }

    fn transition(&mut self, from: ProposalState, to: ProposalState) -> Result<()> {
        require!(self.state == from, KrillError::InvalidState);
        self.state = to;
        Ok(())
    }
}
