import {
  canEditAnyInventory,
  canEditLogistics,
  canEditTransport,
  canManageMoney,
  canManageRental,
  canRunProofread,
  hasClearance,
} from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { LOGISTICS_REFUSAL } from "../logistics-copy";
import { TEAM_PROGRAM_REFUSAL } from "../team-program-copy";
import { SITE_URL } from "../site";
import type { McpScope } from "./scope";

// The Claude connector's one list of who may call what (owner, 2026-10-04:
// "MCP gets the SAME access as the signed-in person … never more").
//
//  - Every tool has an entry here. `runTool` refuses a call whose gate does
//    not allow the caller, with the gate's sentence, before the handler runs;
//    `registerCampMcpTools` puts the gate's `who` at the front of the tool's
//    description; and `what_can_i_do` builds its answer from the same entries.
//    So the description, the refusal and the capabilities answer cannot drift
//    from the check. A test fails when a tool has no entry, or an entry no
//    tool.
//  - A gate is the website's own predicate on the caller's rung
//    (`scope.viewerRank`, the global ladder) and their led teams. Finer rules
//    (whose claim, which car, which chapter) stay where the website keeps
//    them: in the database write, which reads and locks the actor itself.
//  - WEBSITE_ONLY lists what the person may do on the website but never
//    through Claude: anything with no undo or a wide reach (the owner's list).

/** Who may call a tool, as the website decides it. */
export interface Gate {
  /** The audience, for a description: "Captains only". */
  who: string;
  allows(scope: McpScope): boolean;
  /** The one sentence a refused call returns. */
  refusal: string;
}

