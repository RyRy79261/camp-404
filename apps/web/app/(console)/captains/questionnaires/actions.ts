"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Questionnaire, Team, questionsWithRole } from "@camp404/types";
import type { ViewerRank } from "@camp404/types";
import {
  CAMP_TIME_ZONE,
  canSendQuestionnaireTo,
  canViewBuilderDefinition,
  definitionLimitErrors,
  isQuestionnaireTemplateKey,
  mealPlanRatingRows,
  type AudienceSpec,
  type Actor,
} from "@camp404/core";
import type { GridRow } from "@camp404/types";
import { getMealPlan } from "@/lib/meal-plan";
import { carryOverFor } from "@camp404/db/cycles";
import { PUSH_SCOPES } from "@camp404/db/activations";
import { computeAudience } from "@camp404/db/audience";
import {
  getDefinitionMetaRow,
  setDefinitionAnonymousResults,
  setDefinitionCarryOver,
} from "@camp404/db/questionnaire-definitions";
import { getActivationById } from "@camp404/db/activations";
import {
  closeActivation,
  publishDefinition,
  sendActivation,
  getOpenActivationForKey,
  sendReminder,
  unpublishDefinition,
  type PublishResult,
} from "@camp404/db/questionnaire-lifecycle";
import { captainActionGate } from "@/lib/captain-gate";
import { canEditQuestionnaire } from "@/lib/questionnaire-authoring";
import type { CampUser } from "@/lib/users";
import { runAction } from "@/lib/action-result";
import { getCampManagementRoster } from "@/lib/roster";
import {
  createAttendanceCheck,
  createDraft,
  createDraftFromTemplate,
  getBuilderDefinition,
  deleteDraft,
  duplicateDefinition,
  updateDefinition,
} from "@/lib/questionnaire-definitions";
import { usesTestStore } from "@/lib/test-mode";
import { deliverAfterResponse } from "@/lib/background-work";

// Questionnaire-builder mutations. Team leads create and edit their OWN
// questionnaires, and send them; a captain may change any (owner, 2026-10-23:
// "Publish means send", and a lead sends to the whole camp). Sending publishes
// the author's latest version in the same press. Unpublishing, the year policy
// and the attendance check stay with captains. Each action does an
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

type AuthorGate =
  | { ok: true; campUser: CampUser; rank: ViewerRank; actor: Actor }
  | { ok: false; error: string };

/** Gate to >= team_lead clearance — the level that may author drafts. */
async function gateAuthor(): Promise<AuthorGate> {
  return captainActionGate("team_lead");
}

type CaptainGate =
  | { ok: true; campUser: CampUser }
  | { ok: false; error: string };

/** Gate the captain-only actions: unpublish, the year policy, the attendance check. */
async function gateCaptain(): Promise<CaptainGate> {
  return captainActionGate("captain", "Only captains can do this.");
}

/**
 * Gate a change to one questionnaire's life: a team lead or a captain who may
 * edit it (a captain any, a lead their own).
 */
async function gateEditor(
  key: string,
): Promise<{ ok: true; campUser: CampUser } | { ok: false; error: string }> {
  const gate = await gateAuthor();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const can = await canEditQuestionnaire(gate, key);
  return can.ok ? { ok: true, campUser: gate.campUser } : can;
}

// --- The send gate ----------------------------------------------------------
// Sending is gated in two moves:
//
//   1. `gateAuthor()`: the RANK gate. A plain camp member is refused here.
//   2. `canSendQuestionnaireTo()` (@camp404/core): the AUDIENCE gate. A team
//      lead may address any questionnaire audience a captain may, blocking
//      included (owner, 2026-10-23). This is the questionnaire's own rule:
//      announcements keep "a lead reaches only a team they lead".
//
// `sendActivation` asks the same rule again on the sender's rank read under
// lock in its own transaction, so a demotion between the two cannot slip
// through. Change the rule in @camp404/core, never here.

/** The refusal when the audience is not one this sender may address. */
const AUDIENCE_REFUSED =
  "Only team leads and captains can send a questionnaire.";
const ATTENDANCE_QUESTION_MISSING =
  'The "Coming this year?" questionnaire has lost its Yes / Maybe / No question. Open it in the builder and add a question marked "Coming this year", then try again.';

/** The audience half of the send gate: may this actor address this audience? */
function allowSendTo(gate: { actor: Actor }, audience: AudienceSpec): QResult {
  if (!canSendQuestionnaireTo(gate.actor, audience)) {
    return { ok: false, error: AUDIENCE_REFUSED };
  }
  return { ok: true };
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
  return canEditQuestionnaire(gate, key);
}

