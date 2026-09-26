import "server-only";

import type { ViewerRank } from "@camp404/types";
import type { ProgramId } from "./program-routes";
import {
  manifestForRank,
  manifestProgramIds,
  teamsInCampOrder,
  type ProgramManifest,
} from "./programs";

/**
 * The console nav (issue #266): a few links, then menus that group the rest.
 * Since the program manifest (404 OS, PR B) it is a VIEW of the manifest: an
 * entry is drawn when the member's manifest holds its program, so the nav and
 * Home can no longer disagree about what a member may open. The rank bars live
 * in one place, lib/programs.ts. The header builds this on the server and hands
 * the client only labels and links.
 *
 * Hiding is never the security boundary. Each page re-checks with
 * `requireMemberPage` or `captainPageGate`.
 */
export interface ConsoleNavEntry {
  href: string;
  label: string;
  /** Drawn when the member's manifest holds this program. */
  program: ProgramId;
}

export type ConsoleNavNode =
  | { kind: "link"; href: string; label: string; program: ProgramId | null }
  | { kind: "group"; label: string; entries: readonly ConsoleNavEntry[] }
  /** The Teams menu: its entries come from camp settings, not from here. */
  | { kind: "teams"; label: string };

export const CONSOLE_NAV: readonly ConsoleNavNode[] = [
  // Every member's own page: their to-dos, what's coming up, their places.
  { kind: "link", href: "/", label: "Home", program: null },
  // The shared task board: every approved member sees every task.
  { kind: "link", href: "/tasks", label: "Tasks", program: "tasks" },
  // The camp calendar, by day, with a team filter; each team's badge opens
  // that team's page. Adding an event stays with captains and leads, and is
  // reached from Home's "Add event" tile.
  { kind: "link", href: "/calendar", label: "Calendar", program: "calendar" },
  // One page per team (the camp's own teams first), from camp settings.
  { kind: "teams", label: "Teams" },
  {
    kind: "group",
    label: "Camp",
    entries: [
      // Every approved member browses the roster; captains get the full triage
      // view (captains/camp-management/page.tsx picks the projection).
      {
        href: "/captains/camp-management",
        label: "Roster",
        program: "roster",
      },
      { href: "/family-tree", label: "Family tree", program: "family-tree" },
      // Meeting notes, every team's and the whole camp's: every member reads
      // them; a team's members and captains write them.
      { href: "/meetings", label: "Meetings", program: "meetings" },
      // The power plan: every member reads the load list and the fuel
      // estimate; Power & Lighting leads and captains edit them. /power sends
      // on to the load list, and the entry stays lit on both pages beneath it.
      { href: "/power", label: "Power", program: "power" },
      // The recipe book: every member reads it and suggests; Kitchen leads and
      // captains review from inside it.
      { href: "/kitchen/recipes", label: "Recipes", program: "recipes" },
    ],
  },
  {
    kind: "group",
    label: "Me",
    entries: [
      { href: "/profile", label: "Profile", program: "account" },
      { href: "/notifications", label: "Notifications", program: "inbox" },
      { href: "/tools/forms", label: "My forms", program: "my-forms" },
      { href: "/tools/invite", label: "Invite", program: "invites" },
      {
        href: "/profile/security",
        label: "Sign-in & security",
        program: "account",
      },
    ],
  },
  {
    kind: "group",
    label: "Captains",
    entries: [
      // The whole camp at a glance, which used to be home (split 2026-09-23).
      {
        href: "/captains/overview",
        label: "Camp overview",
        program: "overview",
      },
      {
        href: "/captains/questionnaires",
        label: "Questionnaires",
        program: "questionnaires",
      },
      {
        href: "/captains/announcements",
        label: "Announcements",
        program: "announcements",
      },
      { href: "/captains/payments", label: "Payments", program: "payments" },
      {
        href: "/captains/camp-settings",
        label: "Camp settings",
        program: "camp-settings",
      },
      // join.camp-404.com's words (owner, 2026-09-25: captains edit them).
      { href: "/captains/join-site", label: "Join site", program: "join-site" },
      { href: "/captains/audit", label: "Audit", program: "audit" },
      { href: "/captains/system", label: "System status", program: "system" },
    ],
  },
];

/** A destination as the client gets it: a label and a link, never the rank. */
export interface NavItem {
  href: string;
  label: string;
}

/**
 * What the client draws. A menu holds one or more sections, split by a rule;
 * only the Teams menu has two (the viewer's own teams, then the rest).
 */
export type NavNode =
  | ({ kind: "link" } & NavItem)
  | { kind: "group"; label: string; sections: NavItem[][] };

/** The Teams menu's entries: the viewer's own teams, then every other one. */
export interface NavTeams {
  mine: NavItem[];
  others: NavItem[];
}

/**
 * The Teams menu, from camp settings: the active teams in the camp's order
 * (pass `activeTeams(config)`, so an archived team is not in it), the viewer's
 * own teams this year first. A key the team page cannot open is left out
 * rather than leading to a 404. The same split the manifest's Teams folder
 * uses (`teamsInCampOrder`).
 */
export function navTeams(
  active: readonly { key: string; label: string }[],
  myTeams: readonly string[],
): NavTeams {
  const { mine, others } = teamsInCampOrder(active, myTeams);
  const item = ({ key, label }: { key: string; label: string }) => ({
    href: `/teams/${key}`,
    label,
  });
  return { mine: mine.map(item), others: others.map(item) };
}

/** The Teams menu from the manifest's Teams folder: its own teams first. */
function navTeamsFromManifest(manifest: ProgramManifest): NavTeams {
  const folder = manifest.folders.find((f) => f.id === "teams");
  const teams = folder?.programs ?? [];
  const item = ({ href, label }: { href: string; label: string }) => ({
    href,
    label,
  });
  return {
    mine: teams.filter((t) => t.mine).map(item),
    others: teams.filter((t) => !t.mine).map(item),
  };
}

/**
 * The nav drawn from a member's manifest: an entry shows when the manifest
 * holds its program, then any menu left empty is dropped. The Teams menu comes
 * from the manifest's Teams folder unless `teams` is passed.
 */
export function consoleNavFromManifest(
  manifest: ProgramManifest,
  teams: NavTeams = navTeamsFromManifest(manifest),
): NavNode[] {
  const has = manifestProgramIds(manifest);
  const shows = (program: ProgramId | null) =>
    program === null || has.has(program);
  const nodes: NavNode[] = [];
  for (const node of CONSOLE_NAV) {
    if (node.kind === "link") {
      if (shows(node.program)) {
        nodes.push({ kind: "link", href: node.href, label: node.label });
      }
      continue;
    }
    const sections =
      node.kind === "teams"
        ? [teams.mine, teams.others]
        : [
            node.entries
              .filter((entry) => shows(entry.program))
              .map(({ href, label }) => ({ href, label })),
          ];
    const drawn = sections.filter((section) => section.length > 0);
    if (drawn.length > 0) {
      nodes.push({ kind: "group", label: node.label, sections: drawn });
    }
  }
  return nodes;
}

/**
 * The nav an approved member of `rank` with no teams would see, in bar order:
 * `consoleNavFromManifest` over `manifestForRank(rank)`.
 */
export function consoleNavFor(
  rank: ViewerRank,
  teams: NavTeams = { mine: [], others: [] },
): NavNode[] {
  return consoleNavFromManifest(manifestForRank(rank), teams);
}

/** Kept here for callers of the old name; it lives in lib/program-routes.ts. */
export { activeNavHref } from "./program-routes";
