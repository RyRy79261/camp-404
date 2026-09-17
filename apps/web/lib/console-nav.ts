import { hasClearance } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";

/**
 * The console nav bar: every destination a signed-in member can reach, each
 * with the lowest rank that may open it. The header filters this on the server
 * and hands the client only the entries the viewer may see.
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

export const CONSOLE_NAV: readonly ConsoleNavEntry[] = [
  { href: "/", label: "Overview", rank: "camp_member" },
  // Every approved member browses the roster; captains get the full triage
  // view (captains/camp-management/page.tsx picks the projection).
  { href: "/captains/camp-management", label: "Roster", rank: "camp_member" },
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
  { href: "/captains/camp-settings", label: "Camp settings", rank: "captain" },
  { href: "/captains/audit", label: "Audit", rank: "captain" },
  { href: "/tools/forms", label: "My forms", rank: "camp_member" },
  { href: "/family-tree", label: "Family tree", rank: "camp_member" },
  { href: "/tools/invite", label: "Invite", rank: "camp_member" },
];

/** The nav entries a viewer of `rank` may see, in bar order. */
export function consoleNavFor(
  rank: ViewerRank,
): { href: string; label: string }[] {
  return CONSOLE_NAV.filter((entry) => hasClearance(rank, entry.rank)).map(
    ({ href, label }) => ({ href, label }),
  );
}
