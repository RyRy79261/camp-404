import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Camp 404 schema. Authentication is handled by Neon Auth (Stack) — its
// `neon_auth.users_sync` view is the source of truth for credentials and
// identity. Our `users` table below stores camp-specific profile data and
// joins to Stack via the `stack_user_id` column.

// --- Enums ---------------------------------------------------------------

export const roleEnum = pgEnum("role", [
  "admin",
  "treasurer",
  "team_lead",
  "member",
  "agent",
]);

export const teamEnum = pgEnum("team", [
  "kitchen",
  "build",
  "fire",
  "art",
  "vehicle",
  "onboarding",
  "safety",
]);

export const membershipTierEnum = pgEnum("membership_tier", [
  "full",
  "build_week_only",
]);

export const recipeStatusEnum = pgEnum("recipe_status", [
  "pending",
  "analysing",
  "ready",
  "scheduled",
  "rejected",
]);

export const recipeSourceEnum = pgEnum("recipe_source", [
  "url",
  "text",
  "voice",
]);

export const reimbursementStatusEnum = pgEnum("reimbursement_status", [
  "submitted",
  "approved",
  "paid",
  "reconciled",
  "rejected",
]);

export const platformEnum = pgEnum("platform", ["web", "ios", "android"]);

// --- Users ---------------------------------------------------------------
// Camp-specific profile. Identity (email, password, OAuth, MFA, sessions)
// lives in Neon Auth's `neon_auth.users_sync` view; this table joins to it
// via `stack_user_id`.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  stackUserId: text("stack_user_id").notNull().unique(),
  displayName: text("display_name"),

  role: roleEnum("role").notNull().default("member"),
  membershipTier: membershipTierEnum("membership_tier"),
  duesPaid: boolean("dues_paid").notNull().default(false),
  duesPaidAt: timestamp("dues_paid_at", { mode: "date" }),

  // Encrypted via pgcrypto in route handlers (never stored plaintext)
  passportEncrypted: text("passport_encrypted"),
  saIdEncrypted: text("sa_id_encrypted"),
  eftDetailsEncrypted: text("eft_details_encrypted"),

  dietaryTags: jsonb("dietary_tags").$type<string[]>().default([]),
  dietaryNotes: text("dietary_notes"),
  skills: jsonb("skills").$type<string[]>().default([]),

  previousAfrikaburns: integer("previous_afrikaburns").default(0),
  previousBurningMans: integer("previous_burning_mans").default(0),
  firstTime: boolean("first_time").default(false),

  emergencyContacts: jsonb("emergency_contacts").$type<
    Array<{ name: string; phone: string; relationship: string }>
  >(),

  // Signup gating. Set to the invite code the user redeemed when creating
  // their account. NULL = god account (email matched GOD_EMAILS). Used as
  // durable evidence that the account is allowed past the questionnaire
  // gate, independent of the short-lived signup cookie.
  inviteCode: text("invite_code"),

  // POPIA / GDPR
  termsVersion: text("terms_version"),
  termsConsentedAt: timestamp("terms_consented_at", { mode: "date" }),
  sanitised: boolean("sanitised").notNull().default(false),
  sanitisedAt: timestamp("sanitised_at", { mode: "date" }),
  lostCatNumber: integer("lost_cat_number"),

  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Invite codes --------------------------------------------------------
// Real invite codes with provenance. `users.invite_code` stores the code a
// member redeemed; joining back to this table yields who issued it,
// remaining uses, and any expiry. The INVITE_CODES env var remains as a
// bootstrap fallback so the first god account can sign up before any rows
// exist here.

export const inviteCodes = pgTable(
  "invite_codes",
  {
    code: text("code").primaryKey(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    createdByIdx: index("invite_codes_created_by_idx").on(t.createdByUserId),
  }),
);

// --- Burner profile / questionnaire --------------------------------------
// Every member completes a mandatory questionnaire on signup that builds
// their "burner profile": chef skills, build skills, fire skills, etc.
// Responses are stored as JSONB keyed by question id; the catalogue itself
// lives in code (see apps/web/lib/questionnaire.ts) and is versioned so
// questions can evolve without breaking historical responses.

