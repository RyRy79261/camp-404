import "server-only";

import {
  canEditAnyGuideChapter,
  hasClearance,
  KITCHEN_REVIEWER,
  MONEY_KEEPER,
  RENTAL_MANAGER,
  toActor,
  type Rule,
} from "@camp404/core";
import { Team, type ViewerRank } from "@camp404/types";
import {
  PROGRAM_TITLES,
  programDefinition,
  programHome,
  type ProgramId,
} from "./program-routes";
import { tasksHref } from "./task-board";

// The 404 OS program manifest (docs/specs/2026-09-25-404-os-console-design.md,
// section 4): which programs, folders, team folders and tray items one member
// gets, decided on the server from their profile and nothing else.
//
// A plain module, never a "use server" file (such a file may export only
// async functions), and `server-only`, so the rank bars and predicates below
// can never be bundled for a browser. What leaves the server is the
// `ProgramManifest` that `buildProgramManifest` returns: labels, file names,
// links and icon keys, never a rank to decide with or the reason a program is
// shown. A program a member may not use is absent from it, not hidden
// (owner's decision 2, 2026-09-26: hidden, folders too).
//
// Hiding is never the security boundary. Every page still runs its gate (and
// its CaptainLock), and every action its own. Most pages ask this registry
// for it: `programPage(id)` (lib/program-page.ts) runs the entry's `rank` and
// `rule`, so the icon and the page cannot disagree. The rest still name their
// bar (`requireMemberPage`, or a gate of their own);
// lib/__tests__/program-registry-drift.test.ts reads every console page and
// fails when a page asks another program's gate, or names a bar that is not
// its entry's.
//
// `rule` and `requires` may use only the existing core rules and predicates
// (`hasClearance`, KITCHEN_REVIEWER, `canWorkInTeam`, and the others the
// design names), so a rule changes in one place. No new predicate is added
// here.

export type ManifestMode = "full" | "restricted" | "held";
export type ProgramGroup = "me" | "camp" | "captains";
export type FolderId = "teams" | "kitchen" | "captains";

/** A team as camp settings name it. */
export interface ManifestTeam {
  key: string;
  label: string;
  archived: boolean;
  order: number;
}

/**
 * Everything the manifest is decided from. Plain data, gathered on the server
 * by lib/program-manifest.ts (and by fixtures in the tests).
 */
export interface ProgramFacts {
  /**
   * `full`: a member who has cleared every gate. `restricted`: an applicant
   * waiting for approval. `held`: a member a blocking questionnaire holds.
   */
  mode: ManifestMode;
  /** Approved by a captain, or a founder. A held member may not be yet. */
  approved: boolean;
  /** The viewer rank: stored rank plus this year's lead flag. */
  rank: ViewerRank;
  /** The teams they are on this year, and which they lead. */
  memberships: readonly { team: string; isLead: boolean }[];
  /** Every team camp settings name, archived ones too. */
  teams: readonly ManifestTeam[];
  /** Drives this year, or has a seat in someone's car (`getMyLift`). */
  hasLift: boolean;
  /** The inbox count (`getInboxBadge().total`). */
  inbox: number;
  /**
   * How many system checks need attention (`deriveSystemStatus`), or null
   * when it was not worked out.
   */
  healthWarnings: number | null;
}

/** What a `requires` predicate may look at. */
export interface ProgramContext {
  rank: ViewerRank;
  /** Team keys they lead this year. */
  ledTeams: readonly string[];
  /** Team keys they are on this year, archived teams included. */
  memberTeams: readonly string[];
  /**
   * The keys of the camp's active (not archived) teams that a team page can
   * open: the teams the console offers anywhere.
   */
  activeTeams: readonly string[];
  hasLift: boolean;
}

/**
 * One program in the registry: its program definition (lib/program-routes.ts)
 * plus what stays on the server, where its icon sits and who may open it.
 * Server-only: `rank` and `requires` stay here.
 */
export interface RegistryEntry {
  id: Exclude<ProgramId, "desktop">;
  /** The plain name on icons, the Start menu and the window title. */
  label: string;
  /**
   * A few words for what is inside it, so Ctrl+K finds Power for "fuel"
   * (#350). Matched in the browser after the name; a name match ranks first.
   * Each is something the program's own pages show.
   */
  keywords?: readonly string[];
  /** The old 404 OS name, for the Terminal and a quiet title suffix. */
  fileName: string;
  /** Where its icon opens. Children have none: another program opens them. */
  href: string | null;
  /** A key the desktop maps to a picture. */
  icon: string;
  /** Where its icon sits; null for a child window, which has no icon. */
  place: { group: ProgramGroup; folder: FolderId | null } | null;
  /** The lowest rank its page clears: the same bar the page's gate uses. */
  rank: ViewerRank;
  /**
   * A narrower rule than the rank, a core rule about the viewer. Its page asks
   * it too (`programPage(id).allowed`, lib/program-page.ts), so the icon and
   * the page agree by construction. `requires` is read from it.
   */
  rule?: Rule;
  /**
   * A narrower test than the rank, from the core predicates only: the
   * entry's `rule`, or a fact about the member that is not a rule (a lift).
   */
  requires?: (ctx: ProgramContext) => boolean;
  /**
   * Its page gates on camp access only, so an applicant waiting for approval
   * opens it too (the restricted desktop).
   */
  applicants?: true;
  /** One icon per team (`/teams/<key>`), not one icon. */
  perTeam?: true;
  /**
   * It comes last in its column, after the column's folders (the Terminal,
   * after the Captains folder). A member with nothing else in that column
   * gets it at the end of the Camp column instead.
   */
  endsColumn?: true;
}

