"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TeamMembership } from "@camp404/db/team-memberships";
import { decryptField } from "@camp404/db/crypto";
import {
  MAX_MEMBER_NOTE_LENGTH,
  addMemberNote,
  type MemberNote,
} from "@camp404/db/member-notes";
// The reads and the team writes route through the roster facade, so the E2E
// test store can answer them and Playwright can open a member's panel and put
// them on a team.
import {
  assignTeam,
  getCampMemberDetail,
  getTeamMemberships,
  listMemberNotes,
  listMemberQuestionnaireGates,
  removeTeam,
  setLead,
} from "@/lib/roster";
import { ID_UNREADABLE_LABEL, mergeIdNumber } from "@camp404/db/id-documents";
import {
  availableReviewActions,
  canDecidePromotion,
  canSendPromotion,
  deriveViewerRank,
  memberQuestionnaireStatuses,
  promotionStepState,
  reviewActionFor,
  reviewRefusal,
  type MemberQuestionnaire,
  type ReviewOption,
} from "@camp404/core";
import type { ApprovalStatus, Team } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { decideUserApproval, findCampUserById } from "@/lib/users";
import {
  decideCaptainPromotion,
  getOpenPromotionForTarget,
  getPromotionRequestById,
  sendCaptainPromotion,
} from "@/lib/promotion";
import { presentMemberDetail, type PresentedMember } from "@/lib/member-detail";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { resolveTeamKey } from "@/lib/team-keys";
import {
  presentPublicMember,
  type PublicMemberProfile,
} from "@/lib/public-member";
import { runAction, type ActionFailure } from "@/lib/action-result";
import { auditReadAfterResponse } from "@/lib/audit";
import { resolveSafetyDataForViewer } from "@/lib/safety-data";

export type MemberDetailResult =
  | {
      ok: true;
      member: PresentedMember;
      /** Whether the viewing captain may send this member a promotion request. */
      canAssignCaptain: boolean;
      /** In-flight two-step tracker for an open request (drives the dialog). */
      promotionStep: { sent: boolean; accepted: boolean };
      /** The open `sent` request's id, for the dialog's cancel action (or null). */
      promotionRequestId: string | null;
      /** Whether the open request was sent by THIS captain — only the requester
       * may cancel it, so this gates the dialog's cancel affordance. */
      promotionRequestIsMine: boolean;
      /** Who sent the open request (null when none is open, or unnamed). */
      promotionRequestedByName: string | null;
      /**
       * Every vetting decision that exists from this member's status, each
       * with the sentence to show when it is refused (null when allowed).
       */
      reviewOptions: ReviewOption[];
      /** Captains' private notes on this member, newest first. */
      notes: MemberNote[];
      /** Where each of this member's questionnaires stands, oldest first. */
      questionnaires: MemberQuestionnaire[];
      /** This member's team memberships FOR THE CAMP'S CURRENT YEAR. */
      teams: TeamMembership[];
      /** The teams a captain may assign — active only, order-sorted. Archived
       * teams are filtered out SERVER-SIDE so they can never be picked. */
      assignableTeams: AssignableTeam[];
    }
  | { ok: false; error: string };

// Re-exported so the client panel can type its membership props without
// importing @camp404/db (which pulls the database driver) into a client module.
export type { TeamMembership };

/** One pickable team for the assignment control. */
export interface AssignableTeam {
  key: string;
  label: string;
}

/**
 * Every team write answers with the member's refreshed membership list, so the
 * panel re-renders from the server's truth rather than guessing at the outcome
 * of a write it did not perform.
 */
export type TeamAssignmentResult =
  | { ok: true; teams: TeamMembership[] }
  | { ok: false; error: string };

export type PublicMemberProfileResult =
  | ({ ok: true } & PublicMemberProfile)
  | { ok: false; error: string };

export type ApprovalDecisionResult =
  | { ok: true }
  | { ok: false; error: string };

export type PromotionActionResult = { ok: true } | { ok: false; error: string };

export type SendPromotionResult =
  | {
      ok: true;
      requestId: string;
      /** False when another captain's open request was already there: send is
       * idempotent and hands back THAT request, which only they may cancel. */
      requestIsMine: boolean;
      /** Who sent the open request, for "Requested by …". */
      requestedByName: string | null;
    }
  | { ok: false; error: string };

