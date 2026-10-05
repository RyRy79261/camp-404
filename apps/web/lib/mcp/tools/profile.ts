import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { createHttpDb, withTransaction } from "@camp404/db";
import { satisfyRequiredAction } from "@camp404/db/activations";
import {
  getBurnerProfileByUserId,
  getEmergencyContactsColumn,
  getIdDocumentColumns,
  saveBurnerProfileReplay,
} from "@camp404/db/burner-profile";
import { encryptLeftoverIdNumber } from "@camp404/db/maintenance";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import {
  ID_NUMBER_KEY,
  ID_TYPE_KEY,
  splitIdNumber,
} from "@camp404/db/id-documents";
import { SEATS_BELOW_RIDERS } from "@camp404/db/transport";
import {
  DIETS,
  EmergencyContact,
  KITCHEN_ALLERGENS,
  MAX_EMERGENCY_CONTACTS,
  SaveDietaryInput,
  diffResponses,
  flattenQuestions,
  incompleteContactErrors,
  mergeEmergencyContacts,
  questionIdForRole,
  questionLabel,
  questionsWithRole,
  splitEmergencyContacts,
  telegramHandleFromResponses,
  validateResponses,
  type Questionnaire,
  type QuestionnaireResponses,
} from "@camp404/types";
import { getMyDietary, saveMyDietary } from "../../dietary";
import { identityAnswerErrors } from "../../id-validation";
import { QUESTIONNAIRE_VERSION } from "../../questionnaire";
import { getQuestionnaireForResponses } from "../../questionnaire-config";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

const MembershipTierEnum = z.enum(schema.membershipTierEnum.enumValues);

/** Where a member gives their ID number: the burner profile form, on the website. */
const BURNER_PROFILE_FORM = "/tools/forms/burner_profile";