const ME = { group: "me", folder: null } as const;
const CAMP = { group: "camp", folder: null } as const;
const KITCHEN = { group: "camp", folder: "kitchen" } as const;
const TEAMS = { group: "camp", folder: "teams" } as const;
const CAPTAINS = { group: "captains", folder: "captains" } as const;
/** In the Captains column, on the desktop itself, after the folder. */
const CAPTAINS_DESKTOP = { group: "captains", folder: null } as const;

/** What a registry entry says itself; the rest is its definition's. */
type Placement = Omit<
  RegistryEntry,
  "label" | "fileName" | "href" | "icon" | "requires"
> & {
  /** Only for a test that is not a `rule` (a lift); a rule fills it in. */
  requires?: RegistryEntry["requires"];
};

/**
 * A registry entry from its placement and its program definition: the
 * definition's title and file name, its first route as the icon's link (none
 * for a child window or the per-team page), and its id as the icon key.
 */
function fromDefinition(placement: Placement): RegistryEntry {
  const def = programDefinition(placement.id);
  return {
    ...placement,
    ...(placement.rule ? { requires: byRule(placement.rule) } : {}),
    label: PROGRAM_TITLES[placement.id],
    fileName: def.file,
    href:
      placement.place && !placement.perTeam ? programHome(placement.id) : null,
    icon: placement.id,
  };
}

/** A `requires` that asks a core rule about the viewer. */
const byRule = (rule: Rule) => (ctx: ProgramContext) =>
  rule.allows(toActor(ctx.rank, ctx.ledTeams));

/** Writes at least one Survival Guide chapter: the New chapter button. */
const GUIDE_WRITER: Rule = {
  allows: (actor) =>
    !!actor && canEditAnyGuideChapter(actor.rank, actor.ledTeams),
};

/**
 * Every program but the desktop, in default-layout order within each group
 * and folder: where its icon sits and its gate. Its name, file name and link
 * come from its program definition (lib/program-routes.ts).
 */
