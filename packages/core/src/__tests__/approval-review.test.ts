import { describe, expect, it } from "vitest";
import {
  REVIEW_REFUSAL,
  availableReviewActions,
  isReviewTransition,
  reviewActionFor,
  reviewRefusal,
} from "../approval-review";

const member = { isSelf: false, isCaptain: false };

describe("availableReviewActions", () => {
  it("offers approve and reject on a pending applicant", () => {
    expect(availableReviewActions({ ...member, status: "pending" })).toEqual([
      { action: "approve", refusal: null },
      { action: "reject", refusal: null },
    ]);
  });

  it("lets an approval be reversed or re-opened", () => {
    expect(availableReviewActions({ ...member, status: "approved" })).toEqual([
      { action: "reject", refusal: null },
      { action: "reopen", refusal: null },
    ]);
  });

  it("lets a rejection be reversed or re-opened", () => {
    expect(availableReviewActions({ ...member, status: "rejected" })).toEqual([
      { action: "approve", refusal: null },
      { action: "reopen", refusal: null },
    ]);
  });

  it("shows a captain their own decisions, each refused with the reason", () => {
    for (const option of availableReviewActions({
      status: "pending",
      isSelf: true,
      isCaptain: true,
    })) {
      expect(option.refusal).toBe(REVIEW_REFUSAL.self);
    }
  });

  it("refuses taking an approved captain's access away, but not approving one", () => {
    expect(
      availableReviewActions({
        status: "approved",
        isSelf: false,
        isCaptain: true,
      }),
    ).toEqual([
      { action: "reject", refusal: REVIEW_REFUSAL.captain },
      { action: "reopen", refusal: REVIEW_REFUSAL.captain },
    ]);
    expect(
      reviewRefusal(
        { status: "rejected", isSelf: false, isCaptain: true },
        "approve",
      ),
    ).toBeNull();
  });
});

describe("reviewRefusal", () => {
  it("refuses a decision that does not exist from this status", () => {
    expect(reviewRefusal({ ...member, status: "approved" }, "approve")).toBe(
      REVIEW_REFUSAL.stale,
    );
    expect(reviewRefusal({ ...member, status: "pending" }, "reopen")).toBe(
      REVIEW_REFUSAL.stale,
    );
  });
});

describe("reviewActionFor", () => {
  it("names the action behind a move, or null", () => {
    expect(reviewActionFor("approved", "rejected")).toBe("reject");
    expect(reviewActionFor("rejected", "pending")).toBe("reopen");
    expect(reviewActionFor("pending", "approved")).toBe("approve");
    expect(reviewActionFor("pending", "pending")).toBeNull();
  });
});

describe("isReviewTransition", () => {
  it("allows every move the panel offers and nothing else", () => {
    expect(isReviewTransition("pending", "approved")).toBe(true);
    expect(isReviewTransition("pending", "rejected")).toBe(true);
    expect(isReviewTransition("approved", "rejected")).toBe(true);
    expect(isReviewTransition("approved", "pending")).toBe(true);
    expect(isReviewTransition("rejected", "approved")).toBe(true);
    expect(isReviewTransition("rejected", "pending")).toBe(true);

    expect(isReviewTransition("pending", "pending")).toBe(false);
    expect(isReviewTransition("approved", "approved")).toBe(false);
    expect(isReviewTransition("rejected", "rejected")).toBe(false);
  });
});
