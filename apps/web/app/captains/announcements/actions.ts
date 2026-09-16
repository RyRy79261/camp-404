"use server";

import { revalidatePath } from "next/cache";
import {
  AnnouncementAudience,
  ComposeAnnouncementInput,
  Team,
} from "@camp404/types";
import {
  countAnnouncementAudience,
  createAnnouncementDraft,
  deleteAnnouncementDraft,
  explainDraftRefusal,
  publishAnnouncement,
  updateAnnouncementDraft,
  type Audience,
} from "@/lib/notifications";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainActionGate } from "@/lib/captain-gate";
import { getLeadTeams } from "@/lib/users";
import { runAction, type ActionResult } from "@/lib/action-result";
import { NOT_YOUR_TEAM } from "./audience-copy";

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
 * Whether this sender may address this audience. A captain may pick the whole
 * camp or any active team; a lead only a team they lead.
 */
async function audienceRefusal(
  sender: Sender,
  audience: Audience,
): Promise<string | null> {
  if (!sender.isCaptain) {
    return audience.scope === "team" && sender.leadTeams.includes(audience.team)
      ? null
      : NOT_YOUR_TEAM;
  }
  if (audience.scope === "everyone") return null;
  const active = activeTeams(await getTeamsConfig()).map((t) => t.key);
  return active.includes(audience.team)
    ? null
    : "That team isn't active any more. Pick another audience.";
}

/** A lead's publish is limited to their teams in the claim itself. */
function allowedTeams(sender: Sender): TeamKey[] | undefined {
  return sender.isCaptain ? undefined : sender.leadTeams;
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
 * the author. Returns how many recipients it reached. A lead's teams are read
 * now, not when the draft was saved, so a lead who has lost a team cannot send
 * to it.
 */
export async function publishAction(
  id: string,
): Promise<ActionResult<{ recipientCount: number }>> {
  return runAction("publishAction", async () => {
    const gate = await requireSender();
    if (!gate.ok) return gate;

    const result = await publishAnnouncement({
      id,
      senderId: gate.senderId,
      allowedTeams: allowedTeams(gate),
    });
    if (!result.ok) return result;
    revalidatePath("/captains/announcements");
    return { ok: true, data: { recipientCount: result.recipientCount } };
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
