import type { ReactNode } from 'react'
import { Stage } from '../kit/stage'
import { Bar, Prompt, Window } from '../kit/window'
import './cli.css'

// The README's "Play along" image: the krill client in a dark terminal, its
// banner and the three commands of one real run, with a light card straddling
// the terminal's right edge that reads the same proposal off the chain.
// Every string in the terminal is the CLI's own output: the banner as
// cli/src/logo.ts prints it now, then the run from the screenshot this
// replaced (docs/images/cli-play-along.png, in git history); signatures are
// shortened to their first and last four characters, the vote line's tail
// wraps at the result's indent, and the status rows that carry no story are
// filler.

/** One terminal line. `gap` keeps a little air above a new command. */
type Line = { key: string; node: ReactNode; gap?: boolean }

// The banner, exactly as cli/src/logo.ts prints it
const BANNER = [
  '                     _.-~~~~~~~~~~~~~~~~-._',
  "  ~~~-.          _.-'           |     |    /-._",
  '       `-._  <==/               |     |   /    /-.',
  '           `--- |   @          __..--------.  /   /.',
  "           _.-' \\    __..--~~''  ' ' ' '    `-._ /  /",
  "      _.-'       `-._ / / / /              ' '  `. / \\",
  "  ~~-'               / / / /                   '  \\ / |",
  '                                                   \\__/',
  '                                                 _/ | \\_',
  '                                                /__/|\\__\\',
]

/** The result mark the CLI prints on a terminal */
const MARK = '🦐'
const Mark = () => <span className="kc-mark" aria-hidden>{MARK}</span>
/** A detail row: three spaces, the key padded to the widest key ("milestones"), two spaces */
const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div>
    {'   '}
    <span className="kc-dim">{k.padEnd(10)}</span>
    {'  '}
    <span className="kc-bright">{children}</span>
  </div>
)
const Sig = ({ head, tail }: { head: string; tail: string }) => (
  <div>
    <span className="kc-dim">signature</span>
    {'  '}
    {head}…{tail}
  </div>
)
/** A status row that carries no story: key and value both bars, on the row's grid */
const Filler = ({ k, v }: { k: number; v: number }) => (
  <div className="kc-filler">
    <Bar w={k} h={5} r={2.5} className="kc-bar" />
    <Bar w={v} h={5} r={2.5} className="kc-bar kc-bar--faint" />
  </div>
)

const LINES: Line[] = [
  { key: 'help', node: <Prompt path="~/krill">npx krill --help | head -12</Prompt> },
  ...BANNER.map((text, i) => ({ key: `b${i}`, node: <div className="kc-banner">{text}</div> })),
  { key: 'blank', node: <div>{' '}</div> },
  { key: 'tag', node: <div className="kc-banner">{'  tiny voters, collectively heavier than any whale'}</div> },

  { key: 'join', gap: true, node: <Prompt path="~/krill">npx krill join 1 --keypair me.json</Prompt> },
  { key: 'join-sig', node: <Sig head="4coQ" tail="jZJ8" /> },
  { key: 'joined', node: <div className="kc-result"><Mark />{' '}<span>joined "krill" with 1.000 SOL → 1,000 credits · member 13</span></div> },

  { key: 'vote', gap: true, node: <Prompt path="~/krill">npx krill vote 0 1000 --for --keypair me.json</Prompt> },
  { key: 'vote-sig', node: <Sig head="23aQ" tail="sTd3" /> },
  { key: 'voted', node: <div className="kc-result"><Mark />{' '}<span>voted FOR #0 with 1,000 credits · you hold √1,000 = <span className="kc-bright">31.622776601</span> votes</span></div> },
  { key: 'voted2', node: <div className="kc-result">{'   '}· for 126.491106404 · against 0.000000000</div> },

  { key: 'status', gap: true, node: <Prompt path="~/krill">npx krill status 0</Prompt> },
  { key: 'proposal', node: <div className="kc-result"><Mark />{' '}<span>proposal #0 "Ship the Krill mobile client" · Escrowed</span></div> },
  { key: 'for', node: <Row k="for">379.473319212</Row> },
  { key: 'against', node: <Row k="against">316.227766016</Row> },
  { key: 'quorum', node: <Filler k={42} v={176} /> },
  { key: 'deadline', node: <Filler k={52} v={214} /> },
  { key: 'amount', node: <Filler k={38} v={190} /> },
]

export function CliShowcase() {
  return (
    <Stage
      width={880}
      height={564}
      initial={{}}
      className="kc"
      tokens={{ '--ss-font': 'Inter, system-ui, -apple-system, sans-serif', '--ss-mono': '"JetBrains Mono", "SF Mono", ui-monospace, monospace' }}
    >
      {() => (
        <>
          <Window chrome="terminal" title="krill · play along" className="kc-term" body={{ 'data-crop': '' } as never}>
            {LINES.map((l) => (
              <div key={l.key} className="kc-row" data-gap={l.gap || undefined}>
                {l.node}
              </div>
            ))}
          </Window>

          <div className="kc-card">
            <div className="kc-card-title">on chain</div>
            <div className="kc-tally">
              <span className="kc-tally-label">For</span>
              <span className="kc-tally-value">379.473319212</span>
            </div>
            <div className="kc-tally">
              <span className="kc-tally-label">Against</span>
              <span className="kc-tally-value">316.227766016</span>
            </div>
            <div className="kc-tally kc-tally--foot">
              <span className="kc-tally-label">Voters</span>
              <span className="kc-count">12 for · 1 against</span>
            </div>
          </div>

          <div className="kc-note">
            <span className="kc-leader" />
            <span className="kc-note-text">one human + eleven agents</span>
          </div>
        </>
      )}
    </Stage>
  )
}
