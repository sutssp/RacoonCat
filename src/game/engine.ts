/* Onigiri Dash — engine. Fixed-timestep sim on a 256×224 pixel canvas. */

import { buildSprites } from "./sprites";
import type { SpriteSet } from "./sprites";
import { audio } from "./audio";
import { STAGES, THEMES } from "./levels";
import type { LevelData, StageDef, ThemeDef } from "./levels";

export const VIEW_W = 256;
export const VIEW_H = 224;
const T = 16; // tile size
const STEP = 1000 / 60;

export type Screen = "title" | "intro" | "playing" | "paused" | "gameover" | "clear" | "victory";

export interface UiSnapshot {
  screen: Screen;
  stage: number;
  stageCount: number;
  place: string;
  subtitle: string;
  score: number;
  rice: number;
  riceTotal: number;
  hearts: number;
  time: string;
  timeBonus: number;
  totalRice: number;
  allRice: number;
  muted: boolean;
}

interface Enemy {
  kind: "slime" | "crow";
  x: number; y: number; w: number; h: number;
  vx: number; dir: number;
  baseX: number; baseY: number; range: number; t: number;
}
interface Pickup { kind: "rice" | "milk"; x: number; y: number; taken: boolean; }
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; grav: number;
  text?: string;
}

const GRAY_SPARKS = ["#ffffff", "#e8e8e8", "#c4c4c4", "#9a9a9a"];
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const fmtTime = (frames: number) => {
  const s = Math.floor(frames / 60);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spr: SpriteSet;
  private onUi: (s: UiSnapshot) => void;

  private screen: Screen = "title";
  private screenT = 0;
  private stageIdx = 0;
  private level!: LevelData;
  private def!: StageDef;
  private theme!: ThemeDef;
  private tiles!: Record<string, HTMLCanvasElement | HTMLCanvasElement[]>;

  private enemies: Enemy[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];

  private player = {
    x: 0, y: 0, w: 10, h: 12, vx: 0, vy: 0,
    dir: 1, onGround: false, coyote: 0, buffer: 0,
    invuln: 0, flash: 0, anim: 0, hidden: false,
  };
  private lastSafe = { x: 0, y: 0 };

  private keys = { left: false, right: false };
  private touch = { left: false, right: false };

  private hearts = 3;
  private rice = 0;
  private score = 0;
  private totalRice = 0;
  private stageFrames = 0;
  private timeBonus = 0;

  private camX = 0;
  private shake = 0;
  private hurtFlash = 0;
  private frame = 0;
  private introTimer = 0;
  private deathTimer = -1;
  private starSeq = -1;
  private starTaken = false;
  private starPos = { x: 0, y: 0 };

  private raf = 0;
  private last = 0;
  private acc = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, onUi: (s: UiSnapshot) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.spr = buildSprites();
    this.onUi = onUi;
    this.loadStage(0);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.ui();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    audio.stopMusic();
  }

  /* ---------------- public controls ---------------- */

  confirm() {
    audio.unlock();
    switch (this.screen) {
      case "title": this.startRun(); break;
      case "intro": this.introTimer = Math.min(this.introTimer, 1); break;
      case "paused": this.togglePause(); break;
      case "gameover": this.retryStage(); break;
      case "clear": this.nextStage(); break;
      case "victory": this.toTitle(); break;
      case "playing": break;
    }
  }

  togglePause() {
    if (this.screen === "playing") { audio.select(); this.setScreen("paused"); }
    else if (this.screen === "paused") { audio.select(); this.setScreen("playing"); }
  }

  toggleMute() {
    audio.unlock();
    audio.setMuted(!audio.muted);
    this.ui();
  }

  setTouch(k: "left" | "right" | "jump", down: boolean) {
    if (k === "jump") {
      if (down) this.player.buffer = 7;
      return;
    }
    this.touch[k] = down;
  }

  /* ---------------- flow ---------------- */

  private setScreen(s: Screen) {
    this.screen = s;
    this.screenT = 0;
    this.ui();
  }

  private startRun() {
    this.score = 0;
    this.totalRice = 0;
    this.loadStage(0);
    this.introTimer = 150;
    audio.select();
    audio.startMusic(0);
    this.setScreen("intro");
  }

  private toTitle() {
    this.loadStage(0);
    audio.stopMusic();
    audio.select();
    this.setScreen("title");
  }

  private retryStage() {
    this.loadStage(this.stageIdx);
    this.introTimer = 150;
    audio.select();
    audio.startMusic(this.stageIdx);
    this.setScreen("intro");
  }

  private nextStage() {
    this.stageIdx++;
    if (this.stageIdx >= STAGES.length) {
      audio.stopMusic();
      audio.clear();
      this.setScreen("victory");
      return;
    }
    this.loadStage(this.stageIdx);
    this.introTimer = 150;
    audio.startMusic(this.stageIdx);
    audio.select();
    this.setScreen("intro");
  }

  private loadStage(i: number) {
    this.stageIdx = i;
    this.def = STAGES[i];
    this.level = this.def.build();
    this.theme = THEMES[this.def.theme];
    this.tiles = buildTiles(this.theme);
    const st = this.level.start;
    this.player.x = st.x * T + 3;
    this.player.y = (st.y + 1) * T - this.player.h;
    this.player.vx = 0; this.player.vy = 0; this.player.dir = 1;
    this.player.invuln = 0; this.player.flash = 0; this.player.hidden = false;
    this.lastSafe = { x: this.player.x, y: this.player.y };
    this.hearts = 3;
    this.rice = 0;
    this.stageFrames = 0;
    this.starTaken = false;
    this.starSeq = -1;
    this.deathTimer = -1;
    this.starPos = { x: this.level.star.x * T, y: this.level.star.y * T };
    this.enemies = [];
    for (const s of this.level.slimes) {
      this.enemies.push({
        kind: "slime", x: s.x * T + 2, y: (s.y + 1) * T - 10, w: 12, h: 10,
        vx: this.def.slimeSpeed, dir: hash(s.x) > 0.5 ? 1 : -1,
        baseX: 0, baseY: 0, range: 0, t: Math.floor(hash(s.x * 3) * 60),
      });
    }
    for (const c of this.level.crows) {
      this.enemies.push({
        kind: "crow", x: c.x * T, y: c.y * T + 4, w: 14, h: 10,
        vx: this.def.crowSpeed, dir: -1,
        baseX: c.x * T, baseY: c.y * T + 4, range: c.range * T, t: Math.floor(hash(c.x * 7) * 90),
      });
    }
    this.pickups = [];
    for (const r of this.level.rice) this.pickups.push({ kind: "rice", x: r.x * T, y: r.y * T, taken: false });
    for (const m of this.level.milks) this.pickups.push({ kind: "milk", x: m.x * T, y: m.y * T, taken: false });
    this.particles = [];
    this.camX = Math.max(0, Math.min(this.player.x - VIEW_W * 0.42, this.level.w * T - VIEW_W));
  }

  /* ---------------- input ---------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.code;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(k)) e.preventDefault();
    if (k === "ArrowLeft" || k === "KeyA") this.keys.left = true;
    if (k === "ArrowRight" || k === "KeyD") this.keys.right = true;
    if (k === "Space" || k === "ArrowUp" || k === "KeyW" || k === "KeyZ") {
      if (this.screen === "playing") this.player.buffer = 7;
      else if (this.screenT > 22) this.confirm();
    }
    if (k === "Enter") this.confirm();
    if (k === "KeyP" || k === "Escape") this.togglePause();
    if (k === "KeyM") this.toggleMute();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.code;
    if (k === "ArrowLeft" || k === "KeyA") this.keys.left = false;
    if (k === "ArrowRight" || k === "KeyD") this.keys.right = false;
    if ((k === "Space" || k === "ArrowUp" || k === "KeyW" || k === "KeyZ") && this.player.vy < -1.5) {
      this.player.vy *= 0.45; // variable jump height
    }
  };

  /* ---------------- helpers ---------------- */

  private solidAt(tx: number, ty: number): boolean {
    if (tx < 0 || tx >= this.level.w) return true;
    if (ty < 0 || ty >= this.level.h) return false;
    return this.level.solid[ty * this.level.w + tx] === 1;
  }
  private decoAt(tx: number, ty: number): string {
    if (tx < 0 || tx >= this.level.w || ty < 0 || ty >= this.level.h) return ".";
    return this.level.deco[ty * this.level.w + tx];
  }

  private burst(x: number, y: number, n: number, colors: string[], spd = 1.6, grav = 0.05, life = 34) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * spd;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6,
        life, max: life, size: 1 + Math.floor(Math.random() * 2),
        color: colors[Math.floor(Math.random() * colors.length)], grav,
      });
    }
  }
  private pop(x: number, y: number, text: string) {
    this.particles.push({ x, y, vx: 0, vy: -0.5, life: 46, max: 46, size: 1, color: "#ffffff", grav: 0, text });
  }

  private damage(kbDir: number, pit = false) {
    if (this.player.invuln > 0 || this.deathTimer >= 0 || this.starSeq >= 0) return;
    this.hearts--;
    this.hurtFlash = 10;
    this.shake = 7;
    this.player.invuln = 95;
    this.player.flash = 12;
    this.burst(this.player.x + 5, this.player.y + 6, 14, ["#3b2419", "#ff9e58", "#fff2d9", "#7a52c9"], 2, 0.08);
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.player.hidden = true;
      this.deathTimer = 75;
      this.burst(this.player.x + 5, this.player.y + 6, 30, ["#ff9e58", "#fff2d9", "#7a52c9", "#2fa8a0", "#ffffff"], 2.6, 0.07, 55);
      audio.gameover();
      audio.stopMusic();
    } else {
      audio.hurt();
      if (pit) {
        audio.fall();
        this.player.x = this.lastSafe.x;
        this.player.y = this.lastSafe.y;
        this.player.vx = 0;
        this.player.vy = 0;
      } else {
        this.player.vx = kbDir * 2.5;
        this.player.vy = -3;
      }
    }
    this.ui();
  }

  /* ---------------- simulation ---------------- */

  private loop = (t: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = t - this.last;
    this.last = t;
    if (dt > 100) dt = 100;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.update();
    }
    this.render();
  };

  private update() {
    this.frame++;
    this.screenT++;
    if (this.shake > 0) this.shake *= 0.86;
    if (this.shake < 0.3) this.shake = 0;
    if (this.hurtFlash > 0) this.hurtFlash--;

    switch (this.screen) {
      case "title": {
        this.camX += 0.45;
        if (this.camX > this.level.w * T - VIEW_W) this.camX = 0;
        this.updateEnemies();
        this.updateParticles();
        break;
      }
      case "intro": {
        this.introTimer--;
        this.updateEnemies();
        this.updateParticles();
        if (this.introTimer <= 0) this.setScreen("playing");
        break;
      }
      case "playing": this.updatePlaying(); break;
      case "clear":
      case "gameover":
      case "victory":
        this.updateParticles();
        break;
      case "paused": break;
    }
  }

  private updatePlaying() {
    if (this.deathTimer >= 0) {
      this.deathTimer--;
      this.updateParticles();
      if (this.deathTimer === 0) this.setScreen("gameover");
      return;
    }
    if (this.starSeq >= 0) {
      this.starSeq++;
      // celebration hop
      const p = this.player;
      p.vy += 0.26;
      p.y += p.vy;
      if (p.vy > 0) {
        const by = Math.floor((p.y + p.h) / T);
        const tx = Math.floor((p.x + p.w / 2) / T);
        if (this.solidAt(tx, by)) {
          p.y = by * T - p.h;
          p.vy = -3.4;
        }
      }
      if (this.starSeq % 5 === 0) {
        this.burst(this.starPos.x + 8, this.starPos.y + 8, 6, GRAY_SPARKS, 2.2, 0.04, 40);
      }
      this.updateParticles();
      if (this.starSeq === 70) {
        this.totalRice += this.rice;
        this.timeBonus = Math.max(0, 300 - Math.floor(this.stageFrames / 60)) * 2;
        this.score += 500 + this.timeBonus;
        audio.clear();
        this.setScreen(this.stageIdx === STAGES.length - 1 ? "victory" : "clear");
      }
      return;
    }

    this.stageFrames++;
    const p = this.player;
    const left = this.keys.left || this.touch.left;
    const right = this.keys.right || this.touch.right;

    /* horizontal */
    if (left && !right) { p.vx -= 0.17; p.dir = -1; }
    else if (right && !left) { p.vx += 0.17; p.dir = 1; }
    else p.vx *= p.onGround ? 0.8 : 0.94;
    p.vx = Math.max(-1.75, Math.min(1.75, p.vx));
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    /* jumping */
    if (p.buffer > 0) p.buffer--;
    if (p.onGround) p.coyote = 7;
    else if (p.coyote > 0) p.coyote--;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -5.5;
      p.buffer = 0;
      p.coyote = 0;
      p.onGround = false;
      audio.jump();
      this.burst(p.x + 5, p.y + p.h, 5, ["#cfcfcf", "#a8a8a8"], 0.8, 0.03, 18);
    }

    /* gravity */
    p.vy += 0.26;
    if (p.vy > 4.6) p.vy = 4.6;

    /* move X + collide */
    p.x += p.vx;
    {
      const top = Math.floor(p.y / T);
      const bot = Math.floor((p.y + p.h - 1) / T);
      if (p.vx > 0) {
        const tx = Math.floor((p.x + p.w) / T);
        for (let ty = top; ty <= bot; ty++) if (this.solidAt(tx, ty)) { p.x = tx * T - p.w - 0.01; p.vx = 0; break; }
      } else if (p.vx < 0) {
        const tx = Math.floor(p.x / T);
        for (let ty = top; ty <= bot; ty++) if (this.solidAt(tx, ty)) { p.x = (tx + 1) * T + 0.01; p.vx = 0; break; }
      }
    }

    /* move Y + collide */
    const wasAir = !p.onGround;
    p.y += p.vy;
    p.onGround = false;
    {
      const lx = Math.floor((p.x + 1) / T);
      const rx = Math.floor((p.x + p.w - 1) / T);
      if (p.vy > 0) {
        const ty = Math.floor((p.y + p.h) / T);
        for (let tx = lx; tx <= rx; tx++) if (this.solidAt(tx, ty)) {
          p.y = ty * T - p.h;
          p.vy = 0;
          p.onGround = true;
          break;
        }
      } else if (p.vy < 0) {
        const ty = Math.floor(p.y / T);
        for (let tx = lx; tx <= rx; tx++) if (this.solidAt(tx, ty)) {
          p.y = (ty + 1) * T + 0.01;
          p.vy = 0;
          break;
        }
      }
    }
    if (wasAir && p.onGround) {
      audio.land();
      this.burst(p.x + 5, p.y + p.h, 4, ["#bcbcbc", "#969696"], 0.7, 0.03, 16);
    }
    if (p.onGround) this.lastSafe = { x: p.x, y: p.y };

    /* spikes */
    {
      const lx = Math.floor(p.x / T), rx = Math.floor((p.x + p.w) / T);
      const ty = Math.floor((p.y + p.h - 2) / T);
      for (let tx = lx; tx <= rx; tx++) {
        if (this.decoAt(tx, ty) === "^" && p.y + p.h > ty * T + 7) {
          this.damage(p.vx >= 0 ? -1 : 1);
          if (this.deathTimer < 0) p.vy = -3.4;
          break;
        }
      }
    }

    /* pit */
    if (p.y > this.level.h * T + 20) {
      this.damage(0, true);
    }

    /* pickups */
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      const bob = pk.kind === "rice" ? Math.sin((this.frame + pk.x) / 11) * 1.5 : 0;
      if (p.x < pk.x + 12 && p.x + p.w > pk.x + 3 && p.y < pk.y + bob + 14 && p.y + p.h > pk.y + bob + 2) {
        pk.taken = true;
        if (pk.kind === "rice") {
          this.rice++;
          this.score += 50;
          audio.rice();
          this.burst(pk.x + 8, pk.y + 8, 6, GRAY_SPARKS, 1.4, 0.03, 22);
        } else {
          audio.milk();
          this.burst(pk.x + 8, pk.y + 8, 10, ["#ffffff", "#e8e8e8", "#bdbdbd"], 1.5, 0.02, 28);
          if (this.hearts < 3) {
            this.hearts++;
            this.pop(pk.x, pk.y - 6, "+HP");
            audio.heart();
          } else {
            this.score += 150;
            this.pop(pk.x, pk.y - 6, "+150");
          }
        }
        this.ui();
      }
    }

    /* star */
    if (!this.starTaken) {
      const sx = this.starPos.x, sy = this.starPos.y;
      if (p.x < sx + 14 && p.x + p.w > sx + 2 && p.y < sy + 14 && p.y + p.h > sy + 2) {
        this.starTaken = true;
        this.starSeq = 0;
        this.shake = 6;
        audio.star();
        this.burst(sx + 8, sy + 8, 26, GRAY_SPARKS, 2.6, 0.03, 50);
      }
    }

    this.updateEnemies();

    /* enemy collision */
    if (p.invuln > 0) p.invuln--;
    if (p.flash > 0) p.flash--;
    for (const en of this.enemies) {
      if (p.x + 2 < en.x + en.w - 2 && p.x + p.w - 2 > en.x + 2 && p.y + 2 < en.y + en.h - 1 && p.y + p.h - 1 > en.y + 2) {
        const dir = p.x + p.w / 2 < en.x + en.w / 2 ? -1 : 1;
        this.damage(dir);
        break;
      }
    }

    /* anim + camera */
    if (Math.abs(p.vx) > 0.2) p.anim += Math.abs(p.vx) * 0.16;
    const target = Math.max(0, Math.min(p.x - VIEW_W * 0.42, this.level.w * T - VIEW_W));
    this.camX += (target - this.camX) * 0.12;

    this.updateParticles();
  }

  private updateEnemies() {
    for (const en of this.enemies) {
      en.t++;
      if (en.kind === "slime") {
        en.x += en.vx * en.dir;
        const footY = Math.floor((en.y + en.h + 2) / T);
        const frontX = Math.floor((en.dir > 0 ? en.x + en.w + 1 : en.x - 1) / T);
        const bodyY = Math.floor((en.y + 4) / T);
        if (this.solidAt(frontX, bodyY) || !this.solidAt(frontX, footY)) en.dir *= -1;
      } else {
        en.x += en.vx * en.dir;
        if (en.x < en.baseX - 6 || en.x > en.baseX + en.range) en.dir *= -1;
        en.y = en.baseY + Math.sin(en.t * 0.055) * 7;
      }
    }
  }

  private updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life--;
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += pt.grav;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  }

  /* ---------------- ui ---------------- */

  private ui() {
    this.onUi({
      screen: this.screen,
      stage: this.stageIdx + 1,
      stageCount: STAGES.length,
      place: this.def.place,
      subtitle: this.def.subtitle,
      score: this.score,
      rice: this.rice,
      riceTotal: this.level.riceTotal,
      hearts: this.hearts,
      time: fmtTime(this.stageFrames),
      timeBonus: this.timeBonus,
      totalRice: this.totalRice,
      allRice: STAGES.reduce((a, s) => a + s.build().riceTotal, 0),
      muted: audio.muted,
    });
  }

  /* ---------------- rendering ---------------- */

  private render() {
    const g = this.ctx;
    const th = this.theme;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = th.sky;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    this.drawBackground(g, th);

    const sx = this.shake > 0 ? (Math.random() * 2 - 1) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() * 2 - 1) * this.shake * 0.6 : 0;
    const cx = Math.round(this.camX + sx);

    g.save();
    g.translate(-cx, Math.round(sy));

    this.drawTiles(g, cx);
    this.drawDecor(g, cx);
    this.drawPickups(g);
    this.drawStar(g);
    this.drawEnemies(g);
    this.drawPlayer(g);
    this.drawParticles(g);

    g.restore();

    this.drawHud(g);

    if (this.hurtFlash > 0) {
      g.fillStyle = `rgba(255,255,255,${(this.hurtFlash / 10) * 0.55})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.hearts === 1 && this.screen === "playing" && this.frame % 40 < 20) {
      g.fillStyle = "rgba(0,0,0,0.14)";
      g.fillRect(0, 0, VIEW_W, 26);
      g.fillRect(0, VIEW_H - 14, VIEW_W, 14);
    }
  }

  private drawBackground(g: CanvasRenderingContext2D, th: ThemeDef) {
    const t = this.frame;
    const wrap = (f: number, period: number) => -((this.camX * f) % period);

    if (th.id === "village") {
      g.fillStyle = "#f2f2f2";
      g.beginPath(); g.arc(38, 34, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = th.sky;
      g.beginPath(); g.arc(43, 31, 11, 0, Math.PI * 2); g.fill();
      // clouds
      g.fillStyle = "#ececec";
      for (let i = 0; i < 4; i++) {
        const x = wrap(0.12, 300) + i * 300 + ((i * 97) % 120);
        const y = 24 + (i % 2) * 18 + Math.sin(t / 60 + i) * 1.5;
        g.fillRect(x, y, 26, 6); g.fillRect(x + 5, y - 4, 15, 5);
      }
      // far hills
      g.fillStyle = th.far;
      for (let i = 0; i < 4; i++) {
        const x = wrap(0.2, 280) + i * 280;
        g.beginPath(); g.arc(x + 90, 224, 92, Math.PI, 0); g.fill();
        g.beginPath(); g.arc(x + 210, 224, 62, Math.PI, 0); g.fill();
      }
      // mid: houses + trees
      for (let i = 0; i < 5; i++) {
        const x = wrap(0.45, 320) + i * 320;
        const hh = 26 + hash(i * 13) * 10;
        g.fillStyle = th.mid;
        g.fillRect(x + 30, 224 - 40 - hh, 44, hh + 40);
        g.beginPath();
        g.moveTo(x + 22, 224 - 40 - hh);
        g.lineTo(x + 52, 224 - 62 - hh);
        g.lineTo(x + 82, 224 - 40 - hh);
        g.fill();
        g.fillStyle = th.sky;
        g.fillRect(x + 44, 224 - 34 - hh, 8, 8);
        g.fillStyle = th.mid;
        g.beginPath(); g.arc(x + 150, 224 - 52, 16, 0, Math.PI * 2); g.fill();
        g.fillRect(x + 148, 224 - 52, 4, 52);
        g.fillRect(x + 220, 196, 3, 28); // fence
        g.fillRect(x + 214, 202, 16, 3);
      }
    } else if (th.id === "bamboo") {
      g.fillStyle = th.far;
      for (let i = 0; i < 12; i++) {
        const x = wrap(0.2, 340) + i * 29 + hash(i) * 10;
        g.fillRect(x, 40 + hash(i * 3) * 30, 2, 224);
      }
      g.fillStyle = th.mid;
      for (let i = 0; i < 8; i++) {
        const x = wrap(0.5, 300) + i * 38 + hash(i * 7) * 14;
        const topY = 26 + hash(i * 11) * 40;
        g.fillRect(x, topY, 4, 224 - topY);
        for (let n = 0; n < 6; n++) g.fillRect(x - 1, topY + 24 + n * 30, 6, 2);
        // leaves
        g.fillRect(x + 4, topY + 14 + (i % 3) * 26, 9, 2);
        g.fillRect(x - 12, topY + 34 + (i % 2) * 40, 9, 2);
      }
      g.fillStyle = "rgba(235,235,235,0.5)";
      g.fillRect(0, 128 + Math.sin(t / 90) * 3, VIEW_W, 10);
      g.fillRect(0, 158 + Math.cos(t / 70) * 3, VIEW_W, 6);
    } else if (th.id === "river") {
      g.fillStyle = "#f0f0f0";
      for (let i = 0; i < 3; i++) {
        const x = wrap(0.1, 320) + i * 320 + 40;
        g.fillRect(x, 26 + i * 8, 24, 5); g.fillRect(x + 6, 22 + i * 8, 13, 4);
      }
      g.fillStyle = th.far;
      for (let i = 0; i < 5; i++) {
        const x = wrap(0.2, 300) + i * 300;
        g.beginPath();
        g.moveTo(x, 224); g.lineTo(x + 74, 92); g.lineTo(x + 148, 224);
        g.fill();
        g.fillStyle = th.sky;
        g.beginPath(); g.moveTo(x + 60, 116); g.lineTo(x + 74, 92); g.lineTo(x + 88, 116); g.fill();
        g.fillStyle = th.far;
      }
      g.fillStyle = th.mid;
      for (let i = 0; i < 4; i++) {
        const x = wrap(0.45, 330) + i * 330;
        g.beginPath(); g.arc(x + 60, 224, 58, Math.PI, 0); g.fill();
        g.fillRect(x + 150, 176, 3, 48);
        g.beginPath(); g.arc(x + 151, 172, 12, 0, Math.PI * 2); g.fill();
      }
      // drifting birds
      g.fillStyle = "#5c5c5c";
      for (let i = 0; i < 3; i++) {
        const x = ((t * 0.3 + i * 130) % (VIEW_W + 40)) - 20;
        const y = 34 + i * 14 + Math.sin(t / 30 + i) * 3;
        g.fillRect(x, y, 3, 1); g.fillRect(x + 4, y, 3, 1); g.fillRect(x + 3, y + 1, 2, 1);
      }
    } else if (th.id === "cliffs") {
      g.fillStyle = "#dedede";
      g.beginPath(); g.arc(206, 40, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = th.sky;
      g.beginPath(); g.arc(201, 36, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = th.far;
      for (let i = 0; i < 6; i++) {
        const x = wrap(0.18, 310) + i * 310;
        g.beginPath();
        g.moveTo(x, 224); g.lineTo(x + 40, 70); g.lineTo(x + 62, 118); g.lineTo(x + 96, 52); g.lineTo(x + 150, 224);
        g.fill();
      }
      g.fillStyle = th.mid;
      for (let i = 0; i < 5; i++) {
        const x = wrap(0.45, 290) + i * 290;
        g.beginPath();
        g.moveTo(x, 224); g.lineTo(x + 56, 110); g.lineTo(x + 120, 224);
        g.fill();
        g.fillStyle = th.far;
        g.fillRect(x + 40, 150, 34, 2);
        g.fillRect(x + 52, 176, 30, 2);
        g.fillStyle = th.mid;
        // pines
        for (let pn = 0; pn < 2; pn++) {
          const px = x + 180 + pn * 36;
          g.beginPath();
          g.moveTo(px, 224); g.lineTo(px + 9, 168); g.lineTo(px + 18, 224);
          g.fill();
        }
      }
    } else {
      /* city — night */
      g.fillStyle = "#f0f0f0";
      g.beginPath(); g.arc(212, 36, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#c9c9c9";
      g.beginPath(); g.arc(208, 33, 3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(216, 40, 2, 0, Math.PI * 2); g.fill();
      // far skyline
      g.fillStyle = th.far;
      for (let i = 0; i < 7; i++) {
        const x = wrap(0.15, 340) + i * 50 + hash(i * 17) * 10;
        const h = 70 + hash(i * 29) * 60;
        g.fillRect(x, 224 - h, 34, h);
        if (i % 3 === 0) { g.fillRect(x + 14, 224 - h - 10, 2, 10); }
      }
      // mid buildings with windows
      for (let i = 0; i < 6; i++) {
        const x = wrap(0.4, 360) + i * 62;
        const h = 90 + hash(i * 41) * 70;
        g.fillStyle = th.mid;
        g.fillRect(x, 224 - h, 46, h);
        g.fillStyle = "#3a3a3a";
        g.fillRect(x, 224 - h, 46, 2);
        for (let wy = 0; wy < Math.floor(h / 16) - 1; wy++) {
          for (let wx = 0; wx < 3; wx++) {
            const lit = hash(i * 100 + wy * 7 + wx * 13) > 0.55;
            const blink = hash(i * 31 + wy + wx) > 0.93 && t % 120 < 60;
            g.fillStyle = lit !== blink ? "#e8e8e8" : "#303030";
            g.fillRect(x + 7 + wx * 13, 224 - h + 8 + wy * 16, 6, 8);
          }
        }
      }
      // neon sign outlines
      g.strokeStyle = "#dcdcdc";
      g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const x = wrap(0.4, 360) + i * 122 + 8;
        if (t % 90 < 78 || i % 2 === 0) g.strokeRect(x + 4.5, 128.5, 26, 10);
      }
    }
  }

  private drawTiles(g: CanvasRenderingContext2D, cx: number) {
    const x0 = Math.max(0, Math.floor(cx / T) - 1);
    const x1 = Math.min(this.level.w - 1, x0 + Math.ceil(VIEW_W / T) + 2);
    const wf = Math.floor(this.frame / 10) % 2;
    for (let ty = 0; ty < this.level.h; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = this.level.deco[ty * this.level.w + tx];
        if (ch === "." || ch === "P" || ch === "S" || ch === "o" || ch === "M" || ch === "e" || ch === "*" || ch.startsWith("c")) continue;
        if (ch === "w") {
          const frames = this.tiles["w"] as HTMLCanvasElement[];
          g.drawImage(frames[(tx + wf) % 2], tx * T, ty * T);
          continue;
        }
        if (ch === "^") {
          g.drawImage(this.tiles["^"] as HTMLCanvasElement, tx * T, ty * T);
          continue;
        }
        const img = this.tiles[ch] as HTMLCanvasElement;
        if (img) g.drawImage(img, tx * T, ty * T);
      }
    }
  }

  private drawDecor(g: CanvasRenderingContext2D, cx: number) {
    const th = this.theme;
    const x0 = Math.max(0, Math.floor(cx / T) - 1);
    const x1 = Math.min(this.level.w - 1, x0 + Math.ceil(VIEW_W / T) + 2);
    for (let ty = 0; ty < this.level.h; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.level.deco[ty * this.level.w + tx] !== "*") continue;
        const x = tx * T, y = ty * T;
        const seed = hash(tx * 7 + ty);
        if (th.id === "village") {
          g.fillStyle = th.solid;
          g.beginPath(); g.arc(x + 8, y + 12, 6, Math.PI, 0); g.fill();
          g.fillRect(x + 2, y + 12, 12, 4);
          g.fillStyle = th.edge;
          g.fillRect(x + 4 + Math.floor(seed * 6), y + 8, 2, 2);
        } else if (th.id === "bamboo") {
          g.fillStyle = th.solid;
          g.beginPath();
          g.moveTo(x + 8, y + 1); g.lineTo(x + 12, y + 15); g.lineTo(x + 4, y + 15);
          g.fill();
          g.fillStyle = th.edge;
          g.fillRect(x + 7, y + 5, 2, 2);
        } else if (th.id === "river") {
          g.fillStyle = th.solid;
          g.fillRect(x + 3, y + 4, 2, 12);
          g.fillRect(x + 8, y + 2, 2, 14);
          g.fillRect(x + 12, y + 6, 2, 10);
          g.fillStyle = th.edge;
          g.fillRect(x + 8, y, 2, 3);
        } else if (th.id === "cliffs") {
          g.fillStyle = th.solid;
          g.beginPath();
          g.moveTo(x + 8, y); g.lineTo(x + 14, y + 15); g.lineTo(x + 2, y + 15);
          g.fill();
          g.fillStyle = th.edge;
          g.fillRect(x + 7, y + 3, 2, 2);
        } else {
          // city: street lamp
          g.fillStyle = th.edge;
          g.fillRect(x + 7, y - 10, 2, 26);
          g.fillRect(x + 7, y - 10, 7, 2);
          const on = this.frame % 100 < 92;
          g.fillStyle = on ? "#ffffff" : "#4a4a4a";
          g.fillRect(x + 12, y - 8, 3, 3);
        }
      }
    }
  }

  private drawPickups(g: CanvasRenderingContext2D) {
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      if (pk.kind === "rice") {
        const bob = Math.sin((this.frame + pk.x) / 11) * 1.5;
        g.drawImage(this.spr.rice, Math.round(pk.x), Math.round(pk.y + bob));
      } else {
        const pulse = this.hearts < 3 && this.frame % 30 < 15;
        g.drawImage(this.spr.milk, pk.x, pk.y + (pulse ? -1 : 0));
        if (pulse) {
          g.fillStyle = "#ffffff";
          g.fillRect(pk.x + 7, pk.y - 4, 2, 2);
        }
      }
    }
  }

  private drawStar(g: CanvasRenderingContext2D) {
    if (this.starTaken) return;
    const bob = Math.sin(this.frame / 14) * 2;
    const sq = Math.abs(Math.cos(this.frame / 18));
    const wdt = Math.max(6, Math.round(16 * sq));
    const x = this.starPos.x + (16 - wdt) / 2;
    g.drawImage(this.spr.star, Math.round(x), Math.round(this.starPos.y + bob), wdt, 16);
    if (this.frame % 24 === 0) {
      this.burst(this.starPos.x + 8, this.starPos.y + 8, 1, GRAY_SPARKS, 0.5, -0.01, 26);
    }
    // pedestal beam
    g.fillStyle = this.theme.night ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.35)";
    g.fillRect(this.starPos.x + 4, this.starPos.y - 40, 8, 40);
  }

  private drawEnemies(g: CanvasRenderingContext2D) {
    for (const en of this.enemies) {
      if (en.kind === "slime") {
        const f = Math.floor(en.t / 13) % 2;
        g.drawImage(this.spr.slime[f], Math.round(en.x - 2), Math.round(en.y - 6 + (f === 1 ? 2 : 0)));
      } else {
        const f = Math.floor(en.t / 7) % 2;
        g.save();
        if (en.dir > 0) {
          g.translate(Math.round(en.x + en.w), Math.round(en.y - 2));
          g.scale(-1, 1);
          g.drawImage(this.spr.crow[f], -8, 0);
        } else {
          g.drawImage(this.spr.crow[f], Math.round(en.x - 1), Math.round(en.y - 2));
        }
        g.restore();
      }
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player;
    if (p.hidden) return;
    if (p.invuln > 0 && this.frame % 6 < 3 && this.deathTimer < 0) return;
    let frames = this.spr.idle;
    let idx = Math.floor(this.frame / 26) % 2;
    let img: HTMLCanvasElement;
    if (!p.onGround) img = this.spr.jump;
    else if (Math.abs(p.vx) > 0.2) { img = this.spr.run[Math.floor(p.anim) % 2]; frames = this.spr.run; idx = Math.floor(p.anim) % 2; }
    else img = frames[idx];
    const flash = p.flash > 0;
    const src = flash
      ? (!p.onGround ? this.spr.flash.jump : this.spr.flash.run[idx] ?? this.spr.flash.idle[idx])
      : img;
    const squash = p.onGround && Math.abs(p.vx) < 0.2 ? (this.frame % 52 < 6 ? 1 : 0) : 0;
    const dx = Math.round(p.x - 3);
    const dy = Math.round(p.y - 4) + squash;
    g.save();
    if (p.dir < 0) {
      g.translate(dx + 16, dy);
      g.scale(-1, 1);
      g.drawImage(src, 0, 0);
    } else {
      g.drawImage(src, dx, dy);
    }
    g.restore();
  }

  private drawParticles(g: CanvasRenderingContext2D) {
    for (const pt of this.particles) {
      const a = pt.life / pt.max;
      if (pt.text) {
        g.globalAlpha = Math.min(1, a * 2);
        g.font = '8px "Press Start 2P", monospace';
        g.fillStyle = "#101010";
        g.fillText(pt.text, pt.x + 1, pt.y + 1);
        g.fillStyle = pt.color;
        g.fillText(pt.text, pt.x, pt.y);
        g.globalAlpha = 1;
      } else {
        g.globalAlpha = a;
        g.fillStyle = pt.color;
        g.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
        g.globalAlpha = 1;
      }
    }
  }

  private drawHud(g: CanvasRenderingContext2D) {
    if (this.screen === "title") return;
    g.fillStyle = "rgba(10,10,10,0.88)";
    g.fillRect(0, 0, VIEW_W, 18);
    g.fillStyle = "#3d3d3d";
    g.fillRect(0, 18, VIEW_W, 1);

    for (let i = 0; i < 3; i++) {
      const filled = i < this.hearts;
      const blinkOut = filled && this.hearts === 1 && this.frame % 24 < 10;
      const img = filled && !blinkOut ? this.spr.heartFull : this.spr.heartEmpty;
      g.drawImage(img, 3 + i * 14, 1);
    }

    g.drawImage(this.spr.rice, 51, 1);
    g.font = '8px "Press Start 2P", monospace';
    g.textAlign = "left";
    g.fillStyle = "#101010";
    g.fillText(`x${this.rice.toString().padStart(2, "0")}`, 69 + 1, 12 + 1);
    g.fillStyle = "#f0f0f0";
    g.fillText(`x${this.rice.toString().padStart(2, "0")}`, 69, 12);

    g.textAlign = "center";
    g.fillStyle = "#8f8f8f";
    g.fillText(`STAGE ${this.stageIdx + 1}`, VIEW_W / 2 - 8, 12);

    g.textAlign = "right";
    g.fillStyle = "#8f8f8f";
    g.fillText(fmtTime(this.stageFrames), 200, 12);
    g.fillStyle = "#f0f0f0";
    g.fillText(this.score.toString().padStart(6, "0"), VIEW_W - 4, 12);
    g.textAlign = "left";
  }
}

/* ------------------------------------------------------------------ */
/*  Tile pre-rendering                                                 */
/* ------------------------------------------------------------------ */

function buildTiles(th: ThemeDef): Record<string, HTMLCanvasElement | HTMLCanvasElement[]> {
  const mk = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = T; c.height = T;
    draw(c.getContext("2d")!);
    return c;
  };
  const px = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };

  const ground = mk((g) => {
    px(g, 0, 0, 16, 16, th.solid);
    px(g, 0, 0, 16, 3, th.edge);
    px(g, 0, 3, 16, 1, th.solidDark);
    // grass tufts / pavement specks
    for (const [gx, gh] of [[2, 2], [6, 3], [11, 2], [14, 3]] as const) {
      px(g, gx, 0, 1, 0, th.edge);
      if (gh === 3) px(g, gx, 0, 1, 1, "#ffffff");
    }
    px(g, 4, 8, 2, 2, th.solidDark);
    px(g, 11, 11, 2, 2, th.solidDark);
    px(g, 7, 6, 1, 1, th.accent);
  });

  const dirt = mk((g) => {
    px(g, 0, 0, 16, 16, th.solid);
    px(g, 2, 3, 3, 2, th.solidDark);
    px(g, 9, 2, 2, 2, th.solidDark);
    px(g, 12, 8, 3, 2, th.solidDark);
    px(g, 5, 10, 2, 3, th.solidDark);
    px(g, 7, 5, 1, 1, th.accent);
    px(g, 2, 13, 1, 1, th.accent);
  });

  const brick = mk((g) => {
    px(g, 0, 0, 16, 16, th.solid);
    px(g, 0, 0, 16, 1, th.edge);
    g.fillStyle = th.accent;
    g.fillRect(0, 5, 16, 1);
    g.fillRect(0, 10, 16, 1);
    g.fillRect(0, 15, 16, 1);
    g.fillRect(8, 1, 1, 4);
    g.fillRect(4, 6, 1, 4);
    g.fillRect(12, 6, 1, 4);
    g.fillRect(8, 11, 1, 4);
  });

  const plank = mk((g) => {
    px(g, 0, 1, 16, 5, th.solid);
    px(g, 0, 1, 16, 1, th.edge);
    px(g, 0, 6, 16, 1, th.solidDark);
    px(g, 1, 7, 2, 5, th.solid);
    px(g, 13, 7, 2, 5, th.solid);
    px(g, 5, 3, 1, 1, th.accent);
    px(g, 11, 4, 1, 1, th.accent);
  });

  const stone = mk((g) => {
    px(g, 0, 0, 16, 16, th.solid);
    px(g, 0, 0, 16, 1, th.edge);
    px(g, 0, 0, 1, 16, th.edge);
    px(g, 15, 0, 1, 16, th.solidDark);
    px(g, 0, 15, 16, 1, th.solidDark);
    px(g, 5, 6, 2, 2, th.solidDark);
  });

  const spike = mk((g) => {
    g.fillStyle = th.solidDark;
    for (let i = 0; i < 2; i++) {
      const ox = i * 8;
      g.beginPath();
      g.moveTo(ox + 1, 16);
      g.lineTo(ox + 4, 5);
      g.lineTo(ox + 7, 16);
      g.fill();
    }
    g.fillStyle = th.edge;
    g.fillRect(3, 6, 1, 2);
    g.fillRect(11, 6, 1, 2);
  });

  const waterFrame = (shift: number) => mk((g) => {
    g.fillStyle = th.water ?? "#8f8f8f";
    g.fillRect(0, 2, 16, 14);
    g.fillStyle = th.sky;
    for (let i = 0; i < 3; i++) {
      g.fillRect(((i * 6 + shift) % 16), 4 + i * 4, 4, 1);
    }
    g.fillStyle = "#ffffff";
    g.fillRect((shift * 3) % 16, 2, 3, 1);
  });

  return { G: ground, "#": dirt, B: brick, "=": plank, X: stone, "^": spike, w: [waterFrame(0), waterFrame(7)] };
}
