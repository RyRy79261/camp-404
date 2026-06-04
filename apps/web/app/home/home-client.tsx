"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { CustomizeMode } from "./customize-mode";
import { type Section, sectionKey } from "./home-layout";
import { LooseTiles } from "./loose-tiles";
import { RankGroupCard } from "./rank-group-card";
import { TILE_CATALOGUE } from "./tile-catalogue";
import {
  CUSTOM_GROUP_ICON,
  CUSTOM_GROUP_TONE,
  LAYOUT_CATALOGUE,
  rankIdentity,
  resolveTiles,
} from "./tile-lookup";
import { useHomeLayout } from "./use-home-layout";

// Home control-panel client island (board S08). Owns the Customize toggle and
// the localStorage layout; renders the customizable sections (rank / custom /
// loose) in saved order, then the locked rank groups pinned at the bottom. The
// server (page.tsx) computes clearance and passes the locked group ids; locked
// tiles are never stored in the layout (security boundary preserved).

export function HomeClient({ lockedGroupIds }: { lockedGroupIds: string[] }) {
  const [customizeActive, setCustomizeActive] = useState(false);
  const { sections, setSections } = useHomeLayout(
    LAYOUT_CATALOGUE,
    lockedGroupIds,
  );

  // Return focus to the Customize pill when the editor closes; skip the initial
  // mount so we never steal focus on first paint.
  const pillRef = useRef<HTMLButtonElement>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!customizeActive) pillRef.current?.focus();
  }, [customizeActive]);

  // The seed (catalogue order) renders on SSR + first paint so hydration
  // matches; the saved overlay applies post-mount (inside the hook). Locked
  // groups are re-derived from the catalogue and pinned at the bottom.
  const lockedGroups = TILE_CATALOGUE.filter((g) => lockedGroupIds.includes(g.id));

  function renderSection(section: Section) {
    const tiles = resolveTiles(section.tiles);
    if (section.kind === "loose") {
      return <LooseTiles key="loose" tiles={tiles} />;
    }
    if (tiles.length === 0) return null; // empty sections aren't shown when off
    if (section.kind === "custom") {
      return (
        <RankGroupCard
          key={sectionKey(section)}
          name={section.title}
          icon={CUSTOM_GROUP_ICON}
          chipTone={CUSTOM_GROUP_TONE}
          locked={false}
          tiles={tiles}
          toolCount={tiles.length}
        />
      );
    }
    const identity = rankIdentity(section.id);
    if (!identity) return null;
    return (
      <RankGroupCard
        key={sectionKey(section)}
        name={identity.name}
        icon={identity.icon}
        chipTone={identity.chipTone}
        locked={false}
        tiles={tiles}
        toolCount={tiles.length}
      />
    );
  }

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
          sections={sections}
          setSections={setSections}
          lockedGroupIds={lockedGroupIds}
          onDone={() => setCustomizeActive(false)}
        />
      ) : (
        <>
          {sections.map(renderSection)}
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
        </>
      )}
    </div>
  );
}
