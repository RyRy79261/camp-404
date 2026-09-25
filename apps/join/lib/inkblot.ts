// INKBLOT.EXE, the terminal's secret (`jinn-is-best`): a black cat jumps up
// on the furniture and pushes everything off it. This file is the game's
// rules, with no drawing, so they are tested without a browser. The world is
// in view units: the screen shows VIEW_W × VIEW_H of it at a time.

/** The widest view; a tall phone screen shows less, down to MIN_VIEW_W. */
export const VIEW_W = 640;
export const MIN_VIEW_W = 320;
export const VIEW_H = 300;
export const FLOOR_Y = 268;

const GRAVITY = 1800;
const JUMP_V = 620;
const WALK = 220;
const AIR_ACCEL = 1400;
const PUSH_V = 170;
const SWIPE_V = 280;
const SWIPE_REACH = 22;
const SLIDE_FRICTION = 3.2;

export type FurnitureKind =
  | "sofa"
  | "coffee-table"
  | "side-table"
  | "bookcase"
  | "counter"
  | "fridge"
  | "wall-shelf"
  | "dining-table"
  | "chair"
  | "desk"
  | "cabinet";

/** Something the cat can stand on: a line of furniture top, one-way. */
export type Surface = { x: number; y: number; w: number };

export type Furniture = {
  kind: FurnitureKind;
  x: number;
  /** Its top edge. */
  y: number;
  w: number;
  /** Where the cat can stand; a bookcase has one per shelf. */
  surfaces: Surface[];
};

export type ItemKind =
  | "mug"
  | "glass"
  | "vase"
  | "plant"
  | "lamp"
  | "book"
  | "candle";

export type Item = {
  kind: ItemKind;
  x: number;
  /** Its top edge; it stands on its surface, so y + h is the surface's y. */
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  state: "resting" | "sliding" | "falling" | "broken";
  /** The surface it stands or slides on, until it falls. */
  surface: Surface | null;
};

export type Shard = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

export type Cat = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  /** The furniture top it stands on; null on the floor or in the air. */
  standingOn: Surface | null;
  /** Seconds left of the paw-swipe animation. */
  swipe: number;
  /** Walk cycle, for drawing. */
  step: number;
};

export type Game = {
  phase: "title" | "playing" | "won";
  cat: Cat;
  furniture: Furniture[];
  items: Item[];
  shards: Shard[];
  levelWidth: number;
  knocked: number;
  seconds: number;
};

export type Input = {
  left: boolean;
  right: boolean;
  /** Down drops the cat through the furniture it stands on. */
  down: boolean;
  /** Edge-triggered: set on the key press, used up by one step. */
  jump: boolean;
  swipe: boolean;
};

export const NO_INPUT: Input = {
  left: false,
  right: false,
  down: false,
  jump: false,
  swipe: false,
};

const ITEM_SIZE: Record<ItemKind, { w: number; h: number }> = {
  mug: { w: 12, h: 12 },
  glass: { w: 9, h: 16 },
  vase: { w: 14, h: 24 },
  plant: { w: 16, h: 22 },
  lamp: { w: 16, h: 28 },
  book: { w: 18, h: 8 },
  candle: { w: 6, h: 16 },
};

function furniture(
  kind: FurnitureKind,
  x: number,
  y: number,
  w: number,
  shelves: number[] = [],
): Furniture {
  return {
    kind,
    x,
    y,
    w,
    surfaces: [{ x, y, w }, ...shelves.map((sy) => ({ x, y: sy, w }))],
  };
}

function item(kind: ItemKind, surface: Surface, at: number): Item {
  const { w, h } = ITEM_SIZE[kind];
  return {
    kind,
    x: surface.x + at,
    y: surface.y - h,
    w,
    h,
    vx: 0,
    vy: 0,
    state: "resting",
    surface,
  };
}

