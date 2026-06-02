import "server-only";

import {
  decideCaptainPromotion as dbDecide,
  getIncomingPromotionsForUser as dbGetIncoming,
  getOpenPromotionForTarget as dbGetOpen,
  getPromotionRequestById as dbGetById,
  sendCaptainPromotion as dbSend,
  type CaptainPromotionRequestRow,
} from "@camp404/db/captain-promotion";
import type {
  IncomingPromotionRequest,
  PromotionRequestStatus,
} from "@camp404/types";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

// Captain-promotion data facade. Routes every read and write through the
// Neon-backed `@camp404/db/captain-promotion` queries normally, and through the
// in-memory test store under E2E_TEST_MODE — the same real-vs-test split
// `lib/users.ts` / `lib/notifications.ts` use so the app renders without a
// database during Playwright runs. App code (actions, pages) imports from here,
// never from `@camp404/db/captain-promotion` directly. The pure guards +
// state-machine live in `@camp404/core`; this layer is just data access.

export type {
  CaptainPromotionRequestRow,
  IncomingPromotionRequest,
  PromotionRequestStatus,
};

interface PromotionBackend {
  sendCaptainPromotion(input: {
    targetUserId: string;
    requestedByUserId: string;
  }): Promise<CaptainPromotionRequestRow>;
  decideCaptainPromotion(input: {
    requestId: string;
    status: "accepted" | "declined" | "cancelled";
  }): Promise<CaptainPromotionRequestRow | null>;
  getOpenPromotionForTarget(
    targetUserId: string,
  ): Promise<CaptainPromotionRequestRow | null>;
  getPromotionRequestById(
    requestId: string,
  ): Promise<CaptainPromotionRequestRow | null>;
  getIncomingPromotionsForUser(
    userId: string,
  ): Promise<IncomingPromotionRequest[]>;
}

const realBackend: PromotionBackend = {
  sendCaptainPromotion: dbSend,
  decideCaptainPromotion: dbDecide,
  getOpenPromotionForTarget: dbGetOpen,
  getPromotionRequestById: dbGetById,
  getIncomingPromotionsForUser: dbGetIncoming,
};

const testBackend: PromotionBackend = {
  async sendCaptainPromotion(input) {
    return testStore.sendCaptainPromotion(input);
  },
  async decideCaptainPromotion(input) {
    return testStore.decideCaptainPromotion(input);
  },
  async getOpenPromotionForTarget(targetUserId) {
    return testStore.getOpenPromotionForTarget(targetUserId);
  },
  async getPromotionRequestById(requestId) {
    return testStore.getPromotionRequestById(requestId);
  },
  async getIncomingPromotionsForUser(userId) {
    return testStore.getIncomingPromotionsForUser(userId);
  },
};

function backend(): PromotionBackend {
  return isE2ETestMode() ? testBackend : realBackend;
}

export function sendCaptainPromotion(input: {
  targetUserId: string;
  requestedByUserId: string;
}): Promise<CaptainPromotionRequestRow> {
  return backend().sendCaptainPromotion(input);
}

export function decideCaptainPromotion(input: {
  requestId: string;
  status: "accepted" | "declined" | "cancelled";
}): Promise<CaptainPromotionRequestRow | null> {
  return backend().decideCaptainPromotion(input);
}

export function getOpenPromotionForTarget(
  targetUserId: string,
): Promise<CaptainPromotionRequestRow | null> {
  return backend().getOpenPromotionForTarget(targetUserId);
}

export function getPromotionRequestById(
  requestId: string,
): Promise<CaptainPromotionRequestRow | null> {
  return backend().getPromotionRequestById(requestId);
}

export function getIncomingPromotionsForUser(
  userId: string,
): Promise<IncomingPromotionRequest[]> {
  return backend().getIncomingPromotionsForUser(userId);
}
