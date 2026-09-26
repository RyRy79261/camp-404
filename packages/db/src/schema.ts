import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  bigint,
  jsonb,
  numeric,
  date,
  primaryKey,
  foreignKey,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  CURRENT_KINDS,
  FUEL_TYPES,
  GENERATOR_OWNERS,
  LOAD_CATEGORIES,
  LOAD_OWNERS,
  LOAD_SCHEDULES,
  NOTIFICATION_KINDS,
  PARTICIPATION_INTENTS,
  PARTICIPATION_STATUSES,
  type CurrentKind,
  type FuelType,
  type GeneratorOwner,
  type LoadCategory,
  type LoadOwner,
  type LoadSchedule,
  type BuilderQuestionnaire,
  type DesktopLayout,
  type DraftReport,
  type JoinSiteContent,
  type KitchenRecipe,
  type PlateLine,
  type ProofreadExchange,
  type Questionnaire,
  type QuestionnaireFieldChange,
  type QuestionnaireResponses,
  type SourceDoc,
} from "@camp404/types";
// Type-only (erased at runtime — no import cycle with camp-config.ts, which
// imports this schema): types the camp_settings.config JSONB column. The
// SQL default literal below stays teams-only — cycles and the carry-over map
// are absent on every existing row and resolve to their defaults.
import type { CampConfig } from "./camp-config";

// Camp 404 schema. Authentication is self-hosted Better Auth (@camp404/auth):
// its tables (`user`, `session`, `account`, …) are declared below and hold
// credentials, sessions and identity. Our `users` table stores camp-specific
// profile data and joins to them via `auth_user_id` (Better Auth's `user.id`).

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

// Two-sided captain-promotion handshake (captain_promotion_requests). A captain
// SENDS a request; the target ACCEPTS in their own app before their rank flips
// to `captain`. Keep in sync with PromotionRequestStatus in @camp404/types.
export const promotionRequestStatusEnum = pgEnum("promotion_request_status", [
  "sent",
  "accepted",
  "declined",
  "cancelled",
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
  "finance",
  "transport_and_logistics",
  "communications_and_hr",
  "mutant_vehicle",
  "sound",
  "water",
]);

export const membershipTierEnum = pgEnum("membership_tier", [
  "full",
  "build_week_only",
]);

// The recipe lifecycle (#243). Mirrors RECIPE_STATUSES in @camp404/types; the
// allowed moves are RECIPE_TRANSITIONS in @camp404/core. Only `queued` recipes
// are ever sent to Anthropic, and only a captain queues one.
export const recipeStatusEnum = pgEnum("recipe_status", [
  "suggested",
  "changes_requested",
  "approved",
  "queued",
  "analysing",
  "proofread",
  "accepted",
  "rejected",
]);

// One proofreading run's state. A failed run still spent tokens, so it counts
// in the monthly usage.
export const recipeRunOutcomeEnum = pgEnum("recipe_run_outcome", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

// Legacy, from the first recipe draft: the units, scaling classes and keeping
// classes of recipe_version_ingredients, which is no longer written. The
// recipe's own units now live in recipe_versions.body (RECIPE_LINE_UNITS).
export const recipeUnitEnum = pgEnum("recipe_unit", ["g", "ml", "each"]);

export const recipeScalingClassEnum = pgEnum("recipe_scaling_class", [
  "linear",
  "sublinear",
  "fixed_per_batch",
  "step",
]);

export const ingredientKeepingClassEnum = pgEnum("ingredient_keeping_class", [
  "fresh",
  "resilient",
  "frozen",
  "stable_fridge",
  "shelf_stable",
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

// Mirrors PAYMENT_STATUSES in @camp404/core payment-references.ts.
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "reconciled",
  "waived",
]);

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

// Lifecycle of a builder-authored questionnaire DEFINITION (distinct from an
// activation's status). `unpublished` is the terminal, responses-preserving
// offline state — there is no separate "archived".
export const questionnaireStatusEnum = pgEnum("questionnaire_status", [
  "draft",
  "published",
  "unpublished",
]);

export const broadcastKindEnum = pgEnum("broadcast_kind", [
  "announcement",
  "team_message",
  "lead_directive",
  "reminder",
  "system",
]);

// What a delivery is about, for the member (NOTIFICATION_KINDS in
// @camp404/types is the one list; the TypeScript union comes from it too).
export const notificationKindEnum = pgEnum(
  "notification_kind",
  NOTIFICATION_KINDS,
);

// Where a member stands for one burn year (PARTICIPATION_STATUSES in
// @camp404/types is the one list; how an answer moves it is
// participationAfterIntent in @camp404/core).
export const participationStatusEnum = pgEnum(
  "participation_status",
  PARTICIPATION_STATUSES,
);

// The member's own Yes / Maybe / No for one burn year (PARTICIPATION_INTENTS).
export const participationIntentEnum = pgEnum(
  "participation_intent",
  PARTICIPATION_INTENTS,
);

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

// Whether a delivery also goes out by email, and how that went. Set from
// shouldEmailNotification (@camp404/core) when the delivery is written; rows
// from before email existed are `skipped`, so turning email on never mails
// old notices.
export const emailDeliveryStatusEnum = pgEnum("email_delivery_status", [
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

// A task's column on the shared task board: To do (`open`), Doing
// (`in_progress`), Done. `cancelled` is a removed task, kept for the record and
// shown nowhere.
export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "in_progress",
  "done",
  "cancelled",
]);

// Which of a task's two deadline reminders went out: the day before it is due,
// or on the day itself (task_deadline_reminders.stage).
export const taskReminderStageEnum = pgEnum("task_reminder_stage", [
  "day_before",
  "due_day",
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

// --- Sign-in identity (Better Auth) --------------------------------------
// Self-hosted Better Auth (@camp404/auth) owns these tables; they replace the
// managed Neon Auth service (owner's call, 2026-09-22: "I would like
// two-factor and passkeys"). Copied from the AfrikaBurn contributors app, whose
// login this is. Two identities, by design:
//   - `user`  — the sign-in identity: email, verification, password hash via
//               `account`, sessions via `session`, second factors.
//   - `users` — the camp member (below), and the target of every camp foreign
//               key, joined by `users.auth_user_id` → `user.id`.
// The join stays LOGICAL — deliberately no foreign key from `users` to `user`.
// Account erasure deletes the `user` row (email, password hash, sessions,
// passkeys go with it) and keeps the `users` row as the "Lost Cat #N" stub,
// so camp history keeps its references. A foreign key would force either
// cascading that stub away or blocking the erasure.
//
// The JS keys are Better Auth's field names (the drizzle adapter reads them);
// the columns are snake_case like the rest of this file.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Added by the twoFactor plugin: true once a TOTP enrolment is verified,
  // which is what makes sign-in ask for the code. The secret and the backup
  // codes live in `two_factor`, never on this row.
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (s) => ({ userIdx: index("session_user_id_idx").on(s.userId) }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
    }),
    scope: text("scope"),
    // The password hash, on the `credential` account. Never read by the app.
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (a) => ({ userIdx: index("account_user_id_idx").on(a.userId) }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (v) => ({
    identifierIdx: index("verification_identifier_idx").on(v.identifier),
  }),
);

// Better Auth's rate-limit counters, in the database so every serverless
// instance shares them (in-memory storage is per-instance: no limit at all).
// BETTER AUTH OWNS THIS TABLE OUTRIGHT, INCLUDING DELETING FROM IT: after a
// window rolls it sweeps every row older than about a minute, not only its
// own. Nothing of ours may live here; our counters are `action_rate_limit`.
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// The twoFactor plugin's per-user secret and backup codes, both ENCRYPTED
// (the plugin encrypts the secret; @camp404/auth sets
// `storeBackupCodes: "encrypted"`). One row per user who has started TOTP
// enrolment; `user.twoFactorEnabled` is the "actually on" flag.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count")
      .notNull()
      .default(0),
    lockedUntil: timestamp("locked_until", { mode: "date" }),
  },
  (t) => ({
    userIdx: index("two_factor_user_id_idx").on(t.userId),
    secretIdx: index("two_factor_secret_idx").on(t.secret),
  }),
);

