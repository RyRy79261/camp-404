import "server-only";

import { canManageRental } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate, type CaptainActionAccess } from "./captain-gate";
import { RENTAL_REFUSAL } from "./rental-copy";
import { getLeadTeams } from "./users";

// Who may run gear rental (#241): a captain (canManageRental). The rank gate
// stands at team_lead and the rental rule then decides, so letting the
// Finance leads in later is a change in that one function. The writes check
// the same rule again inside their own transactions.

type Gate = Extract<CaptainActionAccess, { ok: true }>;

/** Whether a page's viewer may run gear rental. */
export async function runsRental(viewer: {
  campUser: { id: string };
  rank: ViewerRank;
}): Promise<boolean> {
  const led =
    viewer.rank === "team_lead" ? await getLeadTeams(viewer.campUser.id) : [];
  return canManageRental(viewer.rank, led);
}

/** The captains' action gate: signed in, approved, may run gear rental. */
export async function rentalActionGate(): Promise<
  Gate | { ok: false; error: string }
> {
  const gate = await captainActionGate("team_lead", RENTAL_REFUSAL);
  if (!gate.ok) return gate;
  if (!(await runsRental(gate))) return { ok: false, error: RENTAL_REFUSAL };
  return gate;
}
