/** Small repeated props: coins, credit chips, vote tokens, spheres. */

export const GOLD: Pal = { l: "#f4cf5c", m: "#d9ad3c", d: "#8a6a1e" };
export const CHIP: Pal = { l: "#6f9be0", m: "#4f78c0", d: "#22355e" };
const TOKEN: Pal = { l: "#f6eedb", m: "#ddd0b0", d: "#a39272" };
export const BRASS: Pal = { l: "#e9c873", m: "#c79f45", d: "#7d6021" };
export const FOR_GREEN = "#43c25c";
export const AGAINST_RED = "#e2483d";

const COIN_R = 3.3;
const COIN_T = 1.05;

/** A stack of `n` one-SOL coins standing at (x, y, z). */
export function coinStack(x: number, y: number, z: number, n: number): string {
  if (n <= 0) return "";
  const top = z + n * COIN_T;
  let s = cyl(x, y, z, top, COIN_R, GOLD, toneI, 1, 16);
  for (let k = 2; k < n; k += 2) s += line(arcUV(x, y, COIN_R, -45, 135, 8).map(([u, v]) => [u, v, z + k * COIN_T]), 0.5);
  return s;
}

/** Height of a credit-chip stack: 6 units per 1,000 credits, so the whale's 100,000 are 100 such stacks. */
export const chipHeight = (credits: number): number => (credits / 1000) * 6;

/** One stack of credit chips with two white edge stripes. */
export function chipStack(x: number, y: number, z: number, credits: number, r = 2): string {
  const h = chipHeight(credits);
  if (h <= 0.05) return "";
  let s = cyl(x, y, z, z + h, r, CHIP, toneI, 1, 14);
  for (const k of [0.33, 0.66]) {
    if (h * k < 0.8) continue;
    s += `<path d="${pd(arcUV(x, y, r + 0.02, -45, 135, 8).map(([u, v]) => [u, v, z + h * k]), false)}" fill="none" stroke="#ffffff" stroke-width=".7" opacity=".8"/>`;
  }
  return s;
}

/** Vote tokens: one disc stands for 10 votes, stacked up to `per` discs high. */
export const TOKEN_VOTES = 10;
const TOKEN_R = 2.5;
const TOKEN_T = 0.9;

export function tokenStack(x: number, y: number, z: number, discs: number): string {
  if (discs <= 0.05) return "";
  const top = z + discs * TOKEN_T;
  return cyl(x, y, z, top, TOKEN_R, TOKEN, toneI, 0.9, 14) + ink(pd(on(PZ(top + 0.01), ellUV(x, y, 1.4, 1.4, 10))), 0.5);
}

/** Positions for up to 13 stacks inside a round pan or jar: the centre, then rings. */
export function ringSpots(r1: number, r2: number): [number, number][] {
  const spots: [number, number][] = [[0, 0]];
  for (let i = 0; i < 6; i++) spots.push([r1 * Math.cos((i * Math.PI) / 3 + 0.5), r1 * Math.sin((i * Math.PI) / 3 + 0.5)]);
  for (let i = 0; i < 6; i++) spots.push([r2 * Math.cos((i * Math.PI) / 3), r2 * Math.sin((i * Math.PI) / 3)]);
  return spots;
}

/** Splits `total` into up to `slots` stacks of at most `cap`, as evenly as possible. */
export function spread(total: number, slots: number, cap: number): number[] {
  if (total <= 0) return [];
  const used = Math.min(slots, Math.ceil(total / cap));
  const whole = Math.floor(total);
  const base = Math.floor(whole / used);
  const extra = whole % used;
  return Array.from({ length: used }, (_, i) => base + (i < extra ? 1 : 0) + (i === used - 1 ? total - whole : 0));
}

/** A shaded ball (head, lamp, knob): a circle 1.2247 r wide on screen, a light offset disc and a glint. */
export function sphere(c: V3, r: number, m: Pal, w = 1.1): string {
  const [X, Y] = P(...c);
  const R = r * 1.2247;
  return `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R)}" fill="${m.m}"/>`
    + `<circle cx="${f(X + R * 0.12)}" cy="${f(Y - R * 0.14)}" r="${f(R * 0.78)}" fill="${m.l}"/>`
    + `<circle cx="${f(X + R * 0.34)}" cy="${f(Y - R * 0.4)}" r="${f(R * 0.18)}" fill="#ffffff" opacity=".7"/>`
    + `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R)}" fill="none" stroke="${INK}" stroke-width="${w}"/>`;
}
