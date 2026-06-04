// Pure data model + reducers for the home control-panel Customize v2 layout.
// A layout is an ordered list of EDITABLE sections (the viewer's accessible
// tiles, arranged into rank groups / custom groups / a loose ungrouped bucket).
// Locked rank groups are NEVER stored here — they are re-derived from the
// catalogue at render time and pinned at the bottom (clearance is a server-side
// boundary; their tiles never reach the client). Everything here is pure and
// unit-tested; the client hook (use-home-layout.ts) wraps it with localStorage.

export interface RankSection {
  kind: "rank";
  /** Catalogue group id (e.g. "captain") — identity (icon/tone/name) is looked
   *  up from the catalogue, never stored. */
  id: string;
  tiles: string[];
}
export interface CustomSection {
  kind: "custom";
  id: string;
  title: string;
  tiles: string[];
}
export interface LooseSection {
  kind: "loose";
  tiles: string[];
}
export type Section = RankSection | CustomSection | LooseSection;

export interface HomeLayout {
  v: 2;
  sections: Section[];
}

/** Minimal shape the reducers need from the tile catalogue. */
export interface LayoutGroup {
  id: string;
  tiles: { id: string }[];
}

/** A stable key for a section (for DnD container ids + React keys). */
export function sectionKey(section: Section): string {
  return section.kind === "loose" ? "loose" : `${section.kind}:${section.id}`;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Validate a parsed localStorage payload as a HomeLayout (defensive). */
export function isHomeLayout(value: unknown): value is HomeLayout {
  if (!value || typeof value !== "object") return false;
  const obj = value as { v?: unknown; sections?: unknown };
  if (obj.v !== 2 || !Array.isArray(obj.sections)) return false;
  return obj.sections.every((s) => {
    if (!s || typeof s !== "object") return false;
    const sec = s as { kind?: unknown; id?: unknown; title?: unknown; tiles?: unknown };
    if (!isStringArray(sec.tiles)) return false;
    if (sec.kind === "rank") return typeof sec.id === "string";
    if (sec.kind === "custom")
      return typeof sec.id === "string" && typeof sec.title === "string";
    if (sec.kind === "loose") return true;
    return false;
  });
}

/** First-run layout: one rank section per UNLOCKED catalogue group, in order. */
export function seedLayout(
  catalogue: LayoutGroup[],
  lockedGroupIds: readonly string[],
): HomeLayout {
  const locked = new Set(lockedGroupIds);
  return {
    v: 2,
    sections: catalogue
      .filter((g) => !locked.has(g.id))
      .map((g) => ({
        kind: "rank" as const,
        id: g.id,
        tiles: g.tiles.map((t) => t.id),
      })),
  };
}

/**
 * Reconcile a saved layout against the live catalogue + clearance. Guarantees:
 * locked-group tiles never appear in the editable area; unknown/removed tiles
 * are dropped; new/newly-unlocked tiles land in their home rank section (else
 * loose); each tile appears once; empty custom/loose sections are dropped while
 * empty rank sections are kept (so they stay drop targets).
 */
export function reconcileLayout(
  saved: HomeLayout,
  catalogue: LayoutGroup[],
  lockedGroupIds: readonly string[],
): HomeLayout {
  const locked = new Set(lockedGroupIds);
  const unlockedGroups = catalogue.filter((g) => !locked.has(g.id));

  // Tiles the viewer is allowed to arrange + the home group of each.
  const homeGroupOf = new Map<string, string>();
  for (const g of unlockedGroups) {
    for (const t of g.tiles) homeGroupOf.set(t.id, g.id);
  }
  const allowed = new Set(homeGroupOf.keys());

  const seen = new Set<string>();
  const take = (ids: string[]) =>
    ids.filter((id) => allowed.has(id) && !seen.has(id) && (seen.add(id), true));

  // Keep saved sections, scrubbed to allowed/unique tiles. Drop rank sections
  // whose group is gone/locked; drop empty custom/loose; keep empty rank.
  const sections: Section[] = [];
  for (const s of saved.sections) {
    if (s.kind === "rank") {
      if (locked.has(s.id) || !unlockedGroups.some((g) => g.id === s.id)) continue;
      sections.push({ kind: "rank", id: s.id, tiles: take(s.tiles) });
    } else if (s.kind === "custom") {
      const tiles = take(s.tiles);
      if (tiles.length > 0) sections.push({ kind: "custom", id: s.id, title: s.title, tiles });
    } else {
      const tiles = take(s.tiles);
      if (tiles.length > 0) sections.push({ kind: "loose", tiles });
    }
  }

  // Seed a rank section for any unlocked group that lost its section entirely.
  for (const g of unlockedGroups) {
    if (!sections.some((s) => s.kind === "rank" && s.id === g.id)) {
      const tiles = take(g.tiles.map((t) => t.id));
      sections.push({ kind: "rank", id: g.id, tiles });
    }
  }

  // Place orphan tiles (allowed but unseen) into their home rank section if it
  // exists, else the loose bucket.
  const orphans = [...allowed].filter((id) => !seen.has(id));
  if (orphans.length > 0) {
    let loose = sections.find((s): s is LooseSection => s.kind === "loose");
    for (const id of orphans) {
      const home = homeGroupOf.get(id);
      const rank = sections.find(
        (s): s is RankSection => s.kind === "rank" && s.id === home,
      );
      if (rank) rank.tiles.push(id);
      else {
        if (!loose) {
          loose = { kind: "loose", tiles: [] };
          sections.push(loose);
        }
        loose.tiles.push(id);
      }
      seen.add(id);
    }
  }

  return { v: 2, sections };
}

function withoutTile(sections: Section[], tileId: string): Section[] {
  return sections.map((s) => ({ ...s, tiles: s.tiles.filter((t) => t !== tileId) }));
}

/**
 * Move a tile to `toKey` (a sectionKey) at `toIndex` (end if omitted/out of
 * range). Removes it from wherever it currently is. No-op if the tile or the
 * target section is unknown.
 */
export function moveTile(
  sections: Section[],
  tileId: string,
  toKey: string,
  toIndex?: number,
): Section[] {
  if (!sections.some((s) => sectionKey(s) === toKey)) return sections;
  if (!sections.some((s) => s.tiles.includes(tileId))) return sections;
  const stripped = withoutTile(sections, tileId);
  return stripped.map((s) => {
    if (sectionKey(s) !== toKey) return s;
    const tiles = [...s.tiles];
    const at = toIndex == null || toIndex < 0 || toIndex > tiles.length ? tiles.length : toIndex;
    tiles.splice(at, 0, tileId);
    return { ...s, tiles };
  });
}

/**
 * The index at which a dragged tile should land in its target section,
 * computed with the active tile EXCLUDED — because a cross-container dragOver
 * has already inserted it into the target, so counting it would land the drop
 * one slot past the live preview. `overIsContainer` (the pointer is over the
 * empty container, not a tile) appends.
 */
export function dropIndex(
  targetTiles: string[],
  activeId: string,
  overId: string,
  overIsContainer: boolean,
): number {
  const without = targetTiles.filter((t) => t !== activeId);
  if (overIsContainer) return without.length;
  const i = without.indexOf(overId);
  return i >= 0 ? i : without.length;
}

/** Append a new empty custom section with a generated id. */
export function createCustomSection(
  sections: Section[],
  newId: string,
  title = "New group",
): Section[] {
  return [...sections, { kind: "custom", id: newId, title, tiles: [] }];
}

/** Rename a custom section. */
export function renameCustomSection(
  sections: Section[],
  id: string,
  title: string,
): Section[] {
  return sections.map((s) =>
    s.kind === "custom" && s.id === id ? { ...s, title } : s,
  );
}

/**
 * Dissolve a section: its tiles flow into the (single) loose bucket — created
 * if absent, merged if present — and the section is removed. The loose bucket
 * itself can't be dissolved.
 */
export function dissolveSection(sections: Section[], key: string): Section[] {
  const target = sections.find((s) => sectionKey(s) === key);
  if (!target || target.kind === "loose") return sections;
  const rest = sections.filter((s) => sectionKey(s) !== key);
  const existingLoose = rest.find((s): s is LooseSection => s.kind === "loose");
  if (existingLoose) {
    return rest.map((s) =>
      s.kind === "loose" ? { ...s, tiles: [...s.tiles, ...target.tiles] } : s,
    );
  }
  return [...rest, { kind: "loose", tiles: target.tiles }];
}
