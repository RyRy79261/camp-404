import "server-only";

import {
  acknowledgeDelivery as dbAcknowledgeDelivery,
  countUnread as dbCountUnread,
  createAnnouncementDraft as dbCreateDraft,
  deleteAnnouncementDraft as dbDeleteDraft,
  getPendingAcknowledgements as dbGetPending,
  listAnnouncements as dbListAnnouncements,
  listInbox as dbListInbox,
  markAllRead as dbMarkAllRead,
  publishAnnouncement as dbPublish,
  updateAnnouncementDraft as dbUpdateDraft,
  type AnnouncementPresentation,
  type AnnouncementSummary,
  type InboxItem,
  type PendingAcknowledgement,
  type PublishResult,
} from "@camp404/db/broadcasts";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

// Announcements / notifications facade. Routes every read and write through
// the Neon-backed `@camp404/db/broadcasts` queries normally, and through the
// in-memory test store under E2E_TEST_MODE — the same real-vs-test backend
// split `lib/users.ts` uses so the app renders without a database during
// Playwright runs. App code (pages, actions, route handlers) imports from
// here, never from `@camp404/db/broadcasts` directly.

export type {
  AnnouncementPresentation,
  AnnouncementSummary,
  InboxItem,
  PendingAcknowledgement,
  PublishResult,
};

interface NotificationsBackend {
  countUnread(userId: string): Promise<number>;
  listInbox(userId: string): Promise<InboxItem[]>;
  markAllRead(userId: string): Promise<void>;
  getPendingAcknowledgements(userId: string): Promise<PendingAcknowledgement[]>;
  acknowledgeDelivery(input: {
    deliveryId: string;
    userId: string;
  }): Promise<boolean>;
  listAnnouncements(): Promise<AnnouncementSummary[]>;
  createAnnouncementDraft(input: {
    senderId: string;
    title: string;
    body: string;
    presentation: AnnouncementPresentation;
  }): Promise<{ id: string }>;
  updateAnnouncementDraft(input: {
    id: string;
    senderId: string;
    title: string;
    body: string;
    presentation: AnnouncementPresentation;
  }): Promise<boolean>;
  deleteAnnouncementDraft(input: {
    id: string;
    senderId: string;
  }): Promise<boolean>;
  publishAnnouncement(input: {
    id: string;
    senderId: string;
  }): Promise<PublishResult>;
}

const realBackend: NotificationsBackend = {
  countUnread: dbCountUnread,
  listInbox: dbListInbox,
  markAllRead: dbMarkAllRead,
  getPendingAcknowledgements: dbGetPending,
  acknowledgeDelivery: dbAcknowledgeDelivery,
  listAnnouncements: dbListAnnouncements,
  createAnnouncementDraft: dbCreateDraft,
  updateAnnouncementDraft: dbUpdateDraft,
  deleteAnnouncementDraft: dbDeleteDraft,
  publishAnnouncement: dbPublish,
};

const testBackend: NotificationsBackend = {
  async countUnread(userId) {
    return testStore.countUnread(userId);
  },
  async listInbox(userId) {
    return testStore.listInbox(userId);
  },
  async markAllRead(userId) {
    testStore.markAllRead(userId);
  },
  async getPendingAcknowledgements(userId) {
    return testStore.getPendingAcknowledgements(userId);
  },
  async acknowledgeDelivery(input) {
    return testStore.acknowledgeDelivery(input);
  },
  async listAnnouncements() {
    return testStore.listBroadcasts();
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
};

function backend(): NotificationsBackend {
  return isE2ETestMode() ? testBackend : realBackend;
}

export function countUnread(userId: string): Promise<number> {
  return backend().countUnread(userId);
}

export function listInbox(userId: string): Promise<InboxItem[]> {
  return backend().listInbox(userId);
}

export function markAllRead(userId: string): Promise<void> {
  return backend().markAllRead(userId);
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

export function listAnnouncements(): Promise<AnnouncementSummary[]> {
  return backend().listAnnouncements();
}

export function createAnnouncementDraft(input: {
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
}): Promise<{ id: string }> {
  return backend().createAnnouncementDraft(input);
}

export function updateAnnouncementDraft(input: {
  id: string;
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
}): Promise<boolean> {
  return backend().updateAnnouncementDraft(input);
}

export function deleteAnnouncementDraft(input: {
  id: string;
  senderId: string;
}): Promise<boolean> {
  return backend().deleteAnnouncementDraft(input);
}

export function publishAnnouncement(input: {
  id: string;
  senderId: string;
}): Promise<PublishResult> {
  return backend().publishAnnouncement(input);
}
