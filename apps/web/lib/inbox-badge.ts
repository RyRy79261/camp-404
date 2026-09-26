import "server-only";

import { cache } from "react";
import { countUnread } from "./notifications";
import { getPendingQuestionnaires } from "./users";

// The one count of "what is new in your inbox". The bell in the desktop's tray
// and the Notifications tile on Home (called Announcements until 2026-09-24)
// both open the inbox, and both show this number. They used to add it up separately — the bell counted waiting
// questionnaires and the tile did not, and Home skipped them for a member
// waiting for approval — so one member could see 6 on the bell and 5 on the
// tile in the same page. Anything that shows the inbox count reads it here.

export interface InboxBadge {
  /**
   * Unread deliveries, less the notice of any questionnaire already counted
   * in `waiting`.
   */
  notices: number;
  /** Questionnaires the member still has to answer on an open send. */
  waiting: number;
  /** What the bell and the Notifications tile show: notices + waiting. */
  total: number;
}

/**
 * The inbox badge: a delivery with no `read_at`, plus a questionnaire the
 * member still has to answer on an open send. Waiting questionnaires stay in
 * it until they are answered ("shout until it's done"): reading the inbox
 * clears the notices, not the forms.
 *
 * A questionnaire send also delivers a notice (and a reminder delivers
 * another), each pointing at the activation. While that form is waiting, its
 * notices are left out of `notices`, so one form counts once. Once it is
 * answered it leaves `waiting`, and an unread notice about it counts like any
 * other notice until it is read.
 *
 * Both halves have an E2E twin: `countUnread` routes to the test store, and
 * `getPendingQuestionnaires` returns [] under it, which is right — the test
 * store models no questionnaire activations, and the real query inner-joins
 * them.
 *
 * Wrapped in React `cache`, so the header and the page share one read per
 * request. The waiting list is read first because the notice count needs its
 * ids.
 */
export const getInboxBadge = cache(
  async (userId: string): Promise<InboxBadge> => {
    const pending = await getPendingQuestionnaires(userId);
    const notices = await countUnread(userId, {
      exceptActivationIds: pending.map((q) => q.activationId),
    });
    const waiting = pending.length;
    return { notices, waiting, total: notices + waiting };
  },
);