export function registerProfileTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // Burner profile (onboarding questionnaire responses)
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_my_burner_profile",
    {
      title: "Get my burner profile",
      description:
        "Returns the current user's burner_profiles row — the long-lived onboarding questionnaire responses + completion state.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_burner_profile",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .select()
            .from(schema.burnerProfiles)
            .where(eq(schema.burnerProfiles.userId, scope.campUserId))
            .limit(1);
          if (!row) return null;
          // Never an ID number, should an old row still hold one in its
          // answers: the connector has no path to ID numbers (owner, 2026-10-05).
          return {
            ...row,
            responses: splitIdNumber(row.responses as Record<string, unknown>)
              .cleaned,
          };
        },
      }),
  );

  server.registerTool(
    "update_my_burner_profile",
    {
      title: "Update my burner profile",
      description:
        "Changes answers on your burner profile: the same save as My forms → Burner profile on the website. Pass only the answers to change, keyed by question id as get_my_burner_profile returns them; every other answer is kept. The whole profile is then checked as the website checks it, and the change goes in the form's change log. Never an ID number or its type, and never the profile photo: those are on the website's burner profile form.",
      inputSchema: {
        responses: z.record(z.string(), z.unknown()),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_burner_profile",
        extra,
        // Which answers, never what they say: this log outlives an erasure's
        // answers.
        argsForAudit: { fields: Object.keys(args.responses) },
        handler: async ({ scope }) =>
          await saveBurnerProfilePatch(scope.campUserId, args.responses),
      }),
  );

  // -------------------------------------------------------------------------
  // Dietary requirements
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_my_dietary_requirements",
    {
      title: "Get my dietary requirements",
      description:
        "Your dietary pick-list, as My forms → Dietary needs shows it: `foods` (each food you react to and how: allergy, intolerance or anaphylaxis), `diets`, when you last saved it, and `old`: the words from the old free-text form, if any, which the Kitchen's allergy check does not read (pick those foods again to count them).",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_dietary_requirements",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => await getMyDietary(scope.campUserId),
      }),
  );

  server.registerTool(
    "update_my_dietary_requirements",
    {
      title: "Update my dietary requirements",
      description: `Saves your dietary pick-list, the same save as My forms → Dietary needs: the whole list of foods you react to (each once, with how it affects you; anaphylaxis is the hard stop the Kitchen plans around) and your diets. It replaces what was saved. The meal plan's allergy check and the daily site sheet read it. Foods: ${KITCHEN_ALLERGENS.join(", ")}. Diets: ${DIETS.join(", ")}. Only you, captains and team leads can see it.`,
      inputSchema: {
        foods: SaveDietaryInput.shape.foods,
        diets: SaveDietaryInput.shape.diets,
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_dietary_requirements",
        extra,
        // Health data stays out of the connector's log: counts only.
        argsForAudit: {
          foods: args.foods.length,
          diets: args.diets.length,
        },
        handler: async ({ scope }) => {
          const parsed = SaveDietaryInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ?? "Check the foods and diets.",
            );
          }
          const result = await saveMyDietary({
            userId: scope.campUserId,
            ...parsed.data,
          });
          if (!result.ok) throw new ToolError(result.error);
          return await getMyDietary(scope.campUserId);
        },
      }),
  );

  // -------------------------------------------------------------------------
  // Driver profile (vehicle + lift offer + driving experience)
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_my_driver_profile",
    {
      title: "Get my driver profile",
      description:
        "Returns the current user's driver_profiles row — intent to drive, vehicle details, seats, lift offer.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_driver_profile",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          // driver_profiles is one row per driver PER YEAR, so this asks for
          // this year's. Without the predicate the ORDER BY-less `.limit(1)`
          // would return an arbitrary year's vehicle.
          const [row] = await db
            .select()
            .from(schema.driverProfiles)
            .where(
              and(
                eq(schema.driverProfiles.userId, scope.campUserId),
                eq(schema.driverProfiles.cycle, await currentCycleNumber()),
              ),
            )
            .limit(1);
          return row ?? null;
        },
      }),
  );

  server.registerTool(
    "update_my_driver_profile",
    {
      title: "Update my driver profile",
      description:
        "Upserts the current user's driver profile for this year. Setting `intendsToDrive: true` for the first time triggers the driver-detail questionnaire gate in the web app on next sign-in. Refused when `seatsOffered` is below the riders already in your car: take someone out first (remove_car_rider).",
      inputSchema: {
        version: z.string().min(1),
        intendsToDrive: z.boolean(),
        vehicleMake: z.string().nullable().optional(),
        vehicleModel: z.string().nullable().optional(),
        vehicleRegistration: z.string().nullable().optional(),
        seatsTotal: z.number().int().min(0).max(20).nullable().optional(),
        seatsOffered: z.number().int().min(0).max(20).nullable().optional(),
        canOfferLifts: z.boolean().default(false),
        offroadExperienced: z.boolean().default(false),
        canTow: z.boolean().default(false),
        proficiencyNotes: z.string().nullable().optional(),
        departureCity: z.string().nullable().optional(),
        arrivalAt: z.string().datetime().nullable().optional(),
        departureAt: z.string().datetime().nullable().optional(),
        notes: z.string().nullable().optional(),
        markComplete: z.boolean().optional().default(false),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_driver_profile",
        extra,
        argsForAudit: {
          version: args.version,
          intendsToDrive: args.intendsToDrive,
          canOfferLifts: args.canOfferLifts,
        },
        handler: async ({ scope }) => {
          const now = new Date();
          // The year this profile belongs to. Driving is a year-scoped fact —
          // "who's driving in whose car ... [has] to be fresh" — so the upsert
          // targets this year's row and leaves last year's on file.
          const cycle = await currentCycleNumber();
          const arrivalAt = args.arrivalAt ? new Date(args.arrivalAt) : null;
          const departureAt = args.departureAt
            ? new Date(args.departureAt)
            : null;
          // One transaction, the Transport page's lock: this year's profile
          // row FOR UPDATE (every seat write takes it first), so the riders
          // counted below are the car as this save lands. Never fewer seats
          // than riders already in (SEATS_BELOW_RIDERS, as setSeatsOffered).
          const row = await withTransaction(async (tx) => {
            const [existing] = await tx
              .select({
                intentRegisteredAt: schema.driverProfiles.intentRegisteredAt,
              })
              .from(schema.driverProfiles)
              .where(
                and(
                  eq(schema.driverProfiles.userId, scope.campUserId),
                  eq(schema.driverProfiles.cycle, cycle),
                ),
              )
              .for("update");
            if (args.seatsOffered !== undefined && args.seatsOffered !== null) {
              const [seated] = await tx
                .select({ riders: count() })
                .from(schema.carMembers)
                .where(
                  and(
                    eq(schema.carMembers.driverUserId, scope.campUserId),
                    eq(schema.carMembers.cycle, cycle),
                  ),
                );
              if ((seated?.riders ?? 0) > args.seatsOffered) {
                throw new ToolError(SEATS_BELOW_RIDERS);
              }
            }
            const intentRegisteredAt =
              args.intendsToDrive && !existing?.intentRegisteredAt
                ? now
                : (existing?.intentRegisteredAt ?? null);

            const [saved] = await tx
              .insert(schema.driverProfiles)
              .values({
                userId: scope.campUserId,
                cycle,
                version: args.version,
                intendsToDrive: args.intendsToDrive,
                intentRegisteredAt,
                vehicleMake: args.vehicleMake ?? null,
                vehicleModel: args.vehicleModel ?? null,
                vehicleRegistration: args.vehicleRegistration ?? null,
                seatsTotal: args.seatsTotal ?? null,
                seatsOffered: args.seatsOffered ?? null,
                canOfferLifts: args.canOfferLifts,
                offroadExperienced: args.offroadExperienced,
                canTow: args.canTow,
                proficiencyNotes: args.proficiencyNotes ?? null,
                departureCity: args.departureCity ?? null,
                arrivalAt,
                departureAt,
                notes: args.notes ?? null,
                completedAt: args.markComplete ? now : null,
              })
              .onConflictDoUpdate({
                // Must name the WHOLE primary key: it is (user_id, cycle) now,
                // and `user_id` alone no longer has a unique constraint for
                // Postgres to match this ON CONFLICT against.
                target: [
                  schema.driverProfiles.userId,
                  schema.driverProfiles.cycle,
                ],
                set: {
                  version: args.version,
                  intendsToDrive: args.intendsToDrive,
                  intentRegisteredAt,
                  vehicleMake: args.vehicleMake ?? null,
                  vehicleModel: args.vehicleModel ?? null,
                  vehicleRegistration: args.vehicleRegistration ?? null,
                  seatsTotal: args.seatsTotal ?? null,
                  seatsOffered: args.seatsOffered ?? null,
                  canOfferLifts: args.canOfferLifts,
                  offroadExperienced: args.offroadExperienced,
                  canTow: args.canTow,
                  proficiencyNotes: args.proficiencyNotes ?? null,
                  departureCity: args.departureCity ?? null,
                  arrivalAt,
                  departureAt,
                  notes: args.notes ?? null,
                  updatedAt: now,
                  ...(args.markComplete ? { completedAt: now } : {}),
                },
              })
              .returning();
            return saved;
          });
          if (args.markComplete) {
            await satisfyRequiredAction(
              scope.campUserId,
              "driver_profile",
              args.version,
            );
          }
          return row;
        },
      }),
  );

  // -------------------------------------------------------------------------
  // Emergency contacts (plaintext JSONB on users)
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_my_emergency_contacts",
    {
      title: "Get my emergency contacts",
      description: "Returns the user's emergency_contacts list (plaintext).",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_emergency_contacts",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) =>
          (await getEmergencyContactsColumn(scope.campUserId)) ?? [],
      }),
  );

  server.registerTool(
    "update_my_emergency_contacts",
    {
      title: "Update my emergency contacts",
      description: `Replaces your whole emergency contacts list: at least one, at most ${MAX_EMERGENCY_CONTACTS}. They are your burner profile's contact answers, saved the same way (checked, and recorded in its change log). Each contact needs a name, a phone number with 7 to 15 digits (include the country code) and how you know them.`,
      inputSchema: {
        // The website's rules for a contact (@camp404/types).
        contacts: z
          .array(EmergencyContact)
          .min(1, CONTACT_REQUIRED)
          .max(MAX_EMERGENCY_CONTACTS),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_emergency_contacts",
        extra,
        argsForAudit: { count: args.contacts.length },
        handler: async ({ scope }) => {
          // Checked again here: the shape above is advice to the caller.
          const parsed = z
            .array(EmergencyContact)
            .min(1, CONTACT_REQUIRED)
            .max(MAX_EMERGENCY_CONTACTS)
            .safeParse(args.contacts);
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ?? "Check your contacts.",
            );
          }
          // The contacts are the burner profile's contact questions, so they
          // are saved as those answers: checked as the website checks them
          // (the first contact is required), logged, and compare-and-set.
          await saveBurnerProfilePatch(
            scope.campUserId,
            await contactAnswers(parsed.data),
          );
          return parsed.data;
        },
      }),
  );

  // -------------------------------------------------------------------------
  // Membership tier (self-only writable; matches existing app flow)
  // -------------------------------------------------------------------------

  server.registerTool(
    "set_my_membership_tier",
    {
      title: "Set my membership tier",
      description:
        "Pick between 'full' (whole event) and 'build_week_only'. Setting this is a member-side choice; payment status is captain-managed.",
      inputSchema: {
        tier: MembershipTierEnum,
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "set_my_membership_tier",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .update(schema.users)
            .set({ membershipTier: args.tier, updatedAt: new Date() })
            .where(eq(schema.users.id, scope.campUserId))
            .returning({ tier: schema.users.membershipTier });
          return row;
        },
      }),
  );

  // -------------------------------------------------------------------------
  // Skills + previous-burn history
  // -------------------------------------------------------------------------

  server.registerTool(
    "update_my_history",
    {
      title: "Update my burn history + skills",
      description:
        "Free-form fields about who you are: skills array, previous Afrikaburn / Burning Man counts, first-time flag.",
      inputSchema: {
        skills: z.array(z.string()).optional(),
        previousAfrikaburns: z.number().int().min(0).optional(),
        previousBurningMans: z.number().int().min(0).optional(),
        firstTime: z.boolean().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_history",
        extra,
        // Which fields changed, never the values: this log outlives an erasure.
        argsForAudit: {
          fields: Object.keys(args).filter(
            (key) => args[key as keyof typeof args] !== undefined,
          ),
        },
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const patch: Partial<typeof schema.users.$inferInsert> = {
            updatedAt: new Date(),
          };
          if (args.skills !== undefined) patch.skills = args.skills;
          if (args.previousAfrikaburns !== undefined)
            patch.previousAfrikaburns = args.previousAfrikaburns;
          if (args.previousBurningMans !== undefined)
            patch.previousBurningMans = args.previousBurningMans;
          if (args.firstTime !== undefined) patch.firstTime = args.firstTime;
          const [row] = await db
            .update(schema.users)
            .set(patch)
            .where(eq(schema.users.id, scope.campUserId))
            .returning({
              skills: schema.users.skills,
              previousAfrikaburns: schema.users.previousAfrikaburns,
              previousBurningMans: schema.users.previousBurningMans,
              firstTime: schema.users.firstTime,
            });
          return row;
        },
      }),
  );
}

