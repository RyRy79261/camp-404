import { describe, expect, it } from "vitest";
import {
  DESKTOP_FOLDER_NAME_MAX,
  DESKTOP_LAYOUT_LIMITS,
  DesktopLayout,
  desktopFolderKey,
  desktopTeamFolderKey,
  emptyDesktopLayout,
  parseStoredDesktopLayout,
  pruneDesktopLayout,
  type DesktopLayout as Layout,
} from "../desktop-layout";

// The per-member desktop layout (decision 14 B): what the write accepts, what
// a stored value reads as, and what survives the member's manifest.

const good: Layout = {
  cells: {
    inbox: { c: 0, r: 0 },
    [desktopFolderKey("kitchen")]: { c: 1, r: 0 },
    [desktopTeamFolderKey("power_and_lighting")]: { c: 9, r: 0 },
    "sc-1": { c: 2, r: 3 },
    "uf-2": { c: 3, r: 3 },
  },
  items: [
    { kind: "shortcut", id: "sc-1", target: "recipe-review" },
    {
      kind: "folder",
      id: "uf-2",
      name: "Daily",
      items: ["tasks", "team:kitchen"],
    },
  ],
};

describe("DesktopLayout", () => {
  it("accepts a layout of cells, shortcuts and folders", () => {
    expect(DesktopLayout.safeParse(good).success).toBe(true);
    expect(DesktopLayout.safeParse(emptyDesktopLayout()).success).toBe(true);
  });

  it("trims a folder name, and refuses an empty or over-long one", () => {
    const named = (name: string) => ({
      cells: {},
      items: [{ kind: "folder", id: "uf-1", name, items: [] }],
    });
    const parsed = DesktopLayout.parse(named("  Daily  "));
    expect(parsed.items[0]).toMatchObject({ name: "Daily" });
    expect(DesktopLayout.safeParse(named("   ")).success).toBe(false);
    expect(
      DesktopLayout.safeParse(named("x".repeat(DESKTOP_FOLDER_NAME_MAX)))
        .success,
    ).toBe(true);
    expect(
      DesktopLayout.safeParse(named("x".repeat(DESKTOP_FOLDER_NAME_MAX + 1)))
        .success,
    ).toBe(false);
    expect(DesktopLayout.safeParse(named("a\u0000b")).success).toBe(false);
    // Only what the desktop's own cleaning would leave: one line, single
    // spaces, no invisible bidi override.
    expect(DesktopLayout.safeParse(named("a  b")).success).toBe(false);
    expect(DesktopLayout.safeParse(named("a\u202eb")).success).toBe(false);
    // Counted as the member sees it: 24 emoji are 24 characters.
    expect(DesktopLayout.safeParse(named("\u{1F525}".repeat(24))).success).toBe(
      true,
    );
    expect(DesktopLayout.safeParse(named("\u{1F525}".repeat(25))).success).toBe(
      false,
    );
  });

  it("refuses a URL, a title or any other field", () => {
    const withUrl = {
      ...good,
      items: [{ kind: "shortcut", id: "sc-1", target: "/captains/audit" }],
    };
    expect(DesktopLayout.safeParse(withUrl).success).toBe(false);
    const withTitle = {
      ...good,
      items: [
        { kind: "shortcut", id: "sc-1", target: "roster", title: "Jane" },
      ],
    };
    // Zod strips unknown keys, so a title never reaches the database.
    const parsed = DesktopLayout.parse(withTitle);
    expect(parsed.items[0]).toEqual({
      kind: "shortcut",
      id: "sc-1",
      target: "roster",
    });
  });

  it("refuses member item ids the desktop does not make", () => {
    expect(
      DesktopLayout.safeParse({
        cells: {},
        items: [{ kind: "shortcut", id: "sc-abc", target: "roster" }],
      }).success,
    ).toBe(false);
  });

  it("refuses a shortcut with a folder id, and a folder with a shortcut id", () => {
    expect(
      DesktopLayout.safeParse({
        cells: {},
        items: [{ kind: "shortcut", id: "uf-1", target: "roster" }],
      }).success,
    ).toBe(false);
    expect(
      DesktopLayout.safeParse({
        cells: {},
        items: [{ kind: "folder", id: "sc-1", name: "A", items: [] }],
      }).success,
    ).toBe(false);
  });

  it("refuses two items with one id, and a program twice in a folder", () => {
    expect(
      DesktopLayout.safeParse({
        cells: {},
        items: [
          { kind: "shortcut", id: "sc-1", target: "roster" },
          { kind: "shortcut", id: "sc-1", target: "tasks" },
        ],
      }).success,
    ).toBe(false);
    expect(
      DesktopLayout.safeParse({
        cells: {},
        items: [
          { kind: "folder", id: "uf-1", name: "A", items: ["tasks", "tasks"] },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses cells off the grid, fractional cells and odd keys", () => {
    const cell = (key: string, c: number, r: number) => ({
      cells: { [key]: { c, r } },
      items: [],
    });
    expect(DesktopLayout.safeParse(cell("inbox", -1, 0)).success).toBe(false);
    expect(DesktopLayout.safeParse(cell("inbox", 1.5, 0)).success).toBe(false);
    expect(
      DesktopLayout.safeParse(
        cell("inbox", DESKTOP_LAYOUT_LIMITS.maxCell + 1, 0),
      ).success,
    ).toBe(false);
    expect(DesktopLayout.safeParse(cell("/inbox", 0, 0)).success).toBe(false);
    expect(DesktopLayout.safeParse(cell("in box", 0, 0)).success).toBe(false);
    expect(DesktopLayout.safeParse(cell("constructor", 0, 0)).success).toBe(
      false,
    );
  });

  it("never carries a __proto__ key through", () => {
    // Zod's record drops it rather than refusing the layout; either way it
    // never reaches the database or an object's prototype.
    const raw = JSON.parse(
      '{"cells":{"__proto__":{"c":0,"r":0},"inbox":{"c":1,"r":0}},"items":[]}',
    ) as unknown;
    const parsed = DesktopLayout.parse(raw);
    expect(Object.keys(parsed.cells)).toEqual(["inbox"]);
    expect(Object.getPrototypeOf(parsed.cells)).toBe(Object.prototype);
  });

  it("refuses more items or cells than the limits", () => {
    const items = Array.from(
      { length: DESKTOP_LAYOUT_LIMITS.items + 1 },
      (_, i) => ({ kind: "shortcut", id: `sc-${i}`, target: "tasks" }),
    );
    expect(DesktopLayout.safeParse({ cells: {}, items }).success).toBe(false);
    const cells = Object.fromEntries(
      Array.from({ length: DESKTOP_LAYOUT_LIMITS.cells + 1 }, (_, i) => [
        `sc-${i}`,
        { c: 0, r: 0 },
      ]),
    );
    expect(DesktopLayout.safeParse({ cells, items: [] }).success).toBe(false);
  });
});

describe("parseStoredDesktopLayout", () => {
  it("reads a good value, and none or a bad one as null (the default)", () => {
    expect(parseStoredDesktopLayout(good)).toEqual(good);
    expect(parseStoredDesktopLayout(null)).toBeNull();
    expect(parseStoredDesktopLayout(undefined)).toBeNull();
    expect(parseStoredDesktopLayout({ cells: [] })).toBeNull();
    expect(parseStoredDesktopLayout("layout")).toBeNull();
  });
});

describe("pruneDesktopLayout", () => {
  const allowed = {
    icons: ["inbox", desktopFolderKey("kitchen")],
    programs: ["inbox", "tasks", "recipes", "team:kitchen"],
  };

  it("drops a shortcut, and its cell, to a program the member does not have", () => {
    const pruned = pruneDesktopLayout(good, allowed);
    expect(pruned.items.map((i) => i.id)).toEqual(["uf-2"]);
    expect(pruned.cells).not.toHaveProperty("sc-1");
  });

  it("keeps a member folder by name and drops the programs it may not hold", () => {
    const pruned = pruneDesktopLayout(good, {
      ...allowed,
      programs: ["inbox", "tasks"],
    });
    expect(pruned.items).toEqual([
      { kind: "folder", id: "uf-2", name: "Daily", items: ["tasks"] },
    ]);
    expect(pruned.cells["uf-2"]).toEqual({ c: 3, r: 3 });
  });

  it("keeps the cells of icons the desktop draws, and drops the rest", () => {
    const pruned = pruneDesktopLayout(good, allowed);
    expect(pruned.cells).toEqual({
      inbox: { c: 0, r: 0 },
      [desktopFolderKey("kitchen")]: { c: 1, r: 0 },
      "uf-2": { c: 3, r: 3 },
    });
  });

  it("keeps a shortcut the member still has", () => {
    const pruned = pruneDesktopLayout(good, {
      ...allowed,
      programs: [...allowed.programs, "recipe-review"],
    });
    expect(pruned.items.map((i) => i.id)).toEqual(["sc-1", "uf-2"]);
    expect(pruned.cells["sc-1"]).toEqual({ c: 2, r: 3 });
  });

  it("gives the empty layout on a desktop with no programs", () => {
    expect(pruneDesktopLayout(good, { icons: [], programs: [] })).toEqual(
      emptyDesktopLayout(),
    );
  });
});
