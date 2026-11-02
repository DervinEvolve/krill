// Fig: the milestone escrow as a bench-mounted sequential release vault.
// node docs/figures/milestone-escrow/build.mjs [--light]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { kitScript } from "../scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 640;
const HEIGHT = 360;

// ---- Truth -------------------------------------------------------------
// One coin on the bench stands for 0.25 SOL. The proposal asks for 9 SOL in
// four milestones; the treasury holds 15 SOL before it is executed.
const SOL = M.LAMPORTS_PER_SOL;
const COIN = SOL / 4;
const AMOUNTS = [1.5, 2.5, 2, 3].map((sol) => sol * SOL);
const TREASURY = 15 * SOL;
const COINS = AMOUNTS.map((lamports) => lamports / COIN);
{
  const run = M.execute(TREASURY, AMOUNTS);
  if (!run.ok || M.lockedOf(run.escrow) !== AMOUNTS.reduce((a, b) => a + b, 0)) throw new Error("model and figure disagree");
}

// ---- World (units ~ px, z up) -------------------------------------------
const C = {
  CX: [-84, -36, 12, 60],
  COINS,
  COIN_R: 7,
  COIN_H: 2.2,
  HOUSING: { x: -112, y: -20, w: 204, d: 40, r: 4 },
  H_TOP: 34,
  BLOCK: 14,
  B_TOP: 44,
  SEAT_TOP: 46.5,
  CAP_Z: 76,
  CAP_TOP: 79,
  PLATE_Z: 36.5,
  PLATE_H: 2.5,
  PLATE_SHUT: 1.5,
  PLATE_OPEN: 15.5,
  DOG_Z: 35.2,
  DOG_H: 6.3,
  DOG_CLEAR: -21,
  LOCK: [10.4, 10.4],
  SPOUT: { y: 20, d: 8, z: 12, h: 5, w: 18 },
  TRAY: { x: -108, y: 22, w: 196, d: 30, r: 3 },
  TRAY_FLOOR: 1.2,
  STACK_Y: 37.5,
  STACK_DX: 7.6,
  STACK_MAX: 6,
  COCK: [-140, 0],
  DUCT: { x: -156, y: -6, w: 44, d: 12, r: 1 },
  DUCT_Z: 8,
  DUCT_H: 10,
  TANK: { x: -196, y: -20, w: 40, d: 40, r: 4 },
  TANK_Z: 3,
  TANK_TOP: 62,
  WIN: { x0: -188, x1: -177, z0: 8, z1: 55 },
  PER_SOL: 3,
  TREASURY_SOL: TREASURY / SOL,
  SOL_PER_COIN: COIN / SOL,
};
const BENCH = { x: -212, y: -34, w: 318, d: 98, r: 8 };
const BENCH_H = 12;
const FOOT_H = 5;

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), ...C.CX.map((x) => [x, 0, C.CAP_TOP + 18]), ...k.boxCorners(C.TANK, 0, C.TANK_TOP + 6)],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 57 },
);
const VIEW_DEG = 57;

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 4, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const quad = (points) => k.pathOf(points.map(at), true);

// ---- Live parts: one source, evaluated here and inlined into the page -----
// Uses the kit's names bare, so the same text runs in Node and in the page.
const LIVE_PARTS = String.raw`
const RAD = Math.PI / 180;
function columnSvg(i, coins) {
  const cx = C.CX[i];
  const h = Math.max(0, coins) * C.COIN_H;
  if (h < 0.05) return "";
  const paths = cylinder(cx, 0, C.COIN_R, C.SEAT_TOP, h, P, 40);
  const top = C.SEAT_TOP + h;
  let seams = "";
  for (let z = top - C.COIN_H; z > C.SEAT_TOP + 0.6; z -= C.COIN_H) seams += sideArc(cx, 0, C.COIN_R, z, P, 24);
  return solidSvg(paths, { tone: "hi", crease: "lo", inner: lineSvg(seams, { tone: "lo" }) });
}
function plateSvg(i, ext) {
  const cx = C.CX[i];
  const y0 = C.BLOCK;
  const plate = { x: cx - 8, y: y0 - 0.01, w: 16, d: ext, r: 0.8 };
  const pull = { x: cx - 4, y: y0 + ext - 1.6, w: 8, d: 1.6, r: 0.6 };
  return solidSvg(slabOf(plate, C.PLATE_Z, C.PLATE_H, P, 3, 0.4), { tone: "hi", crease: "lo" }) +
    solidSvg(slabOf(pull, C.PLATE_Z + C.PLATE_H, 1.4, P, 3), { tone: "mid" });
}
function flagSvg(i, lift, lit) {
  const cx = C.CX[i];
  const z0 = C.CAP_TOP + 1.6;
  const top = z0 + 6 + lift * 10;
  const rod = solidSvg(cylinder(cx, 0, 0.75, z0, top - z0, P, 14), { tone: "mid", crease: "none" });
  const flag = solidSvg(slabOf({ x: cx + 0.6, y: -0.45, w: 8.6, d: 0.9, r: 0.3 }, top - 5.4, 5.4, P, 2), { tone: "hi", lit, crease: "lo" });
  const knob = solidSvg(cylinder(cx, 0, 1.1, top, 0.9, P, 14), { tone: "mid", crease: "none" });
  return rod + flag + knob;
}
function bar(cx, cy, angle, length, back, width, z, h, steps) {
  const ux = Math.cos(angle), uy = Math.sin(angle), vx = -uy, vy = ux;
  const half = width / 2;
  const ring = [];
  const cap = (s, from) => {
    for (let n = 0; n <= steps; n++) {
      const a = from + (n / steps) * Math.PI;
      ring.push([cx + ux * s + (ux * Math.cos(a) + vx * Math.sin(a)) * half, cy + uy * s + (uy * Math.cos(a) + vy * Math.sin(a)) * half]);
    }
  };
  cap(length, -Math.PI / 2);
  cap(-back, Math.PI / 2);
  return extrude(ring, z, h, P);
}
function keySvg(x, lift, turn) {
  const cy = C.LOCK[1];
  const a = turn * RAD;
  const z0 = C.B_TOP + 1.4 + lift;
  const shank = solidSvg(cylinder(x, cy, 0.9, z0, 5.6, P, 14), { tone: "mid", crease: "none" });
  const collar = solidSvg(cylinder(x, cy, 1.5, z0 + 5.6, 1.2, P, 16), { tone: "mid", crease: "faint" });
  const tee = solidSvg(bar(x, cy, a, 3.9, 3.9, 1.9, z0 + 6.8, 1.8, 4), { tone: "hi", crease: "lo" });
  return shank + collar + tee;
}
function cockSvg(turn) {
  const [cx, cy] = C.COCK;
  const a = turn * RAD;
  const z0 = C.DUCT_Z + C.DUCT_H + 7.4;
  const handle = solidSvg(bar(cx, cy, a, 13, 2.6, 2.4, z0, 1.6, 4), { tone: "mid", crease: "faint" });
  const nut = solidSvg(cylinder(cx, cy, 1.6, z0 + 1.6, 1.2, P, 12), { tone: "mid", crease: "none" });
  const grip = solidSvg(cylinder(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 1.9, z0 - 0.6, 3.6, P, 16), { tone: "mid", crease: "faint" });
  return handle + grip + nut;
}
function stackSvg(sx, coins) {
  if (coins <= 0) return "";
  const h = coins * C.COIN_H;
  const paths = cylinder(sx, C.STACK_Y, C.COIN_R, C.TRAY_FLOOR, h, P, 40);
  let seams = "";
  for (let n = 1; n < coins; n++) seams += sideArc(sx, C.STACK_Y, C.COIN_R, C.TRAY_FLOOR + n * C.COIN_H, P, 24);
  return solidSvg(paths, { tone: "hi", crease: "lo", inner: lineSvg(seams, { tone: "lo" }) });
}
function coinAt(i, landed, phase) {
  const cx = C.CX[i];
  const stack = Math.min(1, Math.floor(landed / C.STACK_MAX));
  const sx = cx + (stack ? C.STACK_DX : -C.STACK_DX);
  const top = C.TRAY_FLOOR + (landed - stack * C.STACK_MAX) * C.COIN_H;
  const from = [cx, C.SPOUT.y + C.SPOUT.d + C.COIN_R - 0.5, C.SPOUT.z + 0.4];
  const t = phase;
  return [from[0] + (sx - from[0]) * t, from[1] + (C.STACK_Y - from[1]) * t, from[2] + (top - from[2]) * t * t];
}
`;
const kitNames = Object.keys(k);
const LIVE = new Function(...kitNames, "P", "C", "VIEW_DEG", `${LIVE_PARTS}; return { columnSvg, plateSvg, flagSvg, keySvg, cockSvg, stackSvg, coinAt };`)(
  ...kitNames.map((name) => k[name]),
  P,
  C,
  VIEW_DEG,
);

