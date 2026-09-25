import "server-only";

import { getJoinSitePublic } from "@camp404/db/join-site";
import { DEFAULT_JOIN_DATA, type JoinData } from "./join-data";

/**
 * Read the site's data from the camp's database (owner, 2026-09-25: the join
 * app connects to the same Neon database). With no DATABASE_URL, or if the
 * read fails, the site shows its built-in copy instead of an error page.
 */
export async function loadJoinData(): Promise<JoinData> {
  if (!process.env.DATABASE_URL) return DEFAULT_JOIN_DATA;
  try {
    const live = await getJoinSitePublic();
    return {
      ...live,
      year: live.year ?? DEFAULT_JOIN_DATA.year,
      teams: live.teams.length ? live.teams : DEFAULT_JOIN_DATA.teams,
    };
  } catch (error) {
    console.error(
      "[join] database read failed; showing the built-in copy",
      error,
    );
    return DEFAULT_JOIN_DATA;
  }
}
