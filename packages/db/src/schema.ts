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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { QuestionnaireFieldChange } from "@camp404/types";

// Camp 404 schema. Authentication is handled by Neon Auth (Better Auth) —
// the managed auth service holds credentials, sessions, and identity. Our
// `users` table below stores camp-specific profile data and joins to the
// auth service via the `auth_user_id` column (the upstream Better Auth
// user id).

// --- Enums ---------------------------------------------------------------

// Assigned rank is only `captain` or `member`. `captain` carries god
// rights in-app. Every other "role" is DERIVED at read time, never stored:
//   - team lead — derived from `team_memberships.is_lead` on any team
//   - driver    — derived from `driver_profiles.intends_to_drive`
export const rankEnum = pgEnum("rank", ["captain", "member"]);

// A member's vetting lifecycle. Most accounts are `approved` outright (god
// accounts, captain-minted pre-approved invites, and every account that
// pre-dates this gate). An invite code can require captain approval: its
// redeemer is created `pending` and blocked from the app until a captain
// `approved`s them (or `rejected`s them — a terminal denied state). This is
// a first-class membership-lifecycle field rather than a `required_actions`
// row because (a) it has a terminal `rejected` state the generic gate can't
// express, and (b) it is actioned by a captain, not completed by the user.
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);

// The camp's working teams. Used wherever a row is scoped to a team:
// memberships, budgets, reimbursements, broadcasts, questionnaires,
// documents, tasks, inventory. Values are stable identifiers — the
// human label is a code-side concern.
export const teamEnum = pgEnum("team", [
  "kitchen",
  "structures",
  "power_and_lighting",
  "sanitation_and_water",
  "health_and_safety",
  "art_and_activities",
  "ministry_of_memes",
  "ministry_of_vibes",
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

// How a notification demands the recipient's attention in-app. This is the
// "variant" a sender picks when composing:
//   - `acknowledge` — takes over the screen as a full-screen, scrollable
//     modal the recipient must explicitly acknowledge to dismiss (the
//     terms-&-conditions pattern). Used for captain announcements everyone
//     must see.
//   - `popup` — a transient, dismissable pop-up that needs no acknowledgement.
//   - `feed` — no interruption; it simply lands in the notification inbox
//     behind the header bell.
export const broadcastPresentationEnum = pgEnum("broadcast_presentation", [
  "acknowledge",
  "popup",
  "feed",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "done",
  "cancelled",
]);

// State of a proposed inventory change. A member's proposal starts
// `pending`; a team lead / captain moves it to `approved` or `rejected`.
// A change made directly by a lead / captain is inserted already
// `approved` (reviewer = author) so this table stays a full change log.
export const inventoryUpdateStatusEnum = pgEnum("inventory_update_status", [
  "pending",
  "approved",
  "rejected",
]);

// Kind of Telegram chat the camp's bot is attached to. `main_group` is the
// members-only group chat invitees are added to; `announcement_channel` is
// a read-only channel for broadcast posts (e.g. unlock announcements).
export const telegramChatKindEnum = pgEnum("telegram_chat_kind", [
  "main_group",
  "announcement_channel",
]);

// Lifecycle of a single-use Telegram invite link the bot issues to a user
// once they are approved as a camp member. `pending` = link created but
// not yet used; `used` = the user joined; `expired` / `revoked` are the
// dead states.
export const telegramInviteStatusEnum = pgEnum("telegram_invite_status", [
  "pending",
  "used",
  "expired",
  "revoked",
]);

// Outbound Telegram message queue state.
export const telegramAnnouncementStatusEnum = pgEnum(
  "telegram_announcement_status",
  ["queued", "sent", "failed"],
);

// --- Users ---------------------------------------------------------------
// Camp-specific profile. Identity (email, password, OAuth, MFA, sessions)
// lives in Neon Auth (Better Auth); this table joins to it via
// `auth_user_id`, which mirrors the upstream `user.id`. Account + history
// persist across the yearly camp reset; per-burn data in other tables is
// cleared.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: text("auth_user_id").notNull().unique(),
  displayName: text("display_name"),
  // Same-origin proxy URL (`/api/avatar?pathname=…`) for the member's
  // optional profile photo. The image itself lives in a private Vercel Blob
  // store and is streamed only to signed-in members via the proxy route.
  // Lives on the identity row (not buried in burner_profiles.responses) so
  // it's cheap to read from the home header, profile page, and family tree.
  profileImageUrl: text("profile_image_url"),

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

  emergencyContacts:
    jsonb("emergency_contacts").$type<
      Array<{ name: string; phone: string; relationship: string }>
    >(),

  // Signup gating. Set to the invite code the user redeemed when creating
  // their account. NULL = god account (email matched GOD_EMAILS). Used as
  // durable evidence that the account is allowed past the questionnaire
  // gate, independent of the short-lived signup cookie.
  inviteCode: text("invite_code"),

  // Captain-approval gating. `approved` by default so god accounts and every
  // account created before this gate existed keep their access. A redeemer of
  // an invite code with `requires_approval = true` is created `pending` and
  // blocked from the app (after onboarding) until a captain decides. The
  // captain who decided and when are stamped for the camp-management audit.
  approvalStatus: approvalStatusEnum("approval_status")
    .notNull()
    .default("approved"),
  approvalDecidedByUserId: uuid("approval_decided_by_user_id").references(
    (): AnyPgColumn => users.id,
    { onDelete: "set null" },
  ),
  approvalDecidedAt: timestamp("approval_decided_at", { mode: "date" }),

  // POPIA / GDPR
  termsVersion: text("terms_version"),
  termsConsentedAt: timestamp("terms_consented_at", { mode: "date" }),
  sanitised: boolean("sanitised").notNull().default(false),
  sanitisedAt: timestamp("sanitised_at", { mode: "date" }),
  lostCatNumber: integer("lost_cat_number"),

  // Telegram identity. `telegramHandle` mirrors the value the user
  // entered in the burner-profile questionnaire (denormalised here for
  // cheap lookup). `telegramUserId` is the numeric user id Telegram
  // assigns once the user has joined the camp group via a bot-issued
  // invite link — captured from the `chat_member` webhook update.
  telegramHandle: text("telegram_handle"),
  telegramUserId: text("telegram_user_id").unique(),

  // AI / MCP consent. Opt-in for surfacing this user's *identification
  // documents* — passport, SA ID, EFT details, others' reimbursement bank
  // details — to AI / MCP sessions belonging to OTHER users (a captain
  // viewing this user's profile via Claude.ai, say). Everything else
  // (display name, email, phone, dietary, vehicle, …) is freely visible
  // to the appropriate in-app tier regardless of this flag. The subject
  // always sees their own data via MCP. See `docs/mcp-tooling-proposal.md`.
  aiDataConsent: boolean("ai_data_consent").notNull().default(false),
  aiDataConsentAt: timestamp("ai_data_consent_at", { mode: "date" }),

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
    // Optional rank to stamp onto a user when they redeem this code. NULL =
    // redeemer keeps the default `member` rank. Use `captain` to mint a code
    // that auto-promotes the redeemer.
    assignedRank: rankEnum("assigned_rank"),
    // For in-app invites created via /tools/invite: the email address of
    // the person the inviter is sending this code to. Lowercased on insert.
    // CLI-minted codes leave this NULL.
    invitedEmail: text("invited_email"),
    // Whether redeeming this code drops the new account into the captain
    // approval queue (`users.approval_status = 'pending'`). Codes minted by
    // non-captains are ALWAYS true — only a captain can wave someone in
    // unvetted. Captain-minted codes choose: false pre-approves the redeemer.
    requiresApproval: boolean("requires_approval").notNull().default(false),
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

    activatedByUserId: uuid("activated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
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

// --- Questionnaire edits -------------------------------------------------
// Internal change log for the "replay a form" tool. When a user revisits a
// questionnaire they have already completed and re-submits it, we append one
// row per edit session capturing *when* it happened, *who* made it, and the
// per-field before → after diff. We deliberately keep NO full version
// history — the domain table (e.g. burner_profiles) always holds the latest
// answers; this table is only the running "what changed" log, surfaced back
// to the user on the replay screen. `changes` is empty-tolerant but in
// practice a no-op replay records no row at all (see lib/forms).

export const questionnaireEdits = pgTable(
  "questionnaire_edits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // The subject of the form (whose answers these are).
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Stable questionnaire key — same registry key as required_actions /
    // questionnaire_activations (e.g. "burner_profile").
    questionnaireKey: text("questionnaire_key").notNull(),
    // Catalogue version in force when the edit was made.
    version: text("version").notNull(),
    // Who performed the edit. Usually the subject themselves; nullable so a
    // captain editing on someone's behalf (or a deleted account) still keeps
    // the log intact.
    editedByUserId: uuid("edited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    changes: jsonb("changes")
      .$type<QuestionnaireFieldChange[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (e) => ({
    userKeyCreatedIdx: index("questionnaire_edits_user_key_created_idx").on(
      e.userId,
      e.questionnaireKey,
      e.createdAt,
    ),
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

    // How the recipient is interrupted in-app — see broadcastPresentationEnum.
    // Copied onto each `notification_deliveries` row at fan-out so the inbox
    // and the acknowledge gate stay self-contained.
    presentation: broadcastPresentationEnum("presentation")
      .notNull()
      .default("feed"),

    // Deep-link target the recipient's app opens — e.g. refType
    // 'questionnaire_activation' maps (in code) to the bespoke component
    // that must pop up. refId is the row that component renders.
    refType: text("ref_type"),
    refId: uuid("ref_id"),

    // NULL while the broadcast is a draft. A captain composes and saves a
    // draft, then publishing stamps this and triggers the fan-out below.
    publishedAt: timestamp("published_at", { mode: "date" }),
    // NULL until the fan-out worker has materialised the deliveries.
    dispatchedAt: timestamp("dispatched_at", { mode: "date" }),
    // When the broadcast should fan out. NULL or <= now means immediate (the
    // inline publish path); a future value defers fan-out to the dispatch cron.
    sendAt: timestamp("send_at", { mode: "date" }),
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
    // Self-contained copy of the broadcast's presentation variant, so the
    // acknowledge gate and inbox never have to join back to `broadcasts`.
    presentation: broadcastPresentationEnum("presentation")
      .notNull()
      .default("feed"),
    pushStatus: pushDeliveryStatusEnum("push_status")
      .notNull()
      .default("queued"),

    refType: text("ref_type"),
    refId: uuid("ref_id"),

    readAt: timestamp("read_at", { mode: "date" }),
    // Set when the recipient explicitly acknowledges a `presentation =
    // 'acknowledge'` notification (dismissing the full-screen takeover). The
    // gate surfaces every acknowledge delivery where this is still NULL.
    acknowledgedAt: timestamp("acknowledged_at", { mode: "date" }),
    deliveredAt: timestamp("delivered_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (n) => ({
    userReadIdx: index("notification_deliveries_user_read_idx").on(
      n.userId,
      n.readAt,
    ),
    // The acknowledge gate polls "my unacknowledged acknowledge-deliveries"
    // on every authenticated load — index the exact predicate.
    userAckIdx: index("notification_deliveries_user_ack_idx").on(
      n.userId,
      n.acknowledgedAt,
    ),
    broadcastIdx: index("notification_deliveries_broadcast_idx").on(
      n.broadcastId,
    ),
    // One delivery per (broadcast, user): lets the scheduled fan-out worker
    // INSERT ... ON CONFLICT DO NOTHING without double-delivering. System rows
    // (broadcast_id NULL) are exempt via the partial predicate.
    broadcastUserUniq: uniqueIndex(
      "notification_deliveries_broadcast_user_uniq",
    )
      .on(n.broadcastId, n.userId)
      .where(sql`${n.broadcastId} IS NOT NULL`),
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

// --- Inventory -----------------------------------------------------------
// The camp's stocked gear, tracked for a status page reachable from the
// member section. Each row is one stocked item with its current state.
// Changes flow through `inventory_updates` (below): a regular member
// proposes, a team lead / captain approves; a lead's own change is logged
// as an already-approved update, so the pair is a full audit trail.

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    // Free-text detail, e.g. "12 chef knives, mixed brands; 2 blunt".
    details: text("details"),
    // Which team the item belongs to / is maintained by.
    team: teamEnum("team").notNull(),

    // Count of the thing, in `unit`s. A "box of knives" is name = "Chef
    // knives", quantity = 12, unit = "knife".
    quantity: integer("quantity").notNull().default(0),
    unit: text("unit"),
    // Optional total weight, in kilograms.
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }),

    // Maintenance schedule. `requiresMaintenance` gates the rest; the
    // status page flags items whose `nextMaintenanceDueAt` has passed.
    requiresMaintenance: boolean("requires_maintenance")
      .notNull()
      .default(false),
    maintenanceIntervalDays: integer("maintenance_interval_days"),
    lastMaintainedAt: timestamp("last_maintained_at", { mode: "date" }),
    nextMaintenanceDueAt: timestamp("next_maintenance_due_at", {
      mode: "date",
    }),
    maintenanceNotes: text("maintenance_notes"),

    // Storage. A NULL `custodianUserId` means the camp storage room;
    // otherwise the item lives at that person's home (e.g. petrol jerry
    // cans). `storageLocation` is the free-text spot ("shelf 3", "garage").
    custodianUserId: uuid("custodian_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    storageLocation: text("storage_location"),

    // Last physical check / report — denormalised from the most recent
    // approved `inventory_updates` row for cheap status-page queries.
    lastCheckedAt: timestamp("last_checked_at", { mode: "date" }),
    lastCheckedByUserId: uuid("last_checked_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Soft-removal when an item is no longer stocked — keeps the change
    // history in `inventory_updates` intact.
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (i) => ({
    teamIdx: index("inventory_items_team_idx").on(i.team),
    custodianIdx: index("inventory_items_custodian_idx").on(i.custodianUserId),
    maintenanceDueIdx: index("inventory_items_maintenance_due_idx").on(
      i.nextMaintenanceDueAt,
    ),
  }),
);

// --- Inventory updates ---------------------------------------------------
// A proposed (or applied) change to inventory, and the audit trail. Each
// row carries a FULL snapshot of the item's editable fields — the desired
// state, not a diff — so approving is a straight copy onto the item.
// `itemId` is NULL for a proposal to create a brand-new item; it is set to
// the new item's id once such a proposal is approved.
//
// Approval is not team-scoped: any team lead or captain may approve any
// update, regardless of which team they are on (enforced in app logic).

export const inventoryUpdates = pgTable(
  "inventory_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // NULL = a proposal to create a new item.
    itemId: uuid("item_id").references(() => inventoryItems.id, {
      onDelete: "cascade",
    }),

    proposedByUserId: uuid("proposed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    status: inventoryUpdateStatusEnum("status").notNull().default("pending"),

    // Proposed snapshot of the item's editable fields.
    name: text("name").notNull(),
    details: text("details"),
    team: teamEnum("team").notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit"),
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }),
    requiresMaintenance: boolean("requires_maintenance")
      .notNull()
      .default(false),
    maintenanceIntervalDays: integer("maintenance_interval_days"),
    custodianUserId: uuid("custodian_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    storageLocation: text("storage_location"),
    // Set when this update records a maintenance / service event; on
    // approval it becomes the item's `lastMaintainedAt`.
    maintenancePerformedAt: timestamp("maintenance_performed_at", {
      mode: "date",
    }),

    // Proposer's comment, e.g. "counted 8, two cans are leaking".
    note: text("note"),

    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    // Reviewer's comment — e.g. why a proposal was rejected.
    reviewNote: text("review_note"),

    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (u) => ({
    itemIdx: index("inventory_updates_item_idx").on(u.itemId),
    statusIdx: index("inventory_updates_status_idx").on(u.status),
    proposedByIdx: index("inventory_updates_proposed_by_idx").on(
      u.proposedByUserId,
    ),
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

// --- Telegram bot --------------------------------------------------------
// Camp 404 runs a Telegram bot that (a) issues single-use invite links to
// the main group chat once a member is approved, and (b) posts unlock /
// announcement messages to a broadcast channel. Telegram does not let
// bots silently add users by @handle — every join is gated by an invite
// link the user must tap themselves. We track issued links so the
// `chat_member` webhook can map an incoming join back to a camp user.

// Registry of chats the bot is a member of and the camp manages — the
// main members group and the announcement channel. Telegram chat ids are
// 64-bit signed integers (channels are negative), stored as text to
// dodge JS's Number-precision limit. Captain-managed.
export const telegramChats = pgTable("telegram_chats", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: telegramChatKindEnum("kind").notNull(),
  chatId: text("chat_id").notNull().unique(),
  title: text("title").notNull(),
  // Public username for the chat (without @), if any. Useful for
  // generating deep links and verifying webhook updates target the
  // expected chat.
  username: text("username"),
  addedByUserId: uuid("added_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  addedAt: timestamp("added_at", { mode: "date" }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { mode: "date" }),
});

// Single-use invite link issued to one camp user. Created when the user
// is approved; surfaced to the user in-app (and via push); marked `used`
// when the bot sees them join via this link in a `chat_member` update.
export const telegramInvites = pgTable(
  "telegram_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The Telegram chat id this link grants access to. Not an FK to
    // `telegram_chats` so a chat can be archived without losing the
    // historical link.
    chatId: text("chat_id").notNull(),
    inviteLink: text("invite_link").notNull().unique(),
    status: telegramInviteStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    joinedAt: timestamp("joined_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("telegram_invites_user_idx").on(t.userId),
    statusIdx: index("telegram_invites_status_idx").on(t.status),
  }),
);

// Outbound message to a Telegram chat (typically the announcement
// channel). A queue drained by the dispatch cron: rows are inserted
// `queued`, the worker calls `sendMessage`, and on success the row is
// flipped to `sent` with the returned `message_id`. Optional
// `broadcastId` cross-references a `broadcasts` row when the announcement
// was created as part of an in-app broadcast.
export const telegramAnnouncements = pgTable(
  "telegram_announcements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    broadcastId: uuid("broadcast_id").references(() => broadcasts.id, {
      onDelete: "set null",
    }),
    chatId: text("chat_id").notNull(),
    body: text("body").notNull(),
    status: telegramAnnouncementStatusEnum("status")
      .notNull()
      .default("queued"),
    // Telegram-assigned message id of the sent post, for back-reference.
    messageId: text("message_id"),
    errorMessage: text("error_message"),
    // Earliest time the dispatcher may send this row. Lets a caller
    // schedule a future announcement (e.g. on an unlock timestamp).
    sendAfter: timestamp("send_after", { mode: "date" }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    statusSendAfterIdx: index(
      "telegram_announcements_status_send_after_idx",
    ).on(t.status, t.sendAfter),
    broadcastIdx: index("telegram_announcements_broadcast_idx").on(
      t.broadcastId,
    ),
  }),
);

// --- MCP OAuth (server-only) --------------------------------------------
// Pure auth-server state for Claude.ai (and other MCP clients) connecting
// over OAuth 2.1 + Dynamic Client Registration. Nothing in here is
// rendered or surfaced to the app's UI — these tables back the routes
// under /api/mcp/oauth/* and the bearer-token check on /api/mcp/mcp.
// Design notes live in docs/mcp-tooling-proposal.md.

export const mcpClientAuthMethodEnum = pgEnum("mcp_client_auth_method", [
  "none",
  "client_secret_basic",
  "client_secret_post",
]);

export const mcpCodeChallengeMethodEnum = pgEnum("mcp_code_challenge_method", [
  "S256",
  "plain",
]);

export const mcpAuditOutcomeEnum = pgEnum("mcp_audit_outcome", [
  "success",
  "error",
]);

// One row per DCR-registered MCP client (typically one row per Claude
// install). Public clients (`token_endpoint_auth_method = 'none'`) leave
// `client_secret_hash` NULL; confidential clients store the SHA-256.
export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientSecretHash: text("client_secret_hash"),
  clientName: text("client_name").notNull(),
  // RFC 7591 — every URI the client is allowed to redirect to.
  redirectUris: text("redirect_uris").array().notNull(),
  tokenEndpointAuthMethod: mcpClientAuthMethodEnum(
    "token_endpoint_auth_method",
  ).notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
});

// Single-use authorization codes (RFC 6749 §4.1). PKCE-required per OAuth
// 2.1: code_challenge + code_challenge_method are non-null. Codes are
// short-lived (~5min) and stored plaintext — they're consumed once via
// the `consumed_at` flip in a transaction.
export const mcpAuthCodes = pgTable(
  "mcp_auth_codes",
  {
    code: text("code").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpOauthClients.clientId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: mcpCodeChallengeMethodEnum(
      "code_challenge_method",
    ).notNull(),
    scope: text("scope").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    clientIdx: index("mcp_auth_codes_client_idx").on(t.clientId),
    expiresIdx: index("mcp_auth_codes_expires_idx").on(t.expiresAt),
  }),
);

// Issued access + refresh tokens, stored as SHA-256 hashes. Plaintext
// tokens never hit the DB. Refresh rotates transactionally — see the
// briefing's gotcha around atomic revoke-old + insert-new.
export const mcpAccessTokens = pgTable(
  "mcp_access_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    refreshTokenHash: text("refresh_token_hash").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpOauthClients.clientId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { mode: "date" }),
    revokedAt: timestamp("revoked_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  },
  (t) => ({
    userIdx: index("mcp_access_tokens_user_idx").on(t.userId),
    expiresIdx: index("mcp_access_tokens_expires_idx").on(t.expiresAt),
  }),
);

// One row per MCP tool invocation. Captures the call regardless of
// outcome; state-mutating writes additionally append to the existing
// `audit_log` with `actor_id = camp user id`.
export const mcpAuditLog = pgTable(
  "mcp_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Not an FK — we want the audit row to survive a client being
    // deleted, since we still want forensic visibility after the fact.
    clientId: text("client_id").notNull(),
    tool: text("tool").notNull(),
    // Redacted arg snapshot — secrets, encrypted plaintext, etc. must
    // be stripped at the boundary before write.
    argsJson: jsonb("args_json"),
    outcome: mcpAuditOutcomeEnum("outcome").notNull(),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index("mcp_audit_log_user_created_idx").on(
      t.userId,
      t.createdAt,
    ),
  }),
);
