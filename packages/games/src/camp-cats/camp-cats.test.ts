import { describe, expect, it } from "vitest";
import {
  BOWL_EMPTY,
  BOWL_FULL,
  BOWL_H,
  BOWL_W,
  CAMP_CATS_COLOURS,
  CELL_H,
  CELL_W,
  MODA_FRAMES,
  NIPSTER_FRAMES,
} from "./art";
import { atlasLayout } from "./atlas";
import {
  FEED_COOLDOWN_MS,
  FEED_STORAGE_KEY,
  lastFedAt,
  mayFeed,
  memoryStorage,
  recordFeed,
  type FeedStorage,
} from "./feed-limit";
import {
  CAT_H,
  CAT_W,
  DWELL_MS,
  arrive,
  bowlRects,
  coveredFraction,
  dueWindow,
  eatSpot,
  edgeSpot,
  feed,
  finishEating,
  isRevealed,
  nearestPerch,
  nextDueAt,
  openPerches,
  perchSpot,
  refuseFeed,
  reveal,
  spawnScene,
  trackOpened,
  walkMs,
  type Rect,
  type Scene,
  type SceneContext,
  type WindowBox,
} from "./scene";

const HOUR = 60 * 60 * 1000;

function allFrames() {
  return [
    ...Object.entries(MODA_FRAMES).flatMap(([pose, list]) =>
      list.map((s, i) => ({ name: `orange ${pose} ${i}`, s })),
    ),
    ...Object.entries(NIPSTER_FRAMES).flatMap(([pose, list]) =>
      list.map((s, i) => ({ name: `tortie ${pose} ${i}`, s })),
    ),
  ];
}

describe("the two cats' sprites", () => {
  it("draws every frame the same size, rectangular, feet on the bottom row", () => {
    for (const { name, s } of allFrames()) {
      expect(s, name).toHaveLength(CELL_H);
      for (const row of s) expect(row, name).toHaveLength(CELL_W);
      expect(s[CELL_H - 1]!.replace(/\./g, ""), name).not.toBe("");
    }
    for (const bowl of [BOWL_EMPTY, BOWL_FULL]) {
      expect(bowl).toHaveLength(BOWL_H);
      for (const row of bowl) expect(row).toHaveLength(BOWL_W);
    }
  });

  it("uses only the palette's letters", () => {
    const sprites = [...allFrames().map((f) => f.s), BOWL_EMPTY, BOWL_FULL];
    for (const s of sprites) {
      for (const ch of s.join("")) {
        if (ch !== ".") expect(CAMP_CATS_COLOURS[ch], ch).toBeDefined();
      }
    }
  });

  it("outlines every row, and wears the desktop cats' outline and white", () => {
    for (const { name, s } of allFrames()) {
      for (const row of s) {
        const drawn = row.replace(/^\.+|\.+$/g, "");
        if (!drawn) continue;
        expect(drawn[0], `${name}: ${row}`).toBe("O");
        expect(drawn.at(-1), `${name}: ${row}`).toBe("O");
      }
    }
    expect(CAMP_CATS_COLOURS.O).toBe("var(--os-muted)");
    expect(CAMP_CATS_COLOURS.W).toBe("var(--os-fg)");
  });

  it("gives each cat her markings and her poses", () => {
    const orange = Object.values(MODA_FRAMES).flat().join("");
    const tortie = Object.values(NIPSTER_FRAMES).flat().join("");
    // An orange tabby: orange, darker stripes, white chin, pink nose; no black.
    for (const ch of ["A", "a", "W", "P"]) expect(orange).toContain(ch);
    expect(orange).not.toContain("K");
    // A tortoiseshell: black with orange, white chin.
    for (const ch of ["K", "A", "W"]) expect(tortie).toContain(ch);
    // Moda scratches (at least two frames); Nipster is sassy.
    expect(MODA_FRAMES.scratch.length).toBeGreaterThanOrEqual(2);
    expect(MODA_FRAMES.walk.length).toBe(4);
    expect(NIPSTER_FRAMES.sassy).toHaveLength(1);
    expect(NIPSTER_FRAMES.eat.length).toBeGreaterThanOrEqual(2);
    // The tongue out is Moda's only.
    expect(MODA_FRAMES.sit[0]!.join("")).toMatch(/P/);
    expect(BOWL_FULL.join("")).toContain("k");
    expect(BOWL_EMPTY.join("")).not.toContain("k");
  });

  it("lays each cat's frames out in one strip, pose after pose", () => {
    const { layout, total } = atlasLayout(MODA_FRAMES);
    expect(layout.walk).toEqual({ start: 0, count: 4 });
    expect(layout.sit.start).toBe(4);
    expect(total).toBe(Object.values(MODA_FRAMES).flat().length);
  });
});

