import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const getBootstrapState = vi.fn();

vi.mock("@camp404/db", () => ({
  createHttpDb: () => ({ execute }),
}));
vi.mock("@camp404/db/bootstrap", () => ({
  getBootstrapState: () => getBootstrapState(),
}));

import { PROBE_TIMEOUT_MS, probeDatabase } from "../system-probe";

// The probe never throws, and it never hands back a credential.

const URL = "postgres://neondb_owner:pw-probe-marker@ep-probe.neon.tech/neondb";

describe("probeDatabase", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", URL);
    execute.mockReset();
    getBootstrapState.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("says not configured when DATABASE_URL is unset, and asks nothing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(probeDatabase()).resolves.toEqual({ kind: "not_configured" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports the round trip and the setup state", async () => {
    execute.mockResolvedValue([]);
    getBootstrapState.mockResolvedValue({
      captainCount: 3,
      bootstrappedAt: new Date(),
    });
    const probe = await probeDatabase();
    expect(probe).toMatchObject({
      kind: "ok",
      captainCount: 3,
      bootstrapped: true,
    });
    expect(probe.kind === "ok" && probe.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("turns a driver error into unreachable, without the password", async () => {
    execute.mockRejectedValue(new Error(`could not connect to ${URL}`));
    const probe = await probeDatabase();
    expect(probe.kind).toBe("unreachable");
    expect(JSON.stringify(probe)).not.toContain("pw-probe-marker");
  });

  it("gives up on a database that stops answering", async () => {
    vi.useFakeTimers();
    execute.mockReturnValue(new Promise(() => {}));
    const pending = probeDatabase();
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({
      kind: "unreachable",
      message: `The database did not answer within ${PROBE_TIMEOUT_MS} ms.`,
    });
  });
});
