"use client";

import { useEffect, useRef, useState } from "react";
import { INKBLOT } from "@/lib/content";
import {
  FLOOR_Y,
  NO_INPUT,
  VIEW_H,
  VIEW_W,
  cameraX,
  createGame,
  fitView,
  start,
  step,
  type Cat,
  type Furniture,
  type Game,
  type Input,
  type Item,
} from "@/lib/inkblot";
import { CAT_FRAMES, CAT_H, CAT_W } from "../inkblot-cat";
import {
  COLOURS,
  ITEMS,
  PX,
  drawSprite,
  lyingDown,
  type Sprite,
} from "../inkblot-sprites";
import { InkblotWin } from "./inkblot-win";

// INKBLOT.EXE's screen, in 16-bit pixel art (owner, 2026-09-25). The scene is
// drawn on a small canvas, one pixel per PX world units, then blown up with
// sharp square pixels. The rules live in lib/inkblot.ts.

const LOW_H = VIEW_H / PX;
const FLOOR = FLOOR_Y / PX;

type Ramp = { dark: string; mid: string; light: string };
const BLUE: Ramp = {
  dark: COLOURS.blueDark,
  mid: COLOURS.blue,
  light: COLOURS.blueLight,
};
const PINK: Ramp = {
  dark: COLOURS.pinkDark,
  mid: COLOURS.pink,
  light: COLOURS.pinkLight,
};
const PALE: Ramp = {
  dark: COLOURS.paleDark,
  mid: COLOURS.pale,
  light: COLOURS.paleLight,
};

