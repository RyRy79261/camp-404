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

// Assigned rank is only `captain` or `member`. `captain` carries god
// rights in-app. Every other "role" is DERIVED at read time, never stored:
//   - team lead — derived from `team_memberships.is_lead` on any team
//   - driver    — derived from `driver_profiles.intends_to_drive`
export const rankEnum = pgEnum("rank", ["captain", "member"]);

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

export const reimbursementAccountTypeEnum = pgEnum(
  "reimbursement_account_type",
  ["sa", "international"],
);

// A required_action is one outstanding obligation for one user. `type`
// describes the kind of obligation; the bespoke feature that satisfies it
// flips `status` to `completed` when its own domain table is written.
export const requiredActionTypeEnum = pgEnum("required_action_type", [
  "questionnaire",
  "acknowledgement",
  "payment",
  "profile_update",
]);

export const requiredActionStatusEnum = pgEnum("required_action_status", [
  "pending",
  "completed",
  "waived",
  "expired",
]);

// Audience a captain picks when activating a questionnaire.
export const questionnaireScopeEnum = pgEnum("questionnaire_scope", [
  "everyone",
  "team",
  "team_leads",
  "individual",
  "opt_in",
]);

export const activationStatusEnum = pgEnum("activation_status", [
  "draft",
  "open",
  "closed",
]);

export const broadcastKindEnum = pgEnum("broadcast_kind", [
  "announcement",
  "team_message",
  "lead_directive",
  "reminder",
  "system",
]);

export const broadcastScopeEnum = pgEnum("broadcast_scope", [
  "everyone",
  "team",
  "team_leads",
  "drivers",
  "individual",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "push",
  "in_app",
  "both",
]);

export const pushDeliveryStatusEnum = pgEnum("push_delivery_status", [
  "queued",
  "sent",
  "failed",
  "skipped",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "done",
  "cancelled",
]);

// --- Users ---------------------------------------------------------------
// Camp-specific profile. Identity (email, password, OAuth, MFA, sessions)
// lives in Neon Auth's `neon_auth.users_sync` view; this table joins to it
// via `stack_user_id`. Account + history persist across the yearly camp
// reset; per-burn data in other tables is cleared.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  stackUserId: text("stack_user_id").notNull().unique(),
  displayName: text("display_name"),

  rank: rankEnum("rank").notNull().default("member"),
  // The AI / voice agent (and any other non-human actor) owns a row so
  // foreign keys resolve, but is excluded from human-facing audiences.
  isSystem: boolean("is_system").notNull().default(false),

  membershipTier: membershipTierEnum("membership_tier"),
  duesPaid: boolean("dues_paid").notNull().default(false),
  duesPaidAt: timestamp("dues_paid_at", { mode: "date" }),

  // Encrypted via pgcrypto in route handlers (never stored plaintext)
  passportEncrypted: text("passport_encrypted"),
  saIdEncrypted: text("sa_id_encrypted"),
  eftDetailsEncrypted: text("eft_details_encrypted"),

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

// --- Burner profile ------------------------------------------------------
// A distinct, long-lived facet of the user account, captured by the
// onboarding questionnaire (a bespoke page — see apps/web/lib/questionnaire.ts).
// One row per user; persists across the yearly reset. The catalogue of
// questions lives in code and is versioned so historical responses stay
// renderable. Blocking of the app until this is done is tracked separately
// via a `required_actions` row of type `questionnaire`.

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

// --- Dietary requirements ------------------------------------------------
// The formal dietary questionnaire — its own bespoke page and table (the
// single source of truth for dietary data; there are no dietary columns on
// `users`). Re-requested by activating the questionnaire with a new
// `version`; AI recipe analysis reads from here.

