import type { ProposalStateName } from "../../../shared/views";
import { PLACARD, TOP, TRAY, VAULT, VAULT_SLOT } from "./layout";
import type { ProposalModel, VaultModel } from "./model";
import { AGAINST_RED, FOR_GREEN, GOLD, coinStack, spread } from "./parts";
import type { Drawn } from "./view";

/** The escrow safe with its milestone drawers, the builder's tray, and the proposal placard. */

const SAFE = matOf("#6fae86");
const DRAWER_FACE: Pal = { l: "#eef0f0", m: "#c6ccce", d: "#8f989b" };
const DRAWER_Y0 = VAULT.y0 + 6;
const DRAWER_Y1 = VAULT.y1 - 6;
const DRAWER_OUT = 13;
const FLAG = "#f08a2b";

/** Where coins leave an open drawer. */
export function drawerMouth(i: number, count: number): V3 {
  const [z0, z1] = drawerZ(i, count);
  return [VAULT.x1 + DRAWER_OUT - 3, (DRAWER_Y0 + DRAWER_Y1) / 2, (z0 + z1) / 2];
}

/** Bottom and top of drawer `i` (M1 on top). */
function drawerZ(i: number, count: number): [number, number] {
  const pitch = 38 / count;
  const top = TOP + 46 - i * pitch;
  return [top - pitch + 2, top];
}

function drawer(i: number, count: number, open: number, flag: number, coins: number): string {
  const [z0, z1] = drawerZ(i, count);
  const x1 = VAULT.x1;
  const out = ease(open) * DRAWER_OUT;
  let s = shape(on(PX(x1 + 0.05), rectUV(DRAWER_Y0, z0, DRAWER_Y1, z1)), "#2b2925", 0);
  if (out > 0.3) {
    s += shape([[x1, DRAWER_Y1 - 0.6, z0 + 0.5], [x1 + out, DRAWER_Y1 - 0.6, z0 + 0.5], [x1 + out, DRAWER_Y1 - 0.6, z1 - 1], [x1, DRAWER_Y1 - 0.6, z1 - 1]], "#cdd2d3", 0.9);
    s += shape(on(PZ(z0 + 1), rectUV(x1, DRAWER_Y0 + 0.8, x1 + out, DRAWER_Y1 - 0.8)), "#55504a", 0.8);
    if (coins > 0 && out > 6) s += spread(coins, 2, 5).map((n, k) => coinStack(x1 + out - 4, DRAWER_Y0 + 10 + k * 14, z0 + 1, Math.round(n))).join("");
  }
  const xf = x1 + out;
  s += box(xf, DRAWER_Y0 + 0.3, z0 + 0.3, xf + 1.4, DRAWER_Y1 - 0.3, z1 - 0.3, DRAWER_FACE, toneI, 1.1);
  const ym = (DRAWER_Y0 + DRAWER_Y1) / 2;
  s += tx(xf + 1.5, ym + 9, z0 + (z1 - z0) / 2 - 1.4, `M${i + 1}`, 4, INK, 800);
  s += box(xf + 1.4, ym - 5, z0 + (z1 - z0) / 2 - 1, xf + 2.6, ym + 3, z0 + (z1 - z0) / 2 + 1, METAL, toneI, 0.8);
  const dot = on(PX(xf + 1.5), ellUV(ym - 11, z0 + (z1 - z0) / 2, 1.5, 1.5, 12));
  s += shape(dot, coins > 0 ? GOLD.l : "#5a5650", 0.7);
  s += flagOn(xf + 1.5, DRAWER_Y0 + 10, z1 - 2, flag);
  return s;
}

/** A mailbox-style flag on the drawer face: lying flat toward the right when down, upright when raised. */
function flagOn(x: number, y: number, z: number, raised: number): string {
  const a = ease(raised) * (Math.PI / 2);
  const at = (t: number, side = 0): V3 => [x, y - Math.cos(a) * t + Math.sin(a) * side, z + Math.sin(a) * t - Math.cos(a) * side];
  return line([at(0), at(9)], 1.2) + shape([at(9), at(5.4), at(7.2, 4.2)], FLAG, 0.8);
}

