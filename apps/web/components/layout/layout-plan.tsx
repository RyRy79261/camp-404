import type * as React from "react";
import {
  LAYOUT_AREA_KINDS,
  LAYOUT_KIND_LABELS,
  otherHalfSide,
  type LayoutSide,
} from "@camp404/core";
import type {
  LayoutBlockPart,
  LayoutNorth,
  LayoutPieceKind,
} from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";

// The site plan, drawn (#271; the approved redesign, owner 2026-10-01, after
// the owner's Figma of the block): the plot to scale with the roads around
// it, the other half of the block hatched, every piece outlined in its kind's
// colour with its NUMBER on it (the key beside the plan names it), a north
// arrow and a scale bar. Plain SVG, no library and nothing that runs on its
// own: it redraws only when its props change. One user unit is one metre.
//
// It holds no hooks, so a server page draws it as HTML (the neighbour page,
// the A4 print) and the editor reuses it with handlers. The neighbour page
// passes pieces with no label and no roads, so nothing typed inside the camp
// reaches it; its numbers are by kind.

/** Each kind's colour, a token from app/globals.css (`--plan-*`). */
export const KIND_COLOURS: Readonly<Record<LayoutPieceKind, string>> = {
  stretch_tent: "var(--plan-stretch-tent)",
  shade: "var(--plan-shade)",
  kitchen: "var(--plan-kitchen)",
  lounge: "var(--plan-lounge)",
  sleeping_area: "var(--plan-sleeping-area)",
  tent: "var(--plan-tent)",
  generator: "var(--plan-generator)",
  water: "var(--plan-water)",
  bins: "var(--plan-bins)",
  fire: "var(--plan-fire)",
  parking: "var(--plan-parking)",
  path: "var(--plan-path)",
  other: "var(--plan-other)",
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
  part: LayoutBlockPart;
}