// Opaque-id boundary schema: a non-empty string. Deliberately NOT .uuid() — the
// E2E test store uses ids like "test-user-1"; a bad id otherwise fails the
// downstream lookup anyway. (AGENTS.md: validate external input with Zod.)
const UserId = z.string().min(1);

// Guard reason code → captain-facing copy for the assign-captain flow.
const SEND_PROMOTION_COPY: Record<string, string> = {
  viewer_not_captain: "Captain access only.",
  cannot_promote_self: "You can't promote yourself.",
  target_already_captain: "They're already a captain.",
};

// Guard reason code → captain-facing copy for cancelling an in-flight request.
const CANCEL_PROMOTION_COPY: Record<string, string> = {
  request_not_open: "This request is no longer open.",
  only_requester_may_cancel: "Only the captain who sent it can cancel it.",
};

/**
 * Captain-gate every camp-management action at the data layer. Returns the
 * acting captain's id, or an error string for the caller to surface. A
 * captain+pending row is refused: the roster offers assign-captain on a member
 * still in the vetting queue, and accepting flips rank without touching
 * approval status.
 */
async function requireCaptain(): Promise<
  { ok: true; captainId: string } | { ok: false; error: string }
> {
  const gate = await captainActionGate("captain");
  return gate.ok ? { ok: true, captainId: gate.campUser.id } : gate;
}

/**
 * Gate a member-facing camp-management read: signed in, camp-active and
 * approved, but NOT captain-gated. Backs the public member profile (decision:
 * any approved member may browse the roster + public cards). Returns the
 * viewer's id and whether they are a captain, so a captain hitting the public
 * path is still recognised.
 */
async function requireApprovedMember(): Promise<
  | { ok: true; userId: string; isCaptain: boolean }
  | { ok: false; error: string }
> {
  const gate = await captainActionGate("camp_member");
  if (!gate.ok) return gate;
  return {
    ok: true,
    userId: gate.campUser.id,
    isCaptain: gate.rank === "captain",
  };
}

/** Load the full burner detail behind a roster row, for the modal. */
export async function getMemberDetailAction(
  userId: string,
): Promise<MemberDetailResult> {
  return runAction("getMemberDetailAction", async () => {
    const gate = await requireCaptain();
    if (!gate.ok) return gate;

    // The only action in this file that was missing the opaque-id boundary check
    // every sibling has — and the only one that passes includeIdDocuments, i.e.
    // the government-ID decrypt path. Validate before the privileged read.
    if (!UserId.safeParse(userId).success) {
      return { ok: false, error: "Member not found." };
    }

    // Captain-gated above, and we decrypt below — the only caller that may pull
    // the ID ciphertext out of the database.
    const detail = await getCampMemberDetail(userId, {
      includeIdDocuments: true,
      includeEmail: true,
      includeArrival: true,
    });
    if (!detail) return { ok: false, error: "Member not found." };

    // Captain-gated above — decrypt this member's government ID number and merge
    // it back into the answers so the profile modal can show it. Captains and
    // the owner are the only readers of this field.
    //
    // An UNREADABLE column (key rotation / corrupt ciphertext) must not render as
    // an absent one: mergeIdNumber is a no-op on a null number, so the row would
    // silently disappear and the captain would read it as "this member never gave
    // us an ID". Merge an explicit marker instead. This is a read-only
    // projection — presentMemberDetail never writes back.
    const passport = decryptField(detail.passportEncrypted);
    const saId = decryptField(detail.saIdEncrypted);
    const readable =
      passport.state === "ok" ? passport : saId.state === "ok" ? saId : null;
    const unreadableType =
      passport.state === "unreadable"
        ? "passport"
        : saId.state === "unreadable"
          ? "sa_id"
          : null;
    const id = readable
      ? {
          idType: passport.state === "ok" ? "passport" : "sa_id",
          idNumber: readable.value,
        }
      : unreadableType
        ? { idType: unreadableType, idNumber: ID_UNREADABLE_LABEL }
        : { idType: null, idNumber: null };
    const responses = mergeIdNumber(detail.responses, id);

    // A captain reading someone else's ID number leaves a trail. Only a value
    // actually shown counts: an empty or unreadable column discloses nothing,
    // and a captain reading their own is not a disclosure.
    if (readable && userId !== gate.captainId) {
      auditReadAfterResponse({
        actorId: gate.captainId,
        action: "member.id_document.viewed",
        target: userId,
        metadata: { basis: "captain", idType: id.idType },
      });
    }

    // Assign-captain affordance for the modal: reuse the pure send-guard for
    // visibility (captain viewer, target not already a captain, not self) and the
    // pure step-state over the member's open request (if any).
    const canAssignCaptain = canSendPromotion({
      viewerRank: "captain",
      viewerId: gate.captainId,
      // NOT a viewer gate: this is the rank of the person being ACTED ON, and
      // `canSendPromotion` asks one thing of it — "are they already a captain?".
      // Whether they lead a team has no bearing on being promotable, so `false`
      // is the correct value here, not a missing lookup. Do not "fix" this to
      // `await isTeamLead(userId)`: it would cost a round-trip per modal open
      // and imply, wrongly, that leading a team changes who may be promoted.
      targetRank: deriveViewerRank(detail.rank, false),
      targetId: userId,
    }).ok;
    const openRequest = await getOpenPromotionForTarget(userId);
    const promotionStep = promotionStepState(openRequest);

    // Resolve team picks against ALL teams (incl. archived) so a member who chose
    // a since-archived team still shows its label, not the raw key.
    const questionnaire = await getQuestionnaireForResponses();

    // Emergency contacts come only through the safety read path, which
    // authorises and audits the read.
    const safety = await resolveSafetyDataForViewer(
      { userId: gate.captainId, rank: "captain" },
      userId,
    );

    // The assignment control's two inputs: what this member is on THIS YEAR,
    // and what a captain may put them on. `activeTeams` drops archived teams,
    // so an archived team is unpickable before the client ever sees the list.
    const [teams, config, notes, gates] = await Promise.all([
      getTeamMemberships(userId),
      getTeamsConfig(),
      listMemberNotes(userId),
      listMemberQuestionnaireGates(userId),
    ]);
    auditNotesRead(gate.captainId, userId, notes);

    return {
      ok: true,
      member: presentMemberDetail(
        { ...detail, responses },
        questionnaire,
        safety.allowed ? safety : undefined,
      ),
      canAssignCaptain,
      reviewOptions: availableReviewActions({
        status: detail.approvalStatus,
        isSelf: userId === gate.captainId,
        isCaptain: detail.rank === "captain",
      }),
      promotionStep,
      promotionRequestId: openRequest?.id ?? null,
      promotionRequestIsMine: openRequest?.requestedByUserId === gate.captainId,
      promotionRequestedByName: await requesterName(
        openRequest?.requestedByUserId ?? null,
      ),
      notes,
      questionnaires: memberQuestionnaireStatuses(gates),
      teams,
      assignableTeams: activeTeams(config).map((t) => ({
        key: t.key,
        label: t.label,
      })),
    };
  });
}

