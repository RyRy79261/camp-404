// Field-privacy law. The two classes below decide, for any one piece of a
// member's data, whether another human may ever see it — and they are the
// SINGLE source of that answer, so the rule the UI renders and the rule the
// server enforces cannot drift apart.
//
// Camp 404 keeps most answers as question ids in the `burner_profiles.responses`
// JSONB map, and the rest as columns on `users` / `dietary_requirements`. So a
// "key" here is the name the field goes by where it actually lives: the question
// id for a JSONB answer (`id.number`), the Drizzle property name for a column
// (`emergencyContacts`). Both namespaces are flat and neither collides, so one
// set covers both.
//
// Pure and dependency-free — the same import works in a server action, an MCP
// tool, and a client component.

import type { ViewerRank } from "@camp404/types";
import { hasClearance } from "./access";

/**
 * Never shown to another member, at any rank, for any reason. There is no
 * emergency in which someone else needs a government ID number or your banking
 * details; the owner and captains read the ID through the deliberate,
 * audited decrypt path in camp-management, not through a member-facing view.
 *
 * `id.number` is the plaintext answer key (`ID_NUMBER_KEY` in
 * `@camp404/db/id-documents`); the three `*Encrypted` names are the `users`
 * columns it and the EFT details are persisted to.
 */
export const ALWAYS_PRIVATE: ReadonlySet<string> = new Set([
  "id.number",
  "passportEncrypted",
  "saIdEncrypted",
  "eftDetailsEncrypted",
]);

/**
 * Shown to whoever needs it when something has gone wrong — the medic, the
 * kitchen, the captain making the call at 3am. Private in the ordinary course,
 * but withholding it is the more dangerous failure, so these are exempt from
 * the default deny rather than lumped in with self-expression answers.
 *
 * `emergencyContacts` is the `users` column; `allergies` and `isAnaphylactic`
 * are the `dietary_requirements` columns (the camp's only dietary source of
 * truth — there are no dietary columns on `users`).
 */
export const SAFETY_VISIBLE: ReadonlySet<string> = new Set([
  "emergencyContacts",
  "allergies",
  "isAnaphylactic",
]);

/**
 * Who can see safety data, in the words a member reads where they give it (the
 * emergency contacts and dietary pages). It must match SAFETY_VISIBLE's
 * readers in MEMBER_FIELD_READERS; the owner's ruling (2026-09-16) is the
 * member, captains and any team lead.
 */
export const MEDICAL_AUDIENCE_NOTE =
  "Only you, captains and team leads can see this.";

/** The minimum a caller's field descriptor must carry to be classified. */
export interface PrivacyField {
  /** Locked by the questionnaire/config author, independent of the law below. */
  locked?: boolean;
}

/**
 * Whether a field is locked away from other members.
 *
 * Derived, never stored: an `ALWAYS_PRIVATE` key is locked no matter what the
 * field descriptor says, and any other field is locked only if its author
 * marked it so. This is the whole point of the module — a caller that renders
 * `isFieldLocked(...)` and a caller that enforces it get the same answer, and
 * adding a key to `ALWAYS_PRIVATE` locks every surface at once.
 */
export function isFieldLocked(key: string, field?: PrivacyField): boolean {
  return ALWAYS_PRIVATE.has(key) || field?.locked === true;
}

/** Whether a field may be surfaced on a safety/emergency read. */
export function isSafetyVisible(key: string): boolean {
  return SAFETY_VISIBLE.has(key);
}

// --- Who may read each member field ------------------------------------------
//
// One list for the whole app: every piece of member data mapped to the lowest
// rank that may read it about SOMEONE ELSE. A member always reads their own.
// The rungs are the global clearance ladder (camp_member < team_lead < captain),
// because team lead clearance is sitewide (owner-ratified). Every surface that
// shows member data (the member roster, the captain roster and panel, the MCP
// tools, the member export) takes its columns from here, so an export can never
// show more than the screen does.
//
// Columns are keyed `table.property` (the Drizzle table export and property
// names). A test in packages/db checks that every column of every member-data
// table has an entry, so a new column cannot ship unlisted.
//
// Owner's rulings behind the rungs (2026-09-16, and the approval standing
// 2026-09-22):
// - Members see what the member roster shows: name, handle, rank, teams,
//   country, and whether the person is still an applicant. Never email.
// - Safety data (emergency contacts, dietary needs, allergies) is readable by
//   the member, captains and any team lead, and every other-person read is
//   audited.
// - Captains read everything, including email (to assign DDT tickets) and
//   decrypted ID numbers (to match tickets to ID), through audited paths.

