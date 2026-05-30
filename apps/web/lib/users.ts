import "server-only";

import { cookies } from "next/headers";
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
} from "@camp404/db/burner-profile";
import { isTeamLead as dbIsTeamLead } from "@camp404/db/roster";
import { claimInviteCode, INVITE_COOKIE, isGodEmail } from "./access-control";
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
 * Delete a cookie best-effort. `ensureCampUser` runs from both Server
 * Components (a page render, where Next 16 forbids cookie mutation and
 * throws) and Server Actions / route handlers (where it's allowed). During
 * render we can't clear the invite cookie, so we swallow that specific error
 * and let the cookie lapse on its own short `maxAge`. The claim has already
 * been persisted to the user row by that point, and the has-access branch
 * never re-claims, so a briefly-lingering cookie is harmless.
 */
function safeDeleteCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  name: string,
): void {
  try {
    cookieStore.delete(name);
  } catch {
    // Render context — cookies are read-only here; it expires via maxAge.
  }
}

/**
 * Ensure a row exists for the given authenticated user (Neon Auth or test).
 * Lazy-upserts on first hit and persists a valid invite cookie onto the
 * row. Routes through the test store when E2E_TEST_MODE=1.
 */
export async function ensureCampUser(
  authUser: AuthenticatedUser,
): Promise<CampUser> {
  const god = isGodEmail(authUser.primaryEmail);
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(INVITE_COOKIE)?.value ?? null;

  const store = isE2ETestMode() ? testBackend : realBackend;
  const existing = await store.findUserByAuthId(authUser.id);

  // Already has access (god or a code on file) — nothing to do with the
  // cookie except clear it.
  if (existing && (god || existing.inviteCode)) {
    if (cookieValue) safeDeleteCookie(cookieStore, INVITE_COOKIE);
    return existing;
  }

  // Need to redeem the cookie code (if any) before granting access. This
  // is the authoritative atomic claim — if two browsers race for the last
  // remaining use of a DB-backed code, only one wins. The claim returns
  // any `assignedRank` stamped on the code (e.g. captain-tier invites).
  const claimed =
    !god && cookieValue ? await claimInviteCode(cookieValue) : null;

  if (existing) {
    if (claimed) {
      await store.setUserInviteCode(existing.id, claimed.code);
      if (claimed.assignedRank && claimed.assignedRank !== existing.rank) {
        await store.setUserRank(existing.id, claimed.assignedRank);
      }
      // A code that requires vetting drops the redeemer into the captain
      // approval queue. Only ever tightens access — never auto-approve here.
      const approvalStatus: ApprovalStatus = claimed.requiresApproval
        ? "pending"
        : existing.approvalStatus;
      if (approvalStatus !== existing.approvalStatus) {
        await store.setUserApprovalStatus(existing.id, approvalStatus);
      }
      safeDeleteCookie(cookieStore, INVITE_COOKIE);
      return {
        ...existing,
        inviteCode: claimed.code,
        rank: claimed.assignedRank ?? existing.rank,
        approvalStatus,
      };
    }
    if (cookieValue) safeDeleteCookie(cookieStore, INVITE_COOKIE);
    return existing;
  }

  // New account. God accounts and pre-approved invites land `approved`;
  // a vetting-required code creates the account `pending` (blocked after
  // onboarding until a captain decides).
  const approvalStatus: ApprovalStatus =
    !god && claimed?.requiresApproval ? "pending" : "approved";
  const created = await store.createUser({
    authUserId: authUser.id,
    displayName: authUser.displayName ?? authUser.primaryEmail,
    inviteCode: god ? null : claimed?.code ?? null,
    rank: claimed?.assignedRank ?? "member",
    approvalStatus,
  });
  if (cookieValue) safeDeleteCookie(cookieStore, INVITE_COOKIE);
  return created;
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
export function hasCampAccess(
  user: { inviteCode: string | null },
  email: string | null,
): boolean {
  return isGodEmail(email) || !!user.inviteCode;
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
  return isGodEmail(email) || user.approvalStatus === "approved";
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