/** The website requires the first contact (the burner profile's question). */
const CONTACT_REQUIRED =
  "Keep at least one emergency contact: the burner profile requires one.";

/** Where a member who has not finished their burner profile finishes it. */
const ONBOARDING_FORM = "/onboarding/questionnaire";
/** Where a member uploads their profile photo. */
const PROFILE_PHOTO_PAGE = "/profile/edit";

/**
 * The burner profile's contact answers for a whole list of contacts: slot N
 * from contact N, and an unused slot emptied.
 */
async function contactAnswers(
  contacts: readonly EmergencyContact[],
): Promise<Record<string, unknown>> {
  const questionnaire = await getQuestionnaireForResponses();
  const roles = [
    ["emergency_contact_name", "name"],
    ["emergency_contact_phone", "phone"],
    ["emergency_contact_relationship", "relationship"],
  ] as const;
  const answers: Record<string, unknown> = {};
  for (const [role, field] of roles) {
    questionsWithRole(questionnaire, role)
      .slice(0, MAX_EMERGENCY_CONTACTS)
      .forEach((q, i) => {
        answers[q.id] = contacts[i]?.[field] ?? "";
      });
  }
  return answers;
}

/** The questionnaire without the ID number, which this path never handles. */
function withoutIdNumber(questionnaire: Questionnaire): Questionnaire {
  return {
    ...questionnaire,
    pages: questionnaire.pages.map((page) =>
      page.kind === "questions"
        ? {
            ...page,
            questions: page.questions.filter((b) => b.id !== ID_NUMBER_KEY),
          }
        : page,
    ),
  };
}

