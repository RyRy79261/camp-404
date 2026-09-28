import type * as React from "react";
import { LAYOUT_AREA_KINDS, LAYOUT_KIND_LABELS } from "@camp404/core";
import type { LayoutNorth, LayoutPieceKind } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";

// The site plan, drawn (#271): the plot to scale on a metre grid, each piece a
// soft-coloured rectangle, a north arrow, and (inside the camp only) what
// borders each side. Plain SVG, no library and nothing that runs on its own:
// it redraws only when its props change. One user unit is one metre.
//
// It holds no hooks, so a server page draws it as HTML and the editor reuses
// it with handlers. The neighbour page passes pieces with no label and no
// edges, so nothing typed inside the camp reaches it.

/** A piece's colours: a soft fill and its line, from the theme's tokens. */
export const KIND_STYLES: Readonly<Record<LayoutPieceKind, string>> = {
  stretch_tent: "fill-ab-teal/25 stroke-ab-teal",
  shade: "fill-ab-sage/25 stroke-ab-sage",
  kitchen: "fill-ab-apricot/30 stroke-ab-apricot",
  lounge: "fill-camp-magenta/20 stroke-camp-magenta",
  sleeping_area: "fill-camp-blue/10 stroke-camp-blue",
  tent: "fill-camp-blue/35 stroke-camp-blue",
  generator: "fill-warning/30 stroke-warning",
  water: "fill-info/30 stroke-info",
  bins: "fill-muted-foreground/20 stroke-muted-foreground",
  fire: "fill-destructive/25 stroke-destructive",
  parking: "fill-ab-olive/25 stroke-ab-olive",
  path: "fill-ab-peach/20 stroke-ab-peach",
  other: "fill-muted/60 stroke-muted-foreground",
};

/** The same colours as a swatch, for a legend. */
export const KIND_SWATCHES: Readonly<Record<LayoutPieceKind, string>> = {
  stretch_tent: "bg-ab-teal/25 border-ab-teal",
  shade: "bg-ab-sage/25 border-ab-sage",
  kitchen: "bg-ab-apricot/30 border-ab-apricot",
  lounge: "bg-camp-magenta/20 border-camp-magenta",
  sleeping_area: "bg-camp-blue/10 border-camp-blue",
  tent: "bg-camp-blue/35 border-camp-blue",
  generator: "bg-warning/30 border-warning",
  water: "bg-info/30 border-info",
  bins: "bg-muted-foreground/20 border-muted-foreground",
  fire: "bg-destructive/25 border-destructive",
  parking: "bg-ab-olive/25 border-ab-olive",
  path: "bg-ab-peach/20 border-ab-peach",
  other: "bg-muted/60 border-muted-foreground",
};

