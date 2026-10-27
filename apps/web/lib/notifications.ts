import "server-only";

import * as db from "@camp404/db/broadcasts";
import type {
  AnnouncementPerson,
  AnnouncementPickerData,
  AnnouncementPresentation,
  AnnouncementReading,
  AnnouncementSummary,
  Audience,
  ClaimedPopup,
  InboxItem,
  AnnouncementPinContext,
  InboxPage,
  InboxSentTo,
  PendingAcknowledgement,
  PinnedAnnouncement,
  PinResult,
  PublishResult,
} from "@camp404/db/broadcasts";
import type { InboxFilter } from "@camp404/types";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Announcements / notifications facade. Routes every read and write through
// the Neon-backed `@camp404/db/broadcasts` queries normally, and through the
// in-memory test store under E2E_TEST_MODE — the same real-vs-test backend
// split `lib/users.ts` uses so the app renders without a database during
// Playwright runs, picked once (twin). App code (pages, actions, route
// handlers) imports from here, never from `@camp404/db/broadcasts` directly.
// lib/__tests__/notifications-agreement.test.ts and
// app/(console)/__tests__/inbox-count-agreement.test.tsx hold the two sides
// equal.

export type { InboxFilter };

export type {
  AnnouncementPerson,
  AnnouncementPickerData,
  InboxSentTo,
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

/** See countUnread in @camp404/db/broadcasts. */
export interface CountUnreadOptions {
  /** Waiting questionnaire sends whose own notice must not count again. */
  exceptActivationIds?: readonly string[];
}

interface DraftFields {
  senderId: string;
  title: string;
  body: string;
  presentation: AnnouncementPresentation;
  audience: Audience;
  /** The composer's "keep it at the top"; inert until the draft is published. */
  pinned: boolean;
  /** The composer's "Also post in Telegram"; a captain's draft to everyone. */
  telegram?: boolean;
}

// Neither input carries the sender's rank or teams: the write reads them
// itself, inside its own transaction, so a snapshot taken earlier cannot
// authorise it.
interface PublishInput {
  id: string;
  senderId: string;
}

interface PinInput {
  id: string;
  actorId: string;
  pinned: boolean;
}

// The store names some of these its own way; it also has no questionnaire
// notices, so its split count is the plain count with nothing split out.
const storeNotifications = {
  countUnread: (userId: string, options?: CountUnreadOptions) =>
    testStore.countUnread(userId, options),
  countUnreadByTeam: (userId: string) => testStore.countUnreadByTeam(userId),
  countUnreadSplit: (userId: string) => ({
    total: testStore.countUnread(userId),
    byQuestionnaire: new Map<string, number>(),
  }),
  listInbox: (
    userId: string,
    options?: { before?: string | null; limit?: number; filter?: InboxFilter },
  ) => testStore.listInbox(userId, options),
  markRead: (userId: string, ids: string[]) => testStore.markRead(userId, ids),
  markAllRead: (userId: string) => testStore.markAllRead(userId),
  unreadClearableCount: (userId: string) =>
    testStore.unreadClearableCount(userId),
  getAnnouncementForMember: (userId: string, broadcastId: string) =>
    testStore.getAnnouncementForMember(userId, broadcastId),
  getPendingAcknowledgements: (userId: string) =>
    testStore.getPendingAcknowledgements(userId),
  countUnseenPopups: (userId: string) => testStore.countUnseenPopups(userId),
  claimPopups: (userId: string) => testStore.claimPopups(userId),
  acknowledgeDelivery: (input: { deliveryId: string; userId: string }) =>
    testStore.acknowledgeDelivery(input),
  listAnnouncements: (options?: { senderId?: string }) =>
    testStore.listBroadcasts(options),
  createAnnouncementDraft: (input: DraftFields) =>
    testStore.createBroadcastDraft(input),
  updateAnnouncementDraft: (input: DraftFields & { id: string }) =>
    testStore.updateBroadcastDraft(input),
  deleteAnnouncementDraft: (input: { id: string; senderId: string }) =>
    testStore.deleteBroadcastDraft(input),
  publishAnnouncement: (input: PublishInput) =>
    testStore.publishBroadcast(input),
  explainDraftRefusal: (id: string, senderId: string) =>
    testStore.explainDraftRefusal({ id, senderId }),
  countAnnouncementAudience: (senderId: string, audience: Audience) =>
    testStore.countAnnouncementAudience(senderId, audience),
  previewAnnouncementAudience: (senderId: string, audience: Audience) =>
    testStore.previewAnnouncementAudience(senderId, audience),
  getAnnouncementPickerData: (senderId: string) =>
    testStore.getAnnouncementPickerData(senderId),
  listPinnedForUser: (userId: string) => testStore.listPinnedForUser(userId),
  getAnnouncementPinContext: (id: string) =>
    testStore.getAnnouncementPinContext(id),
  setAnnouncementPinned: (input: PinInput) =>
    testStore.setBroadcastPinned(input),
};

const inbox = twin(db, storeNotifications, [
  "countUnread",
  "countUnreadByTeam",
  "countUnreadSplit",
  "listInbox",
  "markRead",
  "markAllRead",
  "unreadClearableCount",
  "getAnnouncementForMember",
  "getPendingAcknowledgements",
  "countUnseenPopups",
  "claimPopups",
  "acknowledgeDelivery",
  "listAnnouncements",
  "createAnnouncementDraft",
  "updateAnnouncementDraft",
  "deleteAnnouncementDraft",
  "publishAnnouncement",
  "explainDraftRefusal",
  "countAnnouncementAudience",
  "previewAnnouncementAudience",
  "getAnnouncementPickerData",
  "listPinnedForUser",
  "getAnnouncementPinContext",
  "setAnnouncementPinned",
]);

/** Unread announcements per team, for the team icons on Home. */
export const countUnreadByTeam = inbox.countUnreadByTeam;

export const countUnread = inbox.countUnread;

export const listInbox = inbox.listInbox;

export const markRead = inbox.markRead;

/**
 * Clear every unread delivery in this member's inbox, and say how many that
 * was. The panel's "Mark all read" — the one way to clear the badge without
 * opening the inbox.
 */
export const markAllRead = inbox.markAllRead;

/**
 * How many deliveries "Mark all read" would actually clear — the badge's count
 * minus the pop-ups it leaves for the pop-up poller to show.
 */
export const unreadClearableCount = inbox.unreadClearableCount;

export const getPendingAcknowledgements = inbox.getPendingAcknowledgements;

export const acknowledgeDelivery = inbox.acknowledgeDelivery;

/** Announcements, newest first: all of them, or one sender's. */
export const listAnnouncements = inbox.listAnnouncements;

export const createAnnouncementDraft = inbox.createAnnouncementDraft;

export const updateAnnouncementDraft = inbox.updateAnnouncementDraft;

export const deleteAnnouncementDraft = inbox.deleteAnnouncementDraft;

export const publishAnnouncement = inbox.publishAnnouncement;

export const explainDraftRefusal = inbox.explainDraftRefusal;

export const countAnnouncementAudience = inbox.countAnnouncementAudience;

/**
 * The composer's "Reaches N people. Left out: M who said Not coming this
 * year." line: the count and the left-out members by name. Gate the caller,
 * and give the names only to a viewer who may read participation.
 */
export const previewAnnouncementAudience = inbox.previewAnnouncementAudience;

/**
 * Who a captain may pick for "specific people", and who "Drivers this year"
 * reaches now (#313). Captain-only data: gate the caller.
 */
export const getAnnouncementPickerData = inbox.getAnnouncementPickerData;

export const getAnnouncementForMember = inbox.getAnnouncementForMember;

export const countUnseenPopups = inbox.countUnseenPopups;

/**
 * The pinned announcements this member received, newest first — what the
 * console banner draws. The audience is the delivery join, never a fresh
 * resolution, so nothing here can widen who sees a pin.
 */
export const listPinnedForUser = inbox.listPinnedForUser;

/**
 * One announcement's stored audience, so the pin action can ask
 * `canSendToAudience` about it before it writes.
 */
export const getAnnouncementPinContext = inbox.getAnnouncementPinContext;

/** Pin or unpin a published announcement. Gate the caller. */
export const setAnnouncementPinned = inbox.setAnnouncementPinned;

export const claimPopups = inbox.claimPopups;

/**
 * Every unread delivery, with the unread questionnaire notices per activation
 * (see countUnreadSplit in @camp404/db/broadcasts): the inbox badge reads it
 * beside the waiting forms rather than after them. The test store models no
 * questionnaire notices, so its twin is the plain count and an empty split.
 */
export const countUnreadSplit = inbox.countUnreadSplit;