const atLeast =
  (rung: ViewerRank) =>
  (scope: McpScope): boolean =>
    hasClearance(scope.viewerRank, rung);

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
    allows: (s) => canManageMoney(s.viewerRank, s.leadTeams),
    refusal: "Only a captain or a Finance lead can do this.",
  },
  // Website-only gates: no tool uses them, what_can_i_do does.
  driver: {
    who: "Drivers this year",
    allows: (s) => s.isDriver,
    refusal: "Only someone driving this year can do this.",
  },
  rental: {
    who: "Captains",
    allows: (s) => canManageRental(s.viewerRank, s.leadTeams),
    refusal: "Only a captain runs gear rental.",
  },
  kitchenReview: {
    who: "Captains and Kitchen leads",
    allows: (s) => canRunProofread(s.viewerRank, s.leadTeams),
    refusal: "Only a captain or a Kitchen lead can do this.",
  },
  transportEditor: {
    who: "Captains and Transport & Logistics leads",
    allows: (s) => canEditTransport(s.viewerRank, s.leadTeams),
    refusal: "Only a captain or a Transport & Logistics lead can do this.",
  },
  // The Logistics page's editors (canEditLogistics): the same people as
  // transportEditor today, kept apart so each follows its own page's rule.
  logisticsEditor: {
    who: "Captains and Transport & Logistics leads",
    allows: (s) => canEditLogistics(s.viewerRank, s.leadTeams),
    refusal: LOGISTICS_REFUSAL,
  },
  // The Inventory page's Add button (canEditAnyInventory). Which team's gear
  // is the write's own check (canEditInventory on the item's team).
  inventoryEditor: {
    who: "Captains, and team leads for their own team's gear",
    allows: (s) => canEditAnyInventory(s.viewerRank, s.leadTeams),
    refusal:
      "Only a captain or a lead of the item's team can add gear. Any member can suggest a change to an item instead.",
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

/** Every tool the connector registers. A tool missing here cannot run. */
export const TOOL_CAPABILITIES: Readonly<Record<string, ToolCapability>> = {
  // You
  whoami: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Your id, rank, teams this year, the teams you lead, and whether you drive.",
  },
  what_can_i_do: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "What you may do here and what only the website does, with links. Call it first.",
  },
  list_my_required_actions: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Forms and steps waiting for you, and optional questionnaires you may answer.",
  },
  get_my_burner_profile: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Read your burner profile answers.",
  },
  update_my_burner_profile: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Change your burner profile answers.",
  },
  get_my_dietary_requirements: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Read your dietary pick-list: foods you react to, how, and your diets.",
  },
  update_my_dietary_requirements: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Save your dietary pick-list. The Kitchen's allergy check reads it.",
  },
  get_my_driver_profile: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Read this year's driver profile: car, seats, travel.",
  },
  update_my_driver_profile: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Change this year's driver profile. Seats never go below the riders already in.",
  },
  get_my_emergency_contacts: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Read your emergency contacts.",
  },
  update_my_emergency_contacts: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Replace your emergency contacts.",
  },
  update_my_history: {
    kind: "write",
    area: "You",
    gate: GATES.member,
    does: "Change your skills and how many burns you have been to.",
  },
  get_my_dues: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "What My dues shows you: what you owe and paid, your next instalment, your pledge, charges and payments (rand cents). Read-only.",
    page: "/dues",
  },
  get_my_gear_rental: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "What My gear shows you: your gear order, your tent, who shares it and the catalogue. Read-only.",
    page: "/gear",
  },
  list_my_forms: {
    kind: "read",
    area: "You",
    gate: GATES.member,
    does: "Your questionnaires: waiting, optional, update any time, and submitted, each with its page.",
    page: "/tools/forms",
  },
  // Inbox
  list_my_notifications: {
    kind: "read",
    area: "Inbox",
    gate: GATES.member,
    does: "Your inbox, newest first, 30 a page, by the page's tabs.",
    page: "/notifications",
  },
  mark_notifications_read: {
    kind: "write",
    area: "Inbox",
    gate: GATES.member,
    does: "Mark some of your notifications read (never a pop-up the app has not shown).",
    page: "/notifications",
  },
  mark_all_notifications_read: {
    kind: "write",
    area: "Inbox",
    gate: GATES.member,
    does: "Mark all your notifications read, as the inbox's Mark all read.",
    page: "/notifications",
  },
  // Search
  search_camp: {
    kind: "read",
    area: "Search",
    gate: GATES.member,
    does: "Search everything you may open, as Ctrl+K's Everything: titles, and a short line around words found inside.",
    page: "/",
  },
  // Tasks
  list_tasks: {
    kind: "read",
    area: "Tasks",
    gate: GATES.member,
    does: "The camp's task board, with what you may do to each task.",
    page: "/tasks",
  },
  add_task: {
    kind: "write",
    area: "Tasks",
    gate: GATES.teamLead,
    does: "Add a task: team leads for a team they lead, captains for any team.",
    page: "/tasks",
  },
  move_task: {
    kind: "write",
    area: "Tasks",
    gate: GATES.member,
    does: "Move a task between open, in progress and done, from the column you read (its person, whoever added it, a lead of its team, a captain).",
    page: "/tasks",
  },
  // Calendar
  list_calendar_events: {
    kind: "read",
    area: "Calendar",
    gate: GATES.member,
    does: "The camp calendar from today to a year ahead, by day, by team.",
    page: "/calendar",
  },
  // Meetings
  list_meetings: {
    kind: "read",
    area: "Meetings",
    gate: GATES.member,
    does: "Meeting notes, newest first, by team or whole camp.",
    page: "/meetings",
  },
  get_meeting: {
    kind: "read",
    area: "Meetings",
    gate: GATES.member,
    does: "One meeting's agenda, notes, decisions and action items.",
    page: "/meetings",
  },
  update_meeting_notes: {
    kind: "write",
    area: "Meetings",
    gate: GATES.member,
    does: "Change a meeting's title, agenda, notes or decisions, on the version you read (its team's members this year, and captains).",
    page: "/meetings",
  },
  // Shifts
  list_shifts: {
    kind: "read",
    area: "Shifts",
    gate: GATES.member,
    does: "This year's shift roster: each day's slots, places taken and who is on them.",
    page: "/shifts",
  },
  list_my_shifts: {
    kind: "read",
    area: "Shifts",
    gate: GATES.member,
    does: "The shifts you are on, and your AfrikaBurn volunteer shifts.",
    page: "/shifts/mine",
  },
  sign_up_for_shift: {
    kind: "write",
    area: "Shifts",
    gate: GATES.member,
    does: "Take a place on a shift slot for yourself, while it has one.",
    page: "/shifts",
  },
  leave_shift: {
    kind: "write",
    area: "Shifts",
    gate: GATES.member,
    does: "Give up your place on a shift slot before its day.",
    page: "/shifts",
  },
  // People
  list_users: {
    kind: "read",
    area: "People",
    gate: GATES.member,
    does: "The camp roster, with the columns your rank may read.",
  },
  get_user: {
    kind: "read",
    area: "People",
    gate: GATES.member,
    does: "One person, with the columns your rank may read (team leads and captains also get emergency contacts; each read is recorded). Never ID numbers or bank details.",
  },
  // Teams. No `page`: each team has its own (/teams/<key>), so the tools
  // return it and a refusal names it.
  get_team_description: {
    kind: "read",
    area: "Teams",
    gate: GATES.member,
    does: "What a team's program says about the team, and its version.",
  },
  update_team_description: {
    kind: "write",
    area: "Teams",
    gate: GATES.teamProgramEditor,
    does: "Change a team's description, on the version you read (captains: any team; team leads: a team they lead).",
  },
  // Claims and budgets
  get_team_budget: {
    kind: "read",
    area: "Claims and budgets",
    gate: GATES.member,
    does: "One team's budget this year: budget, spent, waiting, left (rand cents).",
  },
  list_team_budgets: {
    kind: "read",
    area: "Claims and budgets",
    gate: GATES.member,
    does: "Every team's budget this year (rand cents).",
  },
  list_my_reimbursements: {
    kind: "read",
    area: "Claims and budgets",
    gate: GATES.member,
    does: "Your own claims and where each stands.",
  },
  list_reimbursements: {
    kind: "read",
    area: "Claims and budgets",
    gate: GATES.teamLead,
    does: "Claims to review: your led teams' claims, or every claim for captains and Finance leads. Never bank details.",
  },
  approve_reimbursement: {
    kind: "write",
    area: "Claims and budgets",
    gate: GATES.teamLead,
    does: "Say yes to a waiting claim of a team you lead (captains: any). Never your own.",
  },
  reject_reimbursement: {
    kind: "write",
    area: "Claims and budgets",
    gate: GATES.teamLead,
    does: "Say no to a waiting claim of a team you lead (captains: any). Never your own.",
  },
  // Survival Guide
  list_documents: {
    kind: "read",
    area: "Survival Guide",
    gate: GATES.member,
    does: "The guide's published chapters and duty cards.",
  },
  get_document: {
    kind: "read",
    area: "Survival Guide",
    gate: GATES.member,
    does: "Read one published chapter.",
  },
  list_document_drafts: {
    kind: "read",
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Unpublished chapters you may write.",
  },
  get_document_draft: {
    kind: "read",
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Read a chapter's working copy and its version, to edit or publish it.",
  },
  create_document: {
    kind: "write",
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Start a chapter or a duty card as a draft, in one of the guide's topics.",
  },
  update_document: {
    kind: "write",
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Change a draft, on the version you read.",
  },
  publish_document: {
    kind: "write",
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Publish the version you read, or take a chapter off the guide.",
  },
  // Questionnaires
  list_questionnaire_drafts: {
    kind: "read",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "The builder's questionnaires you may see.",
  },
  get_questionnaire_draft: {
    kind: "read",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Read a questionnaire's working definition and what blocks publishing.",
  },
  create_questionnaire_draft: {
    kind: "write",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Draft a questionnaire.",
  },
  update_questionnaire_draft: {
    kind: "write",
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Replace a draft's definition (captains: any; team leads: their own).",
  },
  // Kitchen
  submit_recipe: {
    kind: "write",
    area: "Kitchen",
    gate: GATES.member,
    does: "Suggest a recipe for the Kitchen to review.",
  },
  list_recipes: {
    kind: "read",
    area: "Kitchen",
    gate: GATES.member,
    does: "The recipe book.",
  },
  get_recipe: {
    kind: "read",
    area: "Kitchen",
    gate: GATES.member,
    does: "Read one recipe as its page shows it to you: the book's version at a plate count, how it was scaled and the cooks' notes.",
    page: "/kitchen/recipes",
  },
  add_recipe_lesson: {
    kind: "write",
    area: "Kitchen",
    gate: GATES.member,
    does: "Add a note on what the kitchen learned cooking a recipe in the book.",
    page: "/kitchen/recipes",
  },
  get_meal_plan: {
    kind: "read",
    area: "Kitchen",
    gate: GATES.member,
    does: "This year's meal plan: the days on site, the plates at each meal, the recipes on the menu and the snacks.",
    page: "/kitchen/meal-plan",
  },
  get_shopping_list: {
    kind: "read",
    area: "Kitchen",
    gate: GATES.member,
    does: "The shopping list worked out from the menu, with what is already ticked (captains and Kitchen leads also get prices).",
    page: "/kitchen/shopping",
  },
  list_recipe_review_queue: {
    kind: "read",
    area: "Kitchen",
    gate: GATES.kitchenReview,
    does: "Suggestions waiting for a decision, recipes ready to send to Claude, and older drafts waiting to be accepted. Deciding and sending stay on the page.",
    page: "/kitchen/recipes/review",
  },
  // Inventory
  list_inventory_items: {
    kind: "read",
    area: "Inventory",
    gate: GATES.member,
    does: "The camp's gear as the Inventory page shows it, with the suggested changes you may review.",
    page: "/inventory",
  },
  add_inventory_item: {
    kind: "write",
    area: "Inventory",
    gate: GATES.inventoryEditor,
    does: "Add an item of gear to a team you may edit (captains: any team). Logged in the item's history.",
    page: "/inventory",
  },
  propose_inventory_change: {
    kind: "write",
    area: "Inventory",
    gate: GATES.member,
    does: "Suggest a new count, condition or place for an item, for its team's lead or a captain to approve on the page.",
    page: "/inventory",
  },
  // Logistics
  list_logistics_days: {
    kind: "read",
    area: "Logistics",
    gate: GATES.member,
    does: "This year's pack, travel, build, burn, strike and unpack days, and AfrikaBurn's dates.",
    page: "/logistics",
  },
  set_logistics_days: {
    kind: "write",
    area: "Logistics",
    gate: GATES.logisticsEditor,
    does: "Set one phase's days, place and note, on the version you read. It goes on the camp calendar and moves the meal plan's prep with Day 1.",
    page: "/logistics",
  },
  get_logistics_attendance: {
    kind: "read",
    area: "Logistics",
    gate: GATES.member,
    does: "Who can help on pack, build, strike and unpack, and your own answers.",
    page: "/logistics",
  },
  set_my_logistics_attendance: {
    kind: "write",
    area: "Logistics",
    gate: GATES.member,
    does: "Say whether you can help on a phase, from the answer you read.",
    page: "/logistics",
  },
  // Transport
  list_drivers: {
    kind: "read",
    area: "Transport",
    gate: GATES.member,
    does: "This year's cars as the Transport page shows them: driver, car, seats, riders.",
  },
  list_car_riders: {
    kind: "read",
    area: "Transport",
    gate: GATES.member,
    does: "Who rides in one car this year.",
  },
  get_my_lift: {
    kind: "read",
    area: "Transport",
    gate: GATES.member,
    does: "The car you drive or ride in this year.",
  },
  add_car_rider: {
    kind: "write",
    area: "Transport",
    gate: GATES.member,
    does: "Put someone in a car: your own car, or any car for captains and Transport & Logistics leads.",
  },
  remove_car_rider: {
    kind: "write",
    area: "Transport",
    gate: GATES.member,
    does: "Take someone out of a car (your own car, or leave a car you ride in).",
  },
  get_my_lift_request: {
    kind: "read",
    area: "Transport",
    gate: GATES.member,
    does: "Your lift request this year, if you made one.",
    page: "/transport",
  },
  request_lift: {
    kind: "write",
    area: "Transport",
    gate: GATES.member,
    does: "Ask for a seat in one car, or any car, this year.",
    page: "/transport",
  },
  cancel_lift_request: {
    kind: "write",
    area: "Transport",
    gate: GATES.member,
    does: "Withdraw your lift request.",
    page: "/transport",
  },
  // Invites and audit
  list_invite_codes: {
    kind: "read",
    area: "Invites and audit",
    gate: GATES.member,
    does: "Invite codes you made (captains: every code).",
  },
  revoke_invite_code: {
    kind: "write",
    area: "Invites and audit",
    gate: GATES.member,
    does: "Stop a code you made letting anyone else join (captains: any code).",
  },
  list_audit_log: {
    kind: "read",
    area: "Invites and audit",
    gate: GATES.captain,
    does: "Who changed or read whose data.",
  },
  // People (captain writes)
  assign_team_membership: {
    kind: "write",
    area: "People",
    gate: GATES.captain,
    does: "Put a member on a team this year.",
  },
  remove_team_membership: {
    kind: "write",
    area: "People",
    gate: GATES.captain,
    does: "Take a member off a team this year.",
  },
  set_team_lead: {
    kind: "write",
    area: "People",
    gate: GATES.captain,
    does: "Make a team member lead the team, or stop.",
  },
};

