# Krill security review

Internal review of the on-chain program in `programs/krill` (Anchor 1.2.2,
Solana 3.x crates). This is my own review and has not been audited by a
third party. Every claim below points at code (`file:line`, paths
relative to `programs/krill/`) or at a test in
`programs/krill/tests/security.rs` (unless another file is named).

How to reproduce: `anchor build && cargo test`. The security suite alone:
`cargo test --test security`.

## 1. Threat model

### Assets

| Asset | Where it lives |
|---|---|
| Pooled SOL | lamports on the `Dao` account, tracked by `Dao::pooled_lamports` |
| Locked SOL | lamports on each `Escrow` account, above its rent reserve |
| Voice credits | `Member::credits` (unspent), burned into `VoteReceipt::credits` |
| Tally integrity | `Proposal::{for_votes, against_votes, credits_spent}` and receipts |
| State integrity | `ProposalState`, `EscrowState`, `MilestoneStatus` transitions |

### Actors

| Actor | Can do | Trusted for |
|---|---|---|
| DAO authority | `initialize_dao` (pays rent, picks parameters and council) | nothing after creation: it holds no powers (`dao_authority_has_no_special_powers`) |
| Council | `approve_milestone`, `reject_milestone`, `cancel_escrow` | judging deliveries honestly and staying live |
| Member | `deposit`, `create_proposal`, `cast_vote` with its own membership | nothing |
| Proposer | a member who opens a proposal and names the contractor | nothing |
| Contractor | `submit_milestone` on its own escrow | nothing |
| Anyone | `finalize`, `execute`, plain transfers, crafted accounts and instructions | nothing |
| Program upgrade authority | replace the program | out of scope |

### Trust assumptions