export const MEMBER_FIELD_READERS: Readonly<Record<string, ViewerRank>> = {
  // users — identity the roster shows
  "users.id": "camp_member",
  "users.displayName": "camp_member",
  "users.profileImageUrl": "camp_member",
  "users.rank": "camp_member",
  "users.isSystem": "camp_member",
  "users.telegramHandle": "camp_member",
  "users.sanitised": "camp_member",
  "users.lostCatNumber": "camp_member",
  // users — safety
  "users.emergencyContacts": "team_lead",
  // users — captain-only
  "users.authUserId": "captain",
  "users.membershipTier": "captain",
  "users.duesPaid": "captain",
  "users.duesPaidAt": "captain",
  "users.passportEncrypted": "captain",
  "users.saIdEncrypted": "captain",
  "users.eftDetailsEncrypted": "captain",
  "users.skills": "captain",
  "users.previousAfrikaburns": "captain",
  "users.previousBurningMans": "captain",
  "users.firstTime": "captain",
  "users.inviteCode": "captain",
  // The owner ruled (2026-09-22) "I think everyone should be able to see the
  // applicants", so whether someone is still waiting on a captain is ordinary
  // roster information. Only the STANDING is open: who decided it, when, and
  // what they said stay captain-only below, and a declined sign-up is kept off
  // a member's roster entirely by MEMBERS_SEE_REJECTED in lib/camp-roster.ts.
  "users.approvalStatus": "camp_member",
  "users.approvalDecidedByUserId": "captain",
  "users.approvalDecidedAt": "captain",
  "users.approvalDecisionReason": "captain",
  "users.refCode": "captain",
  "users.termsVersion": "captain",
  "users.termsConsentedAt": "captain",
  "users.sanitisedAt": "captain",
  "users.telegramUserId": "captain",
  "users.aiDataConsent": "captain",
  "users.aiDataConsentAt": "captain",
  "users.createdAt": "captain",
  "users.updatedAt": "captain",

  // burner_profiles — the answers are captain-only as a whole; the answers a
  // member may read are listed one by one in PROFILE_ANSWER_READERS
  "burnerProfiles.userId": "camp_member",
  "burnerProfiles.version": "captain",
  "burnerProfiles.responses": "captain",
  "burnerProfiles.startedAt": "captain",
  "burnerProfiles.completedAt": "captain",
  "burnerProfiles.updatedAt": "captain",

  // dietary_requirements — safety data
  "dietaryRequirements.userId": "camp_member",
  "dietaryRequirements.tags": "team_lead",
  "dietaryRequirements.allergies": "team_lead",
  "dietaryRequirements.intolerances": "team_lead",
  "dietaryRequirements.isAnaphylactic": "team_lead",
  "dietaryRequirements.notes": "team_lead",
  "dietaryRequirements.version": "captain",
  "dietaryRequirements.completedAt": "captain",
  "dietaryRequirements.createdAt": "captain",
  "dietaryRequirements.updatedAt": "captain",

  // driver_profiles — travel logistics, captain-only
  "driverProfiles.userId": "camp_member",
  "driverProfiles.cycle": "captain",
  "driverProfiles.intendsToDrive": "captain",
  "driverProfiles.intentRegisteredAt": "captain",
  "driverProfiles.vehicleMake": "captain",
  "driverProfiles.vehicleModel": "captain",
  "driverProfiles.vehicleRegistration": "captain",
  "driverProfiles.seatsTotal": "captain",
  "driverProfiles.seatsOffered": "captain",
  "driverProfiles.canOfferLifts": "captain",
  "driverProfiles.offroadExperienced": "captain",
  "driverProfiles.canTow": "captain",
  "driverProfiles.proficiencyNotes": "captain",
  "driverProfiles.departureCity": "captain",
  "driverProfiles.arrivalAt": "captain",
  "driverProfiles.departureAt": "captain",
  "driverProfiles.notes": "captain",
  "driverProfiles.version": "captain",
  "driverProfiles.completedAt": "captain",
  "driverProfiles.createdAt": "captain",
  "driverProfiles.updatedAt": "captain",

  // car_members — who rides with whom, captain-only
  "carMembers.driverUserId": "captain",
  "carMembers.memberUserId": "captain",
  "carMembers.cycle": "captain",
  "carMembers.createdAt": "captain",

  // user — the sign-in identity (Better Auth). Captains read email to assign
  // DDT tickets; members never see another member's email. The credential
  // tables beside it (account, session, two_factor, passkey) hold secrets no
  // rank reads, and the app never selects them.
  "user.id": "captain",
  "user.name": "captain",
  "user.email": "captain",
  "user.emailVerified": "captain",
  "user.image": "captain",
  "user.twoFactorEnabled": "captain",
  "user.createdAt": "captain",
  "user.updatedAt": "captain",

  // payments — the dues ledger, captain-only
  "payments.id": "captain",
  "payments.userId": "captain",
  "payments.cycle": "captain",
  "payments.amountCents": "captain",
  "payments.currency": "captain",
  "payments.reference": "captain",
  "payments.status": "captain",
  "payments.note": "captain",
  "payments.recordedByUserId": "captain",
  "payments.createdAt": "captain",
  "payments.updatedAt": "captain",

  // team_memberships — the roster shows teams and leads
  "teamMemberships.userId": "camp_member",
  "teamMemberships.team": "camp_member",
  "teamMemberships.isLead": "camp_member",
  "teamMemberships.cycle": "camp_member",
  "teamMemberships.createdAt": "captain",
};

