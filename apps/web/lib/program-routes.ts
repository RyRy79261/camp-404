// Every 404 OS program as the browser may know it, and which program a console
// URL opens (docs/specs/2026-09-25-404-os-console-design.md, section 3). Each
// program is ONE definition below: its plain name, its file name, its pages,
// its drawing and its window's opening size. The titles, the routes, the
// registry's labels, file names and links (lib/programs.ts) and the desktop's
// sizes and drawings are all read from it, never written twice.
//
// The desktop (PR C) imports this, so it is shipped to every browser. It must
// therefore say nothing about who may open what: it imports no rank, no
// predicate, and nothing from lib/programs.ts or lib/program-manifest.ts
// (lib/__tests__/program-routes.test.ts reads its imports and fails if it
// does). What a browser can learn from it is the map of console paths to
// plain names, generic file names and window sizes, captain paths included,
// which the paths themselves already say. The file names are never data: a
// meeting is `MINUTES.TXT`, not its title.
//
// Every `page.tsx` under `app/(console)` is a route of one program here, and
// every route has a page (the same test). The two CSV exports under
// `(console)` are route handlers, not windows, so they match nothing.

/**
 * A window's opening size, before the member resizes it: `w` and `h` are the
 * prototype's (_proto/programs.ts, its S, M, L and XL, approved with the
 * prototype on 2026-09-26), the size it opens at on the 1280 px screen it was
 * drawn for. A page whose UI is a table, a board or two columns side by side
 * also `grow`s with a bigger screen (owner, 2026-10-08: "there are a few apps
 * that open smaller than their UI even though there's ample space"): it takes
 * that share of the room right of the icons, never less than its own size.
 * Still a window right of the icons, never full screen. Each is cut to the
 * room the screen has (`pageSize` in components/os/desktop-shell.tsx), and its
 * page reflows to the window (the page-* variants). No size is M, the default.
 */
export type OpeningSize = { w: number; h: number; grow?: number };
const XL_SIZE: OpeningSize = { w: 1040, h: 660, grow: 0.8 };
/** A page that reads or fills in one column: it keeps its size. */
const L_SIZE: OpeningSize = { w: 880, h: 600 };
/** A table, a board or two columns at L: it grows like XL, less far. */
const L_WIDE: OpeningSize = { w: 880, h: 600, grow: 0.7 };
const WRITE_SIZE: OpeningSize = { w: 1120, h: 800, grow: 0.9 };

/**
 * One program, as every browser may know it: the program definition. What it
 * never says is who may open it; that is its registry entry's gate, in
 * lib/programs.ts, which stays on the server.
 */
export interface ProgramDefinition {
  /**
   * Its plain name (owner, 2026-09-25: "some of the terminology might be a
   * bit too geeky"), for its icon, the Start menu, a window's title bar and
   * its taskbar button. A team's window is titled with the team's own name,
   * which the desktop has from the member's manifest.
   */
  title: string;
  /** The generic file name for a title bar, the Terminal and `?next=`. */
  file: string;
  /**
   * Every console page that opens it, as its folder names it
   * (`/calendar/[eventId]/minutes`). The first is where its icon opens. A
   * pair names the window that page opens instead of the program's own.
   */
  routes: readonly (string | readonly [pattern: string, instance: string])[];
  /**
   * Each URL is a document in a window of its own (`minutes:<id>`), keyed by
   * the route's params. Otherwise its sub-pages share one window
   * (`/profile/security` is the My account window). Query strings never
   * change it.
   */
  keyed?: true;
  /** Its line drawing: a key of components/os/line-icons.tsx. */
  line: string;
  /** Its window's opening size; none is M, the default. */
  size?: OpeningSize;
}

/**
 * Every program a console URL can open. A new page is a route on its
 * program here (and a new program a definition here and an entry in
 * PROGRAM_REGISTRY in lib/programs.ts); lib/__tests__/program-routes.test.ts
 * fails until every page has one.
 */
