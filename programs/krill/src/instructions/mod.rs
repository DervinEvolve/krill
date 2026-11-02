//! One file per instruction: the account constraints that authorise it and a
//! short handler that delegates the rules to the state types.

pub mod approve_milestone;
pub mod cancel_escrow;
pub mod cast_vote;
pub mod create_proposal;
pub mod deposit;
pub mod execute;
pub mod finalize;
pub mod initialize_dao;
pub mod join;
pub mod reject_milestone;
pub mod submit_milestone;

pub use approve_milestone::*;
pub use cancel_escrow::*;
pub use cast_vote::*;
pub use create_proposal::*;
pub use deposit::*;
pub use execute::*;
pub use finalize::*;
pub use initialize_dao::*;
pub use join::*;
pub use reject_milestone::*;
pub use submit_milestone::*;
