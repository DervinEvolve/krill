//! Quadratic voting: votes are the square root of credits, applied to each
//! voter's cumulative credits, in fixed point with nine decimals.

mod common;

use common::*;

/// sqrt(1_000) = 31.622776601…
const VOTES_FOR_1_000_CREDITS: u128 = 31_622_776_601;
/// sqrt(100_000) = 316.227766016…
const VOTES_FOR_100_000_CREDITS: u128 = 316_227_766_016;

/// A DAO with one member holding `deposit` lamports and a proposal from them.
fn open_proposal(env: &mut KrillTestEnv, deposit: u64) -> (Keypair, Pubkey) {
    let voter = env.new_member(deposit);
    let contractor = Keypair::new();
    let (proposal, created) =
        env.create_proposal(&voter, &contractor.pubkey(), &[LAMPORTS_PER_CREDIT]);
    created.expect("proposal is created");
    (voter, proposal)
}

#[test]
fn one_thousand_credits_cast_31_622776601_votes() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = open_proposal(&mut env, LAMPORTS_PER_SOL);

    env.vote(&voter, &proposal, 1_000, true)
        .expect("vote is cast");

    assert_eq!(votes_for(1_000), VOTES_FOR_1_000_CREDITS);
    let receipt = env.receipt(&proposal, &voter.pubkey());
    assert_eq!(receipt.proposal, proposal);
    assert_eq!(receipt.voter, voter.pubkey());
    assert!(receipt.support);
    assert_eq!(receipt.credits, 1_000);
    assert_eq!(receipt.votes, VOTES_FOR_1_000_CREDITS);

    let state = env.proposal(&proposal);
    assert_eq!(state.for_votes, VOTES_FOR_1_000_CREDITS);
    assert_eq!(state.against_votes, 0);
    assert_eq!(state.credits_spent, 1_000);
    assert_eq!(env.member(&voter.pubkey()).credits, 0, "credits are burned");
}

#[test]
fn top_up_applies_sqrt_to_cumulative_credits() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = open_proposal(&mut env, LAMPORTS_PER_SOL);

    env.vote(&voter, &proposal, 400, true).expect("first vote");
    assert_eq!(env.proposal(&proposal).for_votes, 20 * VOTE_SCALE);
    env.vote(&voter, &proposal, 500, true).expect("top-up vote");

    let exact = votes_for(900);
    assert_eq!(exact, 30 * VOTE_SCALE);
    let split = votes_for(400) + votes_for(500);
    assert_eq!(split, 42_360_679_774, "what splitting would have bought");

    let state = env.proposal(&proposal);
    assert_eq!(state.for_votes, exact);
    assert_eq!(state.credits_spent, 900);
    let receipt = env.receipt(&proposal, &voter.pubkey());
    assert_eq!((receipt.credits, receipt.votes), (900, exact));
    assert_eq!(env.member(&voter.pubkey()).credits, 100);
}

#[test]
fn cannot_switch_sides() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = open_proposal(&mut env, LAMPORTS_PER_SOL);
    env.vote(&voter, &proposal, 100, true).expect("vote for");

    let result = env.vote(&voter, &proposal, 100, false);

    assert_krill_error(result, KrillError::CannotSwitchSides);
    let state = env.proposal(&proposal);
    assert_eq!((state.for_votes, state.against_votes), (10 * VOTE_SCALE, 0));
    assert_eq!(env.member(&voter.pubkey()).credits, 900);
}

#[test]
fn cannot_spend_more_credits_than_owned() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = open_proposal(&mut env, LAMPORTS_PER_SOL);

    assert_krill_error(
        env.vote(&voter, &proposal, 1_001, true),
        KrillError::InsufficientCredits,
    );
    env.vote(&voter, &proposal, 600, true)
        .expect("partial vote");
    assert_krill_error(
        env.vote(&voter, &proposal, 401, true),
        KrillError::InsufficientCredits,
    );
    assert_eq!(env.member(&voter.pubkey()).credits, 400);
}

#[test]
fn cannot_vote_with_zero_credits() {
    let mut env = KrillTestEnv::new();
    let (voter, proposal) = open_proposal(&mut env, LAMPORTS_PER_SOL);
    assert_krill_error(
        env.vote(&voter, &proposal, 0, true),
        KrillError::InsufficientCredits,
    );
}

#[test]
fn non_members_cannot_vote() {
    let mut env = KrillTestEnv::new();
    let (_, proposal) = open_proposal(&mut env, LAMPORTS_PER_SOL);
    let stranger = env.funded_keypair(LAMPORTS_PER_SOL);
    assert_anchor_error(
        env.vote(&stranger, &proposal, 1, true),
        AnchorErrorCode::AccountNotInitialized,
    );
}

#[test]
fn eleven_krill_outvote_one_whale() {
    let mut env = KrillTestEnv::new();
    let whale = env.new_member(100 * LAMPORTS_PER_SOL);
    let krill: Vec<Keypair> = (0..11).map(|_| env.new_member(LAMPORTS_PER_SOL)).collect();
    let contractor = Keypair::new();
    let (proposal, created) =
        env.create_proposal(&whale, &contractor.pubkey(), &[LAMPORTS_PER_SOL]);
    created.expect("proposal is created");

    env.vote(&whale, &proposal, 100_000, false)
        .expect("whale votes against");
    for member in &krill {
        env.vote(member, &proposal, 1_000, true)
            .expect("krill votes for");
    }

    let state = env.proposal(&proposal);
    assert_eq!(state.against_votes, VOTES_FOR_100_000_CREDITS);
    assert_eq!(state.for_votes, 11 * VOTES_FOR_1_000_CREDITS);
    assert_eq!(state.for_votes, 347_850_542_611);
    assert_eq!(state.credits_spent, 111_000);

    env.warp_past_voting(&proposal);
    env.finalize(&proposal).expect("proposal finalizes");
    assert_eq!(env.proposal(&proposal).state, ProposalState::Passed);
}
