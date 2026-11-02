// Fig: quadratic voting as a gauge-block bench.
// Every credit plate is a square whose area is its owner's credits, so its edge
// is the square root: the votes. Plates laid end to end against a fence sum
// their edges on one ruler. Build: node docs/figures/quadratic-voting/build.mjs [--light]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { kitScript } from "../scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 600;
const HEIGHT = 360;

// Truth: sides in world units are votes, so areas are credits.
const S = Number(M.votesFor(M.KRILL_CREDITS)) / 1e9; // 31.622776601
const W = Number(M.votesFor(M.WHALE_CREDITS)) / 1e9; // 316.227766016
const N = M.KRILL_COUNT;
const H = 10; // every plate is the same thickness, so its volume is its money

// Layout, y toward the viewer.
const KY = 11; // krill lane, back edge
const PY = 56; // parking row, back edge
const DY = PY - KY;
const WY = -26 - W; // whale plate, back edge
const RAIL_X = 384;
const KRAIL = { x: 0, y: 0, w: RAIL_X, d: 8, r: 1.2 };
const WRAIL = { x: 0, y: -24, w: RAIL_X, d: 8, r: 1.2 };
const BEAM = { x: 0, y: -14, w: RAIL_X, d: 12, r: 1.5 };
const BEAM_H = 10;
const STRIP = { x: 0, y: -13.2, w: RAIL_X - 2, d: 10.4, r: 0.8 };
const STRIP_TOP = BEAM_H + 0.6;
const RAIL_H = 5;
const END = { x: RAIL_X, y: -27, w: 12, d: 35.6, r: 1.8 };
const END_H = 16;
const FENCE = { x: -12, y: WY - 6, w: 12, d: PY + S + 4 - (WY - 6), r: 1.5 };
const FENCE_H = 22;
const PLATE = { x: -30, y: WY - 18, w: 440, d: PY + S + 18 - (WY - 18), r: 8 };
const PLATE_H = 14;
const FOOT_H = 5;
const COINS = { x: 340, y: -214, w: 58, d: 58, r: 4 };
const COIN_PITCH = 10;
const COIN_R = 3.1;
const LABEL = { x: 360, y: 62, w: 42, d: 14, r: 2 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [FENCE.x, FENCE.y, FENCE_H], [0, PLATE.y + PLATE.d, FENCE_H]],
  WIDTH,
  HEIGHT,
  { pad: 20, azimuth: 62, elevation: 38 },
);

const at = (point) => k.iso(point, P);
const S_ = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// Square shells engraved on a credit plate, one every 10 votes (100 credits),
// growing from the plate's back corner: the L of the n-th shell is the 2n − 1.
function shells(x0, y0, side, z, majorEvery = 0) {
  const minor = [];
  const major = [];
  for (let n = 10; n < side - 0.5; n += 10) {
    const d = k.onTop([[x0 + n, y0], [x0 + n, y0 + n], [x0, y0 + n]], z, P);
    (majorEvery && n % majorEvery === 0 ? major : minor).push(d);
  }
  const bands = [];
  for (let n = 10; n < side - 0.5; n += 20) {
    const m = Math.min(n + 10, side);
    bands.push(k.onTop([[x0 + n, y0], [x0 + m, y0], [x0 + m, y0 + m], [x0, y0 + m], [x0, y0 + n], [x0 + n, y0 + n]], z, P, true));
  }
  return { minor: minor.join(""), major: major.join(""), bands: `<path class="qv-band" d="${bands.join("")}"/>` };
}

