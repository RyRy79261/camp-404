"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BuilderQuestionnaire } from "@camp404/types";
import type { ViewerRank } from "@camp404/types";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { isTeamLead } from "@camp404/db/roster";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import {
  createDraft,
  deleteDraft,
  duplicateDefinition,
  updateDefinition,
} from "@/lib/questionnaire-definitions";

// Questionnaire-builder mutations (Phase C). Team-leads may create and edit
// their OWN drafts; only captains publish/send (Phase D). Each action does an
// auth + clearance gate, a Zod boundary parse, an ownership check where it
// matters, then the write + revalidate — the same preview-but-locked (D3)
// comparator the captain pages gate on (server actions are reachable
// independently of a page render, so the gate lives here too).

export type QResult = { ok: true } | { ok: false; error: string };
export type QResultWithKey =
  | { ok: true; key: string }
  | { ok: false; error: string };

type CampUser = Awaited<ReturnType<typeof ensureCampUser>>;
type AuthorGate =
  | { ok: true; campUser: CampUser; rank: ViewerRank }
  | { ok: false; error: string };

/** Gate to >= team_lead clearance — the level that may author drafts. */
async function gateAuthor(): Promise<AuthorGate> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account is still awaiting approval." };
  }
  const rank = deriveViewerRank(campUser.rank, await isTeamLead(campUser.id));
  if (!requireClearance(rank, "team_lead").cleared) {
    return { ok: false, error: "Team-lead access only." };
  }
  return { ok: true, campUser, rank };
}

const Title = z
  .string()
  .trim()
  .min(1, "Give it a name.")
  .max(120, "Keep the name under 120 characters.");
const Key = z.string().min(1);

function revalidateBuilder(key?: string): void {
  revalidatePath("/captains/questionnaires");
  if (key) revalidatePath(`/captains/questionnaires/${key}`);
}

/** Captain-any / team-lead-own edit guard for an existing definition. */
async function assertCanEdit(
  gate: { campUser: CampUser; rank: ViewerRank },
  key: string,
): Promise<QResult> {
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, error: "Questionnaire not found." };
  if (gate.rank === "captain") return { ok: true };
  if (meta.createdBy !== gate.campUser.id) {
    return { ok: false, error: "You can only edit your own drafts." };
  }
  return { ok: true };
}

export async function createDraftAction(
  title: string,
): Promise<QResultWithKey> {
  const gate = await gateAuthor();
  if (!gate.ok) return gate;
  const parsed = Title.safeParse(title);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid name.",
    };
  }
  const key = await createDraft({
    title: parsed.data,
    createdBy: gate.campUser.id,
  });
  revalidateBuilder(key);
  return { ok: true, key };
}

export async function updateDefinitionAction(
  key: string,
  rawDefinition: unknown,
): Promise<QResult> {
  const gate = await gateAuthor();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const can = await assertCanEdit(gate, key);
  if (!can.ok) return can;
  const parsed = BuilderQuestionnaire.safeParse(rawDefinition);
  if (!parsed.success) {
    return {
      ok: false,
      error: "The questionnaire is malformed and wasn't saved.",
    };
  }
  await updateDefinition(key, parsed.data);
  revalidateBuilder(key);
  return { ok: true };
}

export async function duplicateDraftAction(
  key: string,
): Promise<QResultWithKey> {
  const gate = await gateAuthor();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const newKey = await duplicateDefinition({ key, createdBy: gate.campUser.id });
  if (!newKey) {
    return { ok: false, error: "Couldn't duplicate this questionnaire." };
  }
  revalidateBuilder(newKey);
  return { ok: true, key: newKey };
}

export async function deleteDraftAction(key: string): Promise<QResult> {
  const gate = await gateAuthor();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, error: "Questionnaire not found." };
  if (gate.rank !== "captain" && meta.createdBy !== gate.campUser.id) {
    return { ok: false, error: "You can only delete your own drafts." };
  }
  if (meta.status !== "draft") {
    return {
      ok: false,
      error: "Only drafts can be deleted — unpublish it first.",
    };
  }
  await deleteDraft(key);
  revalidateBuilder();
  return { ok: true };
}
