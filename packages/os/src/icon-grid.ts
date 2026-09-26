// The desktop's icon grid, as pure rules (decision 14, ruled 2026-09-25 and
// 2026-09-26). Icons sit on an invisible grid of square cells; the member may
// move them, make shortcuts and make their own folders, and the result is one
// small value the app stores per member on the server.
//
// Generic over the app's item keys: a key is whatever the app names a desktop
// item by (a program id, a folder id, a team folder id). The member's own
// items (shortcuts and folders) get ids of their own, "sc-<n>" and "uf-<n>",
// so they can never collide with a program's key. Nothing here knows what a
// program is, who may open it, or what it is called.

/** One cell of the grid: column and row, from the top left. */
export type Cell = { c: number; r: number };

/** How many cells fit on the desktop. */
export type GridSize = { cols: number; rows: number };

/** Where each item sits, by its key. */
export type Cells = Record<string, Cell>;

/** A shortcut the member made: a second icon for a program. */
export type LayoutShortcut = { kind: "shortcut"; id: string; target: string };

/** A folder the member made: a name they typed and program ids. */
export type LayoutFolder = {
  kind: "folder";
  id: string;
  name: string;
  items: string[];
};

export type LayoutItem = LayoutShortcut | LayoutFolder;

/**
 * The member's desktop, as stored: grid cells, their shortcuts and their
 * folders. Program ids and the names they typed only: no titles, no record
 * data, no URLs.
 */
export type DesktopLayout = { cells: Cells; items: LayoutItem[] };

export const EMPTY_LAYOUT: DesktopLayout = Object.freeze({
  cells: Object.freeze({}) as Cells,
  items: Object.freeze([]) as unknown as LayoutItem[],
});

/** The bounds a stored layout must keep; the server's check uses the same. */
export const LAYOUT_LIMITS = {
  /** A folder's name, in characters (design doc, section 4). */
  folderName: 24,
  /** Shortcuts plus folders. */
  items: 100,
  /** Programs in one folder. */
  folderItems: 100,
  /** Cells stored. */
  cells: 400,
  /** The highest column or row a stored cell may name. */
  cellIndex: 499,
} as const;

/** The name a new folder gets until the member types one. */
export const NEW_FOLDER_NAME = "New folder";

/** An item key or program id: short, plain, no spaces. */
const KEY_RE = /^[A-Za-z0-9:_-]{1,64}$/;
/** Names that would reach an object's prototype if used as a key. */
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
const isKey = (v: unknown): v is string =>
  typeof v === "string" && KEY_RE.test(v) && !RESERVED.has(v);
const SHORTCUT_ID_RE = /^sc-\d{1,6}$/;
const FOLDER_ID_RE = /^uf-\d{1,6}$/;

export const isShortcutId = (id: string) => SHORTCUT_ID_RE.test(id);
export const isMemberFolderId = (id: string) => FOLDER_ID_RE.test(id);

// --- Geometry -----------------------------------------------------------------

export type GridGeometry = {
  /** A cell's size in px (96 x 96 in the prototype). */
  cell: { w: number; h: number };
  /** The gap between the desktop's edge and the first cell, in px. */
  pad: number;
  /** Px kept free on the right, for the Today handle. */
  reserveRight: number;
};

export const DEFAULT_GEOMETRY: GridGeometry = {
  cell: { w: 96, h: 96 },
  pad: 12,
  reserveRight: 40,
};

/** How many whole cells fit in a desktop of this size. At least one each. */
export function gridSize(
  width: number,
  height: number,
  geometry: GridGeometry = DEFAULT_GEOMETRY,
): GridSize {
  const { cell, pad, reserveRight } = geometry;
  return {
    cols: Math.max(1, Math.floor((width - pad - reserveRight) / cell.w)),
    rows: Math.max(1, Math.floor((height - pad) / cell.h)),
  };
}

/** A cell's top-left corner on the desktop, in px. */
export function cellOrigin(
  at: Cell,
  geometry: GridGeometry = DEFAULT_GEOMETRY,
): { x: number; y: number } {
  return {
    x: geometry.pad + at.c * geometry.cell.w,
    y: geometry.pad + at.r * geometry.cell.h,
  };
}

/** The cell a point on the desktop falls in, kept on the grid. */
export function snapToCell(
  x: number,
  y: number,
  size: GridSize,
  geometry: GridGeometry = DEFAULT_GEOMETRY,
): Cell {
  return {
    c: clamp(
      Math.floor((x - geometry.pad) / geometry.cell.w),
      0,
      size.cols - 1,
    ),
    r: clamp(
      Math.floor((y - geometry.pad) / geometry.cell.h),
      0,
      size.rows - 1,
    ),
  };
}

