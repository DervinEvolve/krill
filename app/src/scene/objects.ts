import { CHUTE_END, HOPPER_MOUTH, JAR, PRESS, QUORUM, SCALE, TOP } from "./layout";
import { AGAINST_RED, BRASS, CHIP, FOR_GREEN, TOKEN_VOTES, chipHeight, chipStack, coinStack, ringSpots, sphere, spread, tokenStack } from "./parts";
import type { Drawn, Flyer } from "./view";

/** The treasury jar, the root press and the scale with its quorum post. */

const CORK: Pal = { l: "#d8a46c", m: "#bb8650", d: "#7d5530" };
const LABEL = "#fbf3dc";
const ring = (x: number, y: number, z: number, r: number, n = 28): V3[] => on(PZ(z), ellUV(x, y, r, r, n));

/** A patch on a vertical cylinder between two azimuths (degrees from +x toward +y). */
function cylPatch(x: number, y: number, r: number, a0: number, a1: number, z0: number, z1: number): V3[] {
  const arc = (z: number, from: number, to: number): V3[] =>
    Array.from({ length: 9 }, (_, i) => {
      const a = ((from + ((to - from) * i) / 8) * Math.PI) / 180;
      return [x + r * Math.cos(a), y + r * Math.sin(a), z];
    });
  return [...arc(z0, a0, a1), ...arc(z1, a1, a0)];
}

/** Text running round a cylinder at azimuth `a`, readable where the surface faces the viewer. */
function cylText(x: number, y: number, r: number, a: number, z: number, text: string, size: number): string {
  const rad = (a * Math.PI) / 180;
  const o = P(x + r * Math.cos(rad), y + r * Math.sin(rad), z);
  return `<text transform="${txM(o, Dv(Math.sin(rad), -Math.cos(rad), 0), Dv(0, 0, -1))}" font-size="${size}" fill="${INK}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="800" letter-spacing=".08em">${text}</text>`;
}

export function jar(coins: number): Drawn {
  const { x, y, r, body } = JAR;
  const z0 = TOP;
  const base = ring(x, y, z0, r);
  const top = ring(x, y, z0 + body, r);
  const shoulder = ring(x, y, z0 + body + 5, r * 0.74);
  const neck = ring(x, y, z0 + body + 9, r * 0.6);
  const outline = [...base, ...top, ...shoulder, ...neck];
  const silhouette = sp(hull(outline.map((p) => P(...p))));

  let s = fill(silhouette, "#cfe9f0", 'opacity=".3"');
  s += fill(pd(ring(x, y, z0 + 1, r - 1.4)), "#e9f4f5", 'opacity=".7"');
  const spots = ringSpots(7.4, 0).slice(0, 7);
  const stacks = spread(coins, spots.length, 18);
  s += byDepth(
    stacks.map((n, i) => {
      const [dx, dy] = spots[i] ?? [0, 0];
      return { at: [x + dx, y + dy, z0], svg: coinStack(x + dx, y + dy, z0 + 1, Math.round(n)) };
    }),
  );
  s += `<g pointer-events="none">${fill(silhouette, "#e4f2f4", 'opacity=".22"')}`;
  for (const [a0, a1] of [[14, 22], [28, 31]] as const) s += fill(pd(cylPatch(x, y, r + 0.1, a0, a1, z0 + 5, z0 + body - 3)), "#ffffff", 'opacity=".42"');
  s += "</g>";
  s += line(on(PZ(z0 + body), arcUV(x, y, r, -45, 135, 14)), 0.7);
  s += hullInk(outline, 2.4);
  s += ink(pd(neck), 1.2);
  const corkLow = ring(x, y, z0 + body + 7, r * 0.56, 20);
  const corkTop = ring(x, y, z0 + body + 15, r * 0.64, 20);
  s += loft(corkLow, corkTop, (n) => toneI(n, CORK)) + fill(pd(corkTop), CORK.l) + hullInk([...corkLow, ...corkTop], 1.3) + ink(pd(corkTop), 0.9);
  s += shape(on(PZ(z0 + body + 15.05), rrUV(x - 4.4, y - 0.9, x + 4.4, y + 0.9, 0.8)), "#3a2a1a", 0.6);
  s += shape(cylPatch(x, y, r + 0.15, 8, 82, z0 + 28, z0 + 36), LABEL, 1);
  s += cylText(x, y, r + 0.2, 45, z0 + 30.8, "TREASURY", 3.2);
  return { at: [x, y, z0 + 20], svg: s, shadow: [...base, ...neck], glass: true };
}