export const burnerProfiles = pgTable("burner_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  responses: jsonb("responses")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { mode: "date" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Teams ---------------------------------------------------------------

export const teamMemberships = pgTable(
  "team_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    team: teamEnum("team").notNull(),
    isLead: boolean("is_lead").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (tm) => ({
    pk: primaryKey({ columns: [tm.userId, tm.team] }),
    teamIdx: index("team_memberships_team_idx").on(tm.team),
  }),
);

// --- Recipes -------------------------------------------------------------

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submitterId: uuid("submitter_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    source: recipeSourceEnum("source").notNull(),
    status: recipeStatusEnum("status").notNull().default("pending"),

    sourceUrl: text("source_url"),
    rawText: text("raw_text"),
    audioBlobUrl: text("audio_blob_url"),
    transcript: text("transcript"),

    // Populated by the Opus normalisation cron
    normalised: jsonb("normalised"),
    dietaryTags: jsonb("dietary_tags").$type<string[]>().default([]),

    analysedAt: timestamp("analysed_at", { mode: "date" }),
    scheduledFor: timestamp("scheduled_for", { mode: "date" }),

    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (r) => ({
    statusIdx: index("recipes_status_idx").on(r.status),
    submitterIdx: index("recipes_submitter_idx").on(r.submitterId),
  }),
);

// --- Documents / manuals -------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull(),
    team: teamEnum("team"),
    markdown: text("markdown").notNull().default(""),
    version: integer("version").notNull().default(1),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (d) => ({
    slugIdx: uniqueIndex("documents_slug_idx").on(d.slug),
    categoryIdx: index("documents_category_idx").on(d.category),
  }),
);

// --- Reimbursements ------------------------------------------------------

export const reimbursements = pgTable(
  "reimbursements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submitterId: uuid("submitter_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    amountZar: numeric("amount_zar", { precision: 12, scale: 2 }).notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    receiptBlobUrl: text("receipt_blob_url").notNull(),
    voiceMemoBlobUrl: text("voice_memo_blob_url"),
    eftDetailsEncrypted: text("eft_details_encrypted").notNull(),

    status: reimbursementStatusEnum("status").notNull().default("submitted"),
    approverId: uuid("approver_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
    reconciledAt: timestamp("reconciled_at", { mode: "date" }),

    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (r) => ({
    statusIdx: index("reimbursements_status_idx").on(r.status),
    submitterIdx: index("reimbursements_submitter_idx").on(r.submitterId),
  }),
);

// --- Push notifications --------------------------------------------------

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    token: text("token").notNull(),
    topics: jsonb("topics").$type<string[]>().default([]),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (pt) => ({
    tokenIdx: uniqueIndex("push_tokens_token_idx").on(pt.token),
    userIdx: index("push_tokens_user_idx").on(pt.userId),
  }),
);

// --- Burner adoption -----------------------------------------------------

export const adoptees = pgTable("adoptees", {
  id: uuid("id").defaultRandom().primaryKey(),
  slotNumber: integer("slot_number").notNull(),
  name: text("name").notNull(),
  contact: text("contact"),
  dietaryNotes: text("dietary_notes"),
  arrival: timestamp("arrival", { mode: "date" }),
  departure: timestamp("departure", { mode: "date" }),
  tentAssigned: text("tent_assigned"),
  beddingAssigned: text("bedding_assigned"),
  fridgeShelfAssigned: text("fridge_shelf_assigned"),
  sponsorId: uuid("sponsor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedById: uuid("approved_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Workshops -----------------------------------------------------------

export const workshops = pgTable("workshops", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
  endsAt: timestamp("ends_at", { mode: "date" }).notNull(),
  capacity: integer("capacity").notNull().default(20),
  hostId: uuid("host_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const workshopRsvps = pgTable(
  "workshop_rsvps",
  {
    workshopId: uuid("workshop_id")
      .notNull()
      .references(() => workshops.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (r) => ({
    pk: primaryKey({ columns: [r.workshopId, r.userId] }),
  }),
);

// --- Audit log -----------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (a) => ({
    actorIdx: index("audit_log_actor_idx").on(a.actorId),
    actionIdx: index("audit_log_action_idx").on(a.action),
  }),
);
