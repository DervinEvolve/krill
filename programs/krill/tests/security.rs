//! Security suite: one test per attack attempted against the program, plus
//! the accounting invariants that every instruction must preserve. Each test
//! name states the property it proves; `docs/SECURITY.md` maps the audit
//! checklist onto these names.

mod common;

use anchor_lang::{
    solana_program::{instruction::Instruction, system_program},
    Space,
};
use common::*;
use krill::{
    accounts,
    events::{MilestoneReleased, ProposalCreated, ProposalFinalized, VoteCast},
    instruction,
    state::{Dao, Member, VoteReceipt},
};
use litesvm::LiteSVM;
use proptest::prelude::*;
use solana_transaction::{InstructionError, TransactionError};

const SOL: u64 = LAMPORTS_PER_SOL;
const MILESTONES: [u64; 3] = [SOL / 10, SOL / 5, SOL / 2];

// ---- helpers ---------------------------------------------------------------

/// A second DAO on the same chain, run by a different authority and council.
struct OtherDao {
    authority: Keypair,
    council: Keypair,
    dao: Pubkey,
}

fn second_dao(env: &mut KrillTestEnv) -> OtherDao {
    let authority = env.funded_keypair(10 * SOL);
    let council = env.funded_keypair(10 * SOL);
    let ix = ix::initialize_dao(
        &authority.pubkey(),
        "second",
        &council.pubkey(),
        VOTING_PERIOD,
        QUORUM_BPS,
    );
    env.send(&[ix], &[&authority])
        .expect("second DAO initializes");
    let dao = pda::dao(&authority.pubkey(), "second");
    OtherDao {
        authority,
        council,
        dao,
    }
}

/// Points the fixture at `other` (and `other` at the fixture's DAO), so the
/// scenario helpers can build state in either DAO. Call again to swap back.
fn switch(env: &mut KrillTestEnv, other: &mut OtherDao) {
    std::mem::swap(&mut env.authority, &mut other.authority);
    std::mem::swap(&mut env.council, &mut other.council);
    std::mem::swap(&mut env.dao, &mut other.dao);
}

/// A proposal still in its voting window, with a member who has credits left.
fn voting_proposal(env: &mut KrillTestEnv) -> (Keypair, Pubkey) {
    let backer = env.new_member(SOL);
    let (proposal, created) = env.create_proposal(&backer, &Keypair::new().pubkey(), &[SOL / 2]);
    created.expect("proposal is created");
    (backer, proposal)
}

fn cast_vote_ix(
    voter: &Pubkey,
    member: Pubkey,
    proposal: &Pubkey,
    receipt: Pubkey,
    credits: u64,
) -> Instruction {
    ix::build(
        instruction::CastVote {
            credits,
            support: true,
        },
        accounts::CastVote {
            voter: *voter,
            member,
            proposal: *proposal,
            receipt,
            system_program: system_program::ID,
        },
    )
}

fn create_proposal_ix(
    dao: &Pubkey,
    proposer: &Pubkey,
    member: Pubkey,
    proposal: Pubkey,
    title: &str,
    contractor: &Pubkey,
    milestones: &[u64],
) -> Instruction {
    ix::build(
        instruction::CreateProposal {
            title: title.to_owned(),
            contractor: *contractor,
            milestones: milestones.to_vec(),
        },
        accounts::CreateProposal {
            proposer: *proposer,
            dao: *dao,
            member,
            proposal,
            system_program: system_program::ID,
        },
    )
}

/// `dao.lamports == rent + pooled_lamports`: the treasury invariant.
#[track_caller]
fn assert_treasury_balanced(env: &KrillTestEnv) {
    let dao = env.dao_state();
    assert_eq!(
        env.lamports(&env.dao),
        env.rent_exempt_minimum(&env.dao) + dao.pooled_lamports,
        "DAO balance must be exactly rent + pooled_lamports"
    );
}

/// Asserts the transaction failed because the runtime refused to leave an
/// account below its rent-exempt minimum.
#[track_caller]
fn assert_rent_refused(result: TxResult) {
    match result {
        Err(failed) => assert!(
            matches!(
                failed.err,
                TransactionError::InsufficientFundsForRent { .. }
            ),
            "expected InsufficientFundsForRent, got {:?}\n{}",
            failed.err,
            failed.meta.pretty_logs()
        ),
        Ok(meta) => panic!("transaction succeeded\n{}", meta.pretty_logs()),
    }
}

// ---- access control ----------------------------------------------------------

#[test]
fn attacker_cannot_approve_milestone_without_council() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");
    let escrow_lamports = env.lamports(&pda::escrow(&passed.address));

    let attacker = env.funded_keypair(SOL);
    let ix = env.approve_milestone_ix(&attacker.pubkey(), &passed.address, 0);
    assert_anchor_error(
        env.send(&[ix], &[&attacker]),
        AnchorErrorCode::ConstraintHasOne,
    );
    assert_eq!(env.lamports(&pda::escrow(&passed.address)), escrow_lamports);
}

#[test]
fn attacker_cannot_reject_milestone_without_council() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");

    let attacker = env.funded_keypair(SOL);
    let ix = ix::reject_milestone(&env.dao, &passed.address, &attacker.pubkey(), 0);
    assert_anchor_error(
        env.send(&[ix], &[&attacker]),
        AnchorErrorCode::ConstraintHasOne,
    );
    assert_eq!(
        env.escrow(&passed.address).milestones[0].status,
        MilestoneStatus::Submitted
    );
}

#[test]
fn attacker_cannot_cancel_escrow_without_council() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let attacker = env.funded_keypair(SOL);
    let ix = ix::cancel_escrow(&env.dao, &passed.address, &attacker.pubkey());
    assert_anchor_error(
        env.send(&[ix], &[&attacker]),
        AnchorErrorCode::ConstraintHasOne,
    );
    assert_eq!(env.escrow(&passed.address).state, EscrowState::Active);
}

#[test]
fn attacker_cannot_submit_milestone_for_the_contractor() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let attacker = env.funded_keypair(SOL);
    assert_anchor_error(
        env.submit_milestone(&passed.address, &attacker, 0),
        AnchorErrorCode::ConstraintHasOne,
    );
    assert_eq!(
        env.escrow(&passed.address).milestones[0].status,
        MilestoneStatus::Pending
    );
}

#[test]
fn dao_authority_has_no_special_powers() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");
    let authority = env.authority.pubkey();

    let approve = env.approve_milestone_ix(&authority, &passed.address, 0);
    let reject = ix::reject_milestone(&env.dao, &passed.address, &authority, 0);
    let cancel = ix::cancel_escrow(&env.dao, &passed.address, &authority);
    for ix in [approve, reject, cancel] {
        let result = env.send_as_authority(&[ix]);
        assert_anchor_error(result, AnchorErrorCode::ConstraintHasOne);
    }
}

