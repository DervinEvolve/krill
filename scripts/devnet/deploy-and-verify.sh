#!/usr/bin/env bash
#
# Builds Krill with solana-verify, deploys it (first time) or upgrades it
# (after that), and checks that the program on chain hashes to exactly what
# this commit builds to. The verify-devnet GitHub workflow runs this same file.
#
# Needs a running Docker daemon, the Solana CLI 3.1.x and solana-verify.
# See docs/VERIFIED_BUILD.md, or run with --help.

set -euo pipefail

readonly PROGRAM_ID="4y17UBnZhA5iwU1n7RTZDmL6C9fv1FbDJLtECxAzVNjA"
readonly LIBRARY_NAME="krill"
# SBPF v0 loads on every public cluster. Anchor 1.2.2 emits v3 by default,
# which Agave 3.1 does not load; see arena/src/program.ts.
readonly ARCH="v0"
readonly LAMPORTS_PER_SOL=1000000000
# Rent-exempt minimum on the public clusters: (data bytes + 128) * 6960 lamports.
readonly RENT_PER_BYTE=6960
readonly ACCOUNT_OVERHEAD=128
readonly PROGRAMDATA_HEADER=45
readonly BUFFER_HEADER=37
readonly FEE_MARGIN=100000000 # 0.1 SOL for transaction fees
readonly AIRDROP_SOL=2
readonly AIRDROP_TRIES=3

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT

cluster="devnet"
rpc_url=""
via_rpc=0
deployer="${HOME}/.config/solana/id.json"
program_keypair="${REPO_ROOT}/target/deploy/krill-keypair.json"
artifact=""
repo_url="https://github.com/DervinEvolve/krill"
repo_verify=1
min_sol=4
write_badge=0
allow_dirty=0
dry_run=0
assume_yes=0

usage() {
  cat <<EOF
Usage: scripts/devnet/deploy-and-verify.sh [options]

Builds the Krill program in solana-verify's pinned Docker image, deploys it the
first time or upgrades it after that, and fails unless the on-chain program
hash equals the hash of the verifiable build. Then it rebuilds from the public
repo at this commit with verify-from-repo and records the result on chain.

Options:
  -u, --cluster CLUSTER       devnet (default), testnet, mainnet-beta, localhost
                              or an RPC URL
  -k, --deployer PATH         fee payer and upgrade authority keypair
                              (default: ~/.config/solana/id.json)
  -p, --program-keypair PATH  program id keypair, only used for the first deploy
                              (default: target/deploy/krill-keypair.json)
      --so PATH               skip the Docker build and deploy this artifact,
                              which must come from solana-verify build
      --repo-url URL          repo verify-from-repo clones
                              (default: ${repo_url})
      --no-repo-verify        skip verify-from-repo (the rebuild from the public
                              repo and the verify PDA it writes on chain)
      --min-sol N             top up below this balance, never less than the
                              deploy needs (default: ${min_sol})
      --write-badge           write docs/verified.json for the README badge
      --allow-dirty           build with uncommitted changes to the program
      --via-rpc               send deploy writes through the RPC instead of validator
                              TPUs (for a private RPC; the public one rate-limits them)
      --dry-run               print every build, network and on-chain command
                              instead of running it (local git checks still run)
  -y, --yes                   do not ask before deploying
  -h, --help                  show this help

Program id: ${PROGRAM_ID}
EOF
}

log() { printf '==> %s\n' "$*" >&2; }
warn() {
  if [[ -n ${GITHUB_ACTIONS:-} ]]; then printf '::warning::%s\n' "$*"; fi
  printf 'warning: %s\n' "$*" >&2
}
die() {
  if [[ -n ${GITHUB_ACTIONS:-} ]]; then printf '::error::%s\n' "$*"; fi
  printf 'error: %s\n' "$*" >&2
  exit 1
}
step() {
  if [[ -n ${GITHUB_ACTIONS:-} ]]; then printf '::endgroup::\n::group::%s\n' "$*"; fi
  log "$*"
}

# Prints a command the way the shell reads it.
show() {
  printf '+' >&2
  printf ' %q' "$@" >&2
  printf '\n' >&2
}

# Runs a command, or only prints it under --dry-run.
run() {
  show "$@"
  if ((dry_run)); then return 0; fi
  "$@"
}

# Runs a command for its stdout; under --dry-run prints it and returns $1.
capture() {
  local placeholder=$1
  shift
  show "$@"
  if ((dry_run)); then
    printf '%s\n' "$placeholder"
    return 0
  fi
  "$@"
}