/** The quadratic machine: hopper on top, √ crank on its side, chute toward the scale. */
export function press(m: Pal, crank: number, lit: number, counter: [string, string] | null, sinking: Flyer | null): Drawn {
  const { x0, x1, y0, y1 } = PRESS;
  const z0 = TOP + 4;
  const mid = (y0 + y1) / 2;
  const profile = rrUV(y0, z0, y1, z0 + 40, 6);
  let s = box(x0 - 4, y0 - 4, TOP, x1 + 4, y1 + 4, z0, DARK, tone, 1.2);

  s += shape(on(PX(x1), profile), tone([1, 0, 0], m), 0);
  const plate = rrUV(y0 + 6, z0 + 29, y1 - 6, z0 + 36, 1.6);
  s += shape(on(PX(x1 + 0.2), plate), lit > 0 ? mix("#fff4d6", "#f4b829", lit) : "#fff4d6", 1.1);
  s += tx(x1 + 0.3, mid, z0 + 31.2, "ROOT PRESS", 3.6, INK, 800);
  s += shape(on(PX(x1 + 0.2), rrUV(y0 + 9, z0 + 14, y1 - 9, z0 + 25, 1.6)), "#1d2a26", 1.2);
  const [l1, l2] = counter ?? ["CREDITS IN", "VOTES OUT"];
  s += tx(x1 + 0.3, mid, z0 + 20.6, l1, 2.3, "#8af0ae", 700) + tx(x1 + 0.3, mid, z0 + 16.4, l2, 2.3, "#8af0ae", 700);
  s += shape(on(PX(x1 + 0.2), rectUV(mid - 6, z0 + 3, mid + 6, z0 + 9)), "#26231f", 1);
  s += ink(pd(on(PX(x1), profile)), 2.2);
  s += extrude(profile, x0, x1, m);
  s += hullInk([...on(PX(x0), profile), ...on(PX(x1), profile)], 2.8);

  s += box(HOPPER_MOUTH[0] - 7, mid - 7, z0 + 40, HOPPER_MOUTH[0] + 7, mid + 7, z0 + 43, METAL, toneI, 1);
  s += hopper(sinking);
  s += crankWheel(crank);
  s += chute();
  return { at: [(x0 + x1) / 2, mid, z0 + 20], svg: s, shadow: [...on(PX(x0 - 4), rectUV(y0 - 4, TOP, y1 + 4, z0 + 58)), ...on(PX(x1 + 4), rectUV(y0 - 4, TOP, y1 + 4, z0 + 40))] };
}

function hopper(sinking: Flyer | null): string {
  const [hx, hy, hz] = HOPPER_MOUTH;
  const sq = (z: number, half: number): V3[] => on(PZ(z), rectUV(hx - half, hy - half, hx + half, hy + half));
  const low = sq(hz - 15, 7);
  const top = sq(hz, 15);
  let inside = fill(pd(top), "#3a3631") + loft(low, top, (n) => toneI(n, { l: "#a7aeb1", m: "#8a9295", d: "#5f6669" }), true);
  if (sinking) inside += flyerSvg(sinking);
  return loft(low, top, (n) => toneI(n, METAL)) + clipTo(top, inside) + ink(pd(top), 1.4) + hullInk([...low, ...top], 1.6);
}

function crankWheel(angle: number): string {
  const cx = (PRESS.x0 + PRESS.x1) / 2;
  const cz = TOP + 26;
  const y = PRESS.y1 + 5;
  const Y = PY(y);
  let s = rod([cx, PRESS.y1, cz], [cx, y, cz], 1.8, METAL, toneI, 1);
  s += `<path d="${pd(on(Y, ellUV(cx, cz, 14, 14, 36)))}${pd(on(Y, ellUV(cx, cz, 11.4, 11.4, 36)))}" fill="${BRASS.m}" fill-rule="evenodd"/>`;
  for (let k = 0; k < 4; k++) {
    const a = angle + (k * Math.PI) / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    s += shape(on(Y, [[cx + 4 * c - 0.9 * sn, cz + 4 * sn + 0.9 * c], [cx + 11.6 * c - 0.9 * sn, cz + 11.6 * sn + 0.9 * c], [cx + 11.6 * c + 0.9 * sn, cz + 11.6 * sn - 0.9 * c], [cx + 4 * c + 0.9 * sn, cz + 4 * sn - 0.9 * c]]), BRASS.l, 0.7);
  }
  s += ink(pd(on(Y, ellUV(cx, cz, 14, 14, 36))), 1.4) + ink(pd(on(Y, ellUV(cx, cz, 11.4, 11.4, 36))), 0.9);
  s += shape(on(PY(y + 0.3), ellUV(cx, cz, 4.8, 4.8, 20)), "#fff4d6", 1);
  s += line(on(PY(y + 0.4), [[cx - 2.7, cz + 0.1], [cx - 1.9, cz + 0.6], [cx - 1, cz - 2.3], [cx + 0.1, cz + 2.5], [cx + 2.9, cz + 2.5]]), 1);
  const hx = cx + 12.7 * Math.cos(angle + 0.4);
  const hz = cz + 12.7 * Math.sin(angle + 0.4);
  s += rod([hx, y, hz], [hx, y + 6, hz], 0.9, METAL, toneI, 0.9) + sphere([hx, y + 7, hz], 1.7, DARK, 0.9);
  return s;
}

