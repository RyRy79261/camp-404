"use client";

import { Trash2, type LucideIcon } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { IconBadge, type IconBadgeTone } from "@camp404/ui/components/icon-badge";
import { cn } from "@camp404/ui/lib/utils";
import { DraggableTileRow, type MoveTarget } from "./draggable-tile-row";
import { resolveTiles } from "./tile-lookup";

// One editable section inside CustomizeMode: a droppable container (so empty
// groups + the loose bucket are drop targets) wrapping a SortableContext of the
// section's tile rows. Rank/custom groups get a tinted header (chip + name +
// dissolve); the loose bucket is a card-less "Ungrouped" drop area.

export interface EditableSectionProps {
  /** The dnd container id (== sectionKey). */
  id: string;
  kind: "rank" | "custom" | "loose";
  tileIds: string[];
  /** Header chrome (rank/custom only). */
  name?: string;
  icon?: LucideIcon;
  tone?: IconBadgeTone;
  /** Inline title editing (custom only). */
  onRename?: (title: string) => void;
  /** Dissolve control (rank/custom only). */
  onDissolve?: () => void;
  moveTargets: (currentKey: string) => MoveTarget[];
  onMoveTo: (tileId: string, targetKey: string) => void;
}

export function EditableSection({
  id,
  kind,
  tileIds,
  name,
  icon: Icon,
  tone = "muted",
  onRename,
  onDissolve,
  moveTargets,
  onMoveTo,
}: EditableSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const tiles = resolveTiles(tileIds);
  const targets = moveTargets(id);

  const rows = (
    <SortableContext items={tileIds} strategy={verticalListSortingStrategy}>
      <ul className="flex flex-col gap-2">
        {tiles.map((tile) => (
          <DraggableTileRow
            key={tile.id}
            id={tile.id}
            icon={tile.icon}
            title={tile.title}
            moveTargets={targets}
            onMoveTo={onMoveTo}
          />
        ))}
        {tiles.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-micro text-muted-foreground">
            Drop a tile here
          </li>
        )}
      </ul>
    </SortableContext>
  );

  if (kind === "loose") {
    return (
      <div ref={setNodeRef} className="flex flex-col gap-2">
        <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
          Ungrouped
        </p>
        <div className={cn("rounded-lg", isOver && "ring-2 ring-accent")}>
          {rows}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3.5",
        kind === "custom"
          ? "border-accent/60 bg-accent/10"
          : "border-border bg-muted",
        isOver && "ring-2 ring-accent",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {Icon && (
            <IconBadge size="sm" shape="rounded" tone={tone}>
              <Icon aria-hidden="true" />
            </IconBadge>
          )}
          {kind === "custom" && onRename ? (
            <input
              value={name ?? ""}
              onChange={(e) => onRename(e.target.value)}
              aria-label="Group name"
              className="min-w-0 flex-1 rounded border-none bg-transparent text-subtitle-dense font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          ) : (
            <span className="truncate text-subtitle-dense font-bold text-foreground">
              {name}
            </span>
          )}
          {kind === "custom" && (
            <span className="shrink-0 text-xs font-semibold text-accent">
              {tileIds.length}
            </span>
          )}
        </div>
        {onDissolve && (
          <button
            type="button"
            onClick={onDissolve}
            aria-label={`Dissolve ${name ?? "group"}`}
            className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
      {rows}
    </div>
  );
}
