import { formatVotes } from "../../../shared/math";
import type { FeedEvent, ScenarioInfo } from "../../../shared/feed";
import type { RecordedRun } from "../recorded";
import type { Source, SourceMode } from "../source";
import type { Store } from "../state";
import { Director } from "./animate";
import { builder, council, krill, whale } from "./figurines";
import { BUILDER, COUNCIL, DESK, KRILL_SLOTS, PLACARD, QUORUM, SCALE, SIZE, TOP, WHALE_PLINTH } from "./layout";
import { KRILL_IDS, WHALE_ID, deriveModel, emptyModel, figureOf } from "./model";
import { flyerSvg, jar, press, quorumPost, scale } from "./objects";
import { placard, tray, vault } from "./vault";
import type { Frame } from "./animate";
import type { Drawn } from "./view";

/** The Krill desk: one Colorfigures scene driven by chain state, with run and replay buttons. */

/** The chain's clock: `chain` seconds at wall time `wall`, running at `rate` (2 while a replay plays). */
interface Clock {
  chain: number;
  wall: number;
  rate: number;
}

interface DeskState {
  pal: PalName;
  frame: Frame;
  hover: string | null;
  replaying: boolean;
  scenarios: ScenarioInfo[];
  /** From the latest snapshot, so the placard's clock reads chain time. */
  clock: Clock;
}

const OFFLINE = "start the arena first: npm run arena -- --serve";
const pretty = (name: string): string => name.replace(/-/g, " ");
const wallNow = (): number => Date.now() / 1000;
const clockAt = (chain: number, rate: number): Clock => ({ chain, wall: wallNow(), rate });
const hintFor = (mode: SourceMode): string => `eleven krill vs one whale · ${mode === "live" ? "live from localnet" : "a recorded localnet run"}`;

function hoverTag(st: DeskState): string {
  const fig = st.hover ? st.frame.model.figures[st.hover] : undefined;
  if (!fig) return "";
  const side = fig.side === null ? "not voted" : `${fig.side ? "FOR" : "AGAINST"} ${formatVotes(fig.votes, 2)}`;
  const anchor: V3 = fig.id === WHALE_ID ? [(WHALE_PLINTH.x0 + WHALE_PLINTH.x1) / 2, (WHALE_PLINTH.y0 + WHALE_PLINTH.y1) / 2, TOP + 34] : krillTop(fig.id);
  return tag(anchor, 0, -26, `${fig.label} · ${side}`, true).replace('class="tag on"', 'class="hovertag"');
}

function krillTop(id: string): V3 {
  const slot = KRILL_SLOTS[KRILL_IDS.indexOf(id)] ?? { x: 0, y: 0 };
  return [slot.x - 2, slot.y, TOP + 19];
}

function drawScene(st: DeskState, m: Pal): string {
  const { model, motion, flyers, sinking, lit } = st.frame;
  const now = st.clock.chain + (wallNow() - st.clock.wall) * st.clock.rate;
  const parts: Drawn[] = [
    jar(model.treasury),
    press(m, motion.crank ?? 0, motion.pressing ?? 0, motion.counter ?? null, sinking),
    ...scale(model.forVotes, model.againstVotes),
    quorumPost(model.quorum?.spent ?? 0, model.quorum?.required ?? 0, model.quorum?.minted ?? 0),
    vault(model.vault, motion.drawers ?? [], motion.flags ?? [], motion.key ?? 0),
    tray(model.tray),
    placard(model.proposal, now, motion.stamp ?? 0),
    council(motion.key ?? 0, lit === "council"),
    builder(lit === "builder"),
    ...whale(model.figures[WHALE_ID], lit === WHALE_ID || st.hover === WHALE_ID),
    ...KRILL_IDS.map((id, i) => krill(i, id, model.figures[id]?.credits ?? 0, lit === id || st.hover === id)),
  ];
  const deskTop = boardTop(0, 0, DESK.x1, DESK.y1, DESK.h, DESK.r);
  let s = board(0, 0, DESK.x1, DESK.y1, DESK.h, DESK.r, WOOD);
  s += clipTo(deskTop, parts.map((p) => (p.shadow ? (p.glass ? `<g opacity=".45">${castShadow(p.shadow, TOP)}</g>` : castShadow(p.shadow, TOP)) : "")).join(""));
  s += byDepth(parts.map((p) => ({ at: p.at, svg: p.svg })));
  s += flyers.map(flyerSvg).join("");
  const state = model.proposal?.state.toUpperCase() ?? "WAITING";
  s += tag([SCALE.x, SCALE.y - SCALE.arm, SCALE.pivot - SCALE.hang + 2], 30, -26, "SCALE");
  s += tag([QUORUM.x, QUORUM.y, TOP + QUORUM.height + 5], 34, 4, "QUORUM", (model.quorum?.required ?? 0) > 0 && (model.quorum?.spent ?? 0) >= (model.quorum?.required ?? 1));
  s += tag([COUNCIL.x, COUNCIL.y, TOP + 27], 30, -10, "COUNCIL");
  s += tag([BUILDER.x, BUILDER.y, TOP + 28], 34, -6, "BUILDER");
  s += tag([PLACARD.x, (PLACARD.y0 + PLACARD.y1) / 2, PLACARD.z1], 30, -14, state, true);
  return s + hoverTag(st);
}

