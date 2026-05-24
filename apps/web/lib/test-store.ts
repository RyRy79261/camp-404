import "server-only";

// Process-scoped in-memory replacement for the Neon-backed user and
// burner-profile tables. Only used when isE2ETestMode() is true.
// Reset between tests via DELETE /api/test/reset.

interface TestUser {
  id: string;
  authUserId: string;
  displayName: string | null;
  inviteCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TestBurnerProfile {
  userId: string;
  version: string;
  responses: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

interface TestInviteCode {
  code: string;
  createdByUserId: string | null;
  note: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

let nextSerial = 1;
const usersByAuthId = new Map<string, TestUser>();
const profilesByUserId = new Map<string, TestBurnerProfile>();
const inviteCodes = new Map<string, TestInviteCode>();

function nextId(): string {
  return `test-user-${nextSerial++}`;
}

export const testStore = {
  findUserByAuthId(authUserId: string): TestUser | null {
    return usersByAuthId.get(authUserId) ?? null;
  },
  createUser(input: {
    authUserId: string;
    displayName: string | null;
    inviteCode: string | null;
  }): TestUser {
    const now = new Date();
    const user: TestUser = {
      id: nextId(),
      authUserId: input.authUserId,
      displayName: input.displayName,
      inviteCode: input.inviteCode,
      createdAt: now,
      updatedAt: now,
    };
    usersByAuthId.set(input.authUserId, user);
    return user;
  },
  setUserInviteCode(userId: string, code: string): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.inviteCode = code;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  getProfile(userId: string): TestBurnerProfile | null {
    return profilesByUserId.get(userId) ?? null;
  },
  upsertProfile(input: {
    userId: string;
    version: string;
    responses: Record<string, unknown>;
    markComplete: boolean;
  }): void {
    const now = new Date();
    const existing = profilesByUserId.get(input.userId);
    if (existing) {
      existing.version = input.version;
      existing.responses = input.responses;
      existing.updatedAt = now;
      if (input.markComplete) existing.completedAt = now;
      return;
    }
    profilesByUserId.set(input.userId, {
      userId: input.userId,
      version: input.version,
      responses: input.responses,
      startedAt: now,
      completedAt: input.markComplete ? now : null,
      updatedAt: now,
    });
  },
  // --- Invite codes -----------------------------------------------------

  seedInviteCode(input: {
    code: string;
    createdByUserId?: string | null;
    note?: string | null;
    maxUses?: number | null;
    expiresAt?: Date | null;
  }): TestInviteCode {
    const row: TestInviteCode = {
      code: input.code,
      createdByUserId: input.createdByUserId ?? null,
      note: input.note ?? null,
      maxUses: input.maxUses ?? null,
      useCount: 0,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      createdAt: new Date(),
    };
    inviteCodes.set(input.code, row);
    return row;
  },
  findUsableInviteCode(code: string): TestInviteCode | null {
    const row = inviteCodes.get(code);
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt <= new Date()) return null;
    if (row.maxUses !== null && row.useCount >= row.maxUses) return null;
    return row;
  },
  consumeInviteCode(code: string): TestInviteCode | null {
    const row = this.findUsableInviteCode(code);
    if (!row) return null;
    row.useCount += 1;
    return row;
  },

  reset(): void {
    usersByAuthId.clear();
    profilesByUserId.clear();
    inviteCodes.clear();
    nextSerial = 1;
  },
};

export type { TestUser, TestBurnerProfile, TestInviteCode };
