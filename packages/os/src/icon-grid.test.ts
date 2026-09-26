import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEOMETRY,
  EMPTY_LAYOUT,
  LAYOUT_LIMITS,
  NEW_FOLDER_NAME,
  addFolder,
  addShortcut,
  addToFolder,
  cellKey,
  cellsInBox,
  cleanFolderName,
  defaultPlacement,
  dropTargetFor,
  fitPlacement,
  gridSize,
  lineUpIcons,
  moveSelection,
  nearestFreeCell,
  neighbourIn,
  nextItemId,
  parseLayout,
  pruneLayout,
  readingOrder,
  removeFromFolder,
  removeItem,
  renameFolder,
  snapToCell,
  specKeys,
  type Cells,
  type DesktopLayout,
  type GridSize,
} from "./icon-grid";

const ME = ["inbox", "forms", "account", "invites", "lift"];
const CAMP = ["tasks", "calendar", "roster", "meetings", "tree", "power"];
const CAPTAINS = ["folder:captains", "terminal"];
const TEAMS = ["team:kitchen", "team:power"];
const SPEC = { columns: [ME, CAMP, CAPTAINS], right: TEAMS };
const BIG: GridSize = { cols: 10, rows: 7 };

/** No two keys share a cell, and every cell is on the grid. */
function expectValid(cells: Cells, size: GridSize) {
  const seen = new Set<string>();
  for (const at of Object.values(cells)) {
    expect(at.c).toBeGreaterThanOrEqual(0);
    expect(at.r).toBeGreaterThanOrEqual(0);
    expect(at.c).toBeLessThan(size.cols);
    expect(at.r).toBeLessThan(size.rows);
    expect(seen.has(cellKey(at))).toBe(false);
    seen.add(cellKey(at));
  }
}

describe("gridSize and snapping", () => {
  it("counts whole cells left of the Today handle", () => {
    // 12 pad + 40 handle; (1280 - 52) / 96 = 12.8; (800 - 12) / 96 = 8.2
    expect(gridSize(1280, 800)).toEqual({ cols: 12, rows: 8 });
    expect(gridSize(10, 10)).toEqual({ cols: 1, rows: 1 });
  });

  it("snaps a point to the cell under it, kept on the grid", () => {
    expect(snapToCell(12, 12, BIG)).toEqual({ c: 0, r: 0 });
    expect(snapToCell(12 + 96 * 2 + 50, 12 + 96 + 95, BIG)).toEqual({
      c: 2,
      r: 1,
    });
    expect(snapToCell(-500, 99999, BIG)).toEqual({ c: 0, r: 6 });
  });
});

