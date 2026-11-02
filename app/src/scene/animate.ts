import { formatCount, formatVotes } from "../../../shared/math";
import { CHUTE_END, HOPPER_MOUTH, JAR_SLOT, KRILL_SCALE, KRILL_SLOTS, SCALE, TOP, TRAY, VAULT_SLOT, WHALE_CHIPS } from "./layout";
import { KRILL_IDS, WHALE_ID } from "./model";
import type { SceneModel } from "./model";
import { beamAngle } from "./objects";
import { drawerMouth } from "./vault";
import type { Flyer, Motion } from "./view";

/**
 * Turns the difference between two scene models into a queue of short beats
 * (chips into the press, coins into the vault...) and plays them in order.
 * Each beat ends on its target model, and the last one on the chain's latest
 * reading, so the drawing never disagrees with the chain for longer than an animation.
 */

export interface Frame {
  model: SceneModel;
  motion: Partial<Motion>;
  flyers: Flyer[];
  sinking: Flyer | null;
  lit: string | null;
}

interface Beat {
  seconds: number;
  to: SceneModel;
  frame(t: number): Frame;
}

const clone = (m: SceneModel): SceneModel => structuredClone(m);
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const phase = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
const still = (model: SceneModel, motion: Partial<Motion> = {}): Frame => ({ model, motion, flyers: [], sinking: null, lit: null });

function arc(a: V3, b: V3, t: number, h: number): V3 {
  const e = ease(t);
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e + h * Math.sin(Math.PI * t)];
}

/** Where a figurine's chips stand, and where its coins leave from. */
function chipsAt(id: string): V3 {
  if (id === WHALE_ID) return [WHALE_CHIPS.x0 + WHALE_CHIPS.size / 2, WHALE_CHIPS.y0 + WHALE_CHIPS.size / 2, TOP];
  const slot = KRILL_SLOTS[KRILL_IDS.indexOf(id)] ?? { x: 0, y: 0 };
  return [slot.x - 2 * KRILL_SCALE, slot.y - 11 * KRILL_SCALE, TOP];
}

function panAt(model: SceneModel, support: boolean): V3 {
  const th = beamAngle(model.forVotes, model.againstVotes);
  const dir = support ? 1 : -1;
  return [SCALE.x, SCALE.y + dir * SCALE.arm * Math.cos(th), SCALE.pivot - dir * SCALE.arm * Math.sin(th) - SCALE.hang - 3];
}

function deposit(from: SceneModel, to: SceneModel, id: string, sol: number): Beat {
  const during = clone(to);
  during.treasury = from.treasury;
  const start = chipsAt(id);
  return {
    seconds: id === WHALE_ID ? 1.3 : 0.7,
    to,
    frame: (t) => ({ ...still(t < 1 ? during : to), flyers: t < 1 ? [{ kind: "coins", at: arc([start[0], start[1], TOP + 8], JAR_SLOT, t, 26), amount: sol }] : [], lit: id }),
  };
}

function vote(from: SceneModel, to: SceneModel, id: string, credits: number, votes: bigint, support: boolean): Beat {
  const during = clone(to);
  during.forVotes = from.forVotes;
  during.againstVotes = from.againstVotes;
  const kind = credits > 1000 ? "block" : "chips";
  const counter: [string, string] = [`${formatCount(BigInt(credits))} CR IN`, `${formatVotes(votes, 2)} VOTES`];
  const pan = panAt(from, support);
  const discs = Number(votes) / 1e10;
  return {
    seconds: kind === "block" ? 2.8 : 1.5,
    to,
    frame: (t) => {
      const fly = phase(t, 0, 0.42);
      const press = phase(t, 0.42, 0.64);
      const drop = phase(t, 0.64, 1);
      const flyers: Flyer[] = [];
      if (fly < 1) flyers.push({ kind, at: arc(chipsAt(id), HOPPER_MOUTH, fly, 34), amount: credits });
      if (drop > 0 && drop < 1) flyers.push({ kind: "tokens", at: arc(CHUTE_END, pan, drop, 14), amount: discs });
      const sinking: Flyer | null = fly >= 1 && press < 1 ? { kind, at: [HOPPER_MOUTH[0], HOPPER_MOUTH[1], HOPPER_MOUTH[2] - 16 * press], amount: credits } : null;
      return {
        model: t < 1 ? during : to,
        motion: { crank: press * 2 * Math.PI, pressing: press > 0 && press < 1 ? 1 : 0, counter: fly >= 1 ? counter : null },
        flyers,
        sinking,
        lit: id,
      };
    },
  };
}

