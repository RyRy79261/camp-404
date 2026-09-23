"use server";

import { revalidatePath } from "next/cache";
import {
  AnnouncementAudience,
  ComposeAnnouncementInput,
  Team,
} from "@camp404/types";
import { canSendToAudience, type AudienceActor } from "@camp404/core";
import {
  countAnnouncementAudience,
  createAnnouncementDraft,
  deleteAnnouncementDraft,
  explainDraftRefusal,
  getAnnouncementPinContext,
  publishAnnouncement,
  setAnnouncementPinned,
  updateAnnouncementDraft,
  type Audience,
} from "@/lib/notifications";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainActionGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import { runAction, type ActionResult } from "@/lib/action-result";
import { NOT_YOUR_PIN, NOT_YOUR_TEAM } from "./audience-copy";

type TeamKey = Extract<Audience, { scope: "team" }>["team"];

type Sender =
  | { ok: true; senderId: string; isCaptain: true }
  | { ok: true; senderId: string; isCaptain: false; leadTeams: TeamKey[] };

/**
 * Who may send announcements, gated at the data layer for every action: a
 * captain, to the camp or any team; or a team lead, only to the teams they lead
 * this year (owner's call, 2026-09-16). Anyone else is refused.
 */
async function requireSender(): Promise<Sender | { ok: false; error: string }> {
  const gate = await captainActionGate(
    "team_lead",
    "Captains and team leads only.",
  );
  if (!gate.ok) return gate;
  const { campUser } = gate;
  if (gate.rank === "captain") {
    return { ok: true, senderId: campUser.id, isCaptain: true };
  }
  const leadTeams = (await getLeadTeams(campUser.id)).filter(
    (t): t is TeamKey => Team.safeParse(t).success,
  );
  if (leadTeams.length === 0) {
    return { ok: false, error: "Captains and team leads only." };
  }
  return { ok: true, senderId: campUser.id, isCaptain: false, leadTeams };
}

/**
 * The sender as the audience rule sees them: a rung plus the teams they lead.
 * `canSendToAudience` in @camp404/core owns the rule; nothing here re-derives
 * it.
 */
function audienceActor(sender: Sender): AudienceActor {
  return sender.isCaptain
    ? { rank: "captain", leadTeams: [] }
    : { rank: "team_lead", leadTeams: sender.leadTeams };
}

/**
 * Whether this sender may address this audience. A captain may pick the whole
 * camp or any active team; a lead only a team they lead. The lead half is
 * `canSendToAudience`'s answer verbatim; the captain half adds the one thing
 * that rule does not know, which team keys the camp still has switched on.
 */
async function audienceRefusal(
  sender: Sender,
  audience: Audience,
): Promise<string | null> {
  if (!sender.isCaptain) {
    return canSendToAudience(audienceActor(sender), audience)
      ? null
      : NOT_YOUR_TEAM;
  }
  // The camp and the team leads are always addressable; only a team can have
  // been switched off.
  if (audience.scope !== "team") return null;
  const active = activeTeams(await getTeamsConfig()).map((t) => t.key);
  return active.includes(audience.team)
    ? null
    : "That team isn't active any more. Pick another audience.";
}

/** Save a new announcement draft. */
export async function saveDraftAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("saveDraftAction", async () => {
    const gate = await requireSender();
    if (!gate.ok) return gate;

    const parsed = ComposeAnnouncementInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid.",
      };
    }
    const refusal = await audienceRefusal(gate, parsed.data.audience);
    if (refusal) return { ok: false, error: refusal };

    const { id } = await createAnnouncementDraft({
      senderId: gate.senderId,
      ...parsed.data,
    });
    revalidatePath("/captains/announcements");
    return { ok: true, data: { id } };
  });
}

/** Edit an existing draft (author-only, drafts only). */
export async function updateDraftAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  return runAction("updateDraftAction", async () => {
    const gate = await requireSender();
    if (!gate.ok) return gate;

    const parsed = ComposeAnnouncementInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid.",
      };
    }
    const refusal = await audienceRefusal(gate, parsed.data.audience);
    if (refusal) return { ok: false, error: refusal };

    const ok = await updateAnnouncementDraft({
      id,
      senderId: gate.senderId,
      ...parsed.data,
    });
    if (!ok) {
      return {
        ok: false,
        error: await explainDraftRefusal(id, gate.senderId),
      };
    }
    revalidatePath("/captains/announcements");
    return { ok: true };
  });
}