export const PROGRAM_REGISTRY: readonly RegistryEntry[] = (
  [
    // --- Me ------------------------------------------------------------------
    // In the approved prototype's order (owner, 2026-09-26): Tasks and Calendar
    // sit with the member's own things, then Camp is Roster, Teams, Kitchen,
    // Power, Family tree (the folders' `after` places them). Meetings are in
    // the Calendar since 2026-10-10.
    {
      id: "inbox",
      keywords: ["Notifications", "Unread", "Announcements"],
      place: ME,
      rank: "camp_member",
      applicants: true,
    },
    {
      id: "tasks",
      keywords: ["To do", "Doing", "Deadline"],
      place: ME,
      rank: "camp_member",
    },
    {
      id: "calendar",
      keywords: [
        "Events",
        "Coming up",
        "Meetings",
        "Minutes",
        "Agenda",
        "Decisions",
        "Action items",
        "New event",
      ],
      place: ME,
      rank: "camp_member",
    },
    {
      id: "my-forms",
      keywords: ["Dietary needs", "Questionnaire"],
      place: ME,
      rank: "camp_member",
    },
    {
      id: "invites",
      keywords: ["Invite code", "Invite a member"],
      place: ME,
      rank: "camp_member",
    },
    {
      id: "account",
      keywords: ["Profile", "Ticket", "Payment reference", "Password"],
      place: ME,
      rank: "camp_member",
    },
    // Every member's own dues (#240): what they owe, their pledge, and where
    // they send their proof of payment.
    {
      id: "my-dues",
      keywords: ["Payment plan", "Charges", "Refund"],
      place: ME,
      rank: "camp_member",
    },
    // Every member's own gear order (#241): the tent, mattress and bedding
    // they need this year, and the tent they are in.
    {
      id: "my-gear",
      keywords: ["Tent", "Bedding", "Sharing a tent"],
      place: ME,
      rank: "camp_member",
    },
    // Every member's own shifts in burn week (#248), with a pocket card to
    // print: there is no internet on site.
    {
      id: "my-shifts",
      keywords: ["Volunteer shifts", "AfrikaBurn shift"],
      place: ME,
      rank: "camp_member",
    },
    // Every member's own claims (#242): money they spent for a team, claimed
    // back with the receipts, and where each claim is.
    {
      id: "my-claims",
      keywords: ["Receipts", "Bank details"],
      place: ME,
      rank: "camp_member",
    },
    // Decision 11 A (owner, 2026-09-26): a driver, or a member with a seat in
    // someone's car, gets their lift as a program.
    {
      id: "my-lift",
      keywords: ["Driver", "Riders", "Ride", "Your car"],
      place: ME,
      rank: "camp_member",
      requires: (ctx) => ctx.hasLift,
    },

    // --- Camp ----------------------------------------------------------------
    // A member program that lives under /captains: the page picks the
    // projection by rank (captain, lead or member), it never locks.
    {
      id: "roster",
      keywords: ["Members", "Waiting list"],
      place: CAMP,
      rank: "camp_member",
    },
    // /power is the program's home: the answer rail (a phone's list of the six
    // sections), with the load list beside it in a wide window.
    {
      id: "power",
      keywords: ["Fuel cans", "Generator", "Loads", "Grid", "Refuelling"],
      place: CAMP,
      rank: "camp_member",
    },
    // The year's pack-to-unpack days (#247), for every member to read.
    {
      id: "logistics",
      keywords: ["AfrikaBurn dates", "Deadlines", "Who can help"],
      place: CAMP,
      rank: "camp_member",
    },
    // The shift roster (#248): every member signs up before the burn; a
    // captain or a lead of a shift's team sets it up; printed for site.
    {
      id: "shifts",
      keywords: ["Burn days", "Duty card"],
      place: CAMP,
      rank: "camp_member",
    },
    // Help wanted (owner's pick A, 2026-10-09): every team's roles this year
    // and who fills them. Every member reads it and says "I'm keen"; a captain
    // or the team's lead picks (canManageTeamRoles, checked in each write).
    {
      id: "help-wanted",
      keywords: ["Team roles", "Needs a lead", "I'm keen", "Volunteer"],
      place: CAMP,
      rank: "camp_member",
    },
    // The site plan (#271): every member reads it; its page gates the edits.
    {
      id: "camp-layout",
      keywords: ["Site plan", "Our plot", "Neighbours", "Arrivals"],
      place: CAMP,
      rank: "camp_member",
    },
    // The Ministry of Vibes' lounge programme (#269): every member reads it and
    // offers something; its page decides who may run it (canRunLounge).
    {
      id: "lounge",
      keywords: ["Programme", "Offers", "Event guide", "Music"],
      place: CAMP,
      rank: "camp_member",
    },
    // The camp's gear (#246): every member reads it, suggests changes and
    // books; a captain or a lead of the item's team changes it.
    {
      id: "inventory",
      keywords: ["Gear", "Bookings", "Lent out", "Maintenance"],
      place: CAMP,
      rank: "camp_member",
    },
    // Transport (#270): every approved member reads the car list; the page's
    // controls and the writes carry their own rules.
    {
      id: "transport",
      keywords: ["Lifts", "Fuel cans", "Cars", "Trailers", "Seats"],
      place: CAMP,
      rank: "camp_member",
    },
    {
      id: "family-tree",
      keywords: ["Invited by"],
      place: CAMP,
      rank: "camp_member",
    },
    // Camp pets (owner, 2026-10-09): every approved member sends in their pet
    // and sees the ones that are in; its page gives the founders their review.
    {
      id: "pets",
      keywords: ["Cats", "Dogs", "Add your pet", "Hints"],
      place: CAMP,
      rank: "camp_member",
    },
    // The camp's intro, once a Notion page (#264): every approved member reads
    // it; captains edit its words in Join site.
    {
      id: "about",
      keywords: ["Camp fee", "Getting there", "Where we are"],
      place: CAMP,
      rank: "camp_member",
    },
    // The Survival Guide (#250): every approved member reads it; captains and
    // a team's leads write it (canEditGuideChapter, checked in each write).
    {
      id: "guide",
      keywords: ["Chapters", "Duty cards"],
      place: CAMP,
      rank: "camp_member",
    },
    // Every team's page, for every approved member (owner's decision 2,
    // 2026-09-26: every member sees every team's dashboard, read-only; the
    // actions on it keep their own gates).
    {
      id: "team",
      place: TEAMS,
      rank: "camp_member",
      perTeam: true,
    },
    // Every team's budget for the year in one table (#242; owner, 2026-09-30:
    // every member sees each team's totals). Read-only here; the Finance team
    // sets them on its Budgets tab.
    {
      id: "budgets",
      keywords: ["Team budgets", "Spent", "Over budget"],
      place: TEAMS,
      rank: "camp_member",
    },
    {
      id: "recipes",
      keywords: ["Recipe book", "Import a recipe", "Dictate"],
      place: KITCHEN,
      rank: "camp_member",
    },
    {
      id: "meal-plan",
      keywords: ["Menu", "Snacks", "Allergies", "Prep plan"],
      place: KITCHEN,
      rank: "camp_member",
    },
    {
      id: "shopping-list",
      keywords: ["Food cost", "To buy"],
      place: KITCHEN,
      rank: "camp_member",
    },
    {
      id: "recipe-review",
      keywords: ["Proofread", "Suggestions"],
      place: KITCHEN,
      rank: "team_lead",
      rule: KITCHEN_REVIEWER,
    },

    // --- Captains folder -------------------------------------------------------
    {
      id: "overview",
      keywords: ["Camp ready", "Team coverage", "Tickets"],
      place: CAPTAINS,
      rank: "captain",
    },
    // Every member and everything the camp holds on them, on one screen, like
    // the previous captain's spreadsheet. It shows ID numbers: captains only.
    {
      id: "camp-sheet",
      keywords: ["Spreadsheet", "Everyone", "Emergency contacts", "Allergies"],
      place: CAPTAINS,
      rank: "captain",
    },
    // Who is coming this year, with tickets and WAP for captains
    // (#238). A team lead reads the statuses only, so the bar is team_lead.
    {
      id: "applications",
      keywords: ["Accept", "Tickets", "WAP", "DDT"],
      place: CAPTAINS,
      rank: "team_lead",
    },
    {
      id: "questionnaires",
      keywords: ["Results", "Responses", "Publish"],
      place: CAPTAINS,
      rank: "team_lead",
    },
    {
      id: "announcements",
      keywords: ["Pop-up", "Drafts"],
      place: CAPTAINS,
      rank: "team_lead",
    },
    // Claims waiting for a team's yes (#242): every lead (the page shows only
    // the teams they lead, canApproveClaim) and captains (every team).
    {
      id: "claim-approvals",
      keywords: ["Approve claims", "Turn down"],
      place: CAPTAINS,
      rank: "team_lead",
    },
    // The Finance tools (#240): captains and Finance leads (canManageMoney).
    // The page's rank gate is team_lead, because clearance is global; the rule
    // narrows it, so a lead of another team is not offered it. A Finance lead
    // also finds it in their Finance team folder (TEAM_TOOLS).
    {
      id: "payments",
      keywords: [
        "Who owes what",
        "Bank statement",
        "Settle-up",
        "Fee tiers",
        "Proofs",
      ],
      place: CAPTAINS,
      rank: "team_lead",
      rule: MONEY_KEEPER,
    },
    // Gear rental (#241): captains only (canManageRental). This is member
    // money data, so a team lead gets nothing extra and is not offered it.
    {
      id: "gear-rental",
      keywords: ["Tents", "Catalogue", "Orders", "Supplier price"],
      place: CAPTAINS,
      rank: "team_lead",
      rule: RENTAL_MANAGER,
    },
    {
      id: "camp-settings",
      keywords: ["Teams", "New year", "Rollover"],
      place: CAPTAINS,
      rank: "captain",
    },
    {
      id: "join-site",
      keywords: ["Fee levels", "How to join"],
      place: CAPTAINS,
      rank: "captain",
    },
    // Screenshots attached to bug reports (#313): captains only, because a
    // screenshot can show other members' details.
    {
      id: "report-screenshots",
      keywords: ["Bug reports", "Feedback"],
      place: CAPTAINS,
      rank: "captain",
    },
    {
      id: "audit",
      keywords: ["History", "Changes"],
      place: CAPTAINS,
      rank: "captain",
    },
    {
      id: "system",
      keywords: ["Core services", "Background work"],
      place: CAPTAINS,
      rank: "captain",
    },
    // The Terminal (owner, 2026-09-25: "We do need the terminal"): every
    // approved member. It ends the Captains column, after the folder; for a
    // member with no Captains folder it ends the Camp column instead
    // (buildProgramManifest moves it).
    {
      id: "terminal",
      keywords: ["Commands", "Inkblot"],
      place: CAPTAINS_DESKTOP,
      rank: "camp_member",
      endsColumn: true,
    },

    // --- Child windows: no icon, opened from another program -------------------
    {
      id: "announcement",
      place: null,
      rank: "camp_member",
      applicants: true,
    },
    {
      id: "form",
      place: null,
      rank: "camp_member",
    },
    {
      id: "form-answers",
      place: null,
      rank: "camp_member",
    },
    // A meeting's minutes, opened from the Calendar: every member reads the
    // meeting there; the page locks for anyone not on its team (canWorkInTeam).
    {
      id: "minutes",
      place: null,
      rank: "camp_member",
    },
    {
      id: "guide-chapter",
      place: null,
      rank: "camp_member",
    },
    {
      id: "guide-version",
      place: null,
      rank: "camp_member",
    },
    // Writing opens for captains and leads; the page locks a lead out of
    // another team's chapter, and every write checks again.
    {
      id: "new-guide-chapter",
      place: null,
      rank: "team_lead",
      rule: GUIDE_WRITER,
    },
    {
      id: "edit-guide-chapter",
      place: null,
      rank: "team_lead",
      rule: GUIDE_WRITER,
    },
    {
      id: "new-recipe",
      place: null,
      rank: "camp_member",
    },
    {
      id: "recipe",
      place: null,
      rank: "camp_member",
    },
    {
      id: "edit-recipe",
      place: null,
      rank: "team_lead",
      rule: KITCHEN_REVIEWER,
    },
    {
      id: "recipe-version",
      place: null,
      rank: "camp_member",
    },
    {
      id: "recipe-source",
      place: null,
      rank: "camp_member",
    },
    {
      id: "edit-questionnaire",
      place: null,
      rank: "team_lead",
    },
    {
      id: "preview-questionnaire",
      place: null,
      rank: "team_lead",
    },
    {
      id: "send-questionnaire",
      place: null,
      rank: "team_lead",
    },
    {
      id: "results",
      place: null,
      rank: "captain",
    },
    {
      id: "respondent-answers",
      place: null,
      rank: "captain",
    },
    // INKBLOT, opened from the Terminal (`play inkblot`), never from an icon.
    {
      id: "inkblot",
      place: null,
      rank: "camp_member",
    },
    // The questionnaire runner and its last page. Their gate is camp access,
    // then the member's own required action for that send.
    {
      id: "questionnaire",
      place: null,
      rank: "camp_member",
      applicants: true,
    },
  ] satisfies readonly Placement[]
).map(fromDefinition);

