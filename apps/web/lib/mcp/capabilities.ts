import {
  canEditTransport,
  canManageMoney,
  canManageRental,
  canRunProofread,
  hasClearance,
} from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
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
} as const satisfies Record<string, Gate>;

/** The areas the website and the tools are grouped by. */
export const AREAS = [
  "You",
  "People",
  "Claims and budgets",
  "Survival Guide",
  "Questionnaires",
  "Kitchen",
  "Transport",
  "Invites and audit",
  "Announcements",
  "Camp settings",
] as const;
export type Area = (typeof AREAS)[number];

export interface ToolCapability {
  area: Area;
  gate: Gate;
  /** One plain line: what it does. */
  does: string;
}

/** Every tool the connector registers. A tool missing here cannot run. */
export const TOOL_CAPABILITIES: Readonly<Record<string, ToolCapability>> = {
  // You
  whoami: {
    area: "You",
    gate: GATES.member,
    does: "Your id, rank, teams this year, the teams you lead, and whether you drive.",
  },
  what_can_i_do: {
    area: "You",
    gate: GATES.member,
    does: "What you may do here and what only the website does, with links. Call it first.",
  },
  list_my_required_actions: {
    area: "You",
    gate: GATES.member,
    does: "Forms and steps waiting for you, and optional questionnaires you may answer.",
  },
  get_my_ai_consent: {
    area: "You",
    gate: GATES.member,
    does: "Whether captains may read your ID number through Claude.",
  },
  set_my_ai_consent: {
    area: "You",
    gate: GATES.member,
    does: "Turn on or off captains reading your ID number through Claude.",
  },
  get_my_burner_profile: {
    area: "You",
    gate: GATES.member,
    does: "Read your burner profile answers.",
  },
  update_my_burner_profile: {
    area: "You",
    gate: GATES.member,
    does: "Change your burner profile answers.",
  },
  get_my_dietary_requirements: {
    area: "You",
    gate: GATES.member,
    does: "Read your dietary pick-list: foods you react to, how, and your diets.",
  },
  update_my_dietary_requirements: {
    area: "You",
    gate: GATES.member,
    does: "Save your dietary pick-list. The Kitchen's allergy check reads it.",
  },
  get_my_driver_profile: {
    area: "You",
    gate: GATES.member,
    does: "Read this year's driver profile: car, seats, travel.",
  },
  update_my_driver_profile: {
    area: "You",
    gate: GATES.member,
    does: "Change this year's driver profile. Seats never go below the riders already in.",
  },
  get_my_emergency_contacts: {
    area: "You",
    gate: GATES.member,
    does: "Read your emergency contacts.",
  },
  update_my_emergency_contacts: {
    area: "You",
    gate: GATES.member,
    does: "Replace your emergency contacts.",
  },
  get_my_id_documents: {
    area: "You",
    gate: GATES.member,
    does: "Read your own ID number and bank details.",
  },
  update_my_id_documents: {
    area: "You",
    gate: GATES.member,
    does: "Change your own ID number or bank details (stored encrypted).",
  },
  set_my_membership_tier: {
    area: "You",
    gate: GATES.member,
    does: "Say whether you stay the whole event or build week only.",
  },
  update_my_history: {
    area: "You",
    gate: GATES.member,
    does: "Change your skills and how many burns you have been to.",
  },
  // People
  list_users: {
    area: "People",
    gate: GATES.member,
    does: "The camp roster, with the columns your rank may read.",
  },
  get_user: {
    area: "People",
    gate: GATES.member,
    does: "One person, with the columns your rank may read (team leads and captains also get emergency contacts; each read is recorded).",
  },
  get_member_id_number: {
    area: "People",
    gate: GATES.captain,
    does: "One member's ID number, recorded before it is shown, and only if they allowed it through Claude.",
  },
  // Claims and budgets
  get_team_budget: {
    area: "Claims and budgets",
    gate: GATES.member,
    does: "One team's budget this year: budget, spent, waiting, left (rand cents).",
  },
  list_team_budgets: {
    area: "Claims and budgets",
    gate: GATES.member,
    does: "Every team's budget this year (rand cents).",
  },
  list_my_reimbursements: {
    area: "Claims and budgets",
    gate: GATES.member,
    does: "Your own claims and where each stands.",
  },
  list_reimbursements: {
    area: "Claims and budgets",
    gate: GATES.teamLead,
    does: "Claims to review: your led teams' claims, or every claim for captains and Finance leads. No bank details.",
  },
  approve_reimbursement: {
    area: "Claims and budgets",
    gate: GATES.teamLead,
    does: "Say yes to a waiting claim of a team you lead (captains: any). Never your own.",
  },
  reject_reimbursement: {
    area: "Claims and budgets",
    gate: GATES.teamLead,
    does: "Say no to a waiting claim of a team you lead (captains: any). Never your own.",
  },
  get_claim_bank_details: {
    area: "Claims and budgets",
    gate: GATES.money,
    does: "One claim's bank details for paying it back, recorded as a read.",
  },
  // Survival Guide
  list_documents: {
    area: "Survival Guide",
    gate: GATES.member,
    does: "The guide's published chapters and duty cards.",
  },
  get_document: {
    area: "Survival Guide",
    gate: GATES.member,
    does: "Read one published chapter.",
  },
  list_document_drafts: {
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Unpublished chapters you may write.",
  },
  get_document_draft: {
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Read a chapter's working copy and its version, to edit or publish it.",
  },
  create_document: {
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Start a chapter or a duty card as a draft, in one of the guide's topics.",
  },
  update_document: {
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Change a draft, on the version you read.",
  },
  publish_document: {
    area: "Survival Guide",
    gate: GATES.teamLead,
    does: "Publish the version you read, or take a chapter off the guide.",
  },
  // Questionnaires
  list_questionnaire_drafts: {
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "The builder's questionnaires you may see.",
  },
  get_questionnaire_draft: {
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Read a questionnaire's working definition and what blocks publishing.",
  },
  create_questionnaire_draft: {
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Draft a questionnaire.",
  },
  update_questionnaire_draft: {
    area: "Questionnaires",
    gate: GATES.teamLead,
    does: "Replace a draft's definition (captains: any; team leads: their own).",
  },
  // Kitchen
  submit_recipe: {
    area: "Kitchen",
    gate: GATES.member,
    does: "Suggest a recipe for the Kitchen to review.",
  },
  list_recipes: {
    area: "Kitchen",
    gate: GATES.member,
    does: "The recipe book.",
  },
  // Transport
  list_drivers: {
    area: "Transport",
    gate: GATES.member,
    does: "This year's cars as the Transport page shows them: driver, car, seats, riders.",
  },
  list_car_riders: {
    area: "Transport",
    gate: GATES.member,
    does: "Who rides in one car this year.",
  },
  get_my_lift: {
    area: "Transport",
    gate: GATES.member,
    does: "The car you drive or ride in this year.",
  },
  add_car_rider: {
    area: "Transport",
    gate: GATES.member,
    does: "Put someone in a car: your own car, or any car for captains and Transport & Logistics leads.",
  },
  remove_car_rider: {
    area: "Transport",
    gate: GATES.member,
    does: "Take someone out of a car (your own car, or leave a car you ride in).",
  },
  // Invites and audit
  list_invite_codes: {
    area: "Invites and audit",
    gate: GATES.member,
    does: "Invite codes you made (captains: every code).",
  },
  revoke_invite_code: {
    area: "Invites and audit",
    gate: GATES.member,
    does: "Stop a code you made letting anyone else join (captains: any code).",
  },
  list_audit_log: {
    area: "Invites and audit",
    gate: GATES.captain,
    does: "Who changed or read whose data.",
  },
  // People (captain writes)
  assign_team_membership: {
    area: "People",
    gate: GATES.captain,
    does: "Put a member on a team this year.",
  },
  remove_team_membership: {
    area: "People",
    gate: GATES.captain,
    does: "Take a member off a team this year.",
  },
  set_team_lead: {
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
    what: "Read a member's ID number when they have not allowed it through Claude",
    why: "The member panel records each read; the member's Claude setting is off.",
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
    why: "Lift requests live on the Transport page; the connector has no tool for them yet.",
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
