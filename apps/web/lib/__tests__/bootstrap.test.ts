import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBootstrapState,
  bootstrapFirstCaptain,
  seedBurnerProfileAction,
  isE2E,
} = vi.hoisted(() => ({
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
vi.mock("../test-mode", () => ({ isE2ETestMode: isE2E, usesTestStore: isE2E }));

import {
  isCampBootstrapped,
  mayFoundCamp,
  runFirstTimeSetup,
} from "../bootstrap";

const authUser = {
  id: "auth-1",
  primaryEmail: "ada@example.com",
  displayName: "Ada",
  emailVerified: true,
};

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
    getBootstrapState.mockResolvedValue({
      captainCount: 1,
      bootstrappedAt: null,
    });
    expect(await isCampBootstrapped()).toBe(true);
  });

  it("is true when the latch is stamped (even with no captain)", async () => {
    getBootstrapState.mockResolvedValue({
      captainCount: 0,
      bootstrappedAt: new Date(),
    });
    expect(await isCampBootstrapped()).toBe(true);
  });

  it("is false on a fresh system (no captain, no latch)", async () => {
    getBootstrapState.mockResolvedValue({
      captainCount: 0,
      bootstrappedAt: null,
    });
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
    bootstrapFirstCaptain.mockResolvedValue({
      ok: false,
      reason: "already-bootstrapped",
    });
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

describe("mayFoundCamp", () => {
  // Sign-up is open, so on a fresh database "the first signed-in account"
  // could be a stranger racing the founder.
  const saved = process.env.GOD_EMAILS;
  afterEach(() => {
    if (saved === undefined) delete process.env.GOD_EMAILS;
    else process.env.GOD_EMAILS = saved;
  });

  it("refuses an account that is not a founding address when GOD_EMAILS is set", () => {
    process.env.GOD_EMAILS = "founder@example.com, other@example.com";
    expect(
      mayFoundCamp({ ...authUser, primaryEmail: "stranger@example.com" }),
    ).toBe(false);
  });

  it("refuses the founding address while it is unverified (primaryEmail is null)", () => {
    // lib/session-user.ts nulls primaryEmail for an unproven god address.
    process.env.GOD_EMAILS = "founder@example.com";
    expect(mayFoundCamp({ ...authUser, primaryEmail: null })).toBe(false);
  });

  it("allows a verified founding address, whatever its case", () => {
    process.env.GOD_EMAILS = "founder@example.com";
    expect(
      mayFoundCamp({ ...authUser, primaryEmail: "Founder@Example.com" }),
    ).toBe(true);
  });

  it("allows any signed-in account when GOD_EMAILS is unset, as before", () => {
    delete process.env.GOD_EMAILS;
    expect(mayFoundCamp(authUser)).toBe(true);
    process.env.GOD_EMAILS = " , ";
    expect(mayFoundCamp(authUser)).toBe(true);
  });
});
