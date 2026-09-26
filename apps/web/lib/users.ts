import "server-only";

import { cache } from "react";
import {
  createCampUser,
  findUserByAuthId,
  findUserById,
  getBurnerProfileByUserId,
  setUserApproval,
  setUserApprovalStatus,
  setUserDisplayName,
  setUserInviteCode,
  setUserProfileImage,
  setUserRank,
  upsertBurnerProfile as upsertBurnerProfileDb,
  getIdDocumentColumns,
  setIdDocumentColumns,
  getEmergencyContactsColumn,
  setEmergencyContactsColumn,
  setTelegramHandleColumn,
  saveBurnerProfileReplay as dbSaveBurnerProfileReplay,
} from "@camp404/db/burner-profile";
import type {
  EmergencyContact,
  QuestionnaireFieldChange,
  Team,
} from "@camp404/types";
import { encrypt, decryptOrNull } from "@camp404/db/crypto";
import { idColumnsFor } from "@camp404/db/id-documents";
import { getTeamMembershipsForCycle as dbGetTeamMembershipsForCycle } from "@camp404/db/team-memberships";
import {
  ensureRequiredAction,
  satisfyRequiredAction as dbSatisfyRequiredAction,
  getPendingRequiredActions as dbGetPendingRequiredActions,
  listPendingQuestionnaires as dbListPendingQuestionnaires,
  reconcileOpenActivations,
  type PendingQuestionnaire,
  type PendingRequiredAction,
} from "@camp404/db/activations";
import { claimInviteCode, isGodEmail } from "./access-control";
import {
  hasCampAccess as coreHasCampAccess,
  isApproved as coreIsApproved,
} from "@camp404/core";
import { getCampSettings } from "./camp-config";
import { QUESTIONNAIRE_VERSION } from "./questionnaire";
import type { AuthenticatedUser } from "./auth";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";
import { deliverAfterResponse } from "./background-work";

type Rank = "captain" | "member";
type ApprovalStatus = "pending" | "approved" | "rejected";

/**
 * Common camp-user shape that both the real Drizzle row and the in-memory
 * test store produce. Just enough fields for the rest of the app.
 */
export interface CampUser {
  id: string;
  authUserId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  inviteCode: string | null;
  rank: Rank;
  approvalStatus: ApprovalStatus;
  /** What the deciding captain told the member, if anything. */
  approvalDecisionReason: string | null;
}

/**
 * Resolve the camp user row for the given authenticated user (Better Auth or
 * test). A row is only ever persisted for someone who has earned access: a
 * god account (auto-created, approved) or an existing row. An authenticated
 * user with no row and no invite yet gets a synthetic, non-persisted row
 * back — `hasCampAccess` reads false off it, so every caller bounces them to
 * the /signup/required invite gate without writing an orphan "signed in, no
 * invite" entry. They get a real row when they redeem a code at the gate (see
 * {@link redeemInviteForUser}). Routes through the test store when
 * E2E_TEST_MODE=1.
 */
export async function ensureCampUser(
  authUser: AuthenticatedUser,
): Promise<CampUser> {
  const god = isGodEmail(authUser.primaryEmail);
  const store = usesTestStore() ? testBackend : realBackend;
  const existing = await store.findUserByAuthId(authUser.id);
  if (existing) return existing;

  // God accounts bypass the invite gate entirely — give them a real,
  // approved row on first sign-in.
  if (god) {
    const created = await store.createUser({
      authUserId: authUser.id,
      displayName: authUser.displayName ?? authUser.primaryEmail,
      inviteCode: null,
      rank: "member",
      approvalStatus: "approved",
    });
    await seedBurnerProfileAction(created.id);
    return created;
  }

  // Signed in, but no row and no invite redeemed yet. Hand back a synthetic,
  // non-persisted row so the access gate bounces them to /signup/required to
  // enter a code — without leaking an orphan entry. The empty id is never
  // used: every caller checks hasCampAccess and redirects first.
  return {
    id: "",
    authUserId: authUser.id,
    displayName: authUser.displayName ?? authUser.primaryEmail,
    profileImageUrl: null,
    inviteCode: null,
    rank: "member",
    approvalStatus: "approved",
    approvalDecisionReason: null,
  };
}

export type RedeemInviteResult = { ok: true } | { ok: false; error: string };