// One row per registered passkey (the @better-auth/passkey plugin). A passkey
// is an extra way in, never the only one: password (or Google) stays, so a
// lost device is never a lockout. `counter` is the WebAuthn signature counter.
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    aaguid: text("aaguid"),
  },
  (t) => ({
    userIdx: index("passkey_user_id_idx").on(t.userId),
    credentialIdx: index("passkey_credential_id_idx").on(t.credentialID),
  }),
);

// --- Users ---------------------------------------------------------------
// Camp-specific profile. Identity (email, password, second factors, sessions)
// is the Better Auth `user` above; this table joins to it via
// `auth_user_id`, which holds `user.id`. Account + history persist across the
// yearly camp reset; per-burn data in other tables is cleared.

export const users = pgTable(
  "users",
  {
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
    // Superseded by the payments ledger: the roster's paid state is now derived
    // from this year's settled payments. Kept because the year rollover still
    // clears it, and nothing reads it for display any more.
    duesPaid: boolean("dues_paid").notNull().default(false),
    duesPaidAt: timestamp("dues_paid_at", { mode: "date" }),
    // The member's stable payment reference (`C404-M017`), quoted on an EFT to
    // the camp. Given out in join order; unique once set.
    refCode: text("ref_code"),

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
    // What the deciding captain told the member, shown on /pending-approval.
    // It belongs to the decision it was written for: every write that moves
    // approval_status also sets or clears it, so it can never outlive that state.
    approvalDecisionReason: text("approval_decision_reason"),

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

    // "What I am in camp" (owner, 2026-09-25): an optional title, such as
    // "The Original Error Code", and a short blurb, written by the member on
    // their profile and read by other members. `show_on_join` puts a
    // captain's card on join.camp-404.com; only a captain's card is shown
    // there, and only when they tick it. Erasure clears all three.
    campTitle: text("camp_title"),
    campBlurb: text("camp_blurb"),
    showOnJoin: boolean("show_on_join").notNull().default(false),

    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (u) => ({
    // Partial: most rows have no reference until the member needs one.
    refCodeUniq: uniqueIndex("users_ref_code_uniq")
      .on(u.refCode)
      .where(sql`${u.refCode} IS NOT NULL`),
  }),
);

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
// The member's dietary facts (the single source of truth for dietary data;
// there are no dietary columns on `users`). Written by a builder
// questionnaire's role questions on submit (allergies, anaphylactic, notes)
// and by the MCP tools; re-asked by sending that questionnaire again. AI
// recipe analysis reads from here.

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

// --- Year-scoped facts ----------------------------------------------------
// driver_profiles, car_members and team_memberships each carry a `cycle`. They
// are the camp owner's "must be established again" set: "who's driving in
// whose car and who's part of what team have to be fresh so that wouldn't
// carry over to the next year. Same with team lead roles."
//
// A carry-over flag on a questionnaire cannot deliver that, because these
// facts live in their own tables rather than in questionnaire_responses — with
// no year on the row, a rollover would leave every team, lead and car seat
// exactly as it was.
//
// Freshness is a READ rule, never a delete: the rollover touches none of these
// tables, and a query scoped to the new year simply finds no rows. Last year's
// roster and car lists stay on file and readable forever.

// --- Driver profiles -----------------------------------------------------
// Opt-in: a member registers intent to drive (`intends_to_drive`), plus
// arrival and departure days and vehicle detail. Written by a builder
// questionnaire's role questions on submit (driving this year, arrival day,
// departure day) and by the MCP tools. One row per member PER YEAR — a driver
// re-registers intent (and re-confirms the vehicle) each burn.

export const driverProfiles = pgTable(
  "driver_profiles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The burn year this profile belongs to. Defaults to 1 for the same reason
    // questionnaire_activations.cycle does: a migration cannot know what year
    // it is, so setFoundingYear() adopts every sentinel-stamped row into the
    // real founding year in the transaction that records it.
    cycle: integer("cycle").notNull().default(1),
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
  },
  (d) => ({
    // Widened from bare `user_id`. Safe on live data: every existing row is
    // already distinct on user_id, so (user_id, 1) stays unique.
    pk: primaryKey({ columns: [d.userId, d.cycle] }),
  }),
);

// --- Car members ---------------------------------------------------------
// A driver assigns riders to their car. "Driver" and "car group" are
// derived facets of a user profile, not ranks. This group can be a
// notification audience (broadcast scope 'drivers', or individual targets).
// Seats are per-year: who rides with whom is re-agreed every burn.