export async function createDraftAction(
  title: string,
): Promise<QResultWithKey> {
  return runAction("createDraftAction", async () => {
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
  });
}

/**
 * Start a draft from a ready-made template (#251): today the post-burn survey.
 * The same gate as a blank draft (a team lead or a captain); the draft is the
 * author's to edit, and nothing is published or sent. The survey's meal
 * ratings start with one row per meal this year's meal plan serves.
 */
export async function createFromTemplateAction(
  template: unknown,
): Promise<QResultWithKey> {
  return runAction("createFromTemplateAction", async () => {
    const gate = await gateAuthor();
    if (!gate.ok) return gate;
    if (!isQuestionnaireTemplateKey(template)) {
      return { ok: false, error: "That template doesn't exist." };
    }
    if (usesTestStore()) {
      return {
        ok: false,
        error: "Templates need the questionnaire builder's database.",
      };
    }
    const mealRows = mealPlanRatingRows(await getMealPlan());
    const key = await createDraftFromTemplate({
      template,
      createdBy: gate.campUser.id,
      mealRows,
    });
    revalidateBuilder(key);
    return { ok: true, key };
  });
}

export type MealRowsResult =
  | { ok: true; rows: GridRow[] }
  | { ok: false; error: string };

/**
 * The rows a rating grid gets from "Fill from meal plan" (#251): one per meal
 * this year's meal plan serves. Read-only; the builder puts them in the draft,
 * which saves like any other edit.
 */
export async function mealPlanRowsAction(): Promise<MealRowsResult> {
  return runAction("mealPlanRowsAction", async () => {
    const gate = await gateAuthor();
    if (!gate.ok) return gate;
    const rows = mealPlanRatingRows(await getMealPlan());
    if (rows.length === 0) {
      return {
        ok: false,
        error:
          "This year's meal plan has no meals yet. Add plates on the Meal plan page first.",
      };
    }
    return { ok: true, rows };
  });
}

/**
 * Save a questionnaire's working head (the builder's "Save draft").
 * `rawDefinition` is a unified `Questionnaire` (@camp404/types); it is stored in
 * that shape, and nothing else is accepted. A DRAFT may be incomplete — only the
 * schema and the size limits apply here; the publish rules run at publish.
 */
export async function updateDefinitionAction(
  key: string,
  rawDefinition: unknown,
): Promise<QResult> {
  return runAction("updateDefinitionAction", async () => {
    const gate = await gateAuthor();
    if (!gate.ok) return gate;
    if (!Key.safeParse(key).success)
      return { ok: false, error: "Invalid key." };
    const can = await assertCanEdit(gate, key);
    if (!can.ok) return can;
    const parsed = Questionnaire.safeParse(rawDefinition);
    if (!parsed.success) {
      return {
        ok: false,
        error: "The questionnaire is malformed and wasn't saved.",
      };
    }
    const definition = parsed.data;
    // The server's bounds: size, counts and image hosts. The editor cannot be
    // trusted to enforce them, because this action takes any POST.
    const tooBig = definitionLimitErrors(definition);
    if (tooBig.length > 0) return { ok: false, error: tooBig[0]! };
    await updateDefinition(key, definition);
    revalidateBuilder(key);
    return { ok: true };
  });
}

export async function duplicateDraftAction(
  key: string,
): Promise<QResultWithKey> {
  return runAction("duplicateDraftAction", async () => {
    const gate = await gateAuthor();
    if (!gate.ok) return gate;
    if (!Key.safeParse(key).success)
      return { ok: false, error: "Invalid key." };
    // Visibility gate: cloning reads the whole definition, so a non-captain may
    // only duplicate what the hub would show them (their own draft, or any
    // published/unpublished) — never another author's private draft. "Not found"
    // so foreign keys can't be probed.
    const meta = await getDefinitionMetaRow(key);
    if (!meta) return { ok: false, error: "Questionnaire not found." };
    if (
      !canViewBuilderDefinition(
        { rank: gate.rank, userId: gate.campUser.id },
        meta,
      )
    ) {
      return { ok: false, error: "Questionnaire not found." };
    }
    const newKey = await duplicateDefinition({
      key,
      createdBy: gate.campUser.id,
    });
    if (!newKey) {
      return { ok: false, error: "Couldn't duplicate this questionnaire." };
    }
    revalidateBuilder(newKey);
    return { ok: true, key: newKey };
  });
}

