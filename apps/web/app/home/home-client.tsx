"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { CustomizeMode } from "./customize-mode";
import { RankGroupCard } from "./rank-group-card";
import { TILE_CATALOGUE, type RankGroupSpec } from "./tile-catalogue";
import { applyOrder, useHomeLayout } from "./use-home-layout";

// Home control-panel client island (board S08). Owns the Customize toggle and
// the localStorage layout overlay; renders the captain-first RankGroupCard stack
// when off, the CustomizeMode editor when on. The server (page.tsx) computes
// clearance and passes the locked group ids — locked groups render the
// CaptainLock with NO tiles (the catalogue is static, non-sensitive; the real
// data gate is each destination route).

export function HomeClient({ lockedGroupIds }: { lockedGroupIds: string[] }) {
  const [customizeActive, setCustomizeActive] = useState(false);
  const { mounted, order, setGroupOrder } = useHomeLayout();
  const lockedSet = new Set(lockedGroupIds);

  // Return focus to the Customize pill when the editor closes (CustomizeMode
  // focuses its own heading on open). Skip the initial mount so we never steal
  // focus on first paint.
  const pillRef = useRef<HTMLButtonElement>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!customizeActive) pillRef.current?.focus();
  }, [customizeActive]);

  // Saved order applies only after mount (SSR/first paint use the default so
  // the hydrated tree matches the server's).
  const orderedTiles = (group: RankGroupSpec) =>
    mounted ? applyOrder(group.tiles, order[group.id]) : group.tiles;

  const editableGroups = TILE_CATALOGUE.filter(
    (group) => !lockedSet.has(group.id),
  ).map((group) => ({
    id: group.id,
    name: group.name,
    tiles: orderedTiles(group),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-section font-bold text-foreground">
            Control panel
          </h1>
          <p className="text-xs text-muted-foreground">
            Everything you can run. Captain first.
          </p>
        </div>
        {!customizeActive && (
          <button
            ref={pillRef}
            type="button"
            onClick={() => setCustomizeActive(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-2 text-label font-semibold text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" />
            Customize
          </button>
        )}
      </div>

      {customizeActive ? (
        <CustomizeMode
          groups={editableGroups}
          onReorder={setGroupOrder}
          onDone={() => setCustomizeActive(false)}
        />
      ) : (
        TILE_CATALOGUE.map((group) => {
          const locked = lockedSet.has(group.id);
          return (
            <RankGroupCard
              key={group.id}
              name={group.name}
              icon={group.groupIcon}
              chipTone={group.chipTone}
              locked={locked}
              tiles={locked ? [] : orderedTiles(group)}
              toolCount={locked ? undefined : group.tiles.length}
            />
          );
        })
      )}
    </div>
  );
}