export const cellKey = (at: Cell) => `${at.c}:${at.r}`;

const onGrid = (at: Cell, size: GridSize) =>
  at.c >= 0 && at.r >= 0 && at.c < size.cols && at.r < size.rows;

/** The first free cell, column by column from the top left. */
function firstFree(taken: ReadonlySet<string>, size: GridSize): Cell | null {
  for (let c = 0; c < size.cols; c++) {
    for (let r = 0; r < size.rows; r++) {
      if (!taken.has(`${c}:${r}`)) return { c, r };
    }
  }
  return null;
}

/**
 * The free cell closest to `from` (fewest steps across and down); on a tie,
 * the one met first column by column. Null when the grid is full.
 */
export function nearestFreeCell(
  from: Cell,
  taken: ReadonlySet<string>,
  size: GridSize,
): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let c = 0; c < size.cols; c++) {
    for (let r = 0; r < size.rows; r++) {
      if (taken.has(`${c}:${r}`)) continue;
      const d = Math.abs(c - from.c) + Math.abs(r - from.r);
      if (d < bestD) {
        bestD = d;
        best = { c, r };
      }
    }
  }
  return best;
}

// --- The default layout ---------------------------------------------------------

/** What the default layout is made of, in order. */
export type DefaultSpec = {
  /** One list per group (Me, Camp, Captains), each a column from the left. */
  columns: readonly (readonly string[])[];
  /** Down the right-hand side, top to bottom (team folders, led first). */
  right?: readonly string[];
  /** Anything else (the member's own items): the first free cells. */
  extra?: readonly string[];
};

/** Every key the spec names, once each, in the spec's order. */
export function specKeys(spec: DefaultSpec): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [
    ...spec.columns.flat(),
    ...(spec.right ?? []),
    ...(spec.extra ?? []),
  ]) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * The starting layout: one column per group from the left, top to bottom, a
 * group too long for the screen running on into a second column; the right
 * list down the right-hand edge, wrapping leftwards; everything else in the
 * first free cells. On a desktop too small for all of it the ones that do not
 * fit get no cell (the Start menu still lists them).
 */
export function defaultPlacement(spec: DefaultSpec, size: GridSize): Cells {
  const out: Cells = {};
  const taken = new Set<string>();
  const loose: string[] = [];
  const put = (key: string, at: Cell) => {
    if (out[key]) return;
    if (!onGrid(at, size) || taken.has(cellKey(at))) {
      loose.push(key);
      return;
    }
    out[key] = at;
    taken.add(cellKey(at));
  };

  (spec.right ?? []).forEach((key, i) =>
    put(key, {
      c: size.cols - 1 - Math.floor(i / size.rows),
      r: i % size.rows,
    }),
  );
  let c = 0;
  for (const column of spec.columns) {
    if (column.length === 0) continue;
    column.forEach((key, i) =>
      put(key, { c: c + Math.floor(i / size.rows), r: i % size.rows }),
    );
    c += Math.ceil(column.length / size.rows);
  }
  for (const key of [...loose, ...(spec.extra ?? [])]) {
    if (out[key]) continue;
    const at = firstFree(taken, size);
    if (!at) break;
    out[key] = at;
    taken.add(cellKey(at));
  }
  return out;
}

/**
 * Every key in a cell of its own, on screen. A saved cell is kept while it
 * fits and nobody earlier holds it; otherwise the key goes to its default
 * cell if that is free, else to the first free cell. Used after a resize, and
 * to lay a saved layout over the current set of icons (a program added since
 * lands in its default cell or the first free one).
 */
export function fitPlacement(
  saved: Cells,
  keys: readonly string[],
  size: GridSize,
  fallback: Cells,
): Cells {
  const out: Cells = {};
  const taken = new Set<string>();
  const loose: string[] = [];
  for (const k of keys) {
    const at = own(saved, k);
    if (at && onGrid(at, size) && !taken.has(cellKey(at))) {
      out[k] = { c: at.c, r: at.r };
      taken.add(cellKey(at));
    } else {
      loose.push(k);
    }
  }
  for (const k of loose) {
    if (out[k]) continue;
    const want = own(fallback, k);
    const at =
      want && onGrid(want, size) && !taken.has(cellKey(want))
        ? want
        : firstFree(taken, size);
    if (!at) break;
    out[k] = { c: at.c, r: at.r };
    taken.add(cellKey(at));
  }
  return out;
}

