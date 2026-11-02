# Rehearsal: CLI showcase

Gold: `hero-demo` (via the repo's own hero, `docs/hero/`, which was built from
it), with `static-card` for the satellite. Kept: the hero's 32px gutter, its
transparent ground, the warm terminal tokens (`#1d1b19` body, `#9aa7c7` path,
`#8fd19e` sigil), the filler bars' colours and the note's pill and leader.
Changed: the terminal is the hero instead of a satellite (708 wide, one gutter
from the top and left, off the bottom), the satellite is a light card in the
`static-card` manner straddling the terminal's right edge over its empty right
margin, and the note's leader runs vertically into the card's count.

Medium: a still for the README at 880 CSS px (1760 px at 2x). No script, no
poster beyond the still, no `compact` design (the README scales one PNG).

Strings (all real output of the run, or the card's restatement of it): the
banner and tagline (the redrawn art); three commands; two shortened signatures; the three
result lines, the vote line's tail wrapped at the result indent; `for` and
`against` in the status block. Filler: the status rows after `against`
(quorum, deadline, amount), key and value both bars on the rows' grid; the
third is cut by the stage's foot about half way through its bar.

Captured
- Wide still at 880, normal and `--reduced` (identical: it is a still), on
  white with `--pad 0`; `--dark` (no theme change, the stage is transparent).
- 390 wide still, to see the scaled image on a phone column.
- 3x zooms of the terminal's foot (filler alignment, the cut) and of the card
  and note (leader, insets).
- The shipped PNG from `capture.mjs --name krill-cli`: 1760 × 1128, RGBA;
  top corners and bottom-right fully transparent, bottom-left alpha 5 (the
  terminal's shadow where it runs off the foot).

Film
- Every round: `--still --pad 0 --gate` ended `rehearsal passed`.
- Round 1: the mark took three cells (`2ch` measured in the emoji font);
  fixed to the mono grid's two cells. The card sat beside the vote line's
  end; moved up beside the banner's empty right side, where nothing is
  under it.
- Round 2: `touching` on the result lines (mark and text in one box); the
  text after the mark is its own span, one space apart. The stage's foot
  cut a filler line as a sliver; set the height so the cut halves a bar.
- Round 3: the note's leader landed at the card's bottom-right, not under
  the count; the count now sits right-aligned in a `Voters` row and the
  leader drops from under "12 for". Filler value bars started off the
  value column; they now share the detail rows' 3 + 10 + 2 cell grid.
- Round 4, the redrawn banner (`cli/src/logo.ts`, 10 lines, 57 columns):
  copied verbatim (checked equal to the file's array), the prompt changed
  to `head -12`, the stage grew from 474 to 564 tall (no line wraps; the
  terminal is wide enough at 13px), and the terminal lengthened to 640 so
  it still runs off the foot (the gate flagged it as a whole window with
  12px of air until then). The card moved down to 200 to sit centred on the
  stage's height beside the banner's empty right side.
- 390: `small text` (the terminal title renders about 5px) and a 3px
  `touching` from rounding. Deliberate: the README shows one PNG that the
  browser scales; there is no phone layout to switch to.

Review: no separate reviewer was available; I reviewed the final still
against the gold stills myself with `review.md` and `verify.md`. Eye lands
first on the light card, then on the banner; the terminal clearly leads; no
plate, no floating window; the bottom-right corner is open page beside the
terminal, as the hero's top-left is.

Assumptions
- The vote line's tail (`· for 126.491106404 · against 0.000000000`) is real
  output, so it stays, wrapped, rather than being cut.
- `Voters` is the card's own label for the count, not a CLI string.
- The prompt is the kit's `~/krill ❯`, as in the hero's terminal, in place
  of the screenshot's `$`.

Not checked
- GitHub's dark theme in a real browser (the PNG's ground is transparent;
  the card and note carry their own light fills).
- That the run's own screenshot showed this banner: the run predates the
  redraw, so the banner is what the CLI prints now, with the run's output.
- Rendering on macOS or Windows; the PNG was rendered headless on Linux with
  Inter, JetBrains Mono and Noto Color Emoji (the 🦐 is that font's glyph).
