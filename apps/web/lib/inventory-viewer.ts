import "server-only";

import { inventoryEditor } from "@camp404/core";
import { Team, type ViewerRank } from "@camp404/types";
import { activeTeams, getTeamsConfig, teamLabelMap } from "./camp-config";
import type { CaptainPageAccess } from "./captain-gate";

// Who is looking at an inventory page, and what they may change (#246). Every
// approved member reads the inventory; `canEdit(team)` is canEditInventory on
// the viewer's rank and the teams they lead this year. The pages hide or
// disable controls by it; every write checks again on its own.

export interface InventoryViewer {
  userId: string;
  rank: ViewerRank;
  canEdit: (team: string) => boolean;
  /** Every team's label, archived ones too: old gear keeps its team's name. */
  teamLabel: (team: string) => string;
  /** The active teams this viewer may put gear or needs under. */
  editableTeams: { value: string; label: string }[];
  /** Where a team sits in the camp's own team order (unknown teams last). */
  teamOrder: (team: string) => number;
}

/**
 * From the page's own gate (`captainPageGate("camp_member")`, called in the
 * page so the program registry's drift test reads its bar there).
 */
export async function inventoryViewer({
  campUser,
  rank,
  actor,
}: Pick<
  CaptainPageAccess,
  "campUser" | "rank" | "actor"
>): Promise<InventoryViewer> {
  const config = await getTeamsConfig();
  const labels = teamLabelMap(config);
  const canEdit = (team: string) => inventoryEditor(team).allows(actor);
  const order = new Map(activeTeams(config).map((t, i) => [t.key, i]));
  return {
    userId: campUser.id,
    rank,
    canEdit,
    teamLabel: (team) => labels[team] ?? team,
    editableTeams: activeTeams(config)
      .filter((t) => Team.safeParse(t.key).success && canEdit(t.key))
      .map((t) => ({ value: t.key, label: t.label })),
    teamOrder: (team) => order.get(team) ?? order.size,
  };
}
