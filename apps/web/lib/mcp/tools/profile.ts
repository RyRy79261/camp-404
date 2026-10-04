import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { createHttpDb, withTransaction } from "@camp404/db";
import { satisfyRequiredAction } from "@camp404/db/activations";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import { decryptField, encrypt } from "@camp404/db/crypto";
import { splitIdNumber, idColumnsFor } from "@camp404/db/id-documents";
import { SEATS_BELOW_RIDERS } from "@camp404/db/transport";
import {
  DIETS,
  KITCHEN_ALLERGENS,
  SaveDietaryInput,
  incompleteContactErrors,
  questionsWithRole,
  splitEmergencyContacts,
} from "@camp404/types";
import { getMyDietary, saveMyDietary } from "../../dietary";
import { identityAnswerErrors, validateIdNumber } from "../../id-validation";
import { BURNER_PROFILE_TEMPLATE } from "../../questionnaire";
import { runTool, ToolError } from "../tool-utils";

const MembershipTierEnum = z.enum(schema.membershipTierEnum.enumValues);

/**
 * How one optional encrypted-ID argument should be applied.
 *
 * The three states are what the tool's contract promises: omit a field to leave
 * it alone, pass `null` to clear it, pass a value to set it. An empty string is
 * a CLEAR, not a set — zod's `z.string().nullable().optional()` admits `""`, so
 * a model can produce it, and the write path has always treated it as falsy.
 * Both the audit label and the write derive from this one function so they
 * cannot drift apart.
 */
function classifyIdArg(
  value: string | null | undefined,
): "unchanged" | "cleared" | "set" {
  if (value === undefined) return "unchanged";
  return value ? "set" : "cleared";
}

/**
 * Refuse an ID number the web questionnaire would refuse, so a model cannot
 * store one the member could not type.
 */
