/**
 * Types for the globals of the vendored Colorfigures engine
 * (`public/colorfigures/core.js`, loaded as a classic script before the app).
 * Only the parts this figure uses are declared.
 */

type V2 = [number, number];
type V3 = [number, number, number];
interface Pal {
  l: string;
  m: string;
  d: string;
}
type PalName = "mustard" | "tomato" | "mint" | "cobalt" | "blush";
type Shade = (n: V3, m: Pal) => string;
type Plane = (uv: V2) => V3;
interface DepthPart {
  at: V3;
  svg: string;
}

declare const PALS: Record<PalName, Pal>;
declare const METAL: Pal;
declare const CLEAR: Pal;
declare const CERAMIC: Pal;
declare const DARK: Pal;
declare const BOARD: Pal;
declare const WOOD: Pal;
declare const INK: string;
declare const SHADOW: string;
declare let INK_K: number;

declare function P(x: number, y: number, z: number): V2;
declare function Dv(x: number, y: number, z: number): V2;
declare function depthOf(p: V3): number;
declare function byDepth(parts: ReadonlyArray<DepthPart | null | false | undefined>): string;
declare function f(v: number): string;
declare function pd(pts: readonly V3[], close?: boolean): string;
declare function sp(pts: readonly V2[]): string;
declare function hull(pts: readonly V2[]): V2[];

declare function arcUV(cu: number, cv: number, r: number, a0: number, a1: number, n?: number): V2[];
declare function rrUV(u0: number, v0: number, u1: number, v1: number, r: number, n?: number): V2[];
declare function rectUV(u0: number, v0: number, u1: number, v1: number): V2[];
declare function ellUV(cu: number, cv: number, ru: number, rv: number, n?: number): V2[];
declare function PX(x: number): Plane;
declare function PY(y: number): Plane;
declare function PZ(z: number): Plane;
declare function on(plane: Plane, uv: readonly V2[]): V3[];

declare function norm(a: V3): V3;
declare function tone(n: V3, m: Pal): string;
declare function toneI(n: V3, m: Pal): string;
declare function mix(a: string, b: string, t: number): string;
declare function matOf(hex: string): Pal;
declare function ease(t: number): number;

declare function ink(d: string, w?: number): string;
declare function fill(d: string, c: string, extra?: string): string;
declare function face(d: string, c: string): string;
declare function shape(pts: readonly V3[], c: string, w?: number): string;
declare function line(pts: readonly V3[], w?: number): string;
declare function loft(A: readonly V3[], B: readonly V3[], colour: (n: V3) => string, flip?: boolean): string;
declare function hullInk(pts: readonly V3[], w?: number): string;
declare function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: Pal, shade?: Shade, w?: number): string;
declare function extrude(profile: readonly V2[], x0: number, x1: number, m: Pal, shade?: Shade): string;
declare function cyl(x: number, y: number, z0: number, z1: number, r: number, m: Pal, shade?: Shade, w?: number, n?: number): string;
declare function cylX(x0: number, x1: number, y: number, z: number, r: number, m: Pal, shade?: Shade, w?: number, n?: number): string;
declare function rod(a: V3, b: V3, r: number, m: Pal, shade?: Shade, w?: number, r1?: number, n?: number): string;
declare function txM(o: V2, U: V2, V: V2): string;
declare function tx(x: number, y: number, z: number, str: string, size: number, col?: string, weight?: number): string;
declare function txY(x: number, y: number, z: number, str: string, size: number, col?: string, weight?: number): string;
declare function castShadow(pts: readonly V3[], z0?: number, clip?: readonly V3[] | null): string;
declare function boardTop(x0: number, y0: number, x1: number, y1: number, h?: number, r?: number): V3[];
declare function board(x0: number, y0: number, x1: number, y1: number, h?: number, r?: number, m?: Pal): string;
declare function act(name: string, inner: string, data?: string): string;
declare function tag(p3: V3, dx: number, dy: number, text: string, on?: boolean): string;
declare function clipTo(pts3: readonly V3[], inner: string): string;

interface FigureUI<S> {
  st: S;
  render(): void;
  animate(step: (dt: number) => boolean): void;
  flash(text: string, ms?: number): void;
}
interface FigureChoice<S> {
  label: string;
  onClick: (st: S, ui: FigureUI<S>) => void;
  current?: boolean;
  disabled?: boolean;
  why?: string;
}
type FigureButton<S> =
  | { label: string; onClick: (st: S, ui: FigureUI<S>) => void }
  | { label: string; choices: (st: S) => FigureChoice<S>[] };
interface FigureStat {
  label: string;
  value: string;
  small?: boolean;
}
interface FigureConfig<S> {
  fig: string;
  title: string;
  hint?: string;
  size: V3;
  center?: V2;
  palette?: PalName;
  state: S;
  scene: (st: S, m: Pal) => string;
  buttons?: FigureButton<S>[];
  buttonsLabel?: string;
  stats?: (st: S) => ReadonlyArray<FigureStat | false | null | undefined>;
  credit?: boolean;
  acts?: Record<string, (st: S, el: SVGGElement, ui: FigureUI<S>) => void>;
  params?: (st: S, q: URLSearchParams) => void;
}
declare function mountFigure<S extends { pal: PalName }>(cfg: FigureConfig<S>): FigureUI<S>;