/**
 * Claim an invite code for an already-authenticated user and stamp it onto
 * their camp row, creating the row if this is their first time through. This
 * is the post-auth invite gate (POSTed from /signup/required): the user has
 * signed in but can't reach the questionnaire until a valid
 * code is on file.
 *
 * The claim is atomic — for a capped DB code, two racing redeemers can't both
 * win the last use. A code that requires vetting drops the redeemer into the
 * captain approval queue (`pending`). God accounts and users who already hold
 * a code short-circuit without burning another use.
 */
export async function redeemInviteForUser(
  authUser: AuthenticatedUser,
  rawCode: string,
): Promise<RedeemInviteResult> {
  const code = rawCode.trim();
  if (!code) return { ok: false, error: "Please enter an invite code." };

  const store = usesTestStore() ? testBackend : realBackend;
  const existing = await store.findUserByAuthId(authUser.id);

  // Already past the gate (god or a code on file) — don't spend another use.
  if (isGodEmail(authUser.primaryEmail) || existing?.inviteCode) {
    return { ok: true };
  }

  const claimed = await claimInviteCode(code);
  if (!claimed) return { ok: false, error: "That invite code isn't valid." };

  if (existing) {
    await store.setUserInviteCode(existing.id, claimed.code);
    if (claimed.assignedRank && claimed.assignedRank !== existing.rank) {
      await store.setUserRank(existing.id, claimed.assignedRank);
    }
    // A vetting-required code only ever tightens access into the queue.
    if (claimed.requiresApproval && existing.approvalStatus !== "pending") {
      await store.setUserApprovalStatus(existing.id, "pending");
    }
    return { ok: true };
  }

  // First time through: create the row stamped with the claimed code.
  // Pre-approved invites land `approved`; vetting-required ones land
  // `pending` (blocked after onboarding until a captain decides).
  let created: CampUser;
  try {
    created = await store.createUser({
      authUserId: authUser.id,
      displayName: authUser.displayName ?? authUser.primaryEmail,
      inviteCode: claimed.code,
      rank: claimed.assignedRank ?? "member",
      approvalStatus: claimed.requiresApproval ? "pending" : "approved",
    });
  } catch (err) {
    // Two submits at once (two tabs, or a network retry): both saw no row,
    // both claimed a use, and the second insert hit the unique auth_user_id.
    // The member DID join, so say so instead of throwing them onto an error
    // page. The second request's use of the code is spent; the claim and the
    // insert are separate statements, and a lost use is the cheaper failure.
    const winner = await store.findUserByAuthId(authUser.id);
    if (!winner) throw err;
    console.warn(
      "redeemInviteForUser: a concurrent redeem already created this member; one extra use of the code was spent",
    );
    return { ok: true };
  }
  await seedBurnerProfileAction(created.id);
  return { ok: true };
}

export interface BurnerProfileSummary {
  responses: Record<string, unknown>;
  completedAt: Date | null;
  updatedAt: Date | null;
  version: string | null;
}

export async function getBurnerProfile(
  campUserId: string,
): Promise<BurnerProfileSummary | null> {
  const store = usesTestStore() ? testBackend : realBackend;
  return store.getBurnerProfile(campUserId);
}

/**
 * Read-only lookup of the camp user for an auth session — no cookie handling
 * or invite-code writes (unlike {@link ensureCampUser}). For hot paths that
 * just need the existing row, e.g. gating the avatar proxy on every image load.
 */
export async function findCampUserByAuthId(
  authUserId: string,
): Promise<CampUser | null> {
  const store = usesTestStore() ? testBackend : realBackend;
  return store.findUserByAuthId(authUserId);
}

/** The camp user with this id (not the auth id), or null. */
export async function findCampUserById(
  userId: string,
): Promise<CampUser | null> {
  const store = usesTestStore() ? testBackend : realBackend;
  return store.findUserById(userId);
}

/**
 * Whether this user is allowed past the signup gate (god account or has
 * redeemed a valid invite code). Note this is the *invite* gate only — a
 * member can be camp-active but still awaiting captain approval; use
 * {@link isApproved} for the full "can use the app" check.
 */
/**
 * required_actions gating helpers. Under E2E_TEST_MODE they write the test
 * store's twin rows, so the member ladder gates E2E users the same way.
 */
export async function seedBurnerProfileAction(userId: string): Promise<void> {
  if (usesTestStore()) {
    testStore.ensureRequiredAction({
      userId,
      actionKey: "burner_profile",
      title: "Complete your burner profile",
      version: QUESTIONNAIRE_VERSION,
    });
    return;
  }
  await ensureRequiredAction({
    userId,
    type: "questionnaire",
    actionKey: "burner_profile",
    title: "Complete your burner profile",
    version: QUESTIONNAIRE_VERSION,
  });
}