const FOLDERS: readonly {
  id: FolderId;
  label: string;
  icon: string;
  group: ProgramGroup;
  /** The program it follows on the desktop; else after the group's programs. */
  after?: ProgramId;
}[] = [
  {
    id: "teams",
    label: "Teams",
    icon: "folder",
    group: "camp",
    after: "roster",
  },
  {
    id: "kitchen",
    label: "Kitchen",
    icon: "folder",
    group: "camp",
    after: "roster",
  },
  { id: "captains", label: "Captains", icon: "folder", group: "captains" },
];

const GROUPS: readonly { id: ProgramGroup; label: string }[] = [
  { id: "me", label: "Me" },
  { id: "camp", label: "Camp" },
  { id: "captains", label: "Captains" },
];

/**
 * The tools each team's folder holds after its team page: the prototype's
 * starting set (design doc, section 4, decision 8). Shaped with each lead
 * later. A tool is listed only when the member's manifest already holds it:
 * a team folder is a shortcut, never a grant.
 */
export const TEAM_TOOLS: Readonly<Partial<Record<Team, readonly ProgramId[]>>> =
  {
    kitchen: ["recipes", "meal-plan", "shopping-list", "recipe-review"],
    structures: ["camp-layout"],
    power_and_lighting: ["power"],
    ministry_of_vibes: ["lounge"],
    transport_and_logistics: ["inventory", "transport", "logistics"],
    communications_and_hr: ["announcements", "questionnaires", "join-site"],
    finance: ["payments"],
  };

