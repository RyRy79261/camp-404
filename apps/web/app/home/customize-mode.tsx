"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, SlidersHorizontal } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  type Section,
  createCustomSection,
  dissolveSection,
  dropIndex,
  moveTile,
  renameCustomSection,
  sectionKey,
} from "./home-layout";
import { EditableSection } from "./editable-section";
import type { MoveTarget } from "./draggable-tile-row";
import { RankGroupCard } from "./rank-group-card";
import { TILE_CATALOGUE } from "./tile-catalogue";
import {
  CUSTOM_GROUP_ICON,
  CUSTOM_GROUP_TONE,
  rankIdentity,
  resolveTiles,
} from "./tile-lookup";

const NEW_GROUP_KEY = "__new__";

function newCustomId(): string {
  // Client-only (this component is "use client" and the id is minted on a user
  // action), so crypto.randomUUID is available; the fallback keeps it safe.
  try {
    return `custom-${crypto.randomUUID()}`;
  } catch {
    return `custom-${Date.now()}`;
  }
}

function sectionLabel(section: Section): string {
  if (section.kind === "loose") return "Ungrouped";
  if (section.kind === "custom") return section.title || "Custom group";
  return rankIdentity(section.id)?.name ?? section.id;
}

/** Which section (by key) owns a dnd id — a container id, or the tile's parent. */
function containerOf(sections: Section[], id: string): string | null {
  if (sections.some((s) => sectionKey(s) === id)) return id;
  const owner = sections.find((s) => s.tiles.includes(id));
  return owner ? sectionKey(owner) : null;
}

function indexInContainer(sections: Section[], key: string, tileId: string): number {
  const sec = sections.find((s) => sectionKey(s) === key);
  if (!sec) return -1;
  const i = sec.tiles.indexOf(tileId);
  return i >= 0 ? i : sec.tiles.length;
}

export function CustomizeMode({
  sections,
  setSections,
  lockedGroupIds,
  onDone,
}: {
  sections: Section[];
  setSections: (updater: Section[] | ((prev: Section[]) => Section[])) => void;
  lockedGroupIds: string[];
  onDone: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // In-flight working copy during a drag (committed on drag end); null when idle.
  const [working, setWorking] = useState<Section[] | null>(null);
  // Polite SR announcement for the non-drag controls (dissolve / Move menu),
  // which dnd-kit's own announcer doesn't cover.
  const [status, setStatus] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Dissolve / Move re-parent or remove the focused element, so move focus back
  // to the (stable) heading rather than stranding it on <body>.
  function refocusHeading() {
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  const display = working ?? sections;
  const lockedGroups = TILE_CATALOGUE.filter((g) => lockedGroupIds.includes(g.id));

  function moveTargetsFor(currentKey: string): MoveTarget[] {
    const targets: MoveTarget[] = display
      .filter((s) => sectionKey(s) !== currentKey)
      .map((s) => ({ key: sectionKey(s), label: sectionLabel(s) }));
    targets.push({ key: NEW_GROUP_KEY, label: "+ New group" });
    return targets;
  }

  function handleMoveTo(tileId: string, targetKey: string) {
    const title = resolveTiles([tileId])[0]?.title ?? "Tile";
    if (targetKey === NEW_GROUP_KEY) {
      const id = newCustomId();
      setSections((prev) => moveTile(createCustomSection(prev, id), tileId, `custom:${id}`));
      setStatus(`Moved ${title} to a new group`);
    } else {
      const label = display.find((s) => sectionKey(s) === targetKey);
      setSections((prev) => moveTile(prev, tileId, targetKey));
      setStatus(`Moved ${title} to ${label ? sectionLabel(label) : "another group"}`);
    }
    refocusHeading();
  }

  function handleDissolve(section: Section) {
    setSections((prev) => dissolveSection(prev, sectionKey(section)));
    setStatus(`Dissolved ${sectionLabel(section)} — its tiles are now ungrouped`);
    refocusHeading();
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setWorking(sections);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    setWorking((prev) => {
      const secs = prev ?? sections;
      const from = containerOf(secs, String(active.id));
      const to = containerOf(secs, String(over.id));
      if (!from || !to || from === to) return secs;
      return moveTile(secs, String(active.id), to, indexInContainer(secs, to, String(over.id)));
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const secs = working ?? sections;
    const activeId = String(active.id);
    if (over) {
      const to = containerOf(secs, String(over.id));
      if (to) {
        // onDragOver has already placed the active tile cross-container, so the
        // target index is computed with it EXCLUDED to land on the preview.
        const sec = secs.find((s) => sectionKey(s) === to);
        const at = dropIndex(
          sec?.tiles ?? [],
          activeId,
          String(over.id),
          String(over.id) === to,
        );
        setSections(moveTile(secs, activeId, to, at));
      } else {
        setSections(secs);
      }
    } else {
      setSections(secs);
    }
    setWorking(null);
    setActiveId(null);
  }

  function onDragCancel() {
    setWorking(null);
    setActiveId(null);
  }

  const activeTile = activeId ? resolveTiles([activeId])[0] : undefined;

  return (
    <section
      aria-labelledby="customize-layout-heading"
      className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-3.5"
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
        Drag a tile by its handle to a new spot or another group, or use its
        Move menu. Make a new group, or dissolve one to free its tiles.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex flex-col gap-3">
          {display.map((section) => (
            <EditableSection
              key={sectionKey(section)}
              id={sectionKey(section)}
              kind={section.kind}
              tileIds={section.tiles}
              name={
                section.kind === "loose"
                  ? undefined
                  : section.kind === "custom"
                    ? section.title
                    : rankIdentity(section.id)?.name
              }
              icon={
                section.kind === "loose"
                  ? undefined
                  : section.kind === "custom"
                    ? CUSTOM_GROUP_ICON
                    : rankIdentity(section.id)?.icon
              }
              tone={
                section.kind === "custom"
                  ? CUSTOM_GROUP_TONE
                  : section.kind === "rank"
                    ? rankIdentity(section.id)?.chipTone
                    : undefined
              }
              onRename={
                section.kind === "custom"
                  ? (title) =>
                      setSections((prev) => renameCustomSection(prev, section.id, title))
                  : undefined
              }
              onDissolve={
                section.kind === "loose" ? undefined : () => handleDissolve(section)
              }
              moveTargets={moveTargetsFor}
              onMoveTo={handleMoveTo}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTile &&
            (() => {
              const ActiveIcon = activeTile.icon;
              return (
                <div className="flex items-center gap-2.5 rounded-lg border border-accent bg-card px-3 py-2.5 shadow-lg">
                  <GripVertical aria-hidden className="h-4 w-4 text-accent" />
                  <ActiveIcon aria-hidden className="h-4 w-4 text-primary" />
                  <span className="text-label font-semibold text-foreground">
                    {activeTile.title}
                  </span>
                </div>
              );
            })()}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        onClick={() => setSections((prev) => createCustomSection(prev, newCustomId()))}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/60 py-3 text-label font-semibold text-muted-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Plus aria-hidden className="h-4 w-4" />
        New group
      </button>

      {lockedGroups.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
            Locked — fixed at the bottom
          </p>
          {lockedGroups.map((group) => (
            <RankGroupCard
              key={group.id}
              name={group.name}
              icon={group.groupIcon}
              chipTone={group.chipTone}
              locked
              tiles={[]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
