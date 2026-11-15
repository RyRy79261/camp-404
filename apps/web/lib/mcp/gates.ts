import {
  canEditAnyInventory,
  hasClearance,
  LOGISTICS_EDITOR,
  MONEY_KEEPER,
  MONEY_REFUSAL,
  PROOFREADER,
  RENTAL_MANAGER,
  TRANSPORT_EDITOR,
  type Rule,
} from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { LOGISTICS_REFUSAL } from "../logistics-copy";
import { SHIFTS_ACTION_REFUSAL } from "../shifts-copy";
import { TEAM_PROGRAM_REFUSAL } from "../team-program-copy";
import { scopeActor, type McpScope } from "./scope";

// Who may call a connector tool (GATES), the areas tools are grouped by, and a
// tool's entry shape. Kept apart from ./capabilities so each domain's table
// (./tool-caps/*.ts) can import them without an import cycle.

/** Who may call a tool, as the website decides it. */
export interface Gate {
  /** The audience, for a description: "Captains only". */
  who: string;
  allows(scope: McpScope): boolean;
  /** The one sentence a refused call returns. */
  refusal: string;
}

export const atLeast =
  (rung: ViewerRank) =>
  (scope: McpScope): boolean =>
    hasClearance(scope.viewerRank, rung);

/** A gate's check: the website's own rule, on the caller's actor. */
export const byRule =
  (rule: Rule) =>
  (scope: McpScope): boolean =>
    rule.allows(scopeActor(scope));

export const GATES = {
  member: {
    who: "Any camp member",
    allows: () => true,
    refusal: "Only an approved camp member can do this.",
  },
  teamLead: {
    who: "Team leads and captains",
    allows: atLeast("team_lead"),
    refusal:
      "Only a team lead or a captain can do this. Leading any team this year counts.",
  },
  captain: {
    who: "Captains only",
    allows: atLeast("captain"),
    refusal: "Only a captain can do this.",
  },
  money: {
    who: "Captains and Finance leads",
    allows: byRule(MONEY_KEEPER),
    refusal: MONEY_REFUSAL,
  },
  // Website-only gates: no tool uses them, what_can_i_do does.
  driver: {
    who: "Drivers this year",
    allows: (s) => s.isDriver,
    refusal: "Only someone driving this year can do this.",
  },
  rental: {
    who: "Captains",
    allows: byRule(RENTAL_MANAGER),
    refusal: "Only a captain runs gear rental.",
  },
  kitchenReview: {
    who: "Captains and Kitchen leads",
    allows: byRule(PROOFREADER),
    refusal: "Only a captain or a Kitchen lead can do this.",
  },
  transportEditor: {
    who: "Captains and Transport & Logistics leads",
    allows: byRule(TRANSPORT_EDITOR),
    refusal: "Only a captain or a Transport & Logistics lead can do this.",
  },
  // The Logistics page's editors (LOGISTICS_EDITOR): the same people as
  // transportEditor today, kept apart so each follows its own page's rule.
  logisticsEditor: {
    who: "Captains and Transport & Logistics leads",
    allows: byRule(LOGISTICS_EDITOR),
    refusal: LOGISTICS_REFUSAL,
  },
  // The Inventory page's Add button and an item's Edit (canEditAnyInventory).
  // Which team's gear is the write's own check (canEditInventory on the
  // item's team).
  inventoryEditor: {
    who: "Captains, and team leads for their own team's gear",
    allows: (s) => {
      const actor = scopeActor(s);
      return canEditAnyInventory(actor.rank, actor.ledTeams);
    },
    refusal:
      "Only a captain or a lead of the item's team can add or change gear. Any member can suggest a change to an item instead.",
  },
  // The Shifts page's set-up (saveShiftTypeAction's rank gate): any lead may
  // reach it, and which team's shifts is the tool's own check (shiftKeeper:
  // a lead of THAT team, or a captain), made again by the write.
  shiftKeeper: {
    who: "Captains, and team leads for their own team's shifts",
    allows: atLeast("team_lead"),
    refusal: SHIFTS_ACTION_REFUSAL,
  },
  // A team program's Save (canEditTeamProgram): any lead may reach it, and
  // which team's is the tool's own check (a lead of THAT team, or a captain),
  // made again by the write.
  teamProgramEditor: {
    who: "Captains, and team leads for their own team",
    allows: atLeast("team_lead"),
    refusal: TEAM_PROGRAM_REFUSAL,
  },
} as const satisfies Record<string, Gate>;

/** The areas the website and the tools are grouped by. */
export const AREAS = [
  "You",
  "Inbox",
  "Search",
  "Tasks",
  "Calendar",
  "Meetings",
  "Shifts",
  "People",
  "Teams",
  "Claims and budgets",
  "Survival Guide",
  "Questionnaires",
  "Kitchen",
  "Inventory",
  "Logistics",
  "Transport",
  "Power",
  "Lounge",
  "Camp layout",
  "Help wanted",
  "Pets",
  "Join site",
  "Invites and audit",
  "Announcements",
  "Camp settings",
] as const;
export type Area = (typeof AREAS)[number];

export interface ToolCapability {
  /**
   * Whether the tool only reads or also changes something. Voice (#356) runs
   * a read at once, while working out what the captain meant, and turns a
   * write into a row on the list the captain confirms: it never runs a write
   * before Do. Each write has a preview in lib/voice/previews.ts (a test
   * fails when one has none).
   */
  kind: "read" | "write";
  area: Area;
  gate: Gate;
  /** One plain line: what it does. */
  does: string;
  /**
   * The website page that does the same thing. A refused call names it, so
   * the person knows where to look (and what the page shows them instead).
   */
  page?: string;
}