describe("the six-hour limit on feeding", () => {
  it("allows a first feed, then refuses for six hours, then allows again", () => {
    const store = memoryStorage();
    const t0 = 1_700_000_000_000;
    expect(mayFeed(store, t0)).toBe(true);
    expect(recordFeed(store, t0)).toBe(true);
    expect(lastFedAt(store)).toBe(t0);
    expect(store.getItem(FEED_STORAGE_KEY)).toBe(String(t0));
    expect(mayFeed(store, t0 + 1)).toBe(false);
    expect(recordFeed(store, t0 + FEED_COOLDOWN_MS - 1)).toBe(false);
    expect(lastFedAt(store)).toBe(t0); // a refusal keeps the first time
    expect(mayFeed(store, t0 + FEED_COOLDOWN_MS)).toBe(true);
    expect(recordFeed(store, t0 + 6 * HOUR)).toBe(true);
    expect(mayFeed(store, t0 + 7 * HOUR)).toBe(false);
  });

  it("forgets a time from the future and a garbled one", () => {
    const store = memoryStorage();
    store.setItem(FEED_STORAGE_KEY, String(10 * HOUR));
    expect(mayFeed(store, 5 * HOUR)).toBe(true);
    store.setItem(FEED_STORAGE_KEY, "soup");
    expect(lastFedAt(store)).toBeNull();
    expect(mayFeed(store, 5 * HOUR)).toBe(true);
  });

  it("still feeds, once, where storage throws", () => {
    const broken: FeedStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(mayFeed(broken, 0)).toBe(true);
    expect(recordFeed(broken, 0)).toBe(true);
  });
});

const LAYER = { w: 1200, h: 700 };
const ICONS: Rect[] = [
  { x: 40, y: 40, w: 56, h: 56 },
  { x: 40, y: 140, w: 56, h: 56 },
  { x: 40, y: 240, w: 56, h: 56 },
];
function ctx(over: Partial<SceneContext> = {}): SceneContext {
  return {
    layer: LAYER,
    perches: ICONS,
    mayFeed: true,
    reducedMotion: false,
    ...over,
  };
}
const WIN: WindowBox = { id: "roster", x: 300, y: 60, w: 720, h: 520 };

