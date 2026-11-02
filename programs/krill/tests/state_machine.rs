//! Proposal state machine: Voting -> Passed | Rejected, Passed -> Escrowed,
//! with every transition guarded by state and time.

mod common;

use common::*;

/// A member with 1 SOL (1_000 credits) and an open proposal for 0.5 SOL.
fn voting_proposal(env: &mut KrillTestEnv) -> (Keypair, Pubkey) {
    let voter = env.new_member(LAMPORTS_PER_SOL);
    let contractor = Keypair::new();
    let (proposal, created) =
        env.create_proposal(&voter, &contractor.pubkey(), &[LAMPORTS_PER_SOL / 2]);
    created.expect("proposal is created");
    (voter, proposal)
}

#[test]
fn create_proposal_opens_voting_with_a_quorum_snapshot() {
    let mut env = KrillTestEnv::new();
    let proposer = env.new_member(3 * LAMPORTS_PER_SOL);
    let contractor = Keypair::new();
    let now = env.now();

    let (address, created) = env.create_proposal(&proposer, &contractor.pubkey(), &[100, 200, 300]);
    created.expect("proposal is created");

    let proposal = env.proposal(&address);
    assert_eq!(proposal.dao, env.dao);
    assert_eq!(proposal.proposer, proposer.pubkey());
    assert_eq!(proposal.contractor, contractor.pubkey());
    assert_eq!(proposal.index, 0);
    assert_eq!(proposal.amount, 600);
    assert_eq!(proposal.milestones, vec![100, 200, 300]);
    assert_eq!(proposal.voting_ends_at, now + VOTING_PERIOD);
    assert_eq!(
        proposal.quorum_credits,
        3_000 * u64::from(QUORUM_BPS) / 10_000
    );
    assert_eq!(proposal.state, ProposalState::Voting);
    assert_eq!(env.dao_state().proposal_count, 1);

    env.deposit(&proposer, LAMPORTS_PER_SOL / 2)
        .expect("later deposit");
    assert_eq!(
        env.proposal(&address).quorum_credits,
        300,
        "snapshot is fixed"
    );
}

#[test]
fn create_proposal_validates_title_milestones_and_treasury() {
    let mut env = KrillTestEnv::new();
    let proposer = env.new_member(LAMPORTS_PER_SOL);
    let contractor = Keypair::new().pubkey();
    let dao = env.dao;
    let propose = |env: &mut KrillTestEnv, title: &str, milestones: &[u64]| {
        let ix = ix::create_proposal(&dao, 0, &proposer.pubkey(), title, &contractor, milestones);
        env.send(&[ix], &[&proposer])
    };

    assert_krill_error(propose(&mut env, "", &[1]), KrillError::TitleTooLong);
    assert_krill_error(
        propose(&mut env, &"x".repeat(65), &[1]),
        KrillError::TitleTooLong,
    );
    assert_krill_error(propose(&mut env, "t", &[]), KrillError::InvalidMilestones);
    assert_krill_error(
        propose(&mut env, "t", &[1, 0]),
        KrillError::InvalidMilestones,
    );
    assert_krill_error(
        propose(&mut env, "t", &[1; 9]),
        KrillError::InvalidMilestones,
    );
    assert_krill_error(
        propose(&mut env, "t", &[LAMPORTS_PER_SOL, 1]),
        KrillError::InsufficientTreasury,
    );
    propose(&mut env, &"x".repeat(64), &[1; 8]).expect("limits are inclusive");
}

#[test]
fn non_members_cannot_propose() {
    let mut env = KrillTestEnv::new();
    env.new_member(LAMPORTS_PER_SOL);
    let stranger = env.funded_keypair(LAMPORTS_PER_SOL);
    let (_, result) = env.create_proposal(&stranger, &stranger.pubkey(), &[1]);
    assert_anchor_error(result, AnchorErrorCode::AccountNotInitialized);
}

#[test]
fn cannot_finalize_before_the_deadline() {
    let mut env = KrillTestEnv::new();
    let (_, proposal) = voting_proposal(&mut env);

    assert_krill_error(env.finalize(&proposal), KrillError::VotingStillOpen);
    env.warp(VOTING_PERIOD - 1);
    assert_krill_error(env.finalize(&proposal), KrillError::VotingStillOpen);
    assert_eq!(env.proposal(&proposal).state, ProposalState::Voting);
}

#[test]
fn cannot_vote_after_the_deadline() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = voting_proposal(&mut env);

    env.warp(VOTING_PERIOD - 1);
    env.vote(&voter, &proposal, 1, true)
        .expect("last second is open");
    env.warp(1);
    assert_krill_error(
        env.vote(&voter, &proposal, 1, true),
        KrillError::VotingClosed,
    );
}

