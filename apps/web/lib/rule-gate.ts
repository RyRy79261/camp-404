import "server-only";

import type { Rule } from "@camp404/core";
import { captainActionGate, type CaptainActionAccess } from "./captain-gate";

export type RuleActionAccess =
  | Extract<CaptainActionAccess, { ok: true }>
  | { ok: false; error: string };

/**
 * For an action behind one rule (a captain, or a lead of one team, or a
 * captain only): the team-lead rank gate, since clearance is global, then
 * `rule` on the actor, both refused with `refusal`. The screen's answer only:
 * the write asks the same rule again on the actor it reads and locks.
 */
export async function ruleActionGate(
  rule: Rule,
  refusal: string,
): Promise<RuleActionAccess> {
  const gate = await captainActionGate("team_lead", refusal);
  if (!gate.ok) return gate;
  if (!rule.allows(gate.actor)) return { ok: false, error: refusal };
  return gate;
}