function rect(
  ctx: CanvasRenderingContext2D,
  colour: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A shaded block: dark outline, lit top edge, shadowed bottom and right. */
function block(
  ctx: CanvasRenderingContext2D,
  ramp: Ramp,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  rect(ctx, COLOURS.outline, x, y, w, h);
  if (w < 3 || h < 3) return;
  rect(ctx, ramp.mid, x + 1, y + 1, w - 2, h - 2);
  rect(ctx, ramp.light, x + 1, y + 1, w - 2, 1);
  rect(ctx, ramp.dark, x + 1, y + h - 2, w - 2, 1);
  rect(ctx, ramp.dark, x + w - 2, y + 2, 1, h - 3);
}

function leg(
  ctx: CanvasRenderingContext2D,
  ramp: Ramp,
  x: number,
  top: number,
) {
  rect(ctx, COLOURS.outline, x, top, 3, FLOOR - top);
  rect(ctx, ramp.dark, x + 1, top, 1, FLOOR - top);
}

function drawFurniture(
  ctx: CanvasRenderingContext2D,
  f: Furniture,
  cam: number,
) {
  const x = Math.round(f.x / PX - cam);
  const y = Math.round(f.y / PX);
  const w = Math.round(f.w / PX);
  const h = FLOOR - y;
  switch (f.kind) {
    case "sofa":
      block(ctx, PINK, x + 3, y - 13, w - 6, 14);
      block(ctx, PINK, x, y, w, 9);
      block(ctx, PINK, x - 4, y - 5, 6, 14);
      block(ctx, PINK, x + w - 2, y - 5, 6, 14);
      rect(ctx, COLOURS.outline, x + 2, y + 9, 3, FLOOR - y - 9);
      rect(ctx, COLOURS.outline, x + w - 5, y + 9, 3, FLOOR - y - 9);
      break;
    case "coffee-table":
    case "side-table":
    case "dining-table":
    case "desk":
      leg(ctx, BLUE, x + 2, y + 3);
      leg(ctx, BLUE, x + w - 5, y + 3);
      if (f.kind === "desk") {
        block(ctx, BLUE, x + w - 28, y + 3, 24, 16);
        rect(ctx, COLOURS.paleLight, x + w - 17, y + 10, 3, 1);
      }
      block(ctx, BLUE, x, y, w, 4);
      break;
    case "bookcase":
      block(ctx, BLUE, x, y, w, h);
      rect(ctx, COLOURS.blueDark, x + 2, y + 2, w - 4, h - 3);
      for (const s of f.surfaces.slice(1)) {
        const sy = Math.round(s.y / PX);
        rect(ctx, COLOURS.outline, x + 1, sy, w - 2, 2);
        rect(ctx, COLOURS.blueLight, x + 2, sy, w - 4, 1);
      }
      break;
    case "counter":
      block(ctx, BLUE, x, y + 3, w, h - 3);
      for (let d = 1; d < 3; d++) {
        const dx = x + Math.round((w * d) / 3);
        rect(ctx, COLOURS.outline, dx, y + 6, 1, h - 9);
        rect(ctx, COLOURS.paleLight, dx - 3, y + 12, 1, 3);
        rect(ctx, COLOURS.paleLight, dx + 2, y + 12, 1, 3);
      }
      block(ctx, PALE, x - 2, y, w + 4, 4);
      break;
    case "fridge":
      block(ctx, PALE, x, y, w, h);
      rect(ctx, COLOURS.paleDark, x + 1, y + 25, w - 2, 1);
      rect(ctx, COLOURS.paleDark, x + w - 6, y + 8, 2, 10);
      rect(ctx, COLOURS.paleDark, x + w - 6, y + 31, 2, 16);
      break;
    case "wall-shelf":
      block(ctx, PINK, x, y, w, 3);
      // Two right-angle brackets under the plank.
      for (let i = 0; i < 6; i++) {
        rect(ctx, COLOURS.pinkDark, x + 3, y + 3 + i, 6 - i, 1);
        rect(ctx, COLOURS.pinkDark, x + w - 9 + i, y + 3 + i, 6 - i, 1);
      }
      break;
    case "chair":
      block(ctx, PINK, x + w - 3, y - 20, 3, 21);
      block(ctx, PINK, x, y, w, 3);
      leg(ctx, PINK, x + 1, y + 3);
      leg(ctx, PINK, x + w - 4, y + 3);
      break;
    case "cabinet":
      block(ctx, PINK, x, y, w, h);
      rect(ctx, COLOURS.outline, x + Math.round(w / 2), y + 3, 1, h - 5);
      rect(ctx, COLOURS.pinkLight, x + Math.round(w / 2) - 3, y + 20, 1, 4);
      rect(ctx, COLOURS.pinkLight, x + Math.round(w / 2) + 2, y + 20, 1, 4);
      break;
  }
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  it: Item,
  cam: number,
  t: number,
) {
  const sprite = ITEMS[it.kind];
  // The candle's flame flickers between two colours.
  const colours =
    it.kind === "candle" && Math.floor(t * 8) % 2 === 0
      ? { ...COLOURS, M: COLOURS.Y, Y: COLOURS.M }
      : COLOURS;
  if (it.state === "broken") {
    const lying = lyingDown(sprite);
    const x = Math.round((it.x + it.w / 2) / PX - cam - lying[0]!.length / 2);
    drawSprite(ctx, lying, x, FLOOR - lying.length, false, colours);
    // A crack through it.
    const cx = x + Math.floor(lying[0]!.length / 2);
    rect(ctx, COLOURS.outline, cx, FLOOR - lying.length, 1, lying.length);
    return;
  }
  drawSprite(
    ctx,
    sprite,
    Math.round(it.x / PX - cam),
    Math.round(it.y / PX),
    false,
    colours,
  );
}

function catFrame(cat: Cat, t: number): Sprite {
  if (cat.swipe > 0) return CAT_FRAMES.swipe[0]!;
  if (!cat.onGround)
    return (cat.vy < 0 ? CAT_FRAMES.jumpUp : CAT_FRAMES.jumpDown)[0]!;
  if (Math.abs(cat.vx) > 1) {
    const run = CAT_FRAMES.run;
    return run[Math.floor(cat.step * 0.9) % run.length]!;
  }
  const idle = CAT_FRAMES.idle;
  return idle[Math.floor(t * 2.5) % idle.length]!;
}

function drawCat(
  ctx: CanvasRenderingContext2D,
  cat: Cat,
  cam: number,
  t: number,
) {
  const x = Math.round((cat.x + cat.w / 2) / PX - CAT_W / 2 - cam);
  const y = Math.round((cat.y + cat.h) / PX) - CAT_H;
  drawSprite(ctx, catFrame(cat, t), x, y, cat.facing < 0);
}

/** The scene, on the small canvas: 1 unit = one art pixel. */
/** Where the camera is, in art pixels. */
const camPx = (game: Game, lowW: number) =>
  Math.round(cameraX(game, lowW * PX) / PX);

/**
 * The camp's photos, framed along the wall (owner, 2026-09-25): x in level
 * art pixels, and each photo's size in art pixels (wide 30 × 22, tall
 * 20 × 28), matching the files in public/inkblot/.
 */
const WIDE = { w: 30, h: 22 };
const TALL = { w: 20, h: 28 };
// Spaced along the level's 1080 art pixels, clear of the bookcase's top
// (art x 310–355), which reaches up into the frames' height.
const FRAMES = [
  { x: 20, src: "/inkblot/crew.jpg", ...WIDE },
  { x: 100, src: "/inkblot/mushrooms.jpg", ...TALL },
  { x: 170, src: "/inkblot/led-sculpture-night.jpg", ...WIDE },
  { x: 250, src: "/inkblot/neon-404.jpg", ...WIDE },
  { x: 380, src: "/inkblot/string-star.jpg", ...WIDE },
  { x: 460, src: "/inkblot/lounge-2019.jpg", ...WIDE },
  { x: 540, src: "/inkblot/led-sculpture-build.jpg", ...TALL },
  { x: 620, src: "/inkblot/lantern.jpg", ...TALL },
  { x: 700, src: "/inkblot/lounge-pink.jpg", ...WIDE },
  { x: 800, src: "/inkblot/welcome-home.jpg", ...WIDE },
  { x: 930, src: "/inkblot/crew-film.jpg", ...WIDE },
] as const;
const FRAME_Y = 14;

/** Back layer, on the small canvas: wall, frames, skirting, floor. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  game: Game,
  lowW: number,
) {
  const cam = camPx(game, lowW);

  // Wallpaper: a dotted pattern that drifts slower than the room.
  rect(ctx, COLOURS.wall, 0, 0, lowW, FLOOR);
  const drift = Math.round(cam * 0.5) % 8;
  ctx.fillStyle = COLOURS.wallDot;
  for (let y = 4; y < FLOOR - 4; y += 8) {
    for (let x = -drift + ((y / 8) % 2) * 4; x < lowW; x += 8)
      ctx.fillRect(x, y, 1, 1);
  }

  // Frames for the camp photos (owner, 2026-09-25); the photos themselves are drawn
  // sharp between the layers, not in pixels.
  for (const f of FRAMES) {
    const fx = f.x - cam;
    const w = f.w + 6;
    const h = f.h + 6;
    if (fx < -w || fx > lowW) continue;
    rect(ctx, COLOURS.outline, fx, FRAME_Y, w, h);
    rect(ctx, COLOURS.pinkDark, fx + 1, FRAME_Y + 1, w - 2, h - 2);
    rect(ctx, COLOURS.pinkLight, fx + 1, FRAME_Y + 1, w - 2, 1);
    rect(ctx, COLOURS.pinkLight, fx + 1, FRAME_Y + 1, 1, h - 2);
    rect(ctx, COLOURS.outline, fx + 2, FRAME_Y + 2, w - 4, h - 4);
  }

  // Skirting board and floorboards.
  rect(ctx, COLOURS.skirting, 0, FLOOR - 3, lowW, 3);
  rect(ctx, COLOURS.floor, 0, FLOOR, lowW, LOW_H - FLOOR);
  rect(ctx, COLOURS.floorEdge, 0, FLOOR, lowW, 1);
  rect(ctx, COLOURS.floorLine, 0, FLOOR + 6, lowW, 1);
  rect(ctx, COLOURS.floorLine, 0, FLOOR + 11, lowW, 1);
  for (let row = 0; row < 2; row++) {
    const off = (row * 12 - cam) % 24;
    for (let x = off - 24; x < lowW; x += 24) {
      rect(ctx, COLOURS.floorLine, x, FLOOR + 1 + row * 6, 1, 5);
    }
  }
}

/** Front layer, on a second small canvas: furniture, things, the cat. */
function drawForeground(
  ctx: CanvasRenderingContext2D,
  game: Game,
  t: number,
  lowW: number,
) {
  const cam = camPx(game, lowW);
  ctx.clearRect(0, 0, lowW, LOW_H);
  for (const f of game.furniture) drawFurniture(ctx, f, cam);
  for (const it of game.items) drawItem(ctx, it, cam, t);

  for (const s of game.shards) {
    rect(ctx, COLOURS.W, s.x / PX - cam, s.y / PX, 1, 1);
  }

  drawCat(ctx, game.cat, cam, t);
}

/** Centred text, wrapped to a width. Returns the next line's y. */
function centred(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  y: number,
  lineHeight: number,
) {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width * 0.92 && line) {
      ctx.fillText(line, width / 2, y);
      y += lineHeight;
      line = word;
    } else {
      line = next;
    }
  }
  ctx.fillText(line, width / 2, y);
  return y + lineHeight;
}