/**
 * After a team folder's page: the team's own calendar and tasks, each the
 * shared program filtered to the team (audit, 2026-10-01: the folder had no
 * way to the things its members work in). Listed only when the member's
 * manifest holds the program; the id is `<program>:<team>`.
 */
const TEAM_FOLDER_SHORTCUTS: readonly {
  id: ProgramId;
  noun: string;
  href: (team: string) => string;
}[] = [
  {
    id: "calendar",
    noun: "calendar",
    href: (team) => `/calendar?team=${encodeURIComponent(team)}`,
  },
  {
    id: "tasks",
    noun: "tasks",
    href: (team) => tasksHref(team),
  },
];

// --- What leaves the server ---------------------------------------------------

/** A program as the browser gets it: no rank, no reason. */
export interface ClientProgram {
  /** The program id, or `team:<key>` for a team's page. */
  id: string;
  label: string;
  fileName: string;
  href: string;
  icon: string;
  group: ProgramGroup;
  /** The camp-wide folder it lives in, or null on the desktop itself. */
  folder: FolderId | null;
  /** A team page: the member is on this team this year. */
  mine?: true;
  /** A count of new things. Absent for none, and always in held mode. */
  badge?: number;
}

export interface ClientFolder {
  id: FolderId;
  label: string;
  icon: string;
  group: ProgramGroup;
  programs: ClientProgram[];
}

/** One team the member is on this year, as a folder on the right. */
export interface ClientTeamFolder {
  team: string;
  /** "Kitchen team", so it is not mistaken for the camp-wide Kitchen folder. */
  label: string;
  /** They lead it: the folder is tagged LEAD, and led teams come first. */
  lead: boolean;
  programs: ClientProgram[];
}

/** A place in the default layout or the Start menu. */
export type DesktopItem =
  | { kind: "program"; id: string }
  | { kind: "folder"; id: FolderId };

export interface StartMenuSection {
  group: ProgramGroup;
  label: string;
  items: DesktopItem[];
}

/**
 * The system-health tray flag (owner, 2026-09-25: for every accepted member).
 * A non-captain gets the coarse flag and nothing else; only a captain's
 * carries the count and the link to System status.
 */
export type HealthFlag =
  | { status: "ok" | "warning" }
  | { status: "ok" | "warning"; warnings: number; href: "/captains/system" };

export interface ManifestTray {
  /** The inbox bell's count; null in held mode. */
  inbox: { count: number } | null;
  health: HealthFlag | null;
  /** Whether the Today gadget exists at all (not whether it is open). */
  today: boolean;
  /** The restricted desktop's "Application submitted" balloon. */
  balloon: "application_submitted" | null;
}

