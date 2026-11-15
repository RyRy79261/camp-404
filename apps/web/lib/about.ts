import "server-only";

import type { JoinSiteContent } from "@camp404/types";
import * as db from "@camp404/db/join-site";
import { getCampSettings } from "./camp-config";
import { testStore } from "./test-store";
import { twin } from "./twin";

// About Camp 404 (#264): the camp's intro, which used to live on a Notion
// page, read in the app by every member. It is the same document captains
// already keep for join.camp-404.com (join_site_content, edited in the Join
// site program and audited there), so the camp's words live in one place and
// the public site and the app never tell two stories. The page reads its
// `about` section, the Notion page word for word. This module only reads,
// from the database or, under E2E, the test store (twin).

const join = twin(
  db,
  {
    getJoinSiteContent: (year: number | null) =>
      testStore.getJoinSiteContent(year),
  },
  ["getJoinSiteContent"],
);

export type AboutCamp = {
  /** The camp's year, or null before a captain names one. */
  year: number | null;
  content: JoinSiteContent;
};

export async function getAboutCamp(): Promise<AboutCamp> {
  const settings = await getCampSettings();
  const year = settings.current?.year ?? null;
  const { content } = await join.getJoinSiteContent(year);
  return { year, content };
}
