/* Pixel art authored as string maps, pre-rendered to offscreen canvases.
   Everything in the world is monochrome — except the raccoon. */

export type Palette = Record<string, string>;

export function makeSprite(rows: string[], pal: Palette): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === "." || ch === " ") continue;
      const col = pal[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** White silhouette (used for damage flash). */
export function flashVariant(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ------------------------------------------------------------------ */
/*  THE RACCOON — the only colourful being                             */
/* ------------------------------------------------------------------ */

export const RACCOON_PAL: Palette = {
  K: "#3b2419", // outline
  B: "#ff9e58", // body orange
  b: "#e37a3a", // body shade
  C: "#fff2d9", // cream
  V: "#7a52c9", // mask violet
  P: "#ff7fa0", // ear pink
  W: "#ffffff", // eye white
  E: "#241311", // pupil / nose
  T: "#2fa8a0", // scarf teal
};

const R_HEAD = [
  "................",
  "...KK......KK...",
  "..KPPK....KPPK..",
  "..KBBK....KBBK..",
  "..KBBBKKKKBBBK..",
  ".KBBBBBBBBBBBBK.",
  ".KBVVVBBBBVVVBK.",
  ".KBVWEBBBBWEVBK.",
  ".KBVVCCCCECCVVBK",
  "..KTTTTTTTTTTK..",
];

const R_IDLE_A = [
  ...R_HEAD,
  ".KVCKBBCCBBBK...",
  ".KVVKBCCCBBBK...",
  "..KKKBCCCBBBK...",
  ".....KBK.KBK....",
  "................",
];
const R_IDLE_B = [
  ...R_HEAD,
  ".KCVKBBCCBBBK...",
  ".KVVKBCCCBBBK...",
  "..KKKBCCCBBBK...",
  ".....KBBKBK.....",
  "................",
];
const R_RUN_A = [
  ...R_HEAD,
  ".KVCKBBCCBBBK...",
  ".KVVKBCCCBBBK...",
  "..KKKBCCCBBBK...",
  "....KBK...KBK...",
  "................",
];
const R_RUN_B = [
  ...R_HEAD,
  ".KCVKBBCCBBBK...",
  ".KVVKBCCCBBBK...",
  "..KKKBCCCBBBK...",
  "......KK.KK.....",
  "................",
];
const R_JUMP = [
  ...R_HEAD,
  ".KVCKBBCCBBBK...",
  ".KVVKBCCCBBBK...",
  "..KKKBCCCBBBK...",
  "....KBBK.KBBK...",
  "................",
];

/* ------------------------------------------------------------------ */
/*  Enemies — pure ink                                                 */
/* ------------------------------------------------------------------ */

const INK_PAL: Palette = {
  K: "#0a0a0a",
  D: "#191919",
  d: "#2e2e2e",
  W: "#f4f4f4",
  E: "#0a0a0a",
  G: "#8f8f8f",
};

const SLIME_A = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......KKKK......",
  "....KKDDDDKK....",
  "...KDDDDDDDDK...",
  "..KDDDDDDDDDDK..",
  "..KDWWDKDDWWDK..",
  "..KDWEDKDDWEDK..",
  "..KDDDDDDDDDDK..",
  "..KDdDDDDDDdDK..",
  ".KDDKDDDDKDDDK..",
  "..KK..KK..KK....",
  "................",
];
const SLIME_B = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....KKKKKK.....",
  "...KKDDDDDDKK...",
  "..KDDDDDDDDDDK..",
  "..KDWWDKDDWWDK..",
  "..KDWEDKDDWEDK..",
  "..KDdDDDDDDdDK..",
  ".KDDDDDDDDDDDK..",
  ".KKKKKKKKKKKKK..",
  "................",
];

const CROW_A = [
  "................",
  "................",
  "....KK..........",
  "...KDDKKKKKK....",
  "..KDDDDDDDDDK...",
  ".KDDKDDDDDDDKKW.",
  ".KDKEDDDDDDDKKW.",
  "..KDDDDDDDDDKK..",
  "..KKDDDDDDKK....",
  "...KKDDDDKKK....",
  "....KKDDKKK.....",
  "......KKKK......",
  ".......KK.......",
  "................",
  "................",
  "................",
];
const CROW_B = [
  "................",
  "................",
  "....KK....KK....",
  "...KDDKKKKDDK...",
  "..KDDDDDDDDDKK..",
  ".KDDKDDDDDDDKKW.",
  ".KDKEDDDDDDDKKW.",
  "..KDDDDDDDDDK...",
  "...KKDDDDDDKK...",
  "....KKDDDDKK....",
  ".....KKDDKK.....",
  "......KKKK......",
  ".......KK.......",
  "................",
  "................",
  "................",
];

/* ------------------------------------------------------------------ */
/*  Pickups & HUD                                                      */
/* ------------------------------------------------------------------ */

const PICK_PAL: Palette = {
  K: "#161616",
  R: "#f6f6f6",
  S: "#7a7a7a",
  N: "#0d0d0d",
  W: "#ffffff",
  G: "#8f8f8f",
  L: "#d8d8d8",
  H: "#b5b5b5",
};

