/* Stage definitions. The world is authored on a 16px tile grid (14 rows tall)
   and parsed into flat data the engine consumes. */

export type ThemeId = "village" | "bamboo" | "river" | "cliffs" | "city";

export interface ThemeDef {
  id: ThemeId;
  sky: string;
  far: string;
  mid: string;
  solid: string;
  solidDark: string;
  edge: string;
  accent: string;
  water?: string;
  night?: boolean;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  village: { id: "village", sky: "#d7d7d7", far: "#bdbdbd", mid: "#a6a6a6", solid: "#262626", solidDark: "#161616", edge: "#f0f0f0", accent: "#787878" },
  bamboo:  { id: "bamboo",  sky: "#cfcfcf", far: "#b0b0b0", mid: "#989898", solid: "#232323", solidDark: "#141414", edge: "#e7e7e7", accent: "#6e6e6e" },
  river:   { id: "river",   sky: "#dcdcdc", far: "#b7b7b7", mid: "#9d9d9d", solid: "#212121", solidDark: "#131313", edge: "#eeeeee", accent: "#7c7c7c", water: "#8f8f8f" },
  cliffs:  { id: "cliffs",  sky: "#c2c2c2", far: "#9f9f9f", mid: "#878787", solid: "#1d1d1d", solidDark: "#101010", edge: "#e2e2e2", accent: "#6a6a6a" },
  city:    { id: "city",    sky: "#161616", far: "#232323", mid: "#0e0e0e", solid: "#0a0a0a", solidDark: "#050505", edge: "#f2f2f2", accent: "#cfcfcf", night: true },
};

export interface Vec { x: number; y: number }

export interface LevelData {
  w: number;
  h: number;
  solid: Uint8Array;
  deco: string[]; // per-cell char for drawing ('G','#','B','=','^','w','*','X')
  start: Vec;     // tile the player spawns on (feet land on y)
  star: Vec;
  rice: Vec[];
  milks: Vec[];
  slimes: Vec[];
  crows: { x: number; y: number; range: number }[];
  riceTotal: number;
}

const SOLIDS = new Set(["G", "#", "B", "=", "X"]);

class LevelBuilder {
  w: number;
  h = 14;
  g: string[][];

  constructor(w: number) {
    this.w = w;
    this.g = Array.from({ length: this.h }, () => Array<string>(w).fill("."));
  }
  private set(x: number, y: number, ch: string) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    this.g[y][x] = ch;
  }
  ground(x0: number, x1: number, top = 12) {
    for (let x = x0; x <= x1; x++) {
      this.set(x, top, "G");
      for (let y = top + 1; y < this.h; y++) this.set(x, y, "#");
    }
  }
  block(x: number, y: number, ch = "B") { this.set(x, y, ch); }
  blocks(x0: number, x1: number, y: number, ch = "B") { for (let x = x0; x <= x1; x++) this.set(x, y, ch); }
  plat(x0: number, x1: number, y: number) { for (let x = x0; x <= x1; x++) this.set(x, y, "="); }
  wall(x: number, y0: number, y1: number) { for (let y = y0; y <= y1; y++) this.set(x, y, "X"); }
  rice(x: number, y: number) { this.set(x, y, "o"); }
  riceRow(x0: number, x1: number, y: number) { for (let x = x0; x <= x1; x++) this.set(x, y, "o"); }
  milk(x: number, y: number) { this.set(x, y, "M"); }
  slime(x: number, top = 12) { this.set(x, top - 1, "e"); }
  crow(x: number, y: number, range: number) { this.set(x, y, `c${Math.min(9, range)}`); }
  spikes(x0: number, x1: number, top = 12) { for (let x = x0; x <= x1; x++) this.set(x, top - 1, "^"); }
  star(x: number, y: number) { this.set(x, y, "S"); }
  start(x: number, top = 12) { this.set(x, top - 1, "P"); }
  bush(x: number, top = 12) { this.set(x, top - 1, "*"); }
  water(x0: number, x1: number) { for (let x = x0; x <= x1; x++) { this.set(x, 12, "w"); this.set(x, 13, "w"); } }

  build(): LevelData {
    const w = this.w, h = this.h;
    const data: LevelData = {
      w, h,
      solid: new Uint8Array(w * h),
      deco: new Array(w * h).fill("."),
      start: { x: 2, y: 11 },
      star: { x: w - 6, y: 10 },
      rice: [], milks: [], slimes: [], crows: [],
      riceTotal: 0,
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = this.g[y][x];
        const i = y * w + x;
        data.deco[i] = ch;
        if (SOLIDS.has(ch)) data.solid[i] = 1;
        switch (ch) {
          case "P": data.start = { x, y }; break;
          case "S": data.star = { x, y }; break;
          case "o": data.rice.push({ x, y }); data.riceTotal++; break;
          case "M": data.milks.push({ x, y }); break;
          case "e": data.slimes.push({ x, y }); break;
          case "^": break; // handled via deco
          default: {
            if (ch.startsWith("c")) data.crows.push({ x, y, range: parseInt(ch[1], 10) || 5 });
          }
        }
      }
    }
    return data;
  }
}