export const PROGRAM_DEFINITIONS = {
  // The desktop itself, and the two old hubs that now send there.
  desktop: {
    title: "Desktop",
    file: "DESKTOP",
    routes: ["/", "/tools", "/captains/tools"],
    line: "folder",
  },

  // Me
  inbox: {
    title: "Inbox",
    file: "INBOX.EXE",
    routes: ["/notifications"],
    line: "inbox",
  },
  announcement: {
    title: "Announcement",
    file: "ANNOUNCE.TXT",
    routes: ["/announcements/[id]"],
    keyed: true,
    line: "broadcast",
  },
  account: {
    title: "My account",
    file: "MY_ACCOUNT.CPL",
    routes: [
      "/profile",
      "/profile/edit",
      "/profile/security",
      "/profile/display",
    ],
    line: "account",
  },
  "my-forms": {
    title: "My forms",
    file: "MYFORMS.EXE",
    routes: ["/tools/forms"],
    line: "myforms",
  },
  form: {
    title: "Form",
    file: "FORM.DOC",
    // The dietary pick-list (#245) is a form of its own.
    routes: [["/tools/forms/dietary", "form:dietary"], "/tools/forms/[key]"],
    keyed: true,
    line: "myforms",
  },
  "form-answers": {
    title: "Answers",
    file: "ANSWERS.TXT",
    routes: ["/tools/forms/answers/[key]/[cycle]"],
    keyed: true,
    line: "myforms",
  },
  invites: {
    title: "Invites",
    file: "KEYGEN.EXE",
    routes: ["/tools/invite"],
    line: "keygen",
  },
  "my-lift": {
    title: "My lift",
    file: "MY_LIFT.EXE",
    routes: ["/lift"],
    line: "lift",
  },
  "my-dues": {
    title: "My dues",
    file: "MY_DUES.TXT",
    routes: ["/dues"],
    line: "ledger",
    size: L_SIZE,
  },
  "my-gear": {
    title: "My gear",
    file: "MY_GEAR.TXT",
    routes: ["/gear"],
    line: "tent",
    size: L_SIZE,
  },
  "my-shifts": {
    title: "My shifts",
    file: "MY_SHIFTS.TXT",
    routes: ["/shifts/mine"],
    line: "shifts",
    size: L_SIZE,
  },
  "my-claims": {
    title: "My claims",
    file: "CLAIMS.TXT",
    routes: ["/claims"],
    line: "receipt",
    size: L_WIDE,
  },

  // Camp
  tasks: {
    title: "Tasks",
    file: "TASKS.EXE",
    routes: ["/tasks"],
    line: "tasks",
    size: XL_SIZE,
  },
  // The Calendar (owner, 2026-10-10: meetings are a type of event in it). The
  // Meetings program went away and events are added here now, so the old
  // addresses, which send to the Calendar, open its window. It opens on the
  // month with the open event beside it (the approved mock-up).
  calendar: {
    title: "Calendar",
    file: "CALENDAR.EXE",
    routes: [
      "/calendar",
      "/meetings",
      "/meetings/new",
      "/meetings/[id]",
      "/meetings/[id]/edit",
      "/captains/calendar",
    ],
    line: "calendar",
    size: WRITE_SIZE,
  },
  // A team's page opens wide enough for its cards and its people side by side
  // (audit, 2026-10-01: at M it was seven cards in one column).
  team: {
    title: "Team",
    file: "TEAM.EXE",
    routes: ["/teams/[key]"],
    keyed: true,
    line: "folder",
    size: XL_SIZE,
  },
  budgets: {
    title: "Budgets",
    file: "BUDGETS.XLS",
    routes: ["/teams/budgets"],
    line: "ledger",
    size: L_WIDE,
  },
  roster: {
    title: "Roster",
    file: "ROSTER.DB",
    routes: ["/captains/camp-management"],
    line: "roster",
    size: XL_SIZE,
  },
  "family-tree": {
    title: "Family tree",
    file: "LINEAGE.EXE",
    routes: ["/family-tree"],
    line: "lineage",
  },
  pets: { title: "Camp pets", file: "PETS.DB", routes: ["/pets"], line: "cat" },
  // About reads in three columns (approved redesign, 2026-10-01; audit: at
  // 720 wide it was one column 13 screens long).
  about: {
    title: "About Camp 404",
    file: "README.TXT",
    routes: ["/about"],
    line: "readme",
    size: { w: 1040, h: 800 },
  },
  // The Survival Guide (#250): its contents, then each chapter in its own
  // window.
  guide: {
    title: "Survival Guide",
    file: "GUIDE.HLP",
    routes: ["/guide"],
    line: "guide",
    size: L_SIZE,
  },
  "guide-chapter": {
    title: "Chapter",
    file: "CHAPTER.HLP",
    routes: ["/guide/[slug]"],
    keyed: true,
    line: "guide",
    size: L_SIZE,
  },
  "guide-version": {
    title: "Chapter version",
    file: "CHAPTER.VER",
    routes: ["/guide/[slug]/versions/[version]"],
    keyed: true,
    line: "guide",
    size: L_SIZE,
  },
  // The guide's editor: writing and its preview side by side, as tall as the
  // screen allows.
  "new-guide-chapter": {
    title: "New chapter",
    file: "CHAPTER.WRI",
    routes: ["/guide/new"],
    line: "guide",
    size: WRITE_SIZE,
  },
  "edit-guide-chapter": {
    title: "Edit chapter",
    file: "CHAPTER.WRI",
    routes: ["/guide/[slug]/edit"],
    keyed: true,
    line: "guide",
    size: WRITE_SIZE,
  },
  // A meeting's minutes, a window per meeting: the editor writes its agenda
  // and notes beside their previews.
  minutes: {
    title: "Minutes",
    file: "MINUTES.TXT",
    routes: ["/calendar/[eventId]/minutes"],
    keyed: true,
    line: "minutes",
    size: L_WIDE,
  },
  power: {
    title: "Power",
    file: "POWER.EXE",
    routes: [
      "/power",
      "/power/loads",
      "/power/fuel",
      "/power/refuelling",
      "/power/grid",
      "/power/readiness",
      "/power/sharing",
    ],
    line: "power",
    size: L_WIDE,
  },
  logistics: {
    title: "Logistics",
    file: "LOGISTICS.EXE",
    routes: ["/logistics"],
    line: "logistics",
    size: L_WIDE,
  },
  shifts: {
    title: "Shifts",
    file: "ROSTER.EXE",
    routes: ["/shifts"],
    line: "shifts",
    size: L_WIDE,
  },
  "help-wanted": {
    title: "Help wanted",
    file: "HELPWANT.TXT",
    routes: ["/help-wanted"],
    line: "helpwanted",
    size: L_WIDE,
  },
  // The site plan opens wide enough for the plan, its key and the rail side
  // by side, the whole plot in view (the approved redesign, 2026-10-01).
  "camp-layout": {
    title: "Camp layout",
    file: "SITEPLAN.DWG",
    routes: ["/camp-layout"],
    line: "siteplan",
    size: WRITE_SIZE,
  },
  // The offers table and the one-day programme (redesign A, 2026-10-01) are
  // drawn for a wide window.
  lounge: {
    title: "Lounge",
    file: "LOUNGE.EXE",
    routes: ["/lounge"],
    line: "lounge",
    size: XL_SIZE,
  },
  // The inventory's four views and each item's page share one window: an
  // item opens inside it, with a link back (owner's pick, 2026-10-01), so
  // opening items never stacks windows titled "Item".
  inventory: {
    title: "Inventory",
    file: "INVENTRY.DB",
    routes: [
      "/inventory",
      "/inventory/needs",
      "/inventory/bookings",
      "/inventory/lent",
      "/inventory/[id]",
    ],
    line: "inventory",
    size: XL_SIZE,
  },
  transport: {
    title: "Transport",
    file: "CARPOOL.EXE",
    routes: ["/transport"],
    line: "lift",
    size: L_WIDE,
  },

  // Kitchen
  recipes: {
    title: "Recipes",
    file: "COOKBOOK.EXE",
    routes: ["/kitchen/recipes"],
    line: "cookbook",
    size: L_WIDE,
  },
  "new-recipe": {
    title: "New recipe",
    file: "IMPORT.EXE",
    routes: ["/kitchen/recipes/new"],
    line: "cookbook",
  },
  "recipe-review": {
    title: "Recipe review",
    file: "REVIEW.EXE",
    routes: ["/kitchen/recipes/review"],
    line: "review",
    size: L_WIDE,
  },
  recipe: {
    title: "Recipe",
    file: "RECIPE.RCP",
    routes: ["/kitchen/recipes/[id]"],
    keyed: true,
    line: "cookbook",
    size: L_SIZE,
  },
  "edit-recipe": {
    title: "Edit recipe",
    file: "RECIPE.WRI",
    routes: ["/kitchen/recipes/[id]/edit"],
    keyed: true,
    line: "cookbook",
    size: XL_SIZE,
  },
  "recipe-version": {
    title: "Recipe version",
    file: "RECIPE.VER",
    routes: ["/kitchen/recipes/[id]/versions/[version]"],
    keyed: true,
    line: "cookbook",
  },
  "recipe-source": {
    title: "Recipe source",
    file: "SOURCE.TXT",
    routes: ["/kitchen/recipes/[id]/sources/[version]"],
    keyed: true,
    line: "cookbook",
  },
  "meal-plan": {
    title: "Meal plan",
    file: "MEALPLAN.XLS",
    routes: ["/kitchen/meal-plan"],
    line: "mealplan",
    size: XL_SIZE,
  },
  "shopping-list": {
    title: "Shopping list",
    file: "SHOPPING.LST",
    routes: ["/kitchen/shopping"],
    line: "basket",
    size: L_WIDE,
  },

  // Captains and leads
  questionnaires: {
    title: "Questionnaires",
    file: "FORMS.EXE",
    routes: ["/captains/questionnaires"],
    line: "forms",
    size: L_WIDE,
  },
  "edit-questionnaire": {
    title: "Edit questionnaire",
    file: "QBUILD.EXE",
    routes: ["/captains/questionnaires/[key]"],
    keyed: true,
    line: "forms",
    size: XL_SIZE,
  },
  "preview-questionnaire": {
    title: "Preview",
    file: "QVIEW.EXE",
    routes: ["/captains/questionnaires/[key]/preview"],
    keyed: true,
    line: "forms",
  },
  "send-questionnaire": {
    title: "Send questionnaire",
    file: "QSEND.EXE",
    routes: ["/captains/questionnaires/[key]/send"],
    keyed: true,
    line: "forms",
  },
  // Summary and Individual are two tabs of one Results window.
  results: {
    title: "Results",
    file: "QSTATS.EXE",
    routes: [
      "/captains/questionnaires/[key]/metrics",
      "/captains/questionnaires/[key]/responses",
    ],
    keyed: true,
    line: "forms",
    size: XL_SIZE,
  },
  "respondent-answers": {
    title: "Answers",
    file: "ANSWERS.TXT",
    routes: ["/captains/questionnaires/[key]/responses/[userId]"],
    keyed: true,
    line: "forms",
    size: XL_SIZE,
  },
  announcements: {
    title: "Announcements",
    file: "BROADCAST.EXE",
    routes: ["/captains/announcements"],
    line: "broadcast",
    size: L_WIDE,
  },
  overview: {
    title: "Camp overview",
    file: "CAMPSTAT.EXE",
    routes: ["/captains/overview"],
    line: "campstat",
    size: L_WIDE,
  },
  // A spreadsheet: as wide as the screen allows, and it scrolls sideways
  // inside its own frame past that.
  "camp-sheet": {
    title: "Camp sheet",
    file: "CAMP_SHEET.XLS",
    routes: ["/captains/camp-sheet"],
    line: "ledger",
    size: WRITE_SIZE,
  },
  applications: {
    title: "Applications",
    file: "INTAKE.DB",
    routes: ["/captains/applications"],
    line: "tickets",
    size: XL_SIZE,
  },
  "claim-approvals": {
    title: "Claims to approve",
    file: "APPROVE.EXE",
    routes: ["/captains/claims"],
    line: "receipt",
    size: L_WIDE,
  },
  payments: {
    title: "Payments",
    file: "LEDGER.DB",
    routes: [
      "/captains/payments",
      "/captains/payments/members",
      "/captains/payments/claims",
      "/captains/payments/budgets",
      "/captains/payments/members/[userId]",
      "/captains/payments/import",
      "/captains/payments/settle-up",
      "/captains/payments/settings",
    ],
    line: "ledger",
    size: XL_SIZE,
  },
  // Gear rental's three views and a member's order share one window.
  "gear-rental": {
    title: "Gear rental",
    file: "RENTAL.DB",
    routes: [
      "/captains/gear-rental",
      "/captains/gear-rental/summary",
      "/captains/gear-rental/catalogue",
      "/captains/gear-rental/orders/[userId]",
    ],
    line: "tent",
    size: XL_SIZE,
  },
  "camp-settings": {
    title: "Camp settings",
    file: "SETTINGS.CPL",
    routes: ["/captains/camp-settings", "/captains/camp-settings/cycle"],
    line: "settings",
  },
  // The Join site editor shows its section list beside the open section,
  // Write beside Preview (approved redesign, 2026-10-01).
  "join-site": {
    title: "Join site",
    file: "JOINSITE.EXE",
    routes: ["/captains/join-site"],
    line: "joinsite",
    size: WRITE_SIZE,
  },
  audit: {
    title: "Audit log",
    file: "AUDIT.LOG",
    routes: ["/captains/audit"],
    line: "audit",
    size: L_WIDE,
  },
  "report-screenshots": {
    title: "Report screenshots",
    file: "SCREENSHOTS.EXE",
    routes: ["/captains/report-screenshots"],
    line: "review",
    size: L_WIDE,
  },
  system: {
    title: "System status",
    file: "SYSMON.EXE",
    routes: ["/captains/system"],
    line: "sysmon",
  },

  // The Terminal, and the game it opens (its own window, a child).
  terminal: {
    title: "Terminal",
    file: "TERMINAL.EXE",
    routes: ["/terminal"],
    line: "terminal",
    size: { w: 640, h: 420 },
  },
  inkblot: {
    title: "INKBLOT",
    file: "INKBLOT.EXE",
    routes: ["/terminal/inkblot"],
    line: "cat",
    size: { w: 700, h: 440 },
  },

  // The questionnaire runner and its last page share a window.
  questionnaire: {
    title: "Questionnaire",
    file: "FORM.FRM",
    routes: [
      "/questionnaires/[activationId]",
      "/questionnaires/[activationId]/complete",
    ],
    keyed: true,
    line: "myforms",
  },
} as const satisfies Record<string, ProgramDefinition>;

