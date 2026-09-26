"use server";

import { revalidatePath } from "next/cache";
import { revalidateManifest } from "@/lib/manifest-revalidate";
import { z } from "zod";
import { canDecidePromotion, type PromotionParticipants } from "@camp404/core";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import {
  acceptCaptainPromotion,
  decideCaptainPromotion,
  getPromotionRequestById,
} from "@/lib/promotion";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  listInbox,
  markAllRead,
  markRead,
  unreadClearableCount,
  type InboxItem,
  type InboxPage,
} from "@/lib/notifications";
import { getPendingQuestionnaires } from "@/lib/users";
import { feedIds, marksPageRead, parseInboxFilter } from "./filter";

/** What accept/decline hand back: the error is copy the recipient can read. */
export type PromotionDecisionResult =
  | { ok: true }
  | { ok: false; error: string };

// Opaque-id boundary schema: a non-empty string (NOT .uuid() — the E2E test
// store uses ids like "test-user-1"). AGENTS.md: validate external input with Zod.
const RequestId = z.string().min(1);

// Guard reason code → recipient-facing copy for the acceptance surface.
const DECIDE_PROMOTION_COPY: Record<string, string> = {
  request_not_open: "This request is no longer open.",
  only_target_may_respond: "Only the recipient can respond to this request.",
};

type LoadedActor =
  | { ok: true; actorId: string; request: PromotionParticipants }
  | { ok: false; error: string };

/**
 * Resolve the signed-in camp user + the target request (by id) into the exact
 * `PromotionParticipants` the pure `canDecidePromotion` guard needs. Bridges the
 * audit-nullable participant ids: an orphaned row (a participant was hard-deleted
 * and SET NULL) is treated as gone rather than fed to the guard.
 */