// ---- Static parts --------------------------------------------------------
function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BENCH, -BENCH_H - FOOT_H, BENCH_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BENCH, 22))) {
    out.push(S(k.cylinder(x, y, 7, -BENCH_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -BENCH_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(slab(BENCH, -BENCH_H, BENCH_H, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(BENCH, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip along the front edge
  const strip = { x: -150, y: BENCH.y + BENCH.d - 12, w: 238, d: 6, r: 1 };
  out.push(S(slab(strip, 0, 0.6, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.01, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  // label plate in front of the treasury tank
  const plate = { x: -204, y: 30, w: 44, d: 13, r: 2 };
  out.push(S(slab(plate, 0, 0.8, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 1.6), 0.8, P), { tone: "faint" }));
  out.push(L([0, 1, 2].map((row) => k.lineOnTop([plate.x + 7, plate.y + 4 + row * 2.4], [plate.x + (row === 1 ? 28 : 36), plate.y + 4 + row * 2.4], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([plate.x + 3.4, plate.y + plate.d / 2, 0.8]), at([plate.x + plate.w - 3.4, plate.y + plate.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

function tank() {
  const T = C.TANK;
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(T, 2), 0, 4, P)}" style="filter:blur(5px)"/>`];
  for (const x of [T.x + 4, T.x + T.w - 10]) {
    out.push(S(slab({ x, y: T.y - 3, w: 6, d: T.d + 6, r: 1.2 }, 0, C.TANK_Z, 3, 0.4), { tone: "lo" }));
    out.push(D([at([x + 3, T.y + T.d + 1.4, C.TANK_Z])], { size: 0.45 }));
  }
  const bands = [14, 50].map((z) => k.sideSeam(T, z, P, 6)).join("");
  out.push(S(slab(T, C.TANK_Z, C.TANK_TOP - C.TANK_Z, 6, 1), { tone: "mid", inner: L(bands, { tone: "faint" }) }));
  // maker's plate on the +x face, above the duct
  const px = T.x + T.w;
  out.push(S(slab({ x: px, y: -9, w: 0.8, d: 18, r: 0.3 }, 30, 12, 2), { tone: "lo", crease: "none" }));
  out.push(L([0, 1, 2].map((row) => k.segment([px + 0.8, -5 + (row === 1 ? 4 : 0), 38.6 - row * 2.6], [px + 0.8, 6, 38.6 - row * 2.6], P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([px + 0.8, -7, 40]), at([px + 0.8, 7, 32])], { size: 0.4 }));
  const lid = k.insetPlan(T, -1.2);
  out.push(S(slab(lid, C.TANK_TOP, 3, 6, 0.8), { tone: "mid" }));
  const lidTop = C.TANK_TOP + 3;
  out.push(D(k.corners(lid, 3.4).map(([x, y]) => at([x, y, lidTop])), { size: 0.5 }));
  const hatch = [T.x + T.w / 2 - 2, T.y + T.d / 2 - 3];
  out.push(S(k.cylinder(hatch[0], hatch[1], 8, lidTop, 2, P, 40, 0.5), { tone: "mid" }));
  out.push(L(k.ring(hatch[0], hatch[1], 5.6, lidTop + 2, P, 32), { tone: "lo" }));
  out.push(D([0, 1, 2, 3, 4, 5].map((n) => at([hatch[0] + Math.cos((n * Math.PI) / 3) * 6.8, hatch[1] + Math.sin((n * Math.PI) / 3) * 6.8, lidTop + 2])), { size: 0.42 }));
  out.push(S(k.cylinder(hatch[0], hatch[1], 2.2, lidTop + 2, 2.4, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(hatch[0], hatch[1], 2.2, lidTop + 2, lidTop + 4.4, 12, P), { tone: "lo" }));
  return out.join("");
}

// sight window on the tank's front face (y = 20): a recess with the level behind glass
const FACE_Y = C.TANK.y + C.TANK.d;
const WIN = C.WIN;
const RECESS = 1.6;
function tankWindow() {
  const yb = FACE_Y - RECESS;
  const open = quad([[WIN.x0, FACE_Y, WIN.z0], [WIN.x1, FACE_Y, WIN.z0], [WIN.x1, FACE_Y, WIN.z1], [WIN.x0, FACE_Y, WIN.z1]]);
  const out = [];
  out.push(`<clipPath id="me-win"><path d="${open}"/></clipPath>`);
  out.push(`<g clip-path="url(#me-win)">`);
  out.push(`<path class="iso-fill" d="${quad([[WIN.x0, yb, WIN.z0], [WIN.x1, yb, WIN.z0], [WIN.x1, yb, WIN.z1], [WIN.x0, yb, WIN.z1]])}"/>`);
  out.push(`<g data-part="level"></g>`);
  // the two recess walls that face the viewer: left (normal +x) and bottom (normal +z)
  out.push(`<path class="iso-shade" data-shade="1" d="${quad([[WIN.x0, yb, WIN.z0], [WIN.x0, FACE_Y, WIN.z0], [WIN.x0, FACE_Y, WIN.z1], [WIN.x0, yb, WIN.z1]])}"/>`);
  out.push(`<path class="iso-top" d="${quad([[WIN.x0, yb, WIN.z0], [WIN.x1, yb, WIN.z0], [WIN.x1, FACE_Y, WIN.z0], [WIN.x0, FACE_Y, WIN.z0]])}"/>`);
  out.push(L(k.pathOf([at([WIN.x0, yb, WIN.z1]), at([WIN.x0, yb, WIN.z0]), at([WIN.x1, yb, WIN.z0])]), { tone: "faint" }));
  out.push(`</g>`);
  out.push(L(open, { tone: "lo" }));
  // scale strip beside the window, one major tick per 5 SOL
  const strip = { x: WIN.x1 + 2, y: FACE_Y, w: 3, d: 0.8, r: 0.4 };
  out.push(S(slab(strip, WIN.z0, WIN.z1 - WIN.z0, 2), { tone: "lo", crease: "none" }));
  const sx = strip.x + strip.w;
  const minor = [];
  const major = [];
  for (let sol = 0; sol <= C.TREASURY_SOL; sol++) {
    const z = WIN.z0 + sol * C.PER_SOL;
    (sol % 5 === 0 ? major : minor).push(k.segment([sx, FACE_Y, z], [sx + (sol % 5 === 0 ? 3.6 : 2), FACE_Y, z], P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(D([at([strip.x + 1.5, FACE_Y + 0.8, WIN.z1 - 1.2]), at([strip.x + 1.5, FACE_Y + 0.8, WIN.z0 + 1.2])], { size: 0.4 }));
  return out.join("");
}
const LEVEL = { x0: WIN.x0, x1: WIN.x1, yb: FACE_Y - RECESS, z0: WIN.z0 };

// the duct between treasury and vault, with a sight slot and the return cock
const DUCT_FACE = C.DUCT.y + C.DUCT.d;
const SLOT = { x0: -152, x1: -118, z0: 10.6, z1: 15.6 };
function duct() {
  const T = C.DUCT;
  const out = [];
  out.push(S(slab({ x: -128, y: -4, w: 8, d: 8, r: 1 }, 0, C.DUCT_Z, 3), { tone: "lo" }));
  out.push(S(slab({ x: -131, y: -6.5, w: 14, d: 13, r: 1.2 }, 0, 0.8, 3), { tone: "lo", crease: "none" }));
  out.push(D([at([-129.5, 5.2, 0.8]), at([-118.5, 5.2, 0.8])], { size: 0.4 }));
  const seam = [-150, -124].map((x) => k.segment([x, DUCT_FACE, C.DUCT_Z], [x, DUCT_FACE, C.DUCT_Z + C.DUCT_H], P)).join("");
  out.push(S(slab(T, C.DUCT_Z, C.DUCT_H, 3, 0.5), { tone: "mid" }));
  // flange collar where the duct leaves the tank
  out.push(S(slab({ x: T.x, y: T.y - 2.5, w: 3, d: T.d + 5, r: 0.8 }, C.DUCT_Z - 2.5, C.DUCT_H + 5, 3, 0.4), { tone: "mid" }));
  out.push(D([[T.x + 1.5, T.y + T.d + 2.5, C.DUCT_Z - 1.2], [T.x + 1.5, T.y + T.d + 2.5, C.DUCT_Z + C.DUCT_H + 1.2]].map(at), { size: 0.45 }));
  // sight slot: a recess on the front face with coins seen sliding through
  const yb = DUCT_FACE - 1.2;
  const open = quad([[SLOT.x0, DUCT_FACE, SLOT.z0], [SLOT.x1, DUCT_FACE, SLOT.z0], [SLOT.x1, DUCT_FACE, SLOT.z1], [SLOT.x0, DUCT_FACE, SLOT.z1]]);
  out.push(`<clipPath id="me-slot"><path d="${open}"/></clipPath><g clip-path="url(#me-slot)">`);
  out.push(`<path class="iso-shade" data-shade="0" d="${quad([[SLOT.x0, yb, SLOT.z0], [SLOT.x1, yb, SLOT.z0], [SLOT.x1, yb, SLOT.z1], [SLOT.x0, yb, SLOT.z1]])}"/>`);
  out.push(`<g data-part="flow"></g>`);
  out.push(`<path class="iso-shade" data-shade="2" d="${quad([[SLOT.x0, yb, SLOT.z0], [SLOT.x0, DUCT_FACE, SLOT.z0], [SLOT.x0, DUCT_FACE, SLOT.z1], [SLOT.x0, yb, SLOT.z1]])}"/>`);
  out.push(`<path class="iso-top" d="${quad([[SLOT.x0, yb, SLOT.z0], [SLOT.x1, yb, SLOT.z0], [SLOT.x1, DUCT_FACE, SLOT.z0], [SLOT.x0, DUCT_FACE, SLOT.z0]])}"/>`);
  out.push(`</g>`);
  out.push(L(open, { tone: "lo" }));
  // the return cock: body, bonnet, stem; the handle is live
  const [cx, cy] = C.COCK;
  const top = C.DUCT_Z + C.DUCT_H;
  out.push(S(slab({ x: cx - 5, y: cy - 5, w: 10, d: 10, r: 1.4 }, top, 2, 3, 0.4), { tone: "mid" }));
  out.push(D(k.corners({ x: cx - 5, y: cy - 5, w: 10, d: 10 }, 1.6).map(([x, y]) => at([x, y, top + 2])), { size: 0.4 }));
  out.push(S(k.cylinder(cx, cy, 3.4, top + 2, 3.2, P, 28, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(cx, cy, 1.3, top + 5.2, 2.2, P, 14), { tone: "mid", crease: "none" }));
  // two stop pins on the bonnet plate mark shut (across) and open (toward the tank)
  out.push(S(k.cylinder(cx + 3.8, cy + 3.8, 0.6, top + 2, 1.6, P, 10), { tone: "mid", crease: "none" }));
  return out.join("") + "";
}
const SLOT_FACE = { y: DUCT_FACE - 1.2, ...SLOT };

function housing() {
  const H = C.HOUSING;
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(H, 2), 0, 6, P)}" style="filter:blur(6px)"/>`];
  // plinth under the housing
  out.push(S(slab(k.insetPlan(H, -2), 0, 3, 6, 0.6), { tone: "lo" }));
  const seams = [6, C.H_TOP - 7].map((z) => k.sideSeam(H, z, P, 6)).join("");
  out.push(S(slab(H, 3, C.H_TOP - 3, 6, 1.2), { tone: "mid", inner: L(seams, { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(H, 3), C.H_TOP, P, 6), { tone: "faint" }));
  out.push(D([[H.x + 4, H.y + 4], [H.x + H.w - 4, H.y + 4], [H.x + 4, H.y + H.d - 4], [H.x + H.w - 4, H.y + H.d - 4]].map(([x, y]) => at([x, y, C.H_TOP])), { size: 0.5 }));
  // rivets along the lower band of the front face
  const rivets = [];
  for (let x = H.x + 8; x <= H.x + H.w - 8; x += 12) rivets.push(at([x, H.y + H.d, 4.6]));
  for (let y = H.y + 8; y <= H.y + H.d - 8; y += 12) rivets.push(at([H.x + H.w, y, 4.6]));
  out.push(D(rivets, { size: 0.4, tone: "lo" }));
  // access panel on the +x end face, held by four screws
  const ex = H.x + H.w;
  out.push(L(quad([[ex, -12, 10], [ex, 12, 10], [ex, 12, 24], [ex, -12, 24]]), { tone: "lo" }));
  out.push(L(quad([[ex, -10.6, 11.4], [ex, 10.6, 11.4], [ex, 10.6, 22.6], [ex, -10.6, 22.6]]), { tone: "faint" }));
  out.push(D([[-9.6, 12.4], [9.6, 12.4], [-9.6, 21.6], [9.6, 21.6]].map(([y, z]) => at([ex, y, z])), { size: 0.45 }));
  return out.join("");
}

function spouts() {
  const out = [];
  const Sp = C.SPOUT;
  C.CX.forEach((cx) => {
    const plan = { x: cx - Sp.w / 2, y: Sp.y, w: Sp.w, d: Sp.d, r: 1 };
    out.push(S(slab({ x: cx - Sp.w / 2 - 1.5, y: Sp.y, w: Sp.w + 3, d: 1.4, r: 0.5 }, Sp.z - 1.5, Sp.h + 3, 2), { tone: "mid" }));
    out.push(S(slab(plan, Sp.z, Sp.h, 3, 0.4), { tone: "mid" }));
    const y = Sp.y + Sp.d;
    out.push(`<path class="iso-shade" data-shade="0" d="${quad([[cx - 7.8, y, Sp.z + 0.8], [cx + 7.8, y, Sp.z + 0.8], [cx + 7.8, y, Sp.z + 3.6], [cx - 7.8, y, Sp.z + 3.6]])}"/>`);
    out.push(L(quad([[cx - 7.8, y, Sp.z + 0.8], [cx + 7.8, y, Sp.z + 0.8], [cx + 7.8, y, Sp.z + 3.6], [cx - 7.8, y, Sp.z + 3.6]]), { tone: "lo" }));
    out.push(D([[cx - Sp.w / 2 - 0.75, Sp.y + 1.4, Sp.z - 0.6], [cx + Sp.w / 2 + 0.75, Sp.y + 1.4, Sp.z - 0.6], [cx - Sp.w / 2 - 0.75, Sp.y + 1.4, Sp.z + Sp.h + 0.6], [cx + Sp.w / 2 + 0.75, Sp.y + 1.4, Sp.z + Sp.h + 0.6]].map(at), { size: 0.4 }));
  });
  return out.join("");
}

function blocks() {
  const out = [];
  C.CX.forEach((cx, i) => {
    const plan = { x: cx - C.BLOCK, y: -C.BLOCK, w: C.BLOCK * 2, d: C.BLOCK * 2, r: 2.5 };
    const seam = k.sideSeam(plan, C.PLATE_Z - 0.6, P, 4);
    out.push(S(slab(plan, C.H_TOP, C.B_TOP - C.H_TOP, 4, 0.8), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
    // the slot the gate plate runs in, on the front face
    const y = C.BLOCK;
    out.push(`<path class="iso-shade" data-shade="0" d="${quad([[cx - 8.6, y, C.PLATE_Z - 0.3], [cx + 8.6, y, C.PLATE_Z - 0.3], [cx + 8.6, y, C.PLATE_Z + C.PLATE_H + 0.3], [cx - 8.6, y, C.PLATE_Z + C.PLATE_H + 0.3]])}"/>`);
    out.push(L(quad([[cx - 8.6, y, C.PLATE_Z - 0.3], [cx + 8.6, y, C.PLATE_Z - 0.3], [cx + 8.6, y, C.PLATE_Z + C.PLATE_H + 0.3], [cx - 8.6, y, C.PLATE_Z + C.PLATE_H + 0.3]]), { tone: "lo" }));
    // milestone number as dots on the front face, above the slot
    const n = i + 1;
    out.push(D(Array.from({ length: n }, (_, j) => at([cx - 7 + j * 2.6, y, C.B_TOP - 2.4])), { size: 0.55, tone: "hi" }));
    out.push(D(k.corners(plan, 3).map(([x, yy]) => at([x, yy, C.B_TOP])), { size: 0.45 }));
    // seat ring and the bore under the column
    out.push(S(k.cylinder(cx, 0, 9.6, C.B_TOP, C.SEAT_TOP - C.B_TOP, P, 48, 0.4), { tone: "mid" }));
    out.push(`<path class="iso-shade" data-shade="0" d="${k.ring(cx, 0, 7.3, C.SEAT_TOP, P, 40)}"/>`);
    out.push(L(k.ring(cx, 0, 7.3, C.SEAT_TOP, P, 40), { tone: "lo" }));
    // lock boss with its keyway
    const [lx, ly] = [cx + C.LOCK[0], C.LOCK[1]];
    out.push(S(k.cylinder(lx, ly, 2.8, C.B_TOP, 1.4, P, 24, 0.3), { tone: "mid" }));
    out.push(L(k.planOutline({ x: lx - 1.4, y: ly - 0.35, w: 2.8, d: 0.7, r: 0.3 }, C.B_TOP + 1.4, P, 2), { tone: "lo" }));
  });
  return out.join("");
}

function rail() {
  const out = [];
  const plan = { x: -108, y: 15.6, w: 196, d: 4.4, r: 1 };
  out.push(S(slab(plan, C.H_TOP, C.DOG_Z - C.H_TOP, 3, 0.3), { tone: "lo" }));
  for (const x of [plan.x, plan.x + plan.w - 3]) out.push(S(slab({ x, y: 15.2, w: 3, d: 5.2, r: 0.6 }, C.H_TOP, 4.4, 2), { tone: "mid" }));
  return out.join("");
}

function dog(i) {
  const cx = C.CX[i];
  const plan = { x: cx - 9.5, y: 16, w: 19, d: 4.2, r: 1 };
  return (
    S(slab(plan, C.DOG_Z, C.DOG_H, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(plan, C.DOG_Z + 2, P, 3), { tone: "faint" }) }) +
    D([at([cx - 6.5, 18.1, C.DOG_Z + C.DOG_H]), at([cx + 6.5, 18.1, C.DOG_Z + C.DOG_H])], { size: 0.45 })
  );
}

function cageBack(i) {
  const cx = C.CX[i];
  const out = [];
  const angles = [VIEW_DEG + 110, VIEW_DEG + 250].map((d) => (d * Math.PI) / 180);
  for (const a of angles) out.push(S(k.cylinder(cx + Math.cos(a) * 8.5, Math.sin(a) * 8.5, 0.85, C.SEAT_TOP, C.CAP_Z - C.SEAT_TOP, P, 12), { tone: "mid", crease: "none" }));
  return out.join("");
}
function cageFront(i) {
  const cx = C.CX[i];
  const out = [];
  const angles = [VIEW_DEG - 40, VIEW_DEG + 40].map((d) => (d * Math.PI) / 180);
  for (const a of byDepth(angles.map((a) => [cx + Math.cos(a) * 8.5, Math.sin(a) * 8.5]))) out.push(S(k.cylinder(a[0], a[1], 0.85, C.SEAT_TOP, C.CAP_Z - C.SEAT_TOP, P, 12), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(cx, 0, 9.6, C.CAP_Z, C.CAP_TOP - C.CAP_Z, P, 48, 0.5), { tone: "mid", inner: L(k.sideArc(cx, 0, 9.6, C.CAP_Z + 1.2, P, 32), { tone: "faint" }) }));
  out.push(S(k.cylinder(cx, 0, 2.3, C.CAP_TOP, 1.6, P, 20), { tone: "mid" }));
  out.push(D([0, 1, 2, 3].map((n) => ((VIEW_DEG + 45 + n * 90) * Math.PI) / 180).map((a) => at([cx + Math.cos(a) * 6.4, Math.sin(a) * 6.4, C.CAP_TOP])), { size: 0.45 }));
  return out.join("");
}

function trayBack() {
  const T = C.TRAY;
  const out = [];
  out.push(S(slab(T, 0, C.TRAY_FLOOR, 6, 0.4), { tone: "lo" }));
  out.push(S(slab({ x: T.x, y: T.y, w: T.w, d: 2, r: 0.8 }, C.TRAY_FLOOR, 5.8, 3, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: T.x, y: T.y, w: 2, d: T.d, r: 0.8 }, C.TRAY_FLOOR, 5.8, 3, 0.3), { tone: "mid" }));
  // faint lanes on the floor, one per milestone
  out.push(L(C.CX.slice(1).map((cx) => k.lineOnTop([cx - 24, T.y + 2], [cx - 24, T.y + T.d - 2], C.TRAY_FLOOR, P)).join(""), { tone: "faint" }));
  return out.join("");
}
function trayFront() {
  const T = C.TRAY;
  const out = [];
  out.push(S(slab({ x: T.x + T.w - 2, y: T.y, w: 2, d: T.d, r: 0.8 }, C.TRAY_FLOOR, 5.8, 3, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: T.x, y: T.y + T.d - 2, w: T.w, d: 2, r: 0.8 }, C.TRAY_FLOOR, 5.8, 3, 0.3), { tone: "mid" }));
  out.push(D(C.CX.map((cx) => at([cx, T.y + T.d - 1, C.TRAY_FLOOR + 5.8])), { size: 0.4 }));
  // two finger pulls on the front wall
  for (const x of [T.x + 26, T.x + T.w - 34]) {
    out.push(S(slab({ x, y: T.y + T.d, w: 8, d: 2.2, r: 0.8 }, 2.6, 2.2, 3, 0.3), { tone: "mid" }));
    out.push(D([at([x + 1.6, T.y + T.d + 2.2, 4.8]), at([x + 6.4, T.y + T.d + 2.2, 4.8])], { size: 0.35 }));
  }
  return out.join("");
}

// ---- Assemble ------------------------------------------------------------
const START = { funded: 1, paid: [0, 0, 0, 0], ext: C.PLATE_SHUT, key: C.CX[0] + C.LOCK[0] };
const part = (name, inner, transform) => `<g data-part="${name}"${transform ? ` transform="${transform}"` : ""}>${inner}</g>`;

const body = [
  bench(),
  tank(),
  tankWindow(),
  duct(),
  part("cock", LIVE.cockSvg(90)),
  housing(),
  spouts(),
  blocks(),
  rail(),
  ...[1, 2, 3].map((i) => part(`dog-${i}`, dog(i))),
  ...C.CX.map((_, i) => part(`plate-${i}`, LIVE.plateSvg(i, START.ext))),
  ...C.CX.map((_, i) => [cageBack(i), part(`column-${i}`, LIVE.columnSvg(i, C.COINS[i])), cageFront(i), part(`flag-${i}`, LIVE.flagSvg(i, 0, false))].join("")),
  part("key", LIVE.keySvg(START.key, 0, 0)),
  trayBack(),
  ...C.CX.map((_, i) => part(`stacks-${i}`, "")),
  ...C.CX.map((_, i) => part(`coin-${i}`, "")),
  trayFront(),
];

const LABEL =
  "A sequential release vault on a bench. On the left a treasury tank with a sight window feeds a long vault through a duct with a return cock. The vault carries four coin columns, one per milestone, each standing over a sliding gate. A contractor's flag on each column, a council key in the current gate's lock, and a row of interlock dogs that only clear a gate once the gate before it has paid out. Released coins drop from a spout into the contractor's tray; on cancel the cock opens and every unreleased coin runs back to the treasury.";

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body });

const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");

const DATA = { P, C, VIEW_DEG, AMOUNTS, TREASURY, COIN, SOL, LEVEL, SLOT: SLOT_FACE, START };

const live = `
${modelSource}
const { P, C, VIEW_DEG, AMOUNTS, TREASURY, COIN, SOL, LEVEL, SLOT } = ${JSON.stringify(DATA)};
${LIVE_PARTS}
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (name) => svg.querySelector('[data-part="' + name + '"]');
const N = C.CX.length;
const els = {
  column: C.CX.map((_, i) => $("column-" + i)), plate: C.CX.map((_, i) => $("plate-" + i)), flag: C.CX.map((_, i) => $("flag-" + i)),
  stacks: C.CX.map((_, i) => $("stacks-" + i)), coin: C.CX.map((_, i) => $("coin-" + i)), dog: [null, $("dog-1"), $("dog-2"), $("dog-3")],
  key: $("key"), cock: $("cock"), level: $("level"), flow: $("flow"),
};

// ---- the program's state, and the parts that follow it ----
let treasury = TREASURY, escrow = null, refusal = null, refusalAt = 0;
const fresh = () => ({ funded: 0, paid: [0, 0, 0, 0], drained: [0, 0, 0, 0], ext: [C.PLATE_SHUT, C.PLATE_SHUT, C.PLATE_SHUT, C.PLATE_SHUT], flag: [0, 0, 0, 0], dog: [1, 0, 0, 0], shake: [0, 0, 0, 0], keyX: C.CX[0] + C.LOCK[0], keyTurn: 0, cock: 90, flowAt: 0, flowDir: 0 });
let v = fresh();

const fmt = (lamports) => (lamports / SOL).toFixed(2);
const coinsOf = (i) => AMOUNTS[i] / COIN;
function act(name, index) {
  let result;
  if (name === "new") { treasury = TREASURY; escrow = null; v = fresh(); refusal = null; draw(); describe(); return true; }
  if (name === "execute") {
    if (escrow) return turnDown(-1, "InvalidState");
    result = execute(treasury, AMOUNTS);
    if (!result.ok) return turnDown(-1, result.error);
    treasury = result.treasury; escrow = result.escrow; describe(); run(); return true;
  }
  if (!escrow) return turnDown(-1, "InvalidState");
  const i = index ?? Math.max(0, currentOf(escrow));
  if (name === "submit") result = submit(escrow, i);
  if (name === "approve") result = approve(escrow, i);
  if (name === "reject") result = reject(escrow, i);
  if (name === "cancel") result = cancel(escrow);
  if (!result.ok) return turnDown(name === "cancel" || escrow.status !== "Active" ? -1 : i, result.error);
  escrow = result.escrow;
  if (name === "cancel") treasury += result.moved;
  refusal = null; describe(); run(); return true;
}
function turnDown(i, error) {
  refusal = (i >= 0 ? "M" + (i + 1) + " refused · " : (escrow ? escrow.status.toLowerCase() + " · refused · " : "refused · ")) + error;
  refusalAt = performance.now();
  if (i > 0) v.shake[i] = 1;
  describe(); run();
  return false;
}

// ---- motion ----
const follow = (x, target, dt, tau, calm) => (calm ? target : Math.abs(target - x) < 1e-3 ? target : x + (target - x) * (1 - Math.exp(-dt / tau)));
const toward = (x, target, rate, dt, calm) => (calm ? target : x < target ? Math.min(target, x + rate * dt) : Math.max(target, x - rate * dt));
function step(dt, calm) {
  const ms = escrow ? escrow.milestones : null;
  const status = escrow ? escrow.status : null;
  v.funded = toward(v.funded, escrow ? 1 : 0, 0.7, dt, calm);
  const filled = v.funded >= 1;
  // which lock the key sits in: the current milestone, once the dog in front of its gate has cleared
  let target = Math.round((v.keyX - C.LOCK[0] - C.CX[0]) / 48);
  if (escrow && status === "Active") {
    const cur = currentOf(escrow);
    if (cur >= 0 && v.dog[cur] > 0.98 && (cur === 0 || v.paid[cur - 1] >= coinsOf(cur - 1))) target = cur;
  }
  const ki = Math.round((v.keyX - C.LOCK[0] - C.CX[0]) / 48);
  for (let i = 0; i < N; i++) {
    const n = coinsOf(i);
    const released = ms && ms[i].state === "Released";
    v.flag[i] = follow(v.flag[i], ms && ms[i].state === "Submitted" && status === "Active" ? 1 : 0, dt, 0.16, calm);
    const opening = released && (v.ext[i] > C.PLATE_SHUT + 0.5 || (ki === i && v.keyTurn > 85));
    v.ext[i] = follow(v.ext[i], opening ? C.PLATE_OPEN : C.PLATE_SHUT, dt, 0.18, calm);
    v.paid[i] = toward(v.paid[i], released && v.ext[i] > C.PLATE_OPEN - 1 ? n : 0, 7, dt, calm);
    const draining = status === "Cancelled" && !released && v.cock > 175 && filled;
    v.drained[i] = toward(v.drained[i], draining ? n : 0, 9, dt, calm);
    if (i > 0) v.dog[i] = follow(v.dog[i], ms && ms[i - 1].state === "Released" && v.paid[i - 1] >= coinsOf(i - 1) ? 1 : 0, dt, 0.2, calm);
    v.shake[i] = calm ? 0 : Math.max(0, v.shake[i] - dt * 1.6);
  }
  const turning = ms && ms[ki] && ms[ki].state === "Released" && v.paid[ki] < coinsOf(ki) && target === ki;
  v.keyTurn = follow(v.keyTurn, turning ? 90 : 0, dt, 0.14, calm);
  if (v.keyTurn < 2) v.keyX = follow(v.keyX, C.CX[target] + C.LOCK[0], dt, 0.3, calm);
  v.cock = follow(v.cock, status === "Cancelled" ? 180 : escrow && !filled ? 180 : 90, dt, 0.18, calm);
  const inflow = escrow && !filled;
  const outflow = v.drained.some((d, i) => d > 0 && d < coinsOf(i));
  v.flowDir = inflow ? 1 : outflow ? -1 : 0;
  v.flowAt += dt * (calm ? 0 : 1);
}
function busy() {
  if (!escrow) return v.funded > 0;
  const ms = escrow.milestones;
  if (v.funded < 1) return true;
  for (let i = 0; i < N; i++) {
    const n = coinsOf(i);
    const released = ms[i].state === "Released";
    if (Math.abs(v.flag[i] - (ms[i].state === "Submitted" && escrow.status === "Active" ? 1 : 0)) > 1e-3) return true;
    if (released && (v.paid[i] < n || v.ext[i] < C.PLATE_OPEN - 1e-3)) return true;
    if (escrow.status === "Cancelled" && !released && v.drained[i] < n) return true;
    if (v.shake[i] > 0) return true;
    if (i > 0 && Math.abs(v.dog[i] - (ms[i - 1].state === "Released" ? 1 : 0)) > 1e-3) return true;
  }
  if (v.keyTurn > 1e-3) return true;
  const cur = currentOf(escrow);
  if (cur >= 0 && Math.abs(v.keyX - (C.CX[cur] + C.LOCK[0])) > 1e-3) return true;
  if (Math.abs(v.cock - (escrow.status === "Cancelled" ? 180 : 90)) > 1e-3) return true;
  return false;
}

// ---- drawing ----
const faceQuad = (x0, x1, y, z0, z1) => pathOf([iso([x0, y, z0], P), iso([x1, y, z0], P), iso([x1, y, z1], P), iso([x0, y, z1], P)], true);
let lastKey = "";
function draw() {
  const solFunded = v.funded;
  let landedPaid = 0, landedBack = 0;
  for (let i = 0; i < N; i++) {
    const n = coinsOf(i);
    const landed = Math.floor(v.paid[i] + 1e-6);
    const back = Math.floor(v.drained[i] + 1e-6);
    landedPaid += landed; landedBack += back;
    const inColumn = Math.max(0, n * solFunded - v.paid[i] - v.drained[i]);
    els.column[i].innerHTML = columnSvg(i, inColumn);
    els.plate[i].innerHTML = plateSvg(i, v.ext[i]);
    els.flag[i].innerHTML = flagSvg(i, v.flag[i], v.flag[i] > 0.02);
    const a = Math.min(landed, C.STACK_MAX), b = Math.max(0, landed - C.STACK_MAX);
    els.stacks[i].innerHTML = stackSvg(C.CX[i] - C.STACK_DX, a) + stackSvg(C.CX[i] + C.STACK_DX, b);
    const phase = v.paid[i] - landed;
    if (phase > 1e-3 && landed < n) {
      const [x, y, z] = coinAt(i, landed, phase);
      els.coin[i].innerHTML = solidSvg(cylinder(x, y, C.COIN_R, z, C.COIN_H, P, 40), { tone: "hi", crease: "lo" });
    } else els.coin[i].innerHTML = "";
    if (i > 0) {
      const wobble = v.shake[i] > 0 ? Math.sin(v.shake[i] * 40) * 1.4 * v.shake[i] : 0;
      els.dog[i].setAttribute("transform", translateAlong(P, [C.DOG_CLEAR * v.dog[i] + wobble, 0, 0]));
    }
  }
  const lift = Math.min(9, Math.abs(v.keyX - (C.CX[Math.round((v.keyX - C.LOCK[0] - C.CX[0]) / 48)] + C.LOCK[0])) * 0.9);
  els.key.innerHTML = keySvg(v.keyX, lift, v.keyTurn);
  els.cock.innerHTML = cockSvg(v.cock);
  // treasury level behind the sight window, one band per SOL
  const total = AMOUNTS.reduce((s, a) => s + a, 0);
  const treasuryNow = TREASURY - total * solFunded + landedBack * COIN;
  const sol = treasuryNow / SOL;
  const top = LEVEL.z0 + sol * C.PER_SOL;
  let level = '<path class="iso-shade" data-shade="1" d="' + faceQuad(LEVEL.x0, LEVEL.x1, LEVEL.yb, LEVEL.z0 - 1, top) + '"/>';
  let bands = "";
  for (let s = 1; s < sol - 0.05; s++) bands += pathOf([iso([LEVEL.x0, LEVEL.yb, LEVEL.z0 + s * C.PER_SOL], P), iso([LEVEL.x1, LEVEL.yb, LEVEL.z0 + s * C.PER_SOL], P)]);
  level += lineSvg(bands, { tone: "faint" }) + lineSvg(pathOf([iso([LEVEL.x0, LEVEL.yb, top], P), iso([LEVEL.x1, LEVEL.yb, top], P)]), { tone: "hi" });
  els.level.innerHTML = level;
  // coins sliding through the duct's sight slot
  let flow = "";
  if (v.flowDir) {
    const span = SLOT.x1 - SLOT.x0 + 12;
    for (let j = 0; j < 5; j++) {
      const u = ((v.flowAt * 40 + j * span / 5) % span);
      const x = v.flowDir > 0 ? SLOT.x0 - 6 + u : SLOT.x1 + 6 - u;
      flow += '<path class="iso-top" d="' + faceQuad(x - 2.6, x + 2.6, SLOT.y, SLOT.z0 + 0.6, SLOT.z0 + 2.4) + '"/>';
      flow += lineSvg(faceQuad(x - 2.6, x + 2.6, SLOT.y, SLOT.z0 + 0.6, SLOT.z0 + 2.4), { tone: "hi" });
    }
  }
  els.flow.innerHTML = flow;
  // readout: the phase word and the numbers come from the same instant
  const lockedCoins = Math.round(total / COIN * solFunded) - landedPaid - landedBack;
  let word;
  const pouring = escrow && C.CX.findIndex((_, i) => escrow.milestones[i].state === "Released" && v.paid[i] < coinsOf(i));
  if (refusal && performance.now() - refusalAt < 2200) word = refusal;
  else if (!escrow && v.funded <= 0) word = "proposal passed · treasury " + fmt(treasuryNow) + " SOL";
  else if (v.funded < 1) word = "executing";
  else if (pouring >= 0) word = "M" + (pouring + 1) + " paying out";
  else if (escrow.status === "Cancelled" && landedBack < Math.round(escrow.returned / COIN)) word = "returning";
  else if (escrow.status === "Active") { const cur = currentOf(escrow); word = "M" + (cur + 1) + " " + escrow.milestones[cur].state.toLowerCase(); }
  else word = escrow.status.toLowerCase();
  const text = (!escrow && v.funded <= 0) || (refusal && performance.now() - refusalAt < 2200) ? word : word + " · locked\u00a0" + fmt(lockedCoins * COIN) + " · paid\u00a0" + fmt(landedPaid * COIN) + " · back\u00a0" + fmt(landedBack * COIN) + "\u00a0SOL";
  if (readout.textContent !== text) readout.textContent = text;
}
function describe() {
  let text;
  if (!escrow) text = "Proposal passed, not executed. Treasury holds " + fmt(treasury) + " SOL.";
  else {
    const states = escrow.milestones.map((m, i) => "milestone " + (i + 1) + " " + m.state).join(", ");
    text = "Escrow " + escrow.status + ": " + states + ". Locked " + fmt(lockedOf(escrow)) + ", paid to contractor " + fmt(escrow.released) + ", returned to treasury " + fmt(escrow.returned) + " SOL.";
  }
  if (refusal) text = refusal + ". " + text;
  stage.setAttribute("aria-valuetext", text);
}

// ---- tour: a happy path with one rejection, then a cancel ----
const TOUR = [
  [1.6, "execute"], [2.4, "submit"], [1.6, "approve"], [3.2, "submit"], [1.5, "reject"], [1.6, "submit"], [1.5, "approve"],
  [3.6, "submit"], [1.4, "approve"], [3.2, "submit"], [1.4, "approve"], [5.2, "new"],
  [1.4, "execute"], [2.4, "submit"], [1.5, "approve"], [3.2, "submit"], [1.2, "submit3"], [2.0, "cancel"], [4.6, "submit"], [4.0, "new"],
];
let touring = !still.matches, tourStep = 0, tourClock = 0, idleTimer = 0, frame = 0, last = 0, visible = false;
function tourTick(dt) {
  tourClock += dt;
  const [wait, name] = TOUR[tourStep];
  if (tourClock < wait || busy()) return;
  tourClock = 0;
  tourStep = (tourStep + 1) % TOUR.length;
  if (name === "submit3") act("submit", 3);
  else act(name);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) tourTick(dt);
  step(dt, calm);
  draw();
  const settled = !touring && !busy() && !(refusal && performance.now() - refusalAt < 2300);
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }
function hold() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!still.matches) { touring = true; tourClock = 0; run(); } }, 3600);
  run();
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);

// pointer: a click on a chamber submits, or approves once submitted; on the cock, cancels
const targets = () => {
  const box = svg.getBoundingClientRect();
  const s = box.width / ${WIDTH};
  const pt = (p) => { const [x, y] = iso(p, P); return [box.left + x * s, box.top + y * s]; };
  return [
    ...C.CX.map((cx, i) => ({ kind: "chamber", i, at: pt([cx, 0, C.B_TOP + 16]) })),
    { kind: "cock", at: pt([C.COCK[0], C.COCK[1], C.DUCT_Z + C.DUCT_H + 6]) },
    { kind: "tank", at: pt([C.TANK.x + 20, 0, 34]) },
  ];
};
const nearest = (event) => {
  let best = null, bestD = Infinity;
  for (const t of targets()) { const d = Math.hypot(event.clientX - t.at[0], event.clientY - t.at[1]); if (d < bestD) { best = t; bestD = d; } }
  return best;
};
stage.addEventListener("pointerdown", (event) => {
  hold();
  const t = nearest(event);
  if (!escrow || escrow.status !== "Active") { act("new"); act("execute"); return; }
  if (t.kind === "cock") act("cancel");
  else if (t.kind === "tank") act("cancel");
  else {
    const m = escrow.milestones[t.i];
    if (m.state === "Submitted") act(event.shiftKey ? "reject" : "approve", t.i);
    else act("submit", t.i);
  }
});
stage.addEventListener("pointermove", (event) => {
  const t = nearest(event);
  stage.style.cursor = t ? "pointer" : "";
});
stage.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const map = { s: "submit", a: "approve", r: "reject", c: "cancel" };
  if (map[key]) { event.preventDefault(); hold(); if (!escrow) act("execute"); act(map[key]); return; }
  if (key === "n" || key === "home") { event.preventDefault(); hold(); act("new"); act("execute"); return; }
  if (key === "escape") { event.preventDefault(); hold(); return; }
});
if (still.matches) { act("execute"); v.funded = 1; }
describe();
draw();
`;

const PHONE_CSS = `<style>
.iso-stage{outline:none;touch-action:pan-y}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
@media (max-width:560px){
  .iso-plate{overflow:hidden}
  .iso-plate .iso-stage{margin:0 -7%}
  .iso-plate-corner[data-corner="readout"]{left:0;white-space:normal;text-align:right;line-height:1.45}
  .iso-plate-corner[data-corner="hint"]{bottom:36px}
}
</style>`;
const body2 = PHONE_CSS + k.plateHtml({
  fig: "Fig 2",
  title: "Milestone escrow",
  hint: "Click a chamber · S A R C",
  readout: `proposal passed · treasury ${(TREASURY / SOL).toFixed(2)} SOL`,
  keys: [
    { mark: "lit", label: "Contractor's flag: milestone submitted" },
    { mark: "raised", label: "Coins: 0.25 SOL each, 9 SOL in four milestone columns" },
    { mark: "edge", label: "Gate plates: each opens only once the dog in front of it has cleared" },
  ],
  caption:
    "Executing the proposal moves 9 SOL from the treasury into the escrow in one step, split into four milestone columns (the program allows up to eight). The contractor raises a flag to submit; the council's key opens only that gate and pays exactly that column into the tray, or rejects it back to pending. Cancel opens the return cock and every unreleased coin goes back to the treasury: the vault has no other exits.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Milestone escrow. Click a chamber to submit or approve it (Shift-click rejects). Keys: S submit, A approve, R reject, C cancel, N start again." aria-valuemin="0" aria-valuemax="4" aria-valuenow="0">${svg}</div>`,
});

const file = theme === "light" ? "milestone-escrow-light.html" : "milestone-escrow.html";
writeFileSync(join(HERE, file), k.pageHtml({ title: "Milestone escrow", theme, body: body2, script: kitScript() + live }));
console.log("wrote", file);