export const dietaryRequirements = pgTable("dietary_requirements", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  allergies: text("allergies"),
  intolerances: text("intolerances"),
  // Hard-stop allergies the kitchen must never cross-contaminate.
  isAnaphylactic: boolean("is_anaphylactic").notNull().default(false),
  notes: text("notes"),
  version: text("version").notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Driver profiles -----------------------------------------------------
// Opt-in: a member registers intent to drive (`intends_to_drive`), which
// triggers a blocking questionnaire to capture vehicle + proficiency
// detail. Its own bespoke page and table.

export const driverProfiles = pgTable("driver_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  intendsToDrive: boolean("intends_to_drive").notNull().default(false),
  intentRegisteredAt: timestamp("intent_registered_at", { mode: "date" }),

  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleRegistration: text("vehicle_registration"),
  seatsTotal: integer("seats_total"),
  seatsOffered: integer("seats_offered"),
  canOfferLifts: boolean("can_offer_lifts").notNull().default(false),

  offroadExperienced: boolean("offroad_experienced").notNull().default(false),
  canTow: boolean("can_tow").notNull().default(false),
  proficiencyNotes: text("proficiency_notes"),

  departureCity: text("departure_city"),
  arrivalAt: timestamp("arrival_at", { mode: "date" }),
  departureAt: timestamp("departure_at", { mode: "date" }),
  notes: text("notes"),

  version: text("version").notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Car members ---------------------------------------------------------
// A driver assigns riders to their car. "Driver" and "car group" are
// derived facets of a user profile, not ranks. This group can be a
// notification audience (broadcast scope 'drivers', or individual targets).

export const carMembers = pgTable(
  "car_members",
  {
    driverUserId: uuid("driver_user_id")
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: "cascade" }),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (c) => ({
    pk: primaryKey({ columns: [c.driverUserId, c.memberUserId] }),
    memberIdx: index("car_members_member_idx").on(c.memberUserId),
  }),
);

// --- Teams ---------------------------------------------------------------

export const teamMemberships = pgTable(
  "team_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    team: teamEnum("team").notNull(),
    // Authoritative answer to "does this user lead this team". A user who
    // is a lead on any team should also carry `users.rank = 'team_lead'`.
    isLead: boolean("is_lead").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (tm) => ({
    pk: primaryKey({ columns: [tm.userId, tm.team] }),
    teamIdx: index("team_memberships_team_idx").on(tm.team),
  }),
);

// --- Questionnaire activations -------------------------------------------
// A questionnaire is a bespoke coded page (`questionnaire_key`) writing into
// its own domain table. An activation is a captain's act of requiring that
// questionnaire from an audience: "send the dietary questionnaire to the
// whole camp, blocking, due Friday". Opening one fans out `required_actions`
// rows to the matched users; new joiners / team changes / opt-ins are
// reconciled against still-open activations.

export const questionnaireActivations = pgTable(
  "questionnaire_activations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionnaireKey: text("questionnaire_key").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    description: text("description"),

    scope: questionnaireScopeEnum("scope").notNull(),
    // Set when scope = 'team'. The 'team_leads' / 'opt_in' / 'everyone'
    // scopes need no parameter; 'individual' uses the targets table below.
    team: teamEnum("team"),

    blocking: boolean("blocking").notNull().default(true),
    status: activationStatusEnum("status").notNull().default("draft"),
    dueAt: timestamp("due_at", { mode: "date" }),

    activatedByUserId: uuid("activated_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    openedAt: timestamp("opened_at", { mode: "date" }),
    closedAt: timestamp("closed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (a) => ({
    keyIdx: index("questionnaire_activations_key_idx").on(a.questionnaireKey),
    statusIdx: index("questionnaire_activations_status_idx").on(a.status),
  }),
);

// Explicit recipients for `scope = 'individual'` activations.
export const questionnaireActivationTargets = pgTable(
  "questionnaire_activation_targets",
  {
    activationId: uuid("activation_id")
      .notNull()
      .references(() => questionnaireActivations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.activationId, t.userId] }),
  }),
);

// --- Required actions ----------------------------------------------------
// The single generic "what is blocking this user" table. The home page /
// middleware queries `(user_id, status = 'pending', blocking = true)` and
// routes to the first gate. A bespoke feature satisfies its own row by
// flipping `status` to `completed` when its domain table is written.

