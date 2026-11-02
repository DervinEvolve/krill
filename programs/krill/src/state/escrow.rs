use anchor_lang::prelude::*;

use crate::{constants::MAX_MILESTONES, errors::KrillError};

/// Delivery status of one milestone. Rejection sends a submission back to
/// `Pending` so the contractor can resubmit.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MilestoneStatus {
    Pending,
    Submitted,
    Released,
}

/// A slice of the escrowed amount, paid when the council approves delivery.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub struct Milestone {
    pub amount: u64,
    pub status: MilestoneStatus,
}

/// Lifecycle of an escrow: it ends either paid out or cancelled.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum EscrowState {
    Active,
    Completed,
    Cancelled,
}

/// Funds locked for a passed proposal. The account holds the lamports itself
/// (on top of its rent reserve), so once executed the money is out of the
/// treasury's reach and can only go to the contractor or back to the pool.
/// Seeds: `["escrow", proposal]`.
#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub proposal: Pubkey,
    pub contractor: Pubkey,
    pub dao: Pubkey,
    #[max_len(MAX_MILESTONES)]
    pub milestones: Vec<Milestone>,
    /// Lamports already paid to the contractor.
    pub released_lamports: u64,
    pub state: EscrowState,
    pub bump: u8,
}

impl Escrow {
    /// Contractor marks milestone `index` as delivered: `Pending → Submitted`.
    /// Milestones are delivered strictly in order.
    pub fn submit(&mut self, index: u8) -> Result<()> {
        self.require_active()?;
        // `index - 1` is only evaluated when index > 0.
        let in_order = index == 0 || self.status_of(index - 1) == Some(MilestoneStatus::Released);
        let milestone = self.milestone_mut(index)?;
        require!(
            milestone.status == MilestoneStatus::Pending,
            KrillError::InvalidState
        );
        require!(in_order, KrillError::MilestoneOutOfOrder);
        milestone.status = MilestoneStatus::Submitted;
        Ok(())
    }

    /// Council accepts milestone `index`: `Submitted → Released`. Returns the
    /// lamports to pay out; completes the escrow when nothing is left.
    pub fn approve(&mut self, index: u8) -> Result<u64> {
        self.require_active()?;
        let milestone = self.milestone_mut(index)?;
        milestone.advance(MilestoneStatus::Submitted, MilestoneStatus::Released)?;
        let amount = milestone.amount;

        self.released_lamports = self
            .released_lamports
            .checked_add(amount)
            .ok_or(KrillError::Overflow)?;
        if self
            .milestones
            .iter()
            .all(|m| m.status == MilestoneStatus::Released)
        {
            self.state = EscrowState::Completed;
        }
        Ok(amount)
    }

    /// Council sends a submission back: `Submitted → Pending`.
    pub fn reject(&mut self, index: u8) -> Result<()> {
        self.require_active()?;
        self.milestone_mut(index)?
            .advance(MilestoneStatus::Submitted, MilestoneStatus::Pending)
    }

    /// Council stops the work: `Active → Cancelled`. Returns the unreleased
    /// lamports, which go back to the treasury.
    pub fn cancel(&mut self) -> Result<u64> {
        self.require_active()?;
        self.state = EscrowState::Cancelled;
        self.milestones
            .iter()
            .filter(|m| m.status != MilestoneStatus::Released)
            .try_fold(0u64, |sum, m| sum.checked_add(m.amount))
            .ok_or_else(|| error!(KrillError::Overflow))
    }

    fn require_active(&self) -> Result<()> {
        require!(self.state == EscrowState::Active, KrillError::InvalidState);
        Ok(())
    }

    fn status_of(&self, index: u8) -> Option<MilestoneStatus> {
        self.milestones.get(usize::from(index)).map(|m| m.status)
    }

    fn milestone_mut(&mut self, index: u8) -> Result<&mut Milestone> {
        self.milestones
            .get_mut(usize::from(index))
            .ok_or_else(|| error!(KrillError::MilestoneIndexOutOfRange))
    }
}

impl Milestone {
    fn advance(&mut self, from: MilestoneStatus, to: MilestoneStatus) -> Result<()> {
        require!(self.status == from, KrillError::InvalidState);
        self.status = to;
        Ok(())
    }
}
