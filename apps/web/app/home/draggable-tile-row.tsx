"use client";

import { GripVertical, type LucideIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@camp404/ui/components/badge";
import { cn } from "@camp404/ui/lib/utils";

// A single Customize-mode tile row (board S08 ReorderDemo row): grip handle +
// tool icon + title, with a "Moving" badge while dragging. Only the grip is the
// drag activator, so the row matches the board's "grab a tile by its handle".

export function DraggableTileRow({
  id,
  icon: Icon,
  title,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5",
        isDragging
          ? "z-10 border-accent opacity-95 shadow-lg"
          : "border-border",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${title}`}
        className="cursor-grab touch-none rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <GripVertical
          aria-hidden
          className={cn(
            "h-4 w-4",
            isDragging ? "text-accent" : "text-muted-foreground",
          )}
        />
      </button>
      <Icon aria-hidden className="h-4 w-4 text-primary" />
      <span className="flex-1 truncate text-label font-semibold text-foreground">
        {title}
      </span>
      {isDragging && (
        <Badge
          variant="outline"
          className="border-transparent bg-accent/15 text-micro-xs font-bold text-accent"
        >
          Moving
        </Badge>
      )}
    </li>
  );
}
