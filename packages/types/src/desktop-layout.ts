import { z } from "zod";

// A member's 404 OS desktop layout (owner's decision 14 B, 2026-09-26: stored
// on the server, one JSONB value per member, `desktop_layouts`). It holds
// where each icon sits, the member's own shortcuts and the member's own
// folders, and nothing else: program ids, grid cells and the folder names the
// member typed. No titles, no record data, no URLs
// (docs/specs/2026-09-25-404-os-console-design.md, section 7).
//
// It is checked with this schema on write (the server action refuses anything
// else) and again on read, where a bad value means the default layout. It is
// never authority: `pruneDesktopLayout` drops every id the member's manifest
// does not hold, so a forged write can at most draw an icon for a program the
// member already has.

// The rules below are the same as the desktop's own reader, `parseLayout` in
// @camp404/os (packages/os/src/icon-grid.ts), limit for limit, so the server
// never refuses a layout the desktop made, and never keeps one the desktop
// would read as the default. Change one, change both.

/** A folder name the member typed: 24 characters at most (design doc, R3). */
export const DESKTOP_FOLDER_NAME_MAX = 24;

/** Bounds, so a buggy or forged client cannot store an unbounded value. */
export const DESKTOP_LAYOUT_LIMITS = {
  /** Icons with a saved cell. */
  cells: 400,
  /** Shortcuts and folders the member made, together. */
  items: 100,
  /** Programs in one member folder. */
  folderItems: 100,
  /** The largest column or row index a cell may name. */
  maxCell: 499,
} as const;

/** Keys that would reach an object's prototype if used as a key. */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// A grid key or program id: a program id as the manifest names it (`roster`,
// `recipe-review`, `team:kitchen`), a camp folder or team folder key (below),
// or a member item id. Short and plain: no spaces, no slashes, so never a URL.
const Key = z
  .string()
  .regex(/^[A-Za-z0-9:_-]{1,64}$/)
  .refine((key) => !RESERVED_KEYS.has(key), { message: "Not a desktop key." });

/** A program a shortcut or member folder points at: a manifest program id. */
export const DesktopProgramRef = Key;

/** Any icon on the grid: a program, a folder or a member item. */
export const DesktopItemKey = Key;

/** The id the desktop gives a new shortcut: `sc-<n>`. */
export const DesktopShortcutId = z.string().regex(/^sc-\d{1,6}$/);
/** The id the desktop gives a new member folder: `uf-<n>`. */
export const DesktopMemberFolderId = z.string().regex(/^uf-\d{1,6}$/);

/** The grid key of a camp-wide folder (Teams, Kitchen, Captains). */
export function desktopFolderKey(folderId: string): string {
  return `folder:${folderId}`;
}

/** The grid key of one of the member's team folders ("Kitchen team"). */
export function desktopTeamFolderKey(team: string): string {
  return `team-folder:${team}`;
}

/** A cell on the invisible icon grid: column and row, from the top left. */
export const DesktopCell = z.object({
  c: z.number().int().min(0).max(DESKTOP_LAYOUT_LIMITS.maxCell),
  r: z.number().int().min(0).max(DESKTOP_LAYOUT_LIMITS.maxCell),
});
export type DesktopCell = z.infer<typeof DesktopCell>;

/**
 * A name as the desktop cleans it: control characters to spaces, invisible
 * format characters (a bidi override) gone, runs of white space as one space,
 * trimmed.
 */
