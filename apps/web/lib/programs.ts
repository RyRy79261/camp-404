import "server-only";

import { canApproveRecipe, canWorkInTeam, hasClearance } from "@camp404/core";
import { Team, type ViewerRank } from "@camp404/types";
import type { ProgramId } from "./program-routes";

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
// Hiding is never the security boundary. Every page still runs
// `requireMemberPage` or `captainPageGate` (and its CaptainLock), and every
// action its own gate. So each entry carries the SAME bar its page guards on;
// lib/__tests__/program-registry-drift.test.ts reads every console page and
// fails when the two disagree.
//
// `requires` may call only the existing core predicates (`hasClearance`,
// `canApproveRecipe`, `canWorkInTeam`, and the others the design names), so a
// rule changes in one place. No new predicate is added here.

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
   * open: the teams the console offers anywhere (meetings/new/page.tsx).
   */
  activeTeams: readonly string[];
  hasLift: boolean;
}

/** One program in the registry. Server-only: `rank` and `requires` stay here. */
export interface RegistryEntry {
  id: Exclude<ProgramId, "desktop">;
  /** The plain name on icons, the Start menu and the window title. */
  label: string;
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
  /** A narrower rule than the rank, from the core predicates only. */
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

const reviewsRecipes = (ctx: ProgramContext) =>
  canApproveRecipe(ctx.rank, ctx.ledTeams);

/**
 * Every program, in default-layout order within each group and folder. Plain
 * names (owner, 2026-09-25: "some of the terminology might be a bit too
 * geeky"); the file names are the catalogue's
 * (docs/specs/2026-09-25-404-os-program-catalogue.md).
 */
export const PROGRAM_REGISTRY: readonly RegistryEntry[] = [
  // --- Me ------------------------------------------------------------------
  // In the approved prototype's order (owner, 2026-09-26): Tasks and Calendar
  // sit with the member's own things, then Camp is Roster, Teams, Meetings,
  // Kitchen, Power, Family tree (the folders' `after` places them).
  {
    id: "inbox",
    label: "Inbox",
    fileName: "INBOX.EXE",
    href: "/notifications",
    icon: "inbox",
    place: ME,
    rank: "camp_member",
    applicants: true,
  },
  {
    id: "tasks",
    label: "Tasks",
    fileName: "TASKS.EXE",
    href: "/tasks",
    icon: "tasks",
    place: ME,
    rank: "camp_member",
  },
  {
    id: "calendar",
    label: "Calendar",
    fileName: "CALENDAR.EXE",
    href: "/calendar",
    icon: "calendar",
    place: ME,
    rank: "camp_member",
  },
  {
    id: "my-forms",
    label: "My forms",
    fileName: "MYFORMS.EXE",
    href: "/tools/forms",
    icon: "my-forms",
    place: ME,
    rank: "camp_member",
  },
  {
    id: "invites",
    label: "Invites",
    fileName: "KEYGEN.EXE",
    href: "/tools/invite",
    icon: "invites",
    place: ME,
    rank: "camp_member",
  },
  {
    id: "account",
    label: "My account",
    fileName: "MY_ACCOUNT.CPL",
    href: "/profile",
    icon: "account",
    place: ME,
    rank: "camp_member",
  },
  // Decision 11 A (owner, 2026-09-26): a driver, or a member with a seat in
  // someone's car, gets their lift as a program.
  {
    id: "my-lift",
    label: "My lift",
    fileName: "MY_LIFT.EXE",
    href: "/lift",
    icon: "my-lift",
    place: ME,
    rank: "camp_member",
    requires: (ctx) => ctx.hasLift,
  },

  // --- Camp ----------------------------------------------------------------
  // A member program that lives under /captains: the page picks the
  // projection by rank (captain, lead or member), it never locks.
  {
    id: "roster",
    label: "Roster",
    fileName: "ROSTER.DB",
    href: "/captains/camp-management",
    icon: "roster",
    place: CAMP,
    rank: "camp_member",
  },
  {
    id: "meetings",
    label: "Meetings",
    fileName: "MINUTES.EXE",
    href: "/meetings",
    icon: "meetings",
    place: CAMP,
    rank: "camp_member",
  },
  // /power sends on to the load list, so the icon goes straight there.
  {
    id: "power",
    label: "Power",
    fileName: "POWER.EXE",
    href: "/power/loads",
    icon: "power",
    place: CAMP,
    rank: "camp_member",
  },
  {
    id: "family-tree",
    label: "Family tree",
    fileName: "LINEAGE.EXE",
    href: "/family-tree",
    icon: "family-tree",
    place: CAMP,
    rank: "camp_member",
  },
  // Every team's page, for every approved member (owner's decision 2,
  // 2026-09-26: every member sees every team's dashboard, read-only; the
  // actions on it keep their own gates).
  {
    id: "team",
    label: "Team",
    fileName: "TEAM.EXE",
    href: null,
    icon: "team",
    place: TEAMS,
    rank: "camp_member",
    perTeam: true,
  },
  {
    id: "recipes",
    label: "Recipes",
    fileName: "COOKBOOK.EXE",
    href: "/kitchen/recipes",
    icon: "recipes",
    place: KITCHEN,
    rank: "camp_member",
  },
  {
    id: "meal-plan",
    label: "Meal plan",
    fileName: "MEALPLAN.XLS",
    href: "/kitchen/meal-plan",
    icon: "meal-plan",
    place: KITCHEN,
    rank: "camp_member",
  },
  {
    id: "recipe-review",
    label: "Recipe review",
    fileName: "REVIEW.EXE",
    href: "/kitchen/recipes/review",
    icon: "recipe-review",
    place: KITCHEN,
    rank: "team_lead",
    requires: reviewsRecipes,
  },

  // --- Captains folder -------------------------------------------------------
  {
    id: "overview",
    label: "Camp overview",
    fileName: "CAMPSTAT.EXE",
    href: "/captains/overview",
    icon: "overview",
    place: CAPTAINS,
    rank: "captain",
  },
  {
    id: "questionnaires",
    label: "Questionnaires",
    fileName: "FORMS.EXE",
    href: "/captains/questionnaires",
    icon: "questionnaires",
    place: CAPTAINS,
    rank: "team_lead",
  },
  {
    id: "announcements",
    label: "Announcements",
    fileName: "BROADCAST.EXE",
    href: "/captains/announcements",
    icon: "announcements",
    place: CAPTAINS,
    rank: "team_lead",
  },
  {
    id: "new-event",
    label: "New event",
    fileName: "NEWEVENT.EXE",
    href: "/captains/calendar",
    icon: "new-event",
    place: CAPTAINS,
    rank: "team_lead",
  },
  {
    id: "payments",
    label: "Payments",
    fileName: "LEDGER.DB",
    href: "/captains/payments",
    icon: "payments",
    place: CAPTAINS,
    rank: "captain",
  },
  {
    id: "camp-settings",
    label: "Camp settings",
    fileName: "SETTINGS.CPL",
    href: "/captains/camp-settings",
    icon: "camp-settings",
    place: CAPTAINS,
    rank: "captain",
  },
  {
    id: "join-site",
    label: "Join site",
    fileName: "JOINSITE.EXE",
    href: "/captains/join-site",
    icon: "join-site",
    place: CAPTAINS,
    rank: "captain",
  },
  {
    id: "audit",
    label: "Audit log",
    fileName: "AUDIT.LOG",
    href: "/captains/audit",
    icon: "audit",
    place: CAPTAINS,
    rank: "captain",
  },
  {
    id: "system",
    label: "System status",
    fileName: "SYSMON.EXE",
    href: "/captains/system",
    icon: "system",
    place: CAPTAINS,
    rank: "captain",
  },
  // The Terminal (owner, 2026-09-25: "We do need the terminal"): every
  // approved member. It ends the Captains column, after the folder; for a
  // member with no Captains folder it ends the Camp column instead
  // (buildProgramManifest moves it).
  {
    id: "terminal",
    label: "Terminal",
    fileName: "TERMINAL.EXE",
    href: "/terminal",
    icon: "terminal",
    place: CAPTAINS_DESKTOP,
    rank: "camp_member",
    endsColumn: true,
  },

  // --- Child windows: no icon, opened from another program -------------------
  {
    id: "announcement",
    label: "Announcement",
    fileName: "ANNOUNCE.TXT",
    href: null,
    icon: "announcement",
    place: null,
    rank: "camp_member",
    applicants: true,
  },
  {
    id: "form",
    label: "Form",
    fileName: "FORM.DOC",
    href: null,
    icon: "form",
    place: null,
    rank: "camp_member",
  },
  {
    id: "form-answers",
    label: "Answers",
    fileName: "ANSWERS.TXT",
    href: null,
    icon: "form",
    place: null,
    rank: "camp_member",
  },
  // New meeting opens for every member but offers only ACTIVE teams they work
  // in, and locks with none (meetings/new/page.tsx), so it is offered only when
  // it would not lock: a member whose only team this year is archived is not
  // offered it.
  {
    id: "new-meeting",
    label: "New meeting",
    fileName: "NEWMEET.TXT",
    href: null,
    icon: "meetings",
    place: null,
    rank: "camp_member",
    requires: (ctx) =>
      canWorkInTeam(ctx.rank, ctx.memberTeams, null) ||
      ctx.activeTeams.some((team) =>
        canWorkInTeam(ctx.rank, ctx.memberTeams, team),
      ),
  },
  {
    id: "meeting",
    label: "Meeting",
    fileName: "MEETING.TXT",
    href: null,
    icon: "meetings",
    place: null,
    rank: "camp_member",
  },
  {
    id: "edit-meeting",
    label: "Edit meeting",
    fileName: "MEETING.TXT",
    href: null,
    icon: "meetings",
    place: null,
    rank: "camp_member",
  },
  {
    id: "new-recipe",
    label: "New recipe",
    fileName: "IMPORT.EXE",
    href: null,
    icon: "recipes",
    place: null,
    rank: "camp_member",
  },
  {
    id: "recipe",
    label: "Recipe",
    fileName: "RECIPE.RCP",
    href: null,
    icon: "recipes",
    place: null,
    rank: "camp_member",
  },
  {
    id: "edit-recipe",
    label: "Edit recipe",
    fileName: "RECIPE.WRI",
    href: null,
    icon: "recipes",
    place: null,
    rank: "team_lead",
    requires: reviewsRecipes,
  },
  {
    id: "recipe-version",
    label: "Recipe version",
    fileName: "RECIPE.VER",
    href: null,
    icon: "recipes",
    place: null,
    rank: "camp_member",
  },
  {
    id: "recipe-source",
    label: "Recipe source",
    fileName: "SOURCE.TXT",
    href: null,
    icon: "recipes",
    place: null,
    rank: "camp_member",
  },
  {
    id: "edit-questionnaire",
    label: "Edit questionnaire",
    fileName: "QBUILD.EXE",
    href: null,
    icon: "questionnaires",
    place: null,
    rank: "team_lead",
  },
  {
    id: "preview-questionnaire",
    label: "Preview",
    fileName: "QVIEW.EXE",
    href: null,
    icon: "questionnaires",
    place: null,
    rank: "team_lead",
  },
  {
    id: "send-questionnaire",
    label: "Send questionnaire",
    fileName: "QSEND.EXE",
    href: null,
    icon: "questionnaires",
    place: null,
    rank: "team_lead",
  },
  {
    id: "results",
    label: "Results",
    fileName: "QSTATS.EXE",
    href: null,
    icon: "questionnaires",
    place: null,
    rank: "captain",
  },
  {
    id: "respondent-answers",
    label: "Answers",
    fileName: "ANSWERS.TXT",
    href: null,
    icon: "questionnaires",
    place: null,
    rank: "captain",
  },
  // INKBLOT, opened from the Terminal (`play inkblot`), never from an icon.
  {
    id: "inkblot",
    label: "INKBLOT",
    fileName: "INKBLOT.EXE",
    href: null,
    icon: "inkblot",
    place: null,
    rank: "camp_member",
  },
  // The questionnaire runner and its last page. Their gate is camp access,
  // then the member's own required action for that send.
  {
    id: "questionnaire",
    label: "Questionnaire",
    fileName: "FORM.FRM",
    href: null,
    icon: "form",
    place: null,
    rank: "camp_member",
    applicants: true,
  },
];

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
    after: "meetings",
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
    kitchen: ["recipes", "meal-plan", "recipe-review"],
    power_and_lighting: ["power"],
    communications_and_hr: ["announcements", "questionnaires", "join-site"],
    finance: ["payments"],
  };

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
  /** Changes when what the member may open changes; never with live counts. */
  version: string;
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
            return {
              team: m.team,
              label: `${label} team`,
              lead: m.isLead,
              programs: page ? [page, ...tools] : tools,
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
  return { ...body, version: accessVersion(body) };
}

/**
 * The manifest's version changes only when what the member may open changes
 * (a demotion, a new team, the mode), never with live counts. The desktop
 * drops every last-seen copy when it changes, so a new notice or a new health
 * warning must not bump it.
 */
function accessVersion(body: Omit<ProgramManifest, "version">): string {
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
