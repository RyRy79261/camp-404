# 29 — Canonical data model & enums

**Files covered:**
- `packages/db/src/schema.ts` — THE canonical Drizzle/Postgres schema: every pgEnum, every pgTable, every column + default + index. Source of truth; migrations are generated from it.
- `packages/db/src/index.ts` — driver factories: `createHttpDb()` (HTTP, stateless, no transactions), `createPooledDb()` (WebSocket pool, transaction-capable), `BUILD_PLACEHOLDER_URL`, `Database` type.
- `packages/db/src/account.ts` — account erasure (POPIA/GDPR): `sanitisedUserPatch`, `sanitiseAccount`, `lostCatName`; the exact set of personal rows deleted vs. preserved.
- `packages/db/src/burner-profile.ts` — user-row + burner-profile read/writers: `findUserByAuthId`, `findUserById`, `createCampUser`, `setUserApprovalStatus`, `setUserApproval`, `setUserInviteCode`, `setUserRank`, `setUserProfileImage`, `setUserDisplayName`, `getBurnerProfileByUserId`, `upsertBurnerProfile`, `getIdDocumentColumns`, `setIdDocumentColumns`.
- `packages/db/src/roster.ts` — captain-only camp-management roster + member detail aggregates: `CampManagementMember`, `getCampManagementRoster`, `CampMemberDetail`, `getCampMemberDetail`, `isTeamLead` (derived team-lead check).
- `packages/db/src/activations.ts` — required-actions producer + satisfaction: `openActivation`, `ensureRequiredAction`, `satisfyRequiredAction`, `getPendingRequiredActions`, `PUSH_SCOPES`.
- `packages/db/src/broadcasts.ts` — announcement/notification data layer: drafts, publish, scheduled dispatch, inbox, acknowledgements, unread count.
- `packages/db/src/audience.ts` — PURE scope→recipient-id resolver `computeAudience`, `BroadcastScope` type, `AudienceData`.
- `packages/db/src/push.ts` — push-token upsert/delete + `drainQueuedPush` + pure `planPushDrain`.
- `packages/db/src/push-status.ts` — PURE push decision logic: `shouldPruneToken`, `deliveryPushStatus`, `chunk`, `mapSendResponses`, `PRUNE_CODES`, `PushSend`/`TokenSendResult` types.
- `packages/db/src/invite-codes.ts` — invite-code lifecycle: `findUsableInviteCode`, `consumeInviteCode`, `createInviteCode`, `findInviteCodeByCode`, `InviteCodeRow`, `AssignedRank`.
- `packages/db/src/id-documents.ts` — PURE ID-number split/merge: `ID_NUMBER_KEY`, `ID_TYPE_KEY`, `splitIdNumber`, `mergeIdNumber`, `idColumnsFor`.
- `packages/db/src/crypto.ts` — AES-256-GCM encrypt/decrypt for the `_encrypted` columns (NOT pgcrypto, despite column names): `encrypt`, `decrypt`, `decryptOrNull`.
- `packages/db/src/maintenance.ts` — `backfillIdEncryption` one-shot migration.
- `packages/db/src/questionnaire-edits.ts` — replay change-log writer/reader: `recordQuestionnaireEdit`, `listQuestionnaireEdits`, `QuestionnaireEditRow`.
- `packages/db/src/relations.ts` — referral-graph reads: `getReferralRoster`, `getInvitesIssuedBy`, `getRootCodes`, `ReferralUser`.
- `packages/db/src/versions.ts` — PURE version comparison `meetsRequiredVersion`, `VERSION_RE`.
- `packages/db/src/telegram.ts` — Telegram bot data layer (chats, invites, announcements queue) + types.
- `packages/db/src/mcp.ts` — MCP OAuth scope/audit reads: `getMcpScopeRows`, `appendMcpAuditLog`, `touchAccessToken`, `findActiveAccessToken`, `McpScopeRows`, `Team` type.
- `packages/types/src/roles.ts` — `Rank` (3-value UI ladder, NOT the DB rank enum), `Team` zod enum (mirrors DB).
- `packages/types/src/member.ts` — `DietaryTag`, `EmergencyContact`, `MembershipTier`, `SignupInput`, `MemberProfile`.
- `packages/types/src/questionnaire.ts` — the 10 question kinds, `QuestionnairePage`, `Questionnaire`, response value/validator, `QuestionnaireFieldChange`, `diffResponses`, `validateResponses`, `displayResponseValue`, `flattenQuestions`.
- `packages/types/src/announcement.ts` — `AnnouncementPresentation`, `ComposeAnnouncementInput`.
- `packages/types/src/recipe.ts` — `RecipeStatus`, `RecipeSource`, `RecipeSubmission`, `Ingredient`, `NormalisedRecipe`.
- `packages/types/src/reimbursement.ts` — `ReimbursementStatus`, `ReimbursementAccountType`, `SaAccountDetails`, `InternationalAccountDetails`, `ReimbursementAccount`, `ReimbursementInput`.
- `packages/types/src/voice-intent.ts` — `VoiceIntentName`, `VoiceIntent`.
- `packages/types/src/index.ts` — barrel re-export of all the above.

**Purpose:** This is THE canonical catalog of Camp 404's persisted data: every Postgres table, every column (name + SQL type + nullability + default), every pgEnum (with literal members in order), every index/unique constraint, and the zod mirror types that validate inputs and derive enums. It is server-only — Neon Postgres + Drizzle, with identity (email/password/OAuth/MFA/sessions) held externally in Neon Auth (Better Auth) and joined via `users.auth_user_id` (no auth tables live in this repo). It covers both screened domains (users, invites, burner/dietary/driver profiles, teams, questionnaire activations, required-actions, broadcasts/notifications/push) and screenless/future domains (recipes, documents, reimbursements, team budgets, tasks, adoptees, workshops, inventory + inventory-updates, audit log, telegram bot, MCP OAuth). Every other unit's "Data model touched" must agree with the names and enum members listed here.

