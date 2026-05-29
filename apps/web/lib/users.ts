import "server-only";

import { cookies } from "next/headers";
import {
  createCampUser,
  findUserByAuthId,
  getBurnerProfileByUserId,
  setUserInviteCode,
  upsertBurnerProfile as upsertBurnerProfileDb,
} from "@camp404/db/burner-profile";
import { claimInviteCode, INVITE_COOKIE, isGodEmail } from "./access-control";
import type { AuthenticatedUser } from "./auth";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

/**
 * Common camp-user shape that both the real Drizzle row and the in-memory
 * test store produce. Just enough fields for the rest of the app.
 */
export interface CampUser {
  id: string;
  authUserId: string;
  displayName: string | null;
  inviteCode: string | null;
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
    if (cookieValue) cookieStore.delete(INVITE_COOKIE);
    return existing;
  }

  // Need to redeem the cookie code (if any) before granting access. This
  // is the authoritative atomic claim — if two browsers race for the last
  // remaining use of a DB-backed code, only one wins.
  const claimedCode =
    !god && cookieValue ? await claimInviteCode(cookieValue) : null;

  if (existing) {
    if (claimedCode) {
      await store.setUserInviteCode(existing.id, claimedCode);
      cookieStore.delete(INVITE_COOKIE);
      return { ...existing, inviteCode: claimedCode };
    }
    if (cookieValue) cookieStore.delete(INVITE_COOKIE);
    return existing;
  }

  const created = await store.createUser({
    authUserId: authUser.id,
    displayName: authUser.displayName ?? authUser.primaryEmail,
    inviteCode: god ? null : claimedCode,
  });
  if (cookieValue) cookieStore.delete(INVITE_COOKIE);
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
 * Whether this user is allowed past the signup gate (god account or has
 * redeemed a valid invite code).
 */
export function hasCampAccess(
  user: { inviteCode: string | null },
  email: string | null,
): boolean {
  return isGodEmail(email) || !!user.inviteCode;
}

// --- Backends -----------------------------------------------------------

interface UserBackend {
  findUserByAuthId(authUserId: string): Promise<CampUser | null>;
  createUser(input: {
    authUserId: string;
    displayName: string | null;
    inviteCode: string | null;
  }): Promise<CampUser>;
  setUserInviteCode(userId: string, code: string): Promise<void>;
  getBurnerProfile(userId: string): Promise<BurnerProfileSummary | null>;
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
};

function toCampUser(row: {
  id: string;
  authUserId: string;
  displayName: string | null;
  inviteCode: string | null;
}): CampUser {
  return {
    id: row.id,
    authUserId: row.authUserId,
    displayName: row.displayName,
    inviteCode: row.inviteCode,
  };
}