need_tool() {
  command -v "$1" >/dev/null 2>&1 && return 0
  if ((dry_run)); then warn "$1 is not on PATH ($2)"; else die "$1 is not on PATH ($2)"; fi
}

need_file() {
  [[ -f $1 ]] && return 0
  if ((dry_run)); then warn "$2: $1 does not exist"; else die "$2: $1 does not exist"; fi
}

sol() { printf '%d.%09d' $(($1 / LAMPORTS_PER_SOL)) $(($1 % LAMPORTS_PER_SOL)); }
rent() { echo $((($1 + ACCOUNT_OVERHEAD) * RENT_PER_BYTE)); }
can_airdrop() {
  case "$cluster" in
    devnet | testnet | localhost | http://127.0.0.1:* | http://localhost:*) return 0 ;;
    *) return 1 ;;
  esac
}

explorer_url() {
  local base="https://explorer.solana.com/address/${PROGRAM_ID}"
  case "$cluster" in
    mainnet-beta) printf '%s\n' "$base" ;;
    devnet | testnet) printf '%s?cluster=%s\n' "$base" "$cluster" ;;
    localhost) printf '%s?cluster=custom&customUrl=http%%3A%%2F%%2Flocalhost%%3A8899\n' "$base" ;;
    *)
      local encoded=${cluster//:/%3A}
      printf '%s?cluster=custom&customUrl=%s\n' "$base" "${encoded//\//%2F}"
      ;;
  esac
}

parse_args() {
  while (($#)); do
    case "$1" in
      -u | --cluster | -k | --deployer | -p | --program-keypair | --so | --repo-url | --min-sol)
        (($# >= 2)) || die "$1 needs a value (see --help)"
        case "$1" in
          -u | --cluster) cluster=$2 ;;
          -k | --deployer) deployer=$2 ;;
          -p | --program-keypair) program_keypair=$2 ;;
          --so) artifact=$2 ;;
          --repo-url) repo_url=$2 ;;
          --min-sol) min_sol=$2 ;;
        esac
        shift 2
        ;;
      --no-repo-verify) repo_verify=0 && shift ;;
      --write-badge) write_badge=1 && shift ;;
      --allow-dirty) allow_dirty=1 && shift ;;
      --via-rpc) via_rpc=1 && shift ;;
      --dry-run) dry_run=1 && shift ;;
      -y | --yes) assume_yes=1 && shift ;;
      -h | --help) usage && exit 0 ;;
      *) usage >&2 && die "unknown option: $1" ;;
    esac
  done

  case "$cluster" in
    d | dev | devnet) cluster=devnet ;;
    t | testnet) cluster=testnet ;;
    m | mainnet | mainnet-beta) cluster=mainnet-beta ;;
    l | localhost | localnet) cluster=localhost ;;
    http://* | https://*) ;;
    *) die "unknown cluster '$cluster' (use devnet, testnet, mainnet-beta, localhost or an RPC URL)" ;;
  esac
  # solana-verify 0.5.2 maps devnet, testnet and localhost but not
  # mainnet-beta, so every network command gets a plain RPC URL.
  case "$cluster" in
    devnet | testnet | mainnet-beta) rpc_url="https://api.${cluster}.solana.com" ;;
    localhost) rpc_url="http://127.0.0.1:8899" ;;
    *) rpc_url=$cluster ;;
  esac
  [[ $min_sol =~ ^[0-9]+$ ]] || die "--min-sol takes a whole number of SOL, got '$min_sol'"
  if ((write_badge)) && [[ $cluster == http* ]]; then
    die "--write-badge needs a named cluster, not an RPC URL"
  fi
}

check_tools() {
  need_tool solana "install the Agave CLI 3.1: https://docs.anza.xyz/cli/install"
  need_tool solana-keygen "it ships with the Agave CLI"
  need_tool solana-verify "cargo install solana-verify --locked, or a release binary from https://github.com/Ellipsis-Labs/solana-verifiable-build/releases"
  need_tool git "needed to pin the commit"
  if [[ -z $artifact || $repo_verify == 1 ]]; then
    need_tool docker "solana-verify builds inside Docker"
    if ((!dry_run)) && ! docker info >/dev/null 2>&1; then
      die "Docker is installed but the daemon is not reachable; start it and run again"
    fi
  fi
}

