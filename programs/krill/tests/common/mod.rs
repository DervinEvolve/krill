//! Shared fixture for the Krill integration tests.
//!
//! Every test binary compiles its own copy of this module and uses a different
//! subset of it, so unused-item and unused-import warnings are expected and
//! silenced here.
#![allow(dead_code, unused_imports)]
// Helpers return LiteSVM's own result type unchanged so tests can inspect the
// failed transaction's logs; boxing it would only hide that type.
#![allow(clippy::result_large_err)]

use anchor_lang::{
    prelude::Clock,
    solana_program::{instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, AnchorDeserialize, Discriminator, Event, InstructionData, ToAccountMetas,
};
use base64::Engine;
use krill::{
    constants::{DAO_SEED, ESCROW_SEED, MEMBER_SEED, PROPOSAL_SEED, VOTE_SEED},
    state::{Dao, Escrow, Member, Proposal, VoteReceipt},
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use solana_message::{Message, VersionedMessage};
use solana_transaction::{versioned::VersionedTransaction, InstructionError, TransactionError};

pub use anchor_lang::{error::ErrorCode as AnchorErrorCode, prelude::Pubkey};
pub use krill::{
    constants::{LAMPORTS_PER_CREDIT, VOTE_SCALE},
    errors::KrillError,
    math::votes_for,
    state::{EscrowState, MilestoneStatus, ProposalState},
};
pub use solana_keypair::Keypair;
pub use solana_signer::Signer;

pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
/// LiteSVM's fee for a transaction with one signature.
pub const TX_FEE: u64 = 5_000;
/// Name of the DAO every `KrillTestEnv::new()` starts with.
pub const DAO_NAME: &str = "krill-test";
/// One hour: long enough to vote in, and crossed instantly with `warp`.
pub const VOTING_PERIOD: i64 = 3_600;
/// 10% of all minted credits must be spent for a proposal to count.
pub const QUORUM_BPS: u16 = 1_000;

/// What every transaction helper returns.
pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

/// PDA derivations, mirroring the seeds in `programs/krill/src/instructions`.
pub mod pda {
    use super::*;

    fn find(seeds: &[&[u8]]) -> Pubkey {
        Pubkey::find_program_address(seeds, &krill::ID).0
    }

    pub fn dao(authority: &Pubkey, name: &str) -> Pubkey {
        find(&[DAO_SEED, authority.as_ref(), name.as_bytes()])
    }

    pub fn member(dao: &Pubkey, wallet: &Pubkey) -> Pubkey {
        find(&[MEMBER_SEED, dao.as_ref(), wallet.as_ref()])
    }

    pub fn proposal(dao: &Pubkey, index: u64) -> Pubkey {
        find(&[PROPOSAL_SEED, dao.as_ref(), &index.to_le_bytes()])
    }

    pub fn vote_receipt(proposal: &Pubkey, voter: &Pubkey) -> Pubkey {
        find(&[VOTE_SEED, proposal.as_ref(), voter.as_ref()])
    }

    pub fn escrow(proposal: &Pubkey) -> Pubkey {
        find(&[ESCROW_SEED, proposal.as_ref()])
    }
}

/// Instruction builders: Anchor's generated `instruction` and `accounts`
/// structs, with every PDA derived from the arguments.
pub mod ix {
    use super::*;
    use krill::{accounts, instruction};

    /// Any Krill instruction from Anchor's generated `instruction` and
    /// `accounts` structs, for tests that hand-pick (or forge) the accounts.
    pub fn build(data: impl InstructionData, accounts: impl ToAccountMetas) -> Instruction {
        Instruction::new_with_bytes(krill::ID, &data.data(), accounts.to_account_metas(None))
    }

    pub fn initialize_dao(
        authority: &Pubkey,
        name: &str,
        council: &Pubkey,
        voting_period: i64,
        quorum_bps: u16,
    ) -> Instruction {
        build(
            instruction::InitializeDao {
                name: name.to_owned(),
                council: *council,
                voting_period,
                quorum_bps,
            },
            accounts::InitializeDao {
                authority: *authority,
                dao: pda::dao(authority, name),
                system_program: system_program::ID,
            },
        )
    }

    pub fn join(dao: &Pubkey, wallet: &Pubkey, deposit: u64) -> Instruction {
        build(
            instruction::Join { deposit },
            accounts::Join {
                wallet: *wallet,
                dao: *dao,
                member: pda::member(dao, wallet),
                system_program: system_program::ID,
            },
        )
    }

    pub fn deposit(dao: &Pubkey, wallet: &Pubkey, amount: u64) -> Instruction {
        build(
            instruction::Deposit { amount },
            accounts::Deposit {
                wallet: *wallet,
                dao: *dao,
                member: pda::member(dao, wallet),
                system_program: system_program::ID,
            },
        )
    }

    pub fn create_proposal(
        dao: &Pubkey,
        index: u64,
        proposer: &Pubkey,
        title: &str,
        contractor: &Pubkey,
        milestones: &[u64],
    ) -> Instruction {
        build(
            instruction::CreateProposal {
                title: title.to_owned(),
                contractor: *contractor,
                milestones: milestones.to_vec(),
            },
            accounts::CreateProposal {
                proposer: *proposer,
                dao: *dao,
                member: pda::member(dao, proposer),
                proposal: pda::proposal(dao, index),
                system_program: system_program::ID,
            },
        )
    }

    pub fn cast_vote(
        dao: &Pubkey,
        proposal: &Pubkey,
        voter: &Pubkey,
        credits: u64,
        support: bool,
    ) -> Instruction {
        build(
            instruction::CastVote { credits, support },
            accounts::CastVote {
                voter: *voter,
                member: pda::member(dao, voter),
                proposal: *proposal,
                receipt: pda::vote_receipt(proposal, voter),
                system_program: system_program::ID,
            },
        )
    }

    pub fn finalize(proposal: &Pubkey) -> Instruction {
        build(
            instruction::Finalize {},
            accounts::Finalize {
                proposal: *proposal,
            },
        )
    }

    pub fn execute(dao: &Pubkey, proposal: &Pubkey, payer: &Pubkey) -> Instruction {
        build(
            instruction::Execute {},
            accounts::Execute {
                payer: *payer,
                dao: *dao,
                proposal: *proposal,
                escrow: pda::escrow(proposal),
                system_program: system_program::ID,
            },
        )
    }

    pub fn submit_milestone(proposal: &Pubkey, contractor: &Pubkey, index: u8) -> Instruction {
        build(
            instruction::SubmitMilestone { index },
            accounts::SubmitMilestone {
                contractor: *contractor,
                escrow: pda::escrow(proposal),
            },
        )
    }

    pub fn approve_milestone(
        dao: &Pubkey,
        proposal: &Pubkey,
        council: &Pubkey,
        contractor: &Pubkey,
        index: u8,
    ) -> Instruction {
        build(
            instruction::ApproveMilestone { index },
            accounts::ApproveMilestone {
                council: *council,
                dao: *dao,
                proposal: *proposal,
                escrow: pda::escrow(proposal),
                contractor: *contractor,
            },
        )
    }

    pub fn reject_milestone(
        dao: &Pubkey,
        proposal: &Pubkey,
        council: &Pubkey,
        index: u8,
    ) -> Instruction {
        build(
            instruction::RejectMilestone { index },
            accounts::RejectMilestone {
                council: *council,
                dao: *dao,
                escrow: pda::escrow(proposal),
            },
        )
    }

    pub fn cancel_escrow(dao: &Pubkey, proposal: &Pubkey, council: &Pubkey) -> Instruction {
        build(
            instruction::CancelEscrow {},
            accounts::CancelEscrow {
                council: *council,
                dao: *dao,
                proposal: *proposal,
                escrow: pda::escrow(proposal),
            },
        )
    }
}

/// A proposal that has passed its vote, with the contractor who will deliver it.
pub struct PassedProposal {
    pub address: Pubkey,
    pub contractor: Keypair,
    pub milestones: Vec<u64>,
}

/// LiteSVM with the Krill program loaded, a funded DAO authority and council,
/// and (unless built with `without_dao`) a DAO already initialized.
/// A keypair derived from one byte, for tests whose numbers must not move
/// between runs (PDA bumps, and with them compute units, depend on the keys).
pub fn seeded_keypair(seed: u8) -> Keypair {
    Keypair::new_from_array([seed; 32])
}

pub struct KrillTestEnv {
    pub svm: LiteSVM,
    pub authority: Keypair,
    pub council: Keypair,
    pub dao: Pubkey,
}

impl KrillTestEnv {
    /// Fresh chain with the default DAO (`DAO_NAME`, `VOTING_PERIOD`, `QUORUM_BPS`).
    pub fn new() -> Self {
        let mut env = Self::without_dao();
        env.initialize_dao(DAO_NAME, VOTING_PERIOD, QUORUM_BPS)
            .expect("default DAO initializes");
        env
    }

    /// Fresh chain with the program loaded but no DAO yet; `dao` points at the
    /// address the default DAO would have.
    pub fn without_dao() -> Self {
        Self::on(LiteSVM::new())
    }

    /// Like `without_dao`, on a caller-built chain (for example one with a
    /// different feature set).
    pub fn on(svm: LiteSVM) -> Self {
        Self::on_with_keys(svm, Keypair::new(), Keypair::new())
    }

    /// Like `on`, with caller-chosen authority and council keys. Fixed keys
    /// pin every PDA bump, which makes compute-unit measurements repeatable.
    pub fn on_with_keys(mut svm: LiteSVM, authority: Keypair, council: Keypair) -> Self {
        let program = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/krill.so"));
        svm.add_program(krill::ID, program)
            .expect("krill.so loads; run `anchor build` first");
        for wallet in [&authority, &council] {
            svm.airdrop(&wallet.pubkey(), 10 * LAMPORTS_PER_SOL)
                .expect("airdrop to fixture wallet");
        }
        let dao = pda::dao(&authority.pubkey(), DAO_NAME);
        Self {
            svm,
            authority,
            council,
            dao,
        }
    }

    /// Sends `ixs` in one transaction; the first signer pays the fee.
    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
        send_tx(&mut self.svm, ixs, signers)
    }

    /// Sends `ixs` signed (and paid) by the DAO authority.
    pub fn send_as_authority(&mut self, ixs: &[Instruction]) -> TxResult {
        send_tx(&mut self.svm, ixs, &[&self.authority])
    }

    /// Sends `ixs` signed (and paid) by the DAO council.
    pub fn send_as_council(&mut self, ixs: &[Instruction]) -> TxResult {
        send_tx(&mut self.svm, ixs, &[&self.council])
    }

    /// A new keypair holding `lamports`.
    pub fn funded_keypair(&mut self, lamports: u64) -> Keypair {
        self.fund(Keypair::new(), lamports)
    }

    /// Airdrops `lamports` to `keypair` and hands it back.
    pub fn fund(&mut self, keypair: Keypair, lamports: u64) -> Keypair {
        self.svm
            .airdrop(&keypair.pubkey(), lamports)
            .expect("airdrop to keypair");
        keypair
    }

    /// Plain system transfer of `lamports` from `from` (who also pays the fee).
    pub fn transfer(&mut self, from: &Keypair, to: &Pubkey, lamports: u64) -> TxResult {
        let ix = system_instruction::transfer(&from.pubkey(), to, lamports);
        self.send(&[ix], &[from])
    }

    /// Overwrites the balance of an existing account, bypassing every program.
    /// Only for proving what the runtime does if bookkeeping ever drifted.
    pub fn set_lamports(&mut self, address: &Pubkey, lamports: u64) {
        let mut account = self.svm.get_account(address).expect("account exists");
        account.lamports = lamports;
        self.svm
            .set_account(*address, account)
            .expect("account is writable");
    }

    /// Moves the on-chain clock forward by `seconds`.
    pub fn warp(&mut self, seconds: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp += seconds;
        self.svm.set_sysvar(&clock);
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    /// Moves the clock to the first second at which `proposal` can be finalized.
    pub fn warp_past_voting(&mut self, proposal: &Pubkey) {
        let remaining = self.proposal(proposal).voting_ends_at - self.now();
        self.warp(remaining.max(0));
    }

    // ---- readers -------------------------------------------------------

    pub fn lamports(&self, address: &Pubkey) -> u64 {
        self.svm.get_balance(address).unwrap_or(0)
    }

    pub fn rent_exempt_minimum(&self, address: &Pubkey) -> u64 {
        let account = self.svm.get_account(address).expect("account exists");
        self.svm
            .minimum_balance_for_rent_exemption(account.data.len())
    }

    pub fn exists(&self, address: &Pubkey) -> bool {
        self.svm.get_account(address).is_some()
    }

    fn read<T: AccountDeserialize>(&self, address: &Pubkey) -> T {
        let account = self
            .svm
            .get_account(address)
            .unwrap_or_else(|| panic!("account {address} exists"));
        T::try_deserialize(&mut account.data.as_slice())
            .unwrap_or_else(|err| panic!("account {address} deserializes: {err}"))
    }

    pub fn dao_state(&self) -> Dao {
        self.read(&self.dao)
    }

    pub fn member(&self, wallet: &Pubkey) -> Member {
        self.read(&pda::member(&self.dao, wallet))
    }

    pub fn proposal(&self, proposal: &Pubkey) -> Proposal {
        self.read(proposal)
    }

    pub fn receipt(&self, proposal: &Pubkey, voter: &Pubkey) -> VoteReceipt {
        self.read(&pda::vote_receipt(proposal, voter))
    }

    pub fn escrow(&self, proposal: &Pubkey) -> Escrow {
        self.read(&pda::escrow(proposal))
    }

    // ---- one helper per instruction, against the default DAO ------------

    /// Initializes a DAO owned by the fixture authority and council.
    pub fn initialize_dao(&mut self, name: &str, voting_period: i64, quorum_bps: u16) -> TxResult {
        let ix = ix::initialize_dao(
            &self.authority.pubkey(),
            name,
            &self.council.pubkey(),
            voting_period,
            quorum_bps,
        );
        send_tx(&mut self.svm, &[ix], &[&self.authority])
    }

    pub fn join(&mut self, wallet: &Keypair, deposit: u64) -> TxResult {
        let ix = ix::join(&self.dao, &wallet.pubkey(), deposit);
        self.send(&[ix], &[wallet])
    }

    pub fn deposit(&mut self, wallet: &Keypair, amount: u64) -> TxResult {
        let ix = ix::deposit(&self.dao, &wallet.pubkey(), amount);
        self.send(&[ix], &[wallet])
    }

    /// A funded wallet that has joined the default DAO with `deposit` lamports.
    pub fn new_member(&mut self, deposit: u64) -> Keypair {
        let wallet = self.funded_keypair(deposit + LAMPORTS_PER_SOL);
        self.join(&wallet, deposit).expect("member joins");
        wallet
    }

    /// Creates the next proposal; returns its address alongside the result.
    pub fn create_proposal(
        &mut self,
        proposer: &Keypair,
        contractor: &Pubkey,
        milestones: &[u64],
    ) -> (Pubkey, TxResult) {
        let index = self.dao_state().proposal_count;
        let ix = ix::create_proposal(
            &self.dao,
            index,
            &proposer.pubkey(),
            "Build the krill feeder",
            contractor,
            milestones,
        );
        (
            pda::proposal(&self.dao, index),
            self.send(&[ix], &[proposer]),
        )
    }

    pub fn vote(
        &mut self,
        voter: &Keypair,
        proposal: &Pubkey,
        credits: u64,
        support: bool,
    ) -> TxResult {
        let ix = ix::cast_vote(&self.dao, proposal, &voter.pubkey(), credits, support);
        self.send(&[ix], &[voter])
    }

    /// Finalizes `proposal`; the DAO authority pays the fee, as anyone may.
    pub fn finalize(&mut self, proposal: &Pubkey) -> TxResult {
        send_tx(&mut self.svm, &[ix::finalize(proposal)], &[&self.authority])
    }

    /// Executes `proposal`; the DAO authority pays the fee and escrow rent.
    pub fn execute(&mut self, proposal: &Pubkey) -> TxResult {
        let ix = ix::execute(&self.dao, proposal, &self.authority.pubkey());
        send_tx(&mut self.svm, &[ix], &[&self.authority])
    }

    pub fn submit_milestone(
        &mut self,
        proposal: &Pubkey,
        contractor: &Keypair,
        index: u8,
    ) -> TxResult {
        let ix = ix::submit_milestone(proposal, &contractor.pubkey(), index);
        self.send(&[ix], &[contractor])
    }

    /// Approves milestone `index` as the DAO council.
    pub fn approve_milestone(&mut self, proposal: &Pubkey, index: u8) -> TxResult {
        let ix = self.approve_milestone_ix(&self.council.pubkey(), proposal, index);
        send_tx(&mut self.svm, &[ix], &[&self.council])
    }

    /// `approve_milestone` with `signer` claiming to be the council.
    pub fn approve_milestone_ix(
        &self,
        signer: &Pubkey,
        proposal: &Pubkey,
        index: u8,
    ) -> Instruction {
        let contractor = self.proposal(proposal).contractor;
        ix::approve_milestone(&self.dao, proposal, signer, &contractor, index)
    }

    /// Rejects milestone `index` as the DAO council.
    pub fn reject_milestone(&mut self, proposal: &Pubkey, index: u8) -> TxResult {
        let ix = ix::reject_milestone(&self.dao, proposal, &self.council.pubkey(), index);
        send_tx(&mut self.svm, &[ix], &[&self.council])
    }

    /// Cancels the escrow of `proposal` as the DAO council.
    pub fn cancel_escrow(&mut self, proposal: &Pubkey) -> TxResult {
        let ix = ix::cancel_escrow(&self.dao, proposal, &self.council.pubkey());
        send_tx(&mut self.svm, &[ix], &[&self.council])
    }

    // ---- scenarios -----------------------------------------------------

    /// Funds the treasury, creates a proposal paying `milestones` to a new
    /// contractor, votes it through with every credit minted and finalizes it.
    pub fn passed_proposal(&mut self, milestones: &[u64]) -> PassedProposal {
        let total: u64 = milestones.iter().sum();
        let backer = self.new_member(total.max(LAMPORTS_PER_SOL));
        let contractor = self.funded_keypair(LAMPORTS_PER_SOL);
        let (address, created) = self.create_proposal(&backer, &contractor.pubkey(), milestones);
        created.expect("proposal is created");
        let credits = self.member(&backer.pubkey()).credits;
        self.vote(&backer, &address, credits, true)
            .expect("backer votes for");
        self.warp_past_voting(&address);
        self.finalize(&address).expect("proposal finalizes");
        assert_eq!(self.proposal(&address).state, ProposalState::Passed);
        PassedProposal {
            address,
            contractor,
            milestones: milestones.to_vec(),
        }
    }

    /// A passed proposal whose funds are already locked in escrow.
    pub fn escrowed_proposal(&mut self, milestones: &[u64]) -> PassedProposal {
        let passed = self.passed_proposal(milestones);
        self.execute(&passed.address).expect("proposal executes");
        passed
    }
}

impl Default for KrillTestEnv {
    fn default() -> Self {
        Self::new()
    }
}

/// Signs with `signers` (the first one pays the fee) and sends `ixs` as one
/// transaction. The blockhash is rotated first so that sending the same
/// instruction twice is a new transaction rather than a rejected duplicate.
fn send_tx(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
    svm.expire_blockhash();
    let payer = signers.first().expect("at least one signer").pubkey();
    let message = Message::new_with_blockhash(ixs, Some(&payer), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), signers)
        .expect("every required signer is provided");
    svm.send_transaction(tx)
}

/// Every event of type `E` that a successful transaction emitted, decoded
/// from its `Program data:` log lines.
pub fn events<E: Event + Discriminator + AnchorDeserialize>(meta: &TransactionMetadata) -> Vec<E> {
    meta.logs
        .iter()
        .filter_map(|line| line.strip_prefix("Program data: "))
        .filter_map(|data| base64::engine::general_purpose::STANDARD.decode(data).ok())
        .filter_map(|bytes| {
            let body = bytes.strip_prefix(E::DISCRIMINATOR)?;
            E::try_from_slice(body).ok()
        })
        .collect()
}

fn custom_error_code(result: &TxResult) -> Option<u32> {
    match result {
        Err(failed) => match &failed.err {
            TransactionError::InstructionError(_, InstructionError::Custom(code)) => Some(*code),
            _ => None,
        },
        Ok(_) => None,
    }
}

fn describe(result: &TxResult) -> String {
    match result {
        Ok(meta) => format!("transaction succeeded\n{}", meta.pretty_logs()),
        Err(failed) => format!("{:?}\n{}", failed.err, failed.meta.pretty_logs()),
    }
}

/// Asserts that the transaction failed with exactly `expected` (`6000 + n`).
#[track_caller]
pub fn assert_krill_error(result: TxResult, expected: KrillError) {
    let name = format!("{expected:?}");
    let code = u32::from(expected);
    assert_eq!(
        custom_error_code(&result),
        Some(code),
        "expected KrillError::{name} ({code}), got {}",
        describe(&result)
    );
}

/// Asserts that the transaction failed with Anchor framework error `expected`
/// (account constraint violations, missing accounts and the like).
#[track_caller]
pub fn assert_anchor_error(result: TxResult, expected: AnchorErrorCode) {
    let name = format!("{expected:?}");
    let code = u32::from(expected);
    assert_eq!(
        custom_error_code(&result),
        Some(code),
        "expected anchor ErrorCode::{name} ({code}), got {}",
        describe(&result)
    );
}