## Features

### Enum catalog (schema.ts:25-211, 1223-1237)
26 `pgEnum`s (23 in the main schema + 3 in the MCP block). Listed with literal members in declaration order (verbatim):
- `rank` (schema.ts:31): `["captain", "member"]` — the ONLY two stored ranks. `team_lead` and `driver` are derived, never stored.
- `approval_status` (41): `["pending", "approved", "rejected"]` — membership vetting lifecycle; `rejected` is terminal.
- `team` (51): `["kitchen", "structures", "power_and_lighting", "sanitation_and_water", "health_and_safety", "art_and_activities", "ministry_of_memes", "ministry_of_vibes"]` — 8 working teams; stable identifiers, labels are code-side.
- `membership_tier` (62): `["full", "build_week_only"]`.
- `recipe_status` (67): `["pending", "analysing", "ready", "scheduled", "rejected"]`.
- `recipe_source` (75): `["url", "text", "voice"]`.
- `reimbursement_status` (81): `["submitted", "approved", "paid", "reconciled", "rejected"]`.
- `platform` (89): `["web", "ios", "android"]`.
- `reimbursement_account_type` (91): `["sa", "international"]`.
- `required_action_type` (99): `["questionnaire", "acknowledgement", "payment", "profile_update"]`.
- `required_action_status` (106): `["pending", "completed", "waived", "expired"]`.
- `questionnaire_scope` (114): `["everyone", "team", "team_leads", "individual", "opt_in"]`.
- `activation_status` (122): `["draft", "open", "closed"]`.
- `broadcast_kind` (128): `["announcement", "team_message", "lead_directive", "reminder", "system"]`.
- `broadcast_scope` (136): `["everyone", "team", "team_leads", "drivers", "individual"]`.
- `notification_channel` (144): `["push", "in_app", "both"]`.
- `push_delivery_status` (150): `["queued", "sent", "failed", "skipped"]`.
- `broadcast_presentation` (166): `["acknowledge", "popup", "feed"]`.
- `task_status` (172): `["open", "done", "cancelled"]`.
- `inventory_update_status` (182): `["pending", "approved", "rejected"]`.
- `telegram_chat_kind` (191): `["main_group", "announcement_channel"]`.
- `telegram_invite_status` (200): `["pending", "used", "expired", "revoked"]`.
- `telegram_announcement_status` (208): `["queued", "sent", "failed"]`.
- `mcp_client_auth_method` (1223): `["none", "client_secret_basic", "client_secret_post"]`.
- `mcp_code_challenge_method` (1229): `["S256", "plain"]`.
- `mcp_audit_outcome` (1234): `["success", "error"]`.

### Table catalog (33 tables)
Grouped by domain; full column lists in "Data model touched" below. Screened/active: `users`, `invite_codes`, `burner_profiles`, `dietary_requirements`, `driver_profiles`, `car_members`, `team_memberships`, `questionnaire_activations`, `questionnaire_activation_targets`, `questionnaire_edits`, `required_actions`, `broadcasts`, `broadcast_targets`, `notification_deliveries`, `push_tokens`. Screenless/future: `recipes`, `documents`, `reimbursements`, `team_budgets`, `tasks`, `adoptees`, `workshops`, `workshop_rsvps`, `inventory_items`, `inventory_updates`, `audit_log`, `telegram_chats`, `telegram_invites`, `telegram_announcements`, `mcp_oauth_clients`, `mcp_auth_codes`, `mcp_access_tokens`, `mcp_audit_log`.

### Derived (never-stored) facets
- **team-lead** — derived from `team_memberships.is_lead = true` on ANY team (`isTeamLead`, roster.ts:204; `getCampManagementRoster` `isLead` subquery roster.ts:66). A team-lead user "should also carry `users.rank = 'team_lead'`" per the schema comment (schema.ts:454) BUT `team_lead` is NOT a member of the `rank` pgEnum — this is a stale/aspirational comment; the stored rank can only be `captain` or `member`. The 3-value `Rank` ladder lives only in zod (`roles.ts:5`) for UI use.
- **driver** — derived from `driver_profiles.intends_to_drive = true` (audience.ts:18; broadcasts.ts:73-75; mcp.ts:55-60).
- **car group** — `car_members` rows under a driver.

### Account erasure / "Lost Cat" (account.ts)
`sanitiseAccount(userId)` runs in one pooled transaction: computes the next `lostCatNumber` = `max(users.lost_cat_number) + 1` (account.ts:64), patches the `users` row via `sanitisedUserPatch` (sets `displayName = "Lost Cat #N"`, `authUserId = "deleted:<id>"`, nulls profile image / passport / SA-ID / EFT / emergency contacts / telegram handle+userId / terms fields, `sanitised = true`, `sanitisedAt = now`, `lostCatNumber = N`), then DELETEs the owned personal rows (because the kept `users` row means CASCADE never fires): `burner_profiles`, `dietary_requirements`, `driver_profiles`, `push_tokens`, `notification_deliveries`, `questionnaire_edits`, `required_actions`, `team_memberships`, `car_members` (driver OR passenger), `workshop_rsvps`, `broadcast_targets`, `questionnaire_activation_targets`. Scrubs `reimbursements.account_details_encrypted` to `""` (NOT NULL, so empty string not null) while keeping the row for accounting. Preserves `id`, `inviteCode` (lineage), and all audit/authorship FKs (which now resolve to "Lost Cat #N").

### Required-actions gating engine (activations.ts)
`openActivation(activationId)` flips an activation to `open`, computes recipients via `computeAudience`, and upserts one `required_actions` row per recipient (`onConflictDoUpdate` on `(user_id, action_key)` — re-open re-points version/activation and resets to `pending`, clears `completedAt`). `PUSH_SCOPES = new Set(["everyone", "team", "team_leads", "individual"])` (activations.ts:14). `opt_in` returns `{ ok:false, error:"opt_in activations are not yet supported." }` (DEAD/deferred pull-model path). `satisfyRequiredAction` flips a pending row to `completed` when the completed version `meetsRequiredVersion` the required version; a versionless gate or completion satisfies unconditionally (only a completion recorded against an older `-vN` than the required one leaves the gate open). `getPendingRequiredActions` returns pending + blocking rows oldest-first (the gate order).