check_git() {
  commit=$(git -C "$REPO_ROOT" rev-parse HEAD)
  short_sha=$(git -C "$REPO_ROOT" rev-parse --short=7 HEAD)
  local dirty
  dirty=$(git -C "$REPO_ROOT" status --porcelain -- Cargo.toml Cargo.lock rust-toolchain.toml programs)
  if [[ -n $dirty ]]; then
    if ((allow_dirty || dry_run)); then
      warn "uncommitted program changes; the deployed bytes will not match commit $short_sha"
    else
      die "uncommitted changes to the program (commit them, or pass --allow-dirty):"$'\n'"$dirty"
    fi
  fi
  if ((repo_verify)) && [[ -z $(git -C "$REPO_ROOT" branch -r --contains "$commit" 2>/dev/null) ]]; then
    warn "commit $short_sha is not on any remote-tracking branch (git fetch refreshes them); verify-from-repo clones $repo_url and needs it there"
  fi
}

# Sets program_state to absent, present or unknown (dry run).
read_program_state() {
  program_state=unknown
  program_authority=""
  show solana program show "$PROGRAM_ID" -u "$rpc_url" --keypair "$deployer" --output json-compact
  ((dry_run)) && return 0
  local out
  if out=$(solana program show "$PROGRAM_ID" -u "$rpc_url" --keypair "$deployer" --output json-compact 2>&1); then
    program_state=present
    program_authority=$(sed -n 's/.*"authority":"\([^"]*\)".*/\1/p' <<<"$out")
  elif grep -q 'Unable to find the account' <<<"$out"; then
    # Only this wording means "no such account". An unreachable RPC reports
    # "AccountNotFound: ... error sending request" and must not look like a first deploy.
    program_state=absent
  else
    die "could not read the program account on $cluster: $out"
  fi
}

check_program_state() {
  step "Program account on $cluster"
  read_program_state
  case "$program_state" in
    present)
      log "program exists, upgrade authority ${program_authority:-unknown}"
      if [[ -z $program_authority || $program_authority == none ]]; then
        die "the program on $cluster has no upgrade authority, so it cannot be upgraded"
      fi
      if [[ $program_authority != "$deployer_pubkey" ]]; then
        die "the upgrade authority on $cluster is $program_authority but the deployer key is $deployer_pubkey"
      fi
      ;;
    absent) log "program does not exist yet: this will be the first deploy" ;;
    unknown) log "dry run: not reading chain state, so both the first-deploy and the upgrade commands are printed" ;;
  esac
  if [[ $program_state != present ]]; then
    need_file "$program_keypair" "the first deploy needs the program id keypair"
    if [[ -f $program_keypair ]]; then
      local program_pubkey
      program_pubkey=$(capture "$PROGRAM_ID" solana-keygen pubkey "$program_keypair")
      [[ $program_pubkey == "$PROGRAM_ID" ]] ||
        die "$program_keypair is the keypair for $program_pubkey, not $PROGRAM_ID"
    fi
  fi
}

balance() {
  local out
  out=$(capture "0 lamports" solana balance "$deployer_pubkey" -u "$rpc_url" --lamports)
  printf '%s\n' "${out%% *}"
}

# ensure_balance NEED_LAMPORTS WHAT: airdrops on test clusters, otherwise stops.
ensure_balance() {
  local need=$1 what=$2 floor=$((min_sol * LAMPORTS_PER_SOL)) have tries=0
  ((need > floor)) || need=$floor
  have=$(balance)
  if ((dry_run)); then
    log "dry run: would need $(sol "$need") SOL for $what, topping up with:"
    show solana airdrop "$AIRDROP_SOL" "$deployer_pubkey" -u "$rpc_url"
    return 0
  fi
  log "deployer $deployer_pubkey holds $(sol "$have") SOL; $what needs $(sol "$need") SOL"
  while ((have < need)); do
    if ! can_airdrop; then
      die "deployer $deployer_pubkey holds $(sol "$have") SOL on $cluster and needs $(sol "$need") SOL; fund it and run again"
    fi
    if ((tries == AIRDROP_TRIES)); then
      die "deployer $deployer_pubkey still holds only $(sol "$have") SOL after $AIRDROP_TRIES airdrops (the faucet rate-limits). Get $cluster SOL at https://faucet.solana.com for that address and run again."
    fi
    tries=$((tries + 1))
    run solana airdrop "$AIRDROP_SOL" "$deployer_pubkey" -u "$rpc_url" ||
      warn "airdrop $tries of $AIRDROP_TRIES failed"
    sleep $((tries * 5))
    have=$(balance)
    log "balance now $(sol "$have") SOL"
  done
}

build() {
  if [[ -n $artifact ]]; then
    step "Using the existing artifact $artifact (no build)"
    need_file "$artifact" "--so"
    return 0
  fi
  step "Verifiable build (solana-verify, Docker, SBPF $ARCH)"
  run solana-verify build --library-name "$LIBRARY_NAME" --arch "$ARCH" "$REPO_ROOT"
  artifact="$REPO_ROOT/target/deploy/$LIBRARY_NAME.so"
  if ((!dry_run)); then need_file "$artifact" "solana-verify build did not produce the program"; fi
}

