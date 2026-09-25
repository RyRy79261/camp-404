"use client";

import { useEffect, useRef } from "react";
import { INKBLOT } from "@/lib/content";
import {
  FLOOR_Y,
  NO_INPUT,
  fitView,
  VIEW_H,
  VIEW_W,
  cameraX,
  createGame,
  start,
  step,
  type Cat,
  type Furniture,
  type Game,
  type Input,
  type Item,
} from "@/lib/inkblot";

// INKBLOT.EXE's screen: the game's rules live in lib/inkblot.ts; this draws
// them on a canvas in the desktop's line style and feeds it keys and taps.

type Palette = {
  bg: string;
  fg: string;
  primary: string;
  muted: string;
  accent: string;
  pixel: string;
};

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--color-os-bg", "#1a1030"),
    fg: v("--color-os-fg", "#fdf2fa"),
    primary: v("--color-os-primary", "#f02fc2"),
    muted: v("--color-os-muted", "#b49ab0"),
    accent: v("--color-os-accent", "#3b82f6"),
    pixel: v("--font-silkscreen", "monospace"),
  };
}

// The black cat's coat, and its eyes: the one near-black in the palette.
const CAT_BLACK = "#050308";

function drawFurniture(ctx: CanvasRenderingContext2D, f: Furniture) {
  const { x, y, w } = f;
  const h = FLOOR_Y - y;
  ctx.beginPath();
  switch (f.kind) {
    case "sofa":
      ctx.rect(x, y, w, 18);
      ctx.rect(x + 8, y - 26, w - 16, 26);
      ctx.rect(x - 8, y - 12, 10, 30);
      ctx.rect(x + w - 2, y - 12, 10, 30);
      ctx.moveTo(x + 6, y + 18);
      ctx.lineTo(x + 6, FLOOR_Y);
      ctx.moveTo(x + w - 6, y + 18);
      ctx.lineTo(x + w - 6, FLOOR_Y);
      break;
    case "coffee-table":
    case "side-table":
    case "dining-table":
    case "desk":
      ctx.rect(x, y, w, 6);
      ctx.moveTo(x + 6, y + 6);
      ctx.lineTo(x + 6, FLOOR_Y);
      ctx.moveTo(x + w - 6, y + 6);
      ctx.lineTo(x + w - 6, FLOOR_Y);
      if (f.kind === "desk") ctx.rect(x + w - 50, y + 6, 44, 30);
      break;
    case "bookcase":
      ctx.rect(x, y, w, h);
      for (const s of f.surfaces.slice(1)) {
        ctx.moveTo(x, s.y);
        ctx.lineTo(x + w, s.y);
      }
      break;
    case "counter":
      ctx.rect(x - 4, y, w + 8, 6);
      ctx.rect(x, y + 6, w, h - 6);
      for (let d = x + w / 3; d < x + w - 1; d += w / 3) {
        ctx.moveTo(d, y + 12);
        ctx.lineTo(d, FLOOR_Y - 6);
      }
      break;
    case "fridge":
      ctx.rect(x, y, w, h);
      ctx.moveTo(x, y + 50);
      ctx.lineTo(x + w, y + 50);
      ctx.moveTo(x + w - 10, y + 16);
      ctx.lineTo(x + w - 10, y + 36);
      ctx.moveTo(x + w - 10, y + 62);
      ctx.lineTo(x + w - 10, y + 100);
      break;
    case "wall-shelf":
      ctx.rect(x, y, w, 5);
      ctx.moveTo(x + 10, y + 5);
      ctx.lineTo(x + 10, y + 20);
      ctx.lineTo(x + 24, y + 5);
      ctx.moveTo(x + w - 10, y + 5);
      ctx.lineTo(x + w - 10, y + 20);
      ctx.lineTo(x + w - 24, y + 5);
      break;
    case "chair":
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w, y - 40);
      ctx.moveTo(x + 3, y);
      ctx.lineTo(x + 3, FLOOR_Y);
      ctx.moveTo(x + w - 3, y);
      ctx.lineTo(x + w - 3, FLOOR_Y);
      break;
    case "cabinet":
      ctx.rect(x, y, w, h);
      ctx.moveTo(x + w / 2, y + 8);
      ctx.lineTo(x + w / 2, FLOOR_Y - 8);
      break;
  }
  ctx.stroke();
}

