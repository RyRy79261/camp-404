import "server-only";

import type { CampManagementMember } from "@camp404/db/roster";
import type {
  IncomingPromotionRequest,
  QuestionnaireFieldChange,
} from "@camp404/types";

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

type TestPresentation = "acknowledge" | "popup" | "feed";

// In-memory stand-ins for the `broadcasts` and `notification_deliveries`
// tables. An announcement is a broadcast with `publishedAt === null` while a
// draft; publishing fans it out into one delivery per recipient.
interface TestBroadcast {
  id: string;
  senderId: string | null;
  title: string;
  body: string;
  presentation: TestPresentation;
  publishedAt: Date | null;
  createdAt: Date;
}

interface TestDelivery {
  id: string;
  broadcastId: string | null;
  userId: string;
  title: string;
  body: string;
  presentation: TestPresentation;
  readAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

// In-memory stand-in for `captain_promotion_requests`. Mirrors the db row +
// semantics: one open (`sent`) row per target, only a `sent` row transitions.
// Participant ids are nullable to match the real row (SET NULL on a hard delete
// for audit retention) — `sendCaptainPromotion` always writes them non-null.
interface TestPromotionRequest {
  id: string;
  targetUserId: string | null;
  requestedByUserId: string | null;
  status: "sent" | "accepted" | "declined" | "cancelled";
  createdAt: Date;
  decidedAt: Date | null;
}

interface TestStoreState {
  usersByAuthId: Map<string, TestUser>;
  profilesByUserId: Map<string, TestBurnerProfile>;
  idDocsByUserId: Map<string, { idType: string | null; idNumber: string | null }>;
  inviteCodes: Map<string, TestInviteCode>;
  questionnaireEdits: TestQuestionnaireEdit[];
  broadcasts: TestBroadcast[];
  deliveries: TestDelivery[];
  promotionRequests: TestPromotionRequest[];
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
      idDocsByUserId: new Map<
        string,
        { idType: string | null; idNumber: string | null }
      >(),
      inviteCodes: new Map<string, TestInviteCode>(),
      questionnaireEdits: [] as TestQuestionnaireEdit[],
      broadcasts: [] as TestBroadcast[],
      deliveries: [] as TestDelivery[],
      promotionRequests: [] as TestPromotionRequest[],
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
const idDocsByUserId = S.idDocsByUserId;
const inviteCodes = S.inviteCodes;
const questionnaireEdits = S.questionnaireEdits;
const broadcasts = S.broadcasts;
const deliveries = S.deliveries;
const promotionRequests = S.promotionRequests;

function findUserById(userId: string): TestUser | null {
  for (const user of usersByAuthId.values()) {
    if (user.id === userId) return user;
  }
  return null;
}

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
  // --- ID documents (raw in test mode — no crypto) ----------------------