function assertValidIdNumber(type: "passport" | "sa_id", value: string): void {
  const result = validateIdNumber(type, value);
  if (!result.ok) throw new ToolError(result.error);
}

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
          // Never surface the plaintext id.number here — get_my_id_documents
          // is the dedicated (decrypting) channel for that field.
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
        "Patches the current user's burner_profiles responses JSONB. Pass the version string and the (possibly partial) responses object. Set `markComplete` to flip the completion timestamp.",
      inputSchema: {
        version: z.string().min(1),
        responses: z.record(z.string(), z.unknown()),
        markComplete: z.boolean().optional().default(false),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_burner_profile",
        extra,
        argsForAudit: {
          version: args.version,
          markComplete: args.markComplete,
        },
        handler: async ({ scope }) => {
          // The web form's identity checks: the ID number against its type
          // and a possible date of birth. Nothing is written if one fails.
          const identity = {
            ...identityAnswerErrors(args.responses, new Date()),
            ...incompleteContactErrors(BURNER_PROFILE_TEMPLATE, args.responses),
          };
          if (Object.keys(identity).length > 0) {
            throw new ToolError(Object.values(identity).join(" "));
          }
          const db = createHttpDb();
          const now = new Date();
          // Route any government ID number to the encrypted users column
          // instead of persisting it plaintext in responses, and the emergency
          // contacts to users.emergency_contacts, as the web form does. The
          // burner profile is a reserved code questionnaire, so its question
          // roles are the template's.
          const split = splitIdNumber(args.responses);
          const { idType, idNumber } = split;
          const { cleaned, contacts } = splitEmergencyContacts(
            BURNER_PROFILE_TEMPLATE,
            split.cleaned,
          );
          const carriesContacts = questionsWithRole(
            BURNER_PROFILE_TEMPLATE,
            "emergency_contact_name",
          ).some((q) => q.id in args.responses);
          const [row] = await db
            .insert(schema.burnerProfiles)
            .values({
              userId: scope.campUserId,
              version: args.version,
              responses: cleaned,
              completedAt: args.markComplete ? now : null,
            })
            .onConflictDoUpdate({
              target: schema.burnerProfiles.userId,
              set: {
                version: args.version,
                responses: cleaned,
                updatedAt: now,
                ...(args.markComplete ? { completedAt: now } : {}),
              },
            })
            .returning();
          if (idNumber) {
            await db
              .update(schema.users)
              .set({
                ...idColumnsFor(idType, encrypt(idNumber)),
                updatedAt: new Date(),
              })
              .where(eq(schema.users.id, scope.campUserId));
          }
          if (carriesContacts) {
            await db
              .update(schema.users)
              .set({
                emergencyContacts: contacts.length > 0 ? contacts : null,
                updatedAt: new Date(),
              })
              .where(eq(schema.users.id, scope.campUserId));
          }
          // A profile finished here clears its gate, as the web form does.
          // Without this the member stays held on /onboarding/questionnaire.
          if (args.markComplete) {
            await satisfyRequiredAction(
              scope.campUserId,
              "burner_profile",
              args.version,
            );
          }
          return row;
        },
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

  const EmergencyContact = z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    relationship: z.string().min(1),
  });

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
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .select({ contacts: schema.users.emergencyContacts })
            .from(schema.users)
            .where(eq(schema.users.id, scope.campUserId))
            .limit(1);
          return row?.contacts ?? [];
        },
      }),
  );

  server.registerTool(
    "update_my_emergency_contacts",
    {
      title: "Update my emergency contacts",
      description:
        "Replaces the user's full emergency_contacts list with the supplied array. Pass an empty array to clear.",
      inputSchema: {
        contacts: z.array(EmergencyContact),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_emergency_contacts",
        extra,
        argsForAudit: { count: args.contacts.length },
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .update(schema.users)
            .set({
              emergencyContacts: args.contacts,
              updatedAt: new Date(),
            })
            .where(eq(schema.users.id, scope.campUserId))
            .returning({ contacts: schema.users.emergencyContacts });
          return row?.contacts ?? [];
        },
      }),
  );

  // -------------------------------------------------------------------------
  // ID documents (encrypted columns — only ever readable by self here)
  // -------------------------------------------------------------------------

  server.registerTool(
    "get_my_id_documents",
    {
      title: "Get my ID documents",
      description:
        "Returns the current user's identification document fields, decrypted. Always available to self regardless of the AI-data consent flag.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_id_documents",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .select({
              passport: schema.users.passportEncrypted,
              saId: schema.users.saIdEncrypted,
              eft: schema.users.eftDetailsEncrypted,
            })
            .from(schema.users)
            .where(eq(schema.users.id, scope.campUserId))
            .limit(1);
          if (!row) throw new ToolError("User row not found.");
          const passport = decryptField(row.passport);
          const saId = decryptField(row.saId);
          const eft = decryptField(row.eft);
          return {
            passport: passport.value,
            saId: saId.value,
            eft: eft.value,
            // A field listed here IS on file — this server just cannot decrypt
            // it. Do not tell the user they have no value stored, and do not
            // offer to "clear" it.
            unreadableFields: [
              ...(passport.state === "unreadable" ? ["passport"] : []),
              ...(saId.state === "unreadable" ? ["saId"] : []),
              ...(eft.state === "unreadable" ? ["eft"] : []),
            ],
          };
        },
      }),
  );

  server.registerTool(
    "update_my_id_documents",
    {
      title: "Update my ID documents",
      description:
        "Encrypts and stores the supplied fields. Pass `null` for a field to clear it; omit a field to leave it unchanged. A member holds one government ID document, so setting `passport` clears `saId` and vice versa.",
      inputSchema: {
        passport: z.string().nullable().optional(),
        saId: z.string().nullable().optional(),
        eft: z.string().nullable().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_id_documents",
        extra,
        // Never audit-log the plaintext values themselves; only flags. The
        // label comes from the SAME classifier the write below branches on, so
        // the audit row can never disagree with what actually happened —
        // `{ passport: "" }` is a clear in both, not a "set" in the log and a
        // clear in the column.
        argsForAudit: {
          passport: classifyIdArg(args.passport),
          saId: classifyIdArg(args.saId),
          eft: classifyIdArg(args.eft),
        },
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const patch: Partial<typeof schema.users.$inferInsert> = {
            updatedAt: new Date(),
          };
          const passportOp = classifyIdArg(args.passport);
          const saIdOp = classifyIdArg(args.saId);
          // passport_encrypted and sa_id_encrypted are two columns for ONE
          // document: idColumnsFor (packages/db/src/id-documents.ts) writes the
          // column that id.type names and NULLs the other. Setting one here
          // without clearing its sibling leaves both populated, and the
          // member's next burner-profile save then silently deletes whichever
          // column idColumnsFor did not pick. Hold the invariant on write.
          if (passportOp === "set" && saIdOp === "set") {
            throw new ToolError(
              "A member holds one ID document — pass either passport or saId, not both.",
            );
          }
          if (passportOp === "set") {
            assertValidIdNumber("passport", args.passport as string);
          }
          if (saIdOp === "set")
            assertValidIdNumber("sa_id", args.saId as string);
          if (passportOp !== "unchanged") {
            patch.passportEncrypted =
              passportOp === "set" ? encrypt(args.passport as string) : null;
            if (passportOp === "set") patch.saIdEncrypted = null;
          }
          if (saIdOp !== "unchanged") {
            patch.saIdEncrypted =
              saIdOp === "set" ? encrypt(args.saId as string) : null;
            if (saIdOp === "set") patch.passportEncrypted = null;
          }
          if (classifyIdArg(args.eft) !== "unchanged") {
            patch.eftDetailsEncrypted = args.eft ? encrypt(args.eft) : null;
          }
          await db
            .update(schema.users)
            .set(patch)
            .where(eq(schema.users.id, scope.campUserId));
          return { ok: true };
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
