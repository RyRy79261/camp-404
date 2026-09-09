"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BuilderQuestionnaire, Team } from "@camp404/types";
import type { ViewerRank } from "@camp404/types";
import {
  canSendToAudience,
  deriveViewerRank,
  requireClearance,
  type AudienceSpec,
} from "@camp404/core";
import { carryOverFor } from "@camp404/db/cycles";
import { PUSH_SCOPES } from "@camp404/db/activations";
import { computeAudience } from "@camp404/db/audience";
import {
  getDefinitionMetaRow,
  setDefinitionCarryOver,
} from "@camp404/db/questionnaire-definitions";
import {
  closeActivation,
  publishDefinition,
  sendActivation,
  sendReminder,
  unpublishDefinition,
  type PublishResult,
} from "@camp404/db/questionnaire-lifecycle";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  ensureCampUser,
  getLeadTeams,
  hasCampAccess,
  isApproved,
  isTeamLead,
} from "@/lib/users";
import { runAction } from "@/lib/action-result";
import { getCampManagementRoster } from "@/lib/roster";
import {
  createDraft,
  deleteDraft,
  duplicateDefinition,
  updateDefinition,
} from "@/lib/questionnaire-definitions";

// Questionnaire-builder mutations (Phase C). Team-leads may create and edit
// their OWN drafts, and SEND to a team they lead (see the send gate below);
// publish / unpublish / close stay captain-only (Phase D). Each action does an
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

// --- The send gate ----------------------------------------------------------
// Sending is the one lifecycle step that is NOT captain-only. It is gated in
// two moves, deliberately, because this is the widest thing a non-captain can
// do in the app:
//
//   1. `gateAuthor()` — the RANK gate. Still a gate, just one rung lower: a
//      plain camp member is refused here and never reaches step 2.
//   2. `canSendToAudience()` — the AUDIENCE gate. A team lead may address ONE
//      thing: a `team` scope they themselves lead. `everyone`, `team_leads`,
//      `drivers`, `individual` and `opt_in` are all refused, so there is no
//      arrangement of the form that reaches the whole camp.
//
// Dropping the gate to `team_lead` WITHOUT step 2 would have put every member
// of the camp one questionnaire away from a lead; the audience rule is what
// makes the widening safe, and it lives in @camp404/core (pure, tested) so it
// is stated once rather than re-derived here. Change the rule there.
//
// NOTE — the UI half is deliberately NOT built. `[key]/send/page.tsx` still
// requires `captain`, so no team lead can currently reach this action through
// the app; it is fail-safe, not live. The owner ratified that `team_lead` is a
// sitewide role (AGENTS.md), which is a statement about CLEARANCE — it is not
// a decision that leads may message the camp, and that decision has not been
// made. Opening the send screen to leads needs a lead-narrowed scope picker
// and an explicit yes. Do not read the rank gate here as permission to widen
// the page.

/** The refusal a lead sees when the audience is wider than the team they lead. */
const AUDIENCE_REFUSED = "You can only send to a team you lead.";

/**
 * The audience half of the send gate: may this actor address this audience?
 *
 * Captains are allowed by RANK, never by membership — so their check costs no
 * membership read at all. Everyone else is checked against the teams they lead
 * THIS year, which is the only per-team fact in the system; clearance itself
 * stays global (owner-ratified).
 */
async function allowSendTo(
  gate: { campUser: CampUser; rank: ViewerRank },
  audience: AudienceSpec,
): Promise<QResult> {
  const leadTeams =
    gate.rank === "captain" ? [] : await getLeadTeams(gate.campUser.id);
  if (!canSendToAudience({ rank: gate.rank, leadTeams }, audience)) {
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

/**
 * Send a published questionnaire to an audience.
 *
 * Captain OR team lead — the one lifecycle action that admits a lead, and only
 * to a team they lead (see the send-gate note above). The rank gate runs first
 * so a plain member is refused without the form being parsed; the audience gate
 * runs on the PARSED audience, because "which team" is the whole question.
 */
export async function sendAction(
  key: string,
  rawInput: unknown,
): Promise<QResultWithActivation> {
  const gate = await gateAuthor();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const parsed = SendForm.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid send settings.",
    };
  }
  const allowed = await allowSendTo(gate, {
    scope: parsed.data.scope,
    team: parsed.data.team ?? null,
  });
  if (!allowed.ok) return allowed;
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

// --- The audience preview -------------------------------------------------
// A captain picking a scope currently sends into the dark: a `team` or
// `team_leads` send with no matching membership rows resolves to ZERO
// recipients and still toasts success. The preview is what turns that silent
// failure into a visible one — so it has to be computed by the SAME two things
// the real send is: this module's send gate (rank + audience), and
// `computeAudience`. A preview computed a different way is a preview that lies.

const PreviewSpec = z.object({
  // Deliberately accepts `opt_in` so the preview can REFUSE it the way
  // openActivation does, rather than reporting a count for a scope that cannot
  // send at all. Every other questionnaire scope is a push scope.
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
  if (scope === "opt_in") {
    // Mirrors openActivation exactly — opt_in is a pull model with no upfront
    // fan-out, so there is no audience to count.
    return { ok: false, error: "opt_in activations are not yet supported." };
  }
  if (!PUSH_SCOPES.has(scope)) {
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
    const allowed = await allowSendTo(gate, { scope, team });
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
      { scope, team },
      {
        members: roster.map((m) => ({
          id: m.id,
          isSystem: false,
          sanitised: false,
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
  const gate = await gateCaptain();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  return { ok: true, carryOver: (await carryOverFor(key)) === "carry" };
}

/**
 * Set one questionnaire's year policy. `updated_at` is deliberately not bumped
 * — see setDefinitionCarryOver.
 */
export async function setCarryOverAction(
  key: string,
  carryOver: boolean,
): Promise<QResult> {
  const gate = await gateCaptain();
  if (!gate.ok) return gate;
  if (!Key.safeParse(key).success) return { ok: false, error: "Invalid key." };
  const parsedFlag = z.boolean().safeParse(carryOver);
  if (!parsedFlag.success) return { ok: false, error: "Invalid request." };
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, error: "Questionnaire not found." };

  await setDefinitionCarryOver(key, parsedFlag.data);
  revalidateBuilder(key);
  return { ok: true };
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
});

export type ReminderActionResult =
  | { ok: true; sent: number; message: string }
  | { ok: false; error: string };

/**
 * Nudge every member with a pending required action for this open send.
 *
 * Captain-only, like every other lifecycle action here: a reminder is a push to
 * an audience the sender did not choose member-by-member, and §4.1 keeps that
 * on the captain side of the clearance split.
 *
 * Nothing is revalidated on the way out — a reminder changes no number on the
 * metrics page (the gates it targets stay exactly as pending as they were), so
 * a `revalidatePath` here would re-render the surface to prove nothing moved.
 */
export async function remindPendingAction(
  activationId: string,
): Promise<ReminderActionResult> {
  const gate = await gateCaptain();
  if (!gate.ok) return gate;
  if (!z.string().uuid().safeParse(activationId).success) {
    return { ok: false, error: "Invalid activation." };
  }
  return runAction("remindPendingAction", async () => {
    const result = await sendReminder({
      activationId,
      senderId: gate.campUser.id,
    });
    if (!result.ok) return result;

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