#[test]
fn approve_cannot_pay_anyone_but_the_escrow_contractor() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");

    let thief = Keypair::new().pubkey();
    let ix = ix::approve_milestone(&env.dao, &passed.address, &env.council.pubkey(), &thief, 0);
    assert_anchor_error(
        env.send_as_council(&[ix]),
        AnchorErrorCode::ConstraintHasOne,
    );
    assert_eq!(env.lamports(&thief), 0);
}

#[test]
fn member_cannot_vote_with_another_members_account() {
    let mut env = KrillTestEnv::new();
    let (victim, proposal) = voting_proposal(&mut env);
    let attacker = env.funded_keypair(SOL);

    // The attacker signs but points at the victim's membership.
    let ix = cast_vote_ix(
        &attacker.pubkey(),
        pda::member(&env.dao, &victim.pubkey()),
        &proposal,
        pda::vote_receipt(&proposal, &attacker.pubkey()),
        100,
    );
    assert_anchor_error(
        env.send(&[ix], &[&attacker]),
        AnchorErrorCode::ConstraintSeeds,
    );
    assert_eq!(env.member(&victim.pubkey()).credits, 1_000);
    assert_eq!(env.proposal(&proposal).credits_spent, 0);
}

#[test]
fn member_cannot_vote_into_another_voters_receipt() {
    let mut env = KrillTestEnv::new();
    let (victim, proposal) = voting_proposal(&mut env);
    env.vote(&victim, &proposal, 100, false)
        .expect("victim votes against");
    let attacker = env.new_member(SOL);

    // Topping up the victim's receipt would move the victim's side.
    let ix = cast_vote_ix(
        &attacker.pubkey(),
        pda::member(&env.dao, &attacker.pubkey()),
        &proposal,
        pda::vote_receipt(&proposal, &victim.pubkey()),
        100,
    );
    assert_anchor_error(
        env.send(&[ix], &[&attacker]),
        AnchorErrorCode::ConstraintSeeds,
    );
    assert_eq!(env.receipt(&proposal, &victim.pubkey()).credits, 100);
}

#[test]
fn vote_receipt_of_another_proposal_cannot_be_reused() {
    let mut env = KrillTestEnv::new();
    let (voter, first) = voting_proposal(&mut env);
    let (second, created) = env.create_proposal(&voter, &Keypair::new().pubkey(), &[SOL / 4]);
    created.expect("second proposal");
    env.vote(&voter, &first, 400, true)
        .expect("vote on the first proposal");

    // Reusing the first receipt on the second proposal would price the new
    // credits on top of 400 already spent elsewhere, or skip the sqrt reset.
    let ix = cast_vote_ix(
        &voter.pubkey(),
        pda::member(&env.dao, &voter.pubkey()),
        &second,
        pda::vote_receipt(&first, &voter.pubkey()),
        100,
    );
    assert_anchor_error(env.send(&[ix], &[&voter]), AnchorErrorCode::ConstraintSeeds);
    assert_eq!(env.receipt(&first, &voter.pubkey()).credits, 400);
    assert_eq!(env.proposal(&second).credits_spent, 0);
}

#[test]
fn member_of_another_dao_cannot_vote() {
    let mut env = KrillTestEnv::new();
    let (_, proposal) = voting_proposal(&mut env);
    let mut other = second_dao(&mut env);
    switch(&mut env, &mut other);
    let outsider = env.new_member(SOL);
    switch(&mut env, &mut other);

    let ix = cast_vote_ix(
        &outsider.pubkey(),
        pda::member(&other.dao, &outsider.pubkey()),
        &proposal,
        pda::vote_receipt(&proposal, &outsider.pubkey()),
        100,
    );
    assert_anchor_error(
        env.send(&[ix], &[&outsider]),
        AnchorErrorCode::ConstraintSeeds,
    );
}

#[test]
fn proposer_cannot_use_a_membership_of_another_dao() {
    let mut env = KrillTestEnv::new();
    env.new_member(SOL); // funds the default treasury
    let mut other = second_dao(&mut env);
    switch(&mut env, &mut other);
    let outsider = env.new_member(SOL);
    switch(&mut env, &mut other);

    let ix = create_proposal_ix(
        &env.dao,
        &outsider.pubkey(),
        pda::member(&other.dao, &outsider.pubkey()),
        pda::proposal(&env.dao, 0),
        "Pay me",
        &outsider.pubkey(),
        &[SOL / 2],
    );
    assert_anchor_error(
        env.send(&[ix], &[&outsider]),
        AnchorErrorCode::ConstraintSeeds,
    );
    assert_eq!(env.dao_state().proposal_count, 0);
}

#[test]
fn execute_cannot_pair_a_proposal_with_another_daos_treasury() {
    let mut env = KrillTestEnv::new();
    env.new_member(5 * SOL); // a rich default DAO
    let mut other = second_dao(&mut env);
    switch(&mut env, &mut other);
    let passed = env.passed_proposal(&[SOL]);
    switch(&mut env, &mut other);
    let rich_pool = env.dao_state().pooled_lamports;

    // DAO B's passed proposal, paid from DAO A's treasury.
    let ix = ix::execute(&env.dao, &passed.address, &env.authority.pubkey());
    assert_anchor_error(
        env.send_as_authority(&[ix]),
        AnchorErrorCode::ConstraintSeeds,
    );
    assert_eq!(env.dao_state().pooled_lamports, rich_pool);
    assert!(!env.exists(&pda::escrow(&passed.address)));
}

#[test]
fn council_of_another_dao_cannot_approve_reject_or_cancel() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");
    let other = second_dao(&mut env);
    let council_b = other.council.pubkey();

    // DAO B's council, presenting DAO B (whose council it really is) next to
    // DAO A's proposal and escrow.
    let approve = ix::approve_milestone(
        &other.dao,
        &passed.address,
        &council_b,
        &passed.contractor.pubkey(),
        0,
    );
    let cancel = ix::cancel_escrow(&other.dao, &passed.address, &council_b);
    for ix in [approve, cancel] {
        assert_anchor_error(
            env.send(&[ix], &[&other.council]),
            AnchorErrorCode::ConstraintSeeds,
        );
    }
    let reject = ix::reject_milestone(&other.dao, &passed.address, &council_b, 0);
    assert_anchor_error(
        env.send(&[reject], &[&other.council]),
        AnchorErrorCode::ConstraintHasOne,
    );

    let escrow = env.escrow(&passed.address);
    assert_eq!(escrow.state, EscrowState::Active);
    assert_eq!(escrow.milestones[0].status, MilestoneStatus::Submitted);
}

