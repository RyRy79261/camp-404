// Which 404 OS program a console URL opens, for the browser as much as the
// server (docs/specs/2026-09-25-404-os-console-design.md, section 3).
//
// The desktop (PR C) imports this, so it is shipped to every browser. It must
// therefore say nothing about who may open what: it imports no rank, no
// predicate, and nothing from lib/programs.ts or lib/program-manifest.ts
// (lib/__tests__/program-routes.test.ts reads its imports and fails if it
// does). What a browser can learn from it is the map of console paths to
// generic file names, captain paths included, which the paths themselves
// already say. The file names are never data: a meeting is `MEETING.TXT`, not
// its title.
//
// Every `page.tsx` under `app/(console)` has a row here, and every row has a
// page (the same test). The two CSV exports under `(console)` are route
// handlers, not windows, so they match nothing.

/** Every program a console URL can open. */
export type ProgramId =
  | "desktop"
  | "inbox"
  | "announcement"
  | "account"
  | "my-forms"
  | "form"
  | "form-answers"
  | "invites"
  | "my-lift"
  | "tasks"
  | "calendar"
  | "team"
  | "roster"
  | "family-tree"
  | "meetings"
  | "meeting"
  | "new-meeting"
  | "edit-meeting"
  | "power"
  | "recipes"
  | "new-recipe"
  | "recipe-review"
  | "recipe"
  | "edit-recipe"
  | "recipe-version"
  | "recipe-source"
  | "meal-plan"
  | "questionnaires"
  | "edit-questionnaire"
  | "preview-questionnaire"
  | "send-questionnaire"
  | "results"
  | "respondent-answers"
  | "announcements"
  | "new-event"
  | "overview"
  | "payments"
  | "camp-settings"
  | "join-site"
  | "audit"
  | "system"
  | "terminal"
  | "inkblot"
  | "questionnaire";

/**
 * Each program's plain name (owner, 2026-09-25: "some of the terminology
 * might be a bit too geeky"), for a window's title bar and its taskbar
 * button. The same words as the registry's labels in lib/programs.ts
 * (lib/__tests__/program-routes.test.ts keeps the two equal), repeated here
 * because this module ships to the browser and the registry never does. A
 * team's window is titled with the team's own name, which the desktop has
 * from the member's manifest.
 */
export const PROGRAM_TITLES: Readonly<Record<ProgramId, string>> = {
  desktop: "Desktop",
  inbox: "Inbox",
  announcement: "Announcement",
  account: "My account",
  "my-forms": "My forms",
  form: "Form",
  "form-answers": "Answers",
  invites: "Invites",
  "my-lift": "My lift",
  tasks: "Tasks",
  calendar: "Calendar",
  team: "Team",
  roster: "Roster",
  "family-tree": "Family tree",
  meetings: "Meetings",
  meeting: "Meeting",
  "new-meeting": "New meeting",
  "edit-meeting": "Edit meeting",
  power: "Power",
  recipes: "Recipes",
  "new-recipe": "New recipe",
  "recipe-review": "Recipe review",
  recipe: "Recipe",
  "edit-recipe": "Edit recipe",
  "recipe-version": "Recipe version",
  "recipe-source": "Recipe source",
  "meal-plan": "Meal plan",
  questionnaires: "Questionnaires",
  "edit-questionnaire": "Edit questionnaire",
  "preview-questionnaire": "Preview",
  "send-questionnaire": "Send questionnaire",
  results: "Results",
  "respondent-answers": "Answers",
  announcements: "Announcements",
  "new-event": "New event",
  overview: "Camp overview",
  payments: "Payments",
  "camp-settings": "Camp settings",
  "join-site": "Join site",
  audit: "Audit log",
  system: "System status",
  terminal: "Terminal",
  inkblot: "INKBLOT",
  questionnaire: "Questionnaire",
};

export interface ProgramRoute {
  /** The route as its folder names it: `/meetings/[id]/edit`. */
  pattern: string;
  programId: ProgramId;
  /**
   * The window this URL focuses. Sub-pages of one program share it
   * (`/profile/security` is the My account window); documents get their own
   * (`meeting:<id>`). Query strings never change it.
   */
  instance: (params: readonly string[]) => string;
  /** The generic file name for a title bar, the Terminal and `?next=`. */
  genericTitle: string;
}

