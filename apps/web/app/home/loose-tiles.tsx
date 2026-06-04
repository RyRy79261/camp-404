import { GridTile } from "@camp404/ui/components/grid-tile";
import type { CatalogueTile } from "./tile-catalogue";
import { homeToneFor } from "./tile-lookup";

// Dissolved-group ("loose") tiles: a flat 2-col grid with NO surrounding card /
// background tone (the owner's "everything not in that color"). Each tile keeps
// a subtle colour cue from its home rank group.

export function LooseTiles({ tiles }: { tiles: CatalogueTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((tile) => (
        <GridTile
          key={tile.id}
          icon={tile.icon}
          iconTone={homeToneFor(tile.id)}
          title={tile.title}
          hint={tile.hint}
          href={tile.comingSoon ? undefined : (tile.href ?? undefined)}
          disabled={tile.comingSoon}
        />
      ))}
    </div>
  );
}
