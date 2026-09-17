"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
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
import { useReducedMotion } from "@/lib/use-reduced-motion";

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

/**
 * What dnd-kit's live region says during a keyboard or pointer drag. Its
 * defaults read ids ("draggable item tile-roster"); these use the tile and
 * group names on screen.
 */
export function dragAnnouncements(sections: Section[]): Announcements {
  const tileName = (id: string | number) =>
    resolveTiles([String(id)])[0]?.title ?? "the tile";
  const placeName = (id: string | number) => {
    const key = containerOf(sections, String(id));
    const section = key ? sections.find((s) => sectionKey(s) === key) : null;
    return section ? sectionLabel(section) : "another group";
  };
  return {
    onDragStart: ({ active }) => `Picked up ${tileName(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${tileName(active.id)} is over ${placeName(over.id)}.`
        : `${tileName(active.id)} is not over a group.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${tileName(active.id)} in ${placeName(over.id)}.`
        : `Dropped ${tileName(active.id)}. It stays where it was.`,
    onDragCancel: ({ active }) =>
      `Stopped moving ${tileName(active.id)}. It is back where it was.`,
  };
}

export function CustomizeMode({
  sections,
  setSections,
  lockedGroupIds,
  onDone,
  onReset,
}: {
  sections: Section[];
  setSections: (updater: Section[] | ((prev: Section[]) => Section[])) => void;
  lockedGroupIds: string[];
  onDone: () => void;
  /** Put the default layout back (useHomeLayout's reset). */
  onReset: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // In-flight working copy during a drag (committed on drag end); null when idle.
  const [working, setWorking] = useState<Section[] | null>(null);
  // Polite SR announcement for the non-drag controls (dissolve / Move menu),
  // which dnd-kit's own announcer doesn't cover.
  const [status, setStatus] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  const reducedMotion = useReducedMotion();
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

  async function handleReset() {
    const sure = await confirm({
      title: "Reset your layout?",
      description:
        "Every tile goes back to its first place, and your own groups are removed. The tiles in them stay on the panel.",
      confirmLabel: "Reset layout",
      destructive: true,
    });
    if (!sure) return;
    onReset();
    setStatus("Layout reset to the default");
    refocusHeading();
  }

  const announcements = dragAnnouncements(display);

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
      className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
    >
      {confirmDialog}
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
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To pick up a tile, press Space or Enter. Move it with the arrow keys. Press Space or Enter again to drop it, or Escape to cancel.",
          },
        }}
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

        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
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

      {/* Not on board S08: a quiet text button, built from the kit, with a
          confirm because it throws away the member's arrangement. */}
      <button
        type="button"
        onClick={() => void handleReset()}
        className="inline-flex items-center justify-center gap-1.5 self-center rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        Reset layout
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