export interface ProgramMatch {
  programId: ProgramId;
  instanceKey: string;
  genericTitle: string;
}

const single = (id: ProgramId) => (): string => id;
const keyed =
  (id: ProgramId) =>
  (params: readonly string[]): string =>
    [id, ...params].join(":");

function route(
  pattern: string,
  programId: ProgramId,
  genericTitle: string,
  instance: ProgramRoute["instance"] = single(programId),
): ProgramRoute {
  return { pattern, programId, instance, genericTitle };
}

/**
 * Every console page, as a program. The first row that matches wins, so a
 * static segment (`/meetings/new`) is listed before the dynamic one beside it
 * (`/meetings/[id]`).
 */
export const PROGRAM_ROUTES: readonly ProgramRoute[] = [
  // The desktop itself, and the two old hubs that now send there.
  route("/", "desktop", "DESKTOP"),
  route("/tools", "desktop", "DESKTOP"),
  route("/captains/tools", "desktop", "DESKTOP"),

  // Me
  route("/notifications", "inbox", "INBOX.EXE"),
  route(
    "/announcements/[id]",
    "announcement",
    "ANNOUNCE.TXT",
    keyed("announcement"),
  ),
  route("/profile", "account", "MY_ACCOUNT.CPL"),
  route("/profile/edit", "account", "MY_ACCOUNT.CPL"),
  route("/profile/security", "account", "MY_ACCOUNT.CPL"),
  route("/tools/forms", "my-forms", "MYFORMS.EXE"),
  route(
    "/tools/forms/answers/[key]/[cycle]",
    "form-answers",
    "ANSWERS.TXT",
    keyed("form-answers"),
  ),
  route("/tools/forms/[key]", "form", "FORM.DOC", keyed("form")),
  route("/tools/invite", "invites", "KEYGEN.EXE"),
  route("/lift", "my-lift", "MY_LIFT.EXE"),

  // Camp
  route("/tasks", "tasks", "TASKS.EXE"),
  route("/calendar", "calendar", "CALENDAR.EXE"),
  route("/teams/[key]", "team", "TEAM.EXE", keyed("team")),
  route("/captains/camp-management", "roster", "ROSTER.DB"),
  route("/family-tree", "family-tree", "LINEAGE.EXE"),
  route("/meetings", "meetings", "MINUTES.EXE"),
  route("/meetings/new", "new-meeting", "NEWMEET.TXT"),
  route("/meetings/[id]", "meeting", "MEETING.TXT", keyed("meeting")),
  route(
    "/meetings/[id]/edit",
    "edit-meeting",
    "MEETING.TXT",
    keyed("edit-meeting"),
  ),
  route("/power", "power", "POWER.EXE"),
  route("/power/loads", "power", "POWER.EXE"),
  route("/power/fuel", "power", "POWER.EXE"),

  // Kitchen
  route("/kitchen/recipes", "recipes", "COOKBOOK.EXE"),
  route("/kitchen/recipes/new", "new-recipe", "IMPORT.EXE"),
  route("/kitchen/recipes/review", "recipe-review", "REVIEW.EXE"),
  route("/kitchen/recipes/[id]", "recipe", "RECIPE.RCP", keyed("recipe")),
  route(
    "/kitchen/recipes/[id]/edit",
    "edit-recipe",
    "RECIPE.WRI",
    keyed("edit-recipe"),
  ),
  route(
    "/kitchen/recipes/[id]/versions/[version]",
    "recipe-version",
    "RECIPE.VER",
    keyed("recipe-version"),
  ),
  route(
    "/kitchen/recipes/[id]/sources/[version]",
    "recipe-source",
    "SOURCE.TXT",
    keyed("recipe-source"),
  ),
  route("/kitchen/meal-plan", "meal-plan", "MEALPLAN.XLS"),

  // Captains and leads
  route("/captains/questionnaires", "questionnaires", "FORMS.EXE"),
  route(
    "/captains/questionnaires/[key]",
    "edit-questionnaire",
    "QBUILD.EXE",
    keyed("edit-questionnaire"),
  ),
  route(
    "/captains/questionnaires/[key]/preview",
    "preview-questionnaire",
    "QVIEW.EXE",
    keyed("preview-questionnaire"),
  ),
  route(
    "/captains/questionnaires/[key]/send",
    "send-questionnaire",
    "QSEND.EXE",
    keyed("send-questionnaire"),
  ),
  // Summary and Individual are two tabs of one Results window.
  route(
    "/captains/questionnaires/[key]/metrics",
    "results",
    "QSTATS.EXE",
    keyed("results"),
  ),
  route(
    "/captains/questionnaires/[key]/responses",
    "results",
    "QSTATS.EXE",
    keyed("results"),
  ),
  route(
    "/captains/questionnaires/[key]/responses/[userId]",
    "respondent-answers",
    "ANSWERS.TXT",
    keyed("respondent-answers"),
  ),
  route("/captains/announcements", "announcements", "BROADCAST.EXE"),
  route("/captains/calendar", "new-event", "NEWEVENT.EXE"),
  route("/captains/overview", "overview", "CAMPSTAT.EXE"),
  route("/captains/payments", "payments", "LEDGER.DB"),
  route("/captains/camp-settings", "camp-settings", "SETTINGS.CPL"),
  route("/captains/camp-settings/cycle", "camp-settings", "SETTINGS.CPL"),
  route("/captains/join-site", "join-site", "JOINSITE.EXE"),
  route("/captains/audit", "audit", "AUDIT.LOG"),
  route("/captains/system", "system", "SYSMON.EXE"),

  // The Terminal, and the game it opens (its own window, a child).
  route("/terminal", "terminal", "TERMINAL.EXE"),
  route("/terminal/inkblot", "inkblot", "INKBLOT.EXE"),

  // The questionnaire runner and its last page share a window.
  route(
    "/questionnaires/[activationId]",
    "questionnaire",
    "FORM.FRM",
    keyed("questionnaire"),
  ),
  route(
    "/questionnaires/[activationId]/complete",
    "questionnaire",
    "FORM.FRM",
    keyed("questionnaire"),
  ),
];

