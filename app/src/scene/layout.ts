/**
 * Where everything stands on the desk, in model units (about 1 cm each).
 * x = depth toward the viewer's right, y = width toward the viewer's left, z = up.
 */

export const DESK = { x1: 232, y1: 260, h: 4, r: 8 } as const;
export const TOP = DESK.h;

export const JAR = { x: 30, y: 166, r: 16, body: 38 } as const;
export const PRESS = { x0: 8, x1: 46, y0: 90, y1: 130 } as const;
export const SCALE = { x: 128, y: 110, arm: 40, pivot: TOP + 58, hang: 27 } as const;
export const QUORUM = { x: 164, y: 130, height: 34 } as const;
export const VAULT = { x0: 150, x1: 192, y0: 18, y1: 62, height: 56 } as const;
export const COUNCIL = { x: 197, y: 8 } as const;
export const BUILDER = { x: 214, y: 84 } as const;
export const TRAY = { x0: 186, x1: 208, y0: 96, y1: 120 } as const;
export const PLACARD = { x: 56, y0: 2, y1: 78, z0: TOP + 14, z1: TOP + 54 } as const;
export const WHALE_PLINTH = { x0: 12, x1: 76, y0: 222, y1: 254 } as const;
export const WHALE_CHIPS = { x0: 28, y0: 190, size: 28 } as const;

/** Krill figurines are modelled small and drawn at this scale so they read on the desk. */
export const KRILL_SCALE = 1.45;

/** Eleven krill in two rows along the front-left edge (row A behind row B). */
export const KRILL_SLOTS: readonly { x: number; y: number }[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ x: 98 + i * 24, y: 198 })),
  ...[0, 1, 2, 3, 4].map((i) => ({ x: 110 + i * 24, y: 234 })),
];

/** The mouth of the hopper (chips go in) and the end of the chute (tokens come out). */
export const HOPPER_MOUTH: V3 = [27, 110, TOP + 62];
export const CHUTE_END: V3 = [76, 110, TOP + 6];
export const VAULT_SLOT: V3 = [171, 40, TOP + VAULT.height];
export const JAR_SLOT: V3 = [JAR.x, JAR.y, TOP + JAR.body + 15];

/** The envelope the frame is fitted to. */
export const SIZE: V3 = [DESK.x1, DESK.y1, 70];