  setIdDocuments(
    userId: string,
    id: { idType: string | null; idNumber: string | null },
  ): void {
    idDocsByUserId.set(userId, id);
  },
  getIdDocuments(
    userId: string,
  ): { idType: string | null; idNumber: string | null } | null {
    return idDocsByUserId.get(userId) ?? null;
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

  // --- Announcements & notifications ------------------------------------

  createBroadcastDraft(input: {
    senderId: string;
    title: string;
    body: string;
    presentation: TestPresentation;
  }): { id: string } {
    const row: TestBroadcast = {
      id: crypto.randomUUID(),
      senderId: input.senderId,
      title: input.title,
      body: input.body,
      presentation: input.presentation,
      publishedAt: null,
      createdAt: new Date(),
    };
    broadcasts.push(row);
    return { id: row.id };
  },
  updateBroadcastDraft(input: {
    id: string;
    senderId: string;
    title: string;
    body: string;
    presentation: TestPresentation;
  }): boolean {
    const row = broadcasts.find(
      (b) =>
        b.id === input.id &&
        b.senderId === input.senderId &&
        b.publishedAt === null,
    );
    if (!row) return false;
    row.title = input.title;
    row.body = input.body;
    row.presentation = input.presentation;
    return true;
  },
  deleteBroadcastDraft(input: { id: string; senderId: string }): boolean {
    const idx = broadcasts.findIndex(
      (b) =>
        b.id === input.id &&
        b.senderId === input.senderId &&
        b.publishedAt === null,
    );
    if (idx === -1) return false;
    broadcasts.splice(idx, 1);
    return true;
  },
  publishBroadcast(input: {
    id: string;
    senderId: string;
  }): { ok: true; recipientCount: number } | { ok: false; error: string } {
    const row = broadcasts.find(
      (b) =>
        b.id === input.id &&
        b.senderId === input.senderId &&
        b.publishedAt === null,
    );
    if (!row) {
      return {
        ok: false,
        error: "Draft not found, already published, or not yours.",
      };
    }
    row.publishedAt = new Date();
    const recipients = [...usersByAuthId.values()].filter(
      (u) => u.id !== input.senderId,
    );
    for (const u of recipients) {
      deliveries.push({
        id: crypto.randomUUID(),
        broadcastId: row.id,
        userId: u.id,
        title: row.title,
        body: row.body,
        presentation: row.presentation,
        readAt: null,
        acknowledgedAt: null,
        createdAt: new Date(),
      });
    }
    return { ok: true, recipientCount: recipients.length };
  },
  listBroadcasts(): Array<{
    id: string;
    title: string;
    body: string;
    presentation: TestPresentation;
    senderId: string | null;
    senderName: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    recipientCount: number;
    acknowledgedCount: number;
  }> {
    return [...broadcasts]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((b) => {
        const own = deliveries.filter((d) => d.broadcastId === b.id);
        return {
          id: b.id,
          title: b.title,
          body: b.body,
          presentation: b.presentation,
          senderId: b.senderId,
          senderName: b.senderId
            ? (findUserById(b.senderId)?.displayName ?? null)
            : null,
          publishedAt: b.publishedAt,
          createdAt: b.createdAt,
          recipientCount: own.length,
          acknowledgedCount: own.filter((d) => d.acknowledgedAt !== null)
            .length,
        };
      });
  },
  getPendingAcknowledgements(userId: string): Array<{
    deliveryId: string;
    title: string;
    body: string;
    senderName: string | null;
    createdAt: Date;
  }> {
    return deliveries
      .filter(
        (d) =>
          d.userId === userId &&
          d.presentation === "acknowledge" &&
          d.acknowledgedAt === null,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((d) => {
        const b = broadcasts.find((x) => x.id === d.broadcastId);
        return {
          deliveryId: d.id,
          title: d.title,
          body: d.body,
          senderName: b?.senderId
            ? (findUserById(b.senderId)?.displayName ?? null)
            : null,
          createdAt: d.createdAt,
        };
      });
  },
  acknowledgeDelivery(input: { deliveryId: string; userId: string }): boolean {
    const d = deliveries.find(
      (x) =>
        x.id === input.deliveryId &&
        x.userId === input.userId &&
        x.presentation === "acknowledge" &&
        x.acknowledgedAt === null,
    );
    if (!d) return false;
    const now = new Date();
    d.acknowledgedAt = now;
    d.readAt = now;
    return true;
  },
  listInbox(userId: string): Array<{
    id: string;
    title: string;
    body: string;
    presentation: TestPresentation;
    senderName: string | null;
    readAt: Date | null;
    acknowledgedAt: Date | null;
    createdAt: Date;
  }> {
    return deliveries
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((d) => {
        const b = broadcasts.find((x) => x.id === d.broadcastId);
        return {
          id: d.id,
          title: d.title,
          body: d.body,
          presentation: d.presentation,
          senderName: b?.senderId
            ? (findUserById(b.senderId)?.displayName ?? null)
            : null,
          readAt: d.readAt,
          acknowledgedAt: d.acknowledgedAt,
          createdAt: d.createdAt,
        };
      });
  },
  countUnread(userId: string): number {
    return deliveries.filter((d) => d.userId === userId && d.readAt === null)
      .length;
  },
  markRead(userId: string, ids: string[]): void {
    if (ids.length === 0) return;
    const now = new Date();
    const idSet = new Set(ids);
    for (const d of deliveries) {
      if (d.userId === userId && d.readAt === null && idSet.has(d.id)) {
        d.readAt = now;
      }
    }
  },

  // Camp-management roster (mirrors @camp404/db/roster.getCampManagementRoster).
  // The test store models users + burner profiles, not teams / driver profiles /
  // required-actions, so those facets default (empty / false / 0) — enough for
  // the captain roster to render in E2E without touching Neon.
  getCampManagementRoster(): CampManagementMember[] {
    return Array.from(usersByAuthId.values())
      .map((u): CampManagementMember => {
        const profile = profilesByUserId.get(u.id) ?? null;
        const country =
          profile && typeof profile.responses["country"] === "string"
            ? (profile.responses["country"] as string)
            : null;
        return {
          id: u.id,
          displayName: u.displayName,
          handle: null,
          rank: u.rank,
          approvalStatus: u.approvalStatus,
          isLead: false,
          teams: [],
          duesPaid: false,
          membershipTier: null,
          onboardingComplete: profile?.completedAt != null,
          pendingRequiredActions: 0,
          intendsToDrive: false,
          driverProfileComplete: false,
          country,
          createdAt: u.createdAt,
        };
      })
      .sort((a, b) =>
        (a.displayName ?? "").localeCompare(b.displayName ?? ""),
      );
  },

  // --- captain-promotion handshake (mirrors @camp404/db/captain-promotion) ---

  getOpenPromotionForTarget(targetUserId: string): TestPromotionRequest | null {
    return (
      promotionRequests.find(
        (r) => r.targetUserId === targetUserId && r.status === "sent",
      ) ?? null
    );
  },
  getPromotionRequestById(requestId: string): TestPromotionRequest | null {
    return promotionRequests.find((r) => r.id === requestId) ?? null;
  },
  sendCaptainPromotion(input: {
    targetUserId: string;
    requestedByUserId: string;
  }): TestPromotionRequest {
    // Idempotent via the open-per-target rule (the db's partial unique index).
    // Single-threaded test store: no concurrent-send race is possible, so the
    // pre-check suffices (the db additionally catches the unique-violation).
    const existing = this.getOpenPromotionForTarget(input.targetUserId);
    if (existing) return existing;
    const row: TestPromotionRequest = {
      id: crypto.randomUUID(),
      targetUserId: input.targetUserId,
      requestedByUserId: input.requestedByUserId,
      status: "sent",
      createdAt: new Date(),
      decidedAt: null,
    };
    promotionRequests.push(row);
    return row;
  },
  decideCaptainPromotion(input: {
    requestId: string;
    status: "accepted" | "declined" | "cancelled";
    actorUserId?: string;
  }): TestPromotionRequest | null {
    // Only a `sent` row with both participants still present flips — so a
    // double-decide (or a row orphaned by a hard delete) is a no-op (null),
    // mirroring the db's status + IS NOT NULL WHERE clause. When `actorUserId` is
    // given, also bind the actor to their side (cancel→requester, accept/decline
    // →target), mirroring the db's atomic actor predicate.
    const row = promotionRequests.find(
      (r) =>
        r.id === input.requestId &&
        r.status === "sent" &&
        r.targetUserId !== null &&
        r.requestedByUserId !== null &&
        (input.actorUserId === undefined ||
          (input.status === "cancelled"
            ? r.requestedByUserId === input.actorUserId
            : r.targetUserId === input.actorUserId)),
    );
    if (!row) return null;
    row.status = input.status;
    row.decidedAt = new Date();
    return row;
  },
  getIncomingPromotionsForUser(userId: string): IncomingPromotionRequest[] {
    return promotionRequests
      .filter(
        (r): r is TestPromotionRequest & { requestedByUserId: string } =>
          r.targetUserId === userId &&
          r.status === "sent" &&
          // Mirror the db INNER JOIN on users: a null (orphaned) requester drops
          // out of the incoming list rather than surfacing a nameless row.
          r.requestedByUserId !== null,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        requestedByUserId: r.requestedByUserId,
        requestedByName: findUserById(r.requestedByUserId)?.displayName ?? null,
        status: r.status,
        createdAt: r.createdAt,
      }));
  },

  reset(): void {
    usersByAuthId.clear();
    profilesByUserId.clear();
    idDocsByUserId.clear();
    inviteCodes.clear();
    questionnaireEdits.length = 0;
    broadcasts.length = 0;
    deliveries.length = 0;
    promotionRequests.length = 0;
    S.nextSerial = 1;
  },
};

export type {
  TestUser,
  TestBurnerProfile,
  TestInviteCode,
  TestQuestionnaireEdit,
  TestPromotionRequest,
};