### Versioning (versions.ts)
`meetsRequiredVersion(required, completed)` parses `"<base>-v<N>"` via `VERSION_RE = /^(.*)-v(\d+)$/`; when bases match, compares the `-vN` suffix as an integer (so `-v10 > -v9`); otherwise lexicographic fallback (safe for date-prefixed bases like `"2026.05.29-v8"`).

## User actions & interactions
This is a data/server unit — no UI. The user-facing actions that mutate this model (each owned by another unit) are:
- Sign up via invite code → `createCampUser` (rank/approvalStatus optional), `consumeInviteCode` (atomic `use_count++` guarded by revoked/expired/maxUses), `setUserInviteCode`.
- Complete burner profile → `upsertBurnerProfile` (sets/keeps `completedAt`), `satisfyRequiredAction("burner_profile")`.
- Replay/edit a questionnaire → `recordQuestionnaireEdit` (skipped when `changes` empty), diffed via `diffResponses`.
- Edit display name / profile photo → `setUserDisplayName`, `setUserProfileImage`.
- Save government ID → `setIdDocumentColumns` (writes `passport_encrypted`/`sa_id_encrypted` ciphertext via crypto.ts; `idColumnsFor` moves value between columns when type changes, nulling the other).
- Register driver intent / driver questionnaire → writes `driver_profiles` (`intends_to_drive`, vehicle, proficiency).
- Captain mints invite → `createInviteCode` (lowercases `invited_email`).
- Captain vets a member → `setUserApproval({status, decidedByUserId})` (stamps `approval_decided_by_user_id` + `approval_decided_at`); `setUserApprovalStatus` sets status with NO decider (signup queue drop).
- Captain promotes/demotes → `setUserRank`.
- Captain composes/edits/deletes/publishes announcement → `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement` (fans out deliveries to everyone except author).
- Recipient reads/acknowledges notifications → `markRead(ids)`, `acknowledgeDelivery` (only `presentation='acknowledge'`, owner-scoped), `getPendingAcknowledgements`, `listInbox`, `countUnread`.
- Device registers for push → `upsertPushToken`; sign-out → `deletePushTokenForUser`.
- Account self-erasure → `sanitiseAccount`.
- MCP/Telegram flows → see those domains below.

## States & presentations
This unit defines the data substrate for every global-states row; the load-bearing state-carrying columns:
- **Empty / Populated** — generic; nullable columns + `default([])`/`default({})` JSONB represent emptiness (`users.skills`, `burner_profiles.responses`, `dietary_requirements.tags`, `push_tokens.topics`, `recipes.dietary_tags`).
- **Loading** — N/A at data layer (driver round-trips).
- **Validation-error** — `validateResponses` returns `{ ok:false, errors:Record<string,string> }`; `_root: "Malformed response payload"` for a bad payload shape; per-question keys otherwise. `ReimbursementInput`/`SignupInput`/`ComposeAnnouncementInput` zod refinements produce field errors.
- **Submitting/pending** — `recipe_status='pending'|'analysing'`, `reimbursement_status='submitted'`, `inventory_update_status='pending'`, `required_action_status='pending'`, `push_delivery_status='queued'`, `telegram_*_status='pending'|'queued'`, `broadcasts.publishedAt IS NULL` (draft), `dispatchedAt IS NULL` (not yet fanned out).
- **Success/completed** — `*.completedAt` set (burner/dietary/driver), `required_action_status='completed'`, `recipe_status='ready'|'scheduled'`, `reimbursement_status='approved'|'paid'|'reconciled'`, `push_delivery_status='sent'`, `notification_deliveries.acknowledgedAt`/`readAt` set.
- **Disabled / Captain-only-locked** — enforced in app/query layer (roster.ts notes "callers MUST gate this behind a captain rank check"); the data layer trusts the caller. `users.rank` and derived `isLead` drive lock state.
- **Invite-gated** — `users.invite_code` (NULL = god account) + `invite_codes` row state (`findUsableInviteCode` returns null when revoked/expired/exhausted).
- **Onboarding-incomplete** — `required_actions (status='pending', blocking=true)` rows; `getPendingRequiredActions`.
- **Pending-approval** — `users.approval_status='pending'`.
- **Rejected** — `users.approval_status='rejected'` (terminal).
- No offline/sync columns and no budget/over-target columns exist at the data layer (team_budgets exists but carries no over-target/goal state — just assigned vs perceived amounts).

## Enums, options & configurable values
**Stored DB enums:** the 26 `pgEnum`s above (verbatim members).

**Zod enums / mirror types (packages/types):**
- `Rank` (roles.ts:5): `["captain", "team_lead", "member"]` — 3-value UI ladder; INCLUDES `team_lead`, which the DB `rank` enum does NOT. Disagreement is intentional (derived rank for UI).
- `Team` (roles.ts:10): mirrors the 8-value DB `team` enum exactly; comment: "the database is the source of truth."
- `DietaryTag` (member.ts:6): `["vegan", "vegetarian", "gluten_free", "nut_free", "soy_free", "dairy_free", "halal", "kosher", "low_fodmap", "allergy_other"]`.
- `MembershipTier` (member.ts:26): `["full", "build_week_only"]`.
- `AnnouncementPresentation` (announcement.ts:8): `["acknowledge", "popup", "feed"]` (mirrors `broadcast_presentation`).
- `RecipeStatus` / `RecipeSource` (recipe.ts:4,13): mirror DB.
- `ReimbursementStatus` / `ReimbursementAccountType` (reimbursement.ts:4,13): mirror DB.
- `VoiceIntentName` (voice-intent.ts:3): `["add_recipe", "mark_shift_done", "log_expense", "note_to_team", "unknown"]`.
- Question kinds (questionnaire.ts) — 10: `slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image`. Page kinds: `questions`, `intro`.