/** The checks' errors as one sentence per question, by its label. */
function errorSentence(
  questionnaire: Questionnaire,
  errors: Record<string, string>,
): string {
  const labels = new Map(
    flattenQuestions(questionnaire).map((q) => [q.id, questionLabel(q)]),
  );
  return Object.entries(errors)
    .filter(([id]) => !id.startsWith("_"))
    .map(([id, error]) => `${labels.get(id) ?? id}: ${error}`)
    .join(" ");
}

/**
 * The website's My forms save of the burner profile, for a patch: the stored
 * answers with the patch laid over them, checked whole as the website checks
 * a re-submit, then saved with its change-log row in one transaction, at the
 * questionnaire's own version. The save is a compare-and-set on the profile
 * the patch was merged over, so a change made meanwhile is never overwritten.
 *
 * Only a completed profile is changed here: a member finishes it on the
 * website (connecting Claude needs a finished profile anyway). The ID number
 * is neither read nor written, and the photo is uploaded on the website.
 */
async function saveBurnerProfilePatch(
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ saved: true; changed: string[] }> {
  // An ID number never passes through the connector (owner, 2026-10-05):
  // refused before anything is read or written. Its type goes with it: the
  // type says which encrypted column holds the number.
  if (ID_NUMBER_KEY in patch || ID_TYPE_KEY in patch) {
    throw new ToolError(
      `ID numbers aren't taken through Claude. Enter yours on the website: ${siteUrl(BURNER_PROFILE_FORM)}`,
    );
  }
  const fields = Object.keys(patch);
  if (fields.length === 0) {
    throw new ToolError("Nothing to change: pass the answers to change.");
  }
  // Every team, archived ones included, as the website's re-submit uses, so a
  // stored pick of an archived team is kept rather than dropped.
  const questionnaire = await getQuestionnaireForResponses();
  const photoId = questionIdForRole(questionnaire, "profile_photo");
  if (photoId && photoId in patch) {
    throw new ToolError(
      `Profile photos are uploaded on the website: ${siteUrl(PROFILE_PHOTO_PAGE)}`,
    );
  }
  const known = new Set(flattenQuestions(questionnaire).map((q) => q.id));
  const unknown = fields.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new ToolError(
      `Not a burner profile question: ${unknown
        .slice(0, 5)
        .map((id) => id.slice(0, 60))
        .join(", ")}. get_my_burner_profile shows the question ids.`,
    );
  }

  const unfinished = () =>
    new ToolError(
      `Finish your burner profile on the website first: ${siteUrl(ONBOARDING_FORM)}`,
    );
  let profile = await getBurnerProfileByUserId(userId);
  if (!profile?.completedAt) throw unfinished();
  // An ID number left in the answers from before encryption goes to its
  // encrypted column first (the daily upkeep's step, for this member), so the
  // save below, which never carries it, cannot drop it.
  if (ID_NUMBER_KEY in profile.responses) {
    try {
      await encryptLeftoverIdNumber(userId);
    } catch {
      throw new ToolError(
        "Your burner profile can't be saved just now. Try again later.",
      );
    }
    profile = await getBurnerProfileByUserId(userId);
    if (!profile?.completedAt) throw unfinished();
  }
  // The profile's ID question is required, and only the website takes it: a
  // profile with no ID number on file is finished there, not cleared here.
  const idColumns = await getIdDocumentColumns(userId);
  if (!idColumns?.passportEncrypted && !idColumns?.saIdEncrypted) {
    throw new ToolError(
      `Your ID number isn't on file. Give it on the website's burner profile form first: ${siteUrl(BURNER_PROFILE_FORM)}`,
    );
  }
  const contacts = await getEmergencyContactsColumn(userId);
  // What My forms would show, less the ID number: the stored answers and the
  // emergency contacts, which live on the member's row.
  const stored = mergeEmergencyContacts(
    questionnaire,
    splitIdNumber(profile.responses).cleaned,
    contacts,
  ) as QuestionnaireResponses;

  const checked = validateResponses(withoutIdNumber(questionnaire), {
    ...stored,
    ...patch,
  });
  if (!checked.ok) {
    throw new ToolError(errorSentence(questionnaire, checked.errors));
  }
  const problems = {
    ...identityAnswerErrors(checked.responses, new Date()),
    ...incompleteContactErrors(questionnaire, checked.responses),
  };
  if (Object.keys(problems).length > 0) {
    throw new ToolError(errorSentence(questionnaire, problems));
  }

  const changes = diffResponses(
    questionnaire,
    stored,
    checked.responses,
  ).filter((c) => c.fieldId !== ID_NUMBER_KEY);
  const { cleaned, contacts: nextContacts } = splitEmergencyContacts(
    questionnaire,
    checked.responses,
  );
  const saved = await saveBurnerProfileReplay({
    userId,
    version: QUESTIONNAIRE_VERSION,
    responses: cleaned,
    // The ID number stays as it is.
    idColumns: null,
    emergencyContacts: nextContacts,
    telegramHandle: telegramHandleFromResponses(questionnaire, cleaned, {
      complete: true,
    }),
    edit:
      changes.length > 0
        ? {
            questionnaireKey: "burner_profile",
            editedByUserId: userId,
            changes,
          }
        : null,
    expectUpdatedAt: profile.updatedAt,
    expectEmergencyContacts: contacts,
  });
  if (!saved) {
    throw new ToolError(
      "Your burner profile changed while this was saving, so nothing was saved. Read it again with get_my_burner_profile, then send the changes again.",
    );
  }
  return { saved: true, changed: changes.map((c) => c.label) };
}
