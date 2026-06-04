import { Star, type LucideIcon } from "lucide-react";
import type { IconBadgeTone } from "@camp404/ui/components/icon-badge";
import type { LayoutGroup } from "./home-layout";
import { type CatalogueTile, TILE_CATALOGUE } from "./tile-catalogue";

// Derived lookups over the static catalogue, shared by the home client + the
// Customize editor. Sections store tile IDs; these resolve them back to the
// renderable tiles + their identity (icon/tone/name).

/** The reducer-shaped catalogue (group id + tile ids), for seed/reconcile. */
export const LAYOUT_CATALOGUE: LayoutGroup[] = TILE_CATALOGUE.map((g) => ({
  id: g.id,
  tiles: g.tiles.map((t) => ({ id: t.id })),
}));

const TILE_BY_ID = new Map<string, CatalogueTile>();
const HOME_GROUP_TONE = new Map<string, IconBadgeTone>();
for (const group of TILE_CATALOGUE) {
  for (const tile of group.tiles) {
    TILE_BY_ID.set(tile.id, tile);
    HOME_GROUP_TONE.set(tile.id, group.chipTone);
  }
}

export interface RankIdentity {
  name: string;
  icon: LucideIcon;
  chipTone: IconBadgeTone;
}
const RANK_IDENTITY = new Map<string, RankIdentity>(
  TILE_CATALOGUE.map((g) => [
    g.id,
    { name: g.name, icon: g.groupIcon, chipTone: g.chipTone },
  ]),
);

/** Resolve an ordered list of tile ids back to their catalogue tiles. */
export function resolveTiles(ids: string[]): CatalogueTile[] {
  return ids
    .map((id) => TILE_BY_ID.get(id))
    .filter((t): t is CatalogueTile => t != null);
}

/** A rank section's identity (icon/tone/name), by catalogue group id. */
export function rankIdentity(groupId: string): RankIdentity | undefined {
  return RANK_IDENTITY.get(groupId);
}

/** A loose tile's tone = its home rank group's tone (a subtle, card-less cue). */
export function homeToneFor(tileId: string): IconBadgeTone {
  return HOME_GROUP_TONE.get(tileId) ?? "muted";
}

/** The fixed identity for a user-created custom group. */
export const CUSTOM_GROUP_ICON = Star;
export const CUSTOM_GROUP_TONE: IconBadgeTone = "accent";
