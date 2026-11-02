import { formatCount } from "../../../shared/math";
import { BUILDER, COUNCIL, KRILL_SCALE, KRILL_SLOTS, TOP, WHALE_CHIPS, WHALE_PLINTH } from "./layout";
import { chipBlock } from "./objects";
import { BRASS, chipStack, sphere } from "./parts";
import type { FigureModel } from "./model";
import type { Drawn } from "./view";

/** Eleven krill, one whale on its plinth, the builder and the council. */

const KRILL: Pal = { l: "#f59f80", m: "#dd7d63", d: "#7e3b2c" };
const WHALE: Pal = { l: "#7fa6dc", m: "#5b84c4", d: "#253a63" };
const PLATE: Pal = { l: "#f7f1df", m: "#e2d9bf", d: "#b1a684" };
const SKIN: Pal = { l: "#f3cfae", m: "#dcae88", d: "#9a6f4c" };
const OVERALLS: Pal = { l: "#6f9be0", m: "#4f78c0", d: "#22355e" };
const COAT: Pal = { l: "#5f8f93", m: "#457276", d: "#1f3a3c" };
const HAT: Pal = { l: "#f6cb3a", m: "#d9a91f", d: "#7a5c0c" };
const FELT = "#3f6b52";

const glow = (x: number, y: number, rx: number, ry: number): string =>
  fill(pd(on(PZ(TOP + 0.05), ellUV(x, y, rx, ry, 24))), "var(--accent,#f4b829)", 'opacity=".45"');

/** A small shrimp-like krill on its nameplate, with its credit-chip stack beside it. */
export function krill(index: number, label: string, credits: number, lit: boolean): Drawn {
  const slot = KRILL_SLOTS[index] ?? { x: 0, y: 0 };
  const k = KRILL_SCALE;
  const L = (dx: number, dy: number, dz: number): V3 => [slot.x + dx * k, slot.y + dy * k, TOP + dz * k];
  const b = 1.4;
  const kx = -1.5;
  let s = lit ? glow(slot.x, slot.y, 9 * k, 10 * k) : "";
  s += chipStack(slot.x - 2 * k, slot.y - 11 * k, TOP, credits);
  s += box(...L(-6, -7, 0), ...L(6, 7, b), PLATE, toneI, 1);
  const spine: V3[] = [L(kx, -5.4, b + 5.6), L(kx, -2.8, b + 7.4), L(kx, 0.2, b + 8), L(kx, 3, b + 7.2), L(kx, 5, b + 5.4), L(kx, 6.1, b + 3.4)];
  const radii = [2.4, 2.4, 2.1, 1.7, 1.25, 0.9].map((r) => r * k);
  s += line([L(kx + 0.4, -6.8, b + 7), L(kx + 0.6, -9.2, b + 9.6), L(kx + 1.2, -11.4, b + 12)], 0.8);
  s += line([L(kx - 0.4, -6.4, b + 7.6), L(kx - 0.4, -8.4, b + 10.8), L(kx, -9.6, b + 13.2)], 0.8);
  for (let i = 0; i < spine.length - 1; i++) {
    const a = spine[i];
    const c = spine[i + 1];
    if (a && c) s += rod(a, c, radii[i] ?? 1, KRILL, toneI, 1.1, radii[i + 1] ?? 1, 14);
  }
  s += shape([L(kx, 5.6, b + 4.2), L(kx, 8.4, b + 3.8), L(kx, 8.8, b + 1.8), L(kx, 7.2, b + 0.9), L(kx, 5.6, b + 2.2)], KRILL.l, 0.9);
  s += line([L(kx + 0.05, 6, b + 3), L(kx + 0.05, 8.6, b + 2.8)], 0.5);
  for (const dy of [-2.6, 0, 2.6]) s += line([L(kx + 1.3, dy, b + 5.6), L(kx + 2.4, dy - 0.9, b + 2.4), L(kx + 2.6, dy - 0.4, b)], 0.8);
  for (const e of [L(kx + 2.1, -4.7, b + 6.9), L(kx + 1.3, -6.2, b + 6.5)]) {
    const [ex, ey] = P(...e);
    s += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(0.55 * k)}" fill="${INK}"/>`;
  }
  s += box(...L(4.6, -7, b), ...L(6, 7, b + 3.4), PLATE, toneI, 0.9);
  s += tx(...L(6.1, 0, b + 0.9), label, 2.5 * k, INK, 800);
  const svg = act("fig", s, `data-id="${label}"`);
  return { at: L(0, 0, 4), svg, shadow: [...on(PZ(TOP), rectUV(...L(-6, -7, 0).slice(0, 2) as V2, ...L(6, 7, 0).slice(0, 2) as V2)), L(kx, 0, b + 10), L(kx, -11, b + 12)] };
}