export interface PlanPiece {
  id: string;
  kind: LayoutPieceKind;
  /** Absent on the neighbour page: only the kind shows there. */
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlanPlot {
  widthM: number;
  depthM: number;
  north: LayoutNorth;
}

export interface PlanEdges {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/** Handlers the editor passes; a read-only plan has none. */
export interface PlanInteraction {
  selectedId: string | null;
  overlapping: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onPieceKeyDown: (id: string, event: React.KeyboardEvent<SVGGElement>) => void;
  onPiecePointerDown: (
    id: string,
    event: React.PointerEvent<SVGGElement>,
  ) => void;
  onBackgroundPointerDown?: () => void;
}

const NORTH_ROTATION: Readonly<Record<LayoutNorth, number>> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
};

/** A piece's accessible name: what it is, how big and where. */
export function pieceDescription(piece: PlanPiece): string {
  const kind = LAYOUT_KIND_LABELS[piece.kind];
  const name =
    piece.label && piece.label.trim() !== ""
      ? `${piece.label.trim()} (${kind})`
      : kind;
  return `${name}, ${metres(piece.w)} by ${metres(piece.h)}, ${metres(piece.x)} from the left and ${metres(piece.y)} from the top`;
}

export function metres(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} m`;
}

function gridLines(plot: PlanPlot) {
  const lines: {
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    major: boolean;
  }[] = [];
  const big = Math.max(plot.widthM, plot.depthM);
  // Every metre on a small plot, every 5 m always, every 10 m on a huge one.
  const minor = big <= 60 ? 1 : big <= 150 ? 5 : 10;
  const major = big <= 150 ? 5 : 50;
  for (let x = minor; x < plot.widthM; x += minor) {
    lines.push({
      key: `x${x}`,
      x1: x,
      y1: 0,
      x2: x,
      y2: plot.depthM,
      major: x % major === 0,
    });
  }
  for (let y = minor; y < plot.depthM; y += minor) {
    lines.push({
      key: `y${y}`,
      x1: 0,
      y1: y,
      x2: plot.widthM,
      y2: y,
      major: y % major === 0,
    });
  }
  return lines;
}

export function LayoutPlan({
  plot,
  pieces,
  edges,
  interaction,
  label,
  className,
}: {
  plot: PlanPlot;
  pieces: readonly PlanPiece[];
  edges?: PlanEdges;
  interaction?: PlanInteraction;
  /** The drawing's accessible name. */
  label: string;
  className?: string;
}) {
  const big = Math.max(plot.widthM, plot.depthM);
  // Text and margins scale with the plot, so a 20 m and a 200 m plot read alike.
  const font = Math.min(Math.max(big / 45, 0.6), 4);
  const margin = font * 2.6;
  const viewBox = `${-margin} ${-margin} ${plot.widthM + margin * 2} ${plot.depthM + margin * 2}`;
  const arrowSize = font * 1.6;

  return (
    <svg
      viewBox={viewBox}
      role={interaction ? "group" : "img"}
      aria-label={label}
      className={cn("h-auto w-full select-none", className)}
      onPointerDown={
        interaction?.onBackgroundPointerDown
          ? (event) => {
              if (event.target === event.currentTarget) {
                interaction.onBackgroundPointerDown?.();
              }
            }
          : undefined
      }
    >
      {/* The plot and its grid. */}
      <rect
        x={0}
        y={0}
        width={plot.widthM}
        height={plot.depthM}
        className="fill-card stroke-border"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        onPointerDown={
          interaction?.onBackgroundPointerDown
            ? () => interaction.onBackgroundPointerDown?.()
            : undefined
        }
      />
      <g aria-hidden className="pointer-events-none">
        {gridLines(plot).map((line) => (
          <line
            key={line.key}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className={line.major ? "stroke-border" : "stroke-border/40"}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* The pieces. */}
      <g>
        {pieces.map((piece) => {
          const selected = interaction?.selectedId === piece.id;
          const overlapping = interaction?.overlapping.has(piece.id) ?? false;
          const text =
            piece.label && piece.label.trim() !== ""
              ? piece.label.trim()
              : LAYOUT_KIND_LABELS[piece.kind];
          const pieceFont = Math.min(font, piece.h * 0.45);
          // An area's name sits along its top, clear of what stands in it.
          const area = LAYOUT_AREA_KINDS.has(piece.kind) && piece.h > font * 3;
          // Room for the text: roughly 0.6 of the font size per character.
          const fits = text.length * pieceFont * 0.6 <= piece.w * 0.95;
          return (
            <g
              key={piece.id}
              data-piece={piece.id}
              {...(interaction
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-pressed": selected,
                    "aria-label": pieceDescription(piece),
                    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) =>
                      interaction.onPieceKeyDown(piece.id, event),
                    onPointerDown: (event: React.PointerEvent<SVGGElement>) =>
                      interaction.onPiecePointerDown(piece.id, event),
                    onFocus: () => interaction.onSelect(piece.id),
                    className:
                      "cursor-grab outline-none active:cursor-grabbing [&:focus-visible>rect:first-child]:stroke-ring",
                  }
                : {})}
            >
              <rect
                x={piece.x}
                y={piece.y}
                width={piece.w}
                height={piece.h}
                rx={Math.min(piece.w, piece.h) * 0.08}
                className={cn(
                  KIND_STYLES[piece.kind],
                  overlapping && "stroke-destructive",
                )}
                strokeWidth={selected ? 3 : 1.5}
                strokeDasharray={overlapping ? "4 3" : undefined}
                vectorEffect="non-scaling-stroke"
              >
                {interaction ? null : <title>{pieceDescription(piece)}</title>}
              </rect>
              {fits ? (
                <text
                  x={piece.x + piece.w / 2}
                  y={area ? piece.y + pieceFont * 0.9 : piece.y + piece.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={pieceFont}
                  className="pointer-events-none fill-foreground"
                  aria-hidden
                >
                  {text}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* What borders each side, outside the plot. */}
      {edges ? (
        <g aria-hidden fontSize={font} className="fill-muted-foreground">
          {edges.top ? (
            <text x={plot.widthM / 2} y={-font * 0.8} textAnchor="middle">
              {edges.top}
            </text>
          ) : null}
          {edges.bottom ? (
            <text
              x={plot.widthM / 2}
              y={plot.depthM + font * 1.6}
              textAnchor="middle"
            >
              {edges.bottom}
            </text>
          ) : null}
          {edges.left ? (
            <text
              transform={`translate(${-font * 0.8} ${plot.depthM / 2}) rotate(-90)`}
              textAnchor="middle"
            >
              {edges.left}
            </text>
          ) : null}
          {edges.right ? (
            <text
              transform={`translate(${plot.widthM + font * 0.8} ${plot.depthM / 2}) rotate(90)`}
              textAnchor="middle"
            >
              {edges.right}
            </text>
          ) : null}
        </g>
      ) : null}

      {/* North, in the top-right corner outside the plot. */}
      <g
        aria-hidden
        transform={`translate(${plot.widthM + margin / 2} ${font * 1.6}) rotate(${NORTH_ROTATION[plot.north]})`}
        className="pointer-events-none"
      >
        <path
          d={`M0 ${-arrowSize / 2} L${arrowSize / 3} ${arrowSize / 2} L0 ${arrowSize / 4} L${-arrowSize / 3} ${arrowSize / 2} Z`}
          className="fill-accent"
        />
        <text
          y={-arrowSize / 2 - font * 0.2}
          textAnchor="middle"
          fontSize={font * 1.2}
          className="fill-accent font-semibold"
          transform={`rotate(${-NORTH_ROTATION[plot.north]} 0 ${-arrowSize / 2 - font * 0.5})`}
        >
          N
        </text>
      </g>
    </svg>
  );
}

/** Each kind on the plan with its colour and count. */
export function LayoutLegend({
  counts,
  className,
}: {
  counts: readonly { kind: LayoutPieceKind; count: number }[];
  className?: string;
}) {
  if (counts.length === 0) return null;
  return (
    <ul
      aria-label="What's on the plan"
      className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs", className)}
    >
      {counts.map(({ kind, count }) => (
        <li key={kind} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("h-3 w-3 rounded-sm border", KIND_SWATCHES[kind])}
          />
          <span>
            {LAYOUT_KIND_LABELS[kind]}
            <span className="text-muted-foreground"> × {count}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
