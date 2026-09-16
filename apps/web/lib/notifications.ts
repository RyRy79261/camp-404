import "server-only";

import {
  acknowledgeDelivery as dbAcknowledgeDelivery,
  claimPopups as dbClaimPopups,
  countUnseenPopups as dbCountUnseenPopups,
  countAnnouncementAudience as dbCountAnnouncementAudience,
  countUnread as dbCountUnread,
  explainDraftRefusal as dbExplainDraftRefusal,
  createAnnouncementDraft as dbCreateDraft,
  deleteAnnouncementDraft as dbDeleteDraft,
  getAnnouncementForMember as dbGetAnnouncementForMember,
  getPendingAcknowledgements as dbGetPending,
  listAnnouncements as dbListAnnouncements,
  listInbox as dbListInbox,
  markRead as dbMarkRead,
  publishAnnouncement as dbPublish,
  updateAnnouncementDraft as dbUpdateDraft,
  type AnnouncementPresentation,
  type AnnouncementReading,
  type AnnouncementSummary,
  type Audience,
  type ClaimedPopup,
  type InboxItem,
  type InboxPage,
  type PendingAcknowledgement,
  type PublishResult,
} from "@camp404/db/broadcasts";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Announcements / notifications facade. Routes every read and write through
// the Neon-backed `@camp404/db/broadcasts` queries normally, and through the
// in-memory test store under E2E_TEST_MODE — the same real-vs-test backend
// split `lib/users.ts` uses so the app renders without a database during
// Playwright runs. App code (pages, actions, route handlers) imports from
// here, never from `@camp404/db/broadcasts` directly.

export type {
  Audience,
  AnnouncementPresentation,
  AnnouncementReading,
  AnnouncementSummary,
  ClaimedPopup,
  InboxItem,
  InboxPage,
  PendingAcknowledgement,
  PublishResult,
};

interface NotificationsBackend {
  countUnread(userId: string): Promise<number>;
  listInbox(
    userId: string,
    options?: { before?: string | null; limit?: number },
  ): Promise<InboxPage>;
  markRead(userId: string, ids: string[]): Promise<void>;
  getAnnouncementForMember(
    userId: string,
    broadcastId: string,
  ): Promise<AnnouncementReading | null>;
  getPendingAcknowledgements(userId: string): Promise<PendingAcknowledgement[]>;
  countUnseenPopups(userId: string): Promise<number>;
  claimPopups(userId: string): Promise<ClaimedPopup[]>;
  acknowledgeDelivery(input: {
    deliveryId: string;
    userId: string;
  }): Promise<boolean>;
  listAnnouncements(options?: {
    senderId?: string;
  }): Promise<AnnouncementSummary[]>;
  createAnnouncementDraft(input: DraftFields): Promise<{ id: string }>;
  updateAnnouncementDraft(input: DraftFields & { id: string }): Promise<boolean>;
  deleteAnnouncementDraft(input: {
    id: string;
    senderId: string;
  }): Promise<boolean>;
  publishAnnouncement(input: PublishInput): Promise<PublishResult>;
  explainDraftRefusal(id: string, senderId: string): Promise<string>;
  countAnnouncementAudience(
    senderId: string,
    audience: Audience,
  ): Promise<number>;
}

interface DraftFields {
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  audience: Audience;
}

interface PublishInput {
  id: string;
  senderId: string;
  /** A team lead's teams; a captain passes none. */
  allowedTeams?: readonly Extract<Audience, { scope: "team" }>["team"][];
}

const realBackend: NotificationsBackend = {
  countUnread: dbCountUnread,
  listInbox: dbListInbox,
  markRead: dbMarkRead,
  getAnnouncementForMember: dbGetAnnouncementForMember,
  getPendingAcknowledgements: dbGetPending,
  countUnseenPopups: dbCountUnseenPopups,
  claimPopups: dbClaimPopups,
  acknowledgeDelivery: dbAcknowledgeDelivery,
  listAnnouncements: dbListAnnouncements,
  createAnnouncementDraft: dbCreateDraft,
  updateAnnouncementDraft: dbUpdateDraft,
  deleteAnnouncementDraft: dbDeleteDraft,
  publishAnnouncement: dbPublish,
  explainDraftRefusal: dbExplainDraftRefusal,
  countAnnouncementAudience: dbCountAnnouncementAudience,
};

