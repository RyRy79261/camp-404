import { GATES, type ToolCapability } from "../gates";

// Clearing a phase's days over MCP: the Logistics page's Clear, behind the
// same rule its action asks at the door (LOGISTICS_EDITOR).

export const LOGISTICS_MORE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  clear_logistics_days: {
    kind: "write",
    area: "Logistics",
    gate: GATES.logisticsEditor,
    does: "Clear one phase's days, place and note, on the version you read. It comes off the camp calendar.",
    page: "/logistics",
  },
};