function cleanName(value: string): string {
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One line of plain text, 1 to 24 characters (counted as the member sees
 * them, so an emoji is one). Surrounding spaces are trimmed; anything the
 * desktop would have cleaned away is refused.
 */
const FolderName = z
  .string()
  .trim()
  .min(1, "Give the folder a name.")
  .refine((name) => [...name].length <= DESKTOP_FOLDER_NAME_MAX, {
    message: `A folder name is ${DESKTOP_FOLDER_NAME_MAX} characters at most.`,
  })
  .refine((name) => cleanName(name) === name, {
    message: "A folder name is one line of plain text.",
  });

export const DesktopShortcut = z.object({
  kind: z.literal("shortcut"),
  id: DesktopShortcutId,
  target: DesktopProgramRef,
});
export type DesktopShortcut = z.infer<typeof DesktopShortcut>;

export const DesktopMemberFolder = z.object({
  kind: z.literal("folder"),
  id: DesktopMemberFolderId,
  name: FolderName,
  /** Program ids, in the member's order, each once. */
  items: z
    .array(DesktopProgramRef)
    .max(DESKTOP_LAYOUT_LIMITS.folderItems)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "A program is in a folder once.",
    }),
});
export type DesktopMemberFolder = z.infer<typeof DesktopMemberFolder>;

export const DesktopMemberItem = z.discriminatedUnion("kind", [
  DesktopShortcut,
  DesktopMemberFolder,
]);
export type DesktopMemberItem = z.infer<typeof DesktopMemberItem>;

export const DesktopLayout = z.object({
  /** Where each icon sits, by grid key. An icon with no cell goes to its default one. */
  cells: z
    .record(DesktopItemKey, DesktopCell)
    .refine(
      (cells) => Object.keys(cells).length <= DESKTOP_LAYOUT_LIMITS.cells,
      { message: "Too many icons." },
    ),
  /** The member's own shortcuts and folders, desktop only. */
  items: z
    .array(DesktopMemberItem)
    .max(DESKTOP_LAYOUT_LIMITS.items)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
      message: "Each shortcut and folder has its own id.",
    }),
});
export type DesktopLayout = z.infer<typeof DesktopLayout>;

/**
 * No saved layout: every icon in its default cell, no member items. A fresh
 * object each call, so no caller can change another's.
 */
export function emptyDesktopLayout(): DesktopLayout {
  return { cells: {}, items: [] };
}

/**
 * A stored value as a layout, or null when there is none or it is not a
 * layout (an older shape, a hand edit). The caller draws the default then.
 */
export function parseStoredDesktopLayout(raw: unknown): DesktopLayout | null {
  if (raw === null || raw === undefined) return null;
  const parsed = DesktopLayout.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What a member's manifest lets their layout name. */
export interface DesktopLayoutAllowed {
  /**
   * The grid keys of the icons the desktop draws on its own: the programs on
   * the desktop (their ids), the camp folders (`desktopFolderKey`) and the
   * member's team folders (`desktopTeamFolderKey`).
   */
  icons: Iterable<string>;
  /**
   * Every program id the member may open from anywhere (desktop, folders,
   * team folders): what a shortcut or a member folder may point at.
   */
  programs: Iterable<string>;
}

/**
 * The layout with everything the manifest does not hold taken out. Pure.
 *
 * - a shortcut to a program the member no longer has goes, with its cell;
 * - a member folder keeps its name, and loses the programs it may not hold
 *   (an empty folder stays: the member made it);
 * - a cell for any key that is neither an icon the desktop draws nor one of
 *   the surviving member items goes.
 *
 * A manifest with no programs at all (held before approval: the wallpaper
 * only) gives the empty layout, so not even a member folder is drawn.
 */
export function pruneDesktopLayout(
  layout: DesktopLayout,
  allowed: DesktopLayoutAllowed,
): DesktopLayout {
  const programs = new Set(allowed.programs);
  if (programs.size === 0) return emptyDesktopLayout();
  const items: DesktopMemberItem[] = [];
  for (const item of layout.items) {
    if (item.kind === "shortcut") {
      if (programs.has(item.target)) items.push({ ...item });
    } else {
      items.push({
        ...item,
        items: item.items.filter((id) => programs.has(id)),
      });
    }
  }
  const keys = new Set(allowed.icons);
  for (const item of items) keys.add(item.id);
  const cells: DesktopLayout["cells"] = {};
  for (const [key, cell] of Object.entries(layout.cells)) {
    if (keys.has(key)) cells[key] = { c: cell.c, r: cell.r };
  }
  return { cells, items };
}
