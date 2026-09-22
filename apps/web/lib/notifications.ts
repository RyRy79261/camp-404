import "server-only";

import {
  acknowledgeDelivery as dbAcknowledgeDelivery,
  claimPopups as dbClaimPopups,
  countUnseenPopups as dbCountUnseenPopups,
  countAnnouncementAudience as dbCountAnnouncementAudience,
  countUnread as dbCountUnread,
  explainDraftRefusal as dbExplainDraftRefusal,
  createAnnouncementDraft as dbCreateDraft,
  getAnnouncementPinContext as dbGetPinContext,
  listPinnedForUser as dbListPinnedForUser,
  setAnnouncementPinned as dbSetPinned,
  deleteAnnouncementDraft as dbDeleteDraft,
  getAnnouncementForMember as dbGetAnnouncementForMember,
  getPendingAcknowledgements as dbGetPending,
  listAnnouncements as dbListAnnouncements,
  listInbox as dbListInbox,
  markAllRead as dbMarkAllRead,
  markRead as dbMarkRead,
  publishAnnouncement as dbPublish,
  unreadClearableCount as dbUnreadClearableCount,
  updateAnnouncementDraft as dbUpdateDraft,
  type AnnouncementPresentation,
  type AnnouncementReading,
  type AnnouncementSummary,
  type Audience,
  type ClaimedPopup,
  type InboxItem,
  type AnnouncementPinContext,
  type InboxPage,
  type PendingAcknowledgement,
  type PinnedAnnouncement,
  type PinResult,
  type PublishResult,
} from "@camp404/db/broadcasts";
import type { InboxFilter } from "@camp404/types";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Announcements / notifications facade. Routes every read and write through
// the Neon-backed `@camp404/db/broadcasts` queries normally, and through the
// in-memory test store under E2E_TEST_MODE — the same real-vs-test backend
// split `lib/users.ts` uses so the app renders without a database during
// Playwright runs. App code (pages, actions, route handlers) imports from
// here, never from `@camp404/db/broadcasts` directly.

export type { InboxFilter };

export type {
  Audience,
  AnnouncementPinContext,
  AnnouncementPresentation,
  AnnouncementReading,
  AnnouncementSummary,
  PinnedAnnouncement,
  PinResult,
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
    options?: { before?: string | null; limit?: number; filter?: InboxFilter },
  ): Promise<InboxPage>;
  markRead(userId: string, ids: string[]): Promise<void>;
  markAllRead(userId: string): Promise<number>;
  unreadClearableCount(userId: string): Promise<number>;
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
  updateAnnouncementDraft(
    input: DraftFields & { id: string },
  ): Promise<boolean>;
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
  listPinnedForUser(userId: string): Promise<PinnedAnnouncement[]>;
  getAnnouncementPinContext(id: string): Promise<AnnouncementPinContext | null>;
  setAnnouncementPinned(input: PinInput): Promise<PinResult>;
}

interface DraftFields {
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  audience: Audience;
  /** The composer's "keep it at the top"; inert until the draft is published. */
  pinned: boolean;
}

interface PublishInput {
  id: string;
  senderId: string;
  /** A team lead's teams; a captain passes none. */
  allowedTeams?: readonly Extract<Audience, { scope: "team" }>["team"][];
}

interface PinInput {
  id: string;
  actorId: string;
  pinned: boolean;
  /** A team lead's teams; a captain passes none. */
  allowedTeams?: readonly Extract<Audience, { scope: "team" }>["team"][];
}

const realBackend: NotificationsBackend = {
  countUnread: dbCountUnread,
  listInbox: dbListInbox,
  markRead: dbMarkRead,
  markAllRead: dbMarkAllRead,
  unreadClearableCount: dbUnreadClearableCount,
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
  listPinnedForUser: (userId) => dbListPinnedForUser(userId),
  getAnnouncementPinContext: dbGetPinContext,
  setAnnouncementPinned: dbSetPinned,
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
  async markAllRead(userId) {
    return testStore.markAllRead(userId);
  },
  async unreadClearableCount(userId) {
    return testStore.unreadClearableCount(userId);
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
  async listPinnedForUser(userId) {
    return testStore.listPinnedForUser(userId);
  },
  async getAnnouncementPinContext(id) {
    return testStore.getAnnouncementPinContext(id);
  },
  async setAnnouncementPinned(input) {
    return testStore.setBroadcastPinned(input);
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
  options?: { before?: string | null; limit?: number; filter?: InboxFilter },
): Promise<InboxPage> {
  return backend().listInbox(userId, options);
}

export function markRead(userId: string, ids: string[]): Promise<void> {
  return backend().markRead(userId, ids);
}

/**
 * Clear every unread delivery in this member's inbox, and say how many that
 * was. The panel's "Mark all read" — the one way to clear the badge without
 * opening the inbox.
 */
export function markAllRead(userId: string): Promise<number> {
  return backend().markAllRead(userId);
}

/**
 * How many deliveries "Mark all read" would actually clear — the badge's count
 * minus the pop-ups it leaves for the pop-up poller to show.
 */
export function unreadClearableCount(userId: string): Promise<number> {
  return backend().unreadClearableCount(userId);
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

/**
 * The pinned announcements this member received, newest first — what the
 * console banner draws. The audience is the delivery join, never a fresh
 * resolution, so nothing here can widen who sees a pin.
 */
export function listPinnedForUser(
  userId: string,
): Promise<PinnedAnnouncement[]> {
  return backend().listPinnedForUser(userId);
}

/**
 * One announcement's stored audience, so the pin action can ask
 * `canSendToAudience` about it before it writes.
 */
export function getAnnouncementPinContext(
  id: string,
): Promise<AnnouncementPinContext | null> {
  return backend().getAnnouncementPinContext(id);
}

/** Pin or unpin a published announcement. Gate the caller. */
export function setAnnouncementPinned(input: PinInput): Promise<PinResult> {
  return backend().setAnnouncementPinned(input);
}

export function claimPopups(userId: string): Promise<ClaimedPopup[]> {
  return backend().claimPopups(userId);
}