function stamp(to: SceneModel): Beat {
  return { seconds: 0.6, to, frame: (t) => still(to, { stamp: t }) };
}

function execute(from: SceneModel, to: SceneModel, sol: number): Beat {
  const during = clone(to);
  during.vault = from.vault;
  return {
    seconds: 1.8,
    to,
    frame: (t) => ({ ...still(t < 1 ? during : to), flyers: t < 1 ? [{ kind: "coins", at: arc(JAR_SLOT, VAULT_SLOT, t, 46), amount: sol }] : [] }),
  };
}

function flag(to: SceneModel, i: number, up: boolean): Beat {
  return {
    seconds: 0.7,
    to,
    frame: (t) => {
      const flags = restMotion(to).flags ?? [];
      flags[i] = up ? t : 1 - t;
      return { ...still(to, { flags }), lit: up ? "builder" : "council" };
    },
  };
}

function approve(from: SceneModel, to: SceneModel, i: number): Beat {
  const count = to.vault?.milestones.length ?? 3;
  const mid = clone(to);
  mid.tray = from.tray;
  const sol = to.vault?.milestones[i]?.sol ?? 0;
  const tray: V3 = [(TRAY.x0 + TRAY.x1) / 2, (TRAY.y0 + TRAY.y1) / 2, TOP + 2];
  return {
    seconds: 2.2,
    to,
    frame: (t) => {
      const rest = restMotion(from);
      const drawers = rest.drawers ?? [];
      const flags = rest.flags ?? [];
      const open = phase(t, 0.15, 0.45);
      drawers[i] = open;
      flags[i] = 1 - open;
      const fly = phase(t, 0.45, 1);
      return {
        model: t < 0.45 ? from : t < 1 ? mid : to,
        motion: { drawers, flags, key: Math.sin(Math.PI * phase(t, 0, 0.5)) },
        flyers: fly > 0 && fly < 1 ? [{ kind: "coins", at: arc(drawerMouth(i, count), tray, fly, 18), amount: sol }] : [],
        sinking: null,
        lit: "council",
      };
    },
  };
}

function cancel(from: SceneModel, to: SceneModel, sol: number): Beat {
  const during = clone(to);
  during.treasury = from.treasury;
  return {
    seconds: 1.8,
    to,
    frame: (t) => ({ ...still(t < 1 ? during : to, { key: Math.sin(Math.PI * phase(t, 0, 0.4)) }), flyers: t < 1 ? [{ kind: "coins", at: arc(VAULT_SLOT, JAR_SLOT, t, 46), amount: sol }] : [], lit: "council" }),
  };
}

/** Drawers stand open for released milestones; flags stand up for submitted ones. */
function restMotion(model: SceneModel): Partial<Motion> {
  const ms = model.vault?.milestones ?? [];
  return { drawers: ms.map((m) => (m.status === "Released" ? 1 : 0)), flags: ms.map((m) => (m.status === "Submitted" && model.vault?.state === "Active" ? 1 : 0)) };
}