#[test]
fn escrow_of_one_proposal_cannot_be_used_with_another() {
    let mut env = KrillTestEnv::new();
    let x = env.escrowed_proposal(&[SOL / 2]);
    let y = env.escrowed_proposal(&[SOL / 4]);
    env.submit_milestone(&x.address, &x.contractor, 0)
        .expect("contractor X submits");

    let council = env.council.pubkey();
    let escrow_x = pda::escrow(&x.address);
    let mut approve =
        ix::approve_milestone(&env.dao, &y.address, &council, &x.contractor.pubkey(), 0);
    approve.accounts[3].pubkey = escrow_x; // proposal Y with escrow X
    let mut cancel = ix::cancel_escrow(&env.dao, &y.address, &council);
    cancel.accounts[3].pubkey = escrow_x;

    for ix in [approve, cancel] {
        assert_anchor_error(env.send_as_council(&[ix]), AnchorErrorCode::ConstraintSeeds);
    }
    assert_eq!(env.escrow(&x.address).state, EscrowState::Active);
    assert_eq!(env.proposal(&y.address).state, ProposalState::Escrowed);
}

#[test]
fn finalize_and_execute_are_permissionless_but_single_shot() {
    let mut env = KrillTestEnv::new();
    let backer = env.new_member(SOL);
    let (proposal, created) = env.create_proposal(&backer, &Keypair::new().pubkey(), &[SOL / 2]);
    created.expect("proposal");
    env.vote(&backer, &proposal, 1_000, true).expect("vote");
    env.warp_past_voting(&proposal);

    let stranger = env.funded_keypair(SOL);
    env.send(&[ix::finalize(&proposal)], &[&stranger])
        .expect("anyone may finalize");
    assert_krill_error(
        env.send(&[ix::finalize(&proposal)], &[&stranger]),
        KrillError::InvalidState,
    );
    let execute = ix::execute(&env.dao, &proposal, &stranger.pubkey());
    env.send(std::slice::from_ref(&execute), &[&stranger])
        .expect("anyone may execute, paying the escrow rent");
    let pooled = env.dao_state().pooled_lamports;
    assert!(env.send(&[execute], &[&stranger]).is_err());
    assert_eq!(env.dao_state().pooled_lamports, pooled);
    assert_treasury_balanced(&env);
}

#[test]
fn execute_after_cancel_is_refused() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.cancel_escrow(&passed.address).expect("council cancels");
    let pooled = env.dao_state().pooled_lamports;

    assert!(env.execute(&passed.address).is_err());
    assert_eq!(env.dao_state().pooled_lamports, pooled);
    assert_eq!(
        env.proposal(&passed.address).state,
        ProposalState::Cancelled
    );
    assert_treasury_balanced(&env);
}

// ---- account validation and PDAs ---------------------------------------------

#[test]
fn system_account_cannot_stand_in_for_the_dao() {
    let mut env = KrillTestEnv::new();
    let wallet = env.funded_keypair(2 * SOL);
    let fake_dao = env.funded_keypair(SOL).pubkey();
    assert_anchor_error(
        env.send(&[ix::join(&fake_dao, &wallet.pubkey(), SOL)], &[&wallet]),
        AnchorErrorCode::AccountOwnedByWrongProgram,
    );
}

#[test]
fn account_owned_by_another_program_cannot_impersonate_a_dao() {
    let mut env = KrillTestEnv::new();
    let member = env.new_member(SOL);
    // A byte-perfect copy of the real DAO, but owned by some other program.
    let mut forged = env.svm.get_account(&env.dao).expect("dao exists");
    forged.owner = Pubkey::new_unique();
    let forged_address = Pubkey::new_unique();
    env.svm
        .set_account(forged_address, forged)
        .expect("forged account");

    let ix = ix::deposit(&forged_address, &member.pubkey(), SOL / 2);
    assert_anchor_error(
        env.send(&[ix], &[&member]),
        AnchorErrorCode::AccountOwnedByWrongProgram,
    );
}

#[test]
fn krill_accounts_of_the_wrong_type_are_refused() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let wallet = env.funded_keypair(2 * SOL);

    // A Member account where a Dao is expected.
    let member_as_dao = pda::member(&env.dao, &env.proposal(&passed.address).proposer);
    assert_anchor_error(
        env.send(
            &[ix::join(&member_as_dao, &wallet.pubkey(), SOL)],
            &[&wallet],
        ),
        AnchorErrorCode::AccountDiscriminatorMismatch,
    );

    // A Proposal account where an Escrow is expected.
    let mut submit = ix::submit_milestone(&passed.address, &passed.contractor.pubkey(), 0);
    submit.accounts[1].pubkey = passed.address;
    assert_anchor_error(
        env.send(&[submit], &[&passed.contractor]),
        AnchorErrorCode::AccountDiscriminatorMismatch,
    );
}

#[test]
fn vote_receipt_cannot_be_reinitialised() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = voting_proposal(&mut env);
    env.vote(&voter, &proposal, 400, true).expect("first vote");
    let receipt_address = pda::vote_receipt(&proposal, &voter.pubkey());
    let first = env.receipt(&proposal, &voter.pubkey());
    let rent = env.lamports(&receipt_address);

    // Same side again: init_if_needed must reuse the receipt, not reset it.
    env.vote(&voter, &proposal, 500, true).expect("top-up");
    let topped = env.receipt(&proposal, &voter.pubkey());
    assert_eq!(topped.credits, 900);
    assert_eq!(topped.votes, votes_for(900));
    assert_eq!((topped.bump, topped.voter), (first.bump, first.voter));
    assert_eq!(
        env.lamports(&receipt_address),
        rent,
        "no second rent payment"
    );
    assert_eq!(env.proposal(&proposal).for_votes, votes_for(900));

    // The other side is refused, so `support` is fixed after the first write.
    assert_krill_error(
        env.vote(&voter, &proposal, 1, false),
        KrillError::CannotSwitchSides,
    );
    assert!(env.receipt(&proposal, &voter.pubkey()).support);
}

#[test]
fn stale_proposal_index_cannot_overwrite_an_existing_proposal() {
    let mut env = KrillTestEnv::new();
    let (proposer, existing) = voting_proposal(&mut env);
    let before = env.proposal(&existing);

    // Index 0 is taken; a racing proposer still pointing at it is refused.
    let ix = ix::create_proposal(
        &env.dao,
        0,
        &proposer.pubkey(),
        "Overwrite",
        &proposer.pubkey(),
        &[1],
    );
    assert_anchor_error(
        env.send(&[ix], &[&proposer]),
        AnchorErrorCode::ConstraintSeeds,
    );
    let after = env.proposal(&existing);
    assert_eq!(
        (after.title, after.contractor),
        (before.title, before.contractor)
    );
}

#[test]
fn member_cannot_join_twice_to_reset_credits() {
    let mut env = KrillTestEnv::new();
    let member = env.new_member(SOL);
    let (_, proposal) = voting_proposal(&mut env);
    env.vote(&member, &proposal, 1_000, true)
        .expect("spends every credit");

    assert!(env.join(&member, SOL).is_err());
    assert_eq!(env.member(&member.pubkey()).credits, 0);
    assert_eq!(env.dao_state().member_count, 2);
    assert_treasury_balanced(&env);
}

