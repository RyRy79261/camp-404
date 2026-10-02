"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCw, Settings2 } from "lucide-react";
import {
  LAYOUT_KIND_LABELS,
  keepOnPlot,
  movePiece,
  newPiece,
  overlappingPieces,
  pieceKeys,
  pieceName,
  resizePlot,
  snap,
  turnPiece,
} from "@camp404/core";
import { usePhone } from "@camp404/os";
import {
  LAYOUT_LABEL_MAX,
  LAYOUT_NOTE_MAX,
  LAYOUT_PIECE_KINDS,
  LAYOUT_STEP_M,
  PLOT_MAX_M,
  type CampLayout,
  type LayoutPiece,
  type LayoutPieceKind,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { Card } from "@camp404/ui/components/card";
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
import { cn } from "@camp404/ui/lib/utils";
import { saveLayoutAction } from "@/app/(console)/camp-layout/actions";
import { KeyChip, LayoutKey } from "./layout-key";
import { LayoutPlan, metres, type PlanInteraction } from "./layout-plan";
import { PlotDialog, readMetres } from "./layout-plot-dialog";

// The camp layout's workspace (#271; the approved redesign, owner 2026-10-01,
// option A): the plan, its numbered key and a 320 px side rail, the whole
// plot in view at once. The rail's tabs hold the picked piece (for an
// editor), "This plan" (for everyone else), the versions, the arrivals and,
// for a captain, the neighbour link; Save sits at the rail's foot.
//
// Everything happens in the browser until Save, which writes the whole plan
// as a new version (compare-and-set on the version it opened). Keyboard
// first: every piece is a button in the drawing; arrow keys move the focused
// piece half a metre (Shift: 5 m), R turns it, Delete removes it. Pointer drag
// works too, with listeners that exist only while a drag does.
//
// Who may not edit gets no tools at all: the plan, the key and the rail, read
// only (the audit: a greyed-out toolbar read as a broken form). A phone reads
// the plan too: it is drawn on a computer, and the server checks every save
// regardless.

const ARROWS: Readonly<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The plan, the key and the rail share one height: the mock-up's 564 px, cut
 * to what the window leaves under its heading, so the whole plot is in view
 * at once on a laptop. The window opens at 1120 x 800, cut to the screen
 * (desktop-shell.tsx): its body ends 108 px above the screen's foot, and the
 * heading takes 202 px of it (with the toolbar 246 px, with an older
 * version's banner 262 px). The caps keep the body inside an 800 px window.
 */
const BODY_HEIGHT = "page-md:h-[clamp(24rem,calc(100svh-19.375rem),35.25rem)]";
/** An editor's toolbar takes a row of that room. */
const BODY_HEIGHT_EDITING =
  "page-md:h-[clamp(24rem,calc(100svh-22.125rem),34.625rem)]";
/** An older version's banner takes a taller row. */
const BODY_HEIGHT_BANNER =
  "page-md:h-[clamp(24rem,calc(100svh-23.125rem),33.625rem)]";

/** The rail's soft button: the window's choice colour, 32 px tall. */
const RAIL_BUTTON = "h-8 px-3 text-[13px] font-semibold";

function newId(): string {
  return `p-${crypto.randomUUID()}`;
}

export type RailTab = "piece" | "about" | "versions" | "arrivals" | "share";

const TAB_LABELS: Readonly<Record<RailTab, string>> = {
  piece: "Piece",
  about: "This plan",
  versions: "Versions",
  arrivals: "Arrivals",
  share: "Share",
};

export function LayoutWorkspace({
  initial,
  version,
  canEdit,
  about,
  versions,
  arrivals,
  share,
  label,
  underBanner = false,
}: {
  initial: CampLayout;
  /** The latest version: what a save expects to replace. */
  version: number;
  /** May change the plan here: an editor, looking at the latest version. */
  canEdit: boolean;
  /** "This plan": the version, who drew it, our part of the block. */
  about: React.ReactNode;
  versions: React.ReactNode;
  arrivals: React.ReactNode;
  /** A captain's neighbour link; null for everyone else. */
  share: React.ReactNode | null;
  /** The drawing's accessible name. */
  label: string;
  /** An older version's banner sits above, taking the toolbar's row. */
  underBanner?: boolean;
}) {
  const router = useRouter();
  const phone = usePhone();
  const editing = canEdit && !phone;
  const [layout, setLayout] = React.useState<CampLayout>(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [lastChange, setLastChange] = React.useState("");
  const [addKind, setAddKind] = React.useState<LayoutPieceKind>("tent");
  const [note, setNote] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saving, startSave] = React.useTransition();
  const [plotOpen, setPlotOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusId, setFocusId] = React.useState<string | null>(null);
  // An older version opens from the Versions tab, and keeps it in view.
  const [chosenTab, setChosenTab] = React.useState<RailTab | null>(
    underBanner ? "versions" : null,
  );
  const svgWrap = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const tabs: RailTab[] = [
    editing ? "piece" : "about",
    "versions",
    "arrivals",
    ...(share ? (["share"] as const) : []),
  ];
  const bodyHeight = underBanner
    ? BODY_HEIGHT_BANNER
    : editing
      ? BODY_HEIGHT_EDITING
      : BODY_HEIGHT;
  const tab =
    chosenTab && tabs.includes(chosenTab) ? chosenTab : (tabs[0] as RailTab);

  const selected = layout.pieces.find((p) => p.id === selectedId) ?? null;
  const keys = React.useMemo(() => pieceKeys(layout.pieces), [layout.pieces]);
  const overlapping = React.useMemo(
    () => overlappingPieces(layout.pieces),
    [layout.pieces],
  );
  const topName = layout.plot.edges.top.trim() || "the top";

  // Warn before leaving with unsaved changes: an event, not a timer.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // A piece just added (or picked in the key) takes the keyboard focus.
  React.useEffect(() => {
    if (!focusId) return;
    const node = svgWrap.current?.querySelector<SVGGElement>(
      `[data-piece="${focusId}"]`,
    );
    node?.focus({ preventScroll: true });
    setFocusId(null);
  }, [focusId]);

  function change(next: CampLayout, what: string) {
    setLayout(next);
    setDirty(true);
    setSaveError(null);
    setLastChange(what);
  }

  function updatePiece(
    id: string,
    fn: (piece: LayoutPiece) => LayoutPiece,
    what: string,
  ) {
    change(
      {
        ...layout,
        pieces: layout.pieces.map((p) => (p.id === id ? fn(p) : p)),
      },
      what,
    );
  }

  function pick(id: string | null) {
    setSelectedId(id);
    if (id && editing) setChosenTab("piece");
  }

  function removePiece(id: string) {
    const piece = layout.pieces.find((p) => p.id === id);
    const name = piece ? pieceName(piece) : "Piece";
    change(
      { ...layout, pieces: layout.pieces.filter((p) => p.id !== id) },
      `${name} removed`,
    );
    setSelectedId(null);
    setAnnouncement(`${name} removed.`);
  }

  function addPiece() {
    const piece = newPiece(addKind, newId(), layout.plot);
    change(
      { ...layout, pieces: [...layout.pieces, piece] },
      `${LAYOUT_KIND_LABELS[addKind]} added`,
    );
    pick(piece.id);
    setFocusId(piece.id);
    setAnnouncement(`${LAYOUT_KIND_LABELS[addKind]} added in the middle.`);
  }

  function discard() {
    setLayout(initial);
    setDirty(false);
    setSelectedId(null);
    setSaveError(null);
    setNote("");
    setLastChange("");
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
      setLastChange("");
      toast.success(`Layout saved (version ${result.data.version})`);
      router.refresh();
    });
  }

  const interaction: PlanInteraction | undefined = editing
    ? {
        overlapping,
        onSelect: pick,
        onBackgroundPointerDown: () => setSelectedId(null),
        onPieceKeyDown: (id, event) => {
          const piece = layout.pieces.find((p) => p.id === id);
          if (!piece) return;
          const name = pieceName(piece);
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
            updatePiece(id, () => moved, `${name} moved`);
            setAnnouncement(
              `${name} at ${metres(moved.x)} from the left edge, ${metres(moved.y)} from ${topName}.`,
            );
          } else if (event.key === "r" || event.key === "R") {
            event.preventDefault();
            const turned = turnPiece(piece, layout.plot);
            updatePiece(id, () => turned, `${name} turned`);
            setAnnouncement(
              `${name} turned: ${metres(turned.w)} by ${metres(turned.h)}.`,
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
          pick(id);
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
              setLastChange(`${pieceName(piece)} moved`);
            }
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        },
      }
    : undefined;

  return (
    <div className="flex flex-col">
      {editing ? (
        <div
          role="toolbar"
          aria-label="Layout tools"
          className="mb-3 flex flex-wrap items-center gap-2"
        >
          <span className="inline-flex">
            <Select
              value={addKind}
              onValueChange={(v) => setAddKind(v as LayoutPieceKind)}
            >
              <SelectTrigger
                className="h-8 w-36 border-r-0 text-[13px]"
                aria-label="Kind of piece to add"
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
              size="sm"
              className={RAIL_BUTTON}
              onClick={addPiece}
            >
              <Plus aria-hidden />
              Add piece
            </Button>
          </span>
          <Button
            variant="outline"
            size="sm"
            className={RAIL_BUTTON}
            onClick={() => setPlotOpen(true)}
          >
            <Settings2 aria-hidden />
            Plot size and roads
          </Button>
          {overlapping.size > 0 ? (
            <p className="text-xs text-warning">
              {overlapping.size} pieces overlap (dashed red).
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          "page-md:grid-cols-[auto_minmax(0,1fr)_17.5rem] page-lg:grid-cols-[auto_minmax(0,1fr)_18.25rem] page-xl:grid-cols-[auto_minmax(0,1fr)_20rem]",
        )}
      >
        {/* The plan: the whole plot in view, its height the body's. */}
        <Card
          ref={svgWrap}
          className={cn(
            "flex items-center justify-center bg-[var(--plan-card)] p-2 page-md:max-w-[40cqw] page-md:p-3",
            bodyHeight,
          )}
        >
          <LayoutPlan
            plot={layout.plot}
            pieces={layout.pieces}
            keys={keys}
            edges={layout.plot.edges}
            interaction={interaction}
            selectedId={selectedId}
            highlightId={editing ? null : selectedId}
            label={label}
            className="h-auto w-full page-md:h-full page-md:w-auto page-md:max-w-full"
          />
        </Card>

        <Card className={cn("p-4 page-md:overflow-auto", bodyHeight)}>
          <LayoutKey
            pieces={layout.pieces}
            keys={keys}
            pickedId={selectedId}
            onPick={(id) => {
              const next = selectedId === id && !editing ? null : id;
              pick(next);
              if (next && editing) setFocusId(next);
            }}
          />
        </Card>

        <Card className={cn("flex flex-col p-0", bodyHeight)}>
          <div
            role="tablist"
            aria-label="About the plan"
            className="mx-3 mt-3 flex gap-1 bg-[color-mix(in_oklab,var(--color-background)_70%,var(--color-card))] p-1"
          >
            {tabs.map((t, i) => (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`layout-tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`layout-panel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setChosenTab(t)}
                onKeyDown={(e) => {
                  // Roving tabIndex: arrows move both the choice and focus
                  // (Home/End jump to the ends), so a keyboard user never
                  // lands on a tab that isn't the selected one.
                  let next: number;
                  if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
                  else if (e.key === "ArrowLeft")
                    next = (i - 1 + tabs.length) % tabs.length;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = tabs.length - 1;
                  else return;
                  e.preventDefault();
                  setChosenTab(tabs[next]!);
                  tabRefs.current[next]?.focus();
                }}
                className={cn(
                  "h-7 min-w-0 flex-1 whitespace-nowrap px-1 text-xs font-semibold text-muted-foreground",
                  tab === t &&
                    "bg-[var(--color-choice,color-mix(in_oklab,var(--color-primary)_14%,var(--color-card)))] text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]",
                )}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`layout-panel-${tab}`}
            aria-labelledby={`layout-tab-${tab}`}
            className="min-h-0 flex-1 overflow-auto p-4"
          >
            {tab === "piece" ? (
              selected ? (
                <PiecePanel
                  key={selected.id}
                  piece={selected}
                  pieceKey={keys.get(selected.id) ?? ""}
                  topName={topName}
                  onChange={(next, what) =>
                    updatePiece(
                      selected.id,
                      () => keepOnPlot(next, layout.plot),
                      what,
                    )
                  }
                  onTurn={() =>
                    updatePiece(
                      selected.id,
                      (p) => turnPiece(p, layout.plot),
                      `${pieceName(selected)} turned`,
                    )
                  }
                  onRemove={() => removePiece(selected.id)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {layout.pieces.length === 0
                    ? "Nothing drawn yet. Add the first piece."
                    : "Pick a piece on the plan, or in the key, to change it."}
                </p>
              )
            ) : tab === "about" ? (
              about
            ) : tab === "versions" ? (
              versions
            ) : tab === "arrivals" ? (
              arrivals
            ) : (
              share
            )}
          </div>

          {editing ? (
            <footer className="grid gap-2 border-t border-border bg-[color-mix(in_oklab,var(--color-card)_80%,var(--color-primary)_6%)] px-4 pb-4 pt-3">
              {dirty ? (
                <>
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <Badge className="shrink-0 rounded-none">Unsaved</Badge>
                    <span className="truncate text-muted-foreground">
                      {lastChange}
                    </span>
                  </div>
                  <Input
                    value={note}
                    maxLength={LAYOUT_NOTE_MAX}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What changed? (optional)"
                    aria-label="What changed (optional)"
                    aria-describedby={
                      saveError ? "layout-save-error" : undefined
                    }
                    className="h-8 text-[13px]"
                  />
                  {saveError ? (
                    <p
                      id="layout-save-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {saveError}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={RAIL_BUTTON}
                      onClick={discard}
                      disabled={saving}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      className={RAIL_BUTTON}
                      onClick={save}
                      disabled={saving}
                    >
                      {saving ? <Spinner size="sm" label="Saving…" /> : null}
                      Save layout
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No changes yet. Each save is kept as a new version.
                </p>
              )}
            </footer>
          ) : null}
        </Card>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {editing ? (
        <PlotDialog
          open={plotOpen}
          onOpenChange={setPlotOpen}
          plot={layout.plot}
          onApply={(plot) => {
            change(resizePlot(layout, plot), "Plot changed");
            setPlotOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** A field in the rail: a small capital label over its control. */
function RailField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 grid gap-1">
      <label
        htmlFor={htmlFor}
        className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** The picked piece: its label, kind, size and place, and Turn and Remove. */
function PiecePanel({
  piece,
  pieceKey,
  topName,
  onChange,
  onTurn,
  onRemove,
}: {
  piece: LayoutPiece;
  pieceKey: string;
  topName: string;
  onChange: (piece: LayoutPiece, what: string) => void;
  onTurn: () => void;
  onRemove: () => void;
}) {
  const name = pieceName(piece);
  const numberField = (
    key: "x" | "y" | "w" | "h",
    label: string,
    min: number,
    what: string,
  ) => (
    <RailField label={label} htmlFor={`piece-${key}`}>
      <span className="relative block">
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
            if (value !== null) onChange({ ...piece, [key]: value }, what);
          }}
          className="h-8 pr-7 text-[13px] tabular-nums"
        />
        <i
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 text-xs not-italic text-muted-foreground"
        >
          m
        </i>
      </span>
    </RailField>
  );

  return (
    <section aria-label={`Picked: ${pieceKey} ${name}`}>
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <KeyChip kind={piece.kind} text={pieceKey} />
          <span className="truncate">{name}</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Drag it, or nudge it with the arrow keys.
        </p>
      </div>
      <RailField label="Label" htmlFor="piece-label">
        <Input
          id="piece-label"
          value={piece.label}
          maxLength={LAYOUT_LABEL_MAX}
          placeholder="e.g. Zanele"
          onChange={(e) =>
            onChange({ ...piece, label: e.target.value }, `${name} renamed`)
          }
          className="h-8 text-[13px]"
        />
      </RailField>
      <RailField label="Kind" htmlFor="piece-kind">
        <Select
          value={piece.kind}
          onValueChange={(v) =>
            onChange(
              { ...piece, kind: v as LayoutPieceKind },
              `${name} changed`,
            )
          }
        >
          <SelectTrigger id="piece-kind" className="h-8 text-[13px]">
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
      </RailField>
      <div className="grid grid-cols-2 gap-x-3">
        {numberField("w", "Width", LAYOUT_STEP_M, `${name} resized`)}
        {numberField("h", "Depth", LAYOUT_STEP_M, `${name} resized`)}
        {numberField("x", "From left edge", 0, `${name} moved`)}
        {numberField("y", `From ${topName}`, 0, `${name} moved`)}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className={RAIL_BUTTON}
          onClick={onTurn}
        >
          <RotateCw aria-hidden />
          Turn 90°
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(RAIL_BUTTON, "text-destructive hover:text-destructive")}
          onClick={onRemove}
        >
          Remove piece
        </Button>
      </div>
    </section>
  );
}
