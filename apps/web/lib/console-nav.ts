import { hasClearance } from "@camp404/core";
import { Team, type ViewerRank } from "@camp404/types";

/**
 * The console nav (issue #266): a few links, then menus that group the rest.
 * Every entry carries the lowest rank that may open it. The header filters
 * this on the server and hands the client only the entries the viewer may see,
 * and a menu left with no entries is not drawn at all.
 *
 * Hiding is never the security boundary. Each page re-checks with
 * `requireMemberPage` or `captainPageGate`, so an entry must carry the same bar
 * its page guards on, or the nav leads somewhere that refuses.
 */
export interface ConsoleNavEntry {
  href: string;
  label: string;
  rank: ViewerRank;
}

export type ConsoleNavNode =
  | ({ kind: "link" } & ConsoleNavEntry)
  | { kind: "group"; label: string; entries: readonly ConsoleNavEntry[] }
  /** The Teams menu: its entries come from camp settings, not from here. */
  | { kind: "teams"; label: string };

export const CONSOLE_NAV: readonly ConsoleNavNode[] = [
  // Every member's own page: their to-dos, what's coming up, their places.
  { kind: "link", href: "/", label: "Home", rank: "camp_member" },
  // The shared task board: every approved member sees every task.
  { kind: "link", href: "/tasks", label: "Tasks", rank: "camp_member" },
  // The camp calendar, by day, with a team filter; each team's badge opens
  // that team's page. Adding an event stays with captains and leads, and is
  // reached from Home's "Add event" tile.
  { kind: "link", href: "/calendar", label: "Calendar", rank: "camp_member" },
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
        rank: "camp_member",
      },
      { href: "/family-tree", label: "Family tree", rank: "camp_member" },
      // Meeting notes, every team's and the whole camp's: every member reads
      // them; a team's members and captains write them.
      { href: "/meetings", label: "Meetings", rank: "camp_member" },
      // The power plan: every member reads the load list and the fuel
      // estimate; Power & Lighting leads and captains edit them. /power sends
      // on to the load list, and the entry stays lit on both pages beneath it.
      { href: "/power", label: "Power", rank: "camp_member" },
      // The recipe book: every member reads it and suggests; Kitchen leads and
      // captains review from inside it.
      { href: "/kitchen/recipes", label: "Recipes", rank: "camp_member" },
    ],
  },
  {
    kind: "group",
    label: "Me",
    entries: [
      { href: "/profile", label: "Profile", rank: "camp_member" },
      { href: "/notifications", label: "Notifications", rank: "camp_member" },
      { href: "/tools/forms", label: "My forms", rank: "camp_member" },
      { href: "/tools/invite", label: "Invite", rank: "camp_member" },
      {
        href: "/profile/security",
        label: "Sign-in & security",
        rank: "camp_member",
      },
    ],
  },
  {
    kind: "group",
    label: "Captains",
    entries: [
      // The whole camp at a glance, which used to be home (split 2026-09-23).
      { href: "/captains/overview", label: "Camp overview", rank: "captain" },
      {
        href: "/captains/questionnaires",
        label: "Questionnaires",
        rank: "team_lead",
      },
      {
        href: "/captains/announcements",
        label: "Announcements",
        rank: "team_lead",
      },
      { href: "/captains/payments", label: "Payments", rank: "captain" },
      {
        href: "/captains/camp-settings",
        label: "Camp settings",
        rank: "captain",
      },
      { href: "/captains/audit", label: "Audit", rank: "captain" },
      { href: "/captains/system", label: "System status", rank: "captain" },
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
 * rather than leading to a 404.
 */
export function navTeams(
  active: readonly { key: string; label: string }[],
  myTeams: readonly string[],
): NavTeams {
  const items = active
    .filter((t) => Team.safeParse(t.key).success)
    .map((t) => ({ key: t.key, href: `/teams/${t.key}`, label: t.label }));
  const strip = ({ href, label }: { href: string; label: string }) => ({
    href,
    label,
  });
  return {
    mine: items.filter((t) => myTeams.includes(t.key)).map(strip),
    others: items.filter((t) => !myTeams.includes(t.key)).map(strip),
  };
}

/**
 * The nav a viewer of `rank` may see, in bar order. Entries above the viewer's
 * rank are dropped, then any menu left empty.
 */
export function consoleNavFor(
  rank: ViewerRank,
  teams: NavTeams = { mine: [], others: [] },
): NavNode[] {
  const nodes: NavNode[] = [];
  for (const node of CONSOLE_NAV) {
    if (node.kind === "link") {
      if (hasClearance(rank, node.rank)) {
        nodes.push({ kind: "link", href: node.href, label: node.label });
      }
      continue;
    }
    const sections =
      node.kind === "teams"
        ? [teams.mine, teams.others]
        : [
            node.entries
              .filter((entry) => hasClearance(rank, entry.rank))
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
 * The entry the current page belongs to: the one whose link is the longest
 * match, so /profile/security lights "Sign-in & security" and not "Profile".
 * Home matches only itself.
 */
export function activeNavHref(
  pathname: string,
  hrefs: readonly string[],
): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const matches =
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