#[test]
fn dao_names_are_byte_exact_seeds_and_never_collide() {
    let mut env = KrillTestEnv::without_dao();
    let names = ["krill", "krill\0", "Krill", "krill ", "k"];
    let mut addresses: Vec<Pubkey> = names
        .iter()
        .map(|name| {
            env.initialize_dao(name, VOTING_PERIOD, QUORUM_BPS)
                .unwrap_or_else(|_| panic!("{name:?} initializes"));
            pda::dao(&env.authority.pubkey(), name)
        })
        .collect();
    let stranger = env.funded_keypair(SOL);
    let ix = ix::initialize_dao(
        &stranger.pubkey(),
        "krill",
        &stranger.pubkey(),
        VOTING_PERIOD,
        0,
    );
    env.send(&[ix], &[&stranger])
        .expect("same name, other authority");
    addresses.push(pda::dao(&stranger.pubkey(), "krill"));

    let mut unique = addresses.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(
        unique.len(),
        addresses.len(),
        "every DAO has its own address"
    );

    // The same authority and name again is refused, not overwritten.
    assert!(env.initialize_dao("krill", 1, 10_000).is_err());
    env.dao = pda::dao(&env.authority.pubkey(), "krill");
    let dao = env.dao_state();
    assert_eq!(
        (dao.voting_period, dao.quorum_bps),
        (VOTING_PERIOD, QUORUM_BPS)
    );
}

#[test]
fn dao_name_longer_than_a_seed_is_refused_before_any_state_is_written() {
    let mut env = KrillTestEnv::without_dao();
    let fits = "x".repeat(32);
    env.initialize_dao(&fits, VOTING_PERIOD, QUORUM_BPS)
        .expect("32 bytes is the maximum seed length");

    // No address exists for a 33-byte seed, so the client cannot derive one
    // either; any account will do, the program refuses before touching it.
    for too_long in ["x".repeat(33), "é".repeat(17)] {
        let target = Pubkey::new_unique();
        let ix = ix::build(
            instruction::InitializeDao {
                name: too_long.clone(),
                council: env.council.pubkey(),
                voting_period: VOTING_PERIOD,
                quorum_bps: QUORUM_BPS,
            },
            accounts::InitializeDao {
                authority: env.authority.pubkey(),
                dao: target,
                system_program: system_program::ID,
            },
        );
        let result = env.send_as_authority(&[ix]);
        let failed = result.expect_err("a seed over 32 bytes cannot derive an address");
        assert_eq!(
            failed.err,
            TransactionError::InstructionError(0, InstructionError::ProgramFailedToComplete)
        );
        assert!(failed.meta.pretty_logs().contains("seed is too long"));
        assert!(!env.exists(&target));
    }
}

#[test]
fn max_size_accounts_fit_their_space() {
    let mut env = KrillTestEnv::without_dao();
    let name = "é".repeat(16); // 32 bytes
    env.initialize_dao(&name, VOTING_PERIOD, QUORUM_BPS)
        .expect("32-byte multi-byte name");
    env.dao = pda::dao(&env.authority.pubkey(), &name);
    let backer = env.new_member(2 * SOL);
    let contractor = env.funded_keypair(SOL);

    let title = "ü".repeat(32); // 64 bytes
    let milestones = [SOL / 8; 8];
    let proposal = pda::proposal(&env.dao, 0);
    let ix = ix::create_proposal(
        &env.dao,
        0,
        &backer.pubkey(),
        &title,
        &contractor.pubkey(),
        &milestones,
    );
    env.send(&[ix], &[&backer])
        .expect("max title, max milestones");
    env.vote(&backer, &proposal, 2_000, true).expect("vote");
    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("finalize");
    env.execute(&proposal).expect("execute");

    let sizes = [
        (env.dao, 8 + Dao::INIT_SPACE),
        (proposal, 8 + krill::state::Proposal::INIT_SPACE),
        (pda::escrow(&proposal), 8 + krill::state::Escrow::INIT_SPACE),
        (
            pda::vote_receipt(&proposal, &backer.pubkey()),
            8 + VoteReceipt::INIT_SPACE,
        ),
    ];
    for (address, space) in sizes {
        let account = env.svm.get_account(&address).expect("exists");
        assert_eq!(account.data.len(), space);
    }
    assert_eq!(env.dao_state().name, name);
    assert_eq!(env.proposal(&proposal).title, title);
    assert_eq!(env.escrow(&proposal).milestones.len(), 8);
}

#[test]
fn pda_prefunding_cannot_block_initialisation() {
    let mut env = KrillTestEnv::without_dao();
    let griefer = env.funded_keypair(10 * SOL);
    let bribe = SOL / 100;

    env.transfer(&griefer, &env.dao.clone(), bribe)
        .expect("prefund DAO");
    env.initialize_dao(DAO_NAME, VOTING_PERIOD, QUORUM_BPS)
        .expect("DAO initializes on a prefunded address");

    let wallet = env.funded_keypair(3 * SOL);
    env.transfer(&griefer, &pda::member(&env.dao, &wallet.pubkey()), bribe)
        .expect("prefund member");
    env.join(&wallet, 2 * SOL)
        .expect("join on a prefunded address");

    env.transfer(&griefer, &pda::proposal(&env.dao, 0), bribe)
        .expect("prefund next proposal");
    let contractor = env.funded_keypair(SOL);
    let (proposal, created) = env.create_proposal(&wallet, &contractor.pubkey(), &[SOL]);
    created.expect("proposal on a prefunded address");

    env.transfer(
        &griefer,
        &pda::vote_receipt(&proposal, &wallet.pubkey()),
        bribe,
    )
    .expect("prefund receipt");
    env.vote(&wallet, &proposal, 2_000, true)
        .expect("vote on a prefunded receipt");

    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("finalize");
    env.transfer(&griefer, &pda::escrow(&proposal), bribe)
        .expect("prefund escrow");
    env.execute(&proposal)
        .expect("execute on a prefunded escrow");

    // The bribe is surplus: bookkeeping ignores it and payouts still work.
    let escrow = pda::escrow(&proposal);
    assert_eq!(
        env.lamports(&escrow),
        env.rent_exempt_minimum(&escrow).max(bribe) + SOL
    );
    assert_eq!(env.dao_state().pooled_lamports, SOL);
    env.submit_milestone(&proposal, &contractor, 0)
        .expect("submit");
    env.approve_milestone(&proposal, 0).expect("approve");
    assert_eq!(env.escrow(&proposal).state, EscrowState::Completed);
}

