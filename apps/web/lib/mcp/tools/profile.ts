import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { decryptOrNull, encrypt } from "@camp404/db/crypto";
import { runTool, ToolError } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);
const MembershipTierEnum = z.enum(schema.membershipTierEnum.enumValues);

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
          return row ?? null;
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
        argsForAudit: { version: args.version, markComplete: args.markComplete },
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const now = new Date();
          const [row] = await db
            .insert(schema.burnerProfiles)
            .values({
              userId: scope.campUserId,
              version: args.version,
              responses: args.responses,
              completedAt: args.markComplete ? now : null,
            })
            .onConflictDoUpdate({
              target: schema.burnerProfiles.userId,
              set: {
                version: args.version,
                responses: args.responses,
                updatedAt: now,
                ...(args.markComplete ? { completedAt: now } : {}),
              },
            })
            .returning();
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
        "Returns the current user's dietary_requirements row — tags, allergies, anaphylactic flag, intolerances, free-text notes.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_my_dietary_requirements",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const [row] = await db
            .select()
            .from(schema.dietaryRequirements)
            .where(eq(schema.dietaryRequirements.userId, scope.campUserId))
            .limit(1);
          return row ?? null;
        },
      }),
  );

  server.registerTool(
    "update_my_dietary_requirements",
    {
      title: "Update my dietary requirements",
      description:
        "Upsert the current user's dietary_requirements row. `isAnaphylactic` is the hard-stop allergy flag the kitchen team relies on — be careful with it.",
      inputSchema: {
        version: z.string().min(1),
        tags: z.array(z.string()).default([]),
        allergies: z.string().nullable().optional(),
        intolerances: z.string().nullable().optional(),
        isAnaphylactic: z.boolean().default(false),
        notes: z.string().nullable().optional(),
        markComplete: z.boolean().optional().default(false),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_my_dietary_requirements",
        extra,
        argsForAudit: {
          version: args.version,
          isAnaphylactic: args.isAnaphylactic,
          tagCount: args.tags.length,
        },
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const now = new Date();
          const [row] = await db
            .insert(schema.dietaryRequirements)
            .values({
              userId: scope.campUserId,
              version: args.version,
              tags: args.tags,
              allergies: args.allergies ?? null,
              intolerances: args.intolerances ?? null,
              isAnaphylactic: args.isAnaphylactic,
              notes: args.notes ?? null,
              completedAt: args.markComplete ? now : null,
            })
            .onConflictDoUpdate({
              target: schema.dietaryRequirements.userId,
              set: {
                version: args.version,
                tags: args.tags,
                allergies: args.allergies ?? null,
                intolerances: args.intolerances ?? null,
                isAnaphylactic: args.isAnaphylactic,
                notes: args.notes ?? null,
                updatedAt: now,
                ...(args.markComplete ? { completedAt: now } : {}),
              },
            })
            .returning();
          return row;
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
          const [row] = await db
            .select()
            .from(schema.driverProfiles)
            .where(eq(schema.driverProfiles.userId, scope.campUserId))
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
        "Upserts the current user's driver_profiles row. Setting `intendsToDrive: true` for the first time triggers the bespoke driver-detail questionnaire gate in the web app on next sign-in.",
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
          const db = createHttpDb();
          const now = new Date();
          const arrivalAt = args.arrivalAt ? new Date(args.arrivalAt) : null;
          const departureAt = args.departureAt ? new Date(args.departureAt) : null;
          const [existing] = await db
            .select({ intentRegisteredAt: schema.driverProfiles.intentRegisteredAt })
            .from(schema.driverProfiles)
            .where(eq(schema.driverProfiles.userId, scope.campUserId))
            .limit(1);
          const intentRegisteredAt =
            args.intendsToDrive && !existing?.intentRegisteredAt
              ? now
              : existing?.intentRegisteredAt ?? null;

          const [row] = await db
            .insert(schema.driverProfiles)
            .values({
              userId: scope.campUserId,
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
              target: schema.driverProfiles.userId,
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
          return {
            passport: decryptOrNull(row.passport),
            saId: decryptOrNull(row.saId),
            eft: decryptOrNull(row.eft),
          };
        },
      }),
  );

  server.registerTool(
    "update_my_id_documents",
    {
      title: "Update my ID documents",
      description:
        "Encrypts and stores the supplied fields. Pass `null` for a field to clear it; omit a field to leave it unchanged.",
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
        // Never audit-log the plaintext values themselves; only flags.
        argsForAudit: {
          passport: args.passport === undefined ? "unchanged" : args.passport === null ? "cleared" : "set",
          saId: args.saId === undefined ? "unchanged" : args.saId === null ? "cleared" : "set",
          eft: args.eft === undefined ? "unchanged" : args.eft === null ? "cleared" : "set",
        },
        handler: async ({ scope }) => {
          const db = createHttpDb();
          const patch: Partial<typeof schema.users.$inferInsert> = {
            updatedAt: new Date(),
          };
          if (args.passport !== undefined) {
            patch.passportEncrypted = args.passport ? encrypt(args.passport) : null;
          }
          if (args.saId !== undefined) {
            patch.saIdEncrypted = args.saId ? encrypt(args.saId) : null;
          }
          if (args.eft !== undefined) {
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
        argsForAudit: args,
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

  // Suppress unused-import warning when Team enum gets used in later phases.
  void TeamEnum;
}