const testBackend: NotificationsBackend = {
  async countUnread(userId) {
    return testStore.countUnread(userId);
  },
  async listInbox(userId, options) {
    return testStore.listInbox(userId, options);
  },
  async markRead(userId, ids) {
    testStore.markRead(userId, ids);
  },
  async getAnnouncementForMember(userId, broadcastId) {
    return testStore.getAnnouncementForMember(userId, broadcastId);
  },
  async countUnseenPopups(userId) {
    return testStore.countUnseenPopups(userId);
  },
  async claimPopups(userId) {
    return testStore.claimPopups(userId);
  },
  async getPendingAcknowledgements(userId) {
    return testStore.getPendingAcknowledgements(userId);
  },
  async acknowledgeDelivery(input) {
    return testStore.acknowledgeDelivery(input);
  },
  async listAnnouncements(options) {
    return testStore.listBroadcasts(options);
  },
  async createAnnouncementDraft(input) {
    return testStore.createBroadcastDraft(input);
  },
  async updateAnnouncementDraft(input) {
    return testStore.updateBroadcastDraft(input);
  },
  async deleteAnnouncementDraft(input) {
    return testStore.deleteBroadcastDraft(input);
  },
  async publishAnnouncement(input) {
    return testStore.publishBroadcast(input);
  },
  async explainDraftRefusal(id, senderId) {
    return testStore.explainDraftRefusal({ id, senderId });
  },
  async countAnnouncementAudience(senderId, audience) {
    return testStore.countAnnouncementAudience(senderId, audience);
  },
};

function backend(): NotificationsBackend {
  return usesTestStore() ? testBackend : realBackend;
}

export function countUnread(userId: string): Promise<number> {
  return backend().countUnread(userId);
}

export function listInbox(
  userId: string,
  options?: { before?: string | null; limit?: number },
): Promise<InboxPage> {
  return backend().listInbox(userId, options);
}

export function markRead(userId: string, ids: string[]): Promise<void> {
  return backend().markRead(userId, ids);
}

export function getPendingAcknowledgements(
  userId: string,
): Promise<PendingAcknowledgement[]> {
  return backend().getPendingAcknowledgements(userId);
}

export function acknowledgeDelivery(input: {
  deliveryId: string;
  userId: string;
}): Promise<boolean> {
  return backend().acknowledgeDelivery(input);
}

/** Announcements, newest first: all of them, or one sender's. */
export function listAnnouncements(
  options: { senderId?: string } = {},
): Promise<AnnouncementSummary[]> {
  return backend().listAnnouncements(options);
}

export function createAnnouncementDraft(
  input: DraftFields,
): Promise<{ id: string }> {
  return backend().createAnnouncementDraft(input);
}

export function updateAnnouncementDraft(
  input: DraftFields & { id: string },
): Promise<boolean> {
  return backend().updateAnnouncementDraft(input);
}

export function deleteAnnouncementDraft(input: {
  id: string;
  senderId: string;
}): Promise<boolean> {
  return backend().deleteAnnouncementDraft(input);
}

export function publishAnnouncement(
  input: PublishInput,
): Promise<PublishResult> {
  return backend().publishAnnouncement(input);
}

export function explainDraftRefusal(
  id: string,
  senderId: string,
): Promise<string> {
  return backend().explainDraftRefusal(id, senderId);
}

export function countAnnouncementAudience(
  senderId: string,
  audience: Audience,
): Promise<number> {
  return backend().countAnnouncementAudience(senderId, audience);
}

export function getAnnouncementForMember(
  userId: string,
  broadcastId: string,
): Promise<AnnouncementReading | null> {
  return backend().getAnnouncementForMember(userId, broadcastId);
}

export function countUnseenPopups(userId: string): Promise<number> {
  return backend().countUnseenPopups(userId);
}

export function claimPopups(userId: string): Promise<ClaimedPopup[]> {
  return backend().claimPopups(userId);
}