export interface ProgramManifest {
  mode: ManifestMode;
  /** The left-hand default layout: group columns, programs and folders. */
  desktop: DesktopItem[];
  /** Every program on the desktop itself (not in a folder), by id. */
  programs: ClientProgram[];
  /** The camp-wide folders the member has, each non-empty. */
  folders: ClientFolder[];
  /** One per team the member is on this year: led first, then camp order. */
  teamFolders: ClientTeamFolder[];
  /** Program ids on the taskbar's quick-launch strip. */
  taskbarPins: string[];
  startMenu: StartMenuSection[];
  tray: ManifestTray;
  /** Whether pinned announcements are drawn (never before the door). */
  pins: boolean;
  /**
   * Child program ids the member may hold a window of (Results, Edit recipe,
   * a meeting, …), each at its own bar, so a stored window can be pruned.
   */
  allowedChildren: ProgramId[];
  /**
   * Ctrl+K search (issue #326, step 1): every program the member may open, in
   * the desktop's order, each with the group its row names on the right.
   * Only ids that are in `programs` or a folder; the browser finds the
   * program itself there.
   */
  search: SearchPlace[];
  /** Changes when what the member may open changes; never with live counts. */
  version: string;
  /**
   * Voice to instruction (#356): captains only, on the full desktop. Null or
   * absent for everyone else, so nobody else has a mic in the page at all.
   * `consented`: they have read the one-time notice and turned it on.
   */
  voice?: { consented: boolean } | null;
}

/** One program in Ctrl+K search: its id and where it lives ("Kitchen"). */
export interface SearchPlace {
  id: string;
  where: string;
  /** Words for what is inside it ("Fuel cans"), when it has any. */
  keywords?: string[];
}

// --- Building it -----------------------------------------------------------------

function isTeamKey(key: string): key is Team {
  return Team.safeParse(key).success;
}

/**
 * The active teams in the camp's order, the member's own first (still in the
 * camp's order), then the rest. Archived teams and keys the team page cannot
 * open are left out. The Teams folder and the header's Teams menu both come
 * from this, so they cannot disagree.
 */
export function teamsInCampOrder(
  active: readonly { key: string; label: string }[],
  myTeams: readonly string[],
): {
  mine: { key: string; label: string }[];
  others: { key: string; label: string }[];
} {
  const items = active
    .filter((t) => isTeamKey(t.key))
    .map((t) => ({ key: t.key, label: t.label }));
  return {
    mine: items.filter((t) => myTeams.includes(t.key)),
    others: items.filter((t) => !myTeams.includes(t.key)),
  };
}

function inCampOrder(teams: readonly ManifestTeam[]): ManifestTeam[] {
  return [...teams].sort((a, b) => a.order - b.order);
}

function contextOf(facts: ProgramFacts): ProgramContext {
  return {
    rank: facts.rank,
    ledTeams: facts.memberships.filter((m) => m.isLead).map((m) => m.team),
    memberTeams: facts.memberships.map((m) => m.team),
    activeTeams: facts.teams
      .filter((t) => !t.archived && isTeamKey(t.key))
      .map((t) => t.key),
    hasLift: facts.hasLift,
  };
}

function allowed(
  entry: RegistryEntry,
  ctx: ProgramContext,
  mode: ManifestMode,
): boolean {
  if (mode === "restricted" && !entry.applicants) return false;
  if (!hasClearance(ctx.rank, entry.rank)) return false;
  return entry.requires ? entry.requires(ctx) : true;
}

/** A 32-bit FNV-1a hash, hex: enough to tell one manifest from the next. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The manifest for one member. Pure: the same facts give the same manifest.
 *
 *   full        every program they clear, folders, team folders, tray, pins;
 *   restricted  an applicant waiting for approval: Inbox, Today and the
 *               "Application submitted" balloon, no pins, no health flag;
 *   held        a blocking questionnaire holds them: their own icons and
 *               nothing live (no badges, counts, pins, health or Today). Not
 *               approved yet: nothing but the wallpaper.
 */