async function loadActorAndRequest(requestId: string): Promise<LoadedActor> {
  if (!RequestId.safeParse(requestId).success) {
    return { ok: false, error: "Invalid request." };
  }

  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  // Owner's call (2026-09-16): a pending applicant can read their inbox, but a
  // rank change must never land on an account a captain has not approved.
  if (!isApproved(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account is still awaiting approval." };
  }

  const request = await getPromotionRequestById(requestId);
  if (!request) return { ok: false, error: "Request not found." };
  if (request.targetUserId === null || request.requestedByUserId === null) {
    return { ok: false, error: "Request no longer available." };
  }

  return {
    ok: true,
    actorId: campUser.id,
    request: {
      status: request.status,
      targetUserId: request.targetUserId,
      requestedByUserId: request.requestedByUserId,
    },
  };
}

/**
 * The recipient accepts a "make captain" request. The accepted status, the rank
 * flip and the audit row are one transaction (acceptCaptainPromotion), so an
 * accepted request can no longer sit on a member who is not a captain.
 */
export async function acceptCaptainPromotionAction(
  requestId: string,
): Promise<PromotionDecisionResult> {
  const loaded = await loadActorAndRequest(requestId);
  if (!loaded.ok) return loaded;
  const { actorId, request } = loaded;

  const guard = canDecidePromotion({ actorId, request, action: "accept" });
  if (!guard.ok) {
    return {
      ok: false,
      error: DECIDE_PROMOTION_COPY[guard.reason] ?? "Couldn't accept.",
    };
  }

  const accepted = await acceptCaptainPromotion({
    requestId,
    actorUserId: actorId,
  });
  if (!accepted) {
    return { ok: false, error: "This request is no longer open." };
  }

  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/captains/camp-management");
  // The new captain's own nav and Home gain the captain programs.
  revalidateManifest();
  return { ok: true };
}

/** The recipient declines a request. Terminal; never changes rank. */
export async function declineCaptainPromotionAction(
  requestId: string,
): Promise<PromotionDecisionResult> {
  const loaded = await loadActorAndRequest(requestId);
  if (!loaded.ok) return loaded;

  const guard = canDecidePromotion({
    actorId: loaded.actorId,
    request: loaded.request,
    action: "decline",
  });
  if (!guard.ok) {
    return {
      ok: false,
      error: DECIDE_PROMOTION_COPY[guard.reason] ?? "Couldn't decline.",
    };
  }

  // The actor is bound in the write too, not only in the guard's read.
  const decided = await decideCaptainPromotion({
    requestId,
    status: "declined",
    actorUserId: loaded.actorId,
  });
  if (!decided) return { ok: false, error: "This request is no longer open." };

  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/captains/camp-management");
  return { ok: true };
}

const InboxCursor = z.string().min(1).max(100);

/**
 * The next, older page of the signed-in member's inbox, for the list's
 * load-more as they scroll. The rows it returns are about to be on screen, so
 * they are marked read here, the same as the first page is on load. Each item
 * keeps the read state it had before, so the list can still show "New".
 *
 * `rawFilter` is the tab the member is on, so an older page stays inside the
 * filter they are reading — and, on the Unread tab, is NOT marked read
 * (`marksPageRead`), or scrolling would delete the list under them.
 */
export async function loadOlderNotificationsAction(
  cursor: string,
  rawFilter?: string,
): Promise<ActionResult<InboxPage>> {
  return runAction("loadOlderNotificationsAction", async () => {
    if (!InboxCursor.safeParse(cursor).success) {
      return { ok: false, error: "Couldn't load older notifications." };
    }
    // An unknown filter reads the whole inbox rather than throwing — the same
    // fallback the page applies to a stale `?filter=` in a shared link.
    const filter = parseInboxFilter(rawFilter);
    const authUser = await getAuthenticatedUser();
    if (!authUser) return { ok: false, error: "Not signed in." };
    const campUser = await ensureCampUser(authUser);
    if (!hasCampAccess(campUser, authUser.primaryEmail)) {
      return { ok: false, error: "Your account isn't camp-active yet." };
    }
    // The filter goes into the query, never onto the page that comes back: a
    // page filtered after the fact would be short and its cursor would skip.
    const page = await listInbox(campUser.id, { before: cursor, filter });
    if (marksPageRead(filter)) {
      try {
        await markRead(campUser.id, feedIds(page.items));
      } catch (err) {
        // The page came back; a failed clear must not throw it away. The first
        // page does the same (page.tsx), and for the same reason: the member
        // gets their notifications, and the badge stays up until the next
        // visit. Letting this reach `runAction` would blank the list instead,
        // and retrying could not help while the write path is down.
        console.error("notifications markRead failed", err);
      }
    }
    return { ok: true, data: page };
  });
}

/** One questionnaire still waiting on the member, as the panel lists it. */
export interface PanelQuestionnaire {
  activationId: string;
  title: string;
  blocking: boolean;
  dueAt: Date | null;
}

/** Everything one open of the header panel draws, fetched in one round trip. */
export interface NotificationPanelData {
  recent: InboxItem[];
  pending: PanelQuestionnaire[];
  /**
   * How many deliveries "Mark all read" would clear, read fresh with the rows.
   * NOT the same as the `recent` window: the panel shows the newest few, and
   * the unread ones can all be older than that. Narrower than the badge, too —
   * that counts waiting questionnaires and unshown pop-ups, which the button
   * cannot clear — so the panel writes it out as a clearable count, not as a
   * total unread.
   */
  clearable: number;
}

/** How many inbox rows the header panel shows before "See all". */
const PANEL_LIMIT = 6;

/**
 * What the header panel shows, fetched when it opens. READ-ONLY on purpose:
 * peeking at the panel must not clear the badge, so nothing here marks a
 * delivery read (AfrikaBurn's panel does not either) — only opening the inbox
 * or pressing "Mark all read" does.
 *
 * It returns both halves of what the bell counts — the latest deliveries and
 * the questionnaires still waiting — plus `clearable`, how many deliveries
 * "Mark all read" would clear across the whole inbox. The panel lists only the
 * newest few, so the list on its own cannot account for the badge; the number
 * can, and the panel shows it for what it is. The badge is `getInboxBadge`'s
 * total (unread notices, less a waiting form's own notice, plus the waiting
 * forms), so a panel that listed only deliveries would read 2 over an empty
 * list.
 *
 * Takes no user id — the inbox is always the signed-in member's own, resolved
 * here. A read that FAILS says so: it goes through `runAction` like its
 * neighbours and the panel reports the error, because painting the empty state
 * over a failed read tells the member nothing was sent, which is the opposite
 * of what happened. A caller who is signed out or not camp-active is not an
 * error — they get empty lists, so the panel degrades rather than erroring the
 * whole header.
 */
export async function fetchNotificationPanelAction(): Promise<
  ActionResult<NotificationPanelData>
> {
  return runAction("fetchNotificationPanelAction", async () => {
    const empty: NotificationPanelData = {
      recent: [],
      pending: [],
      clearable: 0,
    };
    const authUser = await getAuthenticatedUser();
    if (!authUser) return { ok: true, data: empty };
    const campUser = await ensureCampUser(authUser);
    if (!hasCampAccess(campUser, authUser.primaryEmail)) {
      return { ok: true, data: empty };
    }
    const [page, pending, clearable] = await Promise.all([
      listInbox(campUser.id, { limit: PANEL_LIMIT }),
      getPendingQuestionnaires(campUser.id),
      unreadClearableCount(campUser.id),
    ]);
    return {
      ok: true,
      data: {
        recent: page.items,
        pending: pending.map((q) => ({
          activationId: q.activationId,
          title: q.title,
          blocking: q.blocking,
          dueAt: q.dueAt,
        })),
        clearable,
      },
    };
  });
}

/**
 * Clear every unread delivery in the signed-in member's inbox — the panel's
 * "Mark all read". Own inbox only: the id never comes from the caller, and the
 * UPDATE is pinned to it in SQL. Questionnaires still waiting are untouched;
 * only answering one clears it ("shout until it's done").
 */
export async function markAllNotificationsReadAction(): Promise<
  ActionResult<{ cleared: number }>
> {
  return runAction("markAllNotificationsReadAction", async () => {
    const authUser = await getAuthenticatedUser();
    if (!authUser) return { ok: false, error: "Not signed in." };
    const campUser = await ensureCampUser(authUser);
    if (!hasCampAccess(campUser, authUser.primaryEmail)) {
      return { ok: false, error: "Your account isn't camp-active yet." };
    }
    const cleared = await markAllRead(campUser.id);
    revalidatePath("/notifications");
    // The badge is drawn by the console layout (from the manifest), so the
    // whole shell refreshes.
    revalidateManifest();
    return { ok: true, data: { cleared } };
  });
}