/**
 * Route handlers under `(console)`: files, not windows. Checked before the
 * pages, because `/responses/export` would otherwise match
 * `/responses/[userId]` with a user id of "export".
 */
export const CONSOLE_ROUTE_HANDLERS: readonly string[] = [
  "/captains/camp-management/export",
  "/captains/questionnaires/[key]/responses/export",
];

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** The params a pattern captures from `parts`, or null when it does not match. */
function capture(pattern: string, parts: readonly string[]): string[] | null {
  const want = segments(pattern);
  if (want.length !== parts.length) return null;
  const params: string[] = [];
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const got = parts[i]!;
    if (w.startsWith("[") && w.endsWith("]")) params.push(got);
    else if (w !== got) return null;
  }
  return params;
}

/**
 * The program a console path opens, or null for a path that is not a console
 * window (a route handler, `/auth/*`, `/api/*`, a gate page outside the
 * console, or no page at all). Takes a pathname; a query string or hash on it
 * is ignored.
 */
export function matchProgram(pathname: string): ProgramMatch | null {
  let path = pathname.split(/[?#]/, 1)[0] ?? "";
  if (!path.startsWith("/")) return null;
  // One trailing slash is the same page; an empty segment anywhere else
  // ("//evil.example") is not a console path at all.
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.includes("//")) return null;
  let parts: string[];
  try {
    parts = segments(path).map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.includes("/")))
    return null;
  for (const handler of CONSOLE_ROUTE_HANDLERS) {
    if (capture(handler, parts)) return null;
  }
  for (const r of PROGRAM_ROUTES) {
    const params = capture(r.pattern, parts);
    if (params) {
      return {
        programId: r.programId,
        instanceKey: r.instance(params),
        genericTitle: r.genericTitle,
      };
    }
  }
  return null;
}
