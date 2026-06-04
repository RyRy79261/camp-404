import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// bootstrap.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

const { getBootstrapState, bootstrapFirstCaptain, seedBurnerProfileAction, isE2E } =
  vi.hoisted(() => ({
    getBootstrapState: vi.fn(),
    bootstrapFirstCaptain: vi.fn(),
    seedBurnerProfileAction: vi.fn(),
    isE2E: vi.fn(),
  }));

vi.mock("@camp404/db/bootstrap", () => ({
  getBootstrapState,
  bootstrapFirstCaptain,
}));
vi.mock("../users", () => ({ seedBurnerProfileAction }));
vi.mock("../test-mode", () => ({ isE2ETestMode: isE2E }));

import { isCampBootstrapped, runFirstTimeSetup } from "../bootstrap";

const authUser = { id: "auth-1", primaryEmail: "ada@example.com", displayName: "Ada" };

beforeEach(() => {
  getBootstrapState.mockReset();
  bootstrapFirstCaptain.mockReset();
  seedBurnerProfileAction.mockReset().mockResolvedValue(undefined);
  isE2E.mockReset().mockReturnValue(false);
});
afterEach(() => vi.clearAllMocks());

describe("isCampBootstrapped", () => {
  it("short-circuits to true under E2E without touching the DB", async () => {
    isE2E.mockReturnValue(true);
    expect(await isCampBootstrapped()).toBe(true);
    expect(getBootstrapState).not.toHaveBeenCalled();
  });

  it("is true when a captain exists", async () => {
    getBootstrapState.mockResolvedValue({ captainCount: 1, bootstrappedAt: null });
    expect(await isCampBootstrapped()).toBe(true);
  });

  it("is true when the latch is stamped (even with no captain)", async () => {
    getBootstrapState.mockResolvedValue({ captainCount: 0, bootstrappedAt: new Date() });
    expect(await isCampBootstrapped()).toBe(true);
  });

  it("is false on a fresh system (no captain, no latch)", async () => {
    getBootstrapState.mockResolvedValue({ captainCount: 0, bootstrappedAt: null });
    expect(await isCampBootstrapped()).toBe(false);
  });
});

describe("runFirstTimeSetup", () => {
  it("elects the founder and seeds their onboarding gate", async () => {
    bootstrapFirstCaptain.mockResolvedValue({ ok: true, userId: "u-1" });
    const result = await runFirstTimeSetup(authUser);
    expect(result).toEqual({ ok: true });
    expect(bootstrapFirstCaptain).toHaveBeenCalledWith({
      authUserId: "auth-1",
      displayName: "Ada",
      founderCode: "meowzit",
    });
    expect(seedBurnerProfileAction).toHaveBeenCalledWith("u-1");
  });

  it("reports already-bootstrapped without seeding", async () => {
    bootstrapFirstCaptain.mockResolvedValue({ ok: false, reason: "already-bootstrapped" });
    const result = await runFirstTimeSetup(authUser);
    expect(result.ok).toBe(false);
    expect(seedBurnerProfileAction).not.toHaveBeenCalled();
  });

  it("is a no-op under E2E", async () => {
    isE2E.mockReturnValue(true);
    expect(await runFirstTimeSetup(authUser)).toEqual({ ok: true });
    expect(bootstrapFirstCaptain).not.toHaveBeenCalled();
  });
});