# solana-verify prints its RPC retry notices on stdout next to the hash, so
# keep only a line that is a bare sha256.
only_hash() { grep -E '^[0-9a-f]{64}$' | tail -n 1; }

hash_artifact() {
  step "Executable hash"
  if ((dry_run)); then
    exe_hash=$(capture "<executable-hash>" solana-verify get-executable-hash "$artifact")
  else
    exe_hash=$(solana-verify get-executable-hash "$artifact" | only_hash) || true
    show solana-verify get-executable-hash "$artifact"
    [[ -n $exe_hash ]] || die "solana-verify get-executable-hash printed no hash for $artifact"
  fi
  if ((dry_run)); then artifact_size=400000; else artifact_size=$(wc -c <"$artifact" | tr -d ' '); fi
  log "executable hash $exe_hash ($artifact_size bytes)"
}

onchain_hash() {
  capture "<program-hash>" solana-verify get-program-hash -u "$rpc_url" "$PROGRAM_ID" | only_hash || true
}

confirm() {
  ((assume_yes || dry_run)) && return 0
  [[ -t 0 ]] || die "not a terminal; pass --yes to deploy without a prompt"
  local reply
  read -r -p "$1 [y/N] " reply
  [[ $reply == y || $reply == Y || $reply == yes ]] || die "stopped before deploying"
}

deploy() {
  step "Deploy to $cluster"
  deploy_action=""
  if [[ $program_state == present ]]; then
    local current
    current=$(onchain_hash)
    if [[ $current == "$exe_hash" ]]; then
      log "the program on $cluster already has hash $exe_hash; nothing to deploy"
      deploy_action=unchanged
      return 0
    fi
    log "on-chain hash $current differs; upgrading"
  fi

  local max_len=$((artifact_size * 3 / 2))
  local first_need upgrade_need
  first_need=$(($(rent $((PROGRAMDATA_HEADER + max_len))) + FEE_MARGIN))
  upgrade_need=$(($(rent $((BUFFER_HEADER + artifact_size))) + FEE_MARGIN))
  # Writes go to validator TPUs by default: the public RPC rate-limits the few
  # hundred write transactions a deploy needs and fails with "Max retries exceeded".
  local common=(-u "$rpc_url" --keypair "$deployer" --upgrade-authority "$deployer" --max-sign-attempts 20)
  ((via_rpc)) && common+=(--use-rpc)
  # A deploy that died mid-way leaves a funded buffer account; reclaim it first.
  if ((!dry_run)) && [[ $program_state != present || $(solana-verify get-program-hash -u "$rpc_url" "$PROGRAM_ID" 2>/dev/null | only_hash) != "$exe_hash" ]]; then
    solana program close --buffers -u "$rpc_url" --keypair "$deployer" >/dev/null 2>&1 || true
  fi

  if [[ $program_state != present ]]; then
    ensure_balance "$first_need" "a first deploy with --max-len $max_len"
    confirm "First deploy of $PROGRAM_ID to $cluster?"
    ((dry_run)) && log "first deploy (program account absent):"
    # --max-len leaves 50% headroom; the CLI extends the account on later upgrades if needed.
    run solana program deploy "$artifact" "${common[@]}" --program-id "$program_keypair" --max-len "$max_len"
    deploy_action=first-deploy
  fi
  if [[ $program_state != absent ]]; then
    ensure_balance "$upgrade_need" "an upgrade (buffer rent, refunded afterwards)"
    confirm "Upgrade $PROGRAM_ID on $cluster?"
    ((dry_run)) && log "upgrade (program account present):"
    run solana program deploy "$artifact" "${common[@]}" --program-id "$PROGRAM_ID"
    deploy_action=upgrade
  fi
  if ((dry_run)); then deploy_action="first-deploy or upgrade"; fi
}

assert_hash() {
  step "Read back the on-chain hash"
  show solana-verify get-program-hash -u "$rpc_url" "$PROGRAM_ID"
  if ((dry_run)); then
    log "dry run: would fail unless that prints $exe_hash"
    return 0
  fi
  local current="" attempt
  # get-program-hash reads at finalized commitment, a few seconds behind the deploy.
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    current=$(solana-verify get-program-hash -u "$rpc_url" "$PROGRAM_ID" 2>/dev/null | only_hash) || true
    [[ -n $current ]] || current="unreadable"
    [[ $current == "$exe_hash" ]] && break
    log "on-chain hash is $current so far (attempt $attempt of 10), waiting"
    sleep 6
  done
  [[ $current == "$exe_hash" ]] ||
    die "on-chain hash $current does not match the verifiable build $exe_hash"
  log "on-chain program hash matches the verifiable build: $exe_hash"
}

