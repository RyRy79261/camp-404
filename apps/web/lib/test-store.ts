import "server-only";

import type { QuestionnaireFieldChange } from "@camp404/types";

// Process-scoped in-memory replacement for the Neon-backed user and
// burner-profile tables. Only used when isE2ETestMode() is true.
// Reset between tests via DELETE /api/test/reset.

type TestRank = "captain" | "member";
type TestApprovalStatus = "pending" | "approved" | "rejected";

interface TestUser {
  id: string;
  authUserId: string;
  displayName: string | null;
  profileImageUrl: string | null;
  inviteCode: string | null;
  rank: TestRank;
  approvalStatus: TestApprovalStatus;
  approvalDecidedByUserId: string | null;
  approvalDecidedAt: Date | null;
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

interface TestQuestionnaireEdit {
  id: string;
  userId: string;
  questionnaireKey: string;
  version: string;
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
  createdAt: Date;
}

interface TestInviteCode {
  code: string;
  createdByUserId: string | null;
  note: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  assignedRank: TestRank | null;
  invitedEmail: string | null;
  requiresApproval: boolean;
  createdAt: Date;
}

interface TestStoreState {
  usersByAuthId: Map<string, TestUser>;
  profilesByUserId: Map<string, TestBurnerProfile>;
  inviteCodes: Map<string, TestInviteCode>;
  questionnaireEdits: TestQuestionnaireEdit[];
  nextSerial: number;
}

// Next.js gives RSC renders and route handlers SEPARATE module graphs in the
// same process (pronounced under Turbopack dev), so a plain module-level
// singleton would be DUPLICATED — and the two halves of an e2e spec (a page
// render that creates a user vs. an /api/test/* route that reads it) wouldn't
// see each other's writes. Hanging the state off globalThis — the one true
// per-process singleton — keeps every module-graph copy pointed at the same
// store. Same trick as the common "Prisma client on globalThis in dev"
// pattern. (Only ever loaded under E2E_TEST_MODE; production never imports
// this module.)
const GLOBAL_KEY = "__camp404TestStore__";

function globalState(): TestStoreState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      usersByAuthId: new Map<string, TestUser>(),
      profilesByUserId: new Map<string, TestBurnerProfile>(),
      inviteCodes: new Map<string, TestInviteCode>(),
      questionnaireEdits: [] as TestQuestionnaireEdit[],
      nextSerial: 1,
    } satisfies TestStoreState;
  }
  return g[GLOBAL_KEY] as TestStoreState;
}

const S = globalState();
// Map/array bindings are stable references shared across module graphs;
// `nextSerial` is a primitive so it must be read/written through `S`.
const usersByAuthId = S.usersByAuthId;
const profilesByUserId = S.profilesByUserId;
const inviteCodes = S.inviteCodes;
const questionnaireEdits = S.questionnaireEdits;

function nextId(): string {
  return `test-user-${S.nextSerial++}`;
}

export const testStore = {
  findUserByAuthId(authUserId: string): TestUser | null {
    return usersByAuthId.get(authUserId) ?? null;
  },
  createUser(input: {
    authUserId: string;
    displayName: string | null;
    inviteCode: string | null;
    rank?: TestRank;
    approvalStatus?: TestApprovalStatus;
  }): TestUser {
    const now = new Date();
    const user: TestUser = {
      id: nextId(),
      authUserId: input.authUserId,
      displayName: input.displayName,
      profileImageUrl: null,
      inviteCode: input.inviteCode,
      rank: input.rank ?? "member",
      approvalStatus: input.approvalStatus ?? "approved",
      approvalDecidedByUserId: null,
      approvalDecidedAt: null,
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
  setUserRank(userId: string, rank: TestRank): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.rank = rank;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setUserApprovalStatus(userId: string, status: TestApprovalStatus): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.approvalStatus = status;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setUserApproval(input: {
    userId: string;
    status: "approved" | "rejected";
    decidedByUserId: string;
  }): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === input.userId) {
        user.approvalStatus = input.status;
        user.approvalDecidedByUserId = input.decidedByUserId;
        user.approvalDecidedAt = new Date();
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setProfileImage(userId: string, url: string | null): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.profileImageUrl = url;
        user.updatedAt = new Date();
        return;
      }
    }
  },
  setDisplayName(userId: string, name: string | null): void {
    for (const user of usersByAuthId.values()) {
      if (user.id === userId) {
        user.displayName = name;
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
  // --- Questionnaire edit log -------------------------------------------

  recordQuestionnaireEdit(input: {
    userId: string;
    questionnaireKey: string;
    version: string;
    editedByUserId: string | null;
    changes: QuestionnaireFieldChange[];
  }): void {
    questionnaireEdits.push({
      id: `test-edit-${S.nextSerial++}`,
      userId: input.userId,
      questionnaireKey: input.questionnaireKey,
      version: input.version,
      editedByUserId: input.editedByUserId,
      changes: input.changes,
      createdAt: new Date(),
    });
  },
  listQuestionnaireEdits(
    userId: string,
    questionnaireKey: string,
    limit = 20,
  ): TestQuestionnaireEdit[] {
    return questionnaireEdits
      .filter(
        (e) => e.userId === userId && e.questionnaireKey === questionnaireKey,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  },

  // --- Invite codes -----------------------------------------------------

  seedInviteCode(input: {
    code: string;
    createdByUserId?: string | null;
    note?: string | null;
    maxUses?: number | null;
    expiresAt?: Date | null;
    assignedRank?: TestRank | null;
    invitedEmail?: string | null;
    requiresApproval?: boolean;
  }): TestInviteCode {
    const row: TestInviteCode = {
      code: input.code,
      createdByUserId: input.createdByUserId ?? null,
      note: input.note ?? null,
      maxUses: input.maxUses ?? null,
      useCount: 0,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      assignedRank: input.assignedRank ?? null,
      invitedEmail: input.invitedEmail ?? null,
      requiresApproval: input.requiresApproval ?? false,
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
    questionnaireEdits.length = 0;
    S.nextSerial = 1;
  },
};

export type {
  TestUser,
  TestBurnerProfile,
  TestInviteCode,
  TestQuestionnaireEdit,
};