/** Why something is website-only, in words the agent can repeat. */
const NO_UNDO =
  "It can't be undone from here, so a person does it on the page.";
const WIDE =
  "It reaches many people at once, so a person sends it from the page.";
const MONEY = "It moves money, so a person does it on the page.";
const UPLOAD = "It needs a file upload, which a chat can't carry.";
const ID_NUMBERS =
  "ID numbers and bank details are never available through this connector, for anyone; they are on the website's audited pages.";

export interface WebsiteOnly {
  area: Area;
  what: string;
  why: string;
  path: string;
  gate: Gate;
}

/** What the website does and the connector never will (owner, 2026-10-04). */
export const WEBSITE_ONLY: readonly WebsiteOnly[] = [
  {
    area: "You",
    what: "Give or change your ID number (on your burner profile)",
    why: ID_NUMBERS,
    path: "/tools/forms/burner_profile",
    gate: GATES.member,
  },
  {
    area: "You",
    what: "Upload or change your profile photo",
    why: UPLOAD,
    path: "/profile/edit",
    gate: GATES.member,
  },
  {
    area: "Claims and budgets",
    what: "Make a claim (it needs its receipts)",
    why: UPLOAD,
    path: "/claims",
    gate: GATES.member,
  },
  {
    area: "Invites and audit",
    what: "Make an invite code",
    why: "A code lets a new person into the camp, so a person makes it on the page.",
    path: "/tools/invite",
    gate: GATES.member,
  },
  {
    area: "People",
    what: "Approve or turn down a sign-up, or give someone a place this year",
    why: NO_UNDO,
    path: "/captains/applications",
    gate: GATES.captain,
  },
  {
    area: "People",
    what: "Ask a member to be a captain, or change a rank",
    why: NO_UNDO,
    path: "/captains/camp-management",
    gate: GATES.captain,
  },
  {
    area: "People",
    what: "Read a member's ID number (for matching tickets), in their member panel",
    why: ID_NUMBERS,
    path: "/captains/camp-management",
    gate: GATES.captain,
  },
  {
    area: "Announcements",
    what: "Publish an announcement (team leads: to a team they lead)",
    why: WIDE,
    path: "/captains/announcements",
    gate: GATES.teamLead,
  },
  {
    area: "Questionnaires",
    what: "Send a questionnaire (team leads: to a team they lead)",
    why: WIDE,
    path: "/captains/questionnaires",
    gate: GATES.teamLead,
  },
  {
    area: "Questionnaires",
    what: "Publish, close or remind a questionnaire",
    why: WIDE,
    path: "/captains/questionnaires",
    gate: GATES.captain,
  },
  {
    area: "Transport",
    what: "Write to everyone riding in your car",
    why: WIDE,
    path: "/transport",
    gate: GATES.driver,
  },
  {
    area: "Transport",
    what: "Answer a lift request for your car",
    why: "The connector can ask for a lift but not answer one: the driver decides on the page.",
    path: "/transport",
    gate: GATES.driver,
  },
  {
    area: "Transport",
    what: "Match lift requests to cars, and keep the camp's trailers",
    why: "These live on the Transport page; the connector has no tool for them yet.",
    path: "/transport",
    gate: GATES.transportEditor,
  },
  {
    area: "Claims and budgets",
    what: "Read a claim's bank details to pay it back",
    why: ID_NUMBERS,
    path: "/captains/payments/claims",
    gate: GATES.money,
  },
  {
    area: "Claims and budgets",
    what: "Mark a claim paid or matched to the bank statement",
    why: MONEY,
    path: "/captains/payments/claims",
    gate: GATES.money,
  },
  {
    area: "Claims and budgets",
    what: "Set a team's budget",
    why: MONEY,
    path: "/captains/payments/budgets",
    gate: GATES.money,
  },
  {
    area: "Claims and budgets",
    what: "Record payments, charges and refunds, settle up, and set fee tiers",
    why: MONEY,
    path: "/captains/payments",
    gate: GATES.money,
  },
  {
    area: "Claims and budgets",
    what: "Charge for gear rental",
    why: MONEY,
    path: "/captains/gear-rental",
    gate: GATES.rental,
  },
  {
    area: "Kitchen",
    what: "Approve a recipe or send it to Claude to write up",
    why: "Sending costs money and the review is the Kitchen's, so it happens on the page.",
    path: "/kitchen/recipes/review",
    gate: GATES.kitchenReview,
  },
  {
    area: "Inventory",
    what: "Approve or turn down a suggested change, change or archive an item, lend it out, and keep the team's needs",
    why: "These live on the Inventory page; the connector has no tool for them yet.",
    path: "/inventory",
    gate: GATES.inventoryEditor,
  },
  {
    area: "Logistics",
    what: "Clear a phase's days (it comes off the camp calendar)",
    why: "This lives on the Logistics page; the connector has no tool for it yet.",
    path: "/logistics",
    gate: GATES.logisticsEditor,
  },
  {
    area: "Logistics",
    what: "Keep AfrikaBurn's dates for the year",
    why: "They are kept with the camp's year settings, so a captain does it on the page.",
    path: "/captains/camp-settings/cycle",
    gate: GATES.captain,
  },
  {
    area: "Kitchen",
    what: "Change the meal plan, the menu, the snacks or the prices",
    why: "These live on the Kitchen's pages; the connector has no tool for them yet.",
    path: "/kitchen/meal-plan",
    gate: GATES.kitchenReview,
  },
  {
    area: "You",
    what: "Pick your fee tier, send proof of a payment, or ask for a refund",
    why: MONEY,
    path: "/dues",
    gate: GATES.member,
  },
  {
    area: "You",
    what: "Fill in, send or withdraw your gear order",
    why: "Your order becomes a charge on your dues, so you send it from the page.",
    path: "/gear",
    gate: GATES.member,
  },
  {
    area: "You",
    what: "Answer a questionnaire",
    why: "The questionnaire page walks you through its questions and checks the answers; the connector lists them only.",
    path: "/tools/forms",
    gate: GATES.member,
  },
  {
    area: "Tasks",
    what: "Change a task's details or take it off the board",
    why: "These live on the Tasks page; the connector has no tool for them yet.",
    path: "/tasks",
    gate: GATES.member,
  },
  {
    area: "Calendar",
    what: "Add an event to the camp calendar (team leads: for a team they lead)",
    why: WIDE,
    path: "/captains/calendar",
    gate: GATES.teamLead,
  },
  {
    area: "Meetings",
    what: "Write a new meeting note, tick who was there, change action items or put one on the task board",
    why: "These live on the Meetings pages; the connector has no tool for them yet.",
    path: "/meetings",
    gate: GATES.member,
  },
  {
    area: "Shifts",
    what: "Set up shifts, put someone on a shift or take them off, and ask everyone to sign up",
    why: "These live on the Shifts page; the connector has no tool for them yet.",
    path: "/shifts",
    gate: GATES.teamLead,
  },
  {
    area: "Shifts",
    what: "Note your AfrikaBurn volunteer shifts",
    why: "These live on My shifts; the connector has no tool for them yet.",
    path: "/shifts/mine",
    gate: GATES.member,
  },
  {
    area: "Survival Guide",
    what: "Put a guide section on the public site, or keep a chapter members only",
    why: "It decides what the whole internet reads, so a captain does it on the page.",
    path: "/guide",
    gate: GATES.captain,
  },
  {
    area: "Camp settings",
    what: "Change camp settings, archive a team, or start a new year",
    why: NO_UNDO,
    path: "/captains/camp-settings",
    gate: GATES.captain,
  },
];

