"use client";

import * as React from "react";
import { otherHalfSide } from "@camp404/core";
import {
  LAYOUT_BLOCK_PARTS,
  LAYOUT_EDGE_MAX,
  LAYOUT_NORTH_SIDES,
  LAYOUT_STEP_M,
  LayoutPlot,
  PLOT_MAX_M,
  PLOT_MIN_M,
  type LayoutBlockPart,
  type LayoutNorth,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@camp404/ui/components/select";

// The plot's size, which part of the block it is, which way is north and the
// road along each side (the approved redesign's "Plot size and roads"). The
// side that faces the other half of the block has no road to name: the plan
// hatches it.

const NORTH_LABELS: Readonly<Record<LayoutNorth, string>> = {
  top: "Top of the drawing",
  right: "Right of the drawing",
  bottom: "Bottom of the drawing",
  left: "Left of the drawing",
};

const PART_LABELS: Readonly<Record<LayoutBlockPart, string>> = {
  whole: "The whole block",
  left: "The left half",
  right: "The right half",
};

const EDGES = ["top", "right", "bottom", "left"] as const;
const EDGE_LABELS: Readonly<Record<(typeof EDGES)[number], string>> = {
  top: "Along the top",
  right: "Along the right",
  bottom: "Along the bottom",
  left: "Along the left",
};

/** A typed number of metres, or null for anything else. */
export function readMetres(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : null;
}

export function PlotDialog({
  open,
  onOpenChange,
  plot,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plot: LayoutPlot;
  onApply: (plot: LayoutPlot) => void;
}) {
  const [width, setWidth] = React.useState(String(plot.widthM));
  const [depth, setDepth] = React.useState(String(plot.depthM));
  const [north, setNorth] = React.useState<LayoutNorth>(plot.north);
  const [part, setPart] = React.useState<LayoutBlockPart>(plot.part);
  const [edges, setEdges] = React.useState(plot.edges);
  const [error, setError] = React.useState<{
    field: "width" | "depth" | "edges";
    message: string;
  } | null>(null);

  // Opening again starts from the plan as it is now.
  React.useEffect(() => {
    if (!open) return;
    setWidth(String(plot.widthM));
    setDepth(String(plot.depthM));
    setNorth(plot.north);
    setPart(plot.part);
    setEdges(plot.edges);
    setError(null);
  }, [open, plot]);

  const other = otherHalfSide(part);

  function apply() {
    const parsed = LayoutPlot.safeParse({
      widthM: readMetres(width),
      depthM: readMetres(depth),
      north,
      part,
      edges,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field =
        issue?.path[0] === "widthM"
          ? "width"
          : issue?.path[0] === "depthM"
            ? "depth"
            : "edges";
      setError({
        field,
        message: issue?.message ?? "Check the plot and try again.",
      });
      return;
    }
    onApply(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plot size and roads</DialogTitle>
          <DialogDescription>
            Our plot in metres, from {PLOT_MIN_M} to {PLOT_MAX_M} m a side. A
            smaller plot pulls every piece back inside it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Width (m)"
              htmlFor="plot-width"
              error={error?.field === "width" ? error.message : undefined}
            >
              <Input
                id="plot-width"
                type="number"
                inputMode="decimal"
                step={LAYOUT_STEP_M}
                min={PLOT_MIN_M}
                max={PLOT_MAX_M}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </Field>
            <Field
              label="Depth (m)"
              htmlFor="plot-depth"
              error={error?.field === "depth" ? error.message : undefined}
            >
              <Input
                id="plot-depth"
                type="number"
                inputMode="decimal"
                step={LAYOUT_STEP_M}
                min={PLOT_MIN_M}
                max={PLOT_MAX_M}
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Our part of the block" htmlFor="plot-part">
              <Select
                value={part}
                onValueChange={(v) => setPart(v as LayoutBlockPart)}
              >
                <SelectTrigger id="plot-part">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUT_BLOCK_PARTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PART_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="North is at the" htmlFor="plot-north">
              <Select
                value={north}
                onValueChange={(v) => setNorth(v as LayoutNorth)}
              >
                <SelectTrigger id="plot-north">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUT_NORTH_SIDES.map((side) => (
                    <SelectItem key={side} value={side}>
                      {NORTH_LABELS[side]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">
              The road along each side
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {EDGES.filter((side) => side !== other).map((side) => (
                <Field
                  key={side}
                  label={EDGE_LABELS[side]}
                  htmlFor={`plot-edge-${side}`}
                >
                  <Input
                    id={`plot-edge-${side}`}
                    value={edges[side]}
                    maxLength={LAYOUT_EDGE_MAX}
                    placeholder="e.g. B Road"
                    onChange={(e) =>
                      setEdges({ ...edges, [side]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {other
                ? `The ${other} side faces the other half of the block. `
                : ""}
              Road names are for the camp only, never shown to neighbours.
            </p>
            {error?.field === "edges" ? (
              <p role="alert" className="text-sm text-destructive">
                {error.message}
              </p>
            ) : null}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Use this plot</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