/**
 * Load the PUBLIC member card behind a roster row for a non-captain viewer.
 * Gated to approved camp members (not captains). Returns an allowlisted
 * projection — bio + this-year ideas only — so approval status, contact details,
 * government ID and invite provenance never reach a member. The decrypt path and
 * `getMemberDetailAction` stay captain-only.
 */
export async function getPublicMemberProfileAction(
  userId: string,
): Promise<PublicMemberProfileResult> {
  return runAction("getPublicMemberProfileAction", async () => {
    const gate = await requireApprovedMember();
    if (!gate.ok) return gate;

    if (!UserId.safeParse(userId).success) {
      return { ok: false, error: "Invalid member." };
    }

    // Member-facing (NOT captain-gated): never SELECT the ID ciphertext, so it
    // cannot reach this request's scope at all — not merely be projected away.
    const detail = await getCampMemberDetail(userId, {
      includeIdDocuments: false,
    });
    if (!detail) return { ok: false, error: "Member not found." };

    // Allowlist projection (no decrypt, no status, no email, no provenance).
    return { ok: true, ...presentPublicMember(detail) };
  });
}

/** The longest reason a captain may give the member, in characters. */
const MAX_DECISION_REASON = 500;
/** The most members one bulk decision may cover. */
const MAX_BULK_DECISIONS = 100;

const Status = z.enum(["pending", "approved", "rejected"]);

/** A reason, trimmed, or the sentence saying why it can't be used. */
function checkReason(
  reason: unknown,
): { ok: true; reason: string | null } | { ok: false; error: string } {
  if (reason != null && typeof reason !== "string") {
    return { ok: false, error: "The reason must be text." };
  }
  const trimmed = reason?.trim() || null;
  if (trimmed && trimmed.length > MAX_DECISION_REASON) {
    return {
      ok: false,
      error: `Keep the reason under ${MAX_DECISION_REASON} characters.`,
    };
  }
  return { ok: true, reason: trimmed };
}

