# CLI showcase: build

`CliShowcase.tsx` and `cli.css` are a Stageshow still for the README's
"Play along" section. They reuse the hero's vendored kit (`../kit/`) and its
capture script (`../capture.mjs`), so build it the way `../build.md` builds
the hero, with the example named `krill-cli`.

| File | Size | What |
|---|---|---|
| `docs/images/cli-showcase.png` | 1760 × 1128 px (880 × 564 CSS px at 2x), RGBA, transparent ground | The terminal, the `on chain` card and the note |

Content sources: the banner (10 lines, up to 57 columns, unwrapped) and the
tagline are `cli/src/logo.ts` as `KRILL_PLAIN=1 npx krill --help | head -12`
prints them, copied verbatim into `BANNER` (re-copy it if the art changes); the three commands and their
output are the run in the README's "Play along" section (the screenshot it
replaced, `docs/images/cli-play-along.png`, is in git history). Signatures
are shortened to their first and last four characters, the vote line's tail
wraps at the result indent, and the status rows after `against` are filler.
The card's numbers are from the same run: 12 × √1,000 = 379.473319212 for,
√100,000 = 316.227766016 against.

## Stage, render, rehearse

From the repository root, with `STAGE` a Stageshow checkout with
`npm install` done (see `../build.md`, Requirements):

```sh
STAGE=/path/to/stageshow
KRILL=$PWD
rm -rf "$STAGE/examples/krill-cli" && mkdir -p "$STAGE/examples/krill-cli"
cp -r docs/hero "$STAGE/examples/krill-cli/hero"
echo "export { default } from './hero/cli'" > "$STAGE/examples/krill-cli/index.tsx"
(cd "$STAGE" && npm run dev)    # restart it if it was running; note the Local URL
```

In a second terminal, with `URL` set to that Local URL:

```sh
cd "$STAGE"
# The shipped PNG, transparent, 1760 x 1128
node "$KRILL/docs/hero/capture.mjs" "$URL" png "$KRILL/docs/images/cli-showcase.png" --name krill-cli
# The film still and the gate (on white; the shipped PNG comes from capture.mjs)
node scripts/film.mjs "$URL/?capture=krill-cli" --still --reduced --pad 0 --gate --out shots/krill-cli.png
```

Clean up with `rm -rf "$STAGE/examples/krill-cli"`.