function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 26))) {
    out.push(S_(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S_(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S_(slab(PLATE, -PLATE_H, PLATE_H, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // engraved bays: the krill lane and the parking row
  out.push(L(k.planOutline({ x: 0.6, y: KY - 1.2, w: N * S + 4, d: S + 2.4, r: 1.6 }, 0, P, 3), { tone: "faint" }));
  out.push(L(k.planOutline({ x: 0.6, y: PY - 1.2, w: N * S + 4, d: S + 2.4, r: 1.6 }, 0, P, 3), { tone: "faint" }));
  // thumb notches at the front of each parking bay
  out.push(L(Array.from({ length: N }, (_, i) => k.planOutline({ x: i * S + S / 2 - 7, y: PY + S - 4, w: 14, d: 8, r: 4 }, 0, P, 6)).join(""), { tone: "lo" }));
  // label plate
  out.push(S_(slab(LABEL, 0, 0.8, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 3), { tone: "faint" }));
  out.push(L([0, 1, 2].map((row) => k.lineOnTop([LABEL.x + 8, LABEL.y + 4 + row * 2.5], [LABEL.x + [34, 25, 30][row], LABEL.y + 4 + row * 2.5], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([LABEL.x + 4, LABEL.y + LABEL.d / 2, 0.8]), at([LABEL.x + LABEL.w - 4, LABEL.y + LABEL.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

function fence() {
  const out = [S_(slab(FENCE, 0, FENCE_H, 3, 0.6), { tone: "mid" })];
  const ys = [];
  for (let y = FENCE.y + 12; y < FENCE.y + FENCE.d - 6; y += 46) ys.push(y);
  out.push(L(ys.map((y) => k.ring(FENCE.x + 5, y, 1.6, FENCE_H, P, 12)).join(""), { tone: "lo" }));
  out.push(D(ys.map((y) => at([FENCE.x + 5, y, FENCE_H])), { size: 0.45 }));
  return out.join("");
}

function whalePlate() {
  const plan = { x: 0, y: WY, w: W, d: W, r: 1 };
  const lines = shells(0, WY, W, H, 50);
  const inner = lines.bands + L(lines.minor, { tone: "faint" }) + L(lines.major, { tone: "lo" });
  const out = [S_(slab(plan, 0, H, 3, 1), { tone: "hi", crease: "lo", inner })];
  // four lifting points: a plate this size is moved with a hoist
  for (const [x, y] of byDepth(k.corners(plan, 16))) {
    out.push(S_(k.cylinder(x, y, 3.2, H, 2, P, 20), { tone: "mid" }));
    out.push(L(k.ring(x, y, 1.5, H + 2, P, 12), { tone: "lo" }));
  }
  return out.join("");
}

function coinPlate() {
  const out = [S_(slab(COINS, 0, 3, 4, 0.6), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(COINS, 2.6), 3, P, 4), { tone: "faint" }));
  out.push(D(k.corners(COINS, 3.2).slice(1).map(([x, y]) => at([x, y, 3])), { size: 0.45 }));
  // L grooves between the shells: 1, 3, 5, 7 and 9 coins, the cost of votes 1 to 5
  const edge = 2.6;
  out.push(L([1, 2, 3, 4].map((n) => {
    const c = 9 + n * COIN_PITCH - COIN_PITCH / 2;
    return k.onTop([[COINS.x + c, COINS.y + edge], [COINS.x + c, COINS.y + c], [COINS.x + edge, COINS.y + c]], 3, P);
  }).join(""), { tone: "mid" }));
  const coins = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) coins.push([COINS.x + 9 + i * COIN_PITCH, COINS.y + 9 + j * COIN_PITCH, Math.max(i, j)]);
  for (const [x, y, shell] of byDepth(coins)) {
    out.push(S_(k.cylinder(x, y, COIN_R, 3, 1.8, P, 24), { tone: shell % 2 ? "mid" : "hi", crease: "lo" }));
    out.push(L(k.ring(x, y, COIN_R - 1.1, 4.8, P, 18), { tone: "faint" }));
  }
  return out.join("");
}

// Jaws: a carriage on its rail, a finger that rests on the last plate's face and
// an index plate on top that reaches over the ruler; its left edge is the reading.
const JAW_Z = 2;
const JAW_TOP = 12;
const ARM_H = 1.2;
const knob = (x, y) => S_(k.cylinder(x, y, 3.4, JAW_TOP + ARM_H, 5, P, 24), { tone: "mid" }) + L(k.knurl(x, y, 3.4, JAW_TOP + ARM_H, JAW_TOP + ARM_H + 5, 22, P), { tone: "lo" }) + L(k.ring(x, y, 1.4, JAW_TOP + ARM_H + 5, P, 12), { tone: "lo" });

function whaleJaw() {
  const x = W;
  const finger = S_(slab({ x, y: WY + W - 26, w: 4, d: 26 - 1, r: 0.6 }, 1, JAW_TOP - 1, 2), { tone: "mid" });
  const body = S_(slab({ x, y: -25, w: 22, d: 10, r: 1.4 }, JAW_Z, JAW_TOP - JAW_Z, 3, 0.5), { tone: "mid" });
  return finger + body;
}

function whaleArm() {
  const x = W;
  const plan = { x, y: -25, w: 9, d: 25 - 8.4, r: 0.8 };
  return S_(slab(plan, JAW_TOP, ARM_H, 2, 0.3), { tone: "mid" }) + D([at([x + 4.5, -21, JAW_TOP + ARM_H])], { size: 0.5 }) + knob(x + 16, -20);
}

function rails() {
  const out = [];
  out.push(S_(slab(WRAIL, 0, RAIL_H, 3, 0.4), { tone: "mid" }));
  out.push(D([24, 120, 216].map((x) => at([x, WRAIL.y + WRAIL.d / 2, RAIL_H])), { size: 0.45 }));
  return out.join("");
}

function beam() {
  const out = [S_(slab(BEAM, 0, BEAM_H, 3, 0.6), { tone: "mid" })];
  out.push(S_(slab(STRIP, BEAM_H, 0.6, 3), { tone: "lo", crease: "none" }));
  const front = k.topTicks(0, 360, 10, 5, STRIP.y + STRIP.d, STRIP_TOP, [-2, -3.6], P);
  const back = k.topTicks(0, 360, 10, 5, STRIP.y, STRIP_TOP, [2, 3.6], P);
  out.push(L(front.minor + back.minor, { tone: "lo" }), L(front.major + back.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([0.3, STRIP.y], [0.3, STRIP.y + STRIP.d], STRIP_TOP, P), { tone: "hi" }));
  out.push(k.faceTextSvg(k.topMatrix([371, STRIP.y + STRIP.d / 2 + 1], STRIP_TOP, P, "x"), "votes", { size: 2.8, tone: "lo", anchor: "middle" }));
  return out.join("");
}

function krillRail() {
  return S_(slab(KRAIL, 0, RAIL_H, 3, 0.4), { tone: "mid" }) + D([24, 120, 216].map((x) => at([x, KRAIL.y + KRAIL.d / 2, RAIL_H])), { size: 0.45 });
}

// Krill jaw, built at x = 0 and moved with translateAlong.
function krillJaw() {
  const body = S_(slab({ x: 0, y: -1, w: 22, d: 10, r: 1.4 }, JAW_Z, JAW_TOP - JAW_Z, 3, 0.5), { tone: "mid" });
  const finger = S_(slab({ x: 0, y: 9, w: 4, d: KY + S + 1 - 9, r: 0.6 }, 1, JAW_TOP - 1, 2), { tone: "mid" });
  const arm = S_(slab({ x: 0, y: -7.6, w: 9, d: 16.6, r: 0.8 }, JAW_TOP, ARM_H, 2, 0.3), { tone: "hi", lit: true });
  return body + finger + arm + D([at([4.5, 5, JAW_TOP + ARM_H])], { size: 0.5 }) + knob(16, 4);
}

function endBlock() {
  return S_(slab(END, 0, END_H, 3, 0.6), { tone: "mid" }) + D([at([END.x + 6, END.y + 6, END_H]), at([END.x + 6, END.y + END.d - 6, END_H])], { size: 0.5 });
}

function krillPlate(i) {
  const plan = { x: i * S, y: KY, w: S, d: S, r: 0.8 };
  const lines = shells(plan.x, KY, S, H);
  return S_(slab(plan, 0, H, 3, 0.6), { tone: "hi", crease: "lo", inner: lines.bands + L(lines.minor, { tone: "faint" }) });
}

const START = N; // the README still: all eleven krill on the bench
const startX = START * S;
const plates = Array.from({ length: N }, (_, i) => `<g data-plate="${i}">${krillPlate(i)}</g>`);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A gauge-block bench for quadratic voting. Each member's credits are cast as a square plate of equal thickness whose area is the credits, so its edge is their square root, the votes. The whale's plate is 100,000 credits and 316.2 units on a side. Eleven krill plates of 1,000 credits, 31.6 units on a side, are pushed end to end against the same fence. Two sliding jaws read each side's total on one ruler: the krill row reaches 347.9, past the whale at 316.2, with a ninth of the money.",
  body: [
    bench(),
    fence(),
    whalePlate(),
    coinPlate(),
    whaleJaw(),
    rails(),
    beam(),
    whaleArm(),
    krillRail(),
    `<g data-part="krill">${plates.join("")}<g data-part="jaw" transform="${k.translateAlong(P, [startX, 0, 0])}">${krillJaw()}</g><g data-part="end">${endBlock()}</g></g>`,
  ],
});

const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");

const live = `
${model}
const P = ${JSON.stringify(P)};
const S = ${S}, N = ${N}, DY = ${DY};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const group = svg.querySelector('[data-part="krill"]');
const jaw = svg.querySelector('[data-part="jaw"]');
const end = svg.querySelector('[data-part="end"]');
const plates = [...svg.querySelectorAll("[data-plate]")];
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const follow = (v, to, dt, tau, calm) => { if (calm) return to; const n = v + (to - v) * (1 - Math.exp(-dt / tau)); return Math.abs(to - n) < 0.002 ? to : n; };
let k = ${START}, X = ${startX}, seated = -1, order = "";
const p = plates.map(() => 1); // 1 = in the lane, 0 = parked
let frame = 0, last = 0, visible = false, touring = !still.matches, clock = 11.2, idle = 0;
const CYCLE = 17;
const tourAt = (t) => { t %= CYCLE; if (t < 1.2) return 0; if (t < 11.2) return Math.min(N, Math.floor((t - 1.2) / 0.95) + 1); return t < 15.4 ? N : 0; };
function words(n) {
  const t = tally(n);
  const lead = t.lead < 0n ? -t.lead : t.lead;
  return [
    n + " krill · " + groups(t.krillCredits) + " credits · " + votesText(t.krill),
    "1 whale · " + groups(t.whaleCredits) + " credits · " + votesText(t.whale),
    t.winner === "tie" ? "dead level" : t.winner + " ahead by " + votesText(lead) + " votes",
  ].join("\\n");
}
function describe() {
  const t = tally(k);
  stage.setAttribute("aria-valuenow", String(k));
  stage.setAttribute("aria-valuetext", k + " krill with " + groups(t.krillCredits) + " credits cast " + votesText(t.krill) + " votes against the whale's " + votesText(t.whale) + "; " + (t.winner === "krill" ? "the krill win" : "the whale wins"));
}
function draw() {
  jaw.setAttribute("transform", translateAlong(P, [X, 0, 0]));
  plates.forEach((el, i) => el.setAttribute("transform", p[i] === 1 ? "" : translateAlong(P, [0, DY * (1 - p[i]), 0])));
  const behind = plates.filter((_, i) => (i + 1) * S <= X + 0.06 && p[i] > 0);
  const front = plates.filter((el) => !behind.includes(el));
  const next = behind.map((el) => el.dataset.plate).join(",") + "|" + front.map((el) => el.dataset.plate).join(",");
  if (next !== order) { order = next; for (const el of [...behind, jaw, end, ...front]) group.appendChild(el); }
  let n = 0;
  while (n < N && p[n] === 1) n++;
  if (n !== seated) { seated = n; readout.textContent = words(n); }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; k = tourAt(clock); }
  let reach = k;
  p.forEach((v, i) => { if (v > 0) reach = Math.max(reach, i + 1); });
  X = follow(X, reach * S, dt, 0.22, calm);
  p.forEach((v, i) => {
    const want = i < k && X >= (i + 1) * S - 0.06 ? 1 : 0;
    p[i] = follow(v, want, dt, 0.16, calm);
    if (Math.abs(p[i] - want) < 0.004) p[i] = want;
  });
  draw();
  const done = !touring && X === k * S && p.every((v, i) => v === (i < k ? 1 : 0));
  frame = visible && !done ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false;
  const was = k;
  k = clamp(next, 0, N);
  if (k !== was) describe();
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; clock = 11.2; run(); }, 3600);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  steer(Math.round(clamp(((event.clientX - box.left) / box.width - 0.12) / 0.76, 0, 1) * N));
});
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = k + 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = k - 1;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = N;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
describe();
draw();
`;

const STYLE = `<style>
.qv .qv-band{fill:var(--anatomy-shade-3);stroke:none}
.qv .iso-plate-corner[data-corner="readout"]{white-space:pre;text-align:right;line-height:1.45}
@media (max-width:560px){.qv .iso-plate{padding-bottom:104px}.qv .iso-plate-corner[data-corner="hint"]{bottom:58px}}
</style>`;

const initial = M.tally(START);
const readoutText = [
  `${START} krill · ${M.groups(initial.krillCredits)} credits · ${M.votesText(initial.krill)}`,
  `1 whale · ${M.groups(initial.whaleCredits)} credits · ${M.votesText(initial.whale)}`,
  `krill ahead by ${M.votesText(initial.lead)} votes`,
].join("\n");

const body =
  STYLE +
  `<div class="qv">` +
  k.plateHtml({
    fig: "Fig 1",
    title: "Quadratic voting",
    hint: "Hover to add krill",
    readout: readoutText,
    keys: [
      { mark: "raised", label: "Credit plates: area = credits (1 credit = 0.001 SOL), edge = votes = √credits" },
      { mark: "lit", label: "Krill jaw: the eleven 1 SOL plates end to end, 11 × 31.622776601 votes" },
      { mark: "flat", label: "Coin plate: the n-th vote costs 2n − 1 credits, so 1 + 3 + 5 + 7 + 9 = 25 credits buy 5 votes" },
    ],
    caption:
      "Votes are the square root of each member's own credits, summed per side. One whale with 100 SOL gets 316.227766016 votes; eleven krill with 1 SOL each, 11 SOL in all, get 347.850542611 and win with about a ninth of the money. Ten krill fall short by 0.000000006, because the chain rounds every voter down.",
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Quadratic voting bench: arrow keys add or remove krill plates" aria-valuemin="0" aria-valuemax="${N}" aria-valuenow="${START}">${svg}</div>`,
  }) +
  `</div>`;

const file = theme === "light" ? "quadratic-voting-light.html" : "quadratic-voting.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Quadratic voting", theme, body, script: kitScript() + live }));
console.log("wrote", file);
