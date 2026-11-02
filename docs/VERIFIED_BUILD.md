# Verified build on devnet

A verifiable build compiles the program inside a pinned Docker image, so anyone who builds the same commit gets the same bytes. The SHA-256 of those bytes can then be compared with the SHA-256 of the program that is actually deployed. If the two hashes match, the deployed program was built from exactly that source and nothing else.

Krill uses [`solana-verify`](https://github.com/solana-foundation/solana-verifiable-build) (0.5.2) for the build and the hashes, and the Agave CLI 3.1.9 for the deploy.

- Program: [`4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA`](https://explorer.solana.com/address/4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA?cluster=devnet) on devnet
- Workflow: [`.github/workflows/verify-devnet.yml`](../.github/workflows/verify-devnet.yml)
- Runbook (same steps on your own machine): [`scripts/devnet/deploy-and-verify.sh`](../scripts/devnet/deploy-and-verify.sh)
- Badge data: [`docs/verified.json`](verified.json), read by shields.io for the README badge

## How the workflow proves it

The workflow runs `scripts/devnet/deploy-and-verify.sh`. In order:

1. **Pinned toolchain.** The root `Cargo.toml` says `[workspace.metadata.cli] solana = "3.1.9"`. `solana-verify` maps that to one Docker image by digest (`solanafoundation/solana-verifiable-build@sha256:d7079331…`), so the compiler, platform tools and flags are fixed. `Cargo.lock` is used with `--locked`.
2. **Build.** `solana-verify build --library-name krill --arch v0 .` builds the program in that image and writes `target/deploy/krill.so`.
3. **Executable hash.** `solana-verify get-executable-hash target/deploy/krill.so` prints the SHA-256 of the program bytes (trailing zero padding stripped).
4. **Deploy or upgrade.** If the program account does not exist, `solana program deploy` does a first deploy with `--program-id <program keypair>`, `--upgrade-authority <deployer>` and `--max-len` at 1.5x the program size, so later upgrades have room. If it exists, the same command with `--program-id 4y17…` upgrades it. If the on-chain hash already equals the build, nothing is deployed.
5. **Read it back.** `solana-verify get-program-hash -u devnet 4y17…` hashes the bytes in the program's data account. The job fails unless this equals the executable hash from step 3.
6. **Rebuild from the public repo.** If `submit_remote_verification` is on, `solana-verify verify-from-repo` clones `https://github.com/DervinEvolve/krill`, checks out the exact commit (`--commit-hash`), builds it again with the same arguments (`--library-name krill --arch v0`), and compares that hash with the chain too. On a match it writes a verify PDA through the OtterSec `otter-verify` program, signed by the upgrade authority. The PDA records the repo URL, the commit and the build arguments, so anyone can repeat the build.
7. **Badge.** For a devnet run from `main`, the workflow writes `docs/verified.json` (`verified · <first 8 of the hash> · <short commit>`) and commits it to `main` as `Verified build <hash8> on devnet`. The job summary has the hash and the explorer link.

Steps 3 and 5 are the proof: the bytes on chain hash to what the pinned image builds from this commit. Step 6 shows that a fresh clone of the public repo, not just the runner's checkout, gives the same bytes.

About OtterSec's remote verifier: `verify-from-repo --remote` was removed in `solana-verify` 0.5 (it now exits with an error), and the replacement, `solana-verify remote submit-job`, only accepts mainnet. So on devnet the "remote verification" input means step 6: the rebuild from the public repo plus the on-chain verify PDA. The script queues `remote submit-job` itself when the cluster is `mainnet-beta`.

## Running it

### Secrets

Add both under **Settings → Secrets and variables → Actions → New repository secret**. The value of each is the whole content of a Solana keypair file, a JSON array of 64 numbers.

| Secret | What it is | When it is needed |
|---|---|---|
| `DEVNET_DEPLOYER_KEYPAIR` | The deployer. It pays the fees and becomes the program's upgrade authority. | Every run |
| `KRILL_PROGRAM_KEYPAIR` | The program id keypair, whose address is `4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA` | Only the first deploy (and again after a devnet reset). You can delete it afterwards. |

The program keypair is `target/deploy/krill-keypair.json` on the machine that first ran `anchor build` for this repo. `target/` is git-ignored, so it is not in the repo, and it has to be the file whose address matches `declare_id!` in `programs/krill/src/lib.rs`. Check before uploading:

```bash
solana-keygen pubkey target/deploy/krill-keypair.json   # must print 4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA
```

Use a fresh key for the deployer, not a wallet you use for anything else:

```bash
solana-keygen new --outfile ~/krill-devnet-deployer.json
gh secret set DEVNET_DEPLOYER_KEYPAIR < ~/krill-devnet-deployer.json
gh secret set KRILL_PROGRAM_KEYPAIR < target/deploy/krill-keypair.json
```

If a secret the run needs is missing or is not a keypair, the job stops at its first step with a message naming the secret.

### Devnet SOL

The deployer needs about **4 SOL** on devnet. Most of it is rent, not fees:

- A first deploy creates the program data account at `--max-len`, about 1.5 × 347 KB = 520 KB. Rent-exempt for that size is about 3.6 SOL, and it stays locked in the account for as long as the program exists.
- An upgrade writes the new program to a buffer first (about 2.4 SOL of rent for 347 KB). The buffer is closed after the upgrade and the SOL comes back.
- The verify PDA and the transaction fees are a few thousandths of a SOL.

Below 4 SOL the job tries `solana airdrop 2` up to three times. The devnet faucet rate-limits, so if that is not enough the job stops and prints the deployer address. Fund it at https://faucet.solana.com and run again.

### Run the workflow

**Actions → Verify on devnet → Run workflow**, on `main`. Or:

```bash
gh workflow run verify-devnet.yml --ref main -f cluster=devnet -f submit_remote_verification=true
```

It takes 20 to 40 minutes, most of it the two Docker builds. Runs from another branch, or on testnet, deploy and verify but leave the badge alone.

### On your own machine

You need Docker running, the Agave CLI 3.1.9 and `solana-verify` 0.5.2 (`cargo install solana-verify --version 0.5.2 --locked`, or the release binary).

```bash
scripts/devnet/deploy-and-verify.sh --dry-run                  # prints every command, runs nothing on chain
scripts/devnet/deploy-and-verify.sh \
  --deployer ~/krill-devnet-deployer.json \
  --program-keypair target/deploy/krill-keypair.json
```

`--help` lists the rest: `--cluster`, `--no-repo-verify`, `--write-badge`, `--so` to deploy an artifact you already built. The script refuses to deploy with uncommitted changes to the program, because the hash would then match no commit.

## Re-verify it yourself

Anyone can check the deployed program without any keys. Compare the hash on chain with the hash of your own build of the same commit:

```bash
solana-verify get-program-hash -u devnet 4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA

git checkout <commit from the badge>
solana-verify build --library-name krill --arch v0 .
solana-verify get-executable-hash target/deploy/krill.so
```

The two hashes must be equal. `solana-verify verify-from-repo -u devnet --program-id 4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA --commit-hash <commit> --library-name krill --arch v0 https://github.com/DervinEvolve/krill` does the clone, build and compare in one go. At the end it asks whether to write a verify PDA; answer no unless you want one signed by your own key.

`solana-verify get-program-pda -u devnet --program-id 4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA --signer <upgrade authority>` shows the repo, commit and arguments the workflow recorded.

## Caveats

- **Devnet resets.** Devnet is wiped now and then. The program and the verify PDA disappear, but the badge in `main` still shows the last run. Run the workflow again; it notices the program is missing and does a first deploy, so `KRILL_PROGRAM_KEYPAIR` has to be set again.
- **The upgrade authority is the deployer.** Whoever holds `DEVNET_DEPLOYER_KEYPAIR` can replace the program. A verification proves what is deployed now, not what will be deployed later. That is fine for a devnet demo. On mainnet I would make a multisig the upgrade authority and upload the PDA with `solana-verify export-pda-tx`.
- **SBPF version.** `anchor build` with Anchor 1.2.2 emits SBPF v3, which Agave 3.1 clusters do not load yet (the same reason the arena rebuilds with `cargo-build-sbf --arch v0`). The verifiable build passes `--arch v0`, so the deployed program is a v0 build. Its hash will never match `target/deploy/krill.so` from a plain `anchor build`; compare only against `solana-verify build --arch v0`. When the clusters accept v3, change `--arch` in the script and the PDA picks it up on the next run.
- **Pinned versions.** The build image comes from `[workspace.metadata.cli]` in `Cargo.toml`. Changing that number changes the compiler, so the hash changes too. That is expected; run the workflow again.
- **Badge commits.** The workflow pushes to `main` with the workflow token. If `main` gets branch protection that blocks that, the run still deploys and verifies but the badge step fails; allow GitHub Actions to push or update `docs/verified.json` by hand.

## If the deploy stalls

The public devnet RPC rate-limits the few hundred write transactions a deploy sends, so the script sends them to validator TPUs by default. If a run still fails with "Max retries exceeded", add a private devnet RPC URL as the repository secret `DEVNET_RPC_URL`; the workflow then routes the writes through it (`--via-rpc`). A deploy that dies mid-way leaves a funded buffer account behind; the next run closes it and gets the SOL back before deploying again.
