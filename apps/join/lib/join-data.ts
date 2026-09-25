import {
  DEFAULT_JOIN_CONTENT,
  DEFAULT_TEAM_DESCRIPTIONS,
  TEAM_DEFAULT_LABELS,
  type JoinSiteContent,
} from "@camp404/types";
// Type-only: erased, so the database driver never reaches the browser.
import type {
  JoinCaptain,
  JoinHeadcount,
  JoinTeam,
} from "@camp404/db/join-site";

export type { JoinCaptain, JoinHeadcount, JoinTeam };

/**
 * Everything the site shows that captains can change, read on the server
 * (lib/load-join-data.ts) and handed to every window through JoinDataProvider.
 */
export type JoinData = {
  year: number;
  yearName: string | null;
  burn: { start: string; end: string } | null;
  content: JoinSiteContent;
  teams: JoinTeam[];
  captains: JoinCaptain[];
  headcount: JoinHeadcount | null;
};

/**
 * What the site shows with no database (CI, local, or a failed read): the
 * copy the owner approved in PR #283, and the facts given the same day.
 */
export const DEFAULT_JOIN_DATA: JoinData = {
  year: 2027,
  yearName: null,
  burn: { start: "2027-04-26", end: "2027-05-02" },
  content: DEFAULT_JOIN_CONTENT,
  teams: Object.entries(TEAM_DEFAULT_LABELS).map(([key, label]) => ({
    key,
    label,
    description: DEFAULT_TEAM_DESCRIPTIONS[key] ?? "",
  })),
  captains: [
    {
      name: "Ryan",
      title: "The Original Error Code",
      blurb:
        "Consistently entropic, weaponised autism needing an excuse for unicycle powered productivity.",
    },
  ],
  headcount: null,
};