export function buildProgramManifest(
  facts: ProgramFacts,
  registry: readonly RegistryEntry[] = PROGRAM_REGISTRY,
): ProgramManifest {
  const { mode } = facts;
  const ctx = contextOf(facts);
  // Held before approval: the ladder puts questionnaires before approval, so
  // this member has no desktop yet to be held on top of.
  const wallpaperOnly = mode === "held" && !facts.approved;
  const live = mode !== "held";
  const inboxCount = Math.max(0, facts.inbox);

  const usable = wallpaperOnly
    ? []
    : registry.filter((entry) => allowed(entry, ctx, mode));

  const toClient = (
    entry: RegistryEntry,
    href: string,
    over: Partial<ClientProgram> = {},
  ): ClientProgram => {
    const program: ClientProgram = {
      id: entry.id,
      label: entry.label,
      fileName: entry.fileName,
      href,
      icon: entry.icon,
      group: entry.place!.group,
      folder: entry.place!.folder,
      ...over,
    };
    if (live && entry.id === "inbox" && inboxCount > 0) {
      program.badge = inboxCount;
    }
    // System status wears the checks that need attention (the prototype's
    // System health count), for the captain who may open it.
    if (
      live &&
      entry.id === "system" &&
      facts.healthWarnings !== null &&
      facts.healthWarnings > 0
    ) {
      program.badge = facts.healthWarnings;
    }
    return program;
  };

  // Every icon the member has, top-level programs and team pages alike.
  const icons: ClientProgram[] = [];
  const byId = new Map<string, ClientProgram>();
  const myTeams = facts.memberships.map((m) => m.team);
  const activeTeams = inCampOrder(facts.teams.filter((t) => !t.archived));
  for (const entry of usable) {
    if (!entry.place) continue;
    if (entry.perTeam) {
      const { mine, others } = teamsInCampOrder(activeTeams, myTeams);
      for (const team of [...mine, ...others]) {
        const program = toClient(entry, `/teams/${team.key}`, {
          id: `team:${team.key}`,
          label: team.label,
          fileName: `${team.key.toUpperCase()}.TEAM`,
          ...(myTeams.includes(team.key) ? { mine: true as const } : {}),
        });
        icons.push(program);
        byId.set(program.id, program);
      }
      continue;
    }
    if (!entry.href) continue;
    const program = toClient(entry, entry.href);
    icons.push(program);
    byId.set(program.id, program);
  }

  const programs = icons.filter((p) => p.folder === null);
  const folders: ClientFolder[] = FOLDERS.map(
    ({ after: _after, ...folder }) => ({
      ...folder,
      programs: icons.filter((p) => p.folder === folder.id),
    }),
  ).filter((folder) => folder.programs.length > 0);

  // A program that ends its column (the Terminal) comes after the column's
  // folders. When nothing else is in its column (a member with no Captains
  // folder), it ends the Camp column instead, so no column holds it alone.
  const last = new Set(
    usable.filter((entry) => entry.endsColumn).map((entry) => entry.id),
  );
  for (const program of programs) {
    if (!last.has(program.id as RegistryEntry["id"])) continue;
    const alone = !icons.some(
      (p) =>
        p !== program &&
        p.group === program.group &&
        (p.folder === null || folders.some((f) => f.id === p.folder)),
    );
    if (alone) program.group = "camp";
  }

  const desktop: DesktopItem[] = [];
  const startMenu: StartMenuSection[] = [];
  for (const group of GROUPS) {
    const inGroup = programs.filter((p) => p.group === group.id);
    const firsts = inGroup.filter(
      (p) => !last.has(p.id as RegistryEntry["id"]),
    );
    const groupFolders = folders.filter((f) => f.group === group.id);
    const anchorOf = (f: ClientFolder) =>
      FOLDERS.find((x) => x.id === f.id)?.after;
    // A folder follows its anchor program; one whose anchor this member
    // does not have goes after the group's programs.
    const anchored = (id: string) =>
      groupFolders
        .filter((f) => anchorOf(f) === id)
        .map((f) => ({ kind: "folder" as const, id: f.id }));
    const items: DesktopItem[] = [
      ...firsts.flatMap((p) => [
        { kind: "program" as const, id: p.id },
        ...anchored(p.id),
      ]),
      ...groupFolders
        .filter((f) => {
          const at = anchorOf(f);
          return !at || !firsts.some((p) => p.id === at);
        })
        .map((f) => ({ kind: "folder" as const, id: f.id })),
      ...inGroup
        .filter((p) => last.has(p.id as RegistryEntry["id"]))
        .map((p) => ({ kind: "program" as const, id: p.id })),
    ];
    desktop.push(...items);
    // Held: an empty taskbar, so no Start menu to open.
    if (live && items.length > 0) {
      startMenu.push({ group: group.id, label: group.label, items });
    }
  }

  // One folder per team they are on this year, led first, then camp order.
  const teamOrder = new Map(facts.teams.map((t) => [t.key, t.order]));
  const teamLabel = new Map(facts.teams.map((t) => [t.key, t.label]));
  // An applicant has no teams to show yet, and a folder with nothing it may
  // open is not drawn.
  const teamFolders: ClientTeamFolder[] =
    wallpaperOnly || mode === "restricted"
      ? []
      : facts.memberships
          .filter((m) => isTeamKey(m.team) && teamLabel.has(m.team))
          .sort(
            (a, b) =>
              Number(b.isLead) - Number(a.isLead) ||
              (teamOrder.get(a.team) ?? 0) - (teamOrder.get(b.team) ?? 0),
          )
          .map((m) => {
            const label = teamLabel.get(m.team)!;
            const page =
              byId.get(`team:${m.team}`) ??
              // An archived team the member is still on: its page still opens
              // (teams/[key]/page.tsx), it is only left out of the Teams folder.
              toTeamPage(registry, ctx, mode, m.team, label);
            const tools = (TEAM_TOOLS[m.team as Team] ?? [])
              .map((id) => byId.get(id))
              .filter((p): p is ClientProgram => p !== undefined);
            // The team's own calendar and tasks, filtered to it: what its
            // members work in. Shortcuts to programs the member already has.
            const filtered = TEAM_FOLDER_SHORTCUTS.flatMap(
              ({ id, noun, href }) => {
                const program = byId.get(id);
                return program
                  ? [
                      {
                        ...program,
                        id: `${id}:${m.team}`,
                        label: `${label} ${noun}`,
                        href: href(m.team),
                      },
                    ]
                  : [];
              },
            );
            return {
              team: m.team,
              label: `${label} team`,
              lead: m.isLead,
              programs: [
                // "Kitchen page", not "Kitchen": the camp-wide Kitchen folder
                // has that name.
                ...(page ? [{ ...page, label: `${label} page` }] : []),
                ...filtered,
                ...tools,
              ],
            };
          })
          .filter((folder) => folder.programs.length > 0);

  const allowedChildren = wallpaperOnly
    ? []
    : usable
        .filter((entry) => entry.place === null)
        .filter((entry) => mode !== "held" || entry.id === "questionnaire")
        .map((entry) => entry.id);
  if (wallpaperOnly) allowedChildren.push("questionnaire");

  const health: HealthFlag | null =
    mode === "full" && facts.approved && facts.healthWarnings !== null
      ? facts.rank === "captain"
        ? {
            status: facts.healthWarnings > 0 ? "warning" : "ok",
            warnings: facts.healthWarnings,
            href: "/captains/system",
          }
        : { status: facts.healthWarnings > 0 ? "warning" : "ok" }
      : null;

  const tray: ManifestTray = {
    inbox: live ? { count: inboxCount } : null,
    health,
    today: live,
    balloon: mode === "restricted" ? "application_submitted" : null,
  };

  // Search lists what the Start menu reaches, a folder's programs at the
  // folder's place. Each row says where the program lives: its folder
  // (Kitchen, Captains), else the one team whose tool it is (Power is Power
  // and Lighting's), else Teams for a team's page, else its group.
  const groupLabel = new Map(GROUPS.map((g) => [g.id, g.label]));
  const folderLabel = new Map(FOLDERS.map((f) => [f.id, f.label]));
  const toolOf = new Map<string, string[]>();
  for (const [team, tools] of Object.entries(TEAM_TOOLS)) {
    for (const id of tools ?? []) {
      toolOf.set(id, [...(toolOf.get(id) ?? []), team]);
    }
  }
  const whereOf = (p: ClientProgram): string => {
    if (p.folder === "kitchen" || p.folder === "captains") {
      return folderLabel.get(p.folder)!;
    }
    const owners = toolOf.get(p.id) ?? [];
    const owner = owners.length === 1 ? teamLabel.get(owners[0]!) : undefined;
    if (owner) return owner;
    if (p.folder) return folderLabel.get(p.folder)!;
    return groupLabel.get(p.group) ?? "Camp";
  };
  const search: SearchPlace[] = [];
  for (const item of desktop) {
    const listed =
      item.kind === "program"
        ? [byId.get(item.id)].filter((p) => p !== undefined)
        : (folders.find((f) => f.id === item.id)?.programs ?? []);
    for (const p of listed) {
      const keywords = registry.find((e) => e.id === p.id)?.keywords;
      search.push({
        id: p.id,
        where: whereOf(p),
        ...(keywords?.length ? { keywords: [...keywords] } : {}),
      });
    }
  }

  const body = {
    mode,
    desktop,
    programs,
    folders,
    teamFolders,
    taskbarPins: live && byId.has("inbox") ? ["inbox"] : [],
    startMenu,
    tray,
    pins: mode === "full",
    allowedChildren,
  };
  return { ...body, search, version: accessVersion(body) };
}