export function vault(model: VaultModel | null, drawers: readonly number[], flags: readonly number[], keyTurn: number): Drawn {
  const { x0, x1, y0, y1, height } = VAULT;
  const profile = rrUV(y0, TOP + 3, y1, TOP + height, 4);
  const count = model?.milestones.length ?? 3;
  let s = "";
  for (const [fx, fy] of [[x0 + 4, y0 + 4], [x0 + 4, y1 - 4], [x1 - 4, y0 + 4], [x1 - 4, y1 - 4]] as const) s += box(fx - 2.5, fy - 2.5, TOP, fx + 2.5, fy + 2.5, TOP + 3, DARK, toneI, 0.9);
  s += shape(on(PX(x1), profile), tone([1, 0, 0], SAFE), 0);
  for (let i = count - 1; i >= 0; i--) {
    const m = model?.milestones[i];
    const inside = m && model.state === "Active" && m.status !== "Released" ? m.sol : 0;
    s += drawer(i, count, drawers[i] ?? 0, flags[i] ?? 0, inside);
  }
  s += shape(on(PX(x1 + 0.2), rrUV(DRAWER_Y0, TOP + 49, DRAWER_Y1, TOP + 55, 1.4)), "#fff4d6", 1);
  s += tx(x1 + 0.3, (y0 + y1) / 2, TOP + 50.6, "ESCROW", 3.8, SAFE.d, 800);
  s += ink(pd(on(PX(x1), profile)), 2.2);
  s += extrude(profile, x0, x1, SAFE);
  s += shape(on(PZ(TOP + height + 0.05), rrUV(VAULT_SLOT[0] - 5, VAULT_SLOT[1] - 6, VAULT_SLOT[0] + 5, VAULT_SLOT[1] + 6, 1)), "#2b2925", 0.9);
  const dialAngle = keyTurn * Math.PI;
  const dc: V2 = [x0 + 24, TOP + 30];
  s += shape(on(PY(y1 + 0.2), ellUV(dc[0], dc[1], 6, 6, 24)), "#e9e4d6", 1.1);
  s += line(on(PY(y1 + 0.3), [dc, [dc[0] + 4.6 * Math.cos(dialAngle + 1.2), dc[1] + 4.6 * Math.sin(dialAngle + 1.2)]]), 1.3);
  s += hullInk([...on(PX(x0), profile), ...on(PX(x1), profile)], 2.8);
  return { at: [(x0 + x1) / 2, (y0 + y1) / 2, TOP + 25], svg: s, shadow: [...on(PX(x0), profile), ...on(PX(x1), profile)] };
}

/** The builder's wooden tray: one coin per SOL the escrow has paid out. */
export function tray(coins: number): Drawn {
  const { x0, x1, y0, y1 } = TRAY;
  const z1 = TOP + 3.6;
  let s = shape(on(PZ(TOP + 1.2), rectUV(x0 + 1.4, y0 + 1.4, x1 - 1.4, y1 - 1.4)), WOOD.d, 0.8);
  s += shape([[x0 + 1.4, y0 + 1.4, TOP + 1.2], [x0 + 1.4, y1 - 1.4, TOP + 1.2], [x0 + 1.4, y1 - 1.4, z1], [x0 + 1.4, y0 + 1.4, z1]], WOOD.m, 0.6);
  s += shape([[x0 + 1.4, y0 + 1.4, TOP + 1.2], [x1 - 1.4, y0 + 1.4, TOP + 1.2], [x1 - 1.4, y0 + 1.4, z1], [x0 + 1.4, y0 + 1.4, z1]], WOOD.l, 0.6);
  const spots: V2[] = [[x0 + 7, y0 + 8], [x0 + 7, y0 + 18], [x1 - 7, y0 + 8], [x1 - 7, y0 + 18]];
  s += spread(coins, spots.length, 12).map((n, i) => {
    const [cx, cy] = spots[i] ?? spots[0] ?? [x0, y0];
    return coinStack(cx, cy, TOP + 1.2, Math.round(n));
  }).join("");
  s += shape([[x1, y0, TOP], [x1, y1, TOP], [x1, y1, z1], [x1, y0, z1]], toneI([1, 0, 0], WOOD), 1);
  s += shape([[x0, y1, TOP], [x1, y1, TOP], [x1, y1, z1], [x0, y1, z1]], toneI([0, 1, 0], WOOD), 1);
  s += `<path d="${pd(on(PZ(z1), rectUV(x0, y0, x1, y1)))}${pd(on(PZ(z1), rectUV(x0 + 1.4, y0 + 1.4, x1 - 1.4, y1 - 1.4)))}" fill="${WOOD.l}" fill-rule="evenodd" stroke="${INK}" stroke-width=".9"/>`;
  s += hullInk([...on(PZ(TOP), rectUV(x0, y0, x1, y1)), ...on(PZ(z1), rectUV(x0, y0, x1, y1))], 1.6);
  return { at: [(x0 + x1) / 2, (y0 + y1) / 2, TOP + 2], svg: s, shadow: [...on(PZ(TOP), rectUV(x0, y0, x1, y1)), ...on(PZ(z1), rectUV(x0, y0, x1, y1))] };
}

