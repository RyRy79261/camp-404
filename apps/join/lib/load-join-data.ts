import "server-only";

import { getJoinSitePublic } from "@camp404/db/join-site";
import { DEFAULT_JOIN_DATA, type JoinData } from "./join-data";

/** Set by `next build` while it renders the pages. */
const BUILD_PHASE = "phase-production-build";

/**
 * Read the site's data from the camp's database (owner, 2026-09-25: the join
 * app connects to the same Neon database). With no DATABASE_URL the site
 * shows its built-in copy.
 *
 * A failed read is treated by when it happens:
 * - during `next build`, the built-in copy, so a database blip never fails a
 *   deploy (the page refreshes itself a minute later);
 * - at runtime, the error is logged and thrown. The page refreshes in the
 *   background (`revalidate`), and a refresh that throws keeps the last good
 *   page. Answering with the built-in copy instead would cache it, and every
 *   visitor would read last year's dates and fees until the next refresh.
 *
 * The cost: with NO cached page and the database down, a visitor gets the
 * error page, not the built-in copy. On Vercel that does not happen in
 * practice, because `next build` renders the page (falling back above if it
 * must), so every deployment starts with one cached. It can on a server that
 * never built the page (`next dev`). Chosen over "built-in copy with a short
 * revalidate": a route's revalidate is fixed per route, not per answer, so
 * that copy would be cached for the usual minute anyway.
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
    if (process.env.NEXT_PHASE === BUILD_PHASE) {
      console.error(
        "[join] database read failed during the build; showing the built-in copy",
        error,
      );
      return DEFAULT_JOIN_DATA;
    }
    console.error(
      "[join] database read failed; keeping the last good page",
      error,
    );
    throw error;
  }
}