/**
 * Burner profile answers (question id → lowest reader) that are readable below
 * captain. Every other answer is captain-only, like the `responses` column it
 * lives in, so a new question never widens what a member can see.
 */
export const PROFILE_ANSWER_READERS: Readonly<Record<string, ViewerRank>> = {
  country: "camp_member",
  "bio.statement": "camp_member",
  "ideas.this_year": "camp_member",
  // The burner profile's dietary page is safety data, like the
  // dietary_requirements columns.
  "dietary.dislikes": "team_lead",
  "dietary.allergies": "team_lead",
  "dietary.notes": "team_lead",
};

/** Who is reading, and whether the data is their own. */
export interface FieldViewer {
  rank: ViewerRank;
  isSelf: boolean;
}

/**
 * Whether a viewer may read one member column (`table.property`). A member
 * reads all of their own. Anyone else needs the column's rung. An unlisted
 * column or an unknown rank is refused.
 */
export function canReadMemberField(
  viewer: FieldViewer,
  field: string,
): boolean {
  if (viewer.isSelf) return true;
  const reader = MEMBER_FIELD_READERS[field];
  return reader !== undefined && hasClearance(viewer.rank, reader);
}

/**
 * Whether a viewer may read one burner profile answer by question id. An
 * unlisted answer needs captain, like the `responses` column.
 */
export function canReadProfileAnswer(
  viewer: FieldViewer,
  questionId: string,
): boolean {
  if (viewer.isSelf) return true;
  return hasClearance(
    viewer.rank,
    PROFILE_ANSWER_READERS[questionId] ?? "captain",
  );
}

/** Why a viewer may read someone's safety data; recorded on the audit row. */
export type SafetyReadBasis = "self" | "captain" | "team_lead";

/**
 * The basis on which a viewer may read a member's safety data (emergency
 * contacts, allergies), or null when they may not. The owner's ruling: the
 * member, captains and any team lead (lead rank is global). Fail-closed on an
 * unknown rank. Every non-self read must be audited by the caller.
 */
export function safetyReadBasis(viewer: FieldViewer): SafetyReadBasis | null {
  if (viewer.isSelf) return "self";
  if (!canReadMemberField(viewer, "users.emergencyContacts")) return null;
  return viewer.rank === "captain" ? "captain" : "team_lead";
}

// --- Erasure provers -----------------------------------------------------------

/**
 * The always-private and safety `users` columns an erasure patch leaves set.
 * Empty means the patch clears every one. A key added to ALWAYS_PRIVATE or
 * SAFETY_VISIBLE that names a `users` column fails this until erasure clears
 * it too. (Answer keys and dietary columns live in rows erasure deletes.)
 */
export function uncoveredPrivateUserColumns(
  patch: Record<string, unknown>,
): string[] {
  return [...ALWAYS_PRIVATE, ...SAFETY_VISIBLE].filter(
    (key) => `users.${key}` in MEMBER_FIELD_READERS && patch[key] !== null,
  );
}

/**
 * Whether any value in `patch` still contains one of the person's own values
 * (their name, handle, phone). The leak detector for erasure tests, like
 * `notificationMentionsAny` for notifications.
 */
export function patchLeaksAny(
  patch: Record<string, unknown>,
  forbidden: readonly (string | null | undefined)[],
): boolean {
  const needles = forbidden
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.toLowerCase());
  if (needles.length === 0) return false;
  const haystack = JSON.stringify(patch).toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}