/// Tripwire for a deployment assumption: Anchor initialises a prefunded PDA
/// with the `CreateAccountAllowPrefund` system instruction (SIMD-0312). On a
/// cluster without that feature a griefer could block any predictable PDA by
/// sending it lamports first. Mainnet has it active; this test documents
/// what happens where it is not.
#[test]
fn prefunding_defence_depends_on_simd_0312() {
    let simd_0312: Pubkey = "6sPDzwyARRExKH52LECxcGoqziH8G7SZofwuxi8Ja331"
        .parse()
        .expect("feature id");
    let mut features = LiteSVM::mainnet_feature_set();
    assert!(
        features.is_active(&simd_0312),
        "the default test chain runs with SIMD-0312 active"
    );
    features.deactivate(&simd_0312);
    let mut env = KrillTestEnv::on(LiteSVM::new().with_feature_set(features));
    env.initialize_dao(DAO_NAME, VOTING_PERIOD, QUORUM_BPS)
        .expect("DAO initializes");
    let backer = env.new_member(SOL);

    let griefer = env.funded_keypair(SOL);
    env.transfer(&griefer, &pda::proposal(&env.dao, 0), SOL / 100)
        .expect("prefund next proposal");
    let (_, created) = env.create_proposal(&backer, &backer.pubkey(), &[SOL / 2]);
    assert!(
        created.is_err(),
        "without SIMD-0312 a prefunded PDA blocks init"
    );
}

// ---- arithmetic --------------------------------------------------------------

fn dao_with(total_credits: u64, quorum_bps: u16) -> Dao {
    Dao {
        authority: Pubkey::default(),
        council: Pubkey::default(),
        name: String::new(),
        voting_period: 1,
        quorum_bps,
        pooled_lamports: 0,
        total_credits,
        member_count: 0,
        proposal_count: 0,
        bump: 0,
    }
}

fn empty_receipt() -> VoteReceipt {
    VoteReceipt {
        proposal: Pubkey::default(),
        voter: Pubkey::default(),
        support: false,
        credits: 0,
        votes: 0,
        bump: 0,
    }
}

#[test]
fn quorum_snapshot_cannot_overflow() {
    assert_eq!(dao_with(u64::MAX, 10_000).quorum_credits(), u64::MAX);
    assert_eq!(
        dao_with(u64::MAX, 9_999).quorum_credits(),
        u64::try_from(u128::from(u64::MAX) * 9_999 / 10_000).expect("fits")
    );
    assert_eq!(dao_with(u64::MAX, 0).quorum_credits(), 0);
    assert_eq!(dao_with(9_999, 1).quorum_credits(), 0, "rounds down");
}

#[test]
fn credit_balances_cannot_wrap() {
    let mut member = Member {
        dao: Pubkey::default(),
        wallet: Pubkey::default(),
        credits: 5,
        deposited: 0,
        bump: 0,
    };
    assert!(member.spend_credits(6).is_err());
    assert!(member.spend_credits(0).is_err());
    assert_eq!(member.credits, 5);

    let mut dao = dao_with(0, 0);
    member.credits = u64::MAX;
    assert!(dao
        .credit_deposit(&mut member, LAMPORTS_PER_CREDIT)
        .is_err());
    assert_eq!(member.credits, u64::MAX);

    let mut receipt = empty_receipt();
    receipt.top_up(true, u64::MAX).expect("first vote");
    assert!(
        receipt.top_up(true, 1).is_err(),
        "cumulative credits overflow"
    );
    assert_eq!(receipt.credits, u64::MAX);
}

proptest! {
    /// Every top-up adds exactly `votes_for(after) - votes_for(before)`, so the
    /// receipt always holds `votes_for(credits)` and the deltas never underflow.
    #[test]
    fn vote_delta_is_monotonic_and_never_underflows(
        top_ups in proptest::collection::vec(1..=u64::MAX / 64, 1..32)
    ) {
        let mut receipt = empty_receipt();
        let mut tallied = 0u128;
        for credits in top_ups {
            let before = receipt.votes;
            let added = receipt.top_up(true, credits).expect("no overflow below u64::MAX");
            prop_assert!(receipt.votes >= before);
            prop_assert_eq!(receipt.votes, votes_for(receipt.credits));
            tallied += added;
        }
        prop_assert_eq!(tallied, receipt.votes);
    }
}

#[test]
fn voting_period_overflow_fails_closed() {
    let mut env = KrillTestEnv::without_dao();
    env.warp(1_800_000_000); // a realistic clock; LiteSVM starts at zero
    env.initialize_dao(DAO_NAME, i64::MAX, QUORUM_BPS)
        .expect("any positive period is accepted");
    let member = env.new_member(SOL);
    let (_, created) = env.create_proposal(&member, &member.pubkey(), &[SOL / 2]);
    assert_krill_error(created, KrillError::Overflow);
    assert_eq!(env.dao_state().proposal_count, 0);
}

// ---- lamport accounting and rent ---------------------------------------------

#[test]
fn dao_lamports_equal_rent_plus_pool_after_every_instruction() {
    let mut env = KrillTestEnv::new();
    assert_treasury_balanced(&env);
    let alice = env.new_member(3 * SOL);
    assert_treasury_balanced(&env);
    let bob = env.new_member(SOL + 999_999); // with sub-credit dust
    assert_treasury_balanced(&env);
    env.deposit(&bob, SOL / 2).expect("deposit");
    assert_treasury_balanced(&env);

    let contractor = env.funded_keypair(SOL);
    let (paid, created) = env.create_proposal(&alice, &contractor.pubkey(), &MILESTONES);
    created.expect("first proposal");
    let (cancelled, created) = env.create_proposal(&bob, &contractor.pubkey(), &[SOL]);
    created.expect("second proposal");
    assert_treasury_balanced(&env);
    for proposal in [paid, cancelled] {
        env.vote(&alice, &proposal, 1_000, true).expect("alice");
        env.vote(&bob, &proposal, 500, false).expect("bob");
        assert_treasury_balanced(&env);
    }
    env.warp_past_voting(&cancelled);
    for proposal in [paid, cancelled] {
        env.finalize(&proposal).expect("finalize");
        assert_treasury_balanced(&env);
        env.execute(&proposal).expect("execute");
        assert_treasury_balanced(&env);
    }

    env.submit_milestone(&paid, &contractor, 0).expect("submit");
    env.reject_milestone(&paid, 0).expect("reject");
    assert_treasury_balanced(&env);
    for index in 0..3 {
        env.submit_milestone(&paid, &contractor, index)
            .expect("submit");
        env.approve_milestone(&paid, index).expect("approve");
        assert_treasury_balanced(&env);
    }
    env.submit_milestone(&cancelled, &contractor, 0)
        .expect("submit");
    env.cancel_escrow(&cancelled).expect("cancel");
    assert_treasury_balanced(&env);

    let expected_pool = 3 * SOL + SOL + 999_999 + SOL / 2 - MILESTONES.iter().sum::<u64>();
    assert_eq!(env.dao_state().pooled_lamports, expected_pool);
}

