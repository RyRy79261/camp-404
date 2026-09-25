import { describe, expect, it } from "vitest";
import {
  FLOOR_Y,
  NO_INPUT,
  createGame,
  fitView,
  start,
  step,
  type Game,
  type Input,
} from "./game";

const DT = 1 / 60;

function run(game: Game, input: Partial<Input>, seconds: number) {
  for (let t = 0; t < seconds; t += DT)
    step(game, { ...NO_INPUT, ...input }, DT);
  return game;
}

function playing(): Game {
  return start(createGame());
}

/** Put the cat standing just left of a surface's item, on that surface. */
function standBeside(game: Game, itemIndex: number) {
  const it = game.items[itemIndex]!;
  const s = it.surface!;
  game.cat.x = it.x - game.cat.w - 1;
  game.cat.y = s.y - game.cat.h;
  game.cat.standingOn = s;
  game.cat.onGround = true;
  return it;
}

describe("INKBLOT.EXE rules", () => {
  it("waits on the title card until started", () => {
    const g = createGame();
    run(g, { right: true }, 1);
    expect(g.cat.x).toBe(40);
    expect(start(g).phase).toBe("playing");
  });

  it("the cat stands on the floor and jumps off it", () => {
    const g = playing();
    run(g, {}, 0.5);
    expect(g.cat.y + g.cat.h).toBe(FLOOR_Y);
    step(g, { ...NO_INPUT, jump: true }, DT);
    run(g, {}, 0.1);
    expect(g.cat.y + g.cat.h).toBeLessThan(FLOOR_Y - 40);
  });

  it("jumps up through furniture from below and lands on top", () => {
    const g = playing();
    const table = g.furniture.find((f) => f.kind === "coffee-table")!;
    g.cat.x = table.x + 20;
    step(g, { ...NO_INPUT, jump: true }, DT);
    run(g, {}, 1);
    expect(g.cat.standingOn).toBe(table.surfaces[0]);
    expect(g.cat.y + g.cat.h).toBe(table.y);
  });

  it("hops down through the furniture it stands on", () => {
    const g = playing();
    const table = g.furniture.find((f) => f.kind === "coffee-table")!;
    g.cat.x = table.x + 20;
    step(g, { ...NO_INPUT, jump: true }, DT);
    run(g, {}, 1);
    run(g, { down: true }, 0.05);
    run(g, {}, 0.6);
    expect(g.cat.standingOn).toBeNull();
    expect(g.cat.y + g.cat.h).toBe(FLOOR_Y);
  });

  it("walking into a thing pushes it off the edge, and it breaks on the floor", () => {
    const g = playing();
    const mug = standBeside(g, 0);
    run(g, { right: true }, 0.6);
    run(g, {}, 1.5);
    expect(mug.state).toBe("broken");
    expect(g.knocked).toBe(1);
  });

  it("a paw swipe knocks a thing that is just out of reach", () => {
    const g = playing();
    const mug = standBeside(g, 0);
    g.cat.x -= 12; // not touching it
    g.cat.facing = 1;
    step(g, { ...NO_INPUT, swipe: true }, DT);
    expect(mug.state).toBe("sliding");
    run(g, {}, 2);
    expect(mug.state).toBe("broken");
  });

  it("a thing on a shelf out of the cat's height stays put", () => {
    const g = playing();
    const plant = g.items.find((i) => i.kind === "plant")!;
    g.cat.x = plant.x - g.cat.w + 4;
    run(g, { right: true }, 0.5);
    expect(plant.state).toBe("resting");
  });

  it("wins when everything is on the floor", () => {
    const g = playing();
    for (const it of g.items.slice(1)) it.state = "broken";
    standBeside(g, 0);
    run(g, { right: true }, 0.6);
    run(g, {}, 1.5);
    expect(g.phase).toBe("won");
    // A fresh start after a win.
    expect(start(g).phase).toBe("playing");
    expect(start(g).knocked).toBe(0);
  });
});

describe("fitView", () => {
  it("shows the whole view in a wide window", () => {
    expect(fitView(1280, 300).viewW).toBe(640);
  });

  it("shows less of the level, bigger, on a tall phone", () => {
    const { scale, viewW } = fitView(390, 700);
    expect(viewW).toBe(320);
    expect(scale).toBeCloseTo(390 / 320);
  });
});
