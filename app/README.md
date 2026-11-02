# The Krill desk

A live, hand-inked drawing of the Krill DAO at work. Every figurine and
machine on the desk is driven by what the program's accounts say on a local
validator; the arena's feed only adds who acted, why, and the signature.

```bash
# terminal 1: a fresh validator with the program, plus the arena's feed on :8787
npm run arena -- --serve
# terminal 2: the desk on http://127.0.0.1:5173
npm run app
```

Press **Run ▸** and pick a scenario. **Replay** plays the last run again at 2×
from the snapshots the feed recorded, without touching the chain. Hover a
figurine for its side and votes; click it for its reasoning.

## What you are looking at

| on the desk | on chain |
|---|---|
| coins in the TREASURY jar (1 coin = 1 SOL) | `dao.pooled_lamports` |
| a figurine's blue chip stack (6 high per 1,000 credits) | `member.credits` |
| chips into the ROOT PRESS, tokens out of the chute (1 token = 10 votes) | each `cast_vote`: credits in, `sqrt` votes out |
| the scale's pans and beam | `proposal.for_votes` / `against_votes` |
| the quorum post's slider, red tick and lamp | `credits_spent`, `quorum_credits`, `total_credits` |
| the placard's state word and clock | `proposal.state`, `voting_ends_at` |
| the ESCROW safe's drawers, flags and coins | `escrow.milestones[i].status` |
| the builder's tray | `escrow.released_lamports` |

## How it is built

- `src/chain.ts` subscribes to every account the arena's manifest names
  (`onAccountChange`) and to the program's logs (`onLogs` with Anchor's
  `EventParser`); each change re-reads one snapshot of all accounts.
- `src/feed.ts` reads `/manifest`, `/scenarios` and the `/events` stream, and
  posts `/run/<name>`.
- `src/state.ts` holds one plain state object; `src/notepad.ts` renders the
  ruled notepad (feed, newest first, and a ledger of every agent).
- `src/scene/` reduces the snapshot to a `SceneModel` (`model.ts`), turns each
  change into short animations that end on the chain's reading (`animate.ts`),
  and draws the desk (`objects.ts`, `vault.ts`, `figurines.ts`, `parts.ts`,
  laid out in `layout.ts`).

`npm run typecheck` checks the package; `npm run build` writes `dist/`.

## Third-party notices

The drawing engine `public/colorfigures/core.js` is **Colorfigures** by
April Zhu, MIT licensed (see `public/colorfigures/LICENSE`), which builds on
ISO-GLOW by April Zhu and iso-figure by Tolga Cohce (both MIT).
<https://april-zhu.com/colorfigures>