/** Score, time and the title and win cards, drawn sharp over the pixels. */
function drawHud(
  ctx: CanvasRenderingContext2D,
  game: Game,
  t: number,
  width: number,
  height: number,
  n: number,
  font: string,
) {
  const px = (size: number) => `${Math.round(size * n)}px ${font}`;
  const m = Math.floor(game.seconds / 60);
  const s = Math.floor(game.seconds % 60);
  const time = `${m}:${String(s).padStart(2, "0")}`;

  ctx.font = px(6);
  ctx.fillStyle = COLOURS.W;
  ctx.textAlign = "left";
  ctx.fillText(`KNOCKED ${game.knocked}/${game.items.length}`, 6 * n, 10 * n);
  ctx.textAlign = "right";
  ctx.fillText(time, width - 6 * n, 10 * n);

  if (game.phase === "title" || game.phase === "won") {
    ctx.fillStyle = COLOURS.K;
    ctx.globalAlpha = 0.78;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    const narrow = width / n < 240;
    let y = 42 * n;
    ctx.fillStyle = COLOURS.M;
    if (game.phase === "won") {
      // The win screen is HTML over the canvas (InkblotWin).
    } else {
      ctx.font = px(narrow ? 12 : 15);
      y = centred(ctx, INKBLOT.title, width, y, 16 * n) + 4 * n;
      ctx.fillStyle = COLOURS.W;
      ctx.font = px(6);
      y = centred(ctx, INKBLOT.tagline, width, y, 9 * n) + 6 * n;
      ctx.fillStyle = COLOURS.frame;
      y =
        centred(
          ctx,
          narrow ? INKBLOT.touch : INKBLOT.controls,
          width,
          y,
          9 * n,
        ) +
        10 * n;
      if (Math.floor(t * 2) % 2 === 0) {
        ctx.fillStyle = COLOURS.M;
        centred(ctx, INKBLOT.start, width, y, 9 * n);
      }
    }
    ctx.textAlign = "left";
  }
}