1. **The council is honest and live.** It can approve its own (or a colluding
   contractor's) milestones, cancel any active escrow, or never act at all.
   Escrowed SOL can only reach the contractor through council approval or the
   pool through council cancel; with an unresponsive council it stays locked.
   Members must vet the council (and that it is a key someone can sign with)
   before depositing: the program cannot check signability.
2. **Governance parameters are immutable and only sanity-checked.** Any
   positive `voting_period` and any `quorum_bps` up to 10 000 are accepted.
   Members must read them before joining because deposits cannot be withdrawn.
3. **The cluster has SIMD-0312 active** (`CreateAccountAllowPrefund`), which is
   what lets Anchor initialise a PDA that someone prefunded. Mainnet has it
   (see K-04).
4. **Clock.** Voting windows use `Clock::unix_timestamp`; validator drift of
   seconds is accepted.

## 2. Invariants

Each invariant is asserted by at least one test.

| # | Invariant | Enforced by | Test |
|---|---|---|---|
| I1 | `dao.lamports == rent + pooled_lamports` (`>=` once someone donates lamports) | `state/dao.rs:44` books every deposit; `execute.rs:43` debits the pool before `sub_lamports`; `cancel_escrow.rs:41-43` credits both | `dao_lamports_equal_rent_plus_pool_after_every_instruction` |
| I2 | `escrow.lamports == rent + sum(unreleased milestones)` | `execute.rs:64-65`, `approve_milestone.rs:47`, `cancel_escrow.rs:41` | `escrow_keeps_exactly_its_rent_after_completion_and_cancel` |
| I3 | Lamports are conserved across DAO, escrow (above rent) and contractor | the same three moves, all program-internal | `lamports_are_conserved_across_dao_escrow_and_contractor` |
| I4 | No program-owned account drops below rent exemption | I1 and I2; the runtime refuses the transaction otherwise | `escrow_payout_cannot_breach_rent`, `execute_cannot_spend_the_dao_rent` |
| I5 | `for_votes` / `against_votes` == sum of receipt votes per side; `credits_spent` == sum of receipt credits | `state/vote_receipt.rs:34`, `state/proposal.rs:67` | `tallies_equal_the_sum_of_receipts` |
| I6 | `receipt.votes == votes_for(receipt.credits)` and the tally delta never underflows | `state/vote_receipt.rs:44` (monotone `votes_for`) | `vote_delta_is_monotonic_and_never_underflows` (proptest) |
| I7 | Credits are burned, never created by voting: `member.credits + sum(receipts) == minted` | `state/member.rs:22` | `tallies_equal_the_sum_of_receipts` |
| I8 | Every state transition checks its exact source state | `state/proposal.rs:115`, `state/escrow.rs:105`, `Milestone::advance` | `every_instruction_is_refused_in_every_wrong_proposal_state`, `every_milestone_instruction_is_refused_in_every_wrong_milestone_status` |
| I9 | A contractor named in a proposal is not a Krill account or program | `instructions/create_proposal.rs:62,110` | `degenerate_contractors_are_rejected` |
| I10 | Events carry post-state values that match the accounts | `emit!` after each state change | `events_report_post_state_values` |

## 3. Findings

| ID | Severity | Title | Status | Test |
|---|---|---|---|---|
| K-01 | Low | Proposals could name an unpayable contractor (the DAO, the proposal, its escrow, the system or Krill program) | fixed | `degenerate_contractors_are_rejected` |
| K-02 | Informational | DAO names over 32 bytes abort with `ProgramFailedToComplete`, not `NameTooLong` | accepted, documented in code | `dao_name_longer_than_a_seed_is_refused_before_any_state_is_written` |
| K-03 | Informational | A milestone below the rent-exempt minimum cannot be paid to a contractor wallet holding 0 lamports | accepted | `tiny_milestone_to_an_unfunded_contractor_waits_until_the_wallet_exists` |
| K-04 | Informational | Resistance to PDA prefunding depends on SIMD-0312 | accepted (residual) | `pda_prefunding_cannot_block_initialisation`, `prefunding_defence_depends_on_simd_0312` |
| K-05 | Informational | Quorum is measured against credits ever minted, burned ones included | accepted (design) | `quorum_base_includes_burned_credits_so_a_spent_dao_needs_new_deposits` |
| K-06 | Informational | Lamports sent straight to the DAO or an escrow are unbooked and unspendable | accepted | `direct_transfer_to_dao_is_unspendable_surplus` |
| K-07 | Informational | Competing passed proposals race for the same pool; passed proposals never expire | accepted (design) | `competing_proposals_first_execute_wins_and_the_other_waits_for_funds` |
| K-08 | Informational | A member can front-run `create_proposal` and make a racing proposer retry | accepted | `stale_proposal_index_cannot_overwrite_an_existing_proposal` |
| K-09 | Informational | Extreme governance parameters are accepted | accepted (trust assumption 2) | `voting_period_overflow_fails_closed` |
| K-10 | Informational | `security.json` still held the template's placeholder contacts | fixed | n/a |

No finding allowed theft of pooled or escrowed SOL, minting credits, or
moving a tally.

### K-01: unpayable contractor (fixed)

`create_proposal` accepted any `contractor` key. If it named an account the
program owns (the DAO, the proposal itself, or the escrow it will create) or
a program id, the proposal could still pass. After `execute` the funds sat in
escrow: `submit_milestone` needs the contractor's signature, which Krill never
produces for its own PDAs, and `approve_milestone` requires a system-owned
contractor (`approve_milestone.rs:34`). Every credit spent on the proposal was
burned for nothing, and the SOL came back only if the council cancelled.

Fix: `require_payable_contractor` (`instructions/create_proposal.rs:110`)
rejects those five keys with the new `KrillError::InvalidContractor` (code
6015, appended so existing codes are unchanged). Cost: about 1 600 CU for the
escrow address derivation. Other unsignable keys (a random off-curve address,
another program's PDA) cannot be told apart on-chain from legitimate ones such
as a multisig vault; for those the council's cancel is the recovery path.

### K-02: over-long DAO name error

The DAO name is a PDA seed. Anchor derives the address while validating
accounts, before the handler runs, and the runtime aborts the derivation for
a seed over 32 bytes. So the `NameTooLong` check in
`instructions/initialize_dao.rs` only ever rejects the empty name. No DAO with
an over-long name can exist, so the invariant holds; the cost is an opaque
error for clients. Fixing it would need a composite accounts struct or a
custom argument type, both of which change the IDL. The code now says so in
a comment.

### K-03: tiny milestones to an empty wallet

The runtime refuses to create a system account below the rent-exempt minimum
(890 880 lamports for 0 bytes). A milestone smaller than that, paid to a
contractor address with no lamports, fails with `InsufficientFundsForRent`
until the contractor funds its wallet, after which the same approval
succeeds. Any wallet that has paid a fee already holds more than that, so this
only bites contractors who never sign their own transactions.

### K-04: prefunding and SIMD-0312

Every Krill account is a predictable PDA. Anyone can send lamports to the
address of a DAO, membership, next proposal, vote receipt or escrow before it
exists. Anchor 1.2.2 handles that with `CreateAccountAllowPrefund`, so init
still succeeds and the bribe stays as unbooked surplus
(`pda_prefunding_cannot_block_initialisation`). On a cluster without SIMD-0312
the same transfer would block that init. For the next proposal index that
blocks `create_proposal` for the whole DAO forever, which would lock the
treasury since there is no withdraw. LiteSVM's mainnet feature list has
SIMD-0312 active; `prefunding_defence_depends_on_simd_0312` fails loudly if
that ever changes and shows the failure mode. Check the feature on any other
cluster before deploying.

### K-05: quorum base includes burned credits

`quorum_credits = total_credits * quorum_bps / 10 000` uses every credit ever
minted, while voting burns credits. Once members have spent most of their
credits on earlier proposals, later ones may not reach quorum until fresh
deposits mint fresh credits. This is liveness only, and deposits restore it.
The frozen snapshot also means deposits during a vote cannot move the
goalposts.

### K-06: unbooked lamports

A plain transfer to the DAO raises its balance but not `pooled_lamports`, so
it mints no credits and no proposal can spend it (`create_proposal` and
`execute` check the pool, not the balance). The same holds for an escrow. It
cannot desync bookkeeping in the dangerous direction (pool above balance)
because only the program can debit these accounts. The surplus is
effectively burned. I left it that way: a sweep instruction would be new
attack surface.

### K-07: competing proposals and stale passed proposals

Each proposal checks `amount <= pooled_lamports` when it is created, but
several proposals can be backed by the same SOL. Whichever passed proposal is
executed first takes it; the others fail with `InsufficientTreasury` and stay
`Passed` until the pool is refilled, then anyone can execute them. A passed
proposal has no expiry, so it can be executed long after the vote. The
council can cancel an escrow it no longer wants, which returns the funds to
the pool.

### K-08: proposal index races

The proposal PDA is seeded with `dao.proposal_count`. Two proposals built
against the same count cannot both land: the second fails `ConstraintSeeds`
and never overwrites the first. A member who front-runs every proposal makes
honest proposers retry with the next index. Each attempt costs the griefer a
proposal's rent and requires membership.

### K-09: extreme parameters

With `voting_period` near `i64::MAX`, `create_proposal` fails with `Overflow`
(checked add, `create_proposal.rs:75`), so the DAO can never spend. A merely
huge period produces proposals that never close. A quorum of 10 000 bps needs
every credit ever minted. A council key nobody controls freezes every escrow.
All are visible on the `Dao` account before anyone deposits.

### K-10: security.json

The root `security.json` still had the Anchor template's `example.com`
contacts, fake auditors and placeholder revision. It now points at the
repository and GitHub private vulnerability reporting, and the root
`SECURITY.md` holds the disclosure policy.

## 4. Checklist

Status: **ok** (handled, with evidence), **fixed**, **accepted** (documented
limitation) or **n/a**.

### Access control

| Item | Status | Evidence |
|---|---|---|
| Value-moving and state-changing instructions name and enforce the right signer | ok | council: `approve_milestone.rs:12,16`, `reject_milestone.rs:11,15`, `cancel_escrow.rs:11,16`; contractor: `submit_milestone.rs:8,13`; member: `cast_vote.rs:14,18`, `create_proposal.rs:16,25`, `deposit.rs:12,22`. Tests: `attacker_cannot_approve_milestone_without_council`, `attacker_cannot_reject_milestone_without_council`, `attacker_cannot_cancel_escrow_without_council`, `attacker_cannot_submit_milestone_for_the_contractor`, `dao_authority_has_no_special_powers` |
| Member votes with another member's account | ok | member seeds include the signer, `cast_vote.rs:18`. `member_cannot_vote_with_another_members_account`, `member_cannot_vote_into_another_voters_receipt` |
| Proposer passes a membership of another DAO | ok | `create_proposal.rs:25`. `proposer_cannot_use_a_membership_of_another_dao`, `member_of_another_dao_cannot_vote` |
| `member.dao == dao` | ok | by seeds `[member, dao, wallet]` (`deposit.rs:22`, `create_proposal.rs:25`, `cast_vote.rs:18` via `proposal.dao`) |
| `proposal.dao == dao` | ok | by seeds `[proposal, dao, index]` (`execute.rs:22`, `approve_milestone.rs:22`, `cancel_escrow.rs:21`). `execute_cannot_pair_a_proposal_with_another_daos_treasury`, `council_of_another_dao_cannot_approve_reject_or_cancel` |
| `escrow.proposal == proposal` | ok | by seeds `[escrow, proposal]` (`approve_milestone.rs:28`, `cancel_escrow.rs:27`). `escrow_of_one_proposal_cannot_be_used_with_another` |
| `escrow.dao == dao` | ok | `has_one = dao` in `reject_milestone.rs:22`; elsewhere implied by the proposal seed chain |
| `escrow.contractor` | ok | `has_one = contractor` (`approve_milestone.rs:30`, `submit_milestone.rs:13`). `approve_cannot_pay_anyone_but_the_escrow_contractor` |
| `dao.council` | ok | `has_one = council` (`approve_milestone.rs:16`, `reject_milestone.rs:15`, `cancel_escrow.rs:16`) |
| `vote.proposal`, `vote.voter` | ok | by seeds `[vote, proposal, voter]` (`cast_vote.rs:34`). `vote_receipt_of_another_proposal_cannot_be_reused` |
| Permissionless `finalize` / `execute`: wrong pairing, other DAO's treasury, double execute, execute after cancel | ok | `finalize_and_execute_are_permissionless_but_single_shot`, `execute_cannot_pair_a_proposal_with_another_daos_treasury`, `execute_after_cancel_is_refused`, `cannot_execute_twice` (state_machine.rs) |

### Account validation and PDAs

| Item | Status | Evidence |
|---|---|---|
| Seeds separate DAOs, proposals and voters | ok | every seed starts with a distinct type prefix (`constants.rs:33-45`, distinct first bytes); variable-length `name` is the last seed of the DAO, so concatenation is unambiguous. Same authority and name twice is refused, not overwritten; NUL, case and trailing-space variants get their own addresses. `dao_names_are_byte_exact_seeds_and_never_collide` |
| Empty and over-long names | ok / K-02 | empty: `initialize_dao_rejects_an_empty_name` (dao.rs). Over 32 bytes: refused by the runtime during address derivation, before the handler. `dao_name_longer_than_a_seed_is_refused_before_any_state_is_written` |
| Account substitution (proposal of DAO A with DAO B, receipt of X on Y, escrow of X with Y) | ok | `execute_cannot_pair_a_proposal_with_another_daos_treasury`, `vote_receipt_of_another_proposal_cannot_be_reused`, `escrow_of_one_proposal_cannot_be_used_with_another` |
| `init_if_needed` on `VoteReceipt` | ok | Anchor re-validates owner, discriminator, space and seeds of an existing receipt; `is_fresh` (`state/vote_receipt.rs:28`) only fills identity fields on the first vote; `support` is fixed (`CannotSwitchSides`). Payer is the voter, space `8 + INIT_SPACE`. No instruction closes any account, so receipts cannot be revived. `vote_receipt_cannot_be_reinitialised`, `max_size_accounts_fit_their_space` |
| Stale proposal index | ok / K-08 | `stale_proposal_index_cannot_overwrite_an_existing_proposal` |
| Joining twice | ok | `init` on the membership. `member_cannot_join_twice_to_reset_credits` |
| Owner and discriminator checks | ok | `Account<T>` everywhere. `system_account_cannot_stand_in_for_the_dao`, `account_owned_by_another_program_cannot_impersonate_a_dao`, `krill_accounts_of_the_wrong_type_are_refused` |
| Self-referential seeds (`finalize`, `cast_vote`, `submit_milestone`, `reject_milestone`) | ok | sound because only Krill can create a Krill-owned account with these discriminators, and it always writes the fields it seeded with (`create_proposal.rs` writes `dao` and `index`; `execute.rs` writes `proposal`) |
| Space at max sizes | ok | 32-byte multi-byte name, 64-byte title, 8 milestones, receipt. `max_size_accounts_fit_their_space` |
| PDA prefunding | ok / K-04 | `pda_prefunding_cannot_block_initialisation`, `prefunding_defence_depends_on_simd_0312` |

### Arithmetic

| Item | Status | Evidence |
|---|---|---|
| Lamports, credits, votes, counters checked or bounded | ok | all `+`/`-` on state use `checked_*` except two proven ones: `state/member.rs:27` (guarded by the `require!` above) and `state/vote_receipt.rs:44` (monotone `votes_for`). No `as` casts in the crate; `u8` index uses `usize::from`; the only narrowing is `u64::try_from` in `state/dao.rs:75`. `overflow-checks = true` backs everything (`Cargo.toml:12`) |
| `cast_vote` delta monotone; credits cannot wrap | ok | `vote_delta_is_monotonic_and_never_underflows`, `credit_balances_cannot_wrap` |
| Quorum snapshot | ok | u128 intermediate, `state/dao.rs:69-76`. `quorum_snapshot_cannot_overflow` |
| `voting_period` overflow | ok / K-09 | checked add, `create_proposal.rs:75`. `voting_period_overflow_fails_closed` |
| Deposit rounding and dust | ok | floor division documented at `state/dao.rs:40-46`; dust is pooled and spendable but mints nothing; deposits under one credit are refused. `partial_credits_are_rounded_down_but_the_lamports_are_pooled`, `rejects_a_deposit_below_one_credit` (dao.rs). Dust cannot block anything: no instruction requires an exact balance |

### Lamport accounting and rent

| Item | Status | Evidence |
|---|---|---|
| `dao.lamports == rent + pooled` after every instruction | ok | `dao_lamports_equal_rent_plus_pool_after_every_instruction` |
| Pool can never exceed the balance; direct transfers | ok / K-06 | only the program debits the DAO, always after `withdraw_from_pool`. `direct_transfer_to_dao_is_unspendable_surplus` |
| Escrow keeps its rent after completion or cancel | ok, accepted | escrow, proposal and receipt accounts are never closed: they are the permanent on-chain record, and closing them would need a rent recipient policy plus a close instruction. Their rent (paid by the executor, proposer and voter) stays locked. `escrow_keeps_exactly_its_rent_after_completion_and_cancel` |
| Direct lamport moves never breach rent | ok | `escrow_payout_cannot_breach_rent`, `execute_cannot_spend_the_dao_rent` (simulated drift is refused by the runtime) |
| Degenerate contractors | fixed (K-01) | `degenerate_contractors_are_rejected`; empty-wallet edge case K-03 |

### State machine

| Item | Status | Evidence |
|---|---|---|
| Every instruction in every wrong state | ok | `every_instruction_is_refused_in_every_wrong_proposal_state` (6 states x 7 instructions), `every_milestone_instruction_is_refused_in_every_wrong_milestone_status` |
| Time boundaries | ok | vote allowed until `voting_ends_at - 1`, refused at `voting_ends_at`, where `finalize` opens (`state/proposal.rs:61,89`). `voting_window_boundaries_are_exact` |
| Milestones: out of range (incl. 255), resubmit, approve pending, cancel after complete, submit after cancel, rejection in the middle | ok | `every_milestone_instruction_is_refused_in_every_wrong_milestone_status`, `a_rejected_milestone_in_the_middle_blocks_the_ones_after_it`, proposal-state table rows `Completed` and `Cancelled` |
| Double vote, zero credits, voting after finalize | ok | `vote_receipt_cannot_be_reinitialised`, `cannot_vote_with_zero_credits` (quadratic_voting.rs), `voting_window_boundaries_are_exact` |

### Denial of service and griefing

| Item | Status | Evidence |
|---|---|---|
| Blocking `finalize` / `execute` | accepted / K-07 | `finalize` takes one account and cannot be blocked. `execute` can only be blocked by an earlier execute spending the pool (explicit `InsufficientTreasury`), or by prefunding without SIMD-0312 (K-04). `competing_proposals_first_execute_wins_and_the_other_waits_for_funds` |
| Council stalls forever | accepted | trust assumption 1 |
| Unbounded proposals | accepted | each costs the proposer rent and requires membership; `proposal_count` is a u64 with a checked increment (`state/dao.rs:79`); proposals do not interact except through the pool race |

### Events

| Item | Status | Evidence |
|---|---|---|
| Events report post-state truth | ok | `events_report_post_state_values` decodes all four event types from logs and compares them with the accounts |

### Anchor and toolchain hygiene

| Item | Status | Evidence |
|---|---|---|
| `overflow-checks = true` in release | ok | `Cargo.toml:12` (workspace) |
| `mut` only where data or lamports change | ok | read-only: `dao` in `approve_milestone.rs:13` and `reject_milestone.rs:12`, `member` in `create_proposal.rs:24`; `dao` is `mut` where lamports move (`execute.rs:15`, `cancel_escrow.rs:13`) |
| `declare_id!` matches `Anchor.toml` and the keypair | ok | `src/lib.rs:18`, `Anchor.toml` `[programs.localnet]`, `solana-keygen pubkey target/deploy/krill-keypair.json` all give `4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA` |
| `security.json` and root `SECURITY.md` | fixed (K-10) | `security.json`, `SECURITY.md` |

## 5. Known limitations

* **Sybil splitting.** Quadratic voting assumes one person per wallet. A whale
  who splits a deposit across many wallets gets close to linear voting power
  again (the concavity test in `src/math.rs` shows splitting never loses
  votes). Krill has no identity layer; this is inherent to on-chain QV.
* **Council trust.** See trust assumption 1. The council is a single key; use
  a multisig for anything that matters.
* **Competing proposals.** See K-07: first executed wins; there is no
  reservation of funds at vote time and no expiry for passed proposals.
* **No withdraw.** Deposits are a one-way contribution. Unspent credits and
  pooled SOL never return to members, and there is no way to dissolve a DAO.
  This makes parameter mistakes (K-09) and council loss permanent.
* **Credits are burned on every vote, including on rejected proposals.** That
  is what makes votes cost something; it also drives K-05.
* **Rent is never reclaimed** from proposals, receipts and escrows.

## 6. Residual risks

1. Council compromise or collusion with a contractor can pay out any active
   escrow (bounded by the escrowed amount, never the pool).
2. Unresponsive council locks escrowed SOL indefinitely.
3. Deploying on a cluster without SIMD-0312 opens a 1-transfer DoS on PDA
   inits (K-04); worst case it freezes proposal creation for a DAO.
4. A low quorum (including 0) lets a small group pass a proposal for the whole
   treasury if nobody votes against within the window.
5. Stale passed proposals can drain later deposits if nobody watches (K-07);
   only the council's cancel undoes it.
6. Homoglyph DAO names: names are byte-exact seeds, so `krill` and a
   look-alike in another script are different DAOs. Clients should show the
   address, not only the name.
7. The program is upgradeable; whoever holds the upgrade authority can change
   every rule above.
8. No external audit yet.