const STATE_INK: Record<ProposalStateName, string> = {
  Voting: "#2f6fd6",
  Passed: "#1f8a3b",
  Rejected: AGAINST_RED,
  Escrowed: "#8a6a1e",
  Completed: "#1f8a3b",
  Cancelled: "#8c2a22",
};

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The standing card: proposal title, amount, state word, and a clock whose hand sweeps down the voting period. */
export function placard(p: ProposalModel | null, now: number, stamp: number): Drawn {
  const { x, y0, y1, z0, z1 } = PLACARD;
  const ym = (y0 + y1) / 2;
  let s = rod([x - 1, ym, z1 - 6], [x - 20, ym, TOP], 1, WOOD, toneI, 0.9);
  for (const yy of [y0 + 6, y1 - 6]) s += rod([x - 0.6, yy, z0], [x + 2.4, yy, TOP], 0.9, WOOD, toneI, 0.9);
  s += box(x - 2, y0, z0, x, y1, z1, CERAMIC, toneI, 1.4);
  s += box(x, y0, z0 - 1.6, x + 3, y1, z0, WOOD, toneI, 1);
  const F = x + 0.1;
  if (!p) {
    s += tx(F, ym, z0 + 25, "WAITING", 7, INK, 800) + tx(F, ym, z0 + 15, "FOR ARENA", 7, INK, 800);
    s += tx(F, ym, z0 + 6, "npm run arena -- --serve", 2.8, "#857d6e", 700);
  } else {
    s += tx(F, ym, z1 - 8, clip(p.title, 28), 3, INK, 800);
    s += tx(F, ym, z1 - 13.5, `${p.amountSol} SOL · ${p.milestones} MILESTONES`, 2.8, "#857d6e", 700);
    s += line(on(PX(F), [[y1 - 4, z1 - 16.4], [y0 + 4, z1 - 16.4]]), 0.6);
    const big = 7.4 * (1 + 0.18 * Math.sin(Math.PI * stamp));
    s += tx(F, y0 + 48, z0 + 8, p.state.toUpperCase(), big, STATE_INK[p.state], 800);
    s += clock(F, y0 + 13, z0 + 12, p, now);
  }
  return { at: [x, ym, z0], svg: s, shadow: [...on(PX(x - 2), rectUV(y0, z0, y1, z1)), [x - 20, ym, TOP]] };
}

function clock(x: number, cy: number, cz: number, p: ProposalModel, now: number): string {
  const r = 7.6;
  const start = p.endsAt - p.period;
  const left = p.state === "Voting" ? Math.min(1, Math.max(0, (p.endsAt - now) / p.period)) : 0;
  const a = (k: number): number => Math.PI / 2 - k * 2 * Math.PI;
  let s = shape(on(PX(x), ellUV(cy, cz, r, r, 32)), "#ffffff", 1.1);
  if (left > 0.01) {
    const wedge: V2[] = [[cy, cz], ...Array.from({ length: 17 }, (_, i): V2 => {
      const k = 1 - left + (left * i) / 16;
      return [cy - r * 0.9 * Math.cos(a(k)), cz + r * 0.9 * Math.sin(a(k))];
    })];
    s += fill(pd(on(PX(x + 0.05), wedge)), "#f6c6bd");
  }
  for (let k = 0; k < 12; k++) s += line(on(PX(x + 0.1), [[cy - r * 0.78 * Math.cos(a(k / 12)), cz + r * 0.78 * Math.sin(a(k / 12))], [cy - r * 0.92 * Math.cos(a(k / 12)), cz + r * 0.92 * Math.sin(a(k / 12))]]), 0.5);
  const k = start > 0 ? 1 - left : 0;
  s += line(on(PX(x + 0.15), [[cy, cz], [cy - r * 0.8 * Math.cos(a(k)), cz + r * 0.8 * Math.sin(a(k))]]), 1.3);
  s += shape(on(PX(x + 0.2), ellUV(cy, cz, 0.8, 0.8, 8)), left > 0 ? AGAINST_RED : FOR_GREEN, 0.5);
  return s;
}
