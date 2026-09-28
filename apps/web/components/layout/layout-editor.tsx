"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCw, Save, Settings2, Trash2, Undo2 } from "lucide-react";
import {
  LAYOUT_KIND_LABELS,
  keepOnPlot,
  movePiece,
  newPiece,
  overlappingPieces,
  pieceCounts,
  pieceName,
  resizePlot,
  snap,
  turnPiece,
} from "@camp404/core";
import {
  LAYOUT_EDGE_MAX,
  LAYOUT_LABEL_MAX,
  LAYOUT_NOTE_MAX,
  LAYOUT_NORTH_SIDES,
  LAYOUT_PIECE_KINDS,
  LAYOUT_STEP_M,
  LayoutPlot,
  PLOT_MAX_M,
  PLOT_MIN_M,
  type CampLayout,
  type LayoutNorth,
  type LayoutPiece,
  type LayoutPieceKind,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
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
import { Spinner } from "@camp404/ui/components/spinner";
import { toast } from "@camp404/ui/components/toast";
import { saveLayoutAction } from "@/app/(console)/camp-layout/actions";
import {
  LayoutLegend,
  LayoutPlan,
  metres,
  pieceDescription,
  type PlanInteraction,
} from "./layout-plan";

// The layout editor (#271): the plan, a toolbar and the selected piece's
// fields. Everything happens in the browser until Save, which writes the whole
// plan as a new version (compare-and-set on the version it opened).
//
// Keyboard first: every piece is a button in the drawing; arrow keys move the
// focused piece half a metre (Shift: 5 m), R turns it, Delete removes it. The
// fields under the drawing do the same for anyone who would rather type.
// Pointer drag works too, with listeners that exist only while a drag does:
// nothing runs on its own.
//
// A viewer who may not edit gets the same toolbar PRESENT BUT DISABLED, each
// control pointing at the one refusal line the page prints (the power page's
// pattern). The server checks again regardless.

const NORTH_LABELS: Readonly<Record<LayoutNorth, string>> = {
  top: "Top of the drawing",
  right: "Right of the drawing",
  bottom: "Bottom of the drawing",
  left: "Left of the drawing",
};

const EDGES = ["top", "right", "bottom", "left"] as const;
const EDGE_LABELS: Readonly<Record<(typeof EDGES)[number], string>> = {
  top: "Along the top",
  right: "Along the right",
  bottom: "Along the bottom",
  left: "Along the left",
};

const ARROWS: Readonly<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** What a disabled control says it is, and where it points for the reason. */
function refusalProps(canEdit: boolean, name: string, refusalId: string) {
  return canEdit
    ? {}
    : {
        "aria-label": `${name} — not available to you`,
        "aria-describedby": refusalId,
      };
}

function newId(): string {
  return `p-${crypto.randomUUID()}`;
}

/** A typed number of metres on the grid, or null for anything else. */
function readMetres(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function LayoutEditor({
  initial,
  version,
  canEdit,
  refusalId,
}: {
  initial: CampLayout;
  version: number;
  canEdit: boolean;
  refusalId: string;
}) {
  const router = useRouter();
  const [layout, setLayout] = React.useState<CampLayout>(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [addKind, setAddKind] = React.useState<LayoutPieceKind>("tent");
  const [note, setNote] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saving, startSave] = React.useTransition();
  const [plotOpen, setPlotOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const svgWrap = React.useRef<HTMLDivElement>(null);

  const selected = layout.pieces.find((p) => p.id === selectedId) ?? null;
  const overlapping = React.useMemo(
    () => overlappingPieces(layout.pieces),
    [layout.pieces],
  );
  const counts = React.useMemo(
    () => pieceCounts(layout.pieces),
    [layout.pieces],
  );

  // Warn before leaving with unsaved changes: an event, not a timer.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // A piece just added (or selected from the list) takes the keyboard focus.
  React.useEffect(() => {
    if (!focusId) return;
    const node = svgWrap.current?.querySelector<SVGGElement>(
      `[data-piece="${focusId}"]`,
    );
    node?.focus();
    setFocusId(null);
  }, [focusId]);

  function change(next: CampLayout) {
    setLayout(next);
    setDirty(true);
    setSaveError(null);
  }

  function updatePiece(id: string, fn: (piece: LayoutPiece) => LayoutPiece) {
    change({
      ...layout,
      pieces: layout.pieces.map((p) => (p.id === id ? fn(p) : p)),
    });
  }

  function removePiece(id: string) {
    const piece = layout.pieces.find((p) => p.id === id);
    change({ ...layout, pieces: layout.pieces.filter((p) => p.id !== id) });
    setSelectedId(null);
    if (piece) setAnnouncement(`${pieceName(piece)} removed.`);
  }

  function addPiece() {
    const piece = newPiece(addKind, newId(), layout.plot);
    change({ ...layout, pieces: [...layout.pieces, piece] });
    setSelectedId(piece.id);
    setFocusId(piece.id);
    setAnnouncement(`${LAYOUT_KIND_LABELS[addKind]} added in the middle.`);
  }

  function discard() {
    setLayout(initial);
    setDirty(false);
    setSelectedId(null);
    setSaveError(null);
    setNote("");
  }

  function save() {
    setSaveError(null);
    startSave(async () => {
      const result = await saveLayoutAction({
        layout,
        expectedVersion: version,
        note: note.trim() === "" ? undefined : note,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setDirty(false);
      setNote("");
      toast.success(`Layout saved (version ${result.data.version})`);
      router.refresh();
    });
  }

  const interaction: PlanInteraction | undefined = canEdit
    ? {
        selectedId,
        overlapping,
        onSelect: setSelectedId,
        onBackgroundPointerDown: () => setSelectedId(null),
        onPieceKeyDown: (id, event) => {
          const piece = layout.pieces.find((p) => p.id === id);
          if (!piece) return;
          const arrow = ARROWS[event.key];
          if (arrow) {
            event.preventDefault();
            const step = event.shiftKey ? 5 : LAYOUT_STEP_M;
            const moved = movePiece(
              piece,
              arrow[0] * step,
              arrow[1] * step,
              layout.plot,
            );
            updatePiece(id, () => moved);
            setAnnouncement(
              `${pieceName(piece)} at ${metres(moved.x)} from the left, ${metres(moved.y)} from the top.`,
            );
          } else if (event.key === "r" || event.key === "R") {
            event.preventDefault();
            const turned = turnPiece(piece, layout.plot);
            updatePiece(id, () => turned);
            setAnnouncement(
              `${pieceName(piece)} turned: ${metres(turned.w)} by ${metres(turned.h)}.`,
            );
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            removePiece(id);
          } else if (event.key === "Escape") {
            event.currentTarget.blur();
            setSelectedId(null);
          }
        },
        onPiecePointerDown: (id, event) => {
          if (event.button !== 0) return;
          const piece = layout.pieces.find((p) => p.id === id);
          const svg = event.currentTarget.ownerSVGElement;
          const ctm = svg?.getScreenCTM();
          if (!piece || !ctm) return;
          event.preventDefault();
          setSelectedId(id);
          (event.currentTarget as SVGGElement).focus({ preventScroll: true });
          const startX = event.clientX;
          const startY = event.clientY;
          const scale = 1 / ctm.a;
          let moved = false;
          const onMove = (move: PointerEvent) => {
            const dx = snap((move.clientX - startX) * scale);
            const dy = snap((move.clientY - startY) * scale);
            if (!moved && dx === 0 && dy === 0) return;
            moved = true;
            setLayout((current) => ({
              ...current,
              pieces: current.pieces.map((p) =>
                p.id === id
                  ? keepOnPlot(
                      { ...piece, x: piece.x + dx, y: piece.y + dy },
                      current.plot,
                    )
                  : p,
              ),
            }));
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            if (moved) {
              setDirty(true);
              setSaveError(null);
            }
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        },
      }
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* The toolbar. */}
      <div
        role="toolbar"
        aria-label="Layout tools"
        className="flex flex-wrap items-center gap-2"
      >
        <div className="flex items-center gap-2">
          <Select
            value={addKind}
            onValueChange={(v) => setAddKind(v as LayoutPieceKind)}
            disabled={!canEdit}
          >
            <SelectTrigger
              className="w-44"
              aria-label="Kind of piece to add"
              {...refusalProps(canEdit, "Kind of piece to add", refusalId)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_PIECE_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {LAYOUT_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={addPiece}
            disabled={!canEdit}
            {...refusalProps(canEdit, "Add piece", refusalId)}
          >
            <Plus aria-hidden />
            Add piece
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => setPlotOpen(true)}
          disabled={!canEdit}
          {...refusalProps(canEdit, "Plot size and sides", refusalId)}
        >
          <Settings2 aria-hidden />
          Plot size and sides
        </Button>
        <span className="ml-auto flex items-center gap-2">
          {dirty ? <Badge variant="outline">Unsaved changes</Badge> : null}
        </span>
      </div>

      {/* The drawing. */}
      <div
        ref={svgWrap}
        className="rounded-xl border border-border bg-background/40 p-2 page-md:p-3"
      >
        <LayoutPlan
          plot={layout.plot}
          pieces={layout.pieces}
          edges={layout.plot.edges}
          interaction={interaction}
          label={`Camp layout: a plot ${metres(layout.plot.widthM)} wide and ${metres(layout.plot.depthM)} deep, ${layout.pieces.length} piece${layout.pieces.length === 1 ? "" : "s"}`}
          className="max-h-[60vh]"
        />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LayoutLegend counts={counts} />
        <p className="text-xs text-muted-foreground">
          {metres(layout.plot.widthM)} × {metres(layout.plot.depthM)} · grid
          lines every{" "}
          {Math.max(layout.plot.widthM, layout.plot.depthM) <= 60
            ? "metre"
            : "5 m"}
        </p>
      </div>
      {canEdit ? (
        <p className="text-xs text-muted-foreground">
          Drag a piece, or pick it and use the arrow keys: half a metre a press,
          5 m with Shift. R turns it; Delete removes it.
        </p>
      ) : null}
      {overlapping.size > 0 ? (
        <p className="text-xs text-warning">
          {overlapping.size} pieces overlap (dashed red). Move them apart, or
          leave them if that is the plan.
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* The selected piece. */}
      {canEdit && selected ? (
        <PiecePanel
          key={selected.id}
          piece={selected}
          onChange={(next) =>
            updatePiece(selected.id, () => keepOnPlot(next, layout.plot))
          }
          onTurn={() =>
            updatePiece(selected.id, (p) => turnPiece(p, layout.plot))
          }
          onRemove={() => removePiece(selected.id)}
        />
      ) : null}

      {/* Save. */}
      {canEdit ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label="What changed (optional)"
              htmlFor="layout-note"
              className="min-w-0 flex-1"
            >
              <Input
                id="layout-note"
                value={note}
                maxLength={LAYOUT_NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Moved the kitchen closer to the water"
                aria-describedby={saveError ? "layout-save-error" : undefined}
              />
            </Field>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? (
                <Spinner size="sm" label="Saving…" />
              ) : (
                <Save aria-hidden />
              )}
              Save layout
            </Button>
            <Button
              variant="ghost"
              onClick={discard}
              disabled={!dirty || saving}
            >
              <Undo2 aria-hidden />
              Discard changes
            </Button>
          </div>
          {saveError ? (
            <p
              id="layout-save-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {saveError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Each save is kept as a version, so an older plan can be brought
              back.
            </p>
          )}
        </div>
      ) : null}

      {/* Every piece as a list: the same plan, read as text. */}
      {layout.pieces.length > 0 ? (
        <details className="rounded-xl border border-border bg-card/40 p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Every piece ({layout.pieces.length})
          </summary>
          <ul className="mt-2 divide-y divide-border" aria-label="Every piece">
            {layout.pieces.map((piece) => (
              <li
                key={piece.id}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              >
                <span className="min-w-0">
                  <span className="font-medium">{pieceName(piece)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {metres(piece.w)} × {metres(piece.h)} at {metres(piece.x)}
                    , {metres(piece.y)}
                  </span>
                </span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedId(piece.id);
                      setFocusId(piece.id);
                    }}
                    aria-label={`Pick ${pieceDescription(piece)}`}
                  >
                    Pick
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {canEdit ? (
        <PlotDialog
          open={plotOpen}
          onOpenChange={setPlotOpen}
          plot={layout.plot}
          onApply={(plot) => {
            change(resizePlot(layout, plot));
            setPlotOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** The picked piece's fields: kind, label, place and size. */
function PiecePanel({
  piece,
  onChange,
  onTurn,
  onRemove,
}: {
  piece: LayoutPiece;
  onChange: (piece: LayoutPiece) => void;
  onTurn: () => void;
  onRemove: () => void;
}) {
  const numberField = (
    key: "x" | "y" | "w" | "h",
    label: string,
    min: number,
  ) => (
    <Field label={label} htmlFor={`piece-${key}`}>
      <Input
        id={`piece-${key}`}
        type="number"
        inputMode="decimal"
        step={LAYOUT_STEP_M}
        min={min}
        max={PLOT_MAX_M}
        value={piece[key]}
        onChange={(e) => {
          const value = readMetres(e.target.value);
          if (value !== null) onChange({ ...piece, [key]: value });
        }}
        className="w-24"
      />
    </Field>
  );

  return (
    <section
      aria-label={`Picked: ${pieceName(piece)}`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3"
    >
      <h3 className="text-sm font-semibold">Picked: {pieceName(piece)}</h3>
      <div className="flex flex-wrap items-start gap-3">
        <Field label="Kind" htmlFor="piece-kind">
          <Select
            value={piece.kind}
            onValueChange={(v) =>
              onChange({ ...piece, kind: v as LayoutPieceKind })
            }
          >
            <SelectTrigger id="piece-kind" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_PIECE_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {LAYOUT_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Label"
          htmlFor="piece-label"
          className="min-w-40 flex-1"
          help="Seen by camp members only, never by neighbours."
        >
          <Input
            id="piece-label"
            value={piece.label}
            maxLength={LAYOUT_LABEL_MAX}
            placeholder={LAYOUT_KIND_LABELS[piece.kind]}
            onChange={(e) => onChange({ ...piece, label: e.target.value })}
            aria-describedby="piece-label-help"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {numberField("x", "From the left (m)", 0)}
        {numberField("y", "From the top (m)", 0)}
        {numberField("w", "Width (m)", LAYOUT_STEP_M)}
        {numberField("h", "Depth (m)", LAYOUT_STEP_M)}
        <Button variant="outline" onClick={onTurn}>
          <RotateCw aria-hidden />
          Turn
        </Button>
        <Button variant="outline" onClick={onRemove}>
          <Trash2 aria-hidden />
          Remove
        </Button>
      </div>
    </section>
  );
}

/** The plot's size, which side is north, and what borders each side. */
function PlotDialog({
  open,
  onOpenChange,
  plot,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plot: CampLayout["plot"];
  onApply: (plot: CampLayout["plot"]) => void;
}) {
  const [width, setWidth] = React.useState(String(plot.widthM));
  const [depth, setDepth] = React.useState(String(plot.depthM));
  const [north, setNorth] = React.useState<LayoutNorth>(plot.north);
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
    setEdges(plot.edges);
    setError(null);
  }, [open, plot]);

  function apply() {
    const parsed = LayoutPlot.safeParse({
      widthM: readMetres(width),
      depthM: readMetres(depth),
      north,
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
          <DialogTitle>Plot size and sides</DialogTitle>
          <DialogDescription>
            The plot in metres, from {PLOT_MIN_M} to {PLOT_MAX_M} m a side. A
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
                aria-describedby={
                  error?.field === "width" ? "plot-width-error" : undefined
                }
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
                aria-describedby={
                  error?.field === "depth" ? "plot-depth-error" : undefined
                }
              />
            </Field>
          </div>
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
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">
              What borders each side
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {EDGES.map((side) => (
                <Field
                  key={side}
                  label={EDGE_LABELS[side]}
                  htmlFor={`plot-edge-${side}`}
                >
                  <Input
                    id={`plot-edge-${side}`}
                    value={edges[side]}
                    maxLength={LAYOUT_EDGE_MAX}
                    placeholder="Road, dune, toilets…"
                    onChange={(e) =>
                      setEdges({ ...edges, [side]: e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Seen by camp members only, never by neighbours.
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