/** One flat, left to right: living room, kitchen, dining room, study. */
export function createGame(): Game {
  const sofa = furniture("sofa", 170, 230, 130);
  const coffee = furniture("coffee-table", 350, 236, 90);
  const side = furniture("side-table", 500, 218, 50);
  const bookcase = furniture("bookcase", 620, 80, 90, [140, 200]);
  const counter = furniture("counter", 800, 200, 210);
  const fridge = furniture("fridge", 1030, 124, 70);
  const wallShelf = furniture("wall-shelf", 1150, 150, 80);
  const dining = furniture("dining-table", 1290, 210, 170);
  const chair = furniture("chair", 1490, 232, 40);
  const desk = furniture("desk", 1590, 206, 140);
  const shelf2 = furniture("wall-shelf", 1770, 140, 90);
  const cabinet = furniture("cabinet", 1940, 150, 80);

  const [bcTop, bcMid, bcLow] = bookcase.surfaces as [
    Surface,
    Surface,
    Surface,
  ];
  const items: Item[] = [
    item("mug", coffee.surfaces[0]!, 30),
    item("lamp", side.surfaces[0]!, 18),
    item("book", bcLow, 40),
    item("vase", bcMid, 50),
    item("plant", bcTop, 60),
    item("glass", counter.surfaces[0]!, 40),
    item("mug", counter.surfaces[0]!, 120),
    item("book", fridge.surfaces[0]!, 30),
    item("vase", wallShelf.surfaces[0]!, 50),
    item("glass", dining.surfaces[0]!, 30),
    item("candle", dining.surfaces[0]!, 90),
    item("mug", dining.surfaces[0]!, 140),
    item("mug", desk.surfaces[0]!, 100),
    item("plant", shelf2.surfaces[0]!, 50),
    item("vase", cabinet.surfaces[0]!, 50),
  ];

  return {
    phase: "title",
    cat: {
      x: 40,
      y: FLOOR_Y - 24,
      w: 36,
      h: 24,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      standingOn: null,
      swipe: 0,
      step: 0,
    },
    furniture: [
      sofa,
      coffee,
      side,
      bookcase,
      counter,
      fridge,
      wallShelf,
      dining,
      chair,
      desk,
      shelf2,
      cabinet,
    ],
    items,
    shards: [],
    levelWidth: 2160,
    knocked: 0,
    seconds: 0,
  };
}

const overlaps = (a: { x: number; w: number }, b: { x: number; w: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w;

function moveCat(game: Game, input: Input, dt: number) {
  const cat = game.cat;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) cat.facing = dir as 1 | -1;

  if (cat.onGround) {
    cat.vx = dir * WALK;
  } else {
    // Some steering in the air, never faster than walking.
    cat.vx += dir * AIR_ACCEL * dt;
    cat.vx = Math.max(-WALK, Math.min(WALK, cat.vx));
  }

  if (input.jump && cat.onGround) {
    cat.vy = -JUMP_V;
    cat.onGround = false;
    cat.standingOn = null;
  } else if (input.down && cat.standingOn) {
    // Hop down through the furniture.
    cat.y += 2;
    cat.onGround = false;
    cat.standingOn = null;
  }

  const prevBottom = cat.y + cat.h;
  cat.vy += GRAVITY * dt;
  cat.x += cat.vx * dt;
  cat.y += cat.vy * dt;
  cat.x = Math.max(0, Math.min(game.levelWidth - cat.w, cat.x));

  // Walking off the end of a surface drops the cat.
  if (cat.standingOn && !overlaps(cat, cat.standingOn)) {
    cat.standingOn = null;
    cat.onGround = false;
  }

  const bottom = cat.y + cat.h;
  if (cat.vy >= 0) {
    // One-way tops: land only when falling through one from above.
    for (const f of game.furniture) {
      for (const s of f.surfaces) {
        if (prevBottom <= s.y + 0.5 && bottom >= s.y && overlaps(cat, s)) {
          cat.y = s.y - cat.h;
          cat.vy = 0;
          cat.onGround = true;
          cat.standingOn = s;
        }
      }
    }
    if (cat.y + cat.h >= FLOOR_Y) {
      cat.y = FLOOR_Y - cat.h;
      cat.vy = 0;
      cat.onGround = true;
      cat.standingOn = null;
    }
  }
  if (cat.standingOn) {
    cat.y = cat.standingOn.y - cat.h;
    cat.vy = 0;
  }

  cat.step += Math.abs(cat.vx) * dt * 0.06;
  cat.swipe = Math.max(0, cat.swipe - dt);
}

function pushItems(game: Game, input: Input) {
  const cat = game.cat;
  if (input.swipe) cat.swipe = 0.2;
  for (const it of game.items) {
    if (it.state !== "resting" && it.state !== "sliding") continue;
    const verticalHit = cat.y < it.y + it.h && it.y < cat.y + cat.h;
    if (!verticalHit) continue;
    // Walking into it shoves it along.
    const moving = Math.sign(cat.vx);
    if (moving !== 0 && overlaps(cat, it)) {
      const ahead = moving > 0 ? it.x > cat.x : it.x < cat.x;
      if (ahead) {
        it.vx = moving * Math.max(PUSH_V, Math.abs(cat.vx) + 20);
        it.state = "sliding";
      }
    }
    // A paw swipe reaches a little past the nose.
    if (input.swipe) {
      const reach =
        cat.facing > 0
          ? { x: cat.x + cat.w - 4, w: SWIPE_REACH }
          : { x: cat.x - SWIPE_REACH + 4, w: SWIPE_REACH };
      if (overlaps(reach, it)) {
        it.vx = cat.facing * SWIPE_V;
        it.state = "sliding";
      }
    }
  }
}

function breakItem(game: Game, it: Item) {
  it.state = "broken";
  it.y = FLOOR_Y - it.h;
  game.knocked += 1;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    game.shards.push({
      x: it.x + it.w / 2,
      y: FLOOR_Y - 2,
      vx: Math.cos(a) * (60 + i * 18),
      vy: Math.sin(a) * (120 + (i % 3) * 40),
      life: 0.7,
    });
  }
}