**Defaults & ranges (verbatim):**
- `users`: `rank` default `member`; `is_system` false; `dues_paid` false; `skills` `[]`; `previous_afrikaburns` 0; `previous_burning_mans` 0; `first_time` false; `approval_status` default `approved`; `sanitised` false; `ai_data_consent` false; `created_at`/`updated_at` defaultNow.
- `invite_codes`: `use_count` 0; `requires_approval` false (but app rule: non-captain codes ALWAYS true); `created_at` now.
- `burner_profiles`: `responses` `{}`; `started_at` now.
- `dietary_requirements`: `tags` `[]`; `is_anaphylactic` false.
- `driver_profiles`: `intends_to_drive` false; `can_offer_lifts` false; `offroad_experienced` false; `can_tow` false.
- `team_memberships`: `is_lead` false.
- `questionnaire_activations`: `blocking` true; `status` `draft`.
- `required_actions`: `blocking` true; `status` `pending`.
- `recipes`: `status` `pending`; `dietary_tags` `[]`.
- `documents`: `markdown` `""`; `version` 1; `published` false.
- `reimbursements`: `status` `submitted`; `amount` `numeric(12,2)`; `currency` text (ISO 4217).
- `team_budgets`: `currency` default `"ZAR"`; amounts `numeric(12,2)` nullable.
- `push_tokens`: `topics` `[]`; `last_seen_at` now.
- `broadcasts`: `channel` `both`; `presentation` `feed`.
- `notification_deliveries`: `presentation` `feed`; `push_status` `queued`.
- `tasks`: `status` `open`.
- `inventory_items`: `quantity` 0; `requires_maintenance` false; `weight_kg`/`amount` `numeric(10,2)`.
- `inventory_updates`: `status` `pending`; `requires_maintenance` false.
- `workshops`: `capacity` default 20.
- `telegram_invites`: `status` `pending`. `telegram_announcements`: `status` `queued`; `send_after` defaultNow.
- Question defaults (questionnaire.ts): `slider.step` 1; `short_text.maxLength` 120; `long_text.maxLength` 1000; `required` defaults — `true` for slider/single_select/short_text/date/scale/toggle/combobox, `false` for multi_select/long_text/image.
- `ComposeAnnouncementInput`: `title` 1–120 chars; `body` 1–5000 chars; `presentation` default `acknowledge`.
- `ReimbursementInput`: `amount > 0`; `currency` `/^[A-Z]{3}$/`; `description` 1–500; `team` default null; SWIFT/BIC 8–11 chars; SA `accountNumber.min(4)`, `branchCode.min(3)`; at least one of receipt/item photo required.
- `SignupInput`: `saIdNumber` `/^\d{13}$/`; `emergencyContacts` 1–2 items; each contact `name.min(1)`, `phone.min(3)`, `relationship.min(1)`.
- crypto.ts: `ALGO="aes-256-gcm"`, `IV_LEN=12`, `TAG_LEN=16`, `KEY_SALT="camp404-pgcrypto-v1"`, key from `PGCRYPTO_KEY` (≥16 chars), stored as `base64(iv‖tag‖ciphertext)`.
- push-status.ts: FCM batch cap 500 (`chunk(tokens, 500)` in push.ts:102); `PRUNE_CODES = {"messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"}`.
- id-documents.ts: `ID_NUMBER_KEY="id.number"`, `ID_TYPE_KEY="id.type"`; `idColumnsFor` routes `sa_id` → `sa_id_encrypted`, everything else (default/passport) → `passport_encrypted`.
- index.ts: `BUILD_PLACEHOLDER_URL="postgres://build:build@localhost:5432/build?sslmode=disable"`; `NEON_LOCAL_PROXY=1` → insecure ws on port 5433.
- telegram.ts: `listDueAnnouncements` default limit 25; `listPendingInvitesForUser` filters status=pending + (no expiry OR expiry ≥ now).
- questionnaire-edits.ts: `listQuestionnaireEdits` default limit 20.

## Data model touched
Full column lists (column name + SQL type, with key flags). All timestamps are `timestamp(mode:"date")`; PK = primary key; FK references shown with on-delete.

**users** (schema.ts:220): `id` uuid PK defaultRandom; `auth_user_id` text NOT NULL UNIQUE; `display_name` text; `profile_image_url` text; `rank` rank NOT NULL default member; `is_system` bool NOT NULL default false; `membership_tier` membership_tier; `dues_paid` bool NOT NULL default false; `dues_paid_at` ts; `passport_encrypted` text; `sa_id_encrypted` text; `eft_details_encrypted` text; `skills` jsonb<string[]> default []; `previous_afrikaburns` int default 0; `previous_burning_mans` int default 0; `first_time` bool default false; `emergency_contacts` jsonb<Array<{name,phone,relationship}>>; `invite_code` text (NULL=god); `approval_status` approval_status NOT NULL default approved; `approval_decided_by_user_id` uuid→users.id (set null); `approval_decided_at` ts; `terms_version` text; `terms_consented_at` ts; `sanitised` bool NOT NULL default false; `sanitised_at` ts; `lost_cat_number` int; `telegram_handle` text; `telegram_user_id` text UNIQUE; `ai_data_consent` bool NOT NULL default false; `ai_data_consent_at` ts; `created_at`/`updated_at` NOT NULL defaultNow.

**invite_codes** (312): `code` text PK; `created_by_user_id` uuid→users.id (set null); `note` text; `max_uses` int; `use_count` int NOT NULL default 0; `expires_at` ts; `revoked_at` ts; `assigned_rank` rank (NULL=member); `invited_email` text (lowercased); `requires_approval` bool NOT NULL default false; `created_at` NOT NULL defaultNow. Index: `invite_codes_created_by_idx`.