// --- Moving icons -----------------------------------------------------------------

/**
 * Move the selected icons by whole cells. The selection keeps its shape: the
 * move stops at the grid's edge rather than squashing icons together. Icons
 * that were in the way go to the nearest free cell. Returns the new cells of
 * every placed key.
 */
export function moveSelection(
  placement: Cells,
  keys: readonly string[],
  ids: Iterable<string>,
  dc: number,
  dr: number,
  size: GridSize,
): Cells {
  const moving = [...new Set(ids)].filter((id) => own(placement, id));
  if (moving.length === 0) return { ...placement };
  const at = (k: string) => own(placement, k)!;
  const cs = moving.map((k) => at(k).c);
  const rs = moving.map((k) => at(k).r);
  const stepC = clamp(
    Math.round(dc),
    -Math.min(...cs),
    size.cols - 1 - Math.max(...cs),
  );
  const stepR = clamp(
    Math.round(dr),
    -Math.min(...rs),
    size.rows - 1 - Math.max(...rs),
  );
  if (stepC === 0 && stepR === 0) return { ...placement };

  const next: Cells = {};
  const taken = new Set<string>();
  for (const k of moving) {
    const to = { c: at(k).c + stepC, r: at(k).r + stepR };
    next[k] = to;
    taken.add(cellKey(to));
  }
  const rest = keys.filter((k) => !next[k] && own(placement, k));
  const displaced: string[] = [];
  for (const k of rest) {
    if (taken.has(cellKey(at(k)))) displaced.push(k);
    else {
      next[k] = at(k);
      taken.add(cellKey(at(k)));
    }
  }
  for (const k of displaced) {
    const to = nearestFreeCell(at(k), taken, size);
    if (!to) continue;
    next[k] = to;
    taken.add(cellKey(to));
  }
  return next;
}

/**
 * The item a single dragged icon lands on, when that item takes drops (a
 * member's folder). Null for a drag of several icons, a drop on empty space,
 * off the grid, or on the icon itself.
 */
export function dropTargetFor(
  placement: Cells,
  ids: Iterable<string>,
  dc: number,
  dr: number,
  size: GridSize,
  acceptsDrop: (key: string) => boolean,
): string | null {
  const list = [...new Set(ids)];
  if (list.length !== 1) return null;
  const from = own(placement, list[0]!);
  if (!from) return null;
  const to = { c: from.c + Math.round(dc), r: from.r + Math.round(dr) };
  if (!onGrid(to, size)) return null;
  for (const [key, at] of Object.entries(placement)) {
    if (key !== list[0] && at.c === to.c && at.r === to.r) {
      return acceptsDrop(key) ? key : null;
    }
  }
  return null;
}

/** Keys whose icon a box drawn on the desktop touches (px, either corner order). */
export function cellsInBox(
  placement: Cells,
  box: { x0: number; y0: number; x1: number; y1: number },
  geometry: GridGeometry = DEFAULT_GEOMETRY,
  /** Px trimmed off each side of a cell: the icon, not the gap round it. */
  inset = 8,
): string[] {
  const L = Math.min(box.x0, box.x1);
  const R = Math.max(box.x0, box.x1);
  const T = Math.min(box.y0, box.y1);
  const B = Math.max(box.y0, box.y1);
  return Object.entries(placement)
    .filter(([, at]) => {
      const o = cellOrigin(at, geometry);
      const x0 = o.x + inset;
      const y0 = o.y + inset;
      const x1 = o.x + geometry.cell.w - inset;
      const y1 = o.y + geometry.cell.h - inset;
      return x0 < R && x1 > L && y0 < B && y1 > T;
    })
    .map(([k]) => k);
}

/** Placed keys in reading order: column by column, top to bottom. */
export function readingOrder(placement: Cells): string[] {
  return Object.entries(placement)
    .sort(([, a], [, b]) => a.c - b.c || a.r - b.r)
    .map(([k]) => k);
}

export type Direction = "up" | "down" | "left" | "right";

/**
 * The icon an arrow key moves focus to: the nearest one on that side, a step
 * sideways costing twice a step straight on, so the same column (or row)
 * wins while any icon on that side stays reachable. Null at the edge.
 */