/** Every program a console URL can open. */
export type ProgramId = keyof typeof PROGRAM_DEFINITIONS;

const PROGRAM_IDS = Object.keys(PROGRAM_DEFINITIONS) as ProgramId[];

/** One program's definition, typed as the interface says. */
export function programDefinition(id: ProgramId): ProgramDefinition {
  return PROGRAM_DEFINITIONS[id];
}

/** Each program's plain name, from its definition. */
export const PROGRAM_TITLES: Readonly<Record<ProgramId, string>> =
  Object.fromEntries(
    PROGRAM_IDS.map((id) => [id, PROGRAM_DEFINITIONS[id].title]),
  ) as Record<ProgramId, string>;

/** Where a program's icon opens: the first of its routes. */
export function programHome(id: ProgramId): string {
  const first = programDefinition(id).routes[0]!;
  return typeof first === "string" ? first : first[0];
}

/** A window's opening size for a program id, if it has its own. */
export function programSize(program: string): OpeningSize | undefined {
  return Object.hasOwn(PROGRAM_DEFINITIONS, program)
    ? programDefinition(program as ProgramId).size
    : undefined;
}

export interface ProgramRoute {
  /** The route as its folder names it: `/calendar/[eventId]/minutes`. */
  pattern: string;
  programId: ProgramId;
  /** The window this URL focuses, from the params the pattern captures. */
  instance: (params: readonly string[]) => string;
  /** The generic file name for a title bar, the Terminal and `?next=`. */
  genericTitle: string;
}

