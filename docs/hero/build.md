# README hero: build

The hero is a Stageshow scene (`KrillHero.tsx`, `hero.css`) rendered in the
Stageshow playground. It produces:

| File | Size | What |
|---|---|---|
| `docs/images/hero.png` | 1760 × 840 px (880 × 420 CSS px at 2x), RGBA, transparent ground | The poster frame: the run finished, both tallies landed, the note shown |
| `docs/images/hero.gif` | 880 × 420 px, 146 frames at 12 fps (12.2 s loop), about 1.1 MB | One loop, starting on the poster frame |

Content sources: the window shows `docs/images/arena-passed.png` (cropped
before the notepad; the paper continues past the crop). Terminal strings are
from `docs/arena-transcript.txt`; everything else in the terminal is filler.

## Requirements

- A checkout of Stageshow (the `stageshow` folder of github.com/benjitaylor/skills) with `npm install` done there; the commands below call it `$STAGE`.
- Google Chrome (or set `CHROME_PATH` to a Chrome or Chromium binary).
- The fonts the scene names: Inter and JetBrains Mono (installed system-wide).
- `ffmpeg` for the GIF.

## 1. Stage the scene in the playground

From the repository root. This mirrors `docs/` inside the playground so the
component's `../images/arena-passed.png` import resolves unchanged:

```sh
STAGE=/path/to/stageshow
rm -rf "$STAGE/examples/krill-hero" && mkdir -p "$STAGE/examples/krill-hero/images"
cp -r docs/hero "$STAGE/examples/krill-hero/hero"
cp docs/images/arena-passed.png "$STAGE/examples/krill-hero/images/"
echo "export { default } from './hero'" > "$STAGE/examples/krill-hero/index.tsx"
(cd "$STAGE" && npm run dev)    # note the Local URL it prints, e.g. http://127.0.0.1:4191
```

Restart `npm run dev` if it was already running: the playground lists
examples when it starts.

## 2. Render

In a second terminal, with `URL` set to the Local URL from step 1:

```sh
cd "$STAGE"
KRILL=/path/to/krill

# The poster, transparent, 1760 x 840
node "$KRILL/docs/hero/capture.mjs" "$URL" png "$KRILL/docs/images/hero.png"

# The loop: 146 frames on the playground's virtual clock, then a GIF
node "$KRILL/docs/hero/capture.mjs" "$URL" frames /tmp/krill-hero-frames 12
ffmpeg -y -framerate 12 -i /tmp/krill-hero-frames/f%04d.png \
  -vf "scale=880:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=192" /tmp/krill-hero-pal.png
ffmpeg -y -framerate 12 -i /tmp/krill-hero-frames/f%04d.png -i /tmp/krill-hero-pal.png \
  -lavfi "scale=880:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -loop 0 "$KRILL/docs/images/hero.gif"
```

`capture.mjs png` shoots the stage under reduced motion (which shows the
poster) with `omitBackground`, so the README page is the ground in light and
dark mode. `capture.mjs frames` pauses the playground's virtual clock and steps
it one video frame at a time, so every frame is exact; it finds the loop
length from the scene's `payoff` mark and starts half a second after it.

## 3. Rehearse (the checks behind REHEARSAL.md)

```sh
cd "$STAGE"
node scripts/film.mjs "$URL/?capture=krill-hero" --still --reduced --pad 0 --gate --out shots/krill-poster.png
node scripts/film.mjs "$URL/?capture=krill-hero" --pad 0 --every 1000 --count 16 --gate --out shots/krill-loop.png
node scripts/film.mjs "$URL/?capture=krill-hero" --pad 0 --states --gate --out shots/krill-states.png
```

The film still is on white; the shipped PNG comes from `capture.mjs`.

## 4. Clean up

```sh
rm -rf "$STAGE/examples/krill-hero"
```

## README markup

```html
<p align="center"><img src="docs/images/hero.png" width="880" alt="The Krill Arena page in a browser: the drawn desk with eleven krill and one whale, FOR 347.850 against 316.227, and the arena's terminal printing the whale's 100,000-credit vote and the finalized result."></p>
```

Swap `hero.png` for `hero.gif` to show the loop. The GIF is on a white
ground (GIF has no soft transparency), so on GitHub's dark theme it sits on a
white rectangle; the PNG does not.

## Third-party notice

`docs/hero/kit/` is vendored from Stageshow (MIT, Copyright (c) 2026 Benji
Taylor); its license is `docs/hero/kit/LICENSE`. Only the kit files the scene
imports, and the files those import, are included.