describe("when the cats come", () => {
  it("waits DWELL_MS from when each window opened, for the first to get there", () => {
    const a: WindowBox = { ...WIN, id: "a" };
    const b: WindowBox = { ...WIN, id: "b" };
    let opened = trackOpened(new Map(), [a], 1000);
    opened = trackOpened(opened, [a, b], 5000);
    expect(opened.get("a")).toBe(1000);
    expect(opened.get("b")).toBe(5000);
    expect(nextDueAt(opened, [a, b], DWELL_MS)).toBe(1000 + DWELL_MS);
    expect(DWELL_MS).toBe(90_000);
    expect(dueWindow(opened, [a, b], 1000 + DWELL_MS - 1, DWELL_MS)).toBeNull();
    expect(dueWindow(opened, [a, b], 1000 + DWELL_MS, DWELL_MS)?.id).toBe("a");
    // A closed window is forgotten; reopened, it starts again.
    opened = trackOpened(opened, [b], 9000);
    opened = trackOpened(opened, [a, b], 9500);
    expect(opened.get("a")).toBe(9500);
    expect(nextDueAt(opened, [a, b], DWELL_MS)).toBe(5000 + DWELL_MS);
  });

  it("does not come to a minimised window, and waits for none when all are", () => {
    const a: WindowBox = { ...WIN, id: "a", minimized: true };
    const opened = trackOpened(new Map(), [a], 0);
    expect(nextDueAt(opened, [a], DWELL_MS)).toBeNull();
    expect(dueWindow(opened, [a], DWELL_MS * 2, DWELL_MS)).toBeNull();
    expect(nextDueAt(new Map(), [], DWELL_MS)).toBeNull();
  });
});