function drawItemShape(ctx: CanvasRenderingContext2D, it: Item, p: Palette) {
  const { w, h } = it;
  ctx.beginPath();
  switch (it.kind) {
    case "mug":
      ctx.rect(0, 0, w - 3, h);
      ctx.moveTo(w - 3, 3);
      ctx.arc(w - 3, h / 2, 4, -Math.PI / 2, Math.PI / 2);
      break;
    case "glass":
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w - 2, h);
      ctx.lineTo(2, h);
      ctx.closePath();
      break;
    case "vase":
      ctx.moveTo(w * 0.35, 0);
      ctx.lineTo(w * 0.65, 0);
      ctx.quadraticCurveTo(w * 0.6, h * 0.3, w, h * 0.6);
      ctx.quadraticCurveTo(w, h, w * 0.5, h);
      ctx.quadraticCurveTo(0, h, 0, h * 0.6);
      ctx.quadraticCurveTo(w * 0.4, h * 0.3, w * 0.35, 0);
      break;
    case "plant":
      ctx.moveTo(2, h - 10);
      ctx.lineTo(w - 2, h - 10);
      ctx.lineTo(w - 4, h);
      ctx.lineTo(4, h);
      ctx.closePath();
      ctx.moveTo(w / 2, h - 10);
      ctx.quadraticCurveTo(0, h - 16, 1, 1);
      ctx.moveTo(w / 2, h - 10);
      ctx.quadraticCurveTo(w, h - 18, w - 2, 3);
      ctx.moveTo(w / 2, h - 10);
      ctx.lineTo(w / 2, 4);
      break;
    case "lamp":
      ctx.moveTo(3, 12);
      ctx.lineTo(w - 3, 12);
      ctx.lineTo(w - 6, 0);
      ctx.lineTo(6, 0);
      ctx.closePath();
      ctx.moveTo(w / 2, 12);
      ctx.lineTo(w / 2, h - 3);
      ctx.moveTo(3, h);
      ctx.lineTo(w - 3, h);
      break;
    case "book":
      ctx.rect(0, 0, w, h);
      ctx.moveTo(3, h / 2);
      ctx.lineTo(w - 3, h / 2);
      break;
    case "candle":
      ctx.rect(0, 5, w, h - 5);
      break;
  }
  ctx.stroke();
  if (it.kind === "candle" && it.state !== "broken") {
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.ellipse(w / 2, 2, 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  it: Item,
  p: Palette,
  t: number,
) {
  ctx.save();
  if (it.state === "broken") {
    // Lying on its side in two pieces.
    ctx.strokeStyle = p.muted;
    ctx.translate(it.x + it.w / 2, FLOOR_Y - 1);
    ctx.rotate(Math.PI / 2 - 0.2);
    ctx.translate(-it.h, -it.w / 2);
    drawItemShape(ctx, it, p);
    ctx.strokeStyle = p.primary;
    ctx.beginPath();
    ctx.moveTo(it.w * 0.2, 0);
    ctx.lineTo(it.w * 0.5, it.h * 0.4);
    ctx.lineTo(it.w * 0.3, it.h * 0.7);
    ctx.stroke();
  } else {
    ctx.strokeStyle = p.fg;
    const wobble = it.state === "falling" ? Math.sin(t * 20) * 0.4 : 0;
    ctx.translate(it.x + it.w / 2, it.y + it.h / 2);
    ctx.rotate(
      wobble +
        (it.state === "falling" ? it.vy * 0.0008 * Math.sign(it.vx || 1) : 0),
    );
    ctx.translate(-it.w / 2, -it.h / 2);
    drawItemShape(ctx, it, p);
  }
  ctx.restore();
}

function drawCat(
  ctx: CanvasRenderingContext2D,
  cat: Cat,
  p: Palette,
  t: number,
) {
  ctx.save();
  ctx.translate(cat.x + cat.w / 2, cat.y);
  ctx.scale(cat.facing, 1);
  ctx.translate(-cat.w / 2, 0);
  ctx.fillStyle = CAT_BLACK;
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";

  const walking = cat.onGround && Math.abs(cat.vx) > 1;
  const legSwing = walking ? Math.sin(cat.step * 6) * 3 : 0;

  // Tail: a curl that sways.
  ctx.beginPath();
  ctx.moveTo(4, 12);
  const sway = Math.sin(t * 3) * 4;
  ctx.bezierCurveTo(-8, 8, -10 + sway, -8, -2 + sway, -10);
  ctx.lineWidth = 4;
  ctx.strokeStyle = CAT_BLACK;
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = p.primary;
  ctx.beginPath();
  ctx.moveTo(4, 10);
  ctx.bezierCurveTo(-7, 6, -9 + sway, -8, -2 + sway, -12);
  ctx.stroke();

  // Legs.
  ctx.lineWidth = 3;
  ctx.strokeStyle = CAT_BLACK;
  ctx.beginPath();
  const airborne = !cat.onGround;
  const legs = [7 + legSwing, 12 - legSwing, 23 + legSwing, 28 - legSwing];
  for (const lx of legs) {
    ctx.moveTo(lx, 16);
    ctx.lineTo(airborne ? lx + 3 : lx, cat.h);
  }
  ctx.stroke();

  // Body.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = p.primary;
  ctx.beginPath();
  ctx.ellipse(16, 13, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Paw swipe.
  if (cat.swipe > 0) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = CAT_BLACK;
    ctx.beginPath();
    ctx.moveTo(30, 12);
    ctx.lineTo(44, 8 + (0.2 - cat.swipe) * 30);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.primary;
    ctx.beginPath();
    ctx.arc(44, 12, 10, -0.9, 0.9);
    ctx.stroke();
  }

  // Head with ears.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = p.primary;
  ctx.fillStyle = CAT_BLACK;
  ctx.beginPath();
  ctx.moveTo(26, 2);
  ctx.lineTo(28, -8);
  ctx.lineTo(32, -1);
  ctx.lineTo(36, -1);
  ctx.lineTo(40, -8);
  ctx.lineTo(41, 3);
  ctx.quadraticCurveTo(44, 12, 33, 13);
  ctx.quadraticCurveTo(23, 12, 26, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eyes: two bright slits, blinking now and then.
  const blink = Math.sin(t * 1.3) > 0.97;
  ctx.fillStyle = p.fg;
  ctx.beginPath();
  ctx.ellipse(31, 5, 1.6, blink ? 0.3 : 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(37, 5, 1.6, blink ? 0.3 : 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Centred text, wrapped to the view's width. Returns the next line's y. */
function centred(
  ctx: CanvasRenderingContext2D,
  text: string,
  viewW: number,
  y: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > viewW - 24 && line) {
      ctx.fillText(line, viewW / 2, y);
      y += lineHeight;
      line = word;
    } else {
      line = next;
    }
  }
  ctx.fillText(line, viewW / 2, y);
  return y + lineHeight;
}

function draw(
  ctx: CanvasRenderingContext2D,
  game: Game,
  p: Palette,
  t: number,
  viewW: number,
) {
  const cam = cameraX(game, viewW);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, viewW, VIEW_H);

  // Wall: a slow grid, and a framed "404" every so often.
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gx = -((cam * 0.5) % 32);
  for (let x = gx; x < viewW; x += 32) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FLOOR_Y);
  }
  for (let y = 0; y < FLOOR_Y; y += 32) {
    ctx.moveTo(0, y);
    ctx.lineTo(viewW, y);
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(-cam, 0);
  ctx.lineWidth = 1.5;

  ctx.strokeStyle = p.muted;
  ctx.fillStyle = p.muted;
  ctx.font = `10px ${p.pixel}`;
  for (const x of [250, 880, 1480, 2080]) {
    ctx.strokeRect(x, 40, 60, 42);
    ctx.fillText("404", x + 17, 66);
  }

  ctx.strokeStyle = p.accent;
  for (const f of game.furniture) drawFurniture(ctx, f);

  // Floor.
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(game.levelWidth, FLOOR_Y);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y + 12);
  ctx.lineTo(game.levelWidth, FLOOR_Y + 12);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = 1.5;
  for (const it of game.items) drawItem(ctx, it, p, t);

  ctx.strokeStyle = p.primary;
  ctx.beginPath();
  for (const s of game.shards) {
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.vx * 0.02, s.y + s.vy * 0.02);
  }
  ctx.stroke();

  drawCat(ctx, game.cat, p, t);
  ctx.restore();

  // Score and time.
  ctx.font = `11px ${p.pixel}`;
  ctx.fillStyle = p.fg;
  ctx.textAlign = "left";
  ctx.fillText(`KNOCKED ${game.knocked}/${game.items.length}`, 12, 20);
  ctx.textAlign = "right";
  const m = Math.floor(game.seconds / 60);
  const s = Math.floor(game.seconds % 60);
  ctx.fillText(`${m}:${String(s).padStart(2, "0")}`, viewW - 12, 20);
  ctx.textAlign = "left";

  if (game.phase !== "playing") {
    ctx.fillStyle = CAT_BLACK;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(0, 0, viewW, VIEW_H);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    const narrow = viewW < 480;
    let y = 100;
    ctx.fillStyle = p.primary;
    if (game.phase === "won") {
      ctx.font = `${narrow ? 12 : 16}px ${p.pixel}`;
      y = centred(ctx, INKBLOT.won, viewW, y, 20) + 10;
      ctx.fillStyle = p.fg;
      ctx.font = `11px ${p.pixel}`;
      y =
        centred(
          ctx,
          `${game.knocked} things in ${m}:${String(s).padStart(2, "0")}`,
          viewW,
          y,
          16,
        ) + 8;
      centred(ctx, INKBLOT.again, viewW, y, 16);
    } else {
      ctx.font = `${narrow ? 22 : 28}px ${p.pixel}`;
      y = centred(ctx, INKBLOT.title, viewW, y, 30) + 6;
      ctx.fillStyle = p.fg;
      ctx.font = `11px ${p.pixel}`;
      y = centred(ctx, INKBLOT.tagline, viewW, y, 16) + 10;
      ctx.fillStyle = p.muted;
      y =
        centred(ctx, narrow ? INKBLOT.touch : INKBLOT.controls, viewW, y, 16) +
        20;
      if (Math.floor(t * 2) % 2 === 0) {
        ctx.fillStyle = p.primary;
        centred(ctx, INKBLOT.start, viewW, y, 16);
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

  function begin() {
    game.current = start(game.current);
  }

  function restart() {
    game.current = createGame();
    begin();
  }

  // Size the canvas to the window, keeping the view's shape, sharp on
  // high-density screens.
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const { scale, viewW } = fitView(width, height);
      const dpr = window.devicePixelRatio || 1;
      c.style.width = `${Math.floor(viewW * scale)}px`;
      c.style.height = `${Math.floor(VIEW_H * scale)}px`;
      c.width = Math.floor(viewW * scale * dpr);
      c.height = Math.floor(VIEW_H * scale * dpr);
      c.dataset.scale = String(scale * dpr);
      c.dataset.viewW = String(viewW);
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
    const palette = readPalette();
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // A minimised window is hidden: skip the work, keep the game.
      if (c.offsetParent !== null) {
        step(game.current, input.current, dt);
        input.current.jump = false;
        input.current.swipe = false;
        const k = Number(c.dataset.scale || 1);
        ctx.setTransform(k, 0, 0, k, 0, 0);
        draw(
          ctx,
          game.current,
          palette,
          now / 1000,
          Number(c.dataset.viewW || VIEW_W),
        );
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  function onKey(e: React.KeyboardEvent, down: boolean) {
    if (e.key === "Escape" || e.key === "Tab") return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down && key === "r") return restart();
    if (down && game.current.phase !== "playing") {
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
        if (game.current.phase !== "playing") return begin();
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
          if (game.current.phase !== "playing") begin();
        }}
        className="grid min-h-0 flex-1 place-items-center outline-none"
      >
        <canvas ref={canvas} className="block" />
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
