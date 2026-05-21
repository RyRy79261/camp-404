"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { cn } from "../lib/utils";
import {
  RANK_LABEL,
  rankLevel,
  type ControlPanelCorner,
  type ControlPanelLayer,
  type ControlPanelQuadrant,
  type ControlPanelRank,
} from "./control-panel";

/** The four quadrants of a layer, in reading order, with their corner key. */
const QUADRANTS: {
  corner: ControlPanelCorner;
  key: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
}[] = [
  { corner: "tl", key: "topLeft" },
  { corner: "tr", key: "topRight" },
  { corner: "bl", key: "bottomLeft" },
  { corner: "br", key: "bottomRight" },
];

export interface ControlGridProps {
  /** Ordered low → high rank. Typically three: member, team lead, captain. */
  layers: ControlPanelLayer[];
  /** The viewing camp member's rank — decides which sections are unlocked. */
  viewerRank?: ControlPanelRank;
  /** Right-hand header slot — login state, settings, etc. */
  header?: React.ReactNode;
  onQuadrantSelect?: (
    quadrant: ControlPanelQuadrant,
    corner: ControlPanelCorner,
    layer: ControlPanelLayer,
  ) => void;
  className?: string;
}

/**
 * Desktop counterpart to {@link ControlPanel}. Where the mobile control panel
 * shows one rank layer at a time and cycles between them via a centre button,
 * the grid lays every layer out at once — captains and team leads work from
 * large screens and aren't strapped for space. Each rank is its own section;
 * sections above the viewer's rank stay visible but render as inactive,
 * dotted-out tiles. Same `layers`/`viewerRank` data shape as `ControlPanel`,
 * so a screen can pick the layout by viewport and feed both the same props.
 */
export function ControlGrid({
  layers,
  viewerRank = "camp_member",
  header,
  onQuadrantSelect,
  className,
}: ControlGridProps) {
  return (
    <div
      className={cn(
        "flex min-h-[100dvh] w-full flex-col bg-[color:var(--color-background)]",
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-6">
        <span className="text-sm font-semibold">
          {RANK_LABEL[viewerRank]}
        </span>
        <div className="flex items-center gap-1">{header}</div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 p-6 lg:p-10">
        {layers.map((layer, index) => (
          <ControlGridSection
            key={index}
            layer={layer}
            locked={rankLevel(viewerRank) < rankLevel(layer.rank)}
            onQuadrantSelect={onQuadrantSelect}
          />
        ))}
      </div>
    </div>
  );
}

function ControlGridSection({
  layer,
  locked,
  onQuadrantSelect,
}: {
  layer: ControlPanelLayer;
  locked: boolean;
  onQuadrantSelect?: ControlGridProps["onQuadrantSelect"];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          {RANK_LABEL[layer.rank]}
        </h2>
        {locked && (
          <span className="flex items-center gap-1 rounded-full bg-[color:var(--color-muted)] px-2 py-0.5 text-xs text-[color:var(--color-muted-foreground)]">
            <Lock className="h-3 w-3" aria-hidden />
            View only
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUADRANTS.map(({ corner, key }) => (
          <GridTile
            key={corner}
            quadrant={layer[key]}
            locked={locked}
            onSelect={() => onQuadrantSelect?.(layer[key], corner, layer)}
          />
        ))}
      </div>
    </section>
  );
}

function GridTile({
  quadrant,
  locked,
  onSelect,
}: {
  quadrant: ControlPanelQuadrant;
  locked: boolean;
  onSelect: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[color:var(--color-muted-foreground)]">
        {quadrant.icon}
        {locked && <Lock className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="text-base font-semibold leading-tight">
        {quadrant.label}
      </span>
      {quadrant.hint && (
        <span className="text-xs text-[color:var(--color-muted-foreground)]">
          {quadrant.hint}
        </span>
      )}
    </>
  );

  const base =
    "flex min-h-[8rem] flex-col gap-1.5 rounded-[var(--radius)] p-5 text-left transition-colors";

  if (locked) {
    return (
      <div
        className={cn(
          base,
          "border border-dashed border-[color:var(--color-border)] opacity-50",
        )}
        aria-disabled="true"
      >
        {body}
      </div>
    );
  }

  const active =
    "border border-[color:var(--color-border)] bg-[color:var(--color-background)] hover:border-[color:var(--color-primary)] hover:bg-[color:var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]";

  if (quadrant.href) {
    return (
      <a href={quadrant.href} onClick={onSelect} className={cn(base, active)}>
        {body}
      </a>
    );
  }

  return (
    <button type="button" onClick={onSelect} className={cn(base, active)}>
      {body}
    </button>
  );
}
