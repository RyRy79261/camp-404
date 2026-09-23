import "server-only";

import { cache } from "react";
import { countUnread } from "./notifications";
import { getPendingQuestionnaires } from "./users";

// The one count of "what is new in your inbox". The bell in the console header
// and the Announcements tile on Home both open the inbox, and both show this
// number. They used to add it up separately — the bell counted waiting
// questionnaires and the tile did not, and Home skipped them for a member
// waiting for approval — so one member could see 6 on the bell and 5 on the
// tile in the same page. Anything that shows the inbox count reads it here.

export interface InboxBadge {
  /** Deliveries with no `read_at`. */
  notices: number;
  /** Questionnaires the member still has to answer on an open send. */
  waiting: number;
  /** What the bell and the Announcements tile show: notices + waiting. */
  total: number;
}

/**
 * The inbox badge: a delivery with no `read_at`, plus a questionnaire the
 * member still has to answer on an open send. Waiting questionnaires stay in
 * it until they are answered ("shout until it's done"): reading the inbox
 * clears the notices, not the forms.
 *
 * A questionnaire send also delivers a notice, so until that notice is read
 * one questionnaire counts twice. That is known and left as it is; it now
 * shows the same on every surface.
 *
 * Both halves already have an E2E twin: `countUnread` routes to the test
 * store, and `getPendingQuestionnaires` returns [] under it, which is right —
 * the test store models no questionnaire activations, and the real query
 * inner-joins them.
 *
 * Wrapped in React `cache`, so the header and the page share one read per
 * request.
 */
export const getInboxBadge = cache(
  async (userId: string): Promise<InboxBadge> => {
    const [notices, pending] = await Promise.all([
      countUnread(userId),
      getPendingQuestionnaires(userId),
    ]);
    const waiting = pending.length;
    return { notices, waiting, total: notices + waiting };
  },
);
