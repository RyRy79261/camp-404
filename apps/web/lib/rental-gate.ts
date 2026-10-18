import "server-only";

import { RENTAL_MANAGER } from "@camp404/core";
import { ruleActionGate, type RuleActionAccess } from "./rule-gate";
import { RENTAL_REFUSAL } from "./rental-copy";

// Who may run gear rental (#241): a captain (RENTAL_MANAGER). The rank gate
// stands at team_lead and the rental rule then decides, so letting the
// Finance leads in later is a change in that one rule. A page asks
// `RENTAL_MANAGER.allows(gate.actor)`. The writes check the same rule again
// inside their own transactions.

/** The captains' action gate: signed in, approved, may run gear rental. */
export function rentalActionGate(): Promise<RuleActionAccess> {
  return ruleActionGate(RENTAL_MANAGER, RENTAL_REFUSAL);
}