/**
 * The manifest's version changes only when what the member may open changes
 * (a demotion, a new team, the mode), never with live counts. The desktop
 * drops every last-seen copy when it changes, so a new notice or a new health
 * warning must not bump it.
 */
function accessVersion(
  body: Omit<ProgramManifest, "version" | "search">,
): string {
  const noBadge = <T extends { badge?: unknown }>({ badge: _b, ...rest }: T) =>
    rest;
  return hash(
    JSON.stringify({
      ...body,
      programs: body.programs.map(noBadge),
      folders: body.folders.map((f) => ({
        ...f,
        programs: f.programs.map(noBadge),
      })),
      teamFolders: body.teamFolders.map((f) => ({
        ...f,
        programs: f.programs.map(noBadge),
      })),
      tray: {
        ...body.tray,
        inbox: body.tray.inbox ? {} : null,
        health: body.tray.health
          ? { ...body.tray.health, status: null, warnings: null }
          : null,
      },
    }),
  );
}

/** The page of a team that is not in the Teams folder (archived), if allowed. */
function toTeamPage(
  registry: readonly RegistryEntry[],
  ctx: ProgramContext,
  mode: ManifestMode,
  key: string,
  label: string,
): ClientProgram | null {
  const entry = registry.find((e) => e.perTeam);
  if (!entry?.place || !allowed(entry, ctx, mode)) return null;
  return {
    id: `team:${key}`,
    label,
    fileName: `${key.toUpperCase()}.TEAM`,
    href: `/teams/${key}`,
    icon: entry.icon,
    group: entry.place.group,
    folder: entry.place.folder,
    mine: true,
  };
}

/** Every program id the member has an icon for, team pages included. */
export function manifestProgramIds(manifest: ProgramManifest): Set<string> {
  const ids = new Set<string>();
  for (const p of manifest.programs) ids.add(p.id);
  for (const f of manifest.folders) for (const p of f.programs) ids.add(p.id);
  return ids;
}

/**
 * The manifest of an approved member at `rank` with no teams, no lift and an
 * empty inbox. For tests of what a rank alone opens; the console itself
 * builds from the member's real facts (lib/program-manifest.ts).
 */
export function manifestForRank(
  rank: ViewerRank,
  mode: ManifestMode = "full",
): ProgramManifest {
  return buildProgramManifest({
    mode,
    approved: mode !== "restricted",
    rank,
    memberships: [],
    teams: [],
    hasLift: false,
    inbox: 0,
    healthWarnings: null,
  });
}