export async function deleteDraftAction(key: string): Promise<QResult> {
  return runAction("deleteDraftAction", async () => {
    const gate = await gateAuthor();
    if (!gate.ok) return gate;
    if (!Key.safeParse(key).success)
      return { ok: false, error: "Invalid key." };
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
    // A compare-and-set on `draft`: a captain who published it since the
    // read above wins, and nothing published is ever deleted.
    const deleted = await deleteDraft(key);
    revalidateBuilder();
    if (!deleted) {
      return {
        ok: false,
        error:
          "This questionnaire is no longer a draft: someone published or deleted it. The list is up to date now.",
      };
    }
    return { ok: true };
  });
}

// --- Lifecycle: publish / unpublish / send / close ---------------------------

const NO_OPEN_SEND =
  "This questionnaire has no open send. Use Send to choose who to ask.";

/**
 * Put the working head online (the builder's "Send changes", for a
 * questionnaire already out with members): its author or a captain. On
 * refusal, `errors` holds every reason as a sentence and `issues` the
 * definition's publish blockers with their code, path, page and block
 * (PublishResult in @camp404/db/questionnaire-lifecycle).
 */
export async function publishAction(key: string): Promise<PublishActionResult> {
  return runAction(
    "publishAction",
    async () => {
      const gate = await gateEditor(key);
      if (!gate.ok) return { ok: false, errors: [gate.error], issues: [] };
      const meta = await getDefinitionMetaRow(key);
      if (!meta) {
        return { ok: false, errors: ["Questionnaire not found."], issues: [] };
      }
      // "Send changes" is for a send that is out. A first send, or one after
      // a close, goes through `sendAction`, so nothing is ever online with
      // nobody asked.
      if (
        meta.status !== "published" ||
        !(await getOpenActivationForKey(key))
      ) {
        return { ok: false, errors: [NO_OPEN_SEND], issues: [] };
      }
      const result = await publishDefinition(key, gate.campUser.id);
      if (result.ok) revalidateBuilder(key);
      return result;
    },
    (message) => ({ ok: false, errors: [message], issues: [] }),
  );
}

/**
 * The hub's one click for "Coming this year?" (captain-only: only captains
 * publish and send). Creates the questionnaire under its fixed key when it is
 * absent, publishes it when it is not live, and returns its key so the hub can
 * open its Send page. It never sends: the captain picks the audience there
 * (Everyone reaches approved members only) and ticks Blocking, so they always
 * see who it will reach.
 */
export async function createAttendanceCheckAction(): Promise<QResultWithKey> {
  return runAction("createAttendanceCheckAction", async () => {
    const gate = await gateCaptain();
    if (!gate.ok) return gate;
    if (usesTestStore()) {
      return {
        ok: false,
        error:
          "The attendance check needs the questionnaire builder's database.",
      };
    }
    const key = await createAttendanceCheck(gate.campUser.id);
    const meta = await getDefinitionMetaRow(key);
    if (!meta) return { ok: false, error: "Questionnaire not found." };
    // A captain may have edited it in the builder. Without its Yes / Maybe / No
    // question it would publish and send, and set nobody's place this year.
    const definition = await getBuilderDefinition(key);
    if (
      !definition ||
      questionsWithRole(definition, "participation_intent").length === 0
    ) {
      return { ok: false, error: ATTENDANCE_QUESTION_MISSING };
    }
    // A draft is published here; so is one a captain unpublished, since this
    // button's purpose is to send it.
    if (meta.status !== "published") {
      const published = await publishDefinition(key, gate.campUser.id);
      if (!published.ok) {
        return {
          ok: false,
          error:
            published.errors[0] ??
            "The attendance check couldn't be published.",
        };
      }
    }
    revalidateBuilder(key);
    return { ok: true, key };
  });
}

export async function unpublishAction(key: string): Promise<QResult> {
  return runAction("unpublishAction", async () => {
    const gate = await gateCaptain();
    if (!gate.ok) return gate;
    if (!Key.safeParse(key).success)
      return { ok: false, error: "Invalid key." };
    const meta = await getDefinitionMetaRow(key);
    if (!meta) return { ok: false, error: "Questionnaire not found." };
    if (meta.status !== "published") {
      return {
        ok: false,
        error: "Only a published questionnaire can be unpublished.",
      };
    }
    const result = await unpublishDefinition(key, gate.campUser.id);
    if (result.ok) revalidateBuilder(key);
    return result.ok ? { ok: true } : result;
  });
}