export interface StageDef {
  place: string;
  subtitle: string;
  theme: ThemeId;
  slimeSpeed: number;
  crowSpeed: number;
  build: () => LevelData;
}

export const STAGES: StageDef[] = [
  {
    place: "HINOKI VILLAGE",
    subtitle: "Rooftops, rice paddies and a morning run.",
    theme: "village",
    slimeSpeed: 0.34,
    crowSpeed: 0.5,
    build: () => {
      const l = new LevelBuilder(150);
      l.ground(0, 21); l.start(3);
      l.riceRow(8, 12, 10); l.slime(16); l.bush(19);
      l.ground(22, 38); l.blocks(28, 29, 9); l.rice(28, 8); l.rice(29, 8); l.bush(34);
      l.ground(42, 60); l.plat(46, 49, 9); l.riceRow(46, 49, 8); l.slime(54); l.milk(58, 11);
      l.ground(61, 72); l.spikes(64, 65); l.rice(64, 9); l.rice(65, 9); l.bush(69);
      l.ground(76, 92); l.crow(82, 8, 6); l.plat(85, 87, 9); l.riceRow(85, 87, 8); l.slime(89);
      l.ground(96, 116); l.slime(102); l.riceRow(105, 109, 10); l.slime(110); l.milk(113, 11); l.bush(115);
      l.ground(120, 149); l.riceRow(124, 128, 10); l.slime(131); l.bush(135);
      l.blocks(141, 143, 11); l.star(142, 10);
      l.wall(149, 6, 13);
      return l.build();
    },
  },
  {
    place: "BAMBOO GROVE",
    subtitle: "Green shoots in grey — watch the crows.",
    theme: "bamboo",
    slimeSpeed: 0.42,
    crowSpeed: 0.6,
    build: () => {
      const l = new LevelBuilder(160);
      l.ground(0, 14); l.start(3); l.riceRow(7, 10, 10); l.bush(12);
      l.ground(18, 30); l.slime(23); l.plat(20, 22, 9); l.riceRow(20, 22, 8);
      l.spikes(27, 28); l.rice(27, 9); l.rice(28, 9);
      l.plat(32, 33, 11);
      l.ground(35, 48); l.crow(40, 7, 8); l.slime(44); l.bush(46);
      l.plat(50, 52, 10); l.riceRow(50, 52, 9);
      l.plat(54, 56, 8); l.riceRow(54, 55, 7); l.milk(56, 7);
      l.ground(58, 74); l.spikes(62, 64); l.riceRow(62, 64, 9); l.slime(68); l.bush(71);
      l.ground(78, 94); l.crow(84, 8, 7); l.plat(86, 88, 9); l.riceRow(86, 88, 8); l.slime(91);
      l.plat(96, 97, 11);
      l.ground(99, 118); l.slime(104); l.slime(109); l.spikes(112, 113); l.rice(112, 9); l.rice(113, 9); l.milk(116, 11);
      l.ground(122, 159); l.riceRow(126, 130, 10); l.crow(134, 8, 6); l.slime(139); l.bush(143);
      l.blocks(148, 150, 11); l.star(149, 10);
      l.wall(159, 6, 13);
      return l.build();
    },
  },
  {
    place: "KAWA CROSSING",
    subtitle: "Hop the lily pads. Mind the current.",
    theme: "river",
    slimeSpeed: 0.46,
    crowSpeed: 0.66,
    build: () => {
      const l = new LevelBuilder(170);
      l.ground(0, 12); l.start(3); l.riceRow(6, 9, 10);
      l.water(13, 17); l.plat(14, 15, 11);
      l.ground(18, 30); l.slime(24); l.riceRow(21, 23, 10); l.bush(28);
      l.water(31, 38); l.plat(33, 34, 11); l.crow(36, 8, 4); l.plat(36, 37, 9); l.rice(36, 8); l.rice(37, 8);
      l.ground(39, 52); l.slime(41); l.spikes(44, 45); l.rice(44, 9); l.rice(45, 9); l.milk(49, 11);
      l.water(53, 60); l.plat(55, 56, 11); l.rice(55, 10); l.rice(56, 10);
      l.ground(61, 76); l.slime(66); l.slime(71); l.crow(73, 7, 5);
      l.ground(77, 92); l.blocks(82, 86, 9); l.riceRow(82, 86, 8); l.slime(88); l.bush(90);
      l.water(93, 100); l.plat(95, 96, 11); l.plat(98, 99, 10); l.rice(98, 9); l.rice(99, 9);
      l.ground(101, 116); l.spikes(105, 106); l.rice(105, 9); l.rice(106, 9); l.slime(111); l.milk(114, 11);
      l.water(117, 124); l.plat(118, 119, 11); l.plat(121, 122, 11); l.crow(122, 8, 4);
      l.ground(125, 169); l.riceRow(129, 133, 10); l.slime(137); l.crow(142, 8, 6); l.slime(148); l.bush(152);
      l.blocks(157, 159, 11); l.star(158, 10);
      l.wall(169, 6, 13);
      return l.build();
    },
  },
  {
    place: "ONI CLIFFS",
    subtitle: "Thin paths. Long drops. Keep moving.",
    theme: "cliffs",
    slimeSpeed: 0.55,
    crowSpeed: 0.78,
    build: () => {
      const l = new LevelBuilder(170);
      l.ground(0, 10); l.start(3); l.riceRow(6, 8, 10);
      l.plat(12, 14, 10); l.rice(13, 9);
      l.plat(16, 18, 8); l.rice(17, 7);
      l.plat(20, 22, 6); l.rice(21, 5);
      l.ground(24, 40); l.spikes(30, 32); l.riceRow(30, 32, 9); l.slime(36); l.crow(38, 7, 5);
      l.ground(45, 60); l.milk(50, 11); l.slime(54); l.spikes(57, 58); l.rice(57, 9); l.rice(58, 9);
      l.plat(62, 63, 11); l.rice(62, 10);
      l.plat(66, 67, 9); l.rice(66, 8);
      l.plat(70, 71, 7); l.rice(70, 6);
      l.ground(74, 90, 6); l.slime(80); l.crow(85, 4, 6); l.riceRow(78, 82, 5);
      l.ground(94, 110); l.spikes(100, 102); l.riceRow(100, 102, 9); l.slime(106); l.milk(108, 11);
      l.ground(114, 130); l.crow(118, 8, 5); l.crow(124, 6, 5); l.slime(127);
      l.plat(132, 133, 11);
      l.ground(135, 169); l.slime(141); l.riceRow(144, 148, 10); l.crow(152, 8, 6);
      l.blocks(158, 160, 11); l.star(159, 10);
      l.wall(169, 6, 13);
      return l.build();
    },
  },
  {
    place: "NEON CITY",
    subtitle: "Rooftop sprint under paper-white lights.",
    theme: "city",
    slimeSpeed: 0.62,
    crowSpeed: 0.88,
    build: () => {
      const l = new LevelBuilder(180);
      l.ground(0, 12); l.start(3); l.riceRow(6, 9, 10);
      l.ground(16, 30); l.slime(22); l.plat(26, 28, 10); l.riceRow(26, 28, 9);
      l.ground(34, 48, 10); l.slime(40); l.spikes(44, 45, 10); l.rice(44, 7); l.rice(45, 7);
      l.plat(50, 51, 9);
      l.ground(53, 68, 10); l.milk(58, 9); l.crow(62, 6, 6); l.slime(65);
      l.ground(72, 86, 8); l.slime(77); l.spikes(80, 81, 8); l.rice(80, 6); l.rice(81, 6);
      l.plat(88, 89, 9);
      l.ground(91, 106, 10); l.crow(96, 7, 5); l.crow(101, 5, 5); l.slime(103);
      l.ground(110, 124); l.slime(115); l.slime(119); l.milk(122, 11);
      l.ground(128, 146, 10); l.spikes(133, 134, 10); l.rice(133, 7); l.rice(134, 7); l.crow(139, 6, 6); l.slime(142);
      l.ground(150, 179, 8); l.riceRow(154, 158, 7); l.plat(160, 162, 6); l.riceRow(160, 162, 5); l.slime(166);
      l.blocks(170, 172, 7); l.star(171, 6);
      l.wall(179, 4, 13);
      return l.build();
    },
  },
];