/** Satisfy the burner-profile gate when the profile is completed. */
export async function satisfyBurnerProfileAction(
  userId: string,
): Promise<void> {
  if (usesTestStore()) {
    testStore.satisfyRequiredAction(userId, "burner_profile");
    return;
  }
  await dbSatisfyRequiredAction(
    userId,
    "burner_profile",
    QUESTIONNAIRE_VERSION,
  );
}

/**
 * Give this member the gates of every open send they belong to but joined
 * after it opened: a new member, a new team member, or a newly picked one.
 * Call it before reading the gate spine. No-op under E2E test mode, where
 * there are no required actions at all.
 */
export async function syncOpenGates(userId: string): Promise<void> {
  if (usesTestStore()) return;
  await reconcileOpenActivations(userId);
}

/**
 * Every questionnaire the member still has to answer from an open send,
 * blocking or optional (empty under E2E test mode, like the gate spine). The
 * inbox's "Needs your answer" section reads this, and so does getInboxBadge
 * (lib/inbox-badge.ts), the count on the bell and the Notifications tile.
 */
export async function getPendingQuestionnaires(
  userId: string,
): Promise<PendingQuestionnaire[]> {
  if (usesTestStore()) return [];
  return dbListPendingQuestionnaires(userId);
}

/** The user's pending blocking required actions, oldest first. */
export async function getPendingRequiredActions(
  userId: string,
): Promise<PendingRequiredAction[]> {
  if (usesTestStore()) return testStore.getPendingRequiredActions(userId);
  return dbGetPendingRequiredActions(userId);
}

export function hasCampAccess(
  user: { inviteCode: string | null },
  email: string | null,
): boolean {
  return coreHasCampAccess(user, isGodEmail(email));
}

/**
 * Whether this user has cleared captain vetting. God accounts are always
 * approved (they never carry a pending status). Pending users are blocked
 * behind /pending-approval; rejected users are denied.
 */
export function isApproved(
  user: { approvalStatus: ApprovalStatus },
  email: string | null,
): boolean {
  return coreIsApproved(user, isGodEmail(email));
}

/** One team a member is on this year, and whether they lead it. */
export interface MyMembership {
  team: Team;
  isLead: boolean;
}

/**
 * The teams a member is on THIS YEAR, and whether they lead each: ONE read per
 * member per request, from which the lead flag (`isTeamLead`), the led teams
 * (`getLeadTeams`), the member's teams (`getMyTeams`) and the program manifest
 * all follow. The console used to make each of those reads separately, and
 * each of them read `camp_settings` again for the year.
 *
 * Year-scoped: the year comes from the request's one settings read
 * (`getCampSettings`), so at a rollover this empties for everyone until
 * captains assign teams again, and last year's lead rows answer nothing.
 *
 * React `cache()` only, keyed by the member: one server render shares it and
 * throws it away. The membership writes (`assignTeam`, `removeTeam`,
 * `setLead`) never read through this, and the re-render that
 * `revalidateManifest()` asks for after one is a new render, so it reads the
 * fresh rows. Do not read this after a membership write in the same action.
 *
 * The E2E twin is the test store's `team_memberships` mirror, year-scoped by
 * the same rules (lib/__tests__/test-store-teams.test.ts), in the same team
 * order as the database (lib/__tests__/memberships-agreement.test.ts).
 */
export const getMyMemberships = cache(
  async (userId: string): Promise<MyMembership[]> => {
    if (usesTestStore()) {
      return testStore
        .getTeamMemberships(userId)
        .map((m) => ({ team: m.team, isLead: m.isLead }));
    }
    const { cycleNumber } = await getCampSettings();
    const rows = await dbGetTeamMembershipsForCycle(userId, cycleNumber);
    return rows.map((m) => ({ team: m.team, isLead: m.isLead }));
  },
);

/**
 * Whether a user leads at least one team THIS YEAR — the derived `team_lead`
 * rank that unlocks the control panel's team-lead layer. Team leadership is
 * year-scoped in the database, so this flips back to false for everyone at a
 * rollover and returns as captains reappoint leads ("same with team lead
 * roles"). Nothing is deleted: last year's lead row stays on file, it just is
 * not an answer to this year's question.
 *
 * Read from `getMyMemberships`, so the gate, the header and the manifest share
 * one read per request.
 */