export interface ProgramMatch {
  programId: ProgramId;
  instanceKey: string;
  genericTitle: string;
}

function segments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

const isParam = (segment: string) =>
  segment.startsWith("[") && segment.endsWith("]");

/**
 * Which of two patterns is tried first: at the first segment they differ in,
 * a static one (`/guide/new`) before the dynamic one beside it
 * (`/guide/[slug]`). Two patterns of different lengths never match the same
 * path, so their order only has to be stable.
 */
function bySpecificity(a: string, b: string): number {
  const x = segments(a);
  const y = segments(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const dx = isParam(x[i]!);
    const dy = isParam(y[i]!);
    if (dx !== dy) return dx ? 1 : -1;
    return x[i]! < y[i]! ? -1 : 1;
  }
  return x.length - y.length;
}

/** Every console page, as a program, a static segment before a dynamic one. */
export const PROGRAM_ROUTES: readonly ProgramRoute[] = PROGRAM_IDS.flatMap(
  (programId) => {
    const def = programDefinition(programId);
    return def.routes.map((r): ProgramRoute => {
      const [pattern, fixed] = typeof r === "string" ? [r, undefined] : r;
      return {
        pattern,
        programId,
        genericTitle: def.file,
        instance: fixed
          ? () => fixed
          : def.keyed
            ? (params) => [programId, ...params].join(":")
            : () => programId,
      };
    });
  },
).sort((a, b) => bySpecificity(a.pattern, b.pattern));

/**
 * Route handlers under `(console)`: files, not windows. Checked before the
 * pages, because `/responses/export` would otherwise match
 * `/responses/[userId]` with a user id of "export".
 */
export const CONSOLE_ROUTE_HANDLERS: readonly string[] = [
  "/captains/camp-management/export",
  "/captains/questionnaires/[key]/responses/export",
];

/** The params a pattern captures from `parts`, or null when it does not match. */
function capture(pattern: string, parts: readonly string[]): string[] | null {
  const want = segments(pattern);
  if (want.length !== parts.length) return null;
  const params: string[] = [];
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    const got = parts[i]!;
    if (isParam(w)) params.push(got);
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