**burner_profiles** (352): `user_id` uuid PK →users.id (cascade); `version` text NOT NULL; `responses` jsonb<Record<string,unknown>> NOT NULL default {}; `started_at` NOT NULL defaultNow; `completed_at` ts; `updated_at` NOT NULL defaultNow.

**dietary_requirements** (372): `user_id` uuid PK →users.id (cascade); `tags` jsonb<string[]> NOT NULL default []; `allergies` text; `intolerances` text; `is_anaphylactic` bool NOT NULL default false; `notes` text; `version` text NOT NULL; `completed_at` ts; `created_at`/`updated_at` NOT NULL defaultNow. (Single source of dietary data — NO dietary columns on users.)

**driver_profiles** (393): `user_id` uuid PK →users.id (cascade); `intends_to_drive` bool NOT NULL default false; `intent_registered_at` ts; `vehicle_make`/`vehicle_model`/`vehicle_registration` text; `seats_total`/`seats_offered` int; `can_offer_lifts` bool NOT NULL default false; `offroad_experienced` bool NOT NULL default false; `can_tow` bool NOT NULL default false; `proficiency_notes` text; `departure_city` text; `arrival_at`/`departure_at` ts; `notes` text; `version` text NOT NULL; `completed_at` ts; `created_at`/`updated_at` NOT NULL defaultNow.

**car_members** (427): `driver_user_id` uuid NOT NULL →driver_profiles.userId (cascade); `member_user_id` uuid NOT NULL →users.id (cascade); `created_at` NOT NULL defaultNow. PK (driver_user_id, member_user_id). Index `car_members_member_idx`.

**team_memberships** (446): `user_id` uuid NOT NULL →users.id (cascade); `team` team NOT NULL; `is_lead` bool NOT NULL default false; `created_at` NOT NULL defaultNow. PK (user_id, team). Index `team_memberships_team_idx`.

**questionnaire_activations** (472): `id` uuid PK defaultRandom; `questionnaire_key` text NOT NULL; `version` text NOT NULL; `title` text NOT NULL; `description` text; `scope` questionnaire_scope NOT NULL; `team` team (set when scope='team'); `blocking` bool NOT NULL default true; `status` activation_status NOT NULL default draft; `due_at` ts; `activated_by_user_id` uuid→users.id (set null); `opened_at`/`closed_at` ts; `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_key_idx`, `_status_idx`.

**questionnaire_activation_targets** (505): `activation_id` uuid NOT NULL →questionnaire_activations.id (cascade); `user_id` uuid NOT NULL →users.id (cascade). PK (activation_id, user_id).

**questionnaire_edits** (530): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `questionnaire_key` text NOT NULL; `version` text NOT NULL; `edited_by_user_id` uuid→users.id (set null); `changes` jsonb<QuestionnaireFieldChange[]> NOT NULL default []; `created_at` NOT NULL defaultNow. Index `_user_key_created_idx` (user_id, questionnaire_key, created_at). No full version history kept — domain table holds latest answers.

**required_actions** (570): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `type` required_action_type NOT NULL; `action_key` text NOT NULL; `version` text; `activation_id` uuid→questionnaire_activations.id (set null); `title` text NOT NULL; `blocking` bool NOT NULL default true; `status` required_action_status NOT NULL default pending; `due_at` ts; `created_at` NOT NULL defaultNow; `completed_at` ts. UNIQUE index `_user_action_idx` (user_id, action_key); index `_user_status_idx`.

**recipes** (613): `id` uuid PK defaultRandom; `submitter_id` uuid NOT NULL →users.id (set null); `source` recipe_source NOT NULL; `status` recipe_status NOT NULL default pending; `source_url` text; `raw_text` text; `audio_blob_url` text; `transcript` text; `normalised` jsonb; `dietary_tags` jsonb<string[]> default []; `analysed_at`/`scheduled_for` ts; `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_status_idx`, `_submitter_idx`.

**documents** (646): `id` uuid PK defaultRandom; `title` text NOT NULL; `slug` text NOT NULL; `category` text NOT NULL; `team` team; `markdown` text NOT NULL default ""; `version` int NOT NULL default 1; `author_id` uuid→users.id (set null); `published` bool NOT NULL default false; `created_at`/`updated_at` NOT NULL defaultNow. UNIQUE `documents_slug_idx`; index `documents_category_idx`.

**reimbursements** (676): `id` uuid PK defaultRandom; `submitter_id` uuid NOT NULL →users.id (set null); `team` team (NULL=general); `amount` numeric(12,2) NOT NULL; `currency` text NOT NULL (ISO 4217); `account_type` reimbursement_account_type NOT NULL; `account_details_encrypted` text NOT NULL; `description` text NOT NULL; `receipt_blob_url`/`item_photo_blob_url`/`voice_memo_blob_url` text; `status` reimbursement_status NOT NULL default submitted; `approver_id` uuid→users.id (set null); `approved_at`/`paid_at`/`reconciled_at` ts; `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_status_idx`, `_submitter_idx`, `_team_idx`. (Log, not a finance system; payments actioned offline.)

**team_budgets** (723): `team` team PK; `currency` text NOT NULL default "ZAR"; `assigned_amount` numeric(12,2); `perceived_amount` numeric(12,2); `notes` text; `updated_at` NOT NULL defaultNow. (Screenless future domain — assigned vs perceived spend; NO over-target/goal state.)

**push_tokens** (734): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `platform` platform NOT NULL; `token` text NOT NULL; `topics` jsonb<string[]> default []; `last_seen_at` NOT NULL defaultNow; `created_at` NOT NULL defaultNow. UNIQUE `push_tokens_token_idx`; index `push_tokens_user_idx`.