export interface PlanEdges {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/** Handlers the editor passes; a read-only plan has none. */
export interface PlanInteraction {
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

export function metres(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} m`;
}

/** "26×5": a size in the key, metres implied by its heading. */
export function sizeText(w: number, h: number): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return `${n(w)}×${n(h)}`;
}

/**
 * A piece's accessible name: its number, what it is, how big and where,
 * measured from the plot's left edge and its top edge (named for the road
 * there when the plot has one: "from B Road").
 */
export function pieceDescription(
  piece: PlanPiece,
  key?: string,
  topName = "the top",
): string {
  const kind = LAYOUT_KIND_LABELS[piece.kind];
  const name =
    piece.label && piece.label.trim() !== ""
      ? `${piece.label.trim()} (${kind})`
      : kind;
  const numbered = key ? `${key}, ${name}` : name;
  return `${numbered}, ${metres(piece.w)} by ${metres(piece.h)}, ${metres(piece.x)} from the left edge and ${metres(piece.y)} from ${topName}`;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

function contains(outer: Box, inner: Box): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.w >= inner.x + inner.w &&
    outer.y + outer.h >= inner.y + inner.h
  );
}

/** The pieces that stand inside an area (tents in the sleeping area). */
export function piecesInside(
  area: PlanPiece,
  pieces: readonly PlanPiece[],
): PlanPiece[] {
  return pieces.filter((p) => p.id !== area.id && contains(area, p));
}

/**
 * Where an area's name sits, as the Figma writes it: along the inside of its
 * bottom edge, from the left, unless something stands there; then along its
 * top. Returns the text's baseline, in metres from the plot's top.
 */
export function areaLabelY(
  area: PlanPiece,
  pieces: readonly PlanPiece[],
  fontSize: number,
  textWidth: number,
): number {
  const pad = fontSize * 0.8;
  const candidates = [
    area.y + area.h - pad * 0.75,
    area.y + pad + fontSize * 0.75,
  ];
  const others = pieces.filter((p) => p.id !== area.id && !contains(p, area));
  for (const baseline of candidates) {
    const band: Box = {
      x: area.x + pad,
      y: baseline - fontSize,
      w: textWidth,
      h: fontSize * 1.2,
    };
    if (!others.some((p) => intersects(band, p))) return baseline;
  }
  return candidates[0]!;
}

/** The scale bar's length: a round number of metres, about a third of the width. */
export function scaleBarLength(widthM: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100];
  let best = steps[0]!;
  for (const step of steps) if (step <= widthM * 0.4) best = step;
  return best;
}

function gridLines(plot: PlanPlot) {
  const big = Math.max(plot.widthM, plot.depthM);
  const step = big <= 150 ? 5 : big <= 300 ? 10 : 50;
  const d: string[] = [];
  for (let x = step; x < plot.widthM; x += step)
    d.push(`M${x} 0V${plot.depthM}`);
  for (let y = step; y < plot.depthM; y += step)
    d.push(`M0 ${y}H${plot.widthM}`);
  return d.join("");
}

/** The width a line of text takes, roughly: 0.6 of the size a character. */
function textWidth(text: string, size: number): number {
  return text.length * size * 0.6;
}

export function LayoutPlan({
  plot,
  pieces,
  keys,
  edges,
  interaction,
  selectedId = null,
  highlightId = null,
  label,
  className,
  style,
}: {
  plot: PlanPlot;
  pieces: readonly PlanPiece[];
  /** Each piece's number, by id: pieceKeys, or the neighbour's kind numbers. */
  keys: ReadonlyMap<string, string>;
  /** The road (or what else) along each side; absent on the neighbour page. */
  edges?: PlanEdges;
  interaction?: PlanInteraction;
  /** The piece being edited. */
  selectedId?: string | null;
  /** A piece picked in the key, shown on the plan. */
  highlightId?: string | null;
  /** The drawing's accessible name. */
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const W = plot.widthM;
  const H = plot.depthM;
  const big = Math.max(W, H);
  // The band round the plot (the roads), and the type, scale with the plot so
  // a 20 m and a 200 m plot read alike. 3.5 m on the camp's 60 m half block.
  const B = Math.min(Math.max(big * 0.058, 1.6), 14);
  const F = B * 0.36;
  const badgeFont = F * 0.76;
  const other = otherHalfSide(plot.part);
  const road = (side: LayoutSide) =>
    side === other ? "" : (edges?.[side].trim() ?? "");
  const bar = scaleBarLength(W);
  const vbW = W + 2 * B;
  const vbH = H + 2 * B;
  const roadText = {
    fontSize: F,
    fontWeight: 700,
    letterSpacing: F * 0.2,
    fill: "var(--plan-road-text)",
  } as const;

  return (
    <svg
      viewBox={`${-B} ${-B} ${vbW} ${vbH}`}
      role={interaction ? "group" : "img"}
      aria-label={label}
      className={cn("block select-none", className)}
      style={{ aspectRatio: `${vbW} / ${vbH}`, ...style }}
      fontFamily="inherit"
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
      <defs>
        <pattern
          id="plan-hatch"
          width={B * 0.34}
          height={B * 0.34}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={B * 0.34}
            stroke="var(--plan-hatch)"
            strokeWidth={B * 0.1}
          />
        </pattern>
      </defs>

      {/* The roads round the plot, and the other half of the block. */}
      <g aria-hidden className="pointer-events-none">
        {road("top") ? (
          <rect x={-B} y={-B} width={vbW} height={B} fill="var(--plan-road)" />
        ) : null}
        {road("bottom") ? (
          <rect x={-B} y={H} width={vbW} height={B} fill="var(--plan-road)" />
        ) : null}
        {road("left") ? (
          <rect x={-B} y={-B} width={B} height={vbH} fill="var(--plan-road)" />
        ) : null}
        {road("right") ? (
          <rect x={W} y={-B} width={B} height={vbH} fill="var(--plan-road)" />
        ) : null}
        {other ? (
          <>
            <rect
              x={other === "right" ? W : -B}
              y={0}
              width={B}
              height={H}
              fill="url(#plan-hatch)"
            />
            <text
              transform={
                other === "right"
                  ? `translate(${W + B * 0.6} ${Math.min(H * 0.12, B * 2.3)}) rotate(90)`
                  : `translate(${-B * 0.6} ${H - Math.min(H * 0.12, B * 2.3)}) rotate(-90)`
              }
              fontSize={F * 0.88}
              fill="var(--plan-hatch-text)"
            >
              OTHER HALF OF THE BLOCK
            </text>
          </>
        ) : null}
        {road("top") ? (
          <text x={W / 2} y={-B * 0.37} textAnchor="middle" {...roadText}>
            {road("top").toUpperCase()}
          </text>
        ) : null}
        {road("bottom") ? (
          <text x={W * 0.25} y={H + B * 0.63} textAnchor="middle" {...roadText}>
            {road("bottom").toUpperCase()}
          </text>
        ) : null}
        {road("left") ? (
          <text
            transform={`translate(${-B * 0.39} ${H * 0.73}) rotate(-90)`}
            textAnchor="middle"
            {...roadText}
          >
            {road("left").toUpperCase()}
          </text>
        ) : null}
        {road("right") ? (
          <text
            transform={`translate(${W + B * 0.39} ${H * 0.27}) rotate(90)`}
            textAnchor="middle"
            {...roadText}
          >
            {road("right").toUpperCase()}
          </text>
        ) : null}
      </g>

      {/* The plot and its 5 m grid. */}
      <rect
        x={0}
        y={0}
        width={W}
        height={H}
        fill="var(--plan-ground)"
        onPointerDown={
          interaction?.onBackgroundPointerDown
            ? () => interaction.onBackgroundPointerDown?.()
            : undefined
        }
      />
      <path
        aria-hidden
        d={gridLines(plot)}
        stroke="var(--plan-grid)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="pointer-events-none"
      />
      <rect
        aria-hidden
        x={0}
        y={0}
        width={W}
        height={H}
        fill="none"
        stroke="var(--plan-edge)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className="pointer-events-none"
      />

      {/* The pieces: each one's outline, then its number on top. */}
      <g>
        {pieces.map((piece) => {
          const key = keys.get(piece.id) ?? "";
          const colour = KIND_COLOURS[piece.kind];
          const picked = selectedId === piece.id || highlightId === piece.id;
          const overlapping = interaction?.overlapping.has(piece.id) ?? false;
          const description = pieceDescription(
            piece,
            key,
            edges?.top.trim() ? edges.top.trim() : "the top",
          );
          return (
            <g
              key={piece.id}
              data-piece={piece.id}
              {...(interaction
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-pressed": selectedId === piece.id,
                    "aria-label": description,
                    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) =>
                      interaction.onPieceKeyDown(piece.id, event),
                    onPointerDown: (event: React.PointerEvent<SVGGElement>) =>
                      interaction.onPiecePointerDown(piece.id, event),
                    onFocus: () => interaction.onSelect(piece.id),
                    className:
                      "cursor-grab outline-none active:cursor-grabbing [&:focus-visible>rect:first-child]:stroke-[var(--plan-text)]",
                  }
                : {})}
            >
              <rect
                x={piece.x}
                y={piece.y}
                width={piece.w}
                height={piece.h}
                fill={picked ? "var(--color-primary)" : colour}
                fillOpacity={
                  picked ? 0.3 : piece.kind === "sleeping_area" ? 0.05 : 0.2
                }
                stroke={
                  overlapping
                    ? "var(--color-destructive)"
                    : picked
                      ? "var(--color-primary)"
                      : colour
                }
                strokeWidth={picked ? 3 : piece.kind === "tent" ? 1.2 : 1.5}
                strokeDasharray={
                  overlapping
                    ? "4 3"
                    : piece.kind === "sleeping_area"
                      ? "6 4"
                      : undefined
                }
                vectorEffect="non-scaling-stroke"
              >
                {interaction ? null : <title>{description}</title>}
              </rect>
              <PieceMark
                piece={piece}
                pieces={pieces}
                pieceKey={key}
                colour={colour}
                font={F}
                badgeFont={badgeFont}
              />
            </g>
          );
        })}
      </g>

      {/* North, in the top-right corner. */}
      <g
        aria-hidden
        className="pointer-events-none"
        transform={`translate(${W + B / 2} ${-B * 0.54}) rotate(${NORTH_ROTATION[plot.north]})`}
      >
        <path
          d={`M0 ${-B * 0.34} L${B * 0.21} ${B * 0.26} L0 ${B * 0.13} L${-B * 0.21} ${B * 0.26} Z`}
          fill="var(--plan-north)"
        />
      </g>
      <text
        aria-hidden
        x={W - B * 0.06}
        y={-B * 0.33}
        textAnchor="end"
        fontSize={F * 0.88}
        fontWeight={700}
        fill="var(--plan-north)"
        className="pointer-events-none"
      >
        N
      </text>

      {/* The scale bar, in the bottom band. */}
      <g
        aria-hidden
        className="pointer-events-none"
        fill="var(--plan-road-text)"
        fontSize={F * 0.84}
      >
        <rect
          x={W - bar - B * 0.6}
          y={H + B * 0.34}
          width={bar / 2}
          height={B * 0.17}
        />
        <rect
          x={W - bar / 2 - B * 0.6}
          y={H + B * 0.34}
          width={bar / 2}
          height={B * 0.17}
          fill="none"
          stroke="var(--plan-road-text)"
          strokeWidth={B * 0.034}
        />
        <text x={W - bar - B * 0.6} y={H + B * 0.89} textAnchor="middle">
          0
        </text>
        <text x={W - B * 0.6} y={H + B * 0.89} textAnchor="middle">
          {bar} m
        </text>
      </g>
    </svg>
  );
}

/**
 * A piece's mark: "4  Kitchen" across it when the words fit, the number in a
 * ring when they do not, a tent's own number on its tent, and an area's name
 * along its inside edge (the Figma's way), clear of what stands in it.
 */
function PieceMark({
  piece,
  pieces,
  pieceKey,
  colour,
  font,
  badgeFont,
}: {
  piece: PlanPiece;
  pieces: readonly PlanPiece[];
  pieceKey: string;
  colour: string;
  font: number;
  badgeFont: number;
}) {
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  const name =
    piece.label && piece.label.trim() !== ""
      ? piece.label.trim()
      : LAYOUT_KIND_LABELS[piece.kind];

  if (piece.kind === "tent") {
    if (
      textWidth(pieceKey, badgeFont) <= piece.w * 0.9 &&
      piece.h >= badgeFont * 1.3
    ) {
      return (
        <text
          aria-hidden
          x={cx}
          y={cy + badgeFont * 0.36}
          textAnchor="middle"
          fontSize={badgeFont}
          fontWeight={600}
          fill={colour}
          className="pointer-events-none"
        >
          {pieceKey}
        </text>
      );
    }
    return (
      <Badge cx={cx} cy={cy} text={pieceKey} colour={colour} font={badgeFont} />
    );
  }

  const inside = LAYOUT_AREA_KINDS.has(piece.kind)
    ? piecesInside(piece, pieces)
    : [];
  const size = Math.min(font, piece.h * 0.42);
  const fitsLine = (words: string) =>
    textWidth(`${pieceKey}  ${words}`, size) <= piece.w * 0.92 &&
    size >= font * 0.75;
  // The neighbour page names no tent, so an area says how many stand in it,
  // when there is room for it.
  const tents = inside.filter((p) => p.kind === "tent").length;
  const counted =
    !piece.label && piece.kind === "sleeping_area" && tents > 0
      ? `${name} · ${tents} tent${tents === 1 ? "" : "s"}`
      : null;
  const words = counted && fitsLine(counted) ? counted : name;
  const fits = fitsLine(words);

  // An area too narrow for its name keeps its number in its corner, clear of
  // what stands in the middle of it.
  if (!fits && inside.length > 0) {
    const r = pieceKey.length > 1 ? badgeFont * 1.21 : badgeFont;
    return (
      <Badge
        cx={piece.x + r + 0.3}
        cy={piece.y + piece.h - r - 0.3}
        text={pieceKey}
        colour={colour}
        font={badgeFont}
      />
    );
  }
  if (fits && inside.length > 0) {
    const width = textWidth(`${pieceKey}  ${words}`, size);
    return (
      <text
        aria-hidden
        x={piece.x + size * 0.8}
        y={areaLabelY(piece, pieces, size, width)}
        fontSize={size}
        fill="var(--plan-text)"
        className="pointer-events-none"
        xmlSpace="preserve"
      >
        <tspan fontWeight={700} fill={colour}>
          {pieceKey}
        </tspan>
        {`  ${words}`}
      </text>
    );
  }
  if (fits) {
    return (
      <text
        aria-hidden
        x={cx}
        y={cy + size * 0.36}
        textAnchor="middle"
        fontSize={size}
        fill="var(--plan-text)"
        className="pointer-events-none"
        xmlSpace="preserve"
      >
        <tspan fontWeight={700} fill={colour}>
          {pieceKey}
        </tspan>
        {`  ${words}`}
      </text>
    );
  }
  return (
    <Badge cx={cx} cy={cy} text={pieceKey} colour={colour} font={badgeFont} />
  );
}

/** A number in a ring, for a piece too small for its name. */
function Badge({
  cx,
  cy,
  text,
  colour,
  font,
}: {
  cx: number;
  cy: number;
  text: string;
  colour: string;
  font: number;
}) {
  const r = text.length > 1 ? font * 1.21 : font;
  return (
    <g aria-hidden className="pointer-events-none">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--plan-badge)"
        stroke={colour}
        strokeWidth={font * 0.13}
      />
      <text
        x={cx}
        y={cy + font * 0.36}
        textAnchor="middle"
        fontSize={font}
        fontWeight={700}
        fill="var(--plan-text)"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * Where the camp sits in its block, small: the block between its roads with
 * our half filled in. Drawn only for a half-block plot.
 */
export function BlockLocator({
  part,
  edges,
  className,
}: {
  part: LayoutBlockPart;
  /** The roads above and below; absent on the neighbour page. */
  edges?: Pick<PlanEdges, "top" | "bottom">;
  className?: string;
}) {
  if (part === "whole") return null;
  const usX = part === "left" ? 0 : 28;
  return (
    <svg
      viewBox="-6 -6 68 72"
      role="img"
      aria-label={`The block; we have the ${part} half`}
      className={cn("block shrink-0", className)}
      fontFamily="inherit"
    >
      <rect x={-6} y={-6} width={68} height={72} fill="var(--plan-road)" />
      <rect
        x={0}
        y={0}
        width={56}
        height={60}
        fill="var(--plan-ground)"
        stroke="var(--plan-edge)"
        strokeWidth={0.6}
      />
      <rect
        x={usX}
        y={0}
        width={28}
        height={60}
        fill="var(--plan-north)"
        fillOpacity={0.35}
        stroke="var(--plan-north)"
        strokeWidth={0.8}
      />
      <text
        x={usX + 14}
        y={33}
        textAnchor="middle"
        fontSize={7}
        fontWeight={700}
        fill="var(--plan-text)"
      >
        US
      </text>
      {edges?.top.trim() ? (
        <text
          x={28}
          y={-1.4}
          textAnchor="middle"
          fontSize={4}
          fill="var(--plan-road-text)"
        >
          {edges.top.trim().toUpperCase()}
        </text>
      ) : null}
      {edges?.bottom.trim() ? (
        <text
          x={28}
          y={64.8}
          textAnchor="middle"
          fontSize={4}
          fill="var(--plan-road-text)"
        >
          {edges.bottom.trim().toUpperCase()}
        </text>
      ) : null}
    </svg>
  );
}