/** The whale's body as rings along its length: [distance from the tail, half-width, half-height, lift]. */
const WHALE_RINGS: readonly [number, number, number, number][] = [
  [0, 1.2, 1.2, 1.6], [6, 3.2, 3, 1], [14, 5.8, 5.4, 0.4], [22, 7.8, 7.2, 0], [31, 8.8, 8, 0],
  [39, 8.8, 7.9, 0.2], [45, 8, 7.1, 0.4], [49.5, 6, 5.6, 0.6], [52, 2.6, 2.6, 0.8],
];
const WHALE_LONG = 1.04;
const WHALE_ROUND = 1.18;

/** The whale on a brass rod above its plinth, nameplate on the front; its chip block beside it. */
export function whale(fig: FigureModel | undefined, lit: boolean): Drawn[] {
  const label = fig?.label ?? "WHALE";
  const credits = fig?.credits ?? 0;
  const { x0, x1, y0, y1 } = WHALE_PLINTH;
  const yc = (y0 + y1) / 2;
  const zc = TOP + 22;
  const X = (u: number): number => x0 + 7 + u * WHALE_LONG;
  const R = WHALE_ROUND;
  let s = lit ? glow((x0 + x1) / 2, yc, 36, 22) : "";
  s += box(x0, y0, TOP, x1, y1, TOP + 6, PLATE, toneI, 1.4);
  s += tx(x1 + 0.1, yc, TOP + 1.7, label, 3.6, INK, 800);
  s += rod([X(26), yc, TOP + 6], [X(26), yc, zc - 8.6], 0.9, BRASS, toneI, 0.9);
  const rings = WHALE_RINGS.map(([u, ry, rz, dz]) => on(PX(X(u)), ellUV(yc, zc + dz * R, ry * R, rz * R, 22)));
  const fluke: V2[] = [[X(2), yc], [X(-3.5), yc + 12], [X(-7.6), yc + 10.8], [X(-4), yc + 1.6], [X(-7.6), yc - 10.8], [X(-3.5), yc - 12]];
  s += shape(on(PZ(zc + 1.9), fluke), WHALE.m, 1.1);
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i];
    const c = rings[i + 1];
    if (a && c) s += loft(a, c, (n) => tone(n, WHALE));
  }
  const nose = rings[rings.length - 1];
  if (nose) s += fill(pd(nose), WHALE.l);
  s += shape([[X(35), yc + 9.8 * R, zc - 3.4], [X(25), yc + 14.6 * R, zc - 10], [X(29), yc + 10 * R, zc - 6]], WHALE.m, 0.9);
  s += line([[X(51.6), yc + 2.8, zc - 1.4], [X(47), yc + 7.6, zc - 3], [X(39), yc + 9.9, zc - 3.9]], 0.8);
  const [ex, ey] = P(X(44.8), yc + 8.6, zc + 1.2);
  s += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(1)}" fill="${INK}"/>`;
  s += hullInk(rings.flat(), 2.4);
  const body = act("fig", s, `data-id="WHALE"`);

  const { x0: cx0, y0: cy0, size } = WHALE_CHIPS;
  let chips = shape(on(PZ(TOP + 0.1), rectUV(cx0 - 2, cy0 - 2, cx0 + size + 2, cy0 + size + 2)), FELT, 0.9);
  chips += chipBlock(cx0 + size / 2, cy0 + size / 2, TOP + 0.2, credits);
  const count = credits > 0 ? formatCount(BigInt(credits)) : fig?.spent ? "SPENT" : "";
  if (count) {
    chips += box(cx0 + size + 3, cy0 + 6, TOP, cx0 + size + 4.4, cy0 + size - 6, TOP + 4, PLATE, toneI, 0.9);
    chips += tx(cx0 + size + 4.5, cy0 + size / 2, TOP + 1.2, count, 2.4, INK, 800);
  }
  return [
    { at: [(x0 + x1) / 2, yc, TOP + 10], svg: body, shadow: [...on(PZ(TOP), rectUV(x0, y0, x1, y1)), ...rings.flat()] },
    { at: [cx0 + size / 2, cy0 + size / 2, TOP + 2], svg: act("fig", chips, `data-id="WHALE"`), shadow: on(PZ(TOP + 6), rectUV(cx0, cy0, cx0 + size, cy0 + size)) },
  ];
}