describe("defaultPlacement", () => {
  it("puts one column per group from the left, and teams down the right", () => {
    const cells = defaultPlacement(SPEC, BIG);
    expect(cells.inbox).toEqual({ c: 0, r: 0 });
    expect(cells.lift).toEqual({ c: 0, r: 4 });
    expect(cells.tasks).toEqual({ c: 1, r: 0 });
    expect(cells.power).toEqual({ c: 1, r: 5 });
    expect(cells["folder:captains"]).toEqual({ c: 2, r: 0 });
    expect(cells.terminal).toEqual({ c: 2, r: 1 });
    expect(cells["team:kitchen"]).toEqual({ c: 9, r: 0 });
    expect(cells["team:power"]).toEqual({ c: 9, r: 1 });
    expectValid(cells, BIG);
  });

  it("runs a long group into a second column and starts the next after it", () => {
    const short: GridSize = { cols: 10, rows: 4 };
    const cells = defaultPlacement(SPEC, short);
    expect(cells.lift).toEqual({ c: 1, r: 0 });
    expect(cells.tasks).toEqual({ c: 2, r: 0 });
    expect(cells.tree).toEqual({ c: 3, r: 0 });
    expect(cells["folder:captains"]).toEqual({ c: 4, r: 0 });
    expectValid(cells, short);
  });

  it("wraps a long right-hand list leftwards", () => {
    const cells = defaultPlacement(
      { columns: [], right: ["a", "b", "c"] },
      { cols: 5, rows: 2 },
    );
    expect(cells).toEqual({
      a: { c: 4, r: 0 },
      b: { c: 4, r: 1 },
      c: { c: 3, r: 0 },
    });
  });

  it("puts extra items in the first free cells", () => {
    const cells = defaultPlacement({ ...SPEC, extra: ["uf-1", "sc-1"] }, BIG);
    expect(cells["uf-1"]).toEqual({ c: 0, r: 5 });
    expect(cells["sc-1"]).toEqual({ c: 0, r: 6 });
  });

  it("never overlaps on a cramped desktop, and leaves out what cannot fit", () => {
    const tiny: GridSize = { cols: 2, rows: 3 };
    const cells = defaultPlacement(SPEC, tiny);
    expect(Object.keys(cells)).toHaveLength(6);
    expectValid(cells, tiny);
    // The right-hand side is placed first, so team folders keep their spot.
    expect(cells["team:kitchen"]).toEqual({ c: 1, r: 0 });
  });

  it("lists each key once, in the spec's order", () => {
    expect(
      specKeys({ columns: [["a", "b"], ["b"]], right: ["c", "a"] }),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("fitPlacement", () => {
  const keys = specKeys(SPEC);
  const defaults = defaultPlacement(SPEC, BIG);

  it("keeps saved cells that still fit", () => {
    const saved = { ...defaults, inbox: { c: 5, r: 5 } };
    const cells = fitPlacement(saved, keys, BIG, defaults);
    expect(cells.inbox).toEqual({ c: 5, r: 5 });
    expect(cells.forms).toEqual(defaults.forms);
  });

  it("brings an icon back on screen after a resize: its default cell, else the first free", () => {
    const saved = { ...defaults, inbox: { c: 9, r: 6 }, forms: { c: 1, r: 0 } };
    const small: GridSize = { cols: 6, rows: 6 };
    const smallDefaults = defaultPlacement(SPEC, small);
    const cells = fitPlacement(saved, keys, small, smallDefaults);
    expectValid(cells, small);
    expect(Object.keys(cells).sort()).toEqual([...keys].sort());
    // Inbox's saved cell is off screen, and its default (0,0) is free.
    expect(cells.inbox).toEqual({ c: 0, r: 0 });
    // Forms took Tasks' saved cell, so Tasks is loose; its default is taken.
    expect(cells.forms).toEqual({ c: 1, r: 0 });
    expect(cells.tasks).not.toEqual({ c: 1, r: 0 });
  });

  it("gives a program added since the save its default cell", () => {
    const { lift: _gone, ...saved } = defaults;
    const cells = fitPlacement(saved, keys, BIG, defaults);
    expect(cells.lift).toEqual(defaults.lift);
  });

  it("drops a saved cell for a key that is not there", () => {
    const saved = { ...defaults, ghost: { c: 3, r: 3 } };
    expect(fitPlacement(saved, keys, BIG, defaults).ghost).toBeUndefined();
  });

  it("never lets two keys share a saved cell", () => {
    const saved = { inbox: { c: 4, r: 4 }, forms: { c: 4, r: 4 } };
    const cells = fitPlacement(saved, keys, BIG, defaults);
    expect(cells.inbox).toEqual({ c: 4, r: 4 });
    expect(cells.forms).toEqual(defaults.forms);
    expectValid(cells, BIG);
  });
});

describe("nearestFreeCell", () => {
  it("finds the closest free cell, the first by column on a tie", () => {
    const taken = new Set(["2:2", "2:1", "1:2"]);
    expect(nearestFreeCell({ c: 2, r: 2 }, taken, BIG)).toEqual({ c: 2, r: 3 });
    expect(nearestFreeCell({ c: 0, r: 0 }, new Set(["0:0"]), BIG)).toEqual({
      c: 0,
      r: 1,
    });
  });

  it("is null on a full grid", () => {
    expect(
      nearestFreeCell({ c: 0, r: 0 }, new Set(["0:0"]), { cols: 1, rows: 1 }),
    ).toBeNull();
  });
});

describe("moveSelection", () => {
  const keys = specKeys(SPEC);
  const start = defaultPlacement(SPEC, BIG);

  it("moves the selection by whole cells and keeps its shape", () => {
    const next = moveSelection(start, keys, ["inbox", "forms"], 4, 2, BIG);
    expect(next.inbox).toEqual({ c: 4, r: 2 });
    expect(next.forms).toEqual({ c: 4, r: 3 });
    expect(next.tasks).toEqual(start.tasks);
    expectValid(next, BIG);
  });

  it("stops the move at the grid's edge instead of squashing icons", () => {
    const next = moveSelection(start, keys, ["inbox", "forms"], -3, 99, BIG);
    // Forms is one below Inbox; the move stops with Forms on the last row.
    expect(next.inbox).toEqual({ c: 0, r: 5 });
    expect(next.forms).toEqual({ c: 0, r: 6 });
  });

  it("sends an icon in the way to the nearest free cell", () => {
    // Inbox onto Tasks' cell: Tasks is pushed, and Inbox's old cell is free.
    const next = moveSelection(start, keys, ["inbox"], 1, 0, BIG);
    expect(next.inbox).toEqual({ c: 1, r: 0 });
    expect(next.tasks).toEqual({ c: 0, r: 0 });
    expect(Object.keys(next)).toHaveLength(keys.length);
    expectValid(next, BIG);
  });

  it("returns the same cells for no move, or an unknown key", () => {
    expect(moveSelection(start, keys, ["inbox"], 0.2, -0.3, BIG)).toEqual(
      start,
    );
    expect(moveSelection(start, keys, ["nope"], 2, 2, BIG)).toEqual(start);
  });
});

describe("dropTargetFor", () => {
  const cells: Cells = {
    tasks: { c: 0, r: 0 },
    "uf-1": { c: 2, r: 0 },
    "team:kitchen": { c: 3, r: 0 },
  };
  const accepts = (k: string) => k.startsWith("uf-");

  it("names the member folder a single icon is dropped on", () => {
    expect(dropTargetFor(cells, ["tasks"], 2, 0, BIG, accepts)).toBe("uf-1");
  });

  it("is null for a folder that takes no drops, empty space, several icons or off the grid", () => {
    expect(dropTargetFor(cells, ["tasks"], 3, 0, BIG, accepts)).toBeNull();
    expect(dropTargetFor(cells, ["tasks"], 1, 0, BIG, accepts)).toBeNull();
    expect(
      dropTargetFor(cells, ["tasks", "team:kitchen"], 2, 0, BIG, accepts),
    ).toBeNull();
    expect(dropTargetFor(cells, ["tasks"], -1, 0, BIG, accepts)).toBeNull();
    expect(dropTargetFor(cells, ["uf-1"], 0, 0, BIG, accepts)).toBeNull();
  });
});

describe("cellsInBox and keyboard order", () => {
  const cells: Cells = {
    a: { c: 0, r: 0 },
    b: { c: 0, r: 1 },
    c: { c: 1, r: 0 },
    d: { c: 3, r: 3 },
    e: { c: 0, r: 3 },
  };

  it("selects the icons a box touches, from either corner", () => {
    const { pad, cell } = DEFAULT_GEOMETRY;
    // Across the first column's two icons only.
    const box = {
      x0: pad + 30,
      y0: pad + 30,
      x1: pad + 60,
      y1: pad + cell.h + 30,
    };
    expect(cellsInBox(cells, box).sort()).toEqual(["a", "b"]);
    expect(
      cellsInBox(cells, {
        x0: box.x1,
        y0: box.y1,
        x1: box.x0,
        y1: box.y0,
      }).sort(),
    ).toEqual(["a", "b"]);
    // The gap between cells touches nothing.
    expect(
      cellsInBox(cells, { x0: 0, y0: 0, x1: pad + 4, y1: pad + 4 }),
    ).toEqual([]);
  });

  it("reads column by column", () => {
    expect(readingOrder(cells)).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("moves focus to the nearest icon on the arrow's side, the same column first", () => {
    expect(neighbourIn(cells, "a", "down")).toBe("b");
    expect(neighbourIn(cells, "b", "down")).toBe("e");
    expect(neighbourIn(cells, "a", "right")).toBe("c");
    expect(neighbourIn(cells, "c", "left")).toBe("a");
    expect(neighbourIn(cells, "e", "right")).toBe("d");
    expect(neighbourIn(cells, "a", "up")).toBeNull();
    expect(neighbourIn(cells, "nope", "up")).toBeNull();
  });
});

describe("parseLayout", () => {
  const good: DesktopLayout = {
    cells: { inbox: { c: 3, r: 2 }, "sc-1": { c: 0, r: 6 } },
    items: [
      { kind: "shortcut", id: "sc-1", target: "roster" },
      { kind: "folder", id: "uf-1", name: "Mine", items: ["tasks", "power"] },
    ],
  };

  it("reads a good value, dropping unknown fields", () => {
    const parsed = parseLayout({
      ...good,
      extra: 1,
      items: good.items.map((i) => ({ ...i, colour: "red" })),
    });
    expect(parsed).toEqual(good);
  });

  it.each([
    ["null", null],
    ["a string", "{}"],
    ["no items", { cells: {} }],
    ["a cell off the grid", { ...good, cells: { inbox: { c: -1, r: 0 } } }],
    ["a fractional cell", { ...good, cells: { inbox: { c: 1.5, r: 0 } } }],
    [
      "a huge cell",
      { ...good, cells: { inbox: { c: LAYOUT_LIMITS.cellIndex + 1, r: 0 } } },
    ],
    ["a key with a space", { ...good, cells: { "in box": { c: 1, r: 0 } } }],
    [
      "a prototype key",
      JSON.parse('{"cells":{"__proto__":{"c":1,"r":1}},"items":[]}'),
    ],
    ["an unknown kind", { ...good, items: [{ kind: "widget", id: "sc-2" }] }],
    [
      "a repeated id",
      {
        ...good,
        items: [
          { kind: "shortcut", id: "sc-1", target: "a" },
          { kind: "shortcut", id: "sc-1", target: "b" },
        ],
      },
    ],
    [
      "a shortcut with a folder's id",
      { ...good, items: [{ kind: "shortcut", id: "uf-1", target: "a" }] },
    ],
    [
      "a name that is too long",
      {
        ...good,
        items: [
          { kind: "folder", id: "uf-1", name: "x".repeat(25), items: [] },
        ],
      },
    ],
    [
      "an empty name",
      { ...good, items: [{ kind: "folder", id: "uf-1", name: "", items: [] }] },
    ],
    [
      "a name with a line break",
      {
        ...good,
        items: [{ kind: "folder", id: "uf-1", name: "a\nb", items: [] }],
      },
    ],
    [
      "a folder holding a program twice",
      {
        ...good,
        items: [{ kind: "folder", id: "uf-1", name: "A", items: ["a", "a"] }],
      },
    ],
    [
      "too many items",
      {
        cells: {},
        items: Array.from({ length: LAYOUT_LIMITS.items + 1 }, (_, i) => ({
          kind: "shortcut",
          id: `sc-${i + 1}`,
          target: "a",
        })),
      },
    ],
  ])("falls back to the default layout for %s", (_name, value) => {
    expect(parseLayout(value)).toBe(EMPTY_LAYOUT);
  });
});

describe("pruneLayout", () => {
  const layout: DesktopLayout = {
    cells: {
      inbox: { c: 0, r: 0 },
      audit: { c: 1, r: 0 },
      "sc-1": { c: 2, r: 0 },
      "sc-2": { c: 3, r: 0 },
      "uf-1": { c: 4, r: 0 },
    },
    items: [
      { kind: "shortcut", id: "sc-1", target: "roster" },
      { kind: "shortcut", id: "sc-2", target: "audit" },
      { kind: "folder", id: "uf-1", name: "Mine", items: ["audit", "tasks"] },
    ],
  };

  it("drops what the member lost: icons, shortcuts, and programs in folders", () => {
    const pruned = pruneLayout(layout, {
      desktopKeys: ["inbox", "roster", "tasks"],
      programIds: ["inbox", "roster", "tasks"],
    });
    expect(pruned.items).toEqual([
      { kind: "shortcut", id: "sc-1", target: "roster" },
      { kind: "folder", id: "uf-1", name: "Mine", items: ["tasks"] },
    ]);
    expect(Object.keys(pruned.cells).sort()).toEqual(["inbox", "sc-1", "uf-1"]);
  });

  it("keeps nothing when the member has no programs at all", () => {
    expect(pruneLayout(layout, { desktopKeys: [], programIds: [] })).toBe(
      EMPTY_LAYOUT,
    );
  });

  it("keeps everything the member still has", () => {
    const pruned = pruneLayout(layout, {
      desktopKeys: ["inbox", "audit"],
      programIds: ["inbox", "audit", "roster", "tasks"],
    });
    expect(pruned).toEqual(layout);
  });
});

describe("the member's own items", () => {
  it("numbers new items after the highest of their kind", () => {
    const l: DesktopLayout = {
      cells: {},
      items: [
        { kind: "shortcut", id: "sc-4", target: "a" },
        { kind: "folder", id: "uf-1", name: "A", items: [] },
      ],
    };
    expect(nextItemId(l, "shortcut")).toBe("sc-5");
    expect(nextItemId(l, "folder")).toBe("uf-2");
    expect(nextItemId(EMPTY_LAYOUT, "folder")).toBe("uf-1");
  });

  it("makes a shortcut and a folder, renames it, fills it, empties it and deletes both", () => {
    const s = addShortcut(EMPTY_LAYOUT, "roster");
    expect(s.id).toBe("sc-1");
    const f = addFolder(s.layout);
    expect(f.id).toBe("uf-1");
    expect(f.layout.items[1]).toMatchObject({ name: NEW_FOLDER_NAME });

    let l = renameFolder(f.layout, "uf-1", "  Kitchen   stuff ");
    expect(l.items[1]).toMatchObject({ name: "Kitchen stuff" });
    l = renameFolder(l, "uf-1", "   ");
    expect(l.items[1]).toMatchObject({ name: "Kitchen stuff" });

    // Dropping the shortcut in uses it up.
    l = addToFolder(
      { ...l, cells: { "sc-1": { c: 1, r: 1 } } },
      "uf-1",
      "roster",
      "sc-1",
    );
    expect(l.items).toEqual([
      { kind: "folder", id: "uf-1", name: "Kitchen stuff", items: ["roster"] },
    ]);
    expect(l.cells["sc-1"]).toBeUndefined();
    // Adding it again does not repeat it.
    l = addToFolder(l, "uf-1", "roster");
    expect(l.items[0]).toMatchObject({ items: ["roster"] });
    l = removeFromFolder(l, "uf-1", "roster");
    expect(l.items[0]).toMatchObject({ items: [] });
    l = removeItem({ ...l, cells: { "uf-1": { c: 0, r: 0 } } }, "uf-1");
    expect(l).toEqual({ cells: {}, items: [] });
  });

  it("ignores a drop on a folder that is not there", () => {
    const s = addShortcut(EMPTY_LAYOUT, "roster");
    expect(addToFolder(s.layout, "uf-9", "roster", "sc-1")).toBe(s.layout);
  });

  it("lines icons up without losing the member's items", () => {
    const f = addFolder(EMPTY_LAYOUT, "Mine");
    const l = lineUpIcons({ ...f.layout, cells: { "uf-1": { c: 5, r: 5 } } });
    expect(l).toEqual({ cells: {}, items: f.layout.items });
  });

  it("cleans a folder name to one trimmed line of 24 characters", () => {
    expect(cleanFolderName("a\tb\nc")).toBe("a b c");
    expect(cleanFolderName("x".repeat(30))).toBe("x".repeat(24));
    expect(cleanFolderName("‮evil")).toBe("evil");
    expect(cleanFolderName("   ")).toBe(NEW_FOLDER_NAME);
  });
});