export async function isTeamLead(userId: string): Promise<boolean> {
  return (await getMyMemberships(userId)).some((m) => m.isLead);
}

/**
 * The teams this member is on THIS year, and whether they lead each — for
 * their own home page. Year-scoped like every team read: at a rollover it
 * empties until captains assign teams again.
 */
export async function getMyTeams(
  userId: string,
): Promise<{ team: string; isLead: boolean }[]> {
  return getMyMemberships(userId);
}

/**
 * The teams this member LEADS this year. Clearance is global — leading any team
 * makes you a `team_lead` everywhere (owner-ratified) — so this is never a
 * clearance question; it is the AUDIENCE question (`canSendToAudience`, and
 * the Kitchen and Power predicates).
 *
 * Year-scoped like `isTeamLead`: at a rollover it empties for everyone until
 * captains reappoint leads.
 */
export async function getLeadTeams(userId: string): Promise<string[]> {
  return (await getMyMemberships(userId))
    .filter((m) => m.isLead)
    .map((m) => m.team);
}

/**
 * Apply a captain's vetting decision (approve, reject, or re-open). Captain-gated
 * by the caller; this persists it and stamps the deciding captain. Returns false
 * when the member is no longer in the `from` status the captain saw — another
 * captain already moved them, so this call changed nothing.
 */
export async function decideUserApproval(input: {
  userId: string;
  from: ApprovalStatus;
  to: ApprovalStatus;
  decidedByUserId: string;
  /** Shown to the member on /pending-approval; blank means none. */
  reason?: string | null;
}): Promise<boolean> {
  const store = usesTestStore() ? testBackend : realBackend;
  const changed = await store.setUserApproval(input);
  // An approval writes the member a notice; send it now, not on a schedule.
  if (changed) deliverAfterResponse();
  return changed;
}

/**
 * Set a camp user's stored rank, through the real/test split. The captain-
 * promotion accept action calls this (rank → "captain") only after the target
 * accepts — the one explicit, app-orchestrated rank write (the db promotion
 * module never touches `users.rank`).
 */
export async function setCampUserRank(
  userId: string,
  rank: Rank,
): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.setUserRank(userId, rank);
}

// --- Backends -----------------------------------------------------------

interface UserBackend {
  findUserByAuthId(authUserId: string): Promise<CampUser | null>;
  findUserById(userId: string): Promise<CampUser | null>;
  createUser(input: {
    authUserId: string;
    displayName: string | null;
    inviteCode: string | null;
    rank: Rank;
    approvalStatus: ApprovalStatus;
  }): Promise<CampUser>;
  setUserInviteCode(userId: string, code: string): Promise<void>;
  setUserRank(userId: string, rank: Rank): Promise<void>;
  setUserApprovalStatus(userId: string, status: ApprovalStatus): Promise<void>;
  setUserApproval(input: {
    userId: string;
    from: ApprovalStatus;
    to: ApprovalStatus;
    decidedByUserId: string;
    reason?: string | null;
  }): Promise<boolean>;
  setUserProfileImage(userId: string, url: string | null): Promise<void>;
  setTelegramHandle(userId: string, handle: string | null): Promise<void>;
  setUserDisplayName(userId: string, name: string | null): Promise<void>;
  getBurnerProfile(userId: string): Promise<BurnerProfileSummary | null>;
  upsertBurnerProfile(input: {
    userId: string;
    version: string;
    responses: Record<string, unknown>;
    markComplete: boolean;
  }): Promise<void>;
  setIdDocuments(
    userId: string,
    id: { idType: string | null; idNumber: string | null },
  ): Promise<void>;
  getIdDocuments(
    userId: string,
  ): Promise<{ idType: string | null; idNumber: string | null } | null>;
  setEmergencyContacts(
    userId: string,
    contacts: readonly EmergencyContact[],
  ): Promise<void>;
  getEmergencyContacts(userId: string): Promise<EmergencyContact[] | null>;
  saveBurnerProfileReplay(input: BurnerProfileReplayInput): Promise<void>;
}

