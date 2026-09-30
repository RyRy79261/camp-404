import "server-only";

import { canManageMoney } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate, type CaptainActionAccess } from "./captain-gate";
import { MONEY_REFUSAL } from "./dues-copy";
import { getLeadTeams } from "./users";

// Who may use the Finance tools (#240): a captain, or a lead of Finance
// (canManageMoney). Clearance stays global, so the rank gate stands at
// team_lead; the Finance rule then turns away a lead of any other team. The
// writes check the same rule again inside their own transactions.

type Gate = Extract<CaptainActionAccess, { ok: true }>;

/** Whether a page's viewer may use the Finance tools. */
export async function keepsMoney(viewer: {
  campUser: { id: string };
  rank: ViewerRank;
}): Promise<boolean> {
  const led =
    viewer.rank === "team_lead" ? await getLeadTeams(viewer.campUser.id) : [];
  return canManageMoney(viewer.rank, led);
}

/** The Finance tools' action gate: signed in, approved, a money keeper. */
export async function moneyActionGate(): Promise<
  Gate | { ok: false; error: string }
> {
  const gate = await captainActionGate("team_lead", MONEY_REFUSAL);
  if (!gate.ok) return gate;
  if (!(await keepsMoney(gate))) return { ok: false, error: MONEY_REFUSAL };
  return gate;
}