/** The beats that take the desk from `prev` to `next`, in the order they happened on chain. */
function beatsBetween(prev: SceneModel, next: SceneModel): Beat[] {
  const beats: Beat[] = [];
  let cur = clone(prev);
  const push = (make: (from: SceneModel, to: SceneModel) => Beat, edit: (m: SceneModel) => void): void => {
    const to = clone(cur);
    edit(to);
    beats.push(make(cur, to));
    cur = to;
  };

  for (const id of [...KRILL_IDS, WHALE_ID]) {
    const a = cur.figures[id];
    const b = next.figures[id];
    if (!a || !b) continue;
    const minted = b.credits + b.spent - (a.credits + a.spent);
    if (minted > 0) push((f, t) => deposit(f, t, id, minted / 1000), (m) => {
      const fig = m.figures[id];
      if (fig) fig.credits += minted;
      m.treasury += minted / 1000;
      m.quorum = { spent: m.quorum?.spent ?? 0, required: m.quorum?.required ?? 0, minted: (m.quorum?.minted ?? 0) + minted };
    });
  }
  const proposal = next.proposal;
  if (proposal && !cur.proposal) {
    push((_f, t) => stamp(t), (m) => {
      m.proposal = { ...proposal, state: "Voting" };
      m.quorum = next.quorum && { ...next.quorum, spent: 0 };
    });
  }
  for (const id of [...KRILL_IDS, WHALE_ID]) {
    const a = cur.figures[id];
    const b = next.figures[id];
    if (!a || !b || b.votes <= a.votes) continue;
    const votes = b.votes - a.votes;
    const credits = a.credits - b.credits;
    const support = b.side ?? true;
    push((f, t) => vote(f, t, id, credits, votes, support), (m) => {
      const fig = m.figures[id];
      if (fig) Object.assign(fig, { credits: b.credits, spent: b.spent, votes: b.votes, side: b.side });
      if (support) m.forVotes += votes;
      else m.againstVotes += votes;
      if (m.quorum) m.quorum = { ...m.quorum, spent: m.quorum.spent + credits };
    });
  }
  if (proposal && cur.proposal?.state === "Voting" && proposal.state !== "Voting") {
    const outcome = proposal.state === "Rejected" ? "Rejected" : "Passed";
    push((_f, t) => stamp(t), (m) => (m.proposal = m.proposal && { ...m.proposal, state: outcome }));
  }
  if (next.vault && !cur.vault) {
    const vault = next.vault;
    const sol = vault.milestones.reduce((s, m) => s + m.sol, 0);
    push((f, t) => execute(f, t, sol), (m) => {
      m.vault = { state: "Active", milestones: vault.milestones.map((ms) => ({ sol: ms.sol, status: "Pending" })) };
      m.treasury -= sol;
      m.proposal = m.proposal && { ...m.proposal, state: "Escrowed" };
    });
  }
  next.vault?.milestones.forEach((target, i) => {
    const now = cur.vault?.milestones[i];
    if (!now || now.status === target.status) return;
    if (target.status === "Released") {
      push((f, t) => approve(f, t, i), (m) => {
        const ms = m.vault?.milestones[i];
        if (ms) ms.status = "Released";
        m.tray += target.sol;
      });
    } else if (cur.vault?.state === "Active" && next.vault?.state === "Active") {
      push((_f, t) => flag(t, i, target.status === "Submitted"), (m) => {
        const ms = m.vault?.milestones[i];
        if (ms) ms.status = target.status;
      });
    }
  });
  if (next.vault?.state === "Cancelled" && cur.vault?.state === "Active") {
    const back = cur.vault.milestones.reduce((s, m) => s + (m.status === "Released" ? 0 : m.sol), 0);
    push((f, t) => cancel(f, t, back), (m) => {
      if (m.vault) m.vault.state = "Cancelled";
      m.treasury += back;
    });
  }
  if (proposal && cur.proposal?.state !== proposal.state) push((_f, t) => stamp(t), (m) => (m.proposal = proposal));
  const last = beats[beats.length - 1];
  if (last) last.to = next;
  return beats;
}

/** Plays beats one after another; idle, it rests on the latest model. */
export class Director {
  private queue: Beat[] = [];
  private t = 0;
  private resting: SceneModel;
  private crank = 0;
  private counter: [string, string] | null = null;

  constructor(initial: SceneModel) {
    this.resting = initial;
  }

  get busy(): boolean {
    return this.queue.length > 0;
  }

  /** Jump straight to `model` (first reading of a run, or a fresh run). */
  reset(model: SceneModel): void {
    this.queue = [];
    this.t = 0;
    this.resting = model;
    this.counter = null;
  }

  /** Queue the beats from the last target to `model`. */
  advance(model: SceneModel): void {
    const target = this.queue[this.queue.length - 1]?.to ?? this.resting;
    const beats = beatsBetween(target, model);
    if (beats.length) this.queue.push(...beats);
    else if (!this.queue.length) this.resting = model;
    else {
      const last = this.queue[this.queue.length - 1];
      if (last) last.to = model;
    }
  }

  /** Moves time on; a backlog plays faster so the desk catches up with the chain. */
  step(dt: number, speed: number): void {
    const beat = this.queue[0];
    if (!beat) return;
    this.t += (dt * speed * this.queue.length) / beat.seconds;
    if (this.t >= 1) {
      const done = beat.frame(1);
      this.crank += done.motion.crank ?? 0;
      if (done.motion.counter) this.counter = done.motion.counter;
      this.resting = beat.to;
      this.queue.shift();
      this.t = 0;
    }
  }

  frame(): Frame {
    const beat = this.queue[0];
    if (!beat) return { ...still(this.resting, { ...restMotion(this.resting), crank: this.crank, counter: this.counter }) };
    const fr = beat.frame(this.t);
    return {
      ...fr,
      motion: { ...restMotion(fr.model), ...fr.motion, crank: this.crank + (fr.motion.crank ?? 0), counter: fr.motion.counter ?? this.counter },
    };
  }
}
