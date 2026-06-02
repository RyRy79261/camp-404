import { z } from "zod";

// Two-sided captain-promotion handshake — the redesign's one schema change
// (captain_promotion_requests / promotion_request_status). A captain SENDS a
// request; the target ACCEPTS in their own app before their rank flips to
// captain. Keep in sync with promotionRequestStatusEnum in @camp404/db.
export const PromotionRequestStatus = z.enum([
  "sent",
  "accepted",
  "declined",
  "cancelled",
]);
export type PromotionRequestStatus = z.infer<typeof PromotionRequestStatus>;

// The acceptance-surface view shape (home rank-section / notifications): an
// incoming "make you a captain" request the target can accept or decline.
export const IncomingPromotionRequest = z.object({
  id: z.string(),
  requestedByUserId: z.string(),
  requestedByName: z.string().nullable(),
  status: PromotionRequestStatus,
  createdAt: z.date(),
});
export type IncomingPromotionRequest = z.infer<typeof IncomingPromotionRequest>;