**broadcasts** (763): `id` uuid PK defaultRandom; `sender_id` uuid→users.id (set null); `kind` broadcast_kind NOT NULL; `scope` broadcast_scope NOT NULL; `team` team (when scope='team'); `title` text NOT NULL; `body` text NOT NULL; `channel` notification_channel NOT NULL default both; `presentation` broadcast_presentation NOT NULL default feed; `ref_type` text; `ref_id` uuid; `published_at` ts (NULL=draft); `dispatched_at` ts (NULL=not fanned out); `send_at` ts (NULL/≤now=immediate); `created_at` NOT NULL defaultNow. Indexes `_sender_idx`, `_created_at_idx`.

**broadcast_targets** (810): `broadcast_id` uuid NOT NULL →broadcasts.id (cascade); `user_id` uuid NOT NULL →users.id (cascade). PK (broadcast_id, user_id).

**notification_deliveries** (830): `id` uuid PK defaultRandom; `broadcast_id` uuid→broadcasts.id (cascade, NULL for system rows); `user_id` uuid NOT NULL →users.id (cascade); `title` text NOT NULL; `body` text NOT NULL; `channel` notification_channel NOT NULL; `presentation` broadcast_presentation NOT NULL default feed; `push_status` push_delivery_status NOT NULL default queued; `ref_type` text; `ref_id` uuid; `read_at` ts; `acknowledged_at` ts; `delivered_at` ts; `created_at` NOT NULL defaultNow. Indexes `_user_read_idx`, `_user_ack_idx`, `_broadcast_idx`; partial UNIQUE `_broadcast_user_uniq` (broadcast_id, user_id) WHERE broadcast_id IS NOT NULL.

**tasks** (893): `id` uuid PK defaultRandom; `title` text NOT NULL; `description` text; `assignee_id` uuid→users.id (set null); `team` team; `created_by_user_id` uuid→users.id (set null); `due_at` ts; `status` task_status NOT NULL default open; `created_at` NOT NULL defaultNow; `completed_at` ts. Indexes `_assignee_idx`, `_team_idx`, `_status_idx`.

**adoptees** (920): `id` uuid PK defaultRandom; `slot_number` int NOT NULL; `name` text NOT NULL; `contact` text; `dietary_notes` text; `arrival`/`departure` ts; `tent_assigned`/`bedding_assigned`/`fridge_shelf_assigned` text; `sponsor_id` uuid→users.id (set null); `approved_by_id` uuid→users.id (set null); `created_at` NOT NULL defaultNow.

**workshops** (942): `id` uuid PK defaultRandom; `title` text NOT NULL; `description` text; `starts_at`/`ends_at` ts NOT NULL; `capacity` int NOT NULL default 20; `host_id` uuid→users.id (set null); `created_at` NOT NULL defaultNow.

**workshop_rsvps** (953): `workshop_id` uuid NOT NULL →workshops.id (cascade); `user_id` uuid NOT NULL →users.id (cascade); `created_at` NOT NULL defaultNow. PK (workshop_id, user_id).

**inventory_items** (976): `id` uuid PK defaultRandom; `name` text NOT NULL; `details` text; `team` team NOT NULL; `quantity` int NOT NULL default 0; `unit` text; `weight_kg` numeric(10,2); `requires_maintenance` bool NOT NULL default false; `maintenance_interval_days` int; `last_maintained_at` ts; `next_maintenance_due_at` ts; `maintenance_notes` text; `custodian_user_id` uuid→users.id (set null, NULL=camp storage); `storage_location` text; `last_checked_at` ts; `last_checked_by_user_id` uuid→users.id (set null); `created_by_user_id` uuid→users.id (set null); `archived_at` ts (soft-removal); `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_team_idx`, `_custodian_idx`, `_maintenance_due_idx`.

**inventory_updates** (1049): `id` uuid PK defaultRandom; `item_id` uuid→inventory_items.id (cascade, NULL=create-new proposal); `proposed_by_user_id` uuid NOT NULL →users.id (set null); `status` inventory_update_status NOT NULL default pending; `name` text NOT NULL; `details` text; `team` team NOT NULL; `quantity` int NOT NULL; `unit` text; `weight_kg` numeric(10,2); `requires_maintenance` bool NOT NULL default false; `maintenance_interval_days` int; `custodian_user_id` uuid→users.id (set null); `storage_location` text; `maintenance_performed_at` ts; `note` text; `reviewed_by_user_id` uuid→users.id (set null); `reviewed_at` ts; `review_note` text; `created_at` NOT NULL defaultNow. Indexes `_item_idx`, `_status_idx`, `_proposed_by_idx`. (Full snapshot per row — approving = straight copy onto item; approval NOT team-scoped.)

**audit_log** (1107): `id` uuid PK defaultRandom; `actor_id` uuid→users.id (set null); `action` text NOT NULL; `target` text; `metadata` jsonb; `created_at` NOT NULL defaultNow. Indexes `_actor_idx`, `_action_idx`.

**telegram_chats** (1137): `id` uuid PK defaultRandom; `kind` telegram_chat_kind NOT NULL; `chat_id` text NOT NULL UNIQUE; `title` text NOT NULL; `username` text; `added_by_user_id` uuid→users.id (set null); `added_at` NOT NULL defaultNow; `archived_at` ts.

**telegram_invites** (1156): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `chat_id` text NOT NULL (NOT an FK); `invite_link` text NOT NULL UNIQUE; `status` telegram_invite_status NOT NULL default pending; `expires_at` ts; `joined_at` ts; `created_at` NOT NULL defaultNow. Indexes `_user_idx`, `_status_idx`.

**telegram_announcements** (1185): `id` uuid PK defaultRandom; `broadcast_id` uuid→broadcasts.id (set null); `chat_id` text NOT NULL; `body` text NOT NULL; `status` telegram_announcement_status NOT NULL default queued; `message_id` text; `error_message` text; `send_after` ts NOT NULL defaultNow; `sent_at` ts; `created_at` NOT NULL defaultNow. Indexes `_status_send_after_idx`, `_broadcast_idx`.

**mcp_oauth_clients** (1242): `client_id` text PK; `client_secret_hash` text (NULL for public clients); `client_name` text NOT NULL; `redirect_uris` text[] NOT NULL; `token_endpoint_auth_method` mcp_client_auth_method NOT NULL; `scope` text; `created_at` NOT NULL defaultNow; `last_used_at` ts.

