//! Milestone escrow: sequential delivery by the contractor, review by the
//! council, exact payouts, completion and cancellation.

mod common;

use common::*;

const MILESTONES: [u64; 3] = [
    LAMPORTS_PER_SOL / 10,
    LAMPORTS_PER_SOL / 5,
    LAMPORTS_PER_SOL / 2,
];

fn statuses(env: &KrillTestEnv, proposal: &Pubkey) -> Vec<MilestoneStatus> {
    env.escrow(proposal)
        .milestones
        .iter()
        .map(|m| m.status)
        .collect()
}

/// Submits and approves milestone `index`.
fn deliver(env: &mut KrillTestEnv, passed: &PassedProposal, index: u8) {
    env.submit_milestone(&passed.address, &passed.contractor, index)
        .expect("contractor submits");
    env.approve_milestone(&passed.address, index)
        .expect("council approves");
}

#[test]
fn execute_opens_an_escrow_with_every_milestone_pending() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);

    let escrow = env.escrow(&passed.address);
    assert_eq!(escrow.proposal, passed.address);
    assert_eq!(escrow.contractor, passed.contractor.pubkey());
    assert_eq!(escrow.dao, env.dao);
    assert_eq!(escrow.state, EscrowState::Active);
    assert_eq!(escrow.released_lamports, 0);
    let amounts: Vec<u64> = escrow.milestones.iter().map(|m| m.amount).collect();
    assert_eq!(amounts, passed.milestones);
    assert_eq!(
        statuses(&env, &passed.address),
        [MilestoneStatus::Pending; 3]
    );
}

#[test]
fn milestones_are_sequential() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let (proposal, contractor) = (passed.address, &passed.contractor);

    assert_krill_error(
        env.submit_milestone(&proposal, contractor, 1),
        KrillError::MilestoneOutOfOrder,
    );
    env.submit_milestone(&proposal, contractor, 0)
        .expect("milestone 0 is first");
    assert_krill_error(
        env.submit_milestone(&proposal, contractor, 1),
        KrillError::MilestoneOutOfOrder,
    );
    env.approve_milestone(&proposal, 0)
        .expect("council approves milestone 0");
    env.submit_milestone(&proposal, contractor, 1)
        .expect("milestone 1 follows a released milestone 0");

    use MilestoneStatus::*;
    assert_eq!(statuses(&env, &proposal), [Released, Submitted, Pending]);
}

#[test]
fn milestone_index_must_exist() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    assert_krill_error(
        env.submit_milestone(&passed.address, &passed.contractor, 3),
        KrillError::MilestoneIndexOutOfRange,
    );
}

#[test]
fn only_the_contractor_can_submit() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let impostor = env.funded_keypair(LAMPORTS_PER_SOL);
    assert_anchor_error(
        env.submit_milestone(&passed.address, &impostor, 0),
        AnchorErrorCode::ConstraintHasOne,
    );
}

#[test]
fn cannot_submit_the_same_milestone_twice() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("first submit");
    assert_krill_error(
        env.submit_milestone(&passed.address, &passed.contractor, 0),
        KrillError::InvalidState,
    );
}

#[test]
fn non_council_cannot_approve() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");

    let outsider = env.funded_keypair(LAMPORTS_PER_SOL);
    for impostor in [&outsider, &passed.contractor] {
        let ix = env.approve_milestone_ix(&impostor.pubkey(), &passed.address, 0);
        assert_anchor_error(
            env.send(&[ix], &[impostor]),
            AnchorErrorCode::ConstraintHasOne,
        );
    }
    assert_eq!(
        statuses(&env, &passed.address)[0],
        MilestoneStatus::Submitted
    );
}

#[test]
fn council_cannot_approve_an_unsubmitted_milestone() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    assert_krill_error(
        env.approve_milestone(&passed.address, 0),
        KrillError::InvalidState,
    );
}

#[test]
fn council_reject_sends_milestone_back_to_pending() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let contractor_before = env.lamports(&passed.contractor.pubkey());
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");

    env.reject_milestone(&passed.address, 0)
        .expect("council rejects");

    assert_eq!(statuses(&env, &passed.address)[0], MilestoneStatus::Pending);
    assert_krill_error(
        env.reject_milestone(&passed.address, 0),
        KrillError::InvalidState,
    );
    assert_eq!(
        env.lamports(&passed.contractor.pubkey()),
        contractor_before - TX_FEE,
        "nothing is paid for a rejected milestone"
    );
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor resubmits after rework");
}