function chute(): string {
  const [ex, , ez] = CHUTE_END;
  const x1 = PRESS.x1;
  const z1 = TOP + 10;
  const ya = CHUTE_END[1] - 6;
  const yb = CHUTE_END[1] + 6;
  let s = box(ex - 4, ya + 1, TOP, ex - 1, yb - 1, ez - 1, DARK, toneI, 0.9);
  s += shape([[x1, ya, z1], [ex, ya, ez], [ex, yb, ez], [x1, yb, z1]], METAL.m, 1);
  s += shape([[x1, yb, z1], [ex, yb, ez], [ex, yb, ez + 2.6], [x1, yb, z1 + 2.6]], toneI([0, 1, 0], METAL), 1);
  s += line([[x1, ya, z1 + 2.6], [ex, ya, ez + 2.6]], 1);
  return s;
}

/** Fixed-point tallies to a beam angle: any lead tips it, a big lead tips it to the stop (16°). */
export function beamAngle(forVotes: bigint, againstVotes: bigint): number {
  const total = Number(forVotes + againstVotes);
  if (total === 0) return 0;
  const lead = (Number(forVotes) - Number(againstVotes)) / total;
  return ((16 * Math.PI) / 180) * Math.tanh(lead * 14);
}

function pan(end: V3, votes: bigint, rim: string): Drawn {
  const [ex, ey, ez] = end;
  const zr = ez - SCALE.hang;
  const rimRing = ring(ex, ey, zr, 15, 30);
  const bottom = ring(ex, ey, zr - 3.4, 10.5, 30);
  const strings = [45, 165, 285].map((a): [V3, number] => {
    const rad = (a * Math.PI) / 180;
    const p: V3 = [ex + 14.6 * Math.cos(rad), ey + 14.6 * Math.sin(rad), zr];
    return [p, Math.cos(rad) + Math.sin(rad)];
  });
  const stringSvg = (far: boolean): string =>
    strings.filter(([, d]) => (d < 0) === far).map(([p]) => line([end, p], 0.7)).join("");
  let s = stringSvg(true);
  s += loft(bottom, rimRing, (n) => toneI(n, { l: "#d9b866", m: "#b8933d", d: "#7a5d22" }), true) + fill(pd(bottom), BRASS.m);
  const discs = Number(votes) / 1e9 / TOKEN_VOTES;
  const spots = ringSpots(5.6, 0).slice(0, 7);
  s += byDepth(spread(discs, spots.length, 10).map((n, i) => {
    const [dx, dy] = spots[i] ?? [0, 0];
    return { at: [ex + dx, ey + dy, zr], svg: tokenStack(ex + dx, ey + dy, zr - 3.3, n) };
  }));
  s += loft(bottom, rimRing, (n) => toneI(n, BRASS));
  s += `<path d="${pd(rimRing)}" fill="none" stroke="${rim}" stroke-width="2.2"/>`;
  s += hullInk([...bottom, ...rimRing], 1.5) + stringSvg(false) + sphere(end, 1.4, BRASS, 0.8);
  return { at: [ex, ey, zr], svg: s };
}