const SendForm = z
  .object({
    // `opt_in` (#313): "Anyone may answer (optional)". Captains only; the
    // audience gate below refuses anyone else, and the write asks again.
    scope: z.enum(["everyone", "team", "team_leads", "individual", "opt_in"]),
    team: Team.nullish(),
    blocking: z.boolean(),
    // ISO datetime string from the client, or null for no deadline.
    dueAt: z.string().datetime().nullish(),
    targetUserIds: z.array(z.string().uuid()).optional(),
    // "Tell everyone it's there", for an optional questionnaire only.
    announce: z.boolean().optional(),
  })
  .refine((d) => d.scope !== "team" || Boolean(d.team), {
    message: "Choose a team to send to.",
  })
  .refine(
    (d) => d.scope !== "individual" || (d.targetUserIds?.length ?? 0) > 0,
    { message: "Choose at least one member." },
  );

/**
 * Send a questionnaire to an audience: one press that puts it online and asks
 * them ("Publish means send", owner 2026-10-23).
 *
 * A team lead or a captain (see the send gate above). Someone who may edit the
 * questionnaire (its author, or a captain) sends their latest version: it is
 * published first, and publishing's refusal comes back as the send's. Anyone
 * else may send a questionnaire that is already online, as it is.
 */
export async function sendAction(
  key: string,
  rawInput: unknown,
): Promise<QResultWithActivation> {
  return runAction("sendAction", async () => {
    const gate = await gateAuthor();
    if (!gate.ok) return gate;
    if (!Key.safeParse(key).success)
      return { ok: false, error: "Invalid key." };
    const parsed = SendForm.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid send settings.",
      };
    }
    const allowed = allowSendTo(gate, {
      scope: parsed.data.scope,
      team: parsed.data.team ?? null,
    });
    if (!allowed.ok) return allowed;
    const meta = await getDefinitionMetaRow(key);
    if (!meta) return { ok: false, error: "Questionnaire not found." };
    if ((await canEditQuestionnaire(gate, key)).ok) {
      const published = await publishDefinition(key, gate.campUser.id);
      if (!published.ok) {
        return {
          ok: false,
          error:
            published.errors[0] ??
            "This questionnaire can't go out yet. Open it in the editor to see why.",
        };
      }
    } else if (meta.status !== "published") {
      return {
        ok: false,
        error:
          "Only its author or a captain can send this questionnaire for the first time.",
      };
    }
    // An optional questionnaire asks nobody: it is never blocking, has no
    // deadline and names nobody, whatever the request says.
    const optIn = parsed.data.scope === "opt_in";
    const result = await sendActivation({
      questionnaireKey: key,
      scope: parsed.data.scope,
      team: optIn ? null : (parsed.data.team ?? null),
      blocking: optIn ? false : parsed.data.blocking,
      dueAt: !optIn && parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      activatedByUserId: gate.campUser.id,
      targetUserIds: optIn ? undefined : parsed.data.targetUserIds,
      announce: optIn ? (parsed.data.announce ?? false) : undefined,
    });
    if (!result.ok) return result;
    deliverAfterResponse();
    revalidateBuilder(key);
    return { ok: true, activationId: result.activationId };
  });
}

// --- The audience preview -------------------------------------------------
// A captain picking a scope currently sends into the dark: a `team` or
// `team_leads` send with no matching membership rows resolves to ZERO
// recipients and still toasts success. The preview is what turns that silent
// failure into a visible one — so it has to be computed by the SAME two things
// the real send is: this module's send gate (rank + audience), and
// `computeAudience`. A preview computed a different way is a preview that lies.

const PreviewSpec = z.object({
  // `opt_in` asks nobody; its count is the camp members who will see it under
  // Optional in My forms (the `everyone` audience), for captains only.
  scope: z.enum(["everyone", "team", "team_leads", "individual", "opt_in"]),
  team: Team.nullish(),
  targetUserIds: z.array(z.string().uuid()).optional(),
});

export type PreviewCountResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * How many members a send with these settings would reach, right now.
 *
 * The count is the SCOPE audience — the same list `openActivation` fans out
 * over. A `carry` questionnaire may reach fewer people than this once the
 * carry-over filter subtracts members who already answered at a satisfying
 * version (§7.3a); this is the ceiling, and the number the author is choosing.
 *
 * Every refusal above the gate costs ZERO database round-trips — the parse and
 * the scope check are pure, so the 300 ms debounced client can call this on
 * every keystroke of an audience edit without fanning out queries.
 */
