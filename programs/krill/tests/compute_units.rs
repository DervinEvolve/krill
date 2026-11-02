//! Compute budget report: runs one scripted lifecycle that touches every
//! instruction and prints what each one cost. Run it alone with
//! `cargo test --test compute_units -- --nocapture`.

mod common;

use common::*;
use litesvm::LiteSVM;

/// Solana's default per-instruction compute budget.
const DEFAULT_CU_LIMIT: u64 = 200_000;

/// Collects `(instruction, compute units)` rows in the order they ran.
#[derive(Default)]
struct CuReport {
    rows: Vec<(&'static str, u64)>,
}

impl CuReport {
    fn record(&mut self, instruction: &'static str, result: TxResult) {
        let meta = result.unwrap_or_else(|failed| panic!("{instruction} failed: {:?}", failed.err));
        self.rows.push((instruction, meta.compute_units_consumed));
    }

    fn print(&self) {
        let width = self
            .rows
            .iter()
            .map(|(name, _)| name.len())
            .max()
            .unwrap_or(0);
        println!("{:<width$} | {:>6}", "instruction", "CU");
        println!("{:-<width$}-|-{:->6}", "", "");
        for (name, units) in &self.rows {
            println!("{name:<width$} | {units:>6}");
        }
    }
}

#[test]
fn report_compute_units() {
    // Fixed keys pin every PDA bump, so the numbers below are repeatable.
    let mut env = KrillTestEnv::on_with_keys(LiteSVM::new(), seeded_keypair(1), seeded_keypair(2));
    let mut report = CuReport::default();

    report.record(
        "initialize_dao",
        env.initialize_dao(DAO_NAME, VOTING_PERIOD, QUORUM_BPS),
    );
    let member = env.fund(seeded_keypair(3), 3 * LAMPORTS_PER_SOL);
    report.record("join", env.join(&member, LAMPORTS_PER_SOL));
    report.record("deposit", env.deposit(&member, LAMPORTS_PER_SOL));

    let contractor = env.fund(seeded_keypair(4), LAMPORTS_PER_SOL);
    let milestones = [LAMPORTS_PER_SOL / 2, LAMPORTS_PER_SOL / 2];
    let (proposal, created) = env.create_proposal(&member, &contractor.pubkey(), &milestones);
    report.record("create_proposal", created);
    report.record("cast_vote", env.vote(&member, &proposal, 1_000, true));
    env.warp_past_voting(&proposal);
    report.record("finalize", env.finalize(&proposal));
    report.record("execute", env.execute(&proposal));

    report.record(
        "submit_milestone",
        env.submit_milestone(&proposal, &contractor, 0),
    );
    report.record("reject_milestone", env.reject_milestone(&proposal, 0));
    env.submit_milestone(&proposal, &contractor, 0)
        .expect("contractor resubmits");
    report.record("approve_milestone", env.approve_milestone(&proposal, 0));
    report.record("cancel_escrow", env.cancel_escrow(&proposal));

    report.print();
    assert_eq!(report.rows.len(), 11, "every instruction is measured");
    for (name, units) in &report.rows {
        assert!(
            *units < DEFAULT_CU_LIMIT,
            "{name} used {units} CU, over the {DEFAULT_CU_LIMIT} CU default"
        );
    }
}