function moveItems(game: Game, dt: number) {
  for (const it of game.items) {
    if (it.state === "sliding") {
      it.x += it.vx * dt;
      it.vx *= Math.exp(-SLIDE_FRICTION * dt);
      const s = it.surface!;
      const centre = it.x + it.w / 2;
      if (centre < s.x || centre > s.x + s.w) {
        it.state = "falling";
        it.surface = null;
        it.vy = 0;
      } else if (Math.abs(it.vx) < 8) {
        it.vx = 0;
        it.state = "resting";
      }
    } else if (it.state === "falling") {
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (it.y + it.h >= FLOOR_Y) breakItem(game, it);
    }
  }
  for (const s of game.shards) {
    s.vy += GRAVITY * 0.5 * dt;
    s.x += s.vx * dt;
    s.y = Math.min(FLOOR_Y, s.y + s.vy * dt);
    s.life -= dt;
  }
  game.shards = game.shards.filter((s) => s.life > 0);
}

/** Start from the title card, or begin again after a win. */
export function start(game: Game): Game {
  const fresh = createGame();
  fresh.phase = "playing";
  return game.phase === "playing" ? game : fresh;
}

/** Advance the game by dt seconds. Mutates and returns it. */
export function step(game: Game, input: Input, dt: number): Game {
  if (game.phase !== "playing") return game;
  const t = Math.min(dt, 1 / 30);
  game.seconds += t;
  moveCat(game, input, t);
  pushItems(game, input);
  moveItems(game, t);
  if (game.items.every((i) => i.state === "broken")) game.phase = "won";
  return game;
}

/** Where the camera's left edge sits, following the cat. */
export function cameraX(game: Game, viewW: number = VIEW_W): number {
  const ideal = game.cat.x - viewW * 0.35;
  return Math.max(0, Math.min(game.levelWidth - viewW, ideal));
}

/**
 * How big to draw the view in a box: fill the height where the width allows,
 * showing less of the level (never under MIN_VIEW_W) on a tall screen.
 */
export function fitView(width: number, height: number) {
  const scale = Math.max(0.1, Math.min(height / VIEW_H, width / MIN_VIEW_W));
  const viewW = Math.min(VIEW_W, width / scale);
  return { scale, viewW };
}