export async function previewAudienceCount(
  rawSpec: unknown,
): Promise<PreviewCountResult> {
  const parsed = PreviewSpec.safeParse(rawSpec);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid audience.",
    };
  }
  // `const` destructuring, so the narrowing below survives into the closure.
  const { scope, targetUserIds = [] } = parsed.data;
  const team = parsed.data.team ?? null;
  if (scope !== "opt_in" && !PUSH_SCOPES.has(scope)) {
    return { ok: false, error: `Unsupported activation scope: ${scope}.` };
  }
  // An incomplete audience has no honest count yet. `ok:false` (not `count:0`)
  // — the caller hides the line rather than telling the author "0 members",
  // which they would rightly read as "this team is empty".
  if (scope === "team" && !team) {
    return { ok: false, error: "Choose a team to send to." };
  }
  if (scope === "individual" && targetUserIds.length === 0) {
    return { ok: false, error: "Choose at least one member." };
  }

  return runAction("previewAudienceCount", async () => {
    // The SAME two-move gate the real send runs — rank, then audience. A
    // preview that answered a question the send would refuse (or refused one it
    // would allow) is a preview that lies, so a lead sees a count for the team
    // they lead and a refusal for everything else, exactly as at Send.
    const gate = await gateAuthor();
    if (!gate.ok) return gate;
    const allowed = allowSendTo(gate, { scope, team });
    if (!allowed.ok) return allowed;

    // The roster read is already cycle-scoped (this year's teams and leads) and
    // already excludes system actors and sanitised accounts — the same three
    // facts openActivation reads out of users + team_memberships. Feeding it
    // through `computeAudience` means the preview and the send apply ONE rule.
    //
    // The roster is captain-only data, and a team lead can now reach this line.
    // Nothing of it crosses the boundary: the only value returned is a COUNT,
    // and the audience it counts is one the gate above has already said this
    // actor may address — for a lead, the size of the team they lead.
    const roster = await getCampManagementRoster();
    const count = computeAudience(
      // An optional questionnaire shows to the whole camp: count `everyone`.
      { scope: scope === "opt_in" ? "everyone" : scope, team },
      {
        members: roster.map((m) => ({
          id: m.id,
          isSystem: false,
          sanitised: false,
          approvalStatus: m.approvalStatus,
        })),
        memberships: roster.flatMap((m) =>
          m.teams.map((t) => ({ userId: m.id, team: t, isLead: m.isLead })),
        ),
        // A questionnaire never targets the driver axis, and an activation has
        // no sender to exclude — both match openActivation's call.
        driverUserIds: [],
        targetUserIds,
      },
      null,
    ).length;
    return { ok: true, count };
  });
}

/**
 * Gate a change to an open send (close it, remind it): its questionnaire's
 * author or a captain, the people who may send it again.
 */
async function gateSendOwner(
  activationId: string,
): Promise<{ ok: true; campUser: CampUser } | { ok: false; error: string }> {
  const activation = await getActivationById(activationId);
  if (!activation) return { ok: false, error: "That send no longer exists." };
  return gateEditor(activation.questionnaireKey);
}

export async function closeActivationAction(
  activationId: string,
  key?: string,
): Promise<QResult> {
  return runAction("closeActivationAction", async () => {
    if (!z.string().uuid().safeParse(activationId).success) {
      return { ok: false, error: "Invalid activation." };
    }
    const gate = await gateSendOwner(activationId);
    if (!gate.ok) return gate;
    const result = await closeActivation(activationId, gate.campUser.id);
    if (result.ok) revalidateBuilder(key);
    return result;
  });
}

// --- The year policy: does this questionnaire ask again next year? ----------
// `questionnaire_definitions.carry_over` is a COLUMN rather than a field inside
// the definition JSON precisely so flipping it needs no re-publish: it never
// changes what a member is asked, only whether they are asked again after a
// rollover. Nor does it reach a send already in flight — sendActivation freezes
// a copy onto the activation, and every downstream read uses that copy.

export type CarryOverResult =
  | { ok: true; carryOver: boolean }
  | { ok: false; error: string };

/**
 * Read one questionnaire's year policy for the lifecycle bar. `carryOver: true`
 * means a rollover leaves it alone; false means everyone in scope answers it
 * again on a blank form the next time the camp starts a new year.
 */
