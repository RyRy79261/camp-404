import "server-only";

import type { CampManagementMember } from "@camp404/db/roster";
import {
  currentCycle,
  DEFAULT_CAMP_CONFIG,
  resolveCycles,
  UNSET_CYCLE,
  type TeamsConfig,
} from "@camp404/db/camp-config";
// Type-only: the store's three team operations return the SAME shapes the
// production writers do, so a divergence is a typecheck failure rather than a
// green e2e run over a broken app.
import type {
  SetLeadResult,
  TeamMembership,
} from "@camp404/db/team-memberships";
import type {
  IncomingPromotionRequest,
  QuestionnaireFieldChange,
  Team,
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

// In-memory stand-in for `team_memberships`. Year-scoped exactly like the real
// table: (userId, team, cycle) is the identity, and every read filters on the
// camp's current cycle. See the team-membership section below for the semantics
// this mirrors.
interface TestTeamMembership {
  userId: string;
  team: Team;
  isLead: boolean;
  cycle: number;
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
  teamMemberships: TestTeamMembership[];
  nextSerial: number;
  // The camp team config (Phase 2). Reassigned wholesale on every edit, so —
  // like `nextSerial` — it lives on `S`, not a stable binding. Seeded with a
  // deep clone of DEFAULT_CAMP_CONFIG so edits never mutate the shared const.
  teamsConfig: TeamsConfig;
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
      teamMemberships: [] as TestTeamMembership[],
      nextSerial: 1,
      teamsConfig: structuredClone(DEFAULT_CAMP_CONFIG),
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
const teamMemberships = S.teamMemberships;

/**
 * The camp's current year, resolved the way `currentCycleNumber()` resolves it
 * in production: from the camp config, falling back to the `UNSET_CYCLE`
 * sentinel on a camp that has not named its founding year yet.
 *
 * DEFAULT_CAMP_CONFIG carries no `cycles`, so a fresh store sits on the
 * sentinel — the same value migration 0019 stamped on every pre-namespace row —
 * and every membership written there is consistently readable. A test that
 * names a founding year through `setTeamsConfig` gets real year-scoping,
 * including last year's rows going quiet.
 *
 * KNOWN BOUNDARY: production's `setFoundingYear` also sweeps rows carrying the
 * sentinel onto the founding year. Nothing mirrors that here because the
 * founding-year write path (@camp404/db/cycle-rollover) is not routed through
 * this store — so seed the year BEFORE the memberships, the way the PGlite
 * suite's `foundedAt` helper does.
 */
function currentCycleNumber(): number {
  return (
    currentCycle(resolveCycles(globalState().teamsConfig))?.year ?? UNSET_CYCLE
  );
}

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
  /** The camp team config (Phase 2). Backs the E2E-mode camp-config facade. */
  getTeamsConfig(): TeamsConfig {
    return globalState().teamsConfig;
  },
  /** Persist a (whole) new team config — the facade passes the transformed value. */
  setTeamsConfig(config: TeamsConfig): void {
    globalState().teamsConfig = config;
  },
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
  }): boolean {
    // Mirrors the db's compare-and-set: only a `pending` row flips, so a second
    // captain deciding the same applicant is a no-op (false) rather than a
    // silent overwrite — same shape as decideCaptainPromotion below.
    for (const user of usersByAuthId.values()) {
      if (user.id === input.userId) {
        if (user.approvalStatus !== "pending") return false;
        user.approvalStatus = input.status;
        user.approvalDecidedByUserId = input.decidedByUserId;
        user.approvalDecidedAt = new Date();
        user.updatedAt = new Date();
        return true;
      }
    }
    return false;
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

  // --- Team memberships (mirrors @camp404/db/team-memberships) -------------
  // The three production operations, with production's semantics — not an
  // approximation. Until this existed the store hardcoded `isLead: false,
  // teams: []` and answered `isTeamLead` false for everyone, so the Playwright
  // `team_lead` persona had nothing to stand on: the harness documented a tier
  // it could not produce, which is how a stranded tier went unnoticed for so
  // long. A store that DISAGREES with the real backend would be worse still —
  // it makes e2e green while production is broken — so each operation below is
  // mirrored case for case from packages/db/src/team-memberships.ts (and
  // asserted against the real rules in lib/__tests__/test-store-teams.test.ts):
  //
  //   • year-scoped — every read and write resolves the store's OWN current
  //     cycle, and nothing takes a cycle from its caller;
  //   • `assignTeam` is idempotent and NEVER touches an existing row's lead
  //     flag, so a re-assignment cannot silently demote a lead;
  //   • `removeTeam` is idempotent and deletes only THIS year's row — last
  //     year's membership and lead flag stay on file forever;
  //   • `setLead` REFUSES a non-member (`not_a_member`) instead of creating the
  //     membership, and reports `changed: false` for a no-op.

  /** The year every team write is stamped with — exposed so specs can assert it. */
  currentCycleNumber(): number {
    return currentCycleNumber();
  },

  /** This year's memberships for one member, team-ordered (mirrors getTeamMemberships). */
  getTeamMemberships(userId: string): TeamMembership[] {
    const cycle = currentCycleNumber();
    return teamMemberships
      .filter((m) => m.userId === userId && m.cycle === cycle)
      .map((m) => ({ team: m.team, isLead: m.isLead, cycle: m.cycle }))
      .sort((a, b) => a.team.localeCompare(b.team));
  },

  /** Put a member on a team for THIS year. Idempotent; never sets the lead flag. */
  assignTeam(input: {
    userId: string;
    team: Team;
  }): { created: boolean; cycle: number } {
    const cycle = currentCycleNumber();
    // Mirrors the row's foreign key to `users`: a membership for a member who
    // does not exist is a failed write in production, not a silent success.
    if (!findUserById(input.userId)) {
      throw new Error(`No test user with id ${input.userId}`);
    }
    const existing = teamMemberships.find(
      (m) =>
        m.userId === input.userId &&
        m.team === input.team &&
        m.cycle === cycle,
    );
    if (existing) return { created: false, cycle };
    teamMemberships.push({
      userId: input.userId,
      team: input.team,
      isLead: false,
      cycle,
    });
    return { created: true, cycle };
  },

  /** Take a member off a team for THIS year. Idempotent; prior years survive. */
  removeTeam(input: {
    userId: string;
    team: Team;
  }): { removed: boolean; cycle: number } {
    const cycle = currentCycleNumber();
    const idx = teamMemberships.findIndex(
      (m) =>
        m.userId === input.userId &&
        m.team === input.team &&
        m.cycle === cycle,
    );
    if (idx === -1) return { removed: false, cycle };
    teamMemberships.splice(idx, 1);
    return { removed: true, cycle };
  },

  /** Set/clear the lead flag on a membership that already exists THIS year. */
  setLead(input: {
    userId: string;
    team: Team;
    isLead: boolean;
  }): SetLeadResult {
    const cycle = currentCycleNumber();
    const existing = teamMemberships.find(
      (m) =>
        m.userId === input.userId &&
        m.team === input.team &&
        m.cycle === cycle,
    );
    // Leading a team is a modifier on a membership, not a membership of its
    // own: a wrong id must not mint `team_lead` clearance through this control.
    if (!existing) return { ok: false, reason: "not_a_member" };
    if (existing.isLead === input.isLead) return { ok: true, changed: false };
    existing.isLead = input.isLead;
    return { ok: true, changed: true };
  },

  /**
   * Seed a membership in an ARBITRARY year — the mirror of the PGlite suite's
   * `makeMembership` factory, not a production path. Specs use it to put a
   * member on last year's team and prove this year's reads ignore it.
   */
  seedTeamMembership(input: {
    userId: string;
    team: Team;
    isLead?: boolean;
    cycle?: number;
  }): TestTeamMembership {
    if (!findUserById(input.userId)) {
      throw new Error(`No test user with id ${input.userId}`);
    }
    const row: TestTeamMembership = {
      userId: input.userId,
      team: input.team,
      isLead: input.isLead ?? false,
      cycle: input.cycle ?? currentCycleNumber(),
    };
    const idx = teamMemberships.findIndex(
      (m) =>
        m.userId === row.userId &&
        m.team === row.team &&
        m.cycle === row.cycle,
    );
    // (user_id, team, cycle) is the primary key: seeding the same triple twice
    // replaces the row rather than duplicating it.
    if (idx === -1) teamMemberships.push(row);
    else teamMemberships[idx] = row;
    return row;
  },

  /**
   * Whether this member leads ANY team this year — the derived, GLOBAL
   * `team_lead` clearance (owner-ratified: "it's a sitewide global role").
   * Mirrors @camp404/db/roster.isTeamLead.
   */
  isTeamLead(userId: string): boolean {
    const cycle = currentCycleNumber();
    return teamMemberships.some(
      (m) => m.userId === userId && m.isLead && m.cycle === cycle,
    );
  },

  /**
   * The teams this member leads this year, team-ordered. Clearance is global;
   * THIS is the per-team fact, and it governs audience only — it is what
   * `canSendToAudience` reads to decide which team a lead may send to.
   */
  getLeadTeams(userId: string): Team[] {
    return this.getTeamMemberships(userId)
      .filter((m) => m.isLead)
      .map((m) => m.team);
  },

  // Camp-management roster (mirrors @camp404/db/roster.getCampManagementRoster).
  // The test store models users, burner profiles and team memberships, but not
  // driver profiles / required-actions, so those facets still default (false /
  // 0) — enough for the captain roster to render in E2E without touching Neon.
  // `isLead` and `teams` come from the membership rows and are year-scoped, the
  // same two facts the real query aggregates out of `team_memberships`.
  getCampManagementRoster(): CampManagementMember[] {
    const cycle = currentCycleNumber();
    const thisYear = teamMemberships.filter((m) => m.cycle === cycle);
    return Array.from(usersByAuthId.values())
      .map((u): CampManagementMember => {
        const mine = thisYear.filter((m) => m.userId === u.id);
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
          isLead: mine.some((m) => m.isLead),
          teams: mine.map((m) => m.team).sort((a, b) => a.localeCompare(b)),
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
    teamMemberships.length = 0;
    S.nextSerial = 1;
    S.teamsConfig = structuredClone(DEFAULT_CAMP_CONFIG);
  },
};

export type {
  TestUser,
  TestBurnerProfile,
  TestInviteCode,
  TestQuestionnaireEdit,
  TestPromotionRequest,
  TestTeamMembership,
};