/**
 * The sentence a call refused at its gate returns: the gate's own words, then
 * the page that does it on the website, when the tool names one.
 */
export function refusalFor(capability: ToolCapability): string {
  return capability.page
    ? `${capability.gate.refusal} On the website: ${siteUrl(capability.page)}`
    : capability.gate.refusal;
}

/** The website's address for a path, for a person to open. */
export function siteUrl(path: string): string {
  const origin = process.env.MCP_PUBLIC_URL?.trim() || SITE_URL;
  return `${origin.replace(/\/$/, "")}${path}`;
}

const RANK_LABEL: Record<ViewerRank, string> = {
  camp_member: "Member",
  team_lead: "Team lead",
  captain: "Captain",
};

export interface AreaCapabilities {
  area: Area;
  tools: { name: string; does: string }[];
  websiteOnly: { what: string; why: string; url: string }[];
}

/**
 * What THIS person may do, area by area: the tools whose gate allows them,
 * and what they may do on the website but not here, with the page's address.
 * Built from TOOL_CAPABILITIES and WEBSITE_ONLY, which the tools themselves
 * are gated on, so it cannot say yes where a call would say no.
 */
export function capabilitiesFor(scope: McpScope): {
  rank: ViewerRank;
  rankLabel: string;
  areas: AreaCapabilities[];
} {
  const areas: AreaCapabilities[] = [];
  for (const area of AREAS) {
    const tools = Object.entries(TOOL_CAPABILITIES)
      .filter(([, c]) => c.area === area && c.gate.allows(scope))
      .map(([name, c]) => ({ name, does: c.does }));
    const websiteOnly = WEBSITE_ONLY.filter(
      (w) => w.area === area && w.gate.allows(scope),
    ).map((w) => ({ what: w.what, why: w.why, url: siteUrl(w.path) }));
    if (tools.length > 0 || websiteOnly.length > 0) {
      areas.push({ area, tools, websiteOnly });
    }
  }
  return {
    rank: scope.viewerRank,
    rankLabel: RANK_LABEL[scope.viewerRank],
    areas,
  };
}