export async function getCarryOverAction(
  key: string,
): Promise<CarryOverResult> {
  return runAction("getCarryOverAction", async () => {
    const gate = await gateCaptain();
    if (!gate.ok) return gate;
    if (!Key.safeParse(key).success)
      return { ok: false, error: "Invalid key." };
    return { ok: true, carryOver: (await carryOverFor(key)) === "carry" };
  });
}

/**
 * Set one questionnaire's year policy. `updated_at` is deliberately not bumped
 * — see setDefinitionCarryOver.
 */
export async function setCarryOverAction(
  key: string,
  carryOver: boolean,
): Promise<QResult> {
  return runAction("setCarryOverAction", async () => {
    const gate = await gateCaptain();
    if (!gate.ok) return gate;
    if (!Key.safeParse(key).success)
      return { ok: false, error: "Invalid key." };
    const parsedFlag = z.boolean().safeParse(carryOver);
    if (!parsedFlag.success) return { ok: false, error: "Invalid request." };
    const meta = await getDefinitionMetaRow(key);
    if (!meta) return { ok: false, error: "Questionnaire not found." };

    await setDefinitionCarryOver(key, parsedFlag.data, gate.campUser.id);
    revalidateBuilder(key);
    return { ok: true };
  });
}

// --- Reminders (§7.4) ------------------------------------------------------
// A captain looking at a half-answered questionnaire needs one button that
// nudges the people who have not replied. The interesting half of it is the
// REFUSALS: a reminder that fires twice is worse than no reminder at all, so
// the two ways this does nothing — everyone has answered, and everyone was
// already nudged today — each come back `ok: true` with a sentence saying so.
// A silent no-op would leave the captain tapping again.

const NEXT_NUDGE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CAMP_TIME_ZONE,
});

export type ReminderActionResult =
  | { ok: true; sent: number; message: string }
  | { ok: false; error: string };

/**
 * Nudge every member with a pending required action for this open send.
 *
 * Its questionnaire's author or a captain: the people who may send it.
 *
 * Nothing is revalidated on the way out — a reminder changes no number on the
 * metrics page (the gates it targets stay exactly as pending as they were), so
 * a `revalidatePath` here would re-render the surface to prove nothing moved.
 */
export async function remindPendingAction(
  activationId: string,
): Promise<ReminderActionResult> {
  return runAction("remindPendingAction", async () => {
    if (!z.string().uuid().safeParse(activationId).success) {
      return { ok: false, error: "Invalid activation." };
    }
    const gate = await gateSendOwner(activationId);
    if (!gate.ok) return gate;
    const result = await sendReminder({
      activationId,
      senderId: gate.campUser.id,
    });
    if (!result.ok) return result;
    deliverAfterResponse();

    if (result.outcome === "nobody_pending") {
      return {
        ok: true as const,
        sent: 0,
        message:
          "Everyone who was asked has already answered — there was nobody to remind.",
      };
    }
    if (result.outcome === "recently_reminded") {
      const who =
        result.suppressed === 1
          ? "The one member still outstanding was"
          : `All ${result.suppressed} members still outstanding were`;
      return {
        ok: true as const,
        sent: 0,
        message: `${who} reminded in the last 24 hours, so nothing was sent. You can nudge again from ${NEXT_NUDGE.format(result.nextAllowedAt)}.`,
      };
    }

    const sent = `Reminded ${result.sent} ${result.sent === 1 ? "member" : "members"}.`;
    return {
      ok: true as const,
      sent: result.sent,
      message:
        result.suppressed === 0
          ? sent
          : `${sent} ${result.suppressed} more ${result.suppressed === 1 ? "was" : "were"} skipped — already reminded in the last 24 hours.`,
    };
  });
}

/**
 * Set whether the members who answered read this questionnaire's results
 * without names: its author or a captain. Captains always read names.
 */
export async function setAnonymousResultsAction(
  key: string,
  anonymous: boolean,
): Promise<QResult> {
  return runAction("setAnonymousResultsAction", async () => {
    const gate = await gateEditor(key);
    if (!gate.ok) return gate;
    const parsedFlag = z.boolean().safeParse(anonymous);
    if (!parsedFlag.success) return { ok: false, error: "Invalid request." };
    const outcome = await setDefinitionAnonymousResults(
      key,
      parsedFlag.data,
      gate.campUser.id,
    );
    if (outcome === "missing") {
      return { ok: false, error: "Questionnaire not found." };
    }
    if (outcome === "answered") {
      return {
        ok: false,
        error:
          "People already answered this with no names, so names stay hidden.",
      };
    }
    revalidateBuilder(key);
    return { ok: true };
  });
}
