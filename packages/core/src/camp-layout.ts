import {
  LAYOUT_STEP_M,
  ViewerRank,
  type CampLayout,
  type LayoutBlockPart,
  type LayoutNorth,
  type LayoutPiece,
  type LayoutPieceKind,
  type LayoutPlot,
} from "@camp404/types";

// The camp layout (#271): this year's site plan. Pure: no DB, no session, no
// next/*. The editor, the page and the neighbour page call these.
//
// WHO MAY EDIT. Clearance stays global (AGENTS.md): a lead of ANY team stands
// on the `team_lead` rung everywhere. Team identity decides only who may edit
// HERE: a captain, or a lead of Structures (the team the issue names). Every
// member reads the plan. It fails closed on a rank this module does not know.
// The write re-reads the actor's rank and led teams inside its own
// transaction and passes those here; it never takes a team list from a caller.
//
// WHO MAY SHARE. Only a captain turns the neighbour link on or off: it puts
// the plan and the arrival counts in front of people outside the camp.
//
// WHAT A NEIGHBOUR SEES. `neighbourView` is an allowlist: the plot's size and
// north, and each piece's kind and place. Never a label or an edge note
// (camp-typed text, which could name a member, "Sam's tent"), and never who
// saved it. Arrival days leave the camp only as counts per day.

/** The team whose leads keep the plan. */
export const LAYOUT_TEAM = "structures";

function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

/**
 * Whether someone may change this year's plan: a captain, or a lead of
 * Structures. `ledTeams` are the team keys they lead this year.
 */
export function canEditLayout(
  rank: string,
  ledTeams: readonly string[],
): boolean {
  if (!isViewerRank(rank)) return false;
  if (rank === "captain") return true;
  if (rank === "team_lead") return ledTeams.includes(LAYOUT_TEAM);
  return false;
}

/** Whether someone may turn the neighbour link on, off, or make a new one. */
export function canShareLayout(rank: string): boolean {
  return isViewerRank(rank) && rank === "captain";
}

// --- Pieces ------------------------------------------------------------------

/** Each kind's plain name. */
export const LAYOUT_KIND_LABELS: Readonly<Record<LayoutPieceKind, string>> = {
  stretch_tent: "Stretch tent",
  shade: "Shade",
  kitchen: "Kitchen",
  lounge: "Lounge",
  sleeping_area: "Sleeping area",
  tent: "Tent",
  generator: "Generator",
  water: "Water",
  bins: "Bins",
  fire: "Fire / burn barrel",
  parking: "Parking",
  path: "Path",
  other: "Other",
};

/** The size a new piece of each kind starts at, in metres. */
export const LAYOUT_KIND_SIZES: Readonly<
  Record<LayoutPieceKind, { w: number; h: number }>
> = {
  stretch_tent: { w: 10, h: 8 },
  shade: { w: 6, h: 6 },
  kitchen: { w: 8, h: 6 },
  lounge: { w: 10, h: 8 },
  sleeping_area: { w: 15, h: 10 },
  tent: { w: 3, h: 2.5 },
  generator: { w: 2, h: 1.5 },
  water: { w: 2, h: 2 },
  bins: { w: 2, h: 1 },
  fire: { w: 2, h: 2 },
  parking: { w: 10, h: 5 },
  path: { w: 20, h: 2 },
  other: { w: 3, h: 3 },
};

/**
 * A new year's plot before anyone sizes it: the camp's half of the block it
 * shares (the owner's Figma, 2026-10-01: about 56 m along the roads and 60 m
 * deep, B Road along the top, A Road along the bottom, the 3ish road on the
 * left and the 4ish road on the right). Most years the camp has the right
 * half, so a new year starts there; the plot dialog changes it.
 */
export const DEFAULT_PLOT: LayoutPlot = {
  widthM: 28,
  depthM: 60,
  north: "top",
  part: "right",
  edges: { top: "B Road", right: "4ish road", bottom: "A Road", left: "" },
};

export type LayoutSide = "top" | "right" | "bottom" | "left";

