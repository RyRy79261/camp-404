import "server-only";

import {
  DEFAULT_TEAM_DESCRIPTIONS,
  type JoinSiteContent,
} from "@camp404/types";
import { activeTeams } from "@camp404/db/camp-config";
import * as db from "@camp404/db/join-site";
import type { JoinCaptain, JoinTeam } from "@camp404/db/join-site";
import { getCampSettings } from "./camp-config";
import { testStore } from "./test-store";
import { twin } from "./twin";

// About Camp 404 (#264): the camp's intro, which used to live on a Notion
// page, read in the app by every member. It is the same document captains
// already keep for join.camp-404.com (join_site_content, edited in the Join
// site program and audited there), so the camp's words live in one place and
// the public site and the app never tell two stories. This module only reads,
// from the database or, under E2E, the test store (twin).

const join = twin(
  db,
  {
    getJoinSiteContent: (year: number | null) =>
      testStore.getJoinSiteContent(year),
    getJoinCaptains: () => testStore.listJoinCaptains(),
  },
  ["getJoinSiteContent", "getJoinCaptains"],
);

export type AboutCamp = {
  /** The camp's year, or null before a captain names one. */
  year: number | null;
  yearName: string | null;
  burn: { start: string; end: string } | null;
  content: JoinSiteContent;
  teams: JoinTeam[];
  /** Captains who chose to be shown (the same cards as the join site). */
  captains: JoinCaptain[];
};

export async function getAboutCamp(): Promise<AboutCamp> {
  const settings = await getCampSettings();
  const year = settings.current?.year ?? null;

  const [{ content }, captains] = await Promise.all([
    join.getJoinSiteContent(year),
    join.getJoinCaptains(),
  ]);

  const burn =
    settings.current?.burnStart && settings.current.burnEnd
      ? { start: settings.current.burnStart, end: settings.current.burnEnd }
      : null;

  return {
    year,
    yearName: settings.current?.name ?? null,
    burn,
    content,
    teams: activeTeams(settings.teams).map((t) => ({
      key: t.key,
      label: t.label,
      description:
        t.description?.trim() || DEFAULT_TEAM_DESCRIPTIONS[t.key] || "",
    })),
    captains,
  };
}