export function neighbourIn(
  placement: Cells,
  from: string,
  dir: Direction,
): string | null {
  const at = own(placement, from);
  if (!at) return null;
  let best: string | null = null;
  let bestScore = Infinity;
  let bestSide = Infinity;
  for (const k of readingOrder(placement)) {
    if (k === from) continue;
    const to = placement[k]!;
    const dc = to.c - at.c;
    const dr = to.r - at.r;
    const [ahead, side] =
      dir === "down"
        ? [dr, dc]
        : dir === "up"
          ? [-dr, dc]
          : dir === "right"
            ? [dc, dr]
            : [-dc, dr];
    if (ahead <= 0) continue;
    const score = ahead + 2 * Math.abs(side);
    if (
      score < bestScore ||
      (score === bestScore && Math.abs(side) < bestSide)
    ) {
      best = k;
      bestScore = score;
      bestSide = Math.abs(side);
    }
  }
  return best;
}

// --- The stored value -------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isIndex = (v: unknown): v is number =>
  Number.isInteger(v) &&
  (v as number) >= 0 &&
  (v as number) <= LAYOUT_LIMITS.cellIndex;

/** A folder name as the member meant it: one line, trimmed, 24 at most. */
export function cleanFolderName(
  value: string,
  fallback: string = NEW_FOLDER_NAME,
): string {
  // Control characters become spaces; invisible format characters (a bidi
  // override that makes a name read backwards) go.
  const one = value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const cut = [...one].slice(0, LAYOUT_LIMITS.folderName).join("").trim();
  return cut || fallback;
}

function validName(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length > 0 &&
    [...v].length <= LAYOUT_LIMITS.folderName &&
    cleanFolderName(v, "") === v
  );
}

/**
 * Read a stored layout. Anything malformed, out of bounds or with a repeated
 * id is refused whole, and the member gets the default layout (EMPTY_LAYOUT):
 * a half-read layout could put icons where nobody put them. Unknown fields
 * are dropped.
 */
export function parseLayout(value: unknown): DesktopLayout {
  if (!isObject(value)) return EMPTY_LAYOUT;
  const { cells, items } = value;
  if (!isObject(cells) || !Array.isArray(items)) return EMPTY_LAYOUT;

  const cellEntries = Object.entries(cells);
  if (cellEntries.length > LAYOUT_LIMITS.cells) return EMPTY_LAYOUT;
  const outCells: Cells = {};
  for (const [key, at] of cellEntries) {
    if (!isKey(key) || !isObject(at)) return EMPTY_LAYOUT;
    if (!isIndex(at.c) || !isIndex(at.r)) return EMPTY_LAYOUT;
    outCells[key] = { c: at.c, r: at.r };
  }

  if (items.length > LAYOUT_LIMITS.items) return EMPTY_LAYOUT;
  const ids = new Set<string>();
  const outItems: LayoutItem[] = [];
  for (const item of items) {
    if (!isObject(item) || typeof item.id !== "string") return EMPTY_LAYOUT;
    if (ids.has(item.id)) return EMPTY_LAYOUT;
    ids.add(item.id);
    if (item.kind === "shortcut") {
      if (!isShortcutId(item.id)) return EMPTY_LAYOUT;
      if (!isKey(item.target)) return EMPTY_LAYOUT;
      outItems.push({ kind: "shortcut", id: item.id, target: item.target });
    } else if (item.kind === "folder") {
      if (!isMemberFolderId(item.id) || !validName(item.name)) {
        return EMPTY_LAYOUT;
      }
      const list = item.items;
      if (!Array.isArray(list) || list.length > LAYOUT_LIMITS.folderItems) {
        return EMPTY_LAYOUT;
      }
      if (!list.every(isKey)) return EMPTY_LAYOUT;
      if (new Set(list).size !== list.length) return EMPTY_LAYOUT;
      outItems.push({
        kind: "folder",
        id: item.id,
        name: item.name,
        items: [...(list as string[])],
      });
    } else {
      return EMPTY_LAYOUT;
    }
  }
  return { cells: outCells, items: outItems };
}

/**
 * Keep only what the member may still have. A shortcut to a program they no
 * longer have goes; a folder keeps its name and loses those programs; a cell
 * is kept only for a key still on the desktop (`desktopKeys`, the icons the
 * manifest draws) or one of the member's own remaining items. With no
 * programs at all (held before approval: the wallpaper only) nothing is kept,
 * not even a member's folder. The server's `pruneDesktopLayout`
 * (@camp404/types) follows the same rules.
 */