/** The engine frames a 4:3 view; the desk is wider than tall, so trim the empty band under it (shadows stay inside). */
function cropFrame(svg: HTMLElement | null): void {
  const box = svg?.getAttribute("viewBox")?.split(" ").map(Number);
  if (!svg || !box || box.length !== 4) return;
  const [x, y, w, h] = box as [number, number, number, number];
  const bottom = P(DESK.x1, DESK.y1, 0)[1] + w * 0.03;
  svg.setAttribute("viewBox", `${x} ${y} ${w} ${f(Math.min(h, bottom))}`);
}

function lastReasoning(feed: readonly FeedEvent[], id: string): FeedEvent | undefined {
  return [...feed].reverse().find((e) => e.reasoning && figureOf(e.actor) === id);
}

export function mountDesk(store: Store, source: Source): void {
  const director = new Director(emptyModel());
  const st: DeskState = { pal: "tomato", frame: director.frame(), hover: null, replaying: false, scenarios: [], clock: clockAt(0, 1) };
  let playing = false;
  /** The run the desk last rested on; a snapshot from another run is drawn as is, not animated. */
  let shownRun = "";
  const runKey = (): string => store.state.manifest?.cast[0]?.pubkey ?? "";
  let replayTimers: ReturnType<typeof setTimeout>[] = [];
  /** The run on the desk in recorded mode. */
  let recording: { name: string; run: RecordedRun } | null = null;

  const ui = mountFigure<DeskState>({
    fig: "3",
    title: "The Krill desk",
    hint: hintFor(source.mode),
    size: SIZE,
    palette: "tomato",
    state: st,
    scene: drawScene,
    buttonsLabel: "Arena",
    buttons: [
      {
        label: "Run ▸",
        choices: (s) => {
          if (source.mode === "recorded") return recordedChoices(s);
          const running = store.state.manifest?.running ?? false;
          if (!store.state.status.feed || !s.scenarios.length) return [{ label: "arena offline", disabled: true, why: OFFLINE, onClick: () => undefined }];
          return s.scenarios.map((sc) => ({
            label: pretty(sc.name),
            current: running && store.state.manifest?.scenario === sc.name,
            disabled: running || s.replaying,
            why: s.replaying ? "a replay is playing" : "a run is in progress; wait for it to finish",
            onClick: () => void start(sc.name),
          }));
        },
      },
      { label: "Replay", onClick: () => replay() },
    ],
    stats: (s) => [
      { label: "For", value: formatVotes(s.frame.model.forVotes, 3) },
      { label: "Against", value: formatVotes(s.frame.model.againstVotes, 3) },
      { label: "Treasury SOL", value: String(s.frame.model.treasury), small: true },
    ],
    acts: {
      fig: (_s, el, u) => {
        const id = el.dataset.id ?? "";
        const e = lastReasoning(store.state.feed, id);
        u.flash(e?.reasoning ? `${e.actor}: ${e.reasoning}` : `${id} has not voted yet`, 4200);
      },
    },
  });
  /** The header line under the title; it changes when the desk turns live. */
  const hint = document.querySelector<HTMLElement>("body > header > span");

  function play(): void {
    st.frame = director.frame();
    if (playing || !director.busy) return ui.render();
    playing = true;
    ui.animate((dt) => {
      director.step(dt, st.replaying ? 2 : 1);
      st.frame = director.frame();
      playing = director.busy;
      return playing;
    });
  }

  function recordedChoices(s: DeskState): FigureChoice<DeskState>[] {
    if (!s.scenarios.length) return [{ label: "no recorded runs", disabled: true, why: "record one with npm run record", onClick: () => undefined }];
    return s.scenarios.map((sc) => ({ label: pretty(sc.name), current: recording?.name === sc.name, onClick: () => void watch(sc.name) }));
  }

  async function watch(name: string): Promise<void> {
    try {
      const run = await source.shelf.load(name);
      if (source.mode !== "recorded") return;
      recording = { name, run };
      replay();
    } catch (err) {
      ui.flash(err instanceof Error ? err.message : String(err), 3200);
    }
  }

  async function start(name: string): Promise<void> {
    const res = await source.feed.run(name);
    if (res === "offline") ui.flash(OFFLINE, 3200);
    else if (res === "busy") ui.flash("a run is already in progress");
  }

  /**
   * Plays a run's snapshots again at 2x. Live, that is the feed's history (the
   * notepad already lists it); recorded, the notepad fills with each event as it plays.
   */
  function replay(): void {
    const history = recording ? recording.run.events : store.state.feed.filter((e) => e.snapshot);
    const first = history[0];
    if (store.state.manifest?.running) return ui.flash("wait for the run to finish, then replay it");
    if (!first) return ui.flash("nothing recorded yet: run a scenario first");
    replayTimers.forEach(clearTimeout);
    if (recording) store.loadRecording(recording.run.manifest, first.t);
    st.replaying = true;
    director.reset(emptyModel());
    const manifest = store.state.manifest;
    const fromFile = recording !== null;
    replayTimers = history.map((e, i) =>
      setTimeout(() => {
        if (fromFile) store.addFeedEvent(e, false);
        if (e.snapshot) {
          if (e.snapshot.chainTime) st.clock = clockAt(e.snapshot.chainTime, 2);
          if (fromFile) store.setSnapshot(e.snapshot);
          director.advance(deriveModel(manifest, e.snapshot));
        }
        if (i === history.length - 1) {
          st.replaying = false;
          if (fromFile) ui.flash("that was a recorded run · press Replay to watch it again", 5000);
        }
        play();
      }, (e.t - first.t) / 2),
    );
    play();
  }

  store.subscribe((state, change) => {
    if (change === "run-start") {
      shownRun = runKey();
      director.reset(emptyModel());
      play();
    }
    if (change === "snapshot" && state.snapshot && !st.replaying) {
      if (state.snapshot.chainTime) st.clock = clockAt(state.snapshot.chainTime, 1);
      const model = deriveModel(state.manifest, state.snapshot);
      if (runKey() === shownRun) director.advance(model);
      else {
        shownRun = runKey();
        director.reset(model);
      }
      play();
    }
    if (source.mode === "live" && change === "status" && state.status.feed && !st.scenarios.length) void source.feed.scenarios().then((list) => (st.scenarios = list));
  });

  const svg = document.getElementById("fig");
  cropFrame(svg);
  svg?.addEventListener("pointermove", (e) => {
    const hit = e.target instanceof Element ? e.target.closest<SVGGElement>('[data-act="fig"]') : null;
    const id = hit?.dataset.id ?? null;
    if (id !== st.hover) {
      st.hover = id;
      if (!playing) ui.render();
    }
  });
  svg?.addEventListener("pointerleave", () => {
    st.hover = null;
    if (!playing) ui.render();
  });
  setInterval(() => {
    if (!playing && st.frame.model.proposal?.state === "Voting") ui.render();
  }, 500);

  /** The arena came up: drop the recording and its timers; the live scenarios load once the feed connects. */
  source.onChange(() => {
    replayTimers.forEach(clearTimeout);
    replayTimers = [];
    recording = null;
    st.replaying = false;
    st.scenarios = [];
    director.reset(emptyModel());
    if (hint) hint.textContent = hintFor(source.mode);
    ui.flash("arena connected");
    play();
  });

  if (source.mode === "recorded") {
    void source.shelf.list().then((list) => {
      if (source.mode === "recorded") st.scenarios = list;
    });
    void watch(source.first);
  }
}
