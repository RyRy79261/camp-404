import "server-only";

import { MONEY_KEEPER } from "@camp404/core";
import { ruleActionGate, type RuleActionAccess } from "./rule-gate";
import { MONEY_REFUSAL } from "./dues-copy";

// Who may use the Finance tools (#240): a captain, or a lead of Finance
// (MONEY_KEEPER). Clearance stays global, so the rank gate stands at
// team_lead; the Finance rule then turns away a lead of any other team. A
// page asks `MONEY_KEEPER.allows(gate.actor)`. The writes check the same rule
// again inside their own transactions.

/** The Finance tools' action gate: signed in, approved, a money keeper. */
export function moneyActionGate(): Promise<RuleActionAccess> {
  return ruleActionGate(MONEY_KEEPER, MONEY_REFUSAL);
}
