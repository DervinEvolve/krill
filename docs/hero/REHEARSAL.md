# Rehearsal: Krill README hero

Gold: `hero-demo` (an app window, a terminal satellite, a cursor doing one
thing). Kept: the window plus one terminal satellite, named targets for the
cursor, an annotation, a poster that is the result, a loop of a few beats.
Changed: no plate (the README page is the ground, transparent PNG); the
window is the real Arena capture at 0.853 of its CSS size instead of a
drawn dashboard; the terminal is the kit's dark `chrome="terminal"` and
straddles the browser's left edge (corner bleed) instead of covering the
browser's right half, because the payoff (the FOR tally) is on the right;
one annotation with a leader instead of numbered markers.

Layout, in stage px (880 x 420): browser at left 181, top 32 (one gutter),
running about 30% off the right and the bottom; terminal at left 32 (one
gutter), top 190, 288 wide, 149 px outside the browser and 139 px over the
page's empty left margin, running off the bottom. The capture is cropped
before the notepad at 1610 px (of 2408); the page's paper continues past the
crop under a 14 px mask, so the FOR/AGAINST column keeps 28 px to the stage
edge.

Beats: 1 cursor presses Run (0.7 to 1.5 s) ... 2 opening rows print
(filler) ... 3 krill-11 votes FOR, the FOR tally drops in ... 4 the whale
votes AGAINST with 100,000 credits, the AGAINST tally drops in ... 5 the vote
is finalized, the summary prints, the note appears; hold 3.8 s; cut (0.4 s
dissolve) back to the start. Loop 12.2 s.

Captured: wide (880) only; light only (the scene has one look); reduced
motion (the poster); `--states`; a 3x zoom of the tally landing; the
transparent PNG composited on GitHub's dark ground (#0d1117); GIF frames 0
and 75 after palette reduction.

Film:
- `clipped: img clipped right by 340px by div.kh-capture` (round 1) → the
  crop before the notepad is deliberate → marked `data-crop`.
- `hard edge` on terminal rows scrolling off the top (round 1) → a 12 px mask
  fade at the top of the rows.
- `lands on a transform` (round 1) → rows kept on a layer (`will-change`).
- `appears, then moves` (round 2) → row fade lengthened to 0.3 s linear under
  a 0.4 s move.
- `loop seam: cursor does not end where it starts` (round 1) → the cursor's
  start and rest are one point.
- `settle snap` 16 px (round 1) → came from the reset snapping while the
  scene was hidden; gone after the seam fix.
- `near-empty frames` around 12.2 s, 350 to 570 ms → stands: it is the cut
  back to the start (the scene dissolves, resets, returns). A reset with no
  dissolve would rewind the terminal in view.
- `--gate`: `rehearsal passed` on the poster, the loop and `--states`.

Review: no independent reviewer was available in this session; the
fresh-eye pass was done by the builder against `references/review.md`:
1. Framing: the stage's top-left (0 to 181 x 0 to 190) is empty page. The
   terminal cannot rise higher without covering Run and Replay, which share
   its columns, and the browser cannot move left without the terminal
   covering the desk's left corner and whale. Stands; see Unresolved.
2. Hierarchy: the eye lands on FOR 347.850 (largest type, top right) and the
   note's leader points into it; the terminal's brightest lines are the
   whale's vote and the two summary values. Filler bars sit at the
   terminal's top and in the clock row only. No change.
3. Polish: note leader ends in a 4 px dot 6 px short of the digits; terminal
   rows keep 16 px insets; the last real line ends 38 px above the stage's
   foot with the terminal running on. No change.

Assumptions:
- The brief's "finalizes the vote … Passed": the transcript line reads
  `krill-02  finalizes the vote  ok 3WWP…AGbg`; it never prints "Passed", so
  the terminal shows the real line and PASSED is carried by the page
  capture's own placard.
- Transcript lines are shown without their timestamps, with the krill and
  whale vote lines wrapped after "credits" at a 10-character hanging indent
  so they fit a 288 px terminal; transaction signatures are filler bars.
- The two tallies are hidden before the run by paper patches; each lands as
  a tile of the same capture, so the landed frame is the capture pixel for
  pixel. The capture's PASSED placard is visible throughout the loop.
- Stage height 420 (1760 x 840 PNG) rather than 410, so the krill pens are
  cut by less.
- No `compact` design (the brief asked for none); on a phone the README
  scales the image.

Unresolved:
- The empty top-left of the stage (item 1 above).
- The GIF is on white; on GitHub's dark theme it shows a white rectangle.
  The PNG is transparent and works in both.

Not checked:
- The 390 px phone width (no compact; the image scales).
- Live playback in a real browser at display refresh, pause/resume and
  return-from-offscreen: the deliverables are a PNG and a GIF, not a live
  scene.
- Dark theme of the scene itself (the scene has one look; dark mode was only
  checked as the README ground under the transparent PNG).
- Rendering with fonts other than Inter and JetBrains Mono.