export const requiredActions = pgTable(
  "required_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: requiredActionTypeEnum("type").notNull(),
    // Stable id of the obligation — e.g. the questionnaire key
    // ("burner_profile", "dietary_requirements", "driver_profile") or a
    // payment slug. A code-side registry maps this key to the bespoke
    // component the app renders for the gate. Unique per user so
    // re-activation upserts in place.
    actionKey: text("action_key").notNull(),
    // For questionnaire gates: the version the user must satisfy. A
    // completion recorded against an older version re-opens the gate.
    version: text("version"),
    // For questionnaire gates, the activation that created this row.
    activationId: uuid("activation_id").references(
      () => questionnaireActivations.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    blocking: boolean("blocking").notNull().default(true),
    status: requiredActionStatusEnum("status").notNull().default("pending"),
    dueAt: timestamp("due_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { mode: "date" }),
  },
  (ra) => ({
    userActionIdx: uniqueIndex("required_actions_user_action_idx").on(
      ra.userId,
      ra.actionKey,
    ),
    userStatusIdx: index("required_actions_user_status_idx").on(
      ra.userId,
      ra.status,
    ),
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
// A member submits an out-of-pocket expense, lodged under a team (NULL =
// general). Approval routing is app logic: a team's lead approves that
// team's claims; any lead or a captain approves general ones; a captain can
// approve anything. Payments are actioned manually offline — this is a log,
// not a finance system.

export const reimbursements = pgTable(
  "reimbursements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submitterId: uuid("submitter_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    // NULL = lodged under "general".
    team: teamEnum("team"),

    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // ISO 4217 code of the currency the member actually paid in.
    currency: text("currency").notNull(),

    // Where to reimburse to. Bank details are encrypted via pgcrypto in
    // route handlers (never stored plaintext); accountType picks the shape.
    accountType: reimbursementAccountTypeEnum("account_type").notNull(),
    accountDetailsEncrypted: text("account_details_encrypted").notNull(),

    description: text("description").notNull(),
    // Photo of the receipt and/or the item — at least one (enforced in app).
    receiptBlobUrl: text("receipt_blob_url"),
    itemPhotoBlobUrl: text("item_photo_blob_url"),
    voiceMemoBlobUrl: text("voice_memo_blob_url"),

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
    teamIdx: index("reimbursements_team_idx").on(r.team),
  }),
);

// --- Team budgets --------------------------------------------------------
// Lightweight per-team budget: assigned (allocated) vs perceived
// (projected) spend. Deliberately simple — reimbursements are the ledger.

export const teamBudgets = pgTable("team_budgets", {
  team: teamEnum("team").primaryKey(),
  currency: text("currency").notNull().default("ZAR"),
  assignedAmount: numeric("assigned_amount", { precision: 12, scale: 2 }),
  perceivedAmount: numeric("perceived_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

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

// --- Broadcasts ----------------------------------------------------------
// A composed message from a sender to an audience: captain announcements to
// the whole camp, team-lead messages to their team, captain directives to
// team leads, system reminders. The delivery pipeline is a queue: a
// broadcast row is fanned out by a worker into per-user
// `notification_deliveries` rows (`dispatched_at` marks fan-out done);
// those rows are then drained by the push worker.

export const broadcasts = pgTable(
  "broadcasts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderId: uuid("sender_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: broadcastKindEnum("kind").notNull(),

    scope: broadcastScopeEnum("scope").notNull(),
    // Set when scope = 'team'. 'individual' uses broadcast_targets below.
    team: teamEnum("team"),

    title: text("title").notNull(),
    body: text("body").notNull(),
    channel: notificationChannelEnum("channel").notNull().default("both"),

    // Deep-link target the recipient's app opens — e.g. refType
    // 'questionnaire_activation' maps (in code) to the bespoke component
    // that must pop up. refId is the row that component renders.
    refType: text("ref_type"),
    refId: uuid("ref_id"),

    // NULL until the fan-out worker has materialised the deliveries.
    dispatchedAt: timestamp("dispatched_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (b) => ({
    senderIdx: index("broadcasts_sender_idx").on(b.senderId),
    createdAtIdx: index("broadcasts_created_at_idx").on(b.createdAt),
  }),
);

// Explicit recipients for `scope = 'individual'` broadcasts.
export const broadcastTargets = pgTable(
  "broadcast_targets",
  {
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => broadcasts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.broadcastId, t.userId] }),
  }),
);

// --- Notification deliveries ---------------------------------------------
// Per-user inbox: one row per recipient of a broadcast (or a system-
// generated notification with no broadcast). Tracks push delivery state and
// read state.

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    broadcastId: uuid("broadcast_id").references(() => broadcasts.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    body: text("body").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    pushStatus: pushDeliveryStatusEnum("push_status")
      .notNull()
      .default("queued"),

    refType: text("ref_type"),
    refId: uuid("ref_id"),

    readAt: timestamp("read_at", { mode: "date" }),
    deliveredAt: timestamp("delivered_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (n) => ({
    userReadIdx: index("notification_deliveries_user_read_idx").on(
      n.userId,
      n.readAt,
    ),
    broadcastIdx: index("notification_deliveries_broadcast_idx").on(
      n.broadcastId,
    ),
  }),
);

// --- Tasks ---------------------------------------------------------------
// Non-blocking to-dos with deadlines. Assigned to a member or a whole team;
// the reminders cron nudges via broadcasts as `due_at` approaches.

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    team: teamEnum("team"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { mode: "date" }),
    status: taskStatusEnum("status").notNull().default("open"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { mode: "date" }),
  },
  (t) => ({
    assigneeIdx: index("tasks_assignee_idx").on(t.assigneeId),
    teamIdx: index("tasks_team_idx").on(t.team),
    statusIdx: index("tasks_status_idx").on(t.status),
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
