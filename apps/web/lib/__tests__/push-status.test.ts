import { describe, it, expect } from "vitest";
import {
  shouldPruneToken,
  deliveryPushStatus,
  chunk,
  mapSendResponses,
  type TokenSendResult,
} from "@camp404/db/push-status";

describe("shouldPruneToken", () => {
  it("prunes the dead-token error codes", () => {
    expect(shouldPruneToken("messaging/registration-token-not-registered")).toBe(true);
    expect(shouldPruneToken("messaging/invalid-registration-token")).toBe(true);
    expect(shouldPruneToken("messaging/invalid-argument")).toBe(true);
  });
  it("keeps tokens on transient errors / no error", () => {
    expect(shouldPruneToken("messaging/internal-error")).toBe(false);
    expect(shouldPruneToken("messaging/server-unavailable")).toBe(false);
    expect(shouldPruneToken(null)).toBe(false);
    expect(shouldPruneToken(undefined)).toBe(false);
  });
});

describe("deliveryPushStatus", () => {
  const ok = (token: string): TokenSendResult => ({ token, success: true });
  const bad = (token: string): TokenSendResult => ({
    token,
    success: false,
    errorCode: "messaging/internal-error",
  });

  it("skipped when there are no tokens", () => {
    expect(deliveryPushStatus([])).toBe("skipped");
  });
  it("sent when at least one token succeeds", () => {
    expect(deliveryPushStatus([bad("a"), ok("b")])).toBe("sent");
  });
  it("failed when every token fails", () => {
    expect(deliveryPushStatus([bad("a"), bad("b")])).toBe("failed");
  });
});

describe("chunk", () => {
  it("splits into batches of at most size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns a single batch when under size", () => {
    expect(chunk([1, 2], 500)).toEqual([[1, 2]]);
  });
  it("returns empty for empty input", () => {
    expect(chunk([], 500)).toEqual([]);
  });
});

describe("mapSendResponses", () => {
  it("aligns responses to tokens by index and extracts error codes", () => {
    const out = mapSendResponses(
      ["t0", "t1", "t2"],
      [
        { success: true },
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered" },
        },
        { success: false, error: { code: "messaging/internal-error" } },
      ],
    );
    expect(out).toEqual([
      { token: "t0", success: true, errorCode: null },
      {
        token: "t1",
        success: false,
        errorCode: "messaging/registration-token-not-registered",
      },
      { token: "t2", success: false, errorCode: "messaging/internal-error" },
    ]);
  });
});