#[test]
fn approve_pays_the_contractor_the_exact_milestone_amount() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let escrow = pda::escrow(&passed.address);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");
    let contractor_before = env.lamports(&passed.contractor.pubkey());
    let escrow_before = env.lamports(&escrow);

    env.approve_milestone(&passed.address, 0)
        .expect("council approves");

    assert_eq!(
        env.lamports(&passed.contractor.pubkey()),
        contractor_before + MILESTONES[0]
    );
    assert_eq!(env.lamports(&escrow), escrow_before - MILESTONES[0]);
    let state = env.escrow(&passed.address);
    assert_eq!(state.released_lamports, MILESTONES[0]);
    assert_eq!(state.state, EscrowState::Active);
    assert_eq!(env.proposal(&passed.address).state, ProposalState::Escrowed);
}

#[test]
fn approving_the_final_milestone_completes_escrow_and_proposal() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let contractor_before = env.lamports(&passed.contractor.pubkey());
    let fees = 3 * TX_FEE;

    for index in 0..3 {
        deliver(&mut env, &passed, index);
    }

    let total: u64 = MILESTONES.iter().sum();
    let escrow = env.escrow(&passed.address);
    assert_eq!(escrow.state, EscrowState::Completed);
    assert_eq!(escrow.released_lamports, total);
    assert_eq!(
        env.proposal(&passed.address).state,
        ProposalState::Completed
    );
    assert_eq!(
        env.lamports(&passed.contractor.pubkey()),
        contractor_before + total - fees
    );
    let escrow_address = pda::escrow(&passed.address);
    assert_eq!(
        env.lamports(&escrow_address),
        env.rent_exempt_minimum(&escrow_address),
        "only rent is left behind"
    );
    assert_krill_error(env.cancel_escrow(&passed.address), KrillError::InvalidState);
}

#[test]
fn cancel_returns_unreleased_lamports() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    deliver(&mut env, &passed, 0);
    env.submit_milestone(&passed.address, &passed.contractor, 1)
        .expect("submitted work is still unreleased");
    let pooled_before = env.dao_state().pooled_lamports;
    let dao_before = env.lamports(&env.dao);

    env.cancel_escrow(&passed.address).expect("council cancels");

    let unreleased = MILESTONES[1] + MILESTONES[2];
    assert_eq!(env.dao_state().pooled_lamports, pooled_before + unreleased);
    assert_eq!(env.lamports(&env.dao), dao_before + unreleased);
    let escrow_address = pda::escrow(&passed.address);
    assert_eq!(
        env.lamports(&escrow_address),
        env.rent_exempt_minimum(&escrow_address)
    );
    assert_eq!(env.escrow(&passed.address).state, EscrowState::Cancelled);
    assert_eq!(
        env.proposal(&passed.address).state,
        ProposalState::Cancelled
    );
}

#[test]
fn cancel_blocks_further_submits_and_approvals() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    env.submit_milestone(&passed.address, &passed.contractor, 0)
        .expect("contractor submits");
    env.cancel_escrow(&passed.address).expect("council cancels");

    assert_krill_error(
        env.approve_milestone(&passed.address, 0),
        KrillError::InvalidState,
    );
    assert_krill_error(
        env.submit_milestone(&passed.address, &passed.contractor, 1),
        KrillError::InvalidState,
    );
    assert_krill_error(env.cancel_escrow(&passed.address), KrillError::InvalidState);
}

#[test]
fn only_the_council_can_cancel() {
    let mut env = KrillTestEnv::new();
    let passed = env.escrowed_proposal(&MILESTONES);
    let impostor = env.funded_keypair(LAMPORTS_PER_SOL);
    let ix = ix::cancel_escrow(&env.dao, &passed.address, &impostor.pubkey());
    assert_anchor_error(
        env.send(&[ix], &[&impostor]),
        AnchorErrorCode::ConstraintHasOne,
    );
    assert_eq!(env.escrow(&passed.address).state, EscrowState::Active);
}
