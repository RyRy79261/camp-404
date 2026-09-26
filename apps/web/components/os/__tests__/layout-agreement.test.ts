import { describe, expect, it } from "vitest";
import { LAYOUT_LIMITS, parseLayout } from "@camp404/os";
import {
  DESKTOP_FOLDER_NAME_MAX,
  DESKTOP_LAYOUT_LIMITS,
  parseStoredDesktopLayout,
} from "@camp404/types";

// The desktop reads a saved layout with @camp404/os's `parseLayout`; the
// server checks it with @camp404/types' Zod schema before storing it and
// again on read. Two copies of one rule, so this keeps them in step: the
// same limits, and the same answer for every stored value below.

const cell = (c: number, r: number) => ({ c, r });
const folder = (id: string, name: string, items: string[] = []) => ({
  kind: "folder",
  id,
  name,
  items,
});

const SAMPLES: [string, unknown][] = [
  ["the default", { cells: {}, items: [] }],
  [
    "cells, a shortcut and a folder",
    {
      cells: {
        roster: cell(0, 1),
        "folder:teams": cell(1, 0),
        "sc-1": cell(2, 2),
      },
      items: [
        { kind: "shortcut", id: "sc-1", target: "roster" },
        folder("uf-1", "Mine", ["tasks", "team:kitchen"]),
      ],
    },
  ],
  ["a cell past the limit", { cells: { roster: cell(500, 0) }, items: [] }],
  ["a negative cell", { cells: { roster: cell(-1, 0) }, items: [] }],
  ["a fractional cell", { cells: { roster: cell(1.5, 0) }, items: [] }],
  [
    "a prototype key",
    { cells: JSON.parse('{"__proto__": {"c": 0, "r": 0}}'), items: [] },
  ],
  ["a key with a slash", { cells: { "a/b": cell(0, 0) }, items: [] }],
  [
    "a bad shortcut id",
    { cells: {}, items: [{ kind: "shortcut", id: "x-1", target: "roster" }] },
  ],
  [
    "a folder name too long",
    {
      cells: {},
      items: [folder("uf-1", "x".repeat(DESKTOP_FOLDER_NAME_MAX + 1))],
    },
  ],
  [
    "a folder name at the limit",
    { cells: {}, items: [folder("uf-1", "x".repeat(DESKTOP_FOLDER_NAME_MAX))] },
  ],
  ["an empty folder name", { cells: {}, items: [folder("uf-1", "")] }],
  [
    "a repeated id",
    { cells: {}, items: [folder("uf-1", "A"), folder("uf-1", "B")] },
  ],
  ["an unknown kind", { cells: {}, items: [{ kind: "widget", id: "uf-1" }] }],
  ["no items array", { cells: {} }],
  ["not an object", "layout"],
  [
    "too many items",
    {
      cells: {},
      items: Array.from({ length: DESKTOP_LAYOUT_LIMITS.items + 1 }, (_, i) =>
        folder(`uf-${i + 1}`, `F${i}`),
      ),
    },
  ],
];

describe("the desktop's and the server's reading of a stored layout", () => {
  it("share the same limits", () => {
    expect({
      cells: LAYOUT_LIMITS.cells,
      items: LAYOUT_LIMITS.items,
      folderItems: LAYOUT_LIMITS.folderItems,
      maxCell: LAYOUT_LIMITS.cellIndex,
      folderName: LAYOUT_LIMITS.folderName,
    }).toEqual({
      ...DESKTOP_LAYOUT_LIMITS,
      folderName: DESKTOP_FOLDER_NAME_MAX,
    });
  });

  it.each(SAMPLES)("agree on %s", (_name, value) => {
    const server = parseStoredDesktopLayout(value);
    const desktop = parseLayout(value);
    // The desktop reads "not a layout" as the empty (default) layout.
    expect(desktop).toEqual(server ?? { cells: {}, items: [] });
  });
});