export const carMembers = pgTable(
  "car_members",
  {
    // No column-level .references(): driver_profiles.user_id is no longer
    // unique on its own, so the reference has to carry the year with it — see
    // driverFk below.
    driverUserId: uuid("driver_user_id").notNull(),
    memberUserId: uuid("member_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cycle: integer("cycle").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (c) => ({
    // The same rider may sit in the same driver's car in two different years,
    // but never twice in one.
    pk: primaryKey({ columns: [c.driverUserId, c.memberUserId, c.cycle] }),
    // Widened rather than dropped: the seat points at THAT year's driver
    // profile, so a 2027 seat can never hang off a 2026 car. ON UPDATE CASCADE
    // because the referenced key is now mutable in exactly one place —
    // setFoundingYear() moving pre-namespace rows off the sentinel — and the
    // seats have to ride along with the car rather than block the adoption.
    driverFk: foreignKey({
      columns: [c.driverUserId, c.cycle],
      foreignColumns: [driverProfiles.userId, driverProfiles.cycle],
      name: "car_members_driver_cycle_fk",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
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
    // Year-scoped like the membership itself: a lead stops leading at the
    // rollover until a captain says otherwise, which is the owner's ruling.
    isLead: boolean("is_lead").notNull().default(false),
    cycle: integer("cycle").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (tm) => ({
    // The same member may be on the same team in 2026 and 2027, but is listed
    // at most once in either.
    pk: primaryKey({ columns: [tm.userId, tm.team, tm.cycle] }),
    teamIdx: index("team_memberships_team_idx").on(tm.team),
  }),
);

// --- Camp participations --------------------------------------------------
// Who is coming this year: one row per member per burn year. The member writes
// it by answering Yes / Maybe / No (applied / maybe / not_attending); a captain
// then accepts them or puts them on the waiting list, a compare-and-set on the
// status they saw, audited. Year-scoped like team_memberships, so a new year
// starts with nobody answered and last year's answers stay on file. Written
// only through @camp404/db/participations.

export const campParticipations = pgTable(
  "camp_participations",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The burn year. Defaults to the UNSET_CYCLE sentinel (1) like
    // driver_profiles: a row written before the camp names its founding year
    // is adopted into that year by setFoundingYear().
    cycle: integer("cycle").notNull().default(1),
    status: participationStatusEnum("status").notNull(),
    // What the member last answered, kept apart from `status`: a captain's
    // Accept reads back to the member as the Maybe they actually gave, and a
    // Maybe that leaves an accepted place alone is still recorded.
    intent: participationIntentEnum("intent").notNull(),
    // The captain who last accepted or waitlisted this member, and when. Null
    // until a captain decides.
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { mode: "date" }),
    // Why, when a captain gives one. Nothing writes it yet.
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (cp) => ({
    pk: primaryKey({ columns: [cp.userId, cp.cycle] }),
    cycleStatusIdx: index("camp_participations_cycle_status_idx").on(
      cp.cycle,
      cp.status,
    ),
  }),
);

// --- Payments ledger ------------------------------------------------------
// Owner's call (2026-09-16): a full payments ledger with amounts and
// references, not a "paid" toggle. The app never moves money: a member pays
// the camp by EFT quoting their reference, and a captain records what the bank
// statement shows. One row per payment, keyed to a burn year, so a new year
// starts with nobody paid and last year's ledger stays readable.
//
// The member's dues are settled for a year once any payment that year is
// reconciled (seen in the bank) or waived.

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cycle: integer("cycle").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // ISO 4217 code, always ZAR: the camp records money in rands only
    // (CURRENCIES in @camp404/core), held by payments_currency_check.
    currency: text("currency").notNull().default("ZAR"),
    // `C404-M017-2027-1`: the member reference, the year, and that member's
    // payment count that year. Unique across the ledger.
    reference: text("reference").notNull().unique(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    // What the captain saw, e.g. the bank statement line. Scrubbed on erasure.
    note: text("note"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (p) => ({
    userCycleIdx: index("payments_user_cycle_idx").on(p.userId, p.cycle),
    cycleIdx: index("payments_cycle_idx").on(p.cycle),
    currencyCheck: check("payments_currency_check", sql`${p.currency} = 'ZAR'`),
  }),
);

// --- Captain notes ---------------------------------------------------------
// A captain's private notes about a member (owner's call, 2026-09-16: captains
// only, every read and write audited, never in a roster or an export).
// Append-only: a note is never edited, so the list is its own history. The
// author is kept as a link that goes null if that account is erased; the note
// itself is about the member and is deleted when THEY are erased.

export const memberNotes = pgTable(
  "member_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (n) => ({
    userCreatedIdx: index("member_notes_user_created_idx").on(
      n.userId,
      n.createdAt,
    ),
  }),
);

// --- Captain-promotion requests ------------------------------------------
// The durable pending state behind the two-sided "make captain" handshake —
// the redesign's ONLY schema change. `setUserRank` is a one-sided write and
// cannot model "captain sends → target accepts before rank flips", so the
// `sent` row IS the pending request; rank flips to `captain` only on the
// target's `accepted` transition (an explicit `setUserRank` call in the accept
// action — this table carries no cross-table side effects). At most one OPEN
// (`sent`) request per target is enforced by a partial unique index, which
// backs the app's idempotent-send rule.
export const captainPromotionRequests = pgTable(
  "captain_promotion_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Nullable + ON DELETE SET NULL so a request row SURVIVES as an audit
    // record when a referenced user is removed. The normal account-deletion
    // path is a soft SANITISE (the user row is kept, PII scrubbed), so the FK
    // keeps pointing at the sanitised identity; SET NULL is the fallback for a
    // true hard delete (event retained, identity dropped). Never cascade —
    // that would destroy the audit record (OD3 → audit-retention).
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: promotionRequestStatusEnum("status").notNull().default("sent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { mode: "date" }),
  },
  (t) => ({
    openPerTarget: uniqueIndex("captain_promotion_open_per_target_idx")
      .on(t.targetUserId)
      .where(sql`${t.status} = 'sent'`),
    targetIdx: index("captain_promotion_target_idx").on(t.targetUserId),
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

    // The camp cycle current at Send time. Immutable afterwards, so a response
    // inherits the cycle its form was OPENED in rather than the config's cycle
    // at submit time (which kills the mid-submit rollover race). Default 1
    // stamps every existing row into the founding cycle — no backfill script.
    cycle: integer("cycle").notNull().default(1),

    // The carry-over policy, COPIED off the definition at Send time exactly as
    // `version` and `title` already are, and exactly as
    // notification_deliveries.presentation is copied off broadcasts. Flipping
    // the definition toggle affects the NEXT send, never the one in flight.
    carryOver: boolean("carry_over").notNull().default(true),
  },
  (a) => ({
    keyIdx: index("questionnaire_activations_key_idx").on(a.questionnaireKey),
    statusIdx: index("questionnaire_activations_status_idx").on(a.status),
    // At most one OPEN activation per questionnaire key (spec §6.3). To change
    // scope / blocking / dueAt the captain closes the current activation and
    // opens a fresh one; this partial unique index forbids a second overlapping
    // open at the database level (the Send action also pre-checks for a clean
    // error). Mirrors captain_promotion_open_per_target_idx.
    oneOpenPerKey: uniqueIndex("questionnaire_activations_one_open_per_key_idx")
      .on(a.questionnaireKey)
      .where(sql`${a.status} = 'open'`),
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
// Kitchen 1 (#243). A recipe is a suggestion until a Kitchen lead or a captain
// approves it, and has no food on record until a version is accepted. The dish
// (its name, who suggested it, where it came from) lives here; the food
// (ingredients, method, prep plan) lives in recipe_versions, one row per
// change. Recipes are not year-scoped: next year's menu starts from the
// accepted versions.

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Nullable, so ON DELETE SET NULL can do what it says. Erasure keeps the
    // users row as the Lost Cat stub, so in practice the link stays.
    submitterId: uuid("submitter_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: recipeSourceEnum("source").notNull(),
    status: recipeStatusEnum("status").notNull().default("suggested"),
    // Rows from before #243 have no title; every new suggestion needs one.
    title: text("title"),

    sourceUrl: text("source_url"),
    // The working text: what a captain or a Kitchen lead may send to Claude. A voice
    // suggestion stores only its transcript, never the audio.
    rawText: text("raw_text"),
    audioBlobUrl: text("audio_blob_url"),
    transcript: text("transcript"),
    // Why it suits the camp. Never sent to Anthropic.
    suitabilityNote: text("suitability_note"),
    // Whose words the working text is. A lead or captain who retypes the
    // text becomes its author, and their consent is what counts.
    textAuthorId: uuid("text_author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // When the text's author ticked "a captain or a Kitchen lead may send this
    // text to Claude".
    // Null means proofreading is refused until someone retypes it.
    aiConsentAt: timestamp("ai_consent_at", { mode: "date" }),

    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    rejectedBy: uuid("rejected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectedAt: timestamp("rejected_at", { mode: "date" }),
    rejectionReason: text("rejection_reason"),
    // What the reviewer asked the submitter to change.
    changesNote: text("changes_note"),
    queuedBy: uuid("queued_by").references(() => users.id, {
      onDelete: "set null",
    }),
    queuedAt: timestamp("queued_at", { mode: "date" }),
    // The last proofreading error, shown until the next run.
    lastError: text("last_error"),
    // A Kitchen lead's request that a captain run proofreading again, with
    // what should change. Cleared when a captain queues the next run.
    rerunRequest: text("rerun_request"),
    rerunRequestedBy: uuid("rerun_requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rerunRequestedAt: timestamp("rerun_requested_at", { mode: "date" }),
    // The newest run and the version the recipe book shows. Both tables
    // point back here too; the columns are nullable, so a recipe is written
    // first and pointed at its run or version afterwards.
    latestRunId: uuid("latest_run_id").references(
      (): AnyPgColumn => recipeProofreadRuns.id,
      { onDelete: "set null" },
    ),
    acceptedVersionId: uuid("accepted_version_id").references(
      (): AnyPgColumn => recipeVersions.id,
      { onDelete: "set null" },
    ),

    // Legacy, from the first recipe design; kept so no data is dropped.
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

// A recipe's source: the text a Kitchen lead or a captain edits in the source
// editor and sends to Claude, one row per saved version. Each section is a
// Tiptap document (SourceDoc in @camp404/types), checked by Zod on every
// write; Claude reads the Markdown-like text built from them (sourceText in
// @camp404/core). `authorId` is whose words these are: a member's suggestion,
// or the reviewer who changed it, whose change is their agreement to send it.
export const recipeSources = pgTable(
  "recipe_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // How many the source says it serves; null when it does not say.
    serves: integer("serves"),
    ingredients: jsonb("ingredients").$type<SourceDoc>().notNull(),
    equipment: jsonb("equipment").$type<SourceDoc>().notNull(),
    steps: jsonb("steps").$type<SourceDoc>().notNull(),
    notes: jsonb("notes").$type<SourceDoc>().notNull(),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    recipeVersionIdx: uniqueIndex("recipe_sources_recipe_version_idx").on(
      t.recipeId,
      t.version,
    ),
    servesCheck: check(
      "recipe_sources_serves_check",
      sql`${t.serves} between 1 and 500`,
    ),
  }),
);

// One proofreading run: who asked for it, what it cost in tokens and what came
// back. Every run is kept, failed ones too, so the monthly usage counts what
// was really spent.
export const recipeProofreadRuns = pgTable(
  "recipe_proofread_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    // The captain who pressed Run.
    requestedBy: uuid("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedAt: timestamp("requested_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    // The captain's note for a re-run, sent to Claude with the text.
    note: text("note"),
    startedAt: timestamp("started_at", { mode: "date" }),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    outcome: recipeRunOutcomeEnum("outcome").notNull().default("queued"),
    error: text("error"),
    // What Claude answered: a RecipeDraft for a `recipe` run, a
    // PlateProofread for a `plates` run. Typed unknown and parsed on read,
    // because a run stored under an older contract must read as unreadable
    // rather than as the new shape.
    result: jsonb("result").$type<unknown>(),
    // `recipe`: Claude turns the working text into a draft for a reviewer
    // (the older path). `source`: Claude reads a source version (`sourceId`)
    // and either asks questions or writes the recipe straight into the book.
    // `plates`: Claude proofreads an accepted version (`versionId`) for
    // `plates` plates. `adjust`: Claude writes the next version from one
    // version (`versionId`) and what a reviewer said should change
    // (`instruction`), and either asks questions or writes it into the book.
    kind: text("kind").notNull().default("recipe"),
    // What should change, on an `adjust` run: the reviewer's own words.
    instruction: text("instruction"),
    // The plates the run writes the recipe for.
    plates: integer("plates"),
    versionId: uuid("version_id").references(
      (): AnyPgColumn => recipeVersions.id,
      { onDelete: "cascade" },
    ),
    // Where the recipe stood when this run was queued, so a failed run hands
    // it back there: a re-run that fails leaves an accepted recipe accepted,
    // and a proofread one still holding the earlier result it was waiting on.
    previousStatus: recipeStatusEnum("previous_status"),
    previousRunId: uuid("previous_run_id").references(
      (): AnyPgColumn => recipeProofreadRuns.id,
      { onDelete: "set null" },
    ),
    // The source version a `source` run reads.
    sourceId: uuid("source_id").references(() => recipeSources.id, {
      onDelete: "set null",
    }),
    // How far a running `source` or `adjust` run has got, as the worker writes it; the
    // loading panel shows only these. Null before the run is claimed.
    stage: text("stage"),
    // Every round of Claude's questions and the reviewer's answers that this
    // run carries to Claude (ProofreadExchange). Empty on a first run.
    exchange: jsonb("exchange").$type<ProofreadExchange>(),
  },
  (t) => ({
    requestedAtIdx: index("recipe_proofread_runs_requested_at_idx").on(
      t.requestedAt,
    ),
    recipeIdx: index("recipe_proofread_runs_recipe_idx").on(t.recipeId),
    kindCheck: check(
      "recipe_proofread_runs_kind_check",
      sql`${t.kind} in ('recipe', 'plates', 'source', 'adjust')`,
    ),
    // An adjust run names the version it starts from and what should change.
    adjustCheck: check(
      "recipe_proofread_runs_adjust_check",
      sql`${t.kind} <> 'adjust' OR (${t.versionId} IS NOT NULL AND ${t.instruction} IS NOT NULL)`,
    ),
    stageCheck: check(
      "recipe_proofread_runs_stage_check",
      sql`${t.stage} in ('sending', 'reading', 'checking', 'saving')`,
    ),
    platesCheck: check(
      "recipe_proofread_runs_plates_check",
      sql`${t.plates} between 1 and 500`,
    ),
    // One open plate run per (version, plate count): a second captain
    // pressing the same count is refused rather than paying twice.
    openPlatesIdx: uniqueIndex("recipe_proofread_runs_open_plates_idx")
      .on(t.versionId, t.plates)
      .where(
        sql`${t.kind} = 'plates' AND ${t.outcome} IN ('queued', 'running')`,
      ),
  }),
);

// The ingredient catalogue, filled as recipes are accepted and matched by
// lower-cased name. `category` is the shopping-list category (one of
// INGREDIENT_CATEGORIES), filled from the first recipe that names it; Noble
// Notations keeps the category on its ingredient record the same way. The
// keeping class, allergens and units are legacy from the first draft. The
// supplier columns wait for the shopping list (#245).
export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    otherNames: jsonb("other_names").$type<string[]>().notNull().default([]),
    category: text("category"),
    keepingClass: ingredientKeepingClassEnum("keeping_class"),
    allergens: jsonb("allergens").$type<string[]>().notNull().default([]),
    canonicalUnit: recipeUnitEnum("canonical_unit"),
    conversions: jsonb("conversions").$type<Record<string, number>>(),
    packSizes: jsonb("pack_sizes").$type<number[]>().notNull().default([]),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: uniqueIndex("ingredients_name_lower_idx").on(
      sql`lower(${t.name})`,
    ),
  }),
);

// One version of a recipe's food. Changing the food makes a new version with
// a reason; the old ones stay readable. `runId` is null for a version written
// by hand.
export const recipeVersions = pgTable(
  "recipe_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // The plates the recipe is written for: body.plates.
    servingsBasis: integer("servings_basis").notNull(),
    // The whole recipe in Noble Notations' shape (KitchenRecipe), checked by
    // Zod on every write. Null only on a row from the first draft that the
    // 0057 migration has not converted.
    body: jsonb("body").$type<KitchenRecipe>(),
    // Legacy, from the first draft; no longer written. Kept, not dropped,
    // because preview deployments share the production database.
    method: text("method"),
    prepPlan: jsonb("prep_plan").$type<unknown>(),
    flags: jsonb("flags").$type<unknown>(),
    // What Claude changed and was unsure of (DraftReport); null for a version
    // written by hand. A first-draft row may hold an older shape.
    report: jsonb("report").$type<DraftReport | null>(),
    runId: uuid("run_id").references(() => recipeProofreadRuns.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // The source version Claude wrote this version from; null for one
    // written any other way.
    sourceId: uuid("source_id").references(() => recipeSources.id, {
      onDelete: "set null",
    }),
    // How Claude scaled the source to the version's plates, shown to every
    // reader under the recipe. Empty for a version written any other way.
    scalingNotes: jsonb("scaling_notes")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    recipeVersionIdx: uniqueIndex("recipe_versions_recipe_version_idx").on(
      t.recipeId,
      t.version,
    ),
  }),
);

// Legacy, no longer written: a first-draft version's ingredients, each with
// how it scaled. The 0057 migration copied them into recipe_versions.body.
// Kept, not dropped, because preview deployments share the production
// database.
export const recipeVersionIngredients = pgTable(
  "recipe_version_ingredients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    quantityPerServing: doublePrecision("quantity_per_serving").notNull(),
    unit: recipeUnitEnum("unit").notNull(),
    scalingClass: recipeScalingClassEnum("scaling_class").notNull(),
    scalingExponent: doublePrecision("scaling_exponent"),
    perBatchAmount: doublePrecision("per_batch_amount"),
    stepSize: doublePrecision("step_size"),
    conversionNote: text("conversion_note"),
    prepNote: text("prep_note"),
    optional: boolean("optional").notNull().default(false),
    // What this version says about the ingredient, as the reviewer accepted
    // it. The catalogue keeps what it learned first; a version that corrects
    // an allergen or a keeping class must not lose the correction to it.
    keepingClass: ingredientKeepingClassEnum("keeping_class"),
    allergens: jsonb("allergens").$type<string[]>().notNull().default([]),
  },
  (t) => ({
    versionIdx: index("recipe_version_ingredients_version_idx").on(
      t.versionId,
      t.position,
    ),
    ingredientIdx: index("recipe_version_ingredients_ingredient_idx").on(
      t.ingredientId,
    ),
  }),
);

// A version's recipe written for one number of plates. Food does not scale by
// multiplying, so each count is proofread by Claude once and kept: moving a
// day from 50 plates to 45 and back to 50 reads the stored 50. The version's
// own count is a row too (source `version`), written with the version, so the
// shopping list (#245) reads this one table for every count. A new version
// starts with only its own count: counts proofread for the old food do not
// carry over.
export const recipePlateCounts = pgTable(
  "recipe_plate_counts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    plates: integer("plates").notNull(),
    // One line per recipe line, in the recipe's order (checkPlateLines).
    lines: jsonb("lines").$type<PlateLine[]>().notNull(),
    // How many pots the count needs, when it was worked out.
    pots: integer("pots"),
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
    report: jsonb("report").$type<DraftReport | null>(),
    // `version`: the version's own count. `proofread`: Claude's answer.
    source: text("source").notNull(),
    runId: uuid("run_id").references(() => recipeProofreadRuns.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    versionPlatesIdx: uniqueIndex("recipe_plate_counts_version_plates_idx").on(
      t.versionId,
      t.plates,
    ),
    platesCheck: check(
      "recipe_plate_counts_plates_check",
      sql`${t.plates} between 1 and 500`,
    ),
    sourceCheck: check(
      "recipe_plate_counts_source_check",
      sql`${t.source} in ('version', 'proofread')`,
    ),
  }),
);

// What the cooks learned ("tinned mushrooms work fine") making one version of
// a recipe, stamped with the burn year it was learned in. The version's own
// page lists its lessons. Post-burn feedback attaches here.
export const recipeLessons = pgTable(
  "recipe_lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    cycle: integer("cycle").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    recipeIdx: index("recipe_lessons_recipe_idx").on(t.recipeId),
    versionIdx: index("recipe_lessons_version_idx").on(t.versionId),
  }),
);

