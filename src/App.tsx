import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { Game, VIEW_W, VIEW_H } from "./game/engine";
import type { UiSnapshot, Screen } from "./game/engine";
import { makeSprite, DOM_SPRITES } from "./game/sprites";
import { audio } from "./game/audio";

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function PixelSprite({
  art,
  scale = 4,
  className = "",
}: {
  art: { rows: string[]; pal: Record<string, string> };
  scale?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const src = makeSprite(art.rows, art.pal);
    c.width = src.width * scale;
    c.height = src.height * scale;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
  }, [art, scale]);
  return <canvas ref={ref} className={className} style={{ imageRendering: "pixelated" }} />;
}

const CONFETTI_SHADES = ["#f2f2f2", "#c9c9c9", "#9a9a9a", "#6f6f6f", "#e8e8ea"];

function Confetti() {
  const bits = useRef(
    Array.from({ length: 26 }, (_, i) => ({
      left: (i * 37 + 13) % 100,
      delay: (i % 13) * 0.35,
      dur: 2.6 + ((i * 7) % 10) / 5,
      shade: CONFETTI_SHADES[i % CONFETTI_SHADES.length],
      big: i % 4 === 0,
    }))
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bits.current.map((b, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{
            left: `${b.left}%`,
            background: b.shade,
            width: b.big ? 9 : 6,
            height: b.big ? 9 : 6,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="kbd">{k}</span>
      <span className="text-[17px] leading-none text-fog">{label}</span>
    </span>
  );
}

function HeartsRow({ n }: { n: number }) {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <PixelSprite key={i} art={DOM_SPRITES.heart} scale={2} className={i < n ? "" : "opacity-25 grayscale"} />
      ))}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b-2 border-dashed border-coal pb-1">
      <span className="text-[19px] text-fog">{label}</span>
      <span className="font-display text-[11px] text-paper">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overlay screens                                                    */
/* ------------------------------------------------------------------ */

function OverlayShell({
  children,
  onTap,
  dim = "rgba(7,8,10,0.74)",
}: {
  children: ReactNode;
  onTap?: () => void;
  dim?: string;
}) {
  return (
    <div
      className="absolute inset-0 z-30 flex overflow-y-auto p-3"
      style={{ background: dim }}
      onClick={onTap}
    >
      <div className="m-auto flex w-full justify-center">{children}</div>
    </div>
  );
}

function TitleScreen({ ui, onTap }: { ui: UiSnapshot; onTap: () => void }) {
  return (
    <OverlayShell onTap={onTap} dim="rgba(7,8,10,0.55)">
      <div className="slide-up relative flex w-full max-w-[430px] flex-col items-center gap-3 py-2 text-center">
        <div className="title-drop">
          <div className="font-display text-[11px] tracking-[0.3em] text-fog">A MONOCHROME PLATFORMER</div>
          <h1 className="font-display mt-2 text-[30px] leading-[0.95] text-paper sm:text-[38px]" style={{ textShadow: "4px 4px 0 #000, -2px -2px 0 #3a3e4d" }}>
            ONIGIRI
            <span className="block text-[38px] text-raccoon sm:text-[46px]" style={{ textShadow: "4px 4px 0 #000, -2px -2px 0 #7a4a22" }}>
              DASH
            </span>
          </h1>
        </div>

        <div className="relative flex w-full items-end justify-center gap-4">
          <PixelSprite art={DOM_SPRITES.rice} scale={2.5} className="floaty mb-3" />
          <div className="hoppy">
            <PixelSprite art={DOM_SPRITES.raccoon} scale={5} />
          </div>
          <PixelSprite art={DOM_SPRITES.milk} scale={2.5} className="floaty-slow mb-3" />
        </div>
        <p className="-mt-1 max-w-[360px] text-[19px] leading-tight text-paper/90">
          The world lost its colour — all but one raccoon.
          Sprint through <span className="text-paper">five stages</span>, munch{" "}
          <span className="text-paper">rice balls</span>, sip <span className="text-paper">milk</span> to heal,
          and grab the <span className="text-paper">star</span> at every finish.
        </p>

        <button
          className="blink font-display border-3 border-paper bg-coal px-5 py-3 text-[12px] text-paper"
          onClick={(e) => { e.stopPropagation(); onTap(); }}
        >
          ▶ PRESS ENTER — START
        </button>

        <div className="pixel-panel w-full max-w-[390px] px-4 py-3">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <KeyHint k="◀ ▶" label="run" />
            <KeyHint k="SPACE" label="jump" />
            <KeyHint k="P" label="pause" />
            <KeyHint k="M" label="sound" />
          </div>
        </div>

        <div className="font-display flex flex-wrap justify-center gap-x-3 gap-y-1 text-[8px] text-fog">
          <span className="text-paper">1·VILLAGE</span>
          <span>2·GROVE</span>
          <span>3·RIVER</span>
          <span>4·CLIFFS</span>
          <span>5·CITY</span>
        </div>
        <div className="text-[16px] text-fog">best played loud · hearts ×3 · don't touch the ink</div>
        {ui.muted && <div className="font-display text-[8px] text-raccoon">SOUND OFF — PRESS M</div>}
      </div>
    </OverlayShell>
  );
}

function IntroCard({ ui, onTap }: { ui: UiSnapshot; onTap: () => void }) {
  return (
    <OverlayShell onTap={onTap} dim="rgba(7,8,10,0.6)">
      <div className="pixel-panel slide-up w-full max-w-[380px] px-6 py-6 text-center">
        <div className="font-display text-[10px] tracking-[0.25em] text-fog">
          STAGE {ui.stage} / {ui.stageCount}
        </div>
        <h2 className="font-display mt-3 text-[20px] leading-tight text-paper" style={{ textShadow: "3px 3px 0 #000" }}>
          {ui.place}
        </h2>
        <p className="mt-2 text-[20px] leading-snug text-paper/85">{ui.subtitle}</p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <PixelSprite art={DOM_SPRITES.star} scale={2} className="floaty" />
          <span className="text-[18px] text-fog">
            collect rice · avoid ink beasts · <span className="text-paper">reach the star</span>
          </span>
        </div>
        <div className="mt-5 h-3 w-full border-2 border-paper bg-coal p-[2px]">
          <div className="intro-bar h-full bg-paper" />
        </div>
        <div className="font-display mt-3 text-[8px] text-fog">ENTER — SKIP</div>
      </div>
    </OverlayShell>
  );
}

function PausedScreen({ onTap }: { onTap: () => void }) {
  return (
    <OverlayShell onTap={onTap}>
      <div className="pixel-panel slide-up px-8 py-6 text-center">
        <h2 className="font-display text-[20px] text-paper" style={{ textShadow: "3px 3px 0 #000" }}>PAUSED</h2>
        <p className="mt-2 text-[18px] text-fog">the raccoon waits…</p>
        <div className="font-display mt-4 text-[9px] text-paper">P / ENTER — RESUME</div>
      </div>
    </OverlayShell>
  );
}

function GameOverScreen({ ui, onTap }: { ui: UiSnapshot; onTap: () => void }) {
  return (
    <OverlayShell onTap={onTap} dim="rgba(7,8,10,0.82)">
      <div className="pixel-panel slide-up w-full max-w-[360px] px-6 py-6 text-center">
        <h2 className="font-display text-[24px] text-paper" style={{ textShadow: "3px 3px 0 #000" }}>
          GAME<span className="text-raccoon"> OVER</span>
        </h2>
        <p className="mt-2 text-[19px] text-paper/85">all three hearts gone — the ink wins this round.</p>
        <div className="mt-3 flex justify-center"><HeartsRow n={0} /></div>
        <div className="mt-4 flex flex-col gap-2 text-left">
          <StatLine label={`rice on stage ${ui.stage}`} value={`${ui.rice} / ${ui.riceTotal}`} />
          <StatLine label="score" value={ui.score.toString().padStart(6, "0")} />
        </div>
        <button className="font-display mt-5 border-3 border-paper bg-coal px-4 py-3 text-[11px] text-paper hover:bg-paper hover:text-coal"
          onClick={(e) => { e.stopPropagation(); onTap(); }}>
          ▸ RETRY STAGE {ui.stage}
        </button>
        <div className="font-display mt-3 text-[8px] text-fog">ENTER — RETRY</div>
      </div>
    </OverlayShell>
  );
}

function ClearScreen({ ui, onTap }: { ui: UiSnapshot; onTap: () => void }) {
  return (
    <OverlayShell onTap={onTap} dim="rgba(7,8,10,0.72)">
      <Confetti />
      <div className="pixel-panel slide-up relative w-full max-w-[360px] px-6 py-6 text-center">
        <div className="font-display text-[10px] tracking-[0.25em] text-fog">STAGE {ui.stage} / {ui.stageCount}</div>
        <h2 className="font-display mt-2 text-[22px] text-paper" style={{ textShadow: "3px 3px 0 #000" }}>
          STAGE CLEAR!
        </h2>
        <div className="mt-2 flex justify-center"><PixelSprite art={DOM_SPRITES.star} scale={2.4} className="floaty" /></div>
        <div className="mt-3 flex flex-col gap-2 text-left">
          <StatLine label="rice balls" value={`${ui.rice} / ${ui.riceTotal}`} />
          <StatLine label="time" value={ui.time} />
          <StatLine label="time bonus" value={`+${ui.timeBonus}`} />
          <StatLine label="score" value={ui.score.toString().padStart(6, "0")} />
        </div>
        <button className="font-display mt-5 border-3 border-paper bg-coal px-4 py-3 text-[11px] text-paper hover:bg-paper hover:text-coal"
          onClick={(e) => { e.stopPropagation(); onTap(); }}>
          ▸ NEXT — {ui.stage + 1}. {["", "", "KAWA CROSSING", "ONI CLIFFS", "NEON CITY"][ui.stage + 1] ?? ""}
        </button>
        <div className="font-display mt-3 text-[8px] text-fog">ENTER — CONTINUE</div>
      </div>
    </OverlayShell>
  );
}

function VictoryScreen({ ui, onTap }: { ui: UiSnapshot; onTap: () => void }) {
  return (
    <OverlayShell onTap={onTap} dim="rgba(7,8,10,0.78)">
      <Confetti />
      <div className="pixel-panel slide-up relative w-full max-w-[400px] px-6 py-6 text-center">
        <div className="font-display text-[10px] tracking-[0.3em] text-fog">FIVE STAGES · ONE RACCOON</div>
        <h2 className="font-display mt-2 text-[30px] text-paper" style={{ textShadow: "4px 4px 0 #000" }}>
          THE <span className="text-raccoon">END</span>
        </h2>
        <div className="mt-2 flex items-end justify-center gap-4">
          <PixelSprite art={DOM_SPRITES.star} scale={2} className="floaty" />
          <div className="hoppy"><PixelSprite art={DOM_SPRITES.raccoonJump} scale={4} /></div>
          <PixelSprite art={DOM_SPRITES.rice} scale={2} className="floaty-slow" />
        </div>
        <p className="mt-2 text-[19px] leading-snug text-paper/85">
          Neon City fades to grey behind you. Every star claimed, every rice ball accounted for.
        </p>
        <div className="mt-4 flex flex-col gap-2 text-left">
          <StatLine label="total rice" value={`${ui.totalRice} / ${ui.allRice}`} />
          <StatLine label="final score" value={ui.score.toString().padStart(6, "0")} />
        </div>
        <button className="font-display mt-5 border-3 border-paper bg-coal px-4 py-3 text-[11px] text-paper hover:bg-paper hover:text-coal"
          onClick={(e) => { e.stopPropagation(); onTap(); }}>
          ▸ PLAY AGAIN
        </button>
        <div className="font-display mt-3 text-[8px] text-fog">ENTER — TITLE</div>
      </div>
    </OverlayShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Touch controls                                                     */
/* ------------------------------------------------------------------ */

function TouchControls({ engine }: { engine: MutableRefObject<Game | null> }) {
  const press = (k: "left" | "right" | "jump", down: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    audio.unlock();
    engine.current?.setTouch(k, down);
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-4 sm:hidden">
      <div className="pointer-events-auto flex gap-3">
        <button className="tbtn flex h-14 w-14 items-center justify-center"
          onPointerDown={press("left", true)} onPointerUp={press("left", false)}
          onPointerLeave={press("left", false)} onPointerCancel={press("left", false)}
          aria-label="run left">
          <svg width="20" height="20" viewBox="0 0 20 20"><path d="M14 3 6 10l8 7z" fill="currentColor" /></svg>
        </button>
        <button className="tbtn flex h-14 w-14 items-center justify-center"
          onPointerDown={press("right", true)} onPointerUp={press("right", false)}
          onPointerLeave={press("right", false)} onPointerCancel={press("right", false)}
          aria-label="run right">
          <svg width="20" height="20" viewBox="0 0 20 20"><path d="M6 3l8 7-8 7z" fill="currentColor" /></svg>
        </button>
      </div>
      <div className="pointer-events-auto">
        <button className="tbtn font-display flex h-16 w-16 items-center justify-center rounded-full text-[10px]"
          onPointerDown={press("jump", true)} onPointerUp={press("jump", false)}
          onPointerLeave={press("jump", false)} onPointerCancel={press("jump", false)}
          aria-label="jump">
          A
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Game | null>(null);
  const [ui, setUi] = useState<UiSnapshot | null>(null);
  const [size, setSize] = useState({ w: VIEW_W * 2, h: VIEW_H * 2 });
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, setUi);
    engineRef.current = game;
    return () => {
      game.destroy();
      engineRef.current = null;
    };
  }, []);

  const fit = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    const availW = el.clientWidth - 26;
    const availH = el.clientHeight - 96;
    const s = Math.min(availW / VIEW_W, availH / VIEW_H);
    const intS = Math.floor(s);
    const final = intS >= 1 ? intS : Math.max(0.5, s);
    setSize({ w: Math.floor(VIEW_W * final), h: Math.floor(VIEW_H * final) });
  }, []);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const confirm = useCallback(() => engineRef.current?.confirm(), []);

  const screen: Screen | null = ui?.screen ?? null;

  return (
    <div className="room-bg flex h-full w-full flex-col items-center justify-center overflow-hidden px-3 py-3">
      {/* console frame */}
      <div className="flex w-full max-w-[880px] flex-1 flex-col items-center justify-center gap-2.5" style={{ minHeight: 0 }}>
        {/* top plate */}
        <div className="flex w-full max-w-[720px] items-center justify-between px-1" style={{ width: size.w + 26 }}>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 border-2 border-fog bg-raccoon" />
            <span className="font-display text-[9px] tracking-[0.2em] text-fog">ONIGIRI DASH · MONO-5</span>
          </div>
          <button
            className="kbd cursor-pointer hover:border-paper"
            onClick={() => engineRef.current?.toggleMute()}
            title="toggle sound (M)"
          >
            {ui?.muted ? "SND OFF" : "SND ON"}
          </button>
        </div>

        {/* screen */}
        <div
          ref={frameRef}
          className="crt relative shrink-0 border-[3px] border-[#3a3e4d] bg-black p-[10px] shadow-[0_0_0_3px_#0b0c0f,10px_12px_0_rgba(0,0,0,0.5)]"
          style={{ width: size.w + 26, height: size.h + 26 }}
        >
          <div className="relative" style={{ width: size.w, height: size.h }}>
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              className="block h-full w-full"
              onClick={() => {
                const s = engineRef.current && ui?.screen;
                if (s && s !== "playing") confirm();
              }}
            />
            {screen === "title" && ui && <TitleScreen ui={ui} onTap={confirm} />}
            {screen === "intro" && ui && <IntroCard ui={ui} onTap={confirm} />}
            {screen === "paused" && <PausedScreen onTap={confirm} />}
            {screen === "gameover" && ui && <GameOverScreen ui={ui} onTap={confirm} />}
            {screen === "clear" && ui && <ClearScreen ui={ui} onTap={confirm} />}
            {screen === "victory" && ui && <VictoryScreen ui={ui} onTap={confirm} />}
            {isTouch && screen === "playing" && <TouchControls engine={engineRef} />}
          </div>
        </div>

        {/* control strip */}
        <div className="hidden w-full items-center justify-center gap-6 py-1 sm:flex" style={{ maxWidth: size.w + 26 }}>
          <KeyHint k="◀ ▶ / A D" label="run" />
          <KeyHint k="SPACE" label="jump" />
          <KeyHint k="ENTER" label="start / next" />
          <KeyHint k="P" label="pause" />
          <KeyHint k="M" label="sound" />
        </div>
        <div className="font-display text-[8px] tracking-[0.25em] text-[#565b69] sm:hidden">
          MONO-5 · STAGE {ui?.stage ?? 1}/5 · {ui?.place ?? ""}
        </div>
      </div>
    </div>
  );
}