/** The balance: AGAINST pan (red rim) toward the vault, FOR pan (green rim) toward the krill. */
export function scale(forVotes: bigint, againstVotes: bigint): Drawn[] {
  const { x, y, arm, pivot } = SCALE;
  const th = beamAngle(forVotes, againstVotes);
  const against: V3 = [x, y - arm * Math.cos(th), pivot + arm * Math.sin(th)];
  const forEnd: V3 = [x, y + arm * Math.cos(th), pivot - arm * Math.sin(th)];
  let post = box(x - 14, y - 14, TOP, x + 14, y + 14, TOP + 6, WOOD, toneI, 1.2);
  post += cyl(x, y, TOP + 6, pivot, 2, BRASS, toneI, 1.1, 16);
  const plate = PX(x + 2.6);
  post += shape(on(plate, [[y, pivot], ...arcUV(y, pivot, 15, 55, 125, 10)]), "#fff4d6", 0.9);
  for (const a of [60, 75, 90, 105, 120]) {
    const r = (a * Math.PI) / 180;
    post += line(on(PX(x + 2.7), [[y + 12.4 * Math.cos(r), pivot + 12.4 * Math.sin(r)], [y + 14.4 * Math.cos(r), pivot + 14.4 * Math.sin(r)]]), a === 90 ? 1 : 0.6);
  }
  post += line(on(PX(x + 2.8), [[y, pivot], [y + 13 * Math.sin(th), pivot + 13 * Math.cos(th)]]), 1.4);
  post += rod(against, forEnd, 1.3, BRASS, toneI, 1.1);
  post += sphere([x, y, pivot], 2.4, BRASS, 1);
  const panLow = pivot - SCALE.hang - 4;
  return [
    pan(against, againstVotes, AGAINST_RED),
    { at: [x, y, TOP + 20], svg: post, shadow: [...on(PZ(TOP), rectUV(x - 14, y - 14, x + 14, y + 14)), [x, y, pivot], ...ring(x, y - arm, panLow, 11, 8), ...ring(x, y + arm, panLow, 11, 8)] },
    pan(forEnd, forVotes, FOR_GREEN),
  ];
}

/** A slim post: the brass slider climbs with credits spent; the red tick is the quorum; the lamp lights once it is met. */
export function quorumPost(spent: number, required: number, minted: number): Drawn {
  const { x, y, height } = QUORUM;
  const travel = height - 6;
  const frac = (n: number): number => (minted > 0 ? Math.min(1, n / minted) : 0);
  const met = required > 0 && spent >= required;
  let s = cyl(x, y, TOP, TOP + 1.6, 4.2, DARK, toneI, 1, 18);
  s += cyl(x, y, TOP + 1.6, TOP + height, 0.9, METAL, toneI, 0.9, 10);
  if (required > 0) s += box(x - 0.4, y - 2.6, TOP + 2 + travel * frac(required), x + 0.4, y + 2.6, TOP + 2.8 + travel * frac(required), { l: AGAINST_RED, m: AGAINST_RED, d: "#8c2a22" }, toneI, 0.6);
  const zs = TOP + 2 + travel * frac(spent);
  s += cyl(x, y, zs, zs + 1.6, 2, BRASS, toneI, 0.9, 14);
  const lamp: V3 = [x, y, TOP + height + 2.6];
  if (met) s += `<circle cx="${f(P(...lamp)[0])}" cy="${f(P(...lamp)[1])}" r="${f(6.5)}" fill="${FOR_GREEN}" opacity=".25"/>`;
  s += sphere(lamp, 2.8, met ? { l: "#9df0ad", m: FOR_GREEN, d: "#1f6b31" } : { l: "#c9c6bb", m: "#a19e93", d: "#6b685f" }, 1);
  return { at: [x, y, TOP + 10], svg: s, shadow: [...ring(x, y, TOP, 4.2, 10), [x, y, TOP + height + 5]] };
}

/** Coins, chips or tokens on their way somewhere. */
export function flyerSvg(fl: Flyer): string {
  const [x, y, z] = fl.at;
  if (fl.kind === "coins") return spread(fl.amount, 4, 10).map((n, i) => coinStack(x + (i % 2) * 7 - 3.5, y + Math.floor(i / 2) * 7 - 3.5, z, Math.round(n))).join("");
  if (fl.kind === "tokens") return spread(fl.amount, 4, 10).map((n, i) => tokenStack(x + (i % 2) * 5.4 - 2.7, y + Math.floor(i / 2) * 5.4 - 2.7, z, n)).join("");
  if (fl.kind === "chips") return chipStack(x, y, z, fl.amount);
  return chipBlock(x, y, z, fl.amount);
}

/** The whale's credits: 1,000-credit stacks (each as tall as one krill's) in rows of ten. */
export function chipBlock(cx: number, cy: number, z: number, credits: number): string {
  const units = Math.round(credits / 1000);
  const rows = Math.ceil(units / 10);
  const pitch = 2.8;
  const x0 = cx - (rows * pitch) / 2;
  const y0 = cy - (10 * pitch) / 2;
  let s = "";
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(10, units - r * 10);
    s += box(x0 + r * pitch, y0, z, x0 + (r + 1) * pitch, y0 + inRow * pitch, z + chipHeight(1000), CHIP, toneI, 0.7);
  }
  return s;
}