export interface BurnerProfileReplayInput {
  userId: string;
  version: string;
  /** Answers with the ID number and emergency contacts split out. */
  responses: Record<string, unknown>;
  /** The ID number to store, or null to leave it alone. */
  id: { idType: string | null; idNumber: string } | null;
  emergencyContacts: readonly EmergencyContact[];
  /** The Telegram username, or null to clear it; undefined leaves it alone. */
  telegramHandle?: string | null;
  /** The change-log row, or null when nothing changed. */
  edit: {
    questionnaireKey: string;
    editedByUserId: string | null;
    changes: QuestionnaireFieldChange[];
  } | null;
}

/**
 * Save a My forms replay of the burner profile: answers, ID number, emergency
 * contacts, gate and change-log row, all or nothing (one transaction in the
 * real backend).
 */
export async function saveBurnerProfileReplay(
  input: BurnerProfileReplayInput,
): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.saveBurnerProfileReplay(input);
}

export async function upsertBurnerProfile(input: {
  userId: string;
  version: string;
  responses: Record<string, unknown>;
  markComplete: boolean;
}): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.upsertBurnerProfile(input);
}

/** Persist the member's Telegram username (bare, or null to clear it). */
export async function setTelegramHandle(
  userId: string,
  handle: string | null,
): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.setTelegramHandle(userId, handle);
}

/** Persist the member's profile photo URL (or null to clear it). */
export async function setProfileImage(
  userId: string,
  url: string | null,
): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.setUserProfileImage(userId, url);
}

/** Update the member's display name. */
export async function setDisplayName(
  userId: string,
  name: string | null,
): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.setUserDisplayName(userId, name);
}

/**
 * Persist the member's government ID number. Encrypted on write in the real
 * backend (AES-256-GCM via PGCRYPTO_KEY); the E2E test backend keeps the raw
 * value in memory so tests need no key.
 */
export async function setIdDocuments(
  userId: string,
  id: { idType: string | null; idNumber: string | null },
): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.setIdDocuments(userId, id);
}

/**
 * Store the member's emergency contacts (split out of their burner profile
 * answers by question role). An empty list clears them.
 */
export async function setEmergencyContacts(
  userId: string,
  contacts: readonly EmergencyContact[],
): Promise<void> {
  const store = usesTestStore() ? testBackend : realBackend;
  await store.setEmergencyContacts(userId, contacts);
}

/**
 * Read a member's emergency contacts, or null when none are on file. The
 * caller authorises: the member's own form, or resolveSafetyDataForViewer.
 */
export async function getEmergencyContacts(
  userId: string,
): Promise<EmergencyContact[] | null> {
  const store = usesTestStore() ? testBackend : realBackend;
  return store.getEmergencyContacts(userId);
}

/** Read + decrypt the member's government ID number (owner/captain gated by
 * the caller). Returns null when the user has no row. */
export async function getIdDocuments(
  userId: string,
): Promise<{ idType: string | null; idNumber: string | null } | null> {
  const store = usesTestStore() ? testBackend : realBackend;
  return store.getIdDocuments(userId);
}

const realBackend: UserBackend = {
  async findUserByAuthId(authUserId) {
    const row = await findUserByAuthId(authUserId);
    return row ? toCampUser(row) : null;
  },
  async findUserById(userId) {
    const row = await findUserById(userId);
    return row ? toCampUser(row) : null;
  },
  async createUser(input) {
    const row = await createCampUser(input);
    return toCampUser(row);
  },
  async setUserInviteCode(userId, code) {
    await setUserInviteCode(userId, code);
  },
  async setUserRank(userId, rank) {
    await setUserRank(userId, rank);
  },
  async setUserApprovalStatus(userId, status) {
    await setUserApprovalStatus(userId, status);
  },
  async setUserApproval(input) {
    return setUserApproval(input);
  },
  async setUserProfileImage(userId, url) {
    await setUserProfileImage(userId, url);
  },
  async setTelegramHandle(userId, handle) {
    await setTelegramHandleColumn(userId, handle);
  },
  async setUserDisplayName(userId, name) {
    await setUserDisplayName(userId, name);
  },
  async getBurnerProfile(userId) {
    const row = await getBurnerProfileByUserId(userId);
    if (!row) return null;
    return {
      responses: (row.responses as Record<string, unknown>) ?? {},
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
      version: row.version,
    };
  },
  async upsertBurnerProfile(input) {
    await upsertBurnerProfileDb(input);
  },
  async setIdDocuments(userId, id) {
    await setIdDocumentColumns(
      userId,
      idColumnsFor(id.idType, id.idNumber ? encrypt(id.idNumber) : null),
    );
  },
  async setEmergencyContacts(userId, contacts) {
    await setEmergencyContactsColumn(userId, contacts);
  },
  async getEmergencyContacts(userId) {
    return getEmergencyContactsColumn(userId);
  },
  async saveBurnerProfileReplay(input) {
    await dbSaveBurnerProfileReplay({
      userId: input.userId,
      version: input.version,
      responses: input.responses,
      // Encrypt before the transaction opens, so a key problem fails the save
      // before anything is written.
      idColumns: input.id
        ? idColumnsFor(input.id.idType, encrypt(input.id.idNumber))
        : null,
      emergencyContacts: input.emergencyContacts,
      telegramHandle: input.telegramHandle,
      edit: input.edit,
    });
  },
  async getIdDocuments(userId) {
    const cols = await getIdDocumentColumns(userId);
    if (!cols) return null;
    const passport = decryptOrNull(cols.passportEncrypted);
    const saId = decryptOrNull(cols.saIdEncrypted);
    if (passport) return { idType: "passport", idNumber: passport };
    if (saId) return { idType: "sa_id", idNumber: saId };
    return { idType: null, idNumber: null };
  },
};

