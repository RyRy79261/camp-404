"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canDecidePromotion, type PromotionParticipants } from "@camp404/core";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureCampUser,
  hasCampAccess,
  isApproved,
  setCampUserRank,
} from "@/lib/users";
import {
  decideCaptainPromotion,
  getPromotionRequestById,
} from "@/lib/promotion";
import { runAction, type ActionResult } from "@/lib/action-result";
import { listInbox, markRead, type InboxPage } from "@/lib/notifications";

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
  only_requester_may_cancel: "Only the requester can cancel this request.",
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
 * The recipient accepts a "make captain" request: the ONE place a user's rank
 * flips to captain, and only after the decide write succeeds (so a double-accept
 * — a non-`sent` row — is a no-op that never re-flips).
 */
export async function acceptCaptainPromotionAction(
  requestId: string,
): Promise<PromotionDecisionResult> {
  const loaded = await loadActorAndRequest(requestId);
  if (!loaded.ok) return loaded;
  const { actorId, request } = loaded;

  // The flip (status → accepted) and the rank write are two non-atomic writes
  // (the Neon HTTP driver has no interactive transaction). To survive a failure
  // between them, accept is idempotent + self-healing: a target re-accepting an
  // already-`accepted` request skips the flip and just (re)applies the rank,
  // recovering the rare case where a prior setCampUserRank failed post-flip.
  const alreadyAcceptedByTarget =
    request.status === "accepted" && actorId === request.targetUserId;

  if (!alreadyAcceptedByTarget) {
    const guard = canDecidePromotion({ actorId, request, action: "accept" });
    if (!guard.ok) {
      return {
        ok: false,
        error: DECIDE_PROMOTION_COPY[guard.reason] ?? "Couldn't accept.",
      };
    }

    const decided = await decideCaptainPromotion({
      requestId,
      status: "accepted",
    });
    if (!decided) {
      return { ok: false, error: "This request is no longer open." };
    }
  }

  // Promote — only after the row is (or already was) accepted by this target.
  // setCampUserRank is idempotent, so the self-heal path is safe to re-run.
  await setCampUserRank(request.targetUserId, "captain");

  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/captains/camp-management");
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

  const decided = await decideCaptainPromotion({
    requestId,
    status: "declined",
  });
  if (!decided) return { ok: false, error: "This request is no longer open." };

  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/captains/camp-management");
  return { ok: true };
}

/**
 * The requester (a captain) withdraws their outgoing request. Invoked from the
 * roster assign-captain dialog. Terminal; never changes rank. The guard enforces
 * requester-only.
 */
export async function cancelCaptainPromotionAction(
  requestId: string,
): Promise<PromotionDecisionResult> {
  const loaded = await loadActorAndRequest(requestId);
  if (!loaded.ok) return loaded;

  const guard = canDecidePromotion({
    actorId: loaded.actorId,
    request: loaded.request,
    action: "cancel",
  });
  if (!guard.ok) {
    return {
      ok: false,
      error: DECIDE_PROMOTION_COPY[guard.reason] ?? "Couldn't cancel.",
    };
  }

  const decided = await decideCaptainPromotion({
    requestId,
    status: "cancelled",
  });
  if (!decided) return { ok: false, error: "This request is no longer open." };

  revalidatePath("/captains/camp-management");
  revalidatePath("/notifications");
  return { ok: true };
}

const InboxCursor = z.string().min(1).max(100);

/**
 * The next, older page of the signed-in member's inbox, for the list's
 * load-more as they scroll. The rows it returns are about to be on screen, so
 * they are marked read here, the same as the first page is on load. Each item
 * keeps the read state it had before, so the list can still show "New".
 */
export async function loadOlderNotificationsAction(
  cursor: string,
): Promise<ActionResult<InboxPage>> {
  return runAction("loadOlderNotificationsAction", async () => {
    if (!InboxCursor.safeParse(cursor).success) {
      return { ok: false, error: "Couldn't load older notifications." };
    }
    const authUser = await getAuthenticatedUser();
    if (!authUser) return { ok: false, error: "Not signed in." };
    const campUser = await ensureCampUser(authUser);
    if (!hasCampAccess(campUser, authUser.primaryEmail)) {
      return { ok: false, error: "Your account isn't camp-active yet." };
    }
    const page = await listInbox(campUser.id, { before: cursor });
    await markRead(
      campUser.id,
      page.items.map((i) => i.id),
    );
    return { ok: true, data: page };
  });
}
