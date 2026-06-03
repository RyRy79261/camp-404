import type { LucideIcon } from "lucide-react";
import { CaptainLock } from "@camp404/ui/components/captain-lock";
import { GridTile } from "@camp404/ui/components/grid-tile";
import { IconBadge, type IconBadgeTone } from "@camp404/ui/components/icon-badge";
import type { CatalogueTile } from "./tile-catalogue";

interface RankGroupCardProps {
  /** Group label — "Captain", "Team Lead", "Team Member". */
  name: string;
  /** GroupHead chip icon. */
  icon: LucideIcon;
  /** Chip + per-tile icon-box tone, keyed to the group identity. */
  chipTone: IconBadgeTone;
  /**
   * The group's tools. The page passes `[]` for a locked group — a security
   * boundary, not visual dimming: locked-group tile data never reaches the
   * client (decision D3).
   */
  tiles: CatalogueTile[];
  /** Viewer lacks clearance — render the lock in place of the grid. */
  locked: boolean;
  /** Tool count shown in the head; omitted when locked (no cardinality leak). */
  toolCount?: number;
}

/**
 * One rank group on the home control panel (board S08): a GroupHead (tinted
 * chip + name + tool count) over a 2-column grid of tool tiles. When the viewer
 * lacks clearance the grid is replaced by the preview-but-locked `CaptainLock`,
 * and the page has already withheld the tiles. Server component — the page
 * passes the lucide icons straight through.
 */
export function RankGroupCard({
  name,
  icon: Icon,
  chipTone,
  tiles,
  locked,
  toolCount,
}: RankGroupCardProps) {
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-muted p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconBadge size="sm" shape="rounded" tone={chipTone}>
            <Icon aria-hidden="true" />
          </IconBadge>
          <span className="text-subtitle-dense font-bold text-foreground">
            {name}
          </span>
        </div>
        {!locked && toolCount !== undefined ? (
          <span className="text-xs font-medium text-muted-foreground">
            {toolCount} tools
          </span>
        ) : null}
      </div>

      {locked ? (
        <CaptainLock />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <GridTile
              key={tile.id}
              icon={tile.icon}
              iconTone={chipTone}
              title={tile.title}
              hint={tile.hint}
              href={tile.comingSoon ? undefined : tile.href ?? undefined}
              disabled={tile.comingSoon}
            />
          ))}
        </div>
      )}
    </section>
  );
}