const testBackend: UserBackend = {
  async findUserByAuthId(authUserId) {
    const row = testStore.findUserByAuthId(authUserId);
    return row ? toCampUser(row) : null;
  },
  async findUserById(userId) {
    const row = testStore.findUserById(userId);
    return row ? toCampUser(row) : null;
  },
  async createUser(input) {
    const row = testStore.createUser(input);
    return toCampUser(row);
  },
  async setUserInviteCode(userId, code) {
    testStore.setUserInviteCode(userId, code);
  },
  async setUserRank(userId, rank) {
    testStore.setUserRank(userId, rank);
  },
  async setUserApprovalStatus(userId, status) {
    testStore.setUserApprovalStatus(userId, status);
  },
  async setUserApproval(input) {
    return testStore.setUserApproval(input);
  },
  async setUserProfileImage(userId, url) {
    testStore.setProfileImage(userId, url);
  },
  async setTelegramHandle(userId, handle) {
    testStore.setTelegramHandle(userId, handle);
  },
  async setUserDisplayName(userId, name) {
    testStore.setDisplayName(userId, name);
  },
  async getBurnerProfile(userId) {
    const row = testStore.getProfile(userId);
    if (!row) return null;
    return {
      responses: row.responses,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
      version: row.version,
    };
  },
  async upsertBurnerProfile(input) {
    testStore.upsertProfile(input);
  },
  async setIdDocuments(userId, id) {
    testStore.setIdDocuments(userId, id);
  },
  async getIdDocuments(userId) {
    return testStore.getIdDocuments(userId);
  },
  async setEmergencyContacts(userId, contacts) {
    testStore.setEmergencyContacts(userId, contacts);
  },
  async getEmergencyContacts(userId) {
    return testStore.getEmergencyContacts(userId);
  },
  async saveBurnerProfileReplay(input) {
    // The in-memory store cannot fail part-way, so plain writes stand in for
    // the transaction.
    testStore.upsertProfile({
      userId: input.userId,
      version: input.version,
      responses: input.responses,
      markComplete: true,
    });
    if (input.id) testStore.setIdDocuments(input.userId, input.id);
    testStore.setEmergencyContacts(input.userId, input.emergencyContacts);
    if (input.telegramHandle !== undefined) {
      testStore.setTelegramHandle(input.userId, input.telegramHandle);
    }
    // A re-submit also re-satisfies the gate, as in the real backend.
    testStore.satisfyRequiredAction(input.userId, "burner_profile");
    if (input.edit && input.edit.changes.length > 0) {
      testStore.recordQuestionnaireEdit({
        userId: input.userId,
        version: input.version,
        ...input.edit,
      });
    }
  },
};

function toCampUser(row: {
  id: string;
  authUserId: string;
  displayName: string | null;
  profileImageUrl?: string | null;
  inviteCode: string | null;
  rank: Rank;
  approvalStatus?: ApprovalStatus | null;
  approvalDecisionReason?: string | null;
}): CampUser {
  return {
    id: row.id,
    authUserId: row.authUserId,
    displayName: row.displayName,
    profileImageUrl: row.profileImageUrl ?? null,
    inviteCode: row.inviteCode,
    rank: row.rank,
    approvalStatus: row.approvalStatus ?? "approved",
    approvalDecisionReason: row.approvalDecisionReason ?? null,
  };
}