#[test]
fn lamports_are_conserved_across_dao_escrow_and_contractor() {
    let mut env = KrillTestEnv::new();
    let passed = env.passed_proposal(&MILESTONES);
    let contractor = passed.contractor.pubkey();
    let escrow = pda::escrow(&passed.address);
    // A third party pays every fee so only program moves touch these accounts.
    let cranker = env.funded_keypair(SOL);

    let total = |env: &KrillTestEnv| {
        let rent = match env.exists(&escrow) {
            true => env.rent_exempt_minimum(&escrow),
            false => 0,
        };
        let locked = env.lamports(&escrow) - rent;
        env.lamports(&env.dao) + locked + env.lamports(&contractor)
    };
    let start = total(&env);

    let execute = ix::execute(&env.dao, &passed.address, &cranker.pubkey());
    env.send(&[execute], &[&cranker]).expect("execute");
    assert_eq!(total(&env), start, "execute");

    let submit = |env: &mut KrillTestEnv, index| {
        let ix = ix::submit_milestone(&passed.address, &contractor, index);
        env.send(&[ix], &[&cranker, &passed.contractor])
            .expect("submit");
    };
    submit(&mut env, 0);
    env.reject_milestone(&passed.address, 0).expect("reject");
    submit(&mut env, 0);
    env.approve_milestone(&passed.address, 0).expect("approve");
    assert_eq!(total(&env), start, "approve");
    submit(&mut env, 1);
    env.cancel_escrow(&passed.address).expect("cancel");
    assert_eq!(total(&env), start, "cancel");

    assert_eq!(
        env.lamports(&contractor),
        SOL + MILESTONES[0],
        "the contractor got exactly the released milestone"
    );
    assert_treasury_balanced(&env);
}

#[test]
fn escrow_keeps_exactly_its_rent_after_completion_and_cancel() {
    let mut env = KrillTestEnv::new();
    let completed = env.escrowed_proposal(&[SOL / 4, SOL / 4]);
    for index in 0..2 {
        env.submit_milestone(&completed.address, &completed.contractor, index)
            .expect("submit");
        env.approve_milestone(&completed.address, index)
            .expect("approve");
    }
    let cancelled = env.escrowed_proposal(&[SOL / 4, SOL / 4]);
    env.submit_milestone(&cancelled.address, &cancelled.contractor, 0)
        .expect("submit");
    env.approve_milestone(&cancelled.address, 0)
        .expect("approve");
    env.cancel_escrow(&cancelled.address).expect("cancel");

    for proposal in [completed.address, cancelled.address] {
        let escrow = pda::escrow(&proposal);
        assert_eq!(env.lamports(&escrow), env.rent_exempt_minimum(&escrow));
    }
    assert_eq!(env.escrow(&completed.address).released_lamports, SOL / 2);
    assert_eq!(env.escrow(&cancelled.address).released_lamports, SOL / 4);
}

#[test]
fn escrow_payout_cannot_breach_rent() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&[SOL / 2]);
    let escrow = pda::escrow(&passed.address);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("submit");

    // Bookkeeping never lets this happen; simulate a one-lamport drift and
    // show the payout is refused rather than eating into the rent reserve.
    let rent = env.rent_exempt_minimum(&escrow);
    env.set_lamports(&escrow, rent + SOL / 2 - 1);
    assert_rent_refused(env.approve_milestone(&passed.address, 0));
    assert_eq!(env.lamports(&escrow), rent + SOL / 2 - 1);
    assert_eq!(
        env.escrow(&passed.address).milestones[0].status,
        MilestoneStatus::Submitted
    );
}

#[test]
fn execute_cannot_spend_the_dao_rent() {
    let mut env = KrillTestEnv::new();
    let passed = env.passed_proposal(&[SOL]);
    let pooled = env.dao_state().pooled_lamports;
    assert_eq!(pooled, SOL, "the proposal asks for the whole pool");

    // Simulated drift: one lamport short of rent + pool.
    let rent = env.rent_exempt_minimum(&env.dao);
    let dao = env.dao;
    env.set_lamports(&dao, rent + pooled - 1);
    assert_rent_refused(env.execute(&passed.address));

    env.set_lamports(&dao, rent + pooled);
    env.execute(&passed.address)
        .expect("the whole pool, no rent");
    assert_eq!(env.lamports(&env.dao), rent);
    assert_eq!(env.dao_state().pooled_lamports, 0);
}

#[test]
fn direct_transfer_to_dao_is_unspendable_surplus() {
    let mut env = KrillTestEnv::new();
    let member = env.new_member(SOL);
    let donor = env.funded_keypair(5 * SOL);
    env.transfer(&donor, &env.dao.clone(), 2 * SOL)
        .expect("plain transfer");

    let dao = env.dao_state();
    assert_eq!(
        dao.pooled_lamports, SOL,
        "the pool ignores unbooked lamports"
    );
    assert_eq!(dao.total_credits, 1_000, "and mints nothing for them");
    assert_eq!(
        env.lamports(&env.dao),
        env.rent_exempt_minimum(&env.dao) + dao.pooled_lamports + 2 * SOL
    );
    let (_, created) = env.create_proposal(&member, &member.pubkey(), &[SOL + 1]);
    assert_krill_error(created, KrillError::InsufficientTreasury);
}

#[test]
fn degenerate_contractors_are_rejected() {
    let mut env = KrillTestEnv::new();
    let proposer = env.new_member(SOL);
    let next = pda::proposal(&env.dao, 0);
    let degenerate = [
        env.dao,
        next,
        pda::escrow(&next),
        system_program::ID,
        krill::ID,
    ];
    for contractor in degenerate {
        let (_, created) = env.create_proposal(&proposer, &contractor, &[SOL / 2]);
        assert_krill_error(created, KrillError::InvalidContractor);
    }
    assert_eq!(env.dao_state().proposal_count, 0);
}

#[test]
fn tiny_milestone_to_an_unfunded_contractor_waits_until_the_wallet_exists() {
    let mut env = KrillTestEnv::new();
    let backer = env.new_member(SOL);
    let contractor = Keypair::new(); // no lamports at all
    let (proposal, created) = env.create_proposal(&backer, &contractor.pubkey(), &[1_000]);
    created.expect("proposal");
    env.vote(&backer, &proposal, 1_000, true).expect("vote");
    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("finalize");
    env.execute(&proposal).expect("execute");
    let cranker = env.funded_keypair(SOL);
    let submit = ix::submit_milestone(&proposal, &contractor.pubkey(), 0);
    env.send(&[submit], &[&cranker, &contractor])
        .expect("submit");

    // 1_000 lamports cannot open a rent-exempt wallet, so the runtime refuses.
    assert_rent_refused(env.approve_milestone(&proposal, 0));
    env.svm
        .airdrop(&contractor.pubkey(), SOL)
        .expect("contractor funds its wallet");
    env.approve_milestone(&proposal, 0)
        .expect("now the payout fits");
    assert_eq!(env.lamports(&contractor.pubkey()), SOL + 1_000);
}

// ---- state machine -------------------------------------------------------------

/// What an instruction attempted in a given state must do.
#[derive(Clone, Copy, Debug)]
enum Expect {
    Krill(KrillError),
    Anchor(AnchorErrorCode),
    /// Refused by the system program (the escrow account already exists).
    Fails,
}

#[track_caller]
fn assert_expect(result: TxResult, expected: Expect, context: &str) {
    match expected {
        Expect::Krill(error) => assert_krill_error(result, error),
        Expect::Anchor(error) => assert_anchor_error(result, error),
        Expect::Fails => assert!(result.is_err(), "{context}: expected a failure"),
    }
}