export function pruneLayout(
  layout: DesktopLayout,
  allowed: {
    /** Keys the manifest draws on the desktop itself. */
    desktopKeys: Iterable<string>;
    /** Every program the member may open, in a folder or not. */
    programIds: Iterable<string>;
  },
): DesktopLayout {
  const programs = new Set(allowed.programIds);
  if (programs.size === 0) return EMPTY_LAYOUT;
  const items: LayoutItem[] = [];
  for (const item of layout.items) {
    if (item.kind === "shortcut") {
      if (programs.has(item.target)) items.push({ ...item });
    } else {
      items.push({
        ...item,
        items: [...new Set(item.items)].filter((t) => programs.has(t)),
      });
    }
  }
  const keep = new Set([...allowed.desktopKeys, ...items.map((i) => i.id)]);
  const cells: Cells = {};
  for (const [key, at] of Object.entries(layout.cells)) {
    if (keep.has(key)) cells[key] = { c: at.c, r: at.r };
  }
  return { cells, items };
}

// --- The member's own items --------------------------------------------------------

/** The next free id for a shortcut ("sc-3") or a folder ("uf-2"). */
export function nextItemId(
  layout: DesktopLayout,
  kind: LayoutItem["kind"],
): string {
  const prefix = kind === "shortcut" ? "sc-" : "uf-";
  const used = layout.items
    .filter((i) => i.id.startsWith(prefix))
    .map((i) => Number(i.id.slice(prefix.length)) || 0);
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

/** A new shortcut to `target`. It has no cell yet: it lands in the first free one. */
export function addShortcut(
  layout: DesktopLayout,
  target: string,
): { layout: DesktopLayout; id: string } {
  const id = nextItemId(layout, "shortcut");
  return {
    id,
    layout: {
      cells: layout.cells,
      items: [...layout.items, { kind: "shortcut", id, target }],
    },
  };
}

/** A new, empty folder. */
export function addFolder(
  layout: DesktopLayout,
  name: string = NEW_FOLDER_NAME,
): { layout: DesktopLayout; id: string } {
  const id = nextItemId(layout, "folder");
  return {
    id,
    layout: {
      cells: layout.cells,
      items: [
        ...layout.items,
        { kind: "folder", id, name: cleanFolderName(name), items: [] },
      ],
    },
  };
}

export function renameFolder(
  layout: DesktopLayout,
  id: string,
  name: string,
): DesktopLayout {
  return {
    cells: layout.cells,
    items: layout.items.map((i) =>
      i.kind === "folder" && i.id === id
        ? { ...i, name: cleanFolderName(name, i.name) }
        : i,
    ),
  };
}

/** Delete one of the member's own items (never a program) and its cell. */
export function removeItem(layout: DesktopLayout, id: string): DesktopLayout {
  const cells = { ...layout.cells };
  delete cells[id];
  return { cells, items: layout.items.filter((i) => i.id !== id) };
}

/**
 * Put a program in one of the member's folders. A shortcut dragged in is used
 * up (`fromShortcut`); a program's own icon stays where it was. A program
 * already in the folder is not added twice, and the shortcut still goes.
 */
export function addToFolder(
  layout: DesktopLayout,
  folderId: string,
  target: string,
  fromShortcut?: string,
): DesktopLayout {
  const folder = layout.items.find(
    (i): i is LayoutFolder => i.kind === "folder" && i.id === folderId,
  );
  if (!folder) return layout;
  if (
    !folder.items.includes(target) &&
    folder.items.length >= LAYOUT_LIMITS.folderItems
  ) {
    return layout;
  }
  const next = fromShortcut ? removeItem(layout, fromShortcut) : layout;
  return {
    cells: next.cells,
    items: next.items.map((i) =>
      i.id === folderId && i.kind === "folder" && !i.items.includes(target)
        ? { ...i, items: [...i.items, target] }
        : i,
    ),
  };
}

export function removeFromFolder(
  layout: DesktopLayout,
  folderId: string,
  target: string,
): DesktopLayout {
  return {
    cells: layout.cells,
    items: layout.items.map((i) =>
      i.id === folderId && i.kind === "folder"
        ? { ...i, items: i.items.filter((t) => t !== target) }
        : i,
    ),
  };
}

/** "Line up icons": every icon back in its default cell; items are kept. */
export function lineUpIcons(layout: DesktopLayout): DesktopLayout {
  return { cells: {}, items: layout.items };
}

/** The same layout with new cells. */
export function withCells(layout: DesktopLayout, cells: Cells): DesktopLayout {
  return { cells, items: layout.items };
}

// --- Helpers -------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number) {
  return Math.min(Math.max(n, lo), hi);
}

/** An own property only: a key named "__proto__" or "toString" is not a cell. */
function own(cells: Cells, key: string): Cell | undefined {
  return Object.prototype.hasOwnProperty.call(cells, key)
    ? cells[key]
    : undefined;
}
