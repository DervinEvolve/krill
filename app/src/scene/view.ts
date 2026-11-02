/** A drawn object: its SVG, where it sorts in depth, and the outline its shadow is cast from. */
export interface Drawn {
  at: V3;
  svg: string;
  shadow?: V3[];
  /** See-through objects cast a lighter shadow. */
  glass?: boolean;
}

/** Transient poses that only exist while an animation plays. */
export interface Motion {
  crank: number;
  pressing: number;
  counter: [string, string] | null;
  drawers: number[];
  flags: number[];
  key: number;
  stamp: number;
}

/** Something in the air: a coin stack, a chip stack, the whale's chip block, or a token stack. */
export interface Flyer {
  kind: "coins" | "chips" | "block" | "tokens";
  at: V3;
  amount: number;
}