/// A proposal driven into `state`, with a funded member who still has credits.
fn proposal_in(state: ProposalState) -> (KrillTestEnv, PassedProposal, Keypair) {
    let mut env = KrillTestEnv::new();
    let proposal = match state {
        ProposalState::Voting | ProposalState::Rejected => {
            let (_, address) = voting_proposal(&mut env);
            if state == ProposalState::Rejected {
                env.warp_past_voting(&address);
                env.finalize(&address).expect("finalize without votes");
            }
            // No escrow exists in these states, so any funded key stands in
            // for the contractor: the escrow lookup fails before the signer
            // check matters.
            PassedProposal {
                address,
                contractor: env.funded_keypair(SOL),
                milestones: vec![SOL / 2],
            }
        }
        ProposalState::Passed => env.passed_proposal(&[SOL / 2]),
        ProposalState::Escrowed => env.escrowed_proposal(&[SOL / 2]),
        ProposalState::Completed => {
            let passed = env.escrowed_proposal(&[SOL / 2]);
            env.submit_milestone(&passed.address, &passed.contractor, 0)
                .expect("submit");
            env.approve_milestone(&passed.address, 0).expect("approve");
            passed
        }
        ProposalState::Cancelled => {
            let passed = env.escrowed_proposal(&[SOL / 2]);
            env.cancel_escrow(&passed.address).expect("cancel");
            passed
        }
    };
    assert_eq!(env.proposal(&proposal.address).state, state);
    let voter = env.new_member(SOL);
    (env, proposal, voter)
}

#[test]
fn every_instruction_is_refused_in_every_wrong_proposal_state() {
    use AnchorErrorCode::AccountNotInitialized as NoEscrow;
    use KrillError::*;
    use ProposalState::*;
    let refused = Expect::Krill;
    let none = Expect::Anchor(NoEscrow);

    // Rows: vote, finalize, execute, submit, approve, reject, cancel.
    // `None` marks the transition that is legal in that state.
    let table: [(ProposalState, [Option<Expect>; 7]); 6] = [
        (
            Voting,
            [
                None,
                Some(refused(VotingStillOpen)),
                Some(refused(InvalidState)),
                Some(none),
                Some(none),
                Some(none),
                Some(none),
            ],
        ),
        (
            Passed,
            [
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                None,
                Some(none),
                Some(none),
                Some(none),
                Some(none),
            ],
        ),
        (
            Rejected,
            [
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(none),
                Some(none),
                Some(none),
                Some(none),
            ],
        ),
        (
            Escrowed,
            [
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(Expect::Fails),
                None,
                Some(refused(InvalidState)), // milestone 0 is still Pending
                Some(refused(InvalidState)),
                None,
            ],
        ),
        (
            Completed,
            [
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(Expect::Fails),
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
            ],
        ),
        (
            Cancelled,
            [
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(Expect::Fails),
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
                Some(refused(InvalidState)),
            ],
        ),
    ];

    for (proposal_state, row) in table {
        for (column, expected) in row.into_iter().enumerate() {
            let Some(expected) = expected else { continue };
            let (mut env, p, voter) = proposal_in(proposal_state);
            let before = env.proposal(&p.address);
            let result = match column {
                0 => env.vote(&voter, &p.address, 10, true),
                1 => env.finalize(&p.address),
                2 => env.execute(&p.address),
                3 => env.submit_milestone(&p.address, &p.contractor, 0),
                4 => env.approve_milestone(&p.address, 0),
                5 => env.reject_milestone(&p.address, 0),
                _ => env.cancel_escrow(&p.address),
            };
            let context = format!("{proposal_state:?} column {column}");
            assert_expect(result, expected, &context);
            let after = env.proposal(&p.address);
            assert_eq!(after.state, before.state, "{context}");
            assert_eq!(after.credits_spent, before.credits_spent, "{context}");
            assert_treasury_balanced(&env);
        }
    }
}

#[test]
fn every_milestone_instruction_is_refused_in_every_wrong_milestone_status() {
    let mut env = KrillTestEnv::new();
    let p = env.escrowed_proposal(&MILESTONES);
    let (proposal, contractor) = (p.address, &p.contractor);

    // Pending: cannot approve or reject.
    assert_krill_error(
        env.approve_milestone(&proposal, 0),
        KrillError::InvalidState,
    );
    assert_krill_error(env.reject_milestone(&proposal, 0), KrillError::InvalidState);
    // Submitted: cannot submit again.
    env.submit_milestone(&proposal, contractor, 0)
        .expect("submit");
    assert_krill_error(
        env.submit_milestone(&proposal, contractor, 0),
        KrillError::InvalidState,
    );
    // Released: nothing moves it again.
    env.approve_milestone(&proposal, 0).expect("approve");
    assert_krill_error(
        env.submit_milestone(&proposal, contractor, 0),
        KrillError::InvalidState,
    );
    assert_krill_error(
        env.approve_milestone(&proposal, 0),
        KrillError::InvalidState,
    );
    assert_krill_error(env.reject_milestone(&proposal, 0), KrillError::InvalidState);
    // Out of range, including the u8 extremes.
    for index in [3, 8, u8::MAX] {
        assert_krill_error(
            env.submit_milestone(&proposal, contractor, index),
            KrillError::MilestoneIndexOutOfRange,
        );
        assert_krill_error(
            env.approve_milestone(&proposal, index),
            KrillError::MilestoneIndexOutOfRange,
        );
        assert_krill_error(
            env.reject_milestone(&proposal, index),
            KrillError::MilestoneIndexOutOfRange,
        );
    }
    assert_eq!(env.escrow(&proposal).released_lamports, MILESTONES[0]);
}

#[test]
fn a_rejected_milestone_in_the_middle_blocks_the_ones_after_it() {
    let mut env = KrillTestEnv::new();
    let p = env.escrowed_proposal(&MILESTONES);
    let (proposal, contractor) = (p.address, &p.contractor);
    env.submit_milestone(&proposal, contractor, 0)
        .expect("submit 0");
    env.approve_milestone(&proposal, 0).expect("approve 0");
    env.submit_milestone(&proposal, contractor, 1)
        .expect("submit 1");
    env.reject_milestone(&proposal, 1).expect("reject 1");

    assert_krill_error(
        env.submit_milestone(&proposal, contractor, 2),
        KrillError::MilestoneOutOfOrder,
    );
    env.submit_milestone(&proposal, contractor, 1)
        .expect("resubmit 1");
    assert_krill_error(
        env.submit_milestone(&proposal, contractor, 2),
        KrillError::MilestoneOutOfOrder,
    );
    env.approve_milestone(&proposal, 1).expect("approve 1");
    env.submit_milestone(&proposal, contractor, 2)
        .expect("submit 2");
}