/** Delete a draft (author-only, drafts only). */
export async function deleteDraftAction(id: string): Promise<ActionResult> {
  return runAction("deleteDraftAction", async () => {
    const gate = await requireSender();
    if (!gate.ok) return gate;

    const ok = await deleteAnnouncementDraft({ id, senderId: gate.senderId });
    if (!ok) {
      return {
        ok: false,
        error: await explainDraftRefusal(id, gate.senderId),
      };
    }
    revalidatePath("/captains/announcements");
    return { ok: true };
  });
}

/**
 * Publish a draft to its audience: the camp or one team, everyone in it except
 * the author. Returns how many recipients it reached. The write reads the
 * sender's rank and lead teams again inside its own transaction and holds them
 * there, so a lead removed a moment ago — even between this gate and the
 * write — cannot send to the team.
 */
export async function publishAction(
  id: string,
): Promise<ActionResult<{ recipientCount: number }>> {
  return runAction("publishAction", async () => {
    const gate = await requireSender();
    if (!gate.ok) return gate;

    const result = await publishAnnouncement({ id, senderId: gate.senderId });
    if (!result.ok) return result;
    revalidatePath("/captains/announcements");
    return { ok: true, data: { recipientCount: result.recipientCount } };
  });
}

/**
 * Pin a published announcement to the top of its recipients' console, or take
 * it down.
 *
 * PINNING AUTHORITY FOLLOWS POSTING AUTHORITY (owner's call, 2026-09-22): "If I
 * am allowed to post to everyone, then that means I'm also allowed to pin
 * something that is posted to everyone." So the gate is two moves, the same two
 * the send path makes: the rank (>= team_lead, via `requireSender`), and then
 * `canSendToAudience` against THIS announcement's stored audience — never the
 * one the browser claimed — plus, for a new pin, the active-team check a send
 * makes. The gate answers the screen; it does not authorise the write. The
 * write reads the actor's rank and lead teams again inside its own
 * transaction and holds them, so a lead removed or a captain demoted between
 * this check and the write cannot pin.
 *
 * Pinning is the second axis beside `presentation`, not a louder presentation:
 * a pinned announcement may be quiet, a pop-up, or a full-screen takeover.
 */
export async function setPinnedAction(
  id: string,
  pinned: boolean,
): Promise<ActionResult> {
  return runAction("setPinnedAction", async () => {
    const gate = await requireSender();
    if (!gate.ok) return gate;

    const context = await getAnnouncementPinContext(id);
    if (!context) {
      return { ok: false, error: "That announcement no longer exists." };
    }
    if (!canSendToAudience(audienceActor(gate), context.audience)) {
      return { ok: false, error: NOT_YOUR_PIN };
    }
    // Putting a pin UP answers every question a send answers, so a captain
    // cannot pin to a team that is no longer active, just as they cannot post
    // to one. Taking a pin DOWN skips this: a pin must always be removable.
    if (pinned) {
      const refusal = await audienceRefusal(gate, context.audience);
      if (refusal) {
        return {
          ok: false,
          error: refusal === NOT_YOUR_TEAM ? NOT_YOUR_PIN : refusal,
        };
      }
    }

    const result = await setAnnouncementPinned({
      id,
      actorId: gate.senderId,
      pinned,
    });
    if (!result.ok) return result;
    revalidatePath("/captains/announcements");
    // The banner rides in the console layout, so every console page is stale.
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/**
 * How many members a publish to this audience would reach right now. The
 * publish confirmation names the number, because an announcement cannot be
 * taken back (owner's call: publish a correction instead).
 */
export async function previewPublishAction(
  audience: unknown,
): Promise<ActionResult<{ recipientCount: number }>> {
  return runAction("previewPublishAction", async () => {
    const gate = await requireSender();
    if (!gate.ok) return gate;
    const parsed = AnnouncementAudience.safeParse(audience);
    if (!parsed.success) return { ok: false, error: "Pick who it's for." };
    const refusal = await audienceRefusal(gate, parsed.data);
    if (refusal) return { ok: false, error: refusal };
    const recipientCount = await countAnnouncementAudience(
      gate.senderId,
      parsed.data,
    );
    return { ok: true, data: { recipientCount } };
  });
}
