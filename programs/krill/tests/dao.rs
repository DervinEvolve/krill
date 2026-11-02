//! DAO lifecycle: creating a DAO, joining it and topping up the treasury.

mod common;

use common::*;

const ONE_CREDIT: u64 = LAMPORTS_PER_CREDIT;

#[test]
fn initialize_dao_stores_its_configuration() {
    let env = KrillTestEnv::new();
    let dao = env.dao_state();

    assert_eq!(dao.authority, env.authority.pubkey());
    assert_eq!(dao.council, env.council.pubkey());
    assert_eq!(dao.name, DAO_NAME);
    assert_eq!(dao.voting_period, VOTING_PERIOD);
    assert_eq!(dao.quorum_bps, QUORUM_BPS);
    assert_eq!(
        (
            dao.pooled_lamports,
            dao.total_credits,
            dao.member_count,
            dao.proposal_count
        ),
        (0, 0, 0, 0)
    );
    assert_eq!(env.lamports(&env.dao), env.rent_exempt_minimum(&env.dao));
}

#[test]
fn initialize_dao_accepts_a_unanimous_quorum() {
    let mut env = KrillTestEnv::without_dao();
    env.initialize_dao(DAO_NAME, VOTING_PERIOD, 10_000)
        .expect("10_000 bps is a valid quorum");
    assert_eq!(env.dao_state().quorum_bps, 10_000);
}

#[test]
fn initialize_dao_rejects_an_empty_name() {
    let mut env = KrillTestEnv::without_dao();
    let result = env.initialize_dao("", VOTING_PERIOD, QUORUM_BPS);
    assert_krill_error(result, KrillError::NameTooLong);
}

#[test]
fn initialize_dao_rejects_a_non_positive_voting_period() {
    let mut env = KrillTestEnv::without_dao();
    for voting_period in [0, -1] {
        let result = env.initialize_dao(DAO_NAME, voting_period, QUORUM_BPS);
        assert_krill_error(result, KrillError::InvalidVotingPeriod);
    }
}

#[test]
fn initialize_dao_rejects_a_quorum_above_one_hundred_percent() {
    let mut env = KrillTestEnv::without_dao();
    let result = env.initialize_dao(DAO_NAME, VOTING_PERIOD, 10_001);
    assert_krill_error(result, KrillError::InvalidQuorum);
}

#[test]
fn two_members_join_with_exact_credits_and_pool() {
    let mut env = KrillTestEnv::new();
    let alice = env.new_member(LAMPORTS_PER_SOL);
    let bob = env.new_member(250 * ONE_CREDIT);

    let dao = env.dao_state();
    assert_eq!(dao.member_count, 2);
    assert_eq!(dao.pooled_lamports, LAMPORTS_PER_SOL + 250 * ONE_CREDIT);
    assert_eq!(dao.total_credits, 1_000 + 250);
    assert_eq!(
        env.lamports(&env.dao),
        env.rent_exempt_minimum(&env.dao) + dao.pooled_lamports
    );

    let alice_state = env.member(&alice.pubkey());
    assert_eq!(alice_state.dao, env.dao);
    assert_eq!(alice_state.wallet, alice.pubkey());
    assert_eq!(
        (alice_state.credits, alice_state.deposited),
        (1_000, LAMPORTS_PER_SOL)
    );
    let bob_state = env.member(&bob.pubkey());
    assert_eq!(
        (bob_state.credits, bob_state.deposited),
        (250, 250 * ONE_CREDIT)
    );
}

#[test]
fn join_moves_the_deposit_out_of_the_wallet() {
    let mut env = KrillTestEnv::new();
    let wallet = env.funded_keypair(2 * LAMPORTS_PER_SOL);
    let dao_before = env.lamports(&env.dao);

    env.join(&wallet, LAMPORTS_PER_SOL).expect("wallet joins");

    let member_rent = env.rent_exempt_minimum(&pda::member(&env.dao, &wallet.pubkey()));
    assert_eq!(env.lamports(&env.dao), dao_before + LAMPORTS_PER_SOL);
    assert_eq!(
        env.lamports(&wallet.pubkey()),
        LAMPORTS_PER_SOL - member_rent - TX_FEE
    );
}

#[test]
fn partial_credits_are_rounded_down_but_the_lamports_are_pooled() {
    let mut env = KrillTestEnv::new();
    let wallet = env.new_member(ONE_CREDIT + ONE_CREDIT / 2);

    assert_eq!(env.member(&wallet.pubkey()).credits, 1);
    let dao = env.dao_state();
    assert_eq!(dao.total_credits, 1);
    assert_eq!(dao.pooled_lamports, ONE_CREDIT + ONE_CREDIT / 2);
}

#[test]
fn deposit_tops_up_an_existing_member() {
    let mut env = KrillTestEnv::new();
    let wallet = env.new_member(LAMPORTS_PER_SOL);

    env.deposit(&wallet, 500 * ONE_CREDIT)
        .expect("member deposits");

    let member = env.member(&wallet.pubkey());
    assert_eq!(member.credits, 1_500);
    assert_eq!(member.deposited, LAMPORTS_PER_SOL + 500 * ONE_CREDIT);
    let dao = env.dao_state();
    assert_eq!(dao.member_count, 1, "a deposit is not a new member");
    assert_eq!(dao.total_credits, 1_500);
    assert_eq!(dao.pooled_lamports, member.deposited);
}

#[test]
fn rejects_a_deposit_below_one_credit() {
    let mut env = KrillTestEnv::new();
    let newcomer = env.funded_keypair(LAMPORTS_PER_SOL);
    assert_krill_error(
        env.join(&newcomer, ONE_CREDIT - 1),
        KrillError::DepositTooSmall,
    );

    let member = env.new_member(LAMPORTS_PER_SOL);
    assert_krill_error(
        env.deposit(&member, ONE_CREDIT - 1),
        KrillError::DepositTooSmall,
    );
    assert_eq!(env.dao_state().pooled_lamports, LAMPORTS_PER_SOL);
}

#[test]
fn deposit_requires_membership() {
    let mut env = KrillTestEnv::new();
    let stranger = env.funded_keypair(LAMPORTS_PER_SOL);
    let result = env.deposit(&stranger, ONE_CREDIT);
    assert_anchor_error(result, AnchorErrorCode::AccountNotInitialized);
}