#[test]
fn voting_window_boundaries_are_exact() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = voting_proposal(&mut env);
    let ends_at = env.proposal(&proposal).voting_ends_at;

    env.warp(ends_at - 1 - env.now());
    env.vote(&voter, &proposal, 10, true)
        .expect("the last second before the deadline is open");
    assert_krill_error(env.finalize(&proposal), KrillError::VotingStillOpen);

    env.warp(1);
    assert_eq!(env.now(), ends_at);
    assert_krill_error(
        env.vote(&voter, &proposal, 10, true),
        KrillError::VotingClosed,
    );
    env.finalize(&proposal)
        .expect("finalize opens exactly at the deadline");
    assert_krill_error(
        env.vote(&voter, &proposal, 10, true),
        KrillError::InvalidState,
    );
    assert_eq!(env.proposal(&proposal).credits_spent, 10);
}

// ---- denial of service -----------------------------------------------------------

#[test]
fn competing_proposals_first_execute_wins_and_the_other_waits_for_funds() {
    let mut env = KrillTestEnv::new();
    let backer = env.new_member(SOL);
    let contractor = Keypair::new().pubkey();
    let (first, _) = env.create_proposal(&backer, &contractor, &[SOL]);
    let (second, _) = env.create_proposal(&backer, &contractor, &[SOL]);
    env.vote(&backer, &first, 500, true).expect("first");
    env.vote(&backer, &second, 500, true).expect("second");
    env.warp_past_voting(&second);
    env.finalize(&first).expect("finalize first");
    env.finalize(&second).expect("finalize second");

    env.execute(&second)
        .expect("the later proposal executes first");
    assert_krill_error(env.execute(&first), KrillError::InsufficientTreasury);
    assert_eq!(env.proposal(&first).state, ProposalState::Passed);

    env.new_member(SOL); // a new deposit refills the treasury
    env.execute(&first)
        .expect("a passed proposal executes once funded");
    assert_eq!(env.dao_state().pooled_lamports, 0);
    assert_treasury_balanced(&env);
}

// ---- events and invariants ---------------------------------------------------------

#[test]
fn events_report_post_state_values() {
    let mut env = KrillTestEnv::new();
    let backer = env.new_member(2 * SOL);
    let critic = env.new_member(SOL);
    let contractor = env.funded_keypair(SOL);
    let (proposal, created) = env.create_proposal(&backer, &contractor.pubkey(), &[SOL / 2, SOL]);
    let created: Vec<ProposalCreated> = events(&created.expect("created"));
    assert_eq!(created.len(), 1);
    assert_eq!(
        (created[0].proposal, created[0].index, created[0].amount),
        (proposal, 0, SOL + SOL / 2)
    );

    let mut tally = 0u128;
    for credits in [400, 500] {
        let meta = env.vote(&backer, &proposal, credits, true).expect("vote");
        let cast: Vec<VoteCast> = events(&meta);
        assert_eq!(cast.len(), 1);
        tally += cast[0].votes;
        assert_eq!(
            (cast[0].voter, cast[0].credits, cast[0].support),
            (backer.pubkey(), credits, true)
        );
        assert_eq!(tally, env.proposal(&proposal).for_votes);
    }
    env.vote(&critic, &proposal, 100, false).expect("against");

    env.warp_past_voting(&proposal);
    let finalized: Vec<ProposalFinalized> = events(&env.finalize(&proposal).expect("finalize"));
    let state = env.proposal(&proposal);
    assert_eq!(finalized.len(), 1);
    assert_eq!(
        (
            finalized[0].passed,
            finalized[0].for_votes,
            finalized[0].against_votes
        ),
        (true, state.for_votes, state.against_votes)
    );

    env.execute(&proposal).expect("execute");
    env.submit_milestone(&proposal, &contractor, 0)
        .expect("submit");
    let released: Vec<MilestoneReleased> =
        events(&env.approve_milestone(&proposal, 0).expect("approve"));
    assert_eq!(released.len(), 1);
    assert_eq!(
        (released[0].escrow, released[0].index, released[0].amount),
        (pda::escrow(&proposal), 0, SOL / 2)
    );
    assert_eq!(env.escrow(&proposal).released_lamports, released[0].amount);
}

#[test]
fn tallies_equal_the_sum_of_receipts() {
    let mut env = KrillTestEnv::new();
    let voters: Vec<Keypair> = (0..6).map(|_| env.new_member(SOL)).collect();
    let (proposal, created) = env.create_proposal(&voters[0], &Keypair::new().pubkey(), &[SOL]);
    created.expect("proposal");

    // Uneven top-ups on both sides.
    let plan: [(usize, u64, bool); 9] = [
        (0, 1, true),
        (1, 999, false),
        (0, 99, true),
        (2, 250, true),
        (3, 7, false),
        (2, 250, true),
        (4, 1_000, true),
        (3, 993, false),
        (5, 2, false),
    ];
    for (who, credits, support) in plan {
        env.vote(&voters[who], &proposal, credits, support)
            .expect("vote");
    }

    let receipts: Vec<VoteReceipt> = voters
        .iter()
        .map(|v| env.receipt(&proposal, &v.pubkey()))
        .collect();
    let side = |support: bool| -> u128 {
        receipts
            .iter()
            .filter(|r| r.support == support)
            .map(|r| r.votes)
            .sum()
    };
    let state = env.proposal(&proposal);
    assert_eq!(state.for_votes, side(true));
    assert_eq!(state.against_votes, side(false));
    assert_eq!(
        state.credits_spent,
        receipts.iter().map(|r| r.credits).sum::<u64>()
    );
    for (receipt, voter) in receipts.iter().zip(&voters) {
        assert_eq!(receipt.votes, votes_for(receipt.credits));
        let member = env.member(&voter.pubkey());
        assert_eq!(member.credits + receipt.credits, 1_000, "burned, not lost");
    }
}

#[test]
fn quorum_base_includes_burned_credits_so_a_spent_dao_needs_new_deposits() {
    let mut env = KrillTestEnv::without_dao();
    env.initialize_dao(DAO_NAME, VOTING_PERIOD, 5_000)
        .expect("half quorum");
    let member = env.new_member(SOL);
    let contractor = Keypair::new().pubkey();
    let (first, _) = env.create_proposal(&member, &contractor, &[SOL / 4]);
    env.vote(&member, &first, 1_000, true)
        .expect("every credit on the first proposal");

    let (second, created) = env.create_proposal(&member, &contractor, &[SOL / 4]);
    created.expect("second proposal");
    assert_eq!(env.proposal(&second).quorum_credits, 500);
    assert_krill_error(
        env.vote(&member, &second, 1, true),
        KrillError::InsufficientCredits,
    );

    // Fresh deposits mint fresh credits, which is the only way back to quorum.
    env.deposit(&member, SOL / 2).expect("deposit");
    env.vote(&member, &second, 500, true)
        .expect("vote with new credits");
    env.warp_past_voting(&second);
    env.finalize(&second).expect("finalize");
    assert_eq!(env.proposal(&second).state, ProposalState::Passed);
}
