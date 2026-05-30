import { describe, it, expect } from "vitest";
import { planPushDrain, type QueuedPushDelivery } from "@camp404/db/push";
import type { PushSend } from "@camp404/db/push-status";

const delivery = (id: string, userId: string): QueuedPushDelivery => ({
  id,
  userId,
  title: "t",
  body: "b",
  refType: null,
  refId: null,
});

describe("planPushDrain", () => {
  it("skips deliveries for users with no tokens (send never called)", async () => {
    let calls = 0;
    const send: PushSend = async () => {
      calls++;
      return [];
    };
    const { statusById } = await planPushDrain(
      [delivery("d1", "u1")],
      new Map(),
      send,
    );
    expect(statusById.get("d1")).toBe("skipped");
    expect(calls).toBe(0);
  });

  it("marks sent when a token succeeds, failed when all fail", async () => {
    const tokens = new Map([
      ["u1", ["tA"]],
      ["u2", ["tB"]],
    ]);
    const send: PushSend = async (toks) =>
      toks.map((t) => ({
        token: t,
        success: t === "tA",
        errorCode: t === "tA" ? null : "messaging/internal-error",
      }));
    const { statusById, deadTokens } = await planPushDrain(
      [delivery("d1", "u1"), delivery("d2", "u2")],
      tokens,
      send,
    );
    expect(statusById.get("d1")).toBe("sent");
    expect(statusById.get("d2")).toBe("failed");
    // internal-error is transient → not pruned
    expect([...deadTokens]).toEqual([]);
  });

  it("collects only prune-class dead tokens", async () => {
    const tokens = new Map([["u1", ["dead", "live"]]]);
    const send: PushSend = async (toks) =>
      toks.map((t) => ({
        token: t,
        success: t === "live",
        errorCode:
          t === "dead" ? "messaging/registration-token-not-registered" : null,
      }));
    const { statusById, deadTokens } = await planPushDrain(
      [delivery("d1", "u1")],
      tokens,
      send,
    );
    expect(statusById.get("d1")).toBe("sent"); // the live token succeeded
    expect([...deadTokens]).toEqual(["dead"]);
  });

  it("chunks >500 tokens across multiple send calls", async () => {
    const many = Array.from({ length: 1100 }, (_, i) => `t${i}`);
    let calls = 0;
    const send: PushSend = async (toks) => {
      calls++;
      return toks.map((t) => ({ token: t, success: true }));
    };
    await planPushDrain(
      [delivery("d1", "u1")],
      new Map([["u1", many]]),
      send,
    );
    expect(calls).toBe(3); // 500 + 500 + 100
  });
});