const LOST_RACE = "Another captain already changed this member's decision.";

/**
 * Apply a captain's vetting decision: approve, reject, or re-open, from the
 * status the captain was looking at (owner's call, 2026-09-16: decisions can
 * be reversed). Approving unblocks the app on the member's next load.
 * Rejecting holds them at the blocking screen and takes them off this year's
 * teams (offboarding). Re-opening puts them back in the queue.
 *
 * The write is a compare-and-set on `from`, so a captain acting on a stale
 * roster cannot overwrite another captain's decision; they are told instead.
 * The same refusals the panel shows beside a disabled control are enforced
 * here (reviewRefusal): not on yourself, and not taking a captain's access.
 */
export async function decideApprovalAction(input: {
  userId: string;
  from: ApprovalStatus;
  to: ApprovalStatus;
  reason?: string | null;
}): Promise<ApprovalDecisionResult> {
  return runAction("decideApprovalAction", async () => {
    const gate = await requireCaptain();
    if (!gate.ok) return gate;

    if (!UserId.safeParse(input?.userId).success) {
      return { ok: false, error: "Invalid member." };
    }
    const from = Status.safeParse(input.from);
    const to = Status.safeParse(input.to);
    const action =
      from.success && to.success ? reviewActionFor(from.data, to.data) : null;
    if (!from.success || !to.success || !action) {
      return { ok: false, error: "Unknown decision." };
    }
    const reason = checkReason(input.reason);
    if (!reason.ok) return reason;

    const target = await findCampUserById(input.userId);
    if (!target) return { ok: false, error: "Member not found." };
    const refusal = reviewRefusal(
      {
        status: from.data,
        isSelf: input.userId === gate.captainId,
        isCaptain: target.rank === "captain",
      },
      action,
    );
    if (refusal) return { ok: false, error: refusal };

    const decided = await decideUserApproval({
      userId: input.userId,
      from: from.data,
      to: to.data,
      decidedByUserId: gate.captainId,
      reason: reason.reason,
    });
    // Revalidate either way: on the lost-CAS path the roster this captain is
    // looking at is stale, which is exactly why they got here.
    revalidatePath("/captains/camp-management");
    if (!decided) return { ok: false, error: LOST_RACE };
    return { ok: true };
  });
}

export type BulkApprovalResult =
  | {
      ok: true;
      /** Members this call decided. */
      decided: string[];
      /** Members another captain had already moved out of pending. */
      lost: string[];
      /** Members this captain may not decide, with the reason. */
      refused: { userId: string; error: string }[];
    }
  | { ok: false; error: string };

/**
 * Approve or reject several pending applicants at once, from the Pending
 * filter. Each member is its own compare-and-set on `pending`, exactly as if
 * decided one by one, so a partial result is normal: the answer says who was
 * decided, who another captain got to first, and who was refused.
 */
export async function decideApprovalsAction(input: {
  userIds: string[];
  to: "approved" | "rejected";
  reason?: string | null;
}): Promise<BulkApprovalResult> {
  return runAction("decideApprovalsAction", async () => {
    const gate = await requireCaptain();
    if (!gate.ok) return gate;

    const ids = z.array(UserId).safeParse(input?.userIds);
    if (!ids.success || ids.data.length === 0) {
      return { ok: false, error: "Pick at least one member." };
    }
    const userIds = [...new Set(ids.data)];
    if (userIds.length > MAX_BULK_DECISIONS) {
      return {
        ok: false,
        error: `Decide at most ${MAX_BULK_DECISIONS} members at a time.`,
      };
    }
    if (input.to !== "approved" && input.to !== "rejected") {
      return { ok: false, error: "Unknown decision." };
    }
    const reason = checkReason(input.reason);
    if (!reason.ok) return reason;
    const action = input.to === "approved" ? "approve" : "reject";

    const decided: string[] = [];
    const lost: string[] = [];
    const refused: { userId: string; error: string }[] = [];
    for (const userId of userIds) {
      const target = await findCampUserById(userId);
      if (!target) {
        refused.push({ userId, error: "Member not found." });
        continue;
      }
      const refusal = reviewRefusal(
        {
          status: "pending",
          isSelf: userId === gate.captainId,
          isCaptain: target.rank === "captain",
        },
        action,
      );
      if (refusal) {
        refused.push({ userId, error: refusal });
        continue;
      }
      const won = await decideUserApproval({
        userId,
        from: "pending",
        to: input.to,
        decidedByUserId: gate.captainId,
        reason: reason.reason,
      });
      (won ? decided : lost).push(userId);
    }
    revalidatePath("/captains/camp-management");
    return { ok: true, decided, lost, refused };
  });
}

