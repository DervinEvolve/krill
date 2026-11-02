# Security policy

## Supported versions

| Version | Supported |
|---|---|
| `main` / latest `0.1.x` release | yes |
| anything older | no |

Krill is pre-1.0 and has not had a paid third-party audit. The internal
review, threat model and residual risks are in
[`docs/SECURITY.md`](docs/SECURITY.md).

## Reporting a vulnerability

Please report privately through GitHub:
**[Report a vulnerability](https://github.com/DervinEvolve/krill/security/advisories/new)**
(repository *Security* tab, *Report a vulnerability*). Do not open a public
issue or pull request for anything that could put funds at risk.

A useful report has the affected instruction, the accounts involved, the
expected and actual behaviour, and ideally a failing LiteSVM test in the
style of `programs/krill/tests/security.rs`.

What to expect:

* acknowledgement within 5 working days;
* an assessment and, if it is valid, a fix plan within 14 days;
* credit in the advisory once a fix is released, unless you prefer not to be named.

## Scope

In scope: the on-chain program in `programs/krill`. Out of scope: the
program upgrade authority and key management of any deployment, the demo
clients in `app/` and `arena/`, and the documented limitations in
`docs/SECURITY.md` (sybil splitting, council trust, competing proposals).

## Bounty

There is no bug bounty program.

The program also embeds a `security.txt` in its on-chain bytes (the [solana-security-txt](https://github.com/neodyme-labs/solana-security-txt) convention) with the same contact and policy, so explorers show them next to the program.
