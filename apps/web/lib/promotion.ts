import "server-only";

import * as db from "@camp404/db/captain-promotion";
import type { CaptainPromotionRequestRow } from "@camp404/db/captain-promotion";
import type {
  IncomingPromotionRequest,
  PromotionRequestStatus,
} from "@camp404/types";
import { testStore } from "./test-store";
import { twin } from "./twin";

// Captain-promotion data facade. Routes every read and write through the
// Neon-backed `@camp404/db/captain-promotion` queries normally, and through the
// in-memory test store under E2E_TEST_MODE — the same real-vs-test split
// `lib/users.ts` / `lib/notifications.ts` use so the app renders without a
// database during Playwright runs. App code (actions, pages) imports from here,
// never from `@camp404/db/captain-promotion` directly. The pure guards +
// state-machine live in `@camp404/core`; this layer is just data access, and
// lib/__tests__/promotion-agreement.test.ts holds the two sides equal.

export type {
  CaptainPromotionRequestRow,
  IncomingPromotionRequest,
  PromotionRequestStatus,
};

const promotion = twin(db, testStore, [
  "sendCaptainPromotion",
  "decideCaptainPromotion",
  "acceptCaptainPromotion",
  "getOpenPromotionForTarget",
  "getPromotionRequestById",
  "getIncomingPromotionsForUser",
]);

export const sendCaptainPromotion = promotion.sendCaptainPromotion;
export const decideCaptainPromotion = promotion.decideCaptainPromotion;

/**
 * The target accepts: status, rank and audit row in one transaction. Null when
 * the request is not open or the actor is not its target.
 */
export const acceptCaptainPromotion = promotion.acceptCaptainPromotion;
export const getOpenPromotionForTarget = promotion.getOpenPromotionForTarget;
export const getPromotionRequestById = promotion.getPromotionRequestById;
export const getIncomingPromotionsForUser =
  promotion.getIncomingPromotionsForUser;