**mcp_auth_codes** (1260): `code` text PK; `client_id` text NOT NULL →mcp_oauth_clients.clientId (cascade); `user_id` uuid NOT NULL →users.id (cascade); `redirect_uri` text NOT NULL; `code_challenge` text NOT NULL; `code_challenge_method` mcp_code_challenge_method NOT NULL; `scope` text NOT NULL; `expires_at` ts NOT NULL; `consumed_at` ts; `created_at` NOT NULL defaultNow. Indexes `_client_idx`, `_expires_idx`. (PKCE-required, ~5min, plaintext single-use.)

**mcp_access_tokens** (1289): `token_hash` text PK (SHA-256); `refresh_token_hash` text UNIQUE; `client_id` text NOT NULL →mcp_oauth_clients.clientId (cascade); `user_id` uuid NOT NULL →users.id (cascade); `scope` text NOT NULL; `expires_at` ts NOT NULL; `refresh_expires_at` ts; `revoked_at` ts; `created_at` NOT NULL defaultNow; `last_used_at` ts. Indexes `_user_idx`, `_expires_idx`.

**mcp_audit_log** (1316): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `client_id` text NOT NULL (NOT an FK — survives client deletion); `tool` text NOT NULL; `args_json` jsonb (redacted); `outcome` mcp_audit_outcome NOT NULL; `error_message` text; `duration_ms` int; `created_at` NOT NULL defaultNow. Index `_user_created_idx`.

**Identity tables (external, NOT in repo):** email/password/OAuth/MFA/sessions live in Neon Auth (Better Auth). Joined via `users.auth_user_id` mirroring upstream `user.id` (schema.ts:19-23, 220-222). No `account`/`session`/`verification` Drizzle tables exist in this package.

**Non-table interfaces (read DTOs):** `ReferralUser` (relations.ts), `CampManagementMember` / `CampMemberDetail` (roster.ts), `PendingRequiredAction` (activations.ts), `AnnouncementSummary` / `DraftInput` / `PendingAcknowledgement` / `InboxItem` (broadcasts.ts), `InviteCodeRow` (invite-codes.ts), `McpScopeRows` (mcp.ts), `Telegram*Row` (telegram.ts), `QueuedPushDelivery` / `PushDrainResult` (push.ts), `QuestionnaireEditRow` (questionnaire-edits.ts), `SplitId` (id-documents.ts).

## Validation, edge cases & business rules
- **Two stored ranks only.** `rank ∈ {captain, member}`. `team_lead`/`driver` are derived at read time; the 3-value `Rank` zod ladder is UI-only. The schema.ts:454 comment that a lead "should also carry `users.rank = 'team_lead'`" is STALE — that value is not in the enum and cannot be stored.
- **Approval gating.** `approval_status` defaults `approved` so god accounts and pre-gate accounts retain access. A redeemer of a `requires_approval=true` code is created `pending`. Non-captain-minted codes are ALWAYS `requires_approval=true` (app rule, schema.ts:332-336); only a captain can pre-approve (`requires_approval=false`). `rejected` is terminal. Captain decisions stamp `approval_decided_by_user_id` + `approval_decided_at`; signup-queue drops do not (two distinct writers: `setUserApproval` vs `setUserApprovalStatus`).
- **Invite redemption races.** `findUsableInviteCode` and `consumeInviteCode` both guard on `revoked_at IS NULL` AND (no expiry OR `expires_at > now`) AND (no cap OR `max_uses > use_count`). `consumeInviteCode` does the increment in the same guarded UPDATE → returns null if it became unusable mid-race. `findInviteCodeByCode` ignores state (availability hint only — codes are PK-unique forever).
- **Version-aware gate satisfaction.** A completion recorded against a version older than the required one leaves the gate `pending` (`satisfyRequiredAction` → `meetsRequiredVersion`). `-vN` suffix compared as integer; otherwise lexicographic.
- **Questionnaire validation** (`validateResponses`): unknown response keys are DROPPED (question removed in later version); missing required → per-question error "This question is required"; malformed payload → `{_root}` error. Per-kind rules: slider must be number in `[min,max]`; single_select/toggle/combobox must match an option value; multi_select filters to allowed values, required → ≥1; short/long text ≤ `maxLength`; date strict `/^\d{4}-\d{2}-\d{2}$/` and `Date.parse` valid; scale must match a step value; image any string. `diffResponses` treats multi-selects as sets (reorder ≠ change) and empty/absent as equal. A no-op replay records NO `questionnaire_edits` row.
- **ID document handling.** `id.number` is sensitive → split out of `burner_profiles.responses` and stored encrypted in `users.passport_encrypted`/`sa_id_encrypted` (`idColumnsFor`: `sa_id`→sa_id col, else passport col, nulling the other so switching type moves rather than orphans). `id.type` is NOT sensitive and stays in responses. SA ID validated `/^\d{13}$/` (member.ts).
- **Encryption reality.** Columns named `*_encrypted` and comments say "pgcrypto" but actual impl is Node AES-256-GCM (crypto.ts) — stale comments. Key from `PGCRYPTO_KEY` (≥16 chars or throws). `decryptOrNull` swallows errors → null. `sanitiseAccount` scrubs `reimbursements.account_details_encrypted` to `""` (NOT NULL → empty string, never null).
- **Audience resolution** (`computeAudience`, PURE): always excludes system actors (`is_system`), sanitised accounts, and the sender; de-duplicates. `team` scope with no team set → nobody. `drivers` scope = users with `intends_to_drive`. `everyone` = all real members.
- **Activation fan-out** supports only `PUSH_SCOPES` (everyone/team/team_leads/individual); `opt_in` is unsupported (returns error — DEAD branch), `drivers` is broadcast-only. Upsert on `(user_id, action_key)` makes re-activation idempotent.
- **Announcement drafts are author-private.** All draft writers gate on `kind='announcement' AND scope='everyone' AND publishedAt IS NULL AND senderId=author` (`isOwnedAnnouncementDraft`) — can't mutate another kind/scope sharing an id, can't edit/delete after publish. `publishAnnouncement` is idempotent on draft→published (claims the row in the UPDATE), and `ON CONFLICT DO NOTHING` on the partial unique `(broadcast_id, user_id)` prevents double fan-out. Author never receives their own announcement.
- **Notification read/ack.** `acknowledgeDelivery` only stamps `presentation='acknowledge'` deliveries that are owner-scoped and not yet acknowledged (never marks a feed/popup). `markRead(ids)` only marks the exact snapshotted ids that are still unread (avoids marking a row that arrived after snapshot). `countUnread` = deliveries with `read_at IS NULL`.
- **Push drain.** Reads `push_status='queued' AND channel IN ('push','both')` (NEVER `in_app` — those stay queued forever by design). Per-delivery status: `skipped` if recipient has no tokens, `sent` if ≥1 token succeeds, else `failed`. Dead tokens (3 FCM error codes) pruned. Status write conditional on row still `queued` (overlapping-run safe). FCM multicast capped at 500 tokens/batch.
- **Dispatch worker** (`dispatchDueBroadcasts`) drains broadcasts that are `publishedAt NOT NULL AND dispatchedAt IS NULL AND (send_at NULL OR ≤ now)`; claims each by atomically flipping `dispatched_at` (overlapping-cron safe). Immediate camp-wide announcements still fan out inline in `publishAnnouncement`; this drains the deferred tail.
- **Telegram.** Bots can't add by @handle — every join via a single-use invite link. `telegram_invites.chat_id` is deliberately NOT an FK (chat can be archived without losing historical link). `telegram_user_id` captured from `chat_member` webhook. `listPendingInvitesForUser` returns pending + unexpired only.
- **MCP.** `getMcpScopeRows` is a single read of user row + memberships + driver intent (scope derivation lives in app `lib/mcp/scope.ts`, NOT here). `appendMcpAuditLog` and `touchAccessToken` are best-effort (swallow errors — auditing must never break a tool call). `findActiveAccessToken` requires `revoked_at IS NULL AND expires_at > now`. `args_json` must be redacted at the boundary. `mcp_audit_log.client_id` is NOT an FK (survives client deletion).
- **Driver/HTTP vs pooled.** Transactions require `createPooledDb` (WebSocket); HTTP driver has none. `BUILD_PLACEHOLDER_URL` lets `next build` page-data collection run without secrets — any real query fails loudly.
- **AI data consent.** `ai_data_consent` gates surfacing *only* ID documents / others' bank details to OTHER users' MCP sessions; everything else is freely visible to the appropriate tier. The subject always sees their own data.

