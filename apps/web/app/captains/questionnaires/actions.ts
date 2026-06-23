"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BuilderQuestionnaire, Team } from "@camp404/types";
import type { ViewerRank } from "@camp404/types";
import { deriveViewerRank, requireClearance } from "@camp404/core";
import { isTeamLead } from "@camp404/db/roster";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import {
  closeActivation,
  publishDefinition,
  sendActivation,
  unpublishDefinition,
  type PublishResult,
} from "@camp404/db/questionnaire-lifecycle";
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
export type QResultWithActivation =
  | { ok: true; activationId: string }
  | { ok: false; error: string };
export type PublishActionResult = PublishResult;

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

type CaptainGate =
  | { ok: true; campUser: CampUser }
  | { ok: false; error: string };

/** Gate the lifecycle actions (publish / unpublish / send / close) to captains. */
async function gateCaptain(): Promise<CaptainGate> {
  const gate = await gateAuthor();
  if (!gate.ok) return gate;
  if (gate.rank !== "captain") {
    return { ok: false, error: "Only captains can publish or send." };
  }
  return { ok: true, campUser: gate.campUser };
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
  // Editing a PUBLISHED head is allowed (the §4.2 re-version flow): autosave
  // mutates the working head while the live snapshot keeps serving open
  // activations until the captain re-publishes. Ownership still gates team-leads.
  if (gate.rank === "captain") return { ok: true };
  if (meta.createdBy !== gate.campUser.id) {
    return { ok: false, error: "You can only edit your own questionnaires." };
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
  // Visibility gate: cloning reads the whole definition, so a non-captain may
  // only duplicate what the hub would show them (their own draft, or any
  // published/unpublished) — never another author's private draft. "Not found"
  // so foreign keys can't be probed.
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, error: "Questionnaire not found." };
  if (
    gate.rank !== "captain" &&
    meta.status === "draft" &&
    meta.createdBy !== gate.campUser.id
  ) {
    return { ok: false, error: "Questionnaire not found." };
  }
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

// --- Lifecycle: publish / unpublish / send / close (captain-only, Phase D) ---

export async function publishAction(key: string): Promise<PublishActionResult> {
  const gate = await gateCaptain();
  if (!gate.ok) return { ok: false, errors: [gate.error] };
  if (!Key.safeParse(key).success) return { ok: false, errors: ["Invalid key."] };
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, errors: ["Questionnaire not found."] };
  const result = await publishDefinition(key, gate.campUser.id);
  if (result.ok) revalidateBuilder(key);
  return result;
}

export async function unpublishAction(key: string): Promise<QResult> {
  const gate = await gateCaptain();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, error: "Questionnaire not found." };
  if (meta.status !== "published") {
    return {
      ok: false,
      error: "Only a published questionnaire can be unpublished.",
    };
  }
  const result = await unpublishDefinition(key);
  if (result.ok) revalidateBuilder(key);
  return result.ok ? { ok: true } : result;
}

const SendForm = z
  .object({
    scope: z.enum(["everyone", "team", "team_leads", "individual"]),
    team: Team.nullish(),
    blocking: z.boolean(),
    // ISO datetime string from the client, or null for no deadline.
    dueAt: z.string().datetime().nullish(),
    targetUserIds: z.array(z.string().uuid()).optional(),
  })
  .refine((d) => d.scope !== "team" || Boolean(d.team), {
    message: "Choose a team to send to.",
  })
  .refine(
    (d) => d.scope !== "individual" || (d.targetUserIds?.length ?? 0) > 0,
    { message: "Choose at least one member." },
  );

export async function sendAction(
  key: string,
  rawInput: unknown,
): Promise<QResultWithActivation> {
  const gate = await gateCaptain();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const parsed = SendForm.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid send settings.",
    };
  }
  const result = await sendActivation({
    questionnaireKey: key,
    scope: parsed.data.scope,
    team: parsed.data.team ?? null,
    blocking: parsed.data.blocking,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    activatedByUserId: gate.campUser.id,
    targetUserIds: parsed.data.targetUserIds,
  });
  if (!result.ok) return result;
  revalidateBuilder(key);
  return { ok: true, activationId: result.activationId };
}

export async function closeActivationAction(
  activationId: string,
  key?: string,
): Promise<QResult> {
  const gate = await gateCaptain();
  if (!gate.ok) return gate;
  if (!z.string().uuid().safeParse(activationId).success) {
    return { ok: false, error: "Invalid activation." };
  }
  const result = await closeActivation(activationId);
  if (result.ok) revalidateBuilder(key);
  return result;
}