/**
 * The side of the plot that faces the other half of the block, or null for a
 * whole-block plot. Nothing borders it but the other camp, so the drawing
 * hatches it instead of naming a road.
 */
export function otherHalfSide(part: LayoutBlockPart): LayoutSide | null {
  if (part === "left") return "right";
  if (part === "right") return "left";
  return null;
}

/** "Left half of the block", or null for a whole-block plot. */
export function blockPartLabel(part: LayoutBlockPart): string | null {
  if (part === "left") return "Left half of the block";
  if (part === "right") return "Right half of the block";
  return null;
}

/** An empty plan on the default plot. */
export function emptyLayout(): CampLayout {
  return {
    plot: { ...DEFAULT_PLOT, edges: { ...DEFAULT_PLOT.edges } },
    pieces: [],
  };
}

/** Round to the grid's half-metre step. */
export function snap(metres: number): number {
  return Math.round(metres / LAYOUT_STEP_M) * LAYOUT_STEP_M;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * A piece kept on the plot: snapped to the grid, no bigger than the plot, and
 * pushed back inside when it would run off an edge.
 */
export function keepOnPlot(piece: LayoutPiece, plot: LayoutPlot): LayoutPiece {
  const w = clamp(snap(piece.w), LAYOUT_STEP_M, plot.widthM);
  const h = clamp(snap(piece.h), LAYOUT_STEP_M, plot.depthM);
  return {
    ...piece,
    w,
    h,
    x: clamp(snap(piece.x), 0, plot.widthM - w),
    y: clamp(snap(piece.y), 0, plot.depthM - h),
  };
}

/** A piece moved by `dx`, `dy` metres, staying on the plot. */
export function movePiece(
  piece: LayoutPiece,
  dx: number,
  dy: number,
  plot: LayoutPlot,
): LayoutPiece {
  return keepOnPlot({ ...piece, x: piece.x + dx, y: piece.y + dy }, plot);
}

/** A piece turned a quarter: its width and depth swap, about its centre. */
export function turnPiece(piece: LayoutPiece, plot: LayoutPlot): LayoutPiece {
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  return keepOnPlot(
    {
      ...piece,
      w: piece.h,
      h: piece.w,
      x: cx - piece.h / 2,
      y: cy - piece.w / 2,
    },
    plot,
  );
}

/** A new piece of a kind at its default size, in the middle of the plot. */
export function newPiece(
  kind: LayoutPieceKind,
  id: string,
  plot: LayoutPlot,
): LayoutPiece {
  const size = LAYOUT_KIND_SIZES[kind];
  return keepOnPlot(
    {
      id,
      kind,
      label: "",
      w: size.w,
      h: size.h,
      x: (plot.widthM - size.w) / 2,
      y: (plot.depthM - size.h) / 2,
    },
    plot,
  );
}

/** The plan with a new plot size; every piece is pulled back onto it. */
export function resizePlot(layout: CampLayout, plot: LayoutPlot): CampLayout {
  return {
    plot,
    pieces: layout.pieces.map((piece) => keepOnPlot(piece, plot)),
  };
}

/**
 * Kinds that other pieces sit in or under: tents go in the sleeping area, a
 * lounge under a stretch tent, a path runs past everything. Overlapping one
 * of these is the plan, not a mistake.
 */
export const LAYOUT_AREA_KINDS: ReadonlySet<LayoutPieceKind> = new Set([
  "stretch_tent",
  "shade",
  "sleeping_area",
  "parking",
  "path",
]);

/**
 * The ids of pieces that overlap another piece (touching edges do not). A
 * piece inside an area kind (LAYOUT_AREA_KINDS) does not count.
 */
export function overlappingPieces(pieces: readonly LayoutPiece[]): Set<string> {
  const hit = new Set<string>();
  const solid = pieces.filter((p) => !LAYOUT_AREA_KINDS.has(p.kind));
  for (let i = 0; i < solid.length; i++) {
    const a = solid[i]!;
    for (let j = i + 1; j < solid.length; j++) {
      const b = solid[j]!;
      if (
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.h &&
        b.y < a.y + a.h
      ) {
        hit.add(a.id);
        hit.add(b.id);
      }
    }
  }
  return hit;
}

/**
 * Each piece's number on the plan and in its key: the camp's pieces 1, 2, 3…
 * in the plan's own order, and the tents T1, T2… (a tent is someone's, and
 * the key lists them apart, "who sleeps where"). Removing a piece renumbers
 * the ones after it.
 */
export function pieceKeys(
  pieces: readonly Pick<LayoutPiece, "id" | "kind">[],
): Map<string, string> {
  const keys = new Map<string, string>();
  let camp = 0;
  let tents = 0;
  for (const piece of pieces) {
    keys.set(piece.id, piece.kind === "tent" ? `T${++tents}` : String(++camp));
  }
  return keys;
}

/**
 * Each kind's number on the neighbour page, where the key is by kind (no
 * piece has a name there): 1, 2, 3… in the order pieceCounts gives.
 */
export function kindKeys(
  pieces: readonly Pick<LayoutPiece, "kind">[],
): Map<LayoutPieceKind, string> {
  return new Map(
    pieceCounts(pieces).map(({ kind }, index) => [kind, String(index + 1)]),
  );
}

/** A piece's name on the plan: its label, else its kind. */
export function pieceName(piece: Pick<LayoutPiece, "kind" | "label">): string {
  return piece.label.trim() || LAYOUT_KIND_LABELS[piece.kind];
}

/**
 * How many pieces of each kind, in the plan's own order (the order the camp's
 * numbers follow), kinds with none left out. Every tent's count comes
 * straight after the FIRST sleeping area in the plan, as the approved key
 * lists them — this does not check which sleeping area a tent actually
 * stands in, so a plan with more than one sleeping area still groups every
 * tent after the first.
 */
export function pieceCounts(
  pieces: readonly Pick<LayoutPiece, "kind">[],
): { kind: LayoutPieceKind; count: number }[] {
  const counts = new Map<LayoutPieceKind, number>();
  for (const piece of pieces) {
    if (piece.kind === "tent") continue;
    counts.set(piece.kind, (counts.get(piece.kind) ?? 0) + 1);
    if (piece.kind === "sleeping_area" && !counts.has("tent")) {
      const tents = pieces.filter((p) => p.kind === "tent").length;
      if (tents > 0) counts.set("tent", tents);
    }
  }
  if (!counts.has("tent")) {
    const tents = pieces.filter((p) => p.kind === "tent").length;
    if (tents > 0) counts.set("tent", tents);
  }
  return [...counts].map(([kind, count]) => ({ kind, count }));
}

// --- What leaves the camp ------------------------------------------------------

/** A piece as a neighbour sees it: its kind and place, never its label. */
export interface NeighbourPiece {
  kind: LayoutPieceKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The plan as a neighbour sees it. */
export interface NeighbourLayout {
  plot: {
    widthM: number;
    depthM: number;
    north: LayoutNorth;
    /** Which half of the block: a choice from a list, never typed text. */
    part: LayoutBlockPart;
  };
  pieces: NeighbourPiece[];
}

/**
 * The plan cut down to what may leave the camp. Built field by field, never
 * by spreading, so a field added to the plan later stays inside until it is
 * named here.
 */
export function neighbourView(layout: CampLayout): NeighbourLayout {
  return {
    plot: {
      widthM: layout.plot.widthM,
      depthM: layout.plot.depthM,
      north: layout.plot.north,
      part: layout.plot.part,
    },
    pieces: layout.pieces.map((piece) => ({
      kind: piece.kind,
      x: piece.x,
      y: piece.y,
      w: piece.w,
      h: piece.h,
    })),
  };
}

/** How many people arrive on one day: a count, never who. */
export interface ArrivalDayCount {
  /** YYYY-MM-DD. */
  day: string;
  count: number;
}

/**
 * Arrival days as counts per day, earliest first. Takes only the days (no
 * member ids), so a caller cannot pass anyone's name through it.
 */
export function arrivalDayCounts(
  days: readonly (Date | null)[],
): ArrivalDayCount[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    if (!day || Number.isNaN(day.getTime())) continue;
    const key = day.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }));
}
