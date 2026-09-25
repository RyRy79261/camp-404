import "server-only";

import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { getPublishedJoinPage } from "@camp404/db/join-page";

// The join site's one read (#264): the current year's published page. Read
// only, and with no session: this app has no sign-in at all.

export type JoinPageRead =
  | {
      status: "published";
      /** The burn year, or null on a camp that has not said which year it is. */
      cycle: number | null;
      markdown: string;
    }
  | { status: "none" }
  | { status: "unavailable" };

/**
 * The page to show. A failed read is said as such rather than as "nothing
 * published", so a visitor is told to come back instead of that there is no
 * way in, and the error goes to the log.
 */
export async function readJoinPage(): Promise<JoinPageRead> {
  try {
    const page = await getPublishedJoinPage();
    return page
      ? {
          status: "published",
          cycle: page.cycle === UNSET_CYCLE ? null : page.cycle,
          markdown: page.markdown,
        }
      : { status: "none" };
  } catch (error) {
    console.error("[join] reading the join page failed", error);
    return { status: "unavailable" };
  }
}
