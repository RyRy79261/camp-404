import "server-only";

import { cache } from "react";
import type { PublicGuideChapter } from "@camp404/core";
import { getTeamsConfig, teamLabelMap } from "@camp404/db/camp-config";
import { listPublicChapters } from "@camp404/db/documents";
import { FIXTURE_TEAM_LABELS, fixturePublicChapters } from "./fixtures";

// The public guide's data (#250). Only the public reads of
// @camp404/db/documents, which return chapters already cut (members-only
// parts gone) and only when public. Under E2E_TEST_MODE=1 the fixtures stand
// in, through the same rule and the same cut; never on Vercel.
//
// Nothing is cached across requests: each page load asks again, so a section
// turned off or a chapter unpublished is gone on the next load. Within one
// request the reads are shared (React cache): a chapter page's metadata and
// body read the chapter list once, and take the chapter from it.

function usesFixtures(): boolean {
  return process.env.E2E_TEST_MODE === "1" && !process.env.VERCEL;
}

/** Every chapter on the public site. None when no database is set up. */
export const publicChapters = cache(async (): Promise<PublicGuideChapter[]> => {
  if (usesFixtures()) return fixturePublicChapters();
  if (!process.env.DATABASE_URL) return [];
  return listPublicChapters();
});

/** One chapter on the public site, or null: the same for every other slug. */
export async function publicChapter(
  slug: string,
): Promise<PublicGuideChapter | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 48) {
    return null;
  }
  return (await publicChapters()).find((c) => c.slug === slug) ?? null;
}

/** The camp's team names, by key. */
export const teamLabels = cache(async (): Promise<Record<string, string>> => {
  if (usesFixtures() || !process.env.DATABASE_URL) return FIXTURE_TEAM_LABELS;
  return teamLabelMap(await getTeamsConfig());
});