const KEYS: Record<string, keyof Input> = {
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right",
  ArrowDown: "down",
  s: "down",
  ArrowUp: "jump",
  w: "jump",
  " ": "jump",
  x: "swipe",
  j: "swipe",
};

export function InkblotWindow() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>(createGame());
  const input = useRef<Input>({ ...NO_INPUT });
  const [won, setWon] = useState<{ seconds: number; knocked: number } | null>(
    null,
  );

  function begin() {
    game.current = start(game.current);
  }

  function restart() {
    game.current = createGame();
    setWon(null);
    begin();
    wrap.current?.focus({ preventScroll: true });
  }

  // Size the canvas to the window: a whole number of screen pixels per art
  // pixel, so every pixel is the same square.
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const { scale, viewW } = fitView(width, height);
      const dpr = window.devicePixelRatio || 1;
      const n = Math.max(1, Math.floor(scale * dpr * PX));
      const lowW = Math.floor(viewW / PX);
      c.width = lowW * n;
      c.height = LOW_H * n;
      c.style.width = `${c.width / dpr}px`;
      c.style.height = `${c.height / dpr}px`;
      c.dataset.n = String(n);
      c.dataset.lowW = String(lowW);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    // Development only: lets the browser tests finish the level at once.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __inkblot?: () => Game }).__inkblot = () =>
        game.current;
    }
    const photos = FRAMES.map((f) => {
      const img = new Image();
      img.src = f.src;
      return img;
    });
    const low = document.createElement("canvas");
    const lowCtx = low.getContext("2d")!;
    const front = document.createElement("canvas");
    const frontCtx = front.getContext("2d")!;
    const font =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-silkscreen")
        .trim() || "monospace";
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // A minimised window is hidden: skip the work, keep the game.
      if (c.offsetParent !== null) {
        const before = game.current.phase;
        step(game.current, input.current, dt);
        if (before === "playing" && game.current.phase === "won") {
          setWon({
            seconds: game.current.seconds,
            knocked: game.current.knocked,
          });
        }
        input.current.jump = false;
        input.current.swipe = false;
        const lowW = Number(c.dataset.lowW || VIEW_W / PX);
        const n = Number(c.dataset.n || 1);
        for (const layer of [low, front]) {
          if (layer.width !== lowW || layer.height !== LOW_H) {
            layer.width = lowW;
            layer.height = LOW_H;
          }
        }
        const t = now / 1000;
        drawBackground(lowCtx, game.current, lowW);
        drawForeground(frontCtx, game.current, t, lowW);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(low, 0, 0, c.width, c.height);
        // The photos, sharp at screen resolution, between the two layers.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        const cam = camPx(game.current, lowW);
        FRAMES.forEach((f, i) => {
          const img = photos[i]!;
          const fx = f.x - cam;
          if (fx < -f.w - 6 || fx > lowW) return;
          if (!img.complete || img.naturalWidth === 0) return;
          ctx.drawImage(img, (fx + 3) * n, (FRAME_Y + 3) * n, f.w * n, f.h * n);
        });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(front, 0, 0, c.width, c.height);
        drawHud(ctx, game.current, t, c.width, c.height, n, font);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  function onKey(e: React.KeyboardEvent, down: boolean) {
    if (e.key === "Escape" || e.key === "Tab") return;
    // Typing initials on the win screen is not playing. A focused pad button
    // is, so only the win screen is left out.
    if ((e.target as HTMLElement).closest("[data-inkblot-win]")) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down && key === "r") return restart();
    if (game.current.phase === "won") return;
    if (down && game.current.phase === "title") {
      e.preventDefault();
      return begin();
    }
    const action = KEYS[key];
    if (!action) return;
    e.preventDefault();
    if (action === "jump" || action === "swipe") {
      if (down && !e.repeat) input.current[action] = true;
    } else {
      input.current[action] = down;
    }
  }

  function hold(action: keyof Input) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        if (game.current.phase === "title") return begin();
        if (game.current.phase === "won") return;
        input.current[action] = true;
      },
      onPointerUp: () => {
        if (action === "left" || action === "right" || action === "down") {
          input.current[action] = false;
        }
      },
      onPointerLeave: () => {
        if (action === "left" || action === "right" || action === "down") {
          input.current[action] = false;
        }
      },
    };
  }

  const pad =
    "grid h-11 min-w-11 select-none place-items-center border border-os-line bg-os-panel px-3 font-pixel text-xs uppercase text-os-fg active:border-os-primary active:bg-os-primary active:text-os-primary-fg touch-none";

  return (
    // Keys are heard anywhere in the window, so a tapped pad button keeps
    // the keyboard working.
    <div
      className="flex h-full flex-col bg-os-bg"
      onKeyDown={(e) => onKey(e, true)}
      onKeyUp={(e) => onKey(e, false)}
    >
      <div
        ref={wrap}
        tabIndex={0}
        data-autofocus
        role="application"
        aria-label={`${INKBLOT.title}. ${INKBLOT.tagline} ${INKBLOT.controls}`}
        onPointerDown={() => {
          if (game.current.phase === "title") begin();
        }}
        className="relative grid min-h-0 flex-1 place-items-center outline-none"
      >
        <canvas ref={canvas} className="block [image-rendering:pixelated]" />
        {won && (
          <InkblotWin
            seconds={won.seconds}
            knocked={won.knocked}
            onAgain={restart}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-os-line p-2">
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Left"
            className={pad}
            {...hold("left")}
          >
            ◀
          </button>
          <button
            type="button"
            aria-label="Right"
            className={pad}
            {...hold("right")}
          >
            ▶
          </button>
          <button
            type="button"
            aria-label="Down"
            className={pad}
            {...hold("down")}
          >
            ▼
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Swipe"
            className={pad}
            {...hold("swipe")}
          >
            Paw
          </button>
          <button
            type="button"
            aria-label="Jump"
            className={pad}
            {...hold("jump")}
          >
            Jump
          </button>
        </div>
      </div>
    </div>
  );
}
