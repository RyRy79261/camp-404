import { z } from "zod";

// The camp layout (#271): this year's site plan, drawn to scale on a grid of
// metres. The whole plan is one document, checked here on every write and
// saved as a new numbered version; the rules for who may save it, and what a
// neighbour may see of it, live in @camp404/core (camp-layout.ts), never in
// this shape.

/** What a piece on the plan is. Its colour and default size come from core. */
export const LAYOUT_PIECE_KINDS = [
  "stretch_tent",
  "shade",
  "kitchen",
  "lounge",
  "sleeping_area",
  "tent",
  "generator",
  "water",
  "bins",
  "fire",
  "parking",
  "path",
  "other",
] as const;
export const LayoutPieceKind = z.enum(LAYOUT_PIECE_KINDS);
export type LayoutPieceKind = z.infer<typeof LayoutPieceKind>;

/** Which side of the drawing faces north. */
export const LAYOUT_NORTH_SIDES = ["top", "right", "bottom", "left"] as const;
export const LayoutNorth = z.enum(LAYOUT_NORTH_SIDES);
export type LayoutNorth = z.infer<typeof LayoutNorth>;

/**
 * Which part of the block the plot is (the owner's Figma, 2026-10-01): the
 * camp shares a block between four roads with another camp, and takes one
 * half of it, the left one some years and the right one others. `whole` is a
 * plot with no neighbour inside the block, and what a plan saved before this
 * field existed reads as.
 */
export const LAYOUT_BLOCK_PARTS = ["whole", "left", "right"] as const;
export const LayoutBlockPart = z.enum(LAYOUT_BLOCK_PARTS);
export type LayoutBlockPart = z.infer<typeof LayoutBlockPart>;

/** The smallest and largest plot side, in metres. */
export const PLOT_MIN_M = 5;
export const PLOT_MAX_M = 300;
/** The smallest piece side, and the step every length and position takes. */
export const LAYOUT_STEP_M = 0.5;
/** The most pieces one plan holds. */
export const MAX_LAYOUT_PIECES = 300;
export const LAYOUT_LABEL_MAX = 40;
export const LAYOUT_EDGE_MAX = 60;
export const LAYOUT_NOTE_MAX = 120;

const onStep = (value: number) => Number.isInteger(value / LAYOUT_STEP_M);
const STEP_MESSAGE = "Use whole or half metres.";

const metres = (min: number, max: number) =>
  z
    .number({ message: "Enter a number of metres." })
    .finite()
    .min(min, `At least ${min} m.`)
    .max(max, `At most ${max} m.`)
    .refine(onStep, STEP_MESSAGE);

const edgeNote = z
  .string()
  .trim()
  .max(LAYOUT_EDGE_MAX, `Keep it under ${LAYOUT_EDGE_MAX} characters.`);

/**
 * The plot: its size, which part of the block it is, and the road (or
 * whatever else) along each side of the drawing.
 */
export const LayoutPlot = z.object({
  widthM: metres(PLOT_MIN_M, PLOT_MAX_M),
  depthM: metres(PLOT_MIN_M, PLOT_MAX_M),
  north: LayoutNorth,
  /** Added 2026-10-02; a plan saved before it reads as the whole block. */
  part: LayoutBlockPart.default("whole"),
  edges: z.object({
    top: edgeNote,
    right: edgeNote,
    bottom: edgeNote,
    left: edgeNote,
  }),
});
export type LayoutPlot = z.infer<typeof LayoutPlot>;

/** One shape on the plan. `x` and `y` are its top-left corner from the plot's. */
export const LayoutPiece = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "A piece needs an id."),
  kind: LayoutPieceKind,
  label: z
    .string()
    .trim()
    .max(
      LAYOUT_LABEL_MAX,
      `Keep a label under ${LAYOUT_LABEL_MAX} characters.`,
    ),
  x: metres(0, PLOT_MAX_M),
  y: metres(0, PLOT_MAX_M),
  w: metres(LAYOUT_STEP_M, PLOT_MAX_M),
  h: metres(LAYOUT_STEP_M, PLOT_MAX_M),
});
export type LayoutPiece = z.infer<typeof LayoutPiece>;

/** The whole plan, as one version stores it. Every piece sits on the plot. */
export const CampLayout = z
  .object({
    plot: LayoutPlot,
    pieces: z
      .array(LayoutPiece)
      .max(
        MAX_LAYOUT_PIECES,
        `A plan holds at most ${MAX_LAYOUT_PIECES} pieces.`,
      ),
  })
  .superRefine((layout, ctx) => {
    const ids = new Set<string>();
    layout.pieces.forEach((piece, index) => {
      if (ids.has(piece.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["pieces", index, "id"],
          message: "Two pieces share an id.",
        });
      }
      ids.add(piece.id);
      if (
        piece.x + piece.w > layout.plot.widthM ||
        piece.y + piece.h > layout.plot.depthM
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["pieces", index],
          message: `${piece.label || "A piece"} runs off the plot. Move it inside, or make the plot bigger.`,
        });
      }
    });
  });
export type CampLayout = z.infer<typeof CampLayout>;

/** Saving the plan: the whole document, the version it was drawn from, a note. */
export const SaveLayoutInput = z.object({
  layout: CampLayout,
  /** The version the editor opened; 0 when the year has none yet. */
  expectedVersion: z.number().int().min(0),
  note: z
    .string()
    .trim()
    .max(LAYOUT_NOTE_MAX, `Keep the note under ${LAYOUT_NOTE_MAX} characters.`)
    .optional(),
});
export type SaveLayoutInput = z.infer<typeof SaveLayoutInput>;