describe("the visit", () => {
  function walkIn(scene: Scene, c = ctx()): Scene {
    let s = scene;
    if (s.moda.leg) s = arrive(s, "moda", c);
    if (s.nipster.leg) s = arrive(s, "nipster", c);
    return s;
  }

  it("appears under the window, hidden, and goes out when the window moves", () => {
    const s = spawnScene(WIN, ctx());
    expect(s.phase).toBe("waiting");
    expect(s.bowls).toBe("none");
    for (const cat of [s.moda, s.nipster]) {
      expect(coveredFraction(cat.at, [WIN], LAYER)).toBe(1);
      expect(cat.leg).toBeUndefined();
    }
    expect(isRevealed(s, [WIN], LAYER)).toBe(false);
    // Moved a little: still hidden. Moved off: found.
    expect(isRevealed(s, [{ ...WIN, x: WIN.x + 20 }], LAYER)).toBe(false);
    expect(isRevealed(s, [{ ...WIN, y: 0, h: 200 }], LAYER)).toBe(true);
    expect(isRevealed(s, [{ ...WIN, minimized: true }], LAYER)).toBe(true);
    expect(
      isRevealed(s, [{ ...WIN, x: 0, y: 0, maximized: true }], LAYER),
    ).toBe(false);
  });

  it("sends Moda to the right-hand edge to scratch, and Nipster to the nearest icon", () => {
    const s = reveal(spawnScene(WIN, ctx()), ctx());
    expect(s.phase).toBe("going");
    expect(s.moda.pose).toBe("walk");
    expect(s.moda.at.x).toBe(LAYER.w - CAT_W);
    expect(s.moda.face).toBe(1);
    expect(s.moda.leg!.ms).toBe(walkMs(s.moda.leg!.from, s.moda.at));
    const nearest = nearestPerch(s.nipster.leg!.from, ICONS, LAYER);
    expect(s.nipster.at).toEqual(perchSpot(ICONS[nearest]!, LAYER));
    expect(s.nipster.face).toBe(-1); // the icons are to the left
    // One arrives first and takes her pose; the other is still walking.
    const half = arrive(s, "nipster", ctx());
    expect(half.phase).toBe("going");
    expect(half.nipster.pose).toBe("sassy");
    expect(half.moda.pose).toBe("walk");
    const settled = arrive(half, "moda", ctx());
    expect(settled.phase).toBe("settled");
    expect(settled.moda.pose).toBe("scratch");
    expect(settled.bowls).toBe("empty");
    // Arriving twice changes nothing.
    expect(arrive(settled, "moda", ctx())).toBe(settled);
  });

  it("puts out no bowls when the cats were fed in the last six hours", () => {
    const s = walkIn(
      reveal(spawnScene(WIN, ctx()), ctx()),
      ctx({ mayFeed: false }),
    );
    expect(s.phase).toBe("settled");
    expect(s.bowls).toBe("none");
    expect(feed(s, ctx())).toBe(s);
  });

  it("feeds: both walk to a bowl, eat, then each sits on a different icon", () => {
    const settled = walkIn(reveal(spawnScene(WIN, ctx()), ctx()));
    const going = feed(settled, ctx());
    expect(going.phase).toBe("toBowls");
    expect(going.bowls).toBe("full");
    const [left, right] = bowlRects(LAYER);
    expect(going.moda.at).toEqual(eatSpot(right));
    expect(going.nipster.at).toEqual(eatSpot(left));
    const eating = walkIn(going);
    expect(eating.phase).toBe("eating");
    expect(eating.moda.pose).toBe("eat");
    expect(eating.nipster.pose).toBe("eat");
    expect(eating.moda.face).toBe(1);
    const off = finishEating(eating, ctx());
    expect(off.phase).toBe("toPerches");
    expect(off.bowls).toBe("empty");
    expect(off.moda.at).not.toEqual(off.nipster.at);
    const done = walkIn(off);
    expect(done.phase).toBe("done");
    expect(done.bowls).toBe("none");
    expect(done.moda.pose).toBe("perch");
    expect(done.nipster.pose).toBe("perch");
    const spots = ICONS.map((i) => perchSpot(i, LAYER));
    expect(spots).toContainEqual(done.moda.at);
    expect(spots).toContainEqual(done.nipster.at);
    // Nothing moves again.
    expect(finishEating(done, ctx())).toBe(done);
    expect(feed(done, ctx())).toBe(done);
  });

  it("takes the bowls away when a feed is refused at the click", () => {
    const settled = walkIn(reveal(spawnScene(WIN, ctx()), ctx()));
    expect(refuseFeed(settled).bowls).toBe("none");
  });

  it("sits only on icons no window hides", () => {
    const over: WindowBox = { id: "w", x: 0, y: 100, w: 300, h: 120 };
    expect(openPerches(ICONS, [over], LAYER)).toEqual([ICONS[0], ICONS[2]]);
    expect(openPerches(ICONS, [{ ...over, minimized: true }], LAYER)).toEqual(
      ICONS,
    );
  });

  it("stays put with no icon to sit on", () => {
    const s = reveal(
      spawnScene(WIN, ctx({ perches: [] })),
      ctx({ perches: [] }),
    );
    expect(s.nipster.at).toEqual(s.nipster.leg!.from);
  });

  it("under reduced motion: already in place, no walking, and a feed shows the end", () => {
    const still = ctx({ reducedMotion: true });
    const s = spawnScene(WIN, still);
    expect(s.phase).toBe("settled");
    expect(s.moda.leg).toBeUndefined();
    expect(s.nipster.leg).toBeUndefined();
    expect(s.moda.at).toEqual(edgeSpot(spawnScene(WIN, ctx()).moda.at, LAYER));
    expect(s.moda.pose).toBe("scratch");
    expect(s.nipster.pose).toBe("sassy");
    expect(s.bowls).toBe("empty");
    const done = feed(s, still);
    expect(done.phase).toBe("done");
    expect(done.bowls).toBe("none");
    expect(done.moda.leg).toBeUndefined();
    expect(done.moda.pose).toBe("perch");
    expect(done.nipster.pose).toBe("perch");
  });

  it("keeps every cat and bowl inside the screen", () => {
    const tiny = { w: 300, h: 200 };
    const s = spawnScene({ ...WIN, x: 250, y: 150 }, ctx({ layer: tiny }));
    for (const cat of [s.moda, s.nipster]) {
      expect(cat.at.x).toBeGreaterThanOrEqual(0);
      expect(cat.at.x + CAT_W).toBeLessThanOrEqual(tiny.w);
      expect(cat.at.y + CAT_H).toBeLessThanOrEqual(tiny.h);
    }
    for (const b of bowlRects(LAYER)) {
      expect(b.y + b.h).toBeLessThanOrEqual(LAYER.h);
    }
  });
});