## Sub-components / variants
This is a server-only/data unit; the "sub-components" are the pure helpers, validators, and the screenless/future domains.

**Pure (DB-free, unit-testable) helpers:**
- `computeAudience` (audience.ts) — scope→ids.
- `planPushDrain`, `deliveryPushStatus`, `shouldPruneToken`, `chunk`, `mapSendResponses` (push.ts/push-status.ts).
- `splitIdNumber`, `mergeIdNumber`, `idColumnsFor`, `lostCatName`, `sanitisedUserPatch` (id-documents.ts/account.ts).
- `meetsRequiredVersion` (versions.ts).
- `validateResponses`, `validateOne`, `diffResponses`, `displayResponseValue`, `flattenQuestions`, `isEmptyValue`, `sameValue` (questionnaire.ts).
- `encrypt`/`decrypt`/`decryptOrNull` (crypto.ts).

**Validators / input schemas (zod):** `SignupInput`, `MemberProfile`, `EmergencyContact`, `ComposeAnnouncementInput`, `ReimbursementInput` (+ `SaAccountDetails`/`InternationalAccountDetails` discriminated union), `RecipeSubmission`/`NormalisedRecipe`/`Ingredient`, `VoiceIntent` (discriminated on `intent`), `Questionnaire`/`QuestionnairePage`/`Question` (10-kind discriminated union), `QuestionnaireResponses`/`QuestionnaireResponseValue`, `QuestionnaireFieldChange`.

**Drivers:** `createHttpDb` (default), `createPooledDb` (transactions). `Database` type = HTTP db.

**Screenless / future domains catalogued (table + enum level):** recipes (`recipe_status`, `recipe_source`), documents (no enum), reimbursements (`reimbursement_status`, `reimbursement_account_type`), team_budgets (no enum — assigned vs perceived, ZAR default), tasks (`task_status`), adoptees (no enum), workshops + workshop_rsvps (no enum), inventory_items + inventory_updates (`inventory_update_status`), audit_log (no enum), telegram_chats/invites/announcements (`telegram_chat_kind`, `telegram_invite_status`, `telegram_announcement_status`), mcp_oauth_clients/auth_codes/access_tokens/audit_log (`mcp_client_auth_method`, `mcp_code_challenge_method`, `mcp_audit_outcome`).

**Dead / orphaned / stale flags:**
- `opt_in` questionnaire scope — declared in enum but `openActivation` rejects it (deferred pull model, `TODO(opt_in)`).
- `Rank` zod enum includes `team_lead`, which the DB `rank` pgEnum does NOT — UI ladder, not storable; the schema.ts:454 comment about storing `rank='team_lead'` is stale.
- `*_encrypted` column names + "pgcrypto" comments are historical — actual crypto is Node AES-256-GCM (crypto.ts header explains).
- `notification_channel='in_app'` deliveries are intentionally never drained by the push worker (left `queued` forever).
- `VoiceIntentName`/`VoiceIntent` and `NormalisedRecipe`/`Ingredient` are defined but back screenless voice/recipe-AI domains (no current screen in this unit's scope).
- `documents.version` is an integer counter (NOT the `-vN` string scheme used by questionnaire/required-action versions).
