import type { CSSProperties, ReactNode } from 'react'
import { Stage } from './kit/stage'
import { Bar, Prompt, Window } from './kit/window'
import type { Act } from './kit/act'
import arena from '../images/arena-passed.png'
import './hero.css'

// The README hero: the Krill Arena page in a quiet browser, with the arena's
// own terminal straddling its left edge. Run is pressed, the votes print, the
// tallies land on the page. Every string is from docs/arena-transcript.txt or
// the page capture; the rest is filler.

/** Lines of the terminal, oldest first. A `gap` line keeps 6px above it. */
type Line = { key: string; node: ReactNode; gap?: boolean }

const pad = (actor: string) => actor.padEnd(10, ' ')
const INDENT = ' '.repeat(10)

const LINES: Line[] = [
  { key: 'prompt', node: <Prompt path="~/krill">npm run arena -- --serve</Prompt> },
  { key: 'title', node: <div className="kh-bright">Krill Arena</div> },
  { key: 'cluster', node: <div><span className="kh-dim">  cluster    </span>http://127.0.0.1:8899</div> },
  { key: 'feed', node: <div><span className="kh-dim">  feed       </span>http://127.0.0.1:8787</div> },
  // After Run
  { key: 'f1', node: <Filler a={42} b={168} />, gap: true },
  { key: 'f2', node: <Filler a={54} b={120} /> },
  { key: 'f3', node: <Filler a={54} b={146} /> },
  { key: 'krill', node: <div><span className="kh-actor">{pad('krill-11')}</span>votes FOR · 1,000 credits</div> },
  { key: 'krill2', node: <div>{INDENT}√1,000 = 31.622 votes  <span className="ok">ok</span> <Bar w={42} h={5} r={2.5} className="kh-sig" /></div> },
  { key: 'whale', node: <div className="kh-bright"><span className="kh-actor">{pad('whale')}</span>votes AGAINST · 100,000 credits</div> },
  { key: 'whale2', node: <div className="kh-bright">{INDENT}√100,000 = 316.227 votes  <span className="ok">ok</span></div> },
  { key: 'clock', node: <Filler a={30} b={132} /> },
  { key: 'final', node: <div><span className="kh-actor">{pad('krill-02')}</span>finalizes the vote  <span className="ok">ok</span> <Bar w={42} h={5} r={2.5} className="kh-sig" /></div> },
  { key: 'for', gap: true, node: <div className="kh-bright"><span className="kh-dim">  for       </span>347.850542611</div> },
  { key: 'against', node: <div className="kh-bright"><span className="kh-dim">  against   </span>316.227766016</div> },
]

const REST = { x: 346, y: 196 }
const RUN_AT = LINES.findIndex((l) => l.key === 'f1')
const at = (key: string) => LINES.findIndex((l) => l.key === key) + 1

// Terminal geometry, in stage px: one line is 16px, a gap 6px, and 150px of
// rows show, so the last line ends a gutter's worth above the stage's foot.
const LINE = 16
const GAP = 6
const VIEW = 150
/** Above the rows, a short fade where output scrolls away */
const FADE = 12

function Filler({ a, b }: { a: number; b: number }) {
  return (
    <div className="kh-filler">
      <Bar w={a} h={5} r={2.5} className="kh-bar" />
      <Bar w={b} h={5} r={2.5} className="kh-bar kh-bar--faint" />
    </div>
  )
}

type S = {
  /** How many terminal lines have printed */
  shown: number
  /** The tallies on the page */
  forLanded: boolean
  againstLanded: boolean
  note: boolean
  /** The whole scene dims for the cut back to the start */
  cut: boolean
}

const initial: S = { shown: RUN_AT, forLanded: false, againstLanded: false, note: false, cut: false }
const POSTER: S = { shown: LINES.length, forLanded: true, againstLanded: true, note: true, cut: false }

async function script(a: Act<S>) {
  await a.wait(700)
  await a.move('run')
  await a.wait(250)
  await a.click()
  await a.mark('run')
  // The scenario starts: the opening rows go by quickly
  for (const key of ['f1', 'f2', 'f3']) {
    await a.set({ shown: at(key) })
    await a.wait(220)
  }
  await a.move('rest')
  await a.set({ shown: at('krill2') })
  await a.wait(500)
  await a.set({ forLanded: true })
  await a.wait(900)
  await a.mark('whale')
  await a.set({ shown: at('whale2') })
  await a.wait(500)
  await a.set({ againstLanded: true })
  await a.wait(1100)
  await a.set({ shown: at('clock') })
  await a.wait(500)
  await a.set({ shown: at('final') })
  await a.wait(600)
  await a.set({ shown: at('for') })
  await a.wait(180)
  await a.set({ shown: at('against') })
  await a.wait(500)
  await a.set({ note: true })
  await a.mark('payoff')
  await a.wait(3800)
  // A cut back to the start: the scene dissolves and returns ready to run
  await a.set({ cut: true })
  await a.wait(400)
  await a.snap({ ...initial, cut: true })
  await a.set({ cut: false })
  await a.wait(400)
}

export function KrillHero() {
  return (
    <Stage
      width={880}
      height={420}
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{ at: REST }}
      className="kh"
      tokens={{ '--ss-font': 'Inter, system-ui, -apple-system, sans-serif', '--ss-mono': '"JetBrains Mono", "SF Mono", ui-monospace, monospace' }}
    >
      {(s) => {
        const visible = LINES.slice(0, s.shown)
        const height = visible.reduce((h, l, i) => h + LINE + (l.gap && i > 0 ? GAP : 0), 0)
        const shift = Math.max(0, height - VIEW)
        return (
          <div className="kh-scene" data-cut={s.cut || undefined}>
            <Window url="127.0.0.1:5173" urlShape="pill" className="kh-browser">
              <div className="kh-page">
                <div className="kh-capture" data-crop role="img" aria-label="The Krill desk: eleven krill and one whale vote; the scale reads 347.850 for and 316.227 against; the placard reads PASSED.">
                  <img src={arena} alt="" draggable={false} />
                  {/* Before the run, plain paper over the two tallies; each lands as its votes print */}
                  <Tally which="for" landed={s.forLanded} />
                  <Tally which="against" landed={s.againstLanded} />
                </div>
                <span className="kh-run" data-target="run" data-cursor="hand" />
              </div>
            </Window>

            <div className="kh-note" data-show={s.note || undefined}>
              <span className="kh-note-text">11 × √1,000 &gt; √100,000</span>
              <span className="kh-leader" />
            </div>

            <Window chrome="terminal" lights="grey" title="krill — npm run arena" className="kh-term" body={{ 'data-crop': '' } as never}>
              <div className="kh-view" data-crop>
                <div className="kh-rows" style={{ transform: `translateY(${FADE - shift}px)` } as CSSProperties}>
                  {LINES.map((l, i) => (
                    <div key={l.key} className="kh-row" data-gap={l.gap || undefined} data-on={i < s.shown || undefined}>
                      {l.node}
                    </div>
                  ))}
                </div>
              </div>
            </Window>
            <span data-target="rest" style={{ position: 'absolute', left: REST.x, top: REST.y }} />
          </div>
        )
      }}
    </Stage>
  )
}

/** One tally as it sits in the capture: a tile of the capture over a paper patch. */
function Tally({ which, landed }: { which: 'for' | 'against'; landed: boolean }) {
  return (
    <span className={`kh-tally kh-tally--${which}`} data-landed={landed || undefined}>
      <span className="kh-tally-digits" style={{ backgroundImage: `url(${arena})` }} />
    </span>
  )
}