/** A peg figure: legs, a coat, arms and a round head. */
function person(x: number, y: number, coat: Pal): string {
  let s = "";
  for (const dy of [-1.8, 1.8]) s += cyl(x, y + dy, TOP, TOP + 7.5, 1.3, DARK, toneI, 0.9, 12);
  const r0 = on(PZ(TOP + 7), ellUV(x, y, 4.2, 4.4, 20));
  const r1 = on(PZ(TOP + 17), ellUV(x, y, 3.6, 3.9, 20));
  const r2 = on(PZ(TOP + 18.6), ellUV(x, y, 2.2, 2.4, 20));
  s += loft(r0, r1, (n) => toneI(n, coat)) + loft(r1, r2, (n) => toneI(n, coat)) + fill(pd(r2), coat.l) + hullInk([...r0, ...r1, ...r2], 1.6);
  s += rod([x, y + 3.9, TOP + 16.4], [x + 1.6, y + 4.8, TOP + 10.4], 1.1, coat, toneI, 0.9);
  s += sphere([x, y, TOP + 22.4], 3.3, SKIN, 1.2);
  return s;
}

/** The contractor in a yellow hard hat. */
export function builder(lit: boolean): Drawn {
  const { x, y } = BUILDER;
  let s = lit ? glow(x, y, 7, 7) : "";
  s += person(x, y, OVERALLS);
  s += rod([x, y - 3.9, TOP + 16.4], [x + 1.6, y - 4.8, TOP + 10.4], 1.1, OVERALLS, toneI, 0.9);
  s += shape(on(PZ(TOP + 24), ellUV(x + 0.6, y, 4.8, 4.8, 20)), HAT.m, 1);
  const h0 = on(PZ(TOP + 24), ellUV(x, y, 3.5, 3.5, 18));
  const h1 = on(PZ(TOP + 26.4), ellUV(x, y, 2.5, 2.5, 18));
  const h2 = on(PZ(TOP + 27.2), ellUV(x, y, 0.9, 0.9, 18));
  s += loft(h0, h1, (n) => toneI(n, HAT)) + loft(h1, h2, (n) => toneI(n, HAT)) + hullInk([...h0, ...h1, ...h2], 1.1);
  return { at: [x, y, TOP + 12], svg: s, shadow: [...on(PZ(TOP), ellUV(x, y, 4.2, 4.2, 10)), [x, y, TOP + 27]] };
}

/** A flat key-bow ring in the plane of the x axis and `u`. */
function bow(c: V3, u: V3, r: number, w: number): string {
  const pts = (rr: number): V3[] => Array.from({ length: 20 }, (_, i) => {
    const t = (i / 20) * 2 * Math.PI;
    return [c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t) * u[1], c[2] + rr * Math.sin(t) * u[2]];
  });
  return `<path d="${pd(pts(r))}${pd(pts(r - w))}" fill="${BRASS.m}" fill-rule="evenodd" stroke="${INK}" stroke-width=".8"/>`;
}

/** The council, holding the escrow's brass key out in front; it turns a quarter turn on approve. */
export function council(turn: number, lit: boolean): Drawn {
  const { x, y } = COUNCIL;
  let s = lit ? glow(x, y, 7, 7) : "";
  s += person(x, y, COAT);
  const k = ease(turn) * (Math.PI / 2);
  const u: V3 = [0, Math.cos(k), Math.sin(k)];
  const hand: V3 = [x + 4.6, y - 2.4, TOP + 13.6];
  s += rod([x, y - 3.9, TOP + 16.4], hand, 1.1, COAT, toneI, 0.9);
  s += bow([hand[0] + 0.6, hand[1], hand[2]], u, 2.2, 1);
  s += rod([hand[0] + 2.6, hand[1], hand[2]], [hand[0] + 9, hand[1], hand[2]], 0.5, BRASS, toneI, 0.7);
  const bit = (t: number, h: number): V3 => [hand[0] + t, hand[1] + u[1] * h, hand[2] + u[2] * h];
  s += shape([bit(7.2, 0.4), bit(8.8, 0.4), bit(8.8, -2.2), bit(7.2, -2.2)], BRASS.l, 0.7);
  s += sphere(hand, 1.2, SKIN, 0.8);
  return { at: [x, y, TOP + 12], svg: s, shadow: [...on(PZ(TOP), ellUV(x, y, 4.2, 4.2, 10)), [x, y, TOP + 26]] };
}