export type MemberNotesResult =
  | { ok: true; notes: MemberNote[] }
  | { ok: false; error: string };

/**
 * Every read of captains' notes that shows at least one note leaves an audit
 * row (owner's call: notes are audited). An empty list discloses nothing.
 */
function auditNotesRead(
  captainId: string,
  userId: string,
  notes: readonly MemberNote[],
): void {
  if (notes.length === 0) return;
  auditReadAfterResponse({
    actorId: captainId,
    action: "member.notes.viewed",
    target: userId,
    metadata: { count: notes.length },
  });
}

/**
 * Add a captain's note to a member and hand back the refreshed list. Notes are
 * captain-only, the member never sees them, and they stay out of every roster
 * row and export.
 */
export async function addMemberNoteAction(
  userId: string,
  body: string,
): Promise<MemberNotesResult> {
  return runAction("addMemberNoteAction", async () => {
    const gate = await requireCaptain();
    if (!gate.ok) return gate;
    if (!UserId.safeParse(userId).success) {
      return { ok: false, error: "Invalid member." };
    }
    const text = typeof body === "string" ? body.trim() : "";
    if (!text) return { ok: false, error: "Write the note first." };
    if (text.length > MAX_MEMBER_NOTE_LENGTH) {
      return {
        ok: false,
        error: `Keep a note under ${MAX_MEMBER_NOTE_LENGTH} characters.`,
      };
    }
    if (!(await findCampUserById(userId))) {
      return { ok: false, error: "Member not found." };
    }
    await addMemberNote({ userId, authorId: gate.captainId, body: text });
    const notes = await listMemberNotes(userId);
    auditNotesRead(gate.captainId, userId, notes);
    return { ok: true, notes };
  });
}

/** A promotion requester's display name, for the roster dialog. */
async function requesterName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const requester = await getCampMemberDetail(userId, {
    includeIdDocuments: false,
  });
  return requester?.displayName ?? null;
}

/**
 * Send a "make captain" request to a roster member (captain → target side of
 * the double-opt-in). Captain-gated; the pure `canSendPromotion` guard rejects
 * self / already-captain. The target's rank does NOT change here — it flips only
 * when the target accepts in their own app. Idempotent: a second send while a
 * request is open returns the existing one (no duplicate).
 */
export async function sendCaptainPromotionAction(
  targetUserId: string,
): Promise<SendPromotionResult> {
  return runAction("sendCaptainPromotionAction", async () => {
    const gate = await requireCaptain();
    if (!gate.ok) return gate;

    if (!UserId.safeParse(targetUserId).success) {
      return { ok: false, error: "Invalid member." };
    }

    const target = await getCampMemberDetail(targetUserId);
    if (!target) return { ok: false, error: "Member not found." };

    // The viewer is a captain by construction (requireCaptain), so `viewerRank`
    // is the literal "captain" rather than a re-derivation.
    //
    // `targetRank` is NOT a viewer rank: it is the rank of the person being
    // acted on, and `canSendPromotion` asks one thing of it — "are they already
    // a captain?". Leading a team has no bearing on being promotable, so `false`
    // is the correct value, not a missing lookup. Do not "fix" it to
    // `await isTeamLead(targetUserId)`.
    const guard = canSendPromotion({
      viewerRank: "captain",
      viewerId: gate.captainId,
      targetRank: deriveViewerRank(target.rank, false),
      targetId: targetUserId,
    });
    if (!guard.ok) {
      return {
        ok: false,
        error:
          SEND_PROMOTION_COPY[guard.reason] ?? "Couldn't send the request.",
      };
    }

    const request = await sendCaptainPromotion({
      targetUserId,
      requestedByUserId: gate.captainId,
    });
    revalidatePath("/captains/camp-management");
    return {
      ok: true,
      requestId: request.id,
      requestIsMine: request.requestedByUserId === gate.captainId,
      requestedByName: await requesterName(request.requestedByUserId),
    };
  });
}

/**
 * Cancel an in-flight "make captain" request the viewing captain sent. Captain-
 * gated; the pure `canDecidePromotion` guard enforces that only the requester can
 * cancel and only while the row is still `sent`. No rank ever changes.
 */