const RICE = [
  "................",
  ".......KK.......",
  "......KRRK......",
  ".....KRRRRK.....",
  ".....KRSRRK.....",
  "....KRRRRRRK....",
  "....KRRSRRRK....",
  "...KRRRRRRRRK...",
  "...KRRRSRRRRK...",
  "..KRRRRRRRRRRK..",
  "..KRRSRRRSRRRK..",
  "..KNNNNNNNNNNK..",
  "..KNNNNNNNNNNK..",
  "...KKKKKKKKKK...",
  "................",
  "................",
];

const MILK = [
  "................",
  "....KKKKKKKK....",
  "....KGGGGGGK....",
  "....KKKKKKKK....",
  ".....KWWWWK.....",
  "....KWWWWWWK....",
  "...KWWWWWWWWK...",
  "...KWWWWWWWWK...",
  "...KWLLLLLLWK...",
  "...KWLLHHLLWK...",
  "...KWLLLLLLWK...",
  "...KWWWWWWWWK...",
  "...KWWWWWWWWK...",
  "...KWWWWWWWWK...",
  "....KKKKKKKK....",
  "................",
];

const STAR = [
  ".......KK.......",
  "......KWWK......",
  "......KWWK......",
  ".....KWWWWK.....",
  "....KWWWWWWK....",
  "KKKKWWWWWWWWKKKK",
  ".KWWWWWWWWWWWWK.",
  "..KWWWWWWWWWWK..",
  "...KKWWWWWWKK...",
  "...KWWWWWWWWK...",
  "..KWWWK..KWWWK..",
  ".KWWWWK..KWWWWK.",
  ".KWWWK....KWWWK.",
  "..KKK......KKK..",
  "................",
  "................",
];

const HEART_FULL = [
  "................",
  ".KKKK...KKKK....",
  "KWWWWKKWWWWK....",
  "KWWWWWWWWWWWK...",
  "KWWWWWWWWWWWK...",
  ".KWWWWWWWWWK....",
  "..KWWWWWWWK.....",
  "...KWWWWWK......",
  "....KWWWK.......",
  ".....KWK........",
  "......K.........",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const HEART_PAL_EMPTY: Palette = { K: "#8b8b8b", d: "#232323" };
const HEART_EMPTY = [
  "................",
  ".KKKK...KKKK....",
  "KddddKKddddK....",
  "KdddddddddddK...",
  "KdddddddddddK...",
  ".KdddddddddK....",
  "..KdddddddK.....",
  "...KdddddK......",
  "....KdddK.......",
  ".....KdK........",
  "......K.........",
  "................",
  "................",
  "................",
  "................",
  "................",
];

/* ------------------------------------------------------------------ */

export interface SpriteSet {
  idle: HTMLCanvasElement[];
  run: HTMLCanvasElement[];
  jump: HTMLCanvasElement;
  flash: { idle: HTMLCanvasElement[]; run: HTMLCanvasElement[]; jump: HTMLCanvasElement };
  slime: HTMLCanvasElement[];
  crow: HTMLCanvasElement[];
  rice: HTMLCanvasElement;
  milk: HTMLCanvasElement;
  star: HTMLCanvasElement;
  heartFull: HTMLCanvasElement;
  heartEmpty: HTMLCanvasElement;
}

export function buildSprites(): SpriteSet {
  const idle = [makeSprite(R_IDLE_A, RACCOON_PAL), makeSprite(R_IDLE_B, RACCOON_PAL)];
  const run = [makeSprite(R_RUN_A, RACCOON_PAL), makeSprite(R_RUN_B, RACCOON_PAL)];
  const jump = makeSprite(R_JUMP, RACCOON_PAL);
  return {
    idle,
    run,
    jump,
    flash: {
      idle: idle.map(flashVariant),
      run: run.map(flashVariant),
      jump: flashVariant(jump),
    },
    slime: [makeSprite(SLIME_A, INK_PAL), makeSprite(SLIME_B, INK_PAL)],
    crow: [makeSprite(CROW_A, INK_PAL), makeSprite(CROW_B, INK_PAL)],
    rice: makeSprite(RICE, PICK_PAL),
    milk: makeSprite(MILK, PICK_PAL),
    star: makeSprite(STAR, PICK_PAL),
    heartFull: makeSprite(HEART_FULL, PICK_PAL),
    heartEmpty: makeSprite(HEART_EMPTY, HEART_PAL_EMPTY),
  };
}

/* Exported pixel maps so DOM screens can paint the same art. */
export const DOM_SPRITES = {
  raccoon: { rows: R_IDLE_A, pal: RACCOON_PAL },
  raccoonJump: { rows: R_JUMP, pal: RACCOON_PAL },
  rice: { rows: RICE, pal: PICK_PAL },
  milk: { rows: MILK, pal: PICK_PAL },
  star: { rows: STAR, pal: PICK_PAL },
  slime: { rows: SLIME_A, pal: INK_PAL },
  crow: { rows: CROW_A, pal: INK_PAL },
  heart: { rows: HEART_FULL, pal: PICK_PAL },
};
