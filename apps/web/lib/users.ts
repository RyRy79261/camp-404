import "server-only";

import {
  createCampUser,
  findUserByAuthId,
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
} from "@camp404/db/burner-profile";
import { encrypt, decryptOrNull } from "@camp404/db/crypto";
import { idColumnsFor } from "@camp404/db/id-documents";
import { isTeamLead as dbIsTeamLead } from "@camp404/db/roster";
import {
  ensureRequiredAction,
  satisfyRequiredAction as dbSatisfyRequiredAction,
  getPendingRequiredActions as dbGetPendingRequiredActions,
  type PendingRequiredAction,
} from "@camp404/db/activations";
import { claimInviteCode, isGodEmail } from "./access-control";
import {
  hasCampAccess as coreHasCampAccess,
  isApproved as coreIsApproved,
} from "@camp404/core";
import { QUESTIONNAIRE } from "./questionnaire";
import type { AuthenticatedUser } from "./auth";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

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
}

/**
 * Resolve the camp user row for the given authenticated user (Neon Auth or
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
  const store = isE2ETestMode() ? testBackend : realBackend;
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
  };
}

export type RedeemInviteResult = { ok: true } | { ok: false; error: string };

/**
 * Claim an invite code for an already-authenticated user and stamp it onto
 * their camp row, creating the row if this is their first time through. This
 * is the post-auth invite gate (POSTed from /signup/required): the user has
 * signed in via Neon Auth but can't reach the questionnaire until a valid
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

  const store = isE2ETestMode() ? testBackend : realBackend;
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
  const created = await store.createUser({
    authUserId: authUser.id,
    displayName: authUser.displayName ?? authUser.primaryEmail,
    inviteCode: claimed.code,
    rank: claimed.assignedRank ?? "member",
    approvalStatus: claimed.requiresApproval ? "pending" : "approved",
  });
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
  const store = isE2ETestMode() ? testBackend : realBackend;
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
  const store = isE2ETestMode() ? testBackend : realBackend;
  return store.findUserByAuthId(authUserId);
}

/**
 * Whether this user is allowed past the signup gate (god account or has
 * redeemed a valid invite code). Note this is the *invite* gate only — a
 * member can be camp-active but still awaiting captain approval; use
 * {@link isApproved} for the full "can use the app" check.
 */
/**
 * required_actions gating helpers. Real-DB only: under E2E_TEST_MODE these are
 * no-ops, and the legacy `completedAt` fallback still present in the home gate
 * preserves test behaviour until a test-store implementation lands.
 */
export async function seedBurnerProfileAction(userId: string): Promise<void> {
  if (isE2ETestMode()) return;
  await ensureRequiredAction({
    userId,
    type: "questionnaire",
    actionKey: "burner_profile",
    title: "Complete your burner profile",
    version: QUESTIONNAIRE.version,
  });
}

/** Satisfy the burner-profile gate when the profile is completed. */
export async function satisfyBurnerProfileAction(
  userId: string,
): Promise<void> {
  if (isE2ETestMode()) return;
  await dbSatisfyRequiredAction(userId, "burner_profile", QUESTIONNAIRE.version);
}

/** The user's pending blocking required actions (empty under E2E test mode). */
export async function getPendingRequiredActions(
  userId: string,
): Promise<PendingRequiredAction[]> {
  if (isE2ETestMode()) return [];
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

/**
 * Whether a user leads at least one team — the derived `team_lead` rank that
 * unlocks the control panel's team-lead layer. Routed through the test store
 * under E2E_TEST_MODE (which has no team-membership concept, so always
 * false), keeping the home page renderable without a real DB.
 */
export async function isTeamLead(userId: string): Promise<boolean> {
  const store = isE2ETestMode() ? testBackend : realBackend;
  return store.isTeamLead(userId);
}

/**
 * Apply a captain's vetting decision. Captain-gated by the caller; this just
 * persists the decision and stamps the deciding captain for the audit trail.
 */
export async function decideUserApproval(input: {
  userId: string;
  status: "approved" | "rejected";
  decidedByUserId: string;
}): Promise<void> {
  const store = isE2ETestMode() ? testBackend : realBackend;
  await store.setUserApproval(input);
}

// --- Backends -----------------------------------------------------------

interface UserBackend {
  findUserByAuthId(authUserId: string): Promise<CampUser | null>;
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
    status: "approved" | "rejected";
    decidedByUserId: string;
  }): Promise<void>;
  setUserProfileImage(userId: string, url: string | null): Promise<void>;
  setUserDisplayName(userId: string, name: string | null): Promise<void>;
  getBurnerProfile(userId: string): Promise<BurnerProfileSummary | null>;
  isTeamLead(userId: string): Promise<boolean>;
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
}

export async function upsertBurnerProfile(input: {
  userId: string;
  version: string;
  responses: Record<string, unknown>;
  markComplete: boolean;
}): Promise<void> {
  const store = isE2ETestMode() ? testBackend : realBackend;
  await store.upsertBurnerProfile(input);
}

/** Persist the member's profile photo URL (or null to clear it). */
export async function setProfileImage(
  userId: string,
  url: string | null,
): Promise<void> {
  const store = isE2ETestMode() ? testBackend : realBackend;
  await store.setUserProfileImage(userId, url);
}

/** Update the member's display name. */
export async function setDisplayName(
  userId: string,
  name: string | null,
): Promise<void> {
  const store = isE2ETestMode() ? testBackend : realBackend;
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
  const store = isE2ETestMode() ? testBackend : realBackend;
  await store.setIdDocuments(userId, id);
}

/** Read + decrypt the member's government ID number (owner/captain gated by
 * the caller). Returns null when the user has no row. */
export async function getIdDocuments(
  userId: string,
): Promise<{ idType: string | null; idNumber: string | null } | null> {
  const store = isE2ETestMode() ? testBackend : realBackend;
  return store.getIdDocuments(userId);
}

const realBackend: UserBackend = {
  async findUserByAuthId(authUserId) {
    const row = await findUserByAuthId(authUserId);
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
    await setUserApproval(input);
  },
  async setUserProfileImage(userId, url) {
    await setUserProfileImage(userId, url);
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
  async isTeamLead(userId) {
    return dbIsTeamLead(userId);
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
    testStore.setUserApproval(input);
  },
  async setUserProfileImage(userId, url) {
    testStore.setProfileImage(userId, url);
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
  // The in-memory store models no team memberships, so nobody is a lead.
  async isTeamLead() {
    return false;
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
};

function toCampUser(row: {
  id: string;
  authUserId: string;
  displayName: string | null;
  profileImageUrl?: string | null;
  inviteCode: string | null;
  rank: Rank;
  approvalStatus?: ApprovalStatus | null;
}): CampUser {
  return {
    id: row.id,
    authUserId: row.authUserId,
    displayName: row.displayName,
    profileImageUrl: row.profileImageUrl ?? null,
    inviteCode: row.inviteCode,
    rank: row.rank,
    approvalStatus: row.approvalStatus ?? "approved",
  };
}
