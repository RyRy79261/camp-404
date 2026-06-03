"use client";

import { useEffect, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DraggableTileRow } from "./draggable-tile-row";
import type { CatalogueTile } from "./tile-catalogue";

// Customize-mode editor (board S08 CustomizeMode — DRAG TO REORDER). Each
// unlocked group is its own sortable list, so reordering stays within a group
// (locked groups are never editable — decision: unlocked-scope-only). Pinned
// favourites + new custom groups are a deferred follow-up.

export interface EditableGroup {
  id: string;
  name: string;
  tiles: CatalogueTile[];
}

function GroupSortList({
  group,
  onReorder,
  labelled,
}: {
  group: EditableGroup;
  onReorder: (groupId: string, orderedIds: string[]) => void;
  labelled: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = group.tiles.map((t) => t.id);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(group.id, arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <div className="flex flex-col gap-2">
      {labelled && (
        <p className="text-xs font-semibold text-muted-foreground">
          {group.name}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul aria-label={group.name} className="flex flex-col gap-2">
            {group.tiles.map((tile) => (
              <DraggableTileRow
                key={tile.id}
                id={tile.id}
                icon={tile.icon}
                title={tile.title}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export function CustomizeMode({
  groups,
  onReorder,
  onDone,
}: {
  groups: EditableGroup[];
  onReorder: (groupId: string, orderedIds: string[]) => void;
  onDone: () => void;
}) {
  // Move focus into the editor on entry (it mounts only when Customize is
  // toggled on); the host returns focus to the Customize pill on exit.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby="customize-layout-heading"
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-3.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden className="h-4 w-4 text-accent" />
          <h2
            id="customize-layout-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-subtitle-dense font-bold text-foreground outline-none"
          >
            Customize layout
          </h2>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-primary px-3.5 py-1.5 text-label font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Done
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Grab a tile by its handle and drag it to a new spot within a group.
      </p>
      <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
        Drag to reorder
      </p>
      {groups.map((group) => (
        <GroupSortList
          key={group.id}
          group={group}
          onReorder={onReorder}
          labelled={groups.length > 1}
        />
      ))}
    </section>
  );
}