#[test]
fn passes_when_quorum_is_met_and_for_beats_against() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = voting_proposal(&mut env);
    env.vote(&voter, &proposal, 100, true)
        .expect("vote meets the quorum exactly");

    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("proposal finalizes");

    assert_eq!(env.proposal(&proposal).state, ProposalState::Passed);
}

#[test]
fn rejected_when_quorum_not_met() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = voting_proposal(&mut env);
    assert_eq!(env.proposal(&proposal).quorum_credits, 100);
    env.vote(&voter, &proposal, 99, true)
        .expect("vote just under quorum");

    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("proposal finalizes");

    let state = env.proposal(&proposal);
    assert!(state.for_votes > state.against_votes);
    assert_eq!(state.state, ProposalState::Rejected);
}

#[test]
fn rejected_on_a_tie() {
    let mut env = KrillTestEnv::new();
    let (supporter, proposal) = voting_proposal(&mut env);
    let opponent = env.new_member(LAMPORTS_PER_SOL);
    env.vote(&supporter, &proposal, 400, true)
        .expect("vote for");
    env.vote(&opponent, &proposal, 400, false)
        .expect("vote against");

    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("proposal finalizes");

    assert_eq!(env.proposal(&proposal).state, ProposalState::Rejected);
}

#[test]
fn cannot_finalize_twice() {
    let mut env = KrillTestEnv::new();
    let passed = env.passed_proposal(&[LAMPORTS_PER_SOL]);
    assert_krill_error(env.finalize(&passed.address), KrillError::InvalidState);
}

#[test]
fn execute_moves_exact_amount_and_keeps_rent() {
    let mut env = KrillTestEnv::new();
    let passed = env.passed_proposal(&[LAMPORTS_PER_SOL / 4, LAMPORTS_PER_SOL / 2]);
    let amount = env.proposal(&passed.address).amount;
    let dao_rent = env.rent_exempt_minimum(&env.dao);
    let dao_lamports_before = env.lamports(&env.dao);
    let pooled_before = env.dao_state().pooled_lamports;

    env.execute(&passed.address).expect("proposal executes");

    let escrow = pda::escrow(&passed.address);
    let pooled_after = env.dao_state().pooled_lamports;
    assert_eq!(env.lamports(&env.dao), dao_lamports_before - amount);
    assert_eq!(pooled_after, pooled_before - amount);
    assert_eq!(
        env.lamports(&env.dao),
        pooled_after + dao_rent,
        "rent is untouched"
    );
    assert_eq!(
        env.lamports(&escrow),
        env.rent_exempt_minimum(&escrow) + amount
    );
    assert_eq!(env.proposal(&passed.address).state, ProposalState::Escrowed);
}

#[test]
fn cannot_execute_a_rejected_proposal() {
    let mut env = KrillTestEnv::new();
    let (_, proposal) = voting_proposal(&mut env);
    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("proposal finalizes");
    assert_eq!(env.proposal(&proposal).state, ProposalState::Rejected);

    assert_krill_error(env.execute(&proposal), KrillError::InvalidState);
    assert!(!env.exists(&pda::escrow(&proposal)));
}

#[test]
fn cannot_execute_a_proposal_still_voting() {
    let mut env = KrillTestEnv::new();
    let (_, proposal) = voting_proposal(&mut env);
    assert_krill_error(env.execute(&proposal), KrillError::InvalidState);
}

#[test]
fn cannot_execute_twice() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&[LAMPORTS_PER_SOL]);
    let dao_lamports = env.lamports(&env.dao);
    let escrow_lamports = env.lamports(&pda::escrow(&passed.address));

    let result = env.execute(&passed.address);

    assert!(result.is_err(), "the escrow account already exists");
    assert_eq!(env.lamports(&env.dao), dao_lamports);
    assert_eq!(env.lamports(&pda::escrow(&passed.address)), escrow_lamports);
    assert_eq!(env.proposal(&passed.address).state, ProposalState::Escrowed);
}

#[test]
fn execute_fails_when_the_treasury_was_spent_by_an_earlier_proposal() {
    let mut env = KrillTestEnv::new();
    let backer = env.new_member(LAMPORTS_PER_SOL);
    let contractor = Keypair::new().pubkey();
    let (first, _) = env.create_proposal(&backer, &contractor, &[LAMPORTS_PER_SOL]);
    let (second, _) = env.create_proposal(&backer, &contractor, &[LAMPORTS_PER_SOL]);
    env.vote(&backer, &first, 500, true).expect("vote on first");
    env.vote(&backer, &second, 500, true)
        .expect("vote on second");
    env.warp_past_voting(&second);
    env.finalize(&first).expect("first finalizes");
    env.finalize(&second).expect("second finalizes");

    env.execute(&first).expect("first takes the whole treasury");

    assert_krill_error(env.execute(&second), KrillError::InsufficientTreasury);
    assert_eq!(env.proposal(&second).state, ProposalState::Passed);
}