verify_from_repo() {
  repo_verify_status=skipped
  ((repo_verify)) || return 0
  step "verify-from-repo: rebuild $repo_url at $short_sha and write the verify PDA"
  local args=(verify-from-repo -u "$rpc_url" --program-id "$PROGRAM_ID" --commit-hash "$commit"
    --library-name "$LIBRARY_NAME" --arch "$ARCH" --keypair "$deployer" --skip-prompt "$repo_url")
  show solana-verify "${args[@]}"
  if ((dry_run)); then
    repo_verify_status=dry-run
  else
    local logfile rc
    logfile=$(mktemp)
    set +e
    solana-verify "${args[@]}" 2>&1 | tee "$logfile"
    rc=${PIPESTATUS[0]}
    set -e
    # verify-from-repo exits 0 on a hash mismatch, so read what it printed.
    if ! grep -q 'Program hash matches' "$logfile"; then
      rm -f "$logfile"
      die "verify-from-repo did not report a hash match for $repo_url at $commit (exit $rc)"
    fi
    rm -f "$logfile"
    if ((rc == 0)); then
      repo_verify_status=pda-written
    elif [[ $cluster == mainnet-beta ]]; then
      die "the rebuild matched, but writing the verify PDA failed (exit $rc)"
    else
      repo_verify_status=matched-no-pda
      warn "the rebuild from $repo_url matched, but writing the verify PDA on $cluster failed (exit $rc). The otter-verify program may not be on $cluster."
    fi
  fi

  if [[ $cluster == mainnet-beta ]]; then
    step "Queue OtterSec remote verification"
    run solana-verify remote submit-job -u "$rpc_url" --program-id "$PROGRAM_ID" --uploader "$deployer_pubkey"
  else
    log "OtterSec's remote verifier only serves mainnet-beta, so no remote job is queued for $cluster"
  fi
}

badge() {
  ((write_badge)) || return 0
  step "Badge"
  local file="$REPO_ROOT/docs/verified.json"
  local json
  json=$(printf '{"schemaVersion":1,"label":"%s","message":"verified · %s · %s","color":"brightgreen"}' \
    "$cluster" "${exe_hash:0:8}" "$short_sha")
  if ((dry_run)); then
    log "dry run: would write $file with $json"
  else
    printf '%s\n' "$json" >"$file"
    log "wrote $file: $json"
  fi
}

outputs() {
  local explorer
  explorer=$(explorer_url)
  if [[ -n ${GITHUB_OUTPUT:-} ]] && ((!dry_run)); then
    {
      printf 'hash=%s\n' "$exe_hash"
      printf 'hash8=%s\n' "${exe_hash:0:8}"
      printf 'commit=%s\n' "$commit"
      printf 'short_sha=%s\n' "$short_sha"
      printf 'deploy_action=%s\n' "$deploy_action"
      printf 'repo_verify=%s\n' "$repo_verify_status"
      printf 'explorer=%s\n' "$explorer"
    } >>"$GITHUB_OUTPUT"
  fi
  if [[ -n ${GITHUB_ACTIONS:-} ]]; then printf '::endgroup::\n'; fi
  cat >&2 <<EOF

Krill on $cluster$( ((dry_run)) && printf ' (dry run, nothing was run)')
  program        $PROGRAM_ID
  commit         $commit
  hash           $exe_hash
  deploy         ${deploy_action:-none}
  repo verify    $repo_verify_status
  explorer       $explorer
EOF
}

main() {
  parse_args "$@"
  cd "$REPO_ROOT"
  if [[ -n ${GITHUB_ACTIONS:-} ]]; then printf '::group::Checks\n'; fi
  check_tools
  check_git
  need_file "$deployer" "deployer keypair"
  deployer_pubkey=$(capture "<deployer-pubkey>" solana-keygen pubkey "$deployer")
  log "cluster $cluster, deployer $deployer_pubkey, commit $short_sha"
  show solana cluster-version -u "$rpc_url"
  if ((!dry_run)) && ! solana cluster-version -u "$rpc_url" >/dev/null 2>&1; then
    die "cannot reach the $cluster RPC"
  fi
  check_program_state
  # Fail on an empty wallet before spending minutes in Docker.
  ensure_balance 0 "deploying"
  build
  hash_artifact
  deploy
  assert_hash
  verify_from_repo
  badge
  outputs
}

main "$@"
