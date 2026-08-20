/* Tiny WebAudio chiptune engine: SFX blips + a 16-step loop per stage. */

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Song {
  bpm: number;
  lead: number[]; // midi, -1 = rest
  bass: number[];
}

const SONGS: Song[] = [
  { // 1 · village — bright and easy
    bpm: 132,
    lead: [69, -1, 74, -1, 76, -1, 74, -1, 73, -1, 74, -1, 76, -1, 78, -1],
    bass: [45, -1, -1, 45, -1, -1, 52, -1, 45, -1, -1, 45, -1, 48, 52, -1],
  },
  { // 2 · bamboo grove — playful skip
    bpm: 142,
    lead: [74, -1, 77, -1, 79, -1, 77, -1, 74, -1, 72, -1, 74, -1, -1, -1],
    bass: [50, -1, 50, -1, 57, -1, 57, -1, 50, -1, 50, -1, 55, -1, 57, -1],
  },
  { // 3 · river — flowing arpeggios
    bpm: 122,
    lead: [67, 71, 74, 71, 67, 71, 74, 76, 74, 71, 67, 71, 74, 76, 74, 71],
    bass: [43, -1, -1, -1, 50, -1, -1, -1, 43, -1, -1, -1, 48, -1, 50, -1],
  },
  { // 4 · cliffs — minor and tense
    bpm: 148,
    lead: [69, -1, 72, -1, 71, -1, 69, -1, 67, -1, 69, -1, 72, -1, 71, -1],
    bass: [45, -1, -1, 45, 48, -1, -1, 43, 45, -1, -1, 45, 48, -1, 47, -1],
  },
  { // 5 · city — driving neon
    bpm: 154,
    lead: [69, 69, -1, 72, -1, 74, -1, 76, -1, 74, -1, 72, 69, -1, 67, -1],
    bass: [45, 45, 52, 45, 45, 45, 50, 45, 45, 45, 52, 45, 53, 52, 50, 48],
  },
];

export class AudioSys {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private song = 0;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.3;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    delay = 0
  ) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number, delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    s.connect(f).connect(g).connect(this.master);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  /* ------- SFX ------- */
  jump() { this.tone(230, 0.14, "square", 0.06, 540); }
  rice() { this.tone(940, 0.06, "square", 0.05); this.tone(1400, 0.09, "square", 0.05, undefined, 0.055); }
  milk() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.07, undefined, i * 0.07)); }
  hurt() { this.tone(320, 0.26, "sawtooth", 0.09, 80); this.noise(0.18, 0.05); }
  fall() { this.tone(500, 0.35, "triangle", 0.07, 90); }
  land() { this.noise(0.06, 0.03); }
  star() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.13, "square", 0.055, undefined, i * 0.07)); }
  clear() { [392, 523, 659, 784, 659, 1046].forEach((f, i) => this.tone(f, 0.16, "square", 0.06, undefined, i * 0.11)); }
  gameover() { [392, 330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.08, undefined, i * 0.2)); }
  select() { this.tone(660, 0.06, "square", 0.05); this.tone(990, 0.07, "square", 0.04, undefined, 0.05); }
  heart() { this.tone(392, 0.1, "triangle", 0.06); this.tone(523, 0.12, "triangle", 0.06, undefined, 0.09); }

  /* ------- music ------- */
  startMusic(theme: number) {
    this.stopMusic();
    this.song = Math.max(0, Math.min(SONGS.length - 1, theme));
    this.step = 0;
    if (!this.ctx || !this.master) return;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.pump(), 30);
  }

  stopMusic() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private pump() {
    if (!this.ctx || !this.master) return;
    const s = SONGS[this.song];
    const stepDur = 60 / s.bpm / 2;
    while (this.nextTime < this.ctx.currentTime + 0.14) {
      const i = this.step % 16;
      const lead = s.lead[i];
      const bass = s.bass[i];
      if (lead >= 0) this.tone(midi(lead), stepDur * 1.6, "square", 0.032, undefined, this.nextTime - this.ctx.currentTime);
      if (bass >= 0) this.tone(midi(bass), stepDur * 1.9, "triangle", 0.055, undefined, this.nextTime - this.ctx.currentTime);
      if (i % 4 === 2) this.noise(0.03, 0.012, this.nextTime - this.ctx.currentTime);
      this.nextTime += stepDur;
      this.step++;
    }
  }
}

export const audio = new AudioSys();