export async function cancelCaptainPromotionAction(
  requestId: string,
): Promise<PromotionActionResult> {
  return runAction("cancelCaptainPromotionAction", async () => {
    const gate = await requireCaptain();
    if (!gate.ok) return gate;

    if (!UserId.safeParse(requestId).success) {
      return { ok: false, error: "Invalid request." };
    }

    const request = await getPromotionRequestById(requestId);
    if (
      !request ||
      request.targetUserId === null ||
      request.requestedByUserId === null
    ) {
      return { ok: false, error: "Request not found." };
    }

    const guard = canDecidePromotion({
      actorId: gate.captainId,
      request: {
        status: request.status,
        targetUserId: request.targetUserId,
        requestedByUserId: request.requestedByUserId,
      },
      action: "cancel",
    });
    if (!guard.ok) {
      return {
        ok: false,
        error:
          CANCEL_PROMOTION_COPY[guard.reason] ?? "Couldn't cancel the request.",
      };
    }

    // Bind the actor in the write predicate too (defense in depth): the cancel
    // only flips a row this captain actually requested.
    await decideCaptainPromotion({
      requestId,
      status: "cancelled",
      actorUserId: gate.captainId,
    });
    revalidatePath("/captains/camp-management");
    return { ok: true };
  });
}

// --- Team assignment --------------------------------------------------------
// The captain-facing write path for `team_memberships` (WP6). Every one of these
// is captain-gated by the same `requireCaptain()` the decisions above use, and
// every one resolves the burn year inside @camp404/db — the cycle is never a
// parameter a caller can get wrong. The team key is checked by resolveTeamKey
// (lib/team-keys.ts), which the MCP captain tools share.

/** Captain-gate + validate the (member, team) pair every team write shares. */
async function gateTeamWrite(
  userId: string,
  team: string,
  requireActive: boolean,
): Promise<{ ok: true; captainId: string; team: Team } | ActionFailure> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;
  if (!UserId.safeParse(userId).success) {
    return { ok: false, error: "Invalid member." };
  }
  const resolved = await resolveTeamKey(team, requireActive);
  if (!resolved.ok) return resolved;
  return { ok: true, captainId: gate.captainId, team: resolved.team };
}

/**
 * Put a member on a team for the camp's current year. Idempotent — assigning
 * someone already on the team succeeds without a duplicate row.
 */
export async function assignTeamAction(
  userId: string,
  team: string,
): Promise<TeamAssignmentResult> {
  return runAction("assignTeamAction", async () => {
    const gate = await gateTeamWrite(userId, team, true);
    if (!gate.ok) return gate;

    await assignTeam({ userId, team: gate.team, actorId: gate.captainId });
    // The roster's team badges and lead column read the same rows.
    revalidatePath("/captains/camp-management");
    return { ok: true, teams: await getTeamMemberships(userId) };
  });
}

/**
 * Take a member off a team for the camp's current year. Accepts an archived
 * team so a captain can still clear a roster after archiving it, and removing
 * the team's last lead is allowed by design (see `removeTeam` in
 * @camp404/db/team-memberships).
 */
export async function removeTeamAction(
  userId: string,
  team: string,
): Promise<TeamAssignmentResult> {
  return runAction("removeTeamAction", async () => {
    const gate = await gateTeamWrite(userId, team, false);
    if (!gate.ok) return gate;

    await removeTeam({ userId, team: gate.team, actorId: gate.captainId });
    revalidatePath("/captains/camp-management");
    return { ok: true, teams: await getTeamMemberships(userId) };
  });
}

/**
 * Mark a member as leading (or no longer leading) a team they are already on.
 * Refuses a member who is not on the team this year — the lead flag is a
 * modifier on a membership, never a way to create one.
 */
export async function setTeamLeadAction(
  userId: string,
  team: string,
  isLead: boolean,
): Promise<TeamAssignmentResult> {
  return runAction("setTeamLeadAction", async () => {
    const gate = await gateTeamWrite(userId, team, true);
    if (!gate.ok) return gate;
    if (typeof isLead !== "boolean") {
      return { ok: false, error: "Unknown decision." };
    }

    const result = await setLead({
      userId,
      team: gate.team,
      isLead,
      actorId: gate.captainId,
    });
    if (!result.ok) {
      return { ok: false, error: "Add them to the team first." };
    }
    revalidatePath("/captains/camp-management");
    return { ok: true, teams: await getTeamMemberships(userId) };
  });
}