// The kitchen's meal plan for one year (the owner's sketch, 2026-09-24): how
// many days the camp is on site, the date of day 1, and the plates at
// breakfast, lunch and dinner on each day. A recipe in the book is shown at
// each distinct count in it, and the largest is what Claude writes a new
// recipe for. Anyone approved reads it; a captain or a Kitchen lead saves it,
// audited and compare-and-set on `version`. No row means the defaults (11
// empty days, no date).
export const kitchenMealPlans = pgTable(
  "kitchen_meal_plans",
  {
    cycle: integer("cycle").primaryKey(),
    daysOnSite: integer("days_on_site").notNull().default(11),
    // The date of day 1 (YYYY-MM-DD), which dates every day on the page;
    // null until someone sets it.
    firstDay: date("first_day", { mode: "string" }),
    version: integer("version").notNull().default(1),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (p) => ({
    // The bounds mirror MEAL_PLAN_MAX_DAYS in @camp404/types.
    daysCheck: check(
      "kitchen_meal_plans_days_check",
      sql`${p.daysOnSite} between 1 and 30`,
    ),
  }),
);

// One day of a year's meal plan: the plates at each meal, 0 for no meal.
// Days 1 to days_on_site; a save replaces the year's rows.
export const kitchenMealPlanDays = pgTable(
  "kitchen_meal_plan_days",
  {
    cycle: integer("cycle")
      .notNull()
      .references(() => kitchenMealPlans.cycle, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    breakfast: integer("breakfast").notNull().default(0),
    lunch: integer("lunch").notNull().default(0),
    dinner: integer("dinner").notNull().default(0),
  },
  (d) => ({
    pk: primaryKey({ columns: [d.cycle, d.day] }),
    dayCheck: check(
      "kitchen_meal_plan_days_day_check",
      sql`${d.day} between 1 and 30`,
    ),
    platesCheck: check(
      "kitchen_meal_plan_days_plates_check",
      sql`${d.breakfast} between 0 and 500 and ${d.lunch} between 0 and 500 and ${d.dinner} between 0 and 500`,
    ),
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
    // ISO 4217 code, always ZAR: a claim is made in rands, because the camp
    // records money in rands only (CURRENCIES in @camp404/core), held by
    // reimbursements_currency_check.
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
    currencyCheck: check(
      "reimbursements_currency_check",
      sql`${r.currency} = 'ZAR'`,
    ),
  }),
);

// --- Team budgets --------------------------------------------------------
// Lightweight per-team budget: assigned (allocated) vs perceived
// (projected) spend. Deliberately simple — reimbursements are the ledger.

// One budget per team PER YEAR: a new year starts with no budgets. `cycle`
// defaults to the pre-namespace sentinel like every year-scoped table, and
// setFoundingYear adopts sentinel rows into the founding year.
export const teamBudgets = pgTable(
  "team_budgets",
  {
    team: teamEnum("team").notNull(),
    cycle: integer("cycle").notNull().default(1),
    // ISO 4217 code, always ZAR: the camp records money in rands only
    // (CURRENCIES in @camp404/core), held by team_budgets_currency_check.
    currency: text("currency").notNull().default("ZAR"),
    assignedAmount: numeric("assigned_amount", { precision: 12, scale: 2 }),
    perceivedAmount: numeric("perceived_amount", { precision: 12, scale: 2 }),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (tb) => ({
    pk: primaryKey({ columns: [tb.team, tb.cycle] }),
    currencyCheck: check(
      "team_budgets_currency_check",
      sql`${tb.currency} = 'ZAR'`,
    ),
  }),
);

// --- Desktop layouts -----------------------------------------------------
// Where a member keeps the icons on their 404 OS desktop, and the shortcuts
// and folders they made there (owner's decision 14 B, 2026-09-26: on the
// server, so it follows the member to every device). One row per member, one
// JSONB value in the `DesktopLayout` shape (@camp404/types): program ids, grid
// cells and folder names the member typed, nothing else. Checked with Zod on
// write and on read (a bad value reads as the default layout) and pruned
// against the member's manifest, so it is never authority. Only the member
// writes their own row; it is not privileged, so no audit row. Account
// erasure deletes it (account.ts), since the kept users row stops the cascade.

export const desktopLayouts = pgTable("desktop_layouts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  layout: jsonb("layout").$type<DesktopLayout>().notNull(),
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

    // --- Pinning ---------------------------------------------------------
    // "Does it stay on screen after it lands" — the second axis beside
    // `presentation` ("how loudly it lands"). NULL means not pinned. A pinned
    // announcement rides in a banner above every console page, for the members
    // it was delivered to; any presentation may be pinned.
    //
    // Pinning authority follows POSTING authority (owner's call, 2026-09-22):
    // whoever may address this broadcast's audience may pin it to that
    // audience. `canSendToAudience` in @camp404/core decides, once.
    //
    // A pin exists only on a PUBLISHED broadcast. A draft carries the
    // composer's intent instead (`pin_on_publish`), and publishing turns that
    // intent into a real pin, audited, in the same transaction. Writing
    // `pinned_at` at draft-save time would have put a pin on every member's
    // screen through a path that logs nothing, and re-stamped its time on
    // every later edit, so the newest-first order was the last edit's order.
    pinnedAt: timestamp("pinned_at", { mode: "date" }),
    // Who set the mark. `set null` rather than cascade: losing the captain
    // must not silently unpin the camp's standing notice.
    pinnedBy: uuid("pinned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    // The composer's "keep it at the top", recorded on the draft. It is an
    // intent, not a pin: nothing reads it but `publishAnnouncement`, which
    // clears it as it sets the real pin.
    pinOnPublish: boolean("pin_on_publish").notNull().default(false),
  },
  (b) => ({
    senderIdx: index("broadcasts_sender_idx").on(b.senderId),
    createdAtIdx: index("broadcasts_created_at_idx").on(b.createdAt),
    // The banner's read is "the pinned ones", on every console page load, and
    // the pinned set is tiny next to the table — a partial index keeps it so.
    pinnedIdx: index("broadcasts_pinned_idx")
      .on(b.publishedAt.desc())
      .where(sql`${b.pinnedAt} is not null`),
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

    // Set from the payload builder in @camp404/core. The default only covers
    // rows written before the column existed (migration 0024 backfills the
    // questionnaire ones); every writer passes it.
    kind: notificationKindEnum("kind").notNull().default("announcement"),
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
    emailStatus: emailDeliveryStatusEnum("email_status")
      .notNull()
      .default("skipped"),

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
    // The email drain reads only queued rows.
    emailQueueIdx: index("notification_deliveries_email_queue_idx")
      .on(n.createdAt)
      .where(sql`${n.emailStatus} = 'queued'`),
    // The inbox pages newest first: (created_at, id) is its cursor.
    userCreatedIdx: index("notification_deliveries_user_created_idx").on(
      n.userId,
      n.createdAt.desc(),
      n.id.desc(),
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
// Non-blocking to-dos with deadlines, shown on the shared task board
// (`packages/db/src/tasks.ts`). Assigned to a member, a team, or both.
// [CORRECTION 2026-09-24] Reminders exist now: the daily reminders cron nudges
// the person responsible the day before a task is due and on the day
// (`remindTaskDeadlines`, recorded in `task_deadline_reminders`).

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
    // Bumped by an edit only, so an edit is a compare-and-set against the
    // version the editor opened. A move or a removal leaves it alone: someone
    // moving the card does not spoil an edit that is already open.
    version: integer("version").notNull().default(1),
  },
  (t) => ({
    assigneeIdx: index("tasks_assignee_idx").on(t.assigneeId),
    teamIdx: index("tasks_team_idx").on(t.team),
    statusIdx: index("tasks_status_idx").on(t.status),
  }),
);

// One row per deadline reminder the cron sent. The key includes the due day
// and the person, so moving a deadline or handing the task to someone new
// sends a fresh reminder, and a re-run never sends twice: the cron inserts
// here with ON CONFLICT DO NOTHING and writes the delivery only when a row
// comes back.
export const taskDeadlineReminders = pgTable(
  "task_deadline_reminders",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The camp day the task was due on when the reminder went out.
    dueDay: date("due_day", { mode: "string" }).notNull(),
    stage: taskReminderStageEnum("stage").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (r) => ({
    pk: primaryKey({ columns: [r.taskId, r.userId, r.dueDay, r.stage] }),
  }),
);

// --- Meeting notes (#268) ---------------------------------------------------

// What a team's meeting, or the whole camp's, planned, decided and handed out.
// A bespoke table (AGENTS.md "Bespoke over generic"), year-scoped by `cycle`,
// stamped from the camp's current year when the note is written. `team` null
// is a whole-camp meeting. Every approved member reads every note; a team's
// members this year and captains write them (canWorkInTeam in @camp404/core).
// Notes are camp-internal and never on a public page.
export const meetingNotes = pgTable(
  "meeting_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycle: integer("cycle").notNull(),
    team: teamEnum("team"),
    title: text("title").notNull(),
    // When the meeting started, typed as a camp day and time.
    heldAt: timestamp("held_at", { mode: "date" }).notNull(),
    // The camp calendar's event for this meeting, when there is one. The
    // event lives in Google; its title is kept as it was when it was linked,
    // so the note still names it once the event has passed or gone.
    calendarEventId: text("calendar_event_id"),
    calendarEventTitle: text("calendar_event_title"),
    // Markdown, rendered on the note's page.
    agenda: text("agenda").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    // Bumped by every edit, so an edit is a compare-and-set against the
    // version the editor opened.
    version: integer("version").notNull().default(1),
  },
  (n) => ({
    teamHeldIdx: index("meeting_notes_team_held_idx").on(n.team, n.heldAt),
    cycleIdx: index("meeting_notes_cycle_idx").on(n.cycle),
  }),
);

// Who was at the meeting: ticked from the team's members plus anyone else.
export const meetingNoteAttendees = pgTable(
  "meeting_note_attendees",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => meetingNotes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (a) => ({
    pk: primaryKey({ columns: [a.noteId, a.userId] }),
    userIdx: index("meeting_note_attendees_user_idx").on(a.userId),
  }),
);

// What the meeting decided, one short line each, in the order written. Rows
// of their own so a team's decisions this year can be listed across notes.
export const meetingNoteDecisions = pgTable(
  "meeting_note_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => meetingNotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (d) => ({
    noteIdx: index("meeting_note_decisions_note_idx").on(d.noteId),
  }),
);

// Who does what next. One click turns an item into a task on the board
// (`task_id`), and the note then shows the task's live status. Once it is a
// task the item's words are fixed: the task is where the work is tracked.
export const meetingNoteActionItems = pgTable(
  "meeting_note_action_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => meetingNotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // A camp day, YYYY-MM-DD: the task's deadline when it becomes one.
    dueOn: date("due_on", { mode: "string" }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
  },
  (i) => ({
    noteIdx: index("meeting_note_action_items_note_idx").on(i.noteId),
    // One action item makes at most one task.
    taskUniq: uniqueIndex("meeting_note_action_items_task_uniq").on(i.taskId),
  }),
);

// --- Burner adoption -----------------------------------------------------

// Adoption slots are numbered afresh each year, so a slot number is unique
// within its year only.
export const adoptees = pgTable(
  "adoptees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycle: integer("cycle").notNull().default(1),
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
  },
  (a) => ({
    cycleSlotIdx: uniqueIndex("adoptees_cycle_slot_idx").on(
      a.cycle,
      a.slotNumber,
    ),
  }),
);

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
    // The running draw of one unit, in watts, for gear that plugs in. The
    // power load list's "From inventory" helper reads it (#253). Null for
    // anything that draws no power, and for every item until inventory has
    // a screen of its own (#246).
    wattsEach: doublePrecision("watts_each"),

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

// --- Power and fuel (#253, #254) -------------------------------------------
// The Power & Lighting team's plan: what the camp plugs in each year, the
// generators it can run it on, and one row of settings per year. Only a
// captain or a Power & Lighting lead writes here (canEditPower, re-read in
// each write's transaction); anyone in the camp reads it. There is no money
// here: no prices, costs or budgets.
//
// The vocabularies are text with CHECK constraints built from the constants
// @camp404/types validates with, not pgEnums (a Postgres enum is hard to
// change).

/** A text column's vocabulary as a CHECK, from the constant the code uses. */
function oneOf(column: AnyPgColumn, values: readonly string[]) {
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
}

// A generator is gear, not a year's data: it is kept across the rollover and
// archived, never deleted, so an earlier year's plan that names it stays
// readable. Its owner is only "camp", "member_lent" or "hired": a lent one
// names no member.
export const generators = pgTable(
  "generators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    model: text("model").notNull(),
    // The continuous output the datasheet rates it for, and the most it gives
    // for a moment.
    ratedKva: doublePrecision("rated_kva").notNull(),
    maxKva: doublePrecision("max_kva").notNull(),
    tankLitres: doublePrecision("tank_litres").notNull(),
    // Hours a full tank lasts at 50% and at 100% load, from the datasheet.
    runtime50Hours: doublePrecision("runtime_50_hours").notNull(),
    runtime100Hours: doublePrecision("runtime_100_hours").notNull(),
    fuelType: text("fuel_type").$type<FuelType>().notNull(),
    owner: text("owner").$type<GeneratorOwner>().notNull(),
    inventoryItemId: uuid("inventory_item_id").references(
      () => inventoryItems.id,
      { onDelete: "set null" },
    ),
    noiseNote: text("noise_note"),
    archivedAt: timestamp("archived_at", { mode: "date" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Bumped by every edit, so an edit is a compare-and-set against the
    // version the editor opened.
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (g) => ({
    fuelTypeCheck: check(
      "generators_fuel_type_check",
      oneOf(g.fuelType, FUEL_TYPES),
    ),
    ownerCheck: check(
      "generators_owner_check",
      oneOf(g.owner, GENERATOR_OWNERS),
    ),
    kvaCheck: check(
      "generators_kva_check",
      sql`${g.ratedKva} > 0 and ${g.maxKva} >= ${g.ratedKva}`,
    ),
    tankCheck: check(
      "generators_runtime_check",
      sql`${g.tankLitres} > 0 and ${g.runtime100Hours} > 0 and ${g.runtime50Hours} > ${g.runtime100Hours}`,
    ),
  }),
);

// One row of the load list, in one year. `cycle` is stamped by the writer
// with currentCycleNumber(), never a default, so a row cannot land on the
// sentinel year by accident. Its days are day numbers on site (day 2 to day
// 5), not dates, so "copy last year" carries them over unchanged.
//
// There is deliberately no member id: a member's own load stores only
// owner = 'member', so no name can reach the camp.
export const powerLoads = pgTable(
  "power_loads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycle: integer("cycle").notNull(),
    name: text("name").notNull(),
    area: text("area").notNull(),
    category: text("category").$type<LoadCategory>().notNull(),
    quantity: integer("quantity").notNull(),
    // Running draw of one item, W; its start-up draw when known.
    wattsEach: doublePrecision("watts_each").notNull(),
    surgeWattsEach: doublePrecision("surge_watts_each"),
    // The share of the time it draws, such as a fridge compressor.
    dutyPct: doublePrecision("duty_pct").notNull().default(100),
    schedule: text("schedule").$type<LoadSchedule>().notNull(),
    // Used only by the schedule that needs it; the others store null.
    hoursPerDay: doublePrecision("hours_per_day"),
    windows: jsonb("windows").$type<{ fromHour: number; toHour: number }[]>(),
    // First and last day on site it runs; neither means every day.
    fromDay: integer("from_day"),
    toDay: integer("to_day"),
    volts: doublePrecision("volts").notNull().default(230),
    current: text("current").$type<CurrentKind>().notNull().default("ac"),
    owner: text("owner").$type<LoadOwner>().notNull(),
    // The neighbouring camp that shares the generator, for a neighbour's load.
    neighbourCamp: text("neighbour_camp"),
    inventoryItemId: uuid("inventory_item_id").references(
      () => inventoryItems.id,
      { onDelete: "set null" },
    ),
    circuit: text("circuit"),
    sort: integer("sort").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (l) => ({
    cycleIdx: index("power_loads_cycle_idx").on(l.cycle),
    categoryCheck: check(
      "power_loads_category_check",
      oneOf(l.category, LOAD_CATEGORIES),
    ),
    scheduleCheck: check(
      "power_loads_schedule_check",
      oneOf(l.schedule, LOAD_SCHEDULES),
    ),
    currentCheck: check(
      "power_loads_current_check",
      oneOf(l.current, CURRENT_KINDS),
    ),
    ownerCheck: check("power_loads_owner_check", oneOf(l.owner, LOAD_OWNERS)),
    drawCheck: check(
      "power_loads_draw_check",
      sql`${l.quantity} >= 1 and ${l.wattsEach} > 0 and ${l.dutyPct} between 1 and 100`,
    ),
    dayCheck: check(
      "power_loads_day_check",
      sql`${l.fromDay} >= 1 and ${l.toDay} >= ${l.fromDay}`,
    ),
  }),
);

// The year's plan: one row per year, the year its key. It holds both the
// load list's settings (power factor, days on site, the date of day 1) and
// the fuel settings, so both pages share one power factor and "copy last
// year" is one row. No row means the defaults (DEFAULT_POWER_PLAN); the first
// save inserts it.
export const powerPlans = pgTable(
  "power_plans",
  {
    cycle: integer("cycle").primaryKey(),
    generatorId: uuid("generator_id").references(() => generators.id, {
      onDelete: "set null",
    }),
    // A second generator is a note: the plan runs on one.
    secondGeneratorNote: text("second_generator_note"),
    powerFactor: doublePrecision("power_factor").notNull().default(0.8),
    // The camp is usually on site 11 days.
    daysOnSite: integer("days_on_site").notNull().default(11),
    // The date of day 1, only to label the day numbers.
    firstPoweredDay: date("first_powered_day", { mode: "string" }),
    // The generator's daily on-window, whole hours; both null is 24 hours,
    // which is how the camp runs it. There is no comparison schedule.
    runFromHour: integer("run_from_hour"),
    runToHour: integer("run_to_hour"),
    // Multiplies the litres of each running hour below half load.
    lowLoadFactor: doublePrecision("low_load_factor").notNull().default(1),
    safetyMarginPct: doublePrecision("safety_margin_pct").notNull().default(20),
    canLitres: doublePrecision("can_litres").notNull().default(20),
    cansOwned: integer("cans_owned").notNull().default(0),
    version: integer("version").notNull().default(1),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (p) => ({
    powerFactorCheck: check(
      "power_plans_power_factor_check",
      sql`${p.powerFactor} between 0.5 and 1`,
    ),
    daysCheck: check("power_plans_days_check", sql`${p.daysOnSite} >= 1`),
    hoursCheck: check(
      "power_plans_hours_check",
      sql`${p.runFromHour} between 0 and 23 and ${p.runToHour} between 0 and 23`,
    ),
    fuelCheck: check(
      "power_plans_fuel_check",
      sql`${p.lowLoadFactor} >= 1 and ${p.safetyMarginPct} between 0 and 100 and ${p.canLitres} > 0 and ${p.cansOwned} >= 0`,
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
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (a) => ({
    actorIdx: index("audit_log_actor_idx").on(a.actorId),
    actionIdx: index("audit_log_action_idx").on(a.action),
    // Wave 0 promised these "with the first writer", and writers now exist
    // (team assignment, the year rollover, year names). The two questions an
    // audit trail is asked: what happened to THIS member or year, and what
    // happened lately.
    targetIdx: index("audit_log_target_idx").on(a.target),
    createdAtIdx: index("audit_log_created_at_idx").on(a.createdAt.desc()),
  }),
);

// --- Rate limits -----------------------------------------------------------
// One counter per limiter key (`feedback:<user id>`, `voice-transcribe-ip:<ip>`),
// shared by every server instance. The old in-memory bucket reset on each cold
// start and counted per instance, so a limit of 3 was really 3 per instance.
// `window_start` is epoch milliseconds: with `mode: "number"` drizzle compares
// numbers, not strings. Rows are swept by the limiter itself (rate-limit.ts).
// A key can hold a user id or an IP address, so rows live at most a week.

export const actionRateLimit = pgTable(
  "action_rate_limit",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: bigint("window_start", { mode: "number" }).notNull(),
  },
  (r) => ({
    windowStartIdx: index("action_rate_limit_window_start_idx").on(
      r.windowStart,
    ),
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

// --- Camp settings (singleton) -------------------------------------------
// Exactly one row per camp. Holds the first-time-setup latch: `bootstrappedAt`
// is stamped when the /setup wizard elects the first captain, so the wizard
// runs once on a fresh system and never again. The PK is a boolean pinned to
// TRUE (+ a CHECK), so the table can physically hold at most one row.
// Future camp-wide config (e.g. the editable team list) will hang off this row.
export const campSettings = pgTable(
  "camp_settings",
  {
    id: boolean("id").primaryKey().default(true),
    bootstrappedAt: timestamp("bootstrapped_at", { mode: "date" }),
    bootstrappedByUserId: uuid("bootstrapped_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    // Editable camp config (Phase 1: the team list). Seeded with the 8 founding
    // teams, Finance, Transport and Logistics, Communications & HR, Mutant
    // Vehicle, Sound and Water; the seed mirrors DEFAULT_CAMP_CONFIG in camp-config.ts (a test
    // guards the two against drift). See camp-config.ts for the accessor.
    config: jsonb("config")
      .$type<CampConfig>()
      .notNull()
      .default(
        sql`'{"teams":[{"key":"kitchen","label":"Kitchen","order":0,"archived":false},{"key":"structures","label":"Structures","order":1,"archived":false},{"key":"power_and_lighting","label":"Power and Lighting","order":2,"archived":false},{"key":"sanitation_and_water","label":"Sanitation and MOOP","order":3,"archived":false},{"key":"health_and_safety","label":"Safety","order":4,"archived":false},{"key":"art_and_activities","label":"Art and Activities","order":5,"archived":false},{"key":"ministry_of_memes","label":"Ministry of Memes","order":6,"archived":false},{"key":"ministry_of_vibes","label":"Ministry of Vibes","order":7,"archived":false},{"key":"finance","label":"Finance","order":8,"archived":false},{"key":"transport_and_logistics","label":"Transport and Logistics","order":9,"archived":false},{"key":"communications_and_hr","label":"Communications & HR","order":10,"archived":false},{"key":"mutant_vehicle","label":"Mutant Vehicle","order":11,"archived":false},{"key":"sound","label":"Sound","order":12,"archived":false},{"key":"water","label":"Water","order":13,"archived":false}]}'::jsonb`,
      ),
  },
  (t) => ({
    singleton: check("camp_settings_singleton", sql`${t.id}`),
  }),
);

// --- join.camp-404.com ------------------------------------------------------
// The join site's words for one burn year, as a JoinSiteContent document
// (@camp404/types join-site.ts), each section checked by its schema on every
// write. A year with no row reads the latest earlier year, then the defaults
// (the copy approved in PR #283), so words carry forward until a captain
// changes them. Written only through @camp404/db/join-site, which writes the
// audit row in the same transaction.
export const joinSiteContent = pgTable("join_site_content", {
  cycle: integer("cycle").primaryKey(),
  content: jsonb("content").$type<Partial<JoinSiteContent>>().notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// --- Questionnaire definitions -------------------------------------------
// A questionnaire's STORED definition — the pages/questions catalogue as the
// @camp404/types `Questionnaire` JSON (version lives inside it). Keyed by the
// same stable questionnaire_key used by required_actions / questionnaire_
// activations. Today only `burner_profile`, served from a code template
// (BURNER_PROFILE_TEMPLATE) until a row is written; the in-app questionnaire
// builder (later phase) persists captain edits here. Team-bound questions are
// resolved against the live camp config at read time (resolveTeamBindings), so
// a relabel/archive flows in without rewriting the stored definition.
export const questionnaireDefinitions = pgTable("questionnaire_definitions", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  // The working/head definition — a legacy `Questionnaire` (code questionnaires)
  // or a `BuilderQuestionnaire` (in-app builder). The loader discriminates the
  // two shapes (isBuilderDefinition) before parsing.
  definition: jsonb("definition")
    .$type<Questionnaire | BuilderQuestionnaire>()
    .notNull(),
  // Builder lifecycle. `version` is null until the first publish, then the
  // latest published version (immutable snapshots live in questionnaire_versions).
  status: questionnaireStatusEnum("status").notNull().default("draft"),
  version: text("version"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),

  // Per-questionnaire rollover policy. TRUE (the default) = answers carry over
  // and the rollover leaves this questionnaire alone. FALSE = the rollover
  // closes the open send and opens a fresh one, so members answer again on a
  // blank form. A COLUMN, not a field inside `definition`: classifyChange reads
  // only the field map and the visibleIf map, so a toggle would classify as
  // `cosmetic` — and a cosmetic re-publish overwrites the immutable version
  // snapshot in place, letting a policy switch retroactively rewrite what a
  // past collection ran under. As a column it is also togglable with no
  // re-publish, and readable in one SELECT by the rollover planner.
  carryOver: boolean("carry_over").notNull().default(true),
});

// Immutable published snapshots. Publishing copies the definition head into a
// (key, version) row so historical responses render/validate against the
// version they were answered under. Cosmetic re-publishes overwrite the current
// version's snapshot in place; breaking ones mint a new version.
export const questionnaireVersions = pgTable(
  "questionnaire_versions",
  {
    definitionKey: text("definition_key")
      .notNull()
      .references(() => questionnaireDefinitions.key, { onDelete: "cascade" }),
    version: text("version").notNull(),
    definition: jsonb("definition")
      .$type<Questionnaire | BuilderQuestionnaire>()
      .notNull(),
    publishedAt: timestamp("published_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (v) => ({
    pk: primaryKey({ columns: [v.definitionKey, v.version] }),
  }),
);

// Generic response store for BUILDER questionnaires only (code questionnaires
// keep their bespoke domain tables). One latest-answer row per (user,
// definition); the per-field change history lives in questionnaire_edits.
// `definition_key` is plain text (NOT a FK) so responses survive a definition
// delete; `definition_version` records which version was answered.
export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    definitionKey: text("definition_key").notNull(),
    definitionVersion: text("definition_version").notNull(),
    responses: jsonb("responses")
      .$type<QuestionnaireResponses>()
      .notNull()
      .default({}),
    activationId: uuid("activation_id").references(
      () => questionnaireActivations.id,
      { onDelete: "set null" },
    ),
    completedAt: timestamp("completed_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),

    // Copied from questionnaire_activations.cycle at write time. Carry-over
    // keeps ONE row a member amends forever; `fresh` grows a NEW row each
    // cycle. "Fresh" means the member must answer again — never that the old
    // answer is destroyed.
    cycle: integer("cycle").notNull().default(1),
  },
  (r) => ({
    // Renamed rather than redefined so drizzle-kit emits a clean DROP INDEX +
    // CREATE UNIQUE INDEX. The three-column index is strictly WEAKER than the
    // two-column one it replaces, and the ADD COLUMN immediately before stamps
    // every existing row cycle = 1, so no duplicate can appear mid-swap.
    userDefCycleIdx: uniqueIndex(
      "questionnaire_responses_user_def_cycle_idx",
    ).on(r.userId, r.definitionKey, r.cycle),
    defIdx: index("questionnaire_responses_def_idx").on(r.definitionKey),
  }),
);
